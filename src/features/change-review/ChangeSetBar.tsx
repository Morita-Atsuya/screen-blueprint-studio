import { useAppStore } from '../../app/appStore'
import styles from './ChangeSetBar.module.css'
import { useI18n } from '../../i18n/I18nProvider'
import { changeSetOperationCountMessage } from '../../i18n/messages'

export function ChangeSetBar() {
  const { formatMessage, t } = useI18n()
  const { activeChangeSet, acceptChangeSet, rejectChangeSet } = useAppStore()
  if (!activeChangeSet) return null

  return (
    <div className={styles.bar}>
      <div className={styles.info}>
        <span className={styles.label}>{t('changes.reviewing')}</span>
        <span className={styles.summary}>{activeChangeSet.summary}</span>
        <span className={styles.count}>
          {formatMessage(changeSetOperationCountMessage(activeChangeSet.operations.length))}
        </span>
      </div>
      <div className={styles.actions}>
        <button
          className={styles.reject}
          aria-label={t('changes.rejectAria')}
          onClick={rejectChangeSet}
        >
          {t('changes.reject')}
        </button>
        <button
          className={styles.accept}
          aria-label={t('changes.acceptAria')}
          onClick={() => acceptChangeSet(t('changes.acceptHistory', {
            summary: activeChangeSet.summary,
          }))}
        >
          {t('changes.accept')}
        </button>
      </div>
    </div>
  )
}
