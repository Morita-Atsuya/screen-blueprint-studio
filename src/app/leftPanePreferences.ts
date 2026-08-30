export const LEFT_PANE_SECTIONS_STORAGE_KEY = 'screen-blueprint-studio:left-pane-sections:v1'

export interface LeftPaneSectionState {
  screensExpanded: boolean
  paletteExpanded: boolean
}

export const DEFAULT_LEFT_PANE_SECTION_STATE: LeftPaneSectionState = {
  screensExpanded: true,
  paletteExpanded: false,
}

interface PreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function resolveInitialLeftPaneSectionState(
  storage: Pick<PreferenceStorage, 'getItem'> | undefined,
): LeftPaneSectionState {
  try {
    const stored = storage?.getItem(LEFT_PANE_SECTIONS_STORAGE_KEY)
    if (!stored) return DEFAULT_LEFT_PANE_SECTION_STATE
    const parsed = JSON.parse(stored) as Partial<LeftPaneSectionState>
    return {
      screensExpanded: isBoolean(parsed.screensExpanded)
        ? parsed.screensExpanded
        : DEFAULT_LEFT_PANE_SECTION_STATE.screensExpanded,
      paletteExpanded: isBoolean(parsed.paletteExpanded)
        ? parsed.paletteExpanded
        : DEFAULT_LEFT_PANE_SECTION_STATE.paletteExpanded,
    }
  } catch {
    return DEFAULT_LEFT_PANE_SECTION_STATE
  }
}

export function persistLeftPaneSectionState(
  storage: Pick<PreferenceStorage, 'setItem'> | undefined,
  state: LeftPaneSectionState,
): boolean {
  try {
    storage?.setItem(LEFT_PANE_SECTIONS_STORAGE_KEY, JSON.stringify(state))
    return storage !== undefined
  } catch {
    return false
  }
}
