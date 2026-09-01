import type { ChangeSet } from './collaboration'
import { replayChangeSetOperations } from './changeSetReplay'
import { getOwnEntity } from './entityMap'
import type {
  EntityId,
  ProjectDocument,
  ScreenComponent,
} from './model'
import {
  isComponentTargetRef,
  targetRootScreenComponentId,
} from './componentTargets'

export type ComponentChangeStatus = 'added' | 'modified'

export interface RemovedComponentChange {
  componentId: EntityId
  screenId: EntityId
  parentId: EntityId | null
}

export interface ChangeSetComponentChanges {
  statuses: ReadonlyMap<EntityId, ComponentChangeStatus>
  removedComponents: RemovedComponentChange[]
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  return value
}

function canonicalValue(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function componentPosition(
  document: ProjectDocument,
  component: ScreenComponent,
): { context: 'child' | 'page' | 'modal' | 'detached'; index: number } {
  if (component.parentId) {
    const parent = getOwnEntity(document.components, component.parentId)
    return {
      context: 'child',
      index: parent ? (parent.childIds as readonly string[]).indexOf(component.id) : -1,
    }
  }
  const screen = getOwnEntity(document.screens, component.screenId)
  if (screen?.rootComponentId === component.id) return { context: 'page', index: 0 }
  const modalIndex = screen?.modalComponentIds.indexOf(component.id) ?? -1
  return modalIndex >= 0
    ? { context: 'modal', index: modalIndex }
    : { context: 'detached', index: -1 }
}

function componentOverrides(document: ProjectDocument, component: ScreenComponent) {
  return Object.values(document.screenScenarios)
    .filter(scenario =>
      scenario.screenId === component.screenId &&
      scenario.componentOverrides.some(entry => targetRootScreenComponentId(entry.target) === component.id)
    )
    .map(scenario => ({
      stateId: scenario.id,
      override: scenario.componentOverrides
        .filter(entry => targetRootScreenComponentId(entry.target) === component.id)
        .map(entry => ({ target: entry.target, override: entry.override })),
    }))
    .sort((left, right) => left.stateId.localeCompare(right.stateId))
}

function componentEventRelations(document: ProjectDocument, componentId: EntityId) {
  const triggered = Object.values(document.events)
    .filter(event => targetRootScreenComponentId(event.trigger.target) === componentId)
    .sort((left, right) => left.id.localeCompare(right.id))
  return { triggered }
}

function componentApiBindings(document: ProjectDocument, componentId: EntityId) {
  return Object.values(document.apiOperations)
    .flatMap(operation =>
      operation.requestBindings.flatMap((binding, index) =>
        isComponentTargetRef(binding.source) &&
        targetRootScreenComponentId(binding.source) === componentId
          ? [{
              operationId: operation.id,
              bindingIndex: index,
              targetPath: binding.targetPath,
            }]
          : []
      ),
    )
    .sort((left, right) =>
      left.operationId.localeCompare(right.operationId) ||
      left.bindingIndex - right.bindingIndex,
    )
}

function componentProjection(document: ProjectDocument, component: ScreenComponent) {
  return {
    component,
    position: componentPosition(document, component),
    stateOverrides: componentOverrides(document, component),
    eventRelations: componentEventRelations(document, component.id),
    apiBindings: componentApiBindings(document, component.id),
  }
}

function componentOrder(document: ProjectDocument): Map<EntityId, number> {
  const order = new Map<EntityId, number>()
  const visited = new Set<EntityId>()
  let index = 0

  function visit(componentId: EntityId): void {
    if (visited.has(componentId)) return
    visited.add(componentId)
    const component = getOwnEntity(document.components, componentId)
    if (!component) return
    order.set(component.id, index++)
    component.childIds.forEach(visit)
  }

  document.project.screenIds.forEach(screenId => {
    const screen = getOwnEntity(document.screens, screenId)
    if (!screen) return
    visit(screen.rootComponentId)
    screen.modalComponentIds.forEach(visit)
  })
  Object.keys(document.components).sort().forEach(visit)
  return order
}

export function compareComponentChanges(
  baseDocument: ProjectDocument,
  previewDocument: ProjectDocument,
): ChangeSetComponentChanges {
  const statuses = new Map<EntityId, ComponentChangeStatus>()
  const removedComponents: RemovedComponentChange[] = []
  const componentIds = new Set([
    ...Object.keys(baseDocument.components),
    ...Object.keys(previewDocument.components),
  ])

  for (const componentId of componentIds) {
    const before = getOwnEntity(baseDocument.components, componentId)
    const after = getOwnEntity(previewDocument.components, componentId)
    if (!before && after) {
      statuses.set(componentId, 'added')
      continue
    }
    if (before && !after) {
      removedComponents.push({
        componentId: before.id,
        screenId: before.screenId,
        parentId: before.parentId,
      })
      continue
    }
    if (
      before &&
      after &&
      canonicalValue(componentProjection(baseDocument, before)) !==
        canonicalValue(componentProjection(previewDocument, after))
    ) {
      statuses.set(componentId, 'modified')
    }
  }

  const baseOrder = componentOrder(baseDocument)
  removedComponents.sort((left, right) =>
    (baseOrder.get(left.componentId) ?? Number.MAX_SAFE_INTEGER) -
      (baseOrder.get(right.componentId) ?? Number.MAX_SAFE_INTEGER) ||
    left.componentId.localeCompare(right.componentId),
  )

  return { statuses, removedComponents }
}

export function getChangeSetComponentChanges(
  changeSet: ChangeSet,
): ChangeSetComponentChanges {
  return compareComponentChanges(
    changeSet.baseDocument,
    replayChangeSetOperations(changeSet.baseDocument, changeSet.operations),
  )
}
