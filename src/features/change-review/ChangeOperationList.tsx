import { useMemo } from 'react'
import { useAppStore } from '../../app/appStore'
import type { ChangeSet } from '../../domain/collaboration'
import {
  presentChangeSetOperations,
  type ChangeOperationPresentation,
  type ReviewNavigation,
} from '../../domain/changeSetPresentation'
import { useI18n } from '../../i18n/I18nProvider'
import styles from './ChangeOperationList.module.css'

export function ChangeOperationList({ changeSet }: { changeSet: ChangeSet }) {
  const { locale, t } = useI18n()
  const activeScreenId = useAppStore(state => state.ui.activeScreenId)
  const setActiveScreen = useAppStore(state => state.setActiveScreen)
  const setActiveState = useAppStore(state => state.setActiveState)
  const setSelectedComponent = useAppStore(state => state.setSelectedComponent)
  const setRightPanelTab = useAppStore(state => state.setRightPanelTab)
  const operations = useMemo(
    () => presentChangeSetOperations(changeSet, locale),
    [changeSet, locale],
  )

  function navigate(target: ReviewNavigation) {
    if (activeScreenId !== target.screenId) setActiveScreen(target.screenId)
    if (target.stateId) setActiveState(target.stateId)
    setSelectedComponent(target.componentId ?? null)
    setRightPanelTab('inspector')
  }

  return (
    <ol className={styles.list} aria-label={t('review.operationsLabel')}>
      {operations.map((operation, index) => (
        <li
          key={operation.operationId}
          className={`${styles.item} ${styles.agentItem}`}
          data-command-type={operation.commandType}
        >
          {operation.navigation ? (
            <button
              type="button"
              className={styles.operationButton}
              title={t('review.navigateToOperation', {
                number: index + 1,
                label: operation.targetLabel,
              })}
              onClick={() => navigate(operation.navigation!)}
            >
              <OperationContent operation={operation} index={index} />
            </button>
          ) : (
            <div className={styles.operationStatic}>
              <OperationContent operation={operation} index={index} />
              <span className={styles.unavailable}>{t('review.navigationUnavailable')}</span>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

function OperationContent({
  operation,
  index,
}: {
  operation: ChangeOperationPresentation
  index: number
}) {
  const { t } = useI18n()
  return (
    <>
      <span className={styles.heading}>
        <span className={styles.number}>{index + 1}</span>
        <span className={styles.headingText}>
          <span className={styles.badges}>
            <span className={styles.action}>{operation.action}</span>
            <span className={styles.source}>
              {t('changes.sourceAgent')}
            </span>
          </span>
          <strong className={styles.target} title={operation.targetLabel}>
            {operation.targetLabel}
          </strong>
          <span className={styles.context}>
            {operation.entityKind}
            {operation.screenContext
              ? ` · ${t('review.screenContext', { screen: operation.screenContext })}`
              : ''}
          </span>
        </span>
      </span>
      <span className={styles.fields}>
        {operation.changes.map((change, changeIndex) => (
          <span
            className={styles.field}
            key={`${change.field}:${changeIndex}`}
            aria-label={t('review.changeAria', {
              field: change.field,
              before: change.before.fullText,
              after: change.after.fullText,
            })}
          >
            <span className={styles.fieldName}>{change.field}</span>
            <span className={styles.values}>
              <span className={styles.value} title={change.before.fullText}>
                <span className={styles.valueLabel}>{t('review.before')}</span>
                {change.before.text}
              </span>
              <span className={styles.arrow} aria-hidden="true">→</span>
              <span className={styles.value} title={change.after.fullText}>
                <span className={styles.valueLabel}>{t('review.after')}</span>
                {change.after.text}
              </span>
            </span>
          </span>
        ))}
      </span>
      {operation.impact ? (
        <span className={styles.impact}>
          <strong>{t('review.field.impact')}:</strong> {operation.impact}
        </span>
      ) : null}
    </>
  )
}
