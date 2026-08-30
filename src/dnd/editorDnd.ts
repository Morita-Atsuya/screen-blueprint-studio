import { CONTAINER_KINDS } from '../domain/model'
import type { EntityId, ProjectDocument } from '../domain/model'
import { getOwnEntity } from '../domain/entityMap'
import type { PaletteItem } from '../features/palette/componentFactory'

export type EditorDragData =
  | {
      type: 'palette'
      kind: PaletteItem['kind']
      label: string
    }
  | {
      type: 'component'
      componentId: EntityId
      screenId: EntityId
      label: string
    }

export interface ComponentDropData {
  type: 'component-drop'
  parentId: EntityId
  screenId: EntityId
  position: number
  label: string
}

export type MoveResolution =
  | { ok: true; position: number }
  | { ok: false; reason: 'missing' | 'root' | 'crossScreen' | 'invalidParent' | 'descendant' | 'position' | 'order' | 'noOp' }

export function isEditorDragData(value: unknown): value is EditorDragData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<EditorDragData>
  return data.type === 'palette' || data.type === 'component'
}

export function isComponentDropData(value: unknown): value is ComponentDropData {
  if (!value || typeof value !== 'object') return false
  return (value as Partial<ComponentDropData>).type === 'component-drop'
}

function isDescendant(
  doc: ProjectDocument,
  ancestorId: EntityId,
  possibleDescendantId: EntityId,
): boolean {
  let current = getOwnEntity(doc.components, possibleDescendantId)
  const visited = new Set<EntityId>()
  while (current && !visited.has(current.id)) {
    if (current.id === ancestorId) return true
    visited.add(current.id)
    current = current.parentId ? getOwnEntity(doc.components, current.parentId) : undefined
  }
  return false
}

export function resolveComponentDrop(
  doc: ProjectDocument,
  componentId: EntityId,
  target: ComponentDropData,
): MoveResolution {
  const component = getOwnEntity(doc.components, componentId)
  if (!component) return { ok: false, reason: 'missing' }
  if (component.parentId === null) return { ok: false, reason: 'root' }
  if (component.screenId !== target.screenId) {
    return { ok: false, reason: 'crossScreen' }
  }

  const parent = getOwnEntity(doc.components, target.parentId)
  if (!parent || parent.screenId !== component.screenId) {
    return { ok: false, reason: 'invalidParent' }
  }
  if (!CONTAINER_KINDS.includes(parent.kind)) {
    return { ok: false, reason: 'invalidParent' }
  }
  if (isDescendant(doc, component.id, parent.id)) {
    return { ok: false, reason: 'descendant' }
  }
  if (!Number.isInteger(target.position) || target.position < 0 || target.position > parent.childIds.length) {
    return { ok: false, reason: 'position' }
  }

  const oldParent = getOwnEntity(doc.components, component.parentId)
  if (!oldParent) return { ok: false, reason: 'invalidParent' }
  const oldIndex = oldParent.childIds.indexOf(component.id)
  if (oldIndex < 0) return { ok: false, reason: 'order' }

  const sameParent = oldParent.id === parent.id
  const position = sameParent && oldIndex < target.position
    ? target.position - 1
    : target.position
  if (sameParent && position === oldIndex) {
    return { ok: false, reason: 'noOp' }
  }
  return { ok: true, position }
}

export function canAcceptDrop(
  doc: ProjectDocument,
  drag: EditorDragData,
  target: ComponentDropData,
): boolean {
  const parent = getOwnEntity(doc.components, target.parentId)
  if (
    !parent ||
    parent.screenId !== target.screenId ||
    !CONTAINER_KINDS.includes(parent.kind) ||
    !Number.isInteger(target.position) ||
    target.position < 0 ||
    target.position > parent.childIds.length
  ) {
    return false
  }
  if (drag.type === 'palette') return true
  return resolveComponentDrop(doc, drag.componentId, target).ok
}

export function draggableComponentId(surface: 'tree' | 'canvas', componentId: EntityId): string {
  return `${surface}:component:${componentId}`
}

export function componentDropId(
  surface: 'tree' | 'canvas',
  parentId: EntityId,
  position: number,
): string {
  return `${surface}:drop:${parentId}:${position}`
}
