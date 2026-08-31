import { CURRENT_SCHEMA_VERSION } from '../domain/model'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function migrateComponentRecord(components: unknown): void {
  if (!isRecord(components)) return
  for (const component of Object.values(components)) {
    if (!isRecord(component) || component.kind !== 'section') continue
    const config = component.config
    if (!isRecord(config) || config.kind !== 'section') continue
    component.kind = 'container'
    config.kind = 'container'
  }
}

function migrateDocument(document: unknown): void {
  if (!isRecord(document) || document.schemaVersion !== 1) return
  migrateComponentRecord(document.components)
  document.schemaVersion = CURRENT_SCHEMA_VERSION
}

function migrateCommand(command: unknown): void {
  if (!isRecord(command)) return
  if (command.type === 'addComponent' && command.kind === 'section') {
    command.kind = 'container'
    if (isRecord(command.config) && command.config.kind === 'section') {
      command.config.kind = 'container'
    }
    return
  }
  if (command.type === 'pasteComponent' && isRecord(command.snapshot)) {
    migrateComponentRecord(command.snapshot.components)
    return
  }
  if (
    command.type === 'updateComponentSpec' &&
    isRecord(command.patch) &&
    isRecord(command.patch.config) &&
    command.patch.config.kind === 'section'
  ) {
    command.patch.config.kind = 'container'
  }
}

export interface PersistedMigrationResult {
  value: unknown
  migrated: boolean
}

export function migratePersistedData(value: unknown): PersistedMigrationResult {
  if (!isRecord(value) || !isRecord(value.document) || value.document.schemaVersion !== 1) {
    return { value, migrated: false }
  }

  const migrated = structuredClone(value) as UnknownRecord
  migrateDocument(migrated.document)
  if (isRecord(migrated.activeChangeSet)) {
    migrateDocument(migrated.activeChangeSet.baseDocument)
    if (Array.isArray(migrated.activeChangeSet.operations)) {
      for (const operation of migrated.activeChangeSet.operations) {
        if (isRecord(operation)) migrateCommand(operation.command)
      }
    }
  }
  return { value: migrated, migrated: true }
}
