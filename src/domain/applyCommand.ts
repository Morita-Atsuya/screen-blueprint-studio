import type { EntityId, ProjectDocument } from './model'
import { assertNever } from './assertNever'
import {
  CONTAINER_KINDS,
  DEFAULT_COMPONENT_LAYOUT,
  DEFAULT_COMPONENT_PLACEMENT,
} from './model'
import type { ComponentConfig } from './model'
import type { ComponentSubtreeSnapshot, DomainCommand } from './commands'
import { DomainError } from './errors'
import { validateInvariants } from './invariants'
import {
  deleteOwnEntity,
  getOwnEntity,
  hasOwnEntity,
  isSafeEntityId,
  setOwnEntity,
} from './entityMap'
import {
  createComponentSubtreeSnapshot,
  resolveComponentPasteTarget,
} from './componentDuplication'
import {
  classifyComponentAdd,
  classifyComponentMove,
  componentPlacementError,
} from './componentPlacement'
import {
  cloneComponentConfig,
  cloneComponentOverride,
  cloneDomainCommand,
  cloneProjectDocument,
  cloneScreenComponent,
} from './modelClone'

function requireExactKeys(
  value: object,
  allowedKeys: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedKeys)
  const unknown = Object.keys(value).filter(key => !allowed.has(key))
  if (unknown.length > 0) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${path} contains unknown fields: ${unknown.join(', ')}`,
    )
  }
}

export function nextRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
    throw new DomainError('INVARIANT_VIOLATION', 'Revision cannot be incremented safely')
  }
  return revision + 1
}

// Remove component and all its descendants; returns IDs removed
function removeSubtree(componentId: EntityId, doc: ProjectDocument): EntityId[] {
  const removed: EntityId[] = []
  function rec(id: EntityId) {
    const comp = getOwnEntity(doc.components, id)
    if (!comp) return
    for (const childId of [...comp.childIds]) rec(childId)
    removed.push(id)
    deleteOwnEntity(doc.components, id)
  }
  rec(componentId)
  return removed
}

// Clean up references to removed component IDs
function cleanupComponentRefs(removedIds: Set<EntityId>, doc: ProjectDocument): void {
  // 1. Remove component overrides in states
  for (const state of Object.values(doc.screenStates)) {
    for (const id of removedIds) {
      deleteOwnEntity(state.componentOverrides, id)
    }
  }

  // 2. Remove/fix events that reference removed components
  for (const [eventId, event] of Object.entries(doc.events)) {
    if (removedIds.has(event.trigger.componentId)) {
      deleteOwnEntity(doc.events, eventId)
      const screen = getOwnEntity(doc.screens, event.screenId)
      if (screen) {
        screen.eventIds = screen.eventIds.filter(id => id !== eventId)
      }
      for (const component of Object.values(doc.components)) {
        if (component.config.kind === 'button' && component.config.eventId === eventId) {
          component.config.eventId = null
        }
      }
    }
  }

  // 3. Clean up API operation request bindings
  for (const apiOp of Object.values(doc.apiOperations)) {
    apiOp.requestBindings = apiOp.requestBindings.filter(b => !removedIds.has(b.componentId))
  }
}

// Clean up API operations belonging to a screen, plus callApi event actions
function cleanupScreenApiOps(screenId: EntityId, doc: ProjectDocument): void {
  const opsToRemove = Object.keys(doc.apiOperations).filter(
    id => getOwnEntity(doc.apiOperations, id)?.screenId === screenId
  )
  const opIdSet = new Set(opsToRemove)

  for (const opId of opsToRemove) {
    deleteOwnEntity(doc.apiOperations, opId)
  }

  // Remove callApi actions that reference now-deleted operations
  for (const [eventId, event] of Object.entries(doc.events)) {
    event.actions = event.actions.filter(action => {
      if (action.type === 'callApi' && opIdSet.has(action.apiOperationId)) return false
      return true
    })
    // If event has no actions left and would be invalid, remove it entirely is NOT done here
    // (events with no actions are still valid in our model)
    setOwnEntity(doc.events, eventId, event)
  }
}

// Nullify success/error state references on API ops when a state is removed
function cleanupStateRefsInApiOps(stateId: EntityId, doc: ProjectDocument): void {
  for (const apiOp of Object.values(doc.apiOperations)) {
    if (apiOp.successStateId === stateId) apiOp.successStateId = null
    if (apiOp.errorStateId === stateId) apiOp.errorStateId = null
  }
}

// Nullify setState event actions that reference a removed state
function cleanupStateRefsInEvents(stateId: EntityId, doc: ProjectDocument): void {
  for (const event of Object.values(doc.events)) {
    event.actions = event.actions.filter(action => {
      if (action.type === 'setState' && action.stateId === stateId) return false
      return true
    })
  }
}

function duplicatedFieldKey(
  sourceKey: string,
  usedKeys: Set<string>,
): string {
  const normalized = sourceKey.trim()
  if (!normalized) return ''
  const base = `${normalized}_copy`
  let candidate = base
  let suffix = 2
  while (usedKeys.has(candidate)) {
    candidate = `${base}_${suffix}`
    suffix += 1
  }
  usedKeys.add(candidate)
  return candidate
}

function duplicateComponentConfig(
  config: ComponentConfig,
  usedFieldKeys: Set<string>,
): ComponentConfig {
  const copied = cloneComponentConfig(config)
  switch (copied.kind) {
    case 'textInput':
    case 'select':
      return {
        ...copied,
        fieldKey: duplicatedFieldKey(copied.fieldKey, usedFieldKeys),
      }
    case 'button':
      return { ...copied, eventId: null }
    case 'page':
    case 'container':
    case 'text':
    case 'image':
    case 'link':
    case 'modal':
      return copied
    default:
      return assertNever(copied, 'duplicated component config')
  }
}

function snapshotSubtreeIds(snapshot: ComponentSubtreeSnapshot): EntityId[] {
  const root = getOwnEntity(snapshot.components, snapshot.rootComponentId)
  if (!root) {
    throw new DomainError('NOT_FOUND', 'Copied component root is missing')
  }
  if (root.kind === 'page' || root.kind === 'modal') {
    throw new DomainError('INVALID_PARENT', 'Independent screen roots cannot be copied')
  }

  const result: EntityId[] = []
  const visited = new Set<EntityId>()
  function visit(componentId: EntityId, expectedParentId?: EntityId): void {
    if (visited.has(componentId)) {
      throw new DomainError('INVARIANT_VIOLATION', 'Copied component subtree contains a cycle')
    }
    const component = getOwnEntity(snapshot.components, componentId)
    if (
      !component ||
      component.id !== componentId ||
      component.screenId !== snapshot.sourceScreenId ||
      (expectedParentId !== undefined && component.parentId !== expectedParentId)
    ) {
      throw new DomainError('INVARIANT_VIOLATION', 'Copied component subtree is inconsistent')
    }
    visited.add(componentId)
    result.push(componentId)
    component.childIds.forEach(childId => visit(childId, component.id))
  }
  visit(root.id)
  if (result.length !== Object.keys(snapshot.components).length) {
    throw new DomainError('INVARIANT_VIOLATION', 'Copied component snapshot contains unrelated components')
  }
  for (const overrides of Object.values(snapshot.stateOverrides)) {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      throw new DomainError('INVARIANT_VIOLATION', 'Copied state overrides must be objects')
    }
    for (const [componentId, override] of Object.entries(overrides)) {
      if (
        !visited.has(componentId) ||
        !override ||
        typeof override !== 'object' ||
        Array.isArray(override)
      ) {
        throw new DomainError('INVARIANT_VIOLATION', 'Copied state override is invalid')
      }
    }
  }
  return result
}

function validatedComponentIdMap(
  document: ProjectDocument,
  sourceIds: EntityId[],
  componentIdMap: Record<EntityId, EntityId>,
): Map<EntityId, EntityId> {
  if (
    typeof componentIdMap !== 'object' ||
    componentIdMap === null ||
    Array.isArray(componentIdMap)
  ) {
    throw new DomainError('INVARIANT_VIOLATION', 'Component ID map must be an object')
  }
  const mappedSourceIds = Object.keys(componentIdMap)
  if (
    mappedSourceIds.length !== sourceIds.length ||
    sourceIds.some(id => !hasOwnEntity(componentIdMap, id))
  ) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      'Component ID map must contain the complete source subtree',
    )
  }

  const validated = new Map<EntityId, EntityId>()
  for (const sourceId of mappedSourceIds) {
    if (!isSafeEntityId(sourceId)) {
      throw new DomainError('INVARIANT_VIOLATION', 'Component ID map contains an unsafe source ID')
    }
    const newId = getOwnEntity(componentIdMap, sourceId)
    if (!isSafeEntityId(newId)) {
      throw new DomainError('INVARIANT_VIOLATION', 'Component ID map contains an unsafe new ID')
    }
    if (hasOwnEntity(document.components, newId)) {
      throw new DomainError('INVARIANT_VIOLATION', `Component ${newId} already exists`)
    }
    validated.set(sourceId, newId)
  }
  if (new Set(validated.values()).size !== validated.size) {
    throw new DomainError('INVARIANT_VIOLATION', 'Duplicated component IDs must be unique')
  }
  return validated
}

function applyComponentSubtreeCopy(
  document: ProjectDocument,
  snapshot: ComponentSubtreeSnapshot,
  destinationScreenId: EntityId,
  destinationParentId: EntityId,
  position: number,
  componentIdMap: Record<EntityId, EntityId>,
  copyStateOverrides: boolean,
): EntityId {
  const sourceIds = snapshotSubtreeIds(snapshot)
  const mappedIds = validatedComponentIdMap(document, sourceIds, componentIdMap)
  const root = getOwnEntity(snapshot.components, snapshot.rootComponentId)
  const destinationScreen = getOwnEntity(document.screens, destinationScreenId)
  const destinationParent = getOwnEntity(document.components, destinationParentId)
  if (!root || !destinationScreen || !destinationParent) {
    throw new DomainError('NOT_FOUND', 'Paste destination is unavailable')
  }
  if (
    destinationParent.screenId !== destinationScreen.id ||
    !CONTAINER_KINDS.includes(destinationParent.kind) ||
    !Number.isInteger(position) ||
    position < 0 ||
    position > destinationParent.childIds.length
  ) {
    throw new DomainError('INVALID_PARENT', 'Paste destination cannot contain the copied subtree')
  }

  const usedFieldKeys = new Set(
    Object.values(document.components).flatMap(component => {
      if (component.screenId !== destinationScreenId) return []
      const config = component.config
      if (config.kind !== 'textInput' && config.kind !== 'select') return []
      const fieldKey = config.fieldKey.trim()
      return fieldKey ? [fieldKey] : []
    }),
  )

  for (const sourceId of sourceIds) {
    const sourceComponent = getOwnEntity(snapshot.components, sourceId)
    const newId = mappedIds.get(sourceId)
    if (!sourceComponent || !newId) {
      throw new DomainError('INVARIANT_VIOLATION', 'Copied component subtree changed during paste')
    }
    const parentId = sourceId === root.id
      ? destinationParent.id
      : sourceComponent.parentId
        ? mappedIds.get(sourceComponent.parentId)
        : undefined
    if (!parentId) {
      throw new DomainError('INVARIANT_VIOLATION', 'Copied component parent is missing')
    }
    setOwnEntity(document.components, newId, {
      ...cloneScreenComponent(sourceComponent),
      id: newId,
      screenId: destinationScreenId,
      parentId,
      childIds: sourceComponent.childIds.map(childId => {
        const copiedChildId = mappedIds.get(childId)
        if (!copiedChildId) {
          throw new DomainError('INVARIANT_VIOLATION', 'Copied component child is missing')
        }
        return copiedChildId
      }),
      config: duplicateComponentConfig(sourceComponent.config, usedFieldKeys),
    })
  }

  const copiedRootId = mappedIds.get(root.id)
  if (!copiedRootId) {
    throw new DomainError('INVARIANT_VIOLATION', 'Copied root component ID is missing')
  }
  destinationParent.childIds.splice(position, 0, copiedRootId)

  if (copyStateOverrides) {
    for (const [stateId, overrides] of Object.entries(snapshot.stateOverrides)) {
      const state = getOwnEntity(document.screenStates, stateId)
      if (!state || state.screenId !== destinationScreenId) {
        throw new DomainError('INVALID_REFERENCE', `Copied state ${stateId} is unavailable`)
      }
      for (const [sourceId, override] of Object.entries(overrides)) {
        const copiedId = mappedIds.get(sourceId)
        if (!copiedId || !getOwnEntity(snapshot.components, sourceId)) {
          throw new DomainError('INVARIANT_VIOLATION', 'Copied state override is invalid')
        }
        setOwnEntity(
          state.componentOverrides,
          copiedId,
          cloneComponentOverride(override),
        )
      }
    }
  }
  return copiedRootId
}

export function applyCommandWithoutRevision(
  doc: ProjectDocument,
  inputCommand: DomainCommand,
): ProjectDocument {
  const next = cloneProjectDocument(doc)
  const command = cloneDomainCommand(inputCommand)

  switch (command.type) {
    // ──────────── Screen commands ────────────
    case 'addScreen': {
      requireExactKeys(
        command,
        ['type', 'screenId', 'rootComponentId', 'defaultStateId', 'name', 'route'],
        'addScreen command',
      )
      const { screenId, rootComponentId, defaultStateId, name, route } = command
      if (
        hasOwnEntity(next.screens, screenId) ||
        hasOwnEntity(next.components, rootComponentId) ||
        hasOwnEntity(next.screenStates, defaultStateId)
      ) {
        throw new DomainError('INVARIANT_VIOLATION', 'New screen entity IDs must be unique')
      }
      setOwnEntity(next.screens, screenId, {
        id: screenId,
        name,
        route,
        rootComponentId,
        modalComponentIds: [],
        defaultStateId,
        stateIds: [defaultStateId],
        eventIds: [],
      })
      setOwnEntity(next.components, rootComponentId, {
        id: rootComponentId,
        screenId,
        parentId: null,
        childIds: [],
        kind: 'page',
        placement: DEFAULT_COMPONENT_PLACEMENT,
        common: { description: '', visible: true, enabled: true },
        config: { kind: 'page', ...DEFAULT_COMPONENT_LAYOUT },
      })
      setOwnEntity(next.screenStates, defaultStateId, {
        id: defaultStateId,
        screenId,
        name: 'Default',
        description: '',
        componentOverrides: {},
      })
      next.project.screenIds.push(screenId)
      break
    }

    case 'updateScreen': {
      requireExactKeys(command, ['type', 'screenId', 'name', 'route'], 'updateScreen command')
      const screen = getOwnEntity(next.screens, command.screenId)
      if (!screen) throw new DomainError('NOT_FOUND', `Screen ${command.screenId} not found`)
      if (command.name !== undefined) screen.name = command.name
      if (command.route !== undefined) screen.route = command.route
      break
    }

    case 'removeScreen': {
      requireExactKeys(command, ['type', 'screenId'], 'removeScreen command')
      const { screenId } = command
      const screen = getOwnEntity(next.screens, screenId)
      if (!screen) throw new DomainError('NOT_FOUND', `Screen ${screenId} not found`)
      if (next.project.screenIds.length <= 1) throw new DomainError('CANNOT_REMOVE_LAST_SCREEN', 'Cannot remove the last screen')

      // Check navigation references from other screens.
      for (const event of Object.values(next.events)) {
        if (event.screenId === screenId) continue
        for (const action of event.actions) {
          if (action.type === 'navigate' && action.destinationScreenId === screenId) {
            throw new DomainError('SCREEN_REFERENCED_BY_NAVIGATE', `Screen ${screenId} is referenced by a navigate action`)
          }
        }
      }
      for (const component of Object.values(next.components)) {
        if (
          component.screenId !== screenId &&
          component.config.kind === 'link' &&
          component.config.destination.type === 'internal' &&
          component.config.destination.screenId === screenId
        ) {
          throw new DomainError(
            'SCREEN_REFERENCED_BY_LINK',
            `Screen ${screenId} is referenced by link ${component.id}`,
          )
        }
      }

      // Clean references before removing entities so no dangling IDs remain.
      const screenComps = Object.values(next.components).filter(c => c.screenId === screenId)
      const removedComponentIds = new Set(screenComps.map(c => c.id))
      cleanupComponentRefs(removedComponentIds, next)
      const removedStateIds = [...screen.stateIds]
      for (const stateId of removedStateIds) {
        cleanupStateRefsInApiOps(stateId, next)
        cleanupStateRefsInEvents(stateId, next)
      }
      cleanupScreenApiOps(screenId, next)

      // Remove all components in this screen
      for (const id of removedComponentIds) deleteOwnEntity(next.components, id)

      // Remove states
      for (const stateId of removedStateIds) deleteOwnEntity(next.screenStates, stateId)
      // Remove events
      for (const eventId of screen.eventIds) deleteOwnEntity(next.events, eventId)
      // Remove screen itself
      deleteOwnEntity(next.screens, screenId)
      next.project.screenIds = next.project.screenIds.filter(id => id !== screenId)
      break
    }

    // ──────────── Component commands ────────────
    case 'addComponent': {
      requireExactKeys(
        command,
        ['type', 'componentId', 'screenId', 'parentId', 'kind', 'placement', 'config', 'position'],
        'addComponent command',
      )
      const { componentId, screenId, parentId, kind, config, position, placement: componentPlacement } = command
      if (hasOwnEntity(next.components, componentId)) {
        throw new DomainError('INVARIANT_VIOLATION', `Component ${componentId} already exists`)
      }
      const placement = classifyComponentAdd(next, screenId, parentId, kind, position)
      if (placement.status === 'invalid') throw componentPlacementError(placement.reason)
      const screen = getOwnEntity(next.screens, screenId)
      if (!screen) throw componentPlacementError('stale')

      setOwnEntity(next.components, componentId, {
        id: componentId,
        screenId,
        parentId,
        childIds: [],
        kind,
        placement: componentPlacement,
        common: { description: '', visible: true, enabled: true },
        config,
      })
      if (kind === 'modal') {
        screen.modalComponentIds.splice(placement.position, 0, componentId)
      } else {
        if (parentId === null) {
          throw componentPlacementError('componentConstraint')
        }
        const parent = getOwnEntity(next.components, parentId)
        if (!parent) throw componentPlacementError('stale')
        parent.childIds.splice(placement.position, 0, componentId)
      }
      break
    }

    case 'moveComponent': {
      requireExactKeys(
        command,
        ['type', 'componentId', 'newParentId', 'position'],
        'moveComponent command',
      )
      const { componentId, newParentId, position } = command
      const placement = classifyComponentMove(next, componentId, newParentId, position)
      if (placement.status === 'invalid') throw componentPlacementError(placement.reason)
      if (placement.status === 'no-op') {
        throw new DomainError('INVARIANT_VIOLATION', 'Component is already at that position')
      }
      const comp = getOwnEntity(next.components, componentId)
      if (!comp || comp.parentId === null) throw componentPlacementError('stale')
      const newParent = getOwnEntity(next.components, newParentId)
      if (!newParent) throw componentPlacementError('stale')
      const oldParent = getOwnEntity(next.components, comp.parentId)
      if (!oldParent) throw componentPlacementError('stale')

      oldParent.childIds = oldParent.childIds.filter(id => id !== componentId)

      comp.parentId = newParentId
      newParent.childIds.splice(placement.position, 0, componentId)
      break
    }

    case 'duplicateComponent': {
      requireExactKeys(
        command,
        ['type', 'componentId', 'componentIdMap'],
        'duplicateComponent command',
      )
      const source = getOwnEntity(next.components, command.componentId)
      if (!source) {
        throw new DomainError('NOT_FOUND', `Component ${command.componentId} not found`)
      }
      if (!source.parentId) {
        throw new DomainError('INVALID_PARENT', 'Independent screen roots cannot be duplicated')
      }
      const parent = getOwnEntity(next.components, source.parentId)
      const sourcePosition = parent?.childIds.indexOf(source.id) ?? -1
      if (!parent || sourcePosition < 0) {
        throw new DomainError('INVARIANT_VIOLATION', 'Component parent is unavailable')
      }
      const snapshot = createComponentSubtreeSnapshot(next, source.id)
      if (!snapshot) {
        throw new DomainError('INVARIANT_VIOLATION', 'Component subtree cannot be duplicated')
      }
      applyComponentSubtreeCopy(
        next,
        snapshot,
        source.screenId,
        parent.id,
        sourcePosition + 1,
        command.componentIdMap,
        true,
      )
      break
    }

    case 'pasteComponent': {
      requireExactKeys(
        command,
        [
          'type',
          'snapshot',
          'destinationComponentId',
          'destinationScreenId',
          'destinationParentId',
          'position',
          'componentIdMap',
        ],
        'pasteComponent command',
      )
      if (
        typeof command.snapshot !== 'object' ||
        command.snapshot === null ||
        Array.isArray(command.snapshot)
      ) {
        throw new DomainError('INVARIANT_VIOLATION', 'Component snapshot must be an object')
      }
      requireExactKeys(
        command.snapshot,
        ['projectId', 'sourceScreenId', 'rootComponentId', 'components', 'stateOverrides'],
        'component snapshot',
      )
      if (command.snapshot.projectId !== next.project.id) {
        throw new DomainError('INVALID_REFERENCE', 'Copied component belongs to another project')
      }
      if (
        typeof command.snapshot.components !== 'object' ||
        command.snapshot.components === null ||
        Array.isArray(command.snapshot.components) ||
        typeof command.snapshot.stateOverrides !== 'object' ||
        command.snapshot.stateOverrides === null ||
        Array.isArray(command.snapshot.stateOverrides)
      ) {
        throw new DomainError('INVARIANT_VIOLATION', 'Component snapshot data must be objects')
      }
      const target = resolveComponentPasteTarget(next, command.destinationComponentId)
      if (
        !target ||
        target.destinationScreenId !== command.destinationScreenId ||
        target.destinationParentId !== command.destinationParentId ||
        target.position !== command.position
      ) {
        throw new DomainError('INVALID_REFERENCE', 'Paste destination changed or is unavailable')
      }
      applyComponentSubtreeCopy(
        next,
        command.snapshot,
        command.destinationScreenId,
        command.destinationParentId,
        command.position,
        command.componentIdMap,
        command.snapshot.sourceScreenId === command.destinationScreenId,
      )
      break
    }

    case 'removeComponent': {
      requireExactKeys(command, ['type', 'componentId'], 'removeComponent command')
      const comp = getOwnEntity(next.components, command.componentId)
      if (!comp) throw new DomainError('NOT_FOUND', `Component ${command.componentId} not found`)
      const screen = getOwnEntity(next.screens, comp.screenId)
      if (!screen) throw new DomainError('INVARIANT_VIOLATION', 'Component owner screen not found')
      if (comp.id === screen.rootComponentId) {
        throw new DomainError('CANNOT_REMOVE_ROOT', 'Cannot remove the page root component')
      }

      if (comp.parentId === null) {
        if (comp.kind !== 'modal' || !screen.modalComponentIds.includes(comp.id)) {
          throw new DomainError('INVARIANT_VIOLATION', 'Only listed modal roots can be removed')
        }
        screen.modalComponentIds = screen.modalComponentIds.filter(id => id !== comp.id)
      } else {
        const parent = getOwnEntity(next.components, comp.parentId)
        if (parent) {
          parent.childIds = parent.childIds.filter(id => id !== command.componentId)
        }
      }

      const removed = removeSubtree(command.componentId, next)
      cleanupComponentRefs(new Set(removed), next)
      break
    }

    case 'updateComponentSpec': {
      requireExactKeys(command, ['type', 'componentId', 'patch'], 'updateComponentSpec command')
      requireExactKeys(command.patch, ['common', 'config', 'placement'], 'updateComponentSpec patch')
      if (Object.keys(command.patch).length === 0) {
        throw new DomainError('INVARIANT_VIOLATION', 'updateComponentSpec patch must not be empty')
      }
      const comp = getOwnEntity(next.components, command.componentId)
      if (!comp) throw new DomainError('NOT_FOUND', `Component ${command.componentId} not found`)
      const { patch } = command
      if (patch.common) comp.common = { ...comp.common, ...patch.common }
      if (patch.config) comp.config = { ...comp.config, ...patch.config } as typeof comp.config
      if (patch.placement) {
        if (comp.parentId === null && patch.placement.mode !== 'flow') {
          throw new DomainError(
            'INVARIANT_VIOLATION',
            'Independent root placement must remain flow',
          )
        }
        comp.placement = patch.placement
      }
      break
    }

    // ──────────── State commands ────────────
    case 'createScreenState': {
      requireExactKeys(
        command,
        ['type', 'stateId', 'screenId', 'name', 'description', 'overrides'],
        'createScreenState command',
      )
      const { stateId, screenId, name, description, overrides } = command
      const screen = getOwnEntity(next.screens, screenId)
      if (!screen) throw new DomainError('NOT_FOUND', `Screen ${screenId} not found`)
      if (hasOwnEntity(next.screenStates, stateId)) {
        throw new DomainError('INVARIANT_VIOLATION', `State ${stateId} already exists`)
      }
      setOwnEntity(next.screenStates, stateId, {
        id: stateId,
        screenId,
        name,
        description: description ?? '',
        componentOverrides: overrides ?? {},
      })
      screen.stateIds.push(stateId)
      break
    }

    case 'updateScreenState': {
      requireExactKeys(
        command,
        ['type', 'stateId', 'name', 'description', 'overrides'],
        'updateScreenState command',
      )
      const state = getOwnEntity(next.screenStates, command.stateId)
      if (!state) throw new DomainError('NOT_FOUND', `State ${command.stateId} not found`)
      const owner = getOwnEntity(next.screens, state.screenId)
      if (!owner) {
        throw new DomainError('INVARIANT_VIOLATION', `State ${state.id} owner screen not found`)
      }
      if (state.id === owner.defaultStateId && command.overrides !== undefined) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          'Default state overrides cannot be changed',
        )
      }
      if (command.name !== undefined) state.name = command.name
      if (command.description !== undefined) state.description = command.description
      if (command.overrides !== undefined) state.componentOverrides = command.overrides
      break
    }

    case 'removeScreenState': {
      requireExactKeys(command, ['type', 'stateId'], 'removeScreenState command')
      const state = getOwnEntity(next.screenStates, command.stateId)
      if (!state) throw new DomainError('NOT_FOUND', `State ${command.stateId} not found`)
      const screen = getOwnEntity(next.screens, state.screenId)
      if (!screen) {
        throw new DomainError('INVARIANT_VIOLATION', `State ${state.id} owner screen not found`)
      }
      if (state.id === screen.defaultStateId) {
        throw new DomainError('INVARIANT_VIOLATION', 'Cannot remove the default state')
      }
      screen.stateIds = screen.stateIds.filter(id => id !== command.stateId)
      // Cleanup API op success/error state refs
      cleanupStateRefsInApiOps(command.stateId, next)
      // Cleanup setState event actions
      cleanupStateRefsInEvents(command.stateId, next)
      deleteOwnEntity(next.screenStates, command.stateId)
      break
    }

    // ──────────── Event commands ────────────
    case 'connectEvent': {
      requireExactKeys(
        command,
        ['type', 'eventId', 'screenId', 'name', 'trigger', 'actions'],
        'connectEvent command',
      )
      const { eventId, screenId, name, trigger, actions } = command
      const screen = getOwnEntity(next.screens, screenId)
      if (!screen) throw new DomainError('NOT_FOUND', `Screen ${screenId} not found`)
      if (hasOwnEntity(next.events, eventId)) {
        throw new DomainError('INVARIANT_VIOLATION', `Event ${eventId} already exists`)
      }
      setOwnEntity(next.events, eventId, { id: eventId, screenId, name, trigger, actions })
      if (!screen.eventIds.includes(eventId)) screen.eventIds.push(eventId)
      break
    }

    case 'updateEvent': {
      requireExactKeys(
        command,
        ['type', 'eventId', 'name', 'trigger', 'actions'],
        'updateEvent command',
      )
      const event = getOwnEntity(next.events, command.eventId)
      if (!event) throw new DomainError('NOT_FOUND', `Event ${command.eventId} not found`)
      event.name = command.name
      event.trigger = command.trigger
      event.actions = command.actions
      for (const component of Object.values(next.components)) {
        if (
          component.config.kind === 'button' &&
          component.config.eventId === command.eventId &&
          component.id !== command.trigger.componentId
        ) {
          component.config.eventId = null
        }
      }
      break
    }

    case 'removeEvent': {
      requireExactKeys(command, ['type', 'eventId'], 'removeEvent command')
      const event = getOwnEntity(next.events, command.eventId)
      if (!event) throw new DomainError('NOT_FOUND', `Event ${command.eventId} not found`)
      const screen = getOwnEntity(next.screens, event.screenId)
      if (screen) screen.eventIds = screen.eventIds.filter(id => id !== command.eventId)
      for (const component of Object.values(next.components)) {
        if (component.config.kind === 'button' && component.config.eventId === command.eventId) {
          component.config.eventId = null
        }
      }
      deleteOwnEntity(next.events, command.eventId)
      break
    }

    // ──────────── API commands ────────────
    case 'bindApiOperation': {
      requireExactKeys(
        command,
        [
          'type',
          'operationId',
          'screenId',
          'name',
          'method',
          'path',
          'requestBindings',
          'successStateId',
          'errorStateId',
        ],
        'bindApiOperation command',
      )
      const { operationId, screenId, name, method, path, requestBindings, successStateId, errorStateId } = command
      if (!hasOwnEntity(next.screens, screenId)) {
        throw new DomainError('NOT_FOUND', `Screen ${screenId} not found`)
      }
      if (hasOwnEntity(next.apiOperations, operationId)) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${operationId} already exists`)
      }
      setOwnEntity(next.apiOperations, operationId, {
        id: operationId,
        screenId,
        name,
        method,
        path,
        requestBindings: requestBindings ?? [],
        successStateId: successStateId ?? null,
        errorStateId: errorStateId ?? null,
      })
      break
    }

    case 'updateApiOperation': {
      requireExactKeys(
        command,
        [
          'type',
          'operationId',
          'name',
          'method',
          'path',
          'requestBindings',
          'successStateId',
          'errorStateId',
        ],
        'updateApiOperation command',
      )
      const operation = getOwnEntity(next.apiOperations, command.operationId)
      if (!operation) {
        throw new DomainError('NOT_FOUND', `API operation ${command.operationId} not found`)
      }
      operation.name = command.name
      operation.method = command.method
      operation.path = command.path
      operation.requestBindings = command.requestBindings
      operation.successStateId = command.successStateId
      operation.errorStateId = command.errorStateId
      break
    }

    case 'removeApiOperation': {
      requireExactKeys(command, ['type', 'operationId'], 'removeApiOperation command')
      const op = getOwnEntity(next.apiOperations, command.operationId)
      if (!op) throw new DomainError('NOT_FOUND', `API operation ${command.operationId} not found`)
      // Remove callApi references to this operation in events
      for (const event of Object.values(next.events)) {
        event.actions = event.actions.filter(action => {
          if (action.type === 'callApi' && action.apiOperationId === command.operationId) return false
          return true
        })
      }
      deleteOwnEntity(next.apiOperations, command.operationId)
      break
    }

    default: {
      const runtimeCommand = command as { type?: unknown }
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Unsupported command type: ${String(runtimeCommand.type)}`,
      )
    }
  }

  validateInvariants(next)
  return next
}

export function applyCommand(doc: ProjectDocument, command: DomainCommand): ProjectDocument {
  const revision = nextRevision(doc.revision)
  const next = applyCommandWithoutRevision(doc, command)
  next.revision = revision
  return next
}

export function applyTransaction(doc: ProjectDocument, commands: DomainCommand[]): ProjectDocument {
  const revision = nextRevision(doc.revision)
  let current = cloneProjectDocument(doc)
  for (const command of commands) {
    current = applyCommandWithoutRevision(current, command)
  }
  current.revision = revision
  return current
}
