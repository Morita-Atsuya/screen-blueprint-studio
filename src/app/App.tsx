import { useAppStore } from './appStore'
import { ScreenList } from '../features/screens/ScreenList'
import { Palette } from '../features/palette/Palette'
import { StructureTree } from '../features/structure-tree/StructureTree'
import { Canvas } from '../features/canvas/Canvas'
import { Inspector } from '../features/inspector/Inspector'
import { ChangeSetBar } from '../features/change-review/ChangeSetBar'
import styles from './App.module.css'

export function App() {
  const {
    ui,
    setLeftPanelTab,
    history,
    undo,
    activeChangeSet,
    recoveryState,
    initializeWithRecovery,
    errorMessage,
    persistenceUnavailable,
    exportCurrentData,
    setErrorMessage,
    beginChangeSet,
  } = useAppStore()
  const canUndo = history.length > 0 && !activeChangeSet

  // ── Recovery screen ─────────────────────────────────────────
  if (recoveryState) {
    return (
      <div className={styles.recovery}>
        <h1 style={{ marginBottom: 12 }}>保存データを読み込めませんでした</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>{recoveryState.error}</p>
        <div className={styles.recoveryActions}>
          <button
            style={{ padding: '8px 20px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', marginRight: 10 }}
            onClick={() => initializeWithRecovery('download')}
          >
            壊れたJSONを保存
          </button>
          <button
            style={{ padding: '8px 20px', background: 'var(--accent)', color: '#07131a', border: 0, borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
            onClick={() => initializeWithRecovery('sample')}
          >
            サンプルで初期化
          </button>
        </div>
      </div>
    )
  }

  // ── Demo: begin change set for human testing ────────────────
  function handleBeginDemo() {
    try {
      beginChangeSet('デモ提案: AIによる提案')
      useAppStore.getState().setRightPanelTab('changes')
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e))
    }
  }

  // ── Main UI ─────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo}>Screen Blueprint Studio</span>
        <div className={styles.headerActions}>
          {!activeChangeSet && (
            <button
              className={styles.undoBtn}
              onClick={handleBeginDemo}
              title="デモ用: Change Set開始"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              ＋ 提案開始
            </button>
          )}
          <button
            className={styles.undoBtn}
            onClick={undo}
            disabled={!canUndo}
            title="Undo"
          >
            ↩ Undo
          </button>
        </div>
      </header>

      {activeChangeSet && <ChangeSetBar />}

      {persistenceUnavailable && (
        <div className={styles.persistenceBanner} role="alert">
          <span>変更はこの端末に保存されていません。再読み込み前にJSONをダウンロードしてください。</span>
          <button className={styles.exportBtn} onClick={exportCurrentData}>
            現在のJSONを保存
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          className={styles.toast}
          onClick={() => setErrorMessage(null)}
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      <div className={styles.main}>
        {/* Left panel */}
        <aside className={styles.left}>
          <div className={styles.tabs}>
            {(['screens', 'palette', 'structure'] as const).map(tab => (
              <button
                key={tab}
                className={`${styles.tab} ${ui.leftPanelTab === tab ? styles.tabActive : ''}`}
                onClick={() => setLeftPanelTab(tab)}
              >
                {tab === 'screens' ? '画面' : tab === 'palette' ? 'パレット' : 'ツリー'}
              </button>
            ))}
          </div>
          <div className={styles.leftContent}>
            {ui.leftPanelTab === 'screens' && <ScreenList />}
            {ui.leftPanelTab === 'palette' && <Palette />}
            {ui.leftPanelTab === 'structure' && <StructureTree />}
          </div>
        </aside>

        <main className={styles.canvas}>
          <Canvas />
        </main>

        {/* Right panel */}
        <aside className={styles.right}>
          <div className={styles.tabs}>
            {(['inspector', 'changes'] as const).map(tab => (
              <button
                key={tab}
                className={`${styles.tab} ${ui.rightPanelTab === tab ? styles.tabActive : ''}`}
                onClick={() => useAppStore.getState().setRightPanelTab(tab)}
              >
                {tab === 'inspector' ? 'インスペクター' : `変更${activeChangeSet ? ` (${activeChangeSet.operations.length})` : ''}`}
              </button>
            ))}
          </div>
          <div className={styles.rightContent}>
            <Inspector />
          </div>
        </aside>
      </div>
    </div>
  )
}
