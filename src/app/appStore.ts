import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { ProjectDocument, EntityId } from '../domain/model'
import type { DomainCommand } from '../domain/commands'
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
  errorMessage: UiMessage | null
  persistenceUnavailable: boolean
  // effectiveDocument = computeEffective(document, activeChangeSet)
  effectiveDocument: ProjectDocument

  dispatch(command: DomainCommand, label?: string): boolean
  beginChangeSet(summary: string): ChangeSet
  dispatchToChangeSet(changeSetId: EntityId, command: DomainCommand, source?: 'human' | 'agent'): void
  acceptChangeSet(): void
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
  setErrorMessage(message: UiMessage | null): void
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

function buildHistory(before: ProjectDocument, after: ProjectDocument, label: string, source: HistoryEntry['source']): HistoryEntry {
  return { id: nanoid(), label, source, before, after }
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

  return {
    document: confirmedDocument,
    activeChangeSet,
    rejectedRecords,
    history: [],
    redoStack: [],
    ui,
    recoveryState,
    startupNotice,
    errorMessage: null,
    persistenceUnavailable,
    effectiveDocument: effectiveDoc,

    dispatch(command, label = 'Edit') {
      requireWritable()
      const state = get()
      // While a change set is active, human edits go into the change set, not the confirmed doc
      if (state.activeChangeSet) {
        try {
          state.dispatchToChangeSet(state.activeChangeSet.id, command, 'human')
        } catch (e) {
          set({ errorMessage: toUiMessage(e) })
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
          errorMessage: null,
        })
        markPersistence(persistIfAvailable(next, null, newUi.activeScreenId))
        return true
      } catch (e) {
        set({ errorMessage: toUiMessage(e) })
        return false
      }
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
      try {
        applyCommandWithoutRevision(previewDoc, command)
      } catch (error) {
        const domainError = toDomainError(error)
        set({ errorMessage: domainErrorMessage(domainError.code) })
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
      set({ activeChangeSet: newChangeSet, effectiveDocument: effective, ui: nextUi, errorMessage: null })
      markPersistence(persistIfAvailable(state.document, newChangeSet, nextUi.activeScreenId))
    },

    acceptChangeSet() {
      requireWritable()
      const state = get()
      if (!state.activeChangeSet) throw new DomainError('CHANGE_SET_NOT_ACTIVE', 'No active change set')
      try {
        // Atomic re-validation: apply all ops on baseDocument
        const next = applyTransaction(
          state.activeChangeSet.baseDocument,
          state.activeChangeSet.operations.map(op => op.command),
        )
        const newHistory = [
          ...state.history.slice(-(MAX_HISTORY - 1)),
          buildHistory(state.document, next, `Accept: ${state.activeChangeSet.summary}`, 'accepted-change-set'),
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
          errorMessage: null,
        })
        markPersistence(persistIfAvailable(next, null, nextUi.activeScreenId))
      } catch (e) {
        if (e instanceof DomainError) {
          set({ errorMessage: domainErrorMessage(e.code) })
        } else {
          set({
            errorMessage: {
              key: 'errors.acceptFailed',
              params: { message: e instanceof Error ? e.message : String(e) },
            },
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
      const nextUi = {
        ...reconcileUiState(state.document, state.ui),
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
          errorMessage: { key: 'errors.rejectionPersistence' },
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
      const nextUi = reconcileUiState(restored, state.ui)
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
      const nextUi = reconcileUiState(restored, state.ui)
      const newHistory = [
        ...state.history.slice(-(MAX_HISTORY - 1)),
        buildHistory(state.document, restored, entry.label, entry.source),
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

    setErrorMessage(message) {
      set({ errorMessage: message })
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
        errorMessage: null,
      })
      const cleared = clearStorage()
      markPersistence(cleared && persistIfAvailable(sampleProject, null, nextUi.activeScreenId))
    },
  }
})
