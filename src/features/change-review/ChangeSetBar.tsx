import { useAppStore } from '../../app/appStore'
import styles from './ChangeSetBar.module.css'
import { useI18n } from '../../i18n/I18nProvider'

export function ChangeSetBar() {
  const { t } = useI18n()
  const { activeChangeSet, acceptChangeSet, rejectChangeSet } = useAppStore()
  if (!activeChangeSet) return null

  return (
    <div className={styles.bar}>
      <div className={styles.info}>
        <span className={styles.label}>{t('changes.reviewing')}</span>
        <span className={styles.summary}>{activeChangeSet.summary}</span>
        <span className={styles.count}>{t('changes.count', { count: activeChangeSet.operations.length })}</span>
      </div>
      <div className={styles.actions}>
        <button className={styles.reject} onClick={rejectChangeSet}>{t('changes.reject')}</button>
        <button className={styles.accept} onClick={acceptChangeSet}>{t('changes.accept')}</button>
      </div>
    </div>
  )
}
