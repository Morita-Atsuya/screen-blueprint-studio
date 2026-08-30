import { useLayoutEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import type { ScreenState } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import { useI18n } from '../../i18n/I18nProvider'
import styles from './StateDialog.module.css'
import {
  useDialogDraftFieldsetFocus,
  useDialogReviewLock,
} from '../../app/reviewLock'
import { DialogReviewActions } from '../change-review/DialogReviewActions'
import { trapDialogFocus } from '../inspector/dialogFocus'

interface StateDialogProps {
  mode: 'create' | 'edit'
  screenId: string
  state?: ScreenState
  onClose(): void
}

export function StateDialog({ mode, screenId, state, onClose }: StateDialogProps) {
  const { t } = useI18n()
  const { dispatch, effectiveDocument, requestHumanDelete, setActiveState } = useAppStore()
  const { reviewLocked, staleAfterReview } = useDialogReviewLock()
  const screen = getOwnEntity(effectiveDocument.screens, screenId)
  const isDefault = state?.id === screen?.defaultStateId
  const [name, setName] = useState(state?.name ?? t('states.newName'))
  const [description, setDescription] = useState(state?.description ?? '')
  const dialogRef = useRef<HTMLElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' &&
      typeof HTMLElement !== 'undefined' &&
      document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  )
  const titleId = `state-dialog-title-${state?.id ?? 'new'}`
  const reviewNoticeId = `state-dialog-review-${state?.id ?? 'new'}`
  const draftLocked = reviewLocked || staleAfterReview
  const draftFieldsetFocus = useDialogDraftFieldsetFocus(draftLocked)
  const canSubmit = name.trim().length > 0

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const initialFocus = reviewLocked
      ? dialog?.querySelector<HTMLElement>('[data-dialog-review-actions] button')
      : nameInputRef.current
    initialFocus?.focus()

    return () => {
      queueMicrotask(() => {
        requestAnimationFrame(() => {
          if (dialogRef.current === dialog) return
          const opener = returnFocusRef.current
          if (opener?.isConnected) {
            opener.focus()
            if (document.activeElement === opener) return
          }
          document.querySelector<HTMLElement>('[data-delete-focus-fallback]')?.focus()
        })
      })
    }
  }, [])

  function save() {
    if (reviewLocked || staleAfterReview || !canSubmit) return
    let saved = false
    if (mode === 'create') {
      const stateId = nanoid()
      saved = dispatch({
        type: 'createScreenState',
        stateId,
        screenId,
        name: name.trim(),
        description,
      }, 'Create screen state')
      if (saved) setActiveState(stateId)
    } else if (state && !isDefault) {
      saved = dispatch({
        type: 'updateScreenState',
        stateId: state.id,
        name: name.trim(),
        description,
      }, 'Update screen state')
    }
    if (saved) onClose()
  }

  function remove() {
    if (!state || isDefault) return
    requestHumanDelete(
      { type: 'removeScreenState', stateId: state.id },
      'Delete screen state',
      onClose,
    )
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        } else if (event.key === 'Tab') {
          trapDialogFocus(event, dialogRef.current)
        }
      }}
    >
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {t(mode === 'create' ? 'states.createTitle' : 'states.editTitle')}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
        <form
          onSubmit={event => {
            event.preventDefault()
            save()
          }}
        >
          {reviewLocked || staleAfterReview ? (
            <p
              id={reviewNoticeId}
              className={styles.reviewLockNotice}
              role={staleAfterReview ? 'alert' : 'status'}
            >
              {t(staleAfterReview ? 'changes.dialogDraftStale' : 'changes.dialogDraftLocked')}
            </p>
          ) : null}
          {reviewLocked ? <DialogReviewActions /> : null}
          <fieldset
            {...draftFieldsetFocus}
            className={styles.draftFields}
            disabled={draftLocked}
            aria-describedby={reviewLocked || staleAfterReview ? reviewNoticeId : undefined}
          >
            <label className={styles.field}>
              <span>{t('states.name')}</span>
              <input
                ref={nameInputRef}
                required
                value={name}
                onChange={event => setName(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>{t('states.description')}</span>
              <textarea
                rows={3}
                value={description}
                onChange={event => setDescription(event.target.value)}
              />
            </label>
          </fieldset>

          <div className={styles.actions}>
            {mode === 'edit' ? (
              <button
                type="button"
                className={styles.dangerOutline}
                onClick={remove}
                disabled={reviewLocked || staleAfterReview}
                data-state-delete
              >
                {t('states.delete')}
              </button>
            ) : null}
            <span className={styles.spacer} />
            <button type="button" className={styles.secondary} onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className={styles.primary}
              disabled={reviewLocked || staleAfterReview || !canSubmit}
            >
              {t(mode === 'create' ? 'states.create' : 'common.save')}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
