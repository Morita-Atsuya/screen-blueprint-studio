export const STRUCTURE_TREE_PREFERENCES_STORAGE_KEY = 'screen-blueprint-studio:structure-tree:v1'

export interface StructureTreePreferences {
  collapsedByScreen: Record<string, string[]>
}

const DEFAULT_STRUCTURE_TREE_PREFERENCES: StructureTreePreferences = {
  collapsedByScreen: {},
}

interface PreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

export function resolveInitialStructureTreePreferences(
  storage: Pick<PreferenceStorage, 'getItem'> | undefined,
): StructureTreePreferences {
  try {
    const stored = storage?.getItem(STRUCTURE_TREE_PREFERENCES_STORAGE_KEY)
    if (!stored) return DEFAULT_STRUCTURE_TREE_PREFERENCES
    const parsed = JSON.parse(stored)
    if (!isRecord(parsed) || !isRecord(parsed.collapsedByScreen)) {
      return DEFAULT_STRUCTURE_TREE_PREFERENCES
    }
    const collapsedByScreen: Record<string, string[]> = {}
    for (const [screenId, componentIds] of Object.entries(parsed.collapsedByScreen)) {
      if (isStringArray(componentIds)) {
        collapsedByScreen[screenId] = [...new Set(componentIds)]
      }
    }
    return { collapsedByScreen }
  } catch {
    return DEFAULT_STRUCTURE_TREE_PREFERENCES
  }
}

export function persistStructureTreePreferences(
  storage: Pick<PreferenceStorage, 'setItem'> | undefined,
  preferences: StructureTreePreferences,
): boolean {
  try {
    storage?.setItem(STRUCTURE_TREE_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
    return storage !== undefined
  } catch {
    return false
  }
}
