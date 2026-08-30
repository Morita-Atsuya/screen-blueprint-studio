import { useAppStore } from '../../app/appStore'
import styles from './Inspector.module.css'
import { getOwnEntity } from '../../domain/entityMap'

export function Inspector() {
  const { effectiveDocument, ui, dispatch } = useAppStore()
  const { selectedComponentId, rightPanelTab } = ui

  if (rightPanelTab === 'changes') {
    return <ChangesPanel />
  }

  if (!selectedComponentId) {
    return <p className={styles.empty}>コンポーネントを選択してください</p>
  }

  const comp = getOwnEntity(effectiveDocument.components, selectedComponentId)
  if (!comp) return null

  const cfg = comp.config

  function updateConfig(partial: Record<string, unknown>) {
    dispatch(
      { type: 'updateComponentSpec', componentId: comp!.id, patch: { config: partial as never } },
      '仕様を編集',
    )
  }

  function updateCommon(partial: { description?: string; visible?: boolean; enabled?: boolean }) {
    dispatch(
      { type: 'updateComponentSpec', componentId: comp!.id, patch: { common: partial } },
      '仕様を編集',
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <label className={styles.label}>説明</label>
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
          表示
        </label>
        <label className={styles.checkLabel}>
          <input type="checkbox" checked={comp.common.enabled} onChange={e => updateCommon({ enabled: e.target.checked })} />
          有効
        </label>
      </div>
      <hr className={styles.divider} />
      {/* Kind-specific fields */}
      {cfg.kind === 'heading' && (
        <>
          <Field label="テキスト">
            <input className={styles.input} value={cfg.text} onChange={e => updateConfig({ text: e.target.value })} />
          </Field>
          <Field label="レベル">
            <select className={styles.input} value={cfg.level} onChange={e => updateConfig({ level: Number(e.target.value) })}>
              <option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option>
            </select>
          </Field>
        </>
      )}
      {cfg.kind === 'text' && (
        <Field label="テキスト">
          <textarea className={styles.textarea} value={cfg.text} rows={3} onChange={e => updateConfig({ text: e.target.value })} />
        </Field>
      )}
      {cfg.kind === 'stack' && (
        <Field label="間隔">
          <select className={styles.input} value={cfg.gap} onChange={e => updateConfig({ gap: e.target.value })}>
            <option value="sm">small</option>
            <option value="md">medium</option>
            <option value="lg">large</option>
          </select>
        </Field>
      )}
      {cfg.kind === 'columns' && (
        <Field label="カラム数">
          <select className={styles.input} value={cfg.columns} onChange={e => updateConfig({ columns: Number(e.target.value) })}>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </Field>
      )}
      {cfg.kind === 'actionArea' && (
        <Field label="配置">
          <select className={styles.input} value={cfg.align} onChange={e => updateConfig({ align: e.target.value })}>
            <option value="start">start</option>
            <option value="end">end</option>
            <option value="between">space between</option>
          </select>
        </Field>
      )}
      {cfg.kind === 'textInput' && (
        <>
          <Field label="フィールドキー">
            <input className={styles.input} value={cfg.fieldKey} onChange={e => updateConfig({ fieldKey: e.target.value })} />
          </Field>
          <Field label="ラベル">
            <input className={styles.input} value={cfg.label} onChange={e => updateConfig({ label: e.target.value })} />
          </Field>
          <Field label="プレースホルダー">
            <input className={styles.input} value={cfg.placeholder} onChange={e => updateConfig({ placeholder: e.target.value })} />
          </Field>
          <Field label="初期値">
            <input className={styles.input} value={cfg.defaultValue} onChange={e => updateConfig({ defaultValue: e.target.value })} />
          </Field>
          <Field label="型">
            <select className={styles.input} value={cfg.inputType} onChange={e => updateConfig({ inputType: e.target.value })}>
              <option value="text">text</option><option value="email">email</option><option value="password">password</option>
            </select>
          </Field>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={cfg.required} onChange={e => updateConfig({ required: e.target.checked })} />
            必須
          </label>
        </>
      )}
      {cfg.kind === 'select' && (
        <>
          <Field label="フィールドキー">
            <input className={styles.input} value={cfg.fieldKey} onChange={e => updateConfig({ fieldKey: e.target.value })} />
          </Field>
          <Field label="ラベル">
            <input className={styles.input} value={cfg.label} onChange={e => updateConfig({ label: e.target.value })} />
          </Field>
          <Field label="選択肢（value:label、1行1件）">
            <textarea
              className={styles.textarea}
              rows={4}
              value={formatSelectOptions(cfg.options)}
              placeholder={'active:有効\ninactive:無効'}
              onChange={e => updateConfig({ options: parseSelectOptions(e.target.value) })}
            />
          </Field>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={cfg.required} onChange={e => updateConfig({ required: e.target.checked })} />
            必須
          </label>
        </>
      )}
      {cfg.kind === 'button' && (
        <>
          <Field label="ラベル">
            <input className={styles.input} value={cfg.label} onChange={e => updateConfig({ label: e.target.value })} />
          </Field>
          <Field label="バリアント">
            <select className={styles.input} value={cfg.variant} onChange={e => updateConfig({ variant: e.target.value })}>
              <option value="primary">primary</option><option value="secondary">secondary</option><option value="danger">danger</option>
            </select>
          </Field>
          <Field label="確認メッセージ">
            <input
              className={styles.input}
              value={cfg.confirmationMessage ?? ''}
              placeholder="空欄なら確認なし"
              onChange={e => updateConfig({ confirmationMessage: e.target.value || null })}
            />
          </Field>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={cfg.preventDoubleSubmit} onChange={e => updateConfig({ preventDoubleSubmit: e.target.checked })} />
            二重送信防止
          </label>
        </>
      )}
      {cfg.kind === 'alert' && (
        <>
          <Field label="トーン">
            <select className={styles.input} value={cfg.tone} onChange={e => updateConfig({ tone: e.target.value })}>
              <option value="info">info</option><option value="success">success</option><option value="warning">warning</option><option value="error">error</option>
            </select>
          </Field>
          <Field label="メッセージ">
            <input className={styles.input} value={cfg.message} onChange={e => updateConfig({ message: e.target.value })} />
          </Field>
        </>
      )}
      {cfg.kind === 'page' && (
        <Field label="ページタイトル">
          <input className={styles.input} value={cfg.title} onChange={e => updateConfig({ title: e.target.value })} />
        </Field>
      )}
      {cfg.kind === 'section' && (
        <Field label="セクションタイトル">
          <input className={styles.input} value={cfg.title} onChange={e => updateConfig({ title: e.target.value })} />
        </Field>
      )}
      {cfg.kind === 'modal' && (
        <Field label="モーダルタイトル">
          <input className={styles.input} value={cfg.title} onChange={e => updateConfig({ title: e.target.value })} />
        </Field>
      )}
    </div>
  )
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
  const { activeChangeSet, acceptChangeSet, rejectChangeSet } = useAppStore()
  if (!activeChangeSet) return <p className={styles.empty}>変更案はありません</p>

  return (
    <div className={styles.changes}>
      <p className={styles.changeSummary}>{activeChangeSet.summary}</p>
      <ul className={styles.changeList}>
        {activeChangeSet.operations.map(op => (
          <li
            key={op.id}
            className={`${styles.changeItem} ${op.source === 'agent' ? styles.agentChange : ''}`}
          >
            [{op.source}] {op.command.type}
          </li>
        ))}
      </ul>
      <div className={styles.changeActions}>
        <button className={styles.acceptBtn} onClick={acceptChangeSet}>承認</button>
        <button className={styles.rejectBtn} onClick={rejectChangeSet}>却下</button>
      </div>
    </div>
  )
}
