import { getOwnEntity } from '../../domain/entityMap'
import type {
  ComponentConfig,
  ComponentKind,
  ComponentOverride,
  EntityId,
  ProjectDocument,
  ScreenComponent,
} from '../../domain/model'
import { isInlineScreenComponent } from '../../domain/model'
import { componentTargetRefEquals, findInlineScenarioOverride, inlineTargetRef } from '../../domain/componentTargets'

export type InspectorSectionId =
  | 'basic'
  | 'content'
  | 'layout'
  | 'placement'
  | 'behavior'
  | 'validation'
  | 'stateOverrides'

export interface InspectorSectionSignals {
  hasBehavior: boolean
  validationRuleCount: number
  overrideFieldCount: number
}

export type InspectorSectionChangeCounts = Record<InspectorSectionId, number>

const LAYOUT_FIELDS = [
  'layout',
  'gap',
  'columns',
  'justify',
  'align',
  'wrap',
] as const

export function componentHasContentSection(kind: ComponentKind): boolean {
  switch (kind) {
    case 'text':
    case 'textInput':
    case 'select':
    case 'button':
    case 'image':
    case 'link':
    case 'collection':
      return true
    case 'page':
    case 'container':
    case 'modal':
      return false
  }
}

export function componentHasLayoutSection(kind: ComponentKind): boolean {
  switch (kind) {
    case 'page':
    case 'container':
    case 'modal':
      return true
    case 'text':
    case 'textInput':
    case 'select':
    case 'button':
    case 'image':
    case 'link':
    case 'collection':
      return false
  }
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(stableValue))
  if (value && typeof value === 'object') {
    return JSON.stringify(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return JSON.stringify(value) ?? 'undefined'
}

function differenceCount(
  before: object,
  after: object,
): number {
  return new Set([...Object.keys(before), ...Object.keys(after)]).size === 0
    ? 0
    : [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter(key =>
        stableValue(Reflect.get(before, key)) !== stableValue(Reflect.get(after, key)),
      )
      .length
}

function layoutValues(config: ComponentConfig | undefined): Record<string, unknown> {
  if (
    !config ||
    (config.kind !== 'page' &&
      config.kind !== 'container' &&
      config.kind !== 'modal')
  ) {
    return {}
  }
  return Object.fromEntries(LAYOUT_FIELDS.map(field => [field, config[field]]))
}

function contentValues(config: ComponentConfig | undefined): Record<string, unknown> {
  if (!config) return {}
  switch (config.kind) {
    case 'page':
    case 'container':
    case 'modal':
      return {}
    case 'text':
      return { text: config.text, style: config.style }
    case 'textInput':
      return {
        fieldKey: config.fieldKey,
        label: config.label,
        inputType: config.inputType,
        required: config.required,
        placeholder: config.placeholder,
        defaultValue: config.defaultValue,
      }
    case 'select':
      return {
        fieldKey: config.fieldKey,
        label: config.label,
        required: config.required,
        options: config.options,
        defaultValue: config.defaultValue,
      }
    case 'button':
      return {
        label: config.label,
        variant: config.variant,
        confirmationMessage: config.confirmationMessage,
        preventDoubleSubmit: config.preventDoubleSubmit,
      }
    case 'image':
      return {
        source: config.source,
        alt: config.alt,
        fit: config.fit,
        aspectRatio: config.aspectRatio,
        placeholderStyle: config.placeholderStyle,
      }
    case 'link':
      return {
        label: config.label,
        destination: config.destination,
        openMode: config.openMode,
      }
    case 'collection':
      return {
        dataSource: config.dataSource,
        itemKeyPath: config.itemKeyPath,
        itemTemplate: config.itemTemplate,
        propBindings: config.propBindings,
        variantSelection: config.variantSelection,
        visibility: config.visibility,
      }
  }
}

function validationRules(config: ComponentConfig | undefined): unknown[] {
  return config?.kind === 'textInput' ? config.validationRules : []
}

function inlineConfig(component: ScreenComponent | undefined): ComponentConfig | undefined {
  return component && isInlineScreenComponent(component) ? component.config : undefined
}

function inlineCommon(component: ScreenComponent | undefined): Record<string, unknown> {
  return component && isInlineScreenComponent(component)
    ? component.common as unknown as Record<string, unknown>
    : {}
}

function behaviorProjection(document: ProjectDocument, componentId: EntityId): unknown {
  const component = getOwnEntity(document.components, componentId)
  if (!component || !isInlineScreenComponent(component)) return null
  return {
    buttonEventId: component.config.kind === 'button' ? component.config.eventId : null,
    events: Object.values(document.events)
      .filter(event => componentTargetRefEquals(event.trigger.target, inlineTargetRef(componentId)))
      .sort((left, right) => left.id.localeCompare(right.id)),
    apiBindings: Object.values(document.apiOperations)
      .flatMap(operation => operation.requestBindings
        .filter(binding => componentTargetRefEquals(binding.source, inlineTargetRef(componentId)))
        .map(binding => ({
          operationId: operation.id,
          targetPath: binding.targetPath,
        })))
      .sort((left, right) =>
        left.operationId.localeCompare(right.operationId) ||
        left.targetPath.localeCompare(right.targetPath)),
  }
}

export function inspectorSectionPreferenceKey(
  componentKind: ComponentKind,
  sectionId: InspectorSectionId,
): string {
  return `${componentKind}:${sectionId}`
}

export function defaultInspectorSectionOpen(
  sectionId: InspectorSectionId,
  signals: InspectorSectionSignals,
): boolean {
  switch (sectionId) {
    case 'basic':
    case 'content':
      return true
    case 'layout':
    case 'placement':
      return false
    case 'behavior':
      return signals.hasBehavior
    case 'validation':
      return signals.validationRuleCount > 0
    case 'stateOverrides':
      return signals.overrideFieldCount > 0
  }
}

export function countOverrideFields(override: ComponentOverride | undefined): number {
  return override ? Object.keys(override).length : 0
}

export function inspectorSectionChangeCounts(
  baseDocument: ProjectDocument | null,
  previewDocument: ProjectDocument,
  componentId: EntityId,
  activeStateId: EntityId | null,
): InspectorSectionChangeCounts {
  const empty: InspectorSectionChangeCounts = {
    basic: 0,
    content: 0,
    layout: 0,
    placement: 0,
    behavior: 0,
    validation: 0,
    stateOverrides: 0,
  }
  if (!baseDocument) return empty

  const before = getOwnEntity(baseDocument.components, componentId)
  const after = getOwnEntity(previewDocument.components, componentId)
  if (!after) return empty

  empty.basic = before
    ? differenceCount(inlineCommon(before), inlineCommon(after)) + (
        stableValue({
          screenId: before.screenId,
          parentId: before.parentId,
          childIds: before.childIds,
        }) === stableValue({
          screenId: after.screenId,
          parentId: after.parentId,
          childIds: after.childIds,
        }) ? 0 : 1
      )
    : 1
  empty.content = differenceCount(
    contentValues(inlineConfig(before)),
    contentValues(inlineConfig(after)),
  )
  empty.layout = differenceCount(
    layoutValues(inlineConfig(before)),
    layoutValues(inlineConfig(after)),
  )
  empty.placement =
    (stableValue(before?.placement) === stableValue(after.placement) ? 0 : 1) +
    (stableValue(before?.sizing) === stableValue(after.sizing)
      ? 0
      : differenceCount(before?.sizing ?? {}, after.sizing))
  empty.validation = stableValue(validationRules(inlineConfig(before))) ===
    stableValue(validationRules(inlineConfig(after)))
    ? 0
    : Math.max(validationRules(inlineConfig(after)).length, 1)
  empty.behavior = stableValue(
    before ? behaviorProjection(baseDocument, componentId) : null,
  ) === stableValue(behaviorProjection(previewDocument, componentId))
    ? 0
    : 1
  empty.stateOverrides = differenceCount(
    activeStateId
      ? findInlineScenarioOverride(
          getOwnEntity(baseDocument.screenScenarios, activeStateId),
          componentId,
        )?.override ?? {}
      : {},
    activeStateId
      ? findInlineScenarioOverride(
          getOwnEntity(previewDocument.screenScenarios, activeStateId),
          componentId,
        )?.override ?? {}
      : {},
  )
  return empty
}
