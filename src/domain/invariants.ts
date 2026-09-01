import {
  CONTAINER_KINDS,
  LEAF_KINDS,
  type ComponentDefinition,
  type ComponentDefinitionNode,
  type ComponentKind,
  type BehaviorValueSource,
  type DefinitionComponentConfig,
  type EntityId,
  type ProjectDocument,
  type PublicProp,
  type PublicPropFieldV3,
  type Screen,
  type ValidationRule,
  type VariantNodeOverride,
  isInlineDefinitionNode,
  isInlineScreenComponent,
} from './model'
import {
  assertCanonicalRootPlacementsV3,
  assertUniqueVariantPropertyCombinationsV3,
  resolveComponentDefinitionRefV3,
} from './canonicalProjectSpecV3'
import { validateSizingContext, isRootSizing } from './componentSizing'
import { resolveComponentTarget, resolvePublicPropFieldType, resolveScreenNodes, MAX_DEFINITION_NESTING_DEPTH, MAX_RESOLVED_SCREEN_NODE_COUNT } from './definitionResolver'
import { DomainError } from './errors'
import {
  collectionItemNodeTargetRef,
  componentTargetRefEquals,
  componentTargetRefKey,
  inlineTargetRef,
} from './componentTargets'
import {
  getOwnEntity,
  hasOwnEntity,
} from './entityMap'
import {
  validateComponentConfig,
  validateProjectDocumentMetadata,
  validateDefinitionComponentConfig,
} from './runtimeValidation'
import {
  parseJsonPointer,
  resolveJsonPointer,
  resolveCollectionItem,
  validateCollectionPreviewItems,
} from './collection'

function validateItemBehaviorSource(
  document: ProjectDocument,
  screenId: EntityId,
  collectionId: EntityId,
  source: BehaviorValueSource,
  label: string,
  allowNull: boolean,
): void {
  if (source.type === 'literal') {
    if (!allowNull && source.value === null) {
      throw new DomainError('INVARIANT_VIOLATION', `${label} must not be null`)
    }
    return
  }
  parseJsonPointer(source.path, label)
  const collection = getOwnEntity(document.components, collectionId)
  if (
    !collection ||
    collection.screenId !== screenId ||
    !isInlineScreenComponent(collection) ||
    collection.config.kind !== 'collection'
  ) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} requires a Collection on the same screen`,
    )
  }
  for (const [index, item] of collection.config.dataSource.previewItems.entries()) {
    const result = resolveJsonPointer(item, source.path, label)
    if (!result.found) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `${label} is missing from preview item ${index + 1}`,
      )
    }
    if (typeof result.value === 'object' && result.value !== null) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `${label} must resolve to a scalar`,
      )
    }
    if (!allowNull && result.value === null) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `${label} must not resolve to null`,
      )
    }
  }
}

const VARIANT_FIELD_TO_PUBLIC_PROP_FIELD: Partial<Record<keyof NonNullable<VariantNodeOverride['config']>, PublicPropFieldV3>> = {
  layout: 'config.layout',
  gap: 'config.gap',
  columns: 'config.columns',
  justify: 'config.justify',
  align: 'config.align',
  wrap: 'config.wrap',
  text: 'config.text',
  style: 'config.style',
  label: 'config.label',
  inputType: 'config.inputType',
  required: 'config.required',
  placeholder: 'config.placeholder',
  defaultValue: 'config.defaultValue',
  variant: 'config.variant',
  confirmationMessage: 'config.confirmationMessage',
  preventDoubleSubmit: 'config.preventDoubleSubmit',
  source: 'config.source',
  alt: 'config.alt',
  fit: 'config.fit',
  aspectRatio: 'config.aspectRatio',
  placeholderStyle: 'config.placeholderStyle',
  openMode: 'config.openMode',
}

function validateValidationRules(rules: readonly ValidationRule[], label: string): void {
  const ids = new Set<EntityId>()
  const singletonTypes = new Set<ValidationRule['type']>()
  const patterns = new Set<string>()
  const customDescriptions = new Set<string>()
  let minLength: number | null = null
  let maxLength: number | null = null

  for (const rule of rules) {
    if (ids.has(rule.id)) {
      throw new DomainError('INVARIANT_VIOLATION', `${label} has duplicate rule ID ${rule.id}`)
    }
    ids.add(rule.id)
    if (!rule.message.trim()) {
      throw new DomainError('INVARIANT_VIOLATION', `${label} rule ${rule.id} has an empty message`)
    }
    if (rule.type === 'pattern') {
      const pattern = rule.value.trim()
      if (!pattern || patterns.has(pattern)) {
        throw new DomainError('INVARIANT_VIOLATION', `${label} has an empty or duplicate pattern`)
      }
      try {
        new RegExp(pattern)
      } catch {
        throw new DomainError('INVARIANT_VIOLATION', `${label} has an invalid pattern`)
      }
      patterns.add(pattern)
      continue
    }
    if (rule.type === 'custom') {
      const description = rule.description.trim()
      if (!description || customDescriptions.has(description)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `${label} has an empty or duplicate custom rule`,
        )
      }
      customDescriptions.add(description)
      continue
    }
    if (singletonTypes.has(rule.type)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `${label} has duplicate ${rule.type} rules`,
      )
    }
    singletonTypes.add(rule.type)
    if (rule.type === 'minLength' || rule.type === 'maxLength') {
      if (!Number.isSafeInteger(rule.value) || rule.value < 0) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `${label} ${rule.type} must be a non-negative safe integer`,
        )
      }
      if (rule.type === 'minLength') minLength = rule.value
      else maxLength = rule.value
    }
  }
  if (minLength !== null && maxLength !== null && minLength > maxLength) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} minLength cannot exceed maxLength`,
    )
  }
}

function resolveDefinitionInlineNodePath(
  document: ProjectDocument,
  definition: ComponentDefinition,
  nodePath: readonly EntityId[],
  label: string,
): Extract<ComponentDefinitionNode, { nodeType: 'inline' }> {
  const root = getOwnEntity(definition.nodes, definition.rootNodeId)
  if (!root || !isInlineDefinitionNode(root)) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Definition ${definition.id} root must be an inline node`,
    )
  }
  if (nodePath.length === 1 && nodePath[0] === definition.rootNodeId) {
    return root
  }
  if (nodePath[0] === definition.rootNodeId) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} must omit the current definition root ID except when targeting the root itself`,
    )
  }
  return resolveInlineChildPath(document, definition, root, nodePath, label)
}

function resolveInlineChildPath(
  document: ProjectDocument,
  definition: ComponentDefinition,
  current: Extract<ComponentDefinitionNode, { nodeType: 'inline' }>,
  remaining: readonly EntityId[],
  label: string,
): Extract<ComponentDefinitionNode, { nodeType: 'inline' }> {
  const [segment, ...rest] = remaining
  if (!segment || !current.childIds.includes(segment)) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} targets an unknown child path segment ${segment ?? '(missing)'}`,
    )
  }
  const nextNode = getOwnEntity(definition.nodes, segment)
  if (!nextNode) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} targets a missing definition node ${segment}`,
    )
  }
  if (nextNode.nodeType === 'inline') {
    if (rest.length === 0) return nextNode
    return resolveInlineChildPath(document, definition, nextNode, rest, label)
  }

  const nestedDefinition = resolveComponentDefinitionRefV3(document, nextNode.source.$ref)
  const nestedRoot = getOwnEntity(nestedDefinition.nodes, nestedDefinition.rootNodeId)
  if (!nestedRoot || !isInlineDefinitionNode(nestedRoot)) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Nested definition ${nestedDefinition.id} root must be an inline node`,
    )
  }
  if (rest.length === 0 || rest[0] !== nestedDefinition.rootNodeId) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} must include nested definition root ${nestedDefinition.rootNodeId}`,
    )
  }
  if (rest.length === 1) return nestedRoot
  return resolveInlineChildPath(document, nestedDefinition, nestedRoot, rest.slice(1), label)
}

function resolvedPartsForDefinitionNode(
  node: Extract<ComponentDefinitionNode, { nodeType: 'inline' }>,
): {
  kind: ComponentKind
  common: typeof node.common
  config: DefinitionComponentConfig
  placement: typeof node.placement
  sizing: typeof node.sizing
} {
  return {
    kind: node.kind,
    common: node.common,
    config: node.config,
    placement: node.placement,
    sizing: node.sizing,
  }
}

function validatePublicPropCompatibility(
  document: ProjectDocument,
  definition: ComponentDefinition,
  prop: PublicProp,
  propIndex: number,
): void {
  for (let bindingIndex = 0; bindingIndex < prop.bindings.length; bindingIndex += 1) {
    const binding = prop.bindings[bindingIndex]!
    const targetNode = resolveDefinitionInlineNodePath(
      document,
      definition,
      binding.nodePath,
      `Definition ${definition.id} publicProps[${propIndex}].bindings[${bindingIndex}]`,
    )
    const fieldType = resolvePublicPropFieldType(
      resolvedPartsForDefinitionNode(targetNode),
      binding.field,
    )
    if (fieldType === null) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Definition ${definition.id} public prop ${prop.key} cannot bind ${binding.field} on ${targetNode.id}`,
      )
    }
    if (fieldType !== prop.type) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Definition ${definition.id} public prop ${prop.key} type ${prop.type} is incompatible with ${binding.field} (${fieldType})`,
      )
    }
  }

}

function validateInstanceProps(
  definition: ComponentDefinition,
  props: Readonly<Record<string, string | number | boolean>>,
  label: string,
): void {
  const declarations = new Map(definition.publicProps.map(prop => [prop.key, prop]))
  for (const [key, value] of Object.entries(props)) {
    const declaration = declarations.get(key)
    if (!declaration) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `${label} provides unknown public prop ${key}`,
      )
    }
    const valid = declaration.type === 'enum'
      ? typeof value === 'string' && declaration.values.includes(value)
      : declaration.type === 'number'
        ? typeof value === 'number' && Number.isFinite(value)
        : typeof value === declaration.type
    if (!valid) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `${label} public prop ${key} must be a valid ${declaration.type} value`,
      )
    }
  }
}

function validateVariantOverrideCompatibility(
  definition: ComponentDefinition,
  nodeId: EntityId,
  override: VariantNodeOverride,
): void {
  const node = getOwnEntity(definition.nodes, nodeId)
  if (!node) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Definition ${definition.id} variant targets missing node ${nodeId}`,
    )
  }
  if (!isInlineDefinitionNode(node)) {
    if (override.common || override.config) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Definition ${definition.id} variant cannot override common/config on nested instance ${nodeId}`,
      )
    }
    return
  }

  if (override.config) {
    const nextConfig = {
      ...node.config,
      ...override.config,
    } as DefinitionComponentConfig
    validateDefinitionComponentConfig(
      nextConfig,
      node.kind,
      `Definition ${definition.id} variant ${nodeId} config`,
    )
    for (const [field, value] of Object.entries(override.config)) {
      if (field === 'destination') {
        if (node.config.kind !== 'link') {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `Definition ${definition.id} variant cannot override destination on ${node.kind}`,
          )
        }
        void value
        continue
      }
      const publicField = VARIANT_FIELD_TO_PUBLIC_PROP_FIELD[
        field as keyof typeof VARIANT_FIELD_TO_PUBLIC_PROP_FIELD
      ]
      if (!publicField) continue
      const fieldType = resolvePublicPropFieldType(
        resolvedPartsForDefinitionNode(node),
        publicField,
      )
      if (fieldType === null) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Definition ${definition.id} variant cannot override ${field} on ${node.kind}`,
        )
      }
    }
  }
}

function validateDefinitionStructure(
  definition: ComponentDefinition,
  document: ProjectDocument,
): void {
  const root = getOwnEntity(definition.nodes, definition.rootNodeId)
  if (!root || !isInlineDefinitionNode(root)) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Definition ${definition.id} root node ${definition.rootNodeId} must resolve to an inline node`,
    )
  }
  if (root.parentId !== null) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Definition ${definition.id} root node must have parentId null`,
    )
  }

  const reached = new Set<EntityId>()
  const visiting = new Set<EntityId>()
  function visit(nodeId: EntityId, expectedParentId: EntityId | null): void {
    if (visiting.has(nodeId)) {
      throw new DomainError('INVARIANT_VIOLATION', `Cycle detected at definition node ${nodeId}`)
    }
    if (reached.has(nodeId)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Definition node ${nodeId} is reachable from more than one parent`,
      )
    }
    const node = getOwnEntity(definition.nodes, nodeId)
    if (!node) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Definition ${definition.id} node ${nodeId} is missing`,
      )
    }
    if (node.parentId !== expectedParentId) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Definition node ${nodeId} has inconsistent parentId`,
      )
    }
    visiting.add(nodeId)
    reached.add(nodeId)
    if (isInlineDefinitionNode(node)) {
      if (node.kind === 'collection') {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Definition ${definition.id} cannot contain screen-owned Collection ${node.id}`,
        )
      }
      const config = node.config
      validateDefinitionComponentConfig(
        config,
        node.kind,
        `Definition ${definition.id} node ${node.id} config`,
      )
      if (
        config.kind === 'select' &&
        !config.options.some(option => option.value === config.defaultValue)
      ) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Definition ${definition.id} Select ${node.id} defaultValue must match one of its options`,
        )
      }
      if (
        config.kind === 'link' &&
        config.destination.type === 'internal' &&
        !hasOwnEntity(document.screens, config.destination.screenId)
      ) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Definition ${definition.id} Link ${node.id} references non-existent screen ${config.destination.screenId}`,
        )
      }
      if (LEAF_KINDS.includes(node.kind) && node.childIds.length > 0) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Leaf definition node ${nodeId} must not have children`,
        )
      }
      if (node.childIds.length > 0 && !CONTAINER_KINDS.includes(node.kind)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Non-container definition node ${nodeId} must not have children`,
        )
      }
      for (const childId of node.childIds) visit(childId, node.id)
    } else {
      if (node.childIds.length > 0) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Nested definition instance ${nodeId} must not have children`,
        )
      }
      const nestedDefinition = resolveComponentDefinitionRefV3(document, node.source.$ref)
      if (node.variantId !== null && !nestedDefinition.variants.some(variant => variant.id === node.variantId)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Nested definition instance ${nodeId} references missing variant ${node.variantId}`,
        )
      }
      validateInstanceProps(
        nestedDefinition,
        node.props,
        `Nested definition instance ${nodeId}`,
      )
    }
    visiting.delete(nodeId)
  }
  visit(definition.rootNodeId, null)
  if (reached.size !== Object.keys(definition.nodes).length) {
    const orphan = Object.keys(definition.nodes).find(nodeId => !reached.has(nodeId))
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Definition ${definition.id} node ${orphan ?? 'unknown'} is not reachable from the root`,
    )
  }

  if (new Set(definition.publicProps.map(prop => prop.key)).size !== definition.publicProps.length) {
    throw new DomainError('INVARIANT_VIOLATION', `Definition ${definition.id} public prop keys must be unique`)
  }
  if (
    new Set(definition.variantProperties.map(property => property.key)).size !==
      definition.variantProperties.length
  ) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Definition ${definition.id} variant property keys must be unique`,
    )
  }
  if (new Set(definition.variants.map(variant => variant.id)).size !== definition.variants.length) {
    throw new DomainError('INVARIANT_VIOLATION', `Definition ${definition.id} variant IDs must be unique`)
  }
  if (
    definition.representativeVariantId !== null &&
    !definition.variants.some(variant => variant.id === definition.representativeVariantId)
  ) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Definition ${definition.id} representativeVariantId is missing`,
    )
  }

  definition.publicProps.forEach((prop, index) =>
    validatePublicPropCompatibility(document, definition, prop, index),
  )

  const propertyKeys = definition.variantProperties.map(property => property.key)
  const propertyValuesByKey = new Map(
    definition.variantProperties.map(property => [property.key, new Set(property.values)]),
  )
  definition.variants.forEach(variant => {
    const keys = Object.keys(variant.propertyValues)
    if (new Set(keys).size !== keys.length || keys.length !== propertyKeys.length) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Definition ${definition.id} variant ${variant.id} must define every variant property exactly once`,
      )
    }
    for (const key of propertyKeys) {
      const value = variant.propertyValues[key]
      if (typeof value !== 'string' || !propertyValuesByKey.get(key)?.has(value)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Definition ${definition.id} variant ${variant.id} has an invalid value for ${key}`,
        )
      }
    }
    for (const [nodeId, override] of Object.entries(variant.nodeOverrides)) {
      validateVariantOverrideCompatibility(definition, nodeId, override)
    }
  })
  assertUniqueVariantPropertyCombinationsV3(definition)
}

function validateDefinitionGraph(document: ProjectDocument): void {
  const visiting = new Set<EntityId>()

  function expandedCount(definitionId: EntityId, depth: number): number {
    if (depth > MAX_DEFINITION_NESTING_DEPTH) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Definition nesting exceeds ${MAX_DEFINITION_NESTING_DEPTH}`,
      )
    }
    if (visiting.has(definitionId)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Definition reference cycle detected at ${definitionId}`,
      )
    }
    const definition = getOwnEntity(document.componentDefinitions, definitionId)
    if (!definition) {
      throw new DomainError('INVARIANT_VIOLATION', `Missing definition ${definitionId}`)
    }
    visiting.add(definitionId)
    let count = 0
    for (const node of Object.values(definition.nodes)) {
      if (isInlineDefinitionNode(node)) {
        if (node.config.kind === 'textInput') {
          validateValidationRules(
            node.config.validationRules,
            `Definition ${definition.id} node ${node.id}`,
          )
        }
        count += 1
        continue
      }
      const nestedDefinition = resolveComponentDefinitionRefV3(document, node.source.$ref)
      if (nestedDefinition.id === definitionId) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Definition ${definitionId} cannot reference itself`,
        )
      }
      count += expandedCount(nestedDefinition.id, depth + 1)
    }
    visiting.delete(definitionId)
    if (count > MAX_RESOLVED_SCREEN_NODE_COUNT) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Definition ${definitionId} expands beyond ${MAX_RESOLVED_SCREEN_NODE_COUNT} nodes`,
      )
    }
    return count
  }

  Object.values(document.componentDefinitions).forEach(definition => {
    validateDefinitionStructure(definition, document)
    expandedCount(definition.id, 1)
  })
}

function validateScreenComponentStructure(screen: Screen, document: ProjectDocument): void {
  const root = getOwnEntity(document.components, screen.rootComponentId)
  if (!root || !isInlineScreenComponent(root) || root.kind !== 'page') {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Screen ${screen.id} root must be an inline page component`,
    )
  }
  if (root.parentId !== null || root.screenId !== screen.id) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Screen ${screen.id} root must belong to the screen and have parentId null`,
    )
  }
  const rootIds = [screen.rootComponentId, ...screen.modalComponentIds]
  if (new Set(rootIds).size !== rootIds.length) {
    throw new DomainError('INVARIANT_VIOLATION', `Screen ${screen.id} root IDs must be unique`)
  }
  for (const modalId of screen.modalComponentIds) {
    const modal = getOwnEntity(document.components, modalId)
    if (!modal || !isInlineScreenComponent(modal) || modal.kind !== 'modal' || modal.parentId !== null || modal.screenId !== screen.id) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Modal root ${modalId} must be a parentless inline modal on screen ${screen.id}`,
      )
    }
  }

  const screenComponents = Object.values(document.components).filter(component => component.screenId === screen.id)
  const reached = new Set<EntityId>()
  const visiting = new Set<EntityId>()
  function visit(componentId: EntityId, expectedParentId: EntityId | null): void {
    if (visiting.has(componentId)) {
      throw new DomainError('INVARIANT_VIOLATION', `Cycle detected at component ${componentId}`)
    }
    if (reached.has(componentId)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Component ${componentId} is reachable from more than one screen root`,
      )
    }
    const component = getOwnEntity(document.components, componentId)
    if (!component || component.screenId !== screen.id) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Component ${componentId} is missing or belongs to a different screen`,
      )
    }
    if (component.parentId !== expectedParentId) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Component ${componentId} has inconsistent parentId`,
      )
    }
    visiting.add(componentId)
    reached.add(componentId)
    if (isInlineScreenComponent(component)) {
      if (component.kind === 'page' && component.id !== screen.rootComponentId) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Page component ${component.id} must be the screen root`,
        )
      }
      if (component.kind === 'modal' && !screen.modalComponentIds.includes(component.id)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Modal component ${component.id} must be a listed modal root`,
        )
      }
      if (LEAF_KINDS.includes(component.kind) && component.childIds.length > 0) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Leaf component ${component.id} must not have children`,
        )
      }
      if (component.childIds.length > 0 && !CONTAINER_KINDS.includes(component.kind)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Non-container component ${component.id} must not have children`,
        )
      }
      for (const childId of component.childIds) visit(childId, component.id)
    } else if (component.childIds.length > 0) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Definition instance ${component.id} must not have screen children`,
      )
    }
    visiting.delete(componentId)
  }

  rootIds.forEach(rootId => visit(rootId, null))
  if (reached.size !== screenComponents.length) {
    const orphan = screenComponents.find(component => !reached.has(component.id))
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Component ${orphan?.id ?? 'unknown'} is not reachable from the page or a modal root`,
    )
  }

  for (const component of screenComponents) {
    if (component.parentId === null) {
      const isListedRoot = rootIds.includes(component.id)
      if (!isListedRoot) {
        throw new DomainError('INVARIANT_VIOLATION', `Unlisted component root ${component.id}`)
      }
      if (!isRootSizing(component.sizing)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Independent root ${component.id} must use fixed root sizing`,
        )
      }
      if (component.placement.mode !== 'flow') {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Independent root ${component.id} placement must remain flow`,
        )
      }
      continue
    }
    const parent = getOwnEntity(document.components, component.parentId)
    if (!parent || parent.screenId !== screen.id) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Component ${component.id} parent must exist in the same screen`,
      )
    }
    if (!isInlineScreenComponent(parent) || !CONTAINER_KINDS.includes(parent.kind)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Component ${component.id} parent ${parent.id} must be an inline container`,
      )
    }
    validateSizingContext(
      component.sizing,
      component.placement,
      parent.config.kind === 'page' || parent.config.kind === 'container' || parent.config.kind === 'modal'
        ? parent.config
        : null,
      `Component ${component.id} sizing`,
    )
  }
}

function validateResolvedScreenSemantics(
  screen: Screen,
  document: ProjectDocument,
  resolved: ReturnType<typeof resolveScreenNodes>,
): void {
  for (const node of resolved.orderedNodes) {
    const config = node.config
    if (
      config.kind === 'select' &&
      !config.options.some(option => option.value === config.defaultValue)
    ) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Resolved Select ${node.id} defaultValue must match one of its options`,
      )
    }
    if (
      config.kind === 'link' &&
      config.destination.type === 'internal' &&
      !hasOwnEntity(document.screens, config.destination.screenId)
    ) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Resolved Link ${node.id} references non-existent screen ${config.destination.screenId}`,
      )
    }
    if (!node.parentId) continue
    const parent = resolved.nodesById[node.parentId]
    const parentLayout = parent && (
      parent.config.kind === 'page' ||
      parent.config.kind === 'container' ||
      parent.config.kind === 'modal'
    )
      ? parent.config
      : null
    validateSizingContext(
      node.sizing,
      node.placement,
      parentLayout,
      `Resolved component ${node.id} sizing on screen ${screen.id}`,
    )
  }
}

function validateScenarios(screen: Screen, document: ProjectDocument): void {
  const seenScenarioIds = new Set(screen.scenarioIds)
  if (seenScenarioIds.size !== screen.scenarioIds.length) {
    throw new DomainError('INVARIANT_VIOLATION', `Screen ${screen.id} scenarioIds contains duplicates`)
  }
  for (const scenarioId of screen.scenarioIds) {
    const scenario = getOwnEntity(document.screenScenarios, scenarioId)
    if (!scenario || scenario.screenId !== screen.id) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Scenario ${scenarioId} is missing or belongs to a different screen`,
      )
    }
  }
  for (const scenario of Object.values(document.screenScenarios)) {
    if (scenario.screenId !== screen.id) continue
    if (!screen.scenarioIds.includes(scenario.id)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Scenario ${scenario.id} is not listed by its owning screen`,
      )
    }
    const seenTargets = new Set<string>()
    for (const entry of scenario.componentOverrides) {
      const key = componentTargetRefKey(entry.target)
      if (seenTargets.has(key)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Scenario ${scenario.id} has duplicate override target ${key}`,
        )
      }
      seenTargets.add(key)
      const targetNode = resolveComponentTarget(document, screen.id, entry.target, null)
      if (entry.override.text !== undefined && targetNode.config.kind !== 'text') {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Scenario ${scenario.id} text override requires a text node target`,
        )
      }
      if (
        entry.override.value !== undefined &&
        targetNode.config.kind !== 'textInput' &&
        targetNode.config.kind !== 'select'
      ) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Scenario ${scenario.id} value override requires an input/select target`,
        )
      }
      if (
        entry.override.value !== undefined &&
        targetNode.config.kind === 'select' &&
        !targetNode.config.options.some(option => option.value === entry.override.value)
      ) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Scenario ${scenario.id} value override is not an option of Select target ${key}`,
        )
      }
    }
  }
}

function validateEvents(screen: Screen, document: ProjectDocument): void {
  const seenEventIds = new Set(screen.eventIds)
  if (seenEventIds.size !== screen.eventIds.length) {
    throw new DomainError('INVARIANT_VIOLATION', `Screen ${screen.id} eventIds contains duplicates`)
  }
  for (const eventId of screen.eventIds) {
    const event = getOwnEntity(document.events, eventId)
    if (!event || event.screenId !== screen.id) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Event ${eventId} is missing or belongs to a different screen`,
      )
    }
  }
  for (const event of Object.values(document.events)) {
    if (event.screenId !== screen.id) continue
    if (!screen.eventIds.includes(event.id)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Event ${event.id} is not listed by its screen`,
      )
    }
    resolveComponentTarget(document, screen.id, event.trigger.target, null)
    for (const action of event.actions) {
      if (action.type === 'setScenario') {
        const scenario = getOwnEntity(document.screenScenarios, action.scenarioId)
        if (!scenario || scenario.screenId !== screen.id) {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `Event ${event.id} references a scenario outside its screen`,
          )
        }
      }
      if (action.type === 'callApi') {
        const apiOperation = getOwnEntity(document.apiOperations, action.apiOperationId)
        if (!apiOperation || apiOperation.screenId !== screen.id) {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `Event ${event.id} references an API operation outside its screen`,
          )
        }
      }
      if (action.type === 'navigate' && !hasOwnEntity(document.screens, action.destinationScreenId)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Event ${event.id} references a missing destination screen`,
        )
      }
      if (action.type === 'navigate') {
        for (const [kind, parameters] of [
          ['route', action.routeParameters],
          ['query', action.queryParameters],
        ] as const) {
          for (const [name, source] of Object.entries(parameters ?? {})) {
            if (!name.trim()) {
              throw new DomainError(
                'INVARIANT_VIOLATION',
                `Event ${event.id} ${kind} parameter name must not be empty`,
              )
            }
            if (source.type === 'item') {
              if (event.trigger.target.type !== 'collectionItemNode') {
                throw new DomainError(
                  'INVARIANT_VIOLATION',
                  `Event ${event.id} item parameter requires a Collection item trigger`,
                )
              }
              validateItemBehaviorSource(
                document,
                screen.id,
                event.trigger.target.collectionId,
                source,
                `Event ${event.id} ${kind} parameter ${name}`,
                false,
              )
            } else {
              validateItemBehaviorSource(
                document,
                screen.id,
                '',
                source,
                `Event ${event.id} ${kind} parameter ${name}`,
                false,
              )
            }
          }
        }
      }
    }
  }
}

function validateApiOperations(screen: Screen, document: ProjectDocument): void {
  for (const operation of Object.values(document.apiOperations)) {
    if (operation.screenId !== screen.id) continue
    const bindingTargets = new Set<string>()
    const targetPaths = new Set<string>()
    const itemBindings = operation.requestBindings.filter(binding => binding.source.type === 'item')
    const callers = Object.values(document.events).filter(event =>
      event.screenId === screen.id &&
      event.actions.some(action =>
        action.type === 'callApi' && action.apiOperationId === operation.id))
    const callerCollectionIds = new Set(callers.flatMap(event =>
      event.trigger.target.type === 'collectionItemNode'
        ? [event.trigger.target.collectionId]
        : []))
    if (
      itemBindings.length > 0 &&
      (
        callers.length === 0 ||
        callerCollectionIds.size !== 1 ||
        callers.some(event => event.trigger.target.type !== 'collectionItemNode')
      )
    ) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `API operation ${operation.id} item bindings require callers from one Collection`,
      )
    }
    for (const binding of operation.requestBindings) {
      if (binding.source.type === 'item') {
        validateItemBehaviorSource(
          document,
          screen.id,
          [...callerCollectionIds][0]!,
          binding.source,
          `API operation ${operation.id} binding ${binding.targetPath}`,
          true,
        )
      } else if (binding.source.type !== 'literal') {
        const resolved = resolveComponentTarget(document, screen.id, binding.source, null)
        if (resolved.config.kind !== 'textInput' && resolved.config.kind !== 'select') {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `API operation ${operation.id} binding source must resolve to an input component`,
          )
        }
      }
      if (binding.source.type !== 'item' && binding.source.type !== 'literal') {
        const targetKey = componentTargetRefKey(binding.source)
        if (bindingTargets.has(targetKey)) {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `API operation ${operation.id} has a duplicate binding source ${targetKey}`,
          )
        }
        bindingTargets.add(targetKey)
      }
      const targetPath = binding.targetPath.trim()
      if (targetPath.length === 0) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `API operation ${operation.id} binding targetPath must not be empty`,
        )
      }
      if (targetPaths.has(targetPath)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `API operation ${operation.id} has duplicate binding targetPath ${targetPath}`,
        )
      }
      targetPaths.add(targetPath)
    }
    if (operation.successScenarioId !== null) {
      const scenario = getOwnEntity(document.screenScenarios, operation.successScenarioId)
      if (!scenario || scenario.screenId !== screen.id) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `API operation ${operation.id} successScenarioId belongs to a different screen`,
        )
      }
    }
    if (operation.errorScenarioId !== null) {
      const scenario = getOwnEntity(document.screenScenarios, operation.errorScenarioId)
      if (!scenario || scenario.screenId !== screen.id) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `API operation ${operation.id} errorScenarioId belongs to a different screen`,
        )
      }
    }
  }
}

function validateScreenOwnedButtonLinks(screen: Screen, document: ProjectDocument): void {
  for (const component of Object.values(document.components)) {
    if (!isInlineScreenComponent(component) || component.screenId !== screen.id) continue
    if (component.config.kind !== 'button' || component.config.eventId === null) continue
    const event = getOwnEntity(document.events, component.config.eventId)
    if (!event || event.screenId !== screen.id) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Button ${component.id} references an event outside its screen`,
      )
    }
    if (!componentTargetRefEquals(event.trigger.target, inlineTargetRef(component.id))) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Button ${component.id} eventId must point to an event triggered by that same inline button`,
      )
    }
  }
}

export function validateInvariants(doc: ProjectDocument): void {
  validateProjectDocumentMetadata(doc)

  const { project, screens, components } = doc
  const screenIdSet = new Set(project.screenIds)
  if (screenIdSet.size !== project.screenIds.length) {
    throw new DomainError('INVARIANT_VIOLATION', 'Project screenIds contains duplicates')
  }
  if (project.screenIds.length === 0) {
    throw new DomainError('INVARIANT_VIOLATION', 'Project must have at least one screen')
  }
  for (const screenId of project.screenIds) {
    if (!hasOwnEntity(screens, screenId)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Screen ${screenId} referenced in project.screenIds but not found`,
      )
    }
  }
  for (const screen of Object.values(screens)) {
    if (!screenIdSet.has(screen.id)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Screen ${screen.id} is not listed in project.screenIds`,
      )
    }
  }

  const routes = Object.values(screens).map(screen => screen.route)
  if (new Set(routes).size !== routes.length) {
    throw new DomainError('INVARIANT_VIOLATION', 'Screen routes must be unique')
  }

  for (const component of Object.values(components)) {
    if (!hasOwnEntity(screens, component.screenId)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Component ${component.id} references non-existent screen ${component.screenId}`,
      )
    }
    if (isInlineScreenComponent(component)) {
      validateComponentConfig(component.config, component.kind, `components.${component.id}.config`)
      if (component.config.kind === 'textInput') {
        validateValidationRules(component.config.validationRules, `TextInput ${component.id}`)
      }
      if (component.config.kind === 'select') {
        const selectConfig = component.config
        if (!selectConfig.options.some(option => option.value === selectConfig.defaultValue)) {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `Select ${component.id} defaultValue must match one of its options`,
          )
        }
      }
      if (
        component.config.kind === 'link' &&
        component.config.destination.type === 'internal' &&
        !hasOwnEntity(screens, component.config.destination.screenId)
      ) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Link ${component.id} references non-existent screen ${component.config.destination.screenId}`,
        )
      }
      if (component.config.kind === 'collection') {
        const config = component.config
        parseJsonPointer(config.dataSource.itemsPath, `Collection ${component.id} itemsPath`)
        if (config.itemKeyPath === '') {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `Collection ${component.id} itemKeyPath must not target the whole item`,
          )
        }
        parseJsonPointer(config.itemKeyPath, `Collection ${component.id} itemKeyPath`)
        validateCollectionPreviewItems(
          config.dataSource.previewItems,
          `Collection ${component.id} previewItems`,
        )
        const definition = resolveComponentDefinitionRefV3(doc, config.itemTemplate.source.$ref)
        if (
          config.dataSource.apiOperationId !== null &&
          getOwnEntity(doc.apiOperations, config.dataSource.apiOperationId)?.screenId !== component.screenId
        ) {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `Collection ${component.id} API source must belong to the same screen`,
          )
        }
        if (
          config.itemTemplate.variantId !== null &&
          !definition.variants.some(variant => variant.id === config.itemTemplate.variantId)
        ) {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `Collection ${component.id} template references a missing Variant`,
          )
        }
        validateInstanceProps(
          definition,
          config.itemTemplate.props,
          `Collection ${component.id} template`,
        )
        const bindingKeys = config.propBindings.map(binding => binding.propKey)
        if (new Set(bindingKeys).size !== bindingKeys.length) {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `Collection ${component.id} prop bindings must be unique`,
          )
        }
        for (const binding of config.propBindings) {
          if (binding.source.type === 'item') {
            parseJsonPointer(
              binding.source.path,
              `Collection ${component.id} prop ${binding.propKey}`,
            )
          }
        }
        for (const rule of config.variantSelection.cases) {
          if (!definition.variants.some(variant => variant.id === rule.variantId)) {
            throw new DomainError(
              'INVARIANT_VIOLATION',
              `Collection ${component.id} Variant rule references missing ${rule.variantId}`,
            )
          }
          if (rule.source.type === 'item') {
            parseJsonPointer(rule.source.path, `Collection ${component.id} Variant rule`)
          }
        }
        if (
          config.variantSelection.fallbackVariantId !== null &&
          !definition.variants.some(
            variant => variant.id === config.variantSelection.fallbackVariantId,
          )
        ) {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `Collection ${component.id} fallback Variant is missing`,
          )
        }
        if (config.visibility?.source.type === 'item') {
          parseJsonPointer(
            config.visibility.source.path,
            `Collection ${component.id} visibility rule`,
          )
        }
        const seenKeys = new Set<string>()
        for (const item of config.dataSource.previewItems) {
          const resolvedItem = resolveCollectionItem(config, item)
          if (seenKeys.has(resolvedItem.itemKey)) {
            throw new DomainError(
              'INVARIANT_VIOLATION',
              `Collection ${component.id} preview item keys must be unique`,
            )
          }
          seenKeys.add(resolvedItem.itemKey)
          validateInstanceProps(
            definition,
            resolvedItem.props,
            `Collection ${component.id} item ${resolvedItem.itemKey}`,
          )
          if (
            resolvedItem.variantId !== null &&
            !definition.variants.some(variant => variant.id === resolvedItem.variantId)
          ) {
            throw new DomainError(
              'INVARIANT_VIOLATION',
              `Collection ${component.id} item ${resolvedItem.itemKey} Variant is missing`,
            )
          }
        }
        if (config.dataSource.previewItems.length === 0) {
          resolveComponentTarget(
            doc,
            component.screenId,
            collectionItemNodeTargetRef(component.id, [definition.rootNodeId]),
            null,
          )
        }
      }
    } else {
      const definition = resolveComponentDefinitionRefV3(doc, component.source.$ref)
      if (component.variantId !== null && !definition.variants.some(variant => variant.id === component.variantId)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Definition instance ${component.id} references missing variant ${component.variantId}`,
        )
      }
      validateInstanceProps(definition, component.props, `Definition instance ${component.id}`)
    }
  }

  validateDefinitionGraph(doc)

  for (const screen of Object.values(screens)) {
    validateScreenComponentStructure(screen, doc)
    validateScenarios(screen, doc)
    validateEvents(screen, doc)
    validateApiOperations(screen, doc)
    validateScreenOwnedButtonLinks(screen, doc)
    validateResolvedScreenSemantics(
      screen,
      doc,
      resolveScreenNodes(doc, screen.id, null),
    )
  }

  assertCanonicalRootPlacementsV3(doc)
}
