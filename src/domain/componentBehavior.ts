import type { Locale } from '../i18n/messages'
import { getComponentDisplayLabel } from './componentDisplayLabel'
import { getOwnEntity } from './entityMap'
import type {
  EntityId,
  EventAction,
  HttpMethod,
  ProjectDocument,
  ValidationRule,
} from './model'

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
  requestBinding: ResolvedFieldBinding | null
  apiBindings: ResolvedApiBinding[]
  hasBehavior: boolean
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

export function getComponentBehavior(
  document: ProjectDocument,
  componentId: EntityId,
  locale: Locale = 'en',
): ComponentBehaviorProjection | null {
  const component = getOwnEntity(document.components, componentId)
  if (!component) return null

  const screen = getOwnEntity(document.screens, component.screenId)
  const seenEventIds = new Set<EntityId>()
  const events: ComponentBehaviorEvent[] = []
  for (const eventId of screen?.eventIds ?? []) {
    if (seenEventIds.has(eventId)) continue
    seenEventIds.add(eventId)
    const event = getOwnEntity(document.events, eventId)
    const triggeredByComponent = event?.trigger.componentId === componentId
    if (!triggeredByComponent) continue
    events.push({
      id: eventId,
      name: event?.name ?? null,
      triggerType: event?.trigger.type ?? null,
      configuredByButton: (
        component.config.kind === 'button' &&
        component.config.eventId === eventId
      ),
      triggeredByComponent,
      actions: event?.actions.map(action => resolveAction(document, action, locale)) ?? [],
    })
  }

  const validationRules = component.config.kind === 'textInput'
    ? component.config.validationRules
    : []
  const binding = (
    component.config.kind === 'textInput' ||
    component.config.kind === 'select'
  )
    ? component.config.requestBinding
    : null
  const requestBinding = binding
    ? {
        component: resolveComponent(document, binding.componentId, locale),
        targetPath: binding.targetPath,
      }
    : null
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
    requestBinding,
    apiBindings,
    hasBehavior: (
      events.length > 0 ||
      validationRules.length > 0 ||
      requestBinding !== null ||
      apiBindings.length > 0
    ),
  }
}
