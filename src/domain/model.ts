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
  | 'stack'
  | 'columns'
  | 'actionArea'
  | 'heading'
  | 'text'
  | 'textInput'
  | 'select'
  | 'button'
  | 'alert'
  | 'modal'

export const CONTAINER_KINDS: ComponentKind[] = [
  'page', 'section', 'stack', 'columns', 'actionArea', 'modal',
]

export const LEAF_KINDS: ComponentKind[] = [
  'heading', 'text', 'textInput', 'select', 'button', 'alert',
]

// ============================================================
// Component configs (discriminated union by kind)
// ============================================================
export type ComponentConfig =
  | { kind: 'page'; title: string }
  | { kind: 'section'; title: string }
  | { kind: 'stack'; gap: 'sm' | 'md' | 'lg' }
  | { kind: 'columns'; columns: 2 | 3 }
  | { kind: 'actionArea'; align: 'start' | 'end' | 'between' }
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
  | { kind: 'modal'; title: string }

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

// ============================================================
// Screen state
// ============================================================
export type ScreenStateKind = 'default' | 'loading' | 'success' | 'error' | 'custom'

export interface ComponentOverride {
  visible?: boolean
  enabled?: boolean
  text?: string
  value?: string
}

export interface ScreenState {
  id: EntityId
  screenId: EntityId
  name: string
  kind: ScreenStateKind
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
  entryScreenId: EntityId
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
