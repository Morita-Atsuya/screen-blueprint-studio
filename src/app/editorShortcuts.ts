export type EditorShortcut = 'delete-selection' | 'clear-selection' | 'undo' | 'redo' | null

interface KeyboardInput {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  target?: unknown
}

export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as {
    tagName?: unknown
    isContentEditable?: unknown
    closest?: (selector: string) => unknown
  }
  const tagName = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    element.isContentEditable === true ||
    Boolean(element.closest?.('[contenteditable="true"]'))
  )
}

export function resolveEditorShortcut(input: KeyboardInput): EditorShortcut {
  if (isEditableTarget(input.target)) return null
  const key = input.key.toLowerCase()
  if (key === 'escape') return 'clear-selection'
  if (key === 'delete' || key === 'backspace') return 'delete-selection'
  if (key === 'z' && (input.metaKey || input.ctrlKey)) {
    return input.shiftKey ? 'redo' : 'undo'
  }
  if (key === 'y' && input.ctrlKey && !input.metaKey) return 'redo'
  return null
}
