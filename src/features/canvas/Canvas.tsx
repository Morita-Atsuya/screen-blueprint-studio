import { useAppStore } from '../../app/appStore'
import type { EntityId, ScreenComponent } from '../../domain/model'
import { effectiveComponent } from '../../domain/selectors'
import { getOwnEntity } from '../../domain/entityMap'
import styles from './Canvas.module.css'

export function Canvas() {
  const { effectiveDocument, ui, setSelectedComponent, setActiveState } = useAppStore()
  const { activeScreenId, activeStateId, selectedComponentId } = ui

  if (!activeScreenId) {
    return <div className={styles.empty}>← 左から画面を選択してください</div>
  }

  const screen = getOwnEntity(effectiveDocument.screens, activeScreenId)
  if (!screen) return null

  const activeState = activeStateId
    ? getOwnEntity(effectiveDocument.screenStates, activeStateId)
    : undefined

  function renderComp(id: EntityId): React.ReactNode {
    const base = getOwnEntity(effectiveDocument.components, id)
    if (!base) return null
    const comp = effectiveComponent(base, activeState)
    if (!comp.common.visible) return null
    const isSelected = selectedComponentId === comp.id

    return (
      <div
        key={comp.id}
        className={`${styles.comp} ${isSelected ? styles.selected : ''}`}
        onClick={e => { e.stopPropagation(); setSelectedComponent(comp.id) }}
      >
        <ComponentView comp={comp} />
        {comp.childIds.length > 0 && (
          <div className={styles.children}>
            {comp.childIds.map(childId => renderComp(childId))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.root} onClick={() => setSelectedComponent(null)}>
      {/* State selector */}
      <div className={styles.stateBar}>
        {screen.stateIds.map(sid => {
          const state = getOwnEntity(effectiveDocument.screenStates, sid)
          if (!state) return null
          return (
            <button
              key={sid}
              className={`${styles.stateBtn} ${activeStateId === sid ? styles.stateBtnActive : ''}`}
              onClick={() => setActiveState(sid)}
            >
              {state.name}
            </button>
          )
        })}
      </div>
      {/* Wireframe */}
      <div className={styles.wireframe}>
        {renderComp(screen.rootComponentId)}
      </div>
    </div>
  )
}

function ComponentView({ comp }: { comp: ScreenComponent }) {
  const cfg = comp.config
  switch (cfg.kind) {
    case 'page':
      return <div className={styles.pageBadge}>{cfg.title}</div>
    case 'section':
      return <div className={styles.sectionTitle}>{cfg.title}</div>
    case 'stack':
      return <div className={styles.containerLabel}>Stack ({cfg.gap})</div>
    case 'columns':
      return <div className={styles.containerLabel}>Columns ({cfg.columns})</div>
    case 'actionArea':
      return <div className={styles.containerLabel}>Action Area ({cfg.align})</div>
    case 'heading':
      return <div className={`${styles.heading} ${styles[`h${cfg.level}`]}`}>{cfg.text}</div>
    case 'text':
      return <p className={styles.textComp}>{cfg.text}</p>
    case 'textInput':
      return (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{cfg.label}{cfg.required && <span className={styles.required}>*</span>}</label>
          <input type={cfg.inputType} placeholder={cfg.placeholder} disabled className={styles.fieldInput} />
        </div>
      )
    case 'select':
      return (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{cfg.label}{cfg.required && <span className={styles.required}>*</span>}</label>
          <select disabled className={styles.fieldInput}>
            <option>選択してください</option>
          </select>
        </div>
      )
    case 'button':
      return (
        <button
          disabled
          className={`${styles.btn} ${cfg.variant === 'primary' ? styles.btnPrimary : cfg.variant === 'danger' ? styles.btnDanger : styles.btnSecondary}`}
        >
          {cfg.label}
        </button>
      )
    case 'alert':
      return <div className={`${styles.alert} ${cfg.tone === 'info' ? styles.alertInfo : cfg.tone === 'success' ? styles.alertSuccess : cfg.tone === 'warning' ? styles.alertWarning : styles.alertError}`}>{cfg.message}</div>
    case 'modal':
      return (
        <div className={styles.modal}>
          <div className={styles.modalTitle}>{cfg.title}</div>
        </div>
      )
    default:
      return null
  }
}
