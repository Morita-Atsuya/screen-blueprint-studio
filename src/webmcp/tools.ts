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
  EventAction,
  EventTrigger,
  FieldBinding,
  HttpMethod,
  ComponentDefinition,
  ComponentTargetRef,
  PublicPropFieldV3,
} from '../domain/model'
import {
  CHILD_COMPONENT_KINDS,
  DEFAULT_COMPONENT_PLACEMENT,
  DEFAULT_COMPONENT_SIZING,
} from '../domain/model'
import { DomainError } from '../domain/errors'
import { getOwnEntity } from '../domain/entityMap'
import { effectiveComponent } from '../domain/selectors'
import {
  componentTargetRefEquals,
  findInlineScenarioOverride,
  findScenarioOverride,
  inlineTargetRef,
  isComponentTargetRef,
} from '../domain/componentTargets'
import { createDuplicateComponentCommand } from '../domain/componentDuplication'
import { presentChangeSetOperations } from '../domain/changeSetPresentation'
import { validateComponentSizing } from '../domain/runtimeValidation'
import {
  selectedScreenComponentId,
  selectionCanonicalTarget,
} from '../domain/editorSelection'
import {
  createDetachDefinitionInstanceCommand,
  createEmptyComponentDefinition,
  createExtractDefinitionCommand,
  duplicateComponentDefinition,
} from '../domain/definitionEditing'
import { resolveComponentTarget, resolveScreenNodes } from '../domain/definitionResolver'
import type { ChangeSet } from '../domain/collaboration'
import {
  componentConfigPatchSchema,
  componentConfigSchema,
  componentPlacementSchema,
  rootComponentSizingSchema,
  componentSizingSchema,
  componentOverridesSchema,
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
  'Workflow: read get_current_screen_context; call begin_change_set; use its changeSetId, ' +
  'baseRevision, and changeSetVersion in writes; replace expectedChangeSetVersion with every ' +
  'successful write response; inspect get_pending_change_set. Only a human can Accept or Reject.'

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
  return {
    type: requiredString(trigger, 'type') as EventTrigger['type'],
    target: componentTargetFromInput(trigger.target, 'trigger.target'),
  }
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

function appendCommand(input: JsonObject, command: DomainCommand): JsonObject {
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

const componentTargetSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        type: { const: 'inline' },
        componentId: { type: 'string', minLength: 1 },
      },
      required: ['type', 'componentId'],
      ...CLOSED_OBJECT,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'definitionNode' },
        instanceId: { type: 'string', minLength: 1 },
        nodePath: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
        },
      },
      required: ['type', 'instanceId', 'nodePath'],
      ...CLOSED_OBJECT,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'collectionItemNode' },
        collectionId: { type: 'string', minLength: 1 },
        nodePath: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
        },
      },
      required: ['type', 'collectionId', 'nodePath'],
      ...CLOSED_OBJECT,
    },
  ],
}

const behaviorValueSourceSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        type: { const: 'item' },
        path: { type: 'string' },
      },
      required: ['type', 'path'],
      ...CLOSED_OBJECT,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'literal' },
        value: {
          type: ['string', 'number', 'boolean', 'null'],
        },
      },
      required: ['type', 'value'],
      ...CLOSED_OBJECT,
    },
  ],
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
      oneOf: [
        ...componentTargetSchema.oneOf,
        ...behaviorValueSourceSchema.oneOf,
      ],
    },
    targetPath: { type: 'string', minLength: 1 },
  },
  required: ['source', 'targetPath'],
  ...CLOSED_OBJECT,
}

const eventActionSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        type: { const: 'setScenario' },
        scenarioId: { type: 'string', minLength: 1 },
      },
      required: ['type', 'scenarioId'],
      ...CLOSED_OBJECT,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'clearScenario' },
      },
      required: ['type'],
      ...CLOSED_OBJECT,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'callApi' },
        apiOperationId: { type: 'string', minLength: 1 },
      },
      required: ['type', 'apiOperationId'],
      ...CLOSED_OBJECT,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'navigate' },
        destinationScreenId: { type: 'string', minLength: 1 },
        routeParameters: behaviorParameterMapSchema,
        queryParameters: behaviorParameterMapSchema,
      },
      required: ['type', 'destinationScreenId'],
      ...CLOSED_OBJECT,
    },
  ],
}

function compactChangeSet(changeSet: ChangeSet | null, includeOperations: boolean): JsonObject | null {
  if (!changeSet) return null
  return {
    id: changeSet.id,
    summary: changeSet.summary,
    baseRevision: changeSet.baseRevision,
    version: changeSet.version,
    operationCount: changeSet.operations.length,
    createdAt: changeSet.createdAt,
    ...(includeOperations
      ? {
          operations: changeSet.operations,
          operationSummaries: presentChangeSetOperations(changeSet, 'en'),
        }
      : {}),
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function activeScreenProjection(screenId: string): JsonObject {
  const document = useAppStore.getState().effectiveDocument
  const screen = getOwnEntity(document.screens, screenId)
  if (!screen) throw new DomainError('NOT_FOUND', `Screen ${screenId} not found`)
  const byId = <T extends { id: string }>(left: T, right: T) =>
    compareCodeUnits(left.id, right.id)
  return {
    documentView: 'effective',
    screen,
    components: Object.values(document.components)
      .filter(component => component.screenId === screenId)
      .sort(byId),
    states: screen.scenarioIds.flatMap(id => {
      const state = getOwnEntity(document.screenScenarios, id)
      return state ? [state] : []
    }),
    events: screen.eventIds.flatMap(id => {
      const event = getOwnEntity(document.events, id)
      return event ? [event] : []
    }),
    apiOperations: Object.values(document.apiOperations)
      .filter(operation => operation.screenId === screenId)
      .sort(byId),
  }
}

const getCurrentScreenContext: ToolDefinition = {
  name: 'get_current_screen_context',
  description:
    'Start here. Read the effective active screen with all components, states, events, APIs, ' +
    'current UI selection, confirmed revision, and compact proposal metadata. ' + AGENT_WORKFLOW,
  annotations: { readOnlyHint: true },
  inputSchema: { type: 'object', properties: {}, required: [], ...CLOSED_OBJECT },
  execute() {
    const state = useAppStore.getState()
    if (state.recoveryState) {
      return success({
        recovery: {
          status: state.recoveryState.status,
          error: state.recoveryState.error,
        },
      })
    }
    const screen = state.ui.activeScreenId
      ? getOwnEntity(state.effectiveDocument.screens, state.ui.activeScreenId) ?? null
      : null
    return success({
      project: state.effectiveDocument.project,
      componentDefinitions: state.effectiveDocument.componentDefinitions,
      screens: state.effectiveDocument.project.screenIds.flatMap(id => {
        const current = getOwnEntity(state.effectiveDocument.screens, id)
        return current ? [current] : []
      }),
      activeScreenId: state.ui.activeScreenId,
      activeStateId: state.ui.activeStateId,
      selectedComponentId: selectedScreenComponentId(state.ui.selection),
      selection: state.ui.selection,
      revision: state.revision,
      documentView: 'effective',
      activeChangeSet: compactChangeSet(state.activeChangeSet, false),
      rejectedRecords: state.rejectedRecords,
      screen,
      activeScreen: screen ? {
        ...activeScreenProjection(screen.id),
        resolvedNodes: resolveScreenNodes(
          state.effectiveDocument,
          screen.id,
          state.ui.activeStateId,
        ).orderedNodes,
      } : null,
    })
  },
}

const getComponent: ToolDefinition = {
  name: 'get_component',
  description:
    'Read one effective component and its state override, related events, and API bindings. ' +
    'Omit componentId to use the human UI selection. Start with get_current_screen_context. ' +
    AGENT_WORKFLOW,
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
      const state = useAppStore.getState()
      if (state.recoveryState) {
        throw new DomainError('RECOVERY_REQUIRED', 'Persisted data recovery is required')
      }
      const componentId = optionalString(input, 'componentId') ??
        selectedScreenComponentId(state.ui.selection)
      const explicitTarget = input.target === undefined
        ? null
        : componentTargetFromInput(input.target, 'target')
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
          stateOverride: activeState
            ? findScenarioOverride(activeState, selectedTarget)?.override ?? null
            : null,
          relatedEvents: Object.values(state.effectiveDocument.events).filter(event =>
            componentTargetRefEquals(event.trigger.target, selectedTarget)),
          relatedApiOperations: Object.values(state.effectiveDocument.apiOperations).filter(operation =>
            operation.requestBindings.some(binding =>
              isComponentTargetRef(binding.source) &&
              componentTargetRefEquals(binding.source, selectedTarget)) ||
            Object.values(state.effectiveDocument.events).some(event =>
              componentTargetRefEquals(event.trigger.target, selectedTarget) &&
              event.actions.some(action =>
                action.type === 'callApi' &&
                action.apiOperationId === operation.id) &&
              operation.requestBindings.some(binding =>
                binding.source.type === 'item')),
          ),
        }
      }
      if (!componentId) throw new DomainError('NOT_FOUND', 'No component ID or current selection')
      const baseComponent = getOwnEntity(state.effectiveDocument.components, componentId)
      if (!baseComponent) throw new DomainError('NOT_FOUND', `Component ${componentId} not found`)
      const activeState = state.ui.activeStateId
        ? getOwnEntity(state.effectiveDocument.screenScenarios, state.ui.activeStateId)
        : undefined
      const component = effectiveComponent(state.effectiveDocument, baseComponent, activeState)
      return {
        component,
        stateOverride: activeState
          ? findInlineScenarioOverride(activeState, componentId)?.override ?? null
          : null,
        relatedEvents: Object.values(state.effectiveDocument.events).filter(
          event => componentTargetRefEquals(event.trigger.target, inlineTargetRef(componentId)),
        ),
        relatedApiOperations: Object.values(state.effectiveDocument.apiOperations).filter(operation =>
          operation.requestBindings.some(binding =>
            isComponentTargetRef(binding.source) &&
            componentTargetRefEquals(binding.source, inlineTargetRef(componentId)),
          ),
        ),
      }
    })
  },
}

const getPendingChangeSet: ToolDefinition = {
  name: 'get_pending_change_set',
  description:
    'Review compact English operation summaries and field diffs for the active agent proposal. ' +
    'The confirmed document is not duplicated in this response. ' + AGENT_WORKFLOW,
  annotations: { readOnlyHint: true },
  inputSchema: { type: 'object', properties: {}, required: [], ...CLOSED_OBJECT },
  execute() {
    const state = useAppStore.getState()
    if (state.recoveryState) {
      return success({
        recovery: {
          status: state.recoveryState.status,
          error: state.recoveryState.error,
        },
      })
    }
    return success({
      activeChangeSet: compactChangeSet(state.activeChangeSet, true),
      confirmedRevision: state.revision,
      rejectedRecords: state.rejectedRecords,
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
    'Add, update, or remove a screen in the active agent proposal. ' + AGENT_WORKFLOW,
  inputSchema: {
    oneOf: [
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'add' },
          name: { type: 'string', minLength: 1 },
          route: { type: 'string', minLength: 1 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'name', 'route'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'update' },
          screenId: { type: 'string', minLength: 1 },
          name: { type: 'string' },
          route: { type: 'string' },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'screenId'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'remove' },
          screenId: { type: 'string', minLength: 1 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'screenId'],
        ...CLOSED_OBJECT,
      },
    ],
  },
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
      let command: DomainCommand
      if (operation === 'add') {
        requireExactKeys(
          input,
          [...Object.keys(writeBaseProperties), 'operation', 'name', 'route'],
          'change_screen_structure add input',
        )
        command = {
          type: 'addScreen',
          screenId: nanoid(),
          rootComponentId: nanoid(),
          name: requiredString(input, 'name'),
          route: requiredString(input, 'route'),
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
      return appendCommand(input, command)
    })
  },
}

const changeComponentStructure: ToolDefinition = {
  name: 'change_component_structure',
  description:
    'Add, move, duplicate, or remove a component or independent modal root in the active proposal. ' +
    'Sizing is validated against placement and the logical parent layout; invalid spans, grow, or ' +
    'structural changes are rejected rather than adjusted. ' +
    AGENT_WORKFLOW,
  inputSchema: {
    oneOf: [
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'add' },
          screenId: { type: 'string', minLength: 1 },
          parentId: { type: 'string', minLength: 1 },
          kind: { type: 'string', enum: CHILD_COMPONENT_KINDS },
          placement: componentPlacementSchema,
          sizing: componentSizingSchema,
          config: componentConfigSchema,
          position: { type: 'integer', minimum: 0 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'screenId', 'parentId', 'kind', 'placement', 'sizing', 'config'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'add' },
          screenId: { type: 'string', minLength: 1 },
          parentId: { type: 'null' },
          kind: { const: 'modal' },
          placement: {
            type: 'object',
            properties: { mode: { const: 'flow' } },
            required: ['mode'],
            ...CLOSED_OBJECT,
          },
          sizing: rootComponentSizingSchema,
          config: componentConfigSchema,
          position: { type: 'integer', minimum: 0 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'screenId', 'parentId', 'kind', 'placement', 'sizing', 'config'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'move' },
          componentId: { type: 'string', minLength: 1 },
          newParentId: { type: 'string', minLength: 1 },
          position: { type: 'integer', minimum: 0 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'componentId', 'newParentId'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'duplicate' },
          componentId: { type: 'string', minLength: 1 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'componentId'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'remove' },
          componentId: { type: 'string', minLength: 1 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'componentId'],
        ...CLOSED_OBJECT,
      },
    ],
  },
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
      let command: DomainCommand
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
        validateComponentSizing(sizing, 'sizing')
        command = {
          type: 'addComponent',
          componentId: nanoid(),
          screenId: requiredString(input, 'screenId'),
          parentId: requiredNullableString(input, 'parentId'),
          kind: requiredString(input, 'kind') as ComponentKind,
          placement: requiredRecord(input, 'placement') as ComponentPlacement,
          sizing,
          config,
          position: typeof input.position === 'number' ? input.position : undefined,
        }
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
      return appendCommand(input, command)
    })
  },
}

const updateComponentSpec: ToolDefinition = {
  name: 'update_component_spec',
  description:
    'Update a component common spec, sizing, placement, or kind-specific config. Sizing is a full ' +
    'object and is rejected when it conflicts with min/max ordering or parent layout context. ' +
    AGENT_WORKFLOW,
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
          sizing: componentSizingSchema,
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
        patch.common = patchInput.common
      }
      if (patchInput.config !== undefined) {
        if (!isRecord(patchInput.config)) {
          throw new DomainError('INVARIANT_VIOLATION', 'patch.config must be an object')
        }
        patch.config = patchInput.config
      }
      if (patchInput.placement !== undefined) {
        if (!isRecord(patchInput.placement)) {
          throw new DomainError('INVARIANT_VIOLATION', 'patch.placement must be an object')
        }
        patch.placement = patchInput.placement as ComponentPlacement
      }
      if (patchInput.sizing !== undefined) {
        if (!isRecord(patchInput.sizing)) {
          throw new DomainError('INVARIANT_VIOLATION', 'patch.sizing must be an object')
        }
        validateComponentSizing(patchInput.sizing, 'patch.sizing')
        patch.sizing = patchInput.sizing
      }
      return appendCommand(input, {
        type: 'updateComponentSpec',
        componentId: requiredString(input, 'componentId'),
        patch,
      })
    })
  },
}

const upsertScreenState: ToolDefinition = {
  name: 'upsert_screen_state',
  description:
    'Create, update, or remove a named screen state in the active proposal. ' + AGENT_WORKFLOW,
  inputSchema: {
    oneOf: [
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'create' },
          screenId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          overrides: componentOverridesSchema,
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'screenId', 'name'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'update' },
          stateId: { type: 'string', minLength: 1 },
          name: { type: 'string' },
          description: { type: 'string' },
          overrides: componentOverridesSchema,
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'stateId'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'remove' },
          stateId: { type: 'string', minLength: 1 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'stateId'],
        ...CLOSED_OBJECT,
      },
    ],
  },
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
      let command: DomainCommand
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
        command = {
          type: 'createScreenState',
          stateId: nanoid(),
          screenId: requiredString(input, 'screenId'),
          name: requiredString(input, 'name'),
          description: optionalString(input, 'description'),
          overrides: scenarioOverridesFromInput(input.overrides),
        }
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
      return appendCommand(input, command)
    })
  },
}

const connectBehavior: ToolDefinition = {
  name: 'connect_behavior',
  description:
    'Create, update without changing IDs, or remove an event or API operation in the active ' +
    'proposal. Read the active screen first so references remain valid. ' + AGENT_WORKFLOW,
  inputSchema: {
    oneOf: [
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'connectEvent' },
          screenId: { type: 'string', minLength: 1 },
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
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'screenId', 'name', 'trigger', 'actions'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'removeEvent' },
          eventId: { type: 'string', minLength: 1 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'eventId'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'updateEvent' },
          eventId: { type: 'string', minLength: 1 },
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
        },
        required: [
          'changeSetId',
          'expectedRevision',
          'expectedChangeSetVersion',
          'operation',
          'eventId',
          'name',
          'trigger',
          'actions',
        ],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'bindApi' },
          screenId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
          path: { type: 'string', minLength: 1 },
          requestBindings: { type: 'array', items: fieldBindingSchema },
          successStateId: { type: 'string', minLength: 1 },
          errorStateId: { type: 'string', minLength: 1 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'screenId', 'name', 'method', 'path'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'removeApi' },
          operationId: { type: 'string', minLength: 1 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'operationId'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'updateApi' },
          operationId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
          path: { type: 'string', minLength: 1 },
          requestBindings: { type: 'array', items: fieldBindingSchema },
          successStateId: { type: ['string', 'null'], minLength: 1 },
          errorStateId: { type: ['string', 'null'], minLength: 1 },
        },
        required: [
          'changeSetId',
          'expectedRevision',
          'expectedChangeSetVersion',
          'operation',
          'operationId',
          'name',
          'method',
          'path',
          'requestBindings',
          'successStateId',
          'errorStateId',
        ],
        ...CLOSED_OBJECT,
      },
    ],
  },
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
      let command: DomainCommand
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
        command = {
          type: 'connectEvent',
          eventId: nanoid(),
          screenId: requiredString(input, 'screenId'),
          name: requiredString(input, 'name'),
          trigger,
          actions: input.actions as EventAction[],
        }
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
        command = {
          type: 'updateEvent',
          eventId: requiredString(input, 'eventId'),
          name: requiredString(input, 'name'),
          trigger,
          actions: input.actions as EventAction[],
        }
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
        command = {
          type: 'bindApiOperation',
          operationId: nanoid(),
          screenId: requiredString(input, 'screenId'),
          name: requiredString(input, 'name'),
          method: requiredString(input, 'method') as HttpMethod,
          path: requiredString(input, 'path'),
          requestBindings: input.requestBindings === undefined ? [] : fieldBindingsFromInput(input.requestBindings),
          successScenarioId: optionalString(input, 'successStateId'),
          errorScenarioId: optionalString(input, 'errorStateId'),
        }
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
      return appendCommand(input, command)
    })
  },
}

const manageComponentDefinition: ToolDefinition = {
  name: 'manage_component_definition',
  description:
    'Create, rename, duplicate, expose a typed public property, add a constrained Variant, or ' +
    'remove a shared Component Definition. Definitions are global and nested references must remain a DAG. ' +
    AGENT_WORKFLOW,
  inputSchema: {
    oneOf: [
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'create' },
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'name'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'updateMeta' },
          definitionId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'definitionId'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { enum: ['duplicate', 'remove'] },
          definitionId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'definitionId'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'publishStringProp' },
          definitionId: { type: 'string', minLength: 1 },
          key: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          nodePath: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
          },
          field: { type: 'string' },
        },
        required: [
          'changeSetId',
          'expectedRevision',
          'expectedChangeSetVersion',
          'operation',
          'definitionId',
          'key',
          'name',
          'nodePath',
          'field',
        ],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'addVariant' },
          definitionId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          propertyKey: { type: 'string', minLength: 1 },
          propertyValue: { type: 'string', minLength: 1 },
          defaultPropertyValue: { type: 'string', minLength: 1 },
        },
        required: [
          'changeSetId',
          'expectedRevision',
          'expectedChangeSetVersion',
          'operation',
          'definitionId',
          'name',
          'propertyKey',
          'propertyValue',
        ],
        ...CLOSED_OBJECT,
      },
    ],
  },
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
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
        })
      }
      const definitionId = requiredString(input, 'definitionId')
      const current = getOwnEntity(document.componentDefinitions, definitionId)
      if (!current) throw new DomainError('NOT_FOUND', `Definition ${definitionId} not found`)
      if (operation === 'remove') {
        return appendCommand(input, { type: 'removeComponentDefinition', definitionId })
      }
      if (operation === 'duplicate') {
        return appendCommand(input, {
          type: 'putComponentDefinition',
          mode: 'create',
          definition: duplicateComponentDefinition(
            current,
            `definition-${nanoid()}`,
            optionalString(input, 'name') ?? `${current.name} copy`,
            nanoid,
          ),
        })
      }
      const definition = structuredClone(current) as ComponentDefinition
      if (operation === 'updateMeta') {
        definition.name = optionalString(input, 'name') ?? definition.name
        definition.description = optionalString(input, 'description') ?? definition.description
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
      } else {
        throw new DomainError('INVALID_REFERENCE', `Unsupported Definition operation: ${operation}`)
      }
      return appendCommand(input, {
        type: 'putComponentDefinition',
        mode: 'update',
        definition,
      })
    })
  },
}

const manageDefinitionInstance: ToolDefinition = {
  name: 'manage_definition_instance',
  description:
    'Insert or configure a shared Definition Instance, atomically extract an inline subtree into a ' +
    'Definition, or detach an Instance back to inline components. Instance props are explicit typed values; ' +
    'base Definition fields remain the default. ' + AGENT_WORKFLOW,
  inputSchema: {
    oneOf: [
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'add' },
          screenId: { type: 'string', minLength: 1 },
          parentId: { type: 'string', minLength: 1 },
          definitionId: { type: 'string', minLength: 1 },
          position: { type: 'integer', minimum: 0 },
          variantId: { type: ['string', 'null'] },
          props: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] } },
          placement: componentPlacementSchema,
          sizing: componentSizingSchema,
        },
        required: [
          'changeSetId',
          'expectedRevision',
          'expectedChangeSetVersion',
          'operation',
          'screenId',
          'parentId',
          'definitionId',
        ],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'update' },
          componentId: { type: 'string', minLength: 1 },
          variantId: { type: ['string', 'null'] },
          props: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] } },
          placement: componentPlacementSchema,
          sizing: componentSizingSchema,
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'componentId'],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'extract' },
          componentId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
        },
        required: [
          'changeSetId',
          'expectedRevision',
          'expectedChangeSetVersion',
          'operation',
          'componentId',
          'name',
        ],
        ...CLOSED_OBJECT,
      },
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'detach' },
          componentId: { type: 'string', minLength: 1 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'componentId'],
        ...CLOSED_OBJECT,
      },
    ],
  },
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
      const document = useAppStore.getState().effectiveDocument
      if (operation === 'extract') {
        return appendCommand(input, createExtractDefinitionCommand(
          document,
          requiredString(input, 'componentId'),
          `definition-${nanoid()}`,
          `instance-${nanoid()}`,
          requiredString(input, 'name'),
          nanoid,
        ))
      }
      if (operation === 'detach') {
        return appendCommand(input, createDetachDefinitionInstanceCommand(
          document,
          requiredString(input, 'componentId'),
          nanoid,
        ))
      }
      if (operation === 'add') {
        const props = input.props === undefined ? {} : requiredRecord(input, 'props')
        const sizing = input.sizing === undefined
          ? DEFAULT_COMPONENT_SIZING
          : requiredRecord(input, 'sizing')
        validateComponentSizing(sizing, 'sizing')
        return appendCommand(input, {
          type: 'addDefinitionInstance',
          componentId: `instance-${nanoid()}`,
          screenId: requiredString(input, 'screenId'),
          parentId: requiredString(input, 'parentId'),
          position: typeof input.position === 'number' ? input.position : undefined,
          definitionId: requiredString(input, 'definitionId'),
          variantId: input.variantId === undefined
            ? null
            : requiredNullableString(input, 'variantId'),
          props: props as Record<string, string | number | boolean>,
          placement: input.placement === undefined
            ? DEFAULT_COMPONENT_PLACEMENT
            : requiredRecord(input, 'placement') as ComponentPlacement,
          sizing,
        })
      }
      if (operation === 'update') {
        const props = input.props === undefined
          ? undefined
          : requiredRecord(input, 'props') as Record<string, string | number | boolean>
        const sizing = input.sizing === undefined
          ? undefined
          : requiredRecord(input, 'sizing')
        if (sizing) validateComponentSizing(sizing, 'sizing')
        return appendCommand(input, {
          type: 'updateDefinitionInstance',
          componentId: requiredString(input, 'componentId'),
          variantId: input.variantId === undefined
            ? undefined
            : requiredNullableString(input, 'variantId'),
          props,
          placement: input.placement === undefined
            ? undefined
            : requiredRecord(input, 'placement') as ComponentPlacement,
          sizing,
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
