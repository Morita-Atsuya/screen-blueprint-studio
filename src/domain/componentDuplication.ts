import type {
  ComponentSubtreeSnapshot,
  DuplicateComponentCommand,
  PasteComponentCommand,
} from './commands'
import { getOwnEntity } from './entityMap'
import {
  CONTAINER_KINDS,
  isInlineScreenComponent,
  type ComponentLayout,
  type EntityId,
  type ProjectDocument,
} from './model'
import { validateSizingContext } from './componentSizing'
import {
  cloneComponentSubtreeSnapshot,
  cloneScreenComponent,
} from './modelClone'
import {
  cloneFieldBinding,
  cloneEventAction,
  cloneEventTrigger,
  cloneScreenScenario,
} from './modelClone'
import {
  isComponentTargetRef,
  targetRootScreenComponentId,
} from './componentTargets'

export interface ComponentPasteTarget {
  destinationComponentId: EntityId
  destinationScreenId: EntityId
  destinationParentId: EntityId
  position: number
}

function screenSubtreeIds(
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

function collectSnapshotDependencies(
  document: ProjectDocument,
  sourceIds: readonly EntityId[],
  sourceScreenId: EntityId,
): Pick<ComponentSubtreeSnapshot, 'scenarioOverrides' | 'events' | 'apiOperations'> | null {
  const sourceIdSet = new Set(sourceIds)
  const scenarioOverrides = Object.create(null) as ComponentSubtreeSnapshot['scenarioOverrides']
  for (const scenario of Object.values(document.screenScenarios)) {
    if (scenario.screenId !== sourceScreenId) continue
    const matching = scenario.componentOverrides.filter(entry =>
      sourceIdSet.has(targetRootScreenComponentId(entry.target)),
    )
    if (matching.length > 0) {
      scenarioOverrides[scenario.id] = cloneScreenScenario({
        ...scenario,
        componentOverrides: matching,
      }).componentOverrides
    }
  }

  const events = Object.create(null) as ComponentSubtreeSnapshot['events']
  const copiedEventIds = new Set<EntityId>()
  for (const event of Object.values(document.events)) {
    if (event.screenId !== sourceScreenId) continue
    if (!sourceIdSet.has(targetRootScreenComponentId(event.trigger.target))) continue
    events[event.id] = {
      ...event,
      trigger: cloneEventTrigger(event.trigger),
      actions: event.actions.map(cloneEventAction),
    }
    copiedEventIds.add(event.id)
  }

  for (const componentId of sourceIds) {
    const component = getOwnEntity(document.components, componentId)
    if (
      component &&
      isInlineScreenComponent(component) &&
      component.config.kind === 'button' &&
      component.config.eventId !== null &&
      !copiedEventIds.has(component.config.eventId)
    ) {
      return null
    }
  }

  const apiOperations = Object.create(null) as ComponentSubtreeSnapshot['apiOperations']
  const collectionApiOperationIds = new Set(
    sourceIds.flatMap(componentId => {
      const component = getOwnEntity(document.components, componentId)
      return component?.nodeType === 'inline' &&
        component.config.kind === 'collection' &&
        component.config.dataSource.apiOperationId !== null
        ? [component.config.dataSource.apiOperationId]
        : []
    }),
  )
  for (const operation of Object.values(document.apiOperations)) {
    if (operation.screenId !== sourceScreenId) continue
    const componentBindings = operation.requestBindings.filter(binding =>
      isComponentTargetRef(binding.source))
    const matchedBindings = operation.requestBindings.filter(binding =>
      isComponentTargetRef(binding.source) &&
      sourceIdSet.has(targetRootScreenComponentId(binding.source)),
    )
    const referencedByCopiedEvent = Object.values(events).some(event =>
      event.actions.some(action => action.type === 'callApi' && action.apiOperationId === operation.id),
    )
    const referencedByCollection = collectionApiOperationIds.has(operation.id)
    if (matchedBindings.length === 0 && !referencedByCopiedEvent && !referencedByCollection) continue
    if (matchedBindings.length !== componentBindings.length) return null
    apiOperations[operation.id] = {
      ...operation,
      requestBindings: operation.requestBindings.map(cloneFieldBinding),
    }
  }

  for (const event of Object.values(events)) {
    for (const action of event.actions) {
      if (action.type === 'callApi' && !Object.prototype.hasOwnProperty.call(apiOperations, action.apiOperationId)) {
        return null
      }
    }
  }

  return { scenarioOverrides, events, apiOperations }
}

export function duplicableSubtreeIds(
  document: ProjectDocument,
  componentId: EntityId,
): EntityId[] {
  return screenSubtreeIds(document, componentId)
}

export function canDuplicateComponent(
  document: ProjectDocument,
  componentId: EntityId,
): boolean {
  const component = getOwnEntity(document.components, componentId)
  if (!component?.parentId) return false
  const parent = getOwnEntity(document.components, component.parentId)
  return Boolean(
    parent &&
    isInlineScreenComponent(parent) &&
    parent.childIds.includes(component.id) &&
    createComponentSubtreeSnapshot(document, componentId),
  )
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
  const dependencies = collectSnapshotDependencies(document, sourceIds, root.screenId)
  if (!dependencies) return null
  return {
    projectId: document.project.id,
    sourceScreenId: root.screenId,
    rootComponentId: root.id,
    components,
    scenarioOverrides: dependencies.scenarioOverrides,
    events: dependencies.events,
    apiOperations: dependencies.apiOperations,
  }
}

export function resolveComponentPasteTarget(
  document: ProjectDocument,
  destinationComponentId: EntityId,
): ComponentPasteTarget | null {
  const destination = getOwnEntity(document.components, destinationComponentId)
  if (!destination) return null
  if (isInlineScreenComponent(destination) && CONTAINER_KINDS.includes(destination.kind)) {
    return {
      destinationComponentId,
      destinationScreenId: destination.screenId,
      destinationParentId: destination.id,
      position: destination.childIds.length,
    }
  }
  if (!destination.parentId) return null
  const parent = getOwnEntity(document.components, destination.parentId)
  const position = parent && isInlineScreenComponent(parent) ? parent.childIds.indexOf(destination.id) : -1
  if (
    !parent ||
    parent.screenId !== destination.screenId ||
    !isInlineScreenComponent(parent) ||
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

function crossScreenDependenciesPresent(snapshot: ComponentSubtreeSnapshot): boolean {
  return (
    Object.keys(snapshot.scenarioOverrides).length > 0 ||
    Object.keys(snapshot.events).length > 0 ||
    Object.keys(snapshot.apiOperations).length > 0
  )
}

export function canPasteComponent(
  document: ProjectDocument,
  snapshot: ComponentSubtreeSnapshot | null,
  destinationComponentId: EntityId,
): boolean {
  if (!snapshot || snapshot.projectId !== document.project.id) return false
  const root = getOwnEntity(snapshot.components, snapshot.rootComponentId)
  if (!root) return false
  const target = resolveComponentPasteTarget(document, destinationComponentId)
  if (!target) return false
  const destinationParent = getOwnEntity(document.components, target.destinationParentId)
  if (!destinationParent || !isInlineScreenComponent(destinationParent)) return false
  try {
    validateSizingContext(
      root.sizing,
      root.placement,
      destinationParent.config as ComponentLayout,
      `Component ${root.id} sizing`,
    )
  } catch {
    return false
  }
  if (snapshot.sourceScreenId !== target.destinationScreenId) {
    return !crossScreenDependenciesPresent(snapshot)
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
  const eventIdMap = Object.create(null) as Record<EntityId, EntityId>
  Object.keys(snapshot.events).forEach(sourceId => {
    eventIdMap[sourceId] = createId()
  })
  const apiOperationIdMap = Object.create(null) as Record<EntityId, EntityId>
  Object.keys(snapshot.apiOperations).forEach(sourceId => {
    apiOperationIdMap[sourceId] = createId()
  })

  return {
    type: 'pasteComponent',
    snapshot: cloneComponentSubtreeSnapshot(snapshot),
    ...target,
    componentIdMap,
    eventIdMap,
    apiOperationIdMap,
  }
}

export function createDuplicateComponentCommand(
  document: ProjectDocument,
  componentId: EntityId,
  createId: () => EntityId,
): DuplicateComponentCommand | null {
  const snapshot = createComponentSubtreeSnapshot(document, componentId)
  if (!snapshot) return null
  const componentIdMap = Object.create(null) as Record<EntityId, EntityId>
  Object.keys(snapshot.components).forEach(sourceId => {
    componentIdMap[sourceId] = createId()
  })
  const eventIdMap = Object.create(null) as Record<EntityId, EntityId>
  Object.keys(snapshot.events).forEach(sourceId => {
    eventIdMap[sourceId] = createId()
  })
  const apiOperationIdMap = Object.create(null) as Record<EntityId, EntityId>
  Object.keys(snapshot.apiOperations).forEach(sourceId => {
    apiOperationIdMap[sourceId] = createId()
  })
  return {
    type: 'duplicateComponent',
    componentId: snapshot.rootComponentId,
    componentIdMap,
    eventIdMap,
    apiOperationIdMap,
  }
}
