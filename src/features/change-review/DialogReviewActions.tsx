import { useEffect, useRef } from 'react'
import { useAppStore } from '../../app/appStore'
import { useI18n } from '../../i18n/I18nProvider'
import styles from './DialogReviewActions.module.css'

export function DialogReviewActions() {
  const { t } = useI18n()
  const { activeChangeSet, acceptChangeSet, rejectChangeSet } = useAppStore()
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dialog = rootRef.current?.closest<HTMLElement>('[role="dialog"]')
    return () => {
      requestAnimationFrame(() => {
        const activeElement = document.activeElement
        if (
          !dialog?.isConnected ||
          (activeElement !== document.body && activeElement?.isConnected)
        ) {
          return
        }
        dialog.querySelector<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
        )?.focus()
      })
    }
  }, [])
  if (!activeChangeSet) return null

  return (
    <div
      ref={rootRef}
      className={styles.root}
      role="group"
      aria-label={t('changes.reviewing')}
      data-dialog-review-actions
    >
      <button type="button" className={styles.reject} onClick={rejectChangeSet}>
        {t('changes.reject')}
      </button>
      <button
        type="button"
        className={styles.accept}
        onClick={() => acceptChangeSet(t('changes.acceptHistory', {
          summary: activeChangeSet.summary,
        }))}
      >
        {t('changes.accept')}
      </button>
    </div>
  )
}
