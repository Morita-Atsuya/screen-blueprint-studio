import { useId, useState } from 'react'
import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import type {
  ComponentDefinition,
  ComponentLayout,
  EntityId,
  PublicProp,
} from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import {
  duplicateComponentDefinition,
  resolveOwnedDefinitionInlineNodeAtPath,
} from '../../domain/definitionEditing'
import {
  definitionEditorNodeSelection,
  type DefinitionEditorNodeSelection,
} from '../../domain/editorSelection'
import {
  collectDefinitionUses,
  resolveDefinitionInlineNodeAtPath,
} from '../../domain/definitionTransactions'
import { componentDefinitionRefV3 } from '../../domain/canonicalProjectSpecV3'
import { DraftTextField } from '../../components/DraftTextField'
import { useI18n } from '../../i18n/I18nProvider'
import { InspectorSection } from '../inspector/InspectorSection'
import {
  LayoutFields,
  PlacementFields,
  SizingFields,
} from '../inspector/Inspector'
import {
  editableStringField,
  parentDefinitionLayout,
  resolvePreviewVariantId,
  slug,
  type InlineDefinitionNode,
} from './definitionEditorModel'
import styles from '../inspector/Inspector.module.css'

function safelyResolveOwnedNode(
  definition: ComponentDefinition,
  selection: DefinitionEditorNodeSelection,
): InlineDefinitionNode | null {
  try {
    return resolveOwnedDefinitionInlineNodeAtPath(definition, selection.nodePath)
  } catch {
    return null
  }
}

function safelyResolveNode(
  document: ReturnType<typeof useAppStore.getState>['effectiveDocument'],
  selection: DefinitionEditorNodeSelection,
): InlineDefinitionNode | null {
  try {
    return resolveDefinitionInlineNodeAtPath(
      document,
      componentDefinitionRefV3(selection.definitionId),
      selection.nodePath,
    )
  } catch {
    return null
  }
}

export function DefinitionInspector({
  previewVariantId,
  onPreviewVariantChange,
}: {
  previewVariantId: EntityId | null
  onPreviewVariantChange(variantId: EntityId | null): void
}) {
  const { t } = useI18n()
  const {
    effectiveDocument,
    ui,
    dispatch,
    setSelection,
    activeChangeSet,
    showToast,
  } = useAppStore()
  const selection = ui.selection?.type === 'definitionEditorNode' ? ui.selection : null
  const definition = selection
    ? getOwnEntity(effectiveDocument.componentDefinitions, selection.definitionId)
    : undefined
  const selectedNode = definition && selection
    ? safelyResolveNode(effectiveDocument, selection)
    : null
  const ownedNode = definition && selection
    ? safelyResolveOwnedNode(definition, selection)
    : null
  const editableField = ownedNode ? editableStringField(ownedNode) : null
  const selectedVariantId = definition
    ? resolvePreviewVariantId(definition, previewVariantId)
    : null
  const selectedVariant = selectedVariantId === null
    ? undefined
    : definition?.variants.find(variant => variant.id === selectedVariantId)
  const uses = definition ? collectDefinitionUses(effectiveDocument, definition.id) : null
  const reviewLocked = Boolean(activeChangeSet)
  const [expandedSections, setExpandedSections] = useState({
    component: true,
    basic: true,
    layout: true,
    placement: true,
    properties: true,
    patterns: true,
  })
  const isRoot = Boolean(
    definition &&
    selection?.nodePath.length === 1 &&
    selection.nodePath[0] === definition.rootNodeId,
  )

  if (!definition || !selection) {
    return <p className={styles.empty}>{t('definitions.selectSharedComponent')}</p>
  }

  function toggleSection(section: keyof typeof expandedSections) {
    setExpandedSections(current => ({ ...current, [section]: !current[section] }))
  }

  function put(nextDefinition: ComponentDefinition, label: string): boolean {
    if (reviewLocked) {
      showToast({ severity: 'info', message: { key: 'changes.editLocked' } })
      return false
    }
    return dispatch(
      { type: 'putComponentDefinition', mode: 'update', definition: nextDefinition },
      label,
    )
  }

  function updateDefinition(
    mutator: (copy: ComponentDefinition) => void,
    label: string,
  ): boolean {
    const copy = structuredClone(definition!)
    mutator(copy)
    return put(copy, label)
  }

  function updateSelectedNode(
    mutator: (node: InlineDefinitionNode) => InlineDefinitionNode,
    label: string,
  ): boolean {
    if (!ownedNode) return false
    return updateDefinition(copy => {
      copy.nodes[ownedNode.id] = mutator(structuredClone(ownedNode))
    }, label)
  }

  function addPublicProp() {
    if (!ownedNode || !editableField) return
    const fieldLabel = t(editableField.labelKey)
    const baseKey = slug(fieldLabel)
    let key = baseKey
    let suffix = 2
    while (definition!.publicProps.some(prop => prop.key === key)) {
      key = `${baseKey}-${suffix}`
      suffix += 1
    }
    const prop: PublicProp = {
      key,
      name: fieldLabel,
      description: '',
      type: 'string',
      bindings: [{ nodePath: [...selection!.nodePath], field: editableField.field }],
    }
    updateDefinition(copy => {
      copy.publicProps.push(prop)
    }, t('definitions.publishField'))
  }

  function addVariant() {
    updateDefinition(copy => {
      const nextNumber = copy.variants.length + 1
      const value = nextNumber === 1 ? 'default' : `variant-${nextNumber}`
      if (copy.variantProperties.length === 0) {
        copy.variantProperties.push({
          key: 'mode',
          name: t('definitions.displayPattern'),
          description: '',
          values: [value],
        })
      } else if (!copy.variantProperties[0]!.values.includes(value)) {
        copy.variantProperties[0]!.values.push(value)
      }
      const propertyValues = Object.fromEntries(
        copy.variantProperties.map((property, index) => [
          property.key,
          index === 0 ? value : property.values[0]!,
        ]),
      )
      const variantId = `variant-${nanoid()}`
      copy.variants.push({
        id: variantId,
        name: value,
        propertyValues,
        nodeOverrides: {},
      })
      copy.representativeVariantId ??= variantId
      onPreviewVariantChange(variantId)
    }, t('definitions.addVariant'))
  }

  const parentLayout = ownedNode ? parentDefinitionLayout(definition, ownedNode) : null
  const selectedLayout = ownedNode && (
    ownedNode.config.kind === 'page' ||
    ownedNode.config.kind === 'container' ||
    ownedNode.config.kind === 'modal'
  ) ? ownedNode.config : null
  const flowChildSizing = ownedNode?.childIds.flatMap(childId => {
    const child = getOwnEntity(definition.nodes, childId)
    return child?.nodeType === 'inline' && child.placement.mode === 'flow'
      ? [child.sizing]
      : []
  }) ?? []
  const minimumGridColumns = Math.max(1, ...flowChildSizing.map(sizing => sizing.gridSpan))
  const layoutAvailability: Record<ComponentLayout['layout'], boolean> = {
    vertical: flowChildSizing.every(sizing =>
      sizing.gridSpan === 1 && sizing.grow === 0 && sizing.shrink === 'allow'),
    horizontal: flowChildSizing.every(sizing => sizing.gridSpan === 1),
    grid: flowChildSizing.every(sizing =>
      sizing.grow === 0 &&
      sizing.shrink === 'allow' &&
      sizing.gridSpan <= (selectedLayout?.columns ?? 1)),
  }
  const existingBinding = editableField
    ? definition.publicProps.some(prop => prop.bindings.some(binding =>
        binding.field === editableField.field &&
        JSON.stringify(binding.nodePath) === JSON.stringify(selection.nodePath)))
    : false
  const usageCount = (uses?.screenInstanceIds.length ?? 0) +
    (uses?.nestedDefinitionNodeIds.length ?? 0)

  return (
    <div className={styles.root} data-definition-inspector data-shared-component-inspector>
      <header className={styles.selectionContext}>
        <span className={styles.selectionEyebrow}>{t('definitions.inspectorEyebrow')}</span>
        <h2 className={styles.selectionTitle} title={definition.name}>{definition.name}</h2>
        <p className={styles.context}>
          {isRoot
            ? t('definitions.rootSelection')
            : selectedNode
              ? `${selectedNode.kind} · ${selectedNode.id}`
              : selection.nodePath.join(' / ')}
        </p>
      </header>
      {reviewLocked ? (
        <p id="inspector-review-lock" className={styles.reviewLock}>
          {t('definitions.reviewLocked')}
        </p>
      ) : null}

      <>
        <InspectorSection
          sectionId="basic"
          title={t('definitions.componentSettings')}
          expanded={expandedSections.component}
          badges={[]}
          onToggle={() => toggleSection('component')}
        >
          <Field label={t('definitions.name')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${definition.id}:name`}
              draftId={`definition:${definition.id}:name`}
              className={styles.input}
              value={definition.name}
              onCommit={name => updateDefinition(copy => { copy.name = name }, t('definitions.name'))}
            />
          )}</Field>
          <Field label={t('definitions.description')}>{controlId => (
            <DraftTextField
              id={controlId}
              key={`${definition.id}:description`}
              draftId={`definition:${definition.id}:description`}
              className={styles.textarea}
              value={definition.description}
              multiline
              rows={2}
              onCommit={description => updateDefinition(
                copy => { copy.description = description },
                t('definitions.description'),
              )}
            />
          )}</Field>
          <p className={styles.reviewLock}>{t('definitions.usageCount', { count: usageCount })}</p>
          <div className={styles.inlineActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                const duplicate = duplicateComponentDefinition(
                  definition,
                  `definition-${nanoid()}`,
                  `${definition.name} ${t('definitions.copySuffix')}`,
                  nanoid,
                )
                if (!dispatch(
                  { type: 'putComponentDefinition', mode: 'create', definition: duplicate },
                  t('definitions.duplicate'),
                )) return
                onPreviewVariantChange(duplicate.representativeVariantId)
                setSelection(definitionEditorNodeSelection(
                  duplicate.id,
                  [duplicate.rootNodeId],
                ))
              }}
            >
              {t('definitions.duplicate')}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={reviewLocked || usageCount > 0}
              title={usageCount > 0 ? t('definitions.deleteBlocked') : undefined}
              onClick={() => {
                if (!dispatch(
                  { type: 'removeComponentDefinition', definitionId: definition.id },
                  t('definitions.delete'),
                )) return
                const next = Object.values(effectiveDocument.componentDefinitions)
                  .find(item => item.id !== definition.id)
                setSelection(next
                  ? definitionEditorNodeSelection(next.id, [next.rootNodeId])
                  : null)
              }}
            >
              {t('definitions.delete')}
            </button>
          </div>
          {uses && usageCount > 0 ? (
            <div data-definition-usage-impact>
              <p className={styles.reviewLock}>{t('definitions.deleteImpact')}</p>
              <ul className={styles.definitionImpactList}>
                <li>{t('definitions.screenUses', { count: uses.screenInstanceIds.length })}</li>
                <li>{t('definitions.nestedUses', { count: uses.nestedDefinitionNodeIds.length })}</li>
                <li>{t('definitions.propUses', { count: uses.instancePropValueCount })}</li>
                <li>{t('definitions.scenarioUses', { count: uses.scenarioOverrideCount })}</li>
                <li>{t('definitions.eventUses', { count: uses.eventTriggerCount })}</li>
                <li>{t('definitions.apiUses', { count: uses.apiBindingCount })}</li>
              </ul>
            </div>
          ) : null}
        </InspectorSection>

        <InspectorSection
          sectionId="content"
          title={t('definitions.nodeBase')}
          expanded={expandedSections.basic}
          badges={[]}
          onToggle={() => toggleSection('basic')}
        >
          {!ownedNode || !editableField ? (
            <p className={styles.reviewLock}>{t('definitions.nestedReadOnly')}</p>
          ) : (
            <>
              {editableField.field !== 'common.description' ? (
                <Field label={t(editableField.labelKey)}>{controlId => (
                  <DraftTextField
                    id={controlId}
                    key={`${definition.id}:${selection.nodePath.join('/')}:${editableField.field}`}
                    draftId={`definition:${definition.id}:node:${selection.nodePath.join('/')}:${editableField.field}`}
                    className={styles.textarea}
                    value={editableField.value}
                    multiline
                    rows={2}
                    onCommit={value => updateSelectedNode(
                      node => editableField.apply(node, value),
                      t('definitions.nodeBase'),
                    )}
                  />
                )}</Field>
              ) : null}
              <Field label={t('inspector.description')}>{controlId => (
                <DraftTextField
                  id={controlId}
                  key={`${definition.id}:${ownedNode.id}:description`}
                  draftId={`definition:${definition.id}:node:${ownedNode.id}:common.description`}
                  className={styles.textarea}
                  value={ownedNode.common.description}
                  multiline
                  rows={2}
                  onCommit={description => updateSelectedNode(node => ({
                    ...node,
                    common: { ...node.common, description },
                  }), t('inspector.description'))}
                />
              )}</Field>
              <div className={styles.row}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={ownedNode.common.visible}
                    onChange={event => updateSelectedNode(node => ({
                      ...node,
                      common: { ...node.common, visible: event.target.checked },
                    }), t('inspector.visible'))}
                  />
                  {t('inspector.visible')}
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={ownedNode.common.enabled}
                    onChange={event => updateSelectedNode(node => ({
                      ...node,
                      common: { ...node.common, enabled: event.target.checked },
                    }), t('inspector.enabled'))}
                  />
                  {t('inspector.enabled')}
                </label>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={reviewLocked || existingBinding}
                onClick={addPublicProp}
              >
                + {t('definitions.publishField')}
              </button>
            </>
          )}
        </InspectorSection>

        {selectedLayout && ownedNode ? (
          <InspectorSection
            sectionId="layout"
            title={t('inspector.sectionLayout')}
            expanded={expandedSections.layout}
            badges={[]}
            onToggle={() => toggleSection('layout')}
          >
            <LayoutFields
              layout={selectedLayout}
              minimumGridColumns={minimumGridColumns}
              availability={layoutAvailability}
              onUpdate={partial => updateSelectedNode(node => ({
                ...node,
                config: { ...node.config, ...partial } as typeof node.config,
              }), t('inspector.sectionLayout'))}
            />
          </InspectorSection>
        ) : null}

        {ownedNode && !isRoot ? (
          <InspectorSection
            sectionId="placement"
            title={t('inspector.sectionPlacement')}
            expanded={expandedSections.placement}
            badges={[]}
            onToggle={() => toggleSection('placement')}
          >
            <SizingFields
              sizing={ownedNode.sizing}
              placement={ownedNode.placement}
              parentLayout={parentLayout}
              onUpdate={sizing => updateSelectedNode(
                node => ({ ...node, sizing }),
                t('inspector.sectionPlacement'),
              )}
            />
            <PlacementFields
              placement={ownedNode.placement}
              onUpdate={placement => updateSelectedNode(
                node => ({ ...node, placement }),
                t('inspector.sectionPlacement'),
              )}
            />
          </InspectorSection>
        ) : null}

        <InspectorSection
          sectionId="validation"
          title={t('definitions.properties')}
          expanded={expandedSections.properties}
          badges={[]}
          onToggle={() => toggleSection('properties')}
        >
          {definition.publicProps.length === 0 ? (
            <p className={styles.reviewLock}>{t('definitions.noProperties')}</p>
          ) : (
            <ul className={styles.definitionItemList}>
              {definition.publicProps.map(prop => (
                <li key={prop.key}>
                  <span><strong>{prop.name}</strong><code>{prop.key}</code></span>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    aria-label={`${t('definitions.removeProperty')}: ${prop.name}`}
                    onClick={() => updateDefinition(copy => {
                      copy.publicProps = copy.publicProps.filter(item => item.key !== prop.key)
                    }, t('definitions.removeProperty'))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </InspectorSection>

        <InspectorSection
          sectionId="stateOverrides"
          title={t('definitions.variants')}
          expanded={expandedSections.patterns}
          badges={[]}
          onToggle={() => toggleSection('patterns')}
        >
          <button type="button" className={styles.secondaryButton} onClick={addVariant}>
            + {t('definitions.addVariant')}
          </button>
          {definition.variants.length === 0 ? (
            <p className={styles.reviewLock}>{t('definitions.noVariants')}</p>
          ) : (
            <>
              <Field label={t('definitions.representative')}>{controlId => (
                <select
                  id={controlId}
                  className={styles.input}
                  value={definition.representativeVariantId ?? ''}
                  onChange={event => updateDefinition(copy => {
                    copy.representativeVariantId = event.target.value || null
                  }, t('definitions.representative'))}
                >
                  <option value="">{t('definitions.baseVariant')}</option>
                  {definition.variants.map(variant => (
                    <option key={variant.id} value={variant.id}>{variant.name}</option>
                  ))}
                </select>
              )}</Field>
              <Field label={t('definitions.previewVariant')}>{controlId => (
                <select
                  id={controlId}
                  className={styles.input}
                  value={selectedVariantId ?? ''}
                  onChange={event => onPreviewVariantChange(event.target.value || null)}
                >
                  <option value="">{t('definitions.baseVariant')}</option>
                  {definition.variants.map(variant => (
                    <option key={variant.id} value={variant.id}>{variant.name}</option>
                  ))}
                </select>
              )}</Field>
              {selectedVariant && ownedNode && editableField ? (
                <Field label={t('definitions.selectedPatternOverride')}>{controlId => (
                  <DraftTextField
                    id={controlId}
                    key={`${definition.id}:${selectedVariant.id}:${ownedNode.id}:${editableField.variantKey}`}
                    draftId={`definition:${definition.id}:variant:${selectedVariant.id}:node:${ownedNode.id}:${editableField.variantKey}`}
                    className={styles.textarea}
                    value={editableField.variantKey === 'description'
                      ? selectedVariant.nodeOverrides[ownedNode.id]?.common?.description ?? ''
                      : String(
                          selectedVariant.nodeOverrides[ownedNode.id]?.config?.[
                            editableField.variantKey
                          ] ?? '',
                        )}
                    placeholder={t('definitions.defaultValue')}
                    multiline
                    rows={2}
                    onCommit={value => updateDefinition(copy => {
                      const variant = copy.variants.find(item => item.id === selectedVariant.id)
                      if (!variant) return
                      const override = variant.nodeOverrides[ownedNode.id] ?? {}
                      if (editableField.variantKey === 'description') {
                        override.common = { ...override.common, description: value }
                      } else {
                        override.config = {
                          ...override.config,
                          [editableField.variantKey]: value,
                        }
                      }
                      variant.nodeOverrides[ownedNode.id] = override
                    }, t('definitions.variants'))}
                  />
                )}</Field>
              ) : null}
            </>
          )}
        </InspectorSection>
      </>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children(controlId: string): React.ReactNode
}) {
  const controlId = useId()
  return (
    <div style={{ marginBottom: 10 }}>
      <label className={styles.label} htmlFor={controlId}>{label}</label>
      {children(controlId)}
    </div>
  )
}
