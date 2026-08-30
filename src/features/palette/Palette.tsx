import { useDraggable } from '@dnd-kit/core'
import { useAppStore } from '../../app/appStore'
import { CONTAINER_KINDS } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import type { PaletteItem } from './componentFactory'
import { createAddComponentCommand, PALETTE_ITEMS } from './componentFactory'
import { COMPONENT_KIND_MESSAGE_KEYS } from '../../domain/componentDisplayLabel'
import { useI18n } from '../../i18n/I18nProvider'
import styles from './Palette.module.css'

export function Palette() {
  const { locale, t } = useI18n()
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
      locale,
    )
    dispatch(command, `Add component: ${item.kind}`)
    setSelectedComponent(command.componentId)
  }

  return (
    <div className={styles.root}>
      <ul className={styles.list}>
        {PALETTE_ITEMS.map(item => (
          <PaletteButton
            key={item.kind}
            item={item}
            label={t(COMPONENT_KIND_MESSAGE_KEYS[item.kind])}
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
  label,
  disabled,
  onAdd,
}: {
  item: PaletteItem
  label: string
  disabled: boolean
  onAdd(): void
}) {
  const { t } = useI18n()
  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id: `palette:${item.kind}`,
    data: { type: 'palette', kind: item.kind, label },
    disabled,
  })

  return (
    <li ref={setNodeRef} className={isDragging ? styles.dragging : ''}>
      <button
        className={styles.item}
        onClick={onAdd}
        disabled={disabled}
        aria-label={t('palette.addOrDrag', { label })}
        data-palette-kind={item.kind}
        {...attributes}
        {...listeners}
      >
        <span className={styles.grip} aria-hidden="true">⠿</span>
        {label}
      </button>
    </li>
  )
}
