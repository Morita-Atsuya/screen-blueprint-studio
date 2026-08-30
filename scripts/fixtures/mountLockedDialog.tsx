import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
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
  return (
    <ValidationRulesDialog
      context={{
        ...context,
        rules: [
          ...context.rules,
          { id: 'regression-required', type: 'required', message: 'Duplicate required rule' },
          { id: 'regression-min', type: 'minLength', value: -1, message: 'Invalid minimum' },
          {
            id: 'regression-custom',
            type: 'custom',
            description: '',
            message: '',
          },
        ],
      }}
      onClose={onClose}
    />
  )
}

function DialogHarness({
  kind,
  onClose,
}: {
  kind: LockedDialogKind
  onClose(): void
}) {
  const [open, setOpen] = useState(false)
  const reviewLocked = useAppStore(state => Boolean(state.activeChangeSet))
  return (
    <I18nProvider>
      <button
        type="button"
        data-dialog-opener
        disabled={reviewLocked}
        onClick={() => setOpen(true)}
      >
        Open dialog
      </button>
      <button type="button" tabIndex={-1} data-delete-focus-fallback>
        Dialog fallback
      </button>
      {open
        ? dialogFor(kind, () => {
            onClose()
            setOpen(false)
          })
        : null}
    </I18nProvider>
  )
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
      <DialogHarness
        kind={kind}
        onClose={() => {
          closeCount += 1
        }}
      />,
    )
  })
  const opener = container.querySelector<HTMLElement>('[data-dialog-opener]')
  if (!opener) throw new Error('Missing dialog opener')
  opener.focus()
  flushSync(() => opener.click())
  flushSync(() => {
    useAppStore.setState(state => ({ ...state }))
  })

  return {
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
    getOpener() {
      return opener
    },
    unmount() {
      flushSync(() => root.unmount())
      container.remove()
    },
  }
}
