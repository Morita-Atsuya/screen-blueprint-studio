import type {
  ComponentDefinition,
  ComponentDefinitionNode,
  EntityId,
  ProjectDocument,
  PublicPropFieldV3,
} from '../../domain/model'
import { ROOT_COMPONENT_SIZING } from '../../domain/model'
import { componentDefinitionRefV3 } from '../../domain/canonicalProjectSpecV3'
import { getOwnEntity } from '../../domain/entityMap'
import { resolveScreenNodes, type ResolveScreenNodesResult } from '../../domain/definitionResolver'
import { resolveCollectionItem, resolveCollectionTemplateDefaults } from '../../domain/collection'
import type { MessageKey } from '../../i18n/messages'

export type InlineDefinitionNode = Extract<ComponentDefinitionNode, { nodeType: 'inline' }>

export interface EditableStringField {
  field: PublicPropFieldV3
  labelKey:
    | 'definitions.fieldText'
    | 'definitions.fieldLabel'
    | 'definitions.fieldAlt'
    | 'definitions.fieldDescription'
  value: string
  apply(node: InlineDefinitionNode, value: string): InlineDefinitionNode
  variantKey: 'text' | 'label' | 'alt' | 'description'
}

export function editableStringField(node: InlineDefinitionNode): EditableStringField {
  if (node.config.kind === 'text') {
    return {
      field: 'config.text',
      labelKey: 'definitions.fieldText',
      value: node.config.text,
      variantKey: 'text',
      apply: (current, value) => ({
        ...current,
        config: { ...current.config, text: value },
      }),
    }
  }
  if (
    node.config.kind === 'textInput' ||
    node.config.kind === 'select' ||
    node.config.kind === 'button' ||
    node.config.kind === 'link'
  ) {
    return {
      field: 'config.label',
      labelKey: 'definitions.fieldLabel',
      value: node.config.label,
      variantKey: 'label',
      apply: (current, value) => ({
        ...current,
        config: { ...current.config, label: value },
      }),
    }
  }
  if (node.config.kind === 'image') {
    return {
      field: 'config.alt',
      labelKey: 'definitions.fieldAlt',
      value: node.config.alt,
      variantKey: 'alt',
      apply: (current, value) => ({
        ...current,
        config: { ...current.config, alt: value },
      }),
    }
  }
  return {
    field: 'common.description',
    labelKey: 'definitions.fieldDescription',
    value: node.common.description,
    variantKey: 'description',
    apply: (current, value) => ({
      ...current,
      common: { ...current.common, description: value },
    }),
  }
}

export function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'property'
}

function unusedId(record: Record<string, unknown>, base: string): string {
  let candidate = base
  let suffix = 2
  while (Object.prototype.hasOwnProperty.call(record, candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}

export interface DefinitionPreviewModel {
  document: ProjectDocument
  resolved: ResolveScreenNodesResult
  rootRuntimeId: string
  sampleSource: MessageKey
}

export function resolvePreviewVariantId(
  definition: ComponentDefinition,
  requestedVariantId: EntityId | null,
): EntityId | null {
  if (requestedVariantId === null) return null
  if (definition.variants.some(variant => variant.id === requestedVariantId)) {
    return requestedVariantId
  }
  return definition.representativeVariantId ?? definition.variants[0]?.id ?? null
}

export function createDefinitionPreviewModel(
  document: ProjectDocument,
  definition: ComponentDefinition,
  variantId: EntityId | null,
  useSampleValues: boolean,
): DefinitionPreviewModel {
  const screenId = unusedId(document.screens, `preview-screen:${definition.id}`)
  const instanceId = unusedId(document.components, `preview-instance:${definition.id}`)
  const sourceRef = componentDefinitionRefV3(definition.id)
  const sampleInstance = Object.values(document.components).find(component =>
    component.nodeType === 'definitionInstance' && component.source.$ref === sourceRef)
  const sampleCollection = Object.values(document.components).find(component =>
    component.nodeType === 'inline' &&
    component.config.kind === 'collection' &&
    component.config.itemTemplate.source.$ref === sourceRef)
  const collectionSample = sampleCollection?.nodeType === 'inline' &&
    sampleCollection.config.kind === 'collection'
    ? sampleCollection.config.dataSource.previewItems[0]
      ? resolveCollectionItem(
          sampleCollection.config,
          sampleCollection.config.dataSource.previewItems[0],
        )
      : resolveCollectionTemplateDefaults(sampleCollection.config)
    : null
  const sampleProps = sampleInstance?.nodeType === 'definitionInstance'
    ? sampleInstance.props
    : collectionSample?.props
  const previewDocument: ProjectDocument = {
    ...document,
    screens: {
      ...document.screens,
      [screenId]: {
        id: screenId,
        name: definition.name,
        route: '/__shared-component-preview__',
        baseDescription: definition.description,
        rootComponentId: instanceId,
        modalComponentIds: [],
        scenarioIds: [],
        eventIds: [],
      },
    },
    components: {
      ...document.components,
      [instanceId]: {
        nodeType: 'definitionInstance',
        id: instanceId,
        screenId,
        parentId: null,
        childIds: [],
        placement: { mode: 'flow' },
        sizing: { ...ROOT_COMPONENT_SIZING },
        source: { $ref: sourceRef },
        props: useSampleValues && sampleProps
          ? structuredClone(sampleProps)
          : {},
        variantId,
      },
    },
  }
  const resolved = resolveScreenNodes(previewDocument, screenId)
  const root = resolved.orderedNodes.find(node =>
    node.instanceId === instanceId &&
    node.instanceBoundary.isBoundaryRoot &&
    node.instanceBoundary.depth === 1)
  if (!root) throw new Error(`Shared component preview root is unavailable: ${definition.id}`)
  return {
    document: previewDocument,
    resolved,
    rootRuntimeId: root.id,
    sampleSource: useSampleValues && sampleProps
      ? 'definitions.previewSampleInstance'
      : 'definitions.previewBaseValues',
  }
}

export function parentDefinitionLayout(
  definition: ComponentDefinition,
  node: InlineDefinitionNode,
) {
  if (!node.parentId) return null
  const parent = getOwnEntity(definition.nodes, node.parentId)
  if (
    parent?.nodeType !== 'inline' ||
    (
      parent.config.kind !== 'page' &&
      parent.config.kind !== 'container' &&
      parent.config.kind !== 'modal'
    )
  ) return null
  return parent.config
}
