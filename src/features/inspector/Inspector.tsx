import { useAppStore } from '../../app/appStore'
import styles from './Inspector.module.css'
import { deleteOwnEntity, getOwnEntity, setOwnEntity } from '../../domain/entityMap'
import type {
  ComponentOverride,
  ScreenComponent,
  ScreenState,
} from '../../domain/model'
import { useI18n } from '../../i18n/I18nProvider'
import type { MessageKey } from '../../i18n/messages'
import { commandMessageKey } from '../../i18n/messages'

export function Inspector() {
  const { t } = useI18n()
  const { effectiveDocument, ui, dispatch } = useAppStore()
  const { selectedComponentId, rightPanelTab } = ui

  if (rightPanelTab === 'changes') {
    return <ChangesPanel />
  }

  if (!selectedComponentId) {
    return <p className={styles.empty}>{t('inspector.selectComponent')}</p>
  }

  const comp = getOwnEntity(effectiveDocument.components, selectedComponentId)
  if (!comp) return null
  const activeState = ui.activeStateId
    ? getOwnEntity(effectiveDocument.screenStates, ui.activeStateId)
    : undefined

  const cfg = comp.config

  function updateConfig(partial: Record<string, unknown>) {
    dispatch(
      { type: 'updateComponentSpec', componentId: comp!.id, patch: { config: partial as never } },
      'Update component specification',
    )
  }

  function updateCommon(partial: { description?: string; visible?: boolean; enabled?: boolean }) {
    dispatch(
      { type: 'updateComponentSpec', componentId: comp!.id, patch: { common: partial } },
      'Update component specification',
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <label className={styles.label}>{t('inspector.description')}</label>
        <textarea
          className={styles.textarea}
          value={comp.common.description}
          rows={2}
          onChange={e => updateCommon({ description: e.target.value })}
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
      {cfg.kind === 'heading' && (
        <>
          <Field label={t('inspector.text')}>
            <input className={styles.input} value={cfg.text} onChange={e => updateConfig({ text: e.target.value })} />
          </Field>
          <Field label={t('inspector.level')}>
            <select className={styles.input} value={cfg.level} onChange={e => updateConfig({ level: Number(e.target.value) })}>
              <option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option>
            </select>
          </Field>
        </>
      )}
      {cfg.kind === 'text' && (
        <Field label={t('inspector.text')}>
          <textarea className={styles.textarea} value={cfg.text} rows={3} onChange={e => updateConfig({ text: e.target.value })} />
        </Field>
      )}
      {cfg.kind === 'stack' && (
        <Field label={t('inspector.gap')}>
          <select className={styles.input} value={cfg.gap} onChange={e => updateConfig({ gap: e.target.value })}>
            <option value="sm">{t('inspector.gapSmall')}</option>
            <option value="md">{t('inspector.gapMedium')}</option>
            <option value="lg">{t('inspector.gapLarge')}</option>
          </select>
        </Field>
      )}
      {cfg.kind === 'columns' && (
        <Field label={t('inspector.columns')}>
          <select className={styles.input} value={cfg.columns} onChange={e => updateConfig({ columns: Number(e.target.value) })}>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </Field>
      )}
      {cfg.kind === 'actionArea' && (
        <Field label={t('inspector.alignment')}>
          <select className={styles.input} value={cfg.align} onChange={e => updateConfig({ align: e.target.value })}>
            <option value="start">{t('inspector.alignStart')}</option>
            <option value="end">{t('inspector.alignEnd')}</option>
            <option value="between">{t('inspector.alignBetween')}</option>
          </select>
        </Field>
      )}
      {cfg.kind === 'textInput' && (
        <>
          <Field label={t('inspector.fieldKey')}>
            <input className={styles.input} value={cfg.fieldKey} onChange={e => updateConfig({ fieldKey: e.target.value })} />
          </Field>
          <Field label={t('inspector.label')}>
            <input className={styles.input} value={cfg.label} onChange={e => updateConfig({ label: e.target.value })} />
          </Field>
          <Field label={t('inspector.placeholder')}>
            <input className={styles.input} value={cfg.placeholder} onChange={e => updateConfig({ placeholder: e.target.value })} />
          </Field>
          <Field label={t('inspector.defaultValue')}>
            <input className={styles.input} value={cfg.defaultValue} onChange={e => updateConfig({ defaultValue: e.target.value })} />
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
            <input className={styles.input} value={cfg.fieldKey} onChange={e => updateConfig({ fieldKey: e.target.value })} />
          </Field>
          <Field label={t('inspector.label')}>
            <input className={styles.input} value={cfg.label} onChange={e => updateConfig({ label: e.target.value })} />
          </Field>
          <Field label={t('inspector.options')}>
            <textarea
              className={styles.textarea}
              rows={4}
              value={formatSelectOptions(cfg.options)}
              placeholder={t('inspector.optionsPlaceholder')}
              onChange={e => updateConfig({ options: parseSelectOptions(e.target.value) })}
            />
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
            <input className={styles.input} value={cfg.label} onChange={e => updateConfig({ label: e.target.value })} />
          </Field>
          <Field label={t('inspector.variant')}>
            <select className={styles.input} value={cfg.variant} onChange={e => updateConfig({ variant: e.target.value })}>
              <option value="primary">{t('inspector.variantPrimary')}</option>
              <option value="secondary">{t('inspector.variantSecondary')}</option>
              <option value="danger">{t('inspector.variantDanger')}</option>
            </select>
          </Field>
          <Field label={t('inspector.confirmationMessage')}>
            <input
              className={styles.input}
              value={cfg.confirmationMessage ?? ''}
              placeholder={t('inspector.noConfirmation')}
              onChange={e => updateConfig({ confirmationMessage: e.target.value || null })}
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
            <input className={styles.input} value={cfg.message} onChange={e => updateConfig({ message: e.target.value })} />
          </Field>
        </>
      )}
      {cfg.kind === 'page' && (
        <Field label={t('inspector.pageTitle')}>
          <input className={styles.input} value={cfg.title} onChange={e => updateConfig({ title: e.target.value })} />
        </Field>
      )}
      {cfg.kind === 'section' && (
        <Field label={t('inspector.sectionTitle')}>
          <input className={styles.input} value={cfg.title} onChange={e => updateConfig({ title: e.target.value })} />
        </Field>
      )}
      {cfg.kind === 'modal' && (
        <Field label={t('inspector.modalTitle')}>
          <input className={styles.input} value={cfg.title} onChange={e => updateConfig({ title: e.target.value })} />
        </Field>
      )}
      {activeState && activeState.kind !== 'default' ? (
        <>
          <hr className={styles.divider} />
          <StateOverrides component={comp} state={activeState} />
        </>
      ) : null}
    </div>
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
  ) {
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

    dispatch({
      type: 'updateScreenState',
      stateId: state.id,
      overrides,
    }, `Update state overrides: ${state.name}`)
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
              onChange={event => updateOverride(
                content.key,
                event.target.checked ? content.baseValue : undefined,
              )}
            />
            {t('overrides.useValue')}
          </label>
          <Field label={t(content.labelKey)}>
            <input
              className={styles.input}
              disabled={override[content.key] === undefined}
              value={override[content.key] ?? content.baseValue}
              onChange={event => updateOverride(content.key, event.target.value)}
            />
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
} | null {
  const config = component.config
  if (config.kind === 'heading' || config.kind === 'text') {
    return { key: 'text', labelKey: 'overrides.text', baseValue: config.text }
  }
  if (config.kind === 'alert') {
    return { key: 'message', labelKey: 'overrides.message', baseValue: config.message }
  }
  if (config.kind === 'textInput') {
    return { key: 'value', labelKey: 'overrides.value', baseValue: config.defaultValue }
  }
  if (config.kind === 'select') {
    return { key: 'value', labelKey: 'overrides.value', baseValue: '' }
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

function ChangesPanel() {
  const { t } = useI18n()
  const { activeChangeSet, acceptChangeSet, rejectChangeSet } = useAppStore()
  if (!activeChangeSet) return <p className={styles.empty}>{t('changes.none')}</p>

  return (
    <div className={styles.changes}>
      <p className={styles.changeSummary}>{activeChangeSet.summary}</p>
      <ul className={styles.changeList}>
        {activeChangeSet.operations.map(op => (
          <li
            key={op.id}
            className={`${styles.changeItem} ${op.source === 'agent' ? styles.agentChange : ''}`}
          >
            [{t(op.source === 'agent' ? 'changes.sourceAgent' : 'changes.sourceHuman')}] {t(commandMessageKey(op.command))}
          </li>
        ))}
      </ul>
      <div className={styles.changeActions}>
        <button className={styles.acceptBtn} onClick={acceptChangeSet}>{t('changes.accept')}</button>
        <button className={styles.rejectBtn} onClick={rejectChangeSet}>{t('changes.reject')}</button>
      </div>
    </div>
  )
}
