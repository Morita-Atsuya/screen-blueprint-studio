// ============================================================
// Core identity types
// ============================================================
export type EntityId = string

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
// Field binding (component → API request/response)
// ============================================================
export interface FieldBinding {
  componentId: EntityId
  targetPath: string
}

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
    kind: 'section',
    canContainChildren: true,
    placement: 'child',
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
  { kind: 'alert', canContainChildren: false, placement: 'child', canvasContent: true },
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

export const COMPONENT_KINDS: readonly ComponentKind[] =
  COMPONENT_KIND_CATALOG.map(definition => definition.kind)
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
  columns: 1 | 2 | 3 | 4
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

export type TextStyle = 'heading1' | 'heading2' | 'heading3' | 'body' | 'caption'

export type ComponentConfig =
  | ({ kind: 'page' } & ComponentLayout)
  | ({ kind: 'section' } & ComponentLayout)
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
  | {
      kind: 'button'
      label: string
      variant: 'primary' | 'secondary' | 'danger'
      eventId: EntityId | null
      confirmationMessage: string | null
      preventDoubleSubmit: boolean
    }
  | { kind: 'alert'; tone: 'info' | 'success' | 'warning' | 'error'; message: string }
  | ({ kind: 'modal' } & ComponentLayout)

// ============================================================
// Component
// ============================================================
export interface CommonComponentSpec {
  description: string
  visible: boolean
  enabled: boolean
}

export interface ScreenComponent {
  id: EntityId
  screenId: EntityId
  parentId: EntityId | null
  childIds: EntityId[]
  kind: ComponentKind
  common: CommonComponentSpec
  config: ComponentConfig
}

export interface ComponentOverride {
  visible?: boolean
  enabled?: boolean
  text?: string
  message?: string
  value?: string
}

export interface ScreenState {
  id: EntityId
  screenId: EntityId
  name: string
  description: string
  componentOverrides: Record<EntityId, ComponentOverride>
}

// ============================================================
// Events
// ============================================================
export type EventTrigger =
  | { type: 'click'; componentId: EntityId }
  | { type: 'submit'; componentId: EntityId }

export type EventAction =
  | { type: 'setState'; stateId: EntityId }
  | { type: 'callApi'; apiOperationId: EntityId }
  | { type: 'showAlert'; componentId: EntityId }
  | { type: 'navigate'; destinationScreenId: EntityId }

export interface ScreenEvent {
  id: EntityId
  screenId: EntityId
  name: string
  trigger: EventTrigger
  actions: EventAction[]
}

// ============================================================
// API operations
// ============================================================
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiOperation {
  id: EntityId
  screenId: EntityId
  name: string
  method: HttpMethod
  path: string
  requestBindings: FieldBinding[]
  successStateId: EntityId | null
  errorStateId: EntityId | null
}

// ============================================================
// Screen
// ============================================================
export interface Screen {
  id: EntityId
  name: string
  route: string
  rootComponentId: EntityId
  modalComponentIds: EntityId[]
  defaultStateId: EntityId
  stateIds: EntityId[]
  eventIds: EntityId[]
}

// ============================================================
// Project
// ============================================================
export interface Project {
  id: EntityId
  name: string
  screenIds: EntityId[]
}

// ============================================================
// Document (source of truth)
// ============================================================
export interface ProjectDocument {
  schemaVersion: 1
  revision: number
  project: Project
  screens: Record<EntityId, Screen>
  components: Record<EntityId, ScreenComponent>
  screenStates: Record<EntityId, ScreenState>
  events: Record<EntityId, ScreenEvent>
  apiOperations: Record<EntityId, ApiOperation>
}
