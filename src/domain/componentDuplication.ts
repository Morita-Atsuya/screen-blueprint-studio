import type { DuplicateComponentCommand } from './commands'
import { getOwnEntity } from './entityMap'
import type { EntityId, ProjectDocument } from './model'

export function duplicableSubtreeIds(
  document: ProjectDocument,
  componentId: EntityId,
): EntityId[] {
  const root = getOwnEntity(document.components, componentId)
  if (!root?.parentId) return []
  const screenId = root.screenId

  const result: EntityId[] = []
  const visited = new Set<EntityId>()
  function visit(id: EntityId): void {
    if (visited.has(id)) return
    visited.add(id)
    const component = getOwnEntity(document.components, id)
    if (!component || component.screenId !== screenId) return
    result.push(id)
    component.childIds.forEach(visit)
  }
  visit(componentId)
  return result
}

export function canDuplicateComponent(
  document: ProjectDocument,
  componentId: EntityId,
): boolean {
  const component = getOwnEntity(document.components, componentId)
  if (!component?.parentId) return false
  const parent = getOwnEntity(document.components, component.parentId)
  return Boolean(parent?.childIds.includes(component.id))
}

export function createDuplicateComponentCommand(
  document: ProjectDocument,
  componentId: EntityId,
  createId: () => EntityId,
): DuplicateComponentCommand | null {
  const sourceIds = duplicableSubtreeIds(document, componentId)
  if (sourceIds.length === 0) return null

  const componentIdMap = Object.create(null) as Record<EntityId, EntityId>
  sourceIds.forEach(sourceId => {
    componentIdMap[sourceId] = createId()
  })
  return { type: 'duplicateComponent', componentId, componentIdMap }
}
