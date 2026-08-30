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

export interface DiscardedActiveChangeSet {
  error: string
  persisted: boolean
}

export type LoadResult =
  | { status: 'empty' }
  | {
      status: 'success'
      document: ProjectDocument
      activeChangeSet?: ChangeSet
      activeScreenId?: string
      discardedActiveChangeSet?: DiscardedActiveChangeSet
    }
  | { status: 'invalid'; rawData: string; error: string }

const COMMAND_TYPES = new Set([
  'addScreen',
  'updateScreen',
  'removeScreen',
  'addComponent',
  'moveComponent',
  'removeComponent',
  'updateComponentSpec',
  'createScreenState',
  'updateScreenState',
  'removeScreenState',
  'connectEvent',
  'updateEvent',
  'removeEvent',
  'bindApiOperation',
  'updateApiOperation',
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

function removeLegacyNullRequestBinding(config: unknown, path: string): void {
  if (
    !isRecord(config) ||
    !Object.prototype.hasOwnProperty.call(config, 'requestBinding')
  ) return
  if (config.requestBinding !== null) {
    throw new Error(`${path}.requestBinding contains unsupported legacy data`)
  }
  delete config.requestBinding
}

function migrateLegacyRequestBindings(document: unknown): void {
  if (!isRecord(document) || !isRecord(document.components)) return
  for (const [componentId, component] of Object.entries(document.components)) {
    if (!isRecord(component)) continue
    removeLegacyNullRequestBinding(
      component.config,
      `document.components.${componentId}.config`,
    )
  }
}

function migrateLegacyChangeSet(value: unknown): void {
  if (!isRecord(value)) return
  migrateLegacyRequestBindings(value.baseDocument)
  if (!Array.isArray(value.operations)) return
  for (const operation of value.operations) {
    if (!isRecord(operation) || !isRecord(operation.command)) continue
    const command = operation.command
    if (command.type === 'addComponent') {
      removeLegacyNullRequestBinding(command.config, 'activeChangeSet addComponent config')
    }
    if (
      command.type === 'updateComponentSpec' &&
      isRecord(command.patch) &&
      isRecord(command.patch.config)
    ) {
      removeLegacyNullRequestBinding(
        command.patch.config,
        'activeChangeSet updateComponentSpec config',
      )
    }
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
  } catch (e) {
    return { status: 'invalid', rawData: raw, error: e instanceof Error ? e.message : String(e) }
  }
  if (!raw) return { status: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
    if (!isRecord(parsed) || !isRecord(parsed.document)) {
      throw new Error('Persisted data must contain a document')
    }
  } catch (e) {
    return { status: 'invalid', rawData: raw, error: e instanceof Error ? e.message : String(e) }
  }

  const data = parsed as unknown as PersistedData
  if (data.document.schemaVersion !== 1) {
    return { status: 'invalid', rawData: raw, error: 'Unsupported schema version' }
  }
  try {
    migrateLegacyRequestBindings(data.document)
    validateInvariants(data.document)
  } catch (e) {
    return { status: 'invalid', rawData: raw, error: e instanceof Error ? e.message : String(e) }
  }

  if (data.activeChangeSet === undefined) {
    return {
      status: 'success',
      document: data.document,
      activeScreenId: data.activeScreenId,
    }
  }

  try {
    migrateLegacyChangeSet(data.activeChangeSet)
    return {
      status: 'success',
      document: data.document,
      activeChangeSet: validateActiveChangeSet(data.activeChangeSet, data.document),
      activeScreenId: data.activeScreenId,
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.warn('Discarding invalid active change set', e)
    const persisted = saveToStorage({
      document: data.document,
      activeScreenId: data.activeScreenId,
    })
    return {
      status: 'success',
      document: data.document,
      activeScreenId: data.activeScreenId,
      discardedActiveChangeSet: { error, persisted },
    }
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
