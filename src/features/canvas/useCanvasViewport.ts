import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useDndMonitor } from '@dnd-kit/core'
import type { DragStartEvent } from '@dnd-kit/core'
import type { EntityId } from '../../domain/model'
import {
  DEFAULT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  WHEEL_ZOOM_SENSITIVITY,
  ZOOM_STEP,
  autoPanVelocity,
  canAutoPanCanvasDrag,
  classifyCanvasAutoPanStart,
  clampPanForVisibility,
  clampScale,
  computeFitTransform,
  computeInitialFrameTransform,
  isActivatableCanvasTarget,
  isEditableCanvasTarget,
  isPointInsideViewport,
  persistScale,
  resolveInitialScale,
  scaleToPercent,
  zoomAtPoint,
} from './canvasViewportMath'
import type {
  CanvasAutoPanStart,
  Point,
  Rect,
  Size,
  ViewportTransform,
} from './canvasViewportMath'

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

interface PanDragState {
  pointerId: number
  suppressTrailingClick: boolean
  startClientX: number
  startClientY: number
  startPan: Point
  moved: boolean
}

interface UseCanvasViewportOptions {
  activeScreenId: EntityId | null
  selectedComponentId: EntityId | null
}

export interface CanvasViewportControls {
  viewportRef: React.RefObject<HTMLDivElement | null>
  surfaceRef: React.RefObject<HTMLDivElement | null>
  framesRef: React.RefObject<HTMLDivElement | null>
  transformStyle: CSSProperties
  scale: number
  scalePercent: number
  canZoomIn: boolean
  canZoomOut: boolean
  canFitSelection: boolean
  isInitialized: boolean
  isSpacePanMode: boolean
  isPanning: boolean
  zoomIn(): void
  zoomOut(): void
  resetZoom(): void
  fitAll(): void
  fitSelection(): void
  handleViewportPointerDown(event: React.PointerEvent<HTMLDivElement>): void
  /** Call from a click handler; returns true (and clears the flag) when that click was the tail end of a pan drag. */
  consumeSuppressedClick(): boolean
}

function measureLocalRect(node: HTMLElement, surface: HTMLElement, scale: number): Rect {
  const nodeRect = node.getBoundingClientRect()
  const surfaceRect = surface.getBoundingClientRect()
  const safeScale = scale || 1
  return {
    x: (nodeRect.left - surfaceRect.left) / safeScale,
    y: (nodeRect.top - surfaceRect.top) / safeScale,
    width: nodeRect.width / safeScale,
    height: nodeRect.height / safeScale,
  }
}

function measureViewportSize(node: HTMLElement): Size {
  const rect = node.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
}

function isPanBackgroundTarget(target: EventTarget | null, viewport: HTMLElement): boolean {
  if (!(target instanceof Element) || !viewport.contains(target)) return false
  return !target.closest('[data-canvas-frame], [data-component-id], [data-editor-chrome]')
}

function isEditorChromeTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-editor-chrome]'))
}

export function useCanvasViewport({
  activeScreenId,
  selectedComponentId,
}: UseCanvasViewportOptions): CanvasViewportControls {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const framesRef = useRef<HTMLDivElement | null>(null)

  const [transform, setTransform] = useState<ViewportTransform>(() => ({
    scale: resolveInitialScale(browserStorage()),
    pan: { x: 0, y: 0 },
  }))
  const [isSpaceHeld, setSpaceHeld] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  const transformRef = useRef(transform)
  transformRef.current = transform
  const isSpaceHeldRef = useRef(isSpaceHeld)
  isSpaceHeldRef.current = isSpaceHeld
  const selectedComponentIdRef = useRef(selectedComponentId)
  selectedComponentIdRef.current = selectedComponentId

  const panDragRef = useRef<PanDragState | null>(null)
  const suppressClickRef = useRef(false)
  const clickSuppressionFrameRef = useRef<number | null>(null)
  const initializedScreenRef = useRef<EntityId | null>(null)
  const autoPanDragRef = useRef<CanvasAutoPanStart | null>(null)
  const lastPointerRef = useRef<Point | null>(null)
  const autoPanFrameRef = useRef<number | null>(null)

  const fitToRect = useCallback((rect: Rect) => {
    const viewport = viewportRef.current
    if (!viewport) return
    setTransform(computeFitTransform(rect, measureViewportSize(viewport)))
  }, [])

  const fitAll = useCallback(() => {
    const viewport = viewportRef.current
    const surface = surfaceRef.current
    const frames = framesRef.current
    if (!viewport || !surface || !frames) return
    fitToRect(measureLocalRect(frames, surface, transformRef.current.scale))
  }, [fitToRect])

  const fitSelection = useCallback(() => {
    const id = selectedComponentIdRef.current
    const viewport = viewportRef.current
    const surface = surfaceRef.current
    if (!id || !viewport || !surface) return
    const target = surface.querySelector<HTMLElement>(
      `[data-component-id="${CSS.escape(id)}"]`,
    )
    if (!target) {
      fitAll()
      return
    }
    fitToRect(measureLocalRect(target, surface, transformRef.current.scale))
  }, [fitAll, fitToRect])

  const zoomAtViewportCenter = useCallback((nextScale: number) => {
    const viewport = viewportRef.current
    if (!viewport) {
      setTransform(current => ({ ...current, scale: clampScale(nextScale) }))
      return
    }
    const size = measureViewportSize(viewport)
    const anchor: Point = { x: size.width / 2, y: size.height / 2 }
    setTransform(current => zoomAtPoint(current, nextScale, anchor))
  }, [])

  const zoomIn = useCallback(() => {
    zoomAtViewportCenter(transformRef.current.scale + ZOOM_STEP)
  }, [zoomAtViewportCenter])

  const zoomOut = useCallback(() => {
    zoomAtViewportCenter(transformRef.current.scale - ZOOM_STEP)
  }, [zoomAtViewportCenter])

  const resetZoom = useCallback(() => {
    zoomAtViewportCenter(DEFAULT_SCALE)
  }, [zoomAtViewportCenter])

  const consumeSuppressedClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      if (clickSuppressionFrameRef.current !== null) {
        cancelAnimationFrame(clickSuppressionFrameRef.current)
        clickSuppressionFrameRef.current = null
      }
      return true
    }
    return false
  }, [])

  // Keep latest action callbacks available to listeners registered only once (keyboard/wheel).
  const actionsRef = useRef({ zoomIn, zoomOut, resetZoom, fitAll, fitSelection })
  actionsRef.current = { zoomIn, zoomOut, resetZoom, fitAll, fitSelection }

  const initializeScreen = useCallback(() => {
    const viewport = viewportRef.current
    const surface = surfaceRef.current
    const frames = framesRef.current
    const primaryPage = frames?.querySelector<HTMLElement>('[data-canvas-frame="page"]')
    if (!viewport || !surface || !frames || !primaryPage) return false
    const currentScale = transformRef.current.scale
    const next = computeInitialFrameTransform(
      measureLocalRect(frames, surface, currentScale),
      measureLocalRect(primaryPage, surface, currentScale),
      measureViewportSize(viewport),
      currentScale,
    )
    if (!next) return false
    setTransform(next)
    initializedScreenRef.current = activeScreenId
    setIsInitialized(true)
    return true
  }, [activeScreenId])

  // Initial mount and screen switches fit before paint when geometry is ready.
  useLayoutEffect(() => {
    initializedScreenRef.current = null
    if (!initializeScreen()) setIsInitialized(false)
  }, [activeScreenId, initializeScreen])

  // Persist the zoom preference locally (never part of ProjectDocument).
  useLayoutEffect(() => {
    persistScale(browserStorage(), transform.scale)
  }, [transform.scale])

  // Pinch/Cmd/Ctrl+wheel zooms anywhere; ordinary wheel/trackpad gestures pan empty canvas.
  useLayoutEffect(() => {
    const node = viewportRef.current
    if (!node) return
    function handleWheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const rect = node!.getBoundingClientRect()
        const anchor: Point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
        const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY)
        setTransform(current => zoomAtPoint(current, current.scale * factor, anchor))
        return
      }
      if (!isPanBackgroundTarget(event.target, node!)) return
      event.preventDefault()
      const unit = event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? node!.getBoundingClientRect().height
          : 1
      const horizontal = (event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX) * unit
      const vertical = (event.shiftKey ? 0 : event.deltaY) * unit
      setTransform(current => ({
        ...current,
        pan: {
          x: current.pan.x - horizontal,
          y: current.pan.y - vertical,
        },
      }))
    }
    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [])

  // Keyboard shortcuts: Cmd/Ctrl +/-/0 and Shift+1 (fit all) / Shift+2 (fit selection).
  useLayoutEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableCanvasTarget(event.target)) return
      const meta = event.metaKey || event.ctrlKey
      if (meta && (event.code === 'Equal' || event.key === '+' || event.key === '=')) {
        event.preventDefault()
        actionsRef.current.zoomIn()
        return
      }
      if (meta && (event.code === 'Minus' || event.key === '-' || event.key === '_')) {
        event.preventDefault()
        actionsRef.current.zoomOut()
        return
      }
      if (meta && (event.code === 'Digit0' || event.key === '0')) {
        event.preventDefault()
        actionsRef.current.resetZoom()
        return
      }
      if (!meta && event.shiftKey && event.code === 'Digit1') {
        event.preventDefault()
        actionsRef.current.fitAll()
        return
      }
      if (!meta && event.shiftKey && event.code === 'Digit2') {
        event.preventDefault()
        actionsRef.current.fitSelection()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Hold Space to switch pointer drags on the canvas from component D&D to panning.
  useLayoutEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat) return
      if (isEditableCanvasTarget(event.target)) return
      if (!isActivatableCanvasTarget(event.target)) event.preventDefault()
      setSpaceHeld(true)
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== 'Space') return
      setSpaceHeld(false)
    }
    function handleBlur() {
      setSpaceHeld(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  const handleViewportPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    const isMiddleDrag = event.button === 1
    const isSpaceDrag = event.button === 0 &&
      isSpaceHeldRef.current &&
      !isEditorChromeTarget(event.target)
    const isBackgroundDrag = event.button === 0 &&
      viewport !== null &&
      isPanBackgroundTarget(event.target, viewport)
    if (!isMiddleDrag && !isSpaceDrag && !isBackgroundDrag) return
    event.preventDefault()
    panDragRef.current = {
      pointerId: event.pointerId,
      suppressTrailingClick: event.button === 0,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPan: transformRef.current.pan,
      moved: false,
    }
    setIsPanning(true)
  }, [])

  // Track the active pan drag on window so it keeps working even if the pointer leaves the viewport.
  useLayoutEffect(() => {
    if (!isPanning) return
    function handlePointerMove(event: PointerEvent) {
      const drag = panDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const dx = event.clientX - drag.startClientX
      const dy = event.clientY - drag.startClientY
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true
      setTransform(current => ({
        ...current,
        pan: { x: drag.startPan.x + dx, y: drag.startPan.y + dy },
      }))
    }
    function finishPan(event: PointerEvent, mayProduceClick: boolean) {
      const drag = panDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (mayProduceClick && drag.moved && drag.suppressTrailingClick) {
        suppressClickRef.current = true
        if (clickSuppressionFrameRef.current !== null) {
          cancelAnimationFrame(clickSuppressionFrameRef.current)
        }
        clickSuppressionFrameRef.current = requestAnimationFrame(() => {
          suppressClickRef.current = false
          clickSuppressionFrameRef.current = null
        })
      }
      panDragRef.current = null
      setIsPanning(false)
    }
    function handlePointerUp(event: PointerEvent) {
      finishPan(event, true)
    }
    function handlePointerCancel(event: PointerEvent) {
      finishPan(event, false)
    }
    function handleBlur() {
      panDragRef.current = null
      setIsPanning(false)
    }
    window.addEventListener('pointermove', handlePointerMove, { capture: true })
    window.addEventListener('pointerup', handlePointerUp, { capture: true })
    window.addEventListener('pointercancel', handlePointerCancel, { capture: true })
    window.addEventListener('lostpointercapture', handlePointerCancel, { capture: true })
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true })
      window.removeEventListener('pointerup', handlePointerUp, { capture: true })
      window.removeEventListener('pointercancel', handlePointerCancel, { capture: true })
      window.removeEventListener('lostpointercapture', handlePointerCancel, { capture: true })
      window.removeEventListener('blur', handleBlur)
    }
  }, [isPanning])

  useLayoutEffect(() => () => {
    if (clickSuppressionFrameRef.current !== null) {
      cancelAnimationFrame(clickSuppressionFrameRef.current)
    }
  }, [])

  // Custom auto-pan while dragging components: dnd-kit's built-in autoScroll has nothing to
  // scroll now that the viewport clips instead of scrolling, so we translate the pan ourselves.
  const runAutoPanFrame = useCallback(() => {
    autoPanFrameRef.current = null
    if (!autoPanDragRef.current) return
    const viewport = viewportRef.current
    const pointer = lastPointerRef.current
    if (viewport && pointer) {
      const rect = viewport.getBoundingClientRect()
      if (!isPointInsideViewport(pointer, rect)) {
        lastPointerRef.current = null
        return
      }
      const vx = autoPanVelocity(pointer.x - rect.left) - autoPanVelocity(rect.right - pointer.x)
      const vy = autoPanVelocity(pointer.y - rect.top) - autoPanVelocity(rect.bottom - pointer.y)
      if (vx !== 0 || vy !== 0) {
        setTransform(current => ({ ...current, pan: { x: current.pan.x + vx, y: current.pan.y + vy } }))
      }
      autoPanFrameRef.current = requestAnimationFrame(runAutoPanFrame)
    }
  }, [])

  const stopAutoPanFrame = useCallback(() => {
    if (autoPanFrameRef.current !== null) {
      cancelAnimationFrame(autoPanFrameRef.current)
      autoPanFrameRef.current = null
    }
  }, [])

  const resetAutoPan = useCallback(() => {
    autoPanDragRef.current = null
    lastPointerRef.current = null
    stopAutoPanFrame()
  }, [stopAutoPanFrame])

  const updateAutoPanPointer = useCallback((point: Point) => {
    if (!autoPanDragRef.current) return
    const viewport = viewportRef.current
    if (!viewport || !isPointInsideViewport(point, viewport.getBoundingClientRect())) {
      lastPointerRef.current = null
      stopAutoPanFrame()
      return
    }
    lastPointerRef.current = point
    if (autoPanFrameRef.current === null) {
      autoPanFrameRef.current = requestAnimationFrame(runAutoPanFrame)
    }
  }, [runAutoPanFrame, stopAutoPanFrame])

  useLayoutEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = autoPanDragRef.current
      if (
        drag?.sensor !== 'pointer' ||
        (drag.pointerId !== null && drag.pointerId !== event.pointerId)
      ) {
        return
      }
      updateAutoPanPointer({ x: event.clientX, y: event.clientY })
    }
    function handlePointerLost(event: PointerEvent) {
      const drag = autoPanDragRef.current
      if (
        drag?.sensor === 'pointer' &&
        (drag.pointerId === null || drag.pointerId === event.pointerId)
      ) {
        resetAutoPan()
      }
    }
    function matchingTouch(event: TouchEvent) {
      const drag = autoPanDragRef.current
      if (drag?.sensor !== 'touch') return null
      for (const touch of event.touches) {
        if (drag.touchIdentifier === null || touch.identifier === drag.touchIdentifier) {
          return touch
        }
      }
      return null
    }
    function handleTouchMove(event: TouchEvent) {
      const touch = matchingTouch(event)
      if (touch) updateAutoPanPointer({ x: touch.clientX, y: touch.clientY })
    }
    function handleTouchEnd(event: TouchEvent) {
      const drag = autoPanDragRef.current
      if (drag?.sensor !== 'touch') return
      for (const touch of event.changedTouches) {
        if (drag.touchIdentifier === null || touch.identifier === drag.touchIdentifier) {
          resetAutoPan()
          return
        }
      }
    }
    function handleWindowBlur() {
      resetAutoPan()
    }
    window.addEventListener('pointermove', handlePointerMove, { capture: true })
    window.addEventListener('pointerup', handlePointerLost, { capture: true })
    window.addEventListener('pointercancel', handlePointerLost, { capture: true })
    window.addEventListener('lostpointercapture', handlePointerLost, { capture: true })
    window.addEventListener('touchmove', handleTouchMove, { capture: true })
    window.addEventListener('touchend', handleTouchEnd, { capture: true })
    window.addEventListener('touchcancel', handleTouchEnd, { capture: true })
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true })
      window.removeEventListener('pointerup', handlePointerLost, { capture: true })
      window.removeEventListener('pointercancel', handlePointerLost, { capture: true })
      window.removeEventListener('lostpointercapture', handlePointerLost, { capture: true })
      window.removeEventListener('touchmove', handleTouchMove, { capture: true })
      window.removeEventListener('touchend', handleTouchEnd, { capture: true })
      window.removeEventListener('touchcancel', handleTouchEnd, { capture: true })
      window.removeEventListener('blur', handleWindowBlur)
      resetAutoPan()
    }
  }, [resetAutoPan, updateAutoPanPointer])

  const dndMonitorListeners = useMemo(() => ({
    onDragStart({ active, activatorEvent }: DragStartEvent) {
      resetAutoPan()
      const drag = classifyCanvasAutoPanStart(active.id, activatorEvent)
      if (!canAutoPanCanvasDrag(drag)) return
      autoPanDragRef.current = drag
      if (drag.point) updateAutoPanPointer(drag.point)
    },
    onDragEnd() {
      resetAutoPan()
    },
    onDragCancel() {
      resetAutoPan()
    },
  }), [resetAutoPan, updateAutoPanPointer])
  useDndMonitor(dndMonitorListeners)

  // Retry deferred first measurement, then keep user-panned content reachable on pane resize.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const surface = surfaceRef.current
    const frames = framesRef.current
    if (!viewport || !surface || !frames) return
    const observer = new ResizeObserver(() => {
      if (initializedScreenRef.current !== activeScreenId && initializeScreen()) return
      const current = transformRef.current
      const rect = measureLocalRect(frames, surface, current.scale)
      const size = measureViewportSize(viewport)
      const pan = clampPanForVisibility(current, { width: rect.width, height: rect.height }, size)
      if (pan.x !== current.pan.x || pan.y !== current.pan.y) {
        setTransform(prev => ({ ...prev, pan }))
      }
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [activeScreenId, initializeScreen])

  const transformStyle = useMemo<CSSProperties>(() => ({
    transform: `translate(${transform.pan.x}px, ${transform.pan.y}px) scale(${transform.scale})`,
    transformOrigin: '0 0',
  }), [transform])

  return {
    viewportRef,
    surfaceRef,
    framesRef,
    transformStyle,
    scale: transform.scale,
    scalePercent: scaleToPercent(transform.scale),
    canZoomIn: transform.scale < MAX_SCALE - 0.001,
    canZoomOut: transform.scale > MIN_SCALE + 0.001,
    canFitSelection: selectedComponentId !== null,
    isInitialized,
    isSpacePanMode: isSpaceHeld,
    isPanning,
    zoomIn,
    zoomOut,
    resetZoom,
    fitAll,
    fitSelection,
    handleViewportPointerDown,
    consumeSuppressedClick,
  }
}
