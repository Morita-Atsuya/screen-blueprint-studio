import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { useAppStore } from '../../src/app/appStore'
import { DeleteConfirmationDialog } from '../../src/app/DeleteConfirmationDialog'
import { I18nProvider } from '../../src/i18n/I18nProvider'
import { sampleProject } from '../../src/sample/sampleProject'

function DeleteDialogHarness({ showOpener }: { showOpener: boolean }) {
  return (
    <I18nProvider>
      {showOpener ? (
        <button key="opener" type="button" data-delete-opener>Open delete</button>
      ) : null}
      <button key="fallback" type="button" tabIndex={-1} data-delete-focus-fallback>
        Delete fallback
      </button>
      <DeleteConfirmationDialog key="dialog" />
    </I18nProvider>
  )
}

export function mountDeleteDialog() {
  useAppStore.setState(state => ({
    ...state,
    document: sampleProject,
    effectiveDocument: sampleProject,
    activeChangeSet: null,
    history: [],
    redoStack: [],
    pendingDelete: null,
    toast: null,
    ui: {
      ...state.ui,
      activeScreenId: 'screen-edit',
      activeStateId: 'state-edit-default',
      selectedComponentId: 'comp-actions',
      rightPanelTab: 'inspector',
    },
  }))

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let showOpener = true
  function render() {
    root.render(<DeleteDialogHarness showOpener={showOpener} />)
  }
  flushSync(render)

  const opener = container.querySelector<HTMLElement>('[data-delete-opener]')
  if (!opener) throw new Error('Delete dialog opener did not mount')

  return {
    open() {
      opener.focus()
      flushSync(() => {
        useAppStore.getState().requestHumanDelete(
          { type: 'removeComponent', componentId: 'comp-actions' },
          'Delete component',
        )
      })
    },
    click(element: HTMLElement) {
      flushSync(() => element.click())
    },
    keyDown(element: HTMLElement, key: string, shiftKey = false) {
      const event = new Event('keydown', { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        key: { value: key },
        shiftKey: { value: shiftKey },
      })
      flushSync(() => element.dispatchEvent(event))
    },
    changeDocument() {
      flushSync(() => {
        useAppStore.getState().dispatch({
          type: 'updateScreen',
          screenId: 'screen-edit',
          name: 'Changed while confirming',
        })
      })
    },
    beginReview() {
      flushSync(() => {
        useAppStore.getState().beginChangeSet('Lock pending delete')
      })
    },
    rejectReview() {
      flushSync(() => useAppStore.getState().rejectChangeSet())
    },
    removeOpener() {
      showOpener = false
      flushSync(render)
    },
    state() {
      const state = useAppStore.getState()
      return {
        pending: Boolean(state.pendingDelete),
        targetExists: Boolean(state.document.components['comp-actions']),
        historyLength: state.history.length,
        hasUndoAction: Boolean(state.toast?.action),
      }
    },
    unmount() {
      flushSync(() => root.unmount())
      container.remove()
    },
  }
}
