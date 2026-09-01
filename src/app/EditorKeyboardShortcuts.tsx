import { useEffect } from 'react'
import { getOwnEntity } from '../domain/entityMap'
import { useAppStore } from './appStore'
import {
  resolveEditorShortcut,
  resolveHierarchySelectionShortcut,
  resolveHierarchyEditorSelection,
} from './editorShortcuts'
import {
  canDuplicateComponent,
  canPasteComponent,
} from '../domain/componentDuplication'
import { useI18n } from '../i18n/I18nProvider'
import { selectedScreenComponentId } from '../domain/editorSelection'

export function EditorKeyboardShortcuts({
  readOnlyEditorView,
}: {
  readOnlyEditorView: boolean
}) {
  const { t } = useI18n()
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const shortcut = resolveEditorShortcut({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        repeat: event.repeat,
        isComposing: event.isComposing,
        keyCode: event.keyCode,
        target: event.target,
        dragActive: Boolean(document.querySelector('[data-drag-overlay]')),
        readOnlyEditorView,
      })
      if (!shortcut) return

      const state = useAppStore.getState()
      if (state.recoveryState) return
      if (shortcut === 'clear-selection') {
        if (!state.ui.selection) return
        event.preventDefault()
        state.setSelection(null)
        return
      }
      if (shortcut === 'undo') {
        if (state.history.length === 0) return
        event.preventDefault()
        if (state.activeChangeSet) {
          state.notifyReviewLock()
          return
        }
        state.undo()
        return
      }
      if (shortcut === 'redo') {
        if (state.redoStack.length === 0) return
        event.preventDefault()
        if (state.activeChangeSet) {
          state.notifyReviewLock()
          return
        }
        state.redo()
        return
      }

      const selection = state.ui.selection
      const selectedId = selectedScreenComponentId(selection)
      if (!selection || !selectedId) return
      if (shortcut === 'copy-selection') {
        if (!canDuplicateComponent(state.effectiveDocument, selectedId)) return
        event.preventDefault()
        state.copyComponent(selectedId)
        return
      }
      if (shortcut === 'paste-selection') {
        if (!canPasteComponent(
          state.effectiveDocument,
          state.componentClipboard,
          selectedId,
        )) {
          return
        }
        event.preventDefault()
        if (state.activeChangeSet) {
          state.notifyReviewLock()
          return
        }
        state.pasteComponent(selectedId, t('componentMenu.pasteHistory'))
        return
      }
      if (shortcut === 'duplicate-selection') {
        if (!canDuplicateComponent(state.effectiveDocument, selectedId)) return
        event.preventDefault()
        if (state.activeChangeSet) {
          state.notifyReviewLock()
          return
        }
        state.duplicateComponent(selectedId, t('componentMenu.duplicateHistory'))
        return
      }
      event.preventDefault()
      const component = getOwnEntity(state.effectiveDocument.components, selectedId)
      if (!component) {
        state.showToast({
          severity: 'error',
          message: { key: 'errors.selectedComponentMissing' },
        })
        return
      }
      const screen = getOwnEntity(state.effectiveDocument.screens, component.screenId)
      if (component.id === screen?.rootComponentId) {
        state.showToast({
          severity: 'error',
          message: { key: 'errors.cannotDeleteRoot' },
        })
        return
      }
      if (state.activeChangeSet) {
        state.notifyReviewLock()
        return
      }
      state.requestHumanDelete(
        { type: 'removeComponent', componentId: selectedId },
        'Delete component',
      )
    }

    function handleHierarchySelection(event: KeyboardEvent) {
      const shortcut = resolveHierarchySelectionShortcut({
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        repeat: event.repeat,
        isComposing: event.isComposing,
        keyCode: event.keyCode,
        target: event.target,
        dragActive: Boolean(document.querySelector('[data-drag-overlay]')),
      })
      if (!shortcut) return

      const state = useAppStore.getState()
      if (state.recoveryState) return
      const selection = state.ui.selection
      const selectedId = selectedScreenComponentId(selection)
      if (!selection || !selectedId) return
      const selected = getOwnEntity(state.effectiveDocument.components, selectedId)
      if (!selected || selected.screenId !== state.ui.activeScreenId) return

      event.preventDefault()
      const shortcutScope = (event.target as Element | null)?.closest<HTMLElement>(
        '[data-hierarchy-shortcut-scope]',
      )
      const targetSelection = resolveHierarchyEditorSelection(
        state.effectiveDocument,
        selection,
        shortcut,
      )
      if (!targetSelection) return
      state.setSelection(targetSelection)
      if (shortcutScope?.dataset.hierarchyShortcutScope === 'inspector') {
        setTimeout(() => {
          document
            .querySelector<HTMLElement>(
              '[data-hierarchy-shortcut-scope="inspector"] [aria-current="page"]',
            )
            ?.focus()
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keydown', handleHierarchySelection, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keydown', handleHierarchySelection, true)
    }
  }, [readOnlyEditorView, t])

  return null
}
