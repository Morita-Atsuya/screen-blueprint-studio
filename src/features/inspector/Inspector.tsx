import { useState } from 'react'
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

  function updateName(name: string) {
    dispatch(
      { type: 'updateComponentSpec', componentId: comp!.id, patch: { name } },
      'コンポーネント名を変更',
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <label className={styles.label}>コンポーネント名</label>
        <input
          className={styles.input}
          value={comp.name}
          onChange={e => updateName(e.target.value)}
        />
      </div>
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
      {(cfg.kind === 'section' || cfg.kind === 'page' || cfg.kind === 'modal') && (
        <Field label="タイトル">
          <input className={styles.input} value={cfg.title} onChange={e => updateConfig({ title: e.target.value })} />
        </Field>
      )}
    </div>
  )
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
  const [reason, setReason] = useState('')
  if (!activeChangeSet) return <p style={{ color: 'var(--text-faint)', fontSize: '0.82rem' }}>変更案はありません</p>

  return (
    <div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>{activeChangeSet.summary}</p>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {activeChangeSet.operations.map(op => (
          <li key={op.id} style={{ fontSize: '0.78rem', color: op.source === 'agent' ? 'var(--accent)' : 'var(--text-muted)', padding: '4px 8px', background: 'var(--bg-hover)', borderRadius: 6 }}>
            [{op.source}] {op.command.type}
          </li>
        ))}
      </ul>
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="却下理由" style={{ width: '100%', marginTop: 10, marginBottom: 10 }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={acceptChangeSet} style={{ flex: 1, padding: '7px', background: 'var(--accent)', color: '#07131a', border: 0, borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>承認</button>
        <button onClick={() => rejectChangeSet(reason)} style={{ flex: 1, padding: '7px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>却下</button>
      </div>
    </div>
  )
}
