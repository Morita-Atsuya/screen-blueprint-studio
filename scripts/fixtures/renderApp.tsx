import { renderToString } from 'react-dom/server'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { useAppStore } from '../../src/app/appStore'
import { App } from '../../src/app/App'
import { I18nProvider } from '../../src/i18n/I18nProvider'
import { LOCALE_STORAGE_KEY } from '../../src/i18n/locale'
import type { Locale } from '../../src/i18n/messages'
import { sampleProject } from '../../src/sample/sampleProject'
import { DEFAULT_COMPONENT_SIZING } from '../../src/domain/model'

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
  initialState.recoveryState = null
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

export function renderRecoveryApp(locale: Locale): string {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  const initialState = useAppStore.getInitialState()
  initialState.document = sampleProject
  initialState.effectiveDocument = sampleProject
  initialState.activeChangeSet = null
  initialState.recoveryState = {
    status: 'invalid',
    rawData: '{broken',
    error: 'Saved data is invalid',
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
    addContainerAffordanceFixture() {
      flushSync(() => {
        const add = (
          componentId: string,
          parentId: string,
          description: string,
          position?: number,
        ) => useAppStore.getState().dispatch({
          type: 'addComponent',
          componentId,
          screenId: 'screen-edit',
          parentId,
          kind: 'container',
          placement: { mode: 'flow' },
          sizing: { ...DEFAULT_COMPONENT_SIZING },
          config: {
            kind: 'container',
            layout: 'vertical',
            gap: 'sm',
            columns: 2,
            justify: 'start',
            align: 'stretch',
            wrap: false,
          },
          position,
        }, `Add ${description}`)
        add('regression-empty-container', 'comp-edit-section', 'Empty group')
        add('regression-nested-container', 'comp-edit-section', 'Nested group')
        add('regression-inner-container', 'regression-nested-container', 'Inner group')
        useAppStore.getState().dispatch({
          type: 'updateComponentSpec',
          componentId: 'regression-empty-container',
          patch: {
            common: { description: 'Empty group' },
            config: { layout: 'horizontal' },
          },
        }, 'Name empty group')
        useAppStore.getState().dispatch({
          type: 'updateComponentSpec',
          componentId: 'regression-nested-container',
          patch: { common: { description: 'Nested group' } },
        }, 'Name nested group')
        useAppStore.getState().dispatch({
          type: 'updateComponentSpec',
          componentId: 'regression-inner-container',
          patch: { common: { description: 'Inner group' } },
        }, 'Name inner group')
        useAppStore.getState().setActiveState('state-edit-default')
      })
    },
    addTreeStateBadgeFixture() {
      flushSync(() => {
        const addContainer = (
          componentId: string,
          parentId: string,
          description: string,
        ) => useAppStore.getState().dispatch({
          type: 'addComponent',
          componentId,
          screenId: 'screen-edit',
          parentId,
          kind: 'container',
          placement: { mode: 'flow' },
          sizing: { ...DEFAULT_COMPONENT_SIZING },
          config: {
            kind: 'container',
            layout: 'vertical',
            gap: 'sm',
            columns: 2,
            justify: 'start',
            align: 'stretch',
            wrap: false,
          },
        }, `Add ${description}`)
        addContainer('regression-tree-level-1', 'comp-edit-section', 'Details group')
        addContainer('regression-tree-level-2', 'regression-tree-level-1', 'Feedback group')
        addContainer('regression-tree-level-3', 'regression-tree-level-2', 'Status group')
        useAppStore.getState().dispatch({
          type: 'addComponent',
          componentId: 'regression-tree-state-message',
          screenId: 'screen-edit',
          parentId: 'regression-tree-level-3',
          kind: 'text',
          placement: { mode: 'flow' },
          sizing: { ...DEFAULT_COMPONENT_SIZING },
          config: {
            kind: 'text',
            text: 'Waiting for review',
            style: 'body',
          },
        }, 'Add deep state message')
        useAppStore.getState().dispatch({
          type: 'updateComponentSpec',
          componentId: 'regression-tree-state-message',
          patch: {
            common: {
              description: 'Deep review status',
              visible: false,
              enabled: false,
            },
          },
        }, 'Set deep state presentation')
        const success = useAppStore.getState().document.screenStates['state-edit-success']
        useAppStore.getState().dispatch({
          type: 'updateScreenState',
          stateId: success.id,
          name: success.name,
          description: success.description,
          overrides: {
            ...success.componentOverrides,
            'regression-tree-state-message': { text: 'Ready for review' },
          },
        }, 'Override deep state message')
        useAppStore.getState().setActiveState(success.id)
        const changeSet = useAppStore.getState().beginChangeSet('Update deep state message')
        useAppStore.getState().dispatchToChangeSet(changeSet.id, {
          type: 'updateComponentSpec',
          componentId: 'regression-tree-state-message',
          patch: { config: { text: 'Agent review pending' } },
        }, 'agent')
      })
    },
    addPlacementFixture() {
      flushSync(() => {
        useAppStore.getState().dispatch({
          type: 'addComponent',
          componentId: 'regression-viewport-container',
          screenId: 'screen-list',
          parentId: 'comp-list-section',
          kind: 'container',
          placement: {
            mode: 'viewport',
            anchor: 'bottomLeft',
            insetX: 'sm',
            insetY: 'sm',
          },
          sizing: { ...DEFAULT_COMPONENT_SIZING },
          config: {
            kind: 'container',
            layout: 'vertical',
            gap: 'sm',
            columns: 1,
            justify: 'start',
            align: 'stretch',
            wrap: false,
          },
        }, 'Add projected Container')
        useAppStore.getState().dispatch({
          type: 'addComponent',
          componentId: 'regression-nested-overlay',
          screenId: 'screen-list',
          parentId: 'regression-viewport-container',
          kind: 'text',
          placement: {
            mode: 'overlay',
            anchor: 'bottomRight',
            insetX: 'xs',
            insetY: 'xs',
          },
          sizing: { ...DEFAULT_COMPONENT_SIZING },
          config: {
            kind: 'text',
            text: 'Nested overlay',
            style: 'caption',
          },
        }, 'Add nested overlay')
        useAppStore.getState().dispatch({
          type: 'updateComponentSpec',
          componentId: 'comp-create-modal-title',
          patch: {
            placement: {
              mode: 'viewport',
              anchor: 'topCenter',
              insetX: 'none',
              insetY: 'sm',
            },
          },
        }, 'Project modal title')
        useAppStore.getState().setActiveScreen('screen-list')
        useAppStore.getState().setActiveState('state-list-default')
      })
    },
    markInnerContainerChanged() {
      flushSync(() => {
        const changeSet = useAppStore.getState().beginChangeSet('Update nested Container')
        useAppStore.getState().dispatchToChangeSet(changeSet.id, {
          type: 'updateComponentSpec',
          componentId: 'regression-inner-container',
          patch: { common: { description: 'Inner group updated' } },
        }, 'agent')
      })
    },
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
        historyLength: state.history.length,
        editScreenName: state.document.screens['screen-edit']?.name ?? null,
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
