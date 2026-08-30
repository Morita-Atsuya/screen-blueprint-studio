// Pure geometry/storage helpers for Canvas zoom & pan navigation.
// Kept free of React/DOM state so the math is easy to reason about and reuse
// from the useCanvasViewport hook.

export const MIN_SCALE = 0.25
export const MAX_SCALE = 2
export const DEFAULT_SCALE = 1
export const ZOOM_STEP = 0.25
export const FIT_MARGIN = 48
export const WHEEL_ZOOM_SENSITIVITY = 0.0025
export const AUTO_PAN_EDGE = 56
export const AUTO_PAN_MAX_SPEED = 18
export const MIN_VISIBLE_AFTER_RESIZE = 80

export const CANVAS_ZOOM_STORAGE_KEY = 'screen-blueprint-studio:canvas-zoom:v1'

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

export interface ViewportTransform {
  scale: number
  pan: Point
}

export type CanvasDragSource = 'canvas' | 'tree' | 'palette' | 'unknown'
export type CanvasDragSensor = 'pointer' | 'touch' | 'keyboard' | 'unknown'

export interface CanvasAutoPanStart {
  source: CanvasDragSource
  sensor: CanvasDragSensor
  point: Point | null
  pointerId: number | null
  touchIdentifier: number | null
}

export interface ViewportBounds {
  left: number
  top: number
  right: number
  bottom: number
}

interface PreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_SCALE
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function roundScale(scale: number): number {
  return Math.round(scale * 1000) / 1000
}

export function scaleToPercent(scale: number): number {
  return Math.round(clampScale(scale) * 100)
}

/** Zooms so that `anchor` (a point expressed in viewport-local screen px) stays fixed under the cursor. */
export function zoomAtPoint(
  current: ViewportTransform,
  nextScaleRaw: number,
  anchor: Point,
): ViewportTransform {
  const nextScale = clampScale(nextScaleRaw)
  if (nextScale === current.scale) return current
  const contentX = (anchor.x - current.pan.x) / current.scale
  const contentY = (anchor.y - current.pan.y) / current.scale
  return {
    scale: nextScale,
    pan: {
      x: anchor.x - contentX * nextScale,
      y: anchor.y - contentY * nextScale,
    },
  }
}

/** Computes a scale + pan that centers `target` (unscaled content coordinates) inside `viewport`. */
export function computeFitTransform(
  target: Rect,
  viewport: Size,
  margin = FIT_MARGIN,
): ViewportTransform {
  const availableWidth = Math.max(1, viewport.width - margin * 2)
  const availableHeight = Math.max(1, viewport.height - margin * 2)
  const targetWidth = Math.max(1, target.width)
  const targetHeight = Math.max(1, target.height)
  const scale = clampScale(Math.min(availableWidth / targetWidth, availableHeight / targetHeight))
  return {
    scale,
    pan: {
      x: viewport.width / 2 - (target.x + targetWidth / 2) * scale,
      y: viewport.height / 2 - (target.y + targetHeight / 2) * scale,
    },
  }
}

/** Re-centers `target` inside `viewport` while keeping `scale` fixed (used when switching screens). */
export function centerTransform(target: Rect, viewport: Size, scale: number): ViewportTransform {
  const safeScale = clampScale(scale)
  return {
    scale: safeScale,
    pan: {
      x: viewport.width / 2 - (target.x + target.width / 2) * safeScale,
      y: viewport.height / 2 - (target.y + target.height / 2) * safeScale,
    },
  }
}

function clampAxis(pan: number, scaledSize: number, viewportSize: number, minVisible: number): number {
  const lower = minVisible - scaledSize
  const upper = viewportSize - minVisible
  if (lower <= upper) return Math.min(upper, Math.max(lower, pan))
  return (viewportSize - scaledSize) / 2
}

/** Nudges pan back so at least `minVisible` px of the content stays on screen (e.g. after a pane resize). */
export function clampPanForVisibility(
  transform: ViewportTransform,
  contentSize: Size,
  viewport: Size,
  minVisible = MIN_VISIBLE_AFTER_RESIZE,
): Point {
  return {
    x: clampAxis(transform.pan.x, contentSize.width * transform.scale, viewport.width, minVisible),
    y: clampAxis(transform.pan.y, contentSize.height * transform.scale, viewport.height, minVisible),
  }
}

export function resolveInitialScale(storage: Pick<PreferenceStorage, 'getItem'> | undefined): number {
  try {
    const stored = storage?.getItem(CANVAS_ZOOM_STORAGE_KEY)
    if (stored === null || stored === undefined || stored.trim() === '') return DEFAULT_SCALE
    const parsed = Number(stored)
    return Number.isFinite(parsed) ? clampScale(parsed) : DEFAULT_SCALE
  } catch {
    return DEFAULT_SCALE
  }
}

export function persistScale(storage: Pick<PreferenceStorage, 'setItem'> | undefined, scale: number): boolean {
  try {
    storage?.setItem(CANVAS_ZOOM_STORAGE_KEY, String(roundScale(clampScale(scale))))
    return storage !== undefined
  } catch {
    return false
  }
}

export function isEditableCanvasTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as {
    tagName?: unknown
    isContentEditable?: unknown
    closest?: (selector: string) => unknown
  }
  const tagName = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    element.isContentEditable === true ||
    Boolean(element.closest?.('[contenteditable="true"]'))
  )
}

/** Elements whose native keyboard behavior (e.g. Space to activate) must not be hijacked. */
export function isActivatableCanvasTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as { tagName?: unknown; getAttribute?: (name: string) => string | null }
  const tagName = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
  if (tagName === 'button' || tagName === 'a') return true
  return element.getAttribute?.('role') === 'button'
}

function finitePoint(value: { clientX?: unknown; clientY?: unknown } | undefined): Point | null {
  if (
    !value ||
    typeof value.clientX !== 'number' ||
    !Number.isFinite(value.clientX) ||
    typeof value.clientY !== 'number' ||
    !Number.isFinite(value.clientY)
  ) {
    return null
  }
  return { x: value.clientX, y: value.clientY }
}

function dragSource(activeId: unknown): CanvasDragSource {
  if (typeof activeId !== 'string') return 'unknown'
  if (activeId.startsWith('canvas:')) return 'canvas'
  if (activeId.startsWith('tree:')) return 'tree'
  if (activeId.startsWith('palette:')) return 'palette'
  return 'unknown'
}

/** Classifies the dnd-kit activator without relying on mutable global pointer history. */
export function classifyCanvasAutoPanStart(
  activeId: unknown,
  activatorEvent: unknown,
): CanvasAutoPanStart {
  const source = dragSource(activeId)
  if (!activatorEvent || typeof activatorEvent !== 'object') {
    return {
      source,
      sensor: 'unknown',
      point: null,
      pointerId: null,
      touchIdentifier: null,
    }
  }

  const event = activatorEvent as {
    type?: unknown
    clientX?: unknown
    clientY?: unknown
    pointerId?: unknown
    touches?: ArrayLike<{
      clientX?: unknown
      clientY?: unknown
      identifier?: unknown
    }>
  }
  if (event.type === 'pointerdown') {
    return {
      source,
      sensor: 'pointer',
      point: finitePoint(event),
      pointerId: typeof event.pointerId === 'number' ? event.pointerId : null,
      touchIdentifier: null,
    }
  }
  if (event.type === 'touchstart') {
    const touch = event.touches?.[0]
    return {
      source,
      sensor: 'touch',
      point: finitePoint(touch),
      pointerId: null,
      touchIdentifier: typeof touch?.identifier === 'number' ? touch.identifier : null,
    }
  }
  return {
    source,
    sensor: event.type === 'keydown' ? 'keyboard' : 'unknown',
    point: null,
    pointerId: null,
    touchIdentifier: null,
  }
}

export function canAutoPanCanvasDrag(start: CanvasAutoPanStart): boolean {
  return (
    start.source !== 'unknown' &&
    (start.sensor === 'pointer' || start.sensor === 'touch')
  )
}

export function isPointInsideViewport(point: Point, bounds: ViewportBounds): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  )
}

export function autoPanVelocity(distanceFromEdge: number, edge = AUTO_PAN_EDGE, maxSpeed = AUTO_PAN_MAX_SPEED): number {
  if (distanceFromEdge >= edge) return 0
  const strength = 1 - Math.max(0, distanceFromEdge) / edge
  return strength * maxSpeed
}
