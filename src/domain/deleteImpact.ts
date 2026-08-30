import type { DomainCommand } from './commands'
import type { EntityId, ProjectDocument } from './model'
import { applyCommandWithoutRevision } from './applyCommand'
import { getOwnEntity } from './entityMap'

export type DeleteCommand = Extract<
  DomainCommand,
  {
    type:
      | 'removeScreen'
      | 'removeComponent'
      | 'removeScreenState'
      | 'removeEvent'
      | 'removeApiOperation'
  }
>

export type DeleteTargetKind = 'screen' | 'component' | 'state' | 'event' | 'api'

export interface DeleteImpactCounts {
  components: number
  states: number
  events: number
  eventActions: number
  apiOperations: number
  apiBindings: number
  stateOverrides: number
  buttonEventConnections: number
  apiStateConnections: number
}

export interface DeleteImpactAnalysis {
  command: DeleteCommand
  target: {
    kind: DeleteTargetKind
    id: EntityId
  }
  counts: DeleteImpactCounts
  changedReferenceEntities: number
  requiresConfirmation: boolean
  fingerprint: string
}

interface EntityChanges {
  removedIds: EntityId[]
  changedIds: EntityId[]
}

export function isDeleteCommand(command: DomainCommand): command is DeleteCommand {
  return (
    command.type === 'removeScreen' ||
    command.type === 'removeComponent' ||
    command.type === 'removeScreenState' ||
    command.type === 'removeEvent' ||
    command.type === 'removeApiOperation'
  )
}

export function analyzeDeleteImpact(
  document: ProjectDocument,
  command: DeleteCommand,
): DeleteImpactAnalysis {
  const after = applyCommandWithoutRevision(document, command)
  return summarizeDeleteImpact(document, after, command)
}

export function summarizeDeleteImpact(
  before: ProjectDocument,
  after: ProjectDocument,
  command: DeleteCommand,
): DeleteImpactAnalysis {
  const componentChanges = entityChanges(before.components, after.components)
  const stateChanges = entityChanges(before.screenStates, after.screenStates)
  const eventChanges = entityChanges(before.events, after.events)
  const apiChanges = entityChanges(before.apiOperations, after.apiOperations)
  const target = deleteTarget(command)
  const counts: DeleteImpactCounts = {
    components: componentChanges.removedIds.length,
    states: stateChanges.removedIds.length,
    events: eventChanges.removedIds.length,
    eventActions: Math.max(0, countEventActions(before) - countEventActions(after)),
    apiOperations: apiChanges.removedIds.length,
    apiBindings: Math.max(0, countApiBindings(before) - countApiBindings(after)),
    stateOverrides: Math.max(0, countStateOverrides(before) - countStateOverrides(after)),
    buttonEventConnections: countClearedButtonEventConnections(before, after),
    apiStateConnections: countClearedApiStateConnections(before, after),
  }
  const changedReferenceEntities =
    componentChanges.changedIds.length +
    stateChanges.changedIds.length +
    eventChanges.changedIds.length +
    apiChanges.changedIds.length

  const primaryRemovalCount = (
    target.kind === 'component' ? counts.components
      : target.kind === 'state' ? counts.states
        : target.kind === 'event' ? counts.events
          : target.kind === 'api' ? counts.apiOperations
            : 0
  )
  const secondaryRemovalCount =
    counts.components +
    counts.states +
    counts.events +
    counts.apiOperations -
    Math.min(1, primaryRemovalCount)
  const nestedOrReferenceCount =
    counts.eventActions +
    counts.apiBindings +
    counts.stateOverrides +
    counts.buttonEventConnections +
    counts.apiStateConnections

  return {
    command,
    target,
    counts,
    changedReferenceEntities,
    requiresConfirmation: secondaryRemovalCount + nestedOrReferenceCount > 0,
    fingerprint: stableStringify({
      target,
      removed: {
        components: removedSnapshots(before.components, componentChanges.removedIds),
        states: removedSnapshots(before.screenStates, stateChanges.removedIds),
        events: removedSnapshots(before.events, eventChanges.removedIds),
        apiOperations: removedSnapshots(before.apiOperations, apiChanges.removedIds),
      },
      changed: {
        components: changedSnapshots(before.components, after.components, componentChanges.changedIds),
        states: changedSnapshots(before.screenStates, after.screenStates, stateChanges.changedIds),
        events: changedSnapshots(before.events, after.events, eventChanges.changedIds),
        apiOperations: changedSnapshots(before.apiOperations, after.apiOperations, apiChanges.changedIds),
      },
    }),
  }
}

function deleteTarget(command: DeleteCommand): DeleteImpactAnalysis['target'] {
  switch (command.type) {
    case 'removeScreen':
      return { kind: 'screen', id: command.screenId }
    case 'removeComponent':
      return { kind: 'component', id: command.componentId }
    case 'removeScreenState':
      return { kind: 'state', id: command.stateId }
    case 'removeEvent':
      return { kind: 'event', id: command.eventId }
    case 'removeApiOperation':
      return { kind: 'api', id: command.operationId }
  }
}

function entityChanges<T>(
  before: Record<EntityId, T>,
  after: Record<EntityId, T>,
): EntityChanges {
  const removedIds: EntityId[] = []
  const changedIds: EntityId[] = []
  for (const id of Object.keys(before).sort()) {
    const beforeEntity = getOwnEntity(before, id)
    const afterEntity = getOwnEntity(after, id)
    if (!afterEntity) {
      removedIds.push(id)
    } else if (stableStringify(beforeEntity) !== stableStringify(afterEntity)) {
      changedIds.push(id)
    }
  }
  return { removedIds, changedIds }
}

function removedSnapshots<T>(
  before: Record<EntityId, T>,
  ids: EntityId[],
): Array<[EntityId, T | undefined]> {
  return ids.map(id => [id, getOwnEntity(before, id)])
}

function changedSnapshots<T>(
  before: Record<EntityId, T>,
  after: Record<EntityId, T>,
  ids: EntityId[],
): Array<[EntityId, T | undefined, T | undefined]> {
  return ids.map(id => [id, getOwnEntity(before, id), getOwnEntity(after, id)])
}

function countEventActions(document: ProjectDocument): number {
  return Object.values(document.events).reduce((count, event) => count + event.actions.length, 0)
}

function countApiBindings(document: ProjectDocument): number {
  return Object.values(document.apiOperations).reduce(
    (count, operation) => count + operation.requestBindings.length,
    0,
  )
}

function countStateOverrides(document: ProjectDocument): number {
  return Object.values(document.screenStates).reduce(
    (count, state) => count + Object.keys(state.componentOverrides).length,
    0,
  )
}

function countClearedButtonEventConnections(
  before: ProjectDocument,
  after: ProjectDocument,
): number {
  return Object.values(before.components).filter(component => {
    const afterComponent = getOwnEntity(after.components, component.id)
    return (
      component.config.kind === 'button' &&
      component.config.eventId !== null &&
      afterComponent?.config.kind === 'button' &&
      afterComponent.config.eventId === null
    )
  }).length
}

function countClearedApiStateConnections(
  before: ProjectDocument,
  after: ProjectDocument,
): number {
  return Object.values(before.apiOperations).reduce((count, operation) => {
    const afterOperation = getOwnEntity(after.apiOperations, operation.id)
    if (!afterOperation) {
      return count +
        Number(operation.successStateId !== null) +
        Number(operation.errorStateId !== null)
    }
    return count +
      Number(operation.successStateId !== null && afterOperation.successStateId === null) +
      Number(operation.errorStateId !== null && afterOperation.errorStateId === null)
  }, 0)
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortValue(child)]),
  )
}
