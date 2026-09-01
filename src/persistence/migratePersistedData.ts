export interface PersistedMigrationResult {
  value: unknown
  migrated: boolean
}

export function migratePersistedData(value: unknown): PersistedMigrationResult {
  return { value, migrated: false }
}
