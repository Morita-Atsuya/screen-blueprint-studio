import { useAppStore } from '../../app/appStore'
import styles from './ChangeSetBar.module.css'

export function ChangeSetBar() {
  const { activeChangeSet, acceptChangeSet, rejectChangeSet } = useAppStore()
  if (!activeChangeSet) return null

  return (
    <div className={styles.bar}>
      <div className={styles.info}>
        <span className={styles.label}>提案を確認中:</span>
        <span className={styles.summary}>{activeChangeSet.summary}</span>
        <span className={styles.count}>{activeChangeSet.operations.length}件の変更</span>
      </div>
      <div className={styles.actions}>
        <button className={styles.reject} onClick={rejectChangeSet}>却下</button>
        <button className={styles.accept} onClick={acceptChangeSet}>承認</button>
      </div>
    </div>
  )
}
