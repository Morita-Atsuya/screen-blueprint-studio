import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import { useAppStore } from '../../app/appStore'
import type { EntityId, ProjectDocument, ScreenState } from '../../domain/model'
import { CONTAINER_KINDS } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import { getComponentDisplayLabel } from '../../domain/componentDisplayLabel'
import { COMPONENT_KIND_MESSAGE_KEYS } from '../../domain/componentDisplayLabel'
import { effectiveComponent } from '../../domain/selectors'
import { useI18n } from '../../i18n/I18nProvider'
import { ComponentDropZone } from '../../dnd/ComponentDropZone'
import { draggableComponentId } from '../../dnd/editorDnd'
import styles from './StructureTree.module.css'

export function StructureTree() {
  const { locale, t } = useI18n()
  const { effectiveDocument, ui, setSelectedComponent, dispatch } = useAppStore()
  const { activeScreenId, selectedComponentId } = ui

  if (!activeScreenId) return <p className={styles.empty}>{t('tree.selectScreen')}</p>

  const screen = getOwnEntity(effectiveDocument.screens, activeScreenId)
  if (!screen) return null
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

  return (
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
        />
      ))}
    </ul>
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
  const displayName = component
    ? isPageRoot
      ? ownerScreen?.name ?? t('component.page')
      : isModalRoot
        ? t('canvas.modalFrameLabel', {
            number: (ownerScreen?.modalComponentIds.indexOf(component.id) ?? -1) + 1,
          })
        : getComponentDisplayLabel(component, locale)
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
          label: displayName,
        }
      : undefined,
    disabled: { draggable: isIndependentRoot, droppable: true },
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
    <li
      className={`${styles.nodeWrapper} ${isIndependentRoot ? styles.independentRoot : ''} ${isModalRoot ? styles.modalRoot : ''}`}
      data-tree-root={isPageRoot ? 'page' : isModalRoot ? 'modal' : undefined}
    >
      <div
        ref={setNodeRef}
        className={`${styles.node} ${isSelected ? styles.selected : ''} ${isDragging ? styles.dragging : ''}`}
        style={style}
        onClick={() => onSelect(component.id)}
      >
        {!isIndependentRoot && (
          <button
            className={styles.dragHandle}
            aria-label={t('tree.dragAria', { label: displayName })}
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
        <span className={styles.name}>{displayName}</span>
        {!isPageRoot && (
          <div className={styles.nodeActions}>
            {!isIndependentRoot ? (
              <>
                <button
                  className={styles.iconBtn}
                  title={t('tree.moveUp')}
                  aria-label={t('tree.moveUpAria', { label: displayName })}
                  disabled={siblingIndex <= 0}
                  onClick={event => { event.stopPropagation(); onMove(component.id, -1) }}
                >↑</button>
                <button
                  className={styles.iconBtn}
                  title={t('tree.moveDown')}
                  aria-label={t('tree.moveDownAria', { label: displayName })}
                  disabled={!parent || siblingIndex < 0 || siblingIndex >= parent.childIds.length - 1}
                  onClick={event => { event.stopPropagation(); onMove(component.id, 1) }}
                >↓</button>
              </>
            ) : null}
            <button
              className={`${styles.iconBtn} ${styles.danger}`}
              title={t('tree.delete')}
              aria-label={t('tree.deleteAria', { label: displayName })}
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
                    label={index === 0
                      ? t('dnd.first', { label: displayName })
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
                />
              </Fragment>
            ))}
            <li className={styles.dropItem}>
              <ComponentDropZone
                surface="tree"
                parentId={component.id}
                screenId={component.screenId}
                position={component.childIds.length}
                label={t('dnd.end', { label: displayName })}
              />
            </li>
          </ul>
        </SortableContext>
      )}
    </li>
  )
}
