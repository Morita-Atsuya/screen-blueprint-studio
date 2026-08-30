import { useAppStore } from '../../app/appStore'
import styles from './Inspector.module.css'
import { deleteOwnEntity, getOwnEntity, setOwnEntity } from '../../domain/entityMap'
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
import { BehaviorDetails } from './BehaviorDetails'
import { getComponentSelectionContext } from '../../domain/componentDisplayLabel'
import { ChangeOperationList } from '../change-review/ChangeOperationList'
import { canDuplicateComponent } from '../../domain/componentDuplication'

export function Inspector() {
  const { locale, t } = useI18n()
  const {
    effectiveDocument,
    ui,
    dispatch,
    duplicateComponent,
    activeChangeSet,
    setSelectedComponent,
  } = useAppStore()
  const { selectedComponentId, rightPanelTab } = ui

  if (rightPanelTab === 'changes' && activeChangeSet) {
    return <ChangesPanel changeSet={activeChangeSet} />
  }

  if (!selectedComponentId) {
    return <p className={styles.empty}>{t('inspector.selectComponent')}</p>
  }

  const comp = getOwnEntity(effectiveDocument.components, selectedComponentId)
  if (!comp) return null
  const activeState = ui.activeStateId
    ? getOwnEntity(effectiveDocument.screenStates, ui.activeStateId)
    : undefined
  const screen = getOwnEntity(effectiveDocument.screens, comp.screenId)
  const selectionContext = getComponentSelectionContext(
    effectiveDocument,
    selectedComponentId,
    locale,
    activeState,
  )
  if (!selectionContext) return null

  const cfg = comp.config
  const behavior = getComponentBehavior(effectiveDocument, comp.id, locale)
  const eventEditor = getEventEditorContext(effectiveDocument, comp.id, locale)
  const apiEditor = getApiEditorContext(effectiveDocument, comp.id, locale)
  const validationEditor = getValidationRulesEditorContext(effectiveDocument, comp.id, locale)

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
        {canDuplicateComponent(effectiveDocument, comp.id) ? (
          <button
            type="button"
            className={styles.duplicateButton}
            title={t('inspector.duplicateTitle')}
            aria-label={t('inspector.duplicateTitle')}
            data-component-duplicate-inspector
            onClick={() => duplicateComponent(
              comp.id,
              t('componentMenu.duplicateHistory'),
            )}
          >
            {t('inspector.duplicate')}
          </button>
        ) : null}
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
      <div className={styles.section}>
        <label className={styles.label}>{t('inspector.description')}</label>
        <DraftTextField
          key={`${comp.id}:description`}
          draftId={`component:${comp.id}:common.description`}
          ariaLabel={t('inspector.description')}
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
      <hr className={styles.divider} />
      {/* Kind-specific fields */}
      {cfg.kind === 'text' && (
        <>
          <Field label={t('inspector.text')}>
            <DraftTextField
              key={`${comp.id}:text`}
              draftId={`component:${comp.id}:config.text`}
              ariaLabel={t('inspector.text')}
              className={styles.textarea}
              value={cfg.text}
              onCommit={text => updateConfig({ text }, 'text')}
              multiline
              rows={3}
            />
          </Field>
          <Field label={t('inspector.textStyle')}>
            <select className={styles.input} value={cfg.style} onChange={e => updateConfig({ style: e.target.value })}>
              <option value="heading1">{t('inspector.textStyleHeading1')}</option>
              <option value="heading2">{t('inspector.textStyleHeading2')}</option>
              <option value="heading3">{t('inspector.textStyleHeading3')}</option>
              <option value="body">{t('inspector.textStyleBody')}</option>
              <option value="caption">{t('inspector.textStyleCaption')}</option>
            </select>
          </Field>
        </>
      )}
      {cfg.kind === 'textInput' && (
        <>
          <Field label={t('inspector.fieldKey')}>
            <DraftTextField
              key={`${comp.id}:fieldKey`}
              draftId={`component:${comp.id}:config.fieldKey`}
              ariaLabel={t('inspector.fieldKey')}
              className={styles.input}
              value={cfg.fieldKey}
              onCommit={fieldKey => updateConfig({ fieldKey }, 'field key')}
            />
          </Field>
          <Field label={t('inspector.label')}>
            <DraftTextField
              key={`${comp.id}:label`}
              draftId={`component:${comp.id}:config.label`}
              ariaLabel={t('inspector.label')}
              className={styles.input}
              value={cfg.label}
              onCommit={label => updateConfig({ label }, 'label')}
            />
          </Field>
          <Field label={t('inspector.placeholder')}>
            <DraftTextField
              key={`${comp.id}:placeholder`}
              draftId={`component:${comp.id}:config.placeholder`}
              ariaLabel={t('inspector.placeholder')}
              className={styles.input}
              value={cfg.placeholder}
              onCommit={placeholder => updateConfig({ placeholder }, 'placeholder')}
            />
          </Field>
          <Field label={t('inspector.defaultValue')}>
            <DraftTextField
              key={`${comp.id}:defaultValue`}
              draftId={`component:${comp.id}:config.defaultValue`}
              ariaLabel={t('inspector.defaultValue')}
              className={styles.input}
              value={cfg.defaultValue}
              onCommit={defaultValue => updateConfig({ defaultValue }, 'default value')}
            />
          </Field>
          <Field label={t('inspector.inputType')}>
            <select className={styles.input} value={cfg.inputType} onChange={e => updateConfig({ inputType: e.target.value })}>
              <option value="text">{t('inspector.inputText')}</option>
              <option value="email">{t('inspector.inputEmail')}</option>
              <option value="password">{t('inspector.inputPassword')}</option>
            </select>
          </Field>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={cfg.required} onChange={e => updateConfig({ required: e.target.checked })} />
            {t('inspector.required')}
          </label>
        </>
      )}
      {cfg.kind === 'select' && (
        <>
          <Field label={t('inspector.fieldKey')}>
            <DraftTextField
              key={`${comp.id}:fieldKey`}
              draftId={`component:${comp.id}:config.fieldKey`}
              ariaLabel={t('inspector.fieldKey')}
              className={styles.input}
              value={cfg.fieldKey}
              onCommit={fieldKey => updateConfig({ fieldKey }, 'field key')}
            />
          </Field>
          <Field label={t('inspector.label')}>
            <DraftTextField
              key={`${comp.id}:label`}
              draftId={`component:${comp.id}:config.label`}
              ariaLabel={t('inspector.label')}
              className={styles.input}
              value={cfg.label}
              onCommit={label => updateConfig({ label }, 'label')}
            />
          </Field>
          <Field label={t('inspector.options')}>
            <DraftTextField
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
          </Field>
          <Field label={t('inspector.defaultValue')}>
            <select
              className={styles.input}
              value={cfg.defaultValue}
              onChange={e => updateConfig({ defaultValue: e.target.value })}
            >
              <option value="">{t('canvas.selectPlaceholder')}</option>
              {cfg.options.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={cfg.required} onChange={e => updateConfig({ required: e.target.checked })} />
            {t('inspector.required')}
          </label>
        </>
      )}
      {cfg.kind === 'button' && (
        <>
          <Field label={t('inspector.label')}>
            <DraftTextField
              key={`${comp.id}:label`}
              draftId={`component:${comp.id}:config.label`}
              ariaLabel={t('inspector.label')}
              className={styles.input}
              value={cfg.label}
              onCommit={label => updateConfig({ label }, 'label')}
            />
          </Field>
          <Field label={t('inspector.variant')}>
            <select className={styles.input} value={cfg.variant} onChange={e => updateConfig({ variant: e.target.value })}>
              <option value="primary">{t('inspector.variantPrimary')}</option>
              <option value="secondary">{t('inspector.variantSecondary')}</option>
              <option value="danger">{t('inspector.variantDanger')}</option>
            </select>
          </Field>
          <Field label={t('inspector.confirmationMessage')}>
            <DraftTextField
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
          </Field>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={cfg.preventDoubleSubmit} onChange={e => updateConfig({ preventDoubleSubmit: e.target.checked })} />
            {t('inspector.preventDoubleSubmit')}
          </label>
        </>
      )}
      {cfg.kind === 'alert' && (
        <>
          <Field label={t('inspector.tone')}>
            <select className={styles.input} value={cfg.tone} onChange={e => updateConfig({ tone: e.target.value })}>
              <option value="info">{t('inspector.toneInfo')}</option>
              <option value="success">{t('inspector.toneSuccess')}</option>
              <option value="warning">{t('inspector.toneWarning')}</option>
              <option value="error">{t('inspector.toneError')}</option>
            </select>
          </Field>
          <Field label={t('inspector.message')}>
            <DraftTextField
              key={`${comp.id}:message`}
              draftId={`component:${comp.id}:config.message`}
              ariaLabel={t('inspector.message')}
              className={styles.input}
              value={cfg.message}
              onCommit={message => updateConfig({ message }, 'message')}
            />
          </Field>
        </>
      )}
      {(cfg.kind === 'page' ||
        cfg.kind === 'section' ||
        cfg.kind === 'container' ||
        cfg.kind === 'modal') && (
        <LayoutFields layout={cfg} onUpdate={updateConfig} />
      )}
      {behavior && eventEditor && apiEditor && validationEditor ? (
        <BehaviorDetails
          key={comp.id}
          behavior={behavior}
          eventEditor={eventEditor}
          apiEditor={apiEditor}
          validationEditor={validationEditor}
        />
      ) : null}
      {activeState && activeState.id !== screen?.defaultStateId ? (
        <>
          <hr className={styles.divider} />
          <StateOverrides component={comp} state={activeState} />
        </>
      ) : null}
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
    <section className={styles.layoutSection} data-layout-settings>
      <h3>{t('inspector.layoutTitle')}</h3>
      <Field label={t('inspector.layout')}>
        <select className={styles.input} value={layout.layout} onChange={event => onUpdate({ layout: event.target.value })}>
          <option value="vertical">{t('inspector.layoutVertical')}</option>
          <option value="horizontal">{t('inspector.layoutHorizontal')}</option>
          <option value="grid">{t('inspector.layoutGrid')}</option>
        </select>
      </Field>
      <Field label={t('inspector.gap')}>
        <select className={styles.input} value={layout.gap} onChange={event => onUpdate({ gap: event.target.value })}>
          <option value="none">{t('inspector.gapNone')}</option>
          <option value="sm">{t('inspector.gapSmall')}</option>
          <option value="md">{t('inspector.gapMedium')}</option>
          <option value="lg">{t('inspector.gapLarge')}</option>
        </select>
      </Field>
      {layout.layout === 'grid' ? (
        <Field label={t('inspector.columns')}>
          <select className={styles.input} value={layout.columns} onChange={event => onUpdate({ columns: Number(event.target.value) })}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </Field>
      ) : null}
      <Field label={t('inspector.justify')}>
        <select className={styles.input} value={layout.justify} onChange={event => onUpdate({ justify: event.target.value })}>
          <option value="start">{t('inspector.alignStart')}</option>
          <option value="center">{t('inspector.alignCenter')}</option>
          <option value="end">{t('inspector.alignEnd')}</option>
          <option value="between">{t('inspector.alignBetween')}</option>
        </select>
      </Field>
      <Field label={t('inspector.alignment')}>
        <select className={styles.input} value={layout.align} onChange={event => onUpdate({ align: event.target.value })}>
          <option value="start">{t('inspector.alignStart')}</option>
          <option value="center">{t('inspector.alignCenter')}</option>
          <option value="end">{t('inspector.alignEnd')}</option>
          <option value="stretch">{t('inspector.alignStretch')}</option>
        </select>
      </Field>
      {layout.layout === 'horizontal' ? (
        <label className={styles.checkLabel}>
          <input type="checkbox" checked={layout.wrap} onChange={event => onUpdate({ wrap: event.target.checked })} />
          {t('inspector.wrap')}
        </label>
      ) : null}
    </section>
  )
}

function StateOverrides({
  component,
  state,
}: {
  component: ScreenComponent
  state: ScreenState
}) {
  const { t } = useI18n()
  const dispatch = useAppStore(current => current.dispatch)
  const override = getOwnEntity(state.componentOverrides, component.id) ?? {}

  function updateOverride<Key extends keyof ComponentOverride>(
    key: Key,
    value: ComponentOverride[Key] | undefined,
  ): boolean {
    const overrides = Object.assign(
      Object.create(null),
      state.componentOverrides,
    ) as Record<string, ComponentOverride>
    const componentOverride = { ...(getOwnEntity(overrides, component.id) ?? {}) }

    if (value === undefined) {
      delete componentOverride[key]
    } else {
      componentOverride[key] = value
    }

    if (Object.keys(componentOverride).length === 0) {
      deleteOwnEntity(overrides, component.id)
    } else {
      setOwnEntity(overrides, component.id, componentOverride)
    }

    return dispatch({
      type: 'updateScreenState',
      stateId: state.id,
      overrides,
    }, `Update ${state.name} ${key} override: ${component.id}`)
  }

  const content = overrideContent(component)

  return (
    <section className={styles.overrideSection} data-state-overrides>
      <div className={styles.overrideHeading}>
        <h3>{t('overrides.title')}</h3>
        <span>{t('overrides.forState', { name: state.name })}</span>
      </div>
      <Field label={t('inspector.visible')}>
        <select
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
      </Field>
      <Field label={t('inspector.enabled')}>
        <select
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
      </Field>
      {content ? (
        <div className={styles.overrideValue}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
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
          <Field label={t(content.labelKey)}>
            {content.options ? (
              <select
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
                key={`${state.id}:${component.id}:${content.key}`}
                draftId={`state:${state.id}:component:${component.id}:${content.key}`}
                ariaLabel={t(content.labelKey)}
                className={styles.input}
                disabled={override[content.key] === undefined}
                value={override[content.key] ?? content.baseValue}
                onCommit={value => updateOverride(content.key, value)}
              />
            )}
          </Field>
        </div>
      ) : null}
    </section>
  )
}

function overrideContent(component: ScreenComponent): {
  key: 'text' | 'message' | 'value'
  labelKey: MessageKey
  baseValue: string
  options?: Array<{ value: string; label: string }>
} | null {
  const config = component.config
  if (config.kind === 'text') {
    return { key: 'text', labelKey: 'overrides.text', baseValue: config.text }
  }
  if (config.kind === 'alert') {
    return { key: 'message', labelKey: 'overrides.message', baseValue: config.message }
  }
  if (config.kind === 'textInput') {
    return { key: 'value', labelKey: 'overrides.value', baseValue: config.defaultValue }
  }
  if (config.kind === 'select') {
    return {
      key: 'value',
      labelKey: 'overrides.value',
      baseValue: config.defaultValue,
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</label>
      {children}
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
        <button className={styles.acceptBtn} onClick={acceptChangeSet}>{t('changes.accept')}</button>
        <button className={styles.rejectBtn} onClick={rejectChangeSet}>{t('changes.reject')}</button>
      </div>
    </div>
  )
}
