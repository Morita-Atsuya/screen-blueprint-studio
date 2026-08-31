import type {
  ComponentSubtreeSnapshot,
  DomainCommand,
  UpdateComponentSpecCommand,
} from './commands'
import type {
  ApiOperation,
  ComponentConfig,
  ComponentOverride,
  EventAction,
  EventTrigger,
  FieldBinding,
  ProjectDocument,
  Screen,
  ScreenComponent,
  ScreenEvent,
  ScreenState,
  ValidationRule,
} from './model'
import { DomainError } from './errors'

function invalidClone(value: never, context: string): never {
  void value
  throw new DomainError(
    'INVARIANT_VIOLATION',
    `Unsupported ${context}`,
  )
}

function cloneArray<T>(
  values: readonly T[],
  cloneValue: (value: T) => T,
  path: string,
): T[] {
  if (!Array.isArray(values)) {
    throw new DomainError('INVARIANT_VIOLATION', `${path} must be an array`)
  }
  return Array.from({ length: values.length }, (_, index) => {
    if (!Object.prototype.hasOwnProperty.call(values, index)) {
      throw new DomainError('INVARIANT_VIOLATION', `${path} must not contain empty slots`)
    }
    return cloneValue(values[index])
  })
}

function cloneRecord<T>(
  record: Record<string, T>,
  cloneValue: (value: T) => T,
  path: string,
): Record<string, T> {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    throw new DomainError('INVARIANT_VIOLATION', `${path} must be an object`)
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, cloneValue(value)]),
  )
}

export function cloneValidationRule(rule: ValidationRule): ValidationRule {
  return { ...rule }
}

export function cloneComponentConfig(config: ComponentConfig): ComponentConfig {
  switch (config.kind) {
    case 'textInput':
      return {
        ...config,
        validationRules: cloneArray(
          config.validationRules,
          cloneValidationRule,
          'component config validationRules',
        ),
      }
    case 'select':
      return {
        ...config,
        options: cloneArray(
          config.options,
          option => ({ ...option }),
          'component config options',
        ),
      }
    case 'link':
      return { ...config, destination: { ...config.destination } }
    case 'page':
    case 'container':
    case 'text':
    case 'button':
    case 'image':
    case 'modal':
      return { ...config }
    default:
      return invalidClone(config, 'component config clone')
  }
}

type ComponentConfigPatch = NonNullable<UpdateComponentSpecCommand['patch']['config']>

function cloneComponentConfigPatch(patch: ComponentConfigPatch): ComponentConfigPatch {
  if ('validationRules' in patch && patch.validationRules !== undefined) {
    return {
      ...patch,
      validationRules: cloneArray(
        patch.validationRules,
        cloneValidationRule,
        'component config patch validationRules',
      ),
    }
  }
  if ('options' in patch && patch.options !== undefined) {
    return {
      ...patch,
      options: cloneArray(
        patch.options,
        option => ({ ...option }),
        'component config patch options',
      ),
    }
  }
  if ('destination' in patch && patch.destination !== undefined) {
    return {
      ...patch,
      destination: { ...patch.destination },
    }
  }
  return { ...patch }
}

export function cloneComponentOverride(override: ComponentOverride): ComponentOverride {
  if (
    typeof override !== 'object' ||
    override === null ||
    Array.isArray(override)
  ) {
    throw new DomainError('INVARIANT_VIOLATION', 'Component override must be an object')
  }
  return { ...override }
}

export function cloneEventTrigger(trigger: EventTrigger): EventTrigger {
  switch (trigger.type) {
    case 'click':
    case 'submit':
      return { ...trigger }
    default:
      return invalidClone(trigger, 'event trigger clone')
  }
}

export function cloneEventAction(action: EventAction): EventAction {
  switch (action.type) {
    case 'setState':
    case 'callApi':
    case 'navigate':
      return { ...action }
    default:
      return invalidClone(action, 'event action clone')
  }
}

export function cloneFieldBinding(binding: FieldBinding): FieldBinding {
  return { ...binding }
}

export function cloneScreenComponent(component: ScreenComponent): ScreenComponent {
  return {
    ...component,
    childIds: cloneArray(component.childIds, value => value, 'component childIds'),
    common: { ...component.common },
    config: cloneComponentConfig(component.config),
  }
}

function cloneScreen(screen: Screen): Screen {
  return {
    ...screen,
    modalComponentIds: cloneArray(
      screen.modalComponentIds,
      value => value,
      'screen modalComponentIds',
    ),
    stateIds: cloneArray(screen.stateIds, value => value, 'screen stateIds'),
    eventIds: cloneArray(screen.eventIds, value => value, 'screen eventIds'),
  }
}

function cloneScreenState(state: ScreenState): ScreenState {
  return {
    ...state,
    componentOverrides: cloneRecord(
      state.componentOverrides,
      cloneComponentOverride,
      'screen state componentOverrides',
    ),
  }
}

function cloneScreenEvent(event: ScreenEvent): ScreenEvent {
  return {
    ...event,
    trigger: cloneEventTrigger(event.trigger),
    actions: cloneArray(event.actions, cloneEventAction, 'event actions'),
  }
}

function cloneApiOperation(operation: ApiOperation): ApiOperation {
  return {
    ...operation,
    requestBindings: cloneArray(
      operation.requestBindings,
      cloneFieldBinding,
      'API requestBindings',
    ),
  }
}

export function cloneProjectDocument(document: ProjectDocument): ProjectDocument {
  return {
    ...document,
    project: {
      ...document.project,
      screenIds: cloneArray(
        document.project.screenIds,
        value => value,
        'project screenIds',
      ),
    },
    screens: cloneRecord(document.screens, cloneScreen, 'document screens'),
    components: cloneRecord(
      document.components,
      cloneScreenComponent,
      'document components',
    ),
    screenStates: cloneRecord(
      document.screenStates,
      cloneScreenState,
      'document screenStates',
    ),
    events: cloneRecord(document.events, cloneScreenEvent, 'document events'),
    apiOperations: cloneRecord(
      document.apiOperations,
      cloneApiOperation,
      'document apiOperations',
    ),
  }
}

export function cloneComponentSubtreeSnapshot(
  snapshot: ComponentSubtreeSnapshot,
): ComponentSubtreeSnapshot {
  return {
    ...snapshot,
    components: cloneRecord(
      snapshot.components,
      cloneScreenComponent,
      'component snapshot components',
    ),
    stateOverrides: cloneRecord(
      snapshot.stateOverrides,
      overrides => cloneRecord(
        overrides,
        cloneComponentOverride,
        'component snapshot state overrides',
      ),
      'component snapshot states',
    ),
  }
}

export function cloneDomainCommand(command: DomainCommand): DomainCommand {
  switch (command.type) {
    case 'addScreen':
    case 'updateScreen':
    case 'removeScreen':
    case 'moveComponent':
    case 'removeComponent':
    case 'removeScreenState':
    case 'removeEvent':
    case 'removeApiOperation':
      return { ...command }
    case 'addComponent':
      return { ...command, config: cloneComponentConfig(command.config) }
    case 'duplicateComponent':
      return {
        ...command,
        componentIdMap: cloneRecord(
          command.componentIdMap,
          value => value,
          'duplicateComponent componentIdMap',
        ),
      }
    case 'pasteComponent':
      return {
        ...command,
        snapshot: cloneComponentSubtreeSnapshot(command.snapshot),
        componentIdMap: cloneRecord(
          command.componentIdMap,
          value => value,
          'pasteComponent componentIdMap',
        ),
      }
    case 'updateComponentSpec':
      return {
        ...command,
        patch: {
          ...command.patch,
          ...(command.patch.common
            ? { common: { ...command.patch.common } }
            : {}),
          ...(command.patch.config
            ? { config: cloneComponentConfigPatch(command.patch.config) }
            : {}),
        },
      }
    case 'createScreenState':
    case 'updateScreenState':
      return {
        ...command,
        ...(command.overrides
          ? {
              overrides: cloneRecord(
                command.overrides,
                cloneComponentOverride,
                `${command.type} overrides`,
              ),
            }
          : {}),
      }
    case 'connectEvent':
    case 'updateEvent':
      return {
        ...command,
        trigger: cloneEventTrigger(command.trigger),
        actions: cloneArray(command.actions, cloneEventAction, `${command.type} actions`),
      }
    case 'bindApiOperation':
      return {
        ...command,
        ...(command.requestBindings
          ? {
              requestBindings: cloneArray(
                command.requestBindings,
                cloneFieldBinding,
                'bindApiOperation requestBindings',
              ),
            }
          : {}),
      }
    case 'updateApiOperation':
      return {
        ...command,
        requestBindings: cloneArray(
          command.requestBindings,
          cloneFieldBinding,
          'updateApiOperation requestBindings',
        ),
      }
    default:
      return invalidClone(command, 'domain command clone')
  }
}
