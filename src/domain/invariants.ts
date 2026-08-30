import type { ProjectDocument, Screen, ScreenComponent, EntityId } from './model'
import { CONTAINER_KINDS, LEAF_KINDS } from './model'
import { DomainError } from './errors'
import {
  validateComponentOverride,
  validateProjectDocumentMetadata,
} from './runtimeValidation'
import { getOwnEntity, hasOwnEntity } from './entityMap'

export function validateInvariants(doc: ProjectDocument): void {
  validateProjectDocumentMetadata(doc)
  const { project, screens, components } = doc

  // 1. screenIds uniqueness and existence
  const screenIdSet = new Set(project.screenIds)
  if (screenIdSet.size !== project.screenIds.length) {
    throw new DomainError('INVARIANT_VIOLATION', 'Project screenIds contains duplicates')
  }
  for (const sid of project.screenIds) {
    if (!hasOwnEntity(screens, sid)) {
      throw new DomainError('INVARIANT_VIOLATION', `Screen ${sid} referenced in project.screenIds but not found`)
    }
  }

  // 2. entryScreenId references a screen in screenIds
  if (!screenIdSet.has(project.entryScreenId)) {
    throw new DomainError('INVARIANT_VIOLATION', `entryScreenId ${project.entryScreenId} not in screenIds`)
  }

  // 16. at least one screen
  if (project.screenIds.length === 0) {
    throw new DomainError('INVARIANT_VIOLATION', 'Project must have at least one screen')
  }

  for (const screen of Object.values(screens)) {
    if (!screenIdSet.has(screen.id)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Screen ${screen.id} is not listed in project.screenIds`,
      )
    }
    validateScreen(screen, doc)
  }

  // Orphan component check
  for (const comp of Object.values(components)) {
    if (!hasOwnEntity(screens, comp.screenId)) {
      throw new DomainError('INVARIANT_VIOLATION', `Component ${comp.id} references non-existent screen ${comp.screenId}`)
    }
    if (
      (comp.config.kind === 'textInput' || comp.config.kind === 'select') &&
      comp.config.requestBinding !== null
    ) {
      const target = getOwnEntity(components, comp.config.requestBinding.componentId)
      if (!target) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Component ${comp.id} requestBinding references non-existent component ${comp.config.requestBinding.componentId}`,
        )
      }
      if (target.screenId !== comp.screenId) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Component ${comp.id} requestBinding target belongs to a different screen`,
        )
      }
    }
  }

  for (const state of Object.values(doc.screenStates)) {
    const owner = getOwnEntity(screens, state.screenId)
    if (!owner || !owner.stateIds.includes(state.id)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `State ${state.id} is not listed by its owning screen`,
      )
    }
  }

  // 3. route uniqueness
  const routes = Object.values(screens).map(s => s.route)
  if (new Set(routes).size !== routes.length) {
    throw new DomainError('INVARIANT_VIOLATION', 'Screen routes must be unique')
  }

  // Validate API operations
  for (const apiOp of Object.values(doc.apiOperations)) {
    if (!hasOwnEntity(screens, apiOp.screenId)) {
      throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} references non-existent screen ${apiOp.screenId}`)
    }
    for (const binding of apiOp.requestBindings) {
      const component = getOwnEntity(components, binding.componentId)
      if (!component) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} binding references non-existent component ${binding.componentId}`)
      }
      if (component.screenId !== apiOp.screenId) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} binding component belongs to a different screen`)
      }
    }
    if (apiOp.successStateId !== null) {
      const st = getOwnEntity(doc.screenStates, apiOp.successStateId)
      if (!st) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} successStateId ${apiOp.successStateId} not found`)
      }
      if (st.screenId !== apiOp.screenId) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} successStateId belongs to a different screen`)
      }
    }
    if (apiOp.errorStateId !== null) {
      const st = getOwnEntity(doc.screenStates, apiOp.errorStateId)
      if (!st) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} errorStateId ${apiOp.errorStateId} not found`)
      }
      if (st.screenId !== apiOp.screenId) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} errorStateId belongs to a different screen`)
      }
    }
  }

  // Validate event actions
  for (const event of Object.values(doc.events)) {
    const eventScreen = getOwnEntity(screens, event.screenId)
    if (!eventScreen) {
      throw new DomainError('INVARIANT_VIOLATION', `Event ${event.id} references non-existent screen ${event.screenId}`)
    }
    if (!eventScreen.eventIds.includes(event.id)) {
      throw new DomainError('INVARIANT_VIOLATION', `Event ${event.id} is not listed by screen ${event.screenId}`)
    }
    const triggerComponent = getOwnEntity(components, event.trigger.componentId)
    if (!triggerComponent) {
      throw new DomainError('INVARIANT_VIOLATION', `Event ${event.id} trigger references non-existent component ${event.trigger.componentId}`)
    }
    if (triggerComponent.screenId !== event.screenId) {
      throw new DomainError('INVARIANT_VIOLATION', `Event ${event.id} trigger component belongs to a different screen`)
    }
    for (const action of event.actions) {
      if (action.type === 'setState') {
        const state = getOwnEntity(doc.screenStates, action.stateId)
        if (!state) {
          throw new DomainError('INVARIANT_VIOLATION', `Event ${event.id} action references non-existent state ${action.stateId}`)
        }
        if (state.screenId !== event.screenId) {
          throw new DomainError('INVARIANT_VIOLATION', `Event ${event.id} state action belongs to a different screen`)
        }
      }
      if (action.type === 'callApi') {
        const apiOperation = getOwnEntity(doc.apiOperations, action.apiOperationId)
        if (!apiOperation) {
          throw new DomainError('INVARIANT_VIOLATION', `Event ${event.id} action references non-existent API operation ${action.apiOperationId}`)
        }
        if (apiOperation.screenId !== event.screenId) {
          throw new DomainError('INVARIANT_VIOLATION', `Event ${event.id} API action belongs to a different screen`)
        }
      }
      if (action.type === 'showAlert') {
        const alert = getOwnEntity(components, action.componentId)
        if (!alert) {
          throw new DomainError('INVARIANT_VIOLATION', `Event ${event.id} action references non-existent alert component ${action.componentId}`)
        }
        if (alert.screenId !== event.screenId || alert.kind !== 'alert') {
          throw new DomainError('INVARIANT_VIOLATION', `Event ${event.id} showAlert action must reference an alert on the same screen`)
        }
      }
      if (action.type === 'navigate' && !hasOwnEntity(screens, action.destinationScreenId)) {
        throw new DomainError('INVARIANT_VIOLATION', `Event ${event.id} action references non-existent destination screen ${action.destinationScreenId}`)
      }
    }
  }
}

function validateScreen(screen: Screen, doc: ProjectDocument): void {
  const { components, screenStates, events } = doc

  // 4. each screen has exactly one page-type root
  const root = getOwnEntity(components, screen.rootComponentId)
  if (!root) {
    throw new DomainError('INVARIANT_VIOLATION', `Root component ${screen.rootComponentId} not found`)
  }
  if (root.kind !== 'page') {
    throw new DomainError('INVARIANT_VIOLATION', `Root component must be kind 'page'`)
  }
  if (root.screenId !== screen.id) {
    throw new DomainError('INVARIANT_VIOLATION', `Root component must belong to screen ${screen.id}`)
  }

  // 5. root parentId is null
  if (root.parentId !== null) {
    throw new DomainError('INVARIANT_VIOLATION', `Root component must have parentId null`)
  }

  // Collect all components in this screen
  const screenComponents = Object.values(components).filter(c => c.screenId === screen.id)

  for (const comp of screenComponents) {
    // 6. non-root has parent in same screen
    if (comp.id !== screen.rootComponentId) {
      if (comp.parentId === null) {
        throw new DomainError('INVARIANT_VIOLATION', `Non-root component ${comp.id} has null parentId`)
      }
      const parent = getOwnEntity(components, comp.parentId)
      if (!parent || parent.screenId !== screen.id) {
        throw new DomainError('INVARIANT_VIOLATION', `Component ${comp.id} parent not in same screen`)
      }
    }

    // 7. bidirectional parent/child consistency
    if (comp.parentId !== null) {
      const parent = getOwnEntity(components, comp.parentId)
      if (!parent?.childIds.includes(comp.id)) {
        throw new DomainError('INVARIANT_VIOLATION', `Parent ${comp.parentId} does not list ${comp.id} in childIds`)
      }
    }
    for (const childId of comp.childIds) {
      const child = getOwnEntity(components, childId)
      if (!child || child.parentId !== comp.id) {
        throw new DomainError('INVARIANT_VIOLATION', `Child ${childId} of ${comp.id} has inconsistent parentId`)
      }
    }

    // 8. no cycles
    checkNoCycle(comp.id, components)

    // 9. leaf components have empty childIds
    if (LEAF_KINDS.includes(comp.kind) && comp.childIds.length > 0) {
      throw new DomainError('INVARIANT_VIOLATION', `Leaf component ${comp.id} (${comp.kind}) must have no children`)
    }

    // 10. containers only accept valid children
    if (comp.childIds.length > 0 && !CONTAINER_KINDS.includes(comp.kind)) {
      throw new DomainError('INVARIANT_VIOLATION', `Non-container ${comp.id} (${comp.kind}) must not have children`)
    }

    if (comp.config.kind === 'button' && comp.config.eventId !== null) {
      const event = getOwnEntity(events, comp.config.eventId)
      if (!event || event.screenId !== screen.id) {
        throw new DomainError('INVARIANT_VIOLATION', `Button ${comp.id} references an event outside its screen`)
      }
    }
  }

  // 11. fieldKey uniqueness per screen (only non-empty, trimmed keys)
  const fieldKeys: string[] = []
  for (const comp of screenComponents) {
    if (comp.config.kind === 'textInput' || comp.config.kind === 'select') {
      const trimmedKey = comp.config.fieldKey.trim()
      if (trimmedKey) {
        if (fieldKeys.includes(trimmedKey)) {
          throw new DomainError('INVARIANT_VIOLATION', `Duplicate fieldKey '${trimmedKey}' in screen ${screen.id}`)
        }
        fieldKeys.push(trimmedKey)
      }
    }
  }

  // 12. references exist; navigate can point to other screens
  for (const eventId of screen.eventIds) {
    const event = getOwnEntity(events, eventId)
    if (!event || event.screenId !== screen.id) {
      throw new DomainError('INVARIANT_VIOLATION', `Event ${eventId} not found or belongs to different screen`)
    }
    for (const action of event.actions) {
      if (action.type === 'setState') {
        if (!hasOwnEntity(screenStates, action.stateId)) {
          throw new DomainError('INVARIANT_VIOLATION', `State ${action.stateId} referenced by event action not found`)
        }
      }
    }
  }

  // 13. exactly one default state, defaultStateId references it
  let defaultCount = 0
  for (const stateId of screen.stateIds) {
    const state = getOwnEntity(screenStates, stateId)
    if (!state || state.screenId !== screen.id) {
      throw new DomainError('INVARIANT_VIOLATION', `State ${stateId} not found or belongs to different screen`)
    }
    if (
      typeof state.componentOverrides !== 'object' ||
      state.componentOverrides === null ||
      Array.isArray(state.componentOverrides)
    ) {
      throw new DomainError('INVARIANT_VIOLATION', `State ${state.id} componentOverrides must be an object`)
    }
    if (state.kind === 'default') defaultCount++
    if (state.kind === 'default' && Object.keys(state.componentOverrides).length > 0) {
      throw new DomainError('INVARIANT_VIOLATION', `Default state ${state.id} must not contain component overrides`)
    }
    for (const componentId of Object.keys(state.componentOverrides)) {
      const component = getOwnEntity(components, componentId)
      if (!component || component.screenId !== screen.id) {
        throw new DomainError('INVARIANT_VIOLATION', `State ${state.id} override references a component outside its screen`)
      }
      validateComponentOverride(
        getOwnEntity(state.componentOverrides, componentId),
        component,
        `State ${state.id}.componentOverrides.${componentId}`,
      )
    }
  }
  if (defaultCount !== 1) {
    throw new DomainError('INVARIANT_VIOLATION', `Screen ${screen.id} must have exactly one default state, found ${defaultCount}`)
  }
  const defaultState = getOwnEntity(screenStates, screen.defaultStateId)
  if (!defaultState || defaultState.kind !== 'default') {
    throw new DomainError('INVARIANT_VIOLATION', `defaultStateId ${screen.defaultStateId} must reference a state with kind 'default'`)
  }
  if (!screen.stateIds.includes(screen.defaultStateId)) {
    throw new DomainError('INVARIANT_VIOLATION', `defaultStateId not in screen.stateIds`)
  }
}

function checkNoCycle(startId: EntityId, components: Record<EntityId, ScreenComponent>): void {
  const visited = new Set<EntityId>()
  function dfs(id: EntityId) {
    if (visited.has(id)) {
      throw new DomainError('INVARIANT_VIOLATION', `Cycle detected at component ${id}`)
    }
    visited.add(id)
    const comp = getOwnEntity(components, id)
    if (comp) {
      for (const childId of comp.childIds) dfs(childId)
    }
    visited.delete(id)
  }
  dfs(startId)
}
