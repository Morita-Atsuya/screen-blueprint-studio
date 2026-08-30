import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { ProjectDocument, EntityId } from '../domain/model'
import type { ComponentSubtreeSnapshot, DomainCommand } from '../domain/commands'
import type { ChangeSet, RejectedChangeSetRecord } from '../domain/collaboration'
import { replayChangeSetOperations } from '../domain/changeSetReplay'
import {
  applyCommand,
  applyCommandWithoutRevision,
  applyTransaction,
  nextRevision,
} from '../domain/applyCommand'
import { DomainError } from '../domain/errors'
import { getOwnEntity, hasOwnEntity } from '../domain/entityMap'
import type { UiMessage } from '../i18n/messages'
import { domainErrorMessage } from '../i18n/messages'
import type { ToastInput, ToastState } from './toastModel'
import {
  canPasteComponent,
  createComponentSubtreeSnapshot,
  createDuplicateComponentCommand,
  createPasteComponentCommand,
} from '../domain/componentDuplication'
import {
  analyzeDeleteImpact,
  type DeleteCommand,
  type DeleteImpactAnalysis,
} from '../domain/deleteImpact'
import { classifyComponentMove } from '../domain/componentPlacement'
import { sampleProject } from '../sample/sampleProject'
import {
  clearStorage,
  downloadCorruptedData,
  downloadCurrentData,
  loadFromStorage,
  loadRejectedRecords,
  removePersistedDocument,
  saveRejectedRecord,
  saveToStorage,
} from '../persistence/localStorage'

export interface HistoryEntry {
  id: EntityId
  label: string
  source: 'human' | 'accepted-change-set'
  before: ProjectDocument
  after: ProjectDocument
  selectionBefore?: EntityId | null
  selectionAfter?: EntityId | null
}

export interface UiState {
  activeScreenId: EntityId | null
  activeStateId: EntityId | null
  selectedComponentId: EntityId | null
  rightPanelTab: 'inspector' | 'changes'
}

export interface RecoveryState {
  status: 'invalid'
  rawData: string
  error: string
}

export interface PendingDeleteRequest {
  id: EntityId
  command: DeleteCommand
  analysis: DeleteImpactAnalysis
  historyLabel: string
  routingKey: string
  notice: UiMessage | null
  needsReviewAcknowledgement: boolean
  onDeleted?: () => void
}

export interface AppStore {
  // Confirmed document (never preview)
  document: ProjectDocument
  activeChangeSet: ChangeSet | null
  rejectedRecords: RejectedChangeSetRecord[]
  history: HistoryEntry[]
  redoStack: HistoryEntry[]
  ui: UiState
  recoveryState: RecoveryState | null
  startupNotice: UiMessage | null
  toast: ToastState | null
  pendingDelete: PendingDeleteRequest | null
  componentClipboard: ComponentSubtreeSnapshot | null
  persistenceUnavailable: boolean
  // effectiveDocument = computeEffective(document, activeChangeSet)
  effectiveDocument: ProjectDocument

  dispatch(command: DomainCommand, label?: string): boolean
  duplicateComponent(componentId: EntityId, label: string): boolean
  copyComponent(componentId: EntityId): boolean
  pasteComponent(destinationComponentId: EntityId, label: string): boolean
  beginChangeSet(summary: string): ChangeSet
  dispatchToChangeSet(changeSetId: EntityId, command: DomainCommand, source?: 'human' | 'agent'): void
  acceptChangeSet(historyLabel?: string): void
  rejectChangeSet(): void
  undo(): void
  redo(): void

  setActiveScreen(screenId: EntityId): void
  setActiveState(stateId: EntityId | null): void
  setSelectedComponent(componentId: EntityId | null): void
  setRightPanelTab(tab: UiState['rightPanelTab']): void

  initializeWithRecovery(choice: 'sample' | 'download'): void
  exportCurrentData(): void
  dismissStartupNotice(): void
  showToast(input: ToastInput): EntityId
  dismissToast(toastId?: EntityId): void
  runToastAction(toastId: EntityId): boolean
  requestHumanDelete(
    command: DeleteCommand,
    historyLabel: string,
    onDeleted?: () => void,
  ): 'executed' | 'pending' | 'failed'
  confirmPendingDelete(): void
  acknowledgePendingDeleteImpact(): void
  cancelPendingDelete(): void
  resetToSample(): void
}

function initialUiState(doc: ProjectDocument, activeScreenId?: string): UiState {
  const screenId = activeScreenId ?? doc.project.screenIds[0] ?? null
  const screen = screenId ? getOwnEntity(doc.screens, screenId) : null
  return {
    activeScreenId: screenId,
    activeStateId: screen?.defaultStateId ?? null,
    selectedComponentId: null,
    rightPanelTab: 'inspector',
  }
}

export function reconcileUiState(doc: ProjectDocument, current: UiState): UiState {
  const firstScreenId = doc.project.screenIds.find(screenId => hasOwnEntity(doc.screens, screenId)) ?? null
  const activeScreenId = current.activeScreenId && hasOwnEntity(doc.screens, current.activeScreenId)
    ? current.activeScreenId
    : firstScreenId
  const activeScreen = activeScreenId ? getOwnEntity(doc.screens, activeScreenId) : undefined
  const activeStateId = (
    current.activeStateId &&
    activeScreen?.stateIds.includes(current.activeStateId) &&
    getOwnEntity(doc.screenStates, current.activeStateId)?.screenId === activeScreenId
  )
    ? current.activeStateId
    : activeScreen?.defaultStateId ?? null
  const selectedComponentId = (
    current.selectedComponentId &&
    getOwnEntity(doc.components, current.selectedComponentId)?.screenId === activeScreenId
  )
    ? current.selectedComponentId
    : null

  return {
    ...current,
    activeScreenId,
    activeStateId,
    selectedComponentId,
  }
}

function computeEffective(doc: ProjectDocument, changeSet: ChangeSet | null): ProjectDocument {
  if (!changeSet || changeSet.operations.length === 0) return doc
  return replayChangeSetOperations(changeSet.baseDocument, changeSet.operations)
}

export type EffectiveDocumentRestore =
  | { status: 'success'; effectiveDocument: ProjectDocument }
  | { status: 'discarded'; effectiveDocument: ProjectDocument; error: unknown }

export function restoreEffectiveDocument(
  document: ProjectDocument,
  activeChangeSet: ChangeSet | null,
): EffectiveDocumentRestore {
  try {
    return {
      status: 'success',
      effectiveDocument: computeEffective(document, activeChangeSet),
    }
  } catch (error) {
    return {
      status: 'discarded',
      effectiveDocument: document,
      error,
    }
  }
}

const MAX_HISTORY = 50

function persist(document: ProjectDocument, activeChangeSet: ChangeSet | null, activeScreenId: EntityId | null): boolean {
  return saveToStorage({
    document,
    activeChangeSet: activeChangeSet ?? undefined,
    activeScreenId: activeScreenId ?? undefined,
  })
}

function buildHistory(
  before: ProjectDocument,
  after: ProjectDocument,
  label: string,
  source: HistoryEntry['source'],
  selection?: {
    before: EntityId | null
    after: EntityId | null
  },
): HistoryEntry {
  return {
    id: nanoid(),
    label,
    source,
    before,
    after,
    selectionBefore: selection?.before,
    selectionAfter: selection?.after,
  }
}

function selectionBeforeChangeSet(
  changeSet: ChangeSet,
  selectedComponentId: EntityId | null,
): EntityId | null {
  let candidate = selectedComponentId
  if (!candidate) return null

  for (const operation of [...changeSet.operations].reverse()) {
    const command = operation.command
    if (command.type === 'pasteComponent') {
      const sourceId = Object.keys(command.componentIdMap).find(
        id => getOwnEntity(command.componentIdMap, id) === candidate,
      )
      if (sourceId) candidate = command.destinationComponentId
      continue
    }
    if (command.type !== 'duplicateComponent') continue
    const componentIdMap = command.componentIdMap
    const sourceId = Object.keys(componentIdMap).find(
      id => getOwnEntity(componentIdMap, id) === candidate,
    )
    if (sourceId) candidate = sourceId
  }
  return hasOwnEntity(changeSet.baseDocument.components, candidate) ? candidate : null
}

function toDomainError(error: unknown): DomainError {
  if (error instanceof DomainError) return error
  return new DomainError(
    'INVARIANT_VIOLATION',
    error instanceof Error ? error.message : String(error),
  )
}

function toUiMessage(error: unknown): UiMessage {
  if (error instanceof DomainError) return domainErrorMessage(error.code)
  return {
    key: 'errors.unexpected',
    params: { message: error instanceof Error ? error.message : String(error) },
  }
}

function createToast(input: ToastInput): ToastState {
  return { id: nanoid(), ...input }
}

function createErrorToast(message: UiMessage): ToastState {
  return createToast({ severity: 'error', message })
}

type DeleteUndoToken =
  | { kind: 'history'; historyEntryId: EntityId }
  | { kind: 'change-set'; changeSetId: EntityId; operationId: EntityId }

export const useAppStore = create<AppStore>((set, get) => {
  const loadResult = loadFromStorage()
  const rejectedRecords = loadRejectedRecords()
  let confirmedDocument = sampleProject
  let activeChangeSet: ChangeSet | null = null
  let ui = initialUiState(sampleProject)
  let recoveryState: RecoveryState | null = null
  let startupNotice: UiMessage | null = null
  let persistenceUnavailable = false

  if (loadResult.status === 'success') {
    confirmedDocument = loadResult.document
    const restoredChangeSet = loadResult.activeChangeSet ?? null
    activeChangeSet = restoredChangeSet && rejectedRecords.some(
      record => record.changeSetId === restoredChangeSet.id,
    )
      ? null
      : restoredChangeSet
    ui = initialUiState(confirmedDocument, loadResult.activeScreenId)
    if (activeChangeSet) ui = { ...ui, rightPanelTab: 'changes' }
    if (loadResult.discardedActiveChangeSet) {
      persistenceUnavailable = !loadResult.discardedActiveChangeSet.persisted
      startupNotice = {
        key: loadResult.discardedActiveChangeSet.persisted
          ? 'app.invalidChangeSetDiscarded'
          : 'app.invalidChangeSetDiscardFailed',
      }
    }
  } else if (loadResult.status === 'invalid') {
    recoveryState = { status: 'invalid', rawData: loadResult.rawData, error: loadResult.error }
  }

  let effectiveDoc = confirmedDocument
  if (!recoveryState) {
    const restoration = restoreEffectiveDocument(confirmedDocument, activeChangeSet)
    effectiveDoc = restoration.effectiveDocument
    if (restoration.status === 'discarded') {
      console.warn('Discarding active change set that could not be replayed', restoration.error)
      activeChangeSet = null
      ui = {
        ...reconcileUiState(confirmedDocument, ui),
        rightPanelTab: 'inspector',
      }
      const persisted = persist(confirmedDocument, null, ui.activeScreenId)
      persistenceUnavailable = !persisted
      startupNotice = {
        key: persisted
          ? 'app.invalidChangeSetDiscarded'
          : 'app.invalidChangeSetDiscardFailed',
      }
    }
  }
  ui = reconcileUiState(effectiveDoc, ui)

  function markPersistence(saved: boolean): void {
    set({ persistenceUnavailable: !saved })
  }

  function requireWritable(): void {
    const recovery = get().recoveryState
    if (recovery) {
      throw new DomainError('RECOVERY_REQUIRED', 'Persisted data must be recovered or reset', {
        status: recovery.status,
        error: recovery.error,
      })
    }
  }

  function persistIfAvailable(
    document: ProjectDocument,
    changeSet: ChangeSet | null,
    activeScreenId: EntityId | null,
  ): boolean {
    if (get().recoveryState) return true
    return persist(document, changeSet, activeScreenId)
  }

  function deleteRoutingKey(state: AppStore): string {
    return state.activeChangeSet
      ? `change-set:${state.activeChangeSet.id}:${state.activeChangeSet.version}`
      : `document:${state.document.revision}`
  }

  function showDeleteUndoToast(token: DeleteUndoToken): void {
    get().showToast({
      severity: 'success',
      message: { key: 'delete.deleted' },
      action: {
        label: { key: 'app.undo' },
        callback: () => undoDelete(token),
      },
    })
  }

  function undoDelete(token: DeleteUndoToken): void {
    const state = get()
    if (token.kind === 'history') {
      const currentEntry = state.history[state.history.length - 1]
      if (state.activeChangeSet || currentEntry?.id !== token.historyEntryId) {
        state.showToast({ severity: 'error', message: { key: 'delete.undoUnavailable' } })
        return
      }
      state.undo()
      return
    }

    const changeSet = state.activeChangeSet
    const lastOperation = changeSet?.operations[changeSet.operations.length - 1]
    if (
      !changeSet ||
      changeSet.id !== token.changeSetId ||
      lastOperation?.id !== token.operationId
    ) {
      state.showToast({ severity: 'error', message: { key: 'delete.undoUnavailable' } })
      return
    }

    const nextChangeSet: ChangeSet = {
      ...changeSet,
      version: changeSet.version + 1,
      operations: changeSet.operations.slice(0, -1),
    }
    const effective = computeEffective(state.document, nextChangeSet)
    const nextUi = reconcileUiState(effective, state.ui)
    set({ activeChangeSet: nextChangeSet, effectiveDocument: effective, ui: nextUi })
    markPersistence(persistIfAvailable(state.document, nextChangeSet, nextUi.activeScreenId))
  }

  function executeHumanDelete(
    command: DeleteCommand,
    historyLabel: string,
    onDeleted?: () => void,
  ): boolean {
    const before = get()
    const previousChangeSetId = before.activeChangeSet?.id
    const previousOperationCount = before.activeChangeSet?.operations.length ?? 0
    if (!before.dispatch(command, historyLabel)) return false

    const after = get()
    let token: DeleteUndoToken
    if (previousChangeSetId) {
      const operation = after.activeChangeSet?.operations[previousOperationCount]
      if (
        after.activeChangeSet?.id !== previousChangeSetId ||
        !operation ||
        operation.command !== command
      ) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          'The delete operation was not appended to the active change set',
        )
      }
      token = {
        kind: 'change-set',
        changeSetId: previousChangeSetId,
        operationId: operation.id,
      }
    } else {
      const historyEntry = after.history[after.history.length - 1]
      if (!historyEntry || historyEntry.before !== before.document) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          'The delete operation did not create a history entry',
        )
      }
      token = { kind: 'history', historyEntryId: historyEntry.id }
    }

    onDeleted?.()
    showDeleteUndoToast(token)
    return true
  }

  return {
    document: confirmedDocument,
    activeChangeSet,
    rejectedRecords,
    history: [],
    redoStack: [],
    ui,
    recoveryState,
    startupNotice,
    toast: null,
    pendingDelete: null,
    componentClipboard: null,
    persistenceUnavailable,
    effectiveDocument: effectiveDoc,

    dispatch(command, label = 'Edit') {
      requireWritable()
      const state = get()
      if (command.type === 'moveComponent') {
        const outcome = classifyComponentMove(
          state.effectiveDocument,
          command.componentId,
          command.newParentId,
          command.position,
        )
        if (outcome.status === 'no-op') return true
      }
      // While a change set is active, human edits go into the change set, not the confirmed doc
      if (state.activeChangeSet) {
        try {
          state.dispatchToChangeSet(state.activeChangeSet.id, command, 'human')
        } catch (e) {
          set({ toast: createErrorToast(toUiMessage(e)) })
          return false
        }
        return true
      }
      try {
        const next = applyCommand(state.document, command)
        const newHistory = [
          ...state.history.slice(-(MAX_HISTORY - 1)),
          buildHistory(state.document, next, label, 'human'),
        ]
        const newUi = reconcileUiState(next, state.ui)
        set({
          document: next,
          history: newHistory,
          redoStack: [],
          effectiveDocument: next,
          ui: newUi,
        })
        markPersistence(persistIfAvailable(next, null, newUi.activeScreenId))
        return true
      } catch (e) {
        set({ toast: createErrorToast(toUiMessage(e)) })
        return false
      }
    },

    duplicateComponent(componentId, label) {
      requireWritable()
      const before = get()
      const command = createDuplicateComponentCommand(
        before.effectiveDocument,
        componentId,
        nanoid,
      )
      if (!command) return false
      const duplicatedRootId = getOwnEntity(command.componentIdMap, componentId)
      if (!duplicatedRootId || !before.dispatch(command, label)) return false

      set(state => {
        const ui = reconcileUiState(state.effectiveDocument, {
          ...state.ui,
          selectedComponentId: duplicatedRootId,
        })
        if (before.activeChangeSet) return { ui }

        const last = state.history[state.history.length - 1]
        if (!last) return { ui }
        return {
          ui,
          history: [
            ...state.history.slice(0, -1),
            {
              ...last,
              selectionBefore: before.ui.selectedComponentId,
              selectionAfter: duplicatedRootId,
            },
          ],
        }
      })
      return true
    },

    copyComponent(componentId) {
      requireWritable()
      const snapshot = createComponentSubtreeSnapshot(
        get().effectiveDocument,
        componentId,
      )
      if (!snapshot) return false
      set({ componentClipboard: snapshot })
      return true
    },

    pasteComponent(destinationComponentId, label) {
      requireWritable()
      const before = get()
      const clipboard = before.componentClipboard
      if (
        !clipboard ||
        !canPasteComponent(
          before.effectiveDocument,
          clipboard,
          destinationComponentId,
        )
      ) {
        before.showToast({
          severity: 'error',
          message: { key: 'clipboard.pasteUnavailable' },
        })
        return false
      }
      const command = createPasteComponentCommand(
        before.effectiveDocument,
        clipboard,
        destinationComponentId,
        nanoid,
      )
      const pastedRootId = command
        ? getOwnEntity(command.componentIdMap, command.snapshot.rootComponentId)
        : undefined
      if (!command || !pastedRootId || !before.dispatch(command, label)) return false

      set(state => {
        const ui = reconcileUiState(state.effectiveDocument, {
          ...state.ui,
          selectedComponentId: pastedRootId,
        })
        if (before.activeChangeSet) return { ui }
        const last = state.history[state.history.length - 1]
        if (!last) return { ui }
        return {
          ui,
          history: [
            ...state.history.slice(0, -1),
            {
              ...last,
              selectionBefore: before.ui.selectedComponentId,
              selectionAfter: pastedRootId,
            },
          ],
        }
      })
      if (clipboard.sourceScreenId !== command.destinationScreenId) {
        get().showToast({
          severity: 'info',
          message: { key: 'clipboard.crossScreenOverridesOmitted' },
        })
      }
      return true
    },

    beginChangeSet(summary) {
      requireWritable()
      const state = get()
      if (state.activeChangeSet) {
        throw new DomainError('CHANGE_SET_ALREADY_ACTIVE', 'A change set is already active')
      }
      const changeSet: ChangeSet = {
        id: nanoid(),
        summary,
        baseRevision: state.document.revision,
        version: 0,
        baseDocument: state.document,
        operations: [],
        createdAt: new Date().toISOString(),
      }
      const nextUi = {
        ...reconcileUiState(state.document, state.ui),
        rightPanelTab: 'changes' as const,
      }
      set({ activeChangeSet: changeSet, effectiveDocument: state.document, ui: nextUi })
      markPersistence(persistIfAvailable(state.document, changeSet, nextUi.activeScreenId))
      return changeSet
    },

    dispatchToChangeSet(changeSetId, command, source = 'agent') {
      requireWritable()
      const state = get()
      if (!state.activeChangeSet || state.activeChangeSet.id !== changeSetId) {
        throw new DomainError('CHANGE_SET_REQUIRED', 'No matching active change set')
      }
      // Try applying the op to the current preview to validate it
      const previewDoc = state.effectiveDocument
      if (command.type === 'moveComponent') {
        const outcome = classifyComponentMove(
          previewDoc,
          command.componentId,
          command.newParentId,
          command.position,
        )
        if (outcome.status === 'no-op') return
      }
      try {
        applyCommandWithoutRevision(previewDoc, command)
      } catch (error) {
        const domainError = toDomainError(error)
        set({ toast: createErrorToast(domainErrorMessage(domainError.code)) })
        throw domainError
      }
      const operation = { id: nanoid(), source, command, issuedAt: new Date().toISOString() }
      const newChangeSet: ChangeSet = {
        ...state.activeChangeSet,
        version: state.activeChangeSet.version + 1,
        operations: [...state.activeChangeSet.operations, operation],
      }
      const effective = computeEffective(state.document, newChangeSet)
      const nextUi = reconcileUiState(effective, state.ui)
      set({ activeChangeSet: newChangeSet, effectiveDocument: effective, ui: nextUi })
      markPersistence(persistIfAvailable(state.document, newChangeSet, nextUi.activeScreenId))
    },

    acceptChangeSet(historyLabel) {
      requireWritable()
      const state = get()
      if (!state.activeChangeSet) throw new DomainError('CHANGE_SET_NOT_ACTIVE', 'No active change set')
      try {
        // Atomic re-validation: apply all ops on baseDocument
        const next = applyTransaction(
          state.activeChangeSet.baseDocument,
          state.activeChangeSet.operations.map(op => op.command),
        )
        const selectedBefore = selectionBeforeChangeSet(
          state.activeChangeSet,
          state.ui.selectedComponentId,
        )
        const newHistory = [
          ...state.history.slice(-(MAX_HISTORY - 1)),
          buildHistory(
            state.document,
            next,
            historyLabel ?? `Accept change set: ${state.activeChangeSet.summary}`,
            'accepted-change-set',
            { before: selectedBefore, after: state.ui.selectedComponentId },
          ),
        ]
        const nextUi = {
          ...reconcileUiState(next, state.ui),
          rightPanelTab: 'inspector' as const,
        }
        set({
          document: next,
          activeChangeSet: null,
          history: newHistory,
          redoStack: [],
          effectiveDocument: next,
          ui: nextUi,
        })
        markPersistence(persistIfAvailable(next, null, nextUi.activeScreenId))
      } catch (e) {
        if (e instanceof DomainError) {
          set({ toast: createErrorToast(domainErrorMessage(e.code)) })
        } else {
          set({
            toast: createErrorToast({
              key: 'errors.acceptFailed',
              params: { message: e instanceof Error ? e.message : String(e) },
            }),
          })
        }
      }
    },

    rejectChangeSet() {
      requireWritable()
      const state = get()
      if (!state.activeChangeSet) return
      // Save rejection record separately - NOT as activeChangeSet in persisted data
      const record: RejectedChangeSetRecord = {
        changeSetId: state.activeChangeSet.id,
        summary: state.activeChangeSet.summary,
        baseRevision: state.activeChangeSet.baseRevision,
        rejectedAt: new Date().toISOString(),
        operationCount: state.activeChangeSet.operations.length,
        operationSummaries: state.activeChangeSet.operations.map(
          operation => `[${operation.source}] ${operation.command.type}`,
        ),
      }
      // Clear activeChangeSet, restore confirmed document as effectiveDocument
      const rejectedRecords = Array.isArray(state.rejectedRecords)
        ? [record, ...state.rejectedRecords].slice(0, 20)
        : [record]
      const selectedBefore = selectionBeforeChangeSet(
        state.activeChangeSet,
        state.ui.selectedComponentId,
      )
      const nextUi = {
        ...reconcileUiState(state.document, {
          ...state.ui,
          selectedComponentId: selectedBefore,
        }),
        rightPanelTab: 'inspector' as const,
      }
      set({ activeChangeSet: null, effectiveDocument: state.document, rejectedRecords, ui: nextUi })
      // Save the rejection first so a failed main write can be suppressed on reload
      // without deleting the last confirmed document.
      const rejectionSaved = saveRejectedRecord(record)
      const documentSaved = persistIfAvailable(state.document, null, nextUi.activeScreenId)
      if (!documentSaved && !rejectionSaved) removePersistedDocument()
      markPersistence(documentSaved && rejectionSaved)
      if (!documentSaved || !rejectionSaved) {
        set({
          toast: createErrorToast({ key: 'errors.rejectionPersistence' }),
        })
      }
    },

    undo() {
      requireWritable()
      const state = get()
      if (state.activeChangeSet || state.history.length === 0) return
      const last = state.history[state.history.length - 1]!
      const restored = {
        ...last.before,
        revision: nextRevision(state.document.revision),
      }
      const nextUi = reconcileUiState(restored, {
        ...state.ui,
        selectedComponentId: last.selectionBefore !== undefined
          ? last.selectionBefore
          : state.ui.selectedComponentId,
      })
      const redoStack = [
        ...state.redoStack.slice(-(MAX_HISTORY - 1)),
        last,
      ]
      set({
        document: restored,
        history: state.history.slice(0, -1),
        redoStack,
        effectiveDocument: restored,
        ui: nextUi,
      })
      markPersistence(persistIfAvailable(restored, null, nextUi.activeScreenId))
    },

    redo() {
      requireWritable()
      const state = get()
      if (state.activeChangeSet || state.redoStack.length === 0) return
      const entry = state.redoStack[state.redoStack.length - 1]!
      const restored = {
        ...entry.after,
        revision: nextRevision(state.document.revision),
      }
      const nextUi = reconcileUiState(restored, {
        ...state.ui,
        selectedComponentId: entry.selectionAfter !== undefined
          ? entry.selectionAfter
          : state.ui.selectedComponentId,
      })
      const newHistory = [
        ...state.history.slice(-(MAX_HISTORY - 1)),
        buildHistory(
          state.document,
          restored,
          entry.label,
          entry.source,
          entry.selectionBefore !== undefined || entry.selectionAfter !== undefined
            ? {
                before: entry.selectionBefore ?? null,
                after: entry.selectionAfter ?? null,
              }
            : undefined,
        ),
      ]
      set({
        document: restored,
        history: newHistory,
        redoStack: state.redoStack.slice(0, -1),
        effectiveDocument: restored,
        ui: nextUi,
      })
      markPersistence(persistIfAvailable(restored, null, nextUi.activeScreenId))
    },

    setActiveScreen(screenId) {
      requireWritable()
      const state = get()
      const screen = getOwnEntity(state.effectiveDocument.screens, screenId)
      if (!screen) return
      const nextUi = reconcileUiState(state.effectiveDocument, {
        ...state.ui,
        activeScreenId: screenId,
        activeStateId: screen.defaultStateId,
        selectedComponentId: null,
      })
      set({ ui: nextUi })
      markPersistence(persistIfAvailable(state.document, state.activeChangeSet, nextUi.activeScreenId))
    },

    setActiveState(stateId) {
      requireWritable()
      set(state => ({
        ui: reconcileUiState(state.effectiveDocument, { ...state.ui, activeStateId: stateId }),
      }))
    },

    setSelectedComponent(componentId) {
      requireWritable()
      set(state => ({
        ui: reconcileUiState(state.effectiveDocument, { ...state.ui, selectedComponentId: componentId }),
      }))
    },

    setRightPanelTab(tab) {
      requireWritable()
      set(state => ({
        ui: {
          ...state.ui,
          rightPanelTab: tab === 'changes' && !state.activeChangeSet ? 'inspector' : tab,
        },
      }))
    },

    initializeWithRecovery(choice) {
      if (choice === 'sample') {
        get().resetToSample()
        return
      }
      downloadCorruptedData()
      // After download, still show recovery screen; user must explicitly choose sample
    },

    exportCurrentData() {
      const state = get()
      downloadCurrentData(state.document, state.effectiveDocument)
    },

    dismissStartupNotice() {
      set({ startupNotice: null })
    },

    showToast(input) {
      const toast = createToast(input)
      set({ toast })
      return toast.id
    },

    dismissToast(toastId) {
      set(state => {
        if (!state.toast || (toastId && state.toast.id !== toastId)) return {}
        return { toast: null }
      })
    },

    runToastAction(toastId) {
      let callback: (() => void) | undefined
      set(state => {
        if (state.toast?.id !== toastId || !state.toast.action) return {}
        callback = state.toast.action.callback
        return { toast: null }
      })
      if (!callback) return false
      try {
        callback()
      } catch (error) {
        get().showToast({ severity: 'error', message: toUiMessage(error) })
      }
      return true
    },

    requestHumanDelete(command, historyLabel, onDeleted) {
      const state = get()
      if (state.pendingDelete) {
        state.showToast({ severity: 'error', message: { key: 'delete.requestPending' } })
        return 'failed'
      }
      try {
        const analysis = analyzeDeleteImpact(state.effectiveDocument, command)
        if (!analysis.requiresConfirmation) {
          return executeHumanDelete(command, historyLabel, onDeleted) ? 'executed' : 'failed'
        }
        set({
          pendingDelete: {
            id: nanoid(),
            command,
            analysis,
            historyLabel,
            routingKey: deleteRoutingKey(state),
            notice: null,
            needsReviewAcknowledgement: false,
            onDeleted,
          },
        })
        return 'pending'
      } catch (error) {
        set({ toast: createErrorToast(toUiMessage(error)) })
        return 'failed'
      }
    },

    confirmPendingDelete() {
      const state = get()
      const request = state.pendingDelete
      if (!request) return
      if (request.needsReviewAcknowledgement) return
      try {
        const analysis = analyzeDeleteImpact(state.effectiveDocument, request.command)
        const routingKey = deleteRoutingKey(state)
        if (
          routingKey !== request.routingKey ||
          analysis.fingerprint !== request.analysis.fingerprint
        ) {
          set({
            pendingDelete: {
              ...request,
              analysis,
              routingKey,
              notice: { key: 'delete.impactChanged' },
              needsReviewAcknowledgement: true,
            },
          })
          return
        }
        set({ pendingDelete: null })
        executeHumanDelete(request.command, request.historyLabel, request.onDeleted)
      } catch (error) {
        const message = toUiMessage(error)
        set({
          pendingDelete: { ...request, notice: message },
          toast: createErrorToast(message),
        })
      }
    },

    acknowledgePendingDeleteImpact() {
      set(state => state.pendingDelete
        ? {
            pendingDelete: {
              ...state.pendingDelete,
              needsReviewAcknowledgement: false,
            },
          }
        : {})
    },

    cancelPendingDelete() {
      set({ pendingDelete: null })
    },

    resetToSample() {
      const nextUi = initialUiState(sampleProject)
      set({
        document: sampleProject,
        activeChangeSet: null,
        history: [],
        redoStack: [],
        ui: nextUi,
        recoveryState: null,
        effectiveDocument: sampleProject,
        startupNotice: null,
        toast: null,
        pendingDelete: null,
        componentClipboard: null,
      })
      const cleared = clearStorage()
      markPersistence(cleared && persistIfAvailable(sampleProject, null, nextUi.activeScreenId))
    },
  }
})
