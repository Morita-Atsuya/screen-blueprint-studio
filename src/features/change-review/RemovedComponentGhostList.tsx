import type { RemovedComponentChange } from '../../domain/changeSetComponentChanges'
import { getComponentHierarchyLabel } from '../../domain/componentDisplayLabel'
import { getOwnEntity } from '../../domain/entityMap'
import type { EntityId, ProjectDocument } from '../../domain/model'
import { useI18n } from '../../i18n/I18nProvider'
import { ComponentChangeBadge } from './ComponentChangeBadge'
import styles from './RemovedComponentGhostList.module.css'

export function RemovedComponentGhostList({
  baseDocument,
  previewDocument,
  removedComponents,
  activeScreenId,
  surface,
  onReview,
}: {
  baseDocument: ProjectDocument
  previewDocument: ProjectDocument
  removedComponents: RemovedComponentChange[]
  activeScreenId: EntityId
  surface: 'canvas' | 'tree'
  onReview(): void
}) {
  const { locale, t } = useI18n()
  const visibleRemoved = removedComponents.filter(change =>
    change.screenId === activeScreenId ||
    !getOwnEntity(previewDocument.screens, change.screenId)
  )
  if (visibleRemoved.length === 0) return null

  return (
    <section
      className={`${styles.root} ${styles[surface]}`}
      aria-label={t('changeMarker.removedHeading')}
      data-editor-chrome
      data-removed-component-ghosts={surface}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <h3 className={styles.heading}>{t('changeMarker.removedHeading')}</h3>
      <ul className={styles.list}>
        {visibleRemoved.map(change => {
          const component = getOwnEntity(baseDocument.components, change.componentId)
          if (!component) return null
          const screen = getOwnEntity(baseDocument.screens, change.screenId)
          const parent = change.parentId
            ? getOwnEntity(baseDocument.components, change.parentId)
            : undefined
          const label = getComponentHierarchyLabel(baseDocument, component, locale)
          const parentLabel = parent
            ? getComponentHierarchyLabel(baseDocument, parent, locale)
            : screen?.name ?? t('review.value.missing')
          const context = t('changeMarker.ghostContext', {
            screen: screen?.name ?? t('review.value.missing'),
            parent: parentLabel,
          })
          return (
            <li key={change.componentId} className={styles.item}>
              <button
                type="button"
                className={styles.reviewButton}
                data-removed-component-id={change.componentId}
                title={t('changeMarker.reviewRemoved', { label })}
                onClick={onReview}
              >
                <ComponentChangeBadge status="removed" label={label} />
                <span className={styles.text}>
                  <strong className={styles.label}>{label}</strong>
                  <span className={styles.context} title={context}>{context}</span>
                </span>
                <span className={styles.review}>{t('changeMarker.review')}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
