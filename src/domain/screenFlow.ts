import { getComponentDisplayLabel } from './componentDisplayLabel'
import { getOwnEntity } from './entityMap'
import { targetRootScreenComponentId } from './componentTargets'
import type {
  EntityId,
  ProjectDocument,
  Screen,
  ScreenEvent,
} from './model'
import type { Locale } from '../i18n/messages'

export type ScreenFlowChangeStatus = 'added' | 'modified' | 'removed'

export interface ScreenFlowEndpoint {
  screenId: EntityId
  name: string | null
  route: string | null
  resolved: boolean
}

export interface ScreenFlowNode extends ScreenFlowEndpoint {
  order: number
  exists: boolean
  changeStatus: ScreenFlowChangeStatus | null
}

export interface ScreenFlowTransitionSnapshot {
  id: string
  source: ScreenFlowEndpoint
  target: ScreenFlowEndpoint
  eventId: EntityId
  eventName: string
  eventOrder: number
  triggerComponentId: EntityId
  triggerLabel: string
  triggerResolved: boolean
  actionIndex: number
}

export interface ScreenFlowTransition extends ScreenFlowTransitionSnapshot {
  exists: boolean
  changeStatus: ScreenFlowChangeStatus | null
  previous: ScreenFlowTransitionSnapshot | null
}

export interface ScreenFlowEdge {
  id: string
  source: ScreenFlowEndpoint
  target: ScreenFlowEndpoint
  transitions: ScreenFlowTransition[]
  changeStatus: ScreenFlowChangeStatus | null
  selfLoop: boolean
}

export interface ScreenFlowProjection {
  nodes: ScreenFlowNode[]
  edges: ScreenFlowEdge[]
}

function endpoint(document: ProjectDocument, screenId: EntityId): ScreenFlowEndpoint {
  const screen = getOwnEntity(document.screens, screenId)
  return screen
    ? {
        screenId: screen.id,
        name: screen.name,
        route: screen.route,
        resolved: true,
      }
    : {
        screenId,
        name: null,
        route: null,
        resolved: false,
      }
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(stableValue))
  if (value && typeof value === 'object') {
    return JSON.stringify(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return JSON.stringify(value) ?? 'undefined'
}

function eventOrder(
  document: ProjectDocument,
  screen: Screen | undefined,
  event: ScreenEvent,
): number {
  const listedIndex = screen?.eventIds.indexOf(event.id) ?? -1
  if (listedIndex >= 0) return listedIndex
  return document.project.screenIds.length + Object.keys(document.events)
    .sort()
    .indexOf(event.id)
}

function transitionSnapshots(
  document: ProjectDocument,
  locale: Locale,
): ScreenFlowTransitionSnapshot[] {
  const screenOrder = new Map(
    document.project.screenIds.map((screenId, index) => [screenId, index]),
  )
  return Object.values(document.events)
    .flatMap(event => {
      const sourceScreen = getOwnEntity(document.screens, event.screenId)
      const triggerComponentId = targetRootScreenComponentId(event.trigger.target)
      const trigger = getOwnEntity(document.components, triggerComponentId)
      return event.actions.flatMap((action, actionIndex) =>
        action.type === 'navigate'
          ? [{
              id: `${event.id}:${actionIndex}`,
              source: endpoint(document, event.screenId),
              target: endpoint(document, action.destinationScreenId),
              eventId: event.id,
              eventName: event.name,
              eventOrder: eventOrder(document, sourceScreen, event),
              triggerComponentId,
              triggerLabel: trigger
                ? getComponentDisplayLabel(trigger, locale)
                : triggerComponentId,
              triggerResolved: Boolean(trigger),
              actionIndex,
            }]
          : [],
      )
    })
    .sort((left, right) =>
      (screenOrder.get(left.source.screenId) ?? Number.MAX_SAFE_INTEGER) -
        (screenOrder.get(right.source.screenId) ?? Number.MAX_SAFE_INTEGER) ||
      left.eventOrder - right.eventOrder ||
      left.actionIndex - right.actionIndex ||
      left.eventId.localeCompare(right.eventId)
    )
}

function nodeOrder(
  document: ProjectDocument,
  baseDocument: ProjectDocument | null,
): EntityId[] {
  const effective = document.project.screenIds.filter(screenId =>
    Boolean(getOwnEntity(document.screens, screenId)),
  )
  if (!baseDocument) return effective
  return [
    ...effective,
    ...baseDocument.project.screenIds.filter(screenId =>
      !effective.includes(screenId) && Boolean(getOwnEntity(baseDocument.screens, screenId)),
    ),
  ]
}

function compareNode(
  before: Screen | undefined,
  after: Screen | undefined,
): ScreenFlowChangeStatus | null {
  if (!before && after) return 'added'
  if (before && !after) return 'removed'
  if (
    before &&
    after &&
    stableValue({ name: before.name, route: before.route }) !==
      stableValue({ name: after.name, route: after.route })
  ) {
    return 'modified'
  }
  return null
}

function compareTransition(
  before: ScreenFlowTransitionSnapshot | undefined,
  after: ScreenFlowTransitionSnapshot | undefined,
): ScreenFlowChangeStatus | null {
  if (!before && after) return 'added'
  if (before && !after) return 'removed'
  if (before && after && stableValue(before) !== stableValue(after)) return 'modified'
  return null
}

function edgeStatus(
  transitions: ScreenFlowTransition[],
): ScreenFlowChangeStatus | null {
  const changed = transitions
    .map(transition => transition.changeStatus)
    .filter((status): status is ScreenFlowChangeStatus => status !== null)
  if (changed.length === 0) return null
  if (changed.length === transitions.length && changed.every(status => status === 'added')) {
    return 'added'
  }
  if (changed.length === transitions.length && changed.every(status => status === 'removed')) {
    return 'removed'
  }
  return 'modified'
}

function transitionFromSnapshots(
  before: ScreenFlowTransitionSnapshot | undefined,
  after: ScreenFlowTransitionSnapshot | undefined,
): ScreenFlowTransition | null {
  const snapshot = after ?? before
  if (!snapshot) return null
  const targetChanged = before &&
    after &&
    stableValue(before.target) !== stableValue(after.target)
  return {
    ...snapshot,
    id: after?.id ?? `${snapshot.id}:removed`,
    exists: Boolean(after),
    changeStatus: compareTransition(before, after),
    previous: targetChanged ? before : null,
  }
}

function mergeTransitionSnapshots(
  beforeTransitions: ScreenFlowTransitionSnapshot[],
  afterTransitions: ScreenFlowTransitionSnapshot[],
  screenOrder: ReadonlyMap<EntityId, number>,
): ScreenFlowTransition[] {
  const eventIds = [
    ...new Set([
      ...afterTransitions.map(transition => transition.eventId),
      ...beforeTransitions.map(transition => transition.eventId),
    ]),
  ]
  const merged: ScreenFlowTransition[] = []

  for (const eventId of eventIds) {
    const before = beforeTransitions.filter(transition => transition.eventId === eventId)
    const after = afterTransitions.filter(transition => transition.eventId === eventId)
    const matchedBefore = new Set<number>()
    const matchedAfter = new Set<number>()

    for (let afterIndex = 0; afterIndex < after.length; afterIndex += 1) {
      const candidate = after[afterIndex]!
      const beforeIndex = before.findIndex((previous, index) =>
        !matchedBefore.has(index) &&
        previous.actionIndex === candidate.actionIndex &&
        previous.target.screenId === candidate.target.screenId,
      )
      if (beforeIndex < 0) continue
      matchedBefore.add(beforeIndex)
      matchedAfter.add(afterIndex)
      const transition = transitionFromSnapshots(before[beforeIndex], candidate)
      if (transition) merged.push(transition)
    }

    for (let afterIndex = 0; afterIndex < after.length; afterIndex += 1) {
      if (matchedAfter.has(afterIndex)) continue
      const candidate = after[afterIndex]!
      const beforeIndex = before.findIndex((previous, index) =>
        !matchedBefore.has(index) &&
        previous.target.screenId === candidate.target.screenId,
      )
      if (beforeIndex < 0) continue
      matchedBefore.add(beforeIndex)
      matchedAfter.add(afterIndex)
      const transition = transitionFromSnapshots(before[beforeIndex], candidate)
      if (transition) merged.push(transition)
    }

    const remainingBefore = before
      .map((transition, index) => ({ transition, index }))
      .filter(candidate => !matchedBefore.has(candidate.index))
    const remainingAfter = after
      .map((transition, index) => ({ transition, index }))
      .filter(candidate => !matchedAfter.has(candidate.index))
    const pairedCount = Math.min(remainingBefore.length, remainingAfter.length)
    for (let index = 0; index < pairedCount; index += 1) {
      const transition = transitionFromSnapshots(
        remainingBefore[index]!.transition,
        remainingAfter[index]!.transition,
      )
      if (transition) merged.push(transition)
    }
    remainingAfter.slice(pairedCount).forEach(candidate => {
      const transition = transitionFromSnapshots(undefined, candidate.transition)
      if (transition) merged.push(transition)
    })
    remainingBefore.slice(pairedCount).forEach(candidate => {
      const transition = transitionFromSnapshots(candidate.transition, undefined)
      if (transition) merged.push(transition)
    })
  }

  return merged.sort((left, right) =>
    (screenOrder.get(left.source.screenId) ?? Number.MAX_SAFE_INTEGER) -
      (screenOrder.get(right.source.screenId) ?? Number.MAX_SAFE_INTEGER) ||
    left.eventOrder - right.eventOrder ||
    left.actionIndex - right.actionIndex ||
    left.id.localeCompare(right.id)
  )
}

export function selectScreenFlow(
  document: ProjectDocument,
  locale: Locale = 'en',
  baseDocument: ProjectDocument | null = null,
): ScreenFlowProjection {
  const nodeIds = nodeOrder(document, baseDocument)
  const nodes = nodeIds.flatMap((screenId, order) => {
    const after = getOwnEntity(document.screens, screenId)
    const before = baseDocument
      ? getOwnEntity(baseDocument.screens, screenId)
      : undefined
    const screen = after ?? before
    const sourceDocument = after ? document : baseDocument
    return screen
      ? [{
          ...endpoint(sourceDocument ?? document, screenId),
          order,
          exists: Boolean(after),
          changeStatus: baseDocument ? compareNode(before, after) : null,
        }]
      : []
  })

  const beforeTransitions = baseDocument
    ? transitionSnapshots(baseDocument, locale)
    : []
  const afterTransitions = transitionSnapshots(document, locale)
  const screenOrder = new Map(nodes.map(node => [node.screenId, node.order]))
  const transitions = baseDocument
    ? mergeTransitionSnapshots(beforeTransitions, afterTransitions, screenOrder)
    : afterTransitions.map(transition => ({
        ...transition,
        exists: true,
        changeStatus: null,
        previous: null,
      }))

  const edgeGroups = new Map<string, ScreenFlowTransition[]>()
  for (const transition of transitions) {
    const edgeId = JSON.stringify([
      transition.source.screenId,
      transition.target.screenId,
    ])
    const group = edgeGroups.get(edgeId) ?? []
    group.push(transition)
    edgeGroups.set(edgeId, group)
  }
  const edges = [...edgeGroups.entries()]
    .map(([id, group]): ScreenFlowEdge => {
      const endpointSnapshot = group.find(transition => transition.exists) ?? group[0]!
      return {
        id,
        source: endpointSnapshot.source,
        target: endpointSnapshot.target,
        transitions: group,
        changeStatus: edgeStatus(group),
        selfLoop: endpointSnapshot.source.screenId === endpointSnapshot.target.screenId,
      }
    })
    .sort((left, right) =>
      (screenOrder.get(left.source.screenId) ?? Number.MAX_SAFE_INTEGER) -
        (screenOrder.get(right.source.screenId) ?? Number.MAX_SAFE_INTEGER) ||
      (screenOrder.get(left.target.screenId) ?? Number.MAX_SAFE_INTEGER) -
        (screenOrder.get(right.target.screenId) ?? Number.MAX_SAFE_INTEGER) ||
      left.id.localeCompare(right.id)
    )

  return { nodes, edges }
}
