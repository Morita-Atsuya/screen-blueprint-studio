import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import type { ComponentDefinition, EntityId } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import { createEmptyComponentDefinition } from '../../domain/definitionEditing'
import {
  definitionEditorNodeSelection,
  type DefinitionEditorNodeSelection,
} from '../../domain/editorSelection'
import { collectDefinitionUses } from '../../domain/definitionTransactions'
import { resolveComponentDefinitionRefV3 } from '../../domain/canonicalProjectSpecV3'
import { useI18n } from '../../i18n/I18nProvider'
import { ResolvedDefinitionPreview } from '../canvas/Canvas'
import {
  createDefinitionPreviewModel,
  resolvePreviewVariantId,
} from './definitionEditorModel'
import styles from './DefinitionEditor.module.css'

function selectedDefinitionId(
  definitions: ComponentDefinition[],
  selection: DefinitionEditorNodeSelection | null,
): EntityId | null {
  return selection?.definitionId ?? definitions[0]?.id ?? null
}

export function DefinitionEditor({
  previewVariantId,
  onPreviewVariantChange,
}: {
  previewVariantId: EntityId | null
  onPreviewVariantChange(variantId: EntityId | null): void
}) {
  const { locale, t } = useI18n()
  const {
    effectiveDocument,
    ui,
    dispatch,
    setSelection,
    activeChangeSet,
    showToast,
  } = useAppStore()
  const [useSampleValues, setUseSampleValues] = useState(false)
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
  const selectedVariantId = definition
    ? resolvePreviewVariantId(definition, previewVariantId)
    : null
  const preview = useMemo(
    () => definition
      ? createDefinitionPreviewModel(
          effectiveDocument,
          definition,
          selectedVariantId,
          useSampleValues,
        )
      : null,
    [definition, effectiveDocument, selectedVariantId, useSampleValues],
  )
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
    const next = createEmptyComponentDefinition(
      `definition-${nanoid()}`,
      `node-${nanoid()}`,
      t('definitions.createDefaultName'),
    )
    if (!put(next, t('definitions.create'))) return
    onPreviewVariantChange(null)
    setSelection(definitionEditorNodeSelection(next.id, [next.rootNodeId]))
  }

  function selectDefinition(next: ComponentDefinition) {
    onPreviewVariantChange(next.representativeVariantId ?? next.variants[0]?.id ?? null)
    setSelection(definitionEditorNodeSelection(next.id, [next.rootNodeId]))
  }

  return (
    <div className={styles.root} data-definition-editor data-shared-components-editor>
      <aside className={styles.library} aria-label={t('definitions.title')}>
        <div className={styles.libraryHeader}>
          <h2>{t('definitions.title')}</h2>
          <button type="button" onClick={createDefinition} disabled={reviewLocked}>
            + {t('definitions.create')}
          </button>
        </div>
        <ul className={styles.definitionList}>
          {definitions.map(item => {
            const uses = collectDefinitionUses(effectiveDocument, item.id)
            const instanceCount = uses.screenInstanceIds.length + uses.nestedDefinitionNodeIds.length
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.id === definitionId ? styles.activeDefinition : ''}
                  aria-current={item.id === definitionId ? 'page' : undefined}
                  onClick={() => selectDefinition(item)}
                >
                  <strong title={item.name}>{item.name}</strong>
                  <span>{t('definitions.usageCount', { count: instanceCount })}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {definition && selection ? (
          <section className={styles.structure} aria-label={t('definitions.nodes')}>
            <h3>{t('definitions.nodes')}</h3>
            <DefinitionNodeTree
              document={effectiveDocument}
              definition={definition}
              selectedPath={selection.nodePath}
              onSelect={nodePath => setSelection(
                definitionEditorNodeSelection(definition.id, nodePath),
              )}
            />
          </section>
        ) : null}
      </aside>

      {!definition || !selection || !preview ? (
        <div className={styles.empty}>
          <p>{t('definitions.empty')}</p>
          <button type="button" onClick={createDefinition} disabled={reviewLocked}>
            {t('definitions.create')}
          </button>
        </div>
      ) : (
        <section className={styles.workspace} aria-label={t('definitions.preview')}>
          <header className={styles.previewToolbar} data-definition-preview-toolbar>
            <div className={styles.previewIdentity}>
              <strong title={definition.name}>{definition.name}</strong>
              <span>{t(preview.sampleSource)}</span>
            </div>
            <div
              className={styles.variantTabs}
              role="group"
              aria-label={t('definitions.previewVariant')}
            >
              <button
                type="button"
                className={selectedVariantId === null ? styles.activeVariant : ''}
                aria-pressed={selectedVariantId === null}
                onClick={() => onPreviewVariantChange(null)}
              >
                {t('definitions.baseVariant')}
              </button>
              {definition.variants.map(variant => (
                <button
                  type="button"
                  key={variant.id}
                  className={selectedVariantId === variant.id ? styles.activeVariant : ''}
                  aria-pressed={selectedVariantId === variant.id}
                  onClick={() => onPreviewVariantChange(variant.id)}
                  title={variant.name}
                >
                  {variant.name}
                </button>
              ))}
            </div>
            <div
              className={styles.valueTabs}
              role="group"
              aria-label={t('definitions.previewValues')}
            >
              <button
                type="button"
                className={!useSampleValues ? styles.activeVariant : ''}
                aria-pressed={!useSampleValues}
                onClick={() => setUseSampleValues(false)}
              >
                {t('definitions.previewBaseValuesShort')}
              </button>
              <button
                type="button"
                className={useSampleValues ? styles.activeVariant : ''}
                aria-pressed={useSampleValues}
                onClick={() => setUseSampleValues(true)}
              >
                {t('definitions.previewUsageValues')}
              </button>
            </div>
          </header>
          {reviewLocked ? (
            <p className={styles.lockNotice}>{t('definitions.reviewLocked')}</p>
          ) : null}
          <div className={styles.previewStage} data-definition-preview>
            <ResolvedDefinitionPreview
              rootRuntimeId={preview.rootRuntimeId}
              resolved={preview.resolved}
              document={preview.document}
              locale={locale}
              t={t}
              definitionSelection={{
                definitionId: definition.id,
                selectedNodePath: selection.nodePath,
                onSelect: nodePath => setSelection(
                  definitionEditorNodeSelection(definition.id, nodePath),
                ),
              }}
            />
          </div>
          <p className={styles.previewHint}>{t('definitions.previewHint')}</p>
        </section>
      )}
    </div>
  )
}

function DefinitionNodeTree({
  document,
  definition,
  selectedPath,
  onSelect,
}: {
  document: ReturnType<typeof useAppStore.getState>['effectiveDocument']
  definition: ComponentDefinition
  selectedPath: readonly EntityId[]
  onSelect(nodePath: [EntityId, ...EntityId[]]): void
}) {
  const { t } = useI18n()
  const selectedPathKey = selectedPath.join('/')
  function renderNode(
    nodeId: EntityId,
    path: [EntityId, ...EntityId[]],
  ): ReactNode {
    const node = getOwnEntity(definition.nodes, nodeId)
    if (!node) return null
    const selectionPath = node.nodeType === 'definitionInstance'
      ? [
          ...path,
          resolveComponentDefinitionRefV3(document, node.source.$ref).rootNodeId,
        ] as [EntityId, ...EntityId[]]
      : path
    const pathKey = selectionPath.join('/')
    return (
      <li key={node.id}>
        <button
          type="button"
          aria-current={selectedPathKey === pathKey ? 'true' : undefined}
          className={selectedPathKey === pathKey ? styles.activeNode : ''}
          onClick={() => onSelect(selectionPath)}
          data-definition-tree-node={node.id}
          data-definition-node-path={pathKey}
        >
          <span>{node.nodeType === 'inline' ? node.kind : t('definitions.nestedUsage')}</span>
          <code title={node.id}>{node.id}</code>
        </button>
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
