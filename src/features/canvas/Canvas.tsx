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
  ComponentPlacement,
  ComponentSizing,
  DefinitionComponentConfig,
  EntityId,
  PlacementInset,
  ProjectDocument,
  ScreenState,
} from '../../domain/model'
import { CONTAINER_KINDS } from '../../domain/model'
import { effectiveComponent, type EffectiveScreenComponent } from '../../domain/selectors'
import { getOwnEntity } from '../../domain/entityMap'
import { getComponentDisplayLabel } from '../../domain/componentDisplayLabel'
import {
  collectionItemNodeSelection,
  resolvedDefinitionNodeSelection,
  selectedScreenComponentId,
  selectionScreenComponentId,
} from '../../domain/editorSelection'
import { componentTargetRefKey } from '../../domain/componentTargets'
import {
  getChangeSetComponentChanges,
  type ComponentChangeStatus,
} from '../../domain/changeSetComponentChanges'
import { useI18n } from '../../i18n/I18nProvider'
import { ComponentDropZone } from '../../dnd/ComponentDropZone'
import { draggableComponentId } from '../../dnd/editorDnd'
import { StateDialog } from './StateDialog'
import { useCanvasViewport } from './useCanvasViewport'
import { createCanvasComponentPreview, resolveImagePreviewStatus } from './componentPreview'
import type { CanvasViewportControls } from './useCanvasViewport'
import { useComponentAddMenu } from '../component-add-menu/ComponentAddMenu'
import type { ComponentAddMenuTrigger } from '../component-add-menu/ComponentAddMenu'
import { ComponentChangeBadge } from '../change-review/ComponentChangeBadge'
import { RemovedComponentGhostList } from '../change-review/RemovedComponentGhostList'
import {
  resolveScreenNodes,
  type ResolveScreenNodesResult,
  type ResolvedRuntimeNode,
} from '../../domain/definitionResolver'
import styles from './Canvas.module.css'

export function Canvas() {
  const { locale, t } = useI18n()
  const {
    effectiveDocument,
    activeChangeSet,
    reviewDraftProtectionIds,
    reviewDraftDocument,
    ui,
    selectScreenComponent,
    setActiveState,
    setRightPanelTab,
  } = useAppStore()
  const { activeScreenId, activeStateId } = ui
  const selectedComponentId = ui.selection
    ? selectionScreenComponentId(ui.selection)
    : null
  const viewportSelectedComponentId = selectedScreenComponentId(ui.selection)
  const [stateDialog, setStateDialog] = useState<'create' | 'edit' | null>(null)
  const [hoveredComponentId, setHoveredComponentId] = useState<EntityId | null>(null)
  const viewport = useCanvasViewport({
    activeScreenId,
    selectedComponentId: viewportSelectedComponentId,
  })
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
    ? getOwnEntity(effectiveDocument.screenScenarios, activeStateId) ??
      (reviewDraftProtectionIds.length > 0 && reviewDraftDocument
        ? getOwnEntity(reviewDraftDocument.screenScenarios, activeStateId)
        : undefined)
    : undefined
  const activeStateDescription = activeState?.description.trim() || screen.baseDescription.trim()
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
        selectScreenComponent(null)
      }}
      onPointerLeave={() => setHoveredComponentId(null)}
    >
      <div className={styles.stateBar} data-state-bar>
        <div className={styles.stateToolbar} data-state-toolbar>
          <div className={styles.stateTabs} data-state-tabs>
            <button
              className={`${styles.stateBtn} ${activeStateId === null ? styles.stateBtnActive : ''}`}
              onClick={event => { event.stopPropagation(); setActiveState(null) }}
              aria-pressed={activeStateId === null}
              aria-describedby={activeStateId === null ? activeStateDescriptionId : undefined}
              data-state-id="base"
            >
              {t('behavior.clearScenario')}
            </button>
            {screen.scenarioIds.map(stateId => {
              const state = getOwnEntity(effectiveDocument.screenScenarios, stateId)
              if (!state) return null
              const isActive = activeStateId === stateId
              return (
                <button
                  key={stateId}
                  className={`${styles.stateBtn} ${isActive ? styles.stateBtnActive : ''}`}
                  onClick={event => { event.stopPropagation(); setActiveState(stateId) }}
                  aria-pressed={isActive}
                  aria-describedby={isActive ? activeStateDescriptionId : undefined}
                  data-state-id={state.id}
                >
                  {state.name}
                </button>
              )
            })}
          </div>
          <div className={styles.stateActions} data-state-actions>
            <button
              type="button"
              className={styles.stateIconBtn}
              disabled={!activeState || Boolean(activeChangeSet)}
              onClick={event => {
                event.stopPropagation()
                setStateDialog('edit')
              }}
              title={
                activeChangeSet
                  ? t('changes.editLocked')
                  : activeState
                    ? t('states.manage')
                    : t('states.defaultLocked')
              }
              aria-label={t('states.manageAria', {
                name: activeState?.name ?? t('behavior.defaultState'),
              })}
              data-state-manage
            >
              ⋯
            </button>
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
              data-state-add
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
        onPointerDownCapture={viewport.handleViewportPointerDown}
        data-canvas-viewport
        data-pan-ready={viewport.isSpacePanMode || undefined}
        data-panning={viewport.isPanning || undefined}
      >
        <div
          className={styles.canvasSurface}
          ref={viewport.surfaceRef}
          style={viewport.transformStyle}
          data-canvas-surface
          data-viewport-initialized={viewport.isInitialized}
        >
          <div className={styles.frames} ref={viewport.framesRef} data-canvas-frames>
            <CanvasFrame
              componentId={screen.rootComponentId}
              frameKind="page"
              frameIndex={0}
              document={effectiveDocument}
              activeState={activeState}
              selectedComponentId={selectedComponentId}
              hoveredComponentId={hoveredComponentId}
              onSelect={selectScreenComponent}
              onHover={setHoveredComponentId}
              locale={locale}
              t={t}
              viewportScale={viewport.scale}
              spacePanActive={viewport.isSpacePanMode}
              consumeSuppressedClick={viewport.consumeSuppressedClick}
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
                onSelect={selectScreenComponent}
                onHover={setHoveredComponentId}
                locale={locale}
                t={t}
                viewportScale={viewport.scale}
                spacePanActive={viewport.isSpacePanMode}
                consumeSuppressedClick={viewport.consumeSuppressedClick}
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
      title={t('canvas.panHint')}
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
  addMenu: ComponentAddMenuTrigger
  componentStatuses?: ReadonlyMap<EntityId, ComponentChangeStatus>
  resolvedScreen?: ResolveScreenNodesResult
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
  addMenu,
  componentStatuses,
}: CanvasFrameProps) {
  const base = getOwnEntity(document.components, componentId)
  if (!base) return null
  const component = effectiveComponent(document, base, activeState)
  const projected = collectFrameProjections(document, componentId, activeState)
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
      <div
        className={styles.framePreviewShell}
        data-owning-frame-id={componentId}
        data-owning-frame-kind={frameKind}
        data-frame-hidden={!component.common.visible || undefined}
      >
        <div className={styles.screenScrollport} data-frame-scrollport>
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
            addMenu={addMenu}
            componentStatuses={componentStatuses}
            resolvedScreen={projected.resolved}
            independentRoot
          />
        </div>
        <div className={`${styles.frameProjectionLayer} ${styles.stickyLayer}`} data-placement-layer="sticky">
          {projected.sticky.map(projectedId => (
            <ProjectedCanvasComponent
              key={projectedId}
              componentId={projectedId}
              owningFrameId={componentId}
              layer="sticky"
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
              addMenu={addMenu}
              componentStatuses={componentStatuses}
              resolvedScreen={projected.resolved}
            />
          ))}
          {projected.resolvedSticky.map(runtimeId => (
            <ProjectedResolvedCanvasNode
              key={runtimeId}
              runtimeId={runtimeId}
              owningFrameId={componentId}
              layer="sticky"
              resolved={projected.resolved}
              document={document}
              t={t}
              locale={locale}
            />
          ))}
        </div>
        <div className={`${styles.frameProjectionLayer} ${styles.viewportLayer}`} data-placement-layer="viewport">
          {projected.viewport.map(projectedId => (
            <ProjectedCanvasComponent
              key={projectedId}
              componentId={projectedId}
              owningFrameId={componentId}
              layer="viewport"
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
              addMenu={addMenu}
              componentStatuses={componentStatuses}
              resolvedScreen={projected.resolved}
            />
          ))}
          {projected.resolvedViewport.map(runtimeId => (
            <ProjectedResolvedCanvasNode
              key={runtimeId}
              runtimeId={runtimeId}
              owningFrameId={componentId}
              layer="viewport"
              resolved={projected.resolved}
              document={document}
              t={t}
              locale={locale}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function collectFrameProjections(
  document: ProjectDocument,
  rootComponentId: EntityId,
  activeState?: ScreenState,
): {
  sticky: EntityId[]
  viewport: EntityId[]
  resolvedSticky: string[]
  resolvedViewport: string[]
  resolved: ResolveScreenNodesResult
} {
  const rootComponent = getOwnEntity(document.components, rootComponentId)
  const resolved = resolveScreenNodes(
    document,
    rootComponent?.screenId ?? '',
    activeState?.id ?? null,
  )
  const result = {
    sticky: [] as EntityId[],
    viewport: [] as EntityId[],
    resolvedSticky: [] as string[],
    resolvedViewport: [] as string[],
    resolved,
  }
  const visit = (componentId: EntityId, isRoot: boolean) => {
    const base = getOwnEntity(document.components, componentId)
    if (!base) return
    const component = effectiveComponent(document, base, activeState)
    if (!isRoot && !component.common.visible) return
    if (!isRoot && component.placement.mode === 'sticky') result.sticky.push(component.id)
    if (!isRoot && component.placement.mode === 'viewport') result.viewport.push(component.id)
    component.childIds.forEach(childId => visit(childId, false))
  }
  visit(rootComponentId, true)
  for (const node of resolved.orderedNodes) {
    if (
      node.instanceId === null ||
      (node.instanceBoundary.isBoundaryRoot && node.instanceBoundary.depth === 1) ||
      owningFrameId(document, node.instanceId) !== rootComponentId
    ) {
      continue
    }
    if (node.placement.mode === 'sticky') result.resolvedSticky.push(node.id)
    if (node.placement.mode === 'viewport') result.resolvedViewport.push(node.id)
  }
  return result
}

type ProjectionLayer = 'sticky' | 'viewport' | 'overlay'
type PlacementStyle = CSSProperties & {
  '--placement-inset'?: string
  '--placement-inset-x'?: string
  '--placement-inset-y'?: string
}

function sizingToken(token: ComponentSizing['minWidth']): string | undefined {
  switch (token) {
    case 'none': return undefined
    case 'xs': return '160px'
    case 'sm': return '240px'
    case 'md': return '320px'
    case 'lg': return '480px'
    case 'xl': return '640px'
  }
}

function sizingStyle(
  sizing: ComponentSizing,
  context: 'flow' | 'projection',
): CSSProperties {
  const maxWidth = sizingToken(sizing.maxWidth)
  const style: CSSProperties = {
    width: sizing.inlineSize === 'fill'
      ? '100%'
      : sizing.inlineSize === 'content'
        ? 'fit-content'
        : 'auto',
    minWidth: sizingToken(sizing.minWidth),
    maxWidth: context === 'projection'
      ? maxWidth
        ? `min(${maxWidth}, calc(100% - 2 * var(--placement-inset-x, var(--placement-inset, 0px))))`
        : undefined
      : maxWidth ?? '100%',
  }
  if (context === 'flow') {
    style.gridColumn = `span ${sizing.gridSpan}`
    style.flexGrow = sizing.grow
    style.flexShrink = sizing.shrink === 'allow' ? 1 : 0
    if (sizing.grow > 0) style.flexBasis = 0
  }
  return style
}

function placementInset(token: PlacementInset): string {
  switch (token) {
    case 'none': return '0px'
    case 'xs': return '4px'
    case 'sm': return '8px'
    case 'md': return '16px'
    case 'lg': return '24px'
  }
}

function owningFrameId(document: ProjectDocument, componentId: EntityId): EntityId {
  let component = getOwnEntity(document.components, componentId)
  const visited = new Set<EntityId>()
  while (component?.parentId) {
    if (visited.has(component.id)) break
    visited.add(component.id)
    component = getOwnEntity(document.components, component.parentId)
  }
  return component?.id ?? componentId
}

function projectionStyle(
  placement: ComponentPlacement,
  sizing: ComponentSizing,
): PlacementStyle {
  const sizingProperties = sizingStyle(sizing, 'projection')
  if (placement.mode === 'sticky') {
    return { ...sizingProperties, '--placement-inset': placementInset(placement.inset) }
  }
  if (placement.mode === 'overlay' || placement.mode === 'viewport') {
    return {
      ...sizingProperties,
      '--placement-inset-x': placementInset(placement.insetX),
      '--placement-inset-y': placementInset(placement.insetY),
    }
  }
  return sizingProperties
}

function ProjectedCanvasComponent({
  componentId,
  owningFrameId,
  layer,
  ...props
}: Omit<CanvasComponentProps, 'independentRoot'> & {
  owningFrameId: EntityId
  layer: ProjectionLayer
}) {
  const component = getOwnEntity(props.document.components, componentId)
  const placement = component?.placement
  if (!component || !placement || placement.mode === 'flow') return null
  const parent = component.parentId
    ? getOwnEntity(props.document.components, component.parentId)
    : undefined
  const effectiveParent = parent ? effectiveComponent(props.document, parent, props.activeState) : undefined
  const parentLayout = effectiveParent && hasLayout(effectiveParent.config)
    ? effectiveParent.config
    : undefined
  const orientation = parentLayout?.layout === 'horizontal'
    ? 'horizontal'
    : parentLayout?.layout === 'grid'
      ? 'grid'
      : 'vertical'
  const position = parent ? (parent.childIds as readonly string[]).indexOf(component.id) : -1
  const parentLabel = effectiveParent
    ? getComponentDisplayLabel(effectiveParent, props.locale)
    : ''
  return (
    <div
      className={styles.projectionItem}
      style={projectionStyle(placement, component.sizing)}
      data-placement-projection={layer}
      data-placement-anchor={
        placement.mode === 'overlay' || placement.mode === 'viewport'
          ? placement.anchor
          : undefined
      }
      data-placement-edge={placement.mode === 'sticky' ? placement.edge : undefined}
      data-owning-frame-id={owningFrameId}
    >
      {parent && position >= 0 ? (
        <ComponentDropZone
          surface="canvas"
          parentId={parent.id}
          screenId={component.screenId}
          position={position}
          orientation={orientation}
          label={position === 0
            ? props.t('dnd.first', { label: parentLabel })
            : props.t('dnd.position', { position: position + 1 })}
        />
      ) : null}
      <CanvasComponent componentId={componentId} {...props} />
    </div>
  )
}

function ProjectedResolvedCanvasNode({
  runtimeId,
  owningFrameId,
  layer,
  resolved,
  document,
  locale,
  t,
  definitionSelection,
}: {
  runtimeId: string
  owningFrameId: EntityId
  layer: 'sticky' | 'viewport'
  resolved: ResolveScreenNodesResult
  document: ProjectDocument
  locale: 'ja' | 'en'
  t: ReturnType<typeof useI18n>['t']
  definitionSelection?: DefinitionPreviewSelection
}) {
  const node = resolved.nodesById[runtimeId]
  if (!node || node.placement.mode === 'flow' || node.placement.mode === 'overlay') return null
  return (
    <div
      className={styles.projectionItem}
      style={projectionStyle(node.placement, node.sizing)}
      data-placement-projection={layer}
      data-placement-anchor={
        node.placement.mode === 'viewport' ? node.placement.anchor : undefined
      }
      data-placement-edge={
        node.placement.mode === 'sticky' ? node.placement.edge : undefined
      }
      data-owning-frame-id={owningFrameId}
    >
      <ResolvedCanvasNode
        runtimeId={runtimeId}
        resolved={resolved}
        document={document}
        locale={locale}
        t={t}
        definitionSelection={definitionSelection}
      />
    </div>
  )
}

function resolvedNodeLabel(node: ResolvedRuntimeNode, locale: 'ja' | 'en'): string {
  return getComponentDisplayLabel({
    nodeType: 'inline',
    id: node.id,
    screenId: node.screenId,
    parentId: null,
    childIds: [],
    kind: node.kind,
    placement: node.placement,
    sizing: node.sizing,
    common: node.common,
    config: {
      ...node.config,
      ...(node.config.kind === 'button' ? { eventId: null } : {}),
    },
  } as EffectiveScreenComponent, locale)
}

interface DefinitionPreviewSelection {
  definitionId: EntityId
  selectedNodePath: readonly EntityId[]
  onSelect(nodePath: [EntityId, ...EntityId[]]): void
}

export function ResolvedDefinitionPreview({
  rootRuntimeId,
  resolved,
  document,
  locale,
  t,
  definitionSelection,
}: {
  rootRuntimeId: string
  resolved: ResolveScreenNodesResult
  document: ProjectDocument
  locale: 'ja' | 'en'
  t: ReturnType<typeof useI18n>['t']
  definitionSelection: DefinitionPreviewSelection
}) {
  const projections = resolved.orderedNodes.filter(node =>
    node.id !== rootRuntimeId &&
    node.common.visible &&
    (node.placement.mode === 'sticky' || node.placement.mode === 'viewport'))
  return (
    <div
      className={styles.definitionPreviewSurface}
      role="tree"
      aria-label={t('definitions.preview')}
      data-definition-preview-surface
    >
      <div className={styles.definitionPreviewScrollport}>
        <ResolvedCanvasNode
          runtimeId={rootRuntimeId}
          resolved={resolved}
          document={document}
          locale={locale}
          t={t}
          definitionSelection={definitionSelection}
          previewRoot
        />
      </div>
      {(['sticky', 'viewport'] as const).map(layer => (
        <div
          key={layer}
          className={`${styles.frameProjectionLayer} ${
            layer === 'sticky' ? styles.stickyLayer : styles.viewportLayer
          }`}
          data-placement-layer={layer}
        >
          {projections.filter(node => node.placement.mode === layer).map(node => (
            <ProjectedResolvedCanvasNode
              key={node.id}
              runtimeId={node.id}
              owningFrameId={rootRuntimeId}
              layer={layer}
              resolved={resolved}
              document={document}
              locale={locale}
              t={t}
              definitionSelection={definitionSelection}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function ResolvedCanvasNode({
  runtimeId,
  resolved,
  document,
  locale,
  t,
  definitionSelection,
  previewRoot = false,
}: {
  runtimeId: string
  resolved: ResolveScreenNodesResult
  document: ProjectDocument
  locale: 'ja' | 'en'
  t: ReturnType<typeof useI18n>['t']
  definitionSelection?: DefinitionPreviewSelection
  previewRoot?: boolean
}) {
  const selection = useAppStore(state => state.ui.selection)
  const setSelection = useAppStore(state => state.setSelection)
  const node = resolved.nodesById[runtimeId]
  if (
    !node ||
    (!node.instanceId && !node.collectionId) ||
    !node.nodePath ||
    (!node.common.visible && !previewRoot)
  ) return null
  const isSelected = definitionSelection
    ? JSON.stringify(definitionSelection.selectedNodePath) === JSON.stringify(node.nodePath)
    : (
    selection?.type === 'resolvedDefinitionNode' &&
    selection.instanceId === node.instanceId &&
    JSON.stringify(selection.nodePath) === JSON.stringify(node.nodePath)
  ) || (
    selection?.type === 'collectionItemNode' &&
    selection.collectionId === node.collectionId &&
    JSON.stringify(selection.nodePath) === JSON.stringify(node.nodePath)
  )
  const isContainer = CONTAINER_KINDS.includes(node.kind)
  const layout = hasLayout(node.config) ? node.config : null
  const flowChildren = node.childIds
    .map(childId => resolved.nodesById[childId])
    .filter((child): child is ResolvedRuntimeNode =>
      Boolean(child && child.placement.mode === 'flow'))
  const overlayChildren = node.childIds
    .map(childId => resolved.nodesById[childId])
    .filter((child): child is ResolvedRuntimeNode =>
      Boolean(child && child.placement.mode === 'overlay'))
  const label = resolvedNodeLabel(node, locale)
  const select = () => {
    if (definitionSelection) {
      definitionSelection.onSelect(node.nodePath!)
      return
    }
    setSelection(
      node.instanceId
        ? resolvedDefinitionNodeSelection(node.screenId, node.instanceId, node.nodePath!)
        : collectionItemNodeSelection(node.screenId, node.collectionId!, node.nodePath!),
    )
  }
  const childrenStyle = layout
    ? {
        '--layout-gap': layoutGap(layout.gap),
        '--layout-columns': layout.columns,
        justifyContent: layout.justify === 'between' ? 'space-between' : layout.justify,
        alignItems: layout.align,
      } as CSSProperties
    : undefined
  return (
    <div
      className={[
        styles.comp,
        styles.resolvedDefinitionNode,
        node.kind === 'button' ? styles.buttonComponent : '',
        node.kind === 'container' ? styles.containerComponent : '',
        node.kind === 'container' && flowChildren.length === 0
          ? styles.emptyContainer
          : '',
        isSelected ? styles.selected : '',
        previewRoot && !node.common.visible ? styles.rootStateHidden : '',
        node.common.enabled ? '' : styles.componentDisabled,
      ].join(' ')}
      tabIndex={0}
      role={definitionSelection ? 'treeitem' : undefined}
      aria-selected={definitionSelection ? isSelected : undefined}
      aria-label={label}
      onClick={event => {
        event.stopPropagation()
        select()
      }}
      onKeyDown={event => {
        if (event.currentTarget !== event.target) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          select()
        }
      }}
      data-component-id={node.id}
      data-canonical-target-key={componentTargetRefKey(node.canonicalTarget)}
      data-resolved-definition-node
      data-definition-id={node.definitionId ?? undefined}
      data-definition-node-id={node.definitionNodeId ?? undefined}
      data-instance-id={node.instanceId}
      data-collection-id={node.collectionId ?? undefined}
      data-collection-item-key={node.collectionItemKey ?? undefined}
      data-node-path={node.nodePath.join('/')}
      data-editor-selected={isSelected || undefined}
      data-placement-mode={node.placement.mode}
      data-definition-preview-node={definitionSelection ? node.definitionNodeId ?? undefined : undefined}
    >
      <div className={styles.componentChrome} data-editor-chrome>
        <span className={styles.componentLabel}>{label}</span>
      </div>
      <ComponentView comp={node} document={document} t={t} />
      {isContainer ? (
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
          {flowChildren.map(child => (
            <div
              className={styles.childSlot}
              key={child.id}
              style={sizingStyle(child.sizing, 'flow')}
              data-inline-size={child.sizing.inlineSize}
              data-grid-span={child.sizing.gridSpan}
              data-grow={child.sizing.grow}
              data-shrink={child.sizing.shrink}
            >
              <ResolvedCanvasNode
                runtimeId={child.id}
                resolved={resolved}
                document={document}
                locale={locale}
                t={t}
                definitionSelection={definitionSelection}
              />
            </div>
          ))}
        </div>
      ) : null}
      {isContainer && overlayChildren.length > 0 ? (
        <div className={styles.overlayLayer} data-placement-layer="overlay">
          {overlayChildren.map(child => (
            <div
              key={child.id}
              className={styles.projectionItem}
              style={projectionStyle(child.placement, child.sizing)}
              data-placement-projection="overlay"
              data-placement-anchor={
                child.placement.mode === 'overlay' ? child.placement.anchor : undefined
              }
            >
              <ResolvedCanvasNode
                runtimeId={child.id}
                resolved={resolved}
                document={document}
                locale={locale}
                t={t}
                definitionSelection={definitionSelection}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
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
  addMenu,
  componentStatuses,
  resolvedScreen,
  independentRoot = false,
}: CanvasComponentProps) {
  const reviewLocked = useAppStore(state => Boolean(state.activeChangeSet))
  const base = getOwnEntity(document.components, componentId)
  const component = base ? effectiveComponent(document, base, activeState) : undefined
  const componentResolvedScreen = base && (
    base.nodeType === 'definitionInstance' ||
    (base.nodeType === 'inline' && base.kind === 'collection')
  )
    ? resolvedScreen ?? resolveScreenNodes(document, base.screenId, activeState?.id ?? null)
    : null
  const resolvedInstance = base?.nodeType === 'definitionInstance'
    ? componentResolvedScreen
    : null
  const resolvedInstanceRoot = resolvedInstance?.orderedNodes.find(node =>
    node.instanceId === base?.id &&
    node.instanceBoundary.isBoundaryRoot &&
    node.instanceBoundary.depth === 1)
  const resolvedCollectionRoots = base?.nodeType === 'inline' && base.kind === 'collection'
    ? componentResolvedScreen!.orderedNodes
        .filter(node =>
          node.collectionId === base.id &&
          node.instanceBoundary.isBoundaryRoot &&
          node.instanceBoundary.depth === 1)
    : []
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
          surface: 'canvas',
        }
      : undefined,
    disabled: {
      draggable: isRoot || reviewLocked || spacePanActive,
      droppable: true,
    },
  })

  if (!component) return null
  if (!component.common.visible && !independentRoot) return null
  const isSelected = selectedComponentId === component.id
  const isHovered = hoveredComponentId === component.id
  const canDrag = !isRoot && !reviewLocked && !spacePanActive
  const isContainer = base?.nodeType === 'inline' && CONTAINER_KINDS.includes(component.kind)
  const flowChildIds = component.childIds.filter(childId =>
    getOwnEntity(document.components, childId)?.placement.mode === 'flow')
  const overlayChildIds = component.childIds.filter(childId =>
    getOwnEntity(document.components, childId)?.placement.mode === 'overlay')
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
        canDrag ? styles.draggable : '',
        isSelected ? styles.selected : '',
        isHovered ? styles.hovered : '',
        isDragging && canDrag ? styles.dragging : '',
        component.kind === 'button' ? styles.buttonComponent : '',
        component.kind === 'container' ? styles.containerComponent : '',
        component.kind === 'container' && flowChildIds.length === 0
          ? styles.emptyContainer
          : '',
        independentRoot && !component.common.visible ? styles.rootStateHidden : '',
        component.common.enabled ? '' : styles.componentDisabled,
      ].join(' ')}
      style={style}
      {...(canDrag ? attributes : {})}
      {...(canDrag ? listeners : {})}
      tabIndex={isRoot || reviewLocked ? -1 : 0}
      aria-label={isRoot || reviewLocked ? displayName : t('canvas.dragAria', { label: displayName })}
      title={reviewLocked && !isRoot ? t('changes.editLocked') : undefined}
      onClick={event => {
        event.stopPropagation()
        if (consumeSuppressedClick()) return
        if (!(event.target as HTMLElement).closest('a')) {
          event.currentTarget
            .closest<HTMLElement>('[data-hierarchy-shortcut-scope="canvas"]')
            ?.focus({ preventScroll: true })
        }
        onSelect(component.id)
      }}
      onContextMenu={event => {
        const closestComponent = (event.target as HTMLElement)
          .closest<HTMLElement>('[data-component-id]')
        if (closestComponent !== event.currentTarget) return
        onSelect(component.id)
        addMenu.openFromPointer(event, component.id)
      }}
      onKeyDownCapture={event => {
        const closestComponent = (event.target as HTMLElement)
          .closest<HTMLElement>('[data-component-id]')
        if (closestComponent !== event.currentTarget) return
        if (addMenu.openFromKeyboard(event, component.id)) {
          onSelect(component.id)
          event.stopPropagation()
          return
        }
        if (active) return
        if (event.key !== ' ' && event.key !== 'Enter') event.stopPropagation()
      }}
      onPointerMove={event => {
        const closestComponent = (event.target as HTMLElement)
          .closest<HTMLElement>('[data-component-id]')
        if (closestComponent !== event.currentTarget) return
        if (!isHovered) onHover(component.id)
      }}
      data-component-id={component.id}
      data-editor-hovered={isHovered || undefined}
      data-editor-selected={isSelected || undefined}
      data-component-visible={component.common.visible}
      data-canvas-draggable={canDrag || undefined}
      data-canvas-dragging={isDragging && canDrag || undefined}
      data-drag-surface={canDrag ? 'canvas' : undefined}
      data-drag-component={canDrag ? component.id : undefined}
      data-component-change={changeStatus}
      data-placement-mode={component.placement.mode}
      data-container-component={component.kind === 'container' || undefined}
      data-container-empty={
        component.kind === 'container' && component.childIds.length === 0 || undefined
      }
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
      {base?.nodeType === 'definitionInstance' && resolvedInstance && resolvedInstanceRoot ? (
        <ResolvedCanvasNode
          runtimeId={resolvedInstanceRoot.id}
          resolved={resolvedInstance}
          document={document}
          locale={locale}
          t={t}
        />
      ) : (
        <ComponentView comp={component} document={document} t={t} />
      )}
      {base?.nodeType === 'inline' && base.kind === 'collection' ? (
        <div
          className={styles.collectionItems}
          role="list"
          aria-label={t('collection.previewItems')}
          data-collection-preview
        >
          {resolvedCollectionRoots.map(root => (
            <div
              key={root.id}
              className={styles.collectionItem}
              role="listitem"
              data-collection-preview-key={root.collectionItemKey ?? undefined}
            >
              <ResolvedCanvasNode
                runtimeId={root.id}
                resolved={componentResolvedScreen!}
                document={document}
                locale={locale}
                t={t}
              />
            </div>
          ))}
          {resolvedCollectionRoots.length === 0 ? (
            <div className={styles.collectionEmpty}>{t('collection.emptyPreview')}</div>
          ) : null}
        </div>
      ) : null}
      {isContainer && base?.nodeType === 'inline' && (
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
            onWheel={layout?.layout === 'horizontal' ? event => {
              const delta = event.deltaX || (event.shiftKey ? event.deltaY : 0)
              if (delta === 0) return
              event.currentTarget.scrollLeft += delta
            } : undefined}
          >
            {component.childIds.map((childId, index) => {
              const dropZone = (
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
              )
              if (getOwnEntity(document.components, childId)?.placement.mode !== 'flow') {
                return null
              }
              return (
                <div
                  className={styles.childSlot}
                  key={childId}
                  style={sizingStyle(
                    getOwnEntity(document.components, childId)!.sizing,
                    'flow',
                  )}
                  data-inline-size={getOwnEntity(document.components, childId)!.sizing.inlineSize}
                  data-grid-span={getOwnEntity(document.components, childId)!.sizing.gridSpan}
                  data-grow={getOwnEntity(document.components, childId)!.sizing.grow}
                  data-shrink={getOwnEntity(document.components, childId)!.sizing.shrink}
                >
                  {dropZone}
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
                    addMenu={addMenu}
                    componentStatuses={componentStatuses}
                    resolvedScreen={resolvedScreen}
                  />
                </div>
              )
            })}
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
      {isContainer && overlayChildIds.length > 0 ? (
        <div className={styles.overlayLayer} data-placement-layer="overlay">
          {overlayChildIds.map(childId => (
            <ProjectedCanvasComponent
              key={childId}
              componentId={childId}
              owningFrameId={owningFrameId(document, component.id)}
              layer="overlay"
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
              addMenu={addMenu}
              componentStatuses={componentStatuses}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function hasLayout(
  config: ComponentConfig | DefinitionComponentConfig,
): config is (ComponentConfig | DefinitionComponentConfig) & ComponentLayout {
  return (
    config.kind === 'page' ||
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
  document,
  t,
}: {
  comp: Pick<EffectiveScreenComponent, 'config'>
  document: ProjectDocument
  t: ReturnType<typeof useI18n>['t']
}) {
  const preview = createCanvasComponentPreview(comp.config)
  switch (preview.kind) {
    case 'page':
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
    case 'image':
      return <ImagePreview key={preview.source} config={preview} t={t} />
    case 'link': {
      const destination = preview.destination
      const href = destination.type === 'internal'
        ? getOwnEntity(document.screens, destination.screenId)?.route ?? `#${destination.screenId}`
        : destination.url
      const newContext = preview.openMode === 'newContext'
      return (
        <a
          className={styles.linkPreview}
          href={href}
          target={newContext ? '_blank' : undefined}
          rel={newContext ? 'noopener noreferrer' : undefined}
          download={
            preview.openMode === 'download' && destination.type === 'resource'
              ? destination.displayName
              : undefined
          }
          onClick={event => event.preventDefault()}
        >
          {preview.label}
        </a>
      )
    }
    case 'collection':
      return null
    case 'modal':
      return null
  }
}

function ImagePreview({
  config,
  t,
}: {
  config: Extract<ReturnType<typeof createCanvasComponentPreview>, { kind: 'image' }>
  t: ReturnType<typeof useI18n>['t']
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const status = resolveImagePreviewStatus(config.source, failedSource)
  const reason = status === 'missing'
    ? t('canvas.imageMissing')
    : status === 'invalid'
      ? t('canvas.imageInvalid')
      : status === 'failed'
        ? t('canvas.imageFailed')
        : null

  if (reason) {
    return (
      <div
        className={[
          styles.imagePlaceholder,
          config.placeholderStyle === 'skeleton' ? styles.imagePlaceholderSkeleton : '',
        ].join(' ')}
        role="img"
        aria-label={`${config.alt}: ${reason}`}
        data-image-placeholder={
          status
        }
      >
        {config.placeholderStyle === 'icon' ? <span aria-hidden="true">▧</span> : null}
        <span>{reason}</span>
      </div>
    )
  }

  return (
    <img
      key={config.source}
      className={`${styles.imagePreview} ${styles[`imageAspect${config.aspectRatio.replace(':', '')}`]}`}
      src={config.source}
      alt={config.alt}
      style={{ objectFit: config.fit }}
      onError={() => setFailedSource(config.source)}
      data-image-fit={config.fit}
      data-image-aspect={config.aspectRatio}
    />
  )
}
