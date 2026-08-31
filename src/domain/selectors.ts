import type { ProjectDocument, ScreenComponent, ComponentOverride, EntityId } from './model'
import type { ScreenState } from './model'
import { getOwnEntity, setOwnEntity } from './entityMap'

/** Apply a screen state's overrides on top of a component's base values */
export function applyStateOverride(
  comp: ScreenComponent,
  override: ComponentOverride | undefined,
): ScreenComponent {
  if (!override) return comp
  const newCommon = {
    ...comp.common,
    visible: override.visible ?? comp.common.visible,
    enabled: override.enabled ?? comp.common.enabled,
  }
  const newConfig = { ...comp.config }
  if (override.text !== undefined && 'text' in newConfig) {
    (newConfig as { text: string }).text = override.text
  }
  if (override.value !== undefined && (
    newConfig.kind === 'textInput' ||
    newConfig.kind === 'select'
  )) {
    newConfig.defaultValue = override.value
  }
  return { ...comp, common: newCommon, config: newConfig }
}

/** Get the effective component for a given state (or default if no override) */
export function effectiveComponent(
  comp: ScreenComponent,
  state: ScreenState | undefined,
): ScreenComponent {
  return resolveEffectiveComponentState(comp, state).component
}

export interface EffectiveComponentState {
  component: ScreenComponent
  override: ComponentOverride | null
  hasOverride: boolean
}

export function resolveEffectiveComponentState(
  comp: ScreenComponent,
  state: ScreenState | undefined,
): EffectiveComponentState {
  const override = state
    ? getOwnEntity(state.componentOverrides, comp.id) ?? null
    : null
  return {
    component: applyStateOverride(comp, override ?? undefined),
    override,
    hasOverride: override !== null && Object.keys(override).length > 0,
  }
}

/** Get all components in a screen as a flat record */
export function screenComponents(
  doc: ProjectDocument,
  screenId: EntityId,
): Record<EntityId, ScreenComponent> {
  const result: Record<EntityId, ScreenComponent> = Object.create(null) as Record<EntityId, ScreenComponent>
  for (const [id, comp] of Object.entries(doc.components)) {
    if (comp.screenId === screenId) setOwnEntity(result, id, comp)
  }
  return result
}
