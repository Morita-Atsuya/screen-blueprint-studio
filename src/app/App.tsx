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
import { definitionEditorNodeSelection } from '../domain/editorSelection'
import {
  LEFT_PANE_WIDTH_STORAGE_KEY,
  RIGHT_PANE_WIDTH_STORAGE_KEY,
  clampLeftPaneWidth,
  clampRightPaneWidth,
  getLeftPaneWidthBounds,
  getRightPaneWidthBounds,
  paneWidthForKey,
  persistPaneWidth,
  resolveInitialLeftPaneWidth,
  resolveInitialRightPaneWidth,
  resolvePaneWidths,
} from './paneWidths'
import logoMarkUrl from '../../brand/logo-mark.svg'
import { BUILD_FEATURE_FLAGS } from '../config/buildFeatureFlags'
import { DefinitionEditor } from '../features/definitions/DefinitionEditor'
import { DefinitionInspector } from '../features/definitions/DefinitionInspector'
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
    resetToSample,
    dismissToast,
    runToastAction,
    setSelection,
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
  const resetSampleTitle = activeChangeSet ? t('changes.editLocked') : t('app.resetSample')
  const activeScreen = ui.activeScreenId
    ? getOwnEntity(effectiveDocument.screens, ui.activeScreenId)
    : undefined
  const [viewportWidth, setViewportWidth] = useState(browserWidth)
  const [preferredLeftPaneWidth, setPreferredLeftPaneWidth] = useState(() =>
    resolveInitialLeftPaneWidth(browserStorage()),
  )
  const [preferredRightPaneWidth, setPreferredRightPaneWidth] = useState(() =>
    resolveInitialRightPaneWidth(browserStorage()),
  )
  const [resizingPane, setResizingPane] = useState<'left' | 'right' | null>(null)
  const [editorView, setEditorView] = useState<'screen' | 'flow' | 'definition'>('screen')
  const [definitionPreviewVariantId, setDefinitionPreviewVariantId] =
    useState<string | null>(null)
  const { left: leftPaneWidth, right: rightPaneWidth } = resolvePaneWidths(
    preferredLeftPaneWidth,
    preferredRightPaneWidth,
    viewportWidth,
  )
  const leftPaneBounds = getLeftPaneWidthBounds(viewportWidth, rightPaneWidth)
  const rightPaneBounds = getRightPaneWidthBounds(viewportWidth, leftPaneWidth)
  const leftPaneWidthRef = useRef(leftPaneWidth)
  const rightPaneWidthRef = useRef(rightPaneWidth)
  const resizeStartRef = useRef<{
    side: 'left' | 'right'
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
    leftPaneWidthRef.current = leftPaneWidth
  }, [leftPaneWidth])

  useEffect(() => {
    rightPaneWidthRef.current = rightPaneWidth
  }, [rightPaneWidth])

  useEffect(() => {
    if (ui.selection?.type === 'definitionEditorNode') setEditorView('definition')
  }, [ui.selection])

  useEffect(() => {
    if (!toast) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissToast(toast.id)
    }

    globalThis.addEventListener('keydown', handleKeyDown)
    return () => globalThis.removeEventListener('keydown', handleKeyDown)
  }, [dismissToast, toast])

  function updatePaneWidth(
    side: 'left' | 'right',
    nextWidth: number,
    persist = false,
  ) {
    const clamped = side === 'left'
      ? clampLeftPaneWidth(nextWidth, viewportWidth, rightPaneWidth)
      : clampRightPaneWidth(nextWidth, viewportWidth, leftPaneWidth)
    const storageKey = side === 'left'
      ? LEFT_PANE_WIDTH_STORAGE_KEY
      : RIGHT_PANE_WIDTH_STORAGE_KEY
    if (side === 'left') {
      leftPaneWidthRef.current = clamped
      setPreferredLeftPaneWidth(clamped)
    } else {
      rightPaneWidthRef.current = clamped
      setPreferredRightPaneWidth(clamped)
    }

    if (persist) persistPaneWidth(browserStorage(), storageKey, clamped)
  }

  function openDefinitionView() {
    setEditorView('definition')
    if (ui.selection?.type === 'definitionEditorNode') return
    const firstDefinition = Object.values(effectiveDocument.componentDefinitions)
      .sort((left, right) => left.name.localeCompare(right.name))[0]
    if (firstDefinition) {
      setDefinitionPreviewVariantId(
        firstDefinition.representativeVariantId ?? firstDefinition.variants[0]?.id ?? null,
      )
      setSelection(definitionEditorNodeSelection(
        firstDefinition.id,
        [firstDefinition.rootNodeId],
      ))
    }
  }

  function finishPaneResize(event: ReactPointerEvent<HTMLDivElement>) {
    const start = resizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    resizeStartRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setResizingPane(null)
    persistPaneWidth(
      browserStorage(),
      start.side === 'left'
        ? LEFT_PANE_WIDTH_STORAGE_KEY
        : RIGHT_PANE_WIDTH_STORAGE_KEY,
      start.side === 'left' ? leftPaneWidthRef.current : rightPaneWidthRef.current,
    )
  }

  function paneResizeHandle(side: 'left' | 'right') {
    const bounds = side === 'left' ? leftPaneBounds : rightPaneBounds
    const width = side === 'left' ? leftPaneWidth : rightPaneWidth
    return (
      <div
        className={styles.resizeHandle}
        data-left-pane-resizer={side === 'left' || undefined}
        data-right-pane-resizer={side === 'right' || undefined}
        data-resizing={resizingPane === side || undefined}
        role="separator"
        aria-label={t(side === 'left' ? 'app.resizeLeftPane' : 'app.resizeRightPane')}
        aria-orientation="vertical"
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={event => {
          if (event.button !== 0) return
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
          resizeStartRef.current = {
            side,
            pointerId: event.pointerId,
            clientX: event.clientX,
            width,
          }
          setResizingPane(side)
        }}
        onPointerMove={event => {
          const start = resizeStartRef.current
          if (!start || start.side !== side || start.pointerId !== event.pointerId) return
          const delta = side === 'left'
            ? event.clientX - start.clientX
            : start.clientX - event.clientX
          updatePaneWidth(side, start.width + delta)
        }}
        onPointerUp={finishPaneResize}
        onPointerCancel={finishPaneResize}
        onLostPointerCapture={event => {
          const start = resizeStartRef.current
          if (!start || start.side !== side || start.pointerId !== event.pointerId) return
          resizeStartRef.current = null
          setResizingPane(null)
          persistPaneWidth(
            browserStorage(),
            side === 'left'
              ? LEFT_PANE_WIDTH_STORAGE_KEY
              : RIGHT_PANE_WIDTH_STORAGE_KEY,
            side === 'left' ? leftPaneWidthRef.current : rightPaneWidthRef.current,
          )
        }}
        onKeyDown={event => {
          const nextWidth = paneWidthForKey(
            side,
            event.key,
            width,
            bounds,
            event.shiftKey,
          )
          if (nextWidth === null) return
          event.preventDefault()
          event.stopPropagation()
          updatePaneWidth(side, nextWidth, true)
        }}
      />
    )
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

  function confirmResetToSample() {
    if (window.confirm(t('app.resetSampleConfirm'))) resetToSample()
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
      <EditorKeyboardShortcuts readOnlyEditorView={editorView !== 'screen'} />
      <div className={`${styles.root} ${resizingPane ? styles.resizing : ''}`}>
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
            {BUILD_FEATURE_FLAGS.sampleReset ? (
              <button
                className={styles.historyBtn}
                onClick={confirmResetToSample}
                disabled={Boolean(activeChangeSet)}
                title={resetSampleTitle}
                aria-label={resetSampleTitle}
                type="button"
                data-sample-reset
              >
                ↻ <span className={styles.historyActionText}>{t('app.resetSample')}</span>
              </button>
            ) : null}
            <button
              className={styles.historyBtn}
              onClick={undo}
              disabled={!canUndo}
              title={undoTitle}
              aria-label={undoTitle}
              type="button"
              data-history-undo
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
              data-history-redo
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
          <aside
            className={styles.left}
            style={{ width: leftPaneWidth }}
            aria-label={t('app.leftPane')}
          >
            <LeftPane />
          </aside>

          {paneResizeHandle('left')}

          <main
            className={styles.editor}
            data-read-only-editor-view={editorView !== 'screen' || undefined}
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
              <button
                type="button"
                className={editorView === 'definition' ? styles.editorViewActive : ''}
                aria-pressed={editorView === 'definition'}
                onClick={openDefinitionView}
              >
                {t('editor.definitionView')}
              </button>
            </div>
            {activeScreen && editorView !== 'definition' ? (
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
            <div
              className={styles.editorViewPanel}
              hidden={editorView !== 'definition'}
              data-editor-view="definition"
            >
              <DefinitionEditor
                previewVariantId={definitionPreviewVariantId}
                onPreviewVariantChange={setDefinitionPreviewVariantId}
              />
            </div>
          </main>

          {paneResizeHandle('right')}

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
              {editorView === 'definition' &&
              !(activeChangeSet && ui.rightPanelTab === 'changes') ? (
                <DefinitionInspector
                  previewVariantId={definitionPreviewVariantId}
                  onPreviewVariantChange={setDefinitionPreviewVariantId}
                />
              ) : (
                <Inspector />
              )}
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
