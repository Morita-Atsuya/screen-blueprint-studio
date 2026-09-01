import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { useAppStore } from './appStore'

export interface DialogReviewLock {
  reviewLocked: boolean
  staleAfterReview: boolean
}

export function useDialogReviewLock(): DialogReviewLock {
  const activeChangeSet = useAppStore(state => state.activeChangeSet)
  const revision = useAppStore(state => state.revision)
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

export function useDialogDraftFieldsetFocus(draftLocked: boolean) {
  const fieldsetRef = useRef<HTMLFieldSetElement>(null)
  const hadDraftFocus = useRef(false)
  useLayoutEffect(() => {
    const fieldset = fieldsetRef.current
    if (!draftLocked || !fieldset) return
    const activeElement = document.activeElement
    const focusWasDisabled = (
      hadDraftFocus.current &&
      (activeElement === document.body || activeElement === null)
    )
    if (!fieldset.contains(activeElement) && !focusWasDisabled) return
    const dialog = fieldset.closest<HTMLElement>('[role="dialog"]')
    const reviewAction = dialog?.querySelector<HTMLElement>(
      '[data-dialog-review-actions] button:not(:disabled)',
    )
    const fallback = dialog?.querySelector<HTMLElement>('button:not(:disabled)')
    const target = reviewAction ?? fallback
    target?.focus()
    hadDraftFocus.current = false
  }, [draftLocked])
  return {
    ref: fieldsetRef,
    onFocusCapture() {
      hadDraftFocus.current = true
    },
    onBlurCapture(event: React.FocusEvent<HTMLFieldSetElement>) {
      const nextTarget = event.relatedTarget
      if (
        !nextTarget ||
        !(nextTarget instanceof Node) ||
        !event.currentTarget.contains(nextTarget)
      ) {
        hadDraftFocus.current = false
      }
    },
  }
}
