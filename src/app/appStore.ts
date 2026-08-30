import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { ProjectDocument, EntityId } from '../domain/model'
import type { DomainCommand } from '../domain/commands'
import type { ChangeSet, RejectedChangeSetRecord } from '../domain/collaboration'
import {
  applyCommand,
  applyCommandWithoutRevision,
  applyTransaction,
  nextRevision,
} from '../domain/applyCommand'
import { DomainError } from '../domain/errors'
import { getOwnEntity, hasOwnEntity } from '../domain/entityMap'
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
  source: 'human' | 'accepted-change-set' | 'auto-applied-agent'
  before: ProjectDocument
  after: ProjectDocument
}

// Review mode only - autoApply removed from MVP (would bypass change set review invariant)
export type AgentWritePolicy = 'review'

export interface UiState {
  activeScreenId: EntityId | null
  activeStateId: EntityId | null
  selectedComponentId: EntityId | null
  rightPanelTab: 'inspector' | 'changes'
  leftPanelTab: 'screens' | 'palette' | 'structure'
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
  agentWritePolicy: AgentWritePolicy
  ui: UiState
  recoveryState: RecoveryState | null
  errorMessage: string | null
  persistenceUnavailable: boolean
  // effectiveDocument = computeEffective(document, activeChangeSet)
  effectiveDocument: ProjectDocument

  dispatch(command: DomainCommand, label?: string): void
  beginChangeSet(summary: string): ChangeSet
  dispatchToChangeSet(changeSetId: EntityId, command: DomainCommand, source?: 'human' | 'agent'): void
  acceptChangeSet(): void
  rejectChangeSet(): void
  undo(): void

  setActiveScreen(screenId: EntityId): void
  setActiveState(stateId: EntityId | null): void
  setSelectedComponent(componentId: EntityId | null): void
  setRightPanelTab(tab: UiState['rightPanelTab']): void
  setLeftPanelTab(tab: UiState['leftPanelTab']): void

  initializeWithRecovery(choice: 'sample' | 'download'): void
  exportCurrentData(): void
  setErrorMessage(message: string | null): void
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
    leftPanelTab: 'structure',
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
  let current = changeSet.baseDocument
  for (const op of changeSet.operations) {
    current = applyCommandWithoutRevision(current, op.command)
  }
  return current
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

export const useAppStore = create<AppStore>((set, get) => {
  const loadResult = loadFromStorage()
  const rejectedRecords = loadRejectedRecords()
  let confirmedDocument = sampleProject
  let activeChangeSet: ChangeSet | null = null
  let ui = initialUiState(sampleProject)
  let recoveryState: RecoveryState | null = null

  if (loadResult.status === 'success') {
    confirmedDocument = loadResult.document
    const restoredChangeSet = loadResult.activeChangeSet ?? null
    activeChangeSet = restoredChangeSet && rejectedRecords.some(
      record => record.changeSetId === restoredChangeSet.id,
    )
      ? null
      : restoredChangeSet
    ui = initialUiState(confirmedDocument, loadResult.activeScreenId)
  } else if (loadResult.status === 'invalid') {
    recoveryState = { status: 'invalid', rawData: loadResult.rawData, error: loadResult.error }
  }

  let effectiveDoc = confirmedDocument
  if (!recoveryState) {
    try {
      effectiveDoc = computeEffective(confirmedDocument, activeChangeSet)
    } catch (error) {
      recoveryState = {
        status: 'invalid',
        rawData: JSON.stringify({
          document: confirmedDocument,
          activeChangeSet: activeChangeSet ?? undefined,
        }),
        error: `Active change set could not be restored: ${toDomainError(error).message}`,
      }
      activeChangeSet = null
    }
  }
  ui = reconcileUiState(effectiveDoc, ui)

  function markPersistence(saved: boolean): void {
    set({ persistenceUnavailable: !saved })
  }

  function requireWritable(): void {
    const recovery = get().recoveryState
    if (recovery) {
      throw new DomainError('RECOVERY_REQUIRED', '保存データの復旧または初期化が必要です', {
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
    agentWritePolicy: 'review',
    ui,
    recoveryState,
    errorMessage: null,
    persistenceUnavailable: false,
    effectiveDocument: effectiveDoc,

    dispatch(command, label = 'Edit') {
      requireWritable()
      const state = get()
      // While a change set is active, human edits go into the change set, not the confirmed doc
      if (state.activeChangeSet) {
        try {
          state.dispatchToChangeSet(state.activeChangeSet.id, command, 'human')
        } catch (e) {
          const message = e instanceof DomainError ? e.message : e instanceof Error ? e.message : String(e)
          set({ errorMessage: message })
        }
        return
      }
      try {
        const next = applyCommand(state.document, command)
        const newHistory = [
          ...state.history.slice(-(MAX_HISTORY - 1)),
          buildHistory(state.document, next, label, 'human'),
        ]
        const newUi = reconcileUiState(next, state.ui)
        set({ document: next, history: newHistory, effectiveDocument: next, ui: newUi, errorMessage: null })
        markPersistence(persistIfAvailable(next, null, newUi.activeScreenId))
      } catch (e) {
        const message = e instanceof DomainError ? e.message : e instanceof Error ? e.message : String(e)
        set({ errorMessage: message })
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
        set({ errorMessage: domainError.message })
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
        const nextUi = reconcileUiState(next, state.ui)
        set({ document: next, activeChangeSet: null, history: newHistory, effectiveDocument: next, ui: nextUi, errorMessage: null })
        markPersistence(persistIfAvailable(next, null, nextUi.activeScreenId))
      } catch (e) {
        const message = e instanceof DomainError ? e.message : e instanceof Error ? e.message : String(e)
        set({ errorMessage: `承認失敗: ${message}` })
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
      const nextUi = reconcileUiState(state.document, state.ui)
      set({ activeChangeSet: null, effectiveDocument: state.document, rejectedRecords, ui: nextUi })
      // Save the rejection first so a failed main write can be suppressed on reload
      // without deleting the last confirmed document.
      const rejectionSaved = saveRejectedRecord(record)
      const documentSaved = persistIfAvailable(state.document, null, nextUi.activeScreenId)
      if (!documentSaved && !rejectionSaved) removePersistedDocument()
      markPersistence(documentSaved && rejectionSaved)
      if (!documentSaved || !rejectionSaved) {
        set({
          errorMessage: '変更案は却下しましたが、ブラウザ保存領域への記録に失敗しました。',
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
      set({ document: restored, history: state.history.slice(0, -1), effectiveDocument: restored, ui: nextUi })
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
      set(state => ({ ui: { ...state.ui, rightPanelTab: tab } }))
    },

    setLeftPanelTab(tab) {
      requireWritable()
      set(state => ({ ui: { ...state.ui, leftPanelTab: tab } }))
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

    setErrorMessage(message) {
      set({ errorMessage: message })
    },

    resetToSample() {
      const nextUi = initialUiState(sampleProject)
      set({
        document: sampleProject,
        activeChangeSet: null,
        history: [],
        ui: nextUi,
        recoveryState: null,
        effectiveDocument: sampleProject,
        errorMessage: null,
      })
      const cleared = clearStorage()
      markPersistence(cleared && persistIfAvailable(sampleProject, null, nextUi.activeScreenId))
    },
  }
})
