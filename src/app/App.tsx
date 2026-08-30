import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useAppStore } from './appStore'
import { LeftPane } from './LeftPane'
import { Canvas } from '../features/canvas/Canvas'
import { ScreenFlow } from '../features/screen-flow/ScreenFlow'
import { Inspector } from '../features/inspector/Inspector'
import { ChangeSetBar } from '../features/change-review/ChangeSetBar'
import { EditorDndProvider } from '../dnd/EditorDndContext'
import { EditorKeyboardShortcuts } from './EditorKeyboardShortcuts'
import { Toast } from './Toast'
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog'
import { useI18n } from '../i18n/I18nProvider'
import { getOwnEntity } from '../domain/entityMap'
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
    history,
    redoStack,
    effectiveDocument,
    undo,
    redo,
    activeChangeSet,
    recoveryState,
    initializeWithRecovery,
    startupNotice,
    dismissStartupNotice,
    toast,
    persistenceUnavailable,
    exportCurrentData,
    dismissToast,
    runToastAction,
  } = useAppStore()
  const canUndo = history.length > 0 && !activeChangeSet
  const canRedo = redoStack.length > 0 && !activeChangeSet
  const nextUndo = history[history.length - 1]
  const nextRedo = redoStack[redoStack.length - 1]
  const undoTitle = nextUndo
    ? activeChangeSet
      ? t('changes.editLocked')
      : t('app.undoAction', { label: nextUndo.label })
    : activeChangeSet
      ? t('changes.editLocked')
      : t('app.undo')
  const redoTitle = nextRedo
    ? activeChangeSet
      ? t('changes.editLocked')
      : t('app.redoAction', { label: nextRedo.label })
    : activeChangeSet
      ? t('changes.editLocked')
      : t('app.redo')
  const activeScreen = ui.activeScreenId
    ? getOwnEntity(effectiveDocument.screens, ui.activeScreenId)
    : undefined
  const [viewportWidth, setViewportWidth] = useState(browserWidth)
  const [preferredRightPaneWidth, setPreferredRightPaneWidth] = useState(() =>
    resolveInitialRightPaneWidth(browserStorage(), browserWidth()),
  )
  const [isResizingRightPane, setIsResizingRightPane] = useState(false)
  const [editorView, setEditorView] = useState<'screen' | 'flow'>('screen')
  const rightPaneWidth = clampRightPaneWidth(preferredRightPaneWidth, viewportWidth)
  const rightPaneBounds = getRightPaneWidthBounds(viewportWidth)
  const rightPaneWidthRef = useRef(rightPaneWidth)
  const resizeStartRef = useRef<{
    pointerId: number
    clientX: number
    width: number
  } | null>(null)
  const screenContextRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(browserWidth())
    globalThis.addEventListener('resize', updateViewportWidth)
    return () => globalThis.removeEventListener('resize', updateViewportWidth)
  }, [])

  useEffect(() => {
    rightPaneWidthRef.current = rightPaneWidth
  }, [rightPaneWidth])

  useEffect(() => {
    if (!toast) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissToast(toast.id)
    }

    globalThis.addEventListener('keydown', handleKeyDown)
    return () => globalThis.removeEventListener('keydown', handleKeyDown)
  }, [dismissToast, toast])

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

  function openScreenView(focusComponentId?: string) {
    setEditorView('screen')
    requestAnimationFrame(() => {
      const component = focusComponentId
        ? document.querySelector<HTMLElement>(
            `[data-component-id="${CSS.escape(focusComponentId)}"]`,
          )
        : null
      const inspectorSelection = focusComponentId
        ? document.querySelector<HTMLElement>(
            '[data-hierarchy-shortcut-scope="inspector"] [aria-current="page"]',
          )
        : null
      ;(component ?? inspectorSelection ?? screenContextRef.current)?.focus()
    })
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
      <EditorKeyboardShortcuts readOnlyEditorView={editorView === 'flow'} />
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

        <Toast toast={toast} dismiss={dismissToast} runAction={runToastAction} />
        <DeleteConfirmationDialog />

        <div className={styles.main} data-delete-focus-fallback tabIndex={-1}>
          {/* Left panel */}
          <aside className={styles.left} aria-label={t('app.leftPane')}>
            <LeftPane />
          </aside>

          <main
            className={styles.editor}
            data-read-only-editor-view={editorView === 'flow' || undefined}
          >
            <div
              className={styles.editorViewSwitch}
              role="group"
              aria-label={t('editor.viewSwitch')}
              data-editor-view-switch
              data-editor-chrome
            >
              <button
                type="button"
                className={editorView === 'screen' ? styles.editorViewActive : ''}
                aria-pressed={editorView === 'screen'}
                onClick={() => setEditorView('screen')}
              >
                {t('editor.screenView')}
              </button>
              <button
                type="button"
                className={editorView === 'flow' ? styles.editorViewActive : ''}
                aria-pressed={editorView === 'flow'}
                onClick={() => setEditorView('flow')}
              >
                {t('editor.flowView')}
              </button>
            </div>
            {activeScreen ? (
              <section
                ref={screenContextRef}
                className={styles.screenContext}
                aria-label={t('editor.screenContext')}
                data-active-screen-context={activeScreen.id}
                data-editor-chrome
                tabIndex={-1}
              >
                <dl className={styles.screenContextList}>
                  <div className={styles.screenContextItem}>
                    <dt className={styles.screenContextLabel}>{t('editor.screenName')}</dt>
                    <dd
                      className={`${styles.screenContextValue} ${styles.screenName}`}
                      title={activeScreen.name}
                    >
                      {activeScreen.name}
                    </dd>
                  </div>
                  <div className={styles.screenContextItem}>
                    <dt className={styles.screenContextLabel}>{t('editor.screenRoute')}</dt>
                    <dd
                      className={`${styles.screenContextValue} ${styles.screenRoute}`}
                      title={activeScreen.route}
                    >
                      <code>{activeScreen.route}</code>
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}
            <div
              className={`${styles.canvas} ${styles.editorViewPanel}`}
              hidden={editorView !== 'screen'}
              data-editor-view="screen"
            >
              <Canvas />
            </div>
            <div
              className={styles.editorViewPanel}
              hidden={editorView !== 'flow'}
              data-editor-view="flow"
            >
              <ScreenFlow openScreenView={openScreenView} />
            </div>
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
          <aside
            className={styles.right}
            style={{ width: rightPaneWidth }}
            aria-label={t('app.rightPane')}
          >
            {activeChangeSet ? (
              <div
                className={styles.tabs}
                role="group"
                aria-label={t('app.rightPaneTabs')}
              >
                {(['inspector', 'changes'] as const).map(tab => (
                  <button
                    key={tab}
                    className={`${styles.tab} ${ui.rightPanelTab === tab ? styles.tabActive : ''}`}
                    aria-pressed={ui.rightPanelTab === tab}
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
