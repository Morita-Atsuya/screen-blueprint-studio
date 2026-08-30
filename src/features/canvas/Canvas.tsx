import {
  SortableContext,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useAppStore } from '../../app/appStore'
import type {
  ComponentConfig,
  ComponentLayout,
  EntityId,
  ProjectDocument,
  ScreenComponent,
  ScreenState,
} from '../../domain/model'
import { CONTAINER_KINDS } from '../../domain/model'
import { effectiveComponent } from '../../domain/selectors'
import { getOwnEntity } from '../../domain/entityMap'
import { getComponentDisplayLabel } from '../../domain/componentDisplayLabel'
import { useI18n } from '../../i18n/I18nProvider'
import { ComponentDropZone } from '../../dnd/ComponentDropZone'
import { draggableComponentId } from '../../dnd/editorDnd'
import { StateDialog } from './StateDialog'
import { useCanvasViewport } from './useCanvasViewport'
import type { CanvasViewportControls } from './useCanvasViewport'
import styles from './Canvas.module.css'

export function Canvas() {
  const { locale, t } = useI18n()
  const { effectiveDocument, ui, setSelectedComponent, setActiveState } = useAppStore()
  const { activeScreenId, activeStateId, selectedComponentId } = ui
  const [stateDialog, setStateDialog] = useState<'create' | 'edit' | null>(null)
  const [hoveredComponentId, setHoveredComponentId] = useState<EntityId | null>(null)
  const viewport = useCanvasViewport({ activeScreenId, selectedComponentId })

  if (!activeScreenId) {
    return <div className={styles.empty}>{t('canvas.selectScreen')}</div>
  }

  const screen = getOwnEntity(effectiveDocument.screens, activeScreenId)
  if (!screen) return null
  const activeState = activeStateId
    ? getOwnEntity(effectiveDocument.screenStates, activeStateId)
    : undefined
  const activeStateDescription = activeState?.description.trim()
  const activeStateDescriptionId = activeStateDescription
    ? 'active-state-description'
    : undefined

  return (
    <div
      className={styles.root}
      onClick={() => {
        if (viewport.consumeSuppressedClick()) return
        setSelectedComponent(null)
      }}
      onPointerLeave={() => setHoveredComponentId(null)}
    >
      <div className={styles.stateBar}>
        <div className={styles.stateToolbar}>
          <div className={styles.stateTabs}>
            {screen.stateIds.map(stateId => {
              const state = getOwnEntity(effectiveDocument.screenStates, stateId)
              if (!state) return null
              const isActive = activeStateId === stateId
              return (
                <button
                  key={stateId}
                  className={`${styles.stateBtn} ${isActive ? styles.stateBtnActive : ''}`}
                  onClick={event => { event.stopPropagation(); setActiveState(stateId) }}
                  aria-pressed={isActive}
                  aria-describedby={isActive ? activeStateDescriptionId : undefined}
                  title={state.id === screen.defaultStateId ? t('states.defaultLocked') : undefined}
                >
                  {state.name}
                </button>
              )
            })}
          </div>
          <div className={styles.stateActions}>
            {activeState && activeState.id !== screen.defaultStateId ? (
              <button
                type="button"
                className={styles.stateIconBtn}
                onClick={event => {
                  event.stopPropagation()
                  setStateDialog('edit')
                }}
                title={t('states.manage')}
                aria-label={t('states.manageAria', { name: activeState?.name ?? '' })}
              >
                ⋯
              </button>
            ) : null}
            <button
              type="button"
              className={styles.stateIconBtn}
              onClick={event => {
                event.stopPropagation()
                setStateDialog('create')
              }}
              title={t('states.add')}
              aria-label={t('states.add')}
            >
              +
            </button>
          </div>
        </div>
        <div
          className={styles.stateDescriptionSlot}
          aria-hidden={activeStateDescription ? undefined : true}
        >
          {activeStateDescription ? (
            <p
              id={activeStateDescriptionId}
              className={styles.stateDescription}
              title={activeStateDescription}
            >
              {activeStateDescription}
            </p>
          ) : null}
        </div>
      </div>
      <div
        className={styles.wireframe}
        ref={viewport.viewportRef}
        onPointerDown={viewport.handleViewportPointerDown}
        data-pan-ready={viewport.isSpacePanMode || undefined}
        data-panning={viewport.isPanning || undefined}
      >
        <div className={styles.canvasSurface} ref={viewport.surfaceRef} style={viewport.transformStyle}>
          <div className={styles.frames} ref={viewport.framesRef}>
            <CanvasFrame
              componentId={screen.rootComponentId}
              frameKind="page"
              frameIndex={0}
              document={effectiveDocument}
              activeState={activeState}
              selectedComponentId={selectedComponentId}
              hoveredComponentId={hoveredComponentId}
              onSelect={setSelectedComponent}
              onHover={setHoveredComponentId}
              locale={locale}
              t={t}
              viewportScale={viewport.scale}
              spacePanActive={viewport.isSpacePanMode}
              consumeSuppressedClick={viewport.consumeSuppressedClick}
              beginPan={viewport.handleViewportPointerDown}
            />
            {screen.modalComponentIds.map((modalId, modalIndex) => (
              <CanvasFrame
                key={modalId}
                componentId={modalId}
                frameKind="modal"
                frameIndex={modalIndex}
                document={effectiveDocument}
                activeState={activeState}
                selectedComponentId={selectedComponentId}
                hoveredComponentId={hoveredComponentId}
                onSelect={setSelectedComponent}
                onHover={setHoveredComponentId}
                locale={locale}
                t={t}
                viewportScale={viewport.scale}
                spacePanActive={viewport.isSpacePanMode}
                consumeSuppressedClick={viewport.consumeSuppressedClick}
                beginPan={viewport.handleViewportPointerDown}
              />
            ))}
          </div>
        </div>
        <CanvasZoomControls viewport={viewport} t={t} />
      </div>
      {stateDialog ? (
        <StateDialog
          mode={stateDialog}
          screenId={screen.id}
          state={stateDialog === 'edit' ? activeState : undefined}
          onClose={() => setStateDialog(null)}
        />
      ) : null}
    </div>
  )
}

function CanvasZoomControls({
  viewport,
  t,
}: {
  viewport: CanvasViewportControls
  t: ReturnType<typeof useI18n>['t']
}) {
  return (
    <div
      className={styles.zoomControls}
      role="group"
      aria-label={t('canvas.zoom.controlsLabel')}
      data-editor-chrome
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <button
        type="button"
        className={styles.zoomBtn}
        onClick={viewport.zoomOut}
        disabled={!viewport.canZoomOut}
        title={t('canvas.zoom.out')}
        aria-label={t('canvas.zoom.out')}
      >
        −
      </button>
      <button
        type="button"
        className={styles.zoomLevelBtn}
        onClick={viewport.resetZoom}
        title={t('canvas.zoom.reset')}
        aria-label={t('canvas.zoom.level', { percent: viewport.scalePercent })}
      >
        {viewport.scalePercent}%
      </button>
      <button
        type="button"
        className={styles.zoomBtn}
        onClick={viewport.zoomIn}
        disabled={!viewport.canZoomIn}
        title={t('canvas.zoom.in')}
        aria-label={t('canvas.zoom.in')}
      >
        +
      </button>
      <span className={styles.zoomDivider} aria-hidden="true" />
      <button
        type="button"
        className={styles.zoomIconBtn}
        onClick={viewport.fitAll}
        title={t('canvas.zoom.fitAll')}
        aria-label={t('canvas.zoom.fitAll')}
      >
        ⤢
      </button>
      <button
        type="button"
        className={styles.zoomIconBtn}
        onClick={viewport.fitSelection}
        disabled={!viewport.canFitSelection}
        title={t('canvas.zoom.fitSelection')}
        aria-label={t('canvas.zoom.fitSelection')}
      >
        ⊡
      </button>
    </div>
  )
}

interface CanvasComponentProps {
  componentId: EntityId
  document: ProjectDocument
  activeState?: ScreenState
  selectedComponentId: EntityId | null
  hoveredComponentId: EntityId | null
  onSelect(id: EntityId): void
  onHover(id: EntityId): void
  locale: 'ja' | 'en'
  t: ReturnType<typeof useI18n>['t']
  viewportScale: number
  spacePanActive: boolean
  consumeSuppressedClick(): boolean
  beginPan(event: React.PointerEvent<HTMLDivElement>): void
  independentRoot?: boolean
}

interface CanvasFrameProps extends Omit<CanvasComponentProps, 'independentRoot'> {
  frameKind: 'page' | 'modal'
  frameIndex: number
}

function CanvasFrame({
  componentId,
  frameKind,
  frameIndex,
  document,
  activeState,
  selectedComponentId,
  hoveredComponentId,
  onSelect,
  onHover,
  locale,
  t,
  viewportScale,
  spacePanActive,
  consumeSuppressedClick,
  beginPan,
}: CanvasFrameProps) {
  const base = getOwnEntity(document.components, componentId)
  if (!base) return null
  const component = effectiveComponent(base, activeState)
  const screenName = getOwnEntity(document.screens, component.screenId)?.name
  const label = frameKind === 'page'
    ? screenName ?? t('component.page')
    : t('canvas.modalFrameLabel', { number: frameIndex + 1 })
  const hiddenInState = !component.common.visible

  return (
    <section
      className={`${styles.frame} ${frameKind === 'page' ? styles.pageFrame : styles.modalFrame}`}
      data-canvas-frame={frameKind}
      data-frame-component-id={componentId}
    >
      <div className={styles.frameHeader} data-editor-chrome>
        <button
          type="button"
          className={styles.frameLabel}
          onClick={event => { event.stopPropagation(); onSelect(componentId) }}
        >
          {label}
        </button>
        {hiddenInState ? (
          <span className={styles.frameStateBadge}>{t('canvas.hiddenInState')}</span>
        ) : null}
      </div>
      <CanvasComponent
        componentId={componentId}
        document={document}
        activeState={activeState}
        selectedComponentId={selectedComponentId}
        hoveredComponentId={hoveredComponentId}
        onSelect={onSelect}
        onHover={onHover}
        locale={locale}
        t={t}
        viewportScale={viewportScale}
        spacePanActive={spacePanActive}
        consumeSuppressedClick={consumeSuppressedClick}
        beginPan={beginPan}
        independentRoot
      />
    </section>
  )
}

function CanvasComponent({
  componentId,
  document,
  activeState,
  selectedComponentId,
  hoveredComponentId,
  onSelect,
  onHover,
  locale,
  t,
  viewportScale,
  spacePanActive,
  consumeSuppressedClick,
  beginPan,
  independentRoot = false,
}: CanvasComponentProps) {
  const base = getOwnEntity(document.components, componentId)
  const component = base ? effectiveComponent(base, activeState) : undefined
  const displayName = component
    ? getComponentDisplayLabel(component, locale)
    : ''
  const isRoot = base?.parentId === null
  const {
    active,
    attributes,
    listeners,
    isDragging,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: draggableComponentId('canvas', componentId),
    data: base
      ? {
          type: 'component',
          componentId: base.id,
          screenId: base.screenId,
          label: displayName,
        }
      : undefined,
    disabled: { draggable: isRoot, droppable: true },
  })

  if (!component) return null
  if (!component.common.visible && !independentRoot) return null
  const isSelected = selectedComponentId === component.id
  const isHovered = hoveredComponentId === component.id
  const isContainer = CONTAINER_KINDS.includes(component.kind)
  const layout = hasLayout(component.config) ? component.config : null
  const dropOrientation = layout?.layout === 'horizontal'
    ? 'horizontal'
    : layout?.layout === 'grid'
      ? 'grid'
      : 'vertical'
  const sortingStrategy = layout?.layout === 'horizontal'
    ? horizontalListSortingStrategy
    : layout?.layout === 'grid'
      ? rectSortingStrategy
      : verticalListSortingStrategy
  const childrenStyle = layout
    ? {
        '--layout-gap': layoutGap(layout.gap),
        '--layout-columns': layout.columns,
        justifyContent: layout.justify === 'between' ? 'space-between' : layout.justify,
        alignItems: layout.align,
      } as CSSProperties
    : undefined
  const style: CSSProperties = {
    // dnd-kit computes the drag delta in raw screen px; divide by the current zoom scale so the
    // dragged item still tracks the pointer 1:1 once rendered inside the scaled canvas surface.
    transform: transform
      ? `translate3d(${transform.x / viewportScale}px, ${transform.y / viewportScale}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
      : undefined,
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      className={[
        styles.comp,
        !isRoot ? styles.draggable : '',
        isSelected ? styles.selected : '',
        isHovered ? styles.hovered : '',
        isDragging ? styles.dragging : '',
        component.kind === 'button' ? styles.buttonComponent : '',
        independentRoot && !component.common.visible ? styles.rootStateHidden : '',
        component.common.enabled ? '' : styles.componentDisabled,
      ].join(' ')}
      style={style}
      {...(!isRoot ? attributes : {})}
      {...(!isRoot ? listeners : {})}
      aria-label={!isRoot ? t('canvas.dragAria', { label: displayName }) : undefined}
      onClick={event => {
        event.stopPropagation()
        if (consumeSuppressedClick()) return
        onSelect(component.id)
      }}
      onPointerDown={event => {
        event.stopPropagation()
        if (spacePanActive) {
          beginPan(event)
          return
        }
        if (!isRoot) listeners?.onPointerDown?.(event)
      }}
      onTouchStart={event => {
        event.stopPropagation()
        if (spacePanActive) return
        if (!isRoot) listeners?.onTouchStart?.(event)
      }}
      onKeyDown={event => {
        if (active) return
        event.stopPropagation()
        if (!isRoot) listeners?.onKeyDown?.(event)
      }}
      onPointerMove={event => {
        event.stopPropagation()
        if (!isHovered) onHover(component.id)
      }}
      data-component-id={component.id}
      data-editor-hovered={isHovered || undefined}
      data-editor-selected={isSelected || undefined}
      data-component-visible={component.common.visible}
      data-canvas-draggable={!isRoot || undefined}
      data-drag-surface={!isRoot ? 'canvas' : undefined}
      data-drag-component={!isRoot ? component.id : undefined}
    >
      {!independentRoot ? (
        <div className={styles.componentChrome} data-editor-chrome>
          <span className={styles.componentLabel}>{displayName}</span>
        </div>
      ) : null}
      <ComponentView comp={component} t={t} />
      {isContainer && (
        <SortableContext
          items={component.childIds.map(id => draggableComponentId('canvas', id))}
          strategy={sortingStrategy}
        >
          <div
            className={[
              styles.children,
              layout?.layout === 'horizontal' ? styles.horizontalChildren : '',
              layout?.layout === 'grid' ? styles.gridChildren : '',
              layout?.layout === 'horizontal' && layout.wrap ? styles.wrapChildren : '',
            ].join(' ')}
            style={childrenStyle}
            data-layout={layout?.layout}
          >
            {component.childIds.map((childId, index) => (
              <div key={childId} className={styles.childSlot}>
                <ComponentDropZone
                  surface="canvas"
                  parentId={component.id}
                  screenId={component.screenId}
                  position={index}
                  orientation={dropOrientation}
                  label={index === 0
                    ? t('dnd.first', { label: displayName })
                    : t('dnd.position', { position: index + 1 })}
                />
                <CanvasComponent
                  componentId={childId}
                  document={document}
                  activeState={activeState}
                  selectedComponentId={selectedComponentId}
                  hoveredComponentId={hoveredComponentId}
                  onSelect={onSelect}
                  onHover={onHover}
                  locale={locale}
                  t={t}
                  viewportScale={viewportScale}
                  spacePanActive={spacePanActive}
                  consumeSuppressedClick={consumeSuppressedClick}
                  beginPan={beginPan}
                />
              </div>
            ))}
            <ComponentDropZone
              surface="canvas"
              parentId={component.id}
              screenId={component.screenId}
              position={component.childIds.length}
              orientation={dropOrientation}
              edge="end"
              label={t('dnd.end', { label: displayName })}
            />
          </div>
        </SortableContext>
      )}
    </div>
  )
}

function hasLayout(config: ComponentConfig): config is ComponentConfig & ComponentLayout {
  return (
    config.kind === 'page' ||
    config.kind === 'section' ||
    config.kind === 'container' ||
    config.kind === 'modal'
  )
}

function layoutGap(gap: ComponentLayout['gap']): string {
  switch (gap) {
    case 'none': return '0px'
    case 'sm': return '8px'
    case 'md': return '16px'
    case 'lg': return '24px'
  }
}

function ComponentView({
  comp,
  t,
}: {
  comp: ScreenComponent
  t: ReturnType<typeof useI18n>['t']
}) {
  const cfg = comp.config
  switch (cfg.kind) {
    case 'page':
    case 'section':
    case 'container':
      return null
    case 'text': {
      const TextElement = cfg.style === 'heading1'
        ? 'h1'
        : cfg.style === 'heading2'
          ? 'h2'
          : cfg.style === 'heading3'
            ? 'h3'
            : cfg.style === 'caption'
              ? 'small'
              : 'p'
      return (
        <TextElement className={`${styles.textComp} ${styles[cfg.style]}`}>
          {cfg.text}
        </TextElement>
      )
    }
    case 'textInput':
      return (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{cfg.label}{cfg.required && <span className={styles.required}>*</span>}</label>
          <input
            type={cfg.inputType}
            placeholder={cfg.placeholder}
            value={cfg.defaultValue}
            disabled
            readOnly
            className={`${styles.fieldInput} ${styles.previewControl}`}
          />
        </div>
      )
    case 'select':
      return (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{cfg.label}{cfg.required && <span className={styles.required}>*</span>}</label>
          <select
            disabled
            value={cfg.defaultValue}
            className={`${styles.fieldInput} ${styles.previewControl}`}
          >
            <option value="">{t('canvas.selectPlaceholder')}</option>
            {cfg.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      )
    case 'button':
      return (
        <button
          disabled
          className={`${styles.btn} ${styles.previewControl} ${cfg.variant === 'primary' ? styles.btnPrimary : cfg.variant === 'danger' ? styles.btnDanger : styles.btnSecondary}`}
        >
          {cfg.label}
        </button>
      )
    case 'alert':
      return <div className={`${styles.alert} ${cfg.tone === 'info' ? styles.alertInfo : cfg.tone === 'success' ? styles.alertSuccess : cfg.tone === 'warning' ? styles.alertWarning : styles.alertError}`}>{cfg.message}</div>
    case 'modal':
      return null
  }
}
