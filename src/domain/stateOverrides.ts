import type { ComponentTargetRef, EntityId, ScreenState } from './model'
import type { ComponentOverride } from './model'
import type { UpdateScreenStateCommand } from './commands'
import {
  findInlineScenarioOverride,
  findScenarioOverride,
  inlineTargetRef,
  replaceScenarioOverride,
} from './componentTargets'

export function createResetTargetOverrideCommand(
  state: ScreenState,
  target: ComponentTargetRef,
): UpdateScreenStateCommand | null {
  const override = findScenarioOverride(state, target)?.override
  if (!override || Object.keys(override).length === 0) return null
  return {
    type: 'updateScreenState',
    stateId: state.id,
    overrides: replaceScenarioOverride(state.componentOverrides, target, null),
  }
}

export function createResetComponentOverrideCommand(
  state: ScreenState,
  componentId: EntityId,
): UpdateScreenStateCommand | null {
  const override = findInlineScenarioOverride(state, componentId)?.override
  if (!override || Object.keys(override).length === 0) return null
  return {
    type: 'updateScreenState',
    stateId: state.id,
    overrides: replaceScenarioOverride(state.componentOverrides, inlineTargetRef(componentId), null),
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
  const current = findInlineScenarioOverride(state, componentId)?.override
  const hasCurrentField = current
    ? Object.prototype.hasOwnProperty.call(current, key)
    : false
  if (
    (value === undefined && !hasCurrentField) ||
    (value !== undefined && hasCurrentField && Object.is(current?.[key], value))
  ) {
    return null
  }

  const nextOverride = { ...(current ?? {}) }
  if (value === undefined) {
    delete nextOverride[key]
  } else {
    nextOverride[key] = value
  }
  return {
    type: 'updateScreenState',
    stateId: state.id,
    overrides: replaceScenarioOverride(
      state.componentOverrides,
      inlineTargetRef(componentId),
      Object.keys(nextOverride).length === 0 ? null : nextOverride,
    ),
  }
}

export function createSetTargetOverrideFieldCommand<
  Key extends keyof ComponentOverride,
>(
  state: ScreenState,
  target: ComponentTargetRef,
  key: Key,
  value: ComponentOverride[Key] | undefined,
): UpdateScreenStateCommand | null {
  const current = findScenarioOverride(state, target)?.override
  const hasCurrentField = current
    ? Object.prototype.hasOwnProperty.call(current, key)
    : false
  if (
    (value === undefined && !hasCurrentField) ||
    (value !== undefined && hasCurrentField && Object.is(current?.[key], value))
  ) {
    return null
  }
  const nextOverride = { ...(current ?? {}) }
  if (value === undefined) delete nextOverride[key]
  else nextOverride[key] = value
  return {
    type: 'updateScreenState',
    stateId: state.id,
    overrides: replaceScenarioOverride(
      state.componentOverrides,
      target,
      Object.keys(nextOverride).length === 0 ? null : nextOverride,
    ),
  }
}
