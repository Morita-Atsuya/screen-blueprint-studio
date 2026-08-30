import type {
  ComponentBehaviorProjection,
  ResolvedApiReference,
  ResolvedEventAction,
  ResolvedReference,
} from '../../domain/componentBehavior'
import type { ValidationRule } from '../../domain/model'
import { useI18n } from '../../i18n/I18nProvider'
import type { MessageKey } from '../../i18n/messages'
import styles from './Inspector.module.css'

export function BehaviorDetails({
  behavior,
}: {
  behavior: ComponentBehaviorProjection
}) {
  const { t } = useI18n()
  if (!behavior.hasBehavior) return null

  return (
    <section className={styles.behaviorSection} data-behavior-specification>
      <h3>{t('behavior.title')}</h3>
      {behavior.events.length > 0 ? (
        <BehaviorGroup title={t('behavior.events')}>
          <div className={styles.behaviorCards}>
            {behavior.events.map(event => (
              <article className={styles.behaviorCard} key={event.id} data-behavior-event={event.id}>
                <div className={styles.behaviorCardHeading}>
                  <strong>{event.name ?? missingReference(event.id, t)}</strong>
                  {event.triggerType ? (
                    <span className={styles.behaviorBadge}>
                      {t('behavior.trigger')}: {t(`behavior.trigger.${event.triggerType}`)}
                    </span>
                  ) : null}
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
      {behavior.requestBinding || behavior.apiBindings.length > 0 ? (
        <BehaviorGroup title={t('behavior.requestBindings')}>
          <div className={styles.behaviorCards}>
            {behavior.requestBinding ? (
              <div className={styles.behaviorCard}>
                <strong>{t('behavior.componentBinding')}</strong>
                <p className={styles.behaviorDetail}>
                  {referenceLabel(behavior.requestBinding.component, t)}
                  <span aria-hidden="true"> → </span>
                  <code>{behavior.requestBinding.targetPath}</code>
                </p>
              </div>
            ) : null}
            {behavior.apiBindings.map((binding, index) => (
              <div
                className={styles.behaviorCard}
                key={`${binding.operation.id}:${binding.targetPath}:${index}`}
                data-behavior-api={binding.operation.id}
              >
                <ApiSummary operation={binding.operation} />
                <p className={styles.behaviorDetail}>
                  {t('behavior.targetPath')}: <code>{binding.targetPath}</code>
                </p>
                <ResultStates operation={binding.operation} />
              </div>
            ))}
          </div>
        </BehaviorGroup>
      ) : null}
    </section>
  )
}

function BehaviorGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className={styles.behaviorGroup}>
      <h4>{title}</h4>
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
