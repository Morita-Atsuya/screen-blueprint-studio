import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { useAppStore } from '../../src/app/appStore'
import {
  getApiEditorContext,
  getEventEditorContext,
  getValidationRulesEditorContext,
} from '../../src/domain/componentBehavior'
import { I18nProvider } from '../../src/i18n/I18nProvider'
import { sampleProject } from '../../src/sample/sampleProject'
import { StateDialog } from '../../src/features/canvas/StateDialog'
import { ApiOperationDialog } from '../../src/features/inspector/ApiOperationDialog'
import { EventDialog } from '../../src/features/inspector/EventDialog'
import { ValidationRulesDialog } from '../../src/features/inspector/ValidationRulesDialog'

export type LockedDialogKind = 'event' | 'api' | 'validation' | 'state'

interface FocusLossDocument extends Document {
  simulateDisabledFocusLoss?(): void
}

function dialogFor(kind: LockedDialogKind, onClose: () => void) {
  if (kind === 'state') {
    return (
      <StateDialog
        mode="edit"
        screenId="screen-edit"
        state={sampleProject.screenStates['state-edit-saving']}
        onClose={onClose}
      />
    )
  }

  if (kind === 'event') {
    const context = getEventEditorContext(sampleProject, 'comp-save-btn')
    if (!context) throw new Error('Missing event editor context')
    return (
      <EventDialog
        mode="edit"
        eventId="event-submit"
        event={sampleProject.events['event-submit']}
        context={context}
        onClose={onClose}
      />
    )
  }

  if (kind === 'api') {
    const context = getApiEditorContext(sampleProject, 'comp-save-btn')
    const editorOperation = context?.operations.find(
      candidate => candidate.operation.id === 'api-save-user',
    )
    if (!context || !editorOperation) throw new Error('Missing API editor context')
    return (
      <ApiOperationDialog
        mode="edit"
        operationId={editorOperation.operation.id}
        editorOperation={editorOperation}
        context={context}
        onClose={onClose}
      />
    )
  }

  const context = getValidationRulesEditorContext(sampleProject, 'comp-name-input')
  if (!context) throw new Error('Missing validation editor context')
  return <ValidationRulesDialog context={context} onClose={onClose} />
}

export function mountLockedDialog(kind: LockedDialogKind) {
  let closeCount = 0
  useAppStore.setState(state => ({
    ...state,
    document: sampleProject,
    effectiveDocument: sampleProject,
    activeChangeSet: null,
    history: [],
    redoStack: [],
    pendingDelete: null,
    reviewDraftProtectionIds: [],
    reviewDraftDocument: null,
    ui: {
      ...state.ui,
      activeScreenId: 'screen-edit',
      activeStateId: 'state-edit-default',
      selectedComponentId: 'comp-save-btn',
      rightPanelTab: 'inspector',
    },
  }))

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  flushSync(() => {
    root.render(
      <I18nProvider>
        {dialogFor(kind, () => {
          closeCount += 1
        })}
      </I18nProvider>,
    )
  })
  flushSync(() => {
    useAppStore.setState(state => ({ ...state }))
  })

  return {
    click(element: HTMLElement) {
      flushSync(() => element.click())
    },
    startReview(withAcceptedChange = false) {
      const focusedDraft = document.activeElement?.closest('fieldset')
      if (focusedDraft) {
        const focusDocument = document as FocusLossDocument
        focusDocument.simulateDisabledFocusLoss?.()
      }
      flushSync(() => {
        const changeSet = useAppStore.getState().beginChangeSet('Lock dialog draft')
        if (withAcceptedChange) {
          useAppStore.getState().dispatchToChangeSet(changeSet.id, {
            type: 'updateScreen',
            screenId: 'screen-list',
            name: 'Accepted while dialog remains open',
          })
        }
      })
    },
    getCloseCount() {
      return closeCount
    },
    unmount() {
      flushSync(() => root.unmount())
      container.remove()
    },
  }
}
