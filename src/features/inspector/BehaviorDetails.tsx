import { useRef, useState } from 'react'
import type {
  ApiEditorContext,
  ComponentBehaviorProjection,
  EventEditorContext,
  ResolvedApiReference,
  ResolvedEventAction,
  ResolvedReference,
} from '../../domain/componentBehavior'
import type { ValidationRule } from '../../domain/model'
import { useI18n } from '../../i18n/I18nProvider'
import type { MessageKey } from '../../i18n/messages'
import { EventDialog } from './EventDialog'
import { ApiOperationDialog } from './ApiOperationDialog'
import styles from './Inspector.module.css'

export function BehaviorDetails({
  behavior,
  eventEditor,
  apiEditor,
}: {
  behavior: ComponentBehaviorProjection
  eventEditor: EventEditorContext
  apiEditor: ApiEditorContext
}) {
  const { t } = useI18n()
  const [dialog, setDialog] = useState<
    | { type: 'event'; mode: 'create' }
    | { type: 'event'; mode: 'edit'; eventId: string }
    | { type: 'api'; mode: 'create' }
    | { type: 'api'; mode: 'edit'; operationId: string }
    | null
  >(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const addButtonRef = useRef<HTMLButtonElement | null>(null)
  const apiAddButtonRef = useRef<HTMLButtonElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const showEvents = behavior.events.length > 0 || eventEditor.supportsEventCreation
  const showApis = apiEditor.supportsApiEditing
  if (!behavior.hasBehavior && !showEvents && !showApis) return null

  function closeDialog(result: 'cancelled' | 'saved' | 'deleted') {
    const fallback = dialog?.type === 'api'
      ? apiAddButtonRef.current ?? headingRef.current
      : addButtonRef.current ?? headingRef.current
    const opener = openerRef.current?.isConnected ? openerRef.current : null
    const focusTarget = result === 'deleted' ? fallback : opener ?? fallback
    setDialog(null)
    requestAnimationFrame(() => focusTarget?.focus())
  }

  return (
    <section className={styles.behaviorSection} data-behavior-specification>
      <h3 ref={headingRef} tabIndex={-1}>{t('behavior.title')}</h3>
      {showEvents ? (
        <BehaviorGroup
          title={t('behavior.events')}
          action={eventEditor.supportsEventCreation ? (
            <button
              ref={addButtonRef}
              type="button"
              className={styles.behaviorAdd}
              onClick={event => {
                openerRef.current = event.currentTarget
                setDialog({ type: 'event', mode: 'create' })
              }}
              data-event-add
            >
              + {t('behavior.addEvent')}
            </button>
          ) : null}
        >
          {behavior.events.length > 0 ? (
            <div className={styles.behaviorCards}>
            {behavior.events.map(event => (
              <article className={styles.behaviorCard} key={event.id} data-behavior-event={event.id}>
                <div className={styles.behaviorCardHeading}>
                  <strong>{event.name ?? missingReference(event.id, t)}</strong>
                  <div className={styles.behaviorCardActions}>
                    {event.configuredByButton ? (
                      <span className={styles.behaviorBadge}>
                        {t('behavior.buttonPrimary')}
                      </span>
                    ) : null}
                    {event.triggerType ? (
                      <span className={styles.behaviorBadge}>
                        {t('behavior.trigger')}: {t(`behavior.trigger.${event.triggerType}`)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className={styles.behaviorEdit}
                      aria-label={t('behavior.editEventAria', {
                        name: event.name ?? event.id,
                      })}
                      onClick={clickEvent => {
                        openerRef.current = clickEvent.currentTarget
                        setDialog({ type: 'event', mode: 'edit', eventId: event.id })
                      }}
                      data-event-edit={event.id}
                    >
                      {t('behavior.editEvent')}
                    </button>
                  </div>
                </div>
                {event.actions.length > 0 ? (
                  <ol className={styles.actionList} aria-label={t('behavior.actions')}>
                    {event.actions.map((action, index) => (
                      <li key={`${event.id}:${index}`}>
                        <ActionDetails action={action} />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.behaviorMuted}>{t('behavior.noActions')}</p>
                )}
              </article>
            ))}
            </div>
          ) : (
            <p className={styles.behaviorMuted}>{t('behavior.noEvents')}</p>
          )}
        </BehaviorGroup>
      ) : null}
      {behavior.validationRules.length > 0 ? (
        <BehaviorGroup title={t('behavior.validation')}>
          <ul className={styles.behaviorCards}>
            {behavior.validationRules.map(rule => (
              <li className={styles.behaviorCard} key={rule.id}>
                <ValidationDetails rule={rule} />
              </li>
            ))}
          </ul>
        </BehaviorGroup>
      ) : null}
      {showApis ? (
        <BehaviorGroup
          title={t('behavior.apiOperations')}
          action={(
            <button
              ref={apiAddButtonRef}
              type="button"
              className={styles.behaviorAdd}
              onClick={event => {
                openerRef.current = event.currentTarget
                setDialog({ type: 'api', mode: 'create' })
              }}
              data-api-add
            >
              + {t('behavior.addApiOperation')}
            </button>
          )}
        >
          <div className={styles.behaviorCards}>
            {apiEditor.operations.map(editorOperation => (
              <article
                className={styles.behaviorCard}
                key={editorOperation.operation.id}
                data-behavior-api={editorOperation.operation.id}
              >
                <div className={styles.behaviorCardHeading}>
                  <ApiSummary operation={editorOperation.reference} />
                  <button
                    type="button"
                    className={styles.behaviorEdit}
                    aria-label={t('behavior.editApiOperationAria', {
                      name: editorOperation.operation.name,
                    })}
                    onClick={event => {
                      openerRef.current = event.currentTarget
                      setDialog({
                        type: 'api',
                        mode: 'edit',
                        operationId: editorOperation.operation.id,
                      })
                    }}
                    data-api-edit={editorOperation.operation.id}
                  >
                    {t('behavior.editApiOperation')}
                  </button>
                </div>
                {editorOperation.bindings.length > 0 ? (
                  <ol className={styles.actionList} aria-label={t('behavior.requestBindings')}>
                    {editorOperation.bindings.map((binding, index) => (
                      <li key={`${binding.component.id}:${binding.targetPath}:${index}`}>
                        <span>{referenceLabel(binding.component, t)}</span>
                        <span aria-hidden="true"> → </span>
                        <code>{binding.targetPath}</code>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.behaviorMuted}>{t('behavior.noBindings')}</p>
                )}
                <ResultStates operation={editorOperation.reference} />
              </article>
            ))}
            {apiEditor.operations.length === 0 ? (
              <p className={styles.behaviorMuted}>{t('behavior.noApiOperations')}</p>
            ) : null}
          </div>
        </BehaviorGroup>
      ) : null}
      {dialog?.type === 'event' ? (
        <EventDialog
          key={dialog.mode === 'create' ? 'new' : dialog.eventId}
          mode={dialog.mode}
          eventId={dialog.mode === 'edit' ? dialog.eventId : undefined}
          event={dialog.mode === 'edit'
            ? eventEditor.events.find(candidate =>
                candidate.event.id === dialog.eventId,
              )?.event
            : undefined}
          context={eventEditor}
          onClose={closeDialog}
        />
      ) : null}
      {dialog?.type === 'api' ? (
        <ApiOperationDialog
          key={dialog.mode === 'create' ? 'new-api' : dialog.operationId}
          mode={dialog.mode}
          operationId={dialog.mode === 'edit' ? dialog.operationId : undefined}
          editorOperation={dialog.mode === 'edit'
            ? apiEditor.operations.find(candidate =>
                candidate.operation.id === dialog.operationId,
              )
            : undefined}
          context={apiEditor}
          onClose={closeDialog}
        />
      ) : null}
    </section>
  )
}

function BehaviorGroup({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className={styles.behaviorGroup}>
      <div className={styles.behaviorGroupHeading}>
        <h4>{title}</h4>
        {action}
      </div>
      {children}
    </div>
  )
}

function ActionDetails({ action }: { action: ResolvedEventAction }) {
  const { t } = useI18n()
  switch (action.type) {
    case 'setState':
      return (
        <div className={styles.actionContent}>
          <strong>{t('behavior.action.setState')}</strong>
          <span>{referenceLabel(action.state, t)}</span>
        </div>
      )
    case 'callApi':
      return (
        <div className={styles.actionContent}>
          <strong>{t('behavior.action.callApi')}</strong>
          <ApiSummary operation={action.operation} />
          <ResultStates operation={action.operation} />
        </div>
      )
    case 'showAlert':
      return (
        <div className={styles.actionContent}>
          <strong>{t('behavior.action.showAlert')}</strong>
          <span>{referenceLabel(action.alert, t)}</span>
        </div>
      )
    case 'navigate':
      return (
        <div className={styles.actionContent}>
          <strong>{t('behavior.action.navigate')}</strong>
          <span>{referenceLabel(action.screen, t)}</span>
          {action.screen.route ? <code>{action.screen.route}</code> : null}
        </div>
      )
  }
}

function ApiSummary({ operation }: { operation: ResolvedApiReference }) {
  const { t } = useI18n()
  if (!operation.label || !operation.method || operation.path === null) {
    return <span>{missingReference(operation.id, t)}</span>
  }
  return (
    <div className={styles.apiSummary}>
      <span>
        <code>{operation.method}</code>{' '}
        <code>{operation.path}</code>
      </span>
      <span>{operation.label}</span>
    </div>
  )
}

function ResultStates({ operation }: { operation: ResolvedApiReference }) {
  const { t } = useI18n()
  if (!operation.successState && !operation.errorState) return null
  return (
    <dl className={styles.resultStates}>
      {operation.successState ? (
        <>
          <dt>{t('behavior.successState')}</dt>
          <dd>{referenceLabel(operation.successState, t)}</dd>
        </>
      ) : null}
      {operation.errorState ? (
        <>
          <dt>{t('behavior.errorState')}</dt>
          <dd>{referenceLabel(operation.errorState, t)}</dd>
        </>
      ) : null}
    </dl>
  )
}

function ValidationDetails({ rule }: { rule: ValidationRule }) {
  const { t } = useI18n()
  const value = 'value' in rule ? rule.value : null
  const description = 'description' in rule ? rule.description : null
  return (
    <>
      <div className={styles.behaviorCardHeading}>
        <strong>{t(validationMessageKey(rule.type))}</strong>
        <code>{rule.type}</code>
      </div>
      {value !== null ? (
        <p className={styles.behaviorDetail}>{t('behavior.ruleValue', { value })}</p>
      ) : null}
      {description ? (
        <p className={styles.behaviorDetail}>
          {t('behavior.ruleDescription')}: {description}
        </p>
      ) : null}
      <p className={styles.behaviorMessage}>{rule.message}</p>
    </>
  )
}

function validationMessageKey(type: ValidationRule['type']): MessageKey {
  return `behavior.validation.${type}`
}

function referenceLabel(
  reference: ResolvedReference,
  t: ReturnType<typeof useI18n>['t'],
): string {
  return reference.label ?? missingReference(reference.id, t)
}

function missingReference(
  id: string,
  t: ReturnType<typeof useI18n>['t'],
): string {
  return t('behavior.missingReference', { id })
}
