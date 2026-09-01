import type {
  CanonicalProjectSpecV3,
  ComponentDefinitionV3,
  ComponentDefinitionNodeV3,
  ComponentDefinitionRefV3,
  ScreenNodeV3,
  VariantConfigOverrideV3,
  ComponentPlacement,
  ComponentSizing,
} from './model'
import {
  CANONICAL_PROJECT_KIND_V3,
  CANONICAL_PROJECT_SCHEMA_URL_V3,
  CURRENT_SCHEMA_VERSION,
  COMPONENT_KINDS_V3,
  PUBLIC_PROP_TYPES_V3,
  EVENT_TRIGGER_TYPES_V3,
  EVENT_ACTION_TYPES_V3,
  HTTP_METHODS_V3,
  VARIANT_COMMON_OVERRIDE_FIELDS_V3,
  VARIANT_CONFIG_OVERRIDE_FIELDS_V3,
  VARIANT_NODE_OVERRIDE_FIELDS_V3,
  PUBLIC_PROP_FIELDS_V3,
  SCREEN_FIELDS_V3,
} from './model'
import { isRootSizing, validateSizingContext } from './componentSizing'

export {
  CANONICAL_PROJECT_KIND_V3,
  CANONICAL_PROJECT_SCHEMA_URL_V3,
  COMPONENT_KINDS_V3,
  EVENT_ACTION_TYPES_V3,
  EVENT_TRIGGER_TYPES_V3,
  HTTP_METHODS_V3,
  PUBLIC_PROP_FIELDS_V3,
  PUBLIC_PROP_TYPES_V3,
  SCREEN_FIELDS_V3,
  VARIANT_COMMON_OVERRIDE_FIELDS_V3,
  VARIANT_CONFIG_OVERRIDE_FIELDS_V3,
  VARIANT_NODE_OVERRIDE_FIELDS_V3,
}

export type {
  ApiOperationV3,
  CanonicalProjectSpecV3,
  CommonComponentSpecV3,
  ComponentDefinitionNodeV3,
  ComponentDefinitionRefV3,
  ComponentDefinitionSourceV3,
  ComponentDefinitionV3,
  ComponentKindV3,
  ComponentTargetRefV3,
  ComponentVariantV3,
  DefinitionInstanceFieldsV3,
  DefinitionInstanceScreenNodeV3,
  EventActionTypeV3,
  EventActionV3,
  EventTriggerTypeV3,
  EventTriggerV3,
  FieldBindingV3,
  InlineDefinitionNodeV3,
  InlineScreenNodeV3,
  ProjectV3,
  PublicPropBindingV3,
  PublicPropFieldV3,
  PublicPropTypeV3,
  PublicPropV3,
  PublicPropValueV3,
  ScreenNodeV3,
  ScreenScenarioV3,
  ScreenV3,
  StableDefinitionNodeIdV3,
  VariantCommonOverrideV3,
  VariantConfigOverrideV3,
  VariantNodeOverrideV3,
  VariantPropertyV3,
} from './model'

export const CANONICAL_PROJECT_SCHEMA_VERSION_V3 = CURRENT_SCHEMA_VERSION

const COMPONENT_DEFINITION_POINTER_PREFIX = '#/componentDefinitions/'

export function componentDefinitionRefV3(
  definitionId: string,
): ComponentDefinitionRefV3 {
  if (definitionId.length === 0) throw new Error('Component definition ID must not be empty')
  const pointerToken = definitionId.replace(/~/g, '~0').replace(/\//g, '~1')
  return `${COMPONENT_DEFINITION_POINTER_PREFIX}${encodeURIComponent(pointerToken)}` as
    ComponentDefinitionRefV3
}

export function parseComponentDefinitionRefV3(ref: string): string | null {
  if (!ref.startsWith(COMPONENT_DEFINITION_POINTER_PREFIX)) return null
  const fragmentToken = ref.slice(COMPONENT_DEFINITION_POINTER_PREFIX.length)
  let token: string
  try {
    token = decodeURIComponent(fragmentToken)
  } catch {
    return null
  }
  if (token.length === 0 || /~(?![01])|[/]/.test(token)) return null
  const definitionId = token.replace(/~1/g, '/').replace(/~0/g, '~')
  return componentDefinitionRefV3(definitionId) === ref ? definitionId : null
}

export function resolveComponentDefinitionRefV3(
  spec: Pick<CanonicalProjectSpecV3, 'componentDefinitions'>,
  ref: string,
): ComponentDefinitionV3 {
  const definitionId = parseComponentDefinitionRefV3(ref)
  if (definitionId === null) throw new Error(`Invalid local component definition reference: ${ref}`)
  if (!Object.prototype.hasOwnProperty.call(spec.componentDefinitions, definitionId)) {
    throw new Error(`Unresolved local component definition reference: ${ref}`)
  }
  return spec.componentDefinitions[definitionId] as ComponentDefinitionV3
}

export function assertCanonicalRootPlacementsV3(
  spec: Pick<CanonicalProjectSpecV3, 'components' | 'componentDefinitions' | 'screens'>,
): void {
  const assertFlow = (placement: ComponentPlacement, label: string) => {
    if (placement.mode !== 'flow') {
      throw new Error(`${label} must use flow placement`)
    }
  }
  const assertRootSizing = (sizing: ComponentSizing, label: string) => {
    if (!isRootSizing(sizing)) throw new Error(`${label} must use fixed root sizing`)
  }
  const nodeLayout = (
    node: ScreenNodeV3 | ComponentDefinitionNodeV3 | undefined,
    configOverride?: VariantConfigOverrideV3,
  ) => {
    if (!node || node.nodeType !== 'inline') return null
    const config = configOverride ? { ...node.config, ...configOverride } : node.config
    return config.kind === 'page' || config.kind === 'container' || config.kind === 'modal'
      ? config
      : null
  }

  for (const screen of Object.values(spec.screens)) {
    const rootIds = [screen.rootComponentId, ...screen.modalComponentIds]
    for (const rootId of rootIds) {
      const root = spec.components[rootId]
      if (!root || root.nodeType !== 'inline') {
        throw new Error(`Unresolved Screen root component: ${rootId}`)
      }
      assertFlow(root.placement, `Screen root ${rootId}`)
      assertRootSizing(root.sizing, `Screen root ${rootId}`)
    }
    for (const node of Object.values(spec.components).filter(node => node.screenId === screen.id)) {
      if (rootIds.includes(node.id)) continue
      const parent = node.parentId ? spec.components[node.parentId] : undefined
      validateSizingContext(
        node.sizing,
        node.placement,
        nodeLayout(parent),
        `Screen node ${node.id} sizing`,
      )
    }
  }

  for (const definition of Object.values(spec.componentDefinitions)) {
    const root = definition.nodes[definition.rootNodeId]
    if (!root) {
      throw new Error(
        `Unresolved root node ${definition.rootNodeId} in Component Definition ${definition.id}`,
      )
    }
    assertFlow(root.placement, `Component Definition root ${definition.id}/${root.id}`)
    assertRootSizing(root.sizing, `Component Definition root ${definition.id}/${root.id}`)
    for (const node of Object.values(definition.nodes)) {
      if (node.id === root.id) continue
      const parent = node.parentId ? definition.nodes[node.parentId] : undefined
      validateSizingContext(
        node.sizing,
        node.placement,
        nodeLayout(parent),
        `Component Definition node ${definition.id}/${node.id} sizing`,
      )
    }
    for (const variant of definition.variants) {
      const rootOverride = variant.nodeOverrides[definition.rootNodeId]?.placement
      if (rootOverride) {
        assertFlow(
          rootOverride,
          `Component Definition root Variant ${definition.id}/${variant.id}`,
        )
      }
      const rootSizingOverride = variant.nodeOverrides[definition.rootNodeId]?.sizing
      assertRootSizing(
        rootSizingOverride ?? root.sizing,
        `Component Definition root Variant ${definition.id}/${variant.id}`,
      )
      for (const node of Object.values(definition.nodes)) {
        if (node.id === root.id) continue
        const override = variant.nodeOverrides[node.id]
        const parent = node.parentId ? definition.nodes[node.parentId] : undefined
        const parentOverride = node.parentId
          ? variant.nodeOverrides[node.parentId]?.config
          : undefined
        validateSizingContext(
          override?.sizing ?? node.sizing,
          override?.placement ?? node.placement,
          nodeLayout(parent, parentOverride),
          `Component Definition Variant node ${definition.id}/${variant.id}/${node.id} sizing`,
        )
      }
    }
  }
}

export function assertUniqueVariantPropertyCombinationsV3(
  definition: Pick<ComponentDefinitionV3, 'variants'>,
): void {
  const seen = new Set<string>()
  for (const variant of definition.variants) {
    const combination = JSON.stringify(
      Object.entries(variant.propertyValues)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
    )
    if (seen.has(combination)) {
      throw new Error(`Duplicate variant property/value combination: ${variant.id}`)
    }
    seen.add(combination)
  }
}
