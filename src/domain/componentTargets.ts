import type {
  ComponentOverride,
  ComponentTargetRef,
  EntityId,
  ScenarioComponentOverride,
  ScreenScenario,
} from './model'
import { DomainError } from './errors'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function inlineTargetRef(componentId: EntityId): ComponentTargetRef {
  return { type: 'inline', componentId }
}

export function definitionNodeTargetRef(
  instanceId: EntityId,
  nodePath: [EntityId, ...EntityId[]],
): ComponentTargetRef {
  return { type: 'definitionNode', instanceId, nodePath: [...nodePath] }
}

export function collectionItemNodeTargetRef(
  collectionId: EntityId,
  nodePath: [EntityId, ...EntityId[]],
): ComponentTargetRef {
  return { type: 'collectionItemNode', collectionId, nodePath: [...nodePath] }
}

export function cloneComponentTargetRef(target: ComponentTargetRef): ComponentTargetRef {
  if (!isRecord(target)) {
    throw new DomainError('INVARIANT_VIOLATION', 'Component target must be an object')
  }
  return target.type === 'inline'
    ? { ...target }
    : target.type === 'definitionNode'
      ? { type: 'definitionNode', instanceId: target.instanceId, nodePath: [...target.nodePath] }
      : { type: 'collectionItemNode', collectionId: target.collectionId, nodePath: [...target.nodePath] }
}

export function componentTargetRefKey(target: ComponentTargetRef): string {
  return target.type === 'inline'
    ? `inline:${encodeURIComponent(target.componentId)}`
    : target.type === 'definitionNode'
      ? `definition:${encodeURIComponent(target.instanceId)}:${target.nodePath
          .map(segment => encodeURIComponent(segment))
          .join('/')}`
      : `collection:${encodeURIComponent(target.collectionId)}:${target.nodePath
          .map(segment => encodeURIComponent(segment))
          .join('/')}`
}

export function componentTargetRefEquals(
  left: ComponentTargetRef,
  right: ComponentTargetRef,
): boolean {
  return componentTargetRefKey(left) === componentTargetRefKey(right)
}

export function targetRootScreenComponentId(target: ComponentTargetRef): EntityId {
  return target.type === 'inline'
    ? target.componentId
    : target.type === 'definitionNode'
      ? target.instanceId
      : target.collectionId
}

export function targetBelongsToScreenComponentSet(
  target: ComponentTargetRef,
  componentIds: ReadonlySet<EntityId>,
): boolean {
  return componentIds.has(targetRootScreenComponentId(target))
}

export function cloneComponentOverride(override: ComponentOverride): ComponentOverride {
  return { ...override }
}

export function cloneScenarioOverride(
  override: ScenarioComponentOverride,
): ScenarioComponentOverride {
  if (!isRecord(override)) {
    throw new DomainError('INVARIANT_VIOLATION', 'Scenario override must be an object')
  }
  return {
    target: cloneComponentTargetRef(override.target),
    override: cloneComponentOverride(override.override),
  }
}

export function findScenarioOverride(
  scenario: ScreenScenario | undefined,
  target: ComponentTargetRef,
): ScenarioComponentOverride | undefined {
  return scenario?.componentOverrides.find(entry => componentTargetRefEquals(entry.target, target))
}

export function findInlineScenarioOverride(
  scenario: ScreenScenario | undefined,
  componentId: EntityId,
): ScenarioComponentOverride | undefined {
  return findScenarioOverride(scenario, inlineTargetRef(componentId))
}

export function replaceScenarioOverride(
  overrides: ScreenScenario['componentOverrides'],
  target: ComponentTargetRef,
  override: ComponentOverride | null,
): ScreenScenario['componentOverrides'] {
  const next = overrides
    .filter(entry => !componentTargetRefEquals(entry.target, target))
    .map(cloneScenarioOverride)
  if (override && Object.keys(override).length > 0) {
    next.push({ target: cloneComponentTargetRef(target), override: cloneComponentOverride(override) })
  }
  return next
}

export function rewriteScenarioOverrides(
  overrides: ScreenScenario['componentOverrides'],
  rewriteTarget: (target: ComponentTargetRef) => ComponentTargetRef,
): ScreenScenario['componentOverrides'] {
  return overrides.map(entry => ({
    target: rewriteTarget(entry.target),
    override: cloneComponentOverride(entry.override),
  }))
}

export function rewriteTargetRef(
  target: ComponentTargetRef,
  rewrites: ReadonlyMap<string, ComponentTargetRef>,
): ComponentTargetRef {
  return rewrites.get(componentTargetRefKey(target)) ?? cloneComponentTargetRef(target)
}
