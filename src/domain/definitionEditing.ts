import type {
  ComponentDefinition,
  ComponentDefinitionNode,
  DefinitionComponentConfig,
  EntityId,
  ProjectDocument,
  ScreenComponentConfig,
} from './model'
import type {
  DetachDefinitionInstanceCommand,
  ExtractComponentDefinitionCommand,
} from './commands'
import { DEFAULT_COMPONENT_PLACEMENT, ROOT_COMPONENT_SIZING } from './model'
import { DomainError } from './errors'
import { getOwnEntity } from './entityMap'
import { cloneComponentDefinition } from './modelClone'
import { resolveScreenNodes } from './definitionResolver'

function toDefinitionConfig(config: ScreenComponentConfig): DefinitionComponentConfig {
  const copy = structuredClone(config)
  if (copy.kind === 'button') {
    const { eventId: _eventId, ...definitionConfig } = copy
    return definitionConfig
  }
  return copy
}

export function createEmptyComponentDefinition(
  definitionId: EntityId,
  rootNodeId: EntityId,
  name: string,
): ComponentDefinition {
  return {
    id: definitionId,
    name,
    description: '',
    rootNodeId,
    nodes: {
      [rootNodeId]: {
        nodeType: 'inline',
        id: rootNodeId,
        parentId: null,
        childIds: [],
        kind: 'container',
        placement: DEFAULT_COMPONENT_PLACEMENT,
        sizing: ROOT_COMPONENT_SIZING,
        common: { description: '', visible: true, enabled: true },
        config: {
          kind: 'container',
          layout: 'vertical',
          gap: 'md',
          columns: 1,
          justify: 'start',
          align: 'stretch',
          wrap: false,
        },
      },
    },
    publicProps: [],
    variantProperties: [],
    variants: [],
    representativeVariantId: null,
  }
}

export function createExtractDefinitionCommand(
  document: ProjectDocument,
  sourceRootComponentId: EntityId,
  definitionId: EntityId,
  replacementInstanceId: EntityId,
  name: string,
  createId: () => EntityId,
): ExtractComponentDefinitionCommand {
  const sourceRoot = getOwnEntity(document.components, sourceRootComponentId)
  if (!sourceRoot || sourceRoot.nodeType !== 'inline' || sourceRoot.parentId === null) {
    throw new DomainError(
      'INVALID_ARGUMENT',
      'Only a non-root inline subtree can become a shared definition',
    )
  }

  const ordered: Array<Extract<typeof sourceRoot, { nodeType: 'inline' }>> = []
  const visit = (componentId: EntityId) => {
    const component = getOwnEntity(document.components, componentId)
    if (!component || component.nodeType !== 'inline') {
      throw new DomainError(
        'INVALID_ARGUMENT',
        'A subtree containing a Definition Instance cannot be extracted',
      )
    }
    ordered.push(component)
    component.childIds.forEach(visit)
  }
  visit(sourceRoot.id)

  const nodeIds = new Map(ordered.map(component => [component.id, createId()]))
  const rootNodeId = nodeIds.get(sourceRoot.id)!
  const nodes = Object.create(null) as Record<EntityId, ComponentDefinitionNode>
  const componentIdToNodePath = Object.create(null) as Record<
    EntityId,
    [EntityId, ...EntityId[]]
  >

  const pathFor = (componentId: EntityId): [EntityId, ...EntityId[]] => {
    const path: EntityId[] = []
    let current = getOwnEntity(document.components, componentId)
    while (current) {
      const mapped = nodeIds.get(current.id)
      if (!mapped) break
      path.unshift(mapped)
      if (current.id === sourceRoot.id) break
      current = current.parentId
        ? getOwnEntity(document.components, current.parentId)
        : undefined
    }
    if (path.length > 1 && path[0] === rootNodeId) path.shift()
    return path as [EntityId, ...EntityId[]]
  }

  for (const component of ordered) {
    const nodeId = nodeIds.get(component.id)!
    const isRoot = component.id === sourceRoot.id
    nodes[nodeId] = {
      nodeType: 'inline',
      id: nodeId,
      parentId: isRoot ? null : nodeIds.get(component.parentId!)!,
      childIds: component.childIds.map(childId => nodeIds.get(childId)!),
      kind: component.kind,
      placement: isRoot ? DEFAULT_COMPONENT_PLACEMENT : structuredClone(component.placement),
      sizing: isRoot ? ROOT_COMPONENT_SIZING : structuredClone(component.sizing),
      common: structuredClone(component.common),
      config: toDefinitionConfig(component.config),
    }
    componentIdToNodePath[component.id] = pathFor(component.id)
  }

  return {
    type: 'extractComponentDefinition',
    sourceRootComponentId,
    sourceScreenId: sourceRoot.screenId,
    definition: {
      id: definitionId,
      name,
      description: '',
      rootNodeId,
      nodes,
      publicProps: [],
      variantProperties: [],
      variants: [],
      representativeVariantId: null,
    },
    replacementInstanceId,
    componentIdToNodePath,
  }
}

export function createDetachDefinitionInstanceCommand(
  document: ProjectDocument,
  instanceId: EntityId,
  createId: () => EntityId,
): DetachDefinitionInstanceCommand {
  const instance = getOwnEntity(document.components, instanceId)
  if (!instance || instance.nodeType !== 'definitionInstance') {
    throw new DomainError('NOT_FOUND', `Definition Instance ${instanceId} not found`)
  }
  const resolved = resolveScreenNodes(document, instance.screenId)
  return {
    type: 'detachDefinitionInstance',
    instanceId,
    generatedComponents: resolved.orderedNodes
      .filter(node => node.instanceId === instanceId && node.nodePath)
      .map(node => ({
        nodePath: [...node.nodePath!] as [EntityId, ...EntityId[]],
        componentId: createId(),
      })),
  }
}

export function duplicateComponentDefinition(
  source: ComponentDefinition,
  definitionId: EntityId,
  name: string,
  createId: () => EntityId,
): ComponentDefinition {
  const copy = cloneComponentDefinition(source)
  const nodeIds = new Map(Object.keys(copy.nodes).map(nodeId => [nodeId, createId()]))
  const variantIds = new Map(copy.variants.map(variant => [variant.id, createId()]))
  const remapPath = (path: readonly EntityId[]) => {
    let insideReferencedDefinition = false
    return path.map(segment => {
      if (insideReferencedDefinition) return segment
      const sourceNode = getOwnEntity(copy.nodes, segment)
      const remapped = nodeIds.get(segment) ?? segment
      if (sourceNode?.nodeType === 'definitionInstance') insideReferencedDefinition = true
      return remapped
    }) as [EntityId, ...EntityId[]]
  }
  const nodes = Object.create(null) as Record<EntityId, ComponentDefinitionNode>
  for (const node of Object.values(copy.nodes)) {
    const id = nodeIds.get(node.id)!
    nodes[id] = {
      ...node,
      id,
      parentId: node.parentId ? nodeIds.get(node.parentId) ?? node.parentId : null,
      childIds: node.childIds.map(childId => nodeIds.get(childId) ?? childId),
      placement: structuredClone(node.placement),
      sizing: structuredClone(node.sizing),
      ...(node.nodeType === 'inline'
        ? {
            common: structuredClone(node.common),
            config: structuredClone(node.config),
          }
        : {
            source: { ...node.source },
            props: { ...node.props },
          }),
    } as ComponentDefinitionNode
  }
  return {
    ...copy,
    id: definitionId,
    name,
    rootNodeId: nodeIds.get(copy.rootNodeId)!,
    nodes,
    publicProps: copy.publicProps.map(prop => ({
      ...prop,
      bindings: prop.bindings.map(binding => ({
        ...binding,
        nodePath: remapPath(binding.nodePath),
      })),
      ...(prop.type === 'enum' ? { values: [...prop.values] } : {}),
    })),
    variants: copy.variants.map(variant => ({
      ...variant,
      id: variantIds.get(variant.id)!,
      propertyValues: { ...variant.propertyValues },
      nodeOverrides: Object.fromEntries(
        Object.entries(variant.nodeOverrides).map(([nodeId, override]) => [
          nodeIds.get(nodeId) ?? nodeId,
          structuredClone(override),
        ]),
      ),
    })),
    representativeVariantId: copy.representativeVariantId
      ? variantIds.get(copy.representativeVariantId) ?? null
      : null,
  }
}
