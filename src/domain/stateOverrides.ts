import type { EntityId, ScreenState } from './model'
import type { UpdateScreenStateCommand } from './commands'
import { deleteOwnEntity, getOwnEntity } from './entityMap'

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
