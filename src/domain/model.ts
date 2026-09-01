// ============================================================
// Core identity and canonical document constants
// ============================================================
export type EntityId = string

export const CANONICAL_PROJECT_SCHEMA_URL_V3 =
  'https://morita-atsuya.github.io/screen-blueprint-studio/schemas/screen-blueprint-project-v3.schema.json'
export const CANONICAL_PROJECT_KIND_V3 = 'screen-blueprint-project' as const
export const CURRENT_SCHEMA_VERSION = 3 as const

// ============================================================
// Validation rules
// ============================================================
export type ValidationRule =
  | { id: EntityId; type: 'required'; message: string }
  | { id: EntityId; type: 'minLength'; value: number; message: string }
  | { id: EntityId; type: 'maxLength'; value: number; message: string }
  | { id: EntityId; type: 'pattern'; value: string; message: string }
  | { id: EntityId; type: 'email'; message: string }
  | { id: EntityId; type: 'custom'; description: string; message: string }

// ============================================================
// Component kinds
// ============================================================
export const COMPONENT_KIND_CATALOG = [
  {
    kind: 'page',
    canContainChildren: true,
    placement: 'screen-root',
    canvasContent: false,
  },
  {
    kind: 'container',
    canContainChildren: true,
    placement: 'child',
    canvasContent: false,
  },
  { kind: 'text', canContainChildren: false, placement: 'child', canvasContent: true },
  { kind: 'textInput', canContainChildren: false, placement: 'child', canvasContent: true },
  { kind: 'select', canContainChildren: false, placement: 'child', canvasContent: true },
  { kind: 'button', canContainChildren: false, placement: 'child', canvasContent: true },
  { kind: 'image', canContainChildren: false, placement: 'child', canvasContent: true },
  { kind: 'link', canContainChildren: false, placement: 'child', canvasContent: true },
  {
    kind: 'modal',
    canContainChildren: true,
    placement: 'modal-root',
    canvasContent: false,
  },
] as const

type ComponentKindDefinition = (typeof COMPONENT_KIND_CATALOG)[number]
type ContainerKindDefinition = Extract<ComponentKindDefinition, { canContainChildren: true }>
type LeafKindDefinition = Extract<ComponentKindDefinition, { canContainChildren: false }>
type PaletteKindDefinition = Exclude<ComponentKindDefinition, { placement: 'screen-root' }>
type ChildKindDefinition = Extract<ComponentKindDefinition, { placement: 'child' }>

export type ComponentKind = ComponentKindDefinition['kind']
export type PaletteComponentKind = PaletteKindDefinition['kind']
export type ChildComponentKind = ChildKindDefinition['kind']
export type ComponentKindV3 = ComponentKind

export const COMPONENT_KINDS: readonly ComponentKind[] =
  COMPONENT_KIND_CATALOG.map(definition => definition.kind)
export const COMPONENT_KINDS_V3: readonly ComponentKind[] = COMPONENT_KINDS
export const CONTAINER_KINDS: readonly ComponentKind[] = COMPONENT_KIND_CATALOG
  .filter((definition): definition is ContainerKindDefinition => definition.canContainChildren)
  .map(definition => definition.kind)
export const LEAF_KINDS: readonly ComponentKind[] = COMPONENT_KIND_CATALOG
  .filter((definition): definition is LeafKindDefinition => !definition.canContainChildren)
  .map(definition => definition.kind)
export const PALETTE_COMPONENT_KINDS: readonly PaletteComponentKind[] = COMPONENT_KIND_CATALOG
  .filter((definition): definition is PaletteKindDefinition =>
    definition.placement !== 'screen-root')
  .map(definition => definition.kind)
export const CHILD_COMPONENT_KINDS: readonly ChildComponentKind[] = COMPONENT_KIND_CATALOG
  .filter((definition): definition is ChildKindDefinition => definition.placement === 'child')
  .map(definition => definition.kind)

export function assertCompleteComponentKindCoverage(
  surface: string,
  kinds: readonly string[],
): void {
  const knownKinds = new Set<string>(COMPONENT_KINDS)
  const duplicates = kinds.filter((kind, index) => kinds.indexOf(kind) !== index)
  const missing = COMPONENT_KINDS.filter(kind => !kinds.includes(kind))
  const unexpected = kinds.filter(kind => !knownKinds.has(kind))
  if (duplicates.length > 0 || missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${surface} component kind coverage is invalid`
      + ` (missing: ${missing.join(', ') || 'none'};`
      + ` unexpected: ${unexpected.join(', ') || 'none'};`
      + ` duplicates: ${[...new Set(duplicates)].join(', ') || 'none'})`,
    )
  }
}

// ============================================================
// Component configs (discriminated union by kind)
// ============================================================
export interface ComponentLayout {
  layout: 'vertical' | 'horizontal' | 'grid'
  gap: 'none' | 'sm' | 'md' | 'lg'
  columns: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  justify: 'start' | 'center' | 'end' | 'between'
  align: 'start' | 'center' | 'end' | 'stretch'
  wrap: boolean
}

export const DEFAULT_COMPONENT_LAYOUT: ComponentLayout = {
  layout: 'vertical',
  gap: 'md',
  columns: 2,
  justify: 'start',
  align: 'stretch',
  wrap: false,
}

export const PLACEMENT_INSET_TOKENS = ['none', 'xs', 'sm', 'md', 'lg'] as const
export type PlacementInset = (typeof PLACEMENT_INSET_TOKENS)[number]

export const PLACEMENT_ANCHORS = [
  'topLeft',
  'topCenter',
  'topRight',
  'centerLeft',
  'center',
  'centerRight',
  'bottomLeft',
  'bottomCenter',
  'bottomRight',
] as const
export type PlacementAnchor = (typeof PLACEMENT_ANCHORS)[number]

export type ComponentPlacement =
  | { mode: 'flow' }
  | {
      mode: 'sticky'
      edge: 'top' | 'bottom'
      inset: PlacementInset
    }
  | {
      mode: 'overlay' | 'viewport'
      anchor: PlacementAnchor
      insetX: PlacementInset
      insetY: PlacementInset
    }

export const DEFAULT_COMPONENT_PLACEMENT: ComponentPlacement = { mode: 'flow' }

export const COMPONENT_SIZE_TOKENS = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const
export type ComponentSizeToken = (typeof COMPONENT_SIZE_TOKENS)[number]

export interface ComponentSizing {
  inlineSize: 'auto' | 'content' | 'fill'
  minWidth: ComponentSizeToken
  maxWidth: ComponentSizeToken
  gridSpan: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  grow: 0 | 1 | 2 | 3
  shrink: 'allow' | 'prevent'
}

export const DEFAULT_COMPONENT_SIZING: ComponentSizing = {
  inlineSize: 'auto',
  minWidth: 'none',
  maxWidth: 'none',
  gridSpan: 1,
  grow: 0,
  shrink: 'allow',
}

export const ROOT_COMPONENT_SIZING: ComponentSizing = {
  ...DEFAULT_COMPONENT_SIZING,
  inlineSize: 'fill',
}

export type TextStyle = 'heading1' | 'heading2' | 'heading3' | 'body' | 'caption'
export type ImageFit = 'contain' | 'cover'
export type ImageAspectRatio = 'auto' | 'square' | '4:3' | '16:9'
export type ImagePlaceholder = 'icon' | 'skeleton'
export type OpaqueResourceId = string
export type LinkDestination =
  | { type: 'internal'; screenId: EntityId }
  | { type: 'external'; url: string }
  | { type: 'resource'; resourceId: OpaqueResourceId; url: string; displayName: string }
export type LinkOpenMode = 'sameContext' | 'newContext' | 'download'

interface ButtonComponentConfigBase {
  label: string
  variant: 'primary' | 'secondary' | 'danger'
  confirmationMessage: string | null
  preventDoubleSubmit: boolean
}

export interface ScreenButtonComponentConfig extends ButtonComponentConfigBase {
  kind: 'button'
  eventId: EntityId | null
}

export interface DefinitionButtonComponentConfig extends ButtonComponentConfigBase {
  kind: 'button'
}

export type ScreenComponentConfig =
  | ({ kind: 'page' } & ComponentLayout)
  | ({ kind: 'container' } & ComponentLayout)
  | { kind: 'text'; text: string; style: TextStyle }
  | {
      kind: 'textInput'
      fieldKey: string
      label: string
      inputType: 'text' | 'email' | 'password'
      required: boolean
      placeholder: string
      defaultValue: string
      validationRules: ValidationRule[]
    }
  | {
      kind: 'select'
      fieldKey: string
      label: string
      required: boolean
      options: Array<{ value: string; label: string }>
      defaultValue: string
    }
  | ScreenButtonComponentConfig
  | {
      kind: 'image'
      source: string
      alt: string
      fit: ImageFit
      aspectRatio: ImageAspectRatio
      placeholderStyle: ImagePlaceholder
    }
  | {
      kind: 'link'
      label: string
      destination: LinkDestination
      openMode: LinkOpenMode
    }
  | ({ kind: 'modal' } & ComponentLayout)

export type DefinitionComponentConfig =
  | ({ kind: 'page' } & ComponentLayout)
  | ({ kind: 'container' } & ComponentLayout)
  | { kind: 'text'; text: string; style: TextStyle }
  | {
      kind: 'textInput'
      fieldKey: string
      label: string
      inputType: 'text' | 'email' | 'password'
      required: boolean
      placeholder: string
      defaultValue: string
      validationRules: ValidationRule[]
    }
  | {
      kind: 'select'
      fieldKey: string
      label: string
      required: boolean
      options: Array<{ value: string; label: string }>
      defaultValue: string
    }
  | DefinitionButtonComponentConfig
  | {
      kind: 'image'
      source: string
      alt: string
      fit: ImageFit
      aspectRatio: ImageAspectRatio
      placeholderStyle: ImagePlaceholder
    }
  | {
      kind: 'link'
      label: string
      destination: LinkDestination
      openMode: LinkOpenMode
    }
  | ({ kind: 'modal' } & ComponentLayout)

export type ComponentConfig = ScreenComponentConfig

// ============================================================
// Common component fields
// ============================================================
export interface CommonComponentSpec {
  description: string
  visible: boolean
  enabled: boolean
}
export type CommonComponentSpecV3 = CommonComponentSpec

// ============================================================
// Shared component definitions
// ============================================================
export const PUBLIC_PROP_TYPES_V3 = ['string', 'boolean', 'number', 'enum'] as const
export type PublicPropTypeV3 = (typeof PUBLIC_PROP_TYPES_V3)[number]
export type PublicPropValue = string | number | boolean
export type PublicPropValueV3 = PublicPropValue

export type ComponentDefinitionRef = `#/componentDefinitions/${string}`
export type ComponentDefinitionRefV3 = ComponentDefinitionRef
export type StableDefinitionNodeIdV3 = EntityId

export interface ComponentDefinitionSource {
  $ref: ComponentDefinitionRef
}

export interface ComponentDefinitionSourceV3 extends ComponentDefinitionSource {}

export interface DefinitionInstanceFields {
  source: ComponentDefinitionSource
  props: Record<string, PublicPropValue>
  variantId: EntityId | null
}

export interface DefinitionInstanceFieldsV3 extends DefinitionInstanceFields {}

export interface InlineScreenNode {
  nodeType: 'inline'
  id: EntityId
  screenId: EntityId
  parentId: EntityId | null
  childIds: EntityId[]
  kind: ComponentKind
  placement: ComponentPlacement
  sizing: ComponentSizing
  common: CommonComponentSpec
  config: ScreenComponentConfig
}
export interface InlineScreenNodeV3 extends InlineScreenNode {}

export interface DefinitionInstanceScreenNode extends DefinitionInstanceFields {
  nodeType: 'definitionInstance'
  id: EntityId
  screenId: EntityId
  parentId: EntityId | null
  childIds: []
  placement: ComponentPlacement
  sizing: ComponentSizing
}
export interface DefinitionInstanceScreenNodeV3 extends DefinitionInstanceScreenNode {}

export type ScreenComponent = InlineScreenNode | DefinitionInstanceScreenNode
export type ScreenNodeV3 = ScreenComponent

export interface InlineDefinitionNode {
  nodeType: 'inline'
  id: EntityId
  parentId: EntityId | null
  childIds: EntityId[]
  kind: ComponentKind
  placement: ComponentPlacement
  sizing: ComponentSizing
  common: CommonComponentSpec
  config: DefinitionComponentConfig
}
export interface InlineDefinitionNodeV3 extends InlineDefinitionNode {}

export interface NestedDefinitionInstanceNode extends DefinitionInstanceFields {
  nodeType: 'definitionInstance'
  id: EntityId
  parentId: EntityId | null
  childIds: []
  placement: ComponentPlacement
  sizing: ComponentSizing
}

export type ComponentDefinitionNode = InlineDefinitionNode | NestedDefinitionInstanceNode
export type ComponentDefinitionNodeV3 = ComponentDefinitionNode

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
  'sizing.inlineSize',
  'sizing.minWidth',
  'sizing.maxWidth',
  'sizing.gridSpan',
  'sizing.grow',
  'sizing.shrink',
] as const
export type PublicPropFieldV3 = (typeof PUBLIC_PROP_FIELDS_V3)[number]

export interface PublicPropBinding {
  nodePath: [EntityId, ...EntityId[]]
  field: PublicPropFieldV3
}

export interface PublicPropBindingV3 extends PublicPropBinding {}

interface PublicPropBase {
  key: string
  name: string
  description: string
  bindings: PublicPropBinding[]
}

export type PublicProp =
  | (PublicPropBase & { type: 'string' })
  | (PublicPropBase & { type: 'boolean' })
  | (PublicPropBase & { type: 'number' })
  | (PublicPropBase & { type: 'enum'; values: string[] })
export type PublicPropV3 = PublicProp

export interface VariantProperty {
  key: string
  name: string
  description: string
  values: string[]
}

export interface VariantPropertyV3 extends VariantProperty {}

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

export const VARIANT_NODE_OVERRIDE_FIELDS_V3 = [
  'common',
  'config',
  'placement',
  'sizing',
] as const

export interface VariantCommonOverride {
  description?: string
  visible?: boolean
  enabled?: boolean
}

export interface VariantCommonOverrideV3 extends VariantCommonOverride {}

export interface VariantConfigOverride {
  layout?: ComponentLayout['layout']
  gap?: ComponentLayout['gap']
  columns?: ComponentLayout['columns']
  justify?: ComponentLayout['justify']
  align?: ComponentLayout['align']
  wrap?: boolean
  text?: string
  style?: TextStyle
  label?: string
  inputType?: Extract<ScreenComponentConfig, { kind: 'textInput' }>['inputType']
  required?: boolean
  placeholder?: string
  defaultValue?: string
  variant?: ScreenButtonComponentConfig['variant']
  confirmationMessage?: string | null
  preventDoubleSubmit?: boolean
  source?: string
  alt?: string
  fit?: Extract<ScreenComponentConfig, { kind: 'image' }>['fit']
  aspectRatio?: Extract<ScreenComponentConfig, { kind: 'image' }>['aspectRatio']
  placeholderStyle?: Extract<ScreenComponentConfig, { kind: 'image' }>['placeholderStyle']
  destination?: Extract<ScreenComponentConfig, { kind: 'link' }>['destination']
  openMode?: Extract<ScreenComponentConfig, { kind: 'link' }>['openMode']
}

export interface VariantConfigOverrideV3 extends VariantConfigOverride {}

export interface VariantNodeOverride {
  common?: VariantCommonOverride
  config?: VariantConfigOverride
  placement?: ComponentPlacement
  sizing?: ComponentSizing
}

export interface VariantNodeOverrideV3 extends VariantNodeOverride {}

export interface ComponentVariant {
  id: EntityId
  name: string
  propertyValues: Record<string, string>
  nodeOverrides: Record<EntityId, VariantNodeOverride>
}

export interface ComponentVariantV3 extends ComponentVariant {}

export interface ComponentDefinition {
  id: EntityId
  name: string
  description: string
  rootNodeId: EntityId
  nodes: Record<EntityId, ComponentDefinitionNode>
  publicProps: PublicProp[]
  variantProperties: VariantProperty[]
  variants: ComponentVariant[]
  representativeVariantId: EntityId | null
}

export interface ComponentDefinitionV3 extends ComponentDefinition {}

// ============================================================
// Screen scenarios, events, and APIs
// ============================================================
export type ComponentTargetRef =
  | { type: 'inline'; componentId: EntityId }
  | {
      type: 'definitionNode'
      instanceId: EntityId
      nodePath: [EntityId, ...EntityId[]]
    }

export type ComponentTargetRefV3 = ComponentTargetRef

export interface ComponentOverride {
  visible?: boolean
  enabled?: boolean
  text?: string
  value?: string
}

export interface ScenarioComponentOverride {
  target: ComponentTargetRef
  override: ComponentOverride
}

export interface ScreenScenario {
  id: EntityId
  screenId: EntityId
  name: string
  description: string
  componentOverrides: ScenarioComponentOverride[]
}

export type ScreenScenarioV3 = ScreenScenario
export type ScreenState = ScreenScenario

export const EVENT_TRIGGER_TYPES_V3 = ['click', 'submit'] as const
export type EventTriggerTypeV3 = (typeof EVENT_TRIGGER_TYPES_V3)[number]

export type EventTrigger = {
  type: EventTriggerTypeV3
  target: ComponentTargetRef
}

export type EventTriggerV3 = EventTrigger

export const EVENT_ACTION_TYPES_V3 = [
  'setScenario',
  'clearScenario',
  'callApi',
  'navigate',
] as const
export type EventActionTypeV3 = (typeof EVENT_ACTION_TYPES_V3)[number]

export type EventAction =
  | { type: 'setScenario'; scenarioId: EntityId }
  | { type: 'clearScenario' }
  | { type: 'callApi'; apiOperationId: EntityId }
  | { type: 'navigate'; destinationScreenId: EntityId }

export type EventActionV3 = EventAction

export interface ScreenEvent {
  id: EntityId
  screenId: EntityId
  name: string
  trigger: EventTrigger
  actions: EventAction[]
}

export interface ScreenEventV3 extends ScreenEvent {}

export const HTTP_METHODS_V3 = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type HttpMethod = (typeof HTTP_METHODS_V3)[number]
export type HttpMethodV3 = HttpMethod

export interface FieldBinding {
  source: ComponentTargetRef
  targetPath: string
}

export interface FieldBindingV3 extends FieldBinding {}

export interface ApiOperation {
  id: EntityId
  screenId: EntityId
  name: string
  method: HttpMethod
  path: string
  requestBindings: FieldBinding[]
  successScenarioId: EntityId | null
  errorScenarioId: EntityId | null
}

export interface ApiOperationV3 extends ApiOperation {}

// ============================================================
// Screen and project
// ============================================================
export interface Screen {
  id: EntityId
  name: string
  route: string
  baseDescription: string
  rootComponentId: EntityId
  modalComponentIds: EntityId[]
  scenarioIds: EntityId[]
  eventIds: EntityId[]
}

export interface ScreenV3 extends Screen {}

export const SCREEN_FIELDS_V3 = [
  'id',
  'name',
  'route',
  'baseDescription',
  'rootComponentId',
  'modalComponentIds',
  'scenarioIds',
  'eventIds',
] as const satisfies readonly (keyof Screen)[]

type AssertNoScreenFieldsMissingV3<T extends never> = T
export type ScreenFieldsMissingFromCatalogV3 = AssertNoScreenFieldsMissingV3<
  Exclude<keyof Screen, (typeof SCREEN_FIELDS_V3)[number]>
>

export interface Project {
  id: EntityId
  name: string
  screenIds: EntityId[]
}

export interface ProjectV3 extends Project {}

export interface ProjectDocument {
  $schema: typeof CANONICAL_PROJECT_SCHEMA_URL_V3
  kind: typeof CANONICAL_PROJECT_KIND_V3
  schemaVersion: typeof CURRENT_SCHEMA_VERSION
  project: Project
  componentDefinitions: Record<EntityId, ComponentDefinition>
  screens: Record<EntityId, Screen>
  components: Record<EntityId, ScreenComponent>
  screenScenarios: Record<EntityId, ScreenScenario>
  events: Record<EntityId, ScreenEvent>
  apiOperations: Record<EntityId, ApiOperation>
}

export interface CanonicalProjectSpecV3 extends ProjectDocument {}

// ============================================================
// Type guards and helpers
// ============================================================
export function isInlineScreenComponent(component: ScreenComponent): component is InlineScreenNode {
  return component.nodeType === 'inline'
}

export function isDefinitionInstanceScreenComponent(
  component: ScreenComponent,
): component is DefinitionInstanceScreenNode {
  return component.nodeType === 'definitionInstance'
}

export function isInlineDefinitionNode(
  node: ComponentDefinitionNode,
): node is InlineDefinitionNode {
  return node.nodeType === 'inline'
}

export function isNestedDefinitionInstanceNode(
  node: ComponentDefinitionNode,
): node is NestedDefinitionInstanceNode {
  return node.nodeType === 'definitionInstance'
}

export function hasScreenButtonEventId(
  config: ScreenComponentConfig | DefinitionComponentConfig,
): config is ScreenButtonComponentConfig {
  return config.kind === 'button' && 'eventId' in config
}

export function isContainerScreenComponent(
  component: ScreenComponent,
): component is InlineScreenNode & { kind: ContainerKindDefinition['kind'] } {
  return component.nodeType === 'inline' && CONTAINER_KINDS.includes(component.kind)
}
