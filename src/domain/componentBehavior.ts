import type { Locale } from '../i18n/messages'
import { getComponentDisplayLabel } from './componentDisplayLabel'
import {
  CONTAINER_KINDS,
  type ApiOperation,
  type ComponentTargetRef,
  type EntityId,
  type EventAction,
  type FieldBinding,
  type HttpMethod,
  type ProjectDocument,
  type ScreenEvent,
  type ValidationRule,
  isInlineScreenComponent,
} from './model'
import { getOwnEntity } from './entityMap'
import {
  cloneComponentTargetRef,
  componentTargetRefEquals,
  componentTargetRefKey,
  inlineTargetRef,
} from './componentTargets'
import { resolveComponentTarget, resolveScreenNodes } from './definitionResolver'

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
  successScenario: ResolvedReference | null
  errorScenario: ResolvedReference | null
}

export type ResolvedEventAction =
  | { type: 'setScenario'; scenario: ResolvedReference }
  | { type: 'clearScenario' }
  | { type: 'callApi'; operation: ResolvedApiReference }
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

export interface EventEditorStateOption extends ResolvedReference {}

export interface EventEditorEvent {
  event: ScreenEvent
  configuredByButton: boolean
}

export interface EventEditorContext {
  componentId: EntityId
  target: ComponentTargetRef
  screenId: EntityId
  supportsEventCreation: boolean
  events: EventEditorEvent[]
  states: EventEditorStateOption[]
  screens: ResolvedScreenReference[]
  apiOperations: ResolvedApiReference[]
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
  inputComponents: Array<ResolvedReference & { target: ComponentTargetRef }>
}

export interface ValidationRulesEditorContext {
  componentId: EntityId
  label: string
  supportsValidationEditing: boolean
  rules: ValidationRule[]
}

function resolveScenario(document: ProjectDocument, scenarioId: EntityId): ResolvedReference {
  const scenario = getOwnEntity(document.screenScenarios, scenarioId)
  return { id: scenarioId, label: scenario?.name ?? null }
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
    successScenario: operation?.successScenarioId
      ? resolveScenario(document, operation.successScenarioId)
      : null,
    errorScenario: operation?.errorScenarioId
      ? resolveScenario(document, operation.errorScenarioId)
      : null,
  }
}

function resolveAction(
  document: ProjectDocument,
  action: EventAction,
): ResolvedEventAction {
  switch (action.type) {
    case 'setScenario':
      return { type: action.type, scenario: resolveScenario(document, action.scenarioId) }
    case 'clearScenario':
      return { type: 'clearScenario' }
    case 'callApi':
      return { type: action.type, operation: resolveApi(document, action.apiOperationId) }
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

function targetEvents(
  document: ProjectDocument,
  screenId: EntityId,
  target: ComponentTargetRef,
): ScreenEvent[] {
  const screen = getOwnEntity(document.screens, screenId)
  const seenEventIds = new Set<EntityId>()
  const events: ScreenEvent[] = []
  for (const eventId of screen?.eventIds ?? []) {
    if (seenEventIds.has(eventId)) continue
    seenEventIds.add(eventId)
    const event = getOwnEntity(document.events, eventId)
    if (event && componentTargetRefEquals(event.trigger.target, target)) events.push(event)
  }
  return events
}

export function getComponentBehavior(
  document: ProjectDocument,
  componentId: EntityId,
): ComponentBehaviorProjection | null {
  const component = getOwnEntity(document.components, componentId)
  if (!component) return null
  if (!isInlineScreenComponent(component)) {
    return {
      events: [],
      validationRules: [],
      apiBindings: [],
      hasBehavior: false,
    }
  }

  return getComponentTargetBehavior(document, component.screenId, inlineTargetRef(component.id))
}

export function getComponentTargetBehavior(
  document: ProjectDocument,
  screenId: EntityId,
  target: ComponentTargetRef,
): ComponentBehaviorProjection | null {
  let resolved
  try {
    resolved = resolveComponentTarget(document, screenId, target)
  } catch {
    return null
  }
  const events = targetEvents(document, screenId, target).map(event => ({
    id: event.id,
    name: event.name,
    triggerType: event.trigger.type,
    configuredByButton: (
      target.type === 'inline' &&
      resolved.config.kind === 'button' &&
      'eventId' in resolved.config &&
      resolved.config.eventId === event.id
    ),
    triggeredByComponent: true,
    actions: event.actions.map(action => resolveAction(document, action)),
  }))

  const validationRules = resolved.config.kind === 'textInput'
    ? resolved.config.validationRules
    : []
  const apiBindings = Object.values(document.apiOperations).flatMap(operation =>
    operation.requestBindings
      .filter(apiBinding => componentTargetRefEquals(apiBinding.source, target))
      .map(apiBinding => ({
        operation: resolveApi(document, operation.id),
        targetPath: apiBinding.targetPath,
      })),
  )

  return {
    events,
    validationRules,
    apiBindings,
    hasBehavior: events.length > 0 || validationRules.length > 0 || apiBindings.length > 0,
  }
}

export function getEventEditorContext(
  document: ProjectDocument,
  componentId: EntityId,
): EventEditorContext | null {
  const component = getOwnEntity(document.components, componentId)
  if (!component || !isInlineScreenComponent(component)) return null
  return getEventEditorContextForTarget(
    document,
    component.screenId,
    inlineTargetRef(componentId),
  )
}

export function getEventEditorContextForTarget(
  document: ProjectDocument,
  screenId: EntityId,
  target: ComponentTargetRef,
): EventEditorContext | null {
  const screen = getOwnEntity(document.screens, screenId)
  if (!screen) return null
  let resolved
  try {
    resolved = resolveComponentTarget(document, screenId, target)
  } catch {
    return null
  }
  return {
    componentId: target.type === 'inline' ? target.componentId : componentTargetRefKey(target),
    target: cloneComponentTargetRef(target),
    screenId: screen.id,
    supportsEventCreation: !CONTAINER_KINDS.includes(resolved.kind),
    events: targetEvents(document, screenId, target).map(event => ({
      event,
      configuredByButton: (
        target.type === 'inline' &&
        resolved.config.kind === 'button' &&
        'eventId' in resolved.config &&
        resolved.config.eventId === event.id
      ),
    })),
    states: screen.scenarioIds.flatMap(scenarioId => {
      const scenario = getOwnEntity(document.screenScenarios, scenarioId)
      return scenario
        ? [{ id: scenario.id, label: scenario.name }]
        : []
    }),
    screens: document.project.screenIds.flatMap(screenId => {
      const candidate = getOwnEntity(document.screens, screenId)
      return candidate
        ? [{ id: candidate.id, label: candidate.name, route: candidate.route }]
        : []
    }),
    apiOperations: Object.values(document.apiOperations)
      .filter(operation => operation.screenId === screen.id)
      .map(operation => resolveApi(document, operation.id)),
  }
}

function resolveBinding(
  document: ProjectDocument,
  binding: FieldBinding,
  locale: Locale,
): ResolvedFieldBinding {
  if (binding.source.type !== 'inline') {
    return {
      component: { id: componentTargetRefKey(binding.source), label: null },
      targetPath: binding.targetPath,
    }
  }
  return {
    component: resolveComponent(document, binding.source.componentId, locale),
    targetPath: binding.targetPath,
  }
}

export function getApiEditorContext(
  document: ProjectDocument,
  componentId: EntityId,
  locale: Locale = 'en',
): ApiEditorContext | null {
  const component = getOwnEntity(document.components, componentId)
  if (!component || !isInlineScreenComponent(component)) return null
  return getApiEditorContextForTarget(
    document,
    component.screenId,
    inlineTargetRef(componentId),
    locale,
  )
}

function resolvedTargetLabel(
  node: ReturnType<typeof resolveScreenNodes>['orderedNodes'][number],
): string {
  if ('label' in node.config && typeof node.config.label === 'string') return node.config.label
  if (node.config.kind === 'text') return node.config.text
  return node.common.description || node.kind
}

export function getApiEditorContextForTarget(
  document: ProjectDocument,
  screenId: EntityId,
  target: ComponentTargetRef,
  locale: Locale = 'en',
): ApiEditorContext | null {
  const screen = getOwnEntity(document.screens, screenId)
  if (!screen) return null
  let selected
  let resolvedNodes
  try {
    selected = resolveComponentTarget(document, screenId, target)
    resolvedNodes = resolveScreenNodes(document, screenId, null)
  } catch {
    return null
  }
  const events = screen.eventIds.flatMap(eventId => {
    const event = getOwnEntity(document.events, eventId)
    return event ? [event] : []
  })

  return {
    componentId: target.type === 'inline' ? target.componentId : componentTargetRefKey(target),
    screenId: screen.id,
    supportsApiEditing: !CONTAINER_KINDS.includes(selected.kind),
    operations: Object.values(document.apiOperations)
      .filter(operation => operation.screenId === screen.id)
      .map(operation => ({
        operation,
        reference: resolveApi(document, operation.id),
        bindings: operation.requestBindings.map(binding => resolveBinding(document, binding, locale)),
        eventReferences: events.flatMap(event => {
          const actionCount = event.actions.filter(action =>
            action.type === 'callApi' && action.apiOperationId === operation.id,
          ).length
          return actionCount > 0
            ? [{ event: { id: event.id, label: event.name }, actionCount }]
            : []
        }),
      })),
    states: screen.scenarioIds.map(scenarioId => resolveScenario(document, scenarioId)),
    inputComponents: resolvedNodes.orderedNodes
      .filter(candidate => candidate.kind === 'textInput' || candidate.kind === 'select')
      .map(candidate => ({
        id: candidate.canonicalTarget.type === 'inline'
          ? candidate.canonicalTarget.componentId
          : componentTargetRefKey(candidate.canonicalTarget),
        label: candidate.canonicalTarget.type === 'inline'
          ? resolveComponent(
              document,
              candidate.canonicalTarget.componentId,
              locale,
            ).label
          : resolvedTargetLabel(candidate),
        target: cloneComponentTargetRef(candidate.canonicalTarget),
      })),
  }
}

export function getValidationRulesEditorContext(
  document: ProjectDocument,
  componentId: EntityId,
  locale: Locale = 'en',
): ValidationRulesEditorContext | null {
  const component = getOwnEntity(document.components, componentId)
  if (!component || !isInlineScreenComponent(component)) return null
  return {
    componentId,
    label: getComponentDisplayLabel(component, locale),
    supportsValidationEditing: component.config.kind === 'textInput',
    rules: component.config.kind === 'textInput' ? component.config.validationRules : [],
  }
}
