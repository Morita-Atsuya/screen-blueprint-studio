import type {
  ComponentConfig,
  ComponentDefinition,
  EntityId,
  ProjectDocument,
  ScreenComponent,
  ScreenComponentConfig,
} from './model'
import { assertNever } from './assertNever'
import {
  CONTAINER_KINDS,
  DEFAULT_COMPONENT_LAYOUT,
  DEFAULT_COMPONENT_PLACEMENT,
  ROOT_COMPONENT_SIZING,
  isInlineScreenComponent,
} from './model'
import type { ComponentSubtreeSnapshot, DomainCommand } from './commands'
import { DomainError } from './errors'
import { validateInvariants } from './invariants'
import {
  deleteOwnEntity,
  getOwnEntity,
  hasOwnEntity,
  isSafeEntityId,
  setOwnEntity,
} from './entityMap'
import {
  createComponentSubtreeSnapshot,
  resolveComponentPasteTarget,
} from './componentDuplication'
import {
  classifyComponentAdd,
  classifyComponentMove,
  componentPlacementError,
} from './componentPlacement'
import {
  cloneComponentConfig,
  cloneComponentDefinition,
  cloneComponentOverride,
  cloneDomainCommand,
  cloneFieldBinding,
  cloneProjectDocument,
  cloneScreenComponent,
  cloneScreenScenario,
} from './modelClone'
import { isComponentTargetRef } from './componentTargets'
import {
  buildDetachTargetRewriteMap,
  buildExtractionTargetRewriteMap,
  collectDefinitionUses,
  definitionNodePathKey,
  mapGeneratedNodePaths,
  mapTargetIntoCopiedSubtree,
  resolveDefinitionInlineNodeAtPath,
  rewriteScreenTargetRefs,
  targetBelongsToRemovedScreenComponents,
} from './definitionTransactions'
import {
  componentDefinitionRefV3,
} from './canonicalProjectSpecV3'
import { resolveScreenNodes } from './definitionResolver'

function requireExactKeys(
  value: object,
  allowedKeys: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedKeys)
  const unknown = Object.keys(value).filter(key => !allowed.has(key))
  if (unknown.length > 0) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${path} contains unknown fields: ${unknown.join(', ')}`,
    )
  }
}

export function nextRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
    throw new DomainError('INVARIANT_VIOLATION', 'Revision cannot be incremented safely')
  }
  return revision + 1
}

function removeSubtree(componentId: EntityId, doc: ProjectDocument): EntityId[] {
  const removed: EntityId[] = []
  function visit(id: EntityId): void {
    const component = getOwnEntity(doc.components, id)
    if (!component) return
    component.childIds.forEach(visit)
    removed.push(id)
    deleteOwnEntity(doc.components, id)
  }
  visit(componentId)
  return removed
}

function cleanupComponentRefs(removedIds: ReadonlySet<EntityId>, doc: ProjectDocument): void {
  for (const scenario of Object.values(doc.screenScenarios)) {
    scenario.componentOverrides = scenario.componentOverrides
      .filter(entry => !targetBelongsToRemovedScreenComponents(entry.target, removedIds))
      .map(entry => ({ target: structuredClone(entry.target), override: { ...entry.override } }))
  }

  const eventsToRemove = Object.values(doc.events)
    .filter(event => targetBelongsToRemovedScreenComponents(event.trigger.target, removedIds))
    .map(event => event.id)
  for (const eventId of eventsToRemove) {
    const event = getOwnEntity(doc.events, eventId)
    if (!event) continue
    const screen = getOwnEntity(doc.screens, event.screenId)
    if (screen) screen.eventIds = screen.eventIds.filter(candidate => candidate !== eventId)
    deleteOwnEntity(doc.events, eventId)
    for (const component of Object.values(doc.components)) {
      if (
        isInlineScreenComponent(component) &&
        component.config.kind === 'button' &&
        component.config.eventId === eventId
      ) {
        component.config.eventId = null
      }
    }
  }

  for (const operation of Object.values(doc.apiOperations)) {
    const hasCollectionCaller = Object.values(doc.events).some(event =>
      event.trigger.target.type === 'collectionItemNode' &&
      event.actions.some(action =>
        action.type === 'callApi' && action.apiOperationId === operation.id))
    operation.requestBindings = operation.requestBindings
      .filter(binding =>
        (binding.source.type !== 'item' || hasCollectionCaller) &&
        !isComponentTargetRef(binding.source) ||
        (
          isComponentTargetRef(binding.source) &&
          !targetBelongsToRemovedScreenComponents(binding.source, removedIds)
        ))
      .map(cloneFieldBinding)
  }
}

function cleanupScreenApiOps(screenId: EntityId, doc: ProjectDocument): void {
  const removedOperationIds = Object.keys(doc.apiOperations).filter(id =>
    getOwnEntity(doc.apiOperations, id)?.screenId === screenId,
  )
  const removedSet = new Set(removedOperationIds)
  for (const operationId of removedOperationIds) {
    deleteOwnEntity(doc.apiOperations, operationId)
  }
  for (const event of Object.values(doc.events)) {
    event.actions = event.actions.filter(action =>
      action.type !== 'callApi' || !removedSet.has(action.apiOperationId),
    )
  }
}

function cleanupScenarioRefsInApiOps(scenarioId: EntityId, doc: ProjectDocument): void {
  for (const operation of Object.values(doc.apiOperations)) {
    if (operation.successScenarioId === scenarioId) operation.successScenarioId = null
    if (operation.errorScenarioId === scenarioId) operation.errorScenarioId = null
  }
}

function cleanupScenarioRefsInEvents(scenarioId: EntityId, doc: ProjectDocument): void {
  for (const event of Object.values(doc.events)) {
    event.actions = event.actions.filter(action =>
      action.type !== 'setScenario' || action.scenarioId !== scenarioId,
    )
  }
}

function duplicatedFieldKey(sourceKey: string, usedKeys: Set<string>): string {
  const normalized = sourceKey.trim()
  if (!normalized) return ''
  const base = `${normalized}_copy`
  let candidate = base
  let suffix = 2
  while (usedKeys.has(candidate)) {
    candidate = `${base}_${suffix}`
    suffix += 1
  }
  usedKeys.add(candidate)
  return candidate
}

function duplicateComponentConfig(
  config: ScreenComponentConfig,
  usedFieldKeys: Set<string>,
  mappedEventId: EntityId | null,
  mappedApiOperationId: EntityId | null,
): ScreenComponentConfig {
  const copied = cloneComponentConfig(config)
  switch (copied.kind) {
    case 'textInput':
    case 'select':
      return {
        ...copied,
        fieldKey: duplicatedFieldKey(copied.fieldKey, usedFieldKeys),
      }
    case 'button':
      return { ...copied, eventId: mappedEventId }
    case 'collection':
      return {
        ...copied,
        dataSource: {
          ...copied.dataSource,
          apiOperationId: mappedApiOperationId,
        },
      }
    case 'page':
    case 'container':
    case 'text':
    case 'image':
    case 'link':
    case 'modal':
      return copied
    default:
      return assertNever(copied, 'duplicated component config')
  }
}

function screenConfigToDefinitionConfig(
  config: ScreenComponentConfig,
): ComponentDefinition['nodes'][string] extends { config: infer Config } ? Config : never {
  const copied = cloneComponentConfig(config)
  if (copied.kind !== 'button') return copied as never
  const { eventId: _eventId, ...definitionConfig } = copied
  return definitionConfig as never
}

function validatedIdMap(
  existing: Record<string, unknown>,
  sourceIds: readonly EntityId[],
  rawMap: Record<EntityId, EntityId>,
  label: string,
): Map<EntityId, EntityId> {
  if (typeof rawMap !== 'object' || rawMap === null || Array.isArray(rawMap)) {
    throw new DomainError('INVARIANT_VIOLATION', `${label} must be an object`)
  }
  if (
    Object.keys(rawMap).length !== sourceIds.length ||
    sourceIds.some(id => !Object.prototype.hasOwnProperty.call(rawMap, id))
  ) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} must contain the complete source mapping`,
    )
  }
  const mapped = new Map<EntityId, EntityId>()
  for (const sourceId of sourceIds) {
    const targetId = rawMap[sourceId]
    if (!isSafeEntityId(targetId)) {
      throw new DomainError('INVARIANT_VIOLATION', `${label} contains an unsafe target ID`)
    }
    if (Object.prototype.hasOwnProperty.call(existing, targetId)) {
      throw new DomainError('INVARIANT_VIOLATION', `${label} target ${targetId} already exists`)
    }
    mapped.set(sourceId, targetId)
  }
  if (new Set(mapped.values()).size !== mapped.size) {
    throw new DomainError('INVARIANT_VIOLATION', `${label} targets must be unique`)
  }
  return mapped
}

function buildUsedFieldKeys(document: ProjectDocument, screenId: EntityId): Set<string> {
  return new Set(
    Object.values(document.components).flatMap(component => {
      if (!isInlineScreenComponent(component) || component.screenId !== screenId) return []
      const config = component.config
      if (config.kind !== 'textInput' && config.kind !== 'select') return []
      const fieldKey = config.fieldKey.trim()
      return fieldKey ? [fieldKey] : []
    }),
  )
}

function copySnapshotIntoDocument(
  document: ProjectDocument,
  snapshot: ComponentSubtreeSnapshot,
  destinationScreenId: EntityId,
  destinationParentId: EntityId,
  position: number,
  componentIdMap: Record<EntityId, EntityId>,
  eventIdMap: Record<EntityId, EntityId>,
  apiOperationIdMap: Record<EntityId, EntityId>,
  copyScenarioOverrides: boolean,
): EntityId {
  const sourceIds = Object.keys(snapshot.components)
  const mappedComponents = validatedIdMap(document.components, sourceIds, componentIdMap, 'Component ID map')
  const mappedEvents = validatedIdMap(document.events, Object.keys(snapshot.events), eventIdMap, 'Event ID map')
  const mappedApiOperations = validatedIdMap(
    document.apiOperations,
    Object.keys(snapshot.apiOperations),
    apiOperationIdMap,
    'API operation ID map',
  )
  const root = getOwnEntity(snapshot.components, snapshot.rootComponentId)
  const destinationParent = getOwnEntity(document.components, destinationParentId)
  if (!root || !destinationParent || !isInlineScreenComponent(destinationParent)) {
    throw new DomainError('NOT_FOUND', 'Paste destination is unavailable')
  }
  if (
    destinationParent.screenId !== destinationScreenId ||
    !CONTAINER_KINDS.includes(destinationParent.kind) ||
    !Number.isInteger(position) ||
    position < 0 ||
    position > destinationParent.childIds.length
  ) {
    throw new DomainError('INVALID_PARENT', 'Paste destination cannot contain the copied subtree')
  }

  const usedFieldKeys = buildUsedFieldKeys(document, destinationScreenId)
  for (const sourceId of sourceIds) {
    const sourceComponent = getOwnEntity(snapshot.components, sourceId)
    const copiedId = mappedComponents.get(sourceId)
    if (!sourceComponent || !copiedId) {
      throw new DomainError('INVARIANT_VIOLATION', 'Copied component subtree is incomplete')
    }
    const parentId = sourceId === snapshot.rootComponentId
      ? destinationParent.id
      : sourceComponent.parentId
        ? mappedComponents.get(sourceComponent.parentId)
        : undefined
    if (!parentId) {
      throw new DomainError('INVARIANT_VIOLATION', 'Copied component parent is missing')
    }
    if (sourceComponent.nodeType === 'definitionInstance') {
      const cloned = cloneScreenComponent(sourceComponent) as Extract<
        ScreenComponent,
        { nodeType: 'definitionInstance' }
      >
      setOwnEntity(document.components, copiedId, {
        ...cloned,
        id: copiedId,
        screenId: destinationScreenId,
        parentId,
      })
      continue
    }
    const cloned = cloneScreenComponent(sourceComponent) as Extract<
      ScreenComponent,
      { nodeType: 'inline' }
    >
    const mappedEventId = sourceComponent.config.kind === 'button' && sourceComponent.config.eventId !== null
      ? mappedEvents.get(sourceComponent.config.eventId) ?? null
      : null
    const mappedApiOperationId =
      sourceComponent.config.kind === 'collection' &&
      sourceComponent.config.dataSource.apiOperationId !== null
        ? mappedApiOperations.get(sourceComponent.config.dataSource.apiOperationId) ?? null
        : null
    setOwnEntity(document.components, copiedId, {
      ...cloned,
      id: copiedId,
      screenId: destinationScreenId,
      parentId,
      childIds: sourceComponent.childIds.map(childId => {
        const copiedChildId = mappedComponents.get(childId)
        if (!copiedChildId) {
          throw new DomainError('INVARIANT_VIOLATION', 'Copied child mapping is missing')
        }
        return copiedChildId
      }),
      config: duplicateComponentConfig(
        sourceComponent.config,
        usedFieldKeys,
        mappedEventId,
        mappedApiOperationId,
      ),
    })
  }

  const copiedRootId = mappedComponents.get(snapshot.rootComponentId)
  if (!copiedRootId) {
    throw new DomainError('INVARIANT_VIOLATION', 'Copied root component is missing')
  }
  destinationParent.childIds.splice(position, 0, copiedRootId)

  for (const [sourceOperationId, operation] of Object.entries(snapshot.apiOperations)) {
    const copiedId = mappedApiOperations.get(sourceOperationId)
    if (!copiedId) {
      throw new DomainError('INVARIANT_VIOLATION', 'Copied API operation mapping is missing')
    }
    setOwnEntity(document.apiOperations, copiedId, {
      ...operation,
      id: copiedId,
      screenId: destinationScreenId,
      requestBindings: operation.requestBindings.map(binding => ({
        targetPath: binding.targetPath,
        source: isComponentTargetRef(binding.source)
          ? mapTargetIntoCopiedSubtree(binding.source, mappedComponents)
          : { ...binding.source },
      })),
    })
  }

  const destinationScreen = getOwnEntity(document.screens, destinationScreenId)
  if (!destinationScreen) {
    throw new DomainError('NOT_FOUND', `Screen ${destinationScreenId} not found`)
  }
  for (const [sourceEventId, event] of Object.entries(snapshot.events)) {
    const copiedId = mappedEvents.get(sourceEventId)
    if (!copiedId) {
      throw new DomainError('INVARIANT_VIOLATION', 'Copied event mapping is missing')
    }
    setOwnEntity(document.events, copiedId, {
      ...event,
      id: copiedId,
      screenId: destinationScreenId,
      trigger: {
        ...event.trigger,
        target: mapTargetIntoCopiedSubtree(event.trigger.target, mappedComponents),
      },
      actions: event.actions.map(action => {
        switch (action.type) {
          case 'callApi':
            return {
              type: 'callApi' as const,
              apiOperationId: mappedApiOperations.get(action.apiOperationId) ?? action.apiOperationId,
            }
          case 'setScenario':
            return { ...action }
          case 'clearScenario':
            return { type: 'clearScenario' as const }
          case 'navigate':
            return { ...action }
        }
      }),
    })
    destinationScreen.eventIds.push(copiedId)
  }

  if (copyScenarioOverrides) {
    for (const [scenarioId, overrides] of Object.entries(snapshot.scenarioOverrides)) {
      const scenario = getOwnEntity(document.screenScenarios, scenarioId)
      if (!scenario || scenario.screenId !== destinationScreenId) {
        throw new DomainError('INVALID_REFERENCE', `Scenario ${scenarioId} is unavailable`)
      }
      scenario.componentOverrides.push(
        ...overrides.map(entry => ({
          target: mapTargetIntoCopiedSubtree(entry.target, mappedComponents),
          override: cloneComponentOverride(entry.override),
        })),
      )
    }
  }
  return copiedRootId
}

function createInlineButtonEventIndex(document: ProjectDocument, screenId: EntityId): Map<EntityId, EntityId | null> {
  const matches = new Map<EntityId, EntityId[]>()
  for (const event of Object.values(document.events)) {
    if (event.screenId !== screenId || event.trigger.target.type !== 'inline') continue
    const list = matches.get(event.trigger.target.componentId) ?? []
    list.push(event.id)
    matches.set(event.trigger.target.componentId, list)
  }
  return new Map(
    Array.from(matches.entries()).map(([componentId, eventIds]) => [
      componentId,
      eventIds.length === 1 ? eventIds[0]! : null,
    ]),
  )
}

function replaceChildReference(
  parent: Extract<ScreenComponent, { nodeType: 'inline' }>,
  oldId: EntityId,
  newId: EntityId,
): void {
  const index = parent.childIds.indexOf(oldId)
  if (index < 0) {
    throw new DomainError('INVARIANT_VIOLATION', `Parent ${parent.id} does not contain ${oldId}`)
  }
  parent.childIds.splice(index, 1, newId)
}

function collectInlineSubtree(document: ProjectDocument, rootId: EntityId): Extract<ScreenComponent, { nodeType: 'inline' }>[] {
  const result: Extract<ScreenComponent, { nodeType: 'inline' }>[] = []
  const visited = new Set<EntityId>()
  function visit(componentId: EntityId): void {
    if (visited.has(componentId)) return
    visited.add(componentId)
    const component = getOwnEntity(document.components, componentId)
    if (!component || !isInlineScreenComponent(component)) {
      throw new DomainError(
        'INVALID_ARGUMENT',
        `Component ${componentId} must be an inline screen component for extraction`,
      )
    }
    result.push(component)
    component.childIds.forEach(visit)
  }
  visit(rootId)
  return result
}

function validateExtractedDefinition(
  document: ProjectDocument,
  definition: ComponentDefinition,
  sourceComponents: readonly Extract<ScreenComponent, { nodeType: 'inline' }>[],
  componentIdToNodePath: Record<EntityId, [EntityId, ...EntityId[]]>,
): void {
  if (Object.keys(definition.nodes).length !== sourceComponents.length) {
    throw new DomainError(
      'INVALID_ARGUMENT',
      'Extracted definition nodes must correspond exactly to the source subtree',
    )
  }
  if (Object.keys(componentIdToNodePath).length !== sourceComponents.length) {
    throw new DomainError(
      'INVALID_ARGUMENT',
      'componentIdToNodePath must map the complete source subtree',
    )
  }
  const mappedNodeIds = new Set<string>()
  for (const component of sourceComponents) {
    const nodePath = componentIdToNodePath[component.id]
    if (!nodePath) {
      throw new DomainError(
        'INVALID_ARGUMENT',
        `Missing extracted nodePath mapping for component ${component.id}`,
      )
    }
    const targetNode = resolveDefinitionInlineNodeAtPath(
      {
        ...document,
        componentDefinitions: {
          ...document.componentDefinitions,
          [definition.id]: definition,
        },
      },
      componentDefinitionRefV3(definition.id),
      nodePath,
    )
    mappedNodeIds.add(targetNode.id)
    if (targetNode.kind !== component.kind) {
      throw new DomainError(
        'INVALID_ARGUMENT',
        `Mapped definition node ${targetNode.id} must preserve kind ${component.kind}`,
      )
    }
    if (component.id === sourceComponents[0]!.id) {
      if (definition.rootNodeId !== targetNode.id) {
        throw new DomainError(
          'INVALID_ARGUMENT',
          'The extracted root component must map to definition.rootNodeId',
        )
      }
      if (JSON.stringify(targetNode.placement) !== JSON.stringify(DEFAULT_COMPONENT_PLACEMENT)) {
        throw new DomainError(
          'INVALID_ARGUMENT',
          'Extracted definition root placement must be flow',
        )
      }
      if (JSON.stringify(targetNode.sizing) !== JSON.stringify(ROOT_COMPONENT_SIZING)) {
        throw new DomainError(
          'INVALID_ARGUMENT',
          'Extracted definition root sizing must be fixed root sizing',
        )
      }
    } else {
      if (JSON.stringify(targetNode.placement) !== JSON.stringify(component.placement)) {
        throw new DomainError(
          'INVALID_ARGUMENT',
          `Extracted definition node ${targetNode.id} must preserve placement`,
        )
      }
      if (JSON.stringify(targetNode.sizing) !== JSON.stringify(component.sizing)) {
        throw new DomainError(
          'INVALID_ARGUMENT',
          `Extracted definition node ${targetNode.id} must preserve sizing`,
        )
      }
    }
    if (JSON.stringify(targetNode.common) !== JSON.stringify(component.common)) {
      throw new DomainError(
        'INVALID_ARGUMENT',
        `Extracted definition node ${targetNode.id} must preserve common fields`,
      )
    }
    if (
      JSON.stringify(targetNode.config) !==
        JSON.stringify(screenConfigToDefinitionConfig(component.config))
    ) {
      throw new DomainError(
        'INVALID_ARGUMENT',
        `Extracted definition node ${targetNode.id} must preserve allowed config fields`,
      )
    }
  }
  if (mappedNodeIds.size !== sourceComponents.length) {
    throw new DomainError(
      'INVALID_ARGUMENT',
      'Extracted nodePath mappings must resolve to unique definition nodes',
    )
  }
}

function materializeDetachedComponents(
  document: ProjectDocument,
  instance: Extract<ScreenComponent, { nodeType: 'definitionInstance' }>,
  generatedComponents: ReadonlyArray<{ nodePath: [EntityId, ...EntityId[]]; componentId: EntityId }>,
): Extract<ScreenComponent, { nodeType: 'inline' }>[] {
  const resolved = resolveScreenNodes(document, instance.screenId, null)
  const instanceNodes = resolved.orderedNodes.filter(node => node.instanceId === instance.id)
  const generatedByPath = mapGeneratedNodePaths(generatedComponents)
  if (generatedByPath.size !== instanceNodes.length) {
    throw new DomainError(
      'INVALID_ARGUMENT',
      'generatedComponents must contain a complete mapping for the detached instance',
    )
  }
  const mappedRuntimeIds = new Map<string, EntityId>()
  for (const node of instanceNodes) {
    const pathKey = definitionNodePathKey(node.nodePath ?? [])
    const componentId = generatedByPath.get(pathKey)
    if (!componentId) {
      throw new DomainError(
        'INVALID_ARGUMENT',
        `Missing detached component ID for node path ${pathKey}`,
      )
    }
    if (hasOwnEntity(document.components, componentId)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Detached component ID ${componentId} already exists`,
      )
    }
    mappedRuntimeIds.set(node.id, componentId)
  }

  return instanceNodes.map(node => {
    const componentId = mappedRuntimeIds.get(node.id)
    if (!componentId) {
      throw new DomainError('INVARIANT_VIOLATION', `Detached component mapping missing for ${node.id}`)
    }
    const eventIdMap = createInlineButtonEventIndex(document, instance.screenId)
    const config = structuredClone(node.config) as ScreenComponentConfig
    if (config.kind === 'button') {
      config.eventId = eventIdMap.get(componentId) ?? null
    }
    return {
      nodeType: 'inline',
      id: componentId,
      screenId: instance.screenId,
      parentId: node.parentId ? mappedRuntimeIds.get(node.parentId) ?? instance.parentId : instance.parentId,
      childIds: node.childIds.map(childRuntimeId => {
        const childId = mappedRuntimeIds.get(childRuntimeId)
        if (!childId) {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `Detached child mapping missing for ${childRuntimeId}`,
          )
        }
        return childId
      }),
      kind: node.kind,
      placement: structuredClone(node.placement),
      sizing: structuredClone(node.sizing),
      common: structuredClone(node.common),
      config,
    }
  })
}

function applyDetachDefinitionInstance(
  document: ProjectDocument,
  instanceId: EntityId,
  generatedComponents: ReadonlyArray<{ nodePath: [EntityId, ...EntityId[]]; componentId: EntityId }>,
): void {
  const instance = getOwnEntity(document.components, instanceId)
  if (!instance || instance.nodeType !== 'definitionInstance') {
    throw new DomainError('NOT_FOUND', `Definition instance ${instanceId} not found`)
  }
  const parent = instance.parentId ? getOwnEntity(document.components, instance.parentId) : undefined
  if (!parent || !isInlineScreenComponent(parent)) {
    throw new DomainError(
      'INVALID_ARGUMENT',
      'Detaching a root-level definition instance is not supported',
    )
  }
  const detached = materializeDetachedComponents(document, instance, generatedComponents)
  const rootComponent = detached.find(component => component.parentId === instance.parentId)
  if (!rootComponent) {
    throw new DomainError('INVARIANT_VIOLATION', 'Detached root component is missing')
  }

  const rewrites = buildDetachTargetRewriteMap(instance.id, generatedComponents)
  rewriteScreenTargetRefs(document, instance.screenId, rewrites)
  replaceChildReference(parent, instance.id, rootComponent.id)
  deleteOwnEntity(document.components, instance.id)
  detached.forEach(component => {
    setOwnEntity(document.components, component.id, component)
  })

  const buttonEventIds = createInlineButtonEventIndex(document, instance.screenId)
  for (const component of detached) {
    if (component.config.kind === 'button') {
      component.config.eventId = buttonEventIds.get(component.id) ?? null
    }
  }
}

function applyExtractDefinition(
  document: ProjectDocument,
  sourceRootComponentId: EntityId,
  sourceScreenId: EntityId,
  definition: ComponentDefinition,
  replacementInstanceId: EntityId,
  componentIdToNodePath: Record<EntityId, [EntityId, ...EntityId[]]>,
): void {
  if (hasOwnEntity(document.componentDefinitions, definition.id)) {
    throw new DomainError('INVARIANT_VIOLATION', `Definition ${definition.id} already exists`)
  }
  if (hasOwnEntity(document.components, replacementInstanceId)) {
    throw new DomainError('INVARIANT_VIOLATION', `Component ${replacementInstanceId} already exists`)
  }
  const sourceRoot = getOwnEntity(document.components, sourceRootComponentId)
  if (!sourceRoot || !isInlineScreenComponent(sourceRoot) || sourceRoot.screenId !== sourceScreenId) {
    throw new DomainError(
      'NOT_FOUND',
      `Source component ${sourceRootComponentId} must be an inline screen component`,
    )
  }
  if (sourceRoot.parentId === null) {
    throw new DomainError(
      'INVALID_ARGUMENT',
      'Extracting a screen root or modal root into a shared definition is not supported',
    )
  }
  const parent = getOwnEntity(document.components, sourceRoot.parentId)
  if (!parent || !isInlineScreenComponent(parent)) {
    throw new DomainError('INVARIANT_VIOLATION', `Source parent ${sourceRoot.parentId} is unavailable`)
  }
  const sourceComponents = collectInlineSubtree(document, sourceRootComponentId)
  validateExtractedDefinition(document, definition, sourceComponents, componentIdToNodePath)

  setOwnEntity(document.componentDefinitions, definition.id, cloneComponentDefinition(definition))
  rewriteScreenTargetRefs(
    document,
    sourceScreenId,
    buildExtractionTargetRewriteMap(componentIdToNodePath, replacementInstanceId),
  )
  const sourceIndex = parent.childIds.indexOf(sourceRoot.id)
  if (sourceIndex < 0) {
    throw new DomainError('INVARIANT_VIOLATION', `Parent ${parent.id} does not contain ${sourceRoot.id}`)
  }
  parent.childIds.splice(sourceIndex, 1, replacementInstanceId)
  setOwnEntity(document.components, replacementInstanceId, {
    nodeType: 'definitionInstance',
    id: replacementInstanceId,
    screenId: sourceScreenId,
    parentId: parent.id,
    childIds: [],
    placement: structuredClone(sourceRoot.placement),
    sizing: structuredClone(sourceRoot.sizing),
    source: { $ref: componentDefinitionRefV3(definition.id) },
    variantId: null,
    props: {},
  })
  sourceComponents.forEach(component => {
    deleteOwnEntity(document.components, component.id)
  })
}

export function applyCommandWithoutRevision(
  doc: ProjectDocument,
  inputCommand: DomainCommand,
): ProjectDocument {
  const next = cloneProjectDocument(doc)
  const command = cloneDomainCommand(inputCommand)

  switch (command.type) {
    case 'addScreen': {
      requireExactKeys(
        command,
        ['type', 'screenId', 'rootComponentId', 'name', 'route', 'baseDescription'],
        'addScreen command',
      )
      const { screenId, rootComponentId, name, route, baseDescription } = command
      if (hasOwnEntity(next.screens, screenId) || hasOwnEntity(next.components, rootComponentId)) {
        throw new DomainError('INVARIANT_VIOLATION', 'New screen entity IDs must be unique')
      }
      setOwnEntity(next.screens, screenId, {
        id: screenId,
        name,
        route,
        baseDescription: baseDescription ?? '',
        rootComponentId,
        modalComponentIds: [],
        scenarioIds: [],
        eventIds: [],
      })
      setOwnEntity(next.components, rootComponentId, {
        nodeType: 'inline',
        id: rootComponentId,
        screenId,
        parentId: null,
        childIds: [],
        kind: 'page',
        placement: DEFAULT_COMPONENT_PLACEMENT,
        sizing: ROOT_COMPONENT_SIZING,
        common: { description: '', visible: true, enabled: true },
        config: { kind: 'page', ...DEFAULT_COMPONENT_LAYOUT },
      })
      next.project.screenIds.push(screenId)
      break
    }

    case 'updateScreen': {
      requireExactKeys(
        command,
        ['type', 'screenId', 'name', 'route', 'baseDescription'],
        'updateScreen command',
      )
      const screen = getOwnEntity(next.screens, command.screenId)
      if (!screen) throw new DomainError('NOT_FOUND', `Screen ${command.screenId} not found`)
      if (command.name !== undefined) screen.name = command.name
      if (command.route !== undefined) screen.route = command.route
      if (command.baseDescription !== undefined) screen.baseDescription = command.baseDescription
      break
    }

    case 'removeScreen': {
      requireExactKeys(command, ['type', 'screenId'], 'removeScreen command')
      const screen = getOwnEntity(next.screens, command.screenId)
      if (!screen) throw new DomainError('NOT_FOUND', `Screen ${command.screenId} not found`)
      if (next.project.screenIds.length <= 1) {
        throw new DomainError('CANNOT_REMOVE_LAST_SCREEN', 'Cannot remove the last screen')
      }
      for (const event of Object.values(next.events)) {
        if (event.screenId === screen.id) continue
        if (event.actions.some(action => action.type === 'navigate' && action.destinationScreenId === screen.id)) {
          throw new DomainError('SCREEN_REFERENCED_BY_NAVIGATE', `Screen ${screen.id} is referenced by a navigate action`)
        }
      }
      for (const component of Object.values(next.components)) {
        if (
          component.screenId !== screen.id &&
          isInlineScreenComponent(component) &&
          component.config.kind === 'link' &&
          component.config.destination.type === 'internal' &&
          component.config.destination.screenId === screen.id
        ) {
          throw new DomainError(
            'SCREEN_REFERENCED_BY_LINK',
            `Screen ${screen.id} is referenced by link ${component.id}`,
          )
        }
        for (const definition of Object.values(next.componentDefinitions)) {
          for (const node of Object.values(definition.nodes)) {
            if (
              node.nodeType === 'inline' &&
              node.config.kind === 'link' &&
              node.config.destination.type === 'internal' &&
              node.config.destination.screenId === screen.id
            ) {
              throw new DomainError(
                'SCREEN_REFERENCED_BY_LINK',
                `Screen ${screen.id} is referenced by Definition ${definition.id} link ${node.id}`,
              )
            }
          }
        }
      }
      const removedIds = new Set(
        Object.values(next.components)
          .filter(component => component.screenId === screen.id)
          .map(component => component.id),
      )
      cleanupComponentRefs(removedIds, next)
      screen.scenarioIds.forEach(scenarioId => {
        cleanupScenarioRefsInApiOps(scenarioId, next)
        cleanupScenarioRefsInEvents(scenarioId, next)
      })
      cleanupScreenApiOps(screen.id, next)
      removedIds.forEach(id => deleteOwnEntity(next.components, id))
      screen.scenarioIds.forEach(id => deleteOwnEntity(next.screenScenarios, id))
      screen.eventIds.forEach(id => deleteOwnEntity(next.events, id))
      deleteOwnEntity(next.screens, screen.id)
      next.project.screenIds = next.project.screenIds.filter(id => id !== screen.id)
      break
    }

    case 'addComponent': {
      requireExactKeys(
        command,
        ['type', 'componentId', 'screenId', 'parentId', 'kind', 'placement', 'sizing', 'config', 'position'],
        'addComponent command',
      )
      const placement = classifyComponentAdd(
        next,
        command.screenId,
        command.parentId,
        command.kind,
        command.position,
      )
      if (placement.status === 'invalid') throw componentPlacementError(placement.reason)
      if (hasOwnEntity(next.components, command.componentId)) {
        throw new DomainError('INVARIANT_VIOLATION', `Component ${command.componentId} already exists`)
      }
      const screen = getOwnEntity(next.screens, command.screenId)
      if (!screen) throw new DomainError('NOT_FOUND', `Screen ${command.screenId} not found`)
      setOwnEntity(next.components, command.componentId, {
        nodeType: 'inline',
        id: command.componentId,
        screenId: command.screenId,
        parentId: command.parentId,
        childIds: [],
        kind: command.kind,
        placement: command.placement,
        sizing: command.sizing,
        common: { description: '', visible: true, enabled: true },
        config: command.config,
      })
      if (command.kind === 'modal') {
        screen.modalComponentIds.splice(placement.position, 0, command.componentId)
      } else {
        if (command.parentId === null) throw componentPlacementError('componentConstraint')
        const parent = getOwnEntity(next.components, command.parentId)
        if (!parent || !isInlineScreenComponent(parent)) throw componentPlacementError('stale')
        parent.childIds.splice(placement.position, 0, command.componentId)
      }
      break
    }

    case 'moveComponent': {
      requireExactKeys(
        command,
        ['type', 'componentId', 'newParentId', 'position'],
        'moveComponent command',
      )
      const placement = classifyComponentMove(next, command.componentId, command.newParentId, command.position)
      if (placement.status === 'invalid') throw componentPlacementError(placement.reason)
      if (placement.status === 'no-op') {
        throw new DomainError('INVARIANT_VIOLATION', 'Component is already at that position')
      }
      const component = getOwnEntity(next.components, command.componentId)
      if (!component || component.parentId === null) throw componentPlacementError('stale')
      const newParent = getOwnEntity(next.components, command.newParentId)
      const oldParent = getOwnEntity(next.components, component.parentId)
      if (!newParent || !oldParent || !isInlineScreenComponent(newParent) || !isInlineScreenComponent(oldParent)) {
        throw componentPlacementError('stale')
      }
      oldParent.childIds = oldParent.childIds.filter(id => id !== command.componentId)
      component.parentId = command.newParentId
      newParent.childIds.splice(placement.position, 0, command.componentId)
      break
    }

    case 'duplicateComponent': {
      requireExactKeys(
        command,
        ['type', 'componentId', 'componentIdMap', 'eventIdMap', 'apiOperationIdMap'],
        'duplicateComponent command',
      )
      const source = getOwnEntity(next.components, command.componentId)
      if (!source) throw new DomainError('NOT_FOUND', `Component ${command.componentId} not found`)
      if (!source.parentId) {
        throw new DomainError('INVALID_PARENT', 'Independent screen roots cannot be duplicated')
      }
      const parent = getOwnEntity(next.components, source.parentId)
      const sourcePosition = parent && isInlineScreenComponent(parent) ? parent.childIds.indexOf(source.id) : -1
      if (!parent || !isInlineScreenComponent(parent) || sourcePosition < 0) {
        throw new DomainError('INVARIANT_VIOLATION', 'Component parent is unavailable')
      }
      const snapshot = createComponentSubtreeSnapshot(next, source.id)
      if (!snapshot) {
        throw new DomainError('INVALID_ARGUMENT', 'Component subtree cannot be duplicated safely')
      }
      copySnapshotIntoDocument(
        next,
        snapshot,
        source.screenId,
        parent.id,
        sourcePosition + 1,
        command.componentIdMap,
        command.eventIdMap,
        command.apiOperationIdMap,
        true,
      )
      break
    }

    case 'pasteComponent': {
      requireExactKeys(
        command,
        [
          'type',
          'snapshot',
          'destinationComponentId',
          'destinationScreenId',
          'destinationParentId',
          'position',
          'componentIdMap',
          'eventIdMap',
          'apiOperationIdMap',
        ],
        'pasteComponent command',
      )
      const target = resolveComponentPasteTarget(next, command.destinationComponentId)
      if (
        !target ||
        target.destinationScreenId !== command.destinationScreenId ||
        target.destinationParentId !== command.destinationParentId ||
        target.position !== command.position
      ) {
        throw new DomainError('INVALID_REFERENCE', 'Paste destination changed or is unavailable')
      }
      copySnapshotIntoDocument(
        next,
        command.snapshot,
        command.destinationScreenId,
        command.destinationParentId,
        command.position,
        command.componentIdMap,
        command.eventIdMap,
        command.apiOperationIdMap,
        command.snapshot.sourceScreenId === command.destinationScreenId,
      )
      break
    }

    case 'removeComponent': {
      requireExactKeys(command, ['type', 'componentId'], 'removeComponent command')
      const component = getOwnEntity(next.components, command.componentId)
      if (!component) throw new DomainError('NOT_FOUND', `Component ${command.componentId} not found`)
      const screen = getOwnEntity(next.screens, component.screenId)
      if (!screen) throw new DomainError('INVARIANT_VIOLATION', 'Component owner screen not found')
      if (component.id === screen.rootComponentId) {
        throw new DomainError('CANNOT_REMOVE_ROOT', 'Cannot remove the page root component')
      }
      if (component.parentId === null) {
        if (!isInlineScreenComponent(component) || component.kind !== 'modal' || !screen.modalComponentIds.includes(component.id)) {
          throw new DomainError('INVARIANT_VIOLATION', 'Only listed modal roots can be removed')
        }
        screen.modalComponentIds = screen.modalComponentIds.filter(id => id !== component.id)
      } else {
        const parent = getOwnEntity(next.components, component.parentId)
        if (parent && isInlineScreenComponent(parent)) {
          parent.childIds = parent.childIds.filter(id => id !== component.id)
        }
      }
      const removed = removeSubtree(component.id, next)
      cleanupComponentRefs(new Set(removed), next)
      break
    }

    case 'updateComponentSpec': {
      requireExactKeys(command, ['type', 'componentId', 'patch'], 'updateComponentSpec command')
      requireExactKeys(command.patch, ['common', 'config', 'placement', 'sizing'], 'updateComponentSpec patch')
      if (Object.keys(command.patch).length === 0) {
        throw new DomainError('INVARIANT_VIOLATION', 'updateComponentSpec patch must not be empty')
      }
      const component = getOwnEntity(next.components, command.componentId)
      if (!component) throw new DomainError('NOT_FOUND', `Component ${command.componentId} not found`)
      if (!isInlineScreenComponent(component)) {
        if (command.patch.common || command.patch.config) {
          throw new DomainError(
            'INVALID_ARGUMENT',
            'Definition instances only support placement and sizing updates',
          )
        }
        if (command.patch.placement) {
          if (component.parentId === null && command.patch.placement.mode !== 'flow') {
            throw new DomainError('INVARIANT_VIOLATION', 'Independent root placement must remain flow')
          }
          component.placement = command.patch.placement
        }
        if (command.patch.sizing) component.sizing = command.patch.sizing
        break
      }
      if (command.patch.common) component.common = { ...component.common, ...command.patch.common }
      if (command.patch.config) {
        if ('kind' in command.patch.config && command.patch.config.kind !== component.kind) {
          throw new DomainError('INVALID_ARGUMENT', 'Component kind cannot be changed')
        }
        component.config = { ...component.config, ...command.patch.config } as ComponentConfig
      }
      if (command.patch.placement) {
        if (component.parentId === null && command.patch.placement.mode !== 'flow') {
          throw new DomainError('INVARIANT_VIOLATION', 'Independent root placement must remain flow')
        }
        component.placement = command.patch.placement
      }
      if (command.patch.sizing) component.sizing = command.patch.sizing
      break
    }

    case 'extractComponentDefinition': {
      requireExactKeys(
        command,
        [
          'type',
          'sourceRootComponentId',
          'sourceScreenId',
          'definition',
          'replacementInstanceId',
          'componentIdToNodePath',
        ],
        'extractComponentDefinition command',
      )
      applyExtractDefinition(
        next,
        command.sourceRootComponentId,
        command.sourceScreenId,
        command.definition,
        command.replacementInstanceId,
        command.componentIdToNodePath,
      )
      break
    }

    case 'detachDefinitionInstance': {
      requireExactKeys(
        command,
        ['type', 'instanceId', 'generatedComponents'],
        'detachDefinitionInstance command',
      )
      applyDetachDefinitionInstance(next, command.instanceId, command.generatedComponents)
      break
    }

    case 'putComponentDefinition': {
      requireExactKeys(
        command,
        ['type', 'mode', 'definition'],
        'putComponentDefinition command',
      )
      const existing = getOwnEntity(next.componentDefinitions, command.definition.id)
      if (command.mode === 'create' && existing) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Definition ${command.definition.id} already exists`,
        )
      }
      if (command.mode === 'update' && !existing) {
        throw new DomainError('NOT_FOUND', `Definition ${command.definition.id} not found`)
      }
      setOwnEntity(
        next.componentDefinitions,
        command.definition.id,
        cloneComponentDefinition(command.definition),
      )
      break
    }

    case 'addDefinitionInstance': {
      requireExactKeys(
        command,
        [
          'type',
          'componentId',
          'screenId',
          'parentId',
          'position',
          'definitionId',
          'variantId',
          'props',
          'placement',
          'sizing',
        ],
        'addDefinitionInstance command',
      )
      if (hasOwnEntity(next.components, command.componentId)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Component ${command.componentId} already exists`,
        )
      }
      const parent = getOwnEntity(next.components, command.parentId)
      const definition = getOwnEntity(next.componentDefinitions, command.definitionId)
      if (
        !parent ||
        !isInlineScreenComponent(parent) ||
        parent.screenId !== command.screenId ||
        !CONTAINER_KINDS.includes(parent.kind)
      ) {
        throw new DomainError('INVALID_PARENT', 'Definition Instance requires a screen container')
      }
      if (!definition) {
        throw new DomainError('NOT_FOUND', `Definition ${command.definitionId} not found`)
      }
      const position = command.position ?? parent.childIds.length
      if (!Number.isInteger(position) || position < 0 || position > parent.childIds.length) {
        throw new DomainError('INVALID_ARGUMENT', 'Definition Instance position is invalid')
      }
      setOwnEntity(next.components, command.componentId, {
        nodeType: 'definitionInstance',
        id: command.componentId,
        screenId: command.screenId,
        parentId: command.parentId,
        childIds: [],
        source: { $ref: componentDefinitionRefV3(definition.id) },
        variantId: command.variantId,
        props: { ...command.props },
        placement: { ...command.placement },
        sizing: { ...command.sizing },
      })
      parent.childIds.splice(position, 0, command.componentId)
      break
    }

    case 'updateDefinitionInstance': {
      requireExactKeys(
        command,
        ['type', 'componentId', 'variantId', 'props', 'placement', 'sizing'],
        'updateDefinitionInstance command',
      )
      const instance = getOwnEntity(next.components, command.componentId)
      if (!instance || instance.nodeType !== 'definitionInstance') {
        throw new DomainError(
          'NOT_FOUND',
          `Definition Instance ${command.componentId} not found`,
        )
      }
      if (command.variantId !== undefined) instance.variantId = command.variantId
      if (command.props !== undefined) instance.props = { ...command.props }
      if (command.placement !== undefined) instance.placement = { ...command.placement }
      if (command.sizing !== undefined) instance.sizing = { ...command.sizing }
      break
    }

    case 'createScreenState': {
      requireExactKeys(
        command,
        ['type', 'stateId', 'screenId', 'name', 'description', 'overrides'],
        'createScreenState command',
      )
      const screen = getOwnEntity(next.screens, command.screenId)
      if (!screen) throw new DomainError('NOT_FOUND', `Screen ${command.screenId} not found`)
      if (hasOwnEntity(next.screenScenarios, command.stateId)) {
        throw new DomainError('INVARIANT_VIOLATION', `Scenario ${command.stateId} already exists`)
      }
      setOwnEntity(next.screenScenarios, command.stateId, {
        id: command.stateId,
        screenId: command.screenId,
        name: command.name,
        description: command.description ?? '',
        componentOverrides: command.overrides ? cloneScreenScenario({
          id: command.stateId,
          screenId: command.screenId,
          name: command.name,
          description: command.description ?? '',
          componentOverrides: command.overrides,
        }).componentOverrides : [],
      })
      screen.scenarioIds.push(command.stateId)
      break
    }

    case 'updateScreenState': {
      requireExactKeys(
        command,
        ['type', 'stateId', 'name', 'description', 'overrides'],
        'updateScreenState command',
      )
      const scenario = getOwnEntity(next.screenScenarios, command.stateId)
      if (!scenario) throw new DomainError('NOT_FOUND', `Scenario ${command.stateId} not found`)
      if (command.name !== undefined) scenario.name = command.name
      if (command.description !== undefined) scenario.description = command.description
      if (command.overrides !== undefined) {
        scenario.componentOverrides = cloneScreenScenario({
          ...scenario,
          componentOverrides: command.overrides,
        }).componentOverrides
      }
      break
    }

    case 'removeScreenState': {
      requireExactKeys(command, ['type', 'stateId'], 'removeScreenState command')
      const scenario = getOwnEntity(next.screenScenarios, command.stateId)
      if (!scenario) throw new DomainError('NOT_FOUND', `Scenario ${command.stateId} not found`)
      const screen = getOwnEntity(next.screens, scenario.screenId)
      if (!screen) {
        throw new DomainError('INVARIANT_VIOLATION', `Scenario ${scenario.id} owner screen not found`)
      }
      screen.scenarioIds = screen.scenarioIds.filter(id => id !== scenario.id)
      cleanupScenarioRefsInApiOps(scenario.id, next)
      cleanupScenarioRefsInEvents(scenario.id, next)
      deleteOwnEntity(next.screenScenarios, scenario.id)
      break
    }

    case 'connectEvent': {
      requireExactKeys(
        command,
        ['type', 'eventId', 'screenId', 'name', 'trigger', 'actions'],
        'connectEvent command',
      )
      const screen = getOwnEntity(next.screens, command.screenId)
      if (!screen) throw new DomainError('NOT_FOUND', `Screen ${command.screenId} not found`)
      if (hasOwnEntity(next.events, command.eventId)) {
        throw new DomainError('INVARIANT_VIOLATION', `Event ${command.eventId} already exists`)
      }
      setOwnEntity(next.events, command.eventId, {
        id: command.eventId,
        screenId: command.screenId,
        name: command.name,
        trigger: command.trigger,
        actions: command.actions,
      })
      if (!screen.eventIds.includes(command.eventId)) screen.eventIds.push(command.eventId)
      if (command.trigger.target.type === 'inline') {
        const component = getOwnEntity(next.components, command.trigger.target.componentId)
        if (
          component &&
          isInlineScreenComponent(component) &&
          component.config.kind === 'button'
        ) {
          component.config.eventId = command.eventId
        }
      }
      break
    }

    case 'updateEvent': {
      requireExactKeys(
        command,
        ['type', 'eventId', 'name', 'trigger', 'actions'],
        'updateEvent command',
      )
      const event = getOwnEntity(next.events, command.eventId)
      if (!event) throw new DomainError('NOT_FOUND', `Event ${command.eventId} not found`)
      event.name = command.name
      event.trigger = command.trigger
      event.actions = command.actions
      for (const component of Object.values(next.components)) {
        if (
          isInlineScreenComponent(component) &&
          component.config.kind === 'button' &&
          component.config.eventId === command.eventId &&
          !(
            command.trigger.target.type === 'inline' &&
            command.trigger.target.componentId === component.id
          )
        ) {
          component.config.eventId = null
        }
      }
      if (command.trigger.target.type === 'inline') {
        const component = getOwnEntity(next.components, command.trigger.target.componentId)
        if (
          component &&
          isInlineScreenComponent(component) &&
          component.config.kind === 'button'
        ) {
          component.config.eventId = command.eventId
        }
      }
      break
    }

    case 'removeEvent': {
      requireExactKeys(command, ['type', 'eventId'], 'removeEvent command')
      const event = getOwnEntity(next.events, command.eventId)
      if (!event) throw new DomainError('NOT_FOUND', `Event ${command.eventId} not found`)
      const screen = getOwnEntity(next.screens, event.screenId)
      if (screen) screen.eventIds = screen.eventIds.filter(id => id !== event.id)
      for (const component of Object.values(next.components)) {
        if (
          isInlineScreenComponent(component) &&
          component.config.kind === 'button' &&
          component.config.eventId === event.id
        ) {
          component.config.eventId = null
        }
      }
      deleteOwnEntity(next.events, event.id)
      for (const operation of Object.values(next.apiOperations)) {
        const hasCollectionCaller = Object.values(next.events).some(candidate =>
          candidate.trigger.target.type === 'collectionItemNode' &&
          candidate.actions.some(action =>
            action.type === 'callApi' && action.apiOperationId === operation.id))
        if (!hasCollectionCaller) {
          operation.requestBindings = operation.requestBindings
            .filter(binding => binding.source.type !== 'item')
            .map(cloneFieldBinding)
        }
      }
      break
    }

    case 'bindApiOperation': {
      requireExactKeys(
        command,
        [
          'type',
          'operationId',
          'screenId',
          'name',
          'method',
          'path',
          'requestBindings',
          'successScenarioId',
          'errorScenarioId',
        ],
        'bindApiOperation command',
      )
      if (!hasOwnEntity(next.screens, command.screenId)) {
        throw new DomainError('NOT_FOUND', `Screen ${command.screenId} not found`)
      }
      if (hasOwnEntity(next.apiOperations, command.operationId)) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${command.operationId} already exists`)
      }
      setOwnEntity(next.apiOperations, command.operationId, {
        id: command.operationId,
        screenId: command.screenId,
        name: command.name,
        method: command.method,
        path: command.path,
        requestBindings: command.requestBindings ?? [],
        successScenarioId: command.successScenarioId ?? null,
        errorScenarioId: command.errorScenarioId ?? null,
      })
      break
    }

    case 'updateApiOperation': {
      requireExactKeys(
        command,
        [
          'type',
          'operationId',
          'name',
          'method',
          'path',
          'requestBindings',
          'successScenarioId',
          'errorScenarioId',
        ],
        'updateApiOperation command',
      )
      const operation = getOwnEntity(next.apiOperations, command.operationId)
      if (!operation) {
        throw new DomainError('NOT_FOUND', `API operation ${command.operationId} not found`)
      }
      operation.name = command.name
      operation.method = command.method
      operation.path = command.path
      operation.requestBindings = command.requestBindings
      operation.successScenarioId = command.successScenarioId
      operation.errorScenarioId = command.errorScenarioId
      break
    }

    case 'removeApiOperation': {
      requireExactKeys(command, ['type', 'operationId'], 'removeApiOperation command')
      const operation = getOwnEntity(next.apiOperations, command.operationId)
      if (!operation) {
        throw new DomainError('NOT_FOUND', `API operation ${command.operationId} not found`)
      }
      for (const event of Object.values(next.events)) {
        event.actions = event.actions.filter(action =>
          action.type !== 'callApi' || action.apiOperationId !== operation.id,
        )
      }
      for (const component of Object.values(next.components)) {
        if (
          component.nodeType === 'inline' &&
          component.config.kind === 'collection' &&
          component.config.dataSource.apiOperationId === operation.id
        ) {
          component.config.dataSource.apiOperationId = null
        }
      }
      deleteOwnEntity(next.apiOperations, operation.id)
      break
    }

    case 'removeComponentDefinition': {
      requireExactKeys(command, ['type', 'definitionId'], 'removeComponentDefinition command')
      const definition = getOwnEntity(next.componentDefinitions, command.definitionId)
      if (!definition) {
        throw new DomainError('NOT_FOUND', `Definition ${command.definitionId} not found`)
      }
      const uses = collectDefinitionUses(next, definition.id)
      if (uses.screenInstanceIds.length > 0 || uses.nestedDefinitionNodeIds.length > 0) {
        throw new DomainError(
          'INVALID_REFERENCE',
          `Definition ${definition.id} is still in use`,
          uses,
        )
      }
      deleteOwnEntity(next.componentDefinitions, definition.id)
      break
    }

    default: {
      const runtimeCommand = command as { type?: unknown }
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Unsupported command type: ${String(runtimeCommand.type)}`,
      )
    }
  }

  validateInvariants(next)
  return next
}

export function applyCommand(doc: ProjectDocument, command: DomainCommand): ProjectDocument {
  return applyCommandWithoutRevision(doc, command)
}

export function applyTransaction(doc: ProjectDocument, commands: DomainCommand[]): ProjectDocument {
  let current = cloneProjectDocument(doc)
  for (const command of commands) {
    current = applyCommandWithoutRevision(current, command)
  }
  return current
}
