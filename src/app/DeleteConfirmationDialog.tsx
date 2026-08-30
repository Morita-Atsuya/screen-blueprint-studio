import { useId, useLayoutEffect, useRef } from 'react'
import { useAppStore } from './appStore'
import type { DeleteImpactCounts, DeleteTargetKind } from '../domain/deleteImpact'
import { getOwnEntity } from '../domain/entityMap'
import { getComponentDisplayLabel } from '../domain/componentDisplayLabel'
import { effectiveComponent } from '../domain/selectors'
import type { ProjectDocument, ScreenState } from '../domain/model'
import { useI18n } from '../i18n/I18nProvider'
import { trapDialogFocus } from '../features/inspector/dialogFocus'
import type { MessageKey } from '../i18n/messages'
import styles from './DeleteConfirmationDialog.module.css'

const COUNT_MESSAGE_KEYS: Record<keyof DeleteImpactCounts, MessageKey> = {
  components: 'delete.impact.components',
  states: 'delete.impact.states',
  events: 'delete.impact.events',
  eventActions: 'delete.impact.eventActions',
  apiOperations: 'delete.impact.apiOperations',
  apiBindings: 'delete.impact.apiBindings',
  stateOverrides: 'delete.impact.stateOverrides',
  buttonEventConnections: 'delete.impact.buttonEventConnections',
  apiStateConnections: 'delete.impact.apiStateConnections',
}

export function DeleteConfirmationDialog() {
  const { locale, t, formatMessage } = useI18n()
  const {
    pendingDelete,
    effectiveDocument,
    ui,
    confirmPendingDelete,
    acknowledgePendingDeleteImpact,
    cancelPendingDelete,
  } = useAppStore()
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useLayoutEffect(() => {
    if (!pendingDelete) return
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    cancelRef.current?.focus()
    return () => {
      requestAnimationFrame(() => {
        const returnTarget = returnFocusRef.current
        if (returnTarget?.isConnected) {
          returnTarget.focus()
        } else {
          const currentFocus = document.activeElement
          if (
            currentFocus instanceof HTMLElement &&
            currentFocus !== document.body &&
            currentFocus.isConnected
          ) {
            return
          }
          document.querySelector<HTMLElement>('[data-delete-focus-fallback]')?.focus()
        }
      })
    }
  }, [pendingDelete?.id])

  useLayoutEffect(() => {
    if (pendingDelete?.needsReviewAcknowledgement) cancelRef.current?.focus()
  }, [pendingDelete?.needsReviewAcknowledgement])

  if (!pendingDelete) return null

  const activeState = ui.activeStateId
    ? getOwnEntity(effectiveDocument.screenStates, ui.activeStateId)
    : undefined
  const targetLabel = resolveTargetLabel(
    effectiveDocument,
    pendingDelete.analysis.target.kind,
    pendingDelete.analysis.target.id,
    locale,
    activeState,
    t('delete.targetUnavailable'),
  )
  const impacts = Object.entries(pendingDelete.analysis.counts)
    .filter((entry): entry is [keyof DeleteImpactCounts, number] => entry[1] > 0)

  return (
    <div
      className={styles.backdrop}
      onMouseDown={event => {
        if (event.target === event.currentTarget) cancelPendingDelete()
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          cancelPendingDelete()
          return
        }
        if (event.key === 'Tab') trapDialogFocus(event, dialogRef.current)
      }}
    >
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-delete-confirmation={pendingDelete.analysis.target.kind}
      >
        <h2 id={titleId} className={styles.title}>{t('delete.confirmTitle')}</h2>
        <p id={descriptionId} className={styles.question}>
          {t('delete.question', { label: targetLabel })}
        </p>
        <p className={styles.intro}>{t('delete.impactIntro')}</p>
        <ul className={styles.impactList}>
          {impacts.map(([key, count]) => (
            <li key={key}>{t(COUNT_MESSAGE_KEYS[key], { count })}</li>
          ))}
        </ul>
        {pendingDelete.notice ? (
          <p className={styles.notice} role="alert">
            {formatMessage(pendingDelete.notice)}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.cancel}
            onClick={cancelPendingDelete}
          >
            {t('common.cancel')}
          </button>
          {pendingDelete.needsReviewAcknowledgement ? (
            <button
              type="button"
              className={styles.review}
              onClick={() => {
                cancelRef.current?.focus()
                acknowledgePendingDeleteImpact()
              }}
            >
              {t('delete.reviewUpdated')}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.delete}
            onClick={confirmPendingDelete}
            disabled={pendingDelete.needsReviewAcknowledgement}
          >
            {t('delete.confirm')}
          </button>
        </div>
      </section>
    </div>
  )
}

function resolveTargetLabel(
  document: ProjectDocument,
  kind: DeleteTargetKind,
  id: string,
  locale: 'ja' | 'en',
  activeState: ScreenState | undefined,
  fallback: string,
): string {
  switch (kind) {
    case 'screen':
      return getOwnEntity(document.screens, id)?.name ?? fallback
    case 'component': {
      const component = getOwnEntity(document.components, id)
      return component
        ? getComponentDisplayLabel(effectiveComponent(component, activeState), locale)
        : fallback
    }
    case 'state':
      return getOwnEntity(document.screenStates, id)?.name ?? fallback
    case 'event':
      return getOwnEntity(document.events, id)?.name ?? fallback
    case 'api':
      return getOwnEntity(document.apiOperations, id)?.name ?? fallback
  }
}
