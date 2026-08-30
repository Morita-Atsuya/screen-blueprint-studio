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
        if (state.activeChangeSet) {
          event.preventDefault()
          state.setErrorMessage('変更案の確認中はUndoできません。先に承認または却下してください。')
          return
        }
        if (state.history.length === 0) return
        event.preventDefault()
        state.undo()
        return
      }

      const selectedId = state.ui.selectedComponentId
      if (!selectedId) return
      event.preventDefault()
      const component = getOwnEntity(state.effectiveDocument.components, selectedId)
      if (!component) {
        state.setErrorMessage('選択中のコンポーネントが見つかりません。')
        return
      }
      if (component.parentId === null) {
        state.setErrorMessage('ルートコンポーネントは削除できません。')
        return
      }
      state.dispatch(
        { type: 'removeComponent', componentId: selectedId },
        'コンポーネント削除',
      )
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return null
}
