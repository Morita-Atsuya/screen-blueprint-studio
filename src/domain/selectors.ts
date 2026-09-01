import type {
  ComponentOverride,
  EntityId,
  ProjectDocument,
  ScreenComponent,
  ScreenState,
} from './model'
import { isInlineScreenComponent } from './model'
import { getOwnEntity, setOwnEntity } from './entityMap'
import { resolveDefinitionInstanceRoot } from './definitionResolver'
import { findScenarioOverride, inlineTargetRef } from './componentTargets'

export type EffectiveScreenComponent =
  | Extract<ScreenComponent, { nodeType: 'inline' }>
  | ReturnType<typeof resolveDefinitionInstanceRoot>['component']

function applyInlineScenarioOverride(
  component: Extract<ScreenComponent, { nodeType: 'inline' }>,
  override: ComponentOverride | undefined,
): Extract<ScreenComponent, { nodeType: 'inline' }> {
  if (!override) return component
  const next: Extract<ScreenComponent, { nodeType: 'inline' }> = {
    ...component,
    childIds: [...component.childIds],
    placement: { ...component.placement },
    sizing: { ...component.sizing },
    common: {
      ...component.common,
      visible: override.visible ?? component.common.visible,
      enabled: override.enabled ?? component.common.enabled,
    },
    config: structuredClone(component.config),
  }
  if (override.text !== undefined && next.config.kind === 'text') {
    next.config.text = override.text
  }
  if (
    override.value !== undefined &&
    (next.config.kind === 'textInput' || next.config.kind === 'select')
  ) {
    next.config.defaultValue = override.value
  }
  return next
}

export function effectiveComponent(
  document: ProjectDocument,
  component: ScreenComponent,
  state: ScreenState | undefined,
): EffectiveScreenComponent {
  return resolveEffectiveComponentState(document, component, state).component
}

export interface EffectiveComponentState {
  component: EffectiveScreenComponent
  override: ComponentOverride | null
  hasOverride: boolean
}

export function resolveEffectiveComponentState(
  document: ProjectDocument,
  component: ScreenComponent,
  state: ScreenState | undefined,
): EffectiveComponentState {
  if (isInlineScreenComponent(component)) {
    const override = findScenarioOverride(state, inlineTargetRef(component.id))?.override ?? null
    return {
      component: applyInlineScenarioOverride(component, override ?? undefined),
      override,
      hasOverride: override !== null && Object.keys(override).length > 0,
    }
  }
  const resolvedRoot = resolveDefinitionInstanceRoot(document, component, state?.id ?? null)
  const override = findScenarioOverride(state, resolvedRoot.component.rootTarget)?.override ?? null
  return {
    component: resolvedRoot.component,
    override,
    hasOverride: override !== null && Object.keys(override).length > 0,
  }
}

export function screenComponents(
  doc: ProjectDocument,
  screenId: EntityId,
): Record<EntityId, ScreenComponent> {
  const result = Object.create(null) as Record<EntityId, ScreenComponent>
  for (const [id, component] of Object.entries(doc.components)) {
    if (component.screenId === screenId) setOwnEntity(result, id, component)
  }
  return result
}

export function scenarioById(
  doc: ProjectDocument,
  scenarioId: EntityId | null,
): ScreenState | undefined {
  return scenarioId ? getOwnEntity(doc.screenScenarios, scenarioId) : undefined
}
