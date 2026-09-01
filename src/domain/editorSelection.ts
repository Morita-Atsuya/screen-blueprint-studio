// ============================================================
// Typed editor selection
//
// The editor never stores a bare `componentId` as "the selection". Every
// selectable thing is one of five distinct shapes so screen structure,
// resolved Definition content, and Definition-editor content can never be
// confused with each other:
//  - screenInlineComponent: an ordinary screen-owned component.
//  - screenDefinitionInstance: a Definition Instance's outer screen node
//    (owns placement/sizing, is the sole screen DnD anchor).
//  - resolvedDefinitionNode: a node inside a resolved Instance subtree,
//    identified by the owning instance and a stable nodePath. Selectable,
//    focusable, and Event/API/Scenario-targetable, but not
//    screen-reparentable and not directly editable (sealed).
//  - collectionItemNode: a Definition node projected for every Collection
//    item, identified by the owning Collection and a stable nodePath. The
//    selection addresses the shared item template, never a preview item key.
//  - definitionEditorNode: a node inside a Definition's own editor context
//    (definitionId + stable nodePath), independent of any screen selection.
// ============================================================
import type { ComponentDefinition, ComponentTargetRef, EntityId, ProjectDocument } from './model'
import { getOwnEntity, hasOwnEntity } from './entityMap'
import {
  collectionItemNodeTargetRef,
  componentTargetRefKey,
  definitionNodeTargetRef,
  inlineTargetRef,
} from './componentTargets'
import { componentDefinitionRefV3, resolveComponentDefinitionRefV3 } from './canonicalProjectSpecV3'
import { resolveComponentTarget } from './definitionResolver'
import { resolveDefinitionInlineNodeAtPath } from './definitionTransactions'

export interface ScreenInlineSelection {
  type: 'screenInlineComponent'
  screenId: EntityId
  componentId: EntityId
}

export interface ScreenInstanceSelection {
  type: 'screenDefinitionInstance'
  screenId: EntityId
  componentId: EntityId
}

export interface ResolvedDefinitionNodeSelection {
  type: 'resolvedDefinitionNode'
  screenId: EntityId
  instanceId: EntityId
  nodePath: [EntityId, ...EntityId[]]
}

export interface CollectionItemNodeSelection {
  type: 'collectionItemNode'
  screenId: EntityId
  collectionId: EntityId
  nodePath: [EntityId, ...EntityId[]]
}

export interface DefinitionEditorNodeSelection {
  type: 'definitionEditorNode'
  definitionId: EntityId
  nodePath: [EntityId, ...EntityId[]]
}

export type EditorSelection =
  | ScreenInlineSelection
  | ScreenInstanceSelection
  | ResolvedDefinitionNodeSelection
  | CollectionItemNodeSelection
  | DefinitionEditorNodeSelection

export type ScreenScopedSelection =
  | ScreenInlineSelection
  | ScreenInstanceSelection
  | ResolvedDefinitionNodeSelection
  | CollectionItemNodeSelection

// ------------------------------------------------------------
// Constructors
// ------------------------------------------------------------

/** Builds the selection for a real screen component, discriminating inline vs. instance from the document. */
export function screenComponentSelection(
  document: ProjectDocument,
  screenId: EntityId,
  componentId: EntityId,
): EditorSelection | null {
  const component = getOwnEntity(document.components, componentId)
  if (!component || component.screenId !== screenId) return null
  return component.nodeType === 'definitionInstance'
    ? { type: 'screenDefinitionInstance', screenId, componentId }
    : { type: 'screenInlineComponent', screenId, componentId }
}

export function resolvedDefinitionNodeSelection(
  screenId: EntityId,
  instanceId: EntityId,
  nodePath: readonly EntityId[],
): ResolvedDefinitionNodeSelection {
  if (nodePath.length === 0) {
    throw new Error('resolvedDefinitionNodeSelection requires a non-empty nodePath')
  }
  return {
    type: 'resolvedDefinitionNode',
    screenId,
    instanceId,
    nodePath: [...nodePath] as [EntityId, ...EntityId[]],
  }
}

export function collectionItemNodeSelection(
  screenId: EntityId,
  collectionId: EntityId,
  nodePath: readonly EntityId[],
): CollectionItemNodeSelection {
  if (nodePath.length === 0) {
    throw new Error('collectionItemNodeSelection requires a non-empty nodePath')
  }
  return {
    type: 'collectionItemNode',
    screenId,
    collectionId,
    nodePath: [...nodePath] as [EntityId, ...EntityId[]],
  }
}

export function definitionEditorNodeSelection(
  definitionId: EntityId,
  nodePath: readonly EntityId[],
): DefinitionEditorNodeSelection {
  if (nodePath.length === 0) {
    throw new Error('definitionEditorNodeSelection requires a non-empty nodePath')
  }
  return {
    type: 'definitionEditorNode',
    definitionId,
    nodePath: [...nodePath] as [EntityId, ...EntityId[]],
  }
}

export function cloneEditorSelection(selection: EditorSelection): EditorSelection {
  switch (selection.type) {
    case 'screenInlineComponent':
    case 'screenDefinitionInstance':
      return { ...selection }
    case 'resolvedDefinitionNode':
    case 'collectionItemNode':
      return { ...selection, nodePath: [...selection.nodePath] as [EntityId, ...EntityId[]] }
    case 'definitionEditorNode':
      return { ...selection, nodePath: [...selection.nodePath] as [EntityId, ...EntityId[]] }
  }
}

// ------------------------------------------------------------
// Typed helpers
// ------------------------------------------------------------

export function isScreenScopedSelection(
  selection: EditorSelection,
): selection is ScreenScopedSelection {
  return selection.type !== 'definitionEditorNode'
}

/** The screen this selection lives on, or null for a Definition-editor selection. */
export function selectionScreenId(selection: EditorSelection): EntityId | null {
  return isScreenScopedSelection(selection) ? selection.screenId : null
}

/**
 * The root screen component ID that owns this selection: the component itself for
 * inline/instance selections, or the owning Instance for a resolved node. Null for a
 * Definition-editor selection, which has no screen component.
 */
export function selectionRootScreenComponentId(selection: EditorSelection): EntityId | null {
  switch (selection.type) {
    case 'screenInlineComponent':
    case 'screenDefinitionInstance':
      return selection.componentId
    case 'resolvedDefinitionNode':
      return selection.instanceId
    case 'collectionItemNode':
      return selection.collectionId
    case 'definitionEditorNode':
      return null
  }
}

export function selectedScreenComponentId(
  selection: EditorSelection | null,
): EntityId | null {
  return selection ? selectionRootScreenComponentId(selection) : null
}

/** The real `document.components` ID for this selection, or null when it is a resolved/definition node. */
export function selectionScreenComponentId(selection: EditorSelection): EntityId | null {
  return selection.type === 'screenInlineComponent' || selection.type === 'screenDefinitionInstance'
    ? selection.componentId
    : null
}

/**
 * The canonical `ComponentTargetRef` this selection addresses for scenario overrides,
 * Event triggers, and API bindings. Null only for a Definition-editor selection, which is
 * not a screen runtime target.
 */
export function selectionCanonicalTarget(
  document: ProjectDocument,
  selection: EditorSelection,
): ComponentTargetRef | null {
  switch (selection.type) {
    case 'screenInlineComponent':
      return inlineTargetRef(selection.componentId)
    case 'screenDefinitionInstance': {
      const component = getOwnEntity(document.components, selection.componentId)
      if (!component || component.nodeType !== 'definitionInstance') return null
      const definition = resolveComponentDefinitionRefV3(document, component.source.$ref)
      return definitionNodeTargetRef(selection.componentId, [definition.rootNodeId])
    }
    case 'resolvedDefinitionNode':
      return definitionNodeTargetRef(selection.instanceId, selection.nodePath)
    case 'collectionItemNode':
      return collectionItemNodeTargetRef(selection.collectionId, selection.nodePath)
    case 'definitionEditorNode':
      return null
  }
}

/** A stable string key uniquely identifying this selection, safe for comparisons and maps. */
export function selectionKey(selection: EditorSelection): string {
  const encode = (value: string) => encodeURIComponent(value)
  switch (selection.type) {
    case 'screenInlineComponent':
      return `screen-inline:${encode(selection.screenId)}:${encode(selection.componentId)}`
    case 'screenDefinitionInstance':
      return `screen-instance:${encode(selection.screenId)}:${encode(selection.componentId)}`
    case 'resolvedDefinitionNode':
      return `resolved-node:${encode(selection.screenId)}:${encode(selection.instanceId)}:${selection.nodePath
        .map(encode)
        .join('/')}`
    case 'collectionItemNode':
      return `collection-node:${encode(selection.screenId)}:${encode(selection.collectionId)}:${selection.nodePath
        .map(encode)
        .join('/')}`
    case 'definitionEditorNode':
      return `definition-node:${encode(selection.definitionId)}:${selection.nodePath
        .map(encode)
        .join('/')}`
  }
}

export function editorSelectionEquals(
  left: EditorSelection | null,
  right: EditorSelection | null,
): boolean {
  if (left === null || right === null) return left === right
  return selectionKey(left) === selectionKey(right)
}

export interface SelectionDomIdentity {
  attribute: 'data-component-id' | 'data-definition-node-id' | 'data-canonical-target-key'
  value: string
}

/** The DOM identity (attribute + value) an element must carry to represent this selection. */
export function selectionDomIdentity(selection: EditorSelection): SelectionDomIdentity {
  switch (selection.type) {
    case 'screenInlineComponent':
    case 'screenDefinitionInstance':
      return { attribute: 'data-component-id', value: selection.componentId }
    case 'resolvedDefinitionNode':
      return {
        attribute: 'data-component-id',
        value: componentTargetRefKey(definitionNodeTargetRef(selection.instanceId, selection.nodePath)),
      }
    case 'collectionItemNode':
      return {
        attribute: 'data-canonical-target-key',
        value: componentTargetRefKey(
          collectionItemNodeTargetRef(selection.collectionId, selection.nodePath),
        ),
      }
    case 'definitionEditorNode':
      return {
        attribute: 'data-definition-node-id',
        value: definitionEditorDomNodeId(selection.definitionId, selection.nodePath),
      }
  }
}

export function definitionEditorDomNodeId(
  definitionId: EntityId,
  nodePath: readonly EntityId[],
): string {
  return `${definitionId}::${nodePath.join('/')}`
}

/** A CSS attribute selector that locates the DOM element for this selection, for focus recovery. */
export function selectionDomFocusSelector(selection: EditorSelection): string {
  const identity = selectionDomIdentity(selection)
  return `[${identity.attribute}="${CSS.escape(identity.value)}"]`
}

// ------------------------------------------------------------
// Reconciliation
// ------------------------------------------------------------

/**
 * Verifies a screen-scoped selection still resolves against `document` for `activeScreenId`,
 * repairing an inline/instance mismatch and clearing selections that no longer resolve or that
 * belong to a different screen than the one currently active.
 */
export function reconcileEditorSelection(
  document: ProjectDocument,
  selection: EditorSelection | null,
  activeScreenId: EntityId | null,
): EditorSelection | null {
  if (!selection) return null
  switch (selection.type) {
    case 'screenInlineComponent':
    case 'screenDefinitionInstance': {
      if (selection.screenId !== activeScreenId) return null
      const component = getOwnEntity(document.components, selection.componentId)
      if (!component || component.screenId !== activeScreenId) return null
      const expectedType = component.nodeType === 'definitionInstance'
        ? 'screenDefinitionInstance'
        : 'screenInlineComponent'
      return expectedType === selection.type
        ? selection
        : { type: expectedType, screenId: selection.screenId, componentId: selection.componentId }
    }
    case 'resolvedDefinitionNode': {
      if (selection.screenId !== activeScreenId) return null
      const instance = getOwnEntity(document.components, selection.instanceId)
      if (!instance || instance.nodeType !== 'definitionInstance' || instance.screenId !== activeScreenId) {
        return null
      }
      try {
        resolveComponentTarget(
          document,
          selection.screenId,
          definitionNodeTargetRef(selection.instanceId, selection.nodePath),
        )
        return selection
      } catch {
        return null
      }
    }
    case 'collectionItemNode': {
      if (selection.screenId !== activeScreenId) return null
      const collection = getOwnEntity(document.components, selection.collectionId)
      if (
        !collection ||
        collection.nodeType !== 'inline' ||
        collection.config.kind !== 'collection' ||
        collection.screenId !== activeScreenId
      ) {
        return null
      }
      try {
        resolveComponentTarget(
          document,
          selection.screenId,
          collectionItemNodeTargetRef(selection.collectionId, selection.nodePath),
        )
        return selection
      } catch {
        return null
      }
    }
    case 'definitionEditorNode':
      return reconcileDefinitionEditorSelection(document, selection)
  }
}

/** Verifies a Definition-editor selection still resolves against `document`, independent of any screen. */
export function reconcileDefinitionEditorSelection(
  document: ProjectDocument,
  selection: DefinitionEditorNodeSelection | null,
): DefinitionEditorNodeSelection | null {
  if (!selection) return null
  if (!hasOwnEntity(document.componentDefinitions, selection.definitionId)) return null
  try {
    resolveDefinitionInlineNodeAtPath(
      document,
      componentDefinitionRefV3(selection.definitionId),
      selection.nodePath,
    )
    return selection
  } catch {
    return null
  }
}

// ------------------------------------------------------------
// JSON (de)serialization for persistence, with exact runtime validation
// ------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isEntityIdPath(value: unknown): value is [EntityId, ...EntityId[]] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString)
}

/**
 * Parses a persisted JSON value into an `EditorSelection`, validating its shape exactly
 * (no unknown fields, correct field types). Returns null for anything malformed; does not
 * check whether the referenced entities still exist (see `reconcileEditorSelection`).
 */
export function parseEditorSelectionValue(value: unknown): EditorSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  switch (record.type) {
    case 'screenInlineComponent':
    case 'screenDefinitionInstance':
      if (
        keys.length === 3 &&
        isNonEmptyString(record.screenId) &&
        isNonEmptyString(record.componentId)
      ) {
        return { type: record.type, screenId: record.screenId, componentId: record.componentId }
      }
      return null
    case 'resolvedDefinitionNode':
      if (
        keys.length === 4 &&
        isNonEmptyString(record.screenId) &&
        isNonEmptyString(record.instanceId) &&
        isEntityIdPath(record.nodePath)
      ) {
        return {
          type: 'resolvedDefinitionNode',
          screenId: record.screenId,
          instanceId: record.instanceId,
          nodePath: record.nodePath,
        }
      }
      return null
    case 'collectionItemNode':
      if (
        keys.length === 4 &&
        isNonEmptyString(record.screenId) &&
        isNonEmptyString(record.collectionId) &&
        isEntityIdPath(record.nodePath)
      ) {
        return {
          type: 'collectionItemNode',
          screenId: record.screenId,
          collectionId: record.collectionId,
          nodePath: record.nodePath,
        }
      }
      return null
    case 'definitionEditorNode':
      if (
        keys.length === 3 &&
        isNonEmptyString(record.definitionId) &&
        isEntityIdPath(record.nodePath)
      ) {
        return {
          type: 'definitionEditorNode',
          definitionId: record.definitionId,
          nodePath: record.nodePath,
        }
      }
      return null
    default:
      return null
  }
}

export function definitionDisplayName(
  document: ProjectDocument,
  definitionId: EntityId,
): string {
  return getOwnEntity(document.componentDefinitions, definitionId)?.name ?? definitionId
}

export function requireComponentDefinition(
  document: ProjectDocument,
  definitionId: EntityId,
): ComponentDefinition {
  const definition = getOwnEntity(document.componentDefinitions, definitionId)
  if (!definition) throw new Error(`Definition ${definitionId} not found`)
  return definition
}
