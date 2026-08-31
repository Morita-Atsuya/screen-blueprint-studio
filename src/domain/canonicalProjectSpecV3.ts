import type {
  CommonComponentSpec,
  ComponentConfig,
  ComponentKind,
  ComponentLayout,
  ComponentPlacement,
  ComponentOverride,
  TextStyle,
} from './model'

export type CanonicalEntityIdV3 = string
export type StableDefinitionNodeIdV3 = string

export const CANONICAL_PROJECT_SCHEMA_URL_V3 =
  'https://morita-atsuya.github.io/screen-blueprint-studio/schemas/screen-blueprint-project-v3.schema.json'
export const CANONICAL_PROJECT_KIND_V3 = 'screen-blueprint-project' as const
export const CANONICAL_PROJECT_SCHEMA_VERSION_V3 = 3 as const

export const COMPONENT_KINDS_V3 = [
  'page',
  'container',
  'text',
  'textInput',
  'select',
  'button',
  'image',
  'link',
  'modal',
] as const
export type ComponentKindV3 = (typeof COMPONENT_KINDS_V3)[number]

export const PUBLIC_PROP_TYPES_V3 = ['string', 'boolean', 'number', 'enum'] as const
export type PublicPropTypeV3 = (typeof PUBLIC_PROP_TYPES_V3)[number]

export const EVENT_TRIGGER_TYPES_V3 = ['click', 'submit'] as const
export type EventTriggerTypeV3 = (typeof EVENT_TRIGGER_TYPES_V3)[number]

export const EVENT_ACTION_TYPES_V3 = [
  'setScenario',
  'clearScenario',
  'callApi',
  'navigate',
] as const
export type EventActionTypeV3 = (typeof EVENT_ACTION_TYPES_V3)[number]

export const HTTP_METHODS_V3 = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type HttpMethodV3 = (typeof HTTP_METHODS_V3)[number]

export const VARIANT_COMMON_OVERRIDE_FIELDS_V3 = [
  'description',
  'visible',
  'enabled',
] as const

export const VARIANT_CONFIG_OVERRIDE_FIELDS_V3 = [
  'layout',
  'gap',
  'columns',
  'justify',
  'align',
  'wrap',
  'text',
  'style',
  'label',
  'inputType',
  'required',
  'placeholder',
  'defaultValue',
  'variant',
  'confirmationMessage',
  'preventDoubleSubmit',
  'source',
  'alt',
  'fit',
  'aspectRatio',
  'placeholderStyle',
  'destination',
  'openMode',
] as const

export type PublicPropValueV3 = string | number | boolean

export type ComponentConfigV3 = ComponentConfig
export type CommonComponentSpecV3 = CommonComponentSpec

export type ComponentDefinitionRefV3 = `#/componentDefinitions/${string}`

export interface ComponentDefinitionSourceV3 {
  $ref: ComponentDefinitionRefV3
}

export interface DefinitionInstanceFieldsV3 {
  source: ComponentDefinitionSourceV3
  props: Record<string, PublicPropValueV3>
  variantId: CanonicalEntityIdV3 | null
}

export interface InlineScreenNodeV3 {
  nodeType: 'inline'
  id: CanonicalEntityIdV3
  screenId: CanonicalEntityIdV3
  parentId: CanonicalEntityIdV3 | null
  childIds: CanonicalEntityIdV3[]
  kind: ComponentKind
  placement: ComponentPlacement
  common: CommonComponentSpecV3
  config: ComponentConfigV3
}

export interface DefinitionInstanceScreenNodeV3 extends DefinitionInstanceFieldsV3 {
  nodeType: 'definitionInstance'
  id: CanonicalEntityIdV3
  screenId: CanonicalEntityIdV3
  parentId: CanonicalEntityIdV3 | null
  childIds: []
  placement: ComponentPlacement
}

export type ScreenNodeV3 = InlineScreenNodeV3 | DefinitionInstanceScreenNodeV3

export interface InlineDefinitionNodeV3 {
  nodeType: 'inline'
  id: StableDefinitionNodeIdV3
  parentId: StableDefinitionNodeIdV3 | null
  childIds: StableDefinitionNodeIdV3[]
  kind: ComponentKind
  placement: ComponentPlacement
  common: CommonComponentSpecV3
  config: ComponentConfigV3
}

export interface NestedDefinitionInstanceNodeV3 extends DefinitionInstanceFieldsV3 {
  nodeType: 'definitionInstance'
  id: StableDefinitionNodeIdV3
  parentId: StableDefinitionNodeIdV3 | null
  childIds: []
  placement: ComponentPlacement
}

export type ComponentDefinitionNodeV3 =
  | InlineDefinitionNodeV3
  | NestedDefinitionInstanceNodeV3

export interface PublicPropBindingV3 {
  /**
   * Traversal starts inside the instance definition root. A direct descendant uses
   * `[childId]`; a nested definition node uses each stable local instance/node ID.
   * The root itself is addressed as `[rootNodeId]`.
   */
  nodePath: [StableDefinitionNodeIdV3, ...StableDefinitionNodeIdV3[]]
  field: PublicPropFieldV3
}

interface PublicPropBaseV3 {
  key: string
  name: string
  description: string
  bindings: PublicPropBindingV3[]
}

export type PublicPropV3 =
  | (PublicPropBaseV3 & { type: 'string' })
  | (PublicPropBaseV3 & { type: 'boolean' })
  | (PublicPropBaseV3 & { type: 'number' })
  | (PublicPropBaseV3 & { type: 'enum'; values: string[] })

export interface VariantPropertyV3 {
  key: string
  name: string
  description: string
  values: string[]
}

export const PUBLIC_PROP_FIELDS_V3 = [
  'common.description',
  'common.visible',
  'common.enabled',
  'config.layout',
  'config.gap',
  'config.columns',
  'config.justify',
  'config.align',
  'config.wrap',
  'config.text',
  'config.style',
  'config.label',
  'config.inputType',
  'config.required',
  'config.placeholder',
  'config.defaultValue',
  'config.variant',
  'config.confirmationMessage',
  'config.preventDoubleSubmit',
  'config.source',
  'config.alt',
  'config.fit',
  'config.aspectRatio',
  'config.placeholderStyle',
  'config.destination.screenId',
  'config.destination.url',
  'config.destination.resourceId',
  'config.destination.displayName',
  'config.openMode',
  'placement.edge',
  'placement.anchor',
  'placement.inset',
  'placement.insetX',
  'placement.insetY',
] as const
export type PublicPropFieldV3 = (typeof PUBLIC_PROP_FIELDS_V3)[number]

export interface VariantCommonOverrideV3 {
  description?: string
  visible?: boolean
  enabled?: boolean
}

export interface VariantConfigOverrideV3 {
  layout?: ComponentLayout['layout']
  gap?: ComponentLayout['gap']
  columns?: ComponentLayout['columns']
  justify?: ComponentLayout['justify']
  align?: ComponentLayout['align']
  wrap?: boolean
  text?: string
  style?: TextStyle
  label?: string
  inputType?: Extract<ComponentConfig, { kind: 'textInput' }>['inputType']
  required?: boolean
  placeholder?: string
  defaultValue?: string
  variant?: Extract<ComponentConfig, { kind: 'button' }>['variant']
  confirmationMessage?: string | null
  preventDoubleSubmit?: boolean
  source?: string
  alt?: string
  fit?: Extract<ComponentConfig, { kind: 'image' }>['fit']
  aspectRatio?: Extract<ComponentConfig, { kind: 'image' }>['aspectRatio']
  placeholderStyle?: Extract<ComponentConfig, { kind: 'image' }>['placeholderStyle']
  destination?: Extract<ComponentConfig, { kind: 'link' }>['destination']
  openMode?: Extract<ComponentConfig, { kind: 'link' }>['openMode']
}

export interface VariantNodeOverrideV3 {
  common?: VariantCommonOverrideV3
  config?: VariantConfigOverrideV3
  placement?: ComponentPlacement
}

export interface ComponentVariantV3 {
  id: CanonicalEntityIdV3
  name: string
  propertyValues: Record<string, string>
  nodeOverrides: Record<StableDefinitionNodeIdV3, VariantNodeOverrideV3>
}

export interface ComponentDefinitionV3 {
  id: CanonicalEntityIdV3
  name: string
  description: string
  rootNodeId: StableDefinitionNodeIdV3
  nodes: Record<StableDefinitionNodeIdV3, ComponentDefinitionNodeV3>
  publicProps: PublicPropV3[]
  variantProperties: VariantPropertyV3[]
  variants: ComponentVariantV3[]
  representativeVariantId: CanonicalEntityIdV3 | null
}

export function assertCanonicalRootPlacementsV3(
  spec: Pick<CanonicalProjectSpecV3, 'components' | 'componentDefinitions' | 'screens'>,
): void {
  const assertFlow = (placement: ComponentPlacement, label: string) => {
    if (placement.mode !== 'flow') {
      throw new Error(`${label} must use flow placement`)
    }
  }
  for (const screen of Object.values(spec.screens)) {
    const rootIds = [screen.rootComponentId, ...screen.modalComponentIds]
    for (const rootId of rootIds) {
      const root = spec.components[rootId]
      if (!root) throw new Error(`Unresolved Screen root component: ${rootId}`)
      assertFlow(root.placement, `Screen root ${rootId}`)
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
    for (const variant of definition.variants) {
      const rootOverride = variant.nodeOverrides[definition.rootNodeId]?.placement
      if (rootOverride) {
        assertFlow(
          rootOverride,
          `Component Definition root Variant ${definition.id}/${variant.id}`,
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

export type ComponentTargetRefV3 =
  | { type: 'inline'; componentId: CanonicalEntityIdV3 }
  | {
      type: 'definitionNode'
      instanceId: CanonicalEntityIdV3
      nodePath: [StableDefinitionNodeIdV3, ...StableDefinitionNodeIdV3[]]
    }

export interface ScreenScenarioV3 {
  id: CanonicalEntityIdV3
  screenId: CanonicalEntityIdV3
  name: string
  description: string
  componentOverrides: Array<{
    target: ComponentTargetRefV3
    override: ComponentOverride
  }>
}

export type EventTriggerV3 = {
  type: EventTriggerTypeV3
  target: ComponentTargetRefV3
}

export type EventActionV3 =
  | { type: 'setScenario'; scenarioId: CanonicalEntityIdV3 }
  | { type: 'clearScenario' }
  | { type: 'callApi'; apiOperationId: CanonicalEntityIdV3 }
  | { type: 'navigate'; destinationScreenId: CanonicalEntityIdV3 }

export interface ScreenEventV3 {
  id: CanonicalEntityIdV3
  screenId: CanonicalEntityIdV3
  name: string
  trigger: EventTriggerV3
  actions: EventActionV3[]
}

export interface FieldBindingV3 {
  source: ComponentTargetRefV3
  targetPath: string
}

export interface ApiOperationV3 {
  id: CanonicalEntityIdV3
  screenId: CanonicalEntityIdV3
  name: string
  method: HttpMethodV3
  path: string
  requestBindings: FieldBindingV3[]
  successScenarioId: CanonicalEntityIdV3 | null
  errorScenarioId: CanonicalEntityIdV3 | null
}

export interface ScreenV3 {
  id: CanonicalEntityIdV3
  name: string
  route: string
  baseDescription: string
  rootComponentId: CanonicalEntityIdV3
  modalComponentIds: CanonicalEntityIdV3[]
  scenarioIds: CanonicalEntityIdV3[]
  eventIds: CanonicalEntityIdV3[]
}

export const SCREEN_FIELDS_V3 = [
  'id',
  'name',
  'route',
  'baseDescription',
  'rootComponentId',
  'modalComponentIds',
  'scenarioIds',
  'eventIds',
] as const satisfies readonly (keyof ScreenV3)[]

type AssertNoScreenFieldsMissingV3<T extends never> = T
export type ScreenFieldsMissingFromCatalogV3 = AssertNoScreenFieldsMissingV3<
  Exclude<keyof ScreenV3, (typeof SCREEN_FIELDS_V3)[number]>
>

export interface ProjectV3 {
  id: CanonicalEntityIdV3
  name: string
  screenIds: CanonicalEntityIdV3[]
}

export interface CanonicalProjectSpecV3 {
  $schema: typeof CANONICAL_PROJECT_SCHEMA_URL_V3
  kind: typeof CANONICAL_PROJECT_KIND_V3
  schemaVersion: typeof CANONICAL_PROJECT_SCHEMA_VERSION_V3
  project: ProjectV3
  componentDefinitions: Record<CanonicalEntityIdV3, ComponentDefinitionV3>
  screens: Record<CanonicalEntityIdV3, ScreenV3>
  components: Record<CanonicalEntityIdV3, ScreenNodeV3>
  screenScenarios: Record<CanonicalEntityIdV3, ScreenScenarioV3>
  events: Record<CanonicalEntityIdV3, ScreenEventV3>
  apiOperations: Record<CanonicalEntityIdV3, ApiOperationV3>
}

const COMPONENT_DEFINITION_POINTER_PREFIX = '#/componentDefinitions/'

export function componentDefinitionRefV3(
  definitionId: CanonicalEntityIdV3,
): ComponentDefinitionRefV3 {
  if (definitionId.length === 0) throw new Error('Component definition ID must not be empty')
  const pointerToken = definitionId.replace(/~/g, '~0').replace(/\//g, '~1')
  return `${COMPONENT_DEFINITION_POINTER_PREFIX}${encodeURIComponent(pointerToken)}` as
    ComponentDefinitionRefV3
}

export function parseComponentDefinitionRefV3(ref: string): CanonicalEntityIdV3 | null {
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
