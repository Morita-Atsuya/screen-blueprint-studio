import {
  CANONICAL_PROJECT_KIND_V3,
  CANONICAL_PROJECT_SCHEMA_URL_V3,
  COMPONENT_KINDS,
  COMPONENT_SIZE_TOKENS,
  CURRENT_SCHEMA_VERSION,
  EVENT_ACTION_TYPES_V3,
  EVENT_TRIGGER_TYPES_V3,
  HTTP_METHODS_V3,
  PLACEMENT_ANCHORS,
  PLACEMENT_INSET_TOKENS,
  PUBLIC_PROP_FIELDS_V3,
  PUBLIC_PROP_TYPES_V3,
  SCREEN_FIELDS_V3,
  VARIANT_COMMON_OVERRIDE_FIELDS_V3,
  VARIANT_CONFIG_OVERRIDE_FIELDS_V3,
  VARIANT_NODE_OVERRIDE_FIELDS_V3,
  type ApiOperation,
  type CommonComponentSpec,
  type ComponentConfig,
  type CollectionValueSource,
  type ComponentDefinition,
  type ComponentDefinitionNode,
  type ComponentOverride,
  type ComponentPlacement,
  type ComponentSizing,
  type EventAction,
  type EventTrigger,
  type FieldBinding,
  type Project,
  type ProjectDocument,
  type PublicProp,
  type PublicPropBinding,
  type Screen,
  type ScreenComponent,
  type ScreenEvent,
  type ScreenScenario,
  type ValidationRule,
  type VariantConfigOverride,
  type VariantNodeOverride,
  type VariantProperty,
} from './model'
import { parseComponentDefinitionRefV3 } from './canonicalProjectSpecV3'
import { isSafeExternalUrl, isSafePortableUrl } from './portableUrl'
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

function nonEmptyString(value: unknown, path: string): asserts value is string {
  string(value, path)
  if (value.trim().length === 0) fail(path, 'must contain non-whitespace characters')
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

function enumValue<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): asserts value is T {
  if (!allowed.includes(value as T)) fail(path, `must be one of: ${allowed.join(', ')}`)
}

function entityMap(value: unknown, path: string): UnknownRecord {
  return record(value, path)
}

function validateValidationRule(value: unknown, path: string): asserts value is ValidationRule {
  const rule = record(value, path)
  string(rule.type, `${path}.type`)
  entityId(rule.id, `${path}.id`)
  switch (rule.type) {
    case 'required':
    case 'email':
      exactKeys(rule, ['id', 'type', 'message'], [], path)
      string(rule.message, `${path}.message`)
      return
    case 'minLength':
    case 'maxLength':
      exactKeys(rule, ['id', 'type', 'value', 'message'], [], path)
      if (!Number.isInteger(rule.value) || (rule.value as number) < 0) {
        fail(`${path}.value`, 'must be a non-negative integer')
      }
      string(rule.message, `${path}.message`)
      return
    case 'pattern':
      exactKeys(rule, ['id', 'type', 'value', 'message'], [], path)
      nonEmptyString(rule.value, `${path}.value`)
      string(rule.message, `${path}.message`)
      return
    case 'custom':
      exactKeys(rule, ['id', 'type', 'description', 'message'], [], path)
      nonEmptyString(rule.description, `${path}.description`)
      string(rule.message, `${path}.message`)
      return
    default:
      fail(`${path}.type`, 'is invalid')
  }
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
  exactKeys(screen, SCREEN_FIELDS_V3, [], path)
  entityId(screen.id, `${path}.id`)
  string(screen.name, `${path}.name`)
  string(screen.route, `${path}.route`)
  string(screen.baseDescription, `${path}.baseDescription`)
  entityId(screen.rootComponentId, `${path}.rootComponentId`)
  entityIdArray(screen.modalComponentIds, `${path}.modalComponentIds`)
  entityIdArray(screen.scenarioIds, `${path}.scenarioIds`)
  entityIdArray(screen.eventIds, `${path}.eventIds`)
}

export function validateComponentSizing(
  value: unknown,
  path = 'component.sizing',
): asserts value is ComponentSizing {
  const sizing = record(value, path)
  exactKeys(
    sizing,
    ['inlineSize', 'minWidth', 'maxWidth', 'gridSpan', 'grow', 'shrink'],
    [],
    path,
  )
  enumValue(sizing.inlineSize, ['auto', 'content', 'fill'], `${path}.inlineSize`)
  enumValue(sizing.minWidth, COMPONENT_SIZE_TOKENS, `${path}.minWidth`)
  enumValue(sizing.maxWidth, COMPONENT_SIZE_TOKENS, `${path}.maxWidth`)
  enumValue(sizing.gridSpan, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], `${path}.gridSpan`)
  enumValue(sizing.grow, [0, 1, 2, 3], `${path}.grow`)
  enumValue(sizing.shrink, ['allow', 'prevent'], `${path}.shrink`)
}

export function validateComponentPlacement(
  value: unknown,
  path = 'component.placement',
): asserts value is ComponentPlacement {
  const placement = record(value, path)
  string(placement.mode, `${path}.mode`)
  switch (placement.mode) {
    case 'flow':
      exactKeys(placement, ['mode'], [], path)
      return
    case 'sticky':
      exactKeys(placement, ['mode', 'edge', 'inset'], [], path)
      enumValue(placement.edge, ['top', 'bottom'], `${path}.edge`)
      enumValue(placement.inset, PLACEMENT_INSET_TOKENS, `${path}.inset`)
      return
    case 'overlay':
    case 'viewport':
      exactKeys(placement, ['mode', 'anchor', 'insetX', 'insetY'], [], path)
      enumValue(placement.anchor, PLACEMENT_ANCHORS, `${path}.anchor`)
      enumValue(placement.insetX, PLACEMENT_INSET_TOKENS, `${path}.insetX`)
      enumValue(placement.insetY, PLACEMENT_INSET_TOKENS, `${path}.insetY`)
      if (
        ['topCenter', 'center', 'bottomCenter'].includes(placement.anchor) &&
        placement.insetX !== 'none'
      ) {
        fail(`${path}.insetX`, 'must be none for a horizontally centered anchor')
      }
      if (
        ['centerLeft', 'center', 'centerRight'].includes(placement.anchor) &&
        placement.insetY !== 'none'
      ) {
        fail(`${path}.insetY`, 'must be none for a vertically centered anchor')
      }
      return
    default:
      fail(`${path}.mode`, 'is invalid')
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

function validateImageSource(source: unknown, path: string): void {
  string(source, path)
  if (source.length > 0 && !isSafePortableUrl(source)) {
    fail(path, 'must be a safe portable URL')
  }
}

function validateLinkDestination(value: unknown, path: string): void {
  const destination = record(value, path)
  string(destination.type, `${path}.type`)
  switch (destination.type) {
    case 'internal':
      exactKeys(destination, ['type', 'screenId'], [], path)
      entityId(destination.screenId, `${path}.screenId`)
      return
    case 'external':
      exactKeys(destination, ['type', 'url'], [], path)
      string(destination.url, `${path}.url`)
      if (!isSafeExternalUrl(destination.url)) {
        fail(`${path}.url`, 'must be a safe external URL')
      }
      return
    case 'resource':
      exactKeys(destination, ['type', 'resourceId', 'url', 'displayName'], [], path)
      nonEmptyString(destination.resourceId, `${path}.resourceId`)
      string(destination.url, `${path}.url`)
      if (!isSafePortableUrl(destination.url)) {
        fail(`${path}.url`, 'must be a safe portable URL')
      }
      nonEmptyString(destination.displayName, `${path}.displayName`)
      return
    default:
      fail(`${path}.type`, 'is invalid')
  }
}

function validateJsonValue(value: unknown, path: string): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) return
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJsonValue(entry, `${path}[${index}]`))
    return
  }
  const item = record(value, path)
  Object.entries(item).forEach(([key, entry]) => {
    if (!key) fail(path, 'must not contain empty keys')
    validateJsonValue(entry, `${path}.${key}`)
  })
}

function validateCollectionValueSource(
  value: unknown,
  path: string,
): asserts value is CollectionValueSource {
  const source = record(value, path)
  if (source.type === 'item') {
    exactKeys(source, ['type', 'path'], [], path)
    string(source.path, `${path}.path`)
    return
  }
  if (source.type === 'literal') {
    exactKeys(source, ['type', 'value'], [], path)
    validateJsonValue(source.value, `${path}.value`)
    if (typeof source.value === 'object' && source.value !== null) {
      fail(`${path}.value`, 'must be a scalar')
    }
    return
  }
  fail(`${path}.type`, 'must be item or literal')
}

function validateComponentConfigCommonFields(
  config: UnknownRecord,
  kind: ComponentConfig['kind'],
  path: string,
  allowButtonEventId: boolean,
): void {
  switch (kind) {
    case 'page':
    case 'container':
    case 'modal':
      exactKeys(config, ['kind', 'layout', 'gap', 'columns', 'justify', 'align', 'wrap'], [], path)
      enumValue(config.layout, ['vertical', 'horizontal', 'grid'], `${path}.layout`)
      enumValue(config.gap, ['none', 'sm', 'md', 'lg'], `${path}.gap`)
      enumValue(config.columns, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], `${path}.columns`)
      enumValue(config.justify, ['start', 'center', 'end', 'between'], `${path}.justify`)
      enumValue(config.align, ['start', 'center', 'end', 'stretch'], `${path}.align`)
      boolean(config.wrap, `${path}.wrap`)
      return
    case 'text':
      exactKeys(config, ['kind', 'text', 'style'], [], path)
      string(config.text, `${path}.text`)
      enumValue(config.style, ['heading1', 'heading2', 'heading3', 'body', 'caption'], `${path}.style`)
      return
    case 'textInput':
      exactKeys(
        config,
        ['kind', 'fieldKey', 'label', 'inputType', 'required', 'placeholder', 'defaultValue', 'validationRules'],
        [],
        path,
      )
      string(config.fieldKey, `${path}.fieldKey`)
      string(config.label, `${path}.label`)
      enumValue(config.inputType, ['text', 'email', 'password'], `${path}.inputType`)
      boolean(config.required, `${path}.required`)
      string(config.placeholder, `${path}.placeholder`)
      string(config.defaultValue, `${path}.defaultValue`)
      if (!Array.isArray(config.validationRules)) fail(`${path}.validationRules`, 'must be an array')
      config.validationRules.forEach((rule, index) =>
        validateValidationRule(rule, `${path}.validationRules[${index}]`),
      )
      return
    case 'select':
      exactKeys(config, ['kind', 'fieldKey', 'label', 'required', 'options', 'defaultValue'], [], path)
      string(config.fieldKey, `${path}.fieldKey`)
      string(config.label, `${path}.label`)
      boolean(config.required, `${path}.required`)
      if (!Array.isArray(config.options)) fail(`${path}.options`, 'must be an array')
      config.options.forEach((option, index) => {
        const item = record(option, `${path}.options[${index}]`)
        exactKeys(item, ['value', 'label'], [], `${path}.options[${index}]`)
        string(item.value, `${path}.options[${index}].value`)
        string(item.label, `${path}.options[${index}].label`)
      })
      string(config.defaultValue, `${path}.defaultValue`)
      return
    case 'button':
      exactKeys(
        config,
        allowButtonEventId
          ? ['kind', 'label', 'variant', 'eventId', 'confirmationMessage', 'preventDoubleSubmit']
          : ['kind', 'label', 'variant', 'confirmationMessage', 'preventDoubleSubmit'],
        [],
        path,
      )
      string(config.label, `${path}.label`)
      enumValue(config.variant, ['primary', 'secondary', 'danger'], `${path}.variant`)
      if (allowButtonEventId) {
        if (config.eventId !== null) entityId(config.eventId, `${path}.eventId`)
      }
      nullableString(config.confirmationMessage, `${path}.confirmationMessage`)
      boolean(config.preventDoubleSubmit, `${path}.preventDoubleSubmit`)
      return
    case 'image':
      exactKeys(config, ['kind', 'source', 'alt', 'fit', 'aspectRatio', 'placeholderStyle'], [], path)
      validateImageSource(config.source, `${path}.source`)
      nonEmptyString(config.alt, `${path}.alt`)
      enumValue(config.fit, ['contain', 'cover'], `${path}.fit`)
      enumValue(config.aspectRatio, ['auto', 'square', '4:3', '16:9'], `${path}.aspectRatio`)
      enumValue(config.placeholderStyle, ['icon', 'skeleton'], `${path}.placeholderStyle`)
      return
    case 'link':
      exactKeys(config, ['kind', 'label', 'destination', 'openMode'], [], path)
      nonEmptyString(config.label, `${path}.label`)
      validateLinkDestination(config.destination, `${path}.destination`)
      enumValue(config.openMode, ['sameContext', 'newContext', 'download'], `${path}.openMode`)
      if (
        record(config.destination, `${path}.destination`).type === 'internal' &&
        config.openMode !== 'sameContext'
      ) {
        fail(`${path}.openMode`, 'internal destinations require sameContext')
      }
      if (
        record(config.destination, `${path}.destination`).type === 'external' &&
        config.openMode === 'download'
      ) {
        fail(`${path}.openMode`, 'download is only valid for resource destinations')
      }
      return
    case 'collection': {
      exactKeys(
        config,
        [
          'kind',
          'dataSource',
          'itemKeyPath',
          'itemTemplate',
          'propBindings',
          'variantSelection',
          'visibility',
        ],
        [],
        path,
      )
      const dataSource = record(config.dataSource, `${path}.dataSource`)
      exactKeys(dataSource, ['apiOperationId', 'itemsPath', 'previewItems'], [], `${path}.dataSource`)
      if (dataSource.apiOperationId !== null) {
        entityId(dataSource.apiOperationId, `${path}.dataSource.apiOperationId`)
      }
      string(dataSource.itemsPath, `${path}.dataSource.itemsPath`)
      if (!Array.isArray(dataSource.previewItems)) {
        fail(`${path}.dataSource.previewItems`, 'must be an array')
      }
      dataSource.previewItems.forEach((item, index) => {
        if (Array.isArray(item)) fail(`${path}.dataSource.previewItems[${index}]`, 'must be an object')
        validateJsonValue(record(item, `${path}.dataSource.previewItems[${index}]`), `${path}.dataSource.previewItems[${index}]`)
      })
      string(config.itemKeyPath, `${path}.itemKeyPath`)
      const template = record(config.itemTemplate, `${path}.itemTemplate`)
      exactKeys(template, ['source', 'props', 'variantId'], [], `${path}.itemTemplate`)
      validateDefinitionSource(template.source, `${path}.itemTemplate.source`)
      const props = record(template.props, `${path}.itemTemplate.props`)
      Object.entries(props).forEach(([key, value]) => {
        nonEmptyString(key, `${path}.itemTemplate.props key`)
        if (
          typeof value !== 'string' &&
          typeof value !== 'boolean' &&
          (typeof value !== 'number' || !Number.isFinite(value))
        ) fail(`${path}.itemTemplate.props.${key}`, 'must be a non-null scalar')
      })
      if (template.variantId !== null) {
        entityId(template.variantId, `${path}.itemTemplate.variantId`)
      }
      if (!Array.isArray(config.propBindings)) fail(`${path}.propBindings`, 'must be an array')
      config.propBindings.forEach((entry, index) => {
        const binding = record(entry, `${path}.propBindings[${index}]`)
        exactKeys(binding, ['propKey', 'source'], [], `${path}.propBindings[${index}]`)
        nonEmptyString(binding.propKey, `${path}.propBindings[${index}].propKey`)
        validateCollectionValueSource(binding.source, `${path}.propBindings[${index}].source`)
      })
      const variantSelection = record(config.variantSelection, `${path}.variantSelection`)
      exactKeys(variantSelection, ['cases', 'fallbackVariantId'], [], `${path}.variantSelection`)
      if (!Array.isArray(variantSelection.cases)) {
        fail(`${path}.variantSelection.cases`, 'must be an array')
      }
      variantSelection.cases.forEach((entry, index) => {
        const rule = record(entry, `${path}.variantSelection.cases[${index}]`)
        exactKeys(rule, ['source', 'equals', 'variantId'], [], `${path}.variantSelection.cases[${index}]`)
        validateCollectionValueSource(rule.source, `${path}.variantSelection.cases[${index}].source`)
        validateJsonValue(rule.equals, `${path}.variantSelection.cases[${index}].equals`)
        if (typeof rule.equals === 'object' && rule.equals !== null) {
          fail(`${path}.variantSelection.cases[${index}].equals`, 'must be a scalar')
        }
        entityId(rule.variantId, `${path}.variantSelection.cases[${index}].variantId`)
      })
      if (variantSelection.fallbackVariantId !== null) {
        entityId(variantSelection.fallbackVariantId, `${path}.variantSelection.fallbackVariantId`)
      }
      if (config.visibility !== null) {
        const visibility = record(config.visibility, `${path}.visibility`)
        exactKeys(
          visibility,
          ['source', 'equals', 'visibleWhenMatched', 'fallback'],
          [],
          `${path}.visibility`,
        )
        validateCollectionValueSource(visibility.source, `${path}.visibility.source`)
        validateJsonValue(visibility.equals, `${path}.visibility.equals`)
        if (typeof visibility.equals === 'object' && visibility.equals !== null) {
          fail(`${path}.visibility.equals`, 'must be a scalar')
        }
        boolean(visibility.visibleWhenMatched, `${path}.visibility.visibleWhenMatched`)
        boolean(visibility.fallback, `${path}.visibility.fallback`)
      }
      return
    }
  }
}

export function validateComponentConfig(
  value: unknown,
  kind: ComponentConfig['kind'],
  path = 'component.config',
): asserts value is ComponentConfig {
  const config = record(value, path)
  exactKeys(config, ['kind'], Object.keys(config).filter(key => key !== 'kind'), path)
  if (config.kind !== kind) fail(`${path}.kind`, `must equal ${kind}`)
  validateComponentConfigCommonFields(config, kind, path, true)
}

export function validateDefinitionComponentConfig(
  value: unknown,
  kind: ComponentConfig['kind'],
  path = 'definitionNode.config',
): void {
  const config = record(value, path)
  if (config.kind !== kind) fail(`${path}.kind`, `must equal ${kind}`)
  validateComponentConfigCommonFields(config, kind, path, false)
}

function validateDefinitionSource(value: unknown, path: string): void {
  const source = record(value, path)
  exactKeys(source, ['$ref'], [], path)
  string(source.$ref, `${path}.$ref`)
  if (parseComponentDefinitionRefV3(source.$ref) === null) {
    fail(`${path}.$ref`, 'must be a local componentDefinitions RFC 6901 reference')
  }
}

function validatePublicPropBinding(value: unknown, path: string): asserts value is PublicPropBinding {
  const binding = record(value, path)
  exactKeys(binding, ['nodePath', 'field'], [], path)
  if (!Array.isArray(binding.nodePath) || binding.nodePath.length === 0) {
    fail(`${path}.nodePath`, 'must be a non-empty array of stable node IDs')
  }
  binding.nodePath.forEach((item, index) => entityId(item, `${path}.nodePath[${index}]`))
  enumValue(binding.field, PUBLIC_PROP_FIELDS_V3, `${path}.field`)
}

function validatePublicProp(value: unknown, path: string): asserts value is PublicProp {
  const prop = record(value, path)
  string(prop.type, `${path}.type`)
  switch (prop.type) {
    case 'string':
    case 'boolean':
    case 'number':
      exactKeys(prop, ['key', 'name', 'description', 'type', 'bindings'], [], path)
      break
    case 'enum':
      exactKeys(prop, ['key', 'name', 'description', 'type', 'bindings', 'values'], [], path)
      if (!Array.isArray(prop.values) || prop.values.length === 0) {
        fail(`${path}.values`, 'must be a non-empty array')
      }
      prop.values.forEach((item, index) => nonEmptyString(item, `${path}.values[${index}]`))
      if (new Set(prop.values).size !== prop.values.length) {
        fail(`${path}.values`, 'must not contain duplicates')
      }
      break
    default:
      fail(`${path}.type`, `must be one of: ${PUBLIC_PROP_TYPES_V3.join(', ')}`)
  }
  nonEmptyString(prop.key, `${path}.key`)
  string(prop.name, `${path}.name`)
  string(prop.description, `${path}.description`)
  if (!Array.isArray(prop.bindings)) fail(`${path}.bindings`, 'must be an array')
  prop.bindings.forEach((binding, index) => validatePublicPropBinding(binding, `${path}.bindings[${index}]`))
}

function validateVariantProperty(value: unknown, path: string): asserts value is VariantProperty {
  const property = record(value, path)
  exactKeys(property, ['key', 'name', 'description', 'values'], [], path)
  nonEmptyString(property.key, `${path}.key`)
  string(property.name, `${path}.name`)
  string(property.description, `${path}.description`)
  if (!Array.isArray(property.values) || property.values.length === 0) {
    fail(`${path}.values`, 'must be a non-empty array')
  }
  property.values.forEach((item, index) => nonEmptyString(item, `${path}.values[${index}]`))
  if (new Set(property.values).size !== property.values.length) {
    fail(`${path}.values`, 'must not contain duplicates')
  }
}

function validateVariantConfigOverride(
  value: unknown,
  path: string,
): asserts value is VariantConfigOverride {
  const override = record(value, path)
  exactKeys(override, [], VARIANT_CONFIG_OVERRIDE_FIELDS_V3, path)
  for (const [key, fieldValue] of Object.entries(override)) {
    switch (key) {
      case 'layout':
        enumValue(fieldValue, ['vertical', 'horizontal', 'grid'], `${path}.layout`)
        break
      case 'gap':
        enumValue(fieldValue, ['none', 'sm', 'md', 'lg'], `${path}.gap`)
        break
      case 'columns':
        enumValue(fieldValue, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], `${path}.columns`)
        break
      case 'justify':
        enumValue(fieldValue, ['start', 'center', 'end', 'between'], `${path}.justify`)
        break
      case 'align':
        enumValue(fieldValue, ['start', 'center', 'end', 'stretch'], `${path}.align`)
        break
      case 'wrap':
      case 'required':
      case 'preventDoubleSubmit':
        boolean(fieldValue, `${path}.${key}`)
        break
      case 'text':
      case 'label':
      case 'placeholder':
      case 'defaultValue':
      case 'source':
      case 'alt':
        string(fieldValue, `${path}.${key}`)
        break
      case 'style':
        enumValue(fieldValue, ['heading1', 'heading2', 'heading3', 'body', 'caption'], `${path}.style`)
        break
      case 'inputType':
        enumValue(fieldValue, ['text', 'email', 'password'], `${path}.inputType`)
        break
      case 'variant':
        enumValue(fieldValue, ['primary', 'secondary', 'danger'], `${path}.variant`)
        break
      case 'confirmationMessage':
        nullableString(fieldValue, `${path}.confirmationMessage`)
        break
      case 'fit':
        enumValue(fieldValue, ['contain', 'cover'], `${path}.fit`)
        break
      case 'aspectRatio':
        enumValue(fieldValue, ['auto', 'square', '4:3', '16:9'], `${path}.aspectRatio`)
        break
      case 'placeholderStyle':
        enumValue(fieldValue, ['icon', 'skeleton'], `${path}.placeholderStyle`)
        break
      case 'destination':
        validateLinkDestination(fieldValue, `${path}.destination`)
        break
      case 'openMode':
        enumValue(fieldValue, ['sameContext', 'newContext', 'download'], `${path}.openMode`)
        break
      default:
        fail(`${path}.${key}`, 'is not allowed')
    }
  }
}

function validateVariantNodeOverride(
  value: unknown,
  path: string,
): asserts value is VariantNodeOverride {
  const override = record(value, path)
  exactKeys(override, [], VARIANT_NODE_OVERRIDE_FIELDS_V3, path)
  if (override.common !== undefined) {
    const common = record(override.common, `${path}.common`)
    exactKeys(common, [], VARIANT_COMMON_OVERRIDE_FIELDS_V3, `${path}.common`)
    if (common.description !== undefined) string(common.description, `${path}.common.description`)
    if (common.visible !== undefined) boolean(common.visible, `${path}.common.visible`)
    if (common.enabled !== undefined) boolean(common.enabled, `${path}.common.enabled`)
  }
  if (override.config !== undefined) {
    validateVariantConfigOverride(override.config, `${path}.config`)
  }
  if (override.placement !== undefined) {
    validateComponentPlacement(override.placement, `${path}.placement`)
  }
  if (override.sizing !== undefined) {
    validateComponentSizing(override.sizing, `${path}.sizing`)
  }
}

function validateComponentDefinitionNode(
  value: unknown,
  path: string,
): asserts value is ComponentDefinitionNode {
  const node = record(value, path)
  string(node.nodeType, `${path}.nodeType`)
  switch (node.nodeType) {
    case 'inline':
      exactKeys(
        node,
        ['nodeType', 'id', 'parentId', 'childIds', 'kind', 'placement', 'sizing', 'common', 'config'],
        [],
        path,
      )
      entityId(node.id, `${path}.id`)
      if (node.parentId !== null) entityId(node.parentId, `${path}.parentId`)
      entityIdArray(node.childIds, `${path}.childIds`)
      enumValue(node.kind, COMPONENT_KINDS, `${path}.kind`)
      validateComponentPlacement(node.placement, `${path}.placement`)
      validateComponentSizing(node.sizing, `${path}.sizing`)
      validateCommonComponentSpec(node.common, `${path}.common`)
      validateDefinitionComponentConfig(node.config, node.kind, `${path}.config`)
      return
    case 'definitionInstance':
      exactKeys(
        node,
        ['nodeType', 'id', 'parentId', 'childIds', 'placement', 'sizing', 'source', 'props', 'variantId'],
        [],
        path,
      )
      entityId(node.id, `${path}.id`)
      if (node.parentId !== null) entityId(node.parentId, `${path}.parentId`)
      if (!Array.isArray(node.childIds) || node.childIds.length !== 0) {
        fail(`${path}.childIds`, 'must be an empty array')
      }
      validateComponentPlacement(node.placement, `${path}.placement`)
      validateComponentSizing(node.sizing, `${path}.sizing`)
      validateDefinitionSource(node.source, `${path}.source`)
      const props = record(node.props, `${path}.props`)
      for (const [key, propValue] of Object.entries(props)) {
        nonEmptyString(key, `${path}.props key`)
        if (
          typeof propValue !== 'string' &&
          typeof propValue !== 'boolean' &&
          typeof propValue !== 'number'
        ) {
          fail(`${path}.props.${key}`, 'must be a string, boolean, or number')
        }
      }
      if (node.variantId !== null) entityId(node.variantId, `${path}.variantId`)
      return
    default:
      fail(`${path}.nodeType`, 'is invalid')
  }
}

function validateComponentDefinition(
  value: unknown,
  path: string,
): asserts value is ComponentDefinition {
  const definition = record(value, path)
  exactKeys(
    definition,
    ['id', 'name', 'description', 'rootNodeId', 'nodes', 'publicProps', 'variantProperties', 'variants', 'representativeVariantId'],
    [],
    path,
  )
  entityId(definition.id, `${path}.id`)
  string(definition.name, `${path}.name`)
  string(definition.description, `${path}.description`)
  entityId(definition.rootNodeId, `${path}.rootNodeId`)
  const nodes = entityMap(definition.nodes, `${path}.nodes`)
  for (const [key, node] of Object.entries(nodes)) {
    entityId(key, `${path}.nodes key`)
    validateComponentDefinitionNode(node, `${path}.nodes.${key}`)
    if (record(node, `${path}.nodes.${key}`).id !== key) {
      fail(`${path}.nodes.${key}.id`, `must match record key ${key}`)
    }
  }
  if (!Array.isArray(definition.publicProps)) fail(`${path}.publicProps`, 'must be an array')
  definition.publicProps.forEach((prop, index) => validatePublicProp(prop, `${path}.publicProps[${index}]`))
  if (!Array.isArray(definition.variantProperties)) fail(`${path}.variantProperties`, 'must be an array')
  definition.variantProperties.forEach((property, index) =>
    validateVariantProperty(property, `${path}.variantProperties[${index}]`),
  )
  if (!Array.isArray(definition.variants)) fail(`${path}.variants`, 'must be an array')
  definition.variants.forEach((variant, index) => {
    const item = record(variant, `${path}.variants[${index}]`)
    exactKeys(item, ['id', 'name', 'propertyValues', 'nodeOverrides'], [], `${path}.variants[${index}]`)
    entityId(item.id, `${path}.variants[${index}].id`)
    string(item.name, `${path}.variants[${index}].name`)
    const propertyValues = entityMap(item.propertyValues, `${path}.variants[${index}].propertyValues`)
    for (const [key, fieldValue] of Object.entries(propertyValues)) {
      nonEmptyString(key, `${path}.variants[${index}].propertyValues key`)
      string(fieldValue, `${path}.variants[${index}].propertyValues.${key}`)
    }
    const nodeOverrides = entityMap(item.nodeOverrides, `${path}.variants[${index}].nodeOverrides`)
    for (const [key, override] of Object.entries(nodeOverrides)) {
      entityId(key, `${path}.variants[${index}].nodeOverrides key`)
      validateVariantNodeOverride(override, `${path}.variants[${index}].nodeOverrides.${key}`)
    }
  })
  if (definition.representativeVariantId !== null) {
    entityId(definition.representativeVariantId, `${path}.representativeVariantId`)
  }
}

export function validateScreenComponent(
  value: unknown,
  path = 'component',
): asserts value is ScreenComponent {
  const component = record(value, path)
  string(component.nodeType, `${path}.nodeType`)
  switch (component.nodeType) {
    case 'inline':
      exactKeys(
        component,
        ['nodeType', 'id', 'screenId', 'parentId', 'childIds', 'kind', 'placement', 'sizing', 'common', 'config'],
        [],
        path,
      )
      entityId(component.id, `${path}.id`)
      entityId(component.screenId, `${path}.screenId`)
      if (component.parentId !== null) entityId(component.parentId, `${path}.parentId`)
      entityIdArray(component.childIds, `${path}.childIds`)
      enumValue(component.kind, COMPONENT_KINDS, `${path}.kind`)
      validateComponentPlacement(component.placement, `${path}.placement`)
      validateComponentSizing(component.sizing, `${path}.sizing`)
      validateCommonComponentSpec(component.common, `${path}.common`)
      validateComponentConfig(component.config, component.kind, `${path}.config`)
      return
    case 'definitionInstance':
      exactKeys(
        component,
        ['nodeType', 'id', 'screenId', 'parentId', 'childIds', 'placement', 'sizing', 'source', 'props', 'variantId'],
        [],
        path,
      )
      entityId(component.id, `${path}.id`)
      entityId(component.screenId, `${path}.screenId`)
      if (component.parentId !== null) entityId(component.parentId, `${path}.parentId`)
      if (!Array.isArray(component.childIds) || component.childIds.length !== 0) {
        fail(`${path}.childIds`, 'must be an empty array')
      }
      validateComponentPlacement(component.placement, `${path}.placement`)
      validateComponentSizing(component.sizing, `${path}.sizing`)
      validateDefinitionSource(component.source, `${path}.source`)
      const props = record(component.props, `${path}.props`)
      for (const [key, propValue] of Object.entries(props)) {
        nonEmptyString(key, `${path}.props key`)
        if (
          typeof propValue !== 'string' &&
          typeof propValue !== 'boolean' &&
          typeof propValue !== 'number'
        ) {
          fail(`${path}.props.${key}`, 'must be a string, boolean, or number')
        }
      }
      if (component.variantId !== null) entityId(component.variantId, `${path}.variantId`)
      return
    default:
      fail(`${path}.nodeType`, 'is invalid')
  }
}

export function validateComponentTargetRef(
  value: unknown,
  path = 'target',
): asserts value is EventTrigger['target'] {
  const target = record(value, path)
  string(target.type, `${path}.type`)
  switch (target.type) {
    case 'inline':
      exactKeys(target, ['type', 'componentId'], [], path)
      entityId(target.componentId, `${path}.componentId`)
      return
    case 'definitionNode':
      exactKeys(target, ['type', 'instanceId', 'nodePath'], [], path)
      entityId(target.instanceId, `${path}.instanceId`)
      if (!Array.isArray(target.nodePath) || target.nodePath.length === 0) {
        fail(`${path}.nodePath`, 'must be a non-empty array')
      }
      target.nodePath.forEach((item, index) => entityId(item, `${path}.nodePath[${index}]`))
      return
    case 'collectionItemNode':
      exactKeys(target, ['type', 'collectionId', 'nodePath'], [], path)
      entityId(target.collectionId, `${path}.collectionId`)
      if (!Array.isArray(target.nodePath) || target.nodePath.length === 0) {
        fail(`${path}.nodePath`, 'must be a non-empty array')
      }
      target.nodePath.forEach((item, index) => entityId(item, `${path}.nodePath[${index}]`))
      return
    default:
      fail(`${path}.type`, 'is invalid')
  }
}

export function validateComponentOverride(
  value: unknown,
  path = 'componentOverride',
): asserts value is ComponentOverride {
  const override = record(value, path)
  exactKeys(override, [], ['visible', 'enabled', 'text', 'value'], path)
  if (override.visible !== undefined) boolean(override.visible, `${path}.visible`)
  if (override.enabled !== undefined) boolean(override.enabled, `${path}.enabled`)
  if (override.text !== undefined) string(override.text, `${path}.text`)
  if (override.value !== undefined) string(override.value, `${path}.value`)
}

function validateScenarioComponentOverride(value: unknown, path: string): void {
  const override = record(value, path)
  exactKeys(override, ['target', 'override'], [], path)
  validateComponentTargetRef(override.target, `${path}.target`)
  validateComponentOverride(override.override, `${path}.override`)
}

export function validateScreenState(
  value: unknown,
  path = 'screenScenario',
): asserts value is ScreenScenario {
  const scenario = record(value, path)
  exactKeys(scenario, ['id', 'screenId', 'name', 'description', 'componentOverrides'], [], path)
  entityId(scenario.id, `${path}.id`)
  entityId(scenario.screenId, `${path}.screenId`)
  string(scenario.name, `${path}.name`)
  string(scenario.description, `${path}.description`)
  if (!Array.isArray(scenario.componentOverrides)) fail(`${path}.componentOverrides`, 'must be an array')
  scenario.componentOverrides.forEach((entry, index) =>
    validateScenarioComponentOverride(entry, `${path}.componentOverrides[${index}]`),
  )
}

export function validateEventTrigger(
  value: unknown,
  path = 'event.trigger',
): asserts value is EventTrigger {
  const trigger = record(value, path)
  exactKeys(trigger, ['type', 'target'], [], path)
  enumValue(trigger.type, EVENT_TRIGGER_TYPES_V3, `${path}.type`)
  validateComponentTargetRef(trigger.target, `${path}.target`)
}

export function validateEventAction(
  value: unknown,
  path = 'event.action',
): asserts value is EventAction {
  const action = record(value, path)
  string(action.type, `${path}.type`)
  switch (action.type) {
    case 'setScenario':
      exactKeys(action, ['type', 'scenarioId'], [], path)
      entityId(action.scenarioId, `${path}.scenarioId`)
      return
    case 'clearScenario':
      exactKeys(action, ['type'], [], path)
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
      fail(`${path}.type`, `must be one of: ${EVENT_ACTION_TYPES_V3.join(', ')}`)
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

function validateFieldBinding(value: unknown, path: string): asserts value is FieldBinding {
  const binding = record(value, path)
  exactKeys(binding, ['source', 'targetPath'], [], path)
  validateComponentTargetRef(binding.source, `${path}.source`)
  string(binding.targetPath, `${path}.targetPath`)
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
      'successScenarioId',
      'errorScenarioId',
    ],
    [],
    path,
  )
  entityId(operation.id, `${path}.id`)
  entityId(operation.screenId, `${path}.screenId`)
  string(operation.name, `${path}.name`)
  enumValue(operation.method, HTTP_METHODS_V3, `${path}.method`)
  string(operation.path, `${path}.path`)
  if (!Array.isArray(operation.requestBindings)) {
    fail(`${path}.requestBindings`, 'must be an array')
  }
  operation.requestBindings.forEach((binding, index) =>
    validateFieldBinding(binding, `${path}.requestBindings[${index}]`),
  )
  if (operation.successScenarioId !== null) entityId(operation.successScenarioId, `${path}.successScenarioId`)
  if (operation.errorScenarioId !== null) entityId(operation.errorScenarioId, `${path}.errorScenarioId`)
}

export function validateProjectDocumentMetadata(
  value: unknown,
  path = 'document',
): asserts value is ProjectDocument {
  const document = record(value, path)
  exactKeys(
    document,
    [
      '$schema',
      'kind',
      'schemaVersion',
      'project',
      'componentDefinitions',
      'screens',
      'components',
      'screenScenarios',
      'events',
      'apiOperations',
    ],
    [],
    path,
  )
  if (document.$schema !== CANONICAL_PROJECT_SCHEMA_URL_V3) {
    fail(`${path}.$schema`, `must equal ${CANONICAL_PROJECT_SCHEMA_URL_V3}`)
  }
  if (document.kind !== CANONICAL_PROJECT_KIND_V3) {
    fail(`${path}.kind`, `must equal ${CANONICAL_PROJECT_KIND_V3}`)
  }
  if (document.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    fail(`${path}.schemaVersion`, `must equal ${CURRENT_SCHEMA_VERSION}`)
  }
  validateProject(document.project, `${path}.project`)

  const componentDefinitions = entityMap(
    document.componentDefinitions,
    `${path}.componentDefinitions`,
  )
  for (const [key, definition] of Object.entries(componentDefinitions)) {
    entityId(key, `${path}.componentDefinitions key`)
    validateComponentDefinition(definition, `${path}.componentDefinitions.${key}`)
    if (record(definition, `${path}.componentDefinitions.${key}`).id !== key) {
      fail(`${path}.componentDefinitions.${key}.id`, `must match record key ${key}`)
    }
  }

  const validators = [
    ['screens', entityMap(document.screens, `${path}.screens`), validateScreen],
    ['components', entityMap(document.components, `${path}.components`), validateScreenComponent],
    ['screenScenarios', entityMap(document.screenScenarios, `${path}.screenScenarios`), validateScreenState],
    ['events', entityMap(document.events, `${path}.events`), validateScreenEvent],
    ['apiOperations', entityMap(document.apiOperations, `${path}.apiOperations`), validateApiOperation],
  ] as const

  for (const [collectionName, collection, validateEntity] of validators) {
    for (const [key, entity] of Object.entries(collection)) {
      entityId(key, `${path}.${collectionName} key`)
      validateEntity(entity, `${path}.${collectionName}.${key}`)
      if (record(entity, `${path}.${collectionName}.${key}`).id !== key) {
        fail(`${path}.${collectionName}.${key}.id`, `must match record key ${key}`)
      }
    }
  }
}
