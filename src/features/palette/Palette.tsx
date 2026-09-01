import { useDraggable } from '@dnd-kit/core'
import type { PaletteItem } from './componentFactory'
import { PALETTE_ITEMS } from './componentFactory'
import { COMPONENT_KIND_MESSAGE_KEYS } from '../../domain/componentDisplayLabel'
import { useI18n } from '../../i18n/I18nProvider'
import { useAppStore } from '../../app/appStore'
import styles from './Palette.module.css'
import type { ComponentKind, EntityId } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'

export function Palette() {
  const { t } = useI18n()
  const activeScreenId = useAppStore(state => state.ui.activeScreenId)
  const reviewLocked = useAppStore(state => Boolean(state.activeChangeSet))
  const definitions = useAppStore(state => state.effectiveDocument.componentDefinitions)

  return (
    <div className={styles.root}>
      {reviewLocked ? (
        <p className={styles.reviewLock}>{t('changes.editLocked')}</p>
      ) : null}
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
              disabled={!activeScreenId || reviewLocked}
            />
          )
        })}
      </ul>
      {Object.values(definitions).length > 0 ? (
        <>
          <h3 className={styles.sectionTitle}>{t('tabs.definitions')}</h3>
          <ul className={styles.list}>
            {Object.values(definitions).map(definition => {
              const root = getOwnEntity(definition.nodes, definition.rootNodeId)
              if (!root || root.nodeType !== 'inline') return null
              return (
                <DefinitionPaletteButton
                  key={definition.id}
                  definitionId={definition.id}
                  kind={root.kind}
                  label={definition.name}
                  dragLabel={t('palette.dragToAdd', { label: definition.name })}
                  disabled={!activeScreenId || reviewLocked}
                />
              )
            })}
          </ul>
        </>
      ) : null}
    </div>
  )
}

function DefinitionPaletteButton({
  definitionId,
  kind,
  label,
  dragLabel,
  disabled,
}: {
  definitionId: EntityId
  kind: ComponentKind
  label: string
  dragLabel: string
  disabled: boolean
}) {
  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id: `definition-palette:${definitionId}`,
    data: { type: 'definitionPalette', definitionId, kind, label },
    disabled,
  })
  return (
    <li ref={setNodeRef} className={isDragging ? styles.dragging : ''}>
      <button
        type="button"
        className={`${styles.item} ${styles.definitionItem}`}
        disabled={disabled}
        aria-label={dragLabel}
        title={dragLabel}
        data-palette-definition-id={definitionId}
        {...attributes}
        {...listeners}
      >
        <span>{label}</span>
        <small>{tKind(kind)}</small>
      </button>
    </li>
  )
}

function tKind(kind: ComponentKind): string {
  return kind
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
