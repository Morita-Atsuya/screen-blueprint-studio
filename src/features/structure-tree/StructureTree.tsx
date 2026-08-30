import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import { useAppStore } from '../../app/appStore'
import type { EntityId, ProjectDocument } from '../../domain/model'
import { CONTAINER_KINDS } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import { deriveComponentDisplayName } from '../../domain/componentDisplayName'
import { ComponentDropZone } from '../../dnd/ComponentDropZone'
import { draggableComponentId } from '../../dnd/editorDnd'
import styles from './StructureTree.module.css'

export function StructureTree() {
  const { effectiveDocument, ui, setSelectedComponent, dispatch } = useAppStore()
  const { activeScreenId, selectedComponentId } = ui

  if (!activeScreenId) return <p className={styles.empty}>画面を選択してください</p>

  const screen = getOwnEntity(effectiveDocument.screens, activeScreenId)
  if (!screen) return null

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
      direction < 0 ? '上へ移動' : '下へ移動',
    )
  }

  function remove(id: EntityId) {
    dispatch({ type: 'removeComponent', componentId: id }, 'コンポーネント削除')
  }

  return (
    <ul className={styles.root}>
      <TreeNode
        componentId={screen.rootComponentId}
        depth={0}
        document={effectiveDocument}
        selectedComponentId={selectedComponentId}
        onSelect={setSelectedComponent}
        onMove={move}
        onRemove={remove}
      />
    </ul>
  )
}

interface TreeNodeProps {
  componentId: EntityId
  depth: number
  document: ProjectDocument
  selectedComponentId: EntityId | null
  onSelect(id: EntityId): void
  onMove(id: EntityId, direction: -1 | 1): void
  onRemove(id: EntityId): void
}

function TreeNode({
  componentId,
  depth,
  document,
  selectedComponentId,
  onSelect,
  onMove,
  onRemove,
}: TreeNodeProps) {
  const component = getOwnEntity(document.components, componentId)
  const screenName = component
    ? getOwnEntity(document.screens, component.screenId)?.name
    : undefined
  const displayName = component
    ? deriveComponentDisplayName(component, screenName)
    : ''
  const isRoot = component?.parentId === null
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
          label: displayName,
        }
      : undefined,
    disabled: { draggable: isRoot, droppable: true },
  })

  if (!component) return null
  const isSelected = selectedComponentId === component.id
  const isContainer = CONTAINER_KINDS.includes(component.kind)
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
    <li className={styles.nodeWrapper}>
      <div
        ref={setNodeRef}
        className={`${styles.node} ${isSelected ? styles.selected : ''} ${isDragging ? styles.dragging : ''}`}
        style={style}
        onClick={() => onSelect(component.id)}
      >
        {!isRoot && (
          <button
            className={styles.dragHandle}
            aria-label={`${displayName}を並び替え`}
            title="ドラッグして移動"
            data-drag-surface="tree"
            data-drag-component={component.id}
            onClick={event => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        )}
        <span className={styles.kind}>{component.kind}</span>
        <span className={styles.name}>{displayName}</span>
        {!isRoot && (
          <div className={styles.nodeActions}>
            <button
              className={styles.iconBtn}
              title="上へ移動"
              aria-label={`${displayName}を上へ移動`}
              disabled={siblingIndex <= 0}
              onClick={event => { event.stopPropagation(); onMove(component.id, -1) }}
            >↑</button>
            <button
              className={styles.iconBtn}
              title="下へ移動"
              aria-label={`${displayName}を下へ移動`}
              disabled={!parent || siblingIndex < 0 || siblingIndex >= parent.childIds.length - 1}
              onClick={event => { event.stopPropagation(); onMove(component.id, 1) }}
            >↓</button>
            <button
              className={`${styles.iconBtn} ${styles.danger}`}
              title="削除"
              aria-label={`${displayName}を削除`}
              onClick={event => { event.stopPropagation(); onRemove(component.id) }}
            >×</button>
          </div>
        )}
      </div>
      {isContainer && (
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
                    label={index === 0 ? `${displayName}の先頭` : `${index + 1}番目`}
                  />
                </li>
                <TreeNode
                  componentId={childId}
                  depth={depth + 1}
                  document={document}
                  selectedComponentId={selectedComponentId}
                  onSelect={onSelect}
                  onMove={onMove}
                  onRemove={onRemove}
                />
              </Fragment>
            ))}
            <li className={styles.dropItem}>
              <ComponentDropZone
                surface="tree"
                parentId={component.id}
                screenId={component.screenId}
                position={component.childIds.length}
                label={`${displayName}の末尾`}
                empty={component.childIds.length === 0}
              />
            </li>
          </ul>
        </SortableContext>
      )}
    </li>
  )
}
