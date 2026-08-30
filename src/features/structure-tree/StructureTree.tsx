import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useAppStore } from '../../app/appStore'
import type { EntityId, ProjectDocument, Screen, ScreenState } from '../../domain/model'
import { CONTAINER_KINDS } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import {
  getComponentHierarchyLabel,
} from '../../domain/componentDisplayLabel'
import { COMPONENT_KIND_MESSAGE_KEYS } from '../../domain/componentDisplayLabel'
import { effectiveComponent } from '../../domain/selectors'
import { useI18n } from '../../i18n/I18nProvider'
import { ComponentDropZone } from '../../dnd/ComponentDropZone'
import { draggableComponentId } from '../../dnd/editorDnd'
import {
  persistStructureTreePreferences,
  resolveInitialStructureTreePreferences,
  type StructureTreePreferences,
} from './structureTreePreferences'
import { useComponentAddMenu } from '../component-add-menu/ComponentAddMenu'
import type { ComponentAddMenuTrigger } from '../component-add-menu/ComponentAddMenu'
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
  const { effectiveDocument, ui, setSelectedComponent, dispatch } = useAppStore()
  const { activeScreenId, selectedComponentId } = ui
  const [treePreferences, setTreePreferences] = useState<StructureTreePreferences>(() =>
    resolveInitialStructureTreePreferences(browserStorage()),
  )
  const componentAddMenu = useComponentAddMenu()
  const nodeRefs = useRef(new Map<EntityId, HTMLDivElement>())
  const lastScrolledKeyRef = useRef<string | null>(null)
  const screen = activeScreenId ? getOwnEntity(effectiveDocument.screens, activeScreenId) : undefined
  const activeState = ui.activeStateId
    ? getOwnEntity(effectiveDocument.screenStates, ui.activeStateId)
    : undefined

  function move(id: EntityId, direction: -1 | 1) {
    const component = getOwnEntity(effectiveDocument.components, id)
    if (!component?.parentId) return
    const parent = getOwnEntity(effectiveDocument.components, component.parentId)
    if (!parent) return
    const index = parent.childIds.indexOf(id)
    const position = index + direction
    if (index < 0 || position < 0 || position >= parent.childIds.length) return
    dispatch(
      { type: 'moveComponent', componentId: id, newParentId: parent.id, position },
      direction < 0 ? 'Move component up' : 'Move component down',
    )
  }

  function remove(id: EntityId) {
    dispatch({ type: 'removeComponent', componentId: id }, 'Delete component')
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

  useEffect(() => {
    if (!selectedComponentId) {
      lastScrolledKeyRef.current = null
      return
    }
    const selected = getOwnEntity(effectiveDocument.components, selectedComponentId)
    if (!selected || selected.screenId !== activeScreenId) {
      lastScrolledKeyRef.current = null
      return
    }
    const revealKey = `${activeScreenId}:${selectedComponentId}`
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
    if (lastScrolledKeyRef.current === revealKey) return
    nodeRefs.current.get(selectedComponentId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    lastScrolledKeyRef.current = revealKey
  }, [activeScreenCollapsedIds, activeScreenId, effectiveDocument, selectedComponentId])

  if (!activeScreenId) return <p className={styles.empty}>{t('tree.selectScreen')}</p>
  if (!screen) return null

  return (
    <>
      <ul className={styles.root}>
        <TreeNode
          componentId={screen.rootComponentId}
          depth={0}
          document={effectiveDocument}
          activeState={activeState}
          selectedComponentId={selectedComponentId}
          onSelect={setSelectedComponent}
          onMove={move}
          onRemove={remove}
          locale={locale}
          t={t}
          collapsedIds={activeScreenCollapsedIds}
          onToggleCollapse={componentId =>
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
          addMenu={componentAddMenu.trigger}
          registerNodeRef={(componentId, element) => {
            if (element) {
              nodeRefs.current.set(componentId, element)
            } else {
              nodeRefs.current.delete(componentId)
            }
          }}
        />
        {screen.modalComponentIds.map(modalId => (
          <TreeNode
            key={modalId}
            componentId={modalId}
            depth={0}
            document={effectiveDocument}
            activeState={activeState}
            selectedComponentId={selectedComponentId}
            onSelect={setSelectedComponent}
            onMove={move}
            onRemove={remove}
            locale={locale}
            t={t}
            collapsedIds={activeScreenCollapsedIds}
            onToggleCollapse={componentId =>
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
            addMenu={componentAddMenu.trigger}
            registerNodeRef={(componentId, element) => {
              if (element) {
                nodeRefs.current.set(componentId, element)
              } else {
                nodeRefs.current.delete(componentId)
              }
            }}
          />
        ))}
      </ul>
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
  locale: 'ja' | 'en'
  t: ReturnType<typeof useI18n>['t']
  collapsedIds: Set<EntityId>
  onToggleCollapse(componentId: EntityId): void
  addMenu: ComponentAddMenuTrigger
  registerNodeRef(componentId: EntityId, element: HTMLDivElement | null): void
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
  locale,
  t,
  collapsedIds,
  onToggleCollapse,
  addMenu,
  registerNodeRef,
}: TreeNodeProps) {
  const baseComponent = getOwnEntity(document.components, componentId)
  const component = baseComponent
    ? effectiveComponent(baseComponent, activeState)
    : undefined
  const ownerScreen = component
    ? getOwnEntity(document.screens, component.screenId)
    : undefined
  const isIndependentRoot = component?.parentId === null
  const isPageRoot = component?.kind === 'page' && isIndependentRoot
  const isModalRoot = component?.kind === 'modal' && isIndependentRoot
  const kindLabel = component ? t(COMPONENT_KIND_MESSAGE_KEYS[component.kind]) : ''
  const spokenLabel = component
    ? isPageRoot
      ? ownerScreen?.name ?? kindLabel
      : getComponentHierarchyLabel(document, component, locale)
    : ''
  const visibleLabel = component
    ? CONTAINER_KINDS.includes(component.kind) && !isPageRoot && !isModalRoot
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
        }
      : undefined,
    disabled: { draggable: isIndependentRoot, droppable: true },
  })

  if (!component) return null
  const isSelected = selectedComponentId === component.id
  const isContainer = CONTAINER_KINDS.includes(component.kind)
  const hasChildren = isContainer && component.childIds.length > 0
  const isCollapsed = hasChildren && collapsedIds.has(component.id)
  const disclosureLabel = hasChildren
    ? t(isCollapsed ? 'tree.disclosureExpand' : 'tree.disclosureCollapse', { label: spokenLabel })
    : ''
  const parent = component.parentId
    ? getOwnEntity(document.components, component.parentId)
    : undefined
  const siblingIndex = parent?.childIds.indexOf(component.id) ?? -1
  const style: CSSProperties = {
    paddingLeft: `${8 + depth * 16}px`,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
      : undefined,
    transition,
  }

  return (
    <li
      className={`${styles.nodeWrapper} ${isIndependentRoot ? styles.independentRoot : ''} ${isModalRoot ? styles.modalRoot : ''}`}
      data-tree-root={isPageRoot ? 'page' : isModalRoot ? 'modal' : undefined}
      aria-label={spokenLabel || undefined}
    >
      <div
        ref={element => {
          setNodeRef(element)
          registerNodeRef(component.id, element)
        }}
        className={`${styles.node} ${isSelected ? styles.selected : ''} ${isDragging ? styles.dragging : ''}`}
        style={style}
        tabIndex={isIndependentRoot ? 0 : -1}
        onClick={() => onSelect(component.id)}
        onContextMenu={event => {
          onSelect(component.id)
          addMenu.openFromPointer(event, component.id)
        }}
        onKeyDown={event => {
          if (addMenu.openFromKeyboard(event, component.id)) onSelect(component.id)
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
            title={t('tree.drag')}
            data-drag-surface="tree"
            data-drag-component={component.id}
            onClick={event => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        )}
        <span className={styles.kind}>{t(COMPONENT_KIND_MESSAGE_KEYS[component.kind])}</span>
        {visibleLabel ? <span className={styles.name}>{visibleLabel}</span> : null}
        {!isPageRoot && (
          <div className={styles.nodeActions}>
            {!isIndependentRoot ? (
              <>
                <button
                  className={styles.iconBtn}
                  title={t('tree.moveUp')}
                  aria-label={t('tree.moveUpAria', { label: spokenLabel })}
                  disabled={siblingIndex <= 0}
                  onClick={event => { event.stopPropagation(); onMove(component.id, -1) }}
                >↑</button>
                <button
                  className={styles.iconBtn}
                  title={t('tree.moveDown')}
                  aria-label={t('tree.moveDownAria', { label: spokenLabel })}
                  disabled={!parent || siblingIndex < 0 || siblingIndex >= parent.childIds.length - 1}
                  onClick={event => { event.stopPropagation(); onMove(component.id, 1) }}
                >↓</button>
              </>
            ) : null}
            <button
              className={`${styles.iconBtn} ${styles.danger}`}
              title={t('tree.delete')}
              aria-label={t('tree.deleteAria', { label: spokenLabel })}
              onClick={event => { event.stopPropagation(); onRemove(component.id) }}
            >×</button>
          </div>
        )}
      </div>
      {hasChildren && !isCollapsed && (
        <SortableContext
          items={component.childIds.map(id => draggableComponentId('tree', id))}
          strategy={verticalListSortingStrategy}
        >
          <ul className={styles.children}>
            {component.childIds.map((childId, index) => (
              <Fragment key={childId}>
                <li className={styles.dropItem}>
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
                  locale={locale}
                  t={t}
                  collapsedIds={collapsedIds}
                  onToggleCollapse={onToggleCollapse}
                  addMenu={addMenu}
                  registerNodeRef={registerNodeRef}
                />
              </Fragment>
            ))}
            <li className={styles.dropItem}>
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
      {hasChildren && isCollapsed && (
        <ul className={styles.children}>
          <li className={styles.dropItem}>
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
