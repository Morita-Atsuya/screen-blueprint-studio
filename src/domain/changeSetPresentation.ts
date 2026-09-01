import type { ChangeSet, ChangeSetOperation } from './collaboration'
import { getChangeSetOperationSnapshots } from './changeSetReplay'
import { isDeleteCommand, summarizeDeleteImpact } from './deleteImpact'
import type { DomainCommand } from './commands'
import { getComponentHierarchyLabel } from './componentDisplayLabel'
import { getOwnEntity } from './entityMap'
import type { EntityId, ProjectDocument } from './model'
import { translate, commandMessageKey, type Locale, type MessageKey } from '../i18n/messages'

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

function fieldLabel(field: string, locale: Locale): string {
  const known: Partial<Record<string, MessageKey>> = {
    status: 'review.field.status',
    name: 'review.field.name',
    route: 'review.field.route',
    description: 'review.field.description',
    text: 'review.field.text',
    label: 'review.field.label',
    placement: 'review.field.placement',
    impact: 'review.field.impact',
  }
  return known[field] ? translate(locale, known[field]) : field
}

function formatValue(value: unknown): string {
  if (value === undefined) return '—'
  if (value === null) return 'None'
  if (typeof value === 'string') return value || '""'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function buildFieldChange(
  field: string,
  before: unknown,
  after: unknown,
  locale: Locale,
): ReviewFieldChange {
  return {
    field: fieldLabel(field, locale),
    before: reviewValue(formatValue(before)),
    after: reviewValue(formatValue(after)),
  }
}

function changedRecordFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  locale: Locale,
  omitted: ReadonlySet<string> = new Set(),
): ReviewFieldChange[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ])
  return [...keys]
    .filter(key => !omitted.has(key))
    .sort()
    .flatMap(key => {
      const previous = before?.[key]
      const next = after?.[key]
      return JSON.stringify(previous) === JSON.stringify(next)
        ? []
        : [buildFieldChange(key, previous, next, locale)]
    })
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
  return getOwnEntity(document.screens, screenId)?.name ?? translate(locale, 'review.value.missing')
}

function stateLabel(document: ProjectDocument, stateId: EntityId | null | undefined, locale: Locale): string {
  if (!stateId) return translate(locale, 'review.value.none')
  return getOwnEntity(document.screenScenarios, stateId)?.name ?? translate(locale, 'review.value.missing')
}

function summarizeImpact(
  before: ProjectDocument,
  after: ProjectDocument,
  command: Extract<DomainCommand, { type: 'removeScreen' | 'removeComponent' | 'removeScreenState' | 'removeEvent' | 'removeApiOperation' }>,
): string | null {
  const impact = summarizeDeleteImpact(before, after, command)
  const segments = [
    impact.counts.components > 0 ? `components ${impact.counts.components}` : null,
    impact.counts.states > 0 ? `scenarios ${impact.counts.states}` : null,
    impact.counts.events > 0 ? `events ${impact.counts.events}` : null,
    impact.counts.apiOperations > 0 ? `API ${impact.counts.apiOperations}` : null,
    impact.counts.stateOverrides > 0 ? `overrides ${impact.counts.stateOverrides}` : null,
  ].filter((value): value is string => value !== null)
  return segments.length === 0 ? null : reviewValue(segments.join(' · ')).text
}

function targetDetails(
  document: ProjectDocument,
  command: DomainCommand,
  locale: Locale,
): {
  entityKind: string
  targetLabel: string
  screenContext: string | null
  navigation: ReviewNavigation | null
} {
  switch (command.type) {
    case 'addScreen':
    case 'updateScreen':
    case 'removeScreen': {
      const screenId = command.screenId
      return {
        entityKind: 'Screen',
        targetLabel: screenLabel(document, screenId, locale),
        screenContext: null,
        navigation: { screenId },
      }
    }
    case 'createScreenState':
    case 'updateScreenState':
    case 'removeScreenState': {
      const stateId = command.stateId
      const scenario = getOwnEntity(document.screenScenarios, stateId)
      const screenId = command.type === 'createScreenState'
        ? command.screenId
        : scenario?.screenId ?? null
      return {
        entityKind: 'Scenario',
        targetLabel: stateLabel(document, stateId, locale),
        screenContext: screenLabel(document, screenId, locale),
        navigation: screenId ? { screenId, stateId } : null,
      }
    }
    case 'connectEvent':
    case 'updateEvent':
    case 'removeEvent': {
      const eventId = command.eventId
      const event = getOwnEntity(document.events, eventId)
      const screenId = command.type === 'connectEvent' ? command.screenId : event?.screenId ?? null
      return {
        entityKind: 'Event',
        targetLabel: event?.name ?? ('name' in command ? command.name : eventId),
        screenContext: screenLabel(document, screenId, locale),
        navigation: screenId ? { screenId } : null,
      }
    }
    case 'bindApiOperation':
    case 'updateApiOperation':
    case 'removeApiOperation': {
      const operationId = command.operationId
      const operation = getOwnEntity(document.apiOperations, operationId)
      const screenId = command.type === 'bindApiOperation' ? command.screenId : operation?.screenId ?? null
      return {
        entityKind: 'API',
        targetLabel: operation?.name ?? ('name' in command ? command.name : operationId),
        screenContext: screenLabel(document, screenId, locale),
        navigation: screenId ? { screenId } : null,
      }
    }
    case 'removeComponentDefinition':
      return {
        entityKind: 'Definition',
        targetLabel: getOwnEntity(document.componentDefinitions, command.definitionId)?.name ?? command.definitionId,
        screenContext: null,
        navigation: null,
      }
    case 'putComponentDefinition':
      return {
        entityKind: 'Definition',
        targetLabel: command.definition.name,
        screenContext: null,
        navigation: null,
      }
    case 'extractComponentDefinition':
      return {
        entityKind: 'Definition',
        targetLabel: command.definition.name,
        screenContext: screenLabel(document, command.sourceScreenId, locale),
        navigation: { screenId: command.sourceScreenId, componentId: command.replacementInstanceId },
      }
    case 'detachDefinitionInstance':
      return {
        entityKind: 'Component',
        targetLabel: componentLabel(document, command.instanceId, locale),
        screenContext: screenLabel(
          document,
          getOwnEntity(document.components, command.instanceId)?.screenId,
          locale,
        ),
        navigation: getOwnEntity(document.components, command.instanceId)
          ? {
              screenId: getOwnEntity(document.components, command.instanceId)!.screenId,
              componentId: command.instanceId,
            }
          : null,
      }
    case 'addComponent':
    case 'addDefinitionInstance':
    case 'moveComponent':
    case 'duplicateComponent':
    case 'pasteComponent':
    case 'removeComponent':
    case 'updateComponentSpec':
    case 'updateDefinitionInstance': {
      const componentId = command.type === 'addComponent' || command.type === 'addDefinitionInstance'
        ? command.componentId
        : command.type === 'moveComponent'
          ? command.componentId
          : command.type === 'duplicateComponent'
            ? command.componentIdMap[command.componentId] ?? command.componentId
            : command.type === 'pasteComponent'
              ? command.componentIdMap[command.snapshot.rootComponentId] ?? command.snapshot.rootComponentId
              : command.componentId
      const component = getOwnEntity(document.components, componentId)
      const screenId = component?.screenId ?? (
        command.type === 'addComponent' || command.type === 'addDefinitionInstance'
          ? command.screenId
          : command.type === 'pasteComponent'
            ? command.destinationScreenId
            : null
      )
      return {
        entityKind: 'Component',
        targetLabel: component ? getComponentHierarchyLabel(document, component, locale) : componentId,
        screenContext: screenLabel(document, screenId, locale),
        navigation: screenId ? { screenId, componentId } : null,
      }
    }
  }
}

function operationChanges(
  before: ProjectDocument,
  after: ProjectDocument,
  command: DomainCommand,
  locale: Locale,
): ReviewFieldChange[] {
  switch (command.type) {
    case 'addScreen':
      return [
        buildFieldChange('status', translate(locale, 'review.value.none'), 'created', locale),
        buildFieldChange('name', '', command.name, locale),
        buildFieldChange('route', '', command.route, locale),
      ]
    case 'updateScreen': {
      const previous = getOwnEntity(before.screens, command.screenId)
      const next = getOwnEntity(after.screens, command.screenId)
      if (!previous || !next) return []
      return [
        previous.name !== next.name ? buildFieldChange('name', previous.name, next.name, locale) : null,
        previous.route !== next.route ? buildFieldChange('route', previous.route, next.route, locale) : null,
        previous.baseDescription !== next.baseDescription
          ? buildFieldChange('description', previous.baseDescription, next.baseDescription, locale)
          : null,
      ].filter((change): change is ReviewFieldChange => change !== null)
    }
    case 'removeScreen':
    case 'removeComponent':
    case 'removeScreenState':
    case 'removeEvent':
    case 'removeApiOperation':
    case 'removeComponentDefinition':
      return [buildFieldChange('status', 'present', 'removed', locale)]
    case 'addComponent':
      return [
        buildFieldChange('status', 'none', 'created', locale),
        buildFieldChange('type', '—', command.kind, locale),
        buildFieldChange('parent', '—', command.parentId, locale),
        buildFieldChange('position', '—', command.position, locale),
        buildFieldChange('config', '—', command.config, locale),
        buildFieldChange('placement', '—', command.placement.mode, locale),
        buildFieldChange('sizing', '—', command.sizing, locale),
      ]
    case 'addDefinitionInstance':
      return [
        buildFieldChange('status', 'none', 'created', locale),
        buildFieldChange('definition', '—', command.definitionId, locale),
        buildFieldChange('variant', '—', command.variantId, locale),
        buildFieldChange('props', '—', command.props, locale),
        buildFieldChange('parent', '—', command.parentId, locale),
        buildFieldChange('position', '—', command.position, locale),
        buildFieldChange('placement', '—', command.placement, locale),
        buildFieldChange('sizing', '—', command.sizing, locale),
      ]
    case 'moveComponent': {
      const previous = getOwnEntity(before.components, command.componentId)
      const next = getOwnEntity(after.components, command.componentId)
      return previous && next
        ? [buildFieldChange('placement', previous.parentId, next.parentId, locale)]
        : []
    }
    case 'duplicateComponent':
    case 'pasteComponent':
    case 'extractComponentDefinition':
    case 'detachDefinitionInstance':
      return [buildFieldChange('status', 'source', 'copied', locale)]
    case 'updateComponentSpec':
    {
      const previous = getOwnEntity(before.components, command.componentId)
      const next = getOwnEntity(after.components, command.componentId)
      if (
        !previous ||
        !next ||
        previous.nodeType !== 'inline' ||
        next.nodeType !== 'inline'
      ) return []
      return [
        ...changedRecordFields(
          previous.common as unknown as Record<string, unknown>,
          next.common as unknown as Record<string, unknown>,
          locale,
        ),
        ...changedRecordFields(
          previous.config as unknown as Record<string, unknown>,
          next.config as unknown as Record<string, unknown>,
          locale,
          new Set(['kind']),
        ),
        ...changedRecordFields(
          previous.placement as unknown as Record<string, unknown>,
          next.placement as unknown as Record<string, unknown>,
          locale,
        ),
        ...changedRecordFields(
          previous.sizing as unknown as Record<string, unknown>,
          next.sizing as unknown as Record<string, unknown>,
          locale,
        ),
      ]
    }
    case 'updateDefinitionInstance': {
      const previous = getOwnEntity(before.components, command.componentId)
      const next = getOwnEntity(after.components, command.componentId)
      if (
        !previous ||
        !next ||
        previous.nodeType !== 'definitionInstance' ||
        next.nodeType !== 'definitionInstance'
      ) return []
      return [
        previous.variantId !== next.variantId
          ? buildFieldChange('variant', previous.variantId, next.variantId, locale)
          : null,
        JSON.stringify(previous.props) !== JSON.stringify(next.props)
          ? buildFieldChange('props', previous.props, next.props, locale)
          : null,
        JSON.stringify(previous.placement) !== JSON.stringify(next.placement)
          ? buildFieldChange('placement', previous.placement, next.placement, locale)
          : null,
        JSON.stringify(previous.sizing) !== JSON.stringify(next.sizing)
          ? buildFieldChange('sizing', previous.sizing, next.sizing, locale)
          : null,
      ].filter((change): change is ReviewFieldChange => change !== null)
    }
    case 'putComponentDefinition': {
      const previous = getOwnEntity(before.componentDefinitions, command.definition.id)
      return command.mode === 'create'
        ? [
            buildFieldChange('status', 'none', 'created', locale),
            ...changedRecordFields(
              null,
              command.definition as unknown as Record<string, unknown>,
              locale,
              new Set(['id']),
            ),
          ]
        : changedRecordFields(
            previous as unknown as Record<string, unknown>,
            command.definition as unknown as Record<string, unknown>,
            locale,
            new Set(['id']),
          )
    }
    case 'createScreenState':
      return [buildFieldChange('name', '', command.name, locale)]
    case 'updateScreenState': {
      const previous = getOwnEntity(before.screenScenarios, command.stateId)
      const next = getOwnEntity(after.screenScenarios, command.stateId)
      if (!previous || !next) return []
      return [
        previous.name !== next.name ? buildFieldChange('name', previous.name, next.name, locale) : null,
        previous.description !== next.description
          ? buildFieldChange('description', previous.description, next.description, locale)
          : null,
        JSON.stringify(previous.componentOverrides) !== JSON.stringify(next.componentOverrides)
          ? buildFieldChange('overrides', previous.componentOverrides, next.componentOverrides, locale)
          : null,
      ].filter((change): change is ReviewFieldChange => change !== null)
    }
    case 'connectEvent':
    case 'updateEvent': {
      const previous = command.type === 'updateEvent' ? getOwnEntity(before.events, command.eventId) : null
      const next = getOwnEntity(after.events, command.eventId)
      return [
        buildFieldChange('name', previous?.name ?? '', next?.name ?? command.name, locale),
        buildFieldChange('trigger', previous?.trigger, next?.trigger ?? command.trigger, locale),
        buildFieldChange('actions', previous?.actions, next?.actions ?? command.actions, locale),
      ]
    }
    case 'bindApiOperation':
    case 'updateApiOperation': {
      const previous = command.type === 'updateApiOperation'
        ? getOwnEntity(before.apiOperations, command.operationId)
        : null
      const next = getOwnEntity(after.apiOperations, command.operationId)
      return [
        buildFieldChange('name', previous?.name ?? '', next?.name ?? command.name, locale),
        buildFieldChange('method', previous?.method, next?.method ?? command.method, locale),
        buildFieldChange('path', previous?.path ?? '', next?.path ?? command.path, locale),
        buildFieldChange(
          'requestBindings',
          previous?.requestBindings,
          next?.requestBindings ?? command.requestBindings,
          locale,
        ),
        buildFieldChange(
          'successState',
          previous?.successScenarioId,
          next?.successScenarioId ?? command.successScenarioId,
          locale,
        ),
        buildFieldChange(
          'errorState',
          previous?.errorScenarioId,
          next?.errorScenarioId ?? command.errorScenarioId,
          locale,
        ),
      ]
    }
  }
}

export function presentChangeSetOperations(
  changeSet: ChangeSet,
  locale: Locale,
): ChangeOperationPresentation[] {
  return getChangeSetOperationSnapshots(changeSet).map(({ operation, before, after }) => {
    const useBeforeTarget = isDeleteCommand(operation.command) ||
      operation.command.type === 'removeComponentDefinition' ||
      operation.command.type === 'detachDefinitionInstance'
    const target = targetDetails(useBeforeTarget ? before : after, operation.command, locale)
    return {
      operationId: operation.id,
      source: operation.source,
      commandType: operation.command.type,
      action: translate(locale, commandMessageKey(operation.command)),
      entityKind: target.entityKind,
      targetLabel: target.targetLabel,
      screenContext: target.screenContext,
      changes: operationChanges(before, after, operation.command, locale),
      impact: isDeleteCommand(operation.command)
        ? summarizeImpact(before, after, operation.command)
        : null,
      navigation: useBeforeTarget ? null : target.navigation,
    }
  })
}
