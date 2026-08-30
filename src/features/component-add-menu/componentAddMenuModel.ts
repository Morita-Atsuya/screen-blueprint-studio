import type { EntityId, ProjectDocument } from '../../domain/model'
import { CONTAINER_KINDS } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import { canAcceptDrop } from '../../dnd/editorDnd'
import type { ComponentDropData, EditorDragData } from '../../dnd/editorDnd'
import { PALETTE_ITEMS } from '../palette/componentFactory'
import type { PaletteItem } from '../palette/componentFactory'

export type ComponentInsertPlacement = 'inside' | 'before' | 'after'

export interface ComponentInsertTarget {
  placement: ComponentInsertPlacement
  screenId: EntityId
  parentId: EntityId
  position: number
}

export interface MenuPoint {
  x: number
  y: number
}

export interface MenuSize {
  width: number
  height: number
}

const PALETTE_PROBE: EditorDragData = {
  type: 'palette',
  kind: 'text',
  label: '',
}

function validTarget(
  document: ProjectDocument,
  placement: ComponentInsertPlacement,
  screenId: EntityId,
  parentId: EntityId,
  position: number,
): ComponentInsertTarget | null {
  const target: ComponentDropData = {
    type: 'component-drop',
    screenId,
    parentId,
    position,
    label: '',
  }
  return canAcceptDrop(document, PALETTE_PROBE, target)
    ? { placement, screenId, parentId, position }
    : null
}

export function resolveComponentInsertTargets(
  document: ProjectDocument,
  componentId: EntityId,
): ComponentInsertTarget[] {
  const component = getOwnEntity(document.components, componentId)
  if (!component) return []

  const targets: ComponentInsertTarget[] = []
  if (CONTAINER_KINDS.includes(component.kind)) {
    const inside = validTarget(
      document,
      'inside',
      component.screenId,
      component.id,
      component.childIds.length,
    )
    if (inside) targets.push(inside)
  }

  if (component.parentId) {
    const parent = getOwnEntity(document.components, component.parentId)
    const index = parent?.childIds.indexOf(component.id) ?? -1
    if (parent && index >= 0) {
      const before = validTarget(
        document,
        'before',
        component.screenId,
        parent.id,
        index,
      )
      const after = validTarget(
        document,
        'after',
        component.screenId,
        parent.id,
        index + 1,
      )
      if (before) targets.push(before)
      if (after) targets.push(after)
    }
  }

  return targets
}

export function contextMenuPaletteItems(): PaletteItem[] {
  // Modal is an independent screen root, while every context-menu position has a container parent.
  return PALETTE_ITEMS.filter(item => item.kind !== 'modal')
}

export function isComponentMenuKey(key: string, shiftKey: boolean): boolean {
  return key === 'ContextMenu' || (shiftKey && key === 'F10')
}

export function clampContextMenuPosition(
  anchor: MenuPoint,
  menu: MenuSize,
  viewport: MenuSize,
  margin = 8,
): MenuPoint {
  const maxX = Math.max(margin, viewport.width - menu.width - margin)
  const maxY = Math.max(margin, viewport.height - menu.height - margin)
  return {
    x: Math.min(maxX, Math.max(margin, anchor.x)),
    y: Math.min(maxY, Math.max(margin, anchor.y)),
  }
}
