import { useEffect, useId, useRef } from 'react'
import { useAppStore } from './appStore'

export interface DialogReviewLock {
  reviewLocked: boolean
  staleAfterReview: boolean
}

export function useDialogReviewLock(): DialogReviewLock {
  const activeChangeSet = useAppStore(state => state.activeChangeSet)
  const revision = useAppStore(state => state.document.revision)
  const setReviewDraftProtected = useAppStore(state => state.setReviewDraftProtected)
  const openedRevision = useRef(revision)
  const protectionId = useId()
  useEffect(() => {
    const id = `dialog:${protectionId}`
    setReviewDraftProtected(id, true)
    return () => setReviewDraftProtected(id, false)
  }, [protectionId, setReviewDraftProtected])
  return {
    reviewLocked: Boolean(activeChangeSet),
    staleAfterReview: !activeChangeSet && revision !== openedRevision.current,
  }
}
