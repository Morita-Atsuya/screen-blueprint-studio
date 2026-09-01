import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const root = resolve(import.meta.dirname, '..')
const work = join(root, 'scripts', '.shared-components-foundation-regression')
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function bundle(entry, output) {
  execFileSync(
    join(root, 'node_modules', '.bin', 'esbuild'),
    [
      join(root, entry),
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${output}`,
    ],
    { stdio: 'pipe' },
  )
}

function moduleUrl(file, tag) {
  return `${pathToFileURL(file).href}?tag=${encodeURIComponent(tag)}`
}

const sampleBundle = join(work, 'sample.mjs')
const applyBundle = join(work, 'apply.mjs')
const invariantsBundle = join(work, 'invariants.mjs')
const resolverBundle = join(work, 'resolver.mjs')
const canonicalBundle = join(work, 'canonical.mjs')
const modelBundle = join(work, 'model.mjs')
const duplicationBundle = join(work, 'duplication.mjs')
const behaviorBundle = join(work, 'behavior.mjs')
const transactionsBundle = join(work, 'transactions.mjs')
const shortcutsBundle = join(work, 'shortcuts.mjs')
const webmcpToolsBundle = join(work, 'webmcp-tools.mjs')
const definitionEditingBundle = join(work, 'definition-editing.mjs')
const editorSelectionBundle = join(work, 'editor-selection.mjs')
const componentTargetsBundle = join(work, 'component-targets.mjs')
const collectionBundle = join(work, 'collection.mjs')
const editorDndBundle = join(work, 'editor-dnd.mjs')

bundle('src/sample/sampleProject.ts', sampleBundle)
bundle('src/domain/applyCommand.ts', applyBundle)
bundle('src/domain/invariants.ts', invariantsBundle)
bundle('src/domain/definitionResolver.ts', resolverBundle)
bundle('src/domain/canonicalProjectSpecV3.ts', canonicalBundle)
bundle('src/domain/model.ts', modelBundle)
bundle('src/domain/componentDuplication.ts', duplicationBundle)
bundle('src/domain/componentBehavior.ts', behaviorBundle)
bundle('src/domain/definitionTransactions.ts', transactionsBundle)
bundle('src/app/editorShortcuts.ts', shortcutsBundle)
bundle('src/webmcp/tools.ts', webmcpToolsBundle)
bundle('src/domain/definitionEditing.ts', definitionEditingBundle)
bundle('src/domain/editorSelection.ts', editorSelectionBundle)
bundle('src/domain/componentTargets.ts', componentTargetsBundle)
bundle('src/domain/collection.ts', collectionBundle)
bundle('src/dnd/editorDnd.ts', editorDndBundle)

const { sampleProject } = await import(moduleUrl(sampleBundle, 'sample'))
const { applyCommandWithoutRevision } = await import(moduleUrl(applyBundle, 'apply'))
const { validateInvariants } = await import(moduleUrl(invariantsBundle, 'invariants'))
const {
  resolveComponentTarget,
  resolveScreenNodes,
} = await import(moduleUrl(resolverBundle, 'resolver'))
const {
  componentDefinitionRefV3,
  CANONICAL_PROJECT_SCHEMA_URL_V3,
  CANONICAL_PROJECT_KIND_V3,
  CANONICAL_PROJECT_SCHEMA_VERSION_V3,
} = await import(moduleUrl(canonicalBundle, 'canonical'))
const {
  DEFAULT_COMPONENT_SIZING,
  ROOT_COMPONENT_SIZING,
  DEFAULT_COMPONENT_LAYOUT,
} = await import(moduleUrl(modelBundle, 'model'))
const {
  createComponentSubtreeSnapshot,
  canPasteComponent,
  createDuplicateComponentCommand,
} = await import(moduleUrl(duplicationBundle, 'duplication'))
const {
  getApiEditorContextForTarget,
  getComponentTargetBehavior,
  getEventEditorContextForTarget,
} = await import(moduleUrl(behaviorBundle, 'behavior'))
const {
  collectDefinitionUses,
  resolveDefinitionInlineNodeAtPath,
} = await import(moduleUrl(transactionsBundle, 'transactions'))
const { resolveHierarchyEditorSelection } = await import(
  moduleUrl(shortcutsBundle, 'shortcuts')
)
const { WEBMCP_TOOLS } = await import(moduleUrl(webmcpToolsBundle, 'webmcp-tools'))
const {
  createExtractDefinitionCommand,
  duplicateComponentDefinition,
} = await import(moduleUrl(definitionEditingBundle, 'definition-editing'))
const {
  parseEditorSelectionValue,
  reconcileEditorSelection,
  selectionCanonicalTarget,
} = await import(
  moduleUrl(editorSelectionBundle, 'editor-selection')
)
const { componentTargetRefKey } = await import(
  moduleUrl(componentTargetsBundle, 'component-targets')
)
const {
  MAX_COLLECTION_PREVIEW_ITEMS,
  resolveCollectionItem,
  resolveJsonPointer,
} = await import(moduleUrl(collectionBundle, 'collection'))
const { resolveEditorDrop } = await import(moduleUrl(editorDndBundle, 'editor-dnd'))

let passed = 0
async function test(name, callback) {
  try {
    await callback()
    console.log(`PASS ${name}`)
    passed += 1
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

async function expectThrow(message, callback) {
  let threw = false
  try {
    await callback()
  } catch {
    threw = true
  }
  assert(threw, message)
}

await test('schema, example, and canonical constants stay aligned', async () => {
  const schema = JSON.parse(readFileSync(
    join(root, 'public/schemas/screen-blueprint-project-v3.schema.json'),
    'utf8',
  ))
  const example = JSON.parse(readFileSync(
    join(root, 'public/examples/screen-blueprint-project-v3.json'),
    'utf8',
  ))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)
  assert(validate(example), ajv.errorsText(validate.errors, { separator: '\n' }))
  assert(example.$schema === CANONICAL_PROJECT_SCHEMA_URL_V3, 'example schema URL drifted')
  assert(example.kind === CANONICAL_PROJECT_KIND_V3, 'example kind drifted')
  assert(
    example.schemaVersion === CANONICAL_PROJECT_SCHEMA_VERSION_V3,
    'example schema version drifted',
  )
  assert(!JSON.stringify(example).includes('"revision"'), 'canonical example leaked workspace revision data')
  assert(
    Object.values(example.components).filter(component => component.nodeType === 'definitionInstance').length >= 2,
    'public example must demonstrate at least two shared-definition instances',
  )
  assert(
    schema.$defs.inlineDefinitionNode.properties.config.$ref === '#/$defs/definitionComponentConfig',
    'definition nodes must use definition-local config schema',
  )
  assert(
    Object.values(example.components).some(component =>
      component.nodeType === 'inline' && component.kind === 'collection'),
    'public example must demonstrate Collection',
  )

  const collectionEntry = Object.entries(example.components).find(([, component]) =>
    component.nodeType === 'inline' && component.kind === 'collection')
  const container = Object.values(example.components).find(component =>
    component.nodeType === 'inline' && component.kind === 'container')
  assert(collectionEntry && container, 'public example fixtures are incomplete')
  const mismatchedKind = clone(example)
  mismatchedKind.components[collectionEntry[0]].config = clone(container.config)
  assert(!validate(mismatchedKind), 'schema accepted mismatched Collection kind/config')

  for (const field of ['itemsPath', 'itemKeyPath', 'bindingPath']) {
    const malformed = clone(example)
    const malformedCollection = malformed.components[collectionEntry[0]]
    if (field === 'itemsPath') malformedCollection.config.dataSource.itemsPath = 'items'
    if (field === 'itemKeyPath') malformedCollection.config.itemKeyPath = 'id'
    if (field === 'bindingPath') {
      malformedCollection.config.propBindings[0].source.path = 'title'
    }
    assert(!validate(malformed), `schema accepted malformed Collection ${field}`)
  }
})

await test('Collection resolves bounded item data with stable canonical identity', async () => {
  const collection = sampleProject.components['comp-launch-task-card']
  assert(
    collection?.nodeType === 'inline' && collection.config.kind === 'collection',
    'TaskFlow must include the task Collection',
  )
  const config = collection.config
  const ready = resolveCollectionItem(config, config.dataSource.previewItems[0])
  const blocked = resolveCollectionItem(config, config.dataSource.previewItems[1])
  assert(
    ready.itemKey === 'task-launch' &&
      ready.variantId === 'task-ready' &&
      ready.visible &&
      ready.props.title === 'Launch onboarding checklist',
    'Collection did not bind the ready item to props, Variant, visibility, and stable key',
  )
  assert(
    blocked.itemKey === 'task-docs' &&
      blocked.variantId === 'task-blocked' &&
      blocked.visible,
    'Collection exact scalar case selection did not choose one final Variant',
  )

  const fallbackConfig = clone(config)
  fallbackConfig.dataSource.previewItems = [{
    ...fallbackConfig.dataSource.previewItems[0],
    id: 'fallback',
    statusKey: 'unknown',
  }]
  assert(
    resolveCollectionItem(
      fallbackConfig,
      fallbackConfig.dataSource.previewItems[0],
    ).variantId === fallbackConfig.variantSelection.fallbackVariantId,
    'Collection rule fallback did not win before itemTemplate.variantId',
  )
  fallbackConfig.variantSelection.fallbackVariantId = null
  assert(
    resolveCollectionItem(
      fallbackConfig,
      fallbackConfig.dataSource.previewItems[0],
    ).variantId === fallbackConfig.itemTemplate.variantId,
    'Collection itemTemplate Variant was not used as the final fallback',
  )

  const missing = resolveJsonPointer({ value: null }, '/missing')
  const presentNull = resolveJsonPointer({ value: null }, '/value')
  assert(
    !missing.found && presentNull.found && presentNull.value === null,
    'Collection JSON Pointer must distinguish missing from null',
  )
  assert(
    resolveJsonPointer({ 'a/b': { '~key': 3 } }, '/a~1b/~0key').value === 3,
    'Collection JSON Pointer escapes did not resolve from the item root',
  )

  const resolved = resolveScreenNodes(sampleProject, 'screen-list')
  const collectionNodes = resolved.orderedNodes.filter(node =>
    node.collectionId === collection.id)
  assert(
    collectionNodes.length > 0 &&
      new Set(collectionNodes.map(node => node.id)).size === collectionNodes.length &&
      collectionNodes.every(node =>
        node.canonicalTarget.type === 'collectionItemNode' &&
        node.canonicalTarget.collectionId === collection.id),
    'Collection preview nodes must have unique runtime IDs and stable collectionItemNode targets',
  )
  const persistedCollectionSelection = parseEditorSelectionValue({
    type: 'collectionItemNode',
    screenId: 'screen-list',
    collectionId: collection.id,
    nodePath: ['task-card-action'],
  })
  assert(
    persistedCollectionSelection?.type === 'collectionItemNode' &&
      reconcileEditorSelection(
        sampleProject,
        persistedCollectionSelection,
        'screen-list',
      )?.type === 'collectionItemNode' &&
      selectionCanonicalTarget(
        sampleProject,
        persistedCollectionSelection,
      )?.type === 'collectionItemNode',
    'Collection template selection must persist and resolve to a canonical target',
  )
  assert(
    sampleProject.apiOperations['api-open-task'].requestBindings[0].source.type === 'item' &&
      sampleProject.events['event-open-task-item'].actions.some(action =>
        action.type === 'navigate' &&
        action.routeParameters?.taskId?.type === 'item'),
    'sample must demonstrate item-bound API and navigation values',
  )

  const duplicateKeys = clone(sampleProject)
  const duplicateCollection = duplicateKeys.components['comp-launch-task-card']
  duplicateCollection.config.dataSource.previewItems[1].id = 'task-launch'
  await expectThrow('duplicate Collection item keys must be rejected', () =>
    validateInvariants(duplicateKeys))

  const tooManyItems = clone(sampleProject)
  tooManyItems.components['comp-launch-task-card'].config.dataSource.previewItems =
    Array.from({ length: MAX_COLLECTION_PREVIEW_ITEMS + 1 }, (_, index) => ({ id: index }))
  await expectThrow('unbounded Collection preview items must be rejected', () =>
    validateInvariants(tooManyItems))

  const uses = collectDefinitionUses(sampleProject, 'shared/task-card')
  assert(
    uses.screenInstanceIds.includes('comp-launch-task-card'),
    'Definition deletion impact must include Collection item templates',
  )

  const withApiSource = clone(sampleProject)
  withApiSource.components['comp-launch-task-card'].config.dataSource.apiOperationId =
    'api-create-task'
  const withoutApi = applyCommandWithoutRevision(withApiSource, {
    type: 'removeApiOperation',
    operationId: 'api-create-task',
  })
  assert(
    withoutApi.components['comp-launch-task-card'].config.dataSource.apiOperationId === null,
    'API removal must explicitly disconnect Collection data sources',
  )

  const emptyCollection = clone(sampleProject)
  emptyCollection.components['comp-launch-task-card'].config.dataSource.previewItems = []
  validateInvariants(emptyCollection)
  assert(
    resolveComponentTarget(
      emptyCollection,
      'screen-list',
      {
        type: 'collectionItemNode',
        collectionId: 'comp-launch-task-card',
        nodePath: ['task-card-action'],
      },
    ).definitionNodeId === 'task-card-action',
    'empty Collections must retain canonical Definition-node targets',
  )

  const invalidResolvedProp = clone(sampleProject)
  invalidResolvedProp.componentDefinitions['shared/task-card'].publicProps.push({
    key: 'columns',
    name: 'Columns',
    description: '',
    type: 'number',
    bindings: [{ nodePath: ['task-card-root'], field: 'config.columns' }],
  })
  invalidResolvedProp.components['comp-launch-task-card'].config.itemTemplate.props.columns = 99
  await expectThrow('public props must not produce invalid resolved component configs', () =>
    validateInvariants(invalidResolvedProp))
  invalidResolvedProp.components[
    'comp-launch-task-card'
  ].config.dataSource.previewItems = []
  await expectThrow('empty Collections must still validate resolved template props', () =>
    validateInvariants(invalidResolvedProp))
  const invalidEmptyLiteralProp = clone(invalidResolvedProp)
  delete invalidEmptyLiteralProp.components[
    'comp-launch-task-card'
  ].config.itemTemplate.props.columns
  invalidEmptyLiteralProp.components['comp-launch-task-card'].config.propBindings.push({
    propKey: 'columns',
    source: { type: 'literal', value: 99 },
  })
  await expectThrow('empty Collections must validate literal prop bindings', () =>
    validateInvariants(invalidEmptyLiteralProp))

  const missingItemValue = clone(sampleProject)
  missingItemValue.apiOperations['api-open-task'].requestBindings[0].source.path = '/missing'
  await expectThrow('missing item API binding paths must be rejected', () =>
    validateInvariants(missingItemValue))
  const objectItemValue = clone(sampleProject)
  for (const item of objectItemValue.components[
    'comp-launch-task-card'
  ].config.dataSource.previewItems) item.payload = { id: item.id }
  objectItemValue.apiOperations['api-open-task'].requestBindings[0].source.path = '/payload'
  await expectThrow('object item API binding values must be rejected', () =>
    validateInvariants(objectItemValue))
  const crossContextItemValue = clone(sampleProject)
  crossContextItemValue.events['event-submit-create'].actions.push({
    type: 'callApi',
    apiOperationId: 'api-open-task',
  })
  await expectThrow('item API bindings must reject non-Collection callers', () =>
    validateInvariants(crossContextItemValue))
  const inlineNavigateItem = clone(sampleProject)
  inlineNavigateItem.events['event-submit-create'].actions.push({
    type: 'navigate',
    destinationScreenId: 'screen-edit',
    routeParameters: { taskId: { type: 'item', path: '/id' } },
  })
  await expectThrow('item navigation parameters require a Collection item trigger', () =>
    validateInvariants(inlineNavigateItem))
  const repeatedValueSources = clone(sampleProject)
  repeatedValueSources.apiOperations['api-open-task'].requestBindings.push(
    { source: { type: 'item', path: '/id' }, targetPath: 'body.taskId' },
    { source: { type: 'literal', value: 'task-list' }, targetPath: 'body.source' },
    { source: { type: 'literal', value: 'task-list' }, targetPath: 'body.auditSource' },
  )
  validateInvariants(repeatedValueSources)

  const apiBackedCollection = clone(sampleProject)
  apiBackedCollection.components['comp-launch-task-card'].config.dataSource.apiOperationId =
    'api-create-task'
  const apiSnapshot = createComponentSubtreeSnapshot(
    apiBackedCollection,
    'comp-launch-task-card',
  )
  assert(
    apiSnapshot === null,
    'Collection snapshots must block incomplete API dependencies',
  )

  const selfContainedApiCollection = clone(sampleProject)
  selfContainedApiCollection.apiOperations['api-collection'] = {
    id: 'api-collection',
    screenId: 'screen-list',
    name: 'Load collection',
    method: 'GET',
    path: '/tasks',
    requestBindings: [],
    successScenarioId: null,
    errorScenarioId: null,
  }
  selfContainedApiCollection.components[
    'comp-launch-task-card'
  ].config.dataSource.apiOperationId = 'api-collection'
  const collectionDuplicate = createDuplicateComponentCommand(
    selfContainedApiCollection,
    'comp-launch-task-card',
    (() => {
      let index = 0
      return () => `collection-copy-${index++}`
    })(),
  )
  assert(collectionDuplicate, 'self-contained API-backed Collection must be duplicable')
  const duplicatedCollectionDocument = applyCommandWithoutRevision(
    selfContainedApiCollection,
    collectionDuplicate,
  )
  const duplicatedCollectionId =
    collectionDuplicate.componentIdMap['comp-launch-task-card']
  const duplicatedApiId = collectionDuplicate.apiOperationIdMap['api-collection']
  assert(
    duplicatedCollectionDocument.components[
      duplicatedCollectionId
    ].config.dataSource.apiOperationId === duplicatedApiId &&
      duplicatedCollectionDocument.apiOperations[duplicatedApiId]?.screenId === 'screen-list',
    'duplicated Collections must remap their self-contained API source',
  )

  const modalDefinitionDrop = resolveEditorDrop(
    sampleProject,
    {
      type: 'definitionPalette',
      definitionId: 'shared/task-card',
      kind: 'modal',
      label: 'Modal-root Definition',
      surface: 'canvas',
    },
    {
      type: 'component-drop',
      surface: 'canvas',
      parentId: 'comp-task-list',
      screenId: 'screen-list',
      position: 0,
      label: 'Task list',
    },
  )
  assert(
    modalDefinitionDrop.status === 'moved' &&
      modalDefinitionDrop.parentId === 'comp-task-list' &&
      modalDefinitionDrop.position === 0,
    'Definition Palette drops must classify the outer Instance as a container child',
  )
})

await test('resolver applies base -> variant -> instance prop -> scenario override order', async () => {
  const listResolved = resolveScreenNodes(
    sampleProject,
    'screen-list',
    'scenario-list-loading',
  )
  const subtitle = Object.values(listResolved.nodesByTarget).find(node =>
    node.instanceId === 'comp-list-header' &&
    JSON.stringify(node.nodePath) === JSON.stringify(['header-copy', 'header-subtitle']),
  )
  assert(subtitle, 'shared header subtitle did not resolve')
  assert(subtitle.config.kind === 'text', 'shared header subtitle must resolve to text')
  assert(subtitle.config.text === 'Refreshing tasks…', 'scenario override did not win last')
  const title = Object.values(listResolved.nodesByTarget).find(node =>
    node.instanceId === 'comp-list-header' &&
    JSON.stringify(node.nodePath) === JSON.stringify(['header-copy', 'header-title']),
  )
  assert(title?.config.kind === 'text' && title.config.text === 'TaskFlow', 'instance prop did not set title text')
  const projectedDocument = structuredClone(sampleProject)
  projectedDocument.components['comp-edit-header'].placement = {
    mode: 'sticky',
    edge: 'top',
    inset: 'sm',
  }
  const editResolved = resolveScreenNodes(projectedDocument, 'screen-edit', null)
  const rootNode = Object.values(editResolved.nodesByTarget).find(node =>
    node.instanceId === 'comp-edit-header' &&
    JSON.stringify(node.nodePath) === JSON.stringify(['header-root']),
  )
  assert(rootNode?.placement.mode === 'sticky', 'instance outer placement did not replace definition root placement')
})

await test('Definition editor paths, impact analysis, and resolved behavior targets stay canonical', async () => {
  const definition = sampleProject.componentDefinitions['shared/header']
  assert(
    resolveDefinitionInlineNodeAtPath(
      sampleProject,
      componentDefinitionRefV3(definition.id),
      ['header-copy', 'header-title'],
    ).id === 'header-title',
    'Definition editor child paths incorrectly include the current root ID',
  )
  const target = {
    type: 'definitionNode',
    instanceId: 'comp-list-header',
    nodePath: ['header-copy', 'header-title'],
  }
  const behavior = getComponentTargetBehavior(sampleProject, 'screen-list', target)
  const eventEditor = getEventEditorContextForTarget(sampleProject, 'screen-list', target)
  const apiEditor = getApiEditorContextForTarget(sampleProject, 'screen-list', target)
  assert(
    behavior &&
      eventEditor?.target.type === 'definitionNode' &&
      eventEditor.target.instanceId === 'comp-list-header' &&
      apiEditor?.supportsApiEditing,
    'resolved Definition target did not reach the visual Event/API editor contract',
  )
  const collectionTarget = {
    type: 'collectionItemNode',
    collectionId: 'comp-launch-task-card',
    nodePath: ['task-card-action'],
  }
  const collectionBehavior = getComponentTargetBehavior(
    sampleProject,
    'screen-list',
    collectionTarget,
  )
  const collectionApiEditor = getApiEditorContextForTarget(
    sampleProject,
    'screen-list',
    collectionTarget,
  )
  assert(
    collectionBehavior?.events.some(event => event.id === 'event-open-task-item') &&
      collectionBehavior.apiBindings.some(binding => binding.targetPath === 'path.taskId') &&
      collectionApiEditor?.itemContext?.collectionId === 'comp-launch-task-card' &&
      collectionApiEditor.operations.some(operation =>
        operation.operation.id === 'api-open-task' &&
        operation.bindings.some(binding => binding.component.id === 'item:/id')),
    'Collection template target did not expose item Event/API bindings for human review',
  )

  const withResolvedInput = clone(sampleProject)
  const inputDefinition = withResolvedInput.componentDefinitions['shared/header']
  inputDefinition.nodes['header-subtitle'].kind = 'textInput'
  inputDefinition.nodes['header-subtitle'].config = {
    kind: 'textInput',
    fieldKey: 'sharedSubtitle',
    label: 'Shared subtitle',
    inputType: 'text',
    required: false,
    placeholder: '',
    defaultValue: '',
    validationRules: [],
  }
  inputDefinition.publicProps = inputDefinition.publicProps.filter(prop => prop.key !== 'subtitle')
  delete inputDefinition.variants.find(variant => variant.id === 'compact')
    .nodeOverrides['header-subtitle']
  delete withResolvedInput.components['comp-list-header'].props.subtitle
  delete withResolvedInput.components['comp-edit-header'].props.subtitle
  withResolvedInput.screenScenarios['scenario-list-loading'].componentOverrides =
    withResolvedInput.screenScenarios['scenario-list-loading'].componentOverrides.filter(entry =>
      entry.target.type !== 'definitionNode' ||
      entry.target.nodePath.join('/') !== 'header-copy/header-subtitle')
  validateInvariants(withResolvedInput)
  const resolvedInputContext = getApiEditorContextForTarget(
    withResolvedInput,
    'screen-list',
    {
      type: 'definitionNode',
      instanceId: 'comp-list-header',
      nodePath: ['header-copy', 'header-subtitle'],
    },
  )
  assert(
    resolvedInputContext?.inputComponents.some(candidate =>
      candidate.target.type === 'definitionNode' &&
      candidate.target.instanceId === 'comp-list-header' &&
      candidate.target.nodePath.join('/') === 'header-copy/header-subtitle'),
    'API binding candidates omitted a resolved Definition input target',
  )

  const uses = collectDefinitionUses(sampleProject, 'shared/header')
  assert(
    uses.screenInstanceIds.length === 2 &&
      uses.instancePropValueCount === 4 &&
      uses.scenarioOverrideCount === 1,
    `Definition impact analysis omitted Instance-owned references: ${JSON.stringify(uses)}`,
  )

  const titleSelection = {
    type: 'resolvedDefinitionNode',
    screenId: 'screen-list',
    instanceId: 'comp-list-header',
    nodePath: ['header-copy', 'header-title'],
  }
  const parentSelection = resolveHierarchyEditorSelection(
    sampleProject,
    titleSelection,
    'select-parent',
  )
  const siblingSelection = resolveHierarchyEditorSelection(
    sampleProject,
    titleSelection,
    'select-next-sibling',
  )
  assert(
    parentSelection?.type === 'resolvedDefinitionNode' &&
      parentSelection.nodePath.join('/') === 'header-copy' &&
      siblingSelection?.type === 'resolvedDefinitionNode' &&
      siblingSelection.nodePath.join('/') === 'header-copy/header-subtitle',
    'hierarchy shortcuts escaped the resolved Definition subtree',
  )

  const nested = clone(sampleProject)
  nested.componentDefinitions['shared/wrapper'] = {
    id: 'shared/wrapper',
    name: 'Wrapper',
    description: '',
    rootNodeId: 'wrapper-root',
    nodes: {
      'wrapper-root': {
        nodeType: 'inline',
        id: 'wrapper-root',
        parentId: null,
        childIds: ['nested-header'],
        kind: 'container',
        placement: { mode: 'flow' },
        sizing: { ...ROOT_COMPONENT_SIZING },
        common: { description: '', visible: true, enabled: true },
        config: { kind: 'container', ...DEFAULT_COMPONENT_LAYOUT, columns: 1 },
      },
      'nested-header': {
        nodeType: 'definitionInstance',
        id: 'nested-header',
        parentId: 'wrapper-root',
        childIds: [],
        placement: { mode: 'flow' },
        sizing: { ...DEFAULT_COMPONENT_SIZING },
        source: { $ref: componentDefinitionRefV3('shared/header') },
        variantId: null,
        props: {},
      },
    },
    publicProps: [],
    variantProperties: [],
    variants: [],
    representativeVariantId: null,
  }
  nested.components['nested-wrapper-instance'] = {
    ...clone(nested.components['comp-list-header']),
    id: 'nested-wrapper-instance',
    source: { $ref: componentDefinitionRefV3('shared/wrapper') },
    variantId: null,
    props: {},
    placement: { mode: 'flow' },
  }
  nested.components['comp-list-page'].childIds.push('nested-wrapper-instance')
  validateInvariants(nested)
  const nestedResolved = resolveScreenNodes(nested, 'screen-list', null)
  const nestedTitle = nestedResolved.orderedNodes.find(node =>
    node.instanceId === 'nested-wrapper-instance' &&
    node.definitionNodeId === 'header-title')
  assert(
    nestedTitle?.nodePath?.join('/') ===
      'nested-header/header-root/header-copy/header-title',
    `nested Definition path duplicated a segment: ${nestedTitle?.nodePath?.join('/')}`,
  )
})

await test('WebMCP event action input schema matches canonical Scenario actions', async () => {
  const connectBehavior = WEBMCP_TOOLS.find(tool => tool.name === 'connect_behavior')
  assert(connectBehavior, 'connect_behavior tool is missing')
  const validate = new Ajv2020({ strict: false }).compile(connectBehavior.inputSchema)
  const base = {
    changeSetId: 'change-set',
    expectedRevision: 0,
    expectedChangeSetVersion: 0,
    operation: 'connectEvent',
    screenId: 'screen-list',
    name: 'Open state',
    trigger: {
      type: 'click',
      target: { type: 'inline', componentId: 'comp-create-task-btn' },
    },
  }
  assert(
    validate({
      ...base,
      actions: [
        { type: 'setScenario', scenarioId: 'scenario-list-create' },
        { type: 'clearScenario' },
      ],
    }),
    `connect_behavior rejected canonical Scenario actions: ${
      JSON.stringify(validate.errors)
    }`,
  )
  assert(
    !validate({ ...base, actions: [{ type: 'setState', stateId: 'legacy-state' }] }),
    'connect_behavior still advertised the removed setState action',
  )
  assert(
    validate({
      ...base,
      trigger: {
        type: 'click',
        target: {
          type: 'collectionItemNode',
          collectionId: 'comp-launch-task-card',
          nodePath: ['task-card-action'],
        },
      },
      actions: [{
        type: 'navigate',
        destinationScreenId: 'screen-edit',
        routeParameters: { taskId: { type: 'item', path: '/id' } },
        queryParameters: { source: { type: 'literal', value: 'task-list' } },
      }],
    }),
    `connect_behavior rejected item-bound navigation: ${JSON.stringify(validate.errors)}`,
  )
  assert(
    validate({
      changeSetId: 'change-set',
      expectedRevision: 0,
      expectedChangeSetVersion: 0,
      operation: 'bindApi',
      screenId: 'screen-list',
      name: 'Open task',
      method: 'GET',
      path: '/tasks/:taskId',
      requestBindings: [{
        source: { type: 'item', path: '/id' },
        targetPath: 'path.taskId',
      }],
    }),
    `connect_behavior rejected item API bindings: ${JSON.stringify(validate.errors)}`,
  )
  assert(
    !validate({
      changeSetId: 'change-set',
      expectedRevision: 0,
      expectedChangeSetVersion: 0,
      operation: 'bindApi',
      screenId: 'screen-list',
      name: 'Invalid',
      method: 'POST',
      path: '/tasks',
      requestBindings: [{
        source: { type: 'literal', value: { nested: true } },
        targetPath: 'body.invalid',
      }],
    }),
    'connect_behavior accepted an object literal behavior source',
  )
  const getComponent = WEBMCP_TOOLS.find(tool => tool.name === 'get_component')
  assert(
    getComponent.inputSchema.properties.target.oneOf.some(branch =>
      branch.properties.type.const === 'collectionItemNode'),
    'WebMCP shared target schema must expose collectionItemNode',
  )
})

await test('type compatibility and null distinctions are enforced', async () => {
  const wrongType = clone(sampleProject)
  wrongType.componentDefinitions['shared/header'].publicProps[0].type = 'number'
  await expectThrow('public prop type mismatch should fail invariants', () =>
    validateInvariants(wrongType))

  const nullProp = clone(sampleProject)
  nullProp.components['comp-list-header'].props.title = null
  await expectThrow('null public prop values should be rejected', () => validateInvariants(nullProp))

  const legacyScreen = clone(sampleProject)
  legacyScreen.screens['screen-list'].defaultStateId = 'legacy-default'
  await expectThrow('legacy defaultStateId should be rejected', () => validateInvariants(legacyScreen))
})

await test('definition DAG cycles and depth limits are rejected', async () => {
  const cyclic = clone(sampleProject)
  cyclic.componentDefinitions['shared/cycle'] = {
    id: 'shared/cycle',
    name: 'Cycle',
    description: '',
    rootNodeId: 'cycle-root',
    nodes: {
      'cycle-root': {
        nodeType: 'inline',
        id: 'cycle-root',
        parentId: null,
        childIds: ['cycle-ref'],
        kind: 'container',
        placement: { mode: 'flow' },
        sizing: { ...ROOT_COMPONENT_SIZING },
        common: { description: '', visible: true, enabled: true },
        config: { kind: 'container', ...DEFAULT_COMPONENT_LAYOUT, columns: 1 },
      },
      'cycle-ref': {
        nodeType: 'definitionInstance',
        id: 'cycle-ref',
        parentId: 'cycle-root',
        childIds: [],
        placement: { mode: 'flow' },
        sizing: { ...DEFAULT_COMPONENT_SIZING },
        source: { $ref: componentDefinitionRefV3('shared/cycle') },
        variantId: null,
        props: {},
      },
    },
    publicProps: [],
    variantProperties: [],
    variants: [],
    representativeVariantId: null,
  }
  await expectThrow('self-referential definitions should be rejected', () => validateInvariants(cyclic))

  const tooDeep = clone(sampleProject)
  let previousDefinitionId = null
  for (let index = 0; index < 11; index += 1) {
    const definitionId = `shared/depth-${index}`
    tooDeep.componentDefinitions[definitionId] = {
      id: definitionId,
      name: definitionId,
      description: '',
      rootNodeId: `root-${index}`,
      nodes: {
        [`root-${index}`]: {
          nodeType: 'inline',
          id: `root-${index}`,
          parentId: null,
          childIds: previousDefinitionId ? [`child-${index}`] : ['leaf'],
          kind: 'container',
          placement: { mode: 'flow' },
          sizing: { ...ROOT_COMPONENT_SIZING },
          common: { description: '', visible: true, enabled: true },
          config: { kind: 'container', ...DEFAULT_COMPONENT_LAYOUT, columns: 1 },
        },
        ...(previousDefinitionId
          ? {
              [`child-${index}`]: {
                nodeType: 'definitionInstance',
                id: `child-${index}`,
                parentId: `root-${index}`,
                childIds: [],
                placement: { mode: 'flow' },
                sizing: { ...DEFAULT_COMPONENT_SIZING },
                source: { $ref: componentDefinitionRefV3(previousDefinitionId) },
                variantId: null,
                props: {},
              },
            }
          : {
              leaf: {
                nodeType: 'inline',
                id: 'leaf',
                parentId: `root-${index}`,
                childIds: [],
                kind: 'text',
                placement: { mode: 'flow' },
                sizing: { ...DEFAULT_COMPONENT_SIZING },
                common: { description: '', visible: true, enabled: true },
                config: { kind: 'text', text: 'Leaf', style: 'body' },
              },
            }),
      },
      publicProps: [],
      variantProperties: [],
      variants: [],
      representativeVariantId: null,
    }
    previousDefinitionId = definitionId
  }
  await expectThrow('unused leaf-first Definition chains must still enforce depth', () =>
    validateInvariants(tooDeep))
  tooDeep.components['comp-list-header'].source.$ref = componentDefinitionRefV3(previousDefinitionId)
  await expectThrow('overly deep definition nesting should be rejected', () => validateInvariants(tooDeep))
})

await test('duplicate and cross-screen paste preserve or block behavior safely', async () => {
  const snapshot = createComponentSubtreeSnapshot(sampleProject, 'comp-create-form')
  assert(snapshot, 'expected snapshot for create form')
  assert(
    !canPasteComponent(sampleProject, snapshot, 'comp-edit-page'),
    'cross-screen paste with screen-owned refs should be blocked',
  )
  const duplicateCommand = createDuplicateComponentCommand(
    sampleProject,
    'comp-create-form',
    (() => {
      let index = 0
      return () => `dup-${++index}`
    })(),
  )
  assert(duplicateCommand, 'duplicate command should be created for create form')
  const duplicated = applyCommandWithoutRevision(sampleProject, duplicateCommand)
  const duplicatedEventId = duplicateCommand.eventIdMap['event-submit-create']
  const duplicatedApiId = duplicateCommand.apiOperationIdMap['api-create-task']
  assert(duplicated.events[duplicatedEventId].trigger.target.type === 'inline', 'duplicated event should target copied inline button')
  assert(
    duplicated.apiOperations[duplicatedApiId].requestBindings[0].source.type === 'inline',
    'duplicated API binding should target copied inline input',
  )
})

await test('extract and detach rewrite references atomically and round-trip safely', async () => {
  const definition = {
    id: 'shared/create-form',
    name: 'Create task form',
    description: 'Reusable create-task form.',
    rootNodeId: 'form-root',
    nodes: {
      'form-root': {
        nodeType: 'inline',
        id: 'form-root',
        parentId: null,
        childIds: ['field-title', 'submit-action', 'cancel-action'],
        kind: 'container',
        placement: { mode: 'flow' },
        sizing: { ...ROOT_COMPONENT_SIZING },
        common: { description: 'Create task form', visible: true, enabled: true },
        config: { kind: 'container', ...DEFAULT_COMPONENT_LAYOUT, gap: 'sm', columns: 1 },
      },
      'field-title': {
        nodeType: 'inline',
        id: 'field-title',
        parentId: 'form-root',
        childIds: [],
        kind: 'textInput',
        placement: { mode: 'flow' },
        sizing: { ...DEFAULT_COMPONENT_SIZING },
        common: { description: 'Task title input', visible: true, enabled: true },
        config: {
          kind: 'textInput',
          fieldKey: 'taskTitle',
          label: 'Task title',
          inputType: 'text',
          required: true,
          placeholder: 'Launch onboarding checklist',
          defaultValue: '',
          validationRules: [{ id: 'rule-task-title', type: 'required', message: 'Enter a task title.' }],
        },
      },
      'submit-action': {
        nodeType: 'inline',
        id: 'submit-action',
        parentId: 'form-root',
        childIds: [],
        kind: 'button',
        placement: { mode: 'flow' },
        sizing: { ...DEFAULT_COMPONENT_SIZING },
        common: { description: 'Submit task creation', visible: true, enabled: true },
        config: {
          kind: 'button',
          label: 'Create task',
          variant: 'primary',
          confirmationMessage: null,
          preventDoubleSubmit: true,
        },
      },
      'cancel-action': {
        nodeType: 'inline',
        id: 'cancel-action',
        parentId: 'form-root',
        childIds: [],
        kind: 'button',
        placement: { mode: 'flow' },
        sizing: { ...DEFAULT_COMPONENT_SIZING },
        common: { description: 'Dismiss task creation', visible: true, enabled: true },
        config: {
          kind: 'button',
          label: 'Cancel',
          variant: 'secondary',
          confirmationMessage: null,
          preventDoubleSubmit: false,
        },
      },
    },
    publicProps: [],
    variantProperties: [],
    variants: [],
    representativeVariantId: null,
  }

  const extracted = applyCommandWithoutRevision(sampleProject, {
    type: 'extractComponentDefinition',
    sourceRootComponentId: 'comp-create-form',
    sourceScreenId: 'screen-list',
    definition,
    replacementInstanceId: 'comp-create-form-instance',
    componentIdToNodePath: {
      'comp-create-form': ['form-root'],
      'comp-create-title-input': ['field-title'],
      'comp-create-submit-btn': ['submit-action'],
      'comp-create-cancel-btn': ['cancel-action'],
    },
  })

  assert(extracted.components['comp-create-form-instance'].nodeType === 'definitionInstance', 'extraction should replace the inline subtree with an instance')
  assert(
    extracted.events['event-submit-create'].trigger.target.type === 'definitionNode' &&
      extracted.events['event-submit-create'].trigger.target.instanceId === 'comp-create-form-instance',
    'extraction should rewrite event targets to definition nodes',
  )
  assert(
    extracted.apiOperations['api-create-task'].requestBindings[0].source.type === 'definitionNode',
    'extraction should rewrite API binding sources to definition nodes',
  )
  await expectThrow('used definitions must not be deletable', () =>
    applyCommandWithoutRevision(extracted, {
      type: 'removeComponentDefinition',
      definitionId: 'shared/create-form',
    }))

  const detached = applyCommandWithoutRevision(extracted, {
    type: 'detachDefinitionInstance',
    instanceId: 'comp-create-form-instance',
    generatedComponents: [
      { nodePath: ['form-root'], componentId: 'detached-form-root' },
      { nodePath: ['field-title'], componentId: 'detached-title-input' },
      { nodePath: ['submit-action'], componentId: 'detached-submit-btn' },
      { nodePath: ['cancel-action'], componentId: 'detached-cancel-btn' },
    ],
  })

  assert(detached.components['detached-form-root'].nodeType === 'inline', 'detach should materialize inline components')
  assert(
    detached.events['event-submit-create'].trigger.target.type === 'inline' &&
      detached.events['event-submit-create'].trigger.target.componentId === 'detached-submit-btn',
    'detach should rewrite event targets back to inline components',
  )
  assert(
    detached.apiOperations['api-create-task'].requestBindings[0].source.type === 'inline' &&
      detached.apiOperations['api-create-task'].requestBindings[0].source.componentId === 'detached-title-input',
    'detach should rewrite API binding sources back to inline components',
  )
  const removedDefinition = applyCommandWithoutRevision(detached, {
    type: 'removeComponentDefinition',
    definitionId: 'shared/create-form',
  })
  assert(
    !removedDefinition.componentDefinitions['shared/create-form'],
    'unused extracted definition should become removable after detach',
  )
})

await test('shared component hardening preserves paths, nested props, and typed identity', async () => {
  let generatedId = 0
  const extraction = createExtractDefinitionCommand(
    sampleProject,
    'comp-create-form',
    'shared/generated-form',
    'comp-generated-form-instance',
    'Generated form',
    () => `generated-node-${generatedId++}`,
  )
  const generatedRootId = extraction.definition.rootNodeId
  assert(
    extraction.componentIdToNodePath['comp-create-form'][0] === generatedRootId &&
      extraction.componentIdToNodePath['comp-create-title-input'][0] !== generatedRootId,
    'generated extraction paths must include the Definition root only for the root target',
  )
  applyCommandWithoutRevision(sampleProject, extraction)

  assert(
    parseEditorSelectionValue({
      type: 'definitionEditorNode',
      definitionId: 'shared/header',
      nodePath: ['header-copy', 'header-title'],
    })?.type === 'definitionEditorNode',
    'valid persisted Definition editor selections must be restored',
  )
  assert(
    componentTargetRefKey({
      type: 'definitionNode',
      instanceId: 'instance:part',
      nodePath: ['node'],
    }) !== componentTargetRefKey({
      type: 'definitionNode',
      instanceId: 'instance',
      nodePath: ['part:node'],
    }),
    'typed target keys must not collide when IDs contain delimiters',
  )

  const encodedInstanceDocument = clone(sampleProject)
  encodedInstanceDocument.components['instance/encoded%'] = {
    nodeType: 'definitionInstance',
    id: 'instance/encoded%',
    screenId: 'screen-list',
    parentId: 'comp-list-page',
    childIds: [],
    source: { $ref: componentDefinitionRefV3('shared/header') },
    props: {},
    variantId: null,
    placement: { mode: 'flow' },
    sizing: { ...DEFAULT_COMPONENT_SIZING },
  }
  encodedInstanceDocument.components['comp-list-page'].childIds.push('instance/encoded%')
  const encodedParentSelection = resolveHierarchyEditorSelection(
    encodedInstanceDocument,
    {
      type: 'resolvedDefinitionNode',
      screenId: 'screen-list',
      instanceId: 'instance/encoded%',
      nodePath: ['header-copy', 'header-title'],
    },
    'select-parent',
  )
  assert(
    encodedParentSelection?.type === 'resolvedDefinitionNode' &&
      encodedParentSelection.instanceId === 'instance/encoded%' &&
      encodedParentSelection.nodePath.join('/') === 'header-copy',
    'Definition hierarchy shortcuts must use encoded canonical target keys',
  )

  const nestedDocument = clone(sampleProject)
  const inner = clone(nestedDocument.componentDefinitions['shared/header'])
  inner.id = 'shared/inner'
  inner.publicProps = [{
    key: 'innerTitle',
    name: 'Inner title',
    description: '',
    type: 'string',
    bindings: [{ nodePath: ['header-copy', 'header-title'], field: 'config.text' }],
  }]
  const outer = {
    id: 'shared/outer',
    name: 'Outer',
    description: '',
    rootNodeId: 'outer-root',
    nodes: {
      'outer-root': {
        nodeType: 'inline',
        id: 'outer-root',
        parentId: null,
        childIds: ['inner-boundary'],
        kind: 'container',
        placement: { mode: 'flow' },
        sizing: { ...ROOT_COMPONENT_SIZING },
        common: { description: '', visible: true, enabled: true },
        config: { kind: 'container', ...DEFAULT_COMPONENT_LAYOUT },
      },
      'inner-boundary': {
        nodeType: 'definitionInstance',
        id: 'inner-boundary',
        parentId: 'outer-root',
        childIds: [],
        source: { $ref: componentDefinitionRefV3('shared/inner') },
        props: { innerTitle: 'Nested default' },
        variantId: null,
        placement: { mode: 'flow' },
        sizing: { ...DEFAULT_COMPONENT_SIZING },
      },
    },
    publicProps: [{
      key: 'outerTitle',
      name: 'Outer title',
      description: '',
      type: 'string',
      bindings: [{
        nodePath: ['inner-boundary', 'header-root', 'header-copy', 'header-title'],
        field: 'config.text',
      }],
    }],
    variantProperties: [],
    variants: [],
    representativeVariantId: null,
  }
  nestedDocument.componentDefinitions['shared/inner'] = inner
  nestedDocument.componentDefinitions['shared/outer'] = outer
  nestedDocument.components['comp-outer-instance'] = {
    nodeType: 'definitionInstance',
    id: 'comp-outer-instance',
    screenId: 'screen-list',
    parentId: 'comp-list-page',
    childIds: [],
    source: { $ref: componentDefinitionRefV3('shared/outer') },
    props: { outerTitle: 'Outer override' },
    variantId: null,
    placement: { mode: 'flow' },
    sizing: { ...DEFAULT_COMPONENT_SIZING },
  }
  nestedDocument.components['comp-list-page'].childIds.push('comp-outer-instance')
  validateInvariants(nestedDocument)
  const nestedResolved = resolveScreenNodes(nestedDocument, 'screen-list')
  const nestedTitle = nestedResolved.orderedNodes.find(node =>
    node.instanceId === 'comp-outer-instance' &&
    node.nodePath?.at(-1) === 'header-title')
  assert(
    nestedTitle?.config.kind === 'text' && nestedTitle.config.text === 'Outer override',
    'outer Instance props must override nested Instance props through canonical node paths',
  )
  const duplicatedOuter = duplicateComponentDefinition(
    outer,
    'shared/outer-copy',
    'Outer copy',
    (() => {
      let id = 0
      return () => `outer-copy-${id++}`
    })(),
  )
  assert(
    duplicatedOuter.publicProps[0].bindings[0].nodePath.slice(1).join('/') ===
      'header-root/header-copy/header-title',
    'duplicating a Definition must not rewrite referenced Definition path segments',
  )

  const invalidProps = clone(nestedDocument)
  invalidProps.components['comp-outer-instance'].props = { unknown: 'value' }
  await expectThrow('unknown Instance public props must be rejected', () =>
    validateInvariants(invalidProps))

  const invalidDefinitionSelect = clone(sampleProject)
  invalidDefinitionSelect.componentDefinitions['shared/header'].nodes['header-title'].kind = 'select'
  invalidDefinitionSelect.componentDefinitions['shared/header'].nodes['header-title'].config = {
    kind: 'select',
    fieldKey: 'status',
    label: 'Status',
    required: false,
    options: [{ value: 'open', label: 'Open' }],
    defaultValue: 'closed',
  }
  await expectThrow('Definition Select defaults must match an option', () =>
    validateInvariants(invalidDefinitionSelect))
})

console.log(`PASS shared components foundation (${passed} tests)`)
rmSync(work, { recursive: true, force: true })
