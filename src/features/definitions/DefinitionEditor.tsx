import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import type {
  ComponentDefinition,
  ComponentDefinitionNode,
  EntityId,
  PublicProp,
  PublicPropFieldV3,
} from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import {
  createEmptyComponentDefinition,
  duplicateComponentDefinition,
} from '../../domain/definitionEditing'
import {
  definitionEditorNodeSelection,
  type DefinitionEditorNodeSelection,
} from '../../domain/editorSelection'
import { collectDefinitionUses, resolveDefinitionInlineNodeAtPath } from '../../domain/definitionTransactions'
import { componentDefinitionRefV3 } from '../../domain/canonicalProjectSpecV3'
import { useI18n } from '../../i18n/I18nProvider'
import { DraftTextField } from '../../components/DraftTextField'
import styles from './DefinitionEditor.module.css'

type InlineDefinitionNode = Extract<ComponentDefinitionNode, { nodeType: 'inline' }>

interface EditableStringField {
  field: PublicPropFieldV3
  labelKey:
    | 'definitions.fieldText'
    | 'definitions.fieldLabel'
    | 'definitions.fieldAlt'
    | 'definitions.fieldDescription'
  value: string
  apply(node: InlineDefinitionNode, value: string): InlineDefinitionNode
  variantKey: 'text' | 'label' | 'alt' | 'source' | 'description'
}

function editableStringField(node: InlineDefinitionNode): EditableStringField {
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

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'property'
}

function selectedDefinitionId(
  definitions: ComponentDefinition[],
  selection: DefinitionEditorNodeSelection | null,
): EntityId | null {
  return selection?.definitionId ?? definitions[0]?.id ?? null
}

export function DefinitionEditor() {
  const { t } = useI18n()
  const {
    effectiveDocument,
    ui,
    dispatch,
    setSelection,
    activeChangeSet,
    showToast,
  } = useAppStore()
  const [selectedVariantId, setSelectedVariantId] = useState<EntityId | null>(null)
  const definitions = useMemo(
    () => Object.values(effectiveDocument.componentDefinitions)
      .sort((left, right) => left.name.localeCompare(right.name)),
    [effectiveDocument.componentDefinitions],
  )
  const definitionSelection = ui.selection?.type === 'definitionEditorNode'
    ? ui.selection
    : null
  const definitionId = selectedDefinitionId(definitions, definitionSelection)
  const definition = definitionId
    ? getOwnEntity(effectiveDocument.componentDefinitions, definitionId)
    : undefined
  const selection = definitionSelection?.definitionId === definitionId
    ? definitionSelection
    : definition
      ? definitionEditorNodeSelection(definition.id, [definition.rootNodeId])
      : null
  const selectedNode = definition && selection
    ? resolveDefinitionInlineNodeAtPath(
        effectiveDocument,
        componentDefinitionRefV3(definition.id),
        selection.nodePath,
      )
    : null
  const editableField = selectedNode ? editableStringField(selectedNode) : null
  const selectedVariant = definition?.variants.find(variant => variant.id === selectedVariantId) ??
    definition?.variants[0]
  const uses = definition ? collectDefinitionUses(effectiveDocument, definition.id) : null
  const reviewLocked = Boolean(activeChangeSet)

  function put(nextDefinition: ComponentDefinition, label: string): boolean {
    if (reviewLocked) {
      showToast({ severity: 'info', message: { key: 'changes.editLocked' } })
      return false
    }
    return dispatch(
      {
        type: 'putComponentDefinition',
        mode: getOwnEntity(effectiveDocument.componentDefinitions, nextDefinition.id)
          ? 'update'
          : 'create',
        definition: nextDefinition,
      },
      label,
    )
  }

  function createDefinition() {
    const definitionId = `definition-${nanoid()}`
    const next = createEmptyComponentDefinition(definitionId, `node-${nanoid()}`, t('definitions.create'))
    put(next, t('definitions.create'))
    setSelection(definitionEditorNodeSelection(next.id, [next.rootNodeId]))
  }

  function selectDefinition(next: ComponentDefinition) {
    setSelection(definitionEditorNodeSelection(next.id, [next.rootNodeId]))
    setSelectedVariantId(next.representativeVariantId ?? next.variants[0]?.id ?? null)
  }

  function updateDefinition(
    mutator: (copy: ComponentDefinition) => void,
    label: string,
  ): boolean {
    if (!definition) return false
    const copy = structuredClone(definition)
    mutator(copy)
    return put(copy, label)
  }

  function updateSelectedNode(
    mutator: (node: InlineDefinitionNode) => InlineDefinitionNode,
  ): boolean {
    if (!selectedNode) return false
    return updateDefinition(copy => {
      copy.nodes[selectedNode.id] = mutator(structuredClone(selectedNode))
    }, t('definitions.nodeBase'))
  }

  function addPublicProp() {
    if (!definition || !selection || !selectedNode || !editableField) return
    const fieldLabel = t(editableField.labelKey)
    const baseKey = slug(fieldLabel)
    let key = baseKey
    let suffix = 2
    while (definition.publicProps.some(prop => prop.key === key)) {
      key = `${baseKey}-${suffix}`
      suffix += 1
    }
    const prop: PublicProp = {
      key,
      name: fieldLabel,
      description: '',
      type: 'string',
      bindings: [{ nodePath: [...selection.nodePath], field: editableField.field }],
    }
    updateDefinition(copy => {
      copy.publicProps.push(prop)
    }, t('definitions.publishField'))
  }

  function addVariant() {
    if (!definition) return
    updateDefinition(copy => {
      const nextNumber = copy.variants.length + 1
      const value = nextNumber === 1 ? 'default' : `variant-${nextNumber}`
      if (copy.variantProperties.length === 0) {
        copy.variantProperties.push({
          key: 'mode',
          name: 'Mode',
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
      setSelectedVariantId(variantId)
    }, t('definitions.addVariant'))
  }

  return (
    <div className={styles.root} data-definition-editor>
      <aside className={styles.library} aria-label={t('definitions.title')}>
        <div className={styles.libraryHeader}>
          <h2>{t('definitions.title')}</h2>
          <button type="button" onClick={createDefinition} disabled={reviewLocked}>
            + {t('definitions.create')}
          </button>
        </div>
        <ul className={styles.definitionList}>
          {definitions.map(item => (
            <li key={item.id}>
              <button
                type="button"
                className={item.id === definitionId ? styles.activeDefinition : ''}
                aria-current={item.id === definitionId ? 'page' : undefined}
                onClick={() => selectDefinition(item)}
              >
                <strong>{item.name}</strong>
                <span>{Object.values(effectiveDocument.components).filter(
                  component => component.nodeType === 'definitionInstance' &&
                    component.source.$ref === componentDefinitionRefV3(item.id),
                ).length} {t('definitions.instance')}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {!definition ? (
        <div className={styles.empty}>
          <p>{t('definitions.empty')}</p>
          <button type="button" onClick={createDefinition} disabled={reviewLocked}>
            {t('definitions.create')}
          </button>
        </div>
      ) : (
        <div className={styles.workspace}>
          {reviewLocked ? <p className={styles.lockNotice}>{t('definitions.reviewLocked')}</p> : null}
          <header className={styles.definitionHeader}>
            <div>
              <label>
                <span>{t('definitions.name')}</span>
                <DraftTextField
                  key={`definition:${definition.id}:name`}
                  draftId={`definition:${definition.id}:name`}
                  value={definition.name}
                  disabled={reviewLocked}
                  onCommit={value => updateDefinition(copy => {
                    copy.name = value
                  }, t('definitions.name'))}
                />
              </label>
              <label>
                <span>{t('definitions.description')}</span>
                <DraftTextField
                  key={`definition:${definition.id}:description`}
                  draftId={`definition:${definition.id}:description`}
                  value={definition.description}
                  multiline
                  disabled={reviewLocked}
                  onCommit={value => updateDefinition(copy => {
                    copy.description = value
                  }, t('definitions.description'))}
                />
              </label>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                disabled={reviewLocked}
                onClick={() => {
                  const duplicate = duplicateComponentDefinition(
                    definition,
                    `definition-${nanoid()}`,
                    `${definition.name} copy`,
                    nanoid,
                  )
                  put(duplicate, t('definitions.duplicate'))
                  setSelection(definitionEditorNodeSelection(duplicate.id, [duplicate.rootNodeId]))
                }}
              >
                {t('definitions.duplicate')}
              </button>
              <button
                type="button"
                disabled={
                  reviewLocked ||
                  Boolean(uses && (uses.screenInstanceIds.length || uses.nestedDefinitionNodeIds.length))
                }
                title={uses && (uses.screenInstanceIds.length || uses.nestedDefinitionNodeIds.length)
                  ? t('definitions.deleteBlocked')
                  : undefined}
                onClick={() => {
                  if (!dispatch(
                    { type: 'removeComponentDefinition', definitionId: definition.id },
                    t('definitions.delete'),
                  )) return
                  const next = definitions.find(item => item.id !== definition.id)
                  setSelection(next
                    ? definitionEditorNodeSelection(next.id, [next.rootNodeId])
                    : null)
                }}
              >
                {t('definitions.delete')}
              </button>
            </div>
          </header>
          {uses && (uses.screenInstanceIds.length > 0 || uses.nestedDefinitionNodeIds.length > 0) ? (
            <div className={styles.usageImpact} data-definition-usage-impact>
              <strong>{t('definitions.deleteImpact')}</strong>
              <ul>
                <li>{t('definitions.screenUses', { count: uses.screenInstanceIds.length })}</li>
                <li>{t('definitions.nestedUses', { count: uses.nestedDefinitionNodeIds.length })}</li>
                <li>{t('definitions.propUses', { count: uses.instancePropValueCount })}</li>
                <li>{t('definitions.scenarioUses', { count: uses.scenarioOverrideCount })}</li>
                <li>{t('definitions.eventUses', { count: uses.eventTriggerCount })}</li>
                <li>{t('definitions.apiUses', { count: uses.apiBindingCount })}</li>
              </ul>
            </div>
          ) : null}

          <div className={styles.editorGrid}>
            <section className={styles.panel}>
              <h3>{t('definitions.nodes')}</h3>
              <DefinitionNodeTree
                definition={definition}
                selectedNodeId={selectedNode?.id ?? null}
                onSelect={nodePath => setSelection(
                  definitionEditorNodeSelection(definition.id, nodePath),
                )}
              />
            </section>

            <section className={styles.panel}>
              <h3>{t('definitions.nodeBase')}</h3>
              {selectedNode && editableField ? (
                <>
                  <p className={styles.nodeKind}>{selectedNode.kind} · {selectedNode.id}</p>
                  <label>
                    <span>{t(editableField.labelKey)}</span>
                    <DraftTextField
                      key={`definition:${definition.id}:node:${selection?.nodePath.join('/')}:${editableField.field}`}
                      draftId={`definition:${definition.id}:node:${selection?.nodePath.join('/')}:${editableField.field}`}
                      value={editableField.value}
                      multiline
                      disabled={reviewLocked}
                      onCommit={value =>
                        updateSelectedNode(node => editableField.apply(node, value))}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={reviewLocked || definition.publicProps.some(prop =>
                      prop.bindings.some(binding =>
                        binding.field === editableField.field &&
                        JSON.stringify(binding.nodePath) === JSON.stringify(selection?.nodePath),
                      ),
                    )}
                    onClick={addPublicProp}
                  >
                    + {t('definitions.publishField')}
                  </button>
                </>
              ) : null}
            </section>

            <section className={styles.panel}>
              <h3>{t('definitions.properties')}</h3>
              {definition.publicProps.length === 0 ? (
                <p className={styles.muted}>{t('definitions.noProperties')}</p>
              ) : (
                <ul className={styles.propertyList}>
                  {definition.publicProps.map(prop => (
                    <li key={prop.key}>
                      <div>
                        <strong>{prop.name}</strong>
                        <code>{prop.key}</code>
                      </div>
                      <span>{prop.type} · {prop.bindings.length}</span>
                      <button
                        type="button"
                        disabled={reviewLocked}
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
            </section>

            <section className={styles.panel}>
              <div className={styles.panelTitle}>
                <h3>{t('definitions.variants')}</h3>
                <button type="button" onClick={addVariant} disabled={reviewLocked}>
                  + {t('definitions.addVariant')}
                </button>
              </div>
              {definition.variants.length === 0 ? (
                <p className={styles.muted}>{t('definitions.noVariants')}</p>
              ) : (
                <>
                  <label>
                    <span>{t('definitions.representative')}</span>
                    <select
                      value={definition.representativeVariantId ?? ''}
                      disabled={reviewLocked}
                      onChange={event => updateDefinition(copy => {
                        copy.representativeVariantId = event.target.value || null
                      }, t('definitions.representative'))}
                    >
                      <option value="">{t('definitions.baseVariant')}</option>
                      {definition.variants.map(variant => (
                        <option key={variant.id} value={variant.id}>{variant.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.variantTabs}>
                    {definition.variants.map(variant => (
                      <button
                        type="button"
                        key={variant.id}
                        className={selectedVariant?.id === variant.id ? styles.activeVariant : ''}
                        onClick={() => setSelectedVariantId(variant.id)}
                      >
                        {variant.name}
                      </button>
                    ))}
                  </div>
                  {selectedVariant && selectedNode && editableField ? (
                    <label>
                      <span>{selectedNode.kind} · {t(editableField.labelKey)}</span>
                      <DraftTextField
                        key={`definition:${definition.id}:variant:${selectedVariant.id}:node:${selection?.nodePath.join('/')}:${editableField.variantKey}`}
                        draftId={`definition:${definition.id}:variant:${selectedVariant.id}:node:${selection?.nodePath.join('/')}:${editableField.variantKey}`}
                        value={
                          editableField.variantKey === 'description'
                            ? selectedVariant.nodeOverrides[selectedNode.id]?.common?.description ?? ''
                            : String(
                                selectedVariant.nodeOverrides[selectedNode.id]?.config?.[
                                  editableField.variantKey
                                ] ?? '',
                              )
                        }
                        placeholder={t('definitions.defaultValue')}
                        disabled={reviewLocked}
                        onCommit={value => updateDefinition(copy => {
                          const variant = copy.variants.find(item => item.id === selectedVariant.id)
                          if (!variant) return
                          const override = variant.nodeOverrides[selectedNode.id] ?? {}
                          if (editableField.variantKey === 'description') {
                            override.common = {
                              ...override.common,
                              description: value,
                            }
                          } else {
                            override.config = {
                              ...override.config,
                              [editableField.variantKey]: value,
                            }
                          }
                          variant.nodeOverrides[selectedNode.id] = override
                        }, t('definitions.variants'))}
                      />
                    </label>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

function DefinitionNodeTree({
  definition,
  selectedNodeId,
  onSelect,
}: {
  definition: ComponentDefinition
  selectedNodeId: EntityId | null
  onSelect(nodePath: [EntityId, ...EntityId[]]): void
}) {
  function renderNode(
    nodeId: EntityId,
    path: [EntityId, ...EntityId[]],
  ): ReactNode {
    const node = getOwnEntity(definition.nodes, nodeId)
    if (!node) return null
    return (
      <li key={node.id}>
        {node.nodeType === 'inline' ? (
          <button
            type="button"
            aria-current={selectedNodeId === node.id ? 'true' : undefined}
            className={selectedNodeId === node.id ? styles.activeNode : ''}
            onClick={() => onSelect(path)}
            data-definition-tree-node={node.id}
            data-definition-node-path={path.join('/')}
          >
            <span>{node.kind}</span>
            <code>{node.id}</code>
          </button>
        ) : (
          <span
            data-definition-tree-node={node.id}
            data-definition-node-path={path.join('/')}
          >
            <span>Instance</span>
            <code>{node.id}</code>
          </span>
        )}
        {node.childIds.length > 0 ? (
          <ul>
            {node.childIds.map(childId =>
              renderNode(
                childId,
                node.id === definition.rootNodeId
                  ? [childId]
                  : [...path, childId] as [EntityId, ...EntityId[]],
              ))}
          </ul>
        ) : null}
      </li>
    )
  }
  return <ul className={styles.nodeTree}>{renderNode(definition.rootNodeId, [definition.rootNodeId])}</ul>
}
