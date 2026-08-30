export const RIGHT_PANE_WIDTH_STORAGE_KEY = 'screen-blueprint-studio:right-pane-width:v1'
export const DEFAULT_RIGHT_PANE_WIDTH = 380
export const MIN_RIGHT_PANE_WIDTH = 300

const MAX_VIEWPORT_RATIO = 0.55
const LEFT_PANE_WIDTH = 220
const MIN_CANVAS_WIDTH = 360
const RESIZE_HANDLE_WIDTH = 7

interface PreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface RightPaneWidthBounds {
  min: number
  max: number
}

export function getRightPaneWidthBounds(viewportWidth: number): RightPaneWidthBounds {
  const safeViewportWidth = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0
  const maxByViewport = Math.floor(safeViewportWidth * MAX_VIEWPORT_RATIO)
  const maxWithCanvas = Math.floor(
    safeViewportWidth - LEFT_PANE_WIDTH - MIN_CANVAS_WIDTH - RESIZE_HANDLE_WIDTH,
  )
  return {
    min: MIN_RIGHT_PANE_WIDTH,
    max: Math.max(MIN_RIGHT_PANE_WIDTH, Math.min(maxByViewport, maxWithCanvas)),
  }
}

export function clampRightPaneWidth(width: number, viewportWidth: number): number {
  const { min, max } = getRightPaneWidthBounds(viewportWidth)
  const safeWidth = Number.isFinite(width) ? width : DEFAULT_RIGHT_PANE_WIDTH
  return Math.round(Math.min(max, Math.max(min, safeWidth)))
}

export function resolveInitialRightPaneWidth(
  storage: Pick<PreferenceStorage, 'getItem'> | undefined,
  viewportWidth: number,
): number {
  try {
    const stored = storage?.getItem(RIGHT_PANE_WIDTH_STORAGE_KEY)
    if (stored === null || stored === undefined || stored.trim() === '') {
      return clampRightPaneWidth(DEFAULT_RIGHT_PANE_WIDTH, viewportWidth)
    }
    return clampRightPaneWidth(Number(stored), viewportWidth)
  } catch {
    return clampRightPaneWidth(DEFAULT_RIGHT_PANE_WIDTH, viewportWidth)
  }
}

export function persistRightPaneWidth(
  storage: Pick<PreferenceStorage, 'setItem'> | undefined,
  width: number,
): boolean {
  try {
    storage?.setItem(RIGHT_PANE_WIDTH_STORAGE_KEY, String(Math.round(width)))
    return storage !== undefined
  } catch {
    return false
  }
}

export function rightPaneWidthForKey(
  key: string,
  currentWidth: number,
  viewportWidth: number,
  largeStep = false,
): number | null {
  const { min, max } = getRightPaneWidthBounds(viewportWidth)
  const step = largeStep ? 32 : 8
  if (key === 'ArrowLeft') return clampRightPaneWidth(currentWidth + step, viewportWidth)
  if (key === 'ArrowRight') return clampRightPaneWidth(currentWidth - step, viewportWidth)
  if (key === 'Home') return min
  if (key === 'End') return max
  return null
}
