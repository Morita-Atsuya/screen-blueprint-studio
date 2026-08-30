import { useState } from 'react'
import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import type { ScreenState, ScreenStateKind } from '../../domain/model'
import { useI18n } from '../../i18n/I18nProvider'
import styles from './StateDialog.module.css'

type EditableStateKind = Exclude<ScreenStateKind, 'default'>

interface StateDialogProps {
  mode: 'create' | 'edit'
  screenId: string
  state?: ScreenState
  onClose(): void
}

export function StateDialog({ mode, screenId, state, onClose }: StateDialogProps) {
  const { t } = useI18n()
  const { dispatch, setActiveState } = useAppStore()
  const [name, setName] = useState(state?.name ?? '')
  const [kind, setKind] = useState<EditableStateKind>(
    state && state.kind !== 'default' ? state.kind : 'loading',
  )
  const [description, setDescription] = useState(state?.description ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const titleId = `state-dialog-title-${state?.id ?? 'new'}`
  const canSubmit = name.trim().length > 0

  function save() {
    if (!canSubmit) return
    if (mode === 'create') {
      const stateId = nanoid()
      dispatch({
        type: 'createScreenState',
        stateId,
        screenId,
        name: name.trim(),
        kind,
        description,
      }, 'Create screen state')
      setActiveState(stateId)
    } else if (state && state.kind !== 'default') {
      dispatch({
        type: 'updateScreenState',
        stateId: state.id,
        name: name.trim(),
        kind,
        description,
      }, 'Update screen state')
    }
    onClose()
  }

  function remove() {
    if (!state || state.kind === 'default') return
    dispatch({ type: 'removeScreenState', stateId: state.id }, 'Delete screen state')
    onClose()
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
        }
      }}
    >
      <section
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
          <label className={styles.field}>
            <span>{t('states.name')}</span>
            <input
              autoFocus
              required
              value={name}
              onChange={event => setName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>{t('states.kind')}</span>
            <select
              value={kind}
              onChange={event => setKind(event.target.value as EditableStateKind)}
            >
              <option value="loading">{t('states.kindLoading')}</option>
              <option value="success">{t('states.kindSuccess')}</option>
              <option value="error">{t('states.kindError')}</option>
              <option value="custom">{t('states.kindCustom')}</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>{t('states.description')}</span>
            <textarea
              rows={3}
              value={description}
              onChange={event => setDescription(event.target.value)}
            />
          </label>

          {confirmingDelete && state ? (
            <div className={styles.confirm} role="alert">
              <p>{t('states.deleteConfirm', { name: state.name })}</p>
              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={() => setConfirmingDelete(false)}>
                  {t('common.cancel')}
                </button>
                <button type="button" className={styles.danger} onClick={remove}>
                  {t('states.delete')}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.actions}>
              {mode === 'edit' ? (
                <button
                  type="button"
                  className={styles.dangerOutline}
                  onClick={() => setConfirmingDelete(true)}
                >
                  {t('states.delete')}
                </button>
              ) : null}
              <span className={styles.spacer} />
              <button type="button" className={styles.secondary} onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button type="submit" className={styles.primary} disabled={!canSubmit}>
                {t(mode === 'create' ? 'states.create' : 'common.save')}
              </button>
            </div>
          )}
        </form>
      </section>
    </div>
  )
}
