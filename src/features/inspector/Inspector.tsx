import { useCallback, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { useAppStore } from '../../app/appStore'
import styles from './Inspector.module.css'
import { getOwnEntity } from '../../domain/entityMap'
import type {
  ComponentLayout,
  ComponentOverride,
  ScreenComponent,
  ScreenState,
} from '../../domain/model'
import type { ChangeSet } from '../../domain/collaboration'
import { useI18n } from '../../i18n/I18nProvider'
import type { MessageKey } from '../../i18n/messages'
import { DraftTextField } from '../../components/DraftTextField'
import {
  getComponentBehavior,
  getApiEditorContext,
  getEventEditorContext,
  getValidationRulesEditorContext,
} from '../../domain/componentBehavior'
import { BehaviorDetails, ValidationDetails } from './BehaviorDetails'
import { getComponentSelectionContext } from '../../domain/componentDisplayLabel'
import { ChangeOperationList } from '../change-review/ChangeOperationList'
import {
  canDuplicateComponent,
  canPasteComponent,
} from '../../domain/componentDuplication'
import { resolveEffectiveComponentState } from '../../domain/selectors'
import {
  createResetComponentOverrideCommand,
  createSetComponentOverrideFieldCommand,
} from '../../domain/stateOverrides'
import { InspectorSection } from './InspectorSection'
import type { InspectorSectionBadge } from './InspectorSection'
import {
  componentHasContentSection,
  componentHasLayoutSection,
  countOverrideFields,
  defaultInspectorSectionOpen,
  inspectorSectionChangeCounts,
  inspectorSectionPreferenceKey,
} from './inspectorSections'
import type { InspectorSectionId } from './inspectorSections'

export function Inspector() {
  const { locale, t } = useI18n()
  const descriptionInputId = useId()
  const {
    effectiveDocument,
    ui,
    dispatch,
    duplicateComponent,
    copyComponent,
    pasteComponent,
    componentClipboard,
    reviewDraftProtectionIds,
    reviewDraftDocument,
    activeChangeSet,
    setSelectedComponent,
    requestHumanDelete,
  } = useAppStore()
  const [sectionPreferences, setSectionPreferences] = useState<Record<string, boolean>>({})
  const [validationErrorCounts, setValidationErrorCounts] = useState<Record<string, number>>({})
  const handleValidationErrorCount = useCallback((componentId: string, count: number) => {
    setValidationErrorCounts(current =>
      current[componentId] === count ? current : { ...current, [componentId]: count },
    )
  }, [])
  const { selectedComponentId, rightPanelTab } = ui

  if (rightPanelTab === 'changes' && activeChangeSet) {
    return <ChangesPanel changeSet={activeChangeSet} />
  }

  if (!selectedComponentId) {
    return <p className={styles.empty}>{t('inspector.selectComponent')}</p>
  }

  const selectedEffectiveComponent = getOwnEntity(
    effectiveDocument.components,
    selectedComponentId,
  )
  const protectedActiveStateMissing = Boolean(
    ui.activeStateId &&
    !getOwnEntity(effectiveDocument.screenStates, ui.activeStateId),
  )
  const inspectorDialogProtected = reviewDraftProtectionIds.some(id =>
    id.startsWith('dialog:')
  )
  const inspectorDocument = (
    reviewDraftProtectionIds.length > 0 &&
    reviewDraftDocument &&
    (
      inspectorDialogProtected ||
      !selectedEffectiveComponent ||
      protectedActiveStateMissing
    )
  )
    ? reviewDraftDocument
    : effectiveDocument
  const comp = selectedEffectiveComponent ??
    getOwnEntity(inspectorDocument.components, selectedComponentId)
  if (!comp) return null
  const activeState = ui.activeStateId
    ? getOwnEntity(inspectorDocument.screenStates, ui.activeStateId)
    : undefined
  const screen = getOwnEntity(inspectorDocument.screens, comp.screenId)
  const selectionContext = getComponentSelectionContext(
    inspectorDocument,
    selectedComponentId,
    locale,
    activeState,
  )
  if (!selectionContext) return null

  const cfg = comp.config
  const behavior = getComponentBehavior(inspectorDocument, comp.id, locale)
  const eventEditor = getEventEditorContext(inspectorDocument, comp.id, locale)
  const apiEditor = getApiEditorContext(inspectorDocument, comp.id, locale)
  const validationEditor = getValidationRulesEditorContext(inspectorDocument, comp.id, locale)
  const canCopy = Boolean(selectedEffectiveComponent) &&
    canDuplicateComponent(effectiveDocument, comp.id)
  const canPaste = Boolean(selectedEffectiveComponent) &&
    canPasteComponent(effectiveDocument, componentClipboard, comp.id)
  const canDelete = screen?.rootComponentId !== comp.id
  const hasContent = componentHasContentSection(cfg.kind)
  const hasBehaviorSection = Boolean(
    behavior &&
    eventEditor &&
    apiEditor &&
    (behavior.events.length > 0 ||
      eventEditor.supportsEventCreation ||
      apiEditor.supportsApiEditing),
  )
  const hasBehaviorData = Boolean(
    behavior && apiEditor &&
    (behavior.events.length > 0 ||
      behavior.apiBindings.length > 0 ||
      apiEditor.operations.length > 0),
  )
  const validationRuleCount = behavior?.validationRules.length ?? 0
  const selectedOverride = activeState?.componentOverrides[comp.id]
  const overrideFieldCount = countOverrideFields(selectedOverride)
  const sectionSignals = {
    hasBehavior: hasBehaviorData,
    validationRuleCount,
    overrideFieldCount,
  }
  const sectionChanges = inspectorSectionChangeCounts(
    activeChangeSet?.baseDocument ?? null,
    effectiveDocument,
    comp.id,
    activeState?.id ?? null,
  )
  const validationErrorCount = validationErrorCounts[comp.id] ?? 0

  function sectionExpanded(sectionId: InspectorSectionId): boolean {
    return sectionPreferences[
      inspectorSectionPreferenceKey(cfg.kind, sectionId)
    ] ?? defaultInspectorSectionOpen(sectionId, sectionSignals)
  }

  function toggleSection(sectionId: InspectorSectionId) {
    const preferenceKey = inspectorSectionPreferenceKey(cfg.kind, sectionId)
    setSectionPreferences(current => ({
      ...current,
      [preferenceKey]: !(current[preferenceKey] ??
        defaultInspectorSectionOpen(sectionId, sectionSignals)),
    }))
  }

  function sectionBadges(
    sectionId: InspectorSectionId,
    count = 0,
  ): InspectorSectionBadge[] {
    const badges: InspectorSectionBadge[] = []
    if (count > 0) {
      const countKey = sectionId === 'behavior'
        ? count === 1
          ? 'inspector.sectionBehaviorCountOne'
          : 'inspector.sectionBehaviorCountMany'
        : sectionId === 'validation'
          ? count === 1
            ? 'inspector.sectionValidationCountOne'
            : 'inspector.sectionValidationCountMany'
          : sectionId === 'stateOverrides'
            ? count === 1
              ? 'inspector.sectionOverrideCountOne'
              : 'inspector.sectionOverrideCountMany'
            : count === 1
              ? 'inspector.sectionItemCountOne'
              : 'inspector.sectionItemCountMany'
      badges.push({
        text: String(count),
        label: t(countKey, { count }),
      })
    }
    if (sectionId === 'validation' && validationErrorCount > 0) {
      badges.push({
        text: `! ${validationErrorCount}`,
        label: t(
          validationErrorCount === 1
            ? 'inspector.sectionValidationErrorOne'
            : 'inspector.sectionValidationErrorMany',
          { count: validationErrorCount },
        ),
        tone: 'attention',
      })
    }
    if (sectionChanges[sectionId] > 0) {
      badges.push({
        text: 'AI',
        label: t(
          sectionChanges[sectionId] === 1
            ? 'inspector.sectionAiChangeOne'
            : 'inspector.sectionAiChangeMany',
          { count: sectionChanges[sectionId] },
        ),
        tone: 'agent',
      })
    }
    return badges
  }

  function updateConfig(partial: Record<string, unknown>, field = 'settings'): boolean {
    return dispatch(
      { type: 'updateComponentSpec', componentId: comp!.id, patch: { config: partial as never } },
      `Update ${comp!.kind} ${field}: ${comp!.id}`,
    )
  }

  function updateCommon(
    partial: { description?: string; visible?: boolean; enabled?: boolean },
    field = 'settings',
  ): boolean {
    return dispatch(
      { type: 'updateComponentSpec', componentId: comp!.id, patch: { common: partial } },
      `Update ${comp!.kind} ${field}: ${comp!.id}`,
    )
  }

  return (
    <div className={styles.root} data-hierarchy-shortcut-scope="inspector">
      <header className={styles.selectionContext}>
        <span className={styles.selectionEyebrow}>{t('inspector.selectedComponent')}</span>
        <h2 className={styles.selectionTitle} title={selectionContext.targetLabel}>
          {selectionContext.targetLabel}
        </h2>
        <nav className={styles.breadcrumb} aria-label={t('inspector.breadcrumbLabel')}>
          <ol className={styles.breadcrumbList}>
            <li className={`${styles.breadcrumbItem} ${styles.screenBreadcrumb}`}>
              <span title={selectionContext.screenName}>
                {t('inspector.screenContext', { name: selectionContext.screenName })}
              </span>
            </li>
            {selectionContext.hierarchy.map((item, index) => {
              const isCurrent = index === selectionContext.hierarchy.length - 1
              return (
                <li className={styles.breadcrumbItem} key={item.componentId}>
                  <button
                    type="button"
                    className={`${styles.breadcrumbButton} ${isCurrent ? styles.currentBreadcrumb : ''}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    aria-label={t(
                      isCurrent
                        ? 'inspector.currentHierarchyComponent'
                        : 'inspector.selectHierarchyComponent',
                      { label: item.label },
                    )}
                    title={item.label}
                    onClick={() => setSelectedComponent(item.componentId)}
                  >
                    {item.label}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
        <p
          className={styles.hierarchyShortcutHint}
          aria-label={t('inspector.hierarchyShortcutHint')}
          title={t('inspector.hierarchyShortcutHint')}
        >
          {t('inspector.hierarchyShortcutHint')}
        </p>
      </header>
      {activeChangeSet ? (
        <p id="inspector-review-lock" className={styles.reviewLock}>
          {t('changes.editLocked')}
        </p>
      ) : null}
      <InspectorSection
        sectionId="basic"
        title={t('inspector.sectionBasic')}
        expanded={sectionExpanded('basic')}
        badges={sectionBadges('basic')}
        onToggle={() => toggleSection('basic')}
        actions={canCopy || canPaste || canDelete ? (
          <div className={styles.componentActions}>
            {canCopy ? (
              <>
                <button
                  type="button"
                  className={styles.componentActionButton}
                  title={t('inspector.copyTitle')}
                  aria-label={t('inspector.copyTitle')}
                  data-component-copy-inspector
                  onClick={() => copyComponent(comp.id)}
                >
                  {t('inspector.copy')}
                </button>
                <button
                  type="button"
                  className={styles.componentActionButton}
                  title={t('inspector.duplicateTitle')}
                  aria-label={t('inspector.duplicateTitle')}
                  aria-describedby={activeChangeSet ? 'inspector-review-lock' : undefined}
                  data-component-duplicate-inspector
                  disabled={Boolean(activeChangeSet)}
                  onClick={() => duplicateComponent(
                    comp.id,
                    t('componentMenu.duplicateHistory'),
                  )}
                >
                  {t('inspector.duplicate')}
                </button>
              </>
            ) : null}
            {canPaste ? (
              <button
                type="button"
                className={styles.componentActionButton}
                title={t('inspector.pasteTitle')}
                aria-label={t('inspector.pasteTitle')}
                aria-describedby={activeChangeSet ? 'inspector-review-lock' : undefined}
                data-component-paste-inspector
                disabled={Boolean(activeChangeSet)}
                onClick={() => pasteComponent(
                  comp.id,
                  t('componentMenu.pasteHistory'),
                )}
              >
                {t('inspector.paste')}
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                className={`${styles.componentActionButton} ${styles.componentDeleteButton}`}
                title={t('inspector.deleteTitle')}
                aria-label={t('inspector.deleteTitle')}
                aria-describedby={activeChangeSet ? 'inspector-review-lock' : undefined}
                data-component-delete-inspector
                disabled={Boolean(activeChangeSet)}
                onClick={() => requestHumanDelete(
                  { type: 'removeComponent', componentId: comp.id },
                  'Delete component',
                )}
              >
                {t('inspector.delete')}
              </button>
            ) : null}
          </div>
        ) : null}
      >
        <div className={styles.settingsHeading} data-base-settings>
          <p>{t('inspector.baseSettingsDescription')}</p>
        </div>
        <div className={styles.section}>
          <label className={styles.label} htmlFor={descriptionInputId}>
            {t('inspector.description')}
          </label>
          <DraftTextField
            id={descriptionInputId}
            key={`${comp.id}:description`}
            draftId={`component:${comp.id}:common.description`}
            className={styles.textarea}
            value={comp.common.description}
            onCommit={description => updateCommon({ description }, 'description')}
            multiline
            rows={2}
          />
        </div>
        <div className={styles.row}>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={comp.common.visible} onChange={e => updateCommon({ visible: e.target.checked })} />
            {t('inspector.visible')}
          </label>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={comp.common.enabled} onChange={e => updateCommon({ enabled: e.target.checked })} />
            {t('inspector.enabled')}
          </label>
        </div>
      </InspectorSection>
      {hasContent ? (
        <InspectorSection
          sectionId="content"
          title={t('inspector.sectionContent')}
          expanded={sectionExpanded('content')}
          badges={sectionBadges('content')}
          onToggle={() => toggleSection('content')}
        >
      {cfg.kind === 'text' && (
        <>
          <Field label={t('inspector.text')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:text`}
              draftId={`component:${comp.id}:config.text`}
              ariaLabel={t('inspector.text')}
              className={styles.textarea}
              value={cfg.text}
              onCommit={text => updateConfig({ text }, 'text')}
              multiline
              rows={3}
            />
          )}</Field>
          <Field label={t('inspector.textStyle')}>{controlId => (
            <select id={controlId} className={styles.input} value={cfg.style} onChange={e => updateConfig({ style: e.target.value })}>
              <option value="heading1">{t('inspector.textStyleHeading1')}</option>
              <option value="heading2">{t('inspector.textStyleHeading2')}</option>
              <option value="heading3">{t('inspector.textStyleHeading3')}</option>
              <option value="body">{t('inspector.textStyleBody')}</option>
              <option value="caption">{t('inspector.textStyleCaption')}</option>
            </select>
          )}</Field>
        </>
      )}
      {cfg.kind === 'textInput' && (
        <>
          <Field label={t('inspector.fieldKey')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:fieldKey`}
              draftId={`component:${comp.id}:config.fieldKey`}
              ariaLabel={t('inspector.fieldKey')}
              className={styles.input}
              value={cfg.fieldKey}
              onCommit={fieldKey => updateConfig({ fieldKey }, 'field key')}
            />
          )}</Field>
          <Field label={t('inspector.label')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:label`}
              draftId={`component:${comp.id}:config.label`}
              ariaLabel={t('inspector.label')}
              className={styles.input}
              value={cfg.label}
              onCommit={label => updateConfig({ label }, 'label')}
            />
          )}</Field>
          <Field label={t('inspector.placeholder')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:placeholder`}
              draftId={`component:${comp.id}:config.placeholder`}
              ariaLabel={t('inspector.placeholder')}
              className={styles.input}
              value={cfg.placeholder}
              onCommit={placeholder => updateConfig({ placeholder }, 'placeholder')}
            />
          )}</Field>
          <Field label={t('inspector.defaultValue')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:defaultValue`}
              draftId={`component:${comp.id}:config.defaultValue`}
              ariaLabel={t('inspector.defaultValue')}
              className={styles.input}
              value={cfg.defaultValue}
              onCommit={defaultValue => updateConfig({ defaultValue }, 'default value')}
            />
          )}</Field>
          <Field label={t('inspector.inputType')}>{controlId => (
            <select id={controlId} className={styles.input} value={cfg.inputType} onChange={e => updateConfig({ inputType: e.target.value })}>
              <option value="text">{t('inspector.inputText')}</option>
              <option value="email">{t('inspector.inputEmail')}</option>
              <option value="password">{t('inspector.inputPassword')}</option>
            </select>
          )}</Field>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={cfg.required} onChange={e => updateConfig({ required: e.target.checked })} />
            {t('inspector.required')}
          </label>
        </>
      )}
      {cfg.kind === 'select' && (
        <>
          <Field label={t('inspector.fieldKey')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:fieldKey`}
              draftId={`component:${comp.id}:config.fieldKey`}
              ariaLabel={t('inspector.fieldKey')}
              className={styles.input}
              value={cfg.fieldKey}
              onCommit={fieldKey => updateConfig({ fieldKey }, 'field key')}
            />
          )}</Field>
          <Field label={t('inspector.label')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:label`}
              draftId={`component:${comp.id}:config.label`}
              ariaLabel={t('inspector.label')}
              className={styles.input}
              value={cfg.label}
              onCommit={label => updateConfig({ label }, 'label')}
            />
          )}</Field>
          <Field label={t('inspector.options')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:options`}
              draftId={`component:${comp.id}:config.options`}
              ariaLabel={t('inspector.options')}
              className={styles.textarea}
              value={formatSelectOptions(cfg.options)}
              onCommit={value => updateConfig({ options: parseSelectOptions(value) }, 'options')}
              multiline
              rows={4}
              placeholder={t('inspector.optionsPlaceholder')}
            />
          )}</Field>
          <Field label={t('inspector.defaultValue')}>{controlId => (
            <select
              id={controlId}
              className={styles.input}
              value={cfg.defaultValue}
              onChange={e => updateConfig({ defaultValue: e.target.value })}
            >
              <option value="">{t('canvas.selectPlaceholder')}</option>
              {cfg.options.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          )}</Field>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={cfg.required} onChange={e => updateConfig({ required: e.target.checked })} />
            {t('inspector.required')}
          </label>
        </>
      )}
      {cfg.kind === 'button' && (
        <>
          <Field label={t('inspector.label')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:label`}
              draftId={`component:${comp.id}:config.label`}
              ariaLabel={t('inspector.label')}
              className={styles.input}
              value={cfg.label}
              onCommit={label => updateConfig({ label }, 'label')}
            />
          )}</Field>
          <Field label={t('inspector.variant')}>{controlId => (
            <select id={controlId} className={styles.input} value={cfg.variant} onChange={e => updateConfig({ variant: e.target.value })}>
              <option value="primary">{t('inspector.variantPrimary')}</option>
              <option value="secondary">{t('inspector.variantSecondary')}</option>
              <option value="danger">{t('inspector.variantDanger')}</option>
            </select>
          )}</Field>
          <Field label={t('inspector.confirmationMessage')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:confirmationMessage`}
              draftId={`component:${comp.id}:config.confirmationMessage`}
              ariaLabel={t('inspector.confirmationMessage')}
              className={styles.input}
              value={cfg.confirmationMessage ?? ''}
              placeholder={t('inspector.noConfirmation')}
              onCommit={confirmationMessage => updateConfig(
                { confirmationMessage: confirmationMessage || null },
                'confirmation message',
              )}
            />
          )}</Field>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={cfg.preventDoubleSubmit} onChange={e => updateConfig({ preventDoubleSubmit: e.target.checked })} />
            {t('inspector.preventDoubleSubmit')}
          </label>
        </>
      )}
      {cfg.kind === 'alert' && (
        <>
          <Field label={t('inspector.tone')}>{controlId => (
            <select id={controlId} className={styles.input} value={cfg.tone} onChange={e => updateConfig({ tone: e.target.value })}>
              <option value="info">{t('inspector.toneInfo')}</option>
              <option value="success">{t('inspector.toneSuccess')}</option>
              <option value="warning">{t('inspector.toneWarning')}</option>
              <option value="error">{t('inspector.toneError')}</option>
            </select>
          )}</Field>
          <Field label={t('inspector.message')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:message`}
              draftId={`component:${comp.id}:config.message`}
              ariaLabel={t('inspector.message')}
              className={styles.input}
              value={cfg.message}
              onCommit={message => updateConfig({ message }, 'message')}
            />
          )}</Field>
        </>
      )}
        </InspectorSection>
      ) : null}
      {componentHasLayoutSection(cfg.kind) && (cfg.kind === 'page' ||
        cfg.kind === 'section' ||
        cfg.kind === 'container' ||
        cfg.kind === 'modal') ? (
        <InspectorSection
          sectionId="layout"
          title={t('inspector.sectionLayout')}
          expanded={sectionExpanded('layout')}
          badges={sectionBadges('layout')}
          onToggle={() => toggleSection('layout')}
        >
          <LayoutFields layout={cfg} onUpdate={updateConfig} />
        </InspectorSection>
      ) : null}
      {hasBehaviorSection && behavior && eventEditor && apiEditor ? (
        <InspectorSection
          sectionId="behavior"
          title={t('inspector.sectionBehavior')}
          expanded={sectionExpanded('behavior')}
          badges={sectionBadges(
            'behavior',
            behavior.events.length + apiEditor.operations.length,
          )}
          onToggle={() => toggleSection('behavior')}
        >
          <BehaviorDetails
            key={comp.id}
            behavior={behavior}
            eventEditor={eventEditor}
            apiEditor={apiEditor}
          />
        </InspectorSection>
      ) : null}
      {behavior && validationEditor?.supportsValidationEditing ? (
        <InspectorSection
          sectionId="validation"
          title={t('inspector.sectionValidation')}
          expanded={sectionExpanded('validation')}
          badges={sectionBadges('validation', validationRuleCount)}
          onToggle={() => toggleSection('validation')}
        >
          <ValidationDetails
            key={comp.id}
            behavior={behavior}
            validationEditor={validationEditor}
            onErrorCountChange={count => handleValidationErrorCount(comp.id, count)}
          />
        </InspectorSection>
      ) : null}
      <InspectorSection
        sectionId="stateOverrides"
        title={t('inspector.sectionStateOverrides')}
        expanded={sectionExpanded('stateOverrides')}
        badges={sectionBadges('stateOverrides', overrideFieldCount)}
        onToggle={() => toggleSection('stateOverrides')}
      >
        <StateOverrides
          component={comp}
          state={activeState}
          defaultStateId={screen?.defaultStateId ?? null}
        />
      </InspectorSection>
    </div>
  )
}

function LayoutFields({
  layout,
  onUpdate,
}: {
  layout: ComponentLayout
  onUpdate(partial: Record<string, unknown>): void
}) {
  const { t } = useI18n()

  return (
    <div className={styles.layoutSection} data-layout-settings>
      <Field label={t('inspector.layout')}>{controlId => (
        <select id={controlId} className={styles.input} value={layout.layout} onChange={event => onUpdate({ layout: event.target.value })}>
          <option value="vertical">{t('inspector.layoutVertical')}</option>
          <option value="horizontal">{t('inspector.layoutHorizontal')}</option>
          <option value="grid">{t('inspector.layoutGrid')}</option>
        </select>
      )}</Field>
      <Field label={t('inspector.gap')}>{controlId => (
        <select id={controlId} className={styles.input} value={layout.gap} onChange={event => onUpdate({ gap: event.target.value })}>
          <option value="none">{t('inspector.gapNone')}</option>
          <option value="sm">{t('inspector.gapSmall')}</option>
          <option value="md">{t('inspector.gapMedium')}</option>
          <option value="lg">{t('inspector.gapLarge')}</option>
        </select>
      )}</Field>
      {layout.layout === 'grid' ? (
        <Field label={t('inspector.columns')}>{controlId => (
          <select id={controlId} className={styles.input} value={layout.columns} onChange={event => onUpdate({ columns: Number(event.target.value) })}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        )}</Field>
      ) : null}
      <Field label={t('inspector.justify')}>{controlId => (
        <select id={controlId} className={styles.input} value={layout.justify} onChange={event => onUpdate({ justify: event.target.value })}>
          <option value="start">{t('inspector.alignStart')}</option>
          <option value="center">{t('inspector.alignCenter')}</option>
          <option value="end">{t('inspector.alignEnd')}</option>
          <option value="between">{t('inspector.alignBetween')}</option>
        </select>
      )}</Field>
      <Field label={t('inspector.alignment')}>{controlId => (
        <select id={controlId} className={styles.input} value={layout.align} onChange={event => onUpdate({ align: event.target.value })}>
          <option value="start">{t('inspector.alignStart')}</option>
          <option value="center">{t('inspector.alignCenter')}</option>
          <option value="end">{t('inspector.alignEnd')}</option>
          <option value="stretch">{t('inspector.alignStretch')}</option>
        </select>
      )}</Field>
      {layout.layout === 'horizontal' ? (
        <label className={styles.checkLabel}>
          <input type="checkbox" checked={layout.wrap} onChange={event => onUpdate({ wrap: event.target.checked })} />
          {t('inspector.wrap')}
        </label>
      ) : null}
    </div>
  )
}

function StateOverrides({
  component,
  state,
  defaultStateId,
}: {
  component: ScreenComponent
  state?: ScreenState
  defaultStateId: string | null
}) {
  const { t } = useI18n()
  const dispatch = useAppStore(current => current.dispatch)
  const isDefaultState = !state || state.id === defaultStateId
  if (isDefaultState) {
    return (
      <div
        className={`${styles.overrideSection} ${styles.inactiveOverrideSection}`}
        data-state-overrides
        data-override-mode="base"
      >
        <div className={styles.overrideHeading}>
          <span>{state
            ? t('overrides.forState', { name: state.name })
            : t('overrides.noState')}</span>
        </div>
        <p className={styles.overrideExplanation}>
          {t(state ? 'overrides.defaultStateExplanation' : 'overrides.noStateExplanation')}
        </p>
      </div>
    )
  }

  const selectedState = state
  const { component: effective, override: selectedOverride, hasOverride } =
    resolveEffectiveComponentState(component, selectedState)
  const override = selectedOverride ?? {}

  function updateOverride<Key extends keyof ComponentOverride>(
    key: Key,
    value: ComponentOverride[Key] | undefined,
  ): boolean {
    const command = createSetComponentOverrideFieldCommand(
      selectedState,
      component.id,
      key,
      value,
    )
    return command
      ? dispatch(command, `Update ${selectedState.name} ${key} override: ${component.id}`)
      : true
  }

  function resetAllOverrides() {
    const command = createResetComponentOverrideCommand(selectedState, component.id)
    if (command) {
      dispatch(command, `Reset ${selectedState.name} override: ${component.id}`)
    }
  }

  const content = overrideContent(component, effective)

  return (
    <div
      className={styles.overrideSection}
      data-state-overrides
      data-override-mode={hasOverride ? 'override' : 'base'}
    >
      <div className={styles.overrideHeading}>
        <div>
          <span>{t('overrides.forState', { name: selectedState.name })}</span>
        </div>
        {hasOverride ? (
          <button
            type="button"
            className={styles.resetAllOverrides}
            data-reset-all-overrides
            onClick={resetAllOverrides}
          >
            {t('overrides.resetAll')}
          </button>
        ) : null}
      </div>
      <p className={styles.overrideExplanation}>
        {t(hasOverride
          ? 'overrides.activeExplanation'
          : 'overrides.inheritExplanation')}
      </p>
      <Field label={t('inspector.visible')}>{controlId => (
        <>
        <select
          id={controlId}
          className={styles.input}
          value={override.visible === undefined ? 'inherit' : String(override.visible)}
          onChange={event => updateOverride(
            'visible',
            event.target.value === 'inherit' ? undefined : event.target.value === 'true',
          )}
        >
          <option value="inherit">
            {t('overrides.inherit')} ({t(component.common.visible ? 'overrides.visible' : 'overrides.hidden')})
          </option>
          <option value="true">{t('overrides.visible')}</option>
          <option value="false">{t('overrides.hidden')}</option>
        </select>
        <OverrideValueSummary
          baseValue={formatOverrideValue(component.common.visible, t)}
          effectiveValue={formatOverrideValue(effective.common.visible, t)}
          fieldLabel={t('inspector.visible')}
          overridden={override.visible !== undefined}
          onReset={() => updateOverride('visible', undefined)}
        />
        </>
      )}</Field>
      <Field label={t('inspector.enabled')}>{controlId => (
        <>
        <select
          id={controlId}
          className={styles.input}
          value={override.enabled === undefined ? 'inherit' : String(override.enabled)}
          onChange={event => updateOverride(
            'enabled',
            event.target.value === 'inherit' ? undefined : event.target.value === 'true',
          )}
        >
          <option value="inherit">
            {t('overrides.inherit')} ({t(component.common.enabled ? 'overrides.enabled' : 'overrides.disabled')})
          </option>
          <option value="true">{t('overrides.enabled')}</option>
          <option value="false">{t('overrides.disabled')}</option>
        </select>
        <OverrideValueSummary
          baseValue={formatOverrideValue(component.common.enabled, t)}
          effectiveValue={formatOverrideValue(effective.common.enabled, t)}
          fieldLabel={t('inspector.enabled')}
          overridden={override.enabled !== undefined}
          onReset={() => updateOverride('enabled', undefined)}
        />
        </>
      )}</Field>
      {content ? (
        <div className={styles.overrideValue}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              aria-label={t('overrides.toggleFieldAria', { field: t(content.labelKey) })}
              checked={override[content.key] !== undefined}
              disabled={content.options?.length === 0}
              onChange={event => updateOverride(
                content.key,
                event.target.checked
                  ? content.options
                    ? content.baseValue || content.options[0]?.value
                    : content.baseValue
                  : undefined,
              )}
            />
            {t('overrides.useValue')}
          </label>
          <Field label={t(content.labelKey)}>{controlId => (
            <>
            {content.options ? (
              <select
                id={controlId}
                className={styles.input}
                disabled={override[content.key] === undefined}
                value={override[content.key] ?? content.baseValue}
                onChange={event => updateOverride(content.key, event.target.value)}
              >
                {override[content.key] === undefined && content.baseValue === '' ? (
                  <option value="">{t('canvas.selectPlaceholder')}</option>
                ) : null}
                {content.options.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <DraftTextField
                id={controlId}
                key={`${selectedState.id}:${component.id}:${content.key}`}
                draftId={`state:${selectedState.id}:component:${component.id}:${content.key}`}
                ariaLabel={t('overrides.fieldAria', { field: t(content.labelKey) })}
                className={styles.input}
                disabled={override[content.key] === undefined}
                value={override[content.key] ?? content.baseValue}
                onCommit={value => updateOverride(content.key, value)}
              />
            )}
            <OverrideValueSummary
              baseValue={formatOverrideValue(content.baseValue, t)}
              effectiveValue={formatOverrideValue(content.effectiveValue, t)}
              fieldLabel={t(content.labelKey)}
              overridden={override[content.key] !== undefined}
              onReset={() => updateOverride(content.key, undefined)}
            />
            </>
          )}</Field>
        </div>
      ) : null}
    </div>
  )
}

function OverrideValueSummary({
  baseValue,
  effectiveValue,
  fieldLabel,
  overridden,
  onReset,
}: {
  baseValue: string
  effectiveValue: string
  fieldLabel: string
  overridden: boolean
  onReset(): void
}) {
  const { t } = useI18n()
  return (
    <div className={styles.overrideSummary} data-field-overridden={overridden || undefined}>
      <span className={overridden ? styles.overrideActive : styles.overrideInherited}>
        {t(overridden ? 'overrides.overridden' : 'overrides.usingBase')}
      </span>
      <dl className={styles.overrideValues}>
        <div>
          <dt>{t('overrides.baseValue')}</dt>
          <dd title={baseValue}>{baseValue}</dd>
        </div>
        <div>
          <dt>{t('overrides.effectiveValue')}</dt>
          <dd title={effectiveValue}>{effectiveValue}</dd>
        </div>
      </dl>
      {overridden ? (
        <button
          type="button"
          className={styles.resetFieldOverride}
          data-reset-field-override
          aria-label={t('overrides.resetFieldAria', { field: fieldLabel })}
          onClick={onReset}
        >
          {t('overrides.resetField')}
        </button>
      ) : null}
    </div>
  )
}

function formatOverrideValue(
  value: string | boolean,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (typeof value === 'boolean') {
    return t(value ? 'overrides.booleanTrue' : 'overrides.booleanFalse')
  }
  return value === '' ? t('overrides.emptyValue') : value
}

function overrideContent(component: ScreenComponent, effective: ScreenComponent): {
  key: 'text' | 'message' | 'value'
  labelKey: MessageKey
  baseValue: string
  effectiveValue: string
  options?: Array<{ value: string; label: string }>
} | null {
  const config = component.config
  const effectiveConfig = effective.config
  if (config.kind === 'text' && effectiveConfig.kind === 'text') {
    return {
      key: 'text',
      labelKey: 'overrides.text',
      baseValue: config.text,
      effectiveValue: effectiveConfig.text,
    }
  }
  if (config.kind === 'alert' && effectiveConfig.kind === 'alert') {
    return {
      key: 'message',
      labelKey: 'overrides.message',
      baseValue: config.message,
      effectiveValue: effectiveConfig.message,
    }
  }
  if (config.kind === 'textInput' && effectiveConfig.kind === 'textInput') {
    return {
      key: 'value',
      labelKey: 'overrides.value',
      baseValue: config.defaultValue,
      effectiveValue: effectiveConfig.defaultValue,
    }
  }
  if (config.kind === 'select' && effectiveConfig.kind === 'select') {
    return {
      key: 'value',
      labelKey: 'overrides.value',
      baseValue: config.defaultValue,
      effectiveValue: effectiveConfig.defaultValue,
      options: config.options,
    }
  }
  return null
}

function formatSelectOptions(options: Array<{ value: string; label: string }>): string {
  return options.map(option => `${option.value}:${option.label}`).join('\n')
}

function parseSelectOptions(value: string): Array<{ value: string; label: string }> {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const separator = line.indexOf(':')
      if (separator < 0) return { value: line, label: line }
      return {
        value: line.slice(0, separator).trim(),
        label: line.slice(separator + 1).trim(),
      }
    })
}

function Field({
  label,
  children,
}: {
  label: string
  children(controlId: string): ReactNode
}) {
  const controlId = useId()
  return (
    <div style={{ marginBottom: 10 }}>
      <label
        htmlFor={controlId}
        style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}
      >
        {label}
      </label>
      {children(controlId)}
    </div>
  )
}

function ChangesPanel({ changeSet }: { changeSet: ChangeSet }) {
  const { t } = useI18n()
  const { acceptChangeSet, rejectChangeSet } = useAppStore()

  return (
    <div className={styles.changes}>
      <p className={styles.changeSummary}>{changeSet.summary}</p>
      <ChangeOperationList changeSet={changeSet} />
      <div className={styles.changeActions}>
        <button
          className={styles.acceptBtn}
          aria-label={t('changes.acceptAria')}
          onClick={() => acceptChangeSet(t('changes.acceptHistory', {
            summary: changeSet.summary,
          }))}
        >
          {t('changes.accept')}
        </button>
        <button
          className={styles.rejectBtn}
          aria-label={t('changes.rejectAria')}
          onClick={rejectChangeSet}
        >
          {t('changes.reject')}
        </button>
      </div>
    </div>
  )
}
