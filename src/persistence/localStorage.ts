import type { ProjectDocument } from '../domain/model'
import type { ChangeSet, RejectedChangeSetRecord } from '../domain/collaboration'
import { validateInvariants } from '../domain/invariants'
import { applyCommandWithoutRevision } from '../domain/applyCommand'

const STORAGE_KEY = 'screen-blueprint-studio:v1'
const REJECTED_KEY = 'screen-blueprint-studio:rejected:v1'

export interface PersistedData {
  document: ProjectDocument
  activeScreenId?: string
  activeChangeSet?: ChangeSet
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'success'; document: ProjectDocument; activeChangeSet?: ChangeSet; activeScreenId?: string }
  | { status: 'invalid'; rawData: string; error: string }

const COMMAND_TYPES = new Set([
  'addScreen',
  'updateScreen',
  'removeScreen',
  'setEntryScreen',
  'addComponent',
  'moveComponent',
  'removeComponent',
  'updateComponentSpec',
  'createScreenState',
  'updateScreenState',
  'removeScreenState',
  'connectEvent',
  'removeEvent',
  'bindApiOperation',
  'removeApiOperation',
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
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${path} must be a non-negative integer`)
  }
}

function storage(): Storage {
  return globalThis.localStorage
}

function validateActiveChangeSet(value: unknown, document: ProjectDocument): ChangeSet {
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
  if (
    changeSet.baseRevision !== document.revision ||
    changeSet.baseDocument.revision !== document.revision
  ) {
    throw new Error('activeChangeSet base revision does not match the persisted document')
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
    if (operation.source !== 'human' && operation.source !== 'agent') {
      throw new Error(`activeChangeSet.operations[${index}].source is invalid`)
    }
    if (!isRecord(operation.command) || !COMMAND_TYPES.has(String(operation.command.type))) {
      throw new Error(`activeChangeSet.operations[${index}].command is invalid`)
    }
    preview = applyCommandWithoutRevision(preview, operation.command)
  })

  return changeSet
}

export function saveToStorage(data: PersistedData): boolean {
  try {
    storage().setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch (e) {
    console.warn('Failed to save to localStorage', e)
    return false
  }
}

export function loadFromStorage(): LoadResult {
  let raw = ''
  try {
    raw = storage().getItem(STORAGE_KEY) ?? ''
    if (!raw) return { status: 'empty' }
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !isRecord(parsed.document)) {
      throw new Error('Persisted data must contain a document')
    }
    const data = parsed as unknown as PersistedData
    if (data.document.schemaVersion !== 1) {
      return { status: 'invalid', rawData: raw, error: 'Unsupported schema version' }
    }
    validateInvariants(data.document)
    const activeChangeSet = data.activeChangeSet === undefined
      ? undefined
      : validateActiveChangeSet(data.activeChangeSet, data.document)
    return {
      status: 'success',
      document: data.document,
      activeChangeSet,
      activeScreenId: data.activeScreenId,
    }
  } catch (e) {
    return { status: 'invalid', rawData: raw, error: e instanceof Error ? e.message : String(e) }
  }
}

export function removePersistedDocument(): boolean {
  try {
    storage().removeItem(STORAGE_KEY)
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
    rejectedRecordsRemoved = true
  } catch (error) {
    console.warn('Failed to remove rejected change-set records', error)
  }
  return documentRemoved && rejectedRecordsRemoved
}

// ── Rejected change set records ──────────────────────────────

function isRejectedRecord(value: unknown): value is RejectedChangeSetRecord {
  if (!isRecord(value)) return false
  return (
    typeof value.changeSetId === 'string' &&
    value.changeSetId.length > 0 &&
    typeof value.summary === 'string' &&
    Number.isInteger(value.baseRevision) &&
    (value.baseRevision as number) >= 0 &&
    typeof value.reason === 'string' &&
    typeof value.rejectedAt === 'string' &&
    value.rejectedAt.length > 0 &&
    Number.isInteger(value.operationCount) &&
    (value.operationCount as number) >= 0
  )
}

export function saveRejectedRecord(record: RejectedChangeSetRecord): boolean {
  try {
    const existing = loadRejectedRecords()
    const updated = [record, ...existing].slice(0, 20) // keep last 20
    storage().setItem(REJECTED_KEY, JSON.stringify(updated))
    return true
  } catch (e) {
    console.warn('Failed to save rejected record', e)
    return false
  }
}

export function loadRejectedRecords(): RejectedChangeSetRecord[] {
  try {
    const raw = storage().getItem(REJECTED_KEY)
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
    const raw = storage().getItem(STORAGE_KEY)
    if (!raw) return
    const blob = new Blob([raw], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `screen-blueprint-studio-corrupted-${new Date().toISOString()}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    console.warn('Failed to download corrupted data', error)
  }
}

export function downloadCurrentData(
  documentData: ProjectDocument,
  effectiveDocument: ProjectDocument,
): void {
  const raw = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
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
