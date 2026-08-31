export const LEFT_PANE_WIDTH_STORAGE_KEY = 'screen-blueprint-studio:left-pane-width:v1'
export const RIGHT_PANE_WIDTH_STORAGE_KEY = 'screen-blueprint-studio:right-pane-width:v1'

export const DEFAULT_LEFT_PANE_WIDTH = 220
export const MIN_LEFT_PANE_WIDTH = 180
export const MAX_LEFT_PANE_WIDTH = 480
export const DEFAULT_RIGHT_PANE_WIDTH = 380
export const MIN_RIGHT_PANE_WIDTH = 300

export const PANE_RESIZE_HANDLE_WIDTH = 7
export const MIN_EDITOR_WIDTH = 360
export const STACKED_PANE_MAX_WIDTH = 899

const MAX_RIGHT_VIEWPORT_RATIO = 0.55

interface PreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface PaneWidthBounds {
  min: number
  max: number
}

export interface ResolvedPaneWidths {
  left: number
  right: number
}

function safeViewportWidth(viewportWidth: number): number {
  return Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0
}

function clamp(width: number, bounds: PaneWidthBounds, fallback: number): number {
  const safeWidth = Number.isFinite(width) ? width : fallback
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, safeWidth)))
}

function preferredLeftPaneWidth(width: number): number {
  return clamp(
    width,
    { min: MIN_LEFT_PANE_WIDTH, max: MAX_LEFT_PANE_WIDTH },
    DEFAULT_LEFT_PANE_WIDTH,
  )
}

function preferredRightPaneWidth(width: number): number {
  const safeWidth = Number.isFinite(width) ? width : DEFAULT_RIGHT_PANE_WIDTH
  return Math.round(Math.max(MIN_RIGHT_PANE_WIDTH, safeWidth))
}

export function getLeftPaneWidthBounds(
  viewportWidth: number,
  rightPaneWidth: number,
): PaneWidthBounds {
  const maxWithEditor = Math.floor(
    safeViewportWidth(viewportWidth) -
      rightPaneWidth -
      MIN_EDITOR_WIDTH -
      PANE_RESIZE_HANDLE_WIDTH * 2,
  )
  return {
    min: MIN_LEFT_PANE_WIDTH,
    max: Math.max(
      MIN_LEFT_PANE_WIDTH,
      Math.min(MAX_LEFT_PANE_WIDTH, maxWithEditor),
    ),
  }
}

export function getRightPaneWidthBounds(
  viewportWidth: number,
  leftPaneWidth: number,
): PaneWidthBounds {
  const safeWidth = safeViewportWidth(viewportWidth)
  const maxByViewport = Math.floor(safeWidth * MAX_RIGHT_VIEWPORT_RATIO)
  const maxWithEditor = Math.floor(
    safeWidth -
      leftPaneWidth -
      MIN_EDITOR_WIDTH -
      PANE_RESIZE_HANDLE_WIDTH * 2,
  )
  return {
    min: MIN_RIGHT_PANE_WIDTH,
    max: Math.max(
      MIN_RIGHT_PANE_WIDTH,
      Math.min(maxByViewport, maxWithEditor),
    ),
  }
}

export function resolvePaneWidths(
  preferredLeftWidth: number,
  preferredRightWidth: number,
  viewportWidth: number,
): ResolvedPaneWidths {
  let left = preferredLeftPaneWidth(preferredLeftWidth)
  let right = preferredRightPaneWidth(preferredRightWidth)
  if (safeViewportWidth(viewportWidth) <= STACKED_PANE_MAX_WIDTH) {
    return { left, right }
  }

  right = clamp(
    right,
    getRightPaneWidthBounds(viewportWidth, left),
    DEFAULT_RIGHT_PANE_WIDTH,
  )
  left = clamp(
    left,
    getLeftPaneWidthBounds(viewportWidth, right),
    DEFAULT_LEFT_PANE_WIDTH,
  )
  right = clamp(
    right,
    getRightPaneWidthBounds(viewportWidth, left),
    DEFAULT_RIGHT_PANE_WIDTH,
  )
  return { left, right }
}

export function clampLeftPaneWidth(
  width: number,
  viewportWidth: number,
  rightPaneWidth: number,
): number {
  return clamp(
    width,
    getLeftPaneWidthBounds(viewportWidth, rightPaneWidth),
    DEFAULT_LEFT_PANE_WIDTH,
  )
}

export function clampRightPaneWidth(
  width: number,
  viewportWidth: number,
  leftPaneWidth: number,
): number {
  return clamp(
    width,
    getRightPaneWidthBounds(viewportWidth, leftPaneWidth),
    DEFAULT_RIGHT_PANE_WIDTH,
  )
}

function resolveInitialPaneWidth(
  storage: Pick<PreferenceStorage, 'getItem'> | undefined,
  storageKey: string,
  fallback: number,
  normalize: (width: number) => number,
): number {
  try {
    const stored = storage?.getItem(storageKey)
    if (stored === null || stored === undefined || stored.trim() === '') return fallback
    return normalize(Number(stored))
  } catch {
    return fallback
  }
}

export function resolveInitialLeftPaneWidth(
  storage: Pick<PreferenceStorage, 'getItem'> | undefined,
): number {
  return resolveInitialPaneWidth(
    storage,
    LEFT_PANE_WIDTH_STORAGE_KEY,
    DEFAULT_LEFT_PANE_WIDTH,
    preferredLeftPaneWidth,
  )
}

export function resolveInitialRightPaneWidth(
  storage: Pick<PreferenceStorage, 'getItem'> | undefined,
): number {
  return resolveInitialPaneWidth(
    storage,
    RIGHT_PANE_WIDTH_STORAGE_KEY,
    DEFAULT_RIGHT_PANE_WIDTH,
    preferredRightPaneWidth,
  )
}

export function persistPaneWidth(
  storage: Pick<PreferenceStorage, 'setItem'> | undefined,
  storageKey: string,
  width: number,
): boolean {
  try {
    storage?.setItem(storageKey, String(Math.round(width)))
    return storage !== undefined
  } catch {
    return false
  }
}

export function paneWidthForKey(
  side: 'left' | 'right',
  key: string,
  currentWidth: number,
  bounds: PaneWidthBounds,
  largeStep = false,
): number | null {
  const step = largeStep ? 32 : 8
  if (key === 'Home') return bounds.min
  if (key === 'End') return bounds.max
  if (side === 'left') {
    if (key === 'ArrowLeft') return clamp(currentWidth - step, bounds, currentWidth)
    if (key === 'ArrowRight') return clamp(currentWidth + step, bounds, currentWidth)
  } else {
    if (key === 'ArrowLeft') return clamp(currentWidth + step, bounds, currentWidth)
    if (key === 'ArrowRight') return clamp(currentWidth - step, bounds, currentWidth)
  }
  return null
}
