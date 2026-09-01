import type { ProjectDocument } from '../domain/model'
import type { ChangeSet, RejectedChangeSetRecord } from '../domain/collaboration'
import { validateInvariants } from '../domain/invariants'
import { applyCommandWithoutRevision } from '../domain/applyCommand'
import { CURRENT_SCHEMA_VERSION } from '../domain/model'
import type { EditorSelection } from '../domain/editorSelection'
import { parseEditorSelectionValue } from '../domain/editorSelection'

const STORAGE_KEY = 'screen-blueprint-studio:workspace:v3'
const LEGACY_STORAGE_KEYS = ['screen-blueprint-studio:v1']
const REJECTED_KEY = 'screen-blueprint-studio:rejected:v3'
const LEGACY_REJECTED_KEYS = ['screen-blueprint-studio:rejected:v1']

export interface PersistedData {
  revision: number
  document: ProjectDocument
  activeScreenId?: string
  activeStateId?: string
  selection?: EditorSelection
  activeChangeSet?: ChangeSet
}

export interface DiscardedActiveChangeSet {
  error: string
  persisted: boolean
}

export type LoadResult =
  | { status: 'empty' }
  | {
      status: 'success'
      revision: number
      document: ProjectDocument
      activeChangeSet?: ChangeSet
      activeScreenId?: string
      activeStateId?: string
      selection?: EditorSelection
      discardedActiveChangeSet?: DiscardedActiveChangeSet
    }
  | { status: 'invalid'; rawData: string; error: string }

const COMMAND_TYPES = new Set([
  'addScreen',
  'updateScreen',
  'removeScreen',
  'addComponent',
  'moveComponent',
  'duplicateComponent',
  'pasteComponent',
  'removeComponent',
  'updateComponentSpec',
  'extractComponentDefinition',
  'detachDefinitionInstance',
  'putComponentDefinition',
  'addDefinitionInstance',
  'updateDefinitionInstance',
  'createScreenState',
  'updateScreenState',
  'removeScreenState',
  'connectEvent',
  'updateEvent',
  'removeEvent',
  'bindApiOperation',
  'updateApiOperation',
  'removeApiOperation',
  'removeComponentDefinition',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`)
  }
}

function requireNonNegativeInteger(value: unknown, path: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${path} must be a non-negative safe integer`)
  }
}

function storage(): Storage {
  return globalThis.localStorage
}

function validateActiveChangeSet(
  value: unknown,
  document: ProjectDocument,
  revision: number,
): ChangeSet {
  if (!isRecord(value)) throw new Error('activeChangeSet must be an object')
  requireString(value.id, 'activeChangeSet.id')
  requireString(value.summary, 'activeChangeSet.summary')
  requireNonNegativeInteger(value.baseRevision, 'activeChangeSet.baseRevision')
  requireNonNegativeInteger(value.version, 'activeChangeSet.version')
  requireString(value.createdAt, 'activeChangeSet.createdAt')
  if (!isRecord(value.baseDocument)) throw new Error('activeChangeSet.baseDocument must be an object')
  if (!Array.isArray(value.operations)) throw new Error('activeChangeSet.operations must be an array')

  const changeSet = value as unknown as ChangeSet
  validateInvariants(changeSet.baseDocument)
  if (changeSet.baseRevision !== revision) {
    throw new Error('activeChangeSet base revision does not match the persisted workspace revision')
  }
  if (JSON.stringify(changeSet.baseDocument) !== JSON.stringify(document)) {
    throw new Error('activeChangeSet.baseDocument does not match the persisted document')
  }
  if (changeSet.version !== changeSet.operations.length) {
    throw new Error('activeChangeSet.version must equal its operation count')
  }

  let preview = changeSet.baseDocument
  changeSet.operations.forEach((operation, index) => {
    if (!isRecord(operation)) throw new Error(`activeChangeSet.operations[${index}] must be an object`)
    requireString(operation.id, `activeChangeSet.operations[${index}].id`)
    requireString(operation.issuedAt, `activeChangeSet.operations[${index}].issuedAt`)
    if (operation.source !== 'agent') {
      throw new Error(`activeChangeSet.operations[${index}].source is invalid`)
    }
    if (!isRecord(operation.command) || !COMMAND_TYPES.has(String(operation.command.type))) {
      throw new Error(`activeChangeSet.operations[${index}].command is invalid`)
    }
    preview = applyCommandWithoutRevision(preview, operation.command)
  })
  return changeSet
}

function rawPersistedValue(): string {
  return storage().getItem(STORAGE_KEY) ?? ''
}

function legacyRawPersistedValue(): string {
  for (const key of LEGACY_STORAGE_KEYS) {
    const raw = storage().getItem(key)
    if (raw) return raw
  }
  return ''
}

export function saveToStorage(data: PersistedData): boolean {
  try {
    storage().setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch (error) {
    console.warn('Failed to save to localStorage', error)
    return false
  }
}

export function loadFromStorage(): LoadResult {
  let raw = ''
  try {
    raw = rawPersistedValue()
    if (!raw) {
      const legacyRaw = legacyRawPersistedValue()
      if (!legacyRaw) return { status: 'empty' }
      return {
        status: 'invalid',
        rawData: legacyRaw,
        error: 'Unsupported persisted workspace format. Reset to the sample project to recover.',
      }
    }
  } catch (error) {
    return { status: 'invalid', rawData: raw, error: error instanceof Error ? error.message : String(error) }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
    if (!isRecord(parsed) || !isRecord(parsed.document)) {
      throw new Error('Persisted data must contain a document')
    }
    requireNonNegativeInteger(parsed.revision, 'persisted.revision')
  } catch (error) {
    return { status: 'invalid', rawData: raw, error: error instanceof Error ? error.message : String(error) }
  }

  const data = parsed as unknown as PersistedData
  const selection = data.selection === undefined
    ? undefined
    : parseEditorSelectionValue(data.selection) ?? undefined
  if (data.document.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return { status: 'invalid', rawData: raw, error: 'Unsupported schema version' }
  }
  try {
    validateInvariants(data.document)
  } catch (error) {
    return { status: 'invalid', rawData: raw, error: error instanceof Error ? error.message : String(error) }
  }

  if (data.activeChangeSet === undefined) {
    return {
      status: 'success',
      revision: data.revision,
      document: data.document,
      activeScreenId: data.activeScreenId,
      activeStateId: data.activeStateId,
      selection,
    }
  }

  if (
    isRecord(data.activeChangeSet) &&
    Array.isArray(data.activeChangeSet.operations) &&
    data.activeChangeSet.operations.some(operation =>
      isRecord(operation) && (operation as { source: unknown }).source === 'human'
    )
  ) {
    return {
      status: 'invalid',
      rawData: raw,
      error: 'The saved change set contains human edits and requires explicit recovery',
    }
  }

  try {
    return {
      status: 'success',
      revision: data.revision,
      document: data.document,
      activeChangeSet: validateActiveChangeSet(data.activeChangeSet, data.document, data.revision),
      activeScreenId: data.activeScreenId,
      activeStateId: data.activeStateId,
      selection,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('Discarding invalid active change set', error)
    const persisted = saveToStorage({
      revision: data.revision,
      document: data.document,
      activeScreenId: data.activeScreenId,
      activeStateId: data.activeStateId,
      selection,
    })
    return {
      status: 'success',
      revision: data.revision,
      document: data.document,
      activeScreenId: data.activeScreenId,
      activeStateId: data.activeStateId,
      selection,
      discardedActiveChangeSet: { error: message, persisted },
    }
  }
}

export function removePersistedDocument(): boolean {
  try {
    storage().removeItem(STORAGE_KEY)
    LEGACY_STORAGE_KEYS.forEach(key => storage().removeItem(key))
    return true
  } catch (error) {
    console.warn('Failed to remove persisted document', error)
    return false
  }
}

export function clearStorage(): boolean {
  const documentRemoved = removePersistedDocument()
  let rejectedRecordsRemoved = false
  try {
    storage().removeItem(REJECTED_KEY)
    LEGACY_REJECTED_KEYS.forEach(key => storage().removeItem(key))
    rejectedRecordsRemoved = true
  } catch (error) {
    console.warn('Failed to remove rejected change set records', error)
  }
  return documentRemoved && rejectedRecordsRemoved
}

function isRejectedRecord(value: unknown): value is RejectedChangeSetRecord {
  if (!isRecord(value)) return false
  const expectedKeys = [
    'changeSetId',
    'summary',
    'baseRevision',
    'rejectedAt',
    'operationCount',
    'operationSummaries',
  ]
  if (
    Object.keys(value).length !== expectedKeys.length ||
    expectedKeys.some(key => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    return false
  }
  return (
    typeof value.changeSetId === 'string' &&
    value.changeSetId.length > 0 &&
    typeof value.summary === 'string' &&
    Number.isInteger(value.baseRevision) &&
    (value.baseRevision as number) >= 0 &&
    typeof value.rejectedAt === 'string' &&
    value.rejectedAt.length > 0 &&
    Number.isInteger(value.operationCount) &&
    (value.operationCount as number) >= 0 &&
    Array.isArray(value.operationSummaries) &&
    value.operationSummaries.length === value.operationCount &&
    value.operationSummaries.every(summary => typeof summary === 'string')
  )
}

export function saveRejectedRecord(record: RejectedChangeSetRecord): boolean {
  try {
    const existing = loadRejectedRecords()
    storage().setItem(REJECTED_KEY, JSON.stringify([record, ...existing].slice(0, 20)))
    return true
  } catch (error) {
    console.warn('Failed to save rejected record', error)
    return false
  }
}

export function loadRejectedRecords(): RejectedChangeSetRecord[] {
  try {
    const raw = storage().getItem(REJECTED_KEY)
      ?? LEGACY_REJECTED_KEYS.map(key => storage().getItem(key)).find(Boolean)
      ?? ''
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRejectedRecord)
  } catch {
    return []
  }
}

export function downloadCorruptedData(): void {
  try {
    const raw = rawPersistedValue() || legacyRawPersistedValue()
    if (!raw) return
    const blob = new Blob([raw], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `screen-blueprint-studio-corrupted-${new Date().toISOString()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    console.warn('Failed to download corrupted data', error)
  }
}

export function downloadCurrentData(
  revision: number,
  documentData: ProjectDocument,
  effectiveDocument: ProjectDocument,
): void {
  const raw = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      revision,
      document: documentData,
      effectiveDocument,
    },
    null,
    2,
  )
  const blob = new Blob([raw], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `screen-blueprint-studio-unsaved-${new Date().toISOString()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
