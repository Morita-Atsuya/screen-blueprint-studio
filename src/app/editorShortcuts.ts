import { getOwnEntity } from '../domain/entityMap'
import type { EntityId, ProjectDocument } from '../domain/model'

export type EditorShortcut =
  | 'delete-selection'
  | 'copy-selection'
  | 'paste-selection'
  | 'duplicate-selection'
  | 'clear-selection'
  | 'undo'
  | 'redo'
  | null
export type HierarchySelectionShortcut =
  | 'select-parent'
  | 'select-first-child'
  | 'select-previous-sibling'
  | 'select-next-sibling'

interface KeyboardInput {
  key: string
  code?: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  repeat?: boolean
  isComposing?: boolean
  keyCode?: number
  dragActive?: boolean
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
  if ((key === 'c' || key === 'v' || key === 'd') && (input.metaKey || input.ctrlKey)) {
    if (
      (input.metaKey && input.ctrlKey) ||
      input.shiftKey ||
      input.altKey ||
      input.repeat ||
      input.isComposing ||
      input.keyCode === 229 ||
      input.dragActive ||
      !isHierarchyShortcutScope(input.target) ||
      isBlockedHierarchyShortcutTarget(input.target)
    ) {
      return null
    }
    if (key === 'c') return 'copy-selection'
    if (key === 'v') return 'paste-selection'
    return 'duplicate-selection'
  }
  if (key === 'delete' || key === 'backspace') {
    if (
      input.metaKey ||
      input.ctrlKey ||
      input.altKey ||
      input.repeat ||
      input.isComposing ||
      input.keyCode === 229 ||
      input.dragActive ||
      isBlockedDeleteTarget(input.target)
    ) {
      return null
    }
    return 'delete-selection'
  }
  if (key === 'z' && (input.metaKey || input.ctrlKey)) {
    return input.shiftKey ? 'redo' : 'undo'
  }

  function isBlockedDeleteTarget(target: unknown): boolean {
    return Boolean(asClosestTarget(target)?.closest?.('[role="dialog"], [role="menu"]'))
  }
  if (key === 'y' && input.ctrlKey && !input.metaKey) return 'redo'
  return null
}

export function resolveHierarchySelectionShortcut(
  input: KeyboardInput,
): HierarchySelectionShortcut | null {
  if (
    input.metaKey ||
    input.ctrlKey ||
    input.altKey ||
    input.repeat ||
    input.isComposing ||
    input.keyCode === 229 ||
    input.dragActive ||
    isEditableTarget(input.target)
  ) {
    return null
  }
  if (!isHierarchyShortcutScope(input.target) || isBlockedHierarchyShortcutTarget(input.target)) {
    return null
  }

  const isLeftBracket = input.code === 'BracketLeft' || input.key === '[' || input.key === '{'
  const isRightBracket = input.code === 'BracketRight' || input.key === ']' || input.key === '}'
  if (isLeftBracket) {
    return input.shiftKey ? 'select-previous-sibling' : 'select-parent'
  }
  if (isRightBracket) {
    return input.shiftKey ? 'select-next-sibling' : 'select-first-child'
  }
  return null
}

export function resolveHierarchySelectionTarget(
  document: ProjectDocument,
  selectedComponentId: EntityId,
  shortcut: HierarchySelectionShortcut,
): EntityId | null {
  const selected = getOwnEntity(document.components, selectedComponentId)
  if (!selected) return null

  if (shortcut === 'select-parent') {
    if (!selected.parentId) return null
    const parent = getOwnEntity(document.components, selected.parentId)
    return parent?.screenId === selected.screenId ? parent.id : null
  }

  if (shortcut === 'select-first-child') {
    const child = selected.childIds
      .map(childId => getOwnEntity(document.components, childId))
      .find(candidate => candidate?.screenId === selected.screenId)
    return child?.id ?? null
  }

  if (!selected.parentId) return null
  const parent = getOwnEntity(document.components, selected.parentId)
  if (!parent || parent.screenId !== selected.screenId) return null
  const selectedIndex = parent.childIds.indexOf(selected.id)
  if (selectedIndex < 0) return null
  const offset = shortcut === 'select-previous-sibling' ? -1 : 1
  const sibling = getOwnEntity(document.components, parent.childIds[selectedIndex + offset])
  return sibling?.screenId === selected.screenId ? sibling.id : null
}

function isHierarchyShortcutScope(target: unknown): boolean {
  return Boolean(asClosestTarget(target)?.closest?.('[data-hierarchy-shortcut-scope]'))
}

function isBlockedHierarchyShortcutTarget(target: unknown): boolean {
  return Boolean(asClosestTarget(target)?.closest?.('[role="tree"], [role="dialog"], [role="menu"]'))
}

function asClosestTarget(target: unknown): { closest?: (selector: string) => unknown } | null {
  return target && typeof target === 'object'
    ? target as { closest?: (selector: string) => unknown }
    : null
}
