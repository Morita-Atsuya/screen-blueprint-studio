import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { CSSProperties } from 'react'
import { useAppStore } from '../../app/appStore'
import type { EntityId, ProjectDocument, ScreenComponent, ScreenState } from '../../domain/model'
import { CONTAINER_KINDS } from '../../domain/model'
import { effectiveComponent } from '../../domain/selectors'
import { getOwnEntity } from '../../domain/entityMap'
import { deriveComponentDisplayName } from '../../domain/componentDisplayName'
import { ComponentDropZone } from '../../dnd/ComponentDropZone'
import { draggableComponentId } from '../../dnd/editorDnd'
import styles from './Canvas.module.css'

export function Canvas() {
  const { effectiveDocument, ui, setSelectedComponent, setActiveState } = useAppStore()
  const { activeScreenId, activeStateId, selectedComponentId } = ui

  if (!activeScreenId) {
    return <div className={styles.empty}>← 左から画面を選択してください</div>
  }

  const screen = getOwnEntity(effectiveDocument.screens, activeScreenId)
  if (!screen) return null
  const activeState = activeStateId
    ? getOwnEntity(effectiveDocument.screenStates, activeStateId)
    : undefined

  return (
    <div className={styles.root} onClick={() => setSelectedComponent(null)}>
      <div className={styles.stateBar}>
        {screen.stateIds.map(stateId => {
          const state = getOwnEntity(effectiveDocument.screenStates, stateId)
          if (!state) return null
          return (
            <button
              key={stateId}
              className={`${styles.stateBtn} ${activeStateId === stateId ? styles.stateBtnActive : ''}`}
              onClick={event => { event.stopPropagation(); setActiveState(stateId) }}
              aria-pressed={activeStateId === stateId}
            >
              {state.name}
            </button>
          )
        })}
      </div>
      <div className={styles.wireframe}>
        <CanvasComponent
          componentId={screen.rootComponentId}
          document={effectiveDocument}
          activeState={activeState}
          selectedComponentId={selectedComponentId}
          onSelect={setSelectedComponent}
        />
      </div>
    </div>
  )
}

interface CanvasComponentProps {
  componentId: EntityId
  document: ProjectDocument
  activeState?: ScreenState
  selectedComponentId: EntityId | null
  onSelect(id: EntityId): void
}

function CanvasComponent({
  componentId,
  document,
  activeState,
  selectedComponentId,
  onSelect,
}: CanvasComponentProps) {
  const base = getOwnEntity(document.components, componentId)
  const component = base ? effectiveComponent(base, activeState) : undefined
  const screenName = component
    ? getOwnEntity(document.screens, component.screenId)?.name
    : undefined
  const displayName = component
    ? deriveComponentDisplayName(component, screenName)
    : ''
  const isRoot = base?.parentId === null
  const {
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
  if (!component.common.visible) return null
  const isSelected = selectedComponentId === component.id
  const isContainer = CONTAINER_KINDS.includes(component.kind)
  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
      : undefined,
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      className={`${styles.comp} ${isSelected ? styles.selected : ''} ${isDragging ? styles.dragging : ''}`}
      style={style}
      onClick={event => { event.stopPropagation(); onSelect(component.id) }}
      data-component-id={component.id}
    >
      <div className={styles.componentChrome}>
        <span className={styles.componentKind}>{component.kind}</span>
        {!isRoot && (
          <button
            className={styles.dragHandle}
            aria-label={`${displayName}を並び替え`}
            title="ドラッグして移動"
            data-drag-surface="canvas"
            data-drag-component={component.id}
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        )}
      </div>
      <ComponentView comp={component} />
      {isContainer && (
        <SortableContext
          items={component.childIds.map(id => draggableComponentId('canvas', id))}
          strategy={verticalListSortingStrategy}
        >
          <div className={styles.children}>
            {component.childIds.map((childId, index) => (
              <div key={childId} className={styles.childSlot}>
                <ComponentDropZone
                  surface="canvas"
                  parentId={component.id}
                  screenId={component.screenId}
                  position={index}
                  label={index === 0 ? `${displayName}の先頭` : `${index + 1}番目`}
                />
                <CanvasComponent
                  componentId={childId}
                  document={document}
                  activeState={activeState}
                  selectedComponentId={selectedComponentId}
                  onSelect={onSelect}
                />
              </div>
            ))}
            <ComponentDropZone
              surface="canvas"
              parentId={component.id}
              screenId={component.screenId}
              position={component.childIds.length}
              label={`${displayName}の末尾`}
              empty={component.childIds.length === 0}
            />
          </div>
        </SortableContext>
      )}
    </div>
  )
}

function ComponentView({ comp }: { comp: ScreenComponent }) {
  const cfg = comp.config
  switch (cfg.kind) {
    case 'page':
      return <div className={styles.pageBadge}>{cfg.title}</div>
    case 'section':
      return <div className={styles.sectionTitle}>{cfg.title}</div>
    case 'stack':
      return <div className={styles.containerLabel}>Stack ({cfg.gap})</div>
    case 'columns':
      return <div className={styles.containerLabel}>Columns ({cfg.columns})</div>
    case 'actionArea':
      return <div className={styles.containerLabel}>Action Area ({cfg.align})</div>
    case 'heading':
      return <div className={`${styles.heading} ${styles[`h${cfg.level}`]}`}>{cfg.text}</div>
    case 'text':
      return <p className={styles.textComp}>{cfg.text}</p>
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
          <select disabled className={`${styles.fieldInput} ${styles.previewControl}`}>
            <option>選択してください</option>
            {cfg.options.map(option => <option key={option.value}>{option.label}</option>)}
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
      return (
        <div className={styles.modal}>
          <div className={styles.modalTitle}>{cfg.title}</div>
        </div>
      )
  }
}
