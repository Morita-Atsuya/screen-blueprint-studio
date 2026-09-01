import type {
  ComponentSubtreeSnapshot,
  DomainCommand,
  UpdateComponentSpecCommand,
} from './commands'
import type {
  ApiOperation,
  ComponentDefinition,
  ComponentDefinitionNode,
  ComponentOverride,
  ComponentPlacement,
  ComponentSizing,
  DefinitionComponentConfig,
  EventAction,
  EventTrigger,
  FieldBinding,
  ProjectDocument,
  PublicProp,
  PublicPropBinding,
  Screen,
  ScreenComponent,
  ScreenComponentConfig,
  ScreenEvent,
  ScreenScenario,
  ValidationRule,
  VariantConfigOverride,
  VariantNodeOverride,
  VariantProperty,
} from './model'
import {
  cloneComponentOverride as cloneOverride,
  cloneComponentTargetRef,
  cloneScenarioOverride,
} from './componentTargets'
import { DomainError } from './errors'

function invalidClone(value: never, context: string): never {
  void value
  throw new DomainError('INVARIANT_VIOLATION', `Unsupported ${context}`)
}

function cloneArray<T>(
  values: readonly T[],
  cloneValue: (value: T) => T,
  path: string,
): T[] {
  if (!Array.isArray(values)) {
    throw new DomainError('INVARIANT_VIOLATION', `${path} must be an array`)
  }
  return Array.from({ length: values.length }, (_, index) => {
    if (!Object.prototype.hasOwnProperty.call(values, index)) {
      throw new DomainError('INVARIANT_VIOLATION', `${path} must not contain empty slots`)
    }
    return cloneValue(values[index] as T)
  })
}

function cloneRecord<T>(
  record: Record<string, T>,
  cloneValue: (value: T) => T,
  path: string,
): Record<string, T> {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    throw new DomainError('INVARIANT_VIOLATION', `${path} must be an object`)
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, cloneValue(value)]),
  )
}

export function cloneValidationRule(rule: ValidationRule): ValidationRule {
  return { ...rule }
}

export function cloneComponentPlacement(placement: ComponentPlacement): ComponentPlacement {
  return { ...placement }
}

export function cloneComponentSizing(sizing: ComponentSizing): ComponentSizing {
  return { ...sizing }
}

function cloneDefinitionComponentConfigImpl(
  config: DefinitionComponentConfig,
): DefinitionComponentConfig {
  switch (config.kind) {
    case 'textInput':
      return {
        ...config,
        validationRules: cloneArray(
          config.validationRules,
          cloneValidationRule,
          'definition config validationRules',
        ),
      }
    case 'select':
      return {
        ...config,
        options: cloneArray(
          config.options,
          option => ({ ...option }),
          'definition config options',
        ),
      }
    case 'link':
      return { ...config, destination: { ...config.destination } }
    case 'page':
    case 'container':
    case 'text':
    case 'button':
    case 'image':
    case 'modal':
      return { ...config }
    default:
      return invalidClone(config, 'definition component config clone')
  }
}

export function cloneComponentConfig(config: ScreenComponentConfig): ScreenComponentConfig {
  switch (config.kind) {
    case 'textInput':
      return {
        ...config,
        validationRules: cloneArray(
          config.validationRules,
          cloneValidationRule,
          'component config validationRules',
        ),
      }
    case 'select':
      return {
        ...config,
        options: cloneArray(
          config.options,
          option => ({ ...option }),
          'component config options',
        ),
      }
    case 'link':
      return { ...config, destination: { ...config.destination } }
    case 'collection':
      return {
        ...config,
        dataSource: {
          ...config.dataSource,
          previewItems: structuredClone(config.dataSource.previewItems),
        },
        itemTemplate: {
          source: { ...config.itemTemplate.source },
          variantId: config.itemTemplate.variantId,
          props: { ...config.itemTemplate.props },
        },
        propBindings: config.propBindings.map(binding => ({
          ...binding,
          source: { ...binding.source },
        })),
        variantSelection: {
          fallbackVariantId: config.variantSelection.fallbackVariantId,
          cases: config.variantSelection.cases.map(rule => ({
            ...rule,
            source: { ...rule.source },
          })),
        },
        visibility: config.visibility
          ? { ...config.visibility, source: { ...config.visibility.source } }
          : null,
      }
    case 'page':
    case 'container':
    case 'text':
    case 'button':
    case 'image':
    case 'modal':
      return { ...config }
    default:
      return invalidClone(config, 'component config clone')
  }
}

export function cloneDefinitionComponentConfig(
  config: DefinitionComponentConfig,
): DefinitionComponentConfig {
  return cloneDefinitionComponentConfigImpl(config)
}

type ComponentConfigPatch = NonNullable<UpdateComponentSpecCommand['patch']['config']>

function cloneComponentConfigPatch(patch: ComponentConfigPatch): ComponentConfigPatch {
  if ('validationRules' in patch && patch.validationRules !== undefined) {
    return {
      ...patch,
      validationRules: cloneArray(
        patch.validationRules,
        cloneValidationRule,
        'component config patch validationRules',
      ),
    }
  }
  if ('options' in patch && patch.options !== undefined) {
    return {
      ...patch,
      options: cloneArray(
        patch.options,
        option => ({ ...option }),
        'component config patch options',
      ),
    }
  }
  if ('destination' in patch && patch.destination !== undefined) {
    return {
      ...patch,
      destination: { ...patch.destination },
    }
  }
  return { ...patch }
}

export function cloneComponentOverride(override: ComponentOverride): ComponentOverride {
  return cloneOverride(override)
}

export function clonePublicPropBinding(binding: PublicPropBinding): PublicPropBinding {
  return { ...binding, nodePath: [...binding.nodePath] as [string, ...string[]] }
}

export function clonePublicProp(prop: PublicProp): PublicProp {
  switch (prop.type) {
    case 'string':
    case 'boolean':
    case 'number':
      return {
        ...prop,
        bindings: cloneArray(prop.bindings, clonePublicPropBinding, 'public prop bindings'),
      }
    case 'enum':
      return {
        ...prop,
        values: cloneArray(prop.values, value => value, 'public prop values'),
        bindings: cloneArray(prop.bindings, clonePublicPropBinding, 'public prop bindings'),
      }
    default:
      return invalidClone(prop, 'public prop clone')
  }
}

export function cloneVariantProperty(property: VariantProperty): VariantProperty {
  return {
    ...property,
    values: cloneArray(property.values, value => value, 'variant property values'),
  }
}

export function cloneVariantConfigOverride(
  override: VariantConfigOverride,
): VariantConfigOverride {
  if ('destination' in override && override.destination !== undefined) {
    return {
      ...override,
      destination: { ...override.destination },
    }
  }
  return { ...override }
}

export function cloneVariantNodeOverride(override: VariantNodeOverride): VariantNodeOverride {
  return {
    ...(override.common ? { common: { ...override.common } } : {}),
    ...(override.config ? { config: cloneVariantConfigOverride(override.config) } : {}),
    ...(override.placement ? { placement: cloneComponentPlacement(override.placement) } : {}),
    ...(override.sizing ? { sizing: cloneComponentSizing(override.sizing) } : {}),
  }
}

export function cloneDefinitionNode(node: ComponentDefinitionNode): ComponentDefinitionNode {
  if (node.nodeType === 'definitionInstance') {
    return {
      ...node,
      props: cloneRecord(node.props, value => value, 'definition instance props'),
      source: { ...node.source },
      childIds: [],
      placement: cloneComponentPlacement(node.placement),
      sizing: cloneComponentSizing(node.sizing),
    }
  }
  return {
    ...node,
    childIds: cloneArray(node.childIds, value => value, 'definition node childIds'),
    placement: cloneComponentPlacement(node.placement),
    sizing: cloneComponentSizing(node.sizing),
    common: { ...node.common },
    config: cloneDefinitionComponentConfigImpl(node.config),
  }
}

export function cloneComponentDefinition(definition: ComponentDefinition): ComponentDefinition {
  return {
    ...definition,
    nodes: cloneRecord(definition.nodes, cloneDefinitionNode, 'definition nodes'),
    publicProps: cloneArray(definition.publicProps, clonePublicProp, 'definition publicProps'),
    variantProperties: cloneArray(
      definition.variantProperties,
      cloneVariantProperty,
      'definition variantProperties',
    ),
    variants: cloneArray(definition.variants, variant => ({
      ...variant,
      propertyValues: cloneRecord(
        variant.propertyValues,
        value => value,
        'variant propertyValues',
      ),
      nodeOverrides: cloneRecord(
        variant.nodeOverrides,
        cloneVariantNodeOverride,
        'variant nodeOverrides',
      ),
    }), 'definition variants'),
  }
}

export function cloneEventTrigger(trigger: EventTrigger): EventTrigger {
  return {
    ...trigger,
    target: cloneComponentTargetRef(trigger.target),
  }
}

export function cloneEventAction(action: EventAction): EventAction {
  switch (action.type) {
    case 'navigate':
      return {
        ...action,
        ...(action.routeParameters
          ? {
              routeParameters: cloneRecord(
                action.routeParameters,
                source => ({ ...source }),
                'navigate routeParameters',
              ),
            }
          : {}),
        ...(action.queryParameters
          ? {
              queryParameters: cloneRecord(
                action.queryParameters,
                source => ({ ...source }),
                'navigate queryParameters',
              ),
            }
          : {}),
      }
    case 'setScenario':
    case 'callApi':
      return { ...action }
    case 'clearScenario':
      return { type: 'clearScenario' }
    default:
      return invalidClone(action, 'event action clone')
  }
}

export function cloneFieldBinding(binding: FieldBinding): FieldBinding {
  return {
    targetPath: binding.targetPath,
    source: binding.source.type === 'item' || binding.source.type === 'literal'
      ? { ...binding.source }
      : cloneComponentTargetRef(binding.source),
  }
}

export function cloneScreenComponent(component: ScreenComponent): ScreenComponent {
  if (component.nodeType === 'definitionInstance') {
    return {
      ...component,
      childIds: [],
      placement: cloneComponentPlacement(component.placement),
      sizing: cloneComponentSizing(component.sizing),
      source: { ...component.source },
      props: cloneRecord(component.props, value => value, 'instance props'),
    }
  }
  return {
    ...component,
    childIds: cloneArray(component.childIds, value => value, 'component childIds'),
    placement: cloneComponentPlacement(component.placement),
    sizing: cloneComponentSizing(component.sizing),
    common: { ...component.common },
    config: cloneComponentConfig(component.config),
  }
}

function cloneScreen(screen: Screen): Screen {
  return {
    ...screen,
    modalComponentIds: cloneArray(
      screen.modalComponentIds,
      value => value,
      'screen modalComponentIds',
    ),
    scenarioIds: cloneArray(screen.scenarioIds, value => value, 'screen scenarioIds'),
    eventIds: cloneArray(screen.eventIds, value => value, 'screen eventIds'),
  }
}

export function cloneScreenScenario(scenario: ScreenScenario): ScreenScenario {
  return {
    ...scenario,
    componentOverrides: cloneArray(
      scenario.componentOverrides,
      cloneScenarioOverride,
      'scenario componentOverrides',
    ),
  }
}

function cloneScreenEvent(event: ScreenEvent): ScreenEvent {
  return {
    ...event,
    trigger: cloneEventTrigger(event.trigger),
    actions: cloneArray(event.actions, cloneEventAction, 'event actions'),
  }
}

function cloneApiOperation(operation: ApiOperation): ApiOperation {
  return {
    ...operation,
    requestBindings: cloneArray(
      operation.requestBindings,
      cloneFieldBinding,
      'API requestBindings',
    ),
  }
}

export function cloneProjectDocument(document: ProjectDocument): ProjectDocument {
  return {
    ...document,
    project: {
      ...document.project,
      screenIds: cloneArray(
        document.project.screenIds,
        value => value,
        'project screenIds',
      ),
    },
    componentDefinitions: cloneRecord(
      document.componentDefinitions,
      cloneComponentDefinition,
      'document componentDefinitions',
    ),
    screens: cloneRecord(document.screens, cloneScreen, 'document screens'),
    components: cloneRecord(
      document.components,
      cloneScreenComponent,
      'document components',
    ),
    screenScenarios: cloneRecord(
      document.screenScenarios,
      cloneScreenScenario,
      'document screenScenarios',
    ),
    events: cloneRecord(document.events, cloneScreenEvent, 'document events'),
    apiOperations: cloneRecord(
      document.apiOperations,
      cloneApiOperation,
      'document apiOperations',
    ),
  }
}

export function cloneComponentSubtreeSnapshot(
  snapshot: ComponentSubtreeSnapshot,
): ComponentSubtreeSnapshot {
  return {
    ...snapshot,
    components: cloneRecord(
      snapshot.components,
      cloneScreenComponent,
      'component snapshot components',
    ),
    scenarioOverrides: cloneRecord(
      snapshot.scenarioOverrides,
      overrides => cloneArray(
        overrides,
        cloneScenarioOverride,
        'component snapshot scenario overrides',
      ),
      'component snapshot scenarios',
    ),
    events: cloneRecord(snapshot.events, cloneScreenEvent, 'component snapshot events'),
    apiOperations: cloneRecord(
      snapshot.apiOperations,
      cloneApiOperation,
      'component snapshot apiOperations',
    ),
  }
}

export function cloneDomainCommand(command: DomainCommand): DomainCommand {
  switch (command.type) {
    case 'addScreen':
    case 'updateScreen':
    case 'removeScreen':
    case 'moveComponent':
    case 'removeComponent':
    case 'removeScreenState':
    case 'removeEvent':
    case 'removeApiOperation':
    case 'removeComponentDefinition':
      return { ...command }
    case 'addComponent':
      return {
        ...command,
        placement: cloneComponentPlacement(command.placement),
        sizing: cloneComponentSizing(command.sizing),
        config: cloneComponentConfig(command.config),
      }
    case 'duplicateComponent':
      return {
        ...command,
        componentIdMap: cloneRecord(
          command.componentIdMap,
          value => value,
          'duplicateComponent componentIdMap',
        ),
        eventIdMap: cloneRecord(command.eventIdMap, value => value, 'duplicateComponent eventIdMap'),
        apiOperationIdMap: cloneRecord(
          command.apiOperationIdMap,
          value => value,
          'duplicateComponent apiOperationIdMap',
        ),
      }
    case 'pasteComponent':
      return {
        ...command,
        snapshot: cloneComponentSubtreeSnapshot(command.snapshot),
        componentIdMap: cloneRecord(
          command.componentIdMap,
          value => value,
          'pasteComponent componentIdMap',
        ),
        eventIdMap: cloneRecord(command.eventIdMap, value => value, 'pasteComponent eventIdMap'),
        apiOperationIdMap: cloneRecord(
          command.apiOperationIdMap,
          value => value,
          'pasteComponent apiOperationIdMap',
        ),
      }
    case 'updateComponentSpec':
      return {
        ...command,
        patch: {
          ...command.patch,
          ...(command.patch.common ? { common: { ...command.patch.common } } : {}),
          ...(command.patch.config
            ? { config: cloneComponentConfigPatch(command.patch.config) }
            : {}),
          ...(command.patch.placement
            ? { placement: cloneComponentPlacement(command.patch.placement) }
            : {}),
          ...(command.patch.sizing
            ? { sizing: cloneComponentSizing(command.patch.sizing) }
            : {}),
        },
      }
    case 'extractComponentDefinition':
      return {
        ...command,
        definition: cloneComponentDefinition(command.definition),
        componentIdToNodePath: cloneRecord(
          command.componentIdToNodePath,
          nodePath => [...nodePath] as [string, ...string[]],
          'extractComponentDefinition componentIdToNodePath',
        ),
      }
    case 'detachDefinitionInstance':
      return {
        ...command,
        generatedComponents: cloneArray(
          command.generatedComponents,
          entry => ({ componentId: entry.componentId, nodePath: [...entry.nodePath] as [string, ...string[]] }),
          'detachDefinitionInstance generatedComponents',
        ),
      }
    case 'putComponentDefinition':
      return {
        ...command,
        definition: cloneComponentDefinition(command.definition),
      }
    case 'addDefinitionInstance':
      return {
        ...command,
        props: { ...command.props },
        placement: cloneComponentPlacement(command.placement),
        sizing: cloneComponentSizing(command.sizing),
      }
    case 'updateDefinitionInstance':
      return {
        ...command,
        ...(command.props ? { props: { ...command.props } } : {}),
        ...(command.placement
          ? { placement: cloneComponentPlacement(command.placement) }
          : {}),
        ...(command.sizing
          ? { sizing: cloneComponentSizing(command.sizing) }
          : {}),
      }
    case 'createScreenState':
    case 'updateScreenState':
      return {
        ...command,
        ...(command.overrides
          ? {
              overrides: cloneArray(
                command.overrides,
                cloneScenarioOverride,
                `${command.type} overrides`,
              ),
            }
          : {}),
      }
    case 'connectEvent':
    case 'updateEvent':
      return {
        ...command,
        trigger: cloneEventTrigger(command.trigger),
        actions: cloneArray(command.actions, cloneEventAction, `${command.type} actions`),
      }
    case 'bindApiOperation':
      return {
        ...command,
        ...(command.requestBindings
          ? {
              requestBindings: cloneArray(
                command.requestBindings,
                cloneFieldBinding,
                'bindApiOperation requestBindings',
              ),
            }
          : {}),
      }
    case 'updateApiOperation':
      return {
        ...command,
        requestBindings: cloneArray(
          command.requestBindings,
          cloneFieldBinding,
          'updateApiOperation requestBindings',
        ),
      }
    default:
      return invalidClone(command, 'domain command clone')
  }
}
