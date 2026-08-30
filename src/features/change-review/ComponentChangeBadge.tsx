import type { MouseEvent } from 'react'
import type { ComponentChangeStatus } from '../../domain/changeSetComponentChanges'
import { useI18n } from '../../i18n/I18nProvider'
import styles from './ComponentChangeBadge.module.css'

export type DisplayedComponentChangeStatus = ComponentChangeStatus | 'removed'

export function ComponentChangeBadge({
  status,
  label,
  onActivate,
}: {
  status: DisplayedComponentChangeStatus
  label: string
  onActivate?: () => void
}) {
  const { t } = useI18n()
  const statusLabel = t(`changeMarker.status.${status}`)
  const accessibleLabel = t('changeMarker.componentStatus', {
    label,
    status: statusLabel,
  })
  const content = t(`changeMarker.badge.${status}`)

  if (!onActivate) {
    return (
      <span
        className={styles.badge}
        data-change-status={status}
        aria-label={accessibleLabel}
        title={accessibleLabel}
      >
        {content}
      </span>
    )
  }

  function activate(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onActivate?.()
  }

  return (
    <button
      type="button"
      className={`${styles.badge} ${styles.interactive}`}
      data-change-status={status}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
      onClick={activate}
    >
      {content}
    </button>
  )
}
