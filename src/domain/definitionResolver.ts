import {
  type CommonComponentSpec,
  type ComponentDefinition,
  type ComponentDefinitionNode,
  type ComponentKind,
  type ComponentOverride,
  type ComponentPlacement,
  type ComponentSizing,
  type ComponentTargetRef,
  type DefinitionComponentConfig,
  type DefinitionInstanceFields,
  type DefinitionInstanceScreenNode,
  type EntityId,
  type ProjectDocument,
  type PublicPropFieldV3,
  type PublicPropTypeV3,
  type PublicPropValue,
  type ScreenComponent,
  type ScreenComponentConfig,
  type ScreenScenario,
  isInlineDefinitionNode,
  isInlineScreenComponent,
  DEFAULT_COMPONENT_PLACEMENT,
  DEFAULT_COMPONENT_SIZING,
} from './model'
import { resolveComponentDefinitionRefV3 } from './canonicalProjectSpecV3'
import { DomainError } from './errors'
import {
  cloneComponentTargetRef,
  componentTargetRefKey,
  collectionItemNodeTargetRef,
  definitionNodeTargetRef,
  findScenarioOverride,
  inlineTargetRef,
} from './componentTargets'
import {
  resolveCollectionItem,
  resolveCollectionTemplateDefaults,
} from './collection'
import { getOwnEntity } from './entityMap'
import {
  validateCommonComponentSpec,
  validateComponentPlacement,
  validateComponentSizing,
  validateDefinitionComponentConfig,
} from './runtimeValidation'

export const MAX_DEFINITION_NESTING_DEPTH = 10
export const MAX_RESOLVED_SCREEN_NODE_COUNT = 500

export interface ResolvedRuntimeNode {
  id: string
  namespacedId: string
  screenId: EntityId
  screenComponentId: EntityId
  definitionId: EntityId | null
  definitionNodeId: EntityId | null
  instanceId: EntityId | null
  collectionId: EntityId | null
  collectionItemKey: string | null
  collectionItemIndex: number | null
  nodePath: [EntityId, ...EntityId[]] | null
  kind: ComponentKind
  placement: ComponentPlacement
  sizing: ComponentSizing
  common: CommonComponentSpec
  config: DefinitionComponentConfig | ScreenComponentConfig
  canonicalTarget: ComponentTargetRef
  parentId: string | null
  childIds: string[]
  instanceBoundary: {
    instanceId: EntityId | null
    depth: number
    isBoundaryRoot: boolean
  }
}

export interface ResolveScreenNodesResult {
  screenId: EntityId
  orderedNodes: ResolvedRuntimeNode[]
  nodesById: Record<string, ResolvedRuntimeNode>
  nodesByTarget: Record<string, ResolvedRuntimeNode>
}

export interface ResolvedDefinitionInstanceRoot {
  component: DefinitionInstanceScreenNode & {
    kind: ResolvedRuntimeNode['kind']
    common: CommonComponentSpec
    config: DefinitionComponentConfig | ScreenComponentConfig
    definitionId: EntityId
    definitionName: string
    rootTarget: Extract<ComponentTargetRef, { type: 'definitionNode' }>
  }
  resolved: ResolvedRuntimeNode
}

interface MutableResolvedNode extends ResolvedRuntimeNode {
  childIds: string[]
}

interface ResolveAccumulator {
  orderedNodes: MutableResolvedNode[]
  nodesById: Record<string, MutableResolvedNode>
  nodesByTarget: Record<string, MutableResolvedNode>
  count: number
}

interface DefinitionExpansionContext {
  document: ProjectDocument
  screenId: EntityId
  activeScenario: ScreenScenario | undefined
  accumulator: ResolveAccumulator
  topLevelInstanceId: EntityId | null
  collectionContext: {
    collectionId: EntityId
    itemKey: string
    itemIndex: number
  } | null
  topLevelScreenComponentId: EntityId
  pathPrefix: EntityId[]
  parentRuntimeId: string | null
  boundaryDepth: number
  forcedBoundaryVisibility: boolean | null
  publicPropScopes: Array<{
    definition: ComponentDefinition
    props: Readonly<Record<string, PublicPropValue>>
    pathPrefix: readonly EntityId[]
  }>
}

interface ResolvedParts {
  kind: ComponentKind
  common: CommonComponentSpec
  config: DefinitionComponentConfig | ScreenComponentConfig
  placement: ComponentPlacement
  sizing: ComponentSizing
}

function cloneCommon(common: CommonComponentSpec): CommonComponentSpec {
  return { ...common }
}

function clonePlacement(placement: ComponentPlacement): ComponentPlacement {
  return { ...placement }
}

function cloneSizing(sizing: ComponentSizing): ComponentSizing {
  return { ...sizing }
}

function cloneAnyConfig(
  config: DefinitionComponentConfig | ScreenComponentConfig,
): DefinitionComponentConfig | ScreenComponentConfig {
  switch (config.kind) {
    case 'textInput':
      return {
        ...config,
        validationRules: config.validationRules.map(rule => ({ ...rule })),
      }
    case 'select':
      return {
        ...config,
        options: config.options.map(option => ({ ...option })),
      }
    case 'link':
      return { ...config, destination: { ...config.destination } }
    case 'collection':
      return structuredClone(config)
    case 'page':
    case 'container':
    case 'text':
    case 'button':
    case 'image':
    case 'modal':
      return { ...config }
  }
}

function toRuntimeId(
  target: ComponentTargetRef,
  collectionContext: DefinitionExpansionContext['collectionContext'] = null,
): string {
  const targetKey = componentTargetRefKey(target)
  return collectionContext
    ? `${targetKey}:item:${encodeURIComponent(collectionContext.itemKey)}`
    : targetKey
}

function assertResolvedNodeLimit(accumulator: ResolveAccumulator): void {
  if (accumulator.count >= MAX_RESOLVED_SCREEN_NODE_COUNT) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Resolved component count exceeds ${MAX_RESOLVED_SCREEN_NODE_COUNT}`,
    )
  }
}

function pushResolvedNode(
  accumulator: ResolveAccumulator,
  node: Omit<MutableResolvedNode, 'childIds'> & { childIds?: string[] },
): MutableResolvedNode {
  assertResolvedNodeLimit(accumulator)
  const resolved: MutableResolvedNode = {
    ...node,
    childIds: [...(node.childIds ?? [])],
  }
  accumulator.count += 1
  accumulator.orderedNodes.push(resolved)
  accumulator.nodesById[resolved.id] = resolved
  accumulator.nodesByTarget[componentTargetRefKey(resolved.canonicalTarget)] ??= resolved
  return resolved
}

function applyVariantOverride(
  node: ComponentDefinitionNode,
  definition: ComponentDefinition,
  variantId: EntityId | null,
): ResolvedParts {
  if (!isInlineDefinitionNode(node)) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Definition inline data is unavailable for ${definition.id}/${node.id}`,
    )
  }
  const variant = variantId === null
    ? undefined
    : definition.variants.find(candidate => candidate.id === variantId)
  const override = variant?.nodeOverrides[node.id]
  return {
    kind: node.kind,
    common: { ...node.common, ...override?.common },
    config: { ...cloneAnyConfig(node.config), ...override?.config } as DefinitionComponentConfig,
    placement: override?.placement ? clonePlacement(override.placement) : clonePlacement(node.placement),
    sizing: override?.sizing ? cloneSizing(override.sizing) : cloneSizing(node.sizing),
  }
}

function basePublicPropFieldType(
  field: PublicPropFieldV3,
  placement: ComponentPlacement,
): PublicPropTypeV3 | null {
  switch (field) {
    case 'common.description':
    case 'config.text':
    case 'config.label':
    case 'config.placeholder':
    case 'config.defaultValue':
    case 'config.source':
    case 'config.alt':
    case 'config.destination.screenId':
    case 'config.destination.url':
    case 'config.destination.resourceId':
    case 'config.destination.displayName':
      return 'string'
    case 'common.visible':
    case 'common.enabled':
    case 'config.wrap':
    case 'config.required':
    case 'config.preventDoubleSubmit':
      return 'boolean'
    case 'config.columns':
    case 'sizing.gridSpan':
    case 'sizing.grow':
      return 'number'
    case 'config.layout':
    case 'config.gap':
    case 'config.justify':
    case 'config.align':
    case 'config.style':
    case 'config.inputType':
    case 'config.variant':
    case 'config.fit':
    case 'config.aspectRatio':
    case 'config.placeholderStyle':
    case 'config.openMode':
    case 'sizing.inlineSize':
    case 'sizing.minWidth':
    case 'sizing.maxWidth':
    case 'sizing.shrink':
      return 'enum'
    case 'placement.edge':
      return placement.mode === 'sticky' ? 'enum' : null
    case 'placement.inset':
      return placement.mode === 'sticky' ? 'enum' : null
    case 'placement.anchor':
      return placement.mode === 'overlay' || placement.mode === 'viewport' ? 'enum' : null
    case 'placement.insetX':
    case 'placement.insetY':
      return placement.mode === 'overlay' || placement.mode === 'viewport' ? 'enum' : null
  }
  return null
}

function publicPropFieldType(
  config: DefinitionComponentConfig | ScreenComponentConfig,
  field: PublicPropFieldV3,
  placement: ComponentPlacement,
  sizing: ComponentSizing,
): PublicPropTypeV3 | null {
  void sizing
  const baseType = basePublicPropFieldType(field, placement)
  if (field.startsWith('common.') || field.startsWith('placement.') || field.startsWith('sizing.')) {
    return baseType
  }
  switch (config.kind) {
    case 'page':
    case 'container':
    case 'modal':
      return [
        'config.layout',
        'config.gap',
        'config.columns',
        'config.justify',
        'config.align',
        'config.wrap',
      ].includes(field)
        ? baseType
        : field.startsWith('config.')
          ? null
          : baseType
    case 'text':
      return field === 'config.text' || field === 'config.style'
        ? baseType
        : field.startsWith('config.')
          ? null
          : baseType
    case 'textInput':
      return [
        'config.label',
        'config.inputType',
        'config.required',
        'config.placeholder',
        'config.defaultValue',
      ].includes(field)
        ? baseType
        : field.startsWith('config.')
          ? null
          : baseType
    case 'select':
      return ['config.label', 'config.required', 'config.defaultValue'].includes(field)
        ? baseType
        : field.startsWith('config.')
          ? null
          : baseType
    case 'button':
      return [
        'config.label',
        'config.variant',
        'config.confirmationMessage',
        'config.preventDoubleSubmit',
      ].includes(field)
        ? field === 'config.confirmationMessage'
          ? 'string'
          : baseType
        : field.startsWith('config.')
          ? null
          : baseType
    case 'image':
      return [
        'config.source',
        'config.alt',
        'config.fit',
        'config.aspectRatio',
        'config.placeholderStyle',
      ].includes(field)
        ? baseType
        : field.startsWith('config.')
          ? null
          : baseType
    case 'link':
      return [
        'config.label',
        'config.destination.screenId',
        'config.destination.url',
        'config.destination.resourceId',
        'config.destination.displayName',
        'config.openMode',
      ].includes(field)
        ? baseType
        : field.startsWith('config.')
          ? null
          : baseType
    case 'collection':
      return field.startsWith('config.') ? null : baseType
  }
}

export function resolvePublicPropFieldType(
  parts: ResolvedParts,
  field: PublicPropFieldV3,
): PublicPropTypeV3 | null {
  return publicPropFieldType(parts.config, field, parts.placement, parts.sizing)
}

export function applyResolvedFieldValue(
  parts: ResolvedParts,
  field: PublicPropFieldV3,
  value: PublicPropValue,
): ResolvedParts {
  const next: ResolvedParts = {
    kind: parts.kind,
    common: cloneCommon(parts.common),
    config: cloneAnyConfig(parts.config),
    placement: clonePlacement(parts.placement),
    sizing: cloneSizing(parts.sizing),
  }
  switch (field) {
    case 'common.description':
      next.common.description = String(value)
      return next
    case 'common.visible':
      next.common.visible = Boolean(value)
      return next
    case 'common.enabled':
      next.common.enabled = Boolean(value)
      return next
    case 'config.layout':
      if (next.config.kind === 'page' || next.config.kind === 'container' || next.config.kind === 'modal') {
        next.config.layout = value as typeof next.config.layout
        return next
      }
      break
    case 'config.gap':
      if (next.config.kind === 'page' || next.config.kind === 'container' || next.config.kind === 'modal') {
        next.config.gap = value as typeof next.config.gap
        return next
      }
      break
    case 'config.columns':
      if (next.config.kind === 'page' || next.config.kind === 'container' || next.config.kind === 'modal') {
        next.config.columns = value as typeof next.config.columns
        return next
      }
      break
    case 'config.justify':
      if (next.config.kind === 'page' || next.config.kind === 'container' || next.config.kind === 'modal') {
        next.config.justify = value as typeof next.config.justify
        return next
      }
      break
    case 'config.align':
      if (next.config.kind === 'page' || next.config.kind === 'container' || next.config.kind === 'modal') {
        next.config.align = value as typeof next.config.align
        return next
      }
      break
    case 'config.wrap':
      if (next.config.kind === 'page' || next.config.kind === 'container' || next.config.kind === 'modal') {
        next.config.wrap = Boolean(value)
        return next
      }
      break
    case 'config.text':
      if (next.config.kind === 'text') {
        next.config.text = String(value)
        return next
      }
      break
    case 'config.style':
      if (next.config.kind === 'text') {
        next.config.style = value as typeof next.config.style
        return next
      }
      break
    case 'config.label':
      if (
        next.config.kind === 'textInput' ||
        next.config.kind === 'select' ||
        next.config.kind === 'button' ||
        next.config.kind === 'link'
      ) {
        next.config.label = String(value)
        return next
      }
      break
    case 'config.inputType':
      if (next.config.kind === 'textInput') {
        next.config.inputType = value as typeof next.config.inputType
        return next
      }
      break
    case 'config.required':
      if (next.config.kind === 'textInput' || next.config.kind === 'select') {
        next.config.required = Boolean(value)
        return next
      }
      break
    case 'config.placeholder':
      if (next.config.kind === 'textInput') {
        next.config.placeholder = String(value)
        return next
      }
      break
    case 'config.defaultValue':
      if (next.config.kind === 'textInput' || next.config.kind === 'select') {
        next.config.defaultValue = String(value)
        return next
      }
      break
    case 'config.variant':
      if (next.config.kind === 'button') {
        next.config.variant = value as typeof next.config.variant
        return next
      }
      break
    case 'config.confirmationMessage':
      if (next.config.kind === 'button') {
        next.config.confirmationMessage = String(value)
        return next
      }
      break
    case 'config.preventDoubleSubmit':
      if (next.config.kind === 'button') {
        next.config.preventDoubleSubmit = Boolean(value)
        return next
      }
      break
    case 'config.source':
      if (next.config.kind === 'image') {
        next.config.source = String(value)
        return next
      }
      break
    case 'config.alt':
      if (next.config.kind === 'image') {
        next.config.alt = String(value)
        return next
      }
      break
    case 'config.fit':
      if (next.config.kind === 'image') {
        next.config.fit = value as typeof next.config.fit
        return next
      }
      break
    case 'config.aspectRatio':
      if (next.config.kind === 'image') {
        next.config.aspectRatio = value as typeof next.config.aspectRatio
        return next
      }
      break
    case 'config.placeholderStyle':
      if (next.config.kind === 'image') {
        next.config.placeholderStyle = value as typeof next.config.placeholderStyle
        return next
      }
      break
    case 'config.destination.screenId':
      if (next.config.kind === 'link' && next.config.destination.type === 'internal') {
        next.config.destination.screenId = String(value)
        return next
      }
      break
    case 'config.destination.url':
      if (next.config.kind === 'link' && (
        next.config.destination.type === 'external' || next.config.destination.type === 'resource'
      )) {
        next.config.destination.url = String(value)
        return next
      }
      break
    case 'config.destination.resourceId':
      if (next.config.kind === 'link' && next.config.destination.type === 'resource') {
        next.config.destination.resourceId = String(value)
        return next
      }
      break
    case 'config.destination.displayName':
      if (next.config.kind === 'link' && next.config.destination.type === 'resource') {
        next.config.destination.displayName = String(value)
        return next
      }
      break
    case 'config.openMode':
      if (next.config.kind === 'link') {
        next.config.openMode = value as typeof next.config.openMode
        return next
      }
      break
    case 'placement.edge':
      if (next.placement.mode === 'sticky') {
        next.placement.edge = value as typeof next.placement.edge
        return next
      }
      break
    case 'placement.inset':
      if (next.placement.mode === 'sticky') {
        next.placement.inset = value as typeof next.placement.inset
        return next
      }
      break
    case 'placement.anchor':
      if (next.placement.mode === 'overlay' || next.placement.mode === 'viewport') {
        next.placement.anchor = value as typeof next.placement.anchor
        return next
      }
      break
    case 'placement.insetX':
      if (next.placement.mode === 'overlay' || next.placement.mode === 'viewport') {
        next.placement.insetX = value as typeof next.placement.insetX
        return next
      }
      break
    case 'placement.insetY':
      if (next.placement.mode === 'overlay' || next.placement.mode === 'viewport') {
        next.placement.insetY = value as typeof next.placement.insetY
        return next
      }
      break
    case 'sizing.inlineSize':
      next.sizing.inlineSize = value as typeof next.sizing.inlineSize
      return next
    case 'sizing.minWidth':
      next.sizing.minWidth = value as typeof next.sizing.minWidth
      return next
    case 'sizing.maxWidth':
      next.sizing.maxWidth = value as typeof next.sizing.maxWidth
      return next
    case 'sizing.gridSpan':
      next.sizing.gridSpan = value as typeof next.sizing.gridSpan
      return next
    case 'sizing.grow':
      next.sizing.grow = value as typeof next.sizing.grow
      return next
    case 'sizing.shrink':
      next.sizing.shrink = value as typeof next.sizing.shrink
      return next
  }

  throw new DomainError(
    'INVARIANT_VIOLATION',
    `Field ${field} is not compatible with resolved component kind ${next.kind}`,
  )
}

function applyComponentOverrideToParts(
  parts: ResolvedParts,
  override: ComponentOverride | undefined,
): ResolvedParts {
  if (!override) return parts
  const next: ResolvedParts = {
    kind: parts.kind,
    common: cloneCommon(parts.common),
    config: cloneAnyConfig(parts.config),
    placement: clonePlacement(parts.placement),
    sizing: cloneSizing(parts.sizing),
  }
  if (override.visible !== undefined) next.common.visible = override.visible
  if (override.enabled !== undefined) next.common.enabled = override.enabled
  if (override.text !== undefined && next.config.kind === 'text') {
    next.config.text = override.text
  }
  if (
    override.value !== undefined &&
    (next.config.kind === 'textInput' || next.config.kind === 'select')
  ) {
    next.config.defaultValue = override.value
  }
  return next
}

function applyInstancePublicProps(
  scopes: DefinitionExpansionContext['publicPropScopes'],
  currentPath: [EntityId, ...EntityId[]],
  parts: ResolvedParts,
): ResolvedParts {
  let resolved = parts
  for (const scope of [...scopes].reverse()) {
    const relativePath = currentPath.slice(scope.pathPrefix.length)
    const bindingPath = (
      relativePath.length > 1 && relativePath[0] === scope.definition.rootNodeId
        ? relativePath.slice(1)
        : relativePath
    )
    for (const prop of scope.definition.publicProps) {
      if (!Object.prototype.hasOwnProperty.call(scope.props, prop.key)) continue
      const value = scope.props[prop.key] as PublicPropValue
      for (const binding of prop.bindings) {
        if (JSON.stringify(binding.nodePath) !== JSON.stringify(bindingPath)) continue
        resolved = applyResolvedFieldValue(resolved, binding.field, value)
      }
    }
  }
  return resolved
}

function resolveInlineDefinitionNode(
  definition: ComponentDefinition,
  node: ComponentDefinitionNode,
  variantId: EntityId | null,
): ResolvedParts {
  return applyVariantOverride(node, definition, variantId)
}

function resolveTargetPathForRoot(
  pathPrefix: readonly EntityId[],
  rootNodeId: EntityId,
): [EntityId, ...EntityId[]] {
  return (pathPrefix.length === 0
    ? [rootNodeId]
    : [...pathPrefix, rootNodeId]) as unknown as [EntityId, ...EntityId[]]
}

function resolveDefinitionExpansion(
  instanceFields: DefinitionInstanceFields & {
    id: EntityId
    screenId: EntityId
    parentId: EntityId | null
    placement: ComponentPlacement
    sizing: ComponentSizing
  },
  context: DefinitionExpansionContext,
): { rootId: string; definitionId: EntityId; definitionName: string } {
  if (context.boundaryDepth > MAX_DEFINITION_NESTING_DEPTH) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Definition nesting exceeds ${MAX_DEFINITION_NESTING_DEPTH}`,
    )
  }
  const definition = resolveComponentDefinitionRefV3(context.document, instanceFields.source.$ref)
  const expansionContext: DefinitionExpansionContext = {
    ...context,
    publicPropScopes: [
      ...context.publicPropScopes,
      {
        definition,
        props: instanceFields.props,
        pathPrefix: [...context.pathPrefix],
      },
    ],
  }
  const rootNode = definition.nodes[definition.rootNodeId]
  if (!rootNode) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Definition ${definition.id} root node ${definition.rootNodeId} is missing`,
    )
  }
  const rootPath = resolveTargetPathForRoot(context.pathPrefix, definition.rootNodeId)
  const rootRuntimeId = resolveDefinitionEntry(
    definition,
    rootNode,
    rootPath,
    context.pathPrefix.length === 0 ? [] : [...rootPath],
    instanceFields,
    expansionContext,
    true,
  )
  return { rootId: rootRuntimeId, definitionId: definition.id, definitionName: definition.name }
}

function resolveDefinitionEntry(
  definition: ComponentDefinition,
  node: ComponentDefinitionNode,
  currentPath: [EntityId, ...EntityId[]],
  descendantPrefix: EntityId[],
  ownerInstance: DefinitionInstanceFields & {
    id: EntityId
    screenId: EntityId
    parentId: EntityId | null
    placement: ComponentPlacement
    sizing: ComponentSizing
  },
  context: DefinitionExpansionContext,
  isBoundaryRoot: boolean,
): string {
  if (node.nodeType === 'definitionInstance') {
    const variant = ownerInstance.variantId === null
      ? undefined
      : definition.variants.find(candidate => candidate.id === ownerInstance.variantId)
    const override = variant?.nodeOverrides[node.id]
    const nestedInstance = {
      id: node.id,
      screenId: ownerInstance.screenId,
      parentId: null,
      source: node.source,
      props: { ...node.props },
      variantId: node.variantId,
      placement: isBoundaryRoot
        ? clonePlacement(ownerInstance.placement)
        : override?.placement
          ? clonePlacement(override.placement)
          : clonePlacement(node.placement),
      sizing: isBoundaryRoot
        ? cloneSizing(ownerInstance.sizing)
        : override?.sizing
          ? cloneSizing(override.sizing)
          : cloneSizing(node.sizing),
    }
    return resolveDefinitionExpansion(nestedInstance, {
      ...context,
      pathPrefix: [...currentPath],
      parentRuntimeId: context.parentRuntimeId,
      boundaryDepth: context.boundaryDepth + 1,
    }).rootId
  }

  let parts = resolveInlineDefinitionNode(definition, node, ownerInstance.variantId)
  if (isBoundaryRoot) {
    parts = {
      ...parts,
      placement: clonePlacement(ownerInstance.placement),
      sizing: cloneSizing(ownerInstance.sizing),
    }
  }
  parts = applyInstancePublicProps(context.publicPropScopes, currentPath, parts)
  if (isBoundaryRoot && context.forcedBoundaryVisibility !== null) {
    parts.common.visible = context.forcedBoundaryVisibility
  }
  const target = context.topLevelInstanceId
    ? definitionNodeTargetRef(context.topLevelInstanceId, currentPath)
    : collectionItemNodeTargetRef(
        context.collectionContext!.collectionId,
        currentPath,
      )
  parts = applyComponentOverrideToParts(
    parts,
    findScenarioOverride(
      context.activeScenario,
      target,
    )?.override,
  )
  validateCommonComponentSpec(parts.common, 'Resolved Definition common')
  validateDefinitionComponentConfig(parts.config, parts.kind, 'Resolved Definition config')
  validateComponentPlacement(parts.placement, 'Resolved Definition placement')
  validateComponentSizing(parts.sizing, 'Resolved Definition sizing')

  const runtimeId = toRuntimeId(target, context.collectionContext)
  const resolved = pushResolvedNode(context.accumulator, {
    id: runtimeId,
    namespacedId: runtimeId,
    screenId: context.screenId,
    screenComponentId: context.topLevelScreenComponentId,
    definitionId: definition.id,
    definitionNodeId: node.id,
    instanceId: context.topLevelInstanceId,
    collectionId: context.collectionContext?.collectionId ?? null,
    collectionItemKey: context.collectionContext?.itemKey ?? null,
    collectionItemIndex: context.collectionContext?.itemIndex ?? null,
    nodePath: [...currentPath] as unknown as [EntityId, ...EntityId[]],
    kind: parts.kind,
    placement: clonePlacement(parts.placement),
    sizing: cloneSizing(parts.sizing),
    common: cloneCommon(parts.common),
    config: cloneAnyConfig(parts.config),
    canonicalTarget: target,
    parentId: context.parentRuntimeId,
    instanceBoundary: {
      instanceId: context.topLevelInstanceId,
      depth: context.boundaryDepth,
      isBoundaryRoot,
    },
  })

  const childRuntimeIds: string[] = []
  for (const childId of node.childIds) {
    const child = definition.nodes[childId]
    if (!child) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Definition ${definition.id} child ${childId} is missing`,
      )
    }
    const childPath = [...descendantPrefix, child.id] as unknown as [EntityId, ...EntityId[]]
    const childRuntimeId = resolveDefinitionEntry(
      definition,
      child,
      childPath,
      childPath,
      ownerInstance,
      {
        ...context,
        parentRuntimeId: runtimeId,
      },
      false,
    )
    childRuntimeIds.push(childRuntimeId)
  }
  resolved.childIds = childRuntimeIds
  return runtimeId
}

function resolveInlineScreenNode(
  document: ProjectDocument,
  component: Extract<ScreenComponent, { nodeType: 'inline' }>,
  activeScenario: ScreenScenario | undefined,
  accumulator: ResolveAccumulator,
  parentRuntimeId: string | null,
): string {
  let parts: ResolvedParts = {
    kind: component.kind,
    common: cloneCommon(component.common),
    config: cloneAnyConfig(component.config),
    placement: clonePlacement(component.placement),
    sizing: cloneSizing(component.sizing),
  }
  parts = applyComponentOverrideToParts(
    parts,
    findScenarioOverride(activeScenario, inlineTargetRef(component.id))?.override,
  )

  const target = inlineTargetRef(component.id)
  const runtimeId = toRuntimeId(target)
  const resolved = pushResolvedNode(accumulator, {
    id: runtimeId,
    namespacedId: runtimeId,
    screenId: component.screenId,
    screenComponentId: component.id,
    definitionId: null,
    definitionNodeId: null,
    instanceId: null,
    collectionId: null,
    collectionItemKey: null,
    collectionItemIndex: null,
    nodePath: null,
    kind: parts.kind,
    placement: clonePlacement(parts.placement),
    sizing: cloneSizing(parts.sizing),
    common: cloneCommon(parts.common),
    config: cloneAnyConfig(parts.config),
    canonicalTarget: target,
    parentId: parentRuntimeId,
    instanceBoundary: {
      instanceId: null,
      depth: 0,
      isBoundaryRoot: false,
    },
  })

  const childIds = component.childIds.map(childId => {
    const child = document.components[childId]
    if (!child) {
      throw new DomainError('INVARIANT_VIOLATION', `Screen child ${childId} is missing`)
    }
    return resolveScreenEntry(document, child, activeScenario, accumulator, runtimeId)
  })
  resolved.childIds = childIds
  if (component.config.kind === 'collection') {
    const collectionConfig = component.config
    const seenItemKeys = new Set<string>()
    collectionConfig.dataSource.previewItems.forEach((item, itemIndex) => {
      const itemResolution = resolveCollectionItem(collectionConfig, item)
      if (seenItemKeys.has(itemResolution.itemKey)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Collection ${component.id} has duplicate preview item key ${itemResolution.itemKey}`,
        )
      }
      seenItemKeys.add(itemResolution.itemKey)
      const rootId = resolveDefinitionExpansion(
        {
          id: component.id,
          screenId: component.screenId,
          parentId: component.id,
          source: collectionConfig.itemTemplate.source,
          props: itemResolution.props,
          variantId: itemResolution.variantId,
          placement: DEFAULT_COMPONENT_PLACEMENT,
          sizing: DEFAULT_COMPONENT_SIZING,
        },
        {
          document,
          screenId: component.screenId,
          activeScenario,
          accumulator,
          topLevelInstanceId: null,
          topLevelScreenComponentId: component.id,
          collectionContext: {
            collectionId: component.id,
            itemKey: itemResolution.itemKey,
            itemIndex,
          },
          pathPrefix: [],
          parentRuntimeId: runtimeId,
          boundaryDepth: 1,
          forcedBoundaryVisibility: itemResolution.visible,
          publicPropScopes: [],
        },
      ).rootId
      resolved.childIds.push(rootId)
    })
  }
  return runtimeId
}

function resolveScreenEntry(
  document: ProjectDocument,
  component: ScreenComponent,
  activeScenario: ScreenScenario | undefined,
  accumulator: ResolveAccumulator,
  parentRuntimeId: string | null,
): string {
  if (isInlineScreenComponent(component)) {
    return resolveInlineScreenNode(
      document,
      component,
      activeScenario,
      accumulator,
      parentRuntimeId,
    )
  }
  return resolveDefinitionExpansion(component, {
    document,
    screenId: component.screenId,
    activeScenario,
    accumulator,
    topLevelInstanceId: component.id,
    collectionContext: null,
    topLevelScreenComponentId: component.id,
    pathPrefix: [],
    parentRuntimeId,
    boundaryDepth: 1,
    forcedBoundaryVisibility: null,
    publicPropScopes: [],
  }).rootId
}

export function resolveScreenNodes(
  document: ProjectDocument,
  screenId: EntityId,
  activeScenarioId: EntityId | null = null,
): ResolveScreenNodesResult {
  const screen = document.screens[screenId]
  if (!screen) {
    throw new DomainError('NOT_FOUND', `Screen ${screenId} not found`)
  }
  const activeScenario = activeScenarioId ? document.screenScenarios[activeScenarioId] : undefined
  const accumulator: ResolveAccumulator = {
    orderedNodes: [],
    nodesById: Object.create(null) as Record<string, MutableResolvedNode>,
    nodesByTarget: Object.create(null) as Record<string, MutableResolvedNode>,
    count: 0,
  }

  for (const rootId of [screen.rootComponentId, ...screen.modalComponentIds]) {
    const component = document.components[rootId]
    if (!component) {
      throw new DomainError('INVARIANT_VIOLATION', `Screen root ${rootId} is missing`)
    }
    resolveScreenEntry(document, component, activeScenario, accumulator, null)
  }

  return {
    screenId,
    orderedNodes: accumulator.orderedNodes,
    nodesById: accumulator.nodesById,
    nodesByTarget: accumulator.nodesByTarget,
  }
}

export function resolveComponentTarget(
  document: ProjectDocument,
  screenId: EntityId,
  target: ComponentTargetRef,
  activeScenarioId: EntityId | null = null,
): ResolvedRuntimeNode {
  const resolved = resolveScreenNodes(document, screenId, activeScenarioId)
  const targetKey = componentTargetRefKey(target)
  const node = resolved.nodesByTarget[targetKey] ??
    (target.type === 'collectionItemNode'
      ? resolveCollectionTemplateTarget(document, screenId, target, activeScenarioId)
      : undefined)
  if (!node) {
    throw new DomainError(
      'NOT_FOUND',
      `Target ${componentTargetRefKey(target)} is not reachable from screen ${screenId}`,
    )
  }
  return node
}

function resolveCollectionTemplateTarget(
  document: ProjectDocument,
  screenId: EntityId,
  target: Extract<ComponentTargetRef, { type: 'collectionItemNode' }>,
  activeScenarioId: EntityId | null,
): ResolvedRuntimeNode | undefined {
  const collection = getOwnEntity(document.components, target.collectionId)
  if (
    collection?.nodeType !== 'inline' ||
    collection.screenId !== screenId ||
    collection.config.kind !== 'collection'
  ) {
    return undefined
  }
  const activeScenario = activeScenarioId
    ? getOwnEntity(document.screenScenarios, activeScenarioId)
    : undefined
  const accumulator: ResolveAccumulator = {
    orderedNodes: [],
    nodesById: Object.create(null) as Record<string, MutableResolvedNode>,
    nodesByTarget: Object.create(null) as Record<string, MutableResolvedNode>,
    count: 0,
  }
  const templateDefaults = resolveCollectionTemplateDefaults(collection.config)
  resolveDefinitionExpansion(
    {
      id: collection.id,
      screenId,
      parentId: collection.id,
      source: collection.config.itemTemplate.source,
      props: templateDefaults.props,
      variantId: templateDefaults.variantId,
      placement: DEFAULT_COMPONENT_PLACEMENT,
      sizing: DEFAULT_COMPONENT_SIZING,
    },
    {
      document,
      screenId,
      activeScenario,
      accumulator,
      topLevelInstanceId: null,
      topLevelScreenComponentId: collection.id,
      collectionContext: {
        collectionId: collection.id,
        itemKey: '__canonical_template__',
        itemIndex: 0,
      },
      pathPrefix: [],
      parentRuntimeId: collection.id,
      boundaryDepth: 1,
      forcedBoundaryVisibility: templateDefaults.visible,
      publicPropScopes: [],
    },
  )
  return accumulator.nodesByTarget[componentTargetRefKey(target)]
}

export function resolveDefinitionInstanceRoot(
  document: ProjectDocument,
  instance: DefinitionInstanceScreenNode,
  activeScenarioId: EntityId | null = null,
): ResolvedDefinitionInstanceRoot {
  const resolved = resolveComponentTarget(
    document,
    instance.screenId,
    definitionNodeTargetRef(
      instance.id,
      resolveTargetPathForRoot(
        [],
        resolveComponentDefinitionRefV3(document, instance.source.$ref).rootNodeId,
      ),
    ),
    activeScenarioId,
  )
  const definition = resolveComponentDefinitionRefV3(document, instance.source.$ref)
  return {
    component: {
      ...instance,
      kind: resolved.kind,
      common: cloneCommon(resolved.common),
      config: cloneAnyConfig(resolved.config),
      definitionId: definition.id,
      definitionName: definition.name,
      rootTarget: cloneComponentTargetRef(resolved.canonicalTarget) as Extract<
        ComponentTargetRef,
        { type: 'definitionNode' }
      >,
    },
    resolved,
  }
}
