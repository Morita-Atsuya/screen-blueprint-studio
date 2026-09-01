import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useAppStore } from '../../app/appStore'
import type { EntityId, ProjectDocument, Screen, ScreenState } from '../../domain/model'
import { CONTAINER_KINDS } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import {
  getComponentHierarchyLabel,
  getComponentTreeLabel,
} from '../../domain/componentDisplayLabel'
import { COMPONENT_KIND_MESSAGE_KEYS } from '../../domain/componentDisplayLabel'
import {
  resolvedDefinitionNodeSelection,
  selectionScreenComponentId,
} from '../../domain/editorSelection'
import {
  resolveScreenNodes,
  type ResolveScreenNodesResult,
  type ResolvedRuntimeNode,
} from '../../domain/definitionResolver'
import { resolveComponentDefinitionRefV3 } from '../../domain/canonicalProjectSpecV3'
import { resolveEffectiveComponentState } from '../../domain/selectors'
import { createResetComponentOverrideCommand } from '../../domain/stateOverrides'
import {
  getChangeSetComponentChanges,
  type ComponentChangeStatus,
} from '../../domain/changeSetComponentChanges'
import { useI18n } from '../../i18n/I18nProvider'
import type { MessageKey } from '../../i18n/messages'
import { ComponentDropZone } from '../../dnd/ComponentDropZone'
import { draggableComponentId } from '../../dnd/editorDnd'
import {
  persistStructureTreePreferences,
  resolveInitialStructureTreePreferences,
  type StructureTreePreferences,
} from './structureTreePreferences'
import {
  getVisibleTreeItemIds,
  resolveTreeKeyboardIntent,
} from './structureTreeKeyboard'
import { useComponentAddMenu } from '../component-add-menu/ComponentAddMenu'
import type { ComponentAddMenuTrigger } from '../component-add-menu/ComponentAddMenu'
import { ComponentChangeBadge } from '../change-review/ComponentChangeBadge'
import { RemovedComponentGhostList } from '../change-review/RemovedComponentGhostList'
import styles from './StructureTree.module.css'

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function getScreenRootIds(screen: Screen) {
  return [screen.rootComponentId, ...screen.modalComponentIds]
}

function getTreeDescendantIds(document: ProjectDocument, rootIds: EntityId[]): Set<EntityId> {
  const visited = new Set<EntityId>()
  const queue = [...rootIds]
  while (queue.length > 0) {
    const componentId = queue.shift()!
    if (visited.has(componentId)) continue
    const component = getOwnEntity(document.components, componentId)
    if (!component) continue
    visited.add(component.id)
    queue.push(...component.childIds)
  }
  return visited
}

function getAncestorIds(document: ProjectDocument, componentId: EntityId): EntityId[] {
  const ancestors: EntityId[] = []
  const visited = new Set<EntityId>()
  let current = getOwnEntity(document.components, componentId)
  while (current?.parentId) {
    const parent = getOwnEntity(document.components, current.parentId)
    if (!parent || visited.has(parent.id)) break
    ancestors.push(parent.id)
    visited.add(parent.id)
    current = parent
  }
  return ancestors
}

function normalizeStructureTreePreferences(
  document: ProjectDocument,
  preferences: StructureTreePreferences,
): StructureTreePreferences {
  let changed = false
  const collapsedByScreen: Record<string, string[]> = {}
  for (const [screenId, componentIds] of Object.entries(preferences.collapsedByScreen)) {
    const screen = getOwnEntity(document.screens, screenId)
    if (!screen) {
      changed = true
      continue
    }
    const validIds = getTreeDescendantIds(document, getScreenRootIds(screen))
    const nextIds: string[] = []
    const seen = new Set<string>()
    for (const componentId of componentIds) {
      if (seen.has(componentId) || !validIds.has(componentId)) {
        if (validIds.has(componentId)) changed = true
        continue
      }
      seen.add(componentId)
      nextIds.push(componentId)
    }
    if (nextIds.length > 0) {
      collapsedByScreen[screenId] = nextIds
    }
    if (nextIds.length !== componentIds.length) changed = true
  }
  return changed ? { collapsedByScreen } : preferences
}

function updateScreenCollapsedIds(
  preferences: StructureTreePreferences,
  screenId: EntityId,
  updater: (collapsedIds: Set<EntityId>) => Set<EntityId>,
): StructureTreePreferences {
  const currentCollapsedIds = new Set(preferences.collapsedByScreen[screenId] ?? [])
  const nextCollapsedIds = updater(new Set(currentCollapsedIds))
  let changed = currentCollapsedIds.size !== nextCollapsedIds.size
  if (!changed) {
    for (const componentId of currentCollapsedIds) {
      if (!nextCollapsedIds.has(componentId)) {
        changed = true
        break
      }
    }
  }
  if (!changed) return preferences
  const nextCollapsedByScreen = { ...preferences.collapsedByScreen }
  if (nextCollapsedIds.size === 0) {
    delete nextCollapsedByScreen[screenId]
  } else {
    nextCollapsedByScreen[screenId] = [...nextCollapsedIds]
  }
  return { collapsedByScreen: nextCollapsedByScreen }
}

export function StructureTree() {
  const { locale, t } = useI18n()
  const {
    effectiveDocument,
    activeChangeSet,
    pendingDelete,
    ui,
    selectScreenComponent,
    setRightPanelTab,
    dispatch,
    requestHumanDelete,
  } = useAppStore()
  const { activeScreenId } = ui
  const selectedComponentId = ui.selection
    ? selectionScreenComponentId(ui.selection)
    : null
  const [treePreferences, setTreePreferences] = useState<StructureTreePreferences>(() =>
    resolveInitialStructureTreePreferences(browserStorage()),
  )
  const componentAddMenu = useComponentAddMenu()
  const nodeRefs = useRef(new Map<EntityId, HTMLLIElement>())
  const lastRevealedSelectionKeyRef = useRef<string | null>(null)
  const lastScrolledKeyRef = useRef<string | null>(null)
  const previousSelectedIdRef = useRef<EntityId | null>(null)
  const pendingSelectedIdRef = useRef<EntityId | null>(selectedComponentId)
  const treeHasFocusRef = useRef(false)
  const menuWasOpenRef = useRef(false)
  const [focusedComponentId, setFocusedComponentId] = useState<EntityId | null>(null)
  const screen = activeScreenId ? getOwnEntity(effectiveDocument.screens, activeScreenId) : undefined
  const activeState = ui.activeStateId
    ? getOwnEntity(effectiveDocument.screenScenarios, ui.activeStateId)
    : undefined
  const componentChanges = useMemo(
    () => activeChangeSet ? getChangeSetComponentChanges(activeChangeSet) : null,
    [activeChangeSet],
  )
  const resolvedScreen = useMemo(
    () => screen
      ? resolveScreenNodes(effectiveDocument, screen.id, activeState?.id ?? null)
      : null,
    [activeState?.id, effectiveDocument, screen],
  )

  function move(id: EntityId, direction: -1 | 1) {
    const component = getOwnEntity(effectiveDocument.components, id)
    if (!component?.parentId) return
    const parent = getOwnEntity(effectiveDocument.components, component.parentId)
    if (!parent) return
    const index = (parent.childIds as readonly string[]).indexOf(id)
    const position = index + direction
    if (index < 0 || position < 0 || position >= parent.childIds.length) return
    dispatch(
      { type: 'moveComponent', componentId: id, newParentId: parent.id, position },
      direction < 0 ? 'Move component up' : 'Move component down',
    )
  }

  function remove(id: EntityId) {
    requestHumanDelete({ type: 'removeComponent', componentId: id }, 'Delete component')
  }

  function resetOverride(id: EntityId) {
    if (!activeState) return
    const command = createResetComponentOverrideCommand(activeState, id)
    if (!command) return
    dispatch(command, `Reset ${activeState.name} override: ${id}`)
  }

  useEffect(() => {
    setTreePreferences(previous => normalizeStructureTreePreferences(effectiveDocument, previous))
  }, [effectiveDocument])

  useEffect(() => {
    persistStructureTreePreferences(browserStorage(), treePreferences)
  }, [treePreferences])

  const activeScreenCollapsedIds = useMemo(
    () => new Set(activeScreenId ? treePreferences.collapsedByScreen[activeScreenId] ?? [] : []),
    [treePreferences, activeScreenId],
  )
  const visibleItemIds = useMemo(
    () => screen
      ? getVisibleTreeItemIds(effectiveDocument, screen, activeScreenCollapsedIds)
      : [],
    [activeScreenCollapsedIds, effectiveDocument, screen],
  )

  function focusTreeItem(componentId: EntityId) {
    setFocusedComponentId(componentId)
    nodeRefs.current.get(componentId)?.focus()
  }

  function toggleCollapse(componentId: EntityId) {
    if (!activeScreenId) return
    const willCollapse = !activeScreenCollapsedIds.has(componentId)
    if (
      willCollapse &&
      selectedComponentId &&
      getAncestorIds(effectiveDocument, selectedComponentId).includes(componentId)
    ) {
      const revealKey = `${activeScreenId}:${selectedComponentId}`
      lastRevealedSelectionKeyRef.current = revealKey
    }
    if (
      willCollapse &&
      focusedComponentId &&
      focusedComponentId !== componentId &&
      getAncestorIds(effectiveDocument, focusedComponentId).includes(componentId)
    ) {
      focusTreeItem(componentId)
    }
    setTreePreferences(previous =>
      updateScreenCollapsedIds(previous, activeScreenId, current => {
        if (current.has(componentId)) {
          current.delete(componentId)
        } else {
          current.add(componentId)
        }
        return current
      }),
    )
  }

  useEffect(() => {
    if (previousSelectedIdRef.current !== selectedComponentId) {
      previousSelectedIdRef.current = selectedComponentId
      pendingSelectedIdRef.current = selectedComponentId
    }
    const pendingSelectedId = pendingSelectedIdRef.current
    if (pendingSelectedId && visibleItemIds.includes(pendingSelectedId)) {
      pendingSelectedIdRef.current = null
      setFocusedComponentId(pendingSelectedId)
      return
    }
    if (focusedComponentId && visibleItemIds.includes(focusedComponentId)) return
    const fallback = selectedComponentId && visibleItemIds.includes(selectedComponentId)
      ? selectedComponentId
      : visibleItemIds[0] ?? null
    setFocusedComponentId(fallback)
    if (fallback && treeHasFocusRef.current) {
      requestAnimationFrame(() => nodeRefs.current.get(fallback)?.focus())
    }
  }, [focusedComponentId, selectedComponentId, visibleItemIds])

  useEffect(() => {
    const wasOpen = menuWasOpenRef.current
    menuWasOpenRef.current = componentAddMenu.isOpen
    if (!wasOpen || componentAddMenu.isOpen || pendingDelete || !focusedComponentId) return
    nodeRefs.current.get(focusedComponentId)?.focus()
  }, [componentAddMenu.isOpen, focusedComponentId, pendingDelete])

  useEffect(() => {
    if (!selectedComponentId) {
      lastRevealedSelectionKeyRef.current = null
      lastScrolledKeyRef.current = null
      return
    }
    const selected = getOwnEntity(effectiveDocument.components, selectedComponentId)
    if (!selected || selected.screenId !== activeScreenId) {
      lastRevealedSelectionKeyRef.current = null
      lastScrolledKeyRef.current = null
      return
    }
    const revealKey = `${activeScreenId}:${selectedComponentId}`
    if (lastRevealedSelectionKeyRef.current !== revealKey) {
      lastRevealedSelectionKeyRef.current = revealKey
      const collapsedAncestors = getAncestorIds(effectiveDocument, selectedComponentId).filter(
        ancestorId => activeScreenCollapsedIds.has(ancestorId),
      )
      if (collapsedAncestors.length > 0) {
        lastScrolledKeyRef.current = null
        setTreePreferences(previous =>
          updateScreenCollapsedIds(previous, activeScreenId, current => {
            for (const ancestorId of collapsedAncestors) current.delete(ancestorId)
            return current
          }),
        )
        return
      }
    }
    if (lastScrolledKeyRef.current === revealKey) return
    nodeRefs.current.get(selectedComponentId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    lastScrolledKeyRef.current = revealKey
  }, [activeScreenCollapsedIds, activeScreenId, effectiveDocument, selectedComponentId])

  if (!activeScreenId) return <p className={styles.empty}>{t('tree.selectScreen')}</p>
  if (!screen) return null

  return (
    <>
      {activeChangeSet ? (
        <p className={styles.reviewLock}>{t('changes.editLocked')}</p>
      ) : null}
      <ul
        className={styles.root}
        role="tree"
        aria-label={t('tree.label')}
        onFocusCapture={() => {
          treeHasFocusRef.current = true
        }}
        onBlurCapture={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            treeHasFocusRef.current = false
          }
        }}
      >
        <TreeNode
          componentId={screen.rootComponentId}
          depth={0}
          document={effectiveDocument}
          activeState={activeState}
          selectedComponentId={selectedComponentId}
          onSelect={selectScreenComponent}
          onMove={move}
          onRemove={remove}
          onResetOverride={resetOverride}
          locale={locale}
          t={t}
          collapsedIds={activeScreenCollapsedIds}
          onToggleCollapse={toggleCollapse}
          focusedComponentId={focusedComponentId}
          visibleItemIds={visibleItemIds}
          onFocusItem={focusTreeItem}
          onSetFocusedItem={setFocusedComponentId}
          addMenu={componentAddMenu.trigger}
          registerNodeRef={(componentId, element) => {
            if (element) {
              nodeRefs.current.set(componentId, element)
            } else {
              nodeRefs.current.delete(componentId)
            }
          }}
          componentStatuses={componentChanges?.statuses}
          resolvedScreen={resolvedScreen ?? undefined}
        />
        {screen.modalComponentIds.map(modalId => (
          <TreeNode
            key={modalId}
            componentId={modalId}
            depth={0}
            document={effectiveDocument}
            activeState={activeState}
            selectedComponentId={selectedComponentId}
            onSelect={selectScreenComponent}
            onMove={move}
            onRemove={remove}
            onResetOverride={resetOverride}
            locale={locale}
            t={t}
            collapsedIds={activeScreenCollapsedIds}
            onToggleCollapse={toggleCollapse}
            focusedComponentId={focusedComponentId}
            visibleItemIds={visibleItemIds}
            onFocusItem={focusTreeItem}
            onSetFocusedItem={setFocusedComponentId}
            addMenu={componentAddMenu.trigger}
            registerNodeRef={(componentId, element) => {
              if (element) {
                nodeRefs.current.set(componentId, element)
              } else {
                nodeRefs.current.delete(componentId)
              }
            }}
            componentStatuses={componentChanges?.statuses}
          />
        ))}
      </ul>
      {activeChangeSet && componentChanges ? (
        <RemovedComponentGhostList
          baseDocument={activeChangeSet.baseDocument}
          previewDocument={effectiveDocument}
          removedComponents={componentChanges.removedComponents}
          activeScreenId={activeScreenId}
          surface="tree"
          onReview={() => setRightPanelTab('changes')}
        />
      ) : null}
      {componentAddMenu.menu}
    </>
  )
}

interface TreeNodeProps {
  componentId: EntityId
  depth: number
  document: ProjectDocument
  activeState?: ScreenState
  selectedComponentId: EntityId | null
  onSelect(id: EntityId): void
  onMove(id: EntityId, direction: -1 | 1): void
  onRemove(id: EntityId): void
  onResetOverride(id: EntityId): void
  locale: 'ja' | 'en'
  t: ReturnType<typeof useI18n>['t']
  collapsedIds: Set<EntityId>
  onToggleCollapse(componentId: EntityId): void
  focusedComponentId: EntityId | null
  visibleItemIds: readonly EntityId[]
  onFocusItem(componentId: EntityId): void
  onSetFocusedItem(componentId: EntityId): void
  addMenu: ComponentAddMenuTrigger
  registerNodeRef(componentId: EntityId, element: HTMLLIElement | null): void
  componentStatuses?: ReadonlyMap<EntityId, ComponentChangeStatus>
  resolvedScreen?: ResolveScreenNodesResult
}

function TreeNode({
  componentId,
  depth,
  document,
  activeState,
  selectedComponentId,
  onSelect,
  onMove,
  onRemove,
  onResetOverride,
  locale,
  t,
  collapsedIds,
  onToggleCollapse,
  focusedComponentId,
  visibleItemIds,
  onFocusItem,
  onSetFocusedItem,
  addMenu,
  registerNodeRef,
  componentStatuses,
  resolvedScreen,
}: TreeNodeProps) {
  const reviewLocked = useAppStore(state => Boolean(state.activeChangeSet))
  const baseComponent = getOwnEntity(document.components, componentId)
  const effectiveState = baseComponent
    ? resolveEffectiveComponentState(document, baseComponent, activeState)
    : undefined
  const component = effectiveState?.component
  const ownerScreen = component
    ? getOwnEntity(document.screens, component.screenId)
    : undefined
  const isIndependentRoot = component?.parentId === null
  const isPageRoot = component?.kind === 'page' && isIndependentRoot
  const isModalRoot = component?.kind === 'modal' && isIndependentRoot
  const kindLabel = component
    ? component.nodeType === 'inline'
      ? t(COMPONENT_KIND_MESSAGE_KEYS[component.kind])
      : t('component.container')
    : ''
  const spokenLabel = component
    ? isPageRoot
      ? ownerScreen?.name ?? kindLabel
      : isModalRoot
        ? getComponentHierarchyLabel(document, component, locale)
        : getComponentTreeLabel(component, locale)
    : ''
  const visibleLabel = component
    ? component.nodeType === 'inline' && CONTAINER_KINDS.includes(component.kind) && !isPageRoot && !isModalRoot
      ? ''
      : spokenLabel
    : ''
  const {
    attributes,
    listeners,
    isDragging,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: draggableComponentId('tree', componentId),
    data: component
      ? {
          type: 'component',
          componentId: component.id,
          screenId: component.screenId,
          label: spokenLabel,
          surface: 'tree',
        }
      : undefined,
    disabled: { draggable: isIndependentRoot || reviewLocked, droppable: true },
  })

  if (!component) return null
  const isSelected = selectedComponentId === component.id
  const isFocused = focusedComponentId === component.id
  const isContainer = baseComponent?.nodeType === 'inline' && CONTAINER_KINDS.includes(component.kind)
  const hasInlineChildren = isContainer && component.childIds.length > 0
  const resolvedInstance = baseComponent?.nodeType === 'definitionInstance'
    ? resolvedScreen ?? resolveScreenNodes(document, baseComponent.screenId, activeState?.id ?? null)
    : null
  const resolvedInstanceRoot = resolvedInstance?.orderedNodes.find(node =>
    node.instanceId === baseComponent?.id &&
    node.instanceBoundary.isBoundaryRoot &&
    node.instanceBoundary.depth === 1)
  const hasResolvedChildren = Boolean(resolvedInstanceRoot)
  const hasChildren = hasInlineChildren || hasResolvedChildren
  const isCollapsed = hasChildren && collapsedIds.has(component.id)
  const isHidden = !component.common.visible
  const isDisabled = !component.common.enabled
  const hasOverride = effectiveState?.hasOverride ?? false
  const hasPlacement = component.placement.mode !== 'flow'
  const hasStateStatus = isHidden || isDisabled || hasOverride || hasPlacement
  const changeStatus = componentStatuses?.get(component.id)
  const disclosureLabel = hasChildren
    ? t(isCollapsed ? 'tree.disclosureExpand' : 'tree.disclosureCollapse', { label: spokenLabel })
    : ''
  const parent = component.parentId
    ? getOwnEntity(document.components, component.parentId)
    : undefined
  const siblingIndex = parent ? (parent.childIds as readonly string[]).indexOf(component.id) : -1
  const compactDepth = Math.min(depth, 3) * 16 + Math.max(depth - 3, 0) * 8
  const style: CSSProperties = {
    paddingInlineStart: `${8 + compactDepth}px`,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
      : undefined,
    transition,
  }

  return (
    <li
      ref={element => registerNodeRef(component.id, element)}
      className={`${styles.nodeWrapper} ${isIndependentRoot ? styles.independentRoot : ''} ${isModalRoot ? styles.modalRoot : ''}`}
      data-tree-root={isPageRoot ? 'page' : isModalRoot ? 'modal' : undefined}
      role="treeitem"
      aria-label={spokenLabel}
      aria-level={depth + 1}
      aria-selected={isSelected}
      aria-expanded={hasChildren ? !isCollapsed : undefined}
      tabIndex={isFocused ? 0 : -1}
      onFocus={event => {
        if ((event.target as HTMLElement).closest('[role="treeitem"]') === event.currentTarget) {
          onSetFocusedItem(component.id)
        }
      }}
      onContextMenu={event => {
        if (
          (event.target as HTMLElement).closest('[role="treeitem"]') !==
          event.currentTarget
        ) return
        event.stopPropagation()
        onSelect(component.id)
        addMenu.openFromPointer(event, component.id)
      }}
      onKeyDown={event => {
        if (
          (event.target as HTMLElement).closest('[role="treeitem"]') !==
          event.currentTarget
        ) return
        if (addMenu.openFromKeyboard(event, component.id)) {
          onSelect(component.id)
          return
        }
        if (event.target !== event.currentTarget) return
        const intent = resolveTreeKeyboardIntent({
          key: event.key,
          componentId: component.id,
          visibleIds: visibleItemIds,
          document,
          collapsedIds,
        })
        if (!intent) return
        event.preventDefault()
        event.stopPropagation()
        if (intent.type === 'focus') {
          onFocusItem(intent.componentId)
        } else if (intent.type === 'select') {
          onSelect(intent.componentId)
        } else {
          onToggleCollapse(intent.componentId)
        }
      }}
    >
      <div
        ref={setNodeRef}
        className={`${styles.node} ${!isPageRoot ? styles.nodeWithActions : ''} ${isSelected ? styles.selected : ''} ${isDragging ? styles.dragging : ''}`}
        style={style}
        data-state-hidden={isHidden || undefined}
        data-state-disabled={isDisabled || undefined}
        data-state-overridden={hasOverride || undefined}
        data-component-change={changeStatus}
        data-tree-component-id={component.id}
        onClick={() => {
          onFocusItem(component.id)
          onSelect(component.id)
        }}
      >
        <span className={styles.disclosureSlot}>
          {hasChildren ? (
            <button
              type="button"
              className={`${styles.disclosure} ${isCollapsed ? styles.disclosureCollapsed : ''}`}
              aria-label={disclosureLabel}
              aria-expanded={!isCollapsed}
              title={disclosureLabel}
              onClick={event => {
                event.stopPropagation()
                onToggleCollapse(component.id)
              }}
            >
              <span className={styles.disclosureIcon} aria-hidden="true">
                ▾
              </span>
            </button>
          ) : (
            <span className={styles.disclosurePlaceholder} aria-hidden="true" />
          )}
        </span>
        {!isIndependentRoot && (
          <button
            className={styles.dragHandle}
            aria-label={t('tree.dragAria', { label: spokenLabel })}
            title={reviewLocked ? t('changes.editLocked') : t('tree.drag')}
            disabled={reviewLocked}
            data-drag-surface="tree"
            data-drag-component={component.id}
            onClick={event => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        )}
        <span className={styles.nodeBody}>
          <span className={styles.nodeLabel}>
          <span className={styles.kind}>{kindLabel}</span>
            {visibleLabel ? <span className={styles.name} title={visibleLabel}>{visibleLabel}</span> : null}
          </span>
          {hasStateStatus || changeStatus ? (
            <span
              className={styles.stateStatus}
              data-editor-chrome
              data-tree-state-status
            >
              {changeStatus ? (
                <ComponentChangeBadge
                  status={changeStatus}
                  label={spokenLabel}
                  onActivate={() => onSelect(component.id)}
                />
              ) : null}
              {hasPlacement ? (
                <span
                  className={styles.stateBadge}
                  data-placement-badge={component.placement.mode}
                  title={t(`tree.placement.${component.placement.mode}` as MessageKey)}
                >
                  {t(`tree.placement.${component.placement.mode}` as MessageKey)}
                </span>
              ) : null}
              {isHidden ? (
                <span
                  className={styles.stateBadge}
                  data-state-badge="hidden"
                  aria-label={t('tree.stateHidden')}
                  title={t('tree.stateHidden')}
                >
                  {t('tree.stateHiddenBadge')}
                </span>
              ) : null}
              {isDisabled ? (
                <span
                  className={styles.stateBadge}
                  data-state-badge="disabled"
                  aria-label={t('tree.stateDisabled')}
                  title={t('tree.stateDisabled')}
                >
                  {t('tree.stateDisabledBadge')}
                </span>
              ) : null}
              {hasOverride && activeState ? (
                <button
                  type="button"
                  className={`${styles.stateBadge} ${styles.resetOverride}`}
                  data-state-badge="override"
                  disabled={reviewLocked}
                  aria-label={t('tree.resetOverride', {
                    label: spokenLabel,
                    state: activeState.name,
                  })}
                  title={t('tree.resetOverride', {
                    label: spokenLabel,
                    state: activeState.name,
                  })}
                  onClick={event => {
                    event.stopPropagation()
                    onResetOverride(component.id)
                  }}
                >
                  {t('tree.stateOverrideBadge')}
                  <span aria-hidden="true"> ×</span>
                </button>
              ) : null}
            </span>
          ) : null}
        </span>
        {!isPageRoot && (
          <div className={styles.nodeActions}>
            {!isIndependentRoot ? (
              <>
                <button
                  className={styles.iconBtn}
                  title={t('tree.moveUp')}
                  aria-label={t('tree.moveUpAria', { label: spokenLabel })}
                  disabled={reviewLocked || siblingIndex <= 0}
                  onClick={event => { event.stopPropagation(); onMove(component.id, -1) }}
                >↑</button>
                <button
                  className={styles.iconBtn}
                  title={t('tree.moveDown')}
                  aria-label={t('tree.moveDownAria', { label: spokenLabel })}
                  disabled={reviewLocked || !parent || siblingIndex < 0 || siblingIndex >= parent.childIds.length - 1}
                  onClick={event => { event.stopPropagation(); onMove(component.id, 1) }}
                >↓</button>
              </>
            ) : null}
            <button
              className={`${styles.iconBtn} ${styles.danger}`}
              title={reviewLocked ? t('changes.editLocked') : t('tree.delete')}
              aria-label={t('tree.deleteAria', { label: spokenLabel })}
              disabled={reviewLocked}
              onClick={event => { event.stopPropagation(); onRemove(component.id) }}
            >×</button>
          </div>
        )}
      </div>
      {hasResolvedChildren && !isCollapsed && resolvedInstance && resolvedInstanceRoot ? (
        <ul className={styles.children} role="group" data-resolved-definition-tree>
          <ResolvedTreeNode
            runtimeId={resolvedInstanceRoot.id}
            resolved={resolvedInstance}
            depth={depth + 1}
            locale={locale}
          />
        </ul>
      ) : null}
      {baseComponent?.nodeType === 'inline' && baseComponent.config.kind === 'collection' ? (
        <ul className={styles.children} role="group" data-collection-template-tree>
          <li
            role="treeitem"
            aria-level={depth + 2}
            aria-disabled="true"
            className={styles.resolvedTreeItem}
          >
            <div
              className={styles.node}
              style={{ paddingInlineStart: `${8 + Math.min(depth + 1, 3) * 16}px` }}
            >
              <span className={styles.disclosurePlaceholder} aria-hidden="true" />
              <span className={styles.nodeBody}>
                <span className={styles.nodeLabel}>
                  <span className={styles.kind}>{t('collection.itemTemplate')}</span>
                  <span className={styles.name}>
                    {resolveComponentDefinitionRefV3(
                      document,
                      baseComponent.config.itemTemplate.source.$ref,
                    ).name}
                    {' · '}
                    {t('collection.previewCount', {
                      count: baseComponent.config.dataSource.previewItems.length,
                    })}
                  </span>
                </span>
              </span>
            </div>
          </li>
        </ul>
      ) : null}
      {hasInlineChildren && !isCollapsed && (
        <SortableContext
          items={component.childIds.map(id => draggableComponentId('tree', id))}
          strategy={verticalListSortingStrategy}
        >
          <ul className={styles.children} role="group">
            {component.childIds.map((childId, index) => (
              <Fragment key={childId}>
                <li className={styles.dropItem} role="none" aria-hidden="true">
                  <ComponentDropZone
                    surface="tree"
                    parentId={component.id}
                    screenId={component.screenId}
                    position={index}
                    label={index === 0
                      ? t('dnd.first', { label: spokenLabel })
                      : t('dnd.position', { position: index + 1 })}
                  />
                </li>
                <TreeNode
                  componentId={childId}
                  depth={depth + 1}
                  document={document}
                  activeState={activeState}
                  selectedComponentId={selectedComponentId}
                  onSelect={onSelect}
                  onMove={onMove}
                  onRemove={onRemove}
                  onResetOverride={onResetOverride}
                  locale={locale}
                  t={t}
                  collapsedIds={collapsedIds}
                  onToggleCollapse={onToggleCollapse}
                  focusedComponentId={focusedComponentId}
                  visibleItemIds={visibleItemIds}
                  onFocusItem={onFocusItem}
                  onSetFocusedItem={onSetFocusedItem}
                  addMenu={addMenu}
                  registerNodeRef={registerNodeRef}
                  componentStatuses={componentStatuses}
                  resolvedScreen={resolvedScreen}
                />
              </Fragment>
            ))}
            <li className={styles.dropItem} role="none" aria-hidden="true">
              <ComponentDropZone
                surface="tree"
                parentId={component.id}
                screenId={component.screenId}
                position={component.childIds.length}
                label={t('dnd.end', { label: spokenLabel })}
              />
            </li>
          </ul>
        </SortableContext>
      )}
      {hasInlineChildren && isCollapsed && (
        <ul className={styles.children} role="group">
          <li className={styles.dropItem} role="none" aria-hidden="true">
            <ComponentDropZone
              surface="tree"
              parentId={component.id}
              screenId={component.screenId}
              position={0}
              label={t('dnd.first', { label: spokenLabel })}
            />
          </li>
        </ul>
      )}
    </li>
  )
}

function resolvedTreeLabel(node: ResolvedRuntimeNode): string {
  switch (node.config.kind) {
    case 'text':
      return node.config.text || node.kind
    case 'image':
      return node.config.alt || node.kind
    case 'textInput':
    case 'select':
    case 'button':
    case 'link':
      return node.config.label || node.kind
    default:
      return node.common.description || node.kind
  }
}

function ResolvedTreeNode({
  runtimeId,
  resolved,
  depth,
  locale: _locale,
}: {
  runtimeId: string
  resolved: ResolveScreenNodesResult
  depth: number
  locale: 'ja' | 'en'
}) {
  const selection = useAppStore(state => state.ui.selection)
  const setSelection = useAppStore(state => state.setSelection)
  const node = resolved.nodesById[runtimeId]
  if (!node || !node.instanceId || !node.nodePath) return null
  const selected = selection?.type === 'resolvedDefinitionNode' &&
    selection.instanceId === node.instanceId &&
    JSON.stringify(selection.nodePath) === JSON.stringify(node.nodePath)
  const label = resolvedTreeLabel(node)
  return (
    <li
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={node.childIds.length > 0 ? true : undefined}
      tabIndex={0}
      className={styles.resolvedTreeItem}
      data-tree-resolved-node-id={node.id}
      onClick={event => {
        event.stopPropagation()
        setSelection(resolvedDefinitionNodeSelection(node.screenId, node.instanceId!, node.nodePath!))
      }}
      onContextMenu={event => {
        event.preventDefault()
        event.stopPropagation()
        setSelection(resolvedDefinitionNodeSelection(node.screenId, node.instanceId!, node.nodePath!))
      }}
      onKeyDown={event => {
        if (
          event.key === 'ContextMenu' ||
          (event.key === 'F10' && event.shiftKey)
        ) {
          event.preventDefault()
          event.stopPropagation()
          setSelection(resolvedDefinitionNodeSelection(
            node.screenId,
            node.instanceId!,
            node.nodePath!,
          ))
          return
        }
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        setSelection(resolvedDefinitionNodeSelection(node.screenId, node.instanceId!, node.nodePath!))
      }}
    >
      <div
        className={`${styles.node} ${selected ? styles.selected : ''}`}
        style={{ paddingInlineStart: `${8 + Math.min(depth, 3) * 16}px` }}
      >
        <span className={styles.disclosurePlaceholder} aria-hidden="true" />
        <span className={styles.nodeBody}>
          <span className={styles.nodeLabel}>
            <span className={styles.kind}>{node.kind}</span>
            <span className={styles.name} title={label}>{label}</span>
          </span>
        </span>
      </div>
      {node.childIds.length > 0 ? (
        <ul className={styles.children} role="group">
          {node.childIds.map(childId => (
            <ResolvedTreeNode
              key={childId}
              runtimeId={childId}
              resolved={resolved}
              depth={depth + 1}
              locale={_locale}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
