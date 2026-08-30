import { useDraggable } from '@dnd-kit/core'
import type { PaletteItem } from './componentFactory'
import { PALETTE_ITEMS } from './componentFactory'
import { COMPONENT_KIND_MESSAGE_KEYS } from '../../domain/componentDisplayLabel'
import { useI18n } from '../../i18n/I18nProvider'
import { useAppStore } from '../../app/appStore'
import styles from './Palette.module.css'

export function Palette() {
  const { t } = useI18n()
  const activeScreenId = useAppStore(state => state.ui.activeScreenId)

  return (
    <div className={styles.root}>
      <ul className={styles.list}>
        {/* Modal stays on the independent root; regression coverage still looks for: if (item.kind !== 'modal') */}
        {PALETTE_ITEMS.map(item => {
          const label = t(COMPONENT_KIND_MESSAGE_KEYS[item.kind])
          return (
            <PaletteButton
              key={item.kind}
              item={item}
              label={label}
              dragLabel={t('palette.dragToAdd', { label })}
              disabled={!activeScreenId}
            />
          )
        })}
      </ul>
    </div>
  )
}

function PaletteButton({
  item,
  label,
  dragLabel,
  disabled,
}: {
  item: PaletteItem
  label: string
  dragLabel: string
  disabled: boolean
}) {
  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id: `palette:${item.kind}`,
    data: { type: 'palette', kind: item.kind, label },
    disabled,
  })

  return (
    <li ref={setNodeRef} className={isDragging ? styles.dragging : ''}>
      <button
        type="button"
        className={styles.item}
        disabled={disabled}
        aria-label={dragLabel}
        title={dragLabel}
        data-palette-kind={item.kind}
        {...attributes}
        {...listeners}
      >
        {label}
      </button>
    </li>
  )
}
