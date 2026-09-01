import type {
  ComponentTargetRef,
  ComponentDefinition,
  ComponentDefinitionNode,
  EntityId,
  ProjectDocument,
  ScreenComponent,
} from './model'
import { isInlineDefinitionNode } from './model'
import { resolveComponentDefinitionRefV3 } from './canonicalProjectSpecV3'
import { DomainError } from './errors'
import {
  componentTargetRefKey,
  definitionNodeTargetRef,
  rewriteTargetRef,
  targetRootScreenComponentId,
} from './componentTargets'

export function definitionNodePathKey(nodePath: readonly EntityId[]): string {
  return nodePath.map(segment => encodeURIComponent(segment)).join('/')
}

export function mapGeneratedNodePaths(
  entries: ReadonlyArray<{ nodePath: [EntityId, ...EntityId[]]; componentId: EntityId }>,
): Map<string, EntityId> {
  const mapped = new Map<string, EntityId>()
  for (const entry of entries) {
    const key = definitionNodePathKey(entry.nodePath)
    if (mapped.has(key)) {
      throw new DomainError('INVARIANT_VIOLATION', `Duplicate generated nodePath mapping ${key}`)
    }
    mapped.set(key, entry.componentId)
  }
  return mapped
}

export function buildExtractionTargetRewriteMap(
  componentIdToNodePath: Record<EntityId, [EntityId, ...EntityId[]]>,
  replacementInstanceId: EntityId,
): Map<string, ComponentTargetRef> {
  return new Map(
    Object.entries(componentIdToNodePath).map(([componentId, nodePath]) => [
      componentTargetRefKey({ type: 'inline', componentId }),
      definitionNodeTargetRef(replacementInstanceId, nodePath),
    ]),
  )
}

export function buildDetachTargetRewriteMap(
  instanceId: EntityId,
  generatedComponents: ReadonlyArray<{ nodePath: [EntityId, ...EntityId[]]; componentId: EntityId }>,
): Map<string, ComponentTargetRef> {
  return new Map(
    generatedComponents.map(entry => [
      componentTargetRefKey(definitionNodeTargetRef(instanceId, entry.nodePath)),
      { type: 'inline', componentId: entry.componentId } as ComponentTargetRef,
    ]),
  )
}

export function rewriteScreenTargetRefs(
  document: ProjectDocument,
  screenId: EntityId,
  rewrites: ReadonlyMap<string, ComponentTargetRef>,
): void {
  for (const scenario of Object.values(document.screenScenarios)) {
    if (scenario.screenId !== screenId) continue
    scenario.componentOverrides = scenario.componentOverrides.map(entry => ({
      target: rewriteTargetRef(entry.target, rewrites),
      override: { ...entry.override },
    }))
  }
  for (const event of Object.values(document.events)) {
    if (event.screenId !== screenId) continue
    event.trigger = {
      ...event.trigger,
      target: rewriteTargetRef(event.trigger.target, rewrites),
    }
  }
  for (const operation of Object.values(document.apiOperations)) {
    if (operation.screenId !== screenId) continue
    operation.requestBindings = operation.requestBindings.map(binding => ({
      targetPath: binding.targetPath,
      source: rewriteTargetRef(binding.source, rewrites),
    }))
  }
}

export function collectDefinitionUses(
  document: ProjectDocument,
  definitionId: EntityId,
): {
  screenInstanceIds: EntityId[]
  nestedDefinitionNodeIds: Array<{ definitionId: EntityId; nodeId: EntityId }>
  instancePropValueCount: number
  scenarioOverrideCount: number
  eventTriggerCount: number
  apiBindingCount: number
} {
  const screenInstanceIds = Object.values(document.components).flatMap(component => {
    if (component.nodeType !== 'definitionInstance') return []
    const resolved = resolveComponentDefinitionRefV3(document, component.source.$ref)
    return resolved.id === definitionId ? [component.id] : []
  })
  const nestedDefinitionNodeIds = Object.values(document.componentDefinitions).flatMap(definition =>
    Object.values(definition.nodes).flatMap(node => {
      if (node.nodeType !== 'definitionInstance') return []
      const resolved = resolveComponentDefinitionRefV3(document, node.source.$ref)
      return resolved.id === definitionId ? [{ definitionId: definition.id, nodeId: node.id }] : []
    }),
  )
  const screenInstanceIdSet = new Set(screenInstanceIds)
  const instancePropValueCount = screenInstanceIds.reduce((count, instanceId) => {
    const instance = document.components[instanceId]
    return count + (
      instance?.nodeType === 'definitionInstance' ? Object.keys(instance.props).length : 0
    )
  }, 0)
  const isInstanceTarget = (target: ComponentTargetRef) =>
    screenInstanceIdSet.has(targetRootScreenComponentId(target))
  const scenarioOverrideCount = Object.values(document.screenScenarios).reduce(
    (count, scenario) => count + scenario.componentOverrides.filter(entry =>
      isInstanceTarget(entry.target)).length,
    0,
  )
  const eventTriggerCount = Object.values(document.events).filter(event =>
    isInstanceTarget(event.trigger.target)).length
  const apiBindingCount = Object.values(document.apiOperations).reduce(
    (count, operation) => count + operation.requestBindings.filter(binding =>
      isInstanceTarget(binding.source)).length,
    0,
  )
  return {
    screenInstanceIds,
    nestedDefinitionNodeIds,
    instancePropValueCount,
    scenarioOverrideCount,
    eventTriggerCount,
    apiBindingCount,
  }
}

export function resolveDefinitionInlineNodeAtPath(
  document: ProjectDocument,
  definitionRef: string,
  nodePath: readonly EntityId[],
): Extract<ReturnType<typeof resolveComponentDefinitionRefV3>['nodes'][string], { nodeType: 'inline' }> {
  const definition = resolveComponentDefinitionRefV3(document, definitionRef)
  const root = definition.nodes[definition.rootNodeId]
  if (!root || !isInlineDefinitionNode(root)) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Definition ${definition.id} root must be an inline node`,
    )
  }
  if (nodePath.length === 1 && nodePath[0] === definition.rootNodeId) return root
  if (nodePath[0] === definition.rootNodeId) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Path ${definitionNodePathKey(nodePath)} must omit the current definition root ID except for the root itself`,
    )
  }
  return resolveInlinePath(document, definition, root, nodePath)
}

function resolveInlinePath(
  document: ProjectDocument,
  definition: ComponentDefinition,
  current: Extract<ComponentDefinitionNode, { nodeType: 'inline' }>,
  remaining: readonly EntityId[],
): Extract<ReturnType<typeof resolveComponentDefinitionRefV3>['nodes'][string], { nodeType: 'inline' }> {
  const [segment, ...rest] = remaining
  if (!segment || !current.childIds.includes(segment)) {
    throw new DomainError('INVARIANT_VIOLATION', `Unknown definition path segment ${segment ?? '(missing)'}`)
  }
  const nextNode = definition.nodes[segment]
  if (!nextNode) {
    throw new DomainError('INVARIANT_VIOLATION', `Missing definition node ${segment}`)
  }
  if (nextNode.nodeType === 'inline') {
    return rest.length === 0 ? nextNode : resolveInlinePath(document, definition, nextNode, rest)
  }
  const nestedDefinition = resolveComponentDefinitionRefV3(document, nextNode.source.$ref)
  const nestedRoot = nestedDefinition.nodes[nestedDefinition.rootNodeId]
  if (!nestedRoot || !isInlineDefinitionNode(nestedRoot)) {
    throw new DomainError('INVARIANT_VIOLATION', `Nested definition ${nestedDefinition.id} root must be inline`)
  }
  if (rest.length === 0 || rest[0] !== nestedDefinition.rootNodeId) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Nested definition path must include ${nestedDefinition.rootNodeId}`,
    )
  }
  return rest.length === 1
    ? nestedRoot
    : resolveInlinePath(document, nestedDefinition, nestedRoot, rest.slice(1))
}

export function targetBelongsToRemovedScreenComponents(
  target: ComponentTargetRef,
  removedIds: ReadonlySet<EntityId>,
): boolean {
  return removedIds.has(targetRootScreenComponentId(target))
}

export function validateDefinitionInstanceParent(
  component: ScreenComponent,
): void {
  if (component.nodeType === 'definitionInstance' && component.childIds.length > 0) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Definition instance ${component.id} must not have child screen nodes`,
    )
  }
}

export function mapTargetIntoCopiedSubtree(
  target: ComponentTargetRef,
  componentIdMap: ReadonlyMap<EntityId, EntityId>,
): ComponentTargetRef {
  if (target.type === 'inline') {
    const mappedId = componentIdMap.get(target.componentId)
    if (!mappedId) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Missing mapped component ID for copied target ${target.componentId}`,
      )
    }
    return { type: 'inline', componentId: mappedId }
  }
  const mappedInstanceId = componentIdMap.get(target.instanceId)
  if (!mappedInstanceId) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Missing mapped definition instance ID for copied target ${target.instanceId}`,
    )
  }
  return {
    type: 'definitionNode',
    instanceId: mappedInstanceId,
    nodePath: [...target.nodePath],
  }
}
