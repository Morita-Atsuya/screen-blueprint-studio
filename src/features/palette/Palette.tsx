import { useDraggable } from '@dnd-kit/core'
import { useAppStore } from '../../app/appStore'
import { CONTAINER_KINDS } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import type { PaletteItem } from './componentFactory'
import { createAddComponentCommand, PALETTE_ITEMS } from './componentFactory'
import styles from './Palette.module.css'

export function Palette() {
  const { effectiveDocument, ui, dispatch, setSelectedComponent } = useAppStore()
  const activeScreenId = ui.activeScreenId

  function handleAdd(item: PaletteItem) {
    if (!activeScreenId) return
    const screen = getOwnEntity(effectiveDocument.screens, activeScreenId)
    if (!screen) return

    let parentId = screen.rootComponentId
    const selected = ui.selectedComponentId
      ? getOwnEntity(effectiveDocument.components, ui.selectedComponentId)
      : undefined
    if (selected && CONTAINER_KINDS.includes(selected.kind)) {
      parentId = selected.id
    } else if (selected?.parentId) {
      parentId = selected.parentId
    }

    const command = createAddComponentCommand(
      effectiveDocument,
      activeScreenId,
      parentId,
      item.kind,
    )
    dispatch(command, `コンポーネント追加: ${item.kind}`)
    setSelectedComponent(command.componentId)
  }

  return (
    <div className={styles.root}>
      <p className={styles.hint}>クリックで選択先へ追加、ドラッグで位置を指定</p>
      <ul className={styles.list}>
        {PALETTE_ITEMS.map(item => (
          <PaletteButton
            key={item.kind}
            item={item}
            disabled={!activeScreenId}
            onAdd={() => handleAdd(item)}
          />
        ))}
      </ul>
    </div>
  )
}

function PaletteButton({
  item,
  disabled,
  onAdd,
}: {
  item: PaletteItem
  disabled: boolean
  onAdd(): void
}) {
  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id: `palette:${item.kind}`,
    data: { type: 'palette', kind: item.kind, label: item.label },
    disabled,
  })

  return (
    <li ref={setNodeRef} className={isDragging ? styles.dragging : ''}>
      <button
        className={styles.item}
        onClick={onAdd}
        disabled={disabled}
        aria-label={`${item.label}を追加またはドラッグ`}
        data-palette-kind={item.kind}
        {...attributes}
        {...listeners}
      >
        <span className={styles.grip} aria-hidden="true">⠿</span>
        {item.label}
      </button>
    </li>
  )
}
