import { useAppStore } from './appStore'
import { ScreenList } from '../features/screens/ScreenList'
import { Palette } from '../features/palette/Palette'
import { StructureTree } from '../features/structure-tree/StructureTree'
import { Canvas } from '../features/canvas/Canvas'
import { Inspector } from '../features/inspector/Inspector'
import { ChangeSetBar } from '../features/change-review/ChangeSetBar'
import { EditorDndProvider } from '../dnd/EditorDndContext'
import { EditorKeyboardShortcuts } from './EditorKeyboardShortcuts'
import { useI18n } from '../i18n/I18nProvider'
import styles from './App.module.css'

export function App() {
  const { t, formatMessage } = useI18n()
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
  } = useAppStore()
  const canUndo = history.length > 0 && !activeChangeSet

  // ── Recovery screen ─────────────────────────────────────────
  if (recoveryState) {
    return (
      <div className={styles.recovery}>
        <div className={styles.recoveryLanguage}><LanguageSelector /></div>
        <h1 style={{ marginBottom: 12 }}>{t('app.recoveryTitle')}</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>{recoveryState.error}</p>
        <div className={styles.recoveryActions}>
          <button
            style={{ padding: '8px 20px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', marginRight: 10 }}
            onClick={() => initializeWithRecovery('download')}
          >
            {t('app.downloadCorrupted')}
          </button>
          <button
            style={{ padding: '8px 20px', background: 'var(--accent)', color: '#07131a', border: 0, borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
            onClick={() => initializeWithRecovery('sample')}
          >
            {t('app.resetSample')}
          </button>
        </div>
      </div>
    )
  }

  // ── Main UI ─────────────────────────────────────────────────
  return (
    <EditorDndProvider>
      <EditorKeyboardShortcuts />
      <div className={styles.root}>
        <header className={styles.header}>
          <span className={styles.logo}>Screen Blueprint Studio</span>
          <div className={styles.headerActions}>
            <LanguageSelector />
            <button
              className={styles.undoBtn}
              onClick={undo}
              disabled={!canUndo}
              title={t('app.undo')}
            >
              ↩ {t('app.undo')}
            </button>
          </div>
        </header>

        {activeChangeSet && <ChangeSetBar />}

        {persistenceUnavailable && (
          <div className={styles.persistenceBanner} role="alert">
            <span>{t('app.persistenceWarning')}</span>
            <button className={styles.exportBtn} onClick={exportCurrentData}>
              {t('app.downloadCurrent')}
            </button>
          </div>
        )}

        {errorMessage && (
          <div
            className={styles.toast}
            onClick={() => setErrorMessage(null)}
            role="alert"
          >
            {formatMessage(errorMessage)}
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
                  {t(`tabs.${tab}`)}
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
                  {tab === 'inspector'
                    ? t('tabs.inspector')
                    : `${t('tabs.changes')}${activeChangeSet ? ` (${activeChangeSet.operations.length})` : ''}`}
                </button>
              ))}
            </div>
            <div className={styles.rightContent}>
              <Inspector />
            </div>
          </aside>
        </div>
      </div>
    </EditorDndProvider>
  )
}

function LanguageSelector() {
  const { locale, setLocale, t } = useI18n()
  return (
    <label className={styles.language}>
      <span className={styles.visuallyHidden}>{t('language.label')}</span>
      <select
        data-locale-selector
        value={locale}
        onChange={event => setLocale(event.target.value as 'ja' | 'en')}
        aria-label={t('language.label')}
      >
        <option value="en">EN</option>
        <option value="ja">JA</option>
      </select>
    </label>
  )
}
