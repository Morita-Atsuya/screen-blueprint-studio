import { CURRENT_SCHEMA_VERSION, COMPONENT_KINDS } from './model'
import type {
  ApiOperation,
  CommonComponentSpec,
  ComponentConfig,
  ComponentKind,
  ComponentOverride,
  EventAction,
  EventTrigger,
  FieldBinding,
  Project,
  ProjectDocument,
  Screen,
  ScreenEvent,
  ScreenComponent,
  ScreenState,
  ValidationRule,
} from './model'
import { DomainError } from './errors'
import { isSafeEntityId } from './entityMap'

type UnknownRecord = Record<string, unknown>

function fail(path: string, message: string): never {
  throw new DomainError('INVARIANT_VIOLATION', `${path} ${message}`)
}

function record(value: unknown, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'must be an object')
  }
  return value as UnknownRecord
}

function exactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, 'is not allowed')
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) fail(`${path}.${key}`, 'is required')
  }
}

function string(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') fail(path, 'must be a string')
}

function entityId(value: unknown, path: string): asserts value is string {
  if (!isSafeEntityId(value)) fail(path, 'must be a safe, non-empty entity ID')
}

function boolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean')
}

function nullableString(value: unknown, path: string): asserts value is string | null {
  if (value !== null && typeof value !== 'string') fail(path, 'must be a string or null')
}

function entityIdArray(value: unknown, path: string): asserts value is string[] {
  if (!Array.isArray(value)) fail(path, 'must be an array')
  value.forEach((item, index) => entityId(item, `${path}[${index}]`))
  if (new Set(value).size !== value.length) fail(path, 'must not contain duplicates')
}

function entityMap(value: unknown, path: string): UnknownRecord {
  return record(value, path)
}

function enumValue<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): asserts value is T {
  if (!allowed.includes(value as T)) fail(path, `must be one of: ${allowed.join(', ')}`)
}

function validateFieldBinding(value: unknown, path: string): asserts value is FieldBinding {
  const binding = record(value, path)
  exactKeys(binding, ['componentId', 'targetPath'], [], path)
  entityId(binding.componentId, `${path}.componentId`)
  string(binding.targetPath, `${path}.targetPath`)
}

export function validateProject(value: unknown, path = 'project'): asserts value is Project {
  const project = record(value, path)
  exactKeys(project, ['id', 'name', 'screenIds'], [], path)
  entityId(project.id, `${path}.id`)
  string(project.name, `${path}.name`)
  entityIdArray(project.screenIds, `${path}.screenIds`)
}

export function validateScreen(value: unknown, path = 'screen'): asserts value is Screen {
  const screen = record(value, path)
  exactKeys(
    screen,
    ['id', 'name', 'route', 'rootComponentId', 'modalComponentIds', 'defaultStateId', 'stateIds', 'eventIds'],
    [],
    path,
  )
  entityId(screen.id, `${path}.id`)
  string(screen.name, `${path}.name`)
  string(screen.route, `${path}.route`)
  entityId(screen.rootComponentId, `${path}.rootComponentId`)
  entityIdArray(screen.modalComponentIds, `${path}.modalComponentIds`)
  entityId(screen.defaultStateId, `${path}.defaultStateId`)
  entityIdArray(screen.stateIds, `${path}.stateIds`)
  entityIdArray(screen.eventIds, `${path}.eventIds`)
}

export function validateScreenComponent(
  value: unknown,
  path = 'component',
): asserts value is ScreenComponent {
  const component = record(value, path)
  exactKeys(
    component,
    ['id', 'screenId', 'parentId', 'childIds', 'kind', 'common', 'config'],
    [],
    path,
  )
  entityId(component.id, `${path}.id`)
  entityId(component.screenId, `${path}.screenId`)
  if (component.parentId !== null) entityId(component.parentId, `${path}.parentId`)
  entityIdArray(component.childIds, `${path}.childIds`)
  enumValue(component.kind, COMPONENT_KINDS, `${path}.kind`)
  validateCommonComponentSpec(component.common, `${path}.common`)
  validateComponentConfig(component.config, component.kind, `${path}.config`)
}

export function validateScreenState(
  value: unknown,
  path = 'screenState',
): asserts value is ScreenState {
  const state = record(value, path)
  exactKeys(
    state,
    ['id', 'screenId', 'name', 'description', 'componentOverrides'],
    [],
    path,
  )
  entityId(state.id, `${path}.id`)
  entityId(state.screenId, `${path}.screenId`)
  string(state.name, `${path}.name`)
  string(state.description, `${path}.description`)
  record(state.componentOverrides, `${path}.componentOverrides`)
}

export function validateProjectDocumentMetadata(
  value: unknown,
  path = 'document',
): asserts value is ProjectDocument {
  const document = record(value, path)
  exactKeys(
    document,
    [
      'schemaVersion',
      'revision',
      'project',
      'screens',
      'components',
      'screenStates',
      'events',
      'apiOperations',
    ],
    [],
    path,
  )
  if (document.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    fail(`${path}.schemaVersion`, `must equal ${CURRENT_SCHEMA_VERSION}`)
  }
  if (!Number.isSafeInteger(document.revision) || (document.revision as number) < 0) {
    fail(`${path}.revision`, 'must be a non-negative safe integer')
  }
  validateProject(document.project, `${path}.project`)

  const validators = [
    ['screens', entityMap(document.screens, `${path}.screens`), validateScreen],
    ['components', entityMap(document.components, `${path}.components`), validateScreenComponent],
    ['screenStates', entityMap(document.screenStates, `${path}.screenStates`), validateScreenState],
    ['events', entityMap(document.events, `${path}.events`), validateScreenEvent],
    ['apiOperations', entityMap(document.apiOperations, `${path}.apiOperations`), validateApiOperation],
  ] as const

  for (const [collectionName, collection, validateEntity] of validators) {
    for (const [key, entity] of Object.entries(collection)) {
      entityId(key, `${path}.${collectionName} key`)
      validateEntity(entity, `${path}.${collectionName}.${key}`)
      if ((entity as UnknownRecord).id !== key) {
        fail(`${path}.${collectionName}.${key}.id`, `must match record key ${key}`)
      }
    }
  }
}

export function validateCommonComponentSpec(
  value: unknown,
  path = 'component.common',
): asserts value is CommonComponentSpec {
  const common = record(value, path)
  exactKeys(common, ['description', 'visible', 'enabled'], [], path)
  string(common.description, `${path}.description`)
  boolean(common.visible, `${path}.visible`)
  boolean(common.enabled, `${path}.enabled`)
}

export function validateEventTrigger(
  value: unknown,
  path = 'event.trigger',
): asserts value is EventTrigger {
  const trigger = record(value, path)
  exactKeys(trigger, ['type', 'componentId'], [], path)
  enumValue(trigger.type, ['click', 'submit'], `${path}.type`)
  entityId(trigger.componentId, `${path}.componentId`)
}

export function validateEventAction(
  value: unknown,
  path = 'event.action',
): asserts value is EventAction {
  const action = record(value, path)
  string(action.type, `${path}.type`)
  switch (action.type) {
    case 'setState':
      exactKeys(action, ['type', 'stateId'], [], path)
      entityId(action.stateId, `${path}.stateId`)
      return
    case 'callApi':
      exactKeys(action, ['type', 'apiOperationId'], [], path)
      entityId(action.apiOperationId, `${path}.apiOperationId`)
      return
    case 'navigate':
      exactKeys(action, ['type', 'destinationScreenId'], [], path)
      entityId(action.destinationScreenId, `${path}.destinationScreenId`)
      return
    default:
      fail(`${path}.type`, 'is invalid')
  }
}

export function validateScreenEvent(
  value: unknown,
  path = 'event',
): asserts value is ScreenEvent {
  const event = record(value, path)
  exactKeys(event, ['id', 'screenId', 'name', 'trigger', 'actions'], [], path)
  entityId(event.id, `${path}.id`)
  entityId(event.screenId, `${path}.screenId`)
  string(event.name, `${path}.name`)
  validateEventTrigger(event.trigger, `${path}.trigger`)
  if (!Array.isArray(event.actions)) fail(`${path}.actions`, 'must be an array')
  event.actions.forEach((action, index) =>
    validateEventAction(action, `${path}.actions[${index}]`),
  )
}

export function validateApiOperation(
  value: unknown,
  path = 'apiOperation',
): asserts value is ApiOperation {
  const operation = record(value, path)
  exactKeys(
    operation,
    [
      'id',
      'screenId',
      'name',
      'method',
      'path',
      'requestBindings',
      'successStateId',
      'errorStateId',
    ],
    [],
    path,
  )
  entityId(operation.id, `${path}.id`)
  entityId(operation.screenId, `${path}.screenId`)
  string(operation.name, `${path}.name`)
  enumValue(operation.method, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], `${path}.method`)
  string(operation.path, `${path}.path`)
  if (!Array.isArray(operation.requestBindings)) {
    fail(`${path}.requestBindings`, 'must be an array')
  }
  operation.requestBindings.forEach((binding, index) =>
    validateFieldBinding(binding, `${path}.requestBindings[${index}]`),
  )
  if (operation.successStateId !== null) {
    entityId(operation.successStateId, `${path}.successStateId`)
  }
  if (operation.errorStateId !== null) {
    entityId(operation.errorStateId, `${path}.errorStateId`)
  }
}

function validateValidationRule(value: unknown, path: string): asserts value is ValidationRule {
  const rule = record(value, path)
  string(rule.type, `${path}.type`)
  const common = ['id', 'type', 'message']
  if (rule.type === 'minLength' || rule.type === 'maxLength' || rule.type === 'pattern') {
    exactKeys(rule, [...common, 'value'], [], path)
  } else if (rule.type === 'custom') {
    exactKeys(rule, [...common, 'description'], [], path)
  } else if (rule.type === 'required' || rule.type === 'email') {
    exactKeys(rule, common, [], path)
  } else {
    fail(`${path}.type`, 'is invalid')
  }
  string(rule.id, `${path}.id`)
  string(rule.message, `${path}.message`)
  if (rule.message.trim().length === 0) fail(`${path}.message`, 'must not be empty')
  if (rule.type === 'minLength' || rule.type === 'maxLength') {
    if (!Number.isSafeInteger(rule.value) || (rule.value as number) < 0) {
      fail(`${path}.value`, 'must be a non-negative safe integer')
    }
  }
  if (rule.type === 'pattern') {
    string(rule.value, `${path}.value`)
    if (rule.value.trim().length === 0) fail(`${path}.value`, 'must not be empty')
    try {
      new RegExp(rule.value)
    } catch {
      fail(`${path}.value`, 'must be a valid regular expression')
    }
  }
  if (rule.type === 'custom') {
    string(rule.description, `${path}.description`)
    if (rule.description.trim().length === 0) fail(`${path}.description`, 'must not be empty')
  }
}

const VALIDATION_RULE_SINGLETON_TYPES = new Set(['required', 'email', 'minLength', 'maxLength'])

function validateValidationRules(value: unknown, path: string): asserts value is ValidationRule[] {
  if (!Array.isArray(value)) fail(path, 'must be an array')
  value.forEach((rule, index) => validateValidationRule(rule, `${path}[${index}]`))
  const rules = value as ValidationRule[]

  const seenIds = new Set<string>()
  const seenSingletonTypes = new Set<string>()
  const seenPatternValues = new Set<string>()
  const seenCustomDescriptions = new Set<string>()

  rules.forEach((rule, index) => {
    if (seenIds.has(rule.id)) fail(`${path}[${index}].id`, 'must be unique within validationRules')
    seenIds.add(rule.id)

    if (VALIDATION_RULE_SINGLETON_TYPES.has(rule.type)) {
      if (seenSingletonTypes.has(rule.type)) {
        fail(`${path}[${index}]`, `duplicates another '${rule.type}' rule`)
      }
      seenSingletonTypes.add(rule.type)
    }

    if (rule.type === 'pattern') {
      const normalized = rule.value.trim()
      if (seenPatternValues.has(normalized)) {
        fail(`${path}[${index}].value`, 'duplicates another pattern rule')
      }
      seenPatternValues.add(normalized)
    }

    if (rule.type === 'custom') {
      const normalized = rule.description.trim()
      if (seenCustomDescriptions.has(normalized)) {
        fail(`${path}[${index}].description`, 'duplicates another custom rule')
      }
      seenCustomDescriptions.add(normalized)
    }
  })

  const minRule = rules.find((rule): rule is Extract<ValidationRule, { type: 'minLength' }> =>
    rule.type === 'minLength',
  )
  const maxRule = rules.find((rule): rule is Extract<ValidationRule, { type: 'maxLength' }> =>
    rule.type === 'maxLength',
  )
  if (minRule && maxRule && minRule.value > maxRule.value) {
    fail(path, 'minLength must not exceed maxLength')
  }
}

export function validateComponentConfig(
  value: unknown,
  expectedKind?: ComponentKind,
  path = 'component.config',
): asserts value is ComponentConfig {
  const config = record(value, path)
  string(config.kind, `${path}.kind`)
  if (expectedKind !== undefined && config.kind !== expectedKind) {
    fail(`${path}.kind`, `must match component kind ${expectedKind}`)
  }

  switch (config.kind) {
    case 'page':
    case 'modal':
    case 'container':
      exactKeys(
        config,
        ['kind', 'layout', 'gap', 'columns', 'justify', 'align', 'wrap'],
        [],
        path,
      )
      validateComponentLayout(config, path)
      return
    case 'text':
      exactKeys(config, ['kind', 'text', 'style'], [], path)
      string(config.text, `${path}.text`)
      enumValue(
        config.style,
        ['heading1', 'heading2', 'heading3', 'body', 'caption'],
        `${path}.style`,
      )
      return
    case 'textInput':
      exactKeys(
        config,
        [
          'kind',
          'fieldKey',
          'label',
          'inputType',
          'required',
          'placeholder',
          'defaultValue',
          'validationRules',
        ],
        [],
        path,
      )
      string(config.fieldKey, `${path}.fieldKey`)
      string(config.label, `${path}.label`)
      enumValue(config.inputType, ['text', 'email', 'password'], `${path}.inputType`)
      boolean(config.required, `${path}.required`)
      string(config.placeholder, `${path}.placeholder`)
      string(config.defaultValue, `${path}.defaultValue`)
      validateValidationRules(config.validationRules, `${path}.validationRules`)
      return
    case 'select':
      exactKeys(
        config,
        ['kind', 'fieldKey', 'label', 'required', 'options', 'defaultValue'],
        [],
        path,
      )
      string(config.fieldKey, `${path}.fieldKey`)
      string(config.label, `${path}.label`)
      boolean(config.required, `${path}.required`)
      if (!Array.isArray(config.options)) fail(`${path}.options`, 'must be an array')
      const optionValues = new Set<string>()
      config.options.forEach((option, index) => {
        const optionRecord = record(option, `${path}.options[${index}]`)
        exactKeys(optionRecord, ['value', 'label'], [], `${path}.options[${index}]`)
        string(optionRecord.value, `${path}.options[${index}].value`)
        string(optionRecord.label, `${path}.options[${index}].label`)
        if (optionRecord.value.trim().length === 0) {
          fail(`${path}.options[${index}].value`, 'must not be empty')
        }
        if (optionValues.has(optionRecord.value)) {
          fail(`${path}.options[${index}].value`, 'must be unique')
        }
        optionValues.add(optionRecord.value)
      })
      string(config.defaultValue, `${path}.defaultValue`)
      if (config.defaultValue !== '' && !optionValues.has(config.defaultValue)) {
        fail(`${path}.defaultValue`, 'must match a select option or be empty')
      }
      return
    case 'button':
      exactKeys(
        config,
        ['kind', 'label', 'variant', 'eventId', 'confirmationMessage', 'preventDoubleSubmit'],
        [],
        path,
      )
      string(config.label, `${path}.label`)
      enumValue(config.variant, ['primary', 'secondary', 'danger'], `${path}.variant`)
      nullableString(config.eventId, `${path}.eventId`)
      nullableString(config.confirmationMessage, `${path}.confirmationMessage`)
      boolean(config.preventDoubleSubmit, `${path}.preventDoubleSubmit`)
      return
    default:
      fail(`${path}.kind`, `is not a supported component kind: ${String(config.kind)}`)
  }
}

function validateComponentLayout(config: UnknownRecord, path: string): void {
  enumValue(config.layout, ['vertical', 'horizontal', 'grid'], `${path}.layout`)
  enumValue(config.gap, ['none', 'sm', 'md', 'lg'], `${path}.gap`)
  enumValue(config.columns, [1, 2, 3, 4], `${path}.columns`)
  enumValue(config.justify, ['start', 'center', 'end', 'between'], `${path}.justify`)
  enumValue(config.align, ['start', 'center', 'end', 'stretch'], `${path}.align`)
  boolean(config.wrap, `${path}.wrap`)
}

export function validateComponentOverride(
  value: unknown,
  component: ScreenComponent,
  path: string,
): asserts value is ComponentOverride {
  const override = record(value, path)
  const optionalKeys = ['visible', 'enabled']
  if (component.kind === 'text') optionalKeys.push('text')
  if (component.kind === 'textInput' || component.kind === 'select') optionalKeys.push('value')
  exactKeys(override, [], optionalKeys, path)

  if (override.visible !== undefined) boolean(override.visible, `${path}.visible`)
  if (override.enabled !== undefined) boolean(override.enabled, `${path}.enabled`)
  if (override.text !== undefined) string(override.text, `${path}.text`)
  if (override.value !== undefined) {
    string(override.value, `${path}.value`)
    if (
      component.config.kind === 'select' &&
      !component.config.options.some(option => option.value === override.value)
    ) {
      fail(`${path}.value`, 'must match a select option')
    }
  }
}
