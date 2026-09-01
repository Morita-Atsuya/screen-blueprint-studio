import type { ComponentLayout, ProjectDocument, Screen, EntityId } from './model'
import { CONTAINER_KINDS, LEAF_KINDS } from './model'
import { DomainError } from './errors'
import {
  validateComponentOverride,
  validateProjectDocumentMetadata,
  validateScreenComponent,
} from './runtimeValidation'
import { getOwnEntity, hasOwnEntity } from './entityMap'
import { isRootSizing, validateSizingContext } from './componentSizing'

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

  // 2. at least one screen
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
    validateScreenComponent(comp, `components.${comp.id}`)
    if (!hasOwnEntity(screens, comp.screenId)) {
      throw new DomainError('INVARIANT_VIOLATION', `Component ${comp.id} references non-existent screen ${comp.screenId}`)
    }
    if (
      comp.config.kind === 'link' &&
      comp.config.destination.type === 'internal' &&
      !hasOwnEntity(screens, comp.config.destination.screenId)
    ) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Link ${comp.id} references non-existent screen ${comp.config.destination.screenId}`,
      )
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
    const boundComponentIds = new Set<EntityId>()
    const targetPaths = new Set<string>()
    for (const binding of apiOp.requestBindings) {
      const component = getOwnEntity(components, binding.componentId)
      if (!component) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} binding references non-existent component ${binding.componentId}`)
      }
      if (component.screenId !== apiOp.screenId) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} binding component belongs to a different screen`)
      }
      if (component.kind !== 'textInput' && component.kind !== 'select') {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} binding component must be an input`)
      }
      if (boundComponentIds.has(binding.componentId)) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} has duplicate binding component ${binding.componentId}`)
      }
      const targetPath = binding.targetPath.trim()
      if (targetPath.length === 0) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} binding targetPath must not be empty`)
      }
      if (targetPaths.has(targetPath)) {
        throw new DomainError('INVARIANT_VIOLATION', `API operation ${apiOp.id} has duplicate binding targetPath ${targetPath}`)
      }
      boundComponentIds.add(binding.componentId)
      targetPaths.add(targetPath)
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
      if (action.type === 'navigate' && !hasOwnEntity(screens, action.destinationScreenId)) {
        throw new DomainError('INVARIANT_VIOLATION', `Event ${event.id} action references non-existent destination screen ${action.destinationScreenId}`)
      }
    }
  }
}

function validateScreen(screen: Screen, doc: ProjectDocument): void {
  const { components, screenStates, events } = doc

  // Each screen has one page root and zero or more independent modal roots.
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

  if (root.parentId !== null) {
    throw new DomainError('INVARIANT_VIOLATION', `Root component must have parentId null`)
  }

  const rootIds = [screen.rootComponentId, ...screen.modalComponentIds]
  if (new Set(rootIds).size !== rootIds.length) {
    throw new DomainError('INVARIANT_VIOLATION', `Screen ${screen.id} root IDs must be unique`)
  }
  for (const modalId of screen.modalComponentIds) {
    const modal = getOwnEntity(components, modalId)
    if (!modal || modal.screenId !== screen.id || modal.kind !== 'modal' || modal.parentId !== null) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Modal root ${modalId} must be a parentless modal on screen ${screen.id}`,
      )
    }
  }

  const screenComponents = Object.values(components).filter(c => c.screenId === screen.id)
  const reached = new Set<EntityId>()
  const visiting = new Set<EntityId>()

  function visit(componentId: EntityId, expectedParentId: EntityId | null): void {
    if (visiting.has(componentId)) {
      throw new DomainError('INVARIANT_VIOLATION', `Cycle detected at component ${componentId}`)
    }
    if (reached.has(componentId)) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Component ${componentId} is reachable from more than one screen root`,
      )
    }
    const component = getOwnEntity(components, componentId)
    if (!component || component.screenId !== screen.id) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Component ${componentId} is missing or belongs to a different screen`,
      )
    }
    if (component.parentId !== expectedParentId) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Component ${componentId} has inconsistent parentId`,
      )
    }
    visiting.add(componentId)
    reached.add(componentId)
    for (const childId of component.childIds) visit(childId, component.id)
    visiting.delete(componentId)
  }

  for (const rootId of rootIds) visit(rootId, null)
  if (reached.size !== screenComponents.length) {
    const orphan = screenComponents.find(component => !reached.has(component.id))
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `Component ${orphan?.id ?? 'unknown'} is not reachable from the page or a modal root`,
    )
  }

  for (const comp of screenComponents) {
    const isPageRoot = comp.id === screen.rootComponentId
    const isModalRoot = screen.modalComponentIds.includes(comp.id)
    if (isPageRoot || isModalRoot) {
      if (!isRootSizing(comp.sizing)) {
        throw new DomainError(
          'INVARIANT_VIOLATION',
          `Independent root ${comp.id} must use fixed root sizing`,
        )
      }
    } else {
      const parent = comp.parentId ? getOwnEntity(components, comp.parentId) : undefined
      const parentLayout: ComponentLayout | null = parent && (
        parent.config.kind === 'page' ||
        parent.config.kind === 'container' ||
        parent.config.kind === 'modal'
      ) ? parent.config : null
      validateSizingContext(comp.sizing, comp.placement, parentLayout, `Component ${comp.id} sizing`)
    }
    if ((isPageRoot || isModalRoot) && comp.placement.mode !== 'flow') {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Independent root ${comp.id} placement must be flow`,
      )
    }
    if (comp.parentId === null && !isPageRoot && !isModalRoot) {
      throw new DomainError('INVARIANT_VIOLATION', `Unlisted component root ${comp.id}`)
    }
    if (comp.kind === 'page' && !isPageRoot) {
      throw new DomainError('INVARIANT_VIOLATION', `Page component ${comp.id} must be the screen root`)
    }
    if (comp.kind === 'modal' && !isModalRoot) {
      throw new DomainError('INVARIANT_VIOLATION', `Modal component ${comp.id} must be an independent root`)
    }
    if (!isPageRoot && !isModalRoot) {
      if (comp.parentId === null) {
        throw new DomainError('INVARIANT_VIOLATION', `Component ${comp.id} requires a parent`)
      }
      const parent = getOwnEntity(components, comp.parentId)
      if (!parent || parent.screenId !== screen.id) {
        throw new DomainError('INVARIANT_VIOLATION', `Component ${comp.id} parent not in same screen`)
      }
    }

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

    if (LEAF_KINDS.includes(comp.kind) && comp.childIds.length > 0) {
      throw new DomainError('INVARIANT_VIOLATION', `Leaf component ${comp.id} (${comp.kind}) must have no children`)
    }

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

  // fieldKey uniqueness per screen (only non-empty, trimmed keys)
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

  // References exist; navigate can point to other screens.
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

  // defaultStateId identifies one listed state.
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
    if (state.id === screen.defaultStateId && Object.keys(state.componentOverrides).length > 0) {
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
  const defaultState = getOwnEntity(screenStates, screen.defaultStateId)
  if (!defaultState || defaultState.screenId !== screen.id) {
    throw new DomainError('INVARIANT_VIOLATION', `defaultStateId ${screen.defaultStateId} must reference a state on screen ${screen.id}`)
  }
  if (!screen.stateIds.includes(screen.defaultStateId)) {
    throw new DomainError('INVARIANT_VIOLATION', `defaultStateId not in screen.stateIds`)
  }
}
