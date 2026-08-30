import type { EntityId, ScreenState } from './model'
import type { ComponentOverride } from './model'
import type { UpdateScreenStateCommand } from './commands'
import { deleteOwnEntity, getOwnEntity, setOwnEntity } from './entityMap'

export function createResetComponentOverrideCommand(
  state: ScreenState,
  componentId: EntityId,
): UpdateScreenStateCommand | null {
  const override = getOwnEntity(state.componentOverrides, componentId)
  if (!override || Object.keys(override).length === 0) return null

  const overrides = Object.assign(
    Object.create(null),
    state.componentOverrides,
  ) as ScreenState['componentOverrides']
  deleteOwnEntity(overrides, componentId)
  return {
    type: 'updateScreenState',
    stateId: state.id,
    overrides,
  }
}

export function createSetComponentOverrideFieldCommand<
  Key extends keyof ComponentOverride,
>(
  state: ScreenState,
  componentId: EntityId,
  key: Key,
  value: ComponentOverride[Key] | undefined,
): UpdateScreenStateCommand | null {
  const current = getOwnEntity(state.componentOverrides, componentId)
  const hasCurrentField = current
    ? Object.prototype.hasOwnProperty.call(current, key)
    : false
  if (
    (value === undefined && !hasCurrentField) ||
    (value !== undefined && hasCurrentField && Object.is(current?.[key], value))
  ) {
    return null
  }

  const overrides = Object.assign(
    Object.create(null),
    state.componentOverrides,
  ) as ScreenState['componentOverrides']
  const componentOverride = { ...(current ?? {}) }
  if (value === undefined) {
    delete componentOverride[key]
  } else {
    componentOverride[key] = value
  }
  if (Object.keys(componentOverride).length === 0) {
    deleteOwnEntity(overrides, componentId)
  } else {
    setOwnEntity(overrides, componentId, componentOverride)
  }
  return {
    type: 'updateScreenState',
    stateId: state.id,
    overrides,
  }
}
