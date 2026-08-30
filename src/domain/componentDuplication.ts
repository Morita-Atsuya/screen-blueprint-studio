import type {
  ComponentSubtreeSnapshot,
  DuplicateComponentCommand,
  PasteComponentCommand,
} from './commands'
import { getOwnEntity } from './entityMap'
import { CONTAINER_KINDS } from './model'
import type { EntityId, ProjectDocument } from './model'
import {
  cloneComponentOverride,
  cloneComponentSubtreeSnapshot,
  cloneScreenComponent,
} from './modelClone'

export interface ComponentPasteTarget {
  destinationComponentId: EntityId
  destinationScreenId: EntityId
  destinationParentId: EntityId
  position: number
}

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

export function createComponentSubtreeSnapshot(
  document: ProjectDocument,
  componentId: EntityId,
): ComponentSubtreeSnapshot | null {
  const sourceIds = duplicableSubtreeIds(document, componentId)
  const root = getOwnEntity(document.components, componentId)
  if (!root || sourceIds.length === 0) return null

  const components = Object.create(null) as ComponentSubtreeSnapshot['components']
  sourceIds.forEach(sourceId => {
    const component = getOwnEntity(document.components, sourceId)
    if (component) components[sourceId] = cloneScreenComponent(component)
  })
  const stateOverrides = Object.create(null) as ComponentSubtreeSnapshot['stateOverrides']
  Object.values(document.screenStates)
    .filter(state => state.screenId === root.screenId)
    .forEach(state => {
      const overrides = Object.create(null) as Record<EntityId, typeof state.componentOverrides[string]>
      sourceIds.forEach(sourceId => {
        const override = getOwnEntity(state.componentOverrides, sourceId)
        if (override) overrides[sourceId] = cloneComponentOverride(override)
      })
      if (Object.keys(overrides).length > 0) stateOverrides[state.id] = overrides
    })

  return {
    projectId: document.project.id,
    sourceScreenId: root.screenId,
    rootComponentId: root.id,
    components,
    stateOverrides,
  }
}

export function resolveComponentPasteTarget(
  document: ProjectDocument,
  destinationComponentId: EntityId,
): ComponentPasteTarget | null {
  const destination = getOwnEntity(document.components, destinationComponentId)
  if (!destination) return null
  if (CONTAINER_KINDS.includes(destination.kind)) {
    return {
      destinationComponentId,
      destinationScreenId: destination.screenId,
      destinationParentId: destination.id,
      position: destination.childIds.length,
    }
  }
  if (!destination.parentId) return null
  const parent = getOwnEntity(document.components, destination.parentId)
  const position = parent?.childIds.indexOf(destination.id) ?? -1
  if (
    !parent ||
    parent.screenId !== destination.screenId ||
    !CONTAINER_KINDS.includes(parent.kind) ||
    position < 0
  ) {
    return null
  }
  return {
    destinationComponentId,
    destinationScreenId: destination.screenId,
    destinationParentId: parent.id,
    position: position + 1,
  }
}

export function canPasteComponent(
  document: ProjectDocument,
  snapshot: ComponentSubtreeSnapshot | null,
  destinationComponentId: EntityId,
): boolean {
  if (!snapshot || snapshot.projectId !== document.project.id) return false
  const root = getOwnEntity(snapshot.components, snapshot.rootComponentId)
  if (!root || root.kind === 'page' || root.kind === 'modal') return false
  const target = resolveComponentPasteTarget(document, destinationComponentId)
  if (!target) return false
  if (snapshot.sourceScreenId === target.destinationScreenId) {
    return Object.keys(snapshot.stateOverrides).every(stateId =>
      getOwnEntity(document.screenStates, stateId)?.screenId === target.destinationScreenId
    )
  }
  return true
}

export function createPasteComponentCommand(
  document: ProjectDocument,
  snapshot: ComponentSubtreeSnapshot,
  destinationComponentId: EntityId,
  createId: () => EntityId,
): PasteComponentCommand | null {
  if (!canPasteComponent(document, snapshot, destinationComponentId)) return null
  const target = resolveComponentPasteTarget(document, destinationComponentId)
  if (!target) return null

  const componentIdMap = Object.create(null) as Record<EntityId, EntityId>
  Object.keys(snapshot.components).forEach(sourceId => {
    componentIdMap[sourceId] = createId()
  })
  return {
    type: 'pasteComponent',
    snapshot: cloneComponentSubtreeSnapshot(snapshot),
    ...target,
    componentIdMap,
  }
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
