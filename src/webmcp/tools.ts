import { nanoid } from 'nanoid'
import { useAppStore } from '../app/appStore'
import type { DomainCommand } from '../domain/commands'
import type {
  CommonComponentSpec,
  ComponentConfig,
  ComponentKind,
  ComponentOverride,
  EventAction,
  EventTrigger,
  FieldBinding,
  HttpMethod,
} from '../domain/model'
import { DomainError } from '../domain/errors'
import { getOwnEntity } from '../domain/entityMap'
import { getComponentDisplayLabel } from '../domain/componentDisplayLabel'
import {
  componentConfigPatchSchema,
  componentConfigSchema,
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

interface ModelContext {
  registerTool(tool: ToolDefinition): void
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

function requiredNumber(input: JsonObject, key: string): number {
  const value = input[key]
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new DomainError('REVISION_CONFLICT', `${key} must be a non-negative integer`)
  }
  return value as number
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
  const expectedRevision = requiredNumber(input, 'expectedRevision')
  const expectedChangeSetVersion = requiredNumber(input, 'expectedChangeSetVersion')
  const active = state.activeChangeSet

  if (!active || active.id !== changeSetId) {
    throw new DomainError('CHANGE_SET_REQUIRED', 'No matching active change set', {
      requestedChangeSetId: changeSetId,
      activeChangeSetId: active?.id ?? null,
    })
  }
  if (
    expectedRevision !== state.document.revision ||
    expectedRevision !== active.baseRevision ||
    expectedChangeSetVersion !== active.version
  ) {
    throw new DomainError('REVISION_CONFLICT', 'The document or change set version is stale', {
      expectedRevision,
      actualRevision: state.document.revision,
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
    revision: state.document.revision,
  }
}

const writeBaseProperties = {
  changeSetId: { type: 'string', minLength: 1 },
  expectedRevision: { type: 'integer', minimum: 0 },
  expectedChangeSetVersion: { type: 'integer', minimum: 0 },
}

const fieldBindingSchema = {
  type: 'object',
  properties: {
    componentId: { type: 'string', minLength: 1 },
    targetPath: { type: 'string', minLength: 1 },
  },
  required: ['componentId', 'targetPath'],
  ...CLOSED_OBJECT,
}

const eventActionSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        type: { const: 'setState' },
        stateId: { type: 'string', minLength: 1 },
      },
      required: ['type', 'stateId'],
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
        type: { const: 'showAlert' },
        componentId: { type: 'string', minLength: 1 },
      },
      required: ['type', 'componentId'],
      ...CLOSED_OBJECT,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'navigate' },
        destinationScreenId: { type: 'string', minLength: 1 },
      },
      required: ['type', 'destinationScreenId'],
      ...CLOSED_OBJECT,
    },
  ],
}

const getCurrentScreenContext: ToolDefinition = {
  name: 'get_current_screen_context',
  description: 'Get the confirmed revision and current UI/change-set context.',
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
      screens: state.effectiveDocument.project.screenIds.flatMap(id => {
        const current = getOwnEntity(state.effectiveDocument.screens, id)
        return current ? [current] : []
      }),
      activeScreenId: state.ui.activeScreenId,
      activeStateId: state.ui.activeStateId,
      selectedComponentId: state.ui.selectedComponentId,
      revision: state.document.revision,
      agentWritePolicy: state.agentWritePolicy,
      activeChangeSet: state.activeChangeSet,
      rejectedRecords: state.rejectedRecords,
      screen,
    })
  },
}

const getComponent: ToolDefinition = {
  name: 'get_component',
  description: 'Get a component by ID, or the currently selected component when omitted.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: { componentId: { type: 'string', minLength: 1 } },
    required: [],
    ...CLOSED_OBJECT,
  },
  execute(input) {
    return withFailure(() => {
      const state = useAppStore.getState()
      if (state.recoveryState) {
        throw new DomainError('RECOVERY_REQUIRED', 'Persisted data recovery is required')
      }
      const componentId = optionalString(input, 'componentId') ?? state.ui.selectedComponentId
      if (!componentId) throw new DomainError('NOT_FOUND', 'No component ID or current selection')
      const component = getOwnEntity(state.effectiveDocument.components, componentId)
      if (!component) throw new DomainError('NOT_FOUND', `Component ${componentId} not found`)
      const activeState = state.ui.activeStateId
        ? getOwnEntity(state.effectiveDocument.screenStates, state.ui.activeStateId)
        : undefined
      return {
        component,
        stateOverride: activeState
          ? getOwnEntity(activeState.componentOverrides, componentId) ?? null
          : null,
        relatedEvents: Object.values(state.effectiveDocument.events).filter(event =>
          event.trigger.componentId === componentId ||
          event.actions.some(action => action.type === 'showAlert' && action.componentId === componentId),
        ),
        relatedApiOperations: Object.values(state.effectiveDocument.apiOperations).filter(operation =>
          operation.requestBindings.some(binding => binding.componentId === componentId),
        ),
      }
    })
  },
}

const getScreenDiagnostics: ToolDefinition = {
  name: 'get_screen_diagnostics',
  description: 'Return lightweight structural diagnostics for a screen.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: { screenId: { type: 'string', minLength: 1 } },
    required: [],
    ...CLOSED_OBJECT,
  },
  execute(input) {
    return withFailure(() => {
      const state = useAppStore.getState()
      if (state.recoveryState) {
        throw new DomainError('RECOVERY_REQUIRED', 'Persisted data recovery is required')
      }
      const screenId = optionalString(input, 'screenId') ?? state.ui.activeScreenId
      if (!screenId) throw new DomainError('NOT_FOUND', 'No screen ID or active screen')
      const screen = getOwnEntity(state.effectiveDocument.screens, screenId)
      if (!screen) throw new DomainError('NOT_FOUND', `Screen ${screenId} not found`)
      const diagnostics = Object.values(state.effectiveDocument.components)
        .filter(component => component.screenId === screenId)
        .flatMap(component => {
          if (
            (component.config.kind === 'textInput' || component.config.kind === 'select') &&
            component.config.fieldKey.trim() === ''
          ) {
            return [{
              code: 'MISSING_FIELD_KEY',
              entityId: component.id,
              message: `${getComponentDisplayLabel(component, screen.name, 'en')} has no fieldKey`,
            }]
          }
          return []
        })
      return { screenId, diagnostics }
    })
  },
}

const getPendingChangeSet: ToolDefinition = {
  name: 'get_pending_change_set',
  description: 'Get the active change set, including agent and human operations.',
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
      activeChangeSet: state.activeChangeSet,
      confirmedRevision: state.document.revision,
      rejectedRecords: state.rejectedRecords,
    })
  },
}

const beginChangeSet: ToolDefinition = {
  name: 'begin_change_set',
  description: 'Begin one review-mode change set.',
  inputSchema: {
    type: 'object',
    properties: { summary: { type: 'string', minLength: 1 } },
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
  description: 'Add, update, or remove a screen in the active change set.',
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
          defaultStateId: nanoid(),
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

const componentKinds: ComponentKind[] = [
  'section', 'container', 'heading', 'text',
  'textInput', 'select', 'button', 'alert', 'modal',
]

const changeComponentStructure: ToolDefinition = {
  name: 'change_component_structure',
  description: 'Add, move, or remove a component in the active change set.',
  inputSchema: {
    oneOf: [
      {
        type: 'object',
        properties: {
          ...writeBaseProperties,
          operation: { const: 'add' },
          screenId: { type: 'string', minLength: 1 },
          parentId: { type: 'string', minLength: 1 },
          kind: { type: 'string', enum: componentKinds },
          config: componentConfigSchema,
          position: { type: 'integer', minimum: 0 },
        },
        required: ['changeSetId', 'expectedRevision', 'expectedChangeSetVersion', 'operation', 'screenId', 'parentId', 'kind', 'config'],
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
          'config',
          'position',
        ], 'change_component_structure add input')
        const config = requiredRecord(input, 'config') as ComponentConfig
        command = {
          type: 'addComponent',
          componentId: nanoid(),
          screenId: requiredString(input, 'screenId'),
          parentId: requiredString(input, 'parentId'),
          kind: requiredString(input, 'kind') as ComponentKind,
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
  description: 'Update a component common spec or kind-specific config.',
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
      requireExactKeys(patchInput, ['common', 'config'], 'update_component_spec patch')
      const patch: {
        common?: Partial<CommonComponentSpec>
        config?: Partial<ComponentConfig>
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
  description: 'Create, update, or remove a named screen state.',
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
          overrides: isRecord(input.overrides)
            ? input.overrides as Record<string, ComponentOverride>
            : undefined,
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
          overrides: isRecord(input.overrides)
            ? input.overrides as Record<string, ComponentOverride>
            : undefined,
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
  description: 'Create/remove an event or create/remove an API operation.',
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
              componentId: { type: 'string', minLength: 1 },
            },
            required: ['type', 'componentId'],
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
    ],
  },
  execute(input) {
    return withWriteFailure(() => {
      const operation = requiredString(input, 'operation')
      let command: DomainCommand
      if (operation === 'connectEvent') {
        const trigger = requiredRecord(input, 'trigger') as EventTrigger
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
      } else if (operation === 'removeEvent') {
        command = { type: 'removeEvent', eventId: requiredString(input, 'eventId') }
      } else if (operation === 'bindApi') {
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
          requestBindings: (input.requestBindings as FieldBinding[] | undefined) ?? [],
          successStateId: optionalString(input, 'successStateId'),
          errorStateId: optionalString(input, 'errorStateId'),
        }
      } else if (operation === 'removeApi') {
        command = { type: 'removeApiOperation', operationId: requiredString(input, 'operationId') }
      } else {
        throw new DomainError('INVALID_REFERENCE', `Unsupported behavior operation: ${operation}`)
      }
      return appendCommand(input, command)
    })
  },
}

export const WEBMCP_TOOLS: ToolDefinition[] = [
  getCurrentScreenContext,
  getComponent,
  getScreenDiagnostics,
  getPendingChangeSet,
  beginChangeSet,
  changeScreenStructure,
  changeComponentStructure,
  updateComponentSpec,
  upsertScreenState,
  connectBehavior,
]

export function registerWebMCPTools(): void {
  if (!document.modelContext) {
    console.info('[WebMCP] document.modelContext unavailable; human UI remains available')
    return
  }
  WEBMCP_TOOLS.forEach(tool => document.modelContext!.registerTool(tool))
  console.info(`[WebMCP] Registered ${WEBMCP_TOOLS.length} tools`)
}
