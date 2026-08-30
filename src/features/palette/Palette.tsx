import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import type { ComponentKind, ComponentConfig, ProjectDocument } from '../../domain/model'
import { CONTAINER_KINDS } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import styles from './Palette.module.css'

function generateUniqueFieldKey(doc: ProjectDocument): string {
  const usedKeys = new Set<string>()
  for (const comp of Object.values(doc.components)) {
    if (comp.config.kind === 'textInput' || comp.config.kind === 'select') {
      const cfg = comp.config as any
      if (cfg.fieldKey && typeof cfg.fieldKey === 'string' && cfg.fieldKey.trim()) {
        usedKeys.add(cfg.fieldKey.trim())
      }
    }
  }

  let counter = 1
  while (usedKeys.has(`field_${counter}`)) {
    counter++
  }
  return `field_${counter}`
}

const PALETTE_ITEMS: Array<{ kind: ComponentKind; label: string; defaultConfig: ComponentConfig }> = [
  { kind: 'section', label: 'Section', defaultConfig: { kind: 'section', title: '新しいセクション' } },
  { kind: 'stack', label: 'Stack', defaultConfig: { kind: 'stack', gap: 'md' } },
  { kind: 'columns', label: 'Columns', defaultConfig: { kind: 'columns', columns: 2 } },
  { kind: 'actionArea', label: 'Action Area', defaultConfig: { kind: 'actionArea', align: 'end' } },
  { kind: 'heading', label: 'Heading', defaultConfig: { kind: 'heading', text: '見出し', level: 2 } },
  { kind: 'text', label: 'Text', defaultConfig: { kind: 'text', text: 'テキスト' } },
  { kind: 'textInput', label: 'Text Input', defaultConfig: { kind: 'textInput', fieldKey: '__factory__', label: '項目名', inputType: 'text', required: false, placeholder: '', defaultValue: '', validationRules: [], requestBinding: null } },
  { kind: 'select', label: 'Select', defaultConfig: { kind: 'select', fieldKey: '__factory__', label: '選択肢', required: false, options: [], requestBinding: null } },
  { kind: 'button', label: 'Button', defaultConfig: { kind: 'button', label: 'ボタン', variant: 'primary', eventId: null, confirmationMessage: null, preventDoubleSubmit: false } },
  { kind: 'alert', label: 'Alert', defaultConfig: { kind: 'alert', tone: 'info', message: 'メッセージ' } },
  { kind: 'modal', label: 'Modal', defaultConfig: { kind: 'modal', title: 'モーダル' } },
]

export function Palette() {
  const { effectiveDocument, ui, dispatch } = useAppStore()

  const activeScreenId = ui.activeScreenId
  const selectedId = ui.selectedComponentId

  function handleAdd(kind: ComponentKind, defaultConfig: ComponentConfig) {
    if (!activeScreenId) return
    const screen = getOwnEntity(effectiveDocument.screens, activeScreenId)
    if (!screen) return

    // Find target parent: selected container, or root
    let parentId = screen.rootComponentId
    if (selectedId) {
      const sel = getOwnEntity(effectiveDocument.components, selectedId)
      if (sel && CONTAINER_KINDS.includes(sel.kind)) {
        parentId = selectedId
      } else if (sel?.parentId) {
        parentId = sel.parentId
      }
    }

    const componentId = nanoid()
    let config = defaultConfig
    if (kind === 'textInput' || kind === 'select') {
      config = { ...defaultConfig, fieldKey: generateUniqueFieldKey(effectiveDocument) } as ComponentConfig
    }

    dispatch(
      {
        type: 'addComponent',
        componentId,
        screenId: activeScreenId,
        parentId,
        kind,
        name: kind,
        config,
      },
      `コンポーネント追加: ${kind}`,
    )
  }

  return (
    <div className={styles.root}>
      <p className={styles.hint}>選択中のコンテナに追加されます</p>
      <ul className={styles.list}>
        {PALETTE_ITEMS.map(item => (
          <li key={item.kind}>
            <button
              className={styles.item}
              onClick={() => handleAdd(item.kind, item.defaultConfig)}
              disabled={!activeScreenId}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
