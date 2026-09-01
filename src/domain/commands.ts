import type {
  ApiOperation,
  CommonComponentSpec,
  ComponentConfig,
  ComponentDefinition,
  ComponentKind,
  ComponentPlacement,
  ComponentSizing,
  EntityId,
  EventAction,
  EventTrigger,
  FieldBinding,
  HttpMethod,
  ScreenComponent,
  ScreenEvent,
  ScreenScenario,
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
  | ExtractComponentDefinitionCommand
  | DetachDefinitionInstanceCommand
  | PutComponentDefinitionCommand
  | AddDefinitionInstanceCommand
  | UpdateDefinitionInstanceCommand
  // Scenario commands
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
  | RemoveComponentDefinitionCommand

// ============================================================
// Screen commands
// ============================================================
export interface AddScreenCommand {
  type: 'addScreen'
  screenId: EntityId
  rootComponentId: EntityId
  name: string
  route: string
  baseDescription?: string
}

export interface UpdateScreenCommand {
  type: 'updateScreen'
  screenId: EntityId
  name?: string
  route?: string
  baseDescription?: string
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
  sizing: ComponentSizing
  config: ComponentConfig
  position?: number
}

export interface MoveComponentCommand {
  type: 'moveComponent'
  componentId: EntityId
  newParentId: EntityId
  position?: number
}

export interface ComponentSubtreeSnapshot {
  projectId: EntityId
  sourceScreenId: EntityId
  rootComponentId: EntityId
  components: Record<EntityId, ScreenComponent>
  scenarioOverrides: Record<EntityId, ScreenScenario['componentOverrides']>
  events: Record<EntityId, ScreenEvent>
  apiOperations: Record<EntityId, ApiOperation>
}

export interface DuplicateComponentCommand {
  type: 'duplicateComponent'
  componentId: EntityId
  componentIdMap: Record<EntityId, EntityId>
  eventIdMap: Record<EntityId, EntityId>
  apiOperationIdMap: Record<EntityId, EntityId>
}

export interface PasteComponentCommand {
  type: 'pasteComponent'
  snapshot: ComponentSubtreeSnapshot
  destinationComponentId: EntityId
  destinationScreenId: EntityId
  destinationParentId: EntityId
  position: number
  componentIdMap: Record<EntityId, EntityId>
  eventIdMap: Record<EntityId, EntityId>
  apiOperationIdMap: Record<EntityId, EntityId>
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
    sizing?: ComponentSizing
  }
}

export interface ExtractComponentDefinitionCommand {
  type: 'extractComponentDefinition'
  sourceRootComponentId: EntityId
  sourceScreenId: EntityId
  definition: ComponentDefinition
  replacementInstanceId: EntityId
  componentIdToNodePath: Record<EntityId, [EntityId, ...EntityId[]]>
}

export interface DetachDefinitionInstanceCommand {
  type: 'detachDefinitionInstance'
  instanceId: EntityId
  generatedComponents: Array<{
    nodePath: [EntityId, ...EntityId[]]
    componentId: EntityId
  }>
}

export interface PutComponentDefinitionCommand {
  type: 'putComponentDefinition'
  mode: 'create' | 'update'
  definition: ComponentDefinition
}

export interface AddDefinitionInstanceCommand {
  type: 'addDefinitionInstance'
  componentId: EntityId
  screenId: EntityId
  parentId: EntityId
  position?: number
  definitionId: EntityId
  variantId: EntityId | null
  props: Record<string, string | number | boolean>
  placement: ComponentPlacement
  sizing: ComponentSizing
}

export interface UpdateDefinitionInstanceCommand {
  type: 'updateDefinitionInstance'
  componentId: EntityId
  variantId?: EntityId | null
  props?: Record<string, string | number | boolean>
  placement?: ComponentPlacement
  sizing?: ComponentSizing
}

// ============================================================
// Scenario commands
// ============================================================
export interface CreateScreenStateCommand {
  type: 'createScreenState'
  stateId: EntityId
  screenId: EntityId
  name: string
  description?: string
  overrides?: ScreenScenario['componentOverrides']
}

export interface UpdateScreenStateCommand {
  type: 'updateScreenState'
  stateId: EntityId
  name?: string
  description?: string
  overrides?: ScreenScenario['componentOverrides']
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
  successScenarioId?: EntityId
  errorScenarioId?: EntityId
}

export interface UpdateApiOperationCommand {
  type: 'updateApiOperation'
  operationId: EntityId
  name: string
  method: HttpMethod
  path: string
  requestBindings: FieldBinding[]
  successScenarioId: EntityId | null
  errorScenarioId: EntityId | null
}

export interface RemoveApiOperationCommand {
  type: 'removeApiOperation'
  operationId: EntityId
}

// ============================================================
// Definition commands
// ============================================================
export interface RemoveComponentDefinitionCommand {
  type: 'removeComponentDefinition'
  definitionId: EntityId
}
