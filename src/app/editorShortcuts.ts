import { getOwnEntity } from '../domain/entityMap'
import type { EditorSelection } from '../domain/editorSelection'
import {
  resolvedDefinitionNodeSelection,
  screenComponentSelection,
} from '../domain/editorSelection'
import { resolveScreenNodes } from '../domain/definitionResolver'
import type { EntityId, ProjectDocument } from '../domain/model'
import {
  componentTargetRefKey,
  definitionNodeTargetRef,
} from '../domain/componentTargets'

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
  readOnlyEditorView?: boolean
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
      (input.readOnlyEditorView && !isComponentEditingScope(input.target)) ||
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
    return Boolean(asClosestTarget(target)?.closest?.(
      '[role="dialog"], [role="menu"], [data-read-only-editor-view="true"]',
    ))
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
  const selectedIndex = (parent.childIds as readonly string[]).indexOf(selected.id)
  if (selectedIndex < 0) return null
  const offset = shortcut === 'select-previous-sibling' ? -1 : 1
  const sibling = getOwnEntity(document.components, parent.childIds[selectedIndex + offset])
  return sibling?.screenId === selected.screenId ? sibling.id : null
}

export function resolveHierarchyEditorSelection(
  document: ProjectDocument,
  selection: EditorSelection,
  shortcut: HierarchySelectionShortcut,
): EditorSelection | null {
  if (selection.type !== 'resolvedDefinitionNode') {
    if (selection.type === 'definitionEditorNode') return null
    const targetId = resolveHierarchySelectionTarget(
      document,
      selection.componentId,
      shortcut,
    )
    return targetId
      ? screenComponentSelection(document, selection.screenId, targetId)
      : null
  }

  const resolved = resolveScreenNodes(document, selection.screenId, null)
  const selected = resolved.nodesByTarget[
    componentTargetRefKey(definitionNodeTargetRef(selection.instanceId, selection.nodePath))
  ]
  if (!selected) return null
  let targetRuntimeId: string | undefined
  if (shortcut === 'select-parent') {
    targetRuntimeId = selected.parentId ?? undefined
  } else if (shortcut === 'select-first-child') {
    targetRuntimeId = selected.childIds[0]
  } else {
    if (!selected.parentId) return null
    const parent = resolved.nodesById[selected.parentId]
    const index = parent?.childIds.indexOf(selected.id) ?? -1
    if (index < 0) return null
    targetRuntimeId = parent?.childIds[
      index + (shortcut === 'select-previous-sibling' ? -1 : 1)
    ]
  }
  if (!targetRuntimeId) return null
  const target = resolved.nodesById[targetRuntimeId]
  if (!target) return null
  return target.canonicalTarget.type === 'definitionNode'
    ? resolvedDefinitionNodeSelection(
        selection.screenId,
        target.canonicalTarget.instanceId,
        target.canonicalTarget.nodePath,
      )
    : target.canonicalTarget.type === 'inline'
      ? screenComponentSelection(
        document,
        selection.screenId,
        target.canonicalTarget.componentId,
      )
      : null
}

function isHierarchyShortcutScope(target: unknown): boolean {
  return Boolean(asClosestTarget(target)?.closest?.('[data-hierarchy-shortcut-scope]'))
}

function isBlockedHierarchyShortcutTarget(target: unknown): boolean {
  return Boolean(asClosestTarget(target)?.closest?.('[role="tree"], [role="dialog"], [role="menu"]'))
}

function isComponentEditingScope(target: unknown): boolean {
  return Boolean(asClosestTarget(target)?.closest?.(
    '[role="tree"], [data-hierarchy-shortcut-scope="inspector"]',
  ))
}

function asClosestTarget(target: unknown): { closest?: (selector: string) => unknown } | null {
  return target && typeof target === 'object'
    ? target as { closest?: (selector: string) => unknown }
    : null
}
