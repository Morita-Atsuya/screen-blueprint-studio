import { getOwnEntity } from '../../domain/entityMap'
import type { EntityId, ProjectDocument, Screen } from '../../domain/model'

export type TreeKeyboardIntent =
  | { type: 'focus'; componentId: EntityId }
  | { type: 'expand'; componentId: EntityId }
  | { type: 'collapse'; componentId: EntityId }
  | { type: 'select'; componentId: EntityId }

export function getVisibleTreeItemIds(
  document: ProjectDocument,
  screen: Screen,
  collapsedIds: ReadonlySet<EntityId>,
): EntityId[] {
  const visibleIds: EntityId[] = []
  const visited = new Set<EntityId>()

  function visit(componentId: EntityId) {
    if (visited.has(componentId)) return
    visited.add(componentId)
    const component = getOwnEntity(document.components, componentId)
    if (!component || component.screenId !== screen.id) return
    visibleIds.push(component.id)
    if (collapsedIds.has(component.id)) return
    component.childIds.forEach(visit)
  }

  visit(screen.rootComponentId)
  screen.modalComponentIds.forEach(visit)
  return visibleIds
}

export function resolveTreeKeyboardIntent({
  key,
  componentId,
  visibleIds,
  document,
  collapsedIds,
}: {
  key: string
  componentId: EntityId
  visibleIds: readonly EntityId[]
  document: ProjectDocument
  collapsedIds: ReadonlySet<EntityId>
}): TreeKeyboardIntent | null {
  const currentIndex = visibleIds.indexOf(componentId)
  const component = getOwnEntity(document.components, componentId)
  if (currentIndex < 0 || !component) return null

  switch (key) {
    case 'ArrowDown':
      return currentIndex < visibleIds.length - 1
        ? { type: 'focus', componentId: visibleIds[currentIndex + 1] }
        : null
    case 'ArrowUp':
      return currentIndex > 0
        ? { type: 'focus', componentId: visibleIds[currentIndex - 1] }
        : null
    case 'Home':
      return visibleIds.length > 0
        ? { type: 'focus', componentId: visibleIds[0] }
        : null
    case 'End':
      return visibleIds.length > 0
        ? { type: 'focus', componentId: visibleIds[visibleIds.length - 1] }
        : null
    case 'ArrowRight':
      if (component.childIds.length === 0) return null
      return collapsedIds.has(component.id)
        ? { type: 'expand', componentId: component.id }
        : { type: 'focus', componentId: component.childIds[0] }
    case 'ArrowLeft':
      if (component.childIds.length > 0 && !collapsedIds.has(component.id)) {
        return { type: 'collapse', componentId: component.id }
      }
      return component.parentId
        ? { type: 'focus', componentId: component.parentId }
        : null
    case 'Enter':
    case ' ':
      return { type: 'select', componentId: component.id }
    default:
      return null
  }
}
