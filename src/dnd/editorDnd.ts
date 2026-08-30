import type { EntityId, ProjectDocument } from '../domain/model'
import type { PaletteItem } from '../features/palette/componentFactory'
import {
  classifyComponentDrop,
  classifyPaletteDrop,
} from '../domain/componentPlacement'
import type {
  ComponentMoveOutcome,
  ComponentPlacementInvalidReason,
} from '../domain/componentPlacement'

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

export type EditorDropOutcome =
  | { status: 'moved'; action: 'add'; parentId: EntityId | null; position: number }
  | { status: 'moved'; action: 'move'; position: number }
  | { status: 'no-op'; position: number }
  | { status: 'invalid'; reason: ComponentPlacementInvalidReason }

export function isEditorDragData(value: unknown): value is EditorDragData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<EditorDragData>
  return data.type === 'palette' || data.type === 'component'
}

export function isComponentDropData(value: unknown): value is ComponentDropData {
  if (!value || typeof value !== 'object') return false
  return (value as Partial<ComponentDropData>).type === 'component-drop'
}

export function resolveComponentDrop(
  doc: ProjectDocument,
  componentId: EntityId,
  target: ComponentDropData,
): ComponentMoveOutcome {
  return classifyComponentDrop(
    doc,
    componentId,
    target.screenId,
    target.parentId,
    target.position,
  )
}

export function resolveEditorDrop(
  document: ProjectDocument,
  drag: EditorDragData,
  target: ComponentDropData,
): EditorDropOutcome {
  if (drag.type === 'palette') {
    const outcome = classifyPaletteDrop(
      document,
      target.screenId,
      target.parentId,
      target.position,
      drag.kind,
    )
    return outcome.status === 'moved'
      ? { ...outcome, action: 'add' }
      : outcome
  }
  const outcome = resolveComponentDrop(document, drag.componentId, target)
  return outcome.status === 'moved'
    ? { ...outcome, action: 'move' }
    : outcome
}

export function canAcceptDrop(
  doc: ProjectDocument,
  drag: EditorDragData,
  target: ComponentDropData,
): boolean {
  return resolveEditorDrop(doc, drag, target).status !== 'invalid'
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
