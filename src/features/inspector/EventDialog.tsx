import { useId, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import type { EventEditorContext } from '../../domain/componentBehavior'
import type { EventAction, ScreenEvent } from '../../domain/model'
import { useI18n } from '../../i18n/I18nProvider'
import styles from './EventDialog.module.css'

type DialogMode = 'create' | 'edit'
type DialogResult = 'cancelled' | 'saved' | 'deleted'
type ActionType = EventAction['type']

interface DraftAction {
  key: string
  value: EventAction
}

interface EventDialogProps {
  mode: DialogMode
  eventId?: string
  event?: ScreenEvent
  context: EventEditorContext
  onClose(result: DialogResult): void
}

export function EventDialog({
  mode,
  eventId,
  event,
  context,
  onClose,
}: EventDialogProps) {
  const { t } = useI18n()
  const dispatch = useAppStore(state => state.dispatch)
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const [name, setName] = useState(event?.name ?? t('behavior.newEventName'))
  const [triggerType, setTriggerType] = useState<'click' | 'submit'>(
    event?.trigger.type ?? 'click',
  )
  const [actions, setActions] = useState<DraftAction[]>(() =>
    (event?.actions ?? []).map(value => ({ key: nanoid(), value: { ...value } })),
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const persistedEventId = event?.id ?? eventId
  const eventAvailable = (
    mode === 'create' ||
    context.events.some(candidate => candidate.event.id === persistedEventId)
  )
  const canSubmit = (
    name.trim().length > 0 &&
    eventAvailable &&
    actions.every(action => isActionTargetAvailable(action.value, context))
  )

  function save() {
    if (!canSubmit || (mode === 'edit' && !persistedEventId)) return
    const eventActions = actions.map(action => action.value)
    let saved: boolean
    if (mode === 'create') {
      saved = dispatch({
        type: 'connectEvent',
        eventId: nanoid(),
        screenId: context.screenId,
        name: name.trim(),
        trigger: { type: triggerType, componentId: context.componentId },
        actions: eventActions,
      }, `${t('behavior.addEvent')}: ${name.trim()}`)
    } else {
      if (!persistedEventId) return
      saved = dispatch({
        type: 'updateEvent',
        eventId: persistedEventId,
        name: name.trim(),
        trigger: { type: triggerType, componentId: context.componentId },
        actions: eventActions,
      }, `${t('behavior.editEvent')}: ${name.trim()}`)
    }
    if (saved) onClose('saved')
  }

  function remove() {
    if (!persistedEventId) return
    const removed = dispatch(
      { type: 'removeEvent', eventId: persistedEventId },
      `${t('behavior.deleteEvent')}: ${name.trim()}`,
    )
    if (removed) onClose('deleted')
  }

  function updateAction(index: number, value: EventAction) {
    setActions(current => current.map((action, actionIndex) =>
      actionIndex === index ? { ...action, value } : action,
    ))
  }

  function moveAction(index: number, offset: -1 | 1) {
    setActions(current => {
      const destination = index + offset
      if (destination < 0 || destination >= current.length) return current
      const next = [...current]
      const [action] = next.splice(index, 1)
      next.splice(destination, 0, action)
      return next
    })
  }

  function close() {
    onClose('cancelled')
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={event => {
        if (event.target === event.currentTarget) close()
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          close()
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
        data-event-dialog={mode}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {t(mode === 'create' ? 'behavior.createEventTitle' : 'behavior.editEventTitle')}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={close}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
        <form
          onSubmit={formEvent => {
            formEvent.preventDefault()
            save()
          }}
        >
          <label className={styles.field}>
            <span>{t('behavior.eventName')}</span>
            <input
              autoFocus
              required
              value={name}
              onChange={inputEvent => setName(inputEvent.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>{t('behavior.triggerType')}</span>
            <select
              value={triggerType}
              onChange={selectEvent => setTriggerType(
                selectEvent.target.value as 'click' | 'submit',
              )}
            >
              <option value="click">{t('behavior.trigger.click')}</option>
              <option value="submit">{t('behavior.trigger.submit')}</option>
            </select>
          </label>

          <div className={styles.actionHeading}>
            <h3>{t('behavior.actions')}</h3>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setActions(current => [
                ...current,
                { key: nanoid(), value: createAction('setState', context) },
              ])}
            >
              + {t('behavior.addAction')}
            </button>
          </div>
          {actions.length > 0 ? (
            <ol className={styles.actionList}>
              {actions.map((action, index) => (
                <li className={styles.actionCard} key={action.key} data-event-action={index}>
                  <div className={styles.actionPosition}>
                    <span>{index + 1}</span>
                    <div className={styles.reorderActions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        disabled={index === 0}
                        aria-label={t('behavior.moveActionUp', { position: index + 1 })}
                        onClick={() => moveAction(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        disabled={index === actions.length - 1}
                        aria-label={t('behavior.moveActionDown', { position: index + 1 })}
                        onClick={() => moveAction(index, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                  <div className={styles.actionFields}>
                    <label className={styles.compactField}>
                      <span>{t('behavior.actionType')}</span>
                      <select
                        value={action.value.type}
                        onChange={selectEvent => updateAction(
                          index,
                          createAction(selectEvent.target.value as ActionType, context),
                        )}
                      >
                        {ACTION_TYPES.map(type => (
                          <option
                            key={type}
                            value={type}
                            disabled={(
                              !hasActionCandidates(type, context) &&
                              action.value.type !== type
                            )}
                          >
                            {t(`behavior.action.${type}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <ActionTarget
                      action={action.value}
                      context={context}
                      onChange={value => updateAction(index, value)}
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.removeAction}
                    aria-label={t('behavior.removeAction', { position: index + 1 })}
                    onClick={() => setActions(current =>
                      current.filter(candidate => candidate.key !== action.key),
                    )}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.muted}>{t('behavior.noActions')}</p>
          )}

          {!eventAvailable ? (
            <p className={styles.unavailable} role="alert">
              {t('behavior.eventUnavailable')}
            </p>
          ) : null}

          {confirmingDelete && mode === 'edit' ? (
            <div className={styles.confirm} role="alert">
              <p>{t('behavior.deleteConfirm', { name: name.trim() })}</p>
              <p>{t('behavior.deleteCleanup')}</p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setConfirmingDelete(false)}
                >
                  {t('common.cancel')}
                </button>
                <button type="button" className={styles.danger} onClick={remove}>
                  {t('behavior.deleteEvent')}
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
                  data-event-delete
                >
                  {t('behavior.deleteEvent')}
                </button>
              ) : null}
              <span className={styles.spacer} />
              <button type="button" className={styles.secondary} onClick={close}>
                {t('common.cancel')}
              </button>
              <button type="submit" className={styles.primary} disabled={!canSubmit}>
                {t(mode === 'create' ? 'behavior.addEvent' : 'common.save')}
              </button>
            </div>
          )}
        </form>
      </section>
    </div>
  )
}

const ACTION_TYPES: ActionType[] = ['setState', 'navigate', 'callApi', 'showAlert']

function createAction(type: ActionType, context: EventEditorContext): EventAction {
  switch (type) {
    case 'setState':
      return { type, stateId: context.states[0]?.id ?? '' }
    case 'navigate':
      return { type, destinationScreenId: context.screens[0]?.id ?? '' }
    case 'callApi':
      return { type, apiOperationId: context.apiOperations[0]?.id ?? '' }
    case 'showAlert':
      return { type, componentId: context.alerts[0]?.id ?? '' }
  }
}

function hasActionCandidates(type: ActionType, context: EventEditorContext): boolean {
  switch (type) {
    case 'setState':
      return context.states.length > 0
    case 'navigate':
      return context.screens.length > 0
    case 'callApi':
      return context.apiOperations.length > 0
    case 'showAlert':
      return context.alerts.length > 0
  }
}

function isActionTargetAvailable(
  action: EventAction,
  context: EventEditorContext,
): boolean {
  switch (action.type) {
    case 'setState':
      return context.states.some(state => state.id === action.stateId)
    case 'navigate':
      return context.screens.some(screen => screen.id === action.destinationScreenId)
    case 'callApi':
      return context.apiOperations.some(operation => operation.id === action.apiOperationId)
    case 'showAlert':
      return context.alerts.some(alert => alert.id === action.componentId)
  }
}

function ActionTarget({
  action,
  context,
  onChange,
}: {
  action: EventAction
  context: EventEditorContext
  onChange(action: EventAction): void
}) {
  const { t } = useI18n()
  switch (action.type) {
    case 'setState':
      return (
        <label className={styles.compactField}>
          <span>{t('behavior.target')}</span>
          <select
            value={action.stateId}
            onChange={event => onChange({ ...action, stateId: event.target.value })}
          >
            <MissingOption
              currentId={action.stateId}
              availableIds={context.states.map(state => state.id)}
            />
            {context.states.map(state => (
              <option key={state.id} value={state.id}>
                {state.label}
                {state.isDefault ? ` (${t('behavior.defaultState')})` : ''}
              </option>
            ))}
          </select>
        </label>
      )
    case 'navigate':
      return (
        <label className={styles.compactField}>
          <span>{t('behavior.target')}</span>
          <select
            value={action.destinationScreenId}
            onChange={event => onChange({
              ...action,
              destinationScreenId: event.target.value,
            })}
          >
            <MissingOption
              currentId={action.destinationScreenId}
              availableIds={context.screens.map(screen => screen.id)}
            />
            {context.screens.map(screen => (
              <option key={screen.id} value={screen.id}>
                {screen.label} ({screen.route})
              </option>
            ))}
          </select>
        </label>
      )
    case 'callApi':
      return (
        <label className={styles.compactField}>
          <span>{t('behavior.target')}</span>
          <select
            value={action.apiOperationId}
            onChange={event => onChange({
              ...action,
              apiOperationId: event.target.value,
            })}
          >
            <MissingOption
              currentId={action.apiOperationId}
              availableIds={context.apiOperations.map(operation => operation.id)}
            />
            {context.apiOperations.map(operation => (
              <option key={operation.id} value={operation.id}>
                {operation.method} {operation.path} — {operation.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'showAlert':
      return (
        <label className={styles.compactField}>
          <span>{t('behavior.target')}</span>
          <select
            value={action.componentId}
            onChange={event => onChange({ ...action, componentId: event.target.value })}
          >
            <MissingOption
              currentId={action.componentId}
              availableIds={context.alerts.map(alert => alert.id)}
            />
            {context.alerts.map(alert => (
              <option key={alert.id} value={alert.id}>{alert.label}</option>
            ))}
          </select>
        </label>
      )
  }
}

function MissingOption({
  currentId,
  availableIds,
}: {
  currentId: string
  availableIds: string[]
}) {
  const { t } = useI18n()
  return availableIds.includes(currentId)
    ? null
    : <option value={currentId}>{t('behavior.missingReference', { id: currentId })}</option>
}

function trapDialogFocus(
  event: React.KeyboardEvent<HTMLDivElement>,
  dialog: HTMLElement | null,
) {
  if (!dialog) return
  const focusable = [...dialog.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )].filter(element => element.getClientRects().length > 0)
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
