import type {
  ComponentKind,
  ComponentLayout,
  EntityId,
  ProjectDocument,
  ScreenComponent,
} from './model'
import { CONTAINER_KINDS, isInlineScreenComponent } from './model'
import { getOwnEntity } from './entityMap'
import { DomainError } from './errors'
import { validateSizingContext } from './componentSizing'

export type ComponentPlacementInvalidReason =
  | 'root'
  | 'selfOrDescendant'
  | 'parentCannotContainChildren'
  | 'componentConstraint'
  | 'crossScreen'
  | 'stale'
  | 'invalidPosition'
  | 'domainValidation'

export type ComponentMoveOutcome =
  | { status: 'moved'; position: number }
  | { status: 'no-op'; position: number }
  | { status: 'invalid'; reason: ComponentPlacementInvalidReason }

export type ComponentAddOutcome =
  | { status: 'moved'; parentId: EntityId | null; position: number }
  | { status: 'invalid'; reason: ComponentPlacementInvalidReason }

interface MoveContext {
  component: ScreenComponent
  oldParent: ScreenComponent
  newParent: ScreenComponent
  oldIndex: number
}

function invalid(reason: ComponentPlacementInvalidReason): {
  status: 'invalid'
  reason: ComponentPlacementInvalidReason
} {
  return { status: 'invalid', reason }
}

function moveContext(
  document: ProjectDocument,
  componentId: EntityId,
  newParentId: EntityId,
  targetScreenId?: EntityId,
): MoveContext | { status: 'invalid'; reason: ComponentPlacementInvalidReason } {
  const component = getOwnEntity(document.components, componentId)
  if (!component) return invalid('stale')
  if (component.parentId === null) return invalid('root')

  const newParent = getOwnEntity(document.components, newParentId)
  if (!newParent) return invalid('stale')
  if (targetScreenId !== undefined && newParent.screenId !== targetScreenId) {
    return invalid('stale')
  }
  if (component.screenId !== newParent.screenId) return invalid('crossScreen')
  if (!isInlineScreenComponent(newParent) || !CONTAINER_KINDS.includes(newParent.kind)) {
    return invalid('parentCannotContainChildren')
  }

  let ancestor: ScreenComponent | undefined = newParent
  const visited = new Set<EntityId>()
  while (ancestor) {
    if (ancestor.id === component.id) return invalid('selfOrDescendant')
    if (visited.has(ancestor.id)) return invalid('stale')
    visited.add(ancestor.id)
    if (ancestor.parentId === null) break
    ancestor = getOwnEntity(document.components, ancestor.parentId)
    if (!ancestor) return invalid('stale')
  }

  const oldParent = getOwnEntity(document.components, component.parentId)
  if (!oldParent || !isInlineScreenComponent(oldParent)) return invalid('stale')
  const oldIndex = oldParent.childIds.indexOf(component.id)
  if (oldIndex < 0) return invalid('stale')
  try {
    validateSizingContext(
      component.sizing,
      component.placement,
      newParent.config as ComponentLayout,
      `Component ${component.id} sizing`,
    )
  } catch {
    return invalid('domainValidation')
  }
  return { component, oldParent, newParent, oldIndex }
}

export function classifyComponentMove(
  document: ProjectDocument,
  componentId: EntityId,
  newParentId: EntityId,
  position?: number,
): ComponentMoveOutcome {
  const context = moveContext(document, componentId, newParentId)
  if ('status' in context) return context

  const sameParent = context.oldParent.id === context.newParent.id
  const maxPosition = sameParent
    ? context.newParent.childIds.length - 1
    : context.newParent.childIds.length
  const nextPosition = position ?? maxPosition
  if (
    !Number.isInteger(nextPosition) ||
    nextPosition < 0 ||
    nextPosition > maxPosition
  ) {
    return invalid('invalidPosition')
  }
  return sameParent && nextPosition === context.oldIndex
    ? { status: 'no-op', position: nextPosition }
    : { status: 'moved', position: nextPosition }
}

export function classifyComponentDrop(
  document: ProjectDocument,
  componentId: EntityId,
  targetScreenId: EntityId,
  newParentId: EntityId,
  dropPosition: number,
): ComponentMoveOutcome {
  const context = moveContext(document, componentId, newParentId, targetScreenId)
  if ('status' in context) return context
  if (context.component.screenId !== targetScreenId) return invalid('crossScreen')
  if (
    !Number.isInteger(dropPosition) ||
    dropPosition < 0 ||
    dropPosition > context.newParent.childIds.length
  ) {
    return invalid('invalidPosition')
  }

  const sameParent = context.oldParent.id === context.newParent.id
  const normalizedPosition = sameParent && context.oldIndex < dropPosition
    ? dropPosition - 1
    : dropPosition
  return classifyComponentMove(
    document,
    componentId,
    newParentId,
    normalizedPosition,
  )
}

export function classifyComponentAdd(
  document: ProjectDocument,
  screenId: EntityId,
  parentId: EntityId | null,
  kind: ComponentKind,
  position?: number,
): ComponentAddOutcome {
  const screen = getOwnEntity(document.screens, screenId)
  if (!screen) return invalid('stale')
  if (kind === 'page') return invalid('componentConstraint')

  if (kind === 'modal') {
    if (parentId !== null) return invalid('componentConstraint')
    const nextPosition = position ?? screen.modalComponentIds.length
    if (
      !Number.isInteger(nextPosition) ||
      nextPosition < 0 ||
      nextPosition > screen.modalComponentIds.length
    ) {
      return invalid('invalidPosition')
    }
    return { status: 'moved', parentId: null, position: nextPosition }
  }

  if (parentId === null) return invalid('componentConstraint')
  const parent = getOwnEntity(document.components, parentId)
  if (!parent) return invalid('stale')
  if (parent.screenId !== screen.id) return invalid('crossScreen')
  if (!isInlineScreenComponent(parent) || !CONTAINER_KINDS.includes(parent.kind)) {
    return invalid('parentCannotContainChildren')
  }
  const nextPosition = position ?? parent.childIds.length
  if (
    !Number.isInteger(nextPosition) ||
    nextPosition < 0 ||
    nextPosition > parent.childIds.length
  ) {
    return invalid('invalidPosition')
  }
  return { status: 'moved', parentId, position: nextPosition }
}

export function classifyPaletteDrop(
  document: ProjectDocument,
  screenId: EntityId,
  targetParentId: EntityId,
  dropPosition: number,
  kind: Exclude<ComponentKind, 'page'>,
): ComponentAddOutcome {
  const targetParent = getOwnEntity(document.components, targetParentId)
  if (!targetParent || targetParent.screenId !== screenId) return invalid('stale')
  if (!isInlineScreenComponent(targetParent) || !CONTAINER_KINDS.includes(targetParent.kind)) {
    return invalid('parentCannotContainChildren')
  }
  if (
    !Number.isInteger(dropPosition) ||
    dropPosition < 0 ||
    dropPosition > targetParent.childIds.length
  ) {
    return invalid('invalidPosition')
  }
  return classifyComponentAdd(
    document,
    screenId,
    kind === 'modal' ? null : targetParentId,
    kind,
    kind === 'modal' ? undefined : dropPosition,
  )
}

export function componentPlacementError(
  reason: ComponentPlacementInvalidReason,
): DomainError {
  switch (reason) {
    case 'root':
      return new DomainError('INVARIANT_VIOLATION', 'Cannot move an independent root')
    case 'selfOrDescendant':
      return new DomainError('INVALID_PARENT', 'Cannot move a component into itself or its descendant')
    case 'parentCannotContainChildren':
      return new DomainError('INVALID_PARENT', 'The target component cannot contain children')
    case 'componentConstraint':
      return new DomainError('INVALID_PARENT', 'The component kind is not valid at this location')
    case 'crossScreen':
      return new DomainError('INVALID_PARENT', 'Cannot move a component to another screen')
    case 'stale':
      return new DomainError('NOT_FOUND', 'The component or placement target is unavailable')
    case 'invalidPosition':
      return new DomainError('INVARIANT_VIOLATION', 'The component position is out of range')
    case 'domainValidation':
      return new DomainError('INVARIANT_VIOLATION', 'The component placement is invalid')
  }
}
