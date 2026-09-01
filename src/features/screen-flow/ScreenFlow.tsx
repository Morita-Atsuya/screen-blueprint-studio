import { useAppStore } from '../../app/appStore'
import { getOwnEntity } from '../../domain/entityMap'
import type {
  ScreenFlowChangeStatus,
  ScreenFlowEndpoint,
  ScreenFlowTransition,
} from '../../domain/screenFlow'
import { selectScreenFlow } from '../../domain/screenFlow'
import { useI18n } from '../../i18n/I18nProvider'
import type { MessageKey } from '../../i18n/messages'
import styles from './ScreenFlow.module.css'

export function ScreenFlow({
  openScreenView,
}: {
  openScreenView(focusComponentId?: string): void
}) {
  const { locale, t } = useI18n()
  const {
    effectiveDocument,
    activeChangeSet,
    ui,
    setActiveScreen,
    selectScreenComponent,
    setRightPanelTab,
  } = useAppStore()
  const flow = selectScreenFlow(
    effectiveDocument,
    locale,
    activeChangeSet?.baseDocument ?? null,
  )

  function openScreen(screenId: string) {
    if (!getOwnEntity(effectiveDocument.screens, screenId)) return
    setActiveScreen(screenId)
    openScreenView()
  }

  function openTransition(transition: ScreenFlowTransition) {
    if (
      !transition.exists ||
      !transition.source.resolved ||
      !transition.triggerResolved ||
      !getOwnEntity(effectiveDocument.components, transition.triggerComponentId)
    ) {
      return
    }
    setActiveScreen(transition.source.screenId)
    selectScreenComponent(transition.triggerComponentId)
    setRightPanelTab('inspector')
    openScreenView(transition.triggerComponentId)
  }

  return (
    <div className={styles.viewport} data-screen-flow>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <h2>{t('flow.title')}</h2>
            <p>{t('flow.description')}</p>
          </div>
          <span className={styles.readOnly}>{t('flow.readOnly')}</span>
        </header>

        <section className={styles.nodeSection} aria-labelledby="screen-flow-nodes">
          <h3 id="screen-flow-nodes">{t('flow.screens')}</h3>
          <ol className={styles.nodeGrid}>
            {flow.nodes.map(node => (
              <li key={node.screenId}>
                {node.exists ? (
                  <button
                    type="button"
                    className={`${styles.node} ${
                      ui.activeScreenId === node.screenId ? styles.activeNode : ''
                    }`}
                    data-flow-node={node.screenId}
                    data-flow-change={node.changeStatus ?? undefined}
                    aria-current={ui.activeScreenId === node.screenId ? 'page' : undefined}
                    onClick={() => openScreen(node.screenId)}
                  >
                    <NodeContent endpoint={node} status={node.changeStatus} />
                    <span className={styles.srOnly}>
                      {t('flow.openScreen', { name: endpointName(node, t) })}
                    </span>
                  </button>
                ) : (
                  <div
                    className={`${styles.node} ${styles.removed}`}
                    data-flow-node={node.screenId}
                    data-flow-change="removed"
                    role="group"
                    tabIndex={0}
                  >
                    <NodeContent endpoint={node} status="removed" />
                    <span className={styles.srOnly}>
                      {t('flow.removedScreen', { name: endpointName(node, t) })}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.edgeSection} aria-labelledby="screen-flow-transitions">
          <h3 id="screen-flow-transitions">{t('flow.transitions')}</h3>
          {flow.edges.length > 0 ? (
            <ol className={styles.edgeList}>
              {flow.edges.map(edge => (
                <li
                  key={edge.id}
                  className={styles.edge}
                  data-flow-edge={edge.id}
                  data-flow-change={edge.changeStatus ?? undefined}
                >
                  <details>
                    <summary>
                      <span className={styles.edgeDirection}>
                        <EndpointLabel endpoint={edge.source} />
                        <span className={styles.arrow} aria-hidden="true">
                          {edge.selfLoop ? '↻' : '→'}
                        </span>
                        <EndpointLabel endpoint={edge.target} />
                      </span>
                      <span className={styles.edgeMeta}>
                        {edge.selfLoop ? (
                          <span className={styles.selfLoop}>{t('flow.selfLoop')}</span>
                        ) : null}
                        {!edge.target.resolved ? (
                          <span className={styles.unresolved}>{t('flow.unresolved')}</span>
                        ) : null}
                        <span className={styles.count}>
                          {t(
                            edge.transitions.length === 1
                              ? 'flow.transitionCountOne'
                              : 'flow.transitionCountMany',
                            { count: edge.transitions.length },
                          )}
                        </span>
                        <ChangeStatus status={edge.changeStatus} />
                      </span>
                    </summary>
                    <ol className={styles.transitionList}>
                      {edge.transitions.map(transition => {
                        const navigable = transition.exists &&
                          transition.source.resolved &&
                          transition.triggerResolved
                        const content = <TransitionContent transition={transition} />
                        return (
                          <li
                            key={`${transition.id}:${transition.exists ? 'current' : 'removed'}`}
                            data-flow-transition={transition.id}
                            data-flow-change={transition.changeStatus ?? undefined}
                          >
                            {navigable ? (
                              <button
                                type="button"
                                className={styles.transitionButton}
                                onClick={() => openTransition(transition)}
                              >
                                {content}
                                <span className={styles.srOnly}>
                                  {t('flow.openTransition', {
                                    event: transition.eventName,
                                    component: transition.triggerLabel,
                                  })}
                                </span>
                              </button>
                            ) : (
                              <div className={styles.transitionUnavailable} tabIndex={0}>
                                {content}
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ol>
                  </details>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.empty}>{t('flow.noTransitions')}</p>
          )}
        </section>
      </div>
    </div>
  )
}

function NodeContent({
  endpoint,
  status,
}: {
  endpoint: ScreenFlowEndpoint
  status: ScreenFlowChangeStatus | null
}) {
  const { t } = useI18n()
  return (
    <>
      <span className={styles.nodeName} title={endpointName(endpoint, t)}>
        {endpointName(endpoint, t)}
      </span>
      <code className={styles.nodeRoute} title={endpoint.route ?? endpoint.screenId}>
        {endpoint.route ?? endpoint.screenId}
      </code>
      <ChangeStatus status={status} />
    </>
  )
}

function TransitionContent({
  transition,
}: {
  transition: ScreenFlowTransition
}) {
  const { t } = useI18n()
  return (
    <div className={styles.transitionContent}>
      <div className={styles.transitionHeading}>
        <strong title={transition.eventName}>{transition.eventName}</strong>
        <ChangeStatus status={transition.changeStatus} />
      </div>
      <dl>
        <div>
          <dt>{t('flow.trigger')}</dt>
          <dd title={transition.triggerLabel}>{transition.triggerLabel}</dd>
        </div>
        <div>
          <dt>{t('flow.eventOrder')}</dt>
          <dd>{transition.eventOrder + 1}</dd>
        </div>
        <div>
          <dt>{t('flow.actionOrder')}</dt>
          <dd>{transition.actionIndex + 1}</dd>
        </div>
        {transition.previous ? (
          <div>
            <dt>{t('flow.previousTarget')}</dt>
            <dd>
              <EndpointLabel endpoint={transition.previous.target} />
            </dd>
          </div>
        ) : null}
      </dl>
      <span className={styles.srOnly}>
        {t('flow.transitionContext', {
          source: endpointName(transition.source, t),
          target: endpointName(transition.target, t),
        })}
      </span>
    </div>
  )
}

function EndpointLabel({ endpoint }: { endpoint: ScreenFlowEndpoint }) {
  const { t } = useI18n()
  const name = endpointName(endpoint, t)
  return (
    <span className={styles.endpoint} title={endpoint.route ? `${name} · ${endpoint.route}` : name}>
      <span>{name}</span>
      {endpoint.route ? <code>{endpoint.route}</code> : null}
    </span>
  )
}

function ChangeStatus({ status }: { status: ScreenFlowChangeStatus | null }) {
  const { t } = useI18n()
  if (!status) return null
  const key: MessageKey = `flow.status.${status}`
  return (
    <span className={`${styles.changeStatus} ${styles[status]}`} data-change-status={status}>
      <span aria-hidden="true">
        {status === 'added' ? '+' : status === 'removed' ? '−' : '~'}
      </span>{' '}
      {t(key)}
    </span>
  )
}

function endpointName(
  endpoint: ScreenFlowEndpoint,
  t: ReturnType<typeof useI18n>['t'],
): string {
  return endpoint.name ?? t('flow.unresolvedScreen', { id: endpoint.screenId })
}
