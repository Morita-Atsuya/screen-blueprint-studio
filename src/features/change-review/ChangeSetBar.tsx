import { useState } from 'react'
import { useAppStore } from '../../app/appStore'
import styles from './ChangeSetBar.module.css'

export function ChangeSetBar() {
  const { activeChangeSet, acceptChangeSet, rejectChangeSet } = useAppStore()
  const [reason, setReason] = useState('')
  if (!activeChangeSet) return null

  const onReject = () => rejectChangeSet(reason)

  return (
    <div className={styles.bar}>
      <div className={styles.info}>
        <span className={styles.label}>提案を確認中:</span>
        <span className={styles.summary}>{activeChangeSet.summary}</span>
        <input className={styles.reason} value={reason} onChange={e => setReason(e.target.value)} placeholder="却下理由" />
      </div>
      <div className={styles.actions}>
        <button className={styles.reject} onClick={onReject}>却下</button>
        <button className={styles.accept} onClick={acceptChangeSet}>承認</button>
      </div>
    </div>
  )
}
