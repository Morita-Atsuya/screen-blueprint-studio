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
export type ComponentKind =
  | 'page'
  | 'section'
  | 'container'
  | 'heading'
  | 'text'
  | 'textInput'
  | 'select'
  | 'button'
  | 'alert'
  | 'modal'

export const CONTAINER_KINDS: ComponentKind[] = [
  'page', 'section', 'container', 'modal',
]

export const LEAF_KINDS: ComponentKind[] = [
  'heading', 'text', 'textInput', 'select', 'button', 'alert',
]

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

export type ComponentConfig =
  | ({ kind: 'page'; title: string } & ComponentLayout)
  | ({ kind: 'section'; title: string } & ComponentLayout)
  | ({ kind: 'container' } & ComponentLayout)
  | { kind: 'heading'; text: string; level: 1 | 2 | 3 }
  | { kind: 'text'; text: string }
  | {
      kind: 'textInput'
      fieldKey: string
      label: string
      inputType: 'text' | 'email' | 'password'
      required: boolean
      placeholder: string
      defaultValue: string
      validationRules: ValidationRule[]
      requestBinding: FieldBinding | null
    }
  | {
      kind: 'select'
      fieldKey: string
      label: string
      required: boolean
      options: Array<{ value: string; label: string }>
      requestBinding: FieldBinding | null
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
  | ({ kind: 'modal'; title: string } & ComponentLayout)

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
