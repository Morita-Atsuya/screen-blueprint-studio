import type {
  EntityId,
  ComponentKind,
  ComponentConfig,
  CommonComponentSpec,
  ComponentOverride,
  ComponentPlacement,
  EventTrigger,
  EventAction,
  HttpMethod,
  FieldBinding,
  ScreenComponent,
} from './model'

export type DomainCommand =
  // Screen commands
  | AddScreenCommand
  | UpdateScreenCommand
  | RemoveScreenCommand
  // Component commands
  | AddComponentCommand
  | MoveComponentCommand
  | DuplicateComponentCommand
  | PasteComponentCommand
  | RemoveComponentCommand
  | UpdateComponentSpecCommand
  // State commands
  | CreateScreenStateCommand
  | UpdateScreenStateCommand
  | RemoveScreenStateCommand
  // Event commands
  | ConnectEventCommand
  | UpdateEventCommand
  | RemoveEventCommand
  // API commands
  | BindApiOperationCommand
  | UpdateApiOperationCommand
  | RemoveApiOperationCommand

// ============================================================
// Screen commands
// ============================================================
export interface AddScreenCommand {
  type: 'addScreen'
  screenId: EntityId
  rootComponentId: EntityId
  defaultStateId: EntityId
  name: string
  route: string
}

export interface UpdateScreenCommand {
  type: 'updateScreen'
  screenId: EntityId
  name?: string
  route?: string
}

export interface RemoveScreenCommand {
  type: 'removeScreen'
  screenId: EntityId
}

// ============================================================
// Component commands
// ============================================================
export interface AddComponentCommand {
  type: 'addComponent'
  componentId: EntityId
  screenId: EntityId
  parentId: EntityId | null
  kind: ComponentKind
  placement: ComponentPlacement
  config: ComponentConfig
  position?: number
}

export interface MoveComponentCommand {
  type: 'moveComponent'
  componentId: EntityId
  newParentId: EntityId
  position?: number
}

export interface DuplicateComponentCommand {
  type: 'duplicateComponent'
  componentId: EntityId
  componentIdMap: Record<EntityId, EntityId>
}

export interface ComponentSubtreeSnapshot {
  projectId: EntityId
  sourceScreenId: EntityId
  rootComponentId: EntityId
  components: Record<EntityId, ScreenComponent>
  stateOverrides: Record<EntityId, Record<EntityId, ComponentOverride>>
}

export interface PasteComponentCommand {
  type: 'pasteComponent'
  snapshot: ComponentSubtreeSnapshot
  destinationComponentId: EntityId
  destinationScreenId: EntityId
  destinationParentId: EntityId
  position: number
  componentIdMap: Record<EntityId, EntityId>
}

export interface RemoveComponentCommand {
  type: 'removeComponent'
  componentId: EntityId
}

export interface UpdateComponentSpecCommand {
  type: 'updateComponentSpec'
  componentId: EntityId
  patch: {
    common?: Partial<CommonComponentSpec>
    config?: Partial<ComponentConfig>
    placement?: ComponentPlacement
  }
}

// ============================================================
// State commands
// ============================================================
export interface CreateScreenStateCommand {
  type: 'createScreenState'
  stateId: EntityId
  screenId: EntityId
  name: string
  description?: string
  overrides?: Record<EntityId, ComponentOverride>
}

export interface UpdateScreenStateCommand {
  type: 'updateScreenState'
  stateId: EntityId
  name?: string
  description?: string
  overrides?: Record<EntityId, ComponentOverride>
}

export interface RemoveScreenStateCommand {
  type: 'removeScreenState'
  stateId: EntityId
}

// ============================================================
// Event commands
// ============================================================
export interface ConnectEventCommand {
  type: 'connectEvent'
  eventId: EntityId
  screenId: EntityId
  name: string
  trigger: EventTrigger
  actions: EventAction[]
}

export interface UpdateEventCommand {
  type: 'updateEvent'
  eventId: EntityId
  name: string
  trigger: EventTrigger
  actions: EventAction[]
}

export interface RemoveEventCommand {
  type: 'removeEvent'
  eventId: EntityId
}

// ============================================================
// API commands
// ============================================================
export interface BindApiOperationCommand {
  type: 'bindApiOperation'
  operationId: EntityId
  screenId: EntityId
  name: string
  method: HttpMethod
  path: string
  requestBindings?: FieldBinding[]
  successStateId?: EntityId
  errorStateId?: EntityId
}

export interface UpdateApiOperationCommand {
  type: 'updateApiOperation'
  operationId: EntityId
  name: string
  method: HttpMethod
  path: string
  requestBindings: FieldBinding[]
  successStateId: EntityId | null
  errorStateId: EntityId | null
}

export interface RemoveApiOperationCommand {
  type: 'removeApiOperation'
  operationId: EntityId
}
