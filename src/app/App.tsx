import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
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
import {
  clampRightPaneWidth,
  getRightPaneWidthBounds,
  persistRightPaneWidth,
  resolveInitialRightPaneWidth,
  rightPaneWidthForKey,
} from './rightPaneWidth'
import logoMarkUrl from '../../brand/logo-mark.svg'
import styles from './App.module.css'

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function browserWidth(): number {
  return globalThis.innerWidth || 1280
}

export function App() {
  const { t, formatMessage } = useI18n()
  const {
    ui,
    setLeftPanelTab,
    history,
    redoStack,
    undo,
    redo,
    activeChangeSet,
    recoveryState,
    initializeWithRecovery,
    startupNotice,
    dismissStartupNotice,
    errorMessage,
    persistenceUnavailable,
    exportCurrentData,
    setErrorMessage,
  } = useAppStore()
  const canUndo = history.length > 0 && !activeChangeSet
  const canRedo = redoStack.length > 0 && !activeChangeSet
  const nextUndo = history[history.length - 1]
  const nextRedo = redoStack[redoStack.length - 1]
  const undoTitle = nextUndo
    ? t('app.undoAction', { label: nextUndo.label })
    : t('app.undo')
  const redoTitle = nextRedo
    ? t('app.redoAction', { label: nextRedo.label })
    : t('app.redo')
  const [viewportWidth, setViewportWidth] = useState(browserWidth)
  const [preferredRightPaneWidth, setPreferredRightPaneWidth] = useState(() =>
    resolveInitialRightPaneWidth(browserStorage(), browserWidth()),
  )
  const [isResizingRightPane, setIsResizingRightPane] = useState(false)
  const rightPaneWidth = clampRightPaneWidth(preferredRightPaneWidth, viewportWidth)
  const rightPaneBounds = getRightPaneWidthBounds(viewportWidth)
  const rightPaneWidthRef = useRef(rightPaneWidth)
  const resizeStartRef = useRef<{
    pointerId: number
    clientX: number
    width: number
  } | null>(null)

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(browserWidth())
    globalThis.addEventListener('resize', updateViewportWidth)
    return () => globalThis.removeEventListener('resize', updateViewportWidth)
  }, [])

  useEffect(() => {
    rightPaneWidthRef.current = rightPaneWidth
  }, [rightPaneWidth])

  function updateRightPaneWidth(nextWidth: number, persist = false) {
    const clamped = clampRightPaneWidth(nextWidth, viewportWidth)
    rightPaneWidthRef.current = clamped
    setPreferredRightPaneWidth(clamped)
    if (persist) persistRightPaneWidth(browserStorage(), clamped)
  }

  function finishRightPaneResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (resizeStartRef.current?.pointerId !== event.pointerId) return
    resizeStartRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setIsResizingRightPane(false)
    persistRightPaneWidth(browserStorage(), rightPaneWidthRef.current)
  }

  // ── Recovery screen ─────────────────────────────────────────
  if (recoveryState) {
    return (
      <div className={styles.recovery}>
        <div className={styles.recoveryLanguage}><LanguageSelector /></div>
        <h1 className={styles.recoveryTitle}>{t('app.recoveryTitle')}</h1>
        <p className={styles.recoveryError}>{recoveryState.error}</p>
        <div className={styles.recoveryActions}>
          <button
            className={`${styles.recoveryAction} ${styles.recoverySecondary}`}
            onClick={() => initializeWithRecovery('download')}
            type="button"
          >
            {t('app.downloadCorrupted')}
          </button>
          <button
            className={`${styles.recoveryAction} ${styles.recoveryPrimary}`}
            onClick={() => initializeWithRecovery('sample')}
            type="button"
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
      <div className={`${styles.root} ${isResizingRightPane ? styles.resizing : ''}`}>
        <header className={styles.header}>
          <span className={styles.logo}>
            <img
              className={styles.logoMark}
              src={logoMarkUrl}
              alt=""
              aria-hidden="true"
              width="24"
              height="24"
            />
            <span className={styles.logoText}>Screen Blueprint Studio</span>
          </span>
          <div className={styles.headerActions}>
            <LanguageSelector />
            <button
              className={styles.historyBtn}
              onClick={undo}
              disabled={!canUndo}
              title={undoTitle}
              aria-label={undoTitle}
              type="button"
            >
              ↩ <span className={styles.historyActionText}>{t('app.undo')}</span>
            </button>
            <button
              className={styles.historyBtn}
              onClick={redo}
              disabled={!canRedo}
              title={redoTitle}
              aria-label={redoTitle}
              type="button"
            >
              ↪ <span className={styles.historyActionText}>{t('app.redo')}</span>
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

        {startupNotice && (
          <div className={styles.startupNotice} role="alert">
            <span>{formatMessage(startupNotice)}</span>
            <button
              aria-label={t('common.close')}
              onClick={dismissStartupNotice}
              type="button"
            >
              ×
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

          <div
            className={styles.resizeHandle}
            data-right-pane-resizer
            role="separator"
            aria-label={t('app.resizeRightPane')}
            aria-orientation="vertical"
            aria-valuemin={rightPaneBounds.min}
            aria-valuemax={rightPaneBounds.max}
            aria-valuenow={rightPaneWidth}
            tabIndex={0}
            onPointerDown={event => {
              if (event.button !== 0) return
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              resizeStartRef.current = {
                pointerId: event.pointerId,
                clientX: event.clientX,
                width: rightPaneWidth,
              }
              setIsResizingRightPane(true)
            }}
            onPointerMove={event => {
              const start = resizeStartRef.current
              if (!start || start.pointerId !== event.pointerId) return
              updateRightPaneWidth(start.width + start.clientX - event.clientX)
            }}
            onPointerUp={finishRightPaneResize}
            onPointerCancel={finishRightPaneResize}
            onLostPointerCapture={event => {
              if (resizeStartRef.current?.pointerId !== event.pointerId) return
              resizeStartRef.current = null
              setIsResizingRightPane(false)
              persistRightPaneWidth(browserStorage(), rightPaneWidthRef.current)
            }}
            onKeyDown={event => {
              const nextWidth = rightPaneWidthForKey(
                event.key,
                rightPaneWidth,
                viewportWidth,
                event.shiftKey,
              )
              if (nextWidth === null) return
              event.preventDefault()
              event.stopPropagation()
              updateRightPaneWidth(nextWidth, true)
            }}
          />

          {/* Right panel */}
          <aside className={styles.right} style={{ width: rightPaneWidth }}>
            {activeChangeSet ? (
              <div className={styles.tabs}>
                {(['inspector', 'changes'] as const).map(tab => (
                  <button
                    key={tab}
                    className={`${styles.tab} ${ui.rightPanelTab === tab ? styles.tabActive : ''}`}
                    onClick={() => useAppStore.getState().setRightPanelTab(tab)}
                  >
                    {tab === 'inspector'
                      ? t('tabs.inspector')
                      : `${t('tabs.changes')} (${activeChangeSet.operations.length})`}
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.rightHeading}>{t('tabs.inspector')}</div>
            )}
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
