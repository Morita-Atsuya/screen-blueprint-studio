import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { ProjectDocument, EntityId } from '../domain/model'
import type { ComponentSubtreeSnapshot, DomainCommand } from '../domain/commands'
import {
  assertAgentChangeSetOperations,
  type ChangeSet,
  type RejectedChangeSetRecord,
} from '../domain/collaboration'
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
import { cloneDomainCommand } from '../domain/modelClone'
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
import type { EditorSelection } from '../domain/editorSelection'
import {
  cloneEditorSelection,
  reconcileEditorSelection,
  screenComponentSelection,
  selectionRootScreenComponentId,
} from '../domain/editorSelection'

export interface HistoryEntry {
  id: EntityId
  label: string
  source: 'human' | 'accepted-change-set'
  before: ProjectDocument
  after: ProjectDocument
  selectionBefore?: EditorSelection | null
  selectionAfter?: EditorSelection | null
}

export interface UiState {
  activeScreenId: EntityId | null
  activeStateId: EntityId | null
  selection: EditorSelection | null
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
  revision: number
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
  reviewDraftProtectionIds: string[]
  reviewDraftDocument: ProjectDocument | null
  persistenceUnavailable: boolean
  // effectiveDocument = computeEffective(document, activeChangeSet)
  effectiveDocument: ProjectDocument

  dispatch(command: DomainCommand, label?: string): boolean
  duplicateComponent(componentId: EntityId, label: string): boolean
  copyComponent(componentId: EntityId): boolean
  pasteComponent(destinationComponentId: EntityId, label: string): boolean
  beginChangeSet(summary: string): ChangeSet
  dispatchToChangeSet(changeSetId: EntityId, command: DomainCommand, source?: 'agent'): void
  acceptChangeSet(historyLabel?: string): void
  rejectChangeSet(): void
  undo(): void
  redo(): void

  setActiveScreen(screenId: EntityId): void
  setActiveState(stateId: EntityId | null): void
  setSelection(selection: EditorSelection | null): void
  selectScreenComponent(componentId: EntityId | null): void
  setRightPanelTab(tab: UiState['rightPanelTab']): void
  setReviewDraftProtected(id: string, protectedDraft: boolean): void

  initializeWithRecovery(choice: 'sample' | 'download'): void
  exportCurrentData(): void
  dismissStartupNotice(): void
  showToast(input: ToastInput): EntityId
  dismissToast(toastId?: EntityId): void
  runToastAction(toastId: EntityId): boolean
  notifyReviewLock(): void
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

function initialUiState(
  doc: ProjectDocument,
  activeScreenId?: string,
  activeStateId?: string,
  selection?: EditorSelection,
): UiState {
  const screenId = activeScreenId ?? doc.project.screenIds[0] ?? null
  const screen = screenId ? getOwnEntity(doc.screens, screenId) : null
  return {
    activeScreenId: screenId,
    activeStateId: (
      activeStateId &&
      screen?.scenarioIds.includes(activeStateId) &&
      getOwnEntity(doc.screenScenarios, activeStateId)?.screenId === screenId
    )
      ? activeStateId
      : null,
    selection: reconcileEditorSelection(doc, selection ?? null, screenId),
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
    activeScreen?.scenarioIds.includes(current.activeStateId) &&
    getOwnEntity(doc.screenScenarios, current.activeStateId)?.screenId === activeScreenId
  )
    ? current.activeStateId
    : null
  const selection = reconcileEditorSelection(doc, current.selection, activeScreenId)

  return {
    ...current,
    activeScreenId,
    activeStateId,
    selection,
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

function persist(
  revision: number,
  document: ProjectDocument,
  activeChangeSet: ChangeSet | null,
  ui: Pick<UiState, 'activeScreenId' | 'activeStateId' | 'selection'>,
): boolean {
  return saveToStorage({
    revision,
    document,
    activeChangeSet: activeChangeSet ?? undefined,
    activeScreenId: ui.activeScreenId ?? undefined,
    activeStateId: ui.activeStateId ?? undefined,
    selection: ui.selection ? cloneEditorSelection(ui.selection) : undefined,
  })
}

function buildHistory(
  before: ProjectDocument,
  after: ProjectDocument,
  label: string,
  source: HistoryEntry['source'],
  selection?: {
    before: EditorSelection | null
    after: EditorSelection | null
  },
): HistoryEntry {
  return {
    id: nanoid(),
    label,
    source,
    before,
    after,
    selectionBefore: selection?.before ? cloneEditorSelection(selection.before) : selection?.before,
    selectionAfter: selection?.after ? cloneEditorSelection(selection.after) : selection?.after,
  }
}

function replaceSelectionRoot(
  document: ProjectDocument,
  selection: EditorSelection,
  componentId: EntityId,
): EditorSelection | null {
  const component = getOwnEntity(document.components, componentId)
  if (!component) return null
  if (selection.type === 'resolvedDefinitionNode') {
    return component.nodeType === 'definitionInstance'
      ? {
          ...selection,
          screenId: component.screenId,
          instanceId: componentId,
          nodePath: [...selection.nodePath] as [EntityId, ...EntityId[]],
        }
      : null
  }
  if (
    selection.type === 'screenInlineComponent' ||
    selection.type === 'screenDefinitionInstance'
  ) {
    return screenComponentSelection(document, component.screenId, componentId)
  }
  return selection
}

function selectionBeforeChangeSet(
  changeSet: ChangeSet,
  selection: EditorSelection | null,
): EditorSelection | null {
  if (!selection || selection.type === 'definitionEditorNode') return selection
  let candidate = selectionRootScreenComponentId(selection)
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
  return hasOwnEntity(changeSet.baseDocument.components, candidate)
    ? replaceSelectionRoot(changeSet.baseDocument, selection, candidate)
    : null
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

type DeleteUndoToken = { kind: 'history'; historyEntryId: EntityId }

export const useAppStore = create<AppStore>((set, get) => {
  const loadResult = loadFromStorage()
  const rejectedRecords = loadRejectedRecords()
  let revision = 0
  let confirmedDocument = sampleProject
  let activeChangeSet: ChangeSet | null = null
  let ui = initialUiState(sampleProject)
  let recoveryState: RecoveryState | null = null
  let startupNotice: UiMessage | null = null
  let persistenceUnavailable = false

  if (loadResult.status === 'success') {
    revision = loadResult.revision
    confirmedDocument = loadResult.document
    const restoredChangeSet = loadResult.activeChangeSet ?? null
    activeChangeSet = restoredChangeSet && rejectedRecords.some(
      record => record.changeSetId === restoredChangeSet.id,
    )
      ? null
      : restoredChangeSet
    ui = initialUiState(
      confirmedDocument,
      loadResult.activeScreenId,
      loadResult.activeStateId,
      loadResult.selection,
    )
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
      const persisted = persist(revision, confirmedDocument, null, ui)
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
    revisionValue: number,
    document: ProjectDocument,
    changeSet: ChangeSet | null,
    uiState: Pick<UiState, 'activeScreenId' | 'activeStateId' | 'selection'>,
  ): boolean {
    if (get().recoveryState) return true
    return persist(revisionValue, document, changeSet, uiState)
  }

  function deleteRoutingKey(state: AppStore): string {
    return state.activeChangeSet
      ? `change-set:${state.activeChangeSet.id}:${state.activeChangeSet.version}`
      : `document:${state.revision}`
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

  function notifyReviewLock(): void {
    const state = get()
    if (state.toast?.message.key === 'changes.editLocked') return
    state.showToast({
      severity: 'info',
      message: { key: 'changes.editLocked' },
    })
  }

  function undoDelete(token: DeleteUndoToken): void {
    const state = get()
    const currentEntry = state.history[state.history.length - 1]
    if (state.activeChangeSet || currentEntry?.id !== token.historyEntryId) {
      state.showToast({ severity: 'error', message: { key: 'delete.undoUnavailable' } })
      return
    }
    state.undo()
  }

  function executeHumanDelete(
    command: DeleteCommand,
    historyLabel: string,
    onDeleted?: () => void,
  ): boolean {
    const before = get()
    if (!before.dispatch(command, historyLabel)) return false

    const after = get()
    const historyEntry = after.history[after.history.length - 1]
    if (!historyEntry || historyEntry.before !== before.document) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        'The delete operation did not create a history entry',
      )
    }
    const token: DeleteUndoToken = { kind: 'history', historyEntryId: historyEntry.id }

    onDeleted?.()
    showDeleteUndoToast(token)
    return true
  }

  return {
    revision,
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
    reviewDraftProtectionIds: [],
    reviewDraftDocument: null,
    persistenceUnavailable,
    effectiveDocument: effectiveDoc,

    dispatch(command, label = 'Edit') {
      requireWritable()
      const state = get()
      if (state.activeChangeSet) {
        notifyReviewLock()
        return false
      }
      if (command.type === 'moveComponent') {
        const outcome = classifyComponentMove(
          state.effectiveDocument,
          command.componentId,
          command.newParentId,
          command.position,
        )
        if (outcome.status === 'no-op') return true
      }
      try {
        const next = applyCommand(state.document, command)
        const nextRevisionValue = nextRevision(state.revision)
        const newHistory = [
          ...state.history.slice(-(MAX_HISTORY - 1)),
          buildHistory(state.document, next, label, 'human'),
        ]
        const newUi = reconcileUiState(next, state.ui)
        set({
          revision: nextRevisionValue,
          document: next,
          history: newHistory,
          redoStack: [],
          effectiveDocument: next,
          ui: newUi,
        })
        markPersistence(persistIfAvailable(nextRevisionValue, next, null, newUi))
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
          selection: screenComponentSelection(
            state.effectiveDocument,
            getOwnEntity(state.effectiveDocument.components, duplicatedRootId)?.screenId ?? '',
            duplicatedRootId,
          ),
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
              selectionBefore: before.ui.selection,
              selectionAfter: ui.selection,
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
          selection: screenComponentSelection(
            state.effectiveDocument,
            getOwnEntity(state.effectiveDocument.components, pastedRootId)?.screenId ?? '',
            pastedRootId,
          ),
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
              selectionBefore: before.ui.selection,
              selectionAfter: ui.selection,
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
        baseRevision: state.revision,
        version: 0,
        baseDocument: state.document,
        operations: [],
        createdAt: new Date().toISOString(),
      }
      const nextUi = {
        ...reconcileUiState(state.document, state.ui),
      }
      set({
        activeChangeSet: changeSet,
        effectiveDocument: state.document,
        ui: nextUi,
        reviewDraftDocument: state.reviewDraftProtectionIds.length > 0
          ? state.document
          : state.reviewDraftDocument,
      })
      markPersistence(persistIfAvailable(state.revision, state.document, changeSet, nextUi))
      return changeSet
    },

    dispatchToChangeSet(changeSetId, command, source = 'agent') {
      requireWritable()
      if (source !== 'agent') {
        throw new DomainError(
          'INVALID_CHANGE_SET_SOURCE',
          'Human operations cannot be added to an active change set',
        )
      }
      const state = get()
      if (!state.activeChangeSet || state.activeChangeSet.id !== changeSetId) {
        throw new DomainError('CHANGE_SET_REQUIRED', 'No matching active change set')
      }
      const isolatedCommand = cloneDomainCommand(command)
      // Try applying the op to the current preview to validate it
      const previewDoc = state.effectiveDocument
      if (isolatedCommand.type === 'moveComponent') {
        const outcome = classifyComponentMove(
          previewDoc,
          isolatedCommand.componentId,
          isolatedCommand.newParentId,
          isolatedCommand.position,
        )
        if (outcome.status === 'no-op') return
      }
      try {
        applyCommandWithoutRevision(previewDoc, isolatedCommand)
      } catch (error) {
        const domainError = toDomainError(error)
        set({ toast: createErrorToast(domainErrorMessage(domainError.code)) })
        throw domainError
      }
      const operation = {
        id: nanoid(),
        source,
        command: isolatedCommand,
        issuedAt: new Date().toISOString(),
      }
      const newChangeSet: ChangeSet = {
        ...state.activeChangeSet,
        version: state.activeChangeSet.version + 1,
        operations: [...state.activeChangeSet.operations, operation],
      }
      const effective = computeEffective(state.document, newChangeSet)
      const reconciledUi = reconcileUiState(effective, state.ui)
      const nextUi = state.reviewDraftProtectionIds.length > 0
        ? {
            ...reconciledUi,
            activeScreenId: state.ui.activeScreenId,
            activeStateId: state.ui.activeStateId,
            selection: state.ui.selection,
          }
        : reconciledUi
      set({ activeChangeSet: newChangeSet, effectiveDocument: effective, ui: nextUi })
      markPersistence(persistIfAvailable(state.revision, state.document, newChangeSet, nextUi))
    },

    acceptChangeSet(historyLabel) {
      requireWritable()
      const state = get()
      if (!state.activeChangeSet) throw new DomainError('CHANGE_SET_NOT_ACTIVE', 'No active change set')
      try {
        assertAgentChangeSetOperations(state.activeChangeSet.operations)
        if (state.activeChangeSet.operations.length === 0) {
          const nextUi = {
            ...reconcileUiState(state.document, state.ui),
            rightPanelTab: 'inspector' as const,
          }
          set({
            activeChangeSet: null,
            effectiveDocument: state.document,
            ui: nextUi,
          })
          markPersistence(persistIfAvailable(state.revision, state.document, null, nextUi))
          return
        }
        // Atomic re-validation: apply all ops on baseDocument
        const next = applyTransaction(
          state.activeChangeSet.baseDocument,
          state.activeChangeSet.operations.map(op => op.command),
        )
        const nextRevisionValue = nextRevision(state.revision)
        const selectedBefore = selectionBeforeChangeSet(
          state.activeChangeSet,
          state.ui.selection,
        )
        const newHistory = [
          ...state.history.slice(-(MAX_HISTORY - 1)),
          buildHistory(
            state.document,
            next,
            historyLabel ?? `Accept change set: ${state.activeChangeSet.summary}`,
            'accepted-change-set',
            { before: selectedBefore, after: state.ui.selection },
          ),
        ]
        const reconciledUi = reconcileUiState(next, state.ui)
        const nextUi = {
          ...(state.reviewDraftProtectionIds.length > 0
            ? {
                ...reconciledUi,
                activeScreenId: state.ui.activeScreenId,
                activeStateId: state.ui.activeStateId,
                selection: state.ui.selection,
              }
            : reconciledUi),
          rightPanelTab: 'inspector' as const,
        }
        set({
          revision: nextRevisionValue,
          document: next,
          activeChangeSet: null,
          history: newHistory,
          redoStack: [],
          effectiveDocument: next,
          ui: nextUi,
        })
        markPersistence(persistIfAvailable(nextRevisionValue, next, null, nextUi))
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
        state.ui.selection,
      )
      const nextUi = {
        ...reconcileUiState(state.document, {
          ...state.ui,
          selection: state.reviewDraftProtectionIds.length > 0
            ? state.ui.selection
            : selectedBefore,
        }),
        rightPanelTab: 'inspector' as const,
      }
      set({ activeChangeSet: null, effectiveDocument: state.document, rejectedRecords, ui: nextUi })
      // Save the rejection first so a failed main write can be suppressed on reload
      // without deleting the last confirmed document.
      const rejectionSaved = saveRejectedRecord(record)
      const documentSaved = persistIfAvailable(state.revision, state.document, null, nextUi)
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
      const restored = last.before
      const nextRevisionValue = nextRevision(state.revision)
      const nextUi = reconcileUiState(restored, {
        ...state.ui,
        selection: last.selectionBefore !== undefined
          ? last.selectionBefore
          : state.ui.selection,
      })
      const redoStack = [
        ...state.redoStack.slice(-(MAX_HISTORY - 1)),
        last,
      ]
      set({
        revision: nextRevisionValue,
        document: restored,
        history: state.history.slice(0, -1),
        redoStack,
        effectiveDocument: restored,
        ui: nextUi,
      })
      markPersistence(persistIfAvailable(nextRevisionValue, restored, null, nextUi))
    },

    redo() {
      requireWritable()
      const state = get()
      if (state.activeChangeSet || state.redoStack.length === 0) return
      const entry = state.redoStack[state.redoStack.length - 1]!
      const restored = entry.after
      const nextRevisionValue = nextRevision(state.revision)
      const nextUi = reconcileUiState(restored, {
        ...state.ui,
        selection: entry.selectionAfter !== undefined
          ? entry.selectionAfter
          : state.ui.selection,
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
        revision: nextRevisionValue,
        document: restored,
        history: newHistory,
        redoStack: state.redoStack.slice(0, -1),
        effectiveDocument: restored,
        ui: nextUi,
      })
      markPersistence(persistIfAvailable(nextRevisionValue, restored, null, nextUi))
    },

    setActiveScreen(screenId) {
      requireWritable()
      const state = get()
      const screen = getOwnEntity(state.effectiveDocument.screens, screenId)
      if (!screen) return
      const nextUi = reconcileUiState(state.effectiveDocument, {
        ...state.ui,
        activeScreenId: screenId,
        activeStateId: null,
        selection: null,
      })
      set({ ui: nextUi })
      markPersistence(persistIfAvailable(state.revision, state.document, state.activeChangeSet, nextUi))
    },

    setActiveState(stateId) {
      requireWritable()
      set(state => ({
        ui: reconcileUiState(state.effectiveDocument, { ...state.ui, activeStateId: stateId }),
      }))
    },

    setSelection(selection) {
      requireWritable()
      set(state => ({
        ui: reconcileUiState(state.effectiveDocument, {
          ...state.ui,
          selection: selection ? cloneEditorSelection(selection) : null,
        }),
      }))
    },

    selectScreenComponent(componentId) {
      requireWritable()
      set(state => {
        const activeScreenId = state.ui.activeScreenId
        const selection = componentId && activeScreenId
          ? screenComponentSelection(state.effectiveDocument, activeScreenId, componentId)
          : null
        return {
          ui: reconcileUiState(state.effectiveDocument, { ...state.ui, selection }),
        }
      })
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
      downloadCurrentData(state.revision, state.document, state.effectiveDocument)
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

    setReviewDraftProtected(id, protectedDraft) {
      set(state => {
        const exists = state.reviewDraftProtectionIds.includes(id)
        if (exists === protectedDraft) return state
        const reviewDraftProtectionIds = protectedDraft
          ? [...state.reviewDraftProtectionIds, id]
          : state.reviewDraftProtectionIds.filter(candidate => candidate !== id)
        const protectionEnded = reviewDraftProtectionIds.length === 0
        return {
          reviewDraftProtectionIds,
          reviewDraftDocument: protectionEnded
            ? null
            : state.reviewDraftDocument ??
              state.activeChangeSet?.baseDocument ??
              null,
          ...(protectionEnded
            ? { ui: reconcileUiState(state.effectiveDocument, state.ui) }
            : {}),
        }
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

    notifyReviewLock,

    requestHumanDelete(command, historyLabel, onDeleted) {
      const state = get()
      if (state.activeChangeSet) {
        notifyReviewLock()
        return 'failed'
      }
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
      if (state.activeChangeSet) {
        notifyReviewLock()
        return
      }
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
        revision: 0,
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
        rejectedRecords: [],
        reviewDraftProtectionIds: [],
        reviewDraftDocument: null,
      })
      const cleared = clearStorage()
      markPersistence(cleared && persistIfAvailable(0, sampleProject, null, nextUi))
    },
  }
})
