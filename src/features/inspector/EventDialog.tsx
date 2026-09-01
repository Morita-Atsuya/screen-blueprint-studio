import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import type { EventEditorContext } from '../../domain/componentBehavior'
import type { EventAction, ScreenEvent } from '../../domain/model'
import type { BehaviorValueSource } from '../../domain/model'
import { useI18n } from '../../i18n/I18nProvider'
import { trapDialogFocus } from './dialogFocus'
import styles from './EventDialog.module.css'
import {
  useDialogDraftFieldsetFocus,
  useDialogReviewLock,
} from '../../app/reviewLock'
import { DialogReviewActions } from '../change-review/DialogReviewActions'
import { cloneComponentTargetRef } from '../../domain/componentTargets'
import { cloneEventAction } from '../../domain/modelClone'

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
  const { dispatch, requestHumanDelete } = useAppStore()
  const { reviewLocked, staleAfterReview } = useDialogReviewLock()
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const reviewNoticeId = useId()
  const [name, setName] = useState(event?.name ?? t('behavior.newEventName'))
  const [triggerType, setTriggerType] = useState<'click' | 'submit'>(
    event?.trigger.type ?? 'click',
  )
  const [actions, setActions] = useState<DraftAction[]>(() =>
    (event?.actions ?? []).map(value => ({ key: nanoid(), value: cloneEventAction(value) })),
  )
  const persistedEventId = event?.id ?? eventId
  const draftLocked = reviewLocked || staleAfterReview
  const draftFieldsetFocus = useDialogDraftFieldsetFocus(draftLocked)
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
    if (reviewLocked || staleAfterReview || !canSubmit || (mode === 'edit' && !persistedEventId)) return
    const eventActions = actions.map(action => action.value)
    let saved: boolean
    if (mode === 'create') {
      saved = dispatch({
        type: 'connectEvent',
        eventId: nanoid(),
        screenId: context.screenId,
        name: name.trim(),
        trigger: { type: triggerType, target: cloneComponentTargetRef(context.target) },
        actions: eventActions,
      }, `${t('behavior.addEvent')}: ${name.trim()}`)
    } else {
      if (!persistedEventId) return
      saved = dispatch({
        type: 'updateEvent',
        eventId: persistedEventId,
        name: name.trim(),
        trigger: { type: triggerType, target: cloneComponentTargetRef(context.target) },
        actions: eventActions,
      }, `${t('behavior.editEvent')}: ${name.trim()}`)
    }
    if (saved) onClose('saved')
  }

  function remove() {
    if (!persistedEventId) return
    requestHumanDelete(
      { type: 'removeEvent', eventId: persistedEventId },
      `${t('behavior.deleteEvent')}: ${name.trim()}`,
      () => onClose('deleted'),
    )
  }

  function updateAction(index: number, value: EventAction) {
    if (draftLocked) return
    setActions(current => current.map((action, actionIndex) =>
      actionIndex === index ? { ...action, value } : action,
    ))
  }

  function moveAction(index: number, offset: -1 | 1) {
    if (draftLocked) return
    setActions(current => {
      const destination = index + offset
      if (destination < 0 || destination >= current.length) return current
      const next = [...current]
      const [action] = next.splice(index, 1)
      next.splice(destination, 0, action)
      return next
    })
  }

  function addAction() {
    if (draftLocked) return
    setActions(current => [
      ...current,
      { key: nanoid(), value: createAction('setScenario', context) },
    ])
  }

  function removeAction(key: string) {
    if (draftLocked) return
    setActions(current => current.filter(candidate => candidate.key !== key))
  }

  function close() {
    onClose('cancelled')
  }

  return createPortal(
    (
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
                onClick={addAction}
              >
                + {t('behavior.addAction')}
              </button>
            </div>
            {actions.length > 0 ? (
              <ol className={styles.actionList}>
                {actions.map((action, index) => (
                  <li className={styles.actionCard} key={action.key} data-event-action={index}>
                    <div className={styles.actionPosition} data-event-action-position>
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
                      onClick={() => removeAction(action.key)}
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
          </fieldset>

          <div className={styles.actions}>
            {mode === 'edit' ? (
              <button
                type="button"
                className={styles.dangerOutline}
                onClick={remove}
                disabled={reviewLocked || staleAfterReview}
                data-event-delete
              >
                {t('behavior.deleteEvent')}
              </button>
            ) : null}
            <span className={styles.spacer} />
            <button type="button" className={styles.secondary} onClick={close}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className={styles.primary}
              disabled={reviewLocked || staleAfterReview || !canSubmit}
            >
              {t(mode === 'create' ? 'behavior.addEvent' : 'common.save')}
            </button>
          </div>
        </form>
      </section>
    </div>
    ),
    document.body,
  )
}

const ACTION_TYPES: ActionType[] = ['setScenario', 'clearScenario', 'navigate', 'callApi']

function createAction(type: ActionType, context: EventEditorContext): EventAction {
  switch (type) {
    case 'setScenario':
      return { type, scenarioId: context.states[0]?.id ?? '' }
    case 'clearScenario':
      return { type: 'clearScenario' }
    case 'navigate':
      return {
        type,
        destinationScreenId: context.screens[0]?.id ?? '',
        routeParameters: {},
        queryParameters: {},
      }
    case 'callApi':
      return { type, apiOperationId: context.apiOperations[0]?.id ?? '' }
  }
}

function hasActionCandidates(type: ActionType, context: EventEditorContext): boolean {
  switch (type) {
    case 'setScenario':
      return context.states.length > 0
    case 'clearScenario':
      return true
    case 'navigate':
      return context.screens.length > 0
    case 'callApi':
      return context.apiOperations.length > 0
  }
}

function isActionTargetAvailable(
  action: EventAction,
  context: EventEditorContext,
): boolean {
  switch (action.type) {
    case 'setScenario':
      return context.states.some(state => state.id === action.scenarioId)
    case 'clearScenario':
      return true
    case 'navigate':
      return (
        context.screens.some(screen => screen.id === action.destinationScreenId) &&
        parametersAvailable(action.routeParameters, context) &&
        parametersAvailable(action.queryParameters, context)
      )
    case 'callApi':
      return context.apiOperations.some(operation => operation.id === action.apiOperationId)
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
    case 'setScenario':
      return (
        <label className={styles.compactField}>
          <span>{t('behavior.target')}</span>
          <select
            value={action.scenarioId}
            onChange={event => onChange({ ...action, scenarioId: event.target.value })}
          >
            <MissingOption
              currentId={action.scenarioId}
              availableIds={context.states.map(state => state.id)}
            />
            {context.states.map(state => (
              <option key={state.id} value={state.id}>
                {state.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'clearScenario':
      return null
    case 'navigate':
      return (
        <div className={styles.navigateFields}>
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
          <ParameterMapEditor
            label={t('behavior.routeParameters')}
            parameters={action.routeParameters ?? {}}
            itemAllowed={context.target.type === 'collectionItemNode'}
            onChange={routeParameters => onChange({ ...action, routeParameters })}
          />
          <ParameterMapEditor
            label={t('behavior.queryParameters')}
            parameters={action.queryParameters ?? {}}
            itemAllowed={context.target.type === 'collectionItemNode'}
            onChange={queryParameters => onChange({ ...action, queryParameters })}
          />
        </div>
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
  }
}

function parametersAvailable(
    parameters: Record<string, BehaviorValueSource> | undefined,
    context: EventEditorContext,
  ): boolean {
    return Object.entries(parameters ?? {}).every(([name, source]) =>
      name.trim().length > 0 &&
      (
        source.type === 'literal' ||
        (
          context.target.type === 'collectionItemNode' &&
          source.path.length > 0
        )
      ))
  }

function ParameterMapEditor({
    label,
    parameters,
    itemAllowed,
    onChange,
  }: {
    label: string
    parameters: Record<string, BehaviorValueSource>
    itemAllowed: boolean
    onChange(parameters: Record<string, BehaviorValueSource>): void
  }) {
    const { t } = useI18n()
    const entries = Object.entries(parameters)
    const replaceEntry = (
      oldName: string,
      name: string,
      source: BehaviorValueSource,
    ) => {
      if (
        name !== oldName &&
        Object.prototype.hasOwnProperty.call(parameters, name)
      ) return
      const next = { ...parameters }
      delete next[oldName]
      next[name] = source
      onChange(next)
    }
    return (
      <div className={styles.parameterMap}>
        <div className={styles.parameterHeading}>
          <span>{label}</span>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              let index = entries.length + 1
              while (
                Object.prototype.hasOwnProperty.call(parameters, `param${index}`)
              ) index += 1
              onChange({
                ...parameters,
                [`param${index}`]: itemAllowed
                  ? { type: 'item', path: '/id' }
                  : { type: 'literal', value: '' },
              })
            }}
          >
            + {t('behavior.addParameter')}
          </button>
        </div>
        {entries.map(([name, source]) => (
          <div className={styles.parameterRow} key={name}>
            <input
              required
              aria-label={t('behavior.parameterName')}
              value={name}
              onChange={event => replaceEntry(name, event.target.value, source)}
            />
            <select
              aria-label={t('behavior.parameterSource')}
              value={source.type}
              onChange={event => replaceEntry(
                name,
                name,
                event.target.value === 'item'
                  ? { type: 'item', path: '/id' }
                  : { type: 'literal', value: '' },
              )}
            >
              {itemAllowed ? <option value="item">{t('behavior.bindingItem')}</option> : null}
              <option value="literal">{t('behavior.bindingLiteral')}</option>
            </select>
            <input
              required={source.type === 'item'}
              aria-label={source.type === 'item'
                ? t('behavior.itemPath')
                : t('behavior.literalValue')}
              value={source.type === 'item'
                ? source.path
                : source.value === null
                  ? 'null'
                  : String(source.value)}
              onChange={event => replaceEntry(
                name,
                name,
                source.type === 'item'
                  ? { type: 'item', path: event.target.value }
                  : { type: 'literal', value: event.target.value },
              )}
            />
            <button
              type="button"
              className={styles.removeAction}
              aria-label={t('behavior.removeParameter', { name })}
              onClick={() => {
                const next = { ...parameters }
                delete next[name]
                onChange(next)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    )
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
