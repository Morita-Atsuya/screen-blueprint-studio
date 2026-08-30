import { useEffect } from 'react'
import { getOwnEntity } from '../domain/entityMap'
import { useAppStore } from './appStore'
import {
  resolveEditorShortcut,
  resolveHierarchySelectionShortcut,
  resolveHierarchySelectionTarget,
} from './editorShortcuts'

export function EditorKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const shortcut = resolveEditorShortcut(event)
      if (!shortcut) return

      const state = useAppStore.getState()
      if (state.recoveryState) return
      if (shortcut === 'clear-selection') {
        if (!state.ui.selectedComponentId) return
        event.preventDefault()
        state.setSelectedComponent(null)
        return
      }
      if (shortcut === 'undo') {
        if (state.activeChangeSet || state.history.length === 0) return
        event.preventDefault()
        state.undo()
        return
      }
      if (shortcut === 'redo') {
        if (state.activeChangeSet || state.redoStack.length === 0) return
        event.preventDefault()
        state.redo()
        return
      }

      const selectedId = state.ui.selectedComponentId
      if (!selectedId) return
      event.preventDefault()
      const component = getOwnEntity(state.effectiveDocument.components, selectedId)
      if (!component) {
        state.setErrorMessage({ key: 'errors.selectedComponentMissing' })
        return
      }
      const screen = getOwnEntity(state.effectiveDocument.screens, component.screenId)
      if (component.id === screen?.rootComponentId) {
        state.setErrorMessage({ key: 'errors.cannotDeleteRoot' })
        return
      }
      state.dispatch(
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
      const selectedId = state.ui.selectedComponentId
      if (!selectedId) return
      const selected = getOwnEntity(state.effectiveDocument.components, selectedId)
      if (!selected || selected.screenId !== state.ui.activeScreenId) return

      event.preventDefault()
      const shortcutScope = (event.target as Element | null)?.closest<HTMLElement>(
        '[data-hierarchy-shortcut-scope]',
      )
      const targetId = resolveHierarchySelectionTarget(
        state.effectiveDocument,
        selectedId,
        shortcut,
      )
      if (!targetId) return
      state.setSelectedComponent(targetId)
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
  }, [])

  return null
}
