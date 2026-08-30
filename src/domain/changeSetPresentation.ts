import { applyCommandWithoutRevision } from './applyCommand'
import type { ChangeSet, ChangeSetOperation } from './collaboration'
import type { DomainCommand } from './commands'
import {
  COMPONENT_KIND_MESSAGE_KEYS,
  getComponentHierarchyLabel,
} from './componentDisplayLabel'
import { getOwnEntity } from './entityMap'
import type {
  ComponentOverride,
  EntityId,
  EventAction,
  EventTrigger,
  FieldBinding,
  ProjectDocument,
  ScreenComponent,
  ValidationRule,
} from './model'
import {
  commandMessageKey,
  translate,
  type Locale,
  type MessageKey,
} from '../i18n/messages'

const VALUE_LIMIT = 72

export interface ReviewValue {
  text: string
  fullText: string
}

export interface ReviewFieldChange {
  field: string
  before: ReviewValue
  after: ReviewValue
}

export interface ReviewNavigation {
  screenId: EntityId
  componentId?: EntityId
  stateId?: EntityId
}

export interface ChangeOperationPresentation {
  operationId: EntityId
  source: ChangeSetOperation['source']
  commandType: DomainCommand['type']
  action: string
  entityKind: string
  targetLabel: string
  screenContext: string | null
  changes: ReviewFieldChange[]
  impact: string | null
  navigation: ReviewNavigation | null
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim().replace(/[ \t]+/g, ' '))
    .join(' ↵ ')
}

function reviewValue(text: string): ReviewValue {
  const fullText = normalizeText(text)
  const characters = Array.from(fullText)
  return {
    text: characters.length <= VALUE_LIMIT
      ? fullText
      : `${characters.slice(0, VALUE_LIMIT - 1).join('')}…`,
    fullText,
  }
}

function specialValue(locale: Locale, key: MessageKey): ReviewValue {
  return reviewValue(translate(locale, key))
}

function componentLabel(
  document: ProjectDocument,
  componentId: EntityId | null | undefined,
  locale: Locale,
): string {
  if (!componentId) return translate(locale, 'review.value.none')
  const component = getOwnEntity(document.components, componentId)
  return component
    ? getComponentHierarchyLabel(document, component, locale)
    : translate(locale, 'review.value.missing')
}

function screenLabel(document: ProjectDocument, screenId: EntityId | null | undefined, locale: Locale): string {
  if (!screenId) return translate(locale, 'review.value.none')
  return getOwnEntity(document.screens, screenId)?.name ??
    translate(locale, 'review.value.missing')
}

function stateLabel(document: ProjectDocument, stateId: EntityId | null | undefined, locale: Locale): string {
  if (!stateId) return translate(locale, 'review.value.none')
  return getOwnEntity(document.screenStates, stateId)?.name ??
    translate(locale, 'review.value.missing')
}

function apiLabel(document: ProjectDocument, operationId: EntityId, locale: Locale): string {
  const operation = getOwnEntity(document.apiOperations, operationId)
  return operation
    ? `${operation.method} ${operation.path} — ${operation.name}`
    : translate(locale, 'review.value.missing')
}

function eventLabel(document: ProjectDocument, eventId: EntityId, locale: Locale): string {
  return getOwnEntity(document.events, eventId)?.name ??
    translate(locale, 'review.value.missing')
}

function formatTrigger(document: ProjectDocument, trigger: EventTrigger, locale: Locale): string {
  return `${translate(locale, `behavior.trigger.${trigger.type}`)} — ${
    componentLabel(document, trigger.componentId, locale)
  }`
}

function formatAction(document: ProjectDocument, action: EventAction, locale: Locale): string {
  const actionLabel = translate(locale, `behavior.action.${action.type}`)
  switch (action.type) {
    case 'setState':
      return `${actionLabel}: ${stateLabel(document, action.stateId, locale)}`
    case 'callApi':
      return `${actionLabel}: ${apiLabel(document, action.apiOperationId, locale)}`
    case 'showAlert':
      return `${actionLabel}: ${componentLabel(document, action.componentId, locale)}`
    case 'navigate':
      return `${actionLabel}: ${screenLabel(document, action.destinationScreenId, locale)}`
  }
}

function formatActions(document: ProjectDocument, actions: EventAction[], locale: Locale): string {
  if (actions.length === 0) return translate(locale, 'review.value.emptyList')
  return actions.map((action, index) =>
    `${index + 1}. ${formatAction(document, action, locale)}`
  ).join(' · ')
}

function formatBindings(document: ProjectDocument, bindings: FieldBinding[], locale: Locale): string {
  if (bindings.length === 0) return translate(locale, 'review.value.emptyList')
  return bindings.map(binding =>
    `${componentLabel(document, binding.componentId, locale)} → ${binding.targetPath}`
  ).join(' · ')
}

function formatValidationRule(rule: ValidationRule, locale: Locale): string {
  const type = translate(locale, `behavior.validation.${rule.type}`)
  switch (rule.type) {
    case 'minLength':
    case 'maxLength':
    case 'pattern':
      return `${type} (${rule.value}): ${rule.message}`
    case 'custom':
      return `${type} (${rule.description}): ${rule.message}`
    case 'required':
    case 'email':
      return `${type}: ${rule.message}`
  }
}

function formatValidationRules(rules: ValidationRule[], locale: Locale): string {
  if (rules.length === 0) return translate(locale, 'review.value.emptyList')
  return rules.map((rule, index) => `${index + 1}. ${formatValidationRule(rule, locale)}`).join(' · ')
}

function formatOverrides(
  document: ProjectDocument,
  overrides: Record<EntityId, ComponentOverride>,
  locale: Locale,
): string {
  const entries = Object.entries(overrides)
  if (entries.length === 0) return translate(locale, 'review.value.emptyList')
  return entries.map(([componentId, override]) => {
    const values = Object.entries(override).map(([key, value]) =>
      `${fieldLabel(`override.${key}`, locale)}=${formatValue(document, key, value, locale)}`
    )
    return `${componentLabel(document, componentId, locale)}: ${values.join(', ')}`
  }).join(' · ')
}

function formatValue(
  document: ProjectDocument,
  field: string,
  value: unknown,
  locale: Locale,
): string {
  if (value === undefined) return translate(locale, 'review.value.notSet')
  if (value === null) return translate(locale, 'review.value.none')
  if (typeof value === 'boolean') {
    return translate(locale, value ? 'review.value.yes' : 'review.value.no')
  }
  if (typeof value === 'string') {
    if (value === '') return translate(locale, 'review.value.empty')
    if (field === 'parentId') return componentLabel(document, value, locale)
    if (field === 'successStateId' || field === 'errorStateId') {
      return stateLabel(document, value, locale)
    }
    if (field === 'eventId') return eventLabel(document, value, locale)
    return value
  }
  if (typeof value === 'number') return String(value)
  if (field === 'trigger') return formatTrigger(document, value as EventTrigger, locale)
  if (field === 'actions') return formatActions(document, value as EventAction[], locale)
  if (field === 'requestBindings') return formatBindings(document, value as FieldBinding[], locale)
  if (field === 'validationRules') {
    return formatValidationRules(value as ValidationRule[], locale)
  }
  if (field === 'componentOverrides') {
    return formatOverrides(
      document,
      value as Record<EntityId, ComponentOverride>,
      locale,
    )
  }
  if (field === 'options') {
    const options = value as Array<{ value: string; label: string }>
    return options.length === 0
      ? translate(locale, 'review.value.emptyList')
      : options.map(option => `${option.label} (${option.value})`).join(' · ')
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? translate(locale, 'review.value.emptyList')
      : value.map(item => String(item)).join(' · ')
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([key, nested]) => `${key}=${formatValue(document, key, nested, locale)}`)
    .join(', ')
}

const FIELD_KEYS: Record<string, MessageKey> = {
  status: 'review.field.status',
  kind: 'review.field.type',
  parentId: 'review.field.parent',
  position: 'review.field.position',
  name: 'review.field.name',
  route: 'review.field.route',
  description: 'review.field.description',
  visible: 'review.field.visible',
  enabled: 'review.field.enabled',
  layout: 'review.field.layout',
  gap: 'review.field.gap',
  columns: 'review.field.columns',
  justify: 'review.field.justify',
  align: 'review.field.align',
  wrap: 'review.field.wrap',
  text: 'review.field.text',
  style: 'review.field.textStyle',
  fieldKey: 'review.field.fieldKey',
  label: 'review.field.label',
  inputType: 'review.field.inputType',
  required: 'review.field.required',
  placeholder: 'review.field.placeholder',
  defaultValue: 'review.field.defaultValue',
  validationRules: 'review.field.validationRules',
  options: 'review.field.options',
  variant: 'review.field.variant',
  eventId: 'review.field.event',
  confirmationMessage: 'review.field.confirmationMessage',
  preventDoubleSubmit: 'review.field.preventDoubleSubmit',
  tone: 'review.field.tone',
  message: 'review.field.message',
  componentOverrides: 'review.field.overrides',
  trigger: 'review.field.trigger',
  actions: 'review.field.actions',
  method: 'review.field.method',
  path: 'review.field.path',
  requestBindings: 'review.field.requestBindings',
  successStateId: 'review.field.successState',
  errorStateId: 'review.field.errorState',
  impact: 'review.field.impact',
  'override.visible': 'review.field.visible',
  'override.enabled': 'review.field.enabled',
  'override.text': 'review.field.text',
  'override.message': 'review.field.message',
  'override.value': 'review.field.defaultValue',
}

function fieldLabel(field: string, locale: Locale): string {
  return translate(locale, FIELD_KEYS[field] ?? 'review.field.details')
}

function valuesEqual(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) === JSON.stringify(after)
}

function addChange(
  changes: ReviewFieldChange[],
  field: string,
  before: unknown,
  after: unknown,
  beforeDocument: ProjectDocument,
  afterDocument: ProjectDocument,
  locale: Locale,
): void {
  if (valuesEqual(before, after)) return
  changes.push({
    field: fieldLabel(field, locale),
    before: reviewValue(formatValue(beforeDocument, field, before, locale)),
    after: reviewValue(formatValue(afterDocument, field, after, locale)),
  })
}

function addStatus(
  changes: ReviewFieldChange[],
  beforeKey: MessageKey,
  afterKey: MessageKey,
  locale: Locale,
): void {
  changes.push({
    field: fieldLabel('status', locale),
    before: specialValue(locale, beforeKey),
    after: specialValue(locale, afterKey),
  })
}

function componentPosition(document: ProjectDocument, component: ScreenComponent): number {
  if (component.parentId) {
    const parent = getOwnEntity(document.components, component.parentId)
    return Math.max(0, parent?.childIds.indexOf(component.id) ?? 0) + 1
  }
  const screen = getOwnEntity(document.screens, component.screenId)
  if (component.kind === 'modal') {
    return Math.max(0, screen?.modalComponentIds.indexOf(component.id) ?? 0) + 1
  }
  return 1
}

function addComponentFields(
  changes: ReviewFieldChange[],
  component: ScreenComponent,
  afterDocument: ProjectDocument,
  locale: Locale,
): void {
  addChange(
    changes,
    'kind',
    undefined,
    translate(locale, COMPONENT_KIND_MESSAGE_KEYS[component.kind]),
    afterDocument,
    afterDocument,
    locale,
  )
  addChange(
    changes,
    'parentId',
    undefined,
    component.parentId,
    afterDocument,
    afterDocument,
    locale,
  )
  addChange(
    changes,
    'position',
    undefined,
    componentPosition(afterDocument, component),
    afterDocument,
    afterDocument,
    locale,
  )
  for (const [field, value] of Object.entries(component.config)) {
    if (field === 'kind') continue
    addChange(changes, field, undefined, value, afterDocument, afterDocument, locale)
  }
}

function addPatchedFields(
  changes: ReviewFieldChange[],
  command: Extract<DomainCommand, { type: 'updateComponentSpec' }>,
  before: ScreenComponent,
  after: ScreenComponent,
  beforeDocument: ProjectDocument,
  afterDocument: ProjectDocument,
  locale: Locale,
): void {
  for (const field of Object.keys(command.patch.common ?? {})) {
    addChange(
      changes,
      field,
      before.common[field as keyof typeof before.common],
      after.common[field as keyof typeof after.common],
      beforeDocument,
      afterDocument,
      locale,
    )
  }
  for (const field of Object.keys(command.patch.config ?? {})) {
    addChange(
      changes,
      field,
      (before.config as unknown as Record<string, unknown>)[field],
      (after.config as unknown as Record<string, unknown>)[field],
      beforeDocument,
      afterDocument,
      locale,
    )
  }
}

function entityImpact(
  before: ProjectDocument,
  after: ProjectDocument,
  command: DomainCommand,
  locale: Locale,
): string | null {
  const removed = {
    components: Math.max(
      0,
      Object.keys(before.components).filter(id => !getOwnEntity(after.components, id)).length -
        (command.type === 'removeComponent' ? 1 : 0),
    ),
    states: Math.max(
      0,
      Object.keys(before.screenStates).filter(id => !getOwnEntity(after.screenStates, id)).length -
        (command.type === 'removeScreenState' ? 1 : 0),
    ),
    events: Math.max(
      0,
      Object.keys(before.events).filter(id => !getOwnEntity(after.events, id)).length -
        (command.type === 'removeEvent' ? 1 : 0),
    ),
    api: Math.max(
      0,
      Object.keys(before.apiOperations).filter(id => !getOwnEntity(after.apiOperations, id)).length -
        (command.type === 'removeApiOperation' ? 1 : 0),
    ),
  }
  function changedEntities<T>(
    beforeMap: Record<EntityId, T>,
    afterMap: Record<EntityId, T>,
  ): number {
    return Object.keys(beforeMap).filter(id =>
      getOwnEntity(afterMap, id) &&
      !valuesEqual(getOwnEntity(beforeMap, id), getOwnEntity(afterMap, id))
    ).length
  }
  const changedReferences =
    changedEntities(before.components, after.components) +
    changedEntities(before.screenStates, after.screenStates) +
    changedEntities(before.events, after.events) +
    changedEntities(before.apiOperations, after.apiOperations)
  if (
    removed.components === 0 &&
    removed.states === 0 &&
    removed.events === 0 &&
    removed.api === 0 &&
    changedReferences === 0
  ) {
    return null
  }
  return translate(locale, 'review.impactCounts', {
    components: removed.components,
    states: removed.states,
    events: removed.events,
    api: removed.api,
    references: changedReferences,
  })
}

function commandEntityKind(command: DomainCommand): 'screen' | 'component' | 'state' | 'event' | 'api' {
  switch (command.type) {
    case 'addScreen':
    case 'updateScreen':
    case 'removeScreen':
      return 'screen'
    case 'addComponent':
    case 'moveComponent':
    case 'removeComponent':
    case 'updateComponentSpec':
      return 'component'
    case 'createScreenState':
    case 'updateScreenState':
    case 'removeScreenState':
      return 'state'
    case 'connectEvent':
    case 'updateEvent':
    case 'removeEvent':
      return 'event'
    case 'bindApiOperation':
    case 'updateApiOperation':
    case 'removeApiOperation':
      return 'api'
  }
}

function targetForCommand(
  command: DomainCommand,
  before: ProjectDocument,
  after: ProjectDocument,
  locale: Locale,
): { label: string; screenId: EntityId | null } {
  switch (command.type) {
    case 'addScreen':
    case 'updateScreen':
      return {
        label: screenLabel(after, command.screenId, locale),
        screenId: command.screenId,
      }
    case 'removeScreen':
      return {
        label: screenLabel(before, command.screenId, locale),
        screenId: command.screenId,
      }
    case 'addComponent':
    case 'moveComponent':
    case 'updateComponentSpec': {
      const component = getOwnEntity(after.components, command.componentId)
      return {
        label: component
          ? getComponentHierarchyLabel(after, component, locale)
          : translate(locale, 'review.value.missing'),
        screenId: component?.screenId ?? null,
      }
    }
    case 'removeComponent': {
      const component = getOwnEntity(before.components, command.componentId)
      return {
        label: component
          ? getComponentHierarchyLabel(before, component, locale)
          : translate(locale, 'review.value.missing'),
        screenId: component?.screenId ?? null,
      }
    }
    case 'createScreenState':
      return {
        label: stateLabel(after, command.stateId, locale),
        screenId: command.screenId,
      }
    case 'updateScreenState': {
      const state = getOwnEntity(after.screenStates, command.stateId)
      return {
        label: state?.name ?? translate(locale, 'review.value.missing'),
        screenId: state?.screenId ?? null,
      }
    }
    case 'removeScreenState': {
      const state = getOwnEntity(before.screenStates, command.stateId)
      return {
        label: state?.name ?? translate(locale, 'review.value.missing'),
        screenId: state?.screenId ?? null,
      }
    }
    case 'connectEvent':
    case 'updateEvent': {
      const event = getOwnEntity(after.events, command.eventId)
      return {
        label: event?.name ?? translate(locale, 'review.value.missing'),
        screenId: event?.screenId ?? null,
      }
    }
    case 'removeEvent': {
      const event = getOwnEntity(before.events, command.eventId)
      return {
        label: event?.name ?? translate(locale, 'review.value.missing'),
        screenId: event?.screenId ?? null,
      }
    }
    case 'bindApiOperation':
    case 'updateApiOperation': {
      const operation = getOwnEntity(after.apiOperations, command.operationId)
      return {
        label: operation
          ? `${operation.method} ${operation.path} — ${operation.name}`
          : translate(locale, 'review.value.missing'),
        screenId: operation?.screenId ?? null,
      }
    }
    case 'removeApiOperation': {
      const operation = getOwnEntity(before.apiOperations, command.operationId)
      return {
        label: operation
          ? `${operation.method} ${operation.path} — ${operation.name}`
          : translate(locale, 'review.value.missing'),
        screenId: operation?.screenId ?? null,
      }
    }
  }
}

function navigationForCommand(
  command: DomainCommand,
  before: ProjectDocument,
  after: ProjectDocument,
): ReviewNavigation | null {
  switch (command.type) {
    case 'removeScreen':
    case 'removeComponent':
    case 'removeScreenState':
    case 'removeEvent':
    case 'removeApiOperation':
      return null
    case 'addScreen':
    case 'updateScreen': {
      const screen = getOwnEntity(after.screens, command.screenId)
      return screen
        ? { screenId: screen.id, componentId: screen.rootComponentId }
        : null
    }
    case 'addComponent':
    case 'moveComponent':
    case 'updateComponentSpec': {
      const component = getOwnEntity(after.components, command.componentId)
      return component
        ? { screenId: component.screenId, componentId: component.id }
        : null
    }
    case 'createScreenState': {
      const state = getOwnEntity(after.screenStates, command.stateId)
      return state ? { screenId: state.screenId, stateId: state.id } : null
    }
    case 'updateScreenState': {
      const state = getOwnEntity(after.screenStates, command.stateId)
      if (!state) return null
      const beforeState = getOwnEntity(before.screenStates, state.id)
      const changedComponents = Object.keys({
        ...beforeState?.componentOverrides,
        ...state.componentOverrides,
      }).filter(id =>
        !valuesEqual(
          beforeState ? getOwnEntity(beforeState.componentOverrides, id) : undefined,
          getOwnEntity(state.componentOverrides, id),
        )
      )
      const componentId = changedComponents.length === 1 &&
        getOwnEntity(after.components, changedComponents[0])
        ? changedComponents[0]
        : undefined
      return { screenId: state.screenId, stateId: state.id, componentId }
    }
    case 'connectEvent':
    case 'updateEvent': {
      const event = getOwnEntity(after.events, command.eventId)
      return event && getOwnEntity(after.components, event.trigger.componentId)
        ? {
            screenId: event.screenId,
            componentId: event.trigger.componentId,
          }
        : null
    }
    case 'bindApiOperation':
    case 'updateApiOperation': {
      const operation = getOwnEntity(after.apiOperations, command.operationId)
      if (!operation) return null
      const componentId = operation.requestBindings.find(binding =>
        getOwnEntity(after.components, binding.componentId)
      )?.componentId
      const screen = getOwnEntity(after.screens, operation.screenId)
      return screen
        ? {
            screenId: screen.id,
            componentId: componentId ?? screen.rootComponentId,
          }
        : null
    }
  }
}

function buildChanges(
  command: DomainCommand,
  before: ProjectDocument,
  after: ProjectDocument,
  locale: Locale,
): ReviewFieldChange[] {
  const changes: ReviewFieldChange[] = []
  switch (command.type) {
    case 'addScreen': {
      const screen = getOwnEntity(after.screens, command.screenId)!
      addStatus(changes, 'review.value.notSet', 'review.value.added', locale)
      addChange(changes, 'name', undefined, screen.name, before, after, locale)
      addChange(changes, 'route', undefined, screen.route, before, after, locale)
      return changes
    }
    case 'updateScreen': {
      const beforeScreen = getOwnEntity(before.screens, command.screenId)!
      const afterScreen = getOwnEntity(after.screens, command.screenId)!
      if (command.name !== undefined) {
        addChange(changes, 'name', beforeScreen.name, afterScreen.name, before, after, locale)
      }
      if (command.route !== undefined) {
        addChange(changes, 'route', beforeScreen.route, afterScreen.route, before, after, locale)
      }
      return changes
    }
    case 'removeScreen':
      addStatus(changes, 'review.value.existing', 'review.value.deleted', locale)
      return changes
    case 'addComponent': {
      addStatus(changes, 'review.value.notSet', 'review.value.added', locale)
      addComponentFields(changes, getOwnEntity(after.components, command.componentId)!, after, locale)
      return changes
    }
    case 'moveComponent': {
      const beforeComponent = getOwnEntity(before.components, command.componentId)!
      const afterComponent = getOwnEntity(after.components, command.componentId)!
      addChange(
        changes,
        'parentId',
        beforeComponent.parentId,
        afterComponent.parentId,
        before,
        after,
        locale,
      )
      addChange(
        changes,
        'position',
        componentPosition(before, beforeComponent),
        componentPosition(after, afterComponent),
        before,
        after,
        locale,
      )
      return changes
    }
    case 'removeComponent':
      addStatus(changes, 'review.value.existing', 'review.value.deleted', locale)
      return changes
    case 'updateComponentSpec': {
      addPatchedFields(
        changes,
        command,
        getOwnEntity(before.components, command.componentId)!,
        getOwnEntity(after.components, command.componentId)!,
        before,
        after,
        locale,
      )
      return changes
    }
    case 'createScreenState': {
      const state = getOwnEntity(after.screenStates, command.stateId)!
      addStatus(changes, 'review.value.notSet', 'review.value.added', locale)
      addChange(changes, 'name', undefined, state.name, before, after, locale)
      addChange(changes, 'description', undefined, state.description, before, after, locale)
      addChange(
        changes,
        'componentOverrides',
        undefined,
        state.componentOverrides,
        before,
        after,
        locale,
      )
      return changes
    }
    case 'updateScreenState': {
      const beforeState = getOwnEntity(before.screenStates, command.stateId)!
      const afterState = getOwnEntity(after.screenStates, command.stateId)!
      if (command.name !== undefined) {
        addChange(changes, 'name', beforeState.name, afterState.name, before, after, locale)
      }
      if (command.description !== undefined) {
        addChange(
          changes,
          'description',
          beforeState.description,
          afterState.description,
          before,
          after,
          locale,
        )
      }
      if (command.overrides !== undefined) {
        addChange(
          changes,
          'componentOverrides',
          beforeState.componentOverrides,
          afterState.componentOverrides,
          before,
          after,
          locale,
        )
      }
      return changes
    }
    case 'removeScreenState':
      addStatus(changes, 'review.value.existing', 'review.value.deleted', locale)
      return changes
    case 'connectEvent': {
      const event = getOwnEntity(after.events, command.eventId)!
      addStatus(changes, 'review.value.notSet', 'review.value.added', locale)
      addChange(changes, 'name', undefined, event.name, before, after, locale)
      addChange(changes, 'trigger', undefined, event.trigger, before, after, locale)
      addChange(changes, 'actions', undefined, event.actions, before, after, locale)
      return changes
    }
    case 'updateEvent': {
      const beforeEvent = getOwnEntity(before.events, command.eventId)!
      const afterEvent = getOwnEntity(after.events, command.eventId)!
      for (const field of ['name', 'trigger', 'actions'] as const) {
        addChange(
          changes,
          field,
          beforeEvent[field],
          afterEvent[field],
          before,
          after,
          locale,
        )
      }
      return changes
    }
    case 'removeEvent':
      addStatus(changes, 'review.value.existing', 'review.value.deleted', locale)
      return changes
    case 'bindApiOperation': {
      const operation = getOwnEntity(after.apiOperations, command.operationId)!
      addStatus(changes, 'review.value.notSet', 'review.value.added', locale)
      for (const field of [
        'name',
        'method',
        'path',
        'requestBindings',
        'successStateId',
        'errorStateId',
      ] as const) {
        addChange(changes, field, undefined, operation[field], before, after, locale)
      }
      return changes
    }
    case 'updateApiOperation': {
      const beforeOperation = getOwnEntity(before.apiOperations, command.operationId)!
      const afterOperation = getOwnEntity(after.apiOperations, command.operationId)!
      for (const field of [
        'name',
        'method',
        'path',
        'requestBindings',
        'successStateId',
        'errorStateId',
      ] as const) {
        addChange(
          changes,
          field,
          beforeOperation[field],
          afterOperation[field],
          before,
          after,
          locale,
        )
      }
      return changes
    }
    case 'removeApiOperation':
      addStatus(changes, 'review.value.existing', 'review.value.deleted', locale)
      return changes
  }
}

function presentOperation(
  operation: ChangeSetOperation,
  before: ProjectDocument,
  after: ProjectDocument,
  locale: Locale,
): ChangeOperationPresentation {
  const target = targetForCommand(operation.command, before, after, locale)
  const entityKind = commandEntityKind(operation.command)
  const isDeletion = operation.command.type === 'removeScreen' ||
    operation.command.type === 'removeComponent' ||
    operation.command.type === 'removeScreenState' ||
    operation.command.type === 'removeEvent' ||
    operation.command.type === 'removeApiOperation'
  const action = operation.command.type === 'moveComponent'
    ? getOwnEntity(before.components, operation.command.componentId)?.parentId ===
      getOwnEntity(after.components, operation.command.componentId)?.parentId
      ? translate(locale, 'review.action.reorderComponent')
      : translate(locale, 'review.action.reparentComponent')
    : translate(locale, commandMessageKey(operation.command))
  return {
    operationId: operation.id,
    source: operation.source,
    commandType: operation.command.type,
    action,
    entityKind: translate(locale, `review.entity.${entityKind}`),
    targetLabel: target.label,
    screenContext: target.screenId
      ? screenLabel(isDeletion ? before : after, target.screenId, locale)
      : null,
    changes: buildChanges(operation.command, before, after, locale),
    impact: isDeletion ? entityImpact(before, after, operation.command, locale) : null,
    navigation: navigationForCommand(operation.command, before, after),
  }
}

export function presentChangeSetOperations(
  changeSet: ChangeSet,
  locale: Locale,
): ChangeOperationPresentation[] {
  const presentations: ChangeOperationPresentation[] = []
  let before = changeSet.baseDocument
  for (const operation of changeSet.operations) {
    const after = applyCommandWithoutRevision(before, operation.command)
    presentations.push(presentOperation(operation, before, after, locale))
    before = after
  }
  return presentations
}
