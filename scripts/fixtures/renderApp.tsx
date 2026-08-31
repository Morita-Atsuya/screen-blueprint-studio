import { renderToString } from 'react-dom/server'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { useAppStore } from '../../src/app/appStore'
import { App } from '../../src/app/App'
import { I18nProvider } from '../../src/i18n/I18nProvider'
import { LOCALE_STORAGE_KEY } from '../../src/i18n/locale'
import type { Locale } from '../../src/i18n/messages'
import { sampleProject } from '../../src/sample/sampleProject'

const STORAGE_KEY = 'screen-blueprint-studio:v1'
const LEFT_PANE_STORAGE_KEY = 'screen-blueprint-studio:left-pane-sections:v1'

function activeChangeSet() {
  return {
    id: 'regression-change-set',
    summary: 'Accessibility review',
    baseRevision: sampleProject.revision,
    baseDocument: sampleProject,
    operations: [],
    version: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
  }
}

export function renderApp(locale: Locale): string {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  const initialState = useAppStore.getInitialState()
  initialState.document = sampleProject
  initialState.effectiveDocument = sampleProject
  initialState.activeChangeSet = activeChangeSet()
  initialState.history = []
  initialState.redoStack = []
  initialState.ui = {
    ...initialState.ui,
    activeScreenId: 'screen-edit',
    activeStateId: 'state-edit-default',
    selectedComponentId: 'comp-task-title-input',
    rightPanelTab: 'inspector',
  }

  return renderToString(
    <I18nProvider>
      <App />
    </I18nProvider>,
  )
}

function createDomEvent(
  type: string,
  init: Record<string, unknown> = {},
): Event {
  const event = type === 'keydown' || type === 'keyup'
    ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init })
    : new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(
    event,
    Object.fromEntries(Object.entries(init).map(([key, value]) => [
      key,
      { configurable: true, value },
    ])),
  )
  return event
}

function dispatchEvent(
  target: EventTarget,
  type: string,
  init: Record<string, unknown> = {},
): Event {
  const event = createDomEvent(type, init)
  flushSync(() => target.dispatchEvent(event))
  return event
}

export function mountReviewLockApp(locale: Locale = 'en') {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  localStorage.setItem(LEFT_PANE_STORAGE_KEY, JSON.stringify({
    screensExpanded: true,
    paletteExpanded: true,
  }))
  useAppStore.setState(state => ({
    ...state,
    document: sampleProject,
    effectiveDocument: sampleProject,
    activeChangeSet: null,
    history: [],
    redoStack: [],
    componentClipboard: null,
    pendingDelete: null,
    toast: null,
    recoveryState: null,
    startupNotice: null,
    reviewDraftProtectionIds: [],
    reviewDraftDocument: null,
    ui: {
      ...state.ui,
      activeScreenId: 'screen-edit',
      activeStateId: 'state-edit-success',
      selectedComponentId: 'comp-task-title-input',
      rightPanelTab: 'inspector',
    },
  }))

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  function render() {
    root.render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    )
  }
  flushSync(render)

  return {
    container,
    prepareHistory() {
      flushSync(() => {
        useAppStore.getState().dispatch({
          type: 'updateScreen',
          screenId: 'screen-edit',
          name: 'Edit Task prepared for review',
        }, 'Prepare review-lock regression')
      })
    },
    beginReview() {
      flushSync(() => {
        useAppStore.getState().beginChangeSet('Lock every human surface')
      })
    },
    protectedSnapshot() {
      const state = useAppStore.getState()
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
      return JSON.stringify({
        document: state.document,
        baseDocument: state.activeChangeSet?.baseDocument,
        operations: state.activeChangeSet?.operations,
        version: state.activeChangeSet?.version,
        history: state.history,
        redoStack: state.redoStack,
        persistedDocument: persisted.document,
        persistedChangeSet: persisted.activeChangeSet,
      })
    },
    state() {
      const state = useAppStore.getState()
      return {
        activeScreenId: state.ui.activeScreenId,
        activeStateId: state.ui.activeStateId,
        selectedComponentId: state.ui.selectedComponentId,
        rightPanelTab: state.ui.rightPanelTab,
        clipboardReady: Boolean(state.componentClipboard),
        clipboardRootComponentId: state.componentClipboard?.rootComponentId ?? null,
        pendingDelete: Boolean(state.pendingDelete),
        toastKey: state.toast?.message.key ?? null,
        changeSetVersion: state.activeChangeSet?.version ?? null,
        operationCount: state.activeChangeSet?.operations.length ?? null,
      }
    },
    click(element: HTMLElement) {
      flushSync(() => element.click())
    },
    keyDown(
      target: EventTarget,
      key: string,
      init: Record<string, unknown> = {},
    ) {
      return dispatchEvent(target, 'keydown', { key, code: init.code ?? '', ...init })
    },
    keyUp(
      target: EventTarget,
      key: string,
      init: Record<string, unknown> = {},
    ) {
      return dispatchEvent(target, 'keyup', { key, code: init.code ?? '', ...init })
    },
    contextMenu(element: HTMLElement) {
      return dispatchEvent(element, 'contextmenu', {
        button: 2,
        clientX: 120,
        clientY: 120,
      })
    },
    pointer(
      target: EventTarget,
      type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
      init: Record<string, unknown> = {},
    ) {
      return dispatchEvent(target, type, {
        button: 0,
        buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: 100,
        clientY: 100,
        ...init,
      })
    },
    wheel(
      target: EventTarget,
      init: Record<string, unknown> = {},
    ) {
      return dispatchEvent(target, 'wheel', {
        clientX: 100,
        clientY: 100,
        deltaX: 0,
        deltaY: 0,
        deltaMode: 0,
        ...init,
      })
    },
    unmount() {
      flushSync(() => root.unmount())
      container.remove()
    },
  }
}
