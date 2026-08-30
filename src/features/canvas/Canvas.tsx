import {
  SortableContext,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useMemo, useState } from 'react'
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
import {
  getChangeSetComponentChanges,
  type ComponentChangeStatus,
} from '../../domain/changeSetComponentChanges'
import { useI18n } from '../../i18n/I18nProvider'
import { ComponentDropZone } from '../../dnd/ComponentDropZone'
import { draggableComponentId } from '../../dnd/editorDnd'
import { StateDialog } from './StateDialog'
import { useCanvasViewport } from './useCanvasViewport'
import { createCanvasComponentPreview } from './componentPreview'
import type { CanvasViewportControls } from './useCanvasViewport'
import { useComponentAddMenu } from '../component-add-menu/ComponentAddMenu'
import type { ComponentAddMenuTrigger } from '../component-add-menu/ComponentAddMenu'
import { ComponentChangeBadge } from '../change-review/ComponentChangeBadge'
import { RemovedComponentGhostList } from '../change-review/RemovedComponentGhostList'
import styles from './Canvas.module.css'

export function Canvas() {
  const { locale, t } = useI18n()
  const {
    effectiveDocument,
    activeChangeSet,
    reviewDraftProtectionIds,
    reviewDraftDocument,
    ui,
    setSelectedComponent,
    setActiveState,
    setRightPanelTab,
  } = useAppStore()
  const { activeScreenId, activeStateId, selectedComponentId } = ui
  const [stateDialog, setStateDialog] = useState<'create' | 'edit' | null>(null)
  const [hoveredComponentId, setHoveredComponentId] = useState<EntityId | null>(null)
  const viewport = useCanvasViewport({ activeScreenId, selectedComponentId })
  const componentAddMenu = useComponentAddMenu()
  const componentChanges = useMemo(
    () => activeChangeSet ? getChangeSetComponentChanges(activeChangeSet) : null,
    [activeChangeSet],
  )

  if (!activeScreenId) {
    return <div className={styles.empty}>{t('canvas.selectScreen')}</div>
  }

  const screen = getOwnEntity(effectiveDocument.screens, activeScreenId) ??
    (reviewDraftProtectionIds.length > 0 && reviewDraftDocument
      ? getOwnEntity(reviewDraftDocument.screens, activeScreenId)
      : undefined)
  if (!screen) return null
  const activeState = activeStateId
    ? getOwnEntity(effectiveDocument.screenStates, activeStateId) ??
      (reviewDraftProtectionIds.length > 0 && reviewDraftDocument
        ? getOwnEntity(reviewDraftDocument.screenStates, activeStateId)
        : undefined)
    : undefined
  const activeStateDescription = activeState?.description.trim()
  const activeStateDescriptionId = activeStateDescription
    ? 'active-state-description'
    : undefined

  return (
    <div
      className={styles.root}
      data-hierarchy-shortcut-scope="canvas"
      tabIndex={-1}
      role="region"
      aria-label={t('canvas.hierarchyShortcutScope')}
      onClick={event => {
        if (viewport.consumeSuppressedClick()) return
        event.currentTarget.focus({ preventScroll: true })
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
                disabled={Boolean(activeChangeSet)}
                onClick={event => {
                  event.stopPropagation()
                  setStateDialog('edit')
                }}
                title={activeChangeSet ? t('changes.editLocked') : t('states.manage')}
                aria-label={t('states.manageAria', { name: activeState?.name ?? '' })}
              >
                ⋯
              </button>
            ) : null}
            <button
              type="button"
              className={styles.stateIconBtn}
              disabled={Boolean(activeChangeSet)}
              onClick={event => {
                event.stopPropagation()
                setStateDialog('create')
              }}
              title={activeChangeSet ? t('changes.editLocked') : t('states.add')}
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
              addMenu={componentAddMenu.trigger}
              componentStatuses={componentChanges?.statuses}
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
                addMenu={componentAddMenu.trigger}
                componentStatuses={componentChanges?.statuses}
              />
            ))}
          </div>
        </div>
        {activeChangeSet && componentChanges ? (
          <RemovedComponentGhostList
            baseDocument={activeChangeSet.baseDocument}
            previewDocument={effectiveDocument}
            removedComponents={componentChanges.removedComponents}
            activeScreenId={activeScreenId}
            surface="canvas"
            onReview={() => setRightPanelTab('changes')}
          />
        ) : null}
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
      {componentAddMenu.menu}
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
  addMenu: ComponentAddMenuTrigger
  componentStatuses?: ReadonlyMap<EntityId, ComponentChangeStatus>
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
  addMenu,
  componentStatuses,
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
          <span className={styles.frameStateBadge} data-frame-state-badge>
            {t('canvas.hiddenInState')}
          </span>
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
        addMenu={addMenu}
        componentStatuses={componentStatuses}
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
  addMenu,
  componentStatuses,
  independentRoot = false,
}: CanvasComponentProps) {
  const reviewLocked = useAppStore(state => Boolean(state.activeChangeSet))
  const base = getOwnEntity(document.components, componentId)
  const component = base ? effectiveComponent(base, activeState) : undefined
  const displayName = component
    ? getComponentDisplayLabel(component, locale)
    : ''
  const changeStatus = componentStatuses?.get(componentId)
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
    disabled: { draggable: isRoot || reviewLocked, droppable: true },
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
      {...(!isRoot && !reviewLocked ? attributes : {})}
      {...(!isRoot && !reviewLocked ? listeners : {})}
      tabIndex={isRoot || reviewLocked ? -1 : 0}
      aria-label={isRoot || reviewLocked ? displayName : t('canvas.dragAria', { label: displayName })}
      title={reviewLocked && !isRoot ? t('changes.editLocked') : undefined}
      onClick={event => {
        event.stopPropagation()
        if (consumeSuppressedClick()) return
        event.currentTarget
          .closest<HTMLElement>('[data-hierarchy-shortcut-scope="canvas"]')
          ?.focus({ preventScroll: true })
        onSelect(component.id)
      }}
      onContextMenu={event => {
        onSelect(component.id)
        addMenu.openFromPointer(event, component.id)
      }}
      onPointerDown={event => {
        event.stopPropagation()
        if (spacePanActive) {
          beginPan(event)
          return
        }
        if (!isRoot && !reviewLocked) listeners?.onPointerDown?.(event)
      }}
      onTouchStart={event => {
        event.stopPropagation()
        if (spacePanActive) return
        if (!isRoot && !reviewLocked) listeners?.onTouchStart?.(event)
      }}
      onKeyDown={event => {
        if (addMenu.openFromKeyboard(event, component.id)) {
          onSelect(component.id)
          return
        }
        if (active) return
        event.stopPropagation()
        if (!isRoot && !reviewLocked) listeners?.onKeyDown?.(event)
      }}
      onPointerMove={event => {
        event.stopPropagation()
        if (!isHovered) onHover(component.id)
      }}
      data-component-id={component.id}
      data-editor-hovered={isHovered || undefined}
      data-editor-selected={isSelected || undefined}
      data-component-visible={component.common.visible}
      data-canvas-draggable={!isRoot && !reviewLocked || undefined}
      data-drag-surface={!isRoot && !reviewLocked ? 'canvas' : undefined}
      data-drag-component={!isRoot && !reviewLocked ? component.id : undefined}
      data-component-change={changeStatus}
    >
      {changeStatus ? (
        <span className={styles.componentChangeBadge} data-editor-chrome>
          <ComponentChangeBadge
            status={changeStatus}
            label={displayName}
            onActivate={() => onSelect(component.id)}
          />
        </span>
      ) : null}
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
                  addMenu={addMenu}
                  componentStatuses={componentStatuses}
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
  const preview = createCanvasComponentPreview(comp.config)
  switch (preview.kind) {
    case 'page':
    case 'section':
    case 'container':
      return null
    case 'text': {
      const TextElement = preview.element
      return (
        <TextElement className={`${styles.textComp} ${styles[preview.style]}`}>
          {preview.text}
        </TextElement>
      )
    }
    case 'textInput':
      return (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{preview.label}{preview.required && <span className={styles.required}>*</span>}</label>
          <input
            type={preview.inputType}
            placeholder={preview.placeholder}
            value={preview.value}
            disabled
            readOnly
            className={`${styles.fieldInput} ${styles.previewControl}`}
          />
        </div>
      )
    case 'select':
      return (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{preview.label}{preview.required && <span className={styles.required}>*</span>}</label>
          <select
            disabled
            value={preview.value}
            className={`${styles.fieldInput} ${styles.previewControl}`}
          >
            <option value="">{t('canvas.selectPlaceholder')}</option>
            {preview.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      )
    case 'button':
      return (
        <button
          disabled
          className={`${styles.btn} ${styles.previewControl} ${preview.variant === 'primary' ? styles.btnPrimary : preview.variant === 'danger' ? styles.btnDanger : styles.btnSecondary}`}
        >
          {preview.label}
        </button>
      )
    case 'alert':
      return <div className={`${styles.alert} ${preview.tone === 'info' ? styles.alertInfo : preview.tone === 'success' ? styles.alertSuccess : preview.tone === 'warning' ? styles.alertWarning : styles.alertError}`}>{preview.message}</div>
    case 'modal':
      return null
  }
}
