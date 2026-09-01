import { useCallback, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { useAppStore } from '../../app/appStore'
import styles from './Inspector.module.css'
import { getOwnEntity } from '../../domain/entityMap'
import type {
  ComponentLayout,
  ComponentOverride,
  ComponentPlacement,
  ComponentSizeToken,
  ComponentSizing,
  PlacementAnchor,
  PlacementInset,
  ProjectDocument,
  ScreenState,
} from '../../domain/model'
import { COMPONENT_SIZE_TOKENS, isInlineScreenComponent } from '../../domain/model'
import type { ChangeSet } from '../../domain/collaboration'
import { useI18n } from '../../i18n/I18nProvider'
import type { MessageKey } from '../../i18n/messages'
import { isSafeExternalUrl, isSafePortableUrl } from '../../domain/portableUrl'
import { DraftTextField } from '../../components/DraftTextField'
import {
  getComponentBehavior,
  getComponentTargetBehavior,
  getApiEditorContext,
  getApiEditorContextForTarget,
  getEventEditorContext,
  getEventEditorContextForTarget,
  getValidationRulesEditorContext,
} from '../../domain/componentBehavior'
import { BehaviorDetails, ValidationDetails } from './BehaviorDetails'
import { getComponentSelectionContext } from '../../domain/componentDisplayLabel'
import { selectedScreenComponentId } from '../../domain/editorSelection'
import {
  definitionEditorNodeSelection,
  selectionCanonicalTarget,
} from '../../domain/editorSelection'
import { resolveComponentTarget } from '../../domain/definitionResolver'
import { resolveComponentDefinitionRefV3 } from '../../domain/canonicalProjectSpecV3'
import {
  createDetachDefinitionInstanceCommand,
  createExtractDefinitionCommand,
} from '../../domain/definitionEditing'
import { ChangeOperationList } from '../change-review/ChangeOperationList'
import { effectiveComponent, resolveEffectiveComponentState, type EffectiveScreenComponent } from '../../domain/selectors'
import {
  createResetComponentOverrideCommand,
  createSetComponentOverrideFieldCommand,
} from '../../domain/stateOverrides'
import {
  createResetTargetOverrideCommand,
  createSetTargetOverrideFieldCommand,
} from '../../domain/stateOverrides'
import { findScenarioOverride } from '../../domain/componentTargets'
import { findInlineScenarioOverride } from '../../domain/componentTargets'
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

function resolvedNodeInspectorLabel(
  node: ReturnType<typeof resolveComponentTarget>,
): string {
  switch (node.config.kind) {
    case 'text':
      return node.config.text || node.kind
    case 'image':
      return node.config.alt || node.kind
    case 'textInput':
    case 'select':
    case 'button':
    case 'link':
      return node.config.label || node.kind
    default:
      return node.common.description || node.kind
  }
}

export function Inspector() {
  const { locale, t } = useI18n()
  const descriptionInputId = useId()
  const {
    effectiveDocument,
    ui,
    dispatch,
    reviewDraftProtectionIds,
    reviewDraftDocument,
    activeChangeSet,
    selectScreenComponent,
    setSelection,
  } = useAppStore()
  const [sectionPreferences, setSectionPreferences] = useState<Record<string, boolean>>({})
  const [validationErrorCounts, setValidationErrorCounts] = useState<Record<string, number>>({})
  const handleValidationErrorCount = useCallback((componentId: string, count: number) => {
    setValidationErrorCounts(current =>
      current[componentId] === count ? current : { ...current, [componentId]: count },
    )
  }, [])
  const { rightPanelTab } = ui
  const selectedComponentId = selectedScreenComponentId(ui.selection)

  if (rightPanelTab === 'changes' && activeChangeSet) {
    return <ChangesPanel changeSet={activeChangeSet} />
  }

  if (ui.selection?.type === 'resolvedDefinitionNode') {
    const resolved = resolveComponentTarget(
      effectiveDocument,
      ui.selection.screenId,
      {
        type: 'definitionNode',
        instanceId: ui.selection.instanceId,
        nodePath: ui.selection.nodePath,
      },
      ui.activeStateId,
    )
    const definition = resolved.definitionId
      ? getOwnEntity(effectiveDocument.componentDefinitions, resolved.definitionId)
      : undefined
    const activeState = ui.activeStateId
      ? getOwnEntity(effectiveDocument.screenScenarios, ui.activeStateId)
      : undefined
    const target = selectionCanonicalTarget(effectiveDocument, ui.selection)
    const behavior = target
      ? getComponentTargetBehavior(effectiveDocument, ui.selection.screenId, target)
      : null
    const eventEditor = target
      ? getEventEditorContextForTarget(effectiveDocument, ui.selection.screenId, target)
      : null
    const apiEditor = target
      ? getApiEditorContextForTarget(
          effectiveDocument,
          ui.selection.screenId,
          target,
          locale,
        )
      : null
    const override = target && activeState
      ? findScenarioOverride(activeState, target)?.override
      : undefined
    const setOverride = (
      key: 'visible' | 'enabled',
      value: boolean | undefined,
    ) => {
      if (!activeState || !target) return
      const command = createSetTargetOverrideFieldCommand(activeState, target, key, value)
      if (command) dispatch(command, `Update resolved ${key}`)
    }
    return (
      <div className={styles.root} data-resolved-node-inspector>
        <h3 className={styles.heading}>{resolvedNodeInspectorLabel(resolved)}</h3>
        <p className={styles.context}>{definition?.name}</p>
        <p className={styles.reviewLock}>{t('definitions.resolvedSealed')}</p>
        <div className={styles.inlineActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!definition}
            onClick={() => {
              if (!definition) return
              setSelection(definitionEditorNodeSelection(
                definition.id,
                [definition.rootNodeId],
              ))
            }}
          >
            {t('definitions.editDefinition')}
          </button>
        </div>
        {activeState && target ? (
          <InspectorSection
            sectionId="stateOverrides"
            title={t('inspector.sectionStateOverrides')}
            expanded
            badges={[]}
            onToggle={() => undefined}
          >
            <Field label={t('inspector.visible')}>{controlId => (
              <select
                id={controlId}
                className={styles.input}
                disabled={Boolean(activeChangeSet)}
                value={override?.visible === undefined ? '' : String(override.visible)}
                onChange={event => setOverride(
                  'visible',
                  event.target.value === '' ? undefined : event.target.value === 'true',
                )}
              >
                <option value="">{t('definitions.defaultValue')}</option>
                <option value="true">{t('review.value.yes')}</option>
                <option value="false">{t('review.value.no')}</option>
              </select>
            )}</Field>
            <Field label={t('inspector.enabled')}>{controlId => (
              <select
                id={controlId}
                className={styles.input}
                disabled={Boolean(activeChangeSet)}
                value={override?.enabled === undefined ? '' : String(override.enabled)}
                onChange={event => setOverride(
                  'enabled',
                  event.target.value === '' ? undefined : event.target.value === 'true',
                )}
              >
                <option value="">{t('definitions.defaultValue')}</option>
                <option value="true">{t('review.value.yes')}</option>
                <option value="false">{t('review.value.no')}</option>
              </select>
            )}</Field>
            {override ? (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={Boolean(activeChangeSet)}
                onClick={() => {
                  const command = createResetTargetOverrideCommand(activeState, target)
                  if (command) dispatch(command, 'Reset resolved override')
                }}
              >
                {t('definitions.resetOverride')}
              </button>
            ) : null}
          </InspectorSection>
        ) : null}
        {behavior && eventEditor && apiEditor ? (
          <InspectorSection
            sectionId="behavior"
            title={t('inspector.sectionBehavior')}
            expanded
            badges={[]}
            onToggle={() => undefined}
          >
            <BehaviorDetails
              behavior={behavior}
              eventEditor={eventEditor}
              apiEditor={apiEditor}
            />
          </InspectorSection>
        ) : null}
      </div>
    )
  }

  if (!selectedComponentId) {
    return <p className={styles.empty}>{t('inspector.selectComponent')}</p>
  }

  const selectedBaseComponent = getOwnEntity(
    effectiveDocument.components,
    selectedComponentId,
  )
  const protectedActiveStateMissing = Boolean(
    ui.activeStateId &&
    !getOwnEntity(effectiveDocument.screenScenarios, ui.activeStateId),
  )
  const inspectorDialogProtected = reviewDraftProtectionIds.some(id =>
    id.startsWith('dialog:')
  )
  const inspectorDocument = (
    reviewDraftProtectionIds.length > 0 &&
    reviewDraftDocument &&
    (
      inspectorDialogProtected ||
      !selectedBaseComponent ||
      protectedActiveStateMissing
    )
  )
    ? reviewDraftDocument
    : effectiveDocument
  const baseComp = selectedBaseComponent ??
    getOwnEntity(inspectorDocument.components, selectedComponentId)
  if (!baseComp) return null
  const activeState = ui.activeStateId
    ? getOwnEntity(inspectorDocument.screenScenarios, ui.activeStateId)
    : undefined
  const comp = effectiveComponent(inspectorDocument, baseComp, activeState)
  const screen = getOwnEntity(inspectorDocument.screens, comp.screenId)
  const selectionContext = getComponentSelectionContext(
    inspectorDocument,
    selectedComponentId,
    locale,
    activeState,
  )
  if (!selectionContext) return null
  if (baseComp.nodeType === 'definitionInstance') {
    const definition = resolveComponentDefinitionRefV3(inspectorDocument, baseComp.source.$ref)
    const parent = baseComp.parentId
      ? getOwnEntity(inspectorDocument.components, baseComp.parentId)
      : undefined
    const effectiveParent = parent
      ? effectiveComponent(inspectorDocument, parent, activeState)
      : undefined
    const parentLayout = effectiveParent && (
      effectiveParent.config.kind === 'page' ||
      effectiveParent.config.kind === 'container' ||
      effectiveParent.config.kind === 'modal'
    )
      ? effectiveParent.config
      : null
    const updateInstance = (
      patch: Omit<Extract<
        import('../../domain/commands').DomainCommand,
        { type: 'updateDefinitionInstance' }
      >, 'type' | 'componentId'>,
      label: string,
    ) => dispatch(
      { type: 'updateDefinitionInstance', componentId: baseComp.id, ...patch },
      label,
    )
    return (
      <div className={styles.root}>
        <h3 className={styles.heading}>{selectionContext.targetLabel}</h3>
        <p className={styles.context}>{selectionContext.screenName}</p>
        <p className={styles.context}>{definition.description}</p>
        <div className={styles.inlineActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setSelection(
              definitionEditorNodeSelection(definition.id, [definition.rootNodeId]),
            )}
          >
            {t('definitions.editDefinition')}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={Boolean(activeChangeSet)}
            onClick={() => dispatch(
              createDetachDefinitionInstanceCommand(
                effectiveDocument,
                baseComp.id,
                () => `component-${crypto.randomUUID()}`,
              ),
              t('definitions.detach'),
            )}
          >
            {t('definitions.detach')}
          </button>
        </div>
        <InspectorSection
          sectionId="content"
          title={t('definitions.instance')}
          expanded
          badges={[]}
          onToggle={() => undefined}
        >
          <Field label={t('definitions.variant')}>{controlId => (
            <select
              id={controlId}
              className={styles.input}
              value={baseComp.variantId ?? ''}
              onChange={event => updateInstance(
                { variantId: event.target.value || null },
                t('definitions.variant'),
              )}
            >
              <option value="">{t('definitions.baseVariant')}</option>
              {definition.variants.map(variant => (
                <option key={variant.id} value={variant.id}>{variant.name}</option>
              ))}
            </select>
          )}</Field>
          {definition.publicProps.map(prop => (
            <Field key={prop.key} label={prop.name}>{controlId => (
              <div className={styles.inlineField}>
                {prop.type === 'boolean' ? (
                  <select
                    id={controlId}
                    className={styles.input}
                    value={Object.prototype.hasOwnProperty.call(baseComp.props, prop.key)
                      ? String(baseComp.props[prop.key])
                      : ''}
                    onChange={event => {
                      const props = { ...baseComp.props }
                      if (event.target.value === '') delete props[prop.key]
                      else props[prop.key] = event.target.value === 'true'
                      updateInstance({ props }, prop.name)
                    }}
                  >
                    <option value="">{t('definitions.defaultValue')}</option>
                    <option value="true">{t('review.value.yes')}</option>
                    <option value="false">{t('review.value.no')}</option>
                  </select>
                ) : prop.type === 'enum' ? (
                  <select
                    id={controlId}
                    className={styles.input}
                    value={String(baseComp.props[prop.key] ?? '')}
                    onChange={event => {
                      const props = { ...baseComp.props }
                      if (event.target.value === '') delete props[prop.key]
                      else props[prop.key] = event.target.value
                      updateInstance({ props }, prop.name)
                    }}
                  >
                    <option value="">{t('definitions.defaultValue')}</option>
                    {prop.values.map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                ) : (
                  <input
                    id={controlId}
                    className={styles.input}
                    type={prop.type === 'number' ? 'number' : 'text'}
                    value={String(baseComp.props[prop.key] ?? '')}
                    placeholder={t('definitions.defaultValue')}
                    onChange={event => {
                      const props = { ...baseComp.props }
                      if (event.target.value === '') delete props[prop.key]
                      else props[prop.key] = prop.type === 'number'
                        ? Number(event.target.value)
                        : event.target.value
                      updateInstance({ props }, prop.name)
                    }}
                  />
                )}
              </div>
            )}</Field>
          ))}
        </InspectorSection>
        <InspectorSection
          sectionId="placement"
          title={t('inspector.sectionPlacement')}
          expanded
          badges={[]}
          onToggle={() => undefined}
        >
          <SizingFields
            sizing={baseComp.sizing}
            placement={baseComp.placement}
            parentLayout={parentLayout}
            onUpdate={sizing => updateInstance({ sizing }, t('inspector.sectionPlacement'))}
          />
          <PlacementFields
            placement={baseComp.placement}
            onUpdate={placement => updateInstance(
              { placement },
              t('inspector.sectionPlacement'),
            )}
          />
        </InspectorSection>
      </div>
    )
  }

  const cfg = comp.config
  const linkDestination = cfg.kind === 'link' ? cfg.destination : undefined
  const behavior = getComponentBehavior(inspectorDocument, comp.id)
  const eventEditor = getEventEditorContext(inspectorDocument, comp.id)
  const apiEditor = getApiEditorContext(inspectorDocument, comp.id, locale)
  const validationEditor = getValidationRulesEditorContext(inspectorDocument, comp.id, locale)
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
  const selectedOverride = findInlineScenarioOverride(activeState, comp.id)?.override
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

  function updatePlacement(placement: ComponentPlacement): boolean {
    return dispatch(
      { type: 'updateComponentSpec', componentId: comp!.id, patch: { placement } },
      `Update ${comp!.kind} placement: ${comp!.id}`,
    )
  }

  function updateSizing(sizing: ComponentSizing): boolean {
    return dispatch(
      { type: 'updateComponentSpec', componentId: comp!.id, patch: { sizing } },
      `Update ${comp!.kind} sizing: ${comp!.id}`,
    )
  }

  const parent = comp.parentId
    ? getOwnEntity(inspectorDocument.components, comp.parentId)
    : undefined
  const parentLayout = parent && isInlineScreenComponent(parent) && (
    parent.config.kind === 'page' ||
    parent.config.kind === 'container' ||
    parent.config.kind === 'modal'
  ) ? parent.config : null
  const selectedLayout = cfg.kind === 'page' ||
    cfg.kind === 'container' ||
    cfg.kind === 'modal'
    ? cfg
    : null
  const minimumGridColumns = selectedLayout
    ? Math.max(
        1,
        ...comp.childIds.flatMap(id => {
          const child = getOwnEntity(inspectorDocument.components, id)
          return child?.placement.mode === 'flow' ? [child.sizing.gridSpan] : []
        }),
      )
    : 1
  const flowChildSizing = comp.childIds.flatMap(id => {
    const child = getOwnEntity(inspectorDocument.components, id)
    return child?.placement.mode === 'flow' ? [child.sizing] : []
  })
  const layoutAvailability = {
    vertical: flowChildSizing.every(sizing =>
      sizing.gridSpan === 1 && sizing.grow === 0 && sizing.shrink === 'allow'),
    horizontal: flowChildSizing.every(sizing => sizing.gridSpan === 1),
    grid: flowChildSizing.every(sizing =>
      sizing.grow === 0 &&
      sizing.shrink === 'allow' &&
      sizing.gridSpan <= (selectedLayout?.columns ?? 1)),
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
                    onClick={() => selectScreenComponent(item.componentId)}
                  >
                    {item.label}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
      </header>
      {baseComp.parentId !== null ? (
        <div className={styles.inlineActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={Boolean(activeChangeSet)}
            onClick={() => {
              try {
                const command = createExtractDefinitionCommand(
                  effectiveDocument,
                  baseComp.id,
                  `definition-${crypto.randomUUID()}`,
                  `instance-${crypto.randomUUID()}`,
                  selectionContext.targetLabel,
                  () => `node-${crypto.randomUUID()}`,
                )
                if (dispatch(command, t('definitions.extract'))) {
                  selectScreenComponent(command.replacementInstanceId)
                }
              } catch (error) {
                useAppStore.getState().showToast({
                  severity: 'error',
                  message: {
                    key: 'errors.unexpected',
                    params: {
                      message: error instanceof Error ? error.message : String(error),
                    },
                  },
                })
              }
            }}
          >
            {t('definitions.extract')}
          </button>
        </div>
      ) : null}
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
      {cfg.kind === 'image' && (
        <>
          <Field label={t('inspector.imageSource')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:source`}
              draftId={`component:${comp.id}:config.source`}
              ariaLabel={t('inspector.imageSource')}
              className={styles.input}
              value={cfg.source}
              onCommit={source => updateConfig({ source }, 'source')}
              validate={source =>
                isSafePortableUrl(source, true) ? null : t('canvas.imageInvalid')}
            />
          )}</Field>
          <Field label={t('inspector.imageAlt')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:alt`}
              draftId={`component:${comp.id}:config.alt`}
              ariaLabel={t('inspector.imageAlt')}
              className={styles.input}
              value={cfg.alt}
              onCommit={alt => updateConfig({ alt }, 'alt text')}
              validate={alt => alt.trim().length > 0 ? null : t('errors.requiredValue')}
            />
          )}</Field>
          <Field label={t('inspector.imageFit')}>{controlId => (
            <select id={controlId} className={styles.input} value={cfg.fit} onChange={event => updateConfig({ fit: event.target.value })}>
              <option value="contain">{t('inspector.fitContain')}</option>
              <option value="cover">{t('inspector.fitCover')}</option>
            </select>
          )}</Field>
          <Field label={t('inspector.imageAspectRatio')}>{controlId => (
            <select id={controlId} className={styles.input} value={cfg.aspectRatio} onChange={event => updateConfig({ aspectRatio: event.target.value })}>
              <option value="auto">{t('inspector.aspectAuto')}</option>
              <option value="square">1:1</option>
              <option value="4:3">4:3</option>
              <option value="16:9">16:9</option>
            </select>
          )}</Field>
          <Field label={t('inspector.imagePlaceholder')}>{controlId => (
            <select id={controlId} className={styles.input} value={cfg.placeholderStyle} onChange={event => updateConfig({ placeholderStyle: event.target.value })}>
              <option value="icon">{t('inspector.placeholderIcon')}</option>
              <option value="skeleton">{t('inspector.placeholderSkeleton')}</option>
            </select>
          )}</Field>
        </>
      )}
      {cfg.kind === 'link' && linkDestination && (
        <>
          <Field label={t('inspector.linkLabel')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${comp.id}:linkLabel`}
              draftId={`component:${comp.id}:config.label`}
              ariaLabel={t('inspector.linkLabel')}
              className={styles.input}
              value={cfg.label}
              onCommit={label => updateConfig({ label }, 'label')}
              validate={label => label.trim().length > 0 ? null : t('errors.requiredValue')}
            />
          )}</Field>
          <Field label={t('inspector.linkDestinationType')}>{controlId => (
            <select
              id={controlId}
              className={styles.input}
              value={linkDestination.type}
              onChange={event => {
                const type = event.target.value
                if (type === 'internal') {
                  updateConfig({
                    destination: { type, screenId: screen?.id ?? inspectorDocument.project.screenIds[0] },
                    openMode: 'sameContext',
                  }, 'destination')
                } else if (type === 'external') {
                  updateConfig({
                    destination: { type, url: 'https://example.com' },
                    openMode: 'newContext',
                  }, 'destination')
                } else {
                  updateConfig({
                    destination: {
                      type: 'resource',
                      resourceId: 'resource-1',
                      url: '/resources/file',
                      displayName: 'Resource',
                    },
                    openMode: 'sameContext',
                  }, 'destination')
                }
              }}
            >
              <option value="internal">{t('inspector.linkInternal')}</option>
              <option value="external">{t('inspector.linkExternal')}</option>
              <option value="resource">{t('inspector.linkResource')}</option>
            </select>
          )}</Field>
          {linkDestination.type === 'internal' ? (
            <Field label={t('inspector.linkScreen')}>{controlId => (
              <select
                id={controlId}
                className={styles.input}
                value={linkDestination.screenId}
                onChange={event => updateConfig({
                  destination: { type: 'internal', screenId: event.target.value },
                }, 'destination')}
              >
                {inspectorDocument.project.screenIds.map(screenId => {
                  const destinationScreen = getOwnEntity(inspectorDocument.screens, screenId)
                  return destinationScreen
                    ? <option key={screenId} value={screenId}>{destinationScreen.name}</option>
                    : null
                })}
              </select>
            )}</Field>
          ) : (
            <Field label={t('inspector.linkUrl')}>{controlId => (
              <DraftTextField
                id={controlId}
                key={`${comp.id}:destinationUrl:${linkDestination.type}`}
                draftId={`component:${comp.id}:config.destination.url`}
                ariaLabel={t('inspector.linkUrl')}
                className={styles.input}
                value={linkDestination.url}
                onCommit={url => updateConfig({
                  destination: { ...linkDestination, url },
                }, 'destination URL')}
                validate={url => (
                  linkDestination.type === 'external'
                    ? isSafeExternalUrl(url)
                    : isSafePortableUrl(url)
                ) ? null : t('canvas.imageInvalid')}
              />
            )}</Field>
          )}
          {linkDestination.type === 'resource' ? (
            <>
              <Field label={t('inspector.linkResourceId')}>{controlId => (
                <DraftTextField
                  id={controlId}
                  key={`${comp.id}:resourceId`}
                  draftId={`component:${comp.id}:config.destination.resourceId`}
                  ariaLabel={t('inspector.linkResourceId')}
                  className={styles.input}
                  value={linkDestination.resourceId}
                  onCommit={resourceId => updateConfig({
                    destination: { ...linkDestination, resourceId },
                  }, 'resource ID')}
                />
              )}</Field>
              <Field label={t('inspector.linkResourceName')}>{controlId => (
                <DraftTextField
                  id={controlId}
                  key={`${comp.id}:resourceName`}
                  draftId={`component:${comp.id}:config.destination.displayName`}
                  ariaLabel={t('inspector.linkResourceName')}
                  className={styles.input}
                  value={linkDestination.displayName}
                  onCommit={displayName => updateConfig({
                    destination: { ...linkDestination, displayName },
                  }, 'resource name')}
                />
              )}</Field>
            </>
          ) : null}
          <Field label={t('inspector.linkOpenMode')}>{controlId => (
            <select
              id={controlId}
              className={styles.input}
              value={cfg.openMode}
              onChange={event => updateConfig({ openMode: event.target.value }, 'open mode')}
            >
              <option value="sameContext">{t('inspector.openSameContext')}</option>
              {linkDestination.type !== 'internal' ? (
                <option value="newContext">{t('inspector.openNewContext')}</option>
              ) : null}
              {linkDestination.type === 'resource' ? (
                <option value="download">{t('inspector.openDownload')}</option>
              ) : null}
            </select>
          )}</Field>
          {cfg.openMode === 'download' ? (
            <p className={styles.reviewLock}>{t('inspector.downloadHelp')}</p>
          ) : null}
        </>
      )}
        </InspectorSection>
      ) : null}
      {componentHasLayoutSection(cfg.kind) && (cfg.kind === 'page' ||
        cfg.kind === 'container' ||
        cfg.kind === 'modal') ? (
        <InspectorSection
          sectionId="layout"
          title={t('inspector.sectionLayout')}
          expanded={sectionExpanded('layout')}
          badges={sectionBadges('layout')}
          onToggle={() => toggleSection('layout')}
        >
          <LayoutFields
            layout={cfg}
            minimumGridColumns={minimumGridColumns}
            availability={layoutAvailability}
            onUpdate={updateConfig}
          />
        </InspectorSection>
      ) : null}
      {comp.parentId !== null ? (
        <InspectorSection
          sectionId="placement"
          title={t('inspector.sectionPlacement')}
          expanded={sectionExpanded('placement')}
          badges={sectionBadges('placement')}
          onToggle={() => toggleSection('placement')}
        >
          <SizingFields
            sizing={comp.sizing}
            placement={comp.placement}
            parentLayout={parentLayout}
            onUpdate={updateSizing}
          />
          <PlacementFields placement={comp.placement} onUpdate={updatePlacement} />
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
          document={inspectorDocument}
          component={comp}
          state={activeState}
        />
      </InspectorSection>
    </div>
  )
}

const PLACEMENT_INSET_OPTIONS: readonly PlacementInset[] = ['none', 'xs', 'sm', 'md', 'lg']
const PLACEMENT_ANCHOR_OPTIONS: readonly PlacementAnchor[] = [
  'topLeft',
  'topCenter',
  'topRight',
  'centerLeft',
  'center',
  'centerRight',
  'bottomLeft',
  'bottomCenter',
  'bottomRight',
]

function defaultPlacement(mode: ComponentPlacement['mode']): ComponentPlacement {
  switch (mode) {
    case 'flow':
      return { mode }
    case 'sticky':
      return { mode, edge: 'top', inset: 'none' }
    case 'overlay':
    case 'viewport':
      return { mode, anchor: 'topLeft', insetX: 'none', insetY: 'none' }
  }
}

function isHorizontalCenter(anchor: PlacementAnchor): boolean {
  return anchor === 'topCenter' || anchor === 'center' || anchor === 'bottomCenter'
}

function isVerticalCenter(anchor: PlacementAnchor): boolean {
  return anchor === 'centerLeft' || anchor === 'center' || anchor === 'centerRight'
}

function PlacementFields({
  placement,
  onUpdate,
}: {
  placement: ComponentPlacement
  onUpdate(placement: ComponentPlacement): void
}) {
  const { t } = useI18n()
  const updateAnchor = (anchor: PlacementAnchor) => {
    if (placement.mode !== 'overlay' && placement.mode !== 'viewport') return
    onUpdate({
      ...placement,
      anchor,
      insetX: isHorizontalCenter(anchor) ? 'none' : placement.insetX,
      insetY: isVerticalCenter(anchor) ? 'none' : placement.insetY,
    })
  }
  return (
    <div className={styles.layoutSection} data-placement-settings>
      <div className={styles.settingsHeading}>
        <p>{t('inspector.placementHelp')}</p>
      </div>
      <Field label={t('inspector.placementMode')}>{controlId => (
        <select
          id={controlId}
          className={styles.input}
          value={placement.mode}
          onChange={event =>
            onUpdate(defaultPlacement(event.target.value as ComponentPlacement['mode']))}
        >
          <option value="flow">{t('inspector.placementFlow')}</option>
          <option value="sticky">{t('inspector.placementSticky')}</option>
          <option value="overlay">{t('inspector.placementOverlay')}</option>
          <option value="viewport">{t('inspector.placementViewport')}</option>
        </select>
      )}</Field>
      {placement.mode === 'sticky' ? (
        <>
          <Field label={t('inspector.placementEdge')}>{controlId => (
            <select
              id={controlId}
              className={styles.input}
              value={placement.edge}
              onChange={event => onUpdate({
                ...placement,
                edge: event.target.value as 'top' | 'bottom',
              })}
            >
              <option value="top">{t('inspector.placementTop')}</option>
              <option value="bottom">{t('inspector.placementBottom')}</option>
            </select>
          )}</Field>
          <InsetField
            label={t('inspector.placementInset')}
            value={placement.inset}
            onChange={inset => onUpdate({ ...placement, inset })}
          />
          <div className={styles.settingsHeading}>
            <p>{t('inspector.placementStickyHelp')}</p>
          </div>
        </>
      ) : null}
      {placement.mode === 'overlay' || placement.mode === 'viewport' ? (
        <>
          <Field label={t('inspector.placementAnchor')}>{controlId => (
            <select
              id={controlId}
              className={styles.input}
              value={placement.anchor}
              onChange={event => updateAnchor(event.target.value as PlacementAnchor)}
            >
              {PLACEMENT_ANCHOR_OPTIONS.map(anchor => (
                <option key={anchor} value={anchor}>
                  {t(`inspector.placementAnchor.${anchor}` as MessageKey)}
                </option>
              ))}
            </select>
          )}</Field>
          <InsetField
            label={t('inspector.placementInsetX')}
            value={placement.insetX}
            disabled={isHorizontalCenter(placement.anchor)}
            onChange={insetX => onUpdate({ ...placement, insetX })}
          />
          <InsetField
            label={t('inspector.placementInsetY')}
            value={placement.insetY}
            disabled={isVerticalCenter(placement.anchor)}
            onChange={insetY => onUpdate({ ...placement, insetY })}
          />
        </>
      ) : null}
    </div>
  )
}

function InsetField({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string
  value: PlacementInset
  disabled?: boolean
  onChange(value: PlacementInset): void
}) {
  const { t } = useI18n()
  return (
    <Field label={label}>{controlId => (
      <select
        id={controlId}
        className={styles.input}
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value as PlacementInset)}
      >
        {PLACEMENT_INSET_OPTIONS.map(token => (
          <option key={token} value={token}>
            {t(`inspector.placementInset.${token}` as MessageKey)}
          </option>
        ))}
      </select>
    )}</Field>
  )
}

const SIZE_TOKEN_RANK = new Map(COMPONENT_SIZE_TOKENS.map((token, index) => [token, index]))

function SizingFields({
  sizing,
  placement,
  parentLayout,
  onUpdate,
}: {
  sizing: ComponentSizing
  placement: ComponentPlacement
  parentLayout: ComponentLayout | null
  onUpdate(sizing: ComponentSizing): void
}) {
  const { t } = useI18n()
  const isFlow = placement.mode === 'flow'
  const context = !isFlow ? 'nonFlow' : parentLayout?.layout ?? 'vertical'
  const minRank = SIZE_TOKEN_RANK.get(sizing.minWidth) ?? 0
  const maxRank = SIZE_TOKEN_RANK.get(sizing.maxWidth) ?? 0
  return (
    <div className={styles.layoutSection} data-sizing-settings data-sizing-context={context}>
      <div className={styles.settingsHeading}>
        <p>{t(`inspector.sizingHelp.${context}` as MessageKey)}</p>
      </div>
      <Field label={t('inspector.inlineSize')}>{controlId => (
        <select
          id={controlId}
          className={styles.input}
          value={sizing.inlineSize}
          onChange={event => onUpdate({
            ...sizing,
            inlineSize: event.target.value as ComponentSizing['inlineSize'],
          })}
        >
          <option value="auto" disabled={sizing.grow > 0}>
            {t('inspector.inlineSize.auto')}
          </option>
          <option value="content" disabled={sizing.grow > 0}>
            {t('inspector.inlineSize.content')}
          </option>
          <option value="fill" disabled={false}>{t('inspector.inlineSize.fill')}</option>
        </select>
      )}</Field>
      <Field label={t('inspector.minWidth')}>{controlId => (
        <select
          id={controlId}
          className={styles.input}
          value={sizing.minWidth}
          onChange={event => onUpdate({
            ...sizing,
            minWidth: event.target.value as ComponentSizeToken,
          })}
        >
          {COMPONENT_SIZE_TOKENS.map((token, rank) => (
            <option
              key={token}
              value={token}
              disabled={sizing.maxWidth !== 'none' && token !== 'none' && rank > maxRank}
            >
              {t(`inspector.sizeToken.${token}` as MessageKey)}
            </option>
          ))}
        </select>
      )}</Field>
      <Field label={t('inspector.maxWidth')}>{controlId => (
        <select
          id={controlId}
          className={styles.input}
          value={sizing.maxWidth}
          onChange={event => onUpdate({
            ...sizing,
            maxWidth: event.target.value as ComponentSizeToken,
          })}
        >
          {COMPONENT_SIZE_TOKENS.map((token, rank) => (
            <option
              key={token}
              value={token}
              disabled={sizing.minWidth !== 'none' && token !== 'none' && rank < minRank}
            >
              {t(`inspector.sizeToken.${token}` as MessageKey)}
            </option>
          ))}
        </select>
      )}</Field>
      <div className={styles.settingsHeading}>
        <p>{t('inspector.widthBoundsHelp')}</p>
      </div>
      {context === 'grid' && parentLayout?.layout === 'grid' ? (
        <Field label={t('inspector.gridSpan')}>{controlId => (
          <select
            id={controlId}
            className={styles.input}
            value={sizing.gridSpan}
            onChange={event => onUpdate({
              ...sizing,
              gridSpan: Number(event.target.value) as ComponentSizing['gridSpan'],
            })}
          >
            {Array.from({ length: parentLayout.columns }, (_, index) => index + 1).map(span => (
              <option key={span} value={span}>{span}</option>
            ))}
          </select>
        )}</Field>
      ) : null}
      {context === 'horizontal' ? (
        <>
          <Field label={t('inspector.grow')}>{controlId => (
            <select
              id={controlId}
              className={styles.input}
              value={sizing.grow}
              onChange={event => onUpdate({
                ...sizing,
                grow: Number(event.target.value) as ComponentSizing['grow'],
              })}
            >
              {[0, 1, 2, 3].map(grow => (
                <option
                  key={grow}
                  value={grow}
                  disabled={grow > 0 && (
                    sizing.inlineSize !== 'fill' || sizing.shrink !== 'allow'
                  )}
                >
                  {grow}
                </option>
              ))}
            </select>
          )}</Field>
          <Field label={t('inspector.shrink')}>{controlId => (
            <select
              id={controlId}
              className={styles.input}
              value={sizing.shrink}
              onChange={event => onUpdate({
                ...sizing,
                shrink: event.target.value as ComponentSizing['shrink'],
              })}
            >
              <option value="allow">{t('inspector.shrink.allow')}</option>
              <option value="prevent" disabled={sizing.grow > 0}>
                {t('inspector.shrink.prevent')}
              </option>
            </select>
          )}</Field>
          <div className={styles.settingsHeading}>
            <p>{t('inspector.growRequirement')}</p>
          </div>
        </>
      ) : null}
    </div>
  )
}

function LayoutFields({
  layout,
  minimumGridColumns,
  availability,
  onUpdate,
}: {
  layout: ComponentLayout
  minimumGridColumns: number
  availability: Record<ComponentLayout['layout'], boolean>
  onUpdate(partial: Record<string, unknown>): void
}) {
  const { t } = useI18n()

  return (
    <div className={styles.layoutSection} data-layout-settings>
      <Field label={t('inspector.layout')}>{controlId => (
        <select id={controlId} className={styles.input} value={layout.layout} onChange={event => onUpdate({ layout: event.target.value })}>
          <option value="vertical" disabled={!availability.vertical}>
            {t('inspector.layoutVertical')}
          </option>
          <option value="horizontal" disabled={!availability.horizontal}>
            {t('inspector.layoutHorizontal')}
          </option>
          <option value="grid" disabled={!availability.grid}>
            {t('inspector.layoutGrid')}
          </option>
        </select>
      )}</Field>
      {Object.values(availability).some(available => !available) ? (
        <div className={styles.settingsHeading}>
          <p>{t('inspector.layoutSizingBlocked')}</p>
        </div>
      ) : null}
      <Field label={t('inspector.gap')}>{controlId => (
        <select id={controlId} className={styles.input} value={layout.gap} onChange={event => onUpdate({ gap: event.target.value })}>
          <option value="none">{t('inspector.gapNone')}</option>
          <option value="sm">{t('inspector.gapSmall')}</option>
          <option value="md">{t('inspector.gapMedium')}</option>
          <option value="lg">{t('inspector.gapLarge')}</option>
        </select>
      )}</Field>
      {layout.layout === 'grid' ? (
        <>
          <Field label={t('inspector.columns')}>{controlId => (
            <select id={controlId} className={styles.input} value={layout.columns} onChange={event => onUpdate({ columns: Number(event.target.value) })}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map(columns => (
                <option
                  key={columns}
                  value={columns}
                  disabled={columns < minimumGridColumns}
                >
                  {columns}
                </option>
              ))}
            </select>
          )}</Field>
          {minimumGridColumns > 1 ? (
            <div className={styles.settingsHeading}>
              <p>{t('inspector.minimumGridColumns', { columns: minimumGridColumns })}</p>
            </div>
          ) : null}
        </>
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
  document,
  component,
  state,
}: {
  document: ProjectDocument
  component: EffectiveScreenComponent
  state?: ScreenState
}) {
  const { t } = useI18n()
  const dispatch = useAppStore(current => current.dispatch)
  if (!state) {
    return (
      <div
        className={`${styles.overrideSection} ${styles.inactiveOverrideSection}`}
        data-state-overrides
        data-override-mode="base"
      >
        <div className={styles.overrideHeading}>
          <span data-override-heading>{t('overrides.noState')}</span>
        </div>
        <p className={styles.overrideExplanation} data-override-explanation>
          {t('overrides.noStateExplanation')}
        </p>
      </div>
    )
  }

  const selectedState = state
  const { component: effective, override: selectedOverride, hasOverride } =
    resolveEffectiveComponentState(document, component, selectedState)
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
          <span data-override-heading>
            {t('overrides.forState', { name: selectedState.name })}
          </span>
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
      <p className={styles.overrideExplanation} data-override-explanation>
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

function overrideContent(component: EffectiveScreenComponent, effective: EffectiveScreenComponent): {
  key: 'text' | 'value'
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
