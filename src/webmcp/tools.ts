import { nanoid } from 'nanoid'
import { useAppStore } from '../app/appStore'
import type { DomainCommand } from '../domain/commands'
import type {
  CommonComponentSpec,
  BehaviorValueSource,
  ComponentConfig,
  ComponentKind,
  ComponentOverride,
  ComponentPlacement,
  ComponentSizing,
  DefinitionComponentConfig,
  EventAction,
  EventTrigger,
  FieldBinding,
  HttpMethod,
  ComponentTargetRef,
  PublicPropFieldV3,
} from '../domain/model'
import {
  DEFAULT_COMPONENT_PLACEMENT,
  DEFAULT_COMPONENT_SIZING,
  PALETTE_COMPONENT_KINDS,
} from '../domain/model'
import { DomainError } from '../domain/errors'
import { getOwnEntity } from '../domain/entityMap'
import { effectiveComponent } from '../domain/selectors'
import {
  componentTargetRefEquals,
  findScenarioOverride,
  inlineTargetRef,
  isComponentTargetRef,
} from '../domain/componentTargets'
import { createDuplicateComponentCommand } from '../domain/componentDuplication'
import { presentChangeSetOperations } from '../domain/changeSetPresentation'
import {
  validateCommonComponentSpec,
  validateComponentConfig,
  validateComponentOverride,
  validateComponentPlacement,
  validateComponentSizing,
  validateDefinitionComponentConfig,
  validateEventAction,
  validateEventTrigger,
} from '../domain/runtimeValidation'
import {
  selectedScreenComponentId,
  selectionCanonicalTarget,
} from '../domain/editorSelection'
import {
  createDetachDefinitionInstanceCommand,
  createEmptyComponentDefinition,
  createExtractDefinitionCommand,
  duplicateComponentDefinition,
  resolveOwnedDefinitionInlineNodeAtPath,
} from '../domain/definitionEditing'
import { cloneComponentDefinition } from '../domain/modelClone'
import {
  resolveComponentTarget,
  resolveScreenNodes,
  type ResolvedRuntimeNode,
} from '../domain/definitionResolver'
import type { ChangeSet } from '../domain/collaboration'
import {
  componentConfigPatchSchema,
  componentConfigSchema,
  componentPlacementSchema,
  componentTargetSchema,
  componentSizingSchema,
  componentSizingPatchSchema,
  componentOverridesSchema,
  publicPropFieldSchema,
} from './schemas'

type JsonObject = Record<string, unknown>

interface ToolDefinition {
  name: string
  description: string
  inputSchema: JsonObject
  annotations?: { readOnlyHint?: boolean }
  execute: (input: JsonObject) => unknown
}

interface ModelContextRegisterToolOptions {
  signal?: AbortSignal
}

interface ModelContext {
  registerTool(
    tool: ToolDefinition,
    options?: ModelContextRegisterToolOptions,
  ): Promise<undefined>
}

declare global {
  interface Document {
    modelContext?: ModelContext
  }
}

export interface ToolFailure {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

interface ToolSuccess<T extends JsonObject = JsonObject> {
  ok: true
  data: T
}

type ToolResult<T extends JsonObject = JsonObject> = ToolSuccess<T> | ToolFailure

const CLOSED_OBJECT = { additionalProperties: false } as const
const AGENT_WORKFLOW =
  'Read get_current_screen_context first. Writes require begin_change_set IDs and the latest ' +
  'changeSetVersion; review with get_pending_change_set. Only a human can Accept or Reject.'

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(input: JsonObject, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new DomainError('INVALID_REFERENCE', `${key} must be a non-empty string`)
  }
  return value
}

function optionalString(input: JsonObject, key: string): string | undefined {
  const value = input[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new DomainError('INVALID_REFERENCE', `${key} must be a string`)
  }
  return value
}

function requiredNullableString(input: JsonObject, key: string): string | null {
  const value = input[key]
  if (value === null) return null
  if (typeof value !== 'string' || value.length === 0) {
    throw new DomainError('INVALID_REFERENCE', `${key} must be a non-empty string or null`)
  }
  return value
}

function requiredNonNegativeInteger(input: JsonObject, key: string): number {
  const value = input[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new DomainError('INVALID_ARGUMENT', `${key} must be a non-negative integer`, {
      argument: key,
    })
  }
  return value
}

function requiredRecord(input: JsonObject, key: string): JsonObject {
  const value = input[key]
  if (!isRecord(value)) {
    throw new DomainError('INVALID_REFERENCE', `${key} must be an object`)
  }
  return value
}

function requireExactKeys(input: JsonObject, allowedKeys: readonly string[], path: string): void {
  const allowed = new Set(allowedKeys)
  const unknown = Object.keys(input).filter(key => !allowed.has(key))
  if (unknown.length > 0) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${path} contains unknown fields: ${unknown.join(', ')}`,
    )
  }
}

function requireNonEmptyObject(input: JsonObject, path: string): void {
  if (Object.keys(input).length === 0) {
    throw new DomainError('INVALID_ARGUMENT', `${path} must not be empty`)
  }
}

function success<T extends JsonObject>(data: T): ToolSuccess<T> {
  return { ok: true, data }
}

function componentTargetFromInput(value: unknown, path: string): ComponentTargetRef {
  if (!isRecord(value)) {
    throw new DomainError('INVALID_REFERENCE', `${path} must be a target object`)
  }
  if (value.type === 'inline') {
    requireExactKeys(value, ['type', 'componentId'], path)
    return inlineTargetRef(requiredString(value, 'componentId'))
  }
  if (value.type === 'definitionNode') {
    requireExactKeys(value, ['type', 'instanceId', 'nodePath'], path)
    if (
      !Array.isArray(value.nodePath) ||
      value.nodePath.length === 0 ||
      !value.nodePath.every(segment => typeof segment === 'string' && segment.length > 0)
    ) {
      throw new DomainError('INVALID_REFERENCE', `${path}.nodePath must be non-empty strings`)
    }
    return {
      type: 'definitionNode',
      instanceId: requiredString(value, 'instanceId'),
      nodePath: value.nodePath as [string, ...string[]],
    }
  }
  if (value.type === 'collectionItemNode') {
    requireExactKeys(value, ['type', 'collectionId', 'nodePath'], path)
    if (
      !Array.isArray(value.nodePath) ||
      value.nodePath.length === 0 ||
      !value.nodePath.every(segment => typeof segment === 'string' && segment.length > 0)
    ) {
      throw new DomainError('INVALID_REFERENCE', `${path}.nodePath must be non-empty strings`)
    }
    return {
      type: 'collectionItemNode',
      collectionId: requiredString(value, 'collectionId'),
      nodePath: value.nodePath as [string, ...string[]],
    }
  }
  throw new DomainError('INVALID_REFERENCE', `${path}.type is invalid`)
}

function scenarioOverridesFromInput(
  value: unknown,
): Array<{ target: ComponentTargetRef; override: ComponentOverride }> | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new DomainError('INVALID_REFERENCE', 'overrides must be an array')
  }
  return value.map((entry, index) => {
    if (!isRecord(entry) || !isRecord(entry.override)) {
      throw new DomainError(
        'INVALID_REFERENCE',
        `overrides[${index}] must contain target and override objects`,
      )
    }
    validateComponentOverride(entry.override, `overrides[${index}].override`)
    return {
      target: componentTargetFromInput(entry.target, `overrides[${index}].target`),
      override: entry.override as ComponentOverride,
    }
  })
}

function fieldBindingsFromInput(value: unknown): FieldBinding[] {
  if (!Array.isArray(value)) {
    throw new DomainError('INVALID_REFERENCE', 'requestBindings must be an array')
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new DomainError('INVALID_REFERENCE', `requestBindings[${index}] must be an object`)
    }
    requireExactKeys(entry, ['source', 'targetPath'], `requestBindings[${index}]`)
    return {
      source: behaviorBindingSourceFromInput(
        entry.source,
        `requestBindings[${index}].source`,
      ),
      targetPath: requiredString(entry, 'targetPath'),
    }
  })
}

function behaviorBindingSourceFromInput(
  value: unknown,
  label: string,
): ComponentTargetRef | BehaviorValueSource {
  if (!isRecord(value)) {
    throw new DomainError('INVALID_REFERENCE', `${label} must be an object`)
  }
  if (value.type === 'item') {
    requireExactKeys(value, ['type', 'path'], label)
    return { type: 'item', path: requiredString(value, 'path') }
  }
  if (value.type === 'literal') {
    requireExactKeys(value, ['type', 'value'], label)
    const literal = value.value
    if (
      literal !== null &&
      typeof literal !== 'string' &&
      typeof literal !== 'number' &&
      typeof literal !== 'boolean'
    ) {
      throw new DomainError('INVALID_REFERENCE', `${label}.value must be a scalar`)
    }
    return { type: 'literal', value: literal }
  }
  return componentTargetFromInput(value, label)
}

function triggerFromInput(input: JsonObject): EventTrigger {
  const trigger = requiredRecord(input, 'trigger')
  requireExactKeys(trigger, ['type', 'target'], 'trigger')
  const result = {
    type: requiredString(trigger, 'type') as EventTrigger['type'],
    target: componentTargetFromInput(trigger.target, 'trigger.target'),
  }
  validateEventTrigger(result, 'trigger')
  return result
}

function failure(error: unknown): ToolFailure {
  if (error instanceof DomainError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    }
  }
  return {
    ok: false,
    error: {
      code: 'INVARIANT_VIOLATION',
      message: error instanceof Error ? error.message : String(error),
    },
  }
}

function withFailure<T extends JsonObject>(operation: () => T): ToolResult<T> {
  try {
    return success(operation())
  } catch (error) {
    return failure(error)
  }
}

function withWriteFailure<T extends JsonObject>(operation: () => T): ToolResult<T> {
  const recovery = useAppStore.getState().recoveryState
  if (recovery) {
    return failure(new DomainError('RECOVERY_REQUIRED', 'Persisted data recovery is required', {
      status: recovery.status,
      error: recovery.error,
    }))
  }
  return withFailure(operation)
}

function appendCommand(
  input: JsonObject,
  command: DomainCommand,
  resultData: JsonObject = {},
): JsonObject {
  const state = useAppStore.getState()
  if (state.recoveryState) {
    throw new DomainError('RECOVERY_REQUIRED', 'Persisted data recovery is required', {
      status: state.recoveryState.status,
      error: state.recoveryState.error,
    })
  }
  const changeSetId = requiredString(input, 'changeSetId')
  const expectedRevision = requiredNonNegativeInteger(input, 'expectedRevision')
  const expectedChangeSetVersion = requiredNonNegativeInteger(
    input,
    'expectedChangeSetVersion',
  )
  const active = state.activeChangeSet

  if (!active || active.id !== changeSetId) {
    throw new DomainError('CHANGE_SET_REQUIRED', 'No matching active change set', {
      requestedChangeSetId: changeSetId,
      activeChangeSetId: active?.id ?? null,
    })
  }
  if (
    expectedRevision !== state.revision ||
    expectedRevision !== active.baseRevision ||
    expectedChangeSetVersion !== active.version
  ) {
    throw new DomainError('REVISION_CONFLICT', 'The document or change set version is stale', {
      expectedRevision,
      actualRevision: state.revision,
      expectedChangeSetVersion,
      actualChangeSetVersion: active.version,
    })
  }

  const previousCount = active.operations.length
  state.dispatchToChangeSet(changeSetId, command, 'agent')
  const updated = useAppStore.getState().activeChangeSet
  if (!updated || updated.operations.length !== previousCount + 1) {
    throw new DomainError('INVARIANT_VIOLATION', 'The operation was not added to the change set')
  }
  return {
    operationId: updated.operations[updated.operations.length - 1]!.id,
    changeSetId: updated.id,
    changeSetVersion: updated.version,
    revision: state.revision,
    ...resultData,
  }
}

const writeBaseProperties = {
  changeSetId: {
    type: 'string',
    minLength: 1,
    description: 'ID returned by begin_change_set for the one active agent proposal.',
  },
  expectedRevision: {
    type: 'integer',
    minimum: 0,
    description:
      'Confirmed revision returned by begin_change_set. Re-read context after REVISION_CONFLICT.',
  },
  expectedChangeSetVersion: {
    type: 'integer',
    minimum: 0,
    description:
      'Latest version returned by begin_change_set or the preceding successful write. ' +
      'Re-read pending state after REVISION_CONFLICT.',
  },
}

function writeOperationSchema(
  operations: readonly string[],
  properties: JsonObject,
  _requirements: string,
): JsonObject {
  return {
    type: 'object',
    properties: {
      ...writeBaseProperties,
      operation: { type: 'string', enum: operations },
      ...properties,
    },
    required: [
      'changeSetId',
      'expectedRevision',
      'expectedChangeSetVersion',
      'operation',
    ],
    ...CLOSED_OBJECT,
  }
}

const behaviorValueSourceSchema = {
  type: 'object',
  description: 'Required by type: item path; literal scalar value.',
  properties: {
    type: { type: 'string', enum: ['item', 'literal'] },
    path: { type: 'string' },
    value: { type: ['string', 'number', 'boolean', 'null'] },
  },
  required: ['type'],
  ...CLOSED_OBJECT,
}

const behaviorParameterMapSchema = {
  type: 'object',
  propertyNames: { type: 'string', minLength: 1, pattern: '\\S' },
  additionalProperties: behaviorValueSourceSchema,
}

const fieldBindingSchema = {
  type: 'object',
  properties: {
    source: {
      type: 'object',
      description:
        'A component target (inline/definitionNode/collectionItemNode) or item/literal value source.',
      properties: {
        type: {
          type: 'string',
          enum: ['inline', 'definitionNode', 'collectionItemNode', 'item', 'literal'],
        },
        componentId: { type: 'string', minLength: 1 },
        instanceId: { type: 'string', minLength: 1 },
        collectionId: { type: 'string', minLength: 1 },
        nodePath: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
        },
        path: { type: 'string' },
        value: { type: ['string', 'number', 'boolean', 'null'] },
      },
      required: ['type'],
      ...CLOSED_OBJECT,
    },
    targetPath: { type: 'string', minLength: 1 },
  },
  required: ['source', 'targetPath'],
  ...CLOSED_OBJECT,
}

const eventActionSchema = {
  type: 'object',
  description:
    'Required by type: setScenario scenarioId; callApi apiOperationId; navigate destinationScreenId. clearScenario needs only type.',
  properties: {
    type: {
      type: 'string',
      enum: ['setScenario', 'clearScenario', 'callApi', 'navigate'],
    },
    scenarioId: { type: 'string', minLength: 1 },
    apiOperationId: { type: 'string', minLength: 1 },
    destinationScreenId: { type: 'string', minLength: 1 },
    routeParameters: behaviorParameterMapSchema,
    queryParameters: behaviorParameterMapSchema,
  },
  required: ['type'],
  ...CLOSED_OBJECT,
}

function compactText(value: string, maxLength = 80): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  const characters = Array.from(normalized)
  return characters.length <= maxLength
    ? normalized
    : `${characters.slice(0, maxLength - 1).join('')}…`
}

function compactOperationSummaries(changeSet: ChangeSet, offset: number): JsonObject[] {
  return presentChangeSetOperations(changeSet, 'en')
    .slice(offset, offset + 50)
    .map(operation => ({
    operationId: operation.operationId,
    source: operation.source,
    commandType: operation.commandType,
    action: operation.action,
    entityKind: operation.entityKind,
    targetLabel: operation.targetLabel,
    screenContext: operation.screenContext,
    changes: operation.changes.map(change => ({
      field: change.field,
      before: change.before.text,
      after: change.after.text,
    })),
    impact: operation.impact,
    navigation: operation.navigation,
    }))
}

function compactChangeSet(
  changeSet: ChangeSet | null,
  includeSummaries = false,
  offset = 0,
): JsonObject | null {
  if (!changeSet) return null
  const operationSummaries = includeSummaries
    ? compactOperationSummaries(changeSet, offset)
    : undefined
  return {
    id: changeSet.id,
    summary: compactText(changeSet.summary),
    baseRevision: changeSet.baseRevision,
    version: changeSet.version,
    operationCount: changeSet.operations.length,
    createdAt: changeSet.createdAt,
    ...(operationSummaries
      ? {
          operationSummaries,
          offset,
          operationsTruncated: offset + operationSummaries.length < changeSet.operations.length,
          nextOffset: offset + operationSummaries.length < changeSet.operations.length
            ? offset + operationSummaries.length
            : null,
        }
      : {}),
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function componentSummaryLabel(component: Pick<ResolvedRuntimeNode, 'kind' | 'config' | 'common'>): string {
  switch (component.config.kind) {
    case 'text':
      return compactText(component.config.text)
    case 'textInput':
    case 'select':
    case 'button':
    case 'link':
      return compactText(component.config.label)
    case 'image':
      return compactText(component.config.alt)
    case 'page':
    case 'modal':
      return component.kind
    case 'container':
    case 'collection':
      return compactText(component.common.description || component.kind)
  }
}

function outlineNodeId(node: ResolvedRuntimeNode): string {
  return node.canonicalTarget.type === 'inline'
    ? node.canonicalTarget.componentId
    : node.id
}

function activeScreenSummary(
  screenId: string,
  requestedIndex?: string,
  requestedOffset = 0,
): JsonObject {
  const state = useAppStore.getState()
  const document = state.effectiveDocument
  const screen = getOwnEntity(document.screens, screenId)
  if (!screen) throw new DomainError('NOT_FOUND', `Screen ${screenId} not found`)
  const byId = <T extends { id: string }>(left: T, right: T) =>
    compareCodeUnits(left.id, right.id)
  const resolved = resolveScreenNodes(document, screen.id, state.ui.activeStateId)
  const outlineLimit = 60
  const componentOutline = resolved.orderedNodes.map(node => {
    const parent = node.parentId ? resolved.nodesById[node.parentId] : undefined
    const rootOrder = node.id === screen.rootComponentId
      ? 0
      : screen.modalComponentIds.indexOf(node.screenComponentId) + 1
    return {
      id: outlineNodeId(node),
      kind: node.kind,
      label: componentSummaryLabel(node),
      parentId: parent ? outlineNodeId(parent) : null,
      order: parent ? parent.childIds.indexOf(node.id) : Math.max(0, rootOrder),
    }
  })
  const states = screen.scenarioIds.flatMap(id => {
    const scenario = getOwnEntity(document.screenScenarios, id)
    return scenario ? [{
      id: scenario.id,
      name: compactText(scenario.name),
      description: compactText(scenario.description),
      overrideCount: scenario.componentOverrides.length,
      active: scenario.id === state.ui.activeStateId,
    }] : []
  })
  const events = screen.eventIds.flatMap(id => {
    const event = getOwnEntity(document.events, id)
    return event ? [{
      id: event.id,
      name: compactText(event.name),
      triggerType: event.trigger.type,
      target: event.trigger.target,
      actionTypes: event.actions.map(action => action.type),
    }] : []
  })
  const apiOperations = Object.values(document.apiOperations)
    .filter(operation => operation.screenId === screenId)
    .sort(byId)
    .map(operation => ({
      id: operation.id,
      name: compactText(operation.name),
      method: operation.method,
      path: compactText(operation.path),
      bindingCount: operation.requestBindings.length,
      successStateId: operation.successScenarioId,
      errorStateId: operation.errorScenarioId,
    }))
  return {
    id: screen.id,
    name: compactText(screen.name),
    route: compactText(screen.route),
    rootComponentId: screen.rootComponentId,
    modalComponentIds: screen.modalComponentIds,
    componentOutline: componentOutline.slice(
      requestedIndex === 'components' ? requestedOffset : 0,
      (requestedIndex === 'components' ? requestedOffset : 0) + 60,
    ),
    states: states.slice(
      requestedIndex === 'states' ? requestedOffset : 0,
      (requestedIndex === 'states' ? requestedOffset : 0) + 30,
    ),
    events: events.slice(
      requestedIndex === 'events' ? requestedOffset : 0,
      (requestedIndex === 'events' ? requestedOffset : 0) + 30,
    ),
    apiOperations: apiOperations.slice(
      requestedIndex === 'apis' ? requestedOffset : 0,
      (requestedIndex === 'apis' ? requestedOffset : 0) + 30,
    ),
    counts: {
      components: resolved.orderedNodes.length,
      states: states.length,
      events: events.length,
      apiOperations: apiOperations.length,
    },
    truncated: {
      componentOutline:
        (requestedIndex === 'components' ? requestedOffset : 0) + outlineLimit <
        resolved.orderedNodes.length,
      states:
        (requestedIndex === 'states' ? requestedOffset : 0) + 30 < states.length,
      events:
        (requestedIndex === 'events' ? requestedOffset : 0) + 30 < events.length,
      apiOperations:
        (requestedIndex === 'apis' ? requestedOffset : 0) + 30 < apiOperations.length,
    },
    nextOffsets: {
      components:
        (requestedIndex === 'components' ? requestedOffset : 0) + outlineLimit <
        resolved.orderedNodes.length
          ? (requestedIndex === 'components' ? requestedOffset : 0) + outlineLimit
          : null,
      states:
        (requestedIndex === 'states' ? requestedOffset : 0) + 30 < states.length
          ? (requestedIndex === 'states' ? requestedOffset : 0) + 30
          : null,
      events:
        (requestedIndex === 'events' ? requestedOffset : 0) + 30 < events.length
          ? (requestedIndex === 'events' ? requestedOffset : 0) + 30
          : null,
      apis:
        (requestedIndex === 'apis' ? requestedOffset : 0) + 30 < apiOperations.length
          ? (requestedIndex === 'apis' ? requestedOffset : 0) + 30
          : null,
    },
  }
}

const getCurrentScreenContext: ToolDefinition = {
  name: 'get_current_screen_context',
  description:
    'Start here. Returns a bounded active-screen outline, canonical selection target, revision, ' +
    'state/event/API/Definition indexes, and proposal summary. Use get_component for component detail; ' +
    'include+detailId returns one state, event, API, or Definition.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      include: { type: 'string', enum: ['state', 'event', 'api', 'definition'] },
      detailId: { type: 'string', minLength: 1 },
      index: {
        type: 'string',
        enum: ['screens', 'definitions', 'components', 'states', 'events', 'apis'],
      },
      offset: { type: 'integer', minimum: 0 },
    },
    required: [],
    description:
      'For one full entity, provide include+detailId. For a truncated index, provide index+offset.',
    ...CLOSED_OBJECT,
  },
  execute(input) {
    return withFailure(() => {
      requireExactKeys(
        input,
        ['include', 'detailId', 'index', 'offset'],
        'get_current_screen_context input',
      )
      const state = useAppStore.getState()
      if (state.recoveryState) {
        return {
          recovery: {
            status: state.recoveryState.status,
            error: state.recoveryState.error,
          },
        }
      }
    const screen = state.ui.activeScreenId
      ? getOwnEntity(state.effectiveDocument.screens, state.ui.activeScreenId) ?? null
      : null
    const screens = state.effectiveDocument.project.screenIds.flatMap(id => {
      const current = getOwnEntity(state.effectiveDocument.screens, id)
      return current ? [{
        id: current.id,
        name: compactText(current.name),
        route: compactText(current.route),
      }] : []
    })
    const definitions = Object.values(state.effectiveDocument.componentDefinitions)
      .sort((left, right) => compareCodeUnits(left.id, right.id))
      .map(definition => ({
        id: definition.id,
        name: compactText(definition.name),
        description: compactText(definition.description),
        nodeCount: Object.keys(definition.nodes).length,
        publicPropCount: definition.publicProps.length,
        variantCount: definition.variants.length,
      }))
    const canonicalTarget = state.ui.selection
      ? selectionCanonicalTarget(state.effectiveDocument, state.ui.selection)
      : null
    const include = optionalString(input, 'include')
    const detailId = optionalString(input, 'detailId')
    if ((include === undefined) !== (detailId === undefined)) {
      throw new DomainError(
        'INVALID_ARGUMENT',
        'include and detailId must be provided together',
      )
    }
    const requestedIndex = optionalString(input, 'index')
    const requestedOffset = input.offset === undefined
      ? 0
      : requiredNonNegativeInteger(input, 'offset')
    if ((requestedIndex === undefined) !== (input.offset === undefined)) {
      throw new DomainError(
        'INVALID_ARGUMENT',
        'index and offset must be provided together',
      )
    }
    if (
      requestedIndex &&
      !['screens', 'definitions', 'components', 'states', 'events', 'apis']
        .includes(requestedIndex)
    ) {
      throw new DomainError('INVALID_ARGUMENT', `Unsupported index value: ${requestedIndex}`)
    }
    let detail: unknown
    if (include && detailId) {
      detail = include === 'state'
        ? getOwnEntity(state.effectiveDocument.screenScenarios, detailId)
        : include === 'event'
          ? getOwnEntity(state.effectiveDocument.events, detailId)
          : include === 'api'
            ? getOwnEntity(state.effectiveDocument.apiOperations, detailId)
            : include === 'definition'
              ? getOwnEntity(state.effectiveDocument.componentDefinitions, detailId)
              : undefined
      if (!['state', 'event', 'api', 'definition'].includes(include)) {
        throw new DomainError('INVALID_ARGUMENT', `Unsupported include value: ${include}`)
      }
      if (!detail) {
        throw new DomainError('NOT_FOUND', `${include} ${detailId} not found`)
      }
    }
      return {
      project: {
        id: state.effectiveDocument.project.id,
        name: compactText(state.effectiveDocument.project.name),
        screenCount: screens.length,
      },
      screens: screens.slice(
        requestedIndex === 'screens' ? requestedOffset : 0,
        (requestedIndex === 'screens' ? requestedOffset : 0) + 30,
      ),
      definitions: definitions.slice(
        requestedIndex === 'definitions' ? requestedOffset : 0,
        (requestedIndex === 'definitions' ? requestedOffset : 0) + 30,
      ),
      activeStateId: state.ui.activeStateId,
      selectedComponentId: selectedScreenComponentId(state.ui.selection),
      selection: state.ui.selection ? { ...state.ui.selection, canonicalTarget } : null,
      revision: state.revision,
      documentView: 'effective',
      activeChangeSet: compactChangeSet(state.activeChangeSet),
      rejectedChangeSets: {
        count: state.rejectedRecords.length,
        recent: state.rejectedRecords.slice(0, 5).map(record => ({
          changeSetId: record.changeSetId,
          summary: compactText(record.summary),
          baseRevision: record.baseRevision,
          rejectedAt: record.rejectedAt,
          operationCount: record.operationCount,
        })),
      },
      activeScreen: screen
        ? activeScreenSummary(screen.id, requestedIndex, requestedOffset)
        : null,
      truncated: {
        screens:
          (requestedIndex === 'screens' ? requestedOffset : 0) + 30 < screens.length,
        definitions:
          (requestedIndex === 'definitions' ? requestedOffset : 0) + 30 <
          definitions.length,
      },
      nextOffsets: {
        screens:
          (requestedIndex === 'screens' ? requestedOffset : 0) + 30 < screens.length
            ? (requestedIndex === 'screens' ? requestedOffset : 0) + 30
            : null,
        definitions:
          (requestedIndex === 'definitions' ? requestedOffset : 0) + 30 <
          definitions.length
            ? (requestedIndex === 'definitions' ? requestedOffset : 0) + 30
            : null,
      },
      page: requestedIndex ? { index: requestedIndex, offset: requestedOffset } : null,
      ...(detail ? { detail: { type: include, value: detail } } : {}),
      }
    })
  },
}

function componentHierarchy(screenId: string, target: ComponentTargetRef): JsonObject[] {
  const state = useAppStore.getState()
  const resolved = resolveScreenNodes(
    state.effectiveDocument,
    screenId,
    state.ui.activeStateId,
  )
  const selected = resolved.orderedNodes.find(node =>
    componentTargetRefEquals(node.canonicalTarget, target))
  if (!selected) return []
  const hierarchy: ResolvedRuntimeNode[] = []
  const visited = new Set<string>()
  let current: ResolvedRuntimeNode | undefined = selected
  while (current && !visited.has(current.id)) {
    hierarchy.push(current)
    visited.add(current.id)
    current = current.parentId ? resolved.nodesById[current.parentId] : undefined
  }
  return hierarchy.reverse().map(node => {
    const parent = node.parentId ? resolved.nodesById[node.parentId] : undefined
    return {
      id: outlineNodeId(node),
      kind: node.kind,
      label: componentSummaryLabel(node),
      parentId: parent ? outlineNodeId(parent) : null,
      order: parent ? parent.childIds.indexOf(node.id) : 0,
      canonicalTarget: node.canonicalTarget,
    }
  })
}

function relatedBehavior(target: ComponentTargetRef): JsonObject {
  const state = useAppStore.getState()
  const activeState = state.ui.activeStateId
    ? getOwnEntity(state.effectiveDocument.screenScenarios, state.ui.activeStateId)
    : undefined
  const events = Object.values(state.effectiveDocument.events).filter(event =>
    componentTargetRefEquals(event.trigger.target, target))
  return {
    stateOverride: activeState
      ? findScenarioOverride(activeState, target)?.override ?? null
      : null,
    events,
    apiOperations: Object.values(state.effectiveDocument.apiOperations).filter(operation =>
      operation.requestBindings.some(binding =>
        isComponentTargetRef(binding.source) &&
        componentTargetRefEquals(binding.source, target)) ||
      events.some(event =>
        event.actions.some(action =>
          action.type === 'callApi' &&
          action.apiOperationId === operation.id) &&
        operation.requestBindings.some(binding => binding.source.type === 'item')),
    ),
  }
}

const getComponent: ToolDefinition = {
  name: 'get_component',
  description:
    'After get_current_screen_context, read one effective component spec, canonical target, hierarchy/' +
    'order, state override, events, and API bindings. Pass target for Shared/Collection nodes.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      componentId: {
        type: 'string',
        minLength: 1,
        description: 'Component to inspect; omit to use the currently selected component.',
      },
      target: componentTargetSchema,
    },
    required: [],
    ...CLOSED_OBJECT,
  },
  execute(input) {
    return withFailure(() => {
      requireExactKeys(input, ['componentId', 'target'], 'get_component input')
      const state = useAppStore.getState()
      if (state.recoveryState) {
        throw new DomainError('RECOVERY_REQUIRED', 'Persisted data recovery is required')
      }
      const componentId = optionalString(input, 'componentId') ??
        selectedScreenComponentId(state.ui.selection)
      const explicitTarget = input.target === undefined
        ? null
        : componentTargetFromInput(input.target, 'target')
      if (explicitTarget && input.componentId !== undefined) {
        throw new DomainError(
          'INVALID_ARGUMENT',
          'Provide either componentId or target, not both',
        )
      }
      const selectedTarget = explicitTarget ?? (
        input.componentId === undefined && state.ui.selection
          ? selectionCanonicalTarget(state.effectiveDocument, state.ui.selection)
          : null
      )
      if (selectedTarget) {
        const screenId = state.ui.activeScreenId
        if (!screenId) throw new DomainError('NOT_FOUND', 'No active screen')
        const activeState = state.ui.activeStateId
          ? getOwnEntity(state.effectiveDocument.screenScenarios, state.ui.activeStateId)
          : undefined
        return {
          component: resolveComponentTarget(
            state.effectiveDocument,
            screenId,
            selectedTarget,
            activeState?.id ?? null,
          ),
          canonicalTarget: selectedTarget,
          hierarchy: componentHierarchy(screenId, selectedTarget),
          relevantBehavior: relatedBehavior(selectedTarget),
        }
      }
      if (!componentId) throw new DomainError('NOT_FOUND', 'No component ID or current selection')
      const baseComponent = getOwnEntity(state.effectiveDocument.components, componentId)
      if (!baseComponent) throw new DomainError('NOT_FOUND', `Component ${componentId} not found`)
      const activeState = state.ui.activeStateId
        ? getOwnEntity(state.effectiveDocument.screenScenarios, state.ui.activeStateId)
        : undefined
      const component = effectiveComponent(state.effectiveDocument, baseComponent, activeState)
      const canonicalTarget = baseComponent.nodeType === 'definitionInstance'
        ? selectionCanonicalTarget(state.effectiveDocument, {
            type: 'screenDefinitionInstance',
            screenId: baseComponent.screenId,
            componentId,
          })
        : inlineTargetRef(componentId)
      if (!canonicalTarget) {
        throw new DomainError('INVALID_REFERENCE', `Component ${componentId} has no runtime target`)
      }
      return {
        component,
        canonicalTarget,
        hierarchy: componentHierarchy(baseComponent.screenId, canonicalTarget),
        relevantBehavior: relatedBehavior(canonicalTarget),
      }
    })
  },
}

const getPendingChangeSet: ToolDefinition = {
  name: 'get_pending_change_set',
  description:
    'After get_current_screen_context writes, review bounded operation summaries and compact diffs. ' +
    'Use offset when nextOffset is returned. No commands, full values, or snapshots are echoed. ' +
    'Only a human can Accept or Reject.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: { offset: { type: 'integer', minimum: 0 } },
    required: [],
    ...CLOSED_OBJECT,
  },
  execute(input) {
    return withFailure(() => {
      requireExactKeys(input, ['offset'], 'get_pending_change_set input')
      const offset = input.offset === undefined
        ? 0
        : requiredNonNegativeInteger(input, 'offset')
      const state = useAppStore.getState()
      if (state.recoveryState) {
        return {
          recovery: {
            status: state.recoveryState.status,
            error: state.recoveryState.error,
          },
        }
      }
      return {
        activeChangeSet: compactChangeSet(state.activeChangeSet, true, offset),
        confirmedRevision: state.revision,
        rejectedChangeSets: {
          count: state.rejectedRecords.length,
          recent: state.rejectedRecords.slice(0, 5).map(record => ({
            changeSetId: record.changeSetId,
            summary: record.summary,
            rejectedAt: record.rejectedAt,
            operationCount: record.operationCount,
          })),
        },
      }
    })
  },
}

const beginChangeSet: ToolDefinition = {
  name: 'begin_change_set',
  description:
    'Begin one agent proposal after reading current context. Returns the ID, confirmed revision, ' +
    'and version required by every write. Fails while another proposal is active. ' + AGENT_WORKFLOW,
  inputSchema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        minLength: 1,
        description: 'Concise human-readable intent shown in the review bar.',
      },
    },
    required: ['summary'],
    ...CLOSED_OBJECT,
  },
  execute(input) {
    return withWriteFailure(() => {
      requireExactKeys(input, ['summary'], 'begin_change_set input')
      const changeSet = useAppStore.getState().beginChangeSet(requiredString(input, 'summary'))
      return {
        changeSetId: changeSet.id,
        baseRevision: changeSet.baseRevision,
        changeSetVersion: changeSet.version,
      }
    })
  },
}

const changeScreenStructure: ToolDefinition = {
  name: 'change_screen_structure',
  description:
    'Add, update, or remove a screen. Required: add name+route; update/remove screenId. ' +
    AGENT_WORKFLOW,
  inputSchema: writeOperationSchema(
    ['add', 'update', 'remove'],
    {
      screenId: { type: 'string', minLength: 1 },
      name: { type: 'string' },
      route: { type: 'string' },
    },
    'Required by operation: add name+route; update/remove screenId.',
  ),
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
      let command: DomainCommand
      let resultData: JsonObject = {}
      if (operation === 'add') {
        requireExactKeys(
          input,
          [...Object.keys(writeBaseProperties), 'operation', 'name', 'route'],
          'change_screen_structure add input',
        )
        const screenId = nanoid()
        const rootComponentId = nanoid()
        command = {
          type: 'addScreen',
          screenId,
          rootComponentId,
          name: requiredString(input, 'name'),
          route: requiredString(input, 'route'),
        }
        resultData = {
          createdScreenId: screenId,
          createdRootComponentId: rootComponentId,
        }
      } else if (operation === 'update') {
        requireExactKeys(
          input,
          [...Object.keys(writeBaseProperties), 'operation', 'screenId', 'name', 'route'],
          'change_screen_structure update input',
        )
        command = {
          type: 'updateScreen',
          screenId: requiredString(input, 'screenId'),
          name: optionalString(input, 'name'),
          route: optionalString(input, 'route'),
        }
      } else if (operation === 'remove') {
        requireExactKeys(
          input,
          [...Object.keys(writeBaseProperties), 'operation', 'screenId'],
          'change_screen_structure remove input',
        )
        command = {
          type: 'removeScreen',
          screenId: requiredString(input, 'screenId'),
        }
      } else {
        throw new DomainError('INVALID_REFERENCE', `Unsupported screen operation: ${operation}`)
      }
      return appendCommand(input, command, resultData)
    })
  },
}

const changeComponentStructure: ToolDefinition = {
  name: 'change_component_structure',
  description:
    'Add, move, duplicate, or remove components. Add requires screenId,parentId,kind,placement,' +
    'sizing,config (modal parentId=null); move requires componentId+newParentId. ' + AGENT_WORKFLOW,
  inputSchema: writeOperationSchema(
    ['add', 'move', 'duplicate', 'remove'],
    {
      screenId: { type: 'string', minLength: 1 },
      parentId: { type: ['string', 'null'] },
      componentId: { type: 'string', minLength: 1 },
      newParentId: { type: 'string', minLength: 1 },
      kind: { type: 'string', enum: PALETTE_COMPONENT_KINDS },
      placement: componentPlacementSchema,
      sizing: componentSizingSchema,
      config: componentConfigSchema,
      position: { type: 'integer', minimum: 0 },
    },
    'Required by operation: add screenId,parentId,kind,placement,sizing,config; move componentId,newParentId; duplicate/remove componentId.',
  ),
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
      let command: DomainCommand
      let resultData: JsonObject = {}
      if (operation === 'add') {
        requireExactKeys(input, [
          'changeSetId',
          'expectedRevision',
          'expectedChangeSetVersion',
          'operation',
          'screenId',
          'parentId',
          'kind',
          'placement',
          'sizing',
          'config',
          'position',
        ], 'change_component_structure add input')
        const config = requiredRecord(input, 'config') as ComponentConfig
        const sizing = requiredRecord(input, 'sizing')
        const kind = requiredString(input, 'kind') as ComponentKind
        const placement = requiredRecord(input, 'placement')
        validateComponentConfig(config, kind, 'config')
        validateComponentPlacement(placement, 'placement')
        validateComponentSizing(sizing, 'sizing')
        const componentId = nanoid()
        command = {
          type: 'addComponent',
          componentId,
          screenId: requiredString(input, 'screenId'),
          parentId: requiredNullableString(input, 'parentId'),
          kind,
          placement,
          sizing,
          config,
          position: typeof input.position === 'number' ? input.position : undefined,
        }
        resultData = { createdComponentId: componentId }
      } else if (operation === 'move') {
        requireExactKeys(input, [
          'changeSetId',
          'expectedRevision',
          'expectedChangeSetVersion',
          'operation',
          'componentId',
          'newParentId',
          'position',
        ], 'change_component_structure move input')
        command = {
          type: 'moveComponent',
          componentId: requiredString(input, 'componentId'),
          newParentId: requiredString(input, 'newParentId'),
          position: typeof input.position === 'number' ? input.position : undefined,
        }
      } else if (operation === 'duplicate') {
        requireExactKeys(input, [
          'changeSetId',
          'expectedRevision',
          'expectedChangeSetVersion',
          'operation',
          'componentId',
        ], 'change_component_structure duplicate input')
        const componentId = requiredString(input, 'componentId')
        const duplicateCommand = createDuplicateComponentCommand(
          useAppStore.getState().effectiveDocument,
          componentId,
          nanoid,
        )
        if (!duplicateCommand) {
          throw new DomainError('INVALID_PARENT', 'Independent screen roots cannot be duplicated')
        }
        command = duplicateCommand
        const createdComponentId = duplicateCommand.componentIdMap[componentId]
        if (!createdComponentId) {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            `Duplicate command omitted the generated root ID for ${componentId}`,
          )
        }
        resultData = { createdComponentId }
      } else if (operation === 'remove') {
        requireExactKeys(input, [
          'changeSetId',
          'expectedRevision',
          'expectedChangeSetVersion',
          'operation',
          'componentId',
        ], 'change_component_structure remove input')
        command = { type: 'removeComponent', componentId: requiredString(input, 'componentId') }
      } else {
        throw new DomainError('INVALID_REFERENCE', `Unsupported component operation: ${operation}`)
      }
      return appendCommand(input, command, resultData)
    })
  },
}

const updateComponentSpec: ToolDefinition = {
  name: 'update_component_spec',
  description:
    'Patch component common/config/placement/sizing fields. Partial sizing merges with current ' +
    'sizing; incompatible kind fields and unknown keys are rejected. ' + AGENT_WORKFLOW,
  inputSchema: {
    type: 'object',
    properties: {
      ...writeBaseProperties,
      componentId: { type: 'string', minLength: 1 },
      patch: {
        type: 'object',
        properties: {
          common: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              visible: { type: 'boolean' },
              enabled: { type: 'boolean' },
            },
            ...CLOSED_OBJECT,
          },
          config: componentConfigPatchSchema,
          placement: componentPlacementSchema,
          sizing: componentSizingPatchSchema,
        },
        minProperties: 1,
        ...CLOSED_OBJECT,
      },
    },
    required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'componentId', 'patch'],
    ...CLOSED_OBJECT,
  },
  execute(input) {
    return withWriteFailure(() => {
      requireExactKeys(input, [
        'changeSetId',
        'expectedRevision',
        'expectedChangeSetVersion',
        'componentId',
        'patch',
      ], 'update_component_spec input')
      const patchInput = requiredRecord(input, 'patch')
      requireExactKeys(patchInput, ['common', 'config', 'placement', 'sizing'], 'update_component_spec patch')
      requireNonEmptyObject(patchInput, 'update_component_spec patch')
      const componentId = requiredString(input, 'componentId')
      const current = getOwnEntity(
        useAppStore.getState().effectiveDocument.components,
        componentId,
      )
      if (!current) throw new DomainError('NOT_FOUND', `Component ${componentId} not found`)
      if (current.nodeType !== 'inline') {
        throw new DomainError(
          'INVALID_ARGUMENT',
          'Definition Instances must be updated with manage_definition_instance',
        )
      }
      const patch: {
        common?: Partial<CommonComponentSpec>
        config?: Partial<ComponentConfig>
        placement?: ComponentPlacement
        sizing?: ComponentSizing
      } = {}
      if (patchInput.common !== undefined) {
        if (!isRecord(patchInput.common)) {
          throw new DomainError('INVARIANT_VIOLATION', 'patch.common must be an object')
        }
        requireNonEmptyObject(patchInput.common, 'patch.common')
        validateCommonComponentSpec(
          { ...current.common, ...patchInput.common },
          'patch.common',
        )
        patch.common = patchInput.common
      }
      if (patchInput.config !== undefined) {
        if (!isRecord(patchInput.config)) {
          throw new DomainError('INVARIANT_VIOLATION', 'patch.config must be an object')
        }
        requireNonEmptyObject(patchInput.config, 'patch.config')
        validateComponentConfig(
          { ...current.config, ...patchInput.config },
          current.kind,
          'patch.config',
        )
        patch.config = patchInput.config
      }
      if (patchInput.placement !== undefined) {
        if (!isRecord(patchInput.placement)) {
          throw new DomainError('INVARIANT_VIOLATION', 'patch.placement must be an object')
        }
        validateComponentPlacement(patchInput.placement, 'patch.placement')
        patch.placement = patchInput.placement as ComponentPlacement
      }
      if (patchInput.sizing !== undefined) {
        if (!isRecord(patchInput.sizing)) {
          throw new DomainError('INVARIANT_VIOLATION', 'patch.sizing must be an object')
        }
        const sizing = { ...current.sizing, ...patchInput.sizing }
        validateComponentSizing(sizing, 'patch.sizing')
        patch.sizing = sizing
      }
      return appendCommand(input, {
        type: 'updateComponentSpec',
        componentId,
        patch,
      })
    })
  },
}

const upsertScreenState: ToolDefinition = {
  name: 'upsert_screen_state',
  description:
    'Create, update, or remove a screen state. Required: create screenId+name; update/remove stateId. ' +
    AGENT_WORKFLOW,
  inputSchema: writeOperationSchema(
    ['create', 'update', 'remove'],
    {
      screenId: { type: 'string', minLength: 1 },
      stateId: { type: 'string', minLength: 1 },
      name: { type: 'string' },
      description: { type: 'string' },
      overrides: componentOverridesSchema,
    },
    'Required by operation: create screenId+name; update/remove stateId.',
  ),
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
      let command: DomainCommand
      let resultData: JsonObject = {}
      if (operation === 'create') {
        requireExactKeys(
          input,
          [
            ...Object.keys(writeBaseProperties),
            'operation',
            'screenId',
            'name',
            'description',
            'overrides',
          ],
          'upsert_screen_state create input',
        )
        const stateId = nanoid()
        command = {
          type: 'createScreenState',
          stateId,
          screenId: requiredString(input, 'screenId'),
          name: requiredString(input, 'name'),
          description: optionalString(input, 'description'),
          overrides: scenarioOverridesFromInput(input.overrides),
        }
        resultData = { stateId }
      } else if (operation === 'update') {
        requireExactKeys(
          input,
          [
            ...Object.keys(writeBaseProperties),
            'operation',
            'stateId',
            'name',
            'description',
            'overrides',
          ],
          'upsert_screen_state update input',
        )
        command = {
          type: 'updateScreenState',
          stateId: requiredString(input, 'stateId'),
          name: optionalString(input, 'name'),
          description: optionalString(input, 'description'),
          overrides: scenarioOverridesFromInput(input.overrides),
        }
        resultData = { stateId: command.stateId }
      } else if (operation === 'remove') {
        requireExactKeys(
          input,
          [...Object.keys(writeBaseProperties), 'operation', 'stateId'],
          'upsert_screen_state remove input',
        )
        command = { type: 'removeScreenState', stateId: requiredString(input, 'stateId') }
      } else {
        throw new DomainError('INVALID_REFERENCE', `Unsupported state operation: ${operation}`)
      }
      return appendCommand(input, command, resultData)
    })
  },
}

const connectBehavior: ToolDefinition = {
  name: 'connect_behavior',
  description:
    'Create, update, or remove events/APIs without changing IDs. Event writes require name,trigger,' +
    'actions plus screenId or eventId; API writes require name,method,path plus screenId or operationId. ' +
    AGENT_WORKFLOW,
  inputSchema: writeOperationSchema(
    ['connectEvent', 'updateEvent', 'removeEvent', 'bindApi', 'updateApi', 'removeApi'],
    {
      screenId: { type: 'string', minLength: 1 },
      eventId: { type: 'string', minLength: 1 },
      operationId: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      trigger: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['click', 'submit'] },
          target: componentTargetSchema,
        },
        required: ['type', 'target'],
        ...CLOSED_OBJECT,
      },
      actions: { type: 'array', items: eventActionSchema },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      path: { type: 'string', minLength: 1 },
      requestBindings: { type: 'array', items: fieldBindingSchema },
      successStateId: { type: ['string', 'null'] },
      errorStateId: { type: ['string', 'null'] },
    },
    'Required: connectEvent screenId+name+trigger+actions; updateEvent eventId+name+trigger+actions; removeEvent eventId; bindApi screenId+name+method+path; updateApi operationId+name+method+path+requestBindings+successStateId+errorStateId; removeApi operationId.',
  ),
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
      let command: DomainCommand
      let resultData: JsonObject = {}
      if (operation === 'connectEvent') {
        requireExactKeys(
          input,
          [
            ...Object.keys(writeBaseProperties),
            'operation',
            'screenId',
            'name',
            'trigger',
            'actions',
          ],
          'connect_behavior connectEvent input',
        )
        const trigger = triggerFromInput(input)
        if (!Array.isArray(input.actions)) {
          throw new DomainError('INVALID_REFERENCE', 'actions must be an array')
        }
        input.actions.forEach((action, index) =>
          validateEventAction(action, `actions[${index}]`),
        )
        const eventId = nanoid()
        command = {
          type: 'connectEvent',
          eventId,
          screenId: requiredString(input, 'screenId'),
          name: requiredString(input, 'name'),
          trigger,
          actions: input.actions as EventAction[],
        }
        resultData = { eventId }
      } else if (operation === 'updateEvent') {
        requireExactKeys(
          input,
          [
            ...Object.keys(writeBaseProperties),
            'operation',
            'eventId',
            'name',
            'trigger',
            'actions',
          ],
          'connect_behavior updateEvent input',
        )
        const trigger = triggerFromInput(input)
        if (!Array.isArray(input.actions)) {
          throw new DomainError('INVALID_REFERENCE', 'actions must be an array')
        }
        input.actions.forEach((action, index) =>
          validateEventAction(action, `actions[${index}]`),
        )
        command = {
          type: 'updateEvent',
          eventId: requiredString(input, 'eventId'),
          name: requiredString(input, 'name'),
          trigger,
          actions: input.actions as EventAction[],
        }
        resultData = { eventId: command.eventId }
      } else if (operation === 'removeEvent') {
        requireExactKeys(
          input,
          [...Object.keys(writeBaseProperties), 'operation', 'eventId'],
          'connect_behavior removeEvent input',
        )
        command = { type: 'removeEvent', eventId: requiredString(input, 'eventId') }
      } else if (operation === 'bindApi') {
        requireExactKeys(
          input,
          [
            ...Object.keys(writeBaseProperties),
            'operation',
            'screenId',
            'name',
            'method',
            'path',
            'requestBindings',
            'successStateId',
            'errorStateId',
          ],
          'connect_behavior bindApi input',
        )
        if (input.requestBindings !== undefined && !Array.isArray(input.requestBindings)) {
          throw new DomainError('INVALID_REFERENCE', 'requestBindings must be an array')
        }
        const apiId = nanoid()
        command = {
          type: 'bindApiOperation',
          operationId: apiId,
          screenId: requiredString(input, 'screenId'),
          name: requiredString(input, 'name'),
          method: requiredString(input, 'method') as HttpMethod,
          path: requiredString(input, 'path'),
          requestBindings: input.requestBindings === undefined ? [] : fieldBindingsFromInput(input.requestBindings),
          successScenarioId: optionalString(input, 'successStateId'),
          errorScenarioId: optionalString(input, 'errorStateId'),
        }
        resultData = { apiId }
      } else if (operation === 'updateApi') {
        requireExactKeys(
          input,
          [
            ...Object.keys(writeBaseProperties),
            'operation',
            'operationId',
            'name',
            'method',
            'path',
            'requestBindings',
            'successStateId',
            'errorStateId',
          ],
          'connect_behavior updateApi input',
        )
        if (!Array.isArray(input.requestBindings)) {
          throw new DomainError('INVALID_REFERENCE', 'requestBindings must be an array')
        }
        command = {
          type: 'updateApiOperation',
          operationId: requiredString(input, 'operationId'),
          name: requiredString(input, 'name'),
          method: requiredString(input, 'method') as HttpMethod,
          path: requiredString(input, 'path'),
          requestBindings: fieldBindingsFromInput(input.requestBindings),
          successScenarioId: requiredNullableString(input, 'successStateId'),
          errorScenarioId: requiredNullableString(input, 'errorStateId'),
        }
        resultData = { apiId: command.operationId }
      } else if (operation === 'removeApi') {
        requireExactKeys(
          input,
          [...Object.keys(writeBaseProperties), 'operation', 'operationId'],
          'connect_behavior removeApi input',
        )
        command = { type: 'removeApiOperation', operationId: requiredString(input, 'operationId') }
      } else {
        throw new DomainError('INVALID_REFERENCE', `Unsupported behavior operation: ${operation}`)
      }
      return appendCommand(input, command, resultData)
    })
  },
}

const manageComponentDefinition: ToolDefinition = {
  name: 'manage_component_definition',
  description:
    'Manage shared Definitions. create needs name; all other operations need definitionId. ' +
    'updateNode needs nodePath+patch; publishStringProp needs key+name+nodePath+field; addVariant ' +
    'needs name+propertyKey+propertyValue. ' + AGENT_WORKFLOW,
  inputSchema: writeOperationSchema(
    ['create', 'updateMeta', 'duplicate', 'remove', 'updateNode', 'publishStringProp', 'addVariant'],
    {
      definitionId: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      description: { type: 'string' },
      nodePath: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', minLength: 1 },
      },
      patch: {
        type: 'object',
        properties: {
          common: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              visible: { type: 'boolean' },
              enabled: { type: 'boolean' },
            },
            minProperties: 1,
            ...CLOSED_OBJECT,
          },
          config: componentConfigPatchSchema,
          placement: componentPlacementSchema,
          sizing: componentSizingSchema,
        },
        minProperties: 1,
        ...CLOSED_OBJECT,
      },
      key: { type: 'string', minLength: 1 },
      field: publicPropFieldSchema,
      propertyKey: { type: 'string', minLength: 1 },
      propertyValue: { type: 'string', minLength: 1 },
      defaultPropertyValue: { type: 'string', minLength: 1 },
    },
    'Required: create name; updateMeta/duplicate/remove definitionId; updateNode definitionId+nodePath+patch; publishStringProp definitionId+key+name+nodePath+field; addVariant definitionId+name+propertyKey+propertyValue.',
  ),
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
      const baseKeys = [...Object.keys(writeBaseProperties), 'operation']
      const allowedKeys: Record<string, string[]> = {
        create: [...baseKeys, 'name', 'description'],
        updateMeta: [...baseKeys, 'definitionId', 'name', 'description'],
        duplicate: [...baseKeys, 'definitionId', 'name'],
        remove: [...baseKeys, 'definitionId'],
        updateNode: [...baseKeys, 'definitionId', 'nodePath', 'patch'],
        publishStringProp: [
          ...baseKeys,
          'definitionId',
          'key',
          'name',
          'description',
          'nodePath',
          'field',
        ],
        addVariant: [
          ...baseKeys,
          'definitionId',
          'name',
          'propertyKey',
          'propertyValue',
          'defaultPropertyValue',
        ],
      }
      const operationKeys = allowedKeys[operation]
      if (!operationKeys) {
        throw new DomainError('INVALID_REFERENCE', `Unsupported Definition operation: ${operation}`)
      }
      requireExactKeys(input, operationKeys, `manage_component_definition ${operation} input`)
      const document = useAppStore.getState().effectiveDocument
      if (operation === 'create') {
        const definition = createEmptyComponentDefinition(
          `definition-${nanoid()}`,
          `node-${nanoid()}`,
          requiredString(input, 'name'),
        )
        definition.description = optionalString(input, 'description') ?? ''
        return appendCommand(input, {
          type: 'putComponentDefinition',
          mode: 'create',
          definition,
        }, {
          createdDefinitionId: definition.id,
          createdNodeId: definition.rootNodeId,
        })
      }
      const definitionId = requiredString(input, 'definitionId')
      const current = getOwnEntity(document.componentDefinitions, definitionId)
      if (!current) throw new DomainError('NOT_FOUND', `Definition ${definitionId} not found`)
      if (operation === 'remove') {
        return appendCommand(input, { type: 'removeComponentDefinition', definitionId })
      }
      if (operation === 'duplicate') {
        const duplicate = duplicateComponentDefinition(
          current,
          `definition-${nanoid()}`,
          optionalString(input, 'name') ?? `${current.name} copy`,
          nanoid,
        )
        return appendCommand(input, {
          type: 'putComponentDefinition',
          mode: 'create',
          definition: duplicate,
        }, {
          createdDefinitionId: duplicate.id,
          createdNodeId: duplicate.rootNodeId,
        })
      }
      const definition = cloneComponentDefinition(current)
      let resultData: JsonObject = { definitionId }
      if (operation === 'updateMeta') {
        definition.name = optionalString(input, 'name') ?? definition.name
        definition.description = optionalString(input, 'description') ?? definition.description
      } else if (operation === 'updateNode') {
        if (
          !Array.isArray(input.nodePath) ||
          input.nodePath.length === 0 ||
          !input.nodePath.every(segment => typeof segment === 'string' && segment.length > 0)
        ) {
          throw new DomainError('INVALID_REFERENCE', 'nodePath must be a non-empty string array')
        }
        const nodePath = [...input.nodePath] as [string, ...string[]]
        const patch = requiredRecord(input, 'patch')
        requireExactKeys(
          patch,
          ['common', 'config', 'placement', 'sizing'],
          'manage_component_definition updateNode patch',
        )
        if (Object.keys(patch).length === 0) {
          throw new DomainError('INVALID_ARGUMENT', 'updateNode patch must not be empty')
        }
        const node = resolveOwnedDefinitionInlineNodeAtPath(definition, nodePath)
        if (patch.common !== undefined) {
          if (!isRecord(patch.common)) {
            throw new DomainError('INVALID_ARGUMENT', 'patch.common must be an object')
          }
          requireNonEmptyObject(patch.common, 'patch.common')
          validateCommonComponentSpec(
            { ...node.common, ...patch.common },
            'patch.common',
          )
          node.common = { ...node.common, ...patch.common } as CommonComponentSpec
        }
        if (patch.config !== undefined) {
          if (!isRecord(patch.config)) {
            throw new DomainError('INVALID_ARGUMENT', 'patch.config must be an object')
          }
          requireNonEmptyObject(patch.config, 'patch.config')
          validateDefinitionComponentConfig(
            { ...node.config, ...patch.config },
            node.kind,
            'patch.config',
          )
          node.config = { ...node.config, ...patch.config } as DefinitionComponentConfig
        }
        if (patch.placement !== undefined) {
          if (!isRecord(patch.placement)) {
            throw new DomainError('INVALID_ARGUMENT', 'patch.placement must be an object')
          }
          validateComponentPlacement(patch.placement, 'patch.placement')
          node.placement = patch.placement as ComponentPlacement
        }
        if (patch.sizing !== undefined) {
          if (!isRecord(patch.sizing)) {
            throw new DomainError('INVALID_ARGUMENT', 'patch.sizing must be an object')
          }
          validateComponentSizing(patch.sizing, 'patch.sizing')
          node.sizing = patch.sizing
        }
        resultData = { definitionId, nodePath }
      } else if (operation === 'publishStringProp') {
        if (!Array.isArray(input.nodePath) || input.nodePath.length === 0) {
          throw new DomainError('INVALID_REFERENCE', 'nodePath must be a non-empty array')
        }
        definition.publicProps.push({
          key: requiredString(input, 'key'),
          name: requiredString(input, 'name'),
          description: optionalString(input, 'description') ?? '',
          type: 'string',
          bindings: [{
            nodePath: input.nodePath as [string, ...string[]],
            field: requiredString(input, 'field') as PublicPropFieldV3,
          }],
        })
      } else if (operation === 'addVariant') {
        const propertyKey = requiredString(input, 'propertyKey')
        const propertyValue = requiredString(input, 'propertyValue')
        let property = definition.variantProperties.find(item => item.key === propertyKey)
        if (!property) {
          const defaultPropertyValue = optionalString(input, 'defaultPropertyValue')
          if (
            definition.variants.length > 0 &&
            (!defaultPropertyValue || defaultPropertyValue === propertyValue)
          ) {
            throw new DomainError(
              'INVALID_ARGUMENT',
              'defaultPropertyValue must be provided and differ from propertyValue when adding a property to existing variants',
            )
          }
          property = {
            key: propertyKey,
            name: propertyKey,
            description: '',
            values: defaultPropertyValue ? [defaultPropertyValue] : [],
          }
          definition.variantProperties.push(property)
          if (defaultPropertyValue) {
            definition.variants.forEach(variant => {
              variant.propertyValues[propertyKey] = defaultPropertyValue
            })
          }
        }
        if (!property.values.includes(propertyValue)) property.values.push(propertyValue)
        const propertyValues = Object.fromEntries(
          definition.variantProperties.map(item => [
            item.key,
            item.key === propertyKey ? propertyValue : item.values[0]!,
          ]),
        )
        const variantId = `variant-${nanoid()}`
        definition.variants.push({
          id: variantId,
          name: requiredString(input, 'name'),
          propertyValues,
          nodeOverrides: {},
        })
        definition.representativeVariantId ??= variantId
        resultData = { definitionId, createdVariantId: variantId }
      } else {
        throw new DomainError('INVALID_REFERENCE', `Unsupported Definition operation: ${operation}`)
      }
      return appendCommand(input, {
        type: 'putComponentDefinition',
        mode: 'update',
        definition,
      }, resultData)
    })
  },
}

const manageDefinitionInstance: ToolDefinition = {
  name: 'manage_definition_instance',
  description:
    'Manage Definition Instances. add requires screenId+parentId+definitionId; update/detach require ' +
    'componentId; extract requires componentId+name. Optional props are typed scalars. ' +
    AGENT_WORKFLOW,
  inputSchema: writeOperationSchema(
    ['add', 'update', 'extract', 'detach'],
    {
      screenId: { type: 'string', minLength: 1 },
      parentId: { type: 'string', minLength: 1 },
      definitionId: { type: 'string', minLength: 1 },
      componentId: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      position: { type: 'integer', minimum: 0 },
      variantId: { type: ['string', 'null'] },
      props: {
        type: 'object',
        additionalProperties: { type: ['string', 'number', 'boolean'] },
      },
      placement: componentPlacementSchema,
      sizing: componentSizingSchema,
    },
    'Required by operation: add screenId+parentId+definitionId; update/detach componentId; extract componentId+name.',
  ),
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
      const baseKeys = [...Object.keys(writeBaseProperties), 'operation']
      const allowedKeys: Record<string, string[]> = {
        add: [
          ...baseKeys,
          'screenId',
          'parentId',
          'definitionId',
          'position',
          'variantId',
          'props',
          'placement',
          'sizing',
        ],
        update: [
          ...baseKeys,
          'componentId',
          'variantId',
          'props',
          'placement',
          'sizing',
        ],
        extract: [...baseKeys, 'componentId', 'name'],
        detach: [...baseKeys, 'componentId'],
      }
      const operationKeys = allowedKeys[operation]
      if (!operationKeys) {
        throw new DomainError('INVALID_REFERENCE', `Unsupported Instance operation: ${operation}`)
      }
      requireExactKeys(input, operationKeys, `manage_definition_instance ${operation} input`)
      const document = useAppStore.getState().effectiveDocument
      if (operation === 'extract') {
        const command = createExtractDefinitionCommand(
          document,
          requiredString(input, 'componentId'),
          `definition-${nanoid()}`,
          `instance-${nanoid()}`,
          requiredString(input, 'name'),
          nanoid,
        )
        return appendCommand(input, command, {
          createdDefinitionId: command.definition.id,
          createdInstanceId: command.replacementInstanceId,
        })
      }
      if (operation === 'detach') {
        const command = createDetachDefinitionInstanceCommand(
          document,
          requiredString(input, 'componentId'),
          nanoid,
        )
        return appendCommand(input, command, {
          createdComponentIds: command.generatedComponents.map(entry => entry.componentId),
        })
      }
      if (operation === 'add') {
        const props = input.props === undefined ? {} : requiredRecord(input, 'props')
        for (const [key, value] of Object.entries(props)) {
          if (
            !key ||
            (typeof value !== 'string' &&
              typeof value !== 'number' &&
              typeof value !== 'boolean')
          ) {
            throw new DomainError(
              'INVALID_ARGUMENT',
              `props.${key || '<empty>'} must be a string, number, or boolean`,
            )
          }
        }
        const sizing = input.sizing === undefined
          ? DEFAULT_COMPONENT_SIZING
          : requiredRecord(input, 'sizing')
        validateComponentSizing(sizing, 'sizing')
        const placement = input.placement === undefined
          ? DEFAULT_COMPONENT_PLACEMENT
          : requiredRecord(input, 'placement')
        validateComponentPlacement(placement, 'placement')
        const componentId = `instance-${nanoid()}`
        return appendCommand(input, {
          type: 'addDefinitionInstance',
          componentId,
          screenId: requiredString(input, 'screenId'),
          parentId: requiredString(input, 'parentId'),
          position: typeof input.position === 'number' ? input.position : undefined,
          definitionId: requiredString(input, 'definitionId'),
          variantId: input.variantId === undefined
            ? null
            : requiredNullableString(input, 'variantId'),
          props: props as Record<string, string | number | boolean>,
          placement,
          sizing,
        }, {
          createdInstanceId: componentId,
        })
      }
      if (operation === 'update') {
        const props = input.props === undefined
          ? undefined
          : requiredRecord(input, 'props') as Record<string, string | number | boolean>
        if (props) {
          for (const [key, value] of Object.entries(props)) {
            if (
              !key ||
              (typeof value !== 'string' &&
                typeof value !== 'number' &&
                typeof value !== 'boolean')
            ) {
              throw new DomainError(
                'INVALID_ARGUMENT',
                `props.${key || '<empty>'} must be a string, number, or boolean`,
              )
            }
          }
        }
        const sizing = input.sizing === undefined
          ? undefined
          : requiredRecord(input, 'sizing')
        if (sizing) validateComponentSizing(sizing, 'sizing')
        const placement = input.placement === undefined
          ? undefined
          : requiredRecord(input, 'placement')
        if (placement) validateComponentPlacement(placement, 'placement')
        const componentId = requiredString(input, 'componentId')
        return appendCommand(input, {
          type: 'updateDefinitionInstance',
          componentId,
          variantId: input.variantId === undefined
            ? undefined
            : requiredNullableString(input, 'variantId'),
          props,
          placement,
          sizing,
        }, {
          instanceId: componentId,
        })
      }
      throw new DomainError('INVALID_REFERENCE', `Unsupported Instance operation: ${operation}`)
    })
  },
}

export const WEBMCP_TOOLS: ToolDefinition[] = [
  getCurrentScreenContext,
  getComponent,
  getPendingChangeSet,
  beginChangeSet,
  changeScreenStructure,
  changeComponentStructure,
  updateComponentSpec,
  upsertScreenState,
  connectBehavior,
  manageComponentDefinition,
  manageDefinitionInstance,
]

export async function registerWebMCPTools(): Promise<boolean> {
  const modelContext = document.modelContext
  if (!modelContext) {
    console.info('[WebMCP] document.modelContext unavailable; human UI remains available')
    return false
  }
  const controller = new AbortController()
  try {
    for (const tool of WEBMCP_TOOLS) {
      await modelContext.registerTool(tool, { signal: controller.signal })
    }
    console.info(`[WebMCP] Registered ${WEBMCP_TOOLS.length} tools`)
    return true
  } catch (error) {
    controller.abort(error)
    console.error(
      '[WebMCP] Tool registration failed; partial registrations were aborted and human UI remains available',
      error,
    )
    return false
  }
}
