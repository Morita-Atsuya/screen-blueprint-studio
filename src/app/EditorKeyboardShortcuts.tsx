import { useEffect } from 'react'
import { getOwnEntity } from '../domain/entityMap'
import { useAppStore } from './appStore'
import { resolveEditorShortcut } from './editorShortcuts'

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

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return null
}
