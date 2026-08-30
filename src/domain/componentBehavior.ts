import type { Locale } from '../i18n/messages'
import { getComponentDisplayLabel } from './componentDisplayLabel'
import { getOwnEntity } from './entityMap'
import type {
  EntityId,
  ApiOperation,
  EventAction,
  FieldBinding,
  HttpMethod,
  ProjectDocument,
  ScreenEvent,
  ValidationRule,
} from './model'
import { CONTAINER_KINDS } from './model'

export interface ResolvedReference {
  id: EntityId
  label: string | null
}

export interface ResolvedScreenReference extends ResolvedReference {
  route: string | null
}

export interface ResolvedApiReference extends ResolvedReference {
  method: HttpMethod | null
  path: string | null
  successState: ResolvedReference | null
  errorState: ResolvedReference | null
}

export type ResolvedEventAction =
  | { type: 'setState'; state: ResolvedReference }
  | { type: 'callApi'; operation: ResolvedApiReference }
  | { type: 'showAlert'; alert: ResolvedReference }
  | { type: 'navigate'; screen: ResolvedScreenReference }

export interface ComponentBehaviorEvent {
  id: EntityId
  name: string | null
  triggerType: 'click' | 'submit' | null
  configuredByButton: boolean
  triggeredByComponent: boolean
  actions: ResolvedEventAction[]
}

export interface ResolvedFieldBinding {
  component: ResolvedReference
  targetPath: string
}

export interface ResolvedApiBinding {
  operation: ResolvedApiReference
  targetPath: string
}

export interface ComponentBehaviorProjection {
  events: ComponentBehaviorEvent[]
  validationRules: ValidationRule[]
  apiBindings: ResolvedApiBinding[]
  hasBehavior: boolean
}

export interface EventEditorStateOption extends ResolvedReference {
  isDefault: boolean
}

export interface EventEditorEvent {
  event: ScreenEvent
  configuredByButton: boolean
}

export interface EventEditorContext {
  componentId: EntityId
  screenId: EntityId
  supportsEventCreation: boolean
  events: EventEditorEvent[]
  states: EventEditorStateOption[]
  screens: ResolvedScreenReference[]
  apiOperations: ResolvedApiReference[]
  alerts: ResolvedReference[]
}

export interface ApiEditorOperation {
  operation: ApiOperation
  reference: ResolvedApiReference
  bindings: ResolvedFieldBinding[]
  eventReferences: Array<{
    event: ResolvedReference
    actionCount: number
  }>
}

export interface ApiEditorContext {
  componentId: EntityId
  screenId: EntityId
  supportsApiEditing: boolean
  operations: ApiEditorOperation[]
  states: ResolvedReference[]
  inputComponents: ResolvedReference[]
}

export interface ValidationRulesEditorContext {
  componentId: EntityId
  label: string
  supportsValidationEditing: boolean
  rules: ValidationRule[]
}

function resolveState(document: ProjectDocument, stateId: EntityId): ResolvedReference {
  const state = getOwnEntity(document.screenStates, stateId)
  return { id: stateId, label: state?.name ?? null }
}

function resolveComponent(
  document: ProjectDocument,
  componentId: EntityId,
  locale: Locale,
): ResolvedReference {
  const component = getOwnEntity(document.components, componentId)
  return {
    id: componentId,
    label: component ? getComponentDisplayLabel(component, locale) : null,
  }
}

function resolveApi(
  document: ProjectDocument,
  operationId: EntityId,
): ResolvedApiReference {
  const operation = getOwnEntity(document.apiOperations, operationId)
  return {
    id: operationId,
    label: operation?.name ?? null,
    method: operation?.method ?? null,
    path: operation?.path ?? null,
    successState: operation?.successStateId
      ? resolveState(document, operation.successStateId)
      : null,
    errorState: operation?.errorStateId
      ? resolveState(document, operation.errorStateId)
      : null,
  }
}

function resolveAction(
  document: ProjectDocument,
  action: EventAction,
  locale: Locale,
): ResolvedEventAction {
  switch (action.type) {
    case 'setState':
      return { type: action.type, state: resolveState(document, action.stateId) }
    case 'callApi':
      return { type: action.type, operation: resolveApi(document, action.apiOperationId) }
    case 'showAlert':
      return {
        type: action.type,
        alert: resolveComponent(document, action.componentId, locale),
      }
    case 'navigate': {
      const screen = getOwnEntity(document.screens, action.destinationScreenId)
      return {
        type: action.type,
        screen: {
          id: action.destinationScreenId,
          label: screen?.name ?? null,
          route: screen?.route ?? null,
        },
      }
    }
  }
}

function componentEvents(
  document: ProjectDocument,
  componentId: EntityId,
): ScreenEvent[] {
  const component = getOwnEntity(document.components, componentId)
  if (!component) return []
  const screen = getOwnEntity(document.screens, component.screenId)
  const seenEventIds = new Set<EntityId>()
  const events: ScreenEvent[] = []
  for (const eventId of screen?.eventIds ?? []) {
    if (seenEventIds.has(eventId)) continue
    seenEventIds.add(eventId)
    const event = getOwnEntity(document.events, eventId)
    if (event?.trigger.componentId === componentId) events.push(event)
  }
  return events
}

export function getComponentBehavior(
  document: ProjectDocument,
  componentId: EntityId,
  locale: Locale = 'en',
): ComponentBehaviorProjection | null {
  const component = getOwnEntity(document.components, componentId)
  if (!component) return null

  const events = componentEvents(document, componentId).map(event => ({
    id: event.id,
    name: event.name,
    triggerType: event.trigger.type,
    configuredByButton: (
      component.config.kind === 'button' &&
      component.config.eventId === event.id
    ),
    triggeredByComponent: true,
    actions: event.actions.map(action => resolveAction(document, action, locale)),
  }))

  const validationRules = component.config.kind === 'textInput'
    ? component.config.validationRules
    : []
  const apiBindings = Object.values(document.apiOperations).flatMap(operation =>
    operation.requestBindings
      .filter(apiBinding => apiBinding.componentId === componentId)
      .map(apiBinding => ({
        operation: resolveApi(document, operation.id),
        targetPath: apiBinding.targetPath,
      })),
  )

  return {
    events,
    validationRules,
    apiBindings,
    hasBehavior: (
      events.length > 0 ||
      validationRules.length > 0 ||
      apiBindings.length > 0
    ),
  }
}

export function getEventEditorContext(
  document: ProjectDocument,
  componentId: EntityId,
  locale: Locale = 'en',
): EventEditorContext | null {
  const component = getOwnEntity(document.components, componentId)
  if (!component) return null
  const screen = getOwnEntity(document.screens, component.screenId)
  if (!screen) return null

  return {
    componentId,
    screenId: screen.id,
    supportsEventCreation: !CONTAINER_KINDS.includes(component.kind),
    events: componentEvents(document, componentId).map(event => ({
      event,
      configuredByButton: (
        component.config.kind === 'button' &&
        component.config.eventId === event.id
      ),
    })),
    states: screen.stateIds.flatMap(stateId => {
      const state = getOwnEntity(document.screenStates, stateId)
      return state
        ? [{
            ...resolveState(document, stateId),
            isDefault: stateId === screen.defaultStateId,
          }]
        : []
    }),
    screens: document.project.screenIds.flatMap(screenId => {
      const candidate = getOwnEntity(document.screens, screenId)
      return candidate
        ? [{
            id: candidate.id,
            label: candidate.name,
            route: candidate.route,
          }]
        : []
    }),
    apiOperations: Object.values(document.apiOperations)
      .filter(operation => operation.screenId === screen.id)
      .map(operation => resolveApi(document, operation.id)),
    alerts: Object.values(document.components)
      .filter(candidate => candidate.screenId === screen.id && candidate.kind === 'alert')
      .map(candidate => resolveComponent(document, candidate.id, locale)),
  }
}

function resolveBinding(
  document: ProjectDocument,
  binding: FieldBinding,
  locale: Locale,
): ResolvedFieldBinding {
  return {
    component: resolveComponent(document, binding.componentId, locale),
    targetPath: binding.targetPath,
  }
}

export function getApiEditorContext(
  document: ProjectDocument,
  componentId: EntityId,
  locale: Locale = 'en',
): ApiEditorContext | null {
  const component = getOwnEntity(document.components, componentId)
  if (!component) return null
  const screen = getOwnEntity(document.screens, component.screenId)
  if (!screen) return null

  const events = screen.eventIds.flatMap(eventId => {
    const event = getOwnEntity(document.events, eventId)
    return event ? [event] : []
  })

  return {
    componentId,
    screenId: screen.id,
    supportsApiEditing: !CONTAINER_KINDS.includes(component.kind),
    operations: Object.values(document.apiOperations)
      .filter(operation => operation.screenId === screen.id)
      .map(operation => ({
        operation,
        reference: resolveApi(document, operation.id),
        bindings: operation.requestBindings.map(binding =>
          resolveBinding(document, binding, locale),
        ),
        eventReferences: events.flatMap(event => {
          const actionCount = event.actions.filter(action =>
            action.type === 'callApi' && action.apiOperationId === operation.id,
          ).length
          return actionCount > 0
            ? [{
                event: { id: event.id, label: event.name },
                actionCount,
              }]
            : []
        }),
      })),
    states: screen.stateIds.map(stateId => resolveState(document, stateId)),
    inputComponents: Object.values(document.components)
      .filter(candidate =>
        candidate.screenId === screen.id &&
        (candidate.kind === 'textInput' || candidate.kind === 'select'),
      )
      .map(candidate => resolveComponent(document, candidate.id, locale)),
  }
}

export function getValidationRulesEditorContext(
  document: ProjectDocument,
  componentId: EntityId,
  locale: Locale = 'en',
): ValidationRulesEditorContext | null {
  const component = getOwnEntity(document.components, componentId)
  if (!component) return null

  return {
    componentId,
    label: getComponentDisplayLabel(component, locale),
    supportsValidationEditing: component.config.kind === 'textInput',
    rules: component.config.kind === 'textInput' ? component.config.validationRules : [],
  }
}
