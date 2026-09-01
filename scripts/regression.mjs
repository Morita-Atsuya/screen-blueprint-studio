import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { parseHTML } from 'linkedom'

const root = resolve(import.meta.dirname, '..')
const temp = mkdtempSync(join(tmpdir(), 'screen-spec-regression-'))
const storageKey = 'screen-blueprint-studio:workspace:v3'
const rejectedKey = 'screen-blueprint-studio:rejected:v3'

class MemoryStorage {
  #values = new Map()
  throwOnGet = false
  throwOnRemove = false
  throwOnSetKeys = new Set()

  clear() {
    this.#values.clear()
  }

  getItem(key) {
    if (this.throwOnGet) throw new DOMException('Storage read denied', 'SecurityError')
    return this.#values.get(key) ?? null
  }

  removeItem(key) {
    if (this.throwOnRemove) throw new DOMException('Storage removal denied', 'SecurityError')
    this.#values.delete(key)
  }

  setItem(key, value) {
    if (this.throwOnSetKeys.has(key)) {
      throw new DOMException('Storage write denied', 'SecurityError')
    }
    this.#values.set(key, String(value))
  }
}

const memoryStorage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: memoryStorage,
})
globalThis.document = {}

function installStorage(value) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value,
  })
}

function bundle(entry, output, extraArguments = []) {
  execFileSync(
    join(root, 'node_modules', '.bin', 'esbuild'),
    [
      join(root, entry),
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${output}`,
      ...extraArguments,
    ],
    { stdio: 'pipe' },
  )
}

const appStoreBundle = join(temp, 'appStore.mjs')
const toolsBundle = join(temp, 'tools.mjs')
const domainBundle = join(temp, 'applyCommand.mjs')
const screenNamingBundle = join(temp, 'screenNaming.mjs')
const componentFactoryBundle = join(temp, 'componentFactory.mjs')
const editorDndBundle = join(temp, 'editorDnd.mjs')
const editorShortcutsBundle = join(temp, 'editorShortcuts.mjs')
const toastModelBundle = join(temp, 'toastModel.mjs')
const componentDisplayLabelBundle = join(temp, 'componentDisplayLabel.mjs')
const selectorsBundle = join(temp, 'selectors.mjs')
const messagesBundle = join(temp, 'messages.mjs')
const localeBundle = join(temp, 'locale.mjs')
const paneWidthsBundle = join(temp, 'paneWidths.mjs')
const textDraftBundle = join(temp, 'textDraft.mjs')
const componentBehaviorBundle = join(temp, 'componentBehavior.mjs')
const canvasViewportMathBundle = join(temp, 'canvasViewportMath.mjs')
const componentAddMenuModelBundle = join(temp, 'componentAddMenuModel.mjs')
const stateOverridesBundle = join(temp, 'stateOverrides.mjs')
const changeSetPresentationBundle = join(temp, 'changeSetPresentation.mjs')
const changeSetComponentChangesBundle = join(temp, 'changeSetComponentChanges.mjs')
const structureTreeKeyboardBundle = join(temp, 'structureTreeKeyboard.mjs')
const deleteImpactBundle = join(temp, 'deleteImpact.mjs')
const sampleProjectBundle = join(temp, 'sampleProject.mjs')
const componentDuplicationBundle = join(temp, 'componentDuplication.mjs')
const modelBundle = join(temp, 'model.mjs')
const runtimeValidationBundle = join(temp, 'runtimeValidation.mjs')
const invariantsBundle = join(temp, 'invariants.mjs')
const componentPlacementBundle = join(temp, 'componentPlacement.mjs')
const componentPreviewBundle = join(temp, 'componentPreview.mjs')
const inspectorSectionsBundle = join(temp, 'inspectorSections.mjs')
const screenFlowBundle = join(temp, 'screenFlow.mjs')
const buildFeatureFlagsBundle = join(temp, 'buildFeatureFlags.mjs')
const renderInspectorBundle = join(temp, 'renderInspector.mjs')
const renderAppBundle = join(temp, 'renderApp.mjs')
const renderAppSampleResetBundle = join(temp, 'renderAppSampleReset.mjs')
const mountLockedDialogBundle = join(temp, 'mountLockedDialog.mjs')
const mountDeleteDialogBundle = join(temp, 'mountDeleteDialog.mjs')
const migratePersistedDataBundle = join(temp, 'migratePersistedData.mjs')
const canonicalProjectSpecV3Bundle = join(temp, 'canonicalProjectSpecV3.mjs')
const portableUrlBundle = join(temp, 'portableUrl.mjs')
const webMcpSchemasBundle = join(temp, 'webMcpSchemas.mjs')
const modelCloneBundle = join(temp, 'modelClone.mjs')
const definitionEditingBundle = join(temp, 'definitionEditing.mjs')
bundle('src/app/appStore.ts', appStoreBundle)
bundle('src/webmcp/tools.ts', toolsBundle)
bundle('src/domain/applyCommand.ts', domainBundle)
bundle('src/features/screens/screenNaming.ts', screenNamingBundle)
bundle('src/features/palette/componentFactory.ts', componentFactoryBundle)
bundle('src/dnd/editorDnd.ts', editorDndBundle)
bundle('src/app/editorShortcuts.ts', editorShortcutsBundle)
bundle('src/app/toastModel.ts', toastModelBundle)
bundle('src/domain/componentDisplayLabel.ts', componentDisplayLabelBundle)
bundle('src/domain/selectors.ts', selectorsBundle)
bundle('src/i18n/messages.ts', messagesBundle)
bundle('src/i18n/locale.ts', localeBundle)
bundle('src/app/paneWidths.ts', paneWidthsBundle)
bundle('src/components/textDraft.ts', textDraftBundle)
bundle('src/domain/componentBehavior.ts', componentBehaviorBundle)
bundle('src/features/canvas/canvasViewportMath.ts', canvasViewportMathBundle)
bundle('src/features/component-add-menu/componentAddMenuModel.ts', componentAddMenuModelBundle)
bundle('src/domain/stateOverrides.ts', stateOverridesBundle)
bundle('src/domain/changeSetPresentation.ts', changeSetPresentationBundle)
bundle('src/domain/changeSetComponentChanges.ts', changeSetComponentChangesBundle)
bundle('src/features/structure-tree/structureTreeKeyboard.ts', structureTreeKeyboardBundle)
bundle('src/domain/deleteImpact.ts', deleteImpactBundle)
bundle('scripts/fixtures/regressionProject.ts', sampleProjectBundle)
bundle('src/domain/componentDuplication.ts', componentDuplicationBundle)
bundle('src/domain/model.ts', modelBundle)
bundle('src/domain/runtimeValidation.ts', runtimeValidationBundle)
bundle('src/domain/invariants.ts', invariantsBundle)
bundle('src/domain/componentPlacement.ts', componentPlacementBundle)
bundle('src/features/canvas/componentPreview.ts', componentPreviewBundle)
bundle('src/features/inspector/inspectorSections.ts', inspectorSectionsBundle)
bundle('src/domain/screenFlow.ts', screenFlowBundle)
bundle('src/config/buildFeatureFlags.ts', buildFeatureFlagsBundle)
bundle('src/persistence/migratePersistedData.ts', migratePersistedDataBundle)
bundle('src/domain/canonicalProjectSpecV3.ts', canonicalProjectSpecV3Bundle)
bundle('src/domain/portableUrl.ts', portableUrlBundle)
bundle('src/webmcp/schemas.ts', webMcpSchemasBundle)
bundle('src/domain/modelClone.ts', modelCloneBundle)
bundle('src/domain/definitionEditing.ts', definitionEditingBundle)
bundle(
  'scripts/fixtures/renderInspector.tsx',
  renderInspectorBundle,
  [
    '--jsx=automatic',
    "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  ],
)
bundle(
  'scripts/fixtures/renderApp.tsx',
  renderAppBundle,
  [
    '--jsx=automatic',
    '--loader:.svg=dataurl',
    "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  ],
)
bundle(
  'scripts/fixtures/renderApp.tsx',
  renderAppSampleResetBundle,
  [
    '--jsx=automatic',
    '--loader:.svg=dataurl',
    '--define:import.meta.env.VITE_ENABLE_SAMPLE_RESET="true"',
    "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  ],
)
bundle(
  'scripts/fixtures/mountLockedDialog.tsx',
  mountLockedDialogBundle,
  [
    '--jsx=automatic',
    "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  ],
)
bundle(
  'scripts/fixtures/mountDeleteDialog.tsx',
  mountDeleteDialogBundle,
  [
    '--jsx=automatic',
    "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  ],
)

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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function measureToolSchemas(tools) {
  const forbiddenKeywords = ['oneOf', 'anyOf', 'allOf', 'if', 'then', '$ref']
  const metrics = {
    toolCount: tools.length,
    totalBytes: 0,
    maxIndividualBytes: 0,
    maxIndividualTool: null,
    maxDepth: 0,
    propertyCount: 0,
    unionBranches: 0,
    forbiddenKeywordCount: 0,
  }
  const visit = (schema, depth) => {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return
    metrics.maxDepth = Math.max(metrics.maxDepth, depth)
    if (schema.properties && typeof schema.properties === 'object') {
      metrics.propertyCount += Object.keys(schema.properties).length
      Object.values(schema.properties).forEach(child => visit(child, depth + 1))
    }
    if (schema.items) visit(schema.items, depth + 1)
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      visit(schema.additionalProperties, depth + 1)
    }
    for (const keyword of ['oneOf', 'anyOf']) {
      if (Array.isArray(schema[keyword])) {
        metrics.unionBranches += schema[keyword].length
        schema[keyword].forEach(child => visit(child, depth + 1))
      }
    }
    if (Array.isArray(schema.allOf)) {
      schema.allOf.forEach(child => visit(child, depth + 1))
    }
    if (schema.if) visit(schema.if, depth + 1)
    if (schema.then) visit(schema.then, depth + 1)
    metrics.forbiddenKeywordCount += forbiddenKeywords.filter(keyword =>
      Object.prototype.hasOwnProperty.call(schema, keyword)
    ).length
  }
  for (const tool of tools) {
    const bytes = Buffer.byteLength(JSON.stringify(tool.inputSchema))
    metrics.totalBytes += bytes
    if (bytes > metrics.maxIndividualBytes) {
      metrics.maxIndividualBytes = bytes
      metrics.maxIndividualTool = tool.name
    }
    visit(tool.inputSchema, 1)
  }
  return metrics
}

function defaultSizing(overrides = {}) {
  return {
    inlineSize: 'auto',
    minWidth: 'none',
    maxWidth: 'none',
    gridSpan: 1,
    grow: 0,
    shrink: 'allow',
    ...overrides,
  }
}

function rootSizing() {
  return defaultSizing({ inlineSize: 'fill' })
}

function installInteractiveDom() {
  const { document, window } = parseHTML('<html><body></body></html>')
  let activeElement = document.body
  class TestKeyboardEvent extends window.Event {
    constructor(type, init = {}) {
      super(type, { bubbles: init.bubbles, cancelable: init.cancelable })
      Object.defineProperties(
        this,
        Object.fromEntries(Object.entries(init).map(([key, value]) => [
          key,
          { configurable: true, value },
        ])),
      )
    }
  }
  class TestResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    get: () => activeElement,
  })
  Object.defineProperty(document, 'simulateDisabledFocusLoss', {
    configurable: true,
    value: () => {
      activeElement = document.body
    },
  })
  window.HTMLElement.prototype.focus = function focus() {
    if (this.matches(':disabled')) return
    const previous = activeElement
    if (previous && previous !== this) {
      const focusOut = new window.Event('focusout', { bubbles: true })
      Object.defineProperty(focusOut, 'relatedTarget', { value: this })
      previous.dispatchEvent(focusOut)
    }
    activeElement = this
    const focusIn = new window.Event('focusin', { bubbles: true })
    Object.defineProperty(focusIn, 'relatedTarget', { value: previous })
    this.dispatchEvent(focusIn)
  }
  document.addEventListener('click', event => {
    const label = event.target.closest?.('label[for]')
    if (!label || event.defaultPrevented) return
    document.getElementById(label.getAttribute('for'))?.focus()
  })
  window.HTMLElement.prototype.getClientRects = () => [{}]
  window.HTMLElement.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    right: 800,
    bottom: 600,
    left: 0,
    width: 800,
    height: 600,
    toJSON: () => ({}),
  })
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.HTMLElement.prototype.attachEvent = () => {}
  window.HTMLElement.prototype.detachEvent = () => {}
  window.HTMLElement.prototype.setPointerCapture = () => {}
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  window.HTMLElement.prototype.hasPointerCapture = () => false
  const getComputedStyle = () => ({
    overflow: 'visible',
    overflowX: 'visible',
    overflowY: 'visible',
    position: 'static',
    transform: 'none',
    transformOrigin: '0 0',
  })
  Object.defineProperty(window, 'getComputedStyle', {
    configurable: true,
    value: getComputedStyle,
  })
  document.elementsFromPoint = () => []
  let selectionClearCount = 0
  document.getSelection = () => ({
    removeAllRanges() {
      selectionClearCount += 1
    },
  })
  Object.defineProperty(document, 'selectionClearCount', {
    configurable: true,
    get: () => selectionClearCount,
  })
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL('http://localhost/'),
  })
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: document },
    window: { configurable: true, value: window },
    navigator: { configurable: true, value: window.navigator },
    Node: { configurable: true, value: window.Node },
    Element: { configurable: true, value: window.Element },
    HTMLElement: { configurable: true, value: window.HTMLElement },
    Event: { configurable: true, value: window.Event },
    KeyboardEvent: { configurable: true, value: TestKeyboardEvent },
    ResizeObserver: { configurable: true, value: TestResizeObserver },
    MutationObserver: { configurable: true, value: window.MutationObserver },
    getComputedStyle: { configurable: true, value: getComputedStyle },
    addEventListener: {
      configurable: true,
      value: window.addEventListener.bind(window),
    },
    removeEventListener: {
      configurable: true,
      value: window.removeEventListener.bind(window),
    },
    dispatchEvent: {
      configurable: true,
      value: window.dispatchEvent.bind(window),
    },
    innerWidth: { configurable: true, value: 1280 },
    innerHeight: { configurable: true, value: 900 },
    CSS: {
      configurable: true,
      value: {
        escape(value) {
          return String(value).replaceAll('"', '\\"')
        },
      },
    },
    requestAnimationFrame: {
      configurable: true,
      value: callback => {
        callback(performance.now())
        return 1
      },
    },
    cancelAnimationFrame: { configurable: true, value: () => {} },
  })
  return document
}

function clone(value) {
  return structuredClone(value)
}

function snapshotObjectPrototype() {
  return Object.fromEntries(
    Object.getOwnPropertyNames(Object.prototype).map(name => [
      name,
      Object.getOwnPropertyDescriptor(Object.prototype, name),
    ]),
  )
}

function assertObjectPrototypeUnchanged(before, message) {
  const afterNames = Object.getOwnPropertyNames(Object.prototype)
  assert(
    JSON.stringify(afterNames) === JSON.stringify(Object.keys(before)),
    `${message}: property names changed`,
  )
  for (const [name, descriptor] of Object.entries(before)) {
    const after = Object.getOwnPropertyDescriptor(Object.prototype, name)
    assert(after?.value === descriptor.value, `${message}: ${name} value changed`)
    assert(after?.get === descriptor.get, `${message}: ${name} getter changed`)
    assert(after?.set === descriptor.set, `${message}: ${name} setter changed`)
    assert(after?.enumerable === descriptor.enumerable, `${message}: ${name} enumerable changed`)
    assert(after?.configurable === descriptor.configurable, `${message}: ${name} configurable changed`)
    assert(after?.writable === descriptor.writable, `${message}: ${name} writable changed`)
  }
}

function moduleUrl(path, caseName) {
  return `${pathToFileURL(path).href}?case=${encodeURIComponent(caseName)}`
}

async function freshStore(caseName) {
  const module = await import(moduleUrl(appStoreBundle, caseName))
  return module.useAppStore
}

await test('canonical v3 contracts, schema, references, and example stay aligned', async () => {
  const schemaSource = readFileSync(
    join(root, 'public/schemas/screen-blueprint-project-v3.schema.json'),
    'utf8',
  )
  const exampleSource = readFileSync(
    join(root, 'public/examples/screen-blueprint-project-v3.json'),
    'utf8',
  )
  const schema = JSON.parse(schemaSource)
  const example = JSON.parse(exampleSource)
  const contracts = await import(moduleUrl(canonicalProjectSpecV3Bundle, 'canonical-v3'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)
  const isValid = value => validate(value)
  const validationErrors = () => ajv.errorsText(validate.errors, { separator: '\n' })

  assert(isValid(example), `public v3 example failed its schema:\n${validationErrors()}`)
  assert(
    !schemaSource.toLowerCase().includes('revision') &&
      !exampleSource.toLowerCase().includes('revision'),
    'canonical v3 schema or example contains workspace version metadata',
  )
  const canonicalKeys = [
    '$schema',
    'kind',
    'schemaVersion',
    'project',
    'componentDefinitions',
    'screens',
    'components',
    'screenScenarios',
    'events',
    'apiOperations',
  ]
  const exampleScreen = example.screens[example.project.screenIds[0]]
  assert(
    JSON.stringify(Object.keys(schema.properties)) === JSON.stringify(canonicalKeys) &&
      JSON.stringify(schema.required) === JSON.stringify(canonicalKeys) &&
      JSON.stringify(Object.keys(example)) === JSON.stringify(canonicalKeys),
    'canonical v3 top-level shape is not exact',
  )
  const versionedExample = clone(example)
  versionedExample.revision = 1
  assert(!isValid(versionedExample), 'canonical v3 schema accepted revision metadata')
  assert(
    JSON.stringify(JSON.parse(JSON.stringify(example))) === JSON.stringify(example),
    'public v3 example did not round-trip without semantic change',
  )
  assert(
    JSON.stringify(schema.$defs.screen.required) ===
      JSON.stringify(contracts.SCREEN_FIELDS_V3) &&
      JSON.stringify(Object.keys(schema.$defs.screen.properties)) ===
        JSON.stringify(contracts.SCREEN_FIELDS_V3) &&
      JSON.stringify(Object.keys(exampleScreen)) ===
        JSON.stringify(contracts.SCREEN_FIELDS_V3) &&
      exampleScreen.baseDescription.length > 0,
    'portable v3 Screen fields drifted across TypeScript, schema, or example',
  )
  const missingBaseDescription = clone(example)
  delete missingBaseDescription.screens[missingBaseDescription.project.screenIds[0]].baseDescription
  assert(!isValid(missingBaseDescription), 'portable v3 Screen accepted a missing Base description')
  assert(
    schema.$id === contracts.CANONICAL_PROJECT_SCHEMA_URL_V3 &&
      example.$schema === contracts.CANONICAL_PROJECT_SCHEMA_URL_V3 &&
      schema.properties.$schema.const === contracts.CANONICAL_PROJECT_SCHEMA_URL_V3 &&
      schema.properties.kind.const === contracts.CANONICAL_PROJECT_KIND_V3 &&
      schema.properties.schemaVersion.const === contracts.CANONICAL_PROJECT_SCHEMA_VERSION_V3,
    'canonical v3 identity constants drifted from the public schema or example',
  )

  const componentKinds = schema.$defs.componentConfig.oneOf.map(
    branch => branch.$ref
      ? schema.$defs[branch.$ref.split('/').at(-1)].properties.kind.const
      : branch.properties.kind.const,
  )
  const publicPropTypes = [
    ...schema.$defs.publicProp.oneOf[0].properties.type.enum,
    schema.$defs.publicProp.oneOf[1].properties.type.const,
  ]
  const eventActionTypes = schema.$defs.eventAction.oneOf.map(
    branch => branch.properties.type.const,
  )
  assert(
    JSON.stringify(componentKinds) === JSON.stringify(contracts.COMPONENT_KINDS_V3) &&
      JSON.stringify(publicPropTypes) === JSON.stringify(contracts.PUBLIC_PROP_TYPES_V3) &&
      JSON.stringify(schema.$defs.eventTrigger.properties.type.enum) ===
        JSON.stringify(contracts.EVENT_TRIGGER_TYPES_V3) &&
      JSON.stringify(eventActionTypes) === JSON.stringify(contracts.EVENT_ACTION_TYPES_V3) &&
      JSON.stringify(schema.$defs.apiOperation.properties.method.enum) ===
        JSON.stringify(contracts.HTTP_METHODS_V3) &&
      JSON.stringify(schema.$defs.publicPropBinding.properties.field.enum) ===
        JSON.stringify(contracts.PUBLIC_PROP_FIELDS_V3) &&
      JSON.stringify(Object.keys(schema.$defs.variantCommonOverride.properties)) ===
        JSON.stringify(contracts.VARIANT_COMMON_OVERRIDE_FIELDS_V3) &&
      JSON.stringify(Object.keys(schema.$defs.variantConfigOverride.properties)) ===
        JSON.stringify(contracts.VARIANT_CONFIG_OVERRIDE_FIELDS_V3),
    'canonical v3 TypeScript catalogs drifted from JSON Schema',
  )

  const sharedInstance = Object.values(example.components)
    .find(component => component.nodeType === 'definitionInstance')
  const image = Object.values(example.components)
    .find(component => component.nodeType === 'inline' && component.kind === 'image')
  const link = Object.values(example.components)
    .find(component => component.nodeType === 'inline' && component.kind === 'link')
  const page = example.components[exampleScreen.rootComponentId]
  assert(sharedInstance && image && link && page, 'public v3 example is missing shared/media coverage')
  const sourceRef = sharedInstance.source.$ref
  const resolvedDefinition = contracts.resolveComponentDefinitionRefV3(example, sourceRef)
  assert(
    sourceRef === contracts.componentDefinitionRefV3('shared/header') &&
      contracts.parseComponentDefinitionRefV3(sourceRef) === 'shared/header' &&
      resolvedDefinition === example.componentDefinitions['shared/header'],
    'portable source.$ref did not resolve by RFC 6901 escaping to the exact definition',
  )
  for (const definitionId of ['percent%id', 'space id', 'hash#id', '日本語', 'a/b~c']) {
    const candidate = clone(example)
    const definition = clone(resolvedDefinition)
    definition.id = definitionId
    candidate.componentDefinitions[definitionId] = definition
    const ref = contracts.componentDefinitionRefV3(definitionId)
    candidate.components[sharedInstance.id].source.$ref = ref
    assert(
      isValid(candidate) &&
        contracts.parseComponentDefinitionRefV3(ref) === definitionId &&
        contracts.resolveComponentDefinitionRefV3(candidate, ref) ===
          candidate.componentDefinitions[definitionId],
      `portable source.$ref did not round-trip URI-fragment ID ${definitionId}: ${ref}`,
    )
  }
  assert(
    Object.values(example.components)
        .filter(component => component.nodeType === 'definitionInstance').length >= 2 &&
      resolvedDefinition.name === 'Shared Header' &&
      resolvedDefinition.publicProps[0].key === 'title' &&
      !Object.hasOwn(resolvedDefinition.publicProps[0], 'defaultValue') &&
      resolvedDefinition.representativeVariantId === 'comfortable' &&
      sharedInstance.variantId === 'comfortable' &&
      typeof sharedInstance.props.title === 'string' &&
      JSON.stringify(resolvedDefinition.publicProps[0].bindings[0].nodePath) ===
        JSON.stringify(['header-copy', 'header-title']) &&
      resolvedDefinition.publicProps[0].bindings[0].field === 'config.text' &&
      JSON.stringify(resolvedDefinition.variants.map(variant => variant.name)) ===
        JSON.stringify(['Comfortable', 'Compact']) &&
      Object.keys(example.screenScenarios).length > 0 &&
      Object.values(example.screenScenarios).some(scenario =>
        scenario.componentOverrides.some(entry => entry.target.type === 'definitionNode')) &&
      image.config.alt.length > 0 &&
      link.config.destination.type === 'external' &&
      link.config.openMode === 'newContext' &&
      page.placement.mode === 'flow' &&
      sharedInstance.placement.mode === 'flow' &&
      link.placement.mode === 'viewport' &&
      resolvedDefinition.nodes[resolvedDefinition.rootNodeId].placement.mode === 'flow',
    'public v3 example does not demonstrate the shared component and media contract',
  )
  assert(
    example.components['comp-launch-task-card'].config.columns === 12 &&
      JSON.stringify([
        'comp-launch-task-status',
        'comp-launch-task-title',
        'comp-launch-task-image',
        'comp-edit-launch-task-btn',
      ]
        .map(id => example.components[id].sizing.gridSpan)) === JSON.stringify([1, 6, 3, 2]),
    'public v3 example must preserve the non-equal 1/6/3/2 grid at every viewport',
  )
  contracts.assertCanonicalRootPlacementsV3(example)
  const unsafeImage = clone(example)
  unsafeImage.components[image.id].config.source = 'javascript:alert(1)'
  const missingAlt = clone(example)
  missingAlt.components[image.id].config.alt = ''
  const whitespaceAlt = clone(example)
  whitespaceAlt.components[image.id].config.alt = ' '
  const incompatibleExternalMode = clone(example)
  incompatibleExternalMode.components[link.id].config.openMode = 'download'
  const downloadableResource = clone(example)
  downloadableResource.components[link.id].config.destination = {
    type: 'resource',
    resourceId: 'opaque-report',
    url: './reports/status.pdf',
    displayName: 'Status report',
  }
  downloadableResource.components[link.id].config.openMode = 'download'
  const missingPlacement = clone(example)
  delete missingPlacement.components[image.id].placement
  const invalidCenteredInset = clone(example)
  invalidCenteredInset.components[link.id].placement = {
    mode: 'viewport',
    anchor: 'bottomCenter',
    insetX: 'sm',
    insetY: 'md',
  }
  const signedInset = clone(example)
  signedInset.components[link.id].placement.insetX = '-sm'
  const nonFlowPageRoot = clone(example)
  nonFlowPageRoot.components[page.id].placement = {
    mode: 'viewport',
    anchor: 'bottomRight',
    insetX: 'sm',
    insetY: 'sm',
  }
  assert(
    !isValid(unsafeImage) &&
      !isValid(missingAlt) &&
      !isValid(whitespaceAlt) &&
      !isValid(incompatibleExternalMode) &&
      !isValid(missingPlacement) &&
      !isValid(invalidCenteredInset) &&
      !isValid(signedInset) &&
      !isValid(nonFlowPageRoot) &&
      isValid(downloadableResource),
    'public v3 Image/Link URL, alt, or open-mode constraints drifted',
  )
  for (const mutate of [
    candidate => {
      const definition = candidate.componentDefinitions[resolvedDefinition.id]
      definition.nodes[definition.rootNodeId].placement = {
        mode: 'sticky',
        edge: 'top',
        inset: 'sm',
      }
    },
    candidate => {
      const definition = candidate.componentDefinitions[resolvedDefinition.id]
      definition.variants[0].nodeOverrides[definition.rootNodeId] = {
        ...definition.variants[0].nodeOverrides[definition.rootNodeId],
        placement: {
        mode: 'overlay',
        anchor: 'topLeft',
        insetX: 'sm',
        insetY: 'sm',
        },
      }
    },
  ]) {
    const invalidRootPlacement = clone(example)
    mutate(invalidRootPlacement)
    let rejected = false
    try {
      contracts.assertCanonicalRootPlacementsV3(invalidRootPlacement)
    } catch {
      rejected = true
    }
    assert(rejected, 'canonical v3 semantic validation accepted non-flow Definition root placement')
  }
  const missingSizing = clone(example)
  delete missingSizing.components[image.id].sizing
  assert(!isValid(missingSizing), 'canonical v3 inline node accepted missing sizing')
  for (const [label, mutate] of [
    ['Screen root sizing', candidate => {
      candidate.components[page.id].sizing.inlineSize = 'auto'
    }],
    ['Definition root sizing', candidate => {
      candidate.componentDefinitions[resolvedDefinition.id].nodes[resolvedDefinition.rootNodeId]
        .sizing.inlineSize = 'auto'
    }],
    ['min/max ordering', candidate => {
      candidate.components[image.id].sizing.minWidth = 'lg'
      candidate.components[image.id].sizing.maxWidth = 'sm'
    }],
    ['Grid span context', candidate => {
      candidate.components['comp-launch-task-card'].config.columns = 2
    }],
  ]) {
    const invalidSizing = clone(example)
    mutate(invalidSizing)
    let rejected = false
    try {
      contracts.assertCanonicalRootPlacementsV3(invalidSizing)
    } catch {
      rejected = true
    }
    assert(rejected, `canonical v3 semantic validation accepted invalid ${label}`)
  }

  for (const invalidRef of [
    'https://example.com/components/header.json',
    '#/componentDefinitions/shared/header',
    '#/componentDefinitions/shared~2header',
    '#/componentDefinitions/a%2Fb',
    '#/componentDefinitions/%41',
    '#/componentDefinitions/%7E1',
    '#/componentDefinitions/%FF',
    '#/componentDefinitions/hash#id',
    '#/componentDefinitions/space id',
    '#/componentDefinitions/%E6%97%A5%e6%9c%ac',
    '#/componentDefinitions/',
  ]) {
    const candidate = clone(example)
    candidate.components[sharedInstance.id].source.$ref = invalidRef
    assert(!isValid(candidate), `public schema accepted invalid source.$ref ${invalidRef}`)
    let rejected = false
    try {
      contracts.resolveComponentDefinitionRefV3(candidate, invalidRef)
    } catch {
      rejected = true
    }
    assert(rejected, `reference helper accepted invalid source.$ref ${invalidRef}`)
  }
  const unresolvedRef = '#/componentDefinitions/missing'
  let unresolvedRejected = false
  try {
    contracts.resolveComponentDefinitionRefV3(example, unresolvedRef)
  } catch {
    unresolvedRejected = true
  }
  assert(unresolvedRejected, 'reference helper accepted an unresolved local definition reference')
  const sourceWithSibling = clone(example)
  sourceWithSibling.components[sharedInstance.id].source.definitionId = 'shared/header'
  assert(!isValid(sourceWithSibling), 'source accepted a $ref sibling')

  const missingScenarioIds = clone(example)
  delete missingScenarioIds.screens[exampleScreen.id].scenarioIds
  assert(!isValid(missingScenarioIds), 'screen accepted missing scenarioIds')
  for (const legacyField of ['defaultStateId', 'stateIds']) {
    const legacyScreen = clone(example)
    legacyScreen.screens[exampleScreen.id][legacyField] = legacyField === 'stateIds' ? [] : 'base'
    assert(!isValid(legacyScreen), `screen accepted legacy ${legacyField}`)
  }

  const publicPropWithDefault = clone(example)
  publicPropWithDefault.componentDefinitions['shared/header'].publicProps[0].defaultValue = 'Title'
  assert(!isValid(publicPropWithDefault), 'public prop accepted defaultValue')
  const nullProp = clone(example)
  nullProp.components[sharedInstance.id].props.title = null
  assert(!isValid(nullProp), 'instance prop accepted null instead of inheriting by omission')
  const missingRepresentative = clone(example)
  delete missingRepresentative.componentDefinitions['shared/header'].representativeVariantId
  assert(!isValid(missingRepresentative), 'Definition accepted a missing representative Variant')

  const mismatchedKind = clone(example)
  mismatchedKind.components[page.id].config.kind = 'container'
  assert(!isValid(mismatchedKind), 'inline component accepted mismatched kind and config.kind')

  for (const nodePath of [[], [0], ['header-root', 0]]) {
    const invalidTarget = clone(example)
    const entry = Object.values(invalidTarget.screenScenarios)
      .flatMap(scenario => scenario.componentOverrides)
      .find(item => item.target.type === 'definitionNode')
    entry.target.nodePath = nodePath
    assert(
      !isValid(invalidTarget),
      `definitionNode target accepted invalid stable-ID nodePath ${JSON.stringify(nodePath)}`,
    )
  }

  const forbiddenVariantFields = [
    'id',
    'kind',
    'nodeType',
    'parentId',
    'childIds',
    'variantId',
    'props',
    'eventId',
    'fieldKey',
    'options',
    'validationRules',
  ]
  for (const field of forbiddenVariantFields) {
    const invalidVariant = clone(example)
    invalidVariant.componentDefinitions['shared/header'].variants[0].nodeOverrides[
      'header-root'
    ].config[field] = field === 'childIds' ? [] : 'changed'
    assert(!isValid(invalidVariant), `variant override accepted topology field ${field}`)
  }
  const flattenedVariant = clone(example)
  flattenedVariant.componentDefinitions['shared/header'].variants[0]
    .nodeOverrides['header-root'].gap = 'sm'
  assert(!isValid(flattenedVariant), 'variant override accepted a flattened config field')
  const legacyScenarioShape = clone(example)
  const scenarioWithOverride = Object.values(legacyScenarioShape.screenScenarios)
    .find(scenario => scenario.componentOverrides.length > 0)
  scenarioWithOverride.componentOverrides[0].fields = { text: 'Wait' }
  delete scenarioWithOverride.componentOverrides[0].override
  assert(!isValid(legacyScenarioShape), 'Scenario accepted broad or legacy fields shape')

  const reservedIds = [
    ...new Set([
      ...Object.getOwnPropertyNames(Object.prototype),
      '__proto__',
      'prototype',
      'constructor',
    ]),
  ].sort()
  assert(
    JSON.stringify([...schema.$defs.entityId.allOf[1].not.enum].sort()) ===
      JSON.stringify(reservedIds),
    'canonical schema reserved entity IDs drifted from runtime protection',
  )
  for (const reservedId of reservedIds) {
    const reservedEntity = clone(example)
    Object.defineProperty(reservedEntity.components, reservedId, {
      enumerable: true,
      value: clone(reservedEntity.components[page.id]),
    })

    reservedEntity.components[reservedId].id = reservedId
    assert(!isValid(reservedEntity), `canonical schema accepted reserved entity ID ${reservedId}`)
  }
  const combinations = resolvedDefinition.variants.map(
    variant => JSON.stringify(
      Object.entries(variant.propertyValues).sort(([left], [right]) => left.localeCompare(right)),
    ),
  )
  assert(
    new Set(combinations).size === combinations.length,
    'public example variants repeat a property/value combination',
  )
  contracts.assertUniqueVariantPropertyCombinationsV3(resolvedDefinition)
  const duplicateCombination = clone(resolvedDefinition)
  duplicateCombination.variants[1].propertyValues = clone(
    duplicateCombination.variants[0].propertyValues,
  )
  let duplicateRejected = false
  try {
    contracts.assertUniqueVariantPropertyCombinationsV3(duplicateCombination)
  } catch {
    duplicateRejected = true
  }
  assert(duplicateRejected, 'variant contract accepted a duplicate property/value combination')
})

await test('component placement is atomic, constrained, and retained by structural edits', async () => {
  const { validateComponentPlacement } = await import(
    moduleUrl(runtimeValidationBundle, 'placement-validation')
  )
  const { validateInvariants } = await import(
    moduleUrl(invariantsBundle, 'placement-invariants')
  )
  const { applyCommandWithoutRevision } = await import(
    moduleUrl(domainBundle, 'placement-domain')
  )
  const { sampleProject } = await import(moduleUrl(sampleProjectBundle, 'placement-sample'))

  for (const placement of [
    { mode: 'flow' },
    { mode: 'sticky', edge: 'bottom', inset: 'lg' },
    { mode: 'overlay', anchor: 'topLeft', insetX: 'xs', insetY: 'md' },
    { mode: 'viewport', anchor: 'center', insetX: 'none', insetY: 'none' },
  ]) {
    validateComponentPlacement(placement)
  }
  for (const placement of [
    { mode: 'sticky', edge: 'left', inset: 'sm' },
    { mode: 'viewport', anchor: 'center', insetX: 'sm', insetY: 'none' },
    { mode: 'overlay', anchor: 'topCenter', insetX: 'none', insetY: -1 },
    { mode: 'flow', inset: 'sm' },
  ]) {
    let rejected = false
    try {
      validateComponentPlacement(placement)
    } catch {
      rejected = true
    }
    assert(rejected, `runtime accepted invalid placement ${JSON.stringify(placement)}`)
  }

  let rootRejected = false
  try {
    applyCommandWithoutRevision(sampleProject, {
      type: 'updateComponentSpec',
      componentId: 'comp-list-page',
      patch: {
        placement: {
          mode: 'viewport',
          anchor: 'bottomRight',
          insetX: 'sm',
          insetY: 'sm',
        },
      },
    })
  } catch {
    rootRejected = true
  }
  assert(rootRejected, 'independent Page root accepted non-flow placement')

  const callerPlacement = {
    mode: 'overlay',
    anchor: 'bottomRight',
    insetX: 'sm',
    insetY: 'md',
  }
  const updated = applyCommandWithoutRevision(sampleProject, {
    type: 'updateComponentSpec',
    componentId: 'comp-list-summary',
    patch: { placement: callerPlacement },
  })
  callerPlacement.insetX = 'lg'
  assert(
    updated.components['comp-list-summary'].placement.mode === 'overlay' &&
      updated.components['comp-list-summary'].placement.insetX === 'sm',
    'placement update retained caller-owned state or was not atomic',
  )

  const duplicated = applyCommandWithoutRevision(sampleProject, {
    type: 'duplicateComponent',
    componentId: 'comp-list-header',
    componentIdMap: { 'comp-list-header': 'copy-list-header' },
    eventIdMap: {},
    apiOperationIdMap: {},
  })
  assert(
    duplicated.components['copy-list-header'].placement.mode === 'flow' &&
      duplicated.components['copy-list-header'].placement !==
        duplicated.components['comp-list-header'].placement,
    'duplicate did not retain an isolated placement value',
  )

  const moved = applyCommandWithoutRevision(sampleProject, {
    type: 'moveComponent',
    componentId: 'comp-list-help-link',
    newParentId: 'comp-task-list',
    position: 0,
  })
  assert(
    moved.components['comp-list-help-link'].parentId === 'comp-task-list' &&
      moved.components['comp-list-help-link'].placement.mode === 'viewport',
    'reparent changed a valid portable placement',
  )
  validateInvariants(moved)
})

await test('placement editing survives undo, redo, persistence, and review lock', async () => {
  memoryStorage.clear()
  installStorage(memoryStorage)
  const store = await freshStore('placement-history')
  const placement = {
    mode: 'overlay',
    anchor: 'topRight',
    insetX: 'sm',
    insetY: 'lg',
  }
  assert(
    store.getState().dispatch({
      type: 'updateComponentSpec',
      componentId: 'comp-list-summary',
      patch: { placement },
    }, 'Update placement'),
    'human placement update failed',
  )
  store.getState().undo()
  assert(
    store.getState().document.components['comp-list-summary'].placement.mode === 'flow',
    'undo did not restore flow placement',
  )
  store.getState().redo()
  assert(
    JSON.stringify(store.getState().document.components['comp-list-summary'].placement) ===
      JSON.stringify(placement),
    'redo did not restore atomic placement',
  )
  const reloaded = await freshStore('placement-history-reload')
  assert(
    JSON.stringify(reloaded.getState().document.components['comp-list-summary'].placement) ===
      JSON.stringify(placement),
    'placement did not survive reload',
  )
  reloaded.getState().beginChangeSet('Lock placement')
  const before = JSON.stringify(reloaded.getState().document)
  assert(
    !reloaded.getState().dispatch({
      type: 'updateComponentSpec',
      componentId: 'comp-list-summary',
      patch: { placement: { mode: 'flow' } },
    }, 'Blocked placement update') &&
      JSON.stringify(reloaded.getState().document) === before,
    'review lock allowed a human placement edit',
  )
})

await test('component sizing is exact, contextual, atomic, and DnD-safe', async () => {
  const { applyCommandWithoutRevision } = await import(
    moduleUrl(domainBundle, 'component-sizing-domain')
  )
  const { validateComponentSizing, validateScreenComponent } = await import(
    moduleUrl(runtimeValidationBundle, 'component-sizing-runtime')
  )
  const { validateInvariants } = await import(
    moduleUrl(invariantsBundle, 'component-sizing-invariants')
  )
  const { resolveEditorDrop } = await import(
    moduleUrl(editorDndBundle, 'component-sizing-dnd')
  )
  const { canPasteComponent, createComponentSubtreeSnapshot } = await import(
    moduleUrl(componentDuplicationBundle, 'component-sizing-copy-paste')
  )
  const { sampleProject } = await import(
    moduleUrl(sampleProjectBundle, 'component-sizing-sample')
  )
  const rejected = (callback, message) => {
    let didReject = false
    try {
      callback()
    } catch {
      didReject = true
    }
    assert(didReject, message)
  }

  for (const sizing of [
    { ...defaultSizing(), extra: true },
    { ...defaultSizing(), gridSpan: 0 },
    { ...defaultSizing(), gridSpan: 1.5 },
    { ...defaultSizing(), grow: 4 },
  ]) {
    rejected(
      () => validateComponentSizing(sizing),
      `runtime accepted invalid sizing ${JSON.stringify(sizing)}`,
    )
  }
  const missingSizing = clone(sampleProject.components['comp-list-summary'])
  delete missingSizing.sizing
  rejected(
    () => validateScreenComponent(missingSizing),
    'runtime accepted a component without required sizing',
  )

  const updateSizing = (document, componentId, sizing) =>
    applyCommandWithoutRevision(document, {
      type: 'updateComponentSpec',
      componentId,
      patch: { sizing },
    })
  const horizontalBase = applyCommandWithoutRevision(sampleProject, {
    type: 'updateComponentSpec',
    componentId: 'comp-edit-page',
    patch: { config: { layout: 'horizontal' } },
  })
  rejected(
    () => updateSizing(
      horizontalBase,
      'comp-list-summary',
      defaultSizing({ minWidth: 'lg', maxWidth: 'sm' }),
    ),
    'minWidth greater than maxWidth was accepted',
  )
  rejected(
    () => updateSizing(
      sampleProject,
      'comp-list-summary',
      defaultSizing({ gridSpan: 2 }),
    ),
    'vertical flow accepted a grid span',
  )
  rejected(
    () => updateSizing(
      horizontalBase,
      'comp-save-btn',
      defaultSizing({ grow: 1 }),
    ),
    'horizontal grow accepted non-fill inline sizing',
  )
  rejected(
    () => updateSizing(
      sampleProject,
      'comp-launch-task-status',
      defaultSizing({ grow: 1, inlineSize: 'fill' }),
    ),
    'Grid flow accepted flex grow',
  )
  rejected(
    () => applyCommandWithoutRevision(sampleProject, {
      type: 'updateComponentSpec',
      componentId: 'comp-list-summary',
      patch: {
        placement: {
          mode: 'overlay',
          anchor: 'topLeft',
          insetX: 'sm',
          insetY: 'sm',
        },
        sizing: defaultSizing({ gridSpan: 2 }),
      },
    }),
    'non-flow placement accepted parent-layout sizing',
  )
  rejected(
    () => updateSizing(sampleProject, 'comp-list-page', defaultSizing()),
    'Page root accepted editable non-root sizing',
  )

  const spannedGrid = updateSizing(
    sampleProject,
    'comp-launch-task-status',
    defaultSizing({ gridSpan: 2 }),
  )
  validateInvariants(spannedGrid)
  for (const config of [{ columns: 1 }, { layout: 'vertical' }]) {
    rejected(
      () => applyCommandWithoutRevision(spannedGrid, {
        type: 'updateComponentSpec',
        componentId: 'comp-launch-task-card',
        patch: { config },
      }),
      `parent layout edit silently invalidated a child: ${JSON.stringify(config)}`,
    )
  }
  rejected(
    () => applyCommandWithoutRevision(spannedGrid, {
      type: 'moveComponent',
      componentId: 'comp-launch-task-status',
      newParentId: 'comp-task-list',
    }),
    'reparent accepted sizing invalid for the destination layout',
  )
  const dndOutcome = resolveEditorDrop(
    spannedGrid,
    {
      type: 'component',
      componentId: 'comp-launch-task-status',
      screenId: 'screen-list',
      label: 'Launch card',
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
    dndOutcome.status === 'invalid' && dndOutcome.reason === 'domainValidation',
    'DnD advertised a reparent that violates destination sizing context',
  )
  const snapshot = createComponentSubtreeSnapshot(
    spannedGrid,
    'comp-launch-task-status',
  )
  assert(
    snapshot &&
      snapshot.components['comp-launch-task-status'].sizing.gridSpan === 2 &&
      snapshot.components['comp-launch-task-status'].sizing !==
        spannedGrid.components['comp-launch-task-status'].sizing &&
      !canPasteComponent(spannedGrid, snapshot, 'comp-task-list'),
    'copy/paste lost sizing isolation or advertised an invalid destination',
  )

  const callerSizing = defaultSizing({
    inlineSize: 'fill',
    grow: 2,
    shrink: 'allow',
  })
  const horizontal = updateSizing(horizontalBase, 'comp-save-btn', callerSizing)
  callerSizing.grow = 3
  assert(
    horizontal.components['comp-save-btn'].sizing.grow === 2 &&
      horizontal.components['comp-save-btn'].sizing !== callerSizing,
    'sizing update retained caller-owned mutable state',
  )

  memoryStorage.clear()
  installStorage(memoryStorage)
  const store = await freshStore('component-sizing-history')
  const persistedSizing = defaultSizing({
    inlineSize: 'fill',
    minWidth: 'xs',
    maxWidth: 'lg',
    gridSpan: 1,
  })
  assert(
    store.getState().dispatch({
      type: 'updateComponentSpec',
      componentId: 'comp-save-btn',
      patch: { sizing: persistedSizing },
    }, 'Update sizing'),
    `atomic sizing edit failed: ${JSON.stringify(store.getState().toast)}`,
  )
  store.getState().undo()
  assert(
    store.getState().document.components['comp-save-btn'].sizing.gridSpan === 1,
    'Undo did not restore sizing',
  )
  store.getState().redo()
  assert(
    JSON.stringify(store.getState().document.components['comp-save-btn'].sizing) ===
      JSON.stringify(persistedSizing),
    'Redo did not restore complete sizing',
  )
  const reloaded = await freshStore('component-sizing-history-reload')
  assert(
    JSON.stringify(reloaded.getState().document.components['comp-save-btn'].sizing) ===
      JSON.stringify(persistedSizing),
    'sizing did not survive reload',
  )
  reloaded.getState().beginChangeSet('Lock sizing')
  const beforeLockedEdit = JSON.stringify(reloaded.getState().document)
  assert(
    !reloaded.getState().dispatch({
      type: 'updateComponentSpec',
      componentId: 'comp-save-btn',
      patch: { sizing: defaultSizing() },
    }, 'Blocked sizing edit') &&
      JSON.stringify(reloaded.getState().document) === beforeLockedEdit,
    'review lock allowed a human sizing edit',
  )
})

await test('legacy v1 and v2 documents are rejected without migration', async () => {
  const { migratePersistedData } = await import(
    moduleUrl(migratePersistedDataBundle, 'legacy-rejection-direct')
  )
  const baselineStore = await freshStore('legacy-rejection-baseline')
  for (const schemaVersion of [1, 2]) {
    const payload = {
      document: {
        ...clone(baselineStore.getState().document),
        schemaVersion,
      },
    }
    const migration = migratePersistedData(payload)
    assert(
      !migration.migrated && migration.value === payload,
      `legacy v${schemaVersion} data was rewritten instead of rejected`,
    )
    memoryStorage.clear()
    memoryStorage.setItem(storageKey, JSON.stringify(payload))
    const store = await freshStore(`legacy-v${schemaVersion}-rejection`)
    assert(
      store.getState().recoveryState !== null,
      `legacy v${schemaVersion} document bypassed recovery`,
    )
  }
})

await test('storage access failures never crash initialization or reset', async () => {
  memoryStorage.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Storage getter denied', 'SecurityError')
    },
  })
  const getterFailureStore = await freshStore('storage-getter-failure')
  assert(getterFailureStore.getState().recoveryState !== null, 'getter failure did not enter recovery')
  getterFailureStore.getState().resetToSample()
  assert(getterFailureStore.getState().recoveryState === null, 'reset leaked a storage getter error')

  installStorage(memoryStorage)
  memoryStorage.clear()
  memoryStorage.throwOnGet = true
  const getItemFailureStore = await freshStore('storage-getitem-failure')
  assert(getItemFailureStore.getState().recoveryState !== null, 'getItem failure did not enter recovery')
  memoryStorage.throwOnGet = false

  const removeFailureStore = await freshStore('storage-remove-failure')
  memoryStorage.throwOnRemove = true
  removeFailureStore.getState().resetToSample()
  assert(removeFailureStore.getState().recoveryState === null, 'removeItem failure escaped reset')
  memoryStorage.throwOnRemove = false
})

await test('broken pending change sets never block or mutate confirmed data', async () => {
  memoryStorage.clear()
  const seedStore = await freshStore('broken-change-set-seed')
  seedStore.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Confirmed before broken change set',
  })
  const confirmed = clone(seedStore.getState().document)
  const confirmedRevision = seedStore.getState().revision
  const activeScreenId = 'screen-edit'
  const cases = [
    {
      name: 'malformed-envelope',
      activeChangeSet: { id: 'broken-envelope' },
    },
    {
      name: 'invalid-replay',
      activeChangeSet: {
        id: 'broken-replay',
        summary: 'Cannot replay',
        baseRevision: confirmedRevision,
        version: 1,
        baseDocument: confirmed,
        operations: [{
          id: 'broken-operation',
          source: 'agent',
          issuedAt: new Date().toISOString(),
          command: {
            type: 'updateScreen',
            screenId: 'missing-screen',
            name: 'Must not apply',
          },
        }],
        createdAt: new Date().toISOString(),
      },
    },
  ]

  for (const testCase of cases) {
    memoryStorage.clear()
    memoryStorage.setItem(storageKey, JSON.stringify({
      revision: confirmedRevision,
      document: confirmed,
      activeScreenId,
      activeChangeSet: testCase.activeChangeSet,
    }))
    const store = await freshStore(`broken-change-set-${testCase.name}`)
    const state = store.getState()
    assert(state.recoveryState === null, `${testCase.name} blocked the confirmed document`)
    assert(state.activeChangeSet === null, `${testCase.name} remained active`)
    assert(
      JSON.stringify(state.document) === JSON.stringify(confirmed),
      `${testCase.name} mutated the confirmed document`,
    )
    assert(
      JSON.stringify(state.effectiveDocument) === JSON.stringify(confirmed),
      `${testCase.name} changed the effective document`,
    )
    assert(state.revision === confirmedRevision, `${testCase.name} changed revision`)
    assert(state.history.length === 0, `${testCase.name} created confirmed history`)
    assert(state.ui.activeScreenId === activeScreenId, `${testCase.name} lost the active screen`)
    assert(state.ui.rightPanelTab === 'inspector', `${testCase.name} opened Changes review`)
    assert(
      state.startupNotice?.key === 'app.invalidChangeSetDiscarded',
      `${testCase.name} did not surface the discarded change set`,
    )

    const sanitized = JSON.parse(memoryStorage.getItem(storageKey))
    assert(!('activeChangeSet' in sanitized), `${testCase.name} remained in storage`)
    assert(
      JSON.stringify(sanitized.document) === JSON.stringify(confirmed),
      `${testCase.name} cleanup rewrote confirmed data`,
    )

    const reloaded = await freshStore(`broken-change-set-${testCase.name}-reload`)
    assert(reloaded.getState().recoveryState === null, `${testCase.name} reload entered recovery`)
    assert(reloaded.getState().activeChangeSet === null, `${testCase.name} revived after reload`)
    assert(reloaded.getState().startupNotice === null, `${testCase.name} cleanup repeated after reload`)
  }
})

await test('failed broken change set cleanup stays non-blocking and explicit', async () => {
  memoryStorage.clear()
  const seedStore = await freshStore('broken-cleanup-seed')
  seedStore.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Confirmed survives cleanup failure',
  })
  const confirmed = clone(seedStore.getState().document)
  const raw = JSON.stringify({
    revision: seedStore.getState().revision,
    document: confirmed,
    activeChangeSet: { id: 'cannot-remove' },
  })
  memoryStorage.setItem(storageKey, raw)
  memoryStorage.throwOnSetKeys.add(storageKey)

  const store = await freshStore('broken-cleanup-write-failure')
  const state = store.getState()
  assert(state.recoveryState === null, 'cleanup write failure entered full recovery')
  assert(state.activeChangeSet === null, 'cleanup write failure restored the broken change set')
  assert(
    JSON.stringify(state.document) === JSON.stringify(confirmed),
    'cleanup write failure changed confirmed data',
  )
  assert(state.persistenceUnavailable, 'cleanup write failure did not expose persistence failure')
  assert(
    state.startupNotice?.key === 'app.invalidChangeSetDiscardFailed',
    'cleanup write failure did not explain that the change set remains in storage',
  )
  assert(memoryStorage.getItem(storageKey) === raw, 'cleanup write failure altered the stored payload')

  memoryStorage.throwOnSetKeys.delete(storageKey)
  const retryStore = await freshStore('broken-cleanup-write-retry')
  assert(retryStore.getState().recoveryState === null, 'cleanup retry entered recovery')
  assert(retryStore.getState().activeChangeSet === null, 'cleanup retry restored the broken change set')
  assert(
    retryStore.getState().startupNotice?.key === 'app.invalidChangeSetDiscarded',
    'cleanup retry did not report successful discard',
  )
  assert(
    !('activeChangeSet' in JSON.parse(memoryStorage.getItem(storageKey))),
    'cleanup retry left the broken change set in storage',
  )
})

await test('effective-document replay failures fall back to confirmed data', async () => {
  memoryStorage.clear()
  const module = await import(moduleUrl(appStoreBundle, 'effective-replay-fallback'))
  const confirmed = clone(module.useAppStore.getState().document)
  const brokenChangeSet = {
    id: 'broken-effective-replay',
    summary: 'Broken effective replay',
    baseRevision: confirmed.revision,
    version: 1,
    baseDocument: confirmed,
    operations: [{
      id: 'broken-effective-operation',
      source: 'agent',
      issuedAt: new Date().toISOString(),
      command: {
        type: 'updateScreen',
        screenId: 'missing-screen',
        name: 'Must not apply',
      },
    }],
    createdAt: new Date().toISOString(),
  }

  const restoration = module.restoreEffectiveDocument(confirmed, brokenChangeSet)
  assert(restoration.status === 'discarded', 'effective replay failure was treated as success')
  assert(
    JSON.stringify(restoration.effectiveDocument) === JSON.stringify(confirmed),
    'effective replay failure did not return the confirmed document',
  )
  assert(confirmed.revision === module.useAppStore.getState().document.revision, 'fallback changed revision')
})

await test('malformed rejected history is ignored and cannot block rejection', async () => {
  const invalidSeeds = [
    {},
    7,
    null,
    [{ changeSetId: 'missing-fields' }],
    [null, 4, { invalid: true }],
  ]

  for (const [index, seed] of invalidSeeds.entries()) {
    memoryStorage.clear()
    memoryStorage.setItem(rejectedKey, JSON.stringify(seed))
    const store = await freshStore(`rejected-seed-${index}`)
    assert(Array.isArray(store.getState().rejectedRecords), 'rejectedRecords is not an array')
    assert(store.getState().rejectedRecords.length === 0, 'invalid rejected record was retained')
    const changeSet = store.getState().beginChangeSet('Reject malformed history')
    assert(store.getState().ui.rightPanelTab === 'inspector', 'change set did not preserve the active Inspector context')
    store.getState().rejectChangeSet()
    assert(store.getState().activeChangeSet === null, 'malformed history blocked rejection')
    assert(
      store.getState().rejectedRecords[0]?.changeSetId === changeSet.id,
      'valid in-memory rejection was not retained',
    )
    const record = store.getState().rejectedRecords[0]
    assert(
      Object.keys(record).sort().join(',') === [
        'baseRevision',
        'changeSetId',
        'operationCount',
        'operationSummaries',
        'rejectedAt',
        'summary',
      ].join(','),
      'rejection history metadata has an unexpected shape',
    )
    assert(Array.isArray(record.operationSummaries), 'operation summaries were not retained')
  }

  memoryStorage.clear()
  const writeFailureStore = await freshStore('rejected-write-failure')
  writeFailureStore.getState().beginChangeSet('Rejected history write failure')
  memoryStorage.throwOnSetKeys.add(rejectedKey)
  writeFailureStore.getState().rejectChangeSet()
  memoryStorage.throwOnSetKeys.delete(rejectedKey)
  assert(writeFailureStore.getState().activeChangeSet === null, 'history save failure blocked rejection')
  assert(
    writeFailureStore.getState().toast?.severity === 'error',
    'history save failure did not set an error toast',
  )
  const reloadedStore = await freshStore('rejected-write-failure-reload')
  assert(reloadedStore.getState().activeChangeSet === null, 'failed history save restored rejected change set')
})

await test('failed rejection persistence cannot restore a rejected change set', async () => {
  memoryStorage.clear()
  const removeSuccessStore = await freshStore('reject-stale-remove-success')
  removeSuccessStore.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Confirmed user edit',
  })
  const first = removeSuccessStore.getState().beginChangeSet('Reject with failed overwrite')
  removeSuccessStore.getState().dispatchToChangeSet(first.id, {
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Rejected preview',
  })
  memoryStorage.throwOnSetKeys.add(storageKey)
  removeSuccessStore.getState().rejectChangeSet()
  memoryStorage.throwOnSetKeys.delete(storageKey)
  assert(removeSuccessStore.getState().activeChangeSet === null, 'rejection did not clear active state')
  assert(removeSuccessStore.getState().persistenceUnavailable, 'failed rejection save was not surfaced')
  const afterRemovalReload = await freshStore('reject-stale-remove-success-reload')
  assert(afterRemovalReload.getState().activeChangeSet === null, 'removed stale change set was restored')
  assert(
    afterRemovalReload.getState().document.screens['screen-list'].name === 'Confirmed user edit',
    'last confirmed user edit was lost when rejection history saved',
  )

  memoryStorage.clear()
  const rejectedIdGuardStore = await freshStore('reject-stale-id-guard')
  const second = rejectedIdGuardStore.getState().beginChangeSet('Reject with failed remove')
  rejectedIdGuardStore.getState().dispatchToChangeSet(second.id, {
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Rejected stale preview',
  })
  memoryStorage.throwOnSetKeys.add(storageKey)
  memoryStorage.throwOnRemove = true
  rejectedIdGuardStore.getState().rejectChangeSet()
  memoryStorage.throwOnSetKeys.delete(storageKey)
  memoryStorage.throwOnRemove = false
  const guardedReload = await freshStore('reject-stale-id-guard-reload')
  assert(guardedReload.getState().activeChangeSet === null, 'rejected ID guard restored stale change set')
  assert(
    guardedReload.getState().effectiveDocument.screens['screen-list'].name !== 'Rejected stale preview',
    'rejected preview became effective after reload',
  )

  memoryStorage.clear()
  const bothWritesFailStore = await freshStore('reject-both-writes-fail')
  const third = bothWritesFailStore.getState().beginChangeSet('Reject with both writes failing')
  bothWritesFailStore.getState().dispatchToChangeSet(third.id, {
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Must never revive',
  })
  memoryStorage.throwOnSetKeys.add(storageKey)
  memoryStorage.throwOnSetKeys.add(rejectedKey)
  bothWritesFailStore.getState().rejectChangeSet()
  memoryStorage.throwOnSetKeys.delete(storageKey)
  memoryStorage.throwOnSetKeys.delete(rejectedKey)
  assert(memoryStorage.getItem(storageKey) === null, 'stale change set survived both rejection write failures')
  assert(bothWritesFailStore.getState().activeChangeSet === null, 'both write failures restored active state')
  assert(bothWritesFailStore.getState().persistenceUnavailable, 'both write failures were not surfaced')
  assert(typeof bothWritesFailStore.getState().exportCurrentData === 'function', 'confirmed JSON cannot be exported')
})

await test('recovery blocks mutations and exposes only recovery context', async () => {
  memoryStorage.clear()
  const baselineStore = await freshStore('recovery-gate-baseline')
  const poisoned = clone(baselineStore.getState().document)
  poisoned.components['comp-list-summary'].common.description = { poison: true }
  const raw = JSON.stringify({
    revision: baselineStore.getState().revision,
    document: poisoned,
  })
  memoryStorage.setItem(storageKey, raw)

  const store = await freshStore('recovery-gate-store')
  assert(store.getState().recoveryState !== null, 'poisoned data did not enter recovery')
  const blockedActions = [
    () => store.getState().dispatch({
      type: 'updateScreen',
      screenId: 'screen-list',
      name: 'Must not write',
    }),
    () => store.getState().beginChangeSet('Must not begin'),
    () => store.getState().dispatchToChangeSet('missing', {
      type: 'updateScreen',
      screenId: 'screen-list',
      name: 'Must not preview',
    }),
    () => store.getState().acceptChangeSet(),
    () => store.getState().rejectChangeSet(),
    () => store.getState().undo(),
    () => store.getState().redo(),
  ]
  for (const action of blockedActions) {
    let error
    try {
      action()
    } catch (caught) {
      error = caught
    }
    assert(error?.code === 'RECOVERY_REQUIRED', 'recovery mutation returned the wrong error')
    assert(memoryStorage.getItem(storageKey) === raw, 'recovery mutation overwrote corrupt raw data')
  }

  const module = await import(moduleUrl(toolsBundle, 'recovery-gate-tools'))
  const byName = name => module.WEBMCP_TOOLS.find(tool => tool.name === name)
  const context = byName('get_current_screen_context').execute({})
  assert(context.ok && context.data.recovery?.status === 'invalid', 'context omitted recovery status')
  assert(context.data.project === undefined, 'context exposed the sample project during recovery')
  const pending = byName('get_pending_change_set').execute({})
  assert(pending.ok && pending.data.recovery?.status === 'invalid', 'pending read omitted recovery status')
  const writeNames = [
    'begin_change_set',
    'change_screen_structure',
    'change_component_structure',
    'update_component_spec',
    'upsert_screen_state',
    'connect_behavior',
  ]
  for (const name of writeNames) {
    const result = byName(name).execute({})
    assert(!result.ok && result.error.code === 'RECOVERY_REQUIRED', `${name} was not recovery-blocked`)
    assert(memoryStorage.getItem(storageKey) === raw, `${name} overwrote corrupt raw data`)
  }
})

await test('persisted preview reloads separately and reject permanently clears it', async () => {
  localStorage.clear()
  const firstStore = await freshStore('reload-first')
  const confirmedName = firstStore.getState().document.screens['screen-list'].name
  const changeSet = firstStore.getState().beginChangeSet('Reload change set')
  firstStore.getState().dispatchToChangeSet(changeSet.id, {
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Preview name',
  }, 'agent')

  const reloadedStore = await freshStore('reload-second')
  assert(
    reloadedStore.getState().document.screens['screen-list'].name === confirmedName,
    'reload replaced the confirmed document with preview data',
  )
  assert(
    reloadedStore.getState().effectiveDocument.screens['screen-list'].name === 'Preview name',
    'reload did not reconstruct the preview',
  )

  reloadedStore.getState().rejectChangeSet()
  assert(reloadedStore.getState().activeChangeSet === null, 'reject did not clear the active change set')
  assert(
    reloadedStore.getState().effectiveDocument.screens['screen-list'].name === confirmedName,
    'reject did not restore the confirmed document',
  )

  const finalStore = await freshStore('reload-third')
  assert(finalStore.getState().activeChangeSet === null, 'rejected change set reappeared after reload')
  assert(
    finalStore.getState().document.screens['screen-list'].name === confirmedName,
    'confirmed document changed after rejecting the reloaded preview',
  )
})

await test('persisted legacy human change set operations require explicit recovery', async () => {
  localStorage.clear()
  const baselineStore = await freshStore('mixed-change-set-baseline')
  const document = clone(baselineStore.getState().document)
  const revision = baselineStore.getState().revision
  const activeChangeSet = {
    id: 'legacy-mixed-change-set',
    summary: 'Legacy mixed review',
    baseRevision: revision,
    version: 1,
    baseDocument: document,
    operations: [{
      id: 'legacy-human-operation',
      source: 'human',
      command: {
        type: 'updateScreen',
        screenId: 'screen-list',
        name: 'Legacy human preview',
      },
      issuedAt: new Date().toISOString(),
    }],
    createdAt: new Date().toISOString(),
  }
  const raw = JSON.stringify({ revision, document, activeChangeSet })
  localStorage.setItem(storageKey, raw)
  const recovered = await freshStore('mixed-change-set-recovery')
  assert(
    recovered.getState().recoveryState?.rawData === raw &&
      recovered.getState().activeChangeSet === null &&
      memoryStorage.getItem(storageKey) === raw,
    'legacy human change set data was discarded or treated as AI instead of entering recovery',
  )
})

await test('malformed active change sets are isolated from confirmed data', async () => {
  localStorage.clear()
  const baselineStore = await freshStore('malformed-baseline')
  const document = clone(baselineStore.getState().document)
  const revision = baselineStore.getState().revision
  const common = {
    id: 'change-set',
    summary: 'Broken',
    baseRevision: revision,
    version: 0,
    createdAt: new Date().toISOString(),
  }
  const cases = [
    { ...common, baseDocument: document },
    { ...common, operations: [] },
    {
      ...common,
      baseDocument: document,
      version: 1,
      operations: [{
        id: 'operation',
        source: 'agent',
        issuedAt: new Date().toISOString(),
        command: { type: 'unknownCommand' },
      }],
    },
  ]

  for (const [index, activeChangeSet] of cases.entries()) {
    localStorage.setItem(storageKey, JSON.stringify({ revision, document, activeChangeSet }))
    const store = await freshStore(`malformed-${index}`)
    assert(store.getState().recoveryState === null, `case ${index} entered recovery`)
    assert(store.getState().activeChangeSet === null, `case ${index} remained active`)
    assert(
      JSON.stringify(store.getState().document) === JSON.stringify(document),
      `case ${index} changed confirmed data`,
    )
    assert(
      store.getState().startupNotice?.key === 'app.invalidChangeSetDiscarded',
      `case ${index} did not report discarded pending changes`,
    )
    assert(
      !('activeChangeSet' in JSON.parse(localStorage.getItem(storageKey))),
      `case ${index} remained in storage`,
    )
  }

  const dangerousCommands = [
    { type: 'updateScreen', screenId: '__proto__', name: 'Polluted' },
    { type: 'removeComponent', componentId: 'constructor' },
    { type: 'updateScreenState', stateId: 'toString', name: 'Polluted' },
  ]
  for (const [index, command] of dangerousCommands.entries()) {
    const activeChangeSet = {
      ...common,
      version: 1,
      baseDocument: document,
      operations: [{
        id: `dangerous-operation-${index}`,
        source: 'agent',
        issuedAt: new Date().toISOString(),
        command,
      }],
    }
    localStorage.setItem(storageKey, JSON.stringify({ revision, document, activeChangeSet }))
    const store = await freshStore(`malformed-dangerous-${index}`)
    assert(store.getState().recoveryState === null, `dangerous replay ${index} entered recovery`)
    assert(store.getState().activeChangeSet === null, `dangerous replay ${index} remained active`)
    assert(
      JSON.stringify(store.getState().document) === JSON.stringify(document),
      `dangerous replay ${index} changed confirmed data`,
    )
    assert(({}).name === undefined, `dangerous replay ${index} modified Object.prototype`)
  }
})

await test('poisoned component config and default overrides enter recovery state', async () => {
  localStorage.clear()
  const baselineStore = await freshStore('poisoned-baseline')
  const baseline = clone(baselineStore.getState().document)
  const revision = baselineStore.getState().revision
  const poisonedDocuments = []

  const objectText = clone(baseline)
  objectText.components['comp-list-summary'].config.text = { evil: 1 }
  poisonedDocuments.push(objectText)

  const invalidTextStyle = clone(baseline)
  invalidTextStyle.components['comp-list-summary'].config.style = 'display'
  poisonedDocuments.push(invalidTextStyle)

  const missingTextStyle = clone(baseline)
  delete missingTextStyle.components['comp-list-summary'].config.style
  poisonedDocuments.push(missingTextStyle)

  const foreignConfigKey = clone(baseline)
  foreignConfigKey.components['comp-list-summary'].config.evil = true
  poisonedDocuments.push(foreignConfigKey)

  const invalidOverride = clone(baseline)
  invalidOverride.screenScenarios['scenario-list-loading'].componentOverrides[0].override = {
    value: 'not valid for text',
  }
  poisonedDocuments.push(invalidOverride)

  const invalidCommonType = clone(baseline)
  invalidCommonType.components['comp-list-summary'].common.visible = 'yes'
  poisonedDocuments.push(invalidCommonType)

  const foreignCommonKey = clone(baseline)
  foreignCommonKey.components['comp-list-summary'].common.evil = true
  poisonedDocuments.push(foreignCommonKey)

  const invalidTrigger = clone(baseline)
  invalidTrigger.events['event-save-task'].trigger.type = 'hover'
  poisonedDocuments.push(invalidTrigger)

  const invalidAction = clone(baseline)
  invalidAction.events['event-save-task'].actions = [{ type: 'unknown', value: true }]
  poisonedDocuments.push(invalidAction)

  const foreignActionKey = clone(baseline)
  foreignActionKey.events['event-save-task'].actions[0].evil = true
  poisonedDocuments.push(foreignActionKey)

  const invalidApiMethod = clone(baseline)
  invalidApiMethod.apiOperations['poison-api'] = {
    id: 'poison-api',
    screenId: 'screen-edit',
    name: 'Poison',
    method: 'TELEPORT',
    path: '/poison',
    requestBindings: [],
    successStateId: null,
    errorStateId: null,
  }
  poisonedDocuments.push(invalidApiMethod)

  const invalidBindingPath = clone(baseline)
  invalidBindingPath.apiOperations['poison-api'] = {
    id: 'poison-api',
    screenId: 'screen-edit',
    name: 'Poison',
    method: 'POST',
    path: '/poison',
    requestBindings: [{ componentId: 'comp-task-title-input', targetPath: { evil: true } }],
    successStateId: null,
    errorStateId: null,
  }
  poisonedDocuments.push(invalidBindingPath)

  const foreignApiKey = clone(baseline)
  foreignApiKey.apiOperations['poison-api'] = {
    id: 'poison-api',
    screenId: 'screen-edit',
    name: 'Poison',
    method: 'POST',
    path: '/poison',
    requestBindings: [],
    successStateId: null,
    errorStateId: null,
    evil: true,
  }
  poisonedDocuments.push(foreignApiKey)

  for (const [index, document] of poisonedDocuments.entries()) {
    localStorage.setItem(storageKey, JSON.stringify({ revision, document }))
    const store = await freshStore(`poisoned-${index}`)
    assert(store.getState().recoveryState !== null, `poisoned document ${index} did not enter recovery`)
  }
})

await test('invalid schema, revision, and entity metadata enter recovery state', async () => {
  memoryStorage.clear()
  const baselineStore = await freshStore('metadata-poison-baseline')
  const baseline = clone(baselineStore.getState().document)
  const validRevision = baselineStore.getState().revision
  const poisonedPayloads = []
  const revisions = ['1', null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]
  for (const revision of revisions) {
    poisonedPayloads.push({ revision, document: clone(baseline) })
  }
  poisonedPayloads.push({ document: clone(baseline) })

  for (const schemaVersion of ['1', null, 1, 2]) {
    const document = clone(baseline)
    document.schemaVersion = schemaVersion
    poisonedPayloads.push({ revision: validRevision, document })
  }
  const missingSchema = clone(baseline)
  delete missingSchema.schemaVersion
  poisonedPayloads.push({ revision: validRevision, document: missingSchema })

  const projectName = clone(baseline)
  projectName.project.name = { invalid: true }
  poisonedPayloads.push({ revision: validRevision, document: projectName })
  const projectUnknown = clone(baseline)
  projectUnknown.project.unknown = true
  poisonedPayloads.push({ revision: validRevision, document: projectUnknown })
  const duplicateScreens = clone(baseline)
  duplicateScreens.project.screenIds.push('screen-list')
  poisonedPayloads.push({ revision: validRevision, document: duplicateScreens })
  const screenName = clone(baseline)
  screenName.screens['screen-list'].name = { invalid: true }
  poisonedPayloads.push({ revision: validRevision, document: screenName })
  const duplicateStates = clone(baseline)
  duplicateStates.screens['screen-list'].scenarioIds.push('scenario-list-loading')
  poisonedPayloads.push({ revision: validRevision, document: duplicateStates })
  const screenKeyMismatch = clone(baseline)
  screenKeyMismatch.screens['screen-list'].id = 'different-screen-id'
  poisonedPayloads.push({ revision: validRevision, document: screenKeyMismatch })
  const componentName = clone(baseline)
  componentName.components['comp-list-summary'].common.description = { invalid: true }
  poisonedPayloads.push({ revision: validRevision, document: componentName })
  const componentKeyMismatch = clone(baseline)
  componentKeyMismatch.components['comp-list-summary'].id = 'different-component-id'
  poisonedPayloads.push({ revision: validRevision, document: componentKeyMismatch })
  const stateDescription = clone(baseline)
  stateDescription.screenScenarios['scenario-list-loading'].description = { invalid: true }
  poisonedPayloads.push({ revision: validRevision, document: stateDescription })
  const legacyStateKind = clone(baseline)
  legacyStateKind.screenScenarios['scenario-list-loading'].kind = 'loading'
  poisonedPayloads.push({ revision: validRevision, document: legacyStateKind })
  const legacyStructuralTitle = clone(baseline)
  legacyStructuralTitle.components['comp-task-list'].config.title = 'Legacy section title'
  poisonedPayloads.push({ revision: validRevision, document: legacyStructuralTitle })
  const dangerousMapKey = clone(baseline)
  Object.defineProperty(dangerousMapKey.components, '__proto__', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {
      ...dangerousMapKey.components['comp-list-summary'],
      id: '__proto__',
    },
  })
  poisonedPayloads.push({ revision: validRevision, document: dangerousMapKey })

  for (const [index, payload] of poisonedPayloads.entries()) {
    memoryStorage.setItem(storageKey, JSON.stringify(payload))
    const store = await freshStore(`metadata-poison-${index}`)
    assert(store.getState().recoveryState !== null, `metadata poison ${index} did not enter recovery`)
    assert(({}).name === undefined && ({}).polluted === undefined, `metadata poison ${index} polluted prototype`)
  }

  const { nextRevision } = await import(moduleUrl(domainBundle, 'max-revision-domain'))
  let rejected = false
  try {
    nextRevision(Number.MAX_SAFE_INTEGER)
  } catch {
    rejected = true
  }
  assert(rejected, 'maximum safe revision was incremented into an unsafe value')
})

await test('screen defaults reuse only suffixes free in both names and routes', async () => {
  memoryStorage.clear()
  const store = await freshStore('screen-default-allocation')
  const { findAvailableScreenDefaults } = await import(moduleUrl(screenNamingBundle, 'screen-defaults'))
  const add = suffix => store.getState().dispatch({
    type: 'addScreen',
    screenId: `screen-generated-${suffix}`,
    rootComponentId: `component-generated-${suffix}`,
    name: `画面 ${suffix}`,
    route: `/screen-${suffix}`,
  })
  add(1)
  add(2)
  add(3)
  store.getState().dispatch({ type: 'removeScreen', screenId: 'screen-generated-2' })
  const defaults = findAvailableScreenDefaults(store.getState().effectiveDocument.screens, 'ja')
  assert(defaults.name === '画面 2', `expected reusable name suffix 2, got ${defaults.name}`)
  assert(defaults.route === '/screen-2', `expected reusable route suffix 2, got ${defaults.route}`)
  store.getState().dispatch({
    type: 'addScreen',
    screenId: 'screen-generated-reused',
    rootComponentId: 'component-generated-reused',
    ...defaults,
  })
  assert(
    store.getState().document.screens['screen-generated-reused']?.route === '/screen-2',
    'reused screen defaults could not be added',
  )
})

await test('domain commands isolate every nested payload from returned documents and change sets', async () => {
  const { sampleProject } = await import(moduleUrl(sampleProjectBundle, 'command-isolation-sample'))
  const {
    applyCommand,
    applyCommandWithoutRevision,
    applyTransaction,
  } = await import(moduleUrl(domainBundle, 'command-isolation-domain'))
  const {
    createComponentSubtreeSnapshot,
    createPasteComponentCommand,
  } = await import(moduleUrl(componentDuplicationBundle, 'command-isolation-copy'))

  function stableFragment(document, select, mutate, label) {
    const before = JSON.stringify(select(document))
    mutate()
    assert(
      JSON.stringify(select(document)) === before,
      `${label} retained a mutable command payload reference`,
    )
  }

  const addCommand = {
    type: 'addComponent',
    componentId: 'comp-isolated-input',
    screenId: 'screen-edit',
    parentId: 'comp-edit-page',
    kind: 'textInput',
    placement: {
      mode: 'overlay',
      anchor: 'topLeft',
      insetX: 'sm',
      insetY: 'sm',
    },
    sizing: defaultSizing(),
    config: {
      kind: 'textInput',
      fieldKey: 'isolatedInput',
      label: 'Isolated input',
      inputType: 'text',
      required: true,
      placeholder: 'Enter a value',
      defaultValue: '',
      validationRules: [
        { id: 'rule-isolated', type: 'required', message: 'Required' },
      ],
    },
  }
  const added = applyCommand(sampleProject, addCommand)
  stableFragment(
    added,
    document => document.components['comp-isolated-input'],
    () => {
      addCommand.placement.insetX = 'lg'
      addCommand.config.validationRules[0].message = 'Mutated'
      addCommand.config.validationRules.push({
        id: 'rule-late',
        type: 'custom',
        description: 'Late rule',
        message: 'Late',
      })
    },
    'addComponent placement or config',
  )

  const updateSpecCommand = {
    type: 'updateComponentSpec',
    componentId: 'comp-task-status-select',
    patch: {
      common: { description: 'Updated select' },
      config: {
        defaultValue: 'in-progress',
        options: [
          { value: 'in-progress', label: 'In progress' },
          { value: 'leo-martins', label: 'Leo Martins' },
          { value: 'unassigned', label: 'Unassigned' },
          { value: 'new-owner', label: 'New owner' },
        ],
      },
    },
  }
  const updatedSpec = applyCommandWithoutRevision(sampleProject, updateSpecCommand)
  stableFragment(
    updatedSpec,
    document => document.components['comp-task-status-select'],
    () => {
      updateSpecCommand.patch.common.description = 'Mutated'
      updateSpecCommand.patch.config.options[0].label = 'Mutated'
      updateSpecCommand.patch.config.options.push({ value: 'late', label: 'Late' })
    },
    'updateComponentSpec patch',
  )

  const createStateCommand = {
    type: 'createScreenState',
    stateId: 'scenario-isolated',
    screenId: 'screen-edit',
    name: 'Isolated',
    description: 'Command-owned state',
    overrides: [{
      target: { type: 'inline', componentId: 'comp-task-name-input' },
      override: { enabled: false, value: 'Initial' },
    }],
  }
  const createdState = applyCommandWithoutRevision(sampleProject, createStateCommand)
  stableFragment(
    createdState,
    document => document.screenScenarios['scenario-isolated'],
    () => {
      createStateCommand.overrides[0].override.value = 'Mutated'
      createStateCommand.overrides.push({
        target: { type: 'inline', componentId: 'comp-edit-summary' },
        override: { visible: false },
      })
    },
    'createScreenState overrides',
  )

  const updateStateCommand = {
    type: 'updateScreenState',
    stateId: 'scenario-edit-saving',
    overrides: [
      { target: { type: 'inline', componentId: 'comp-save-btn' }, override: { enabled: false } },
      { target: { type: 'inline', componentId: 'comp-edit-summary' }, override: { visible: true, text: 'Saving' } },
    ],
  }
  const updatedState = applyCommandWithoutRevision(sampleProject, updateStateCommand)
  stableFragment(
    updatedState,
    document => document.screenScenarios['scenario-edit-saving'].componentOverrides,
    () => {
      updateStateCommand.overrides[1].override.text = 'Mutated'
      updateStateCommand.overrides.shift()
    },
    'updateScreenState overrides',
  )

  const connectEventCommand = {
    type: 'connectEvent',
    eventId: 'event-isolated',
    screenId: 'screen-edit',
    name: 'Isolated event',
    trigger: { type: 'click', target: { type: 'inline', componentId: 'comp-cancel-edit-btn' } },
    actions: [
      { type: 'setScenario', scenarioId: 'scenario-edit-saving' },
      { type: 'navigate', destinationScreenId: 'screen-list' },
    ],
  }
  const connectedEvent = applyCommandWithoutRevision(sampleProject, connectEventCommand)
  stableFragment(
    connectedEvent,
    document => document.events['event-isolated'],
    () => {
      connectEventCommand.trigger.target.componentId = 'comp-save-btn'
      connectEventCommand.actions[0].scenarioId = 'scenario-edit-success'
      connectEventCommand.actions.push({ type: 'callApi', apiOperationId: 'api-save-task' })
    },
    'connectEvent trigger/actions',
  )

  const updateEventCommand = {
    type: 'updateEvent',
    eventId: 'event-save-task',
    name: 'Updated event',
    trigger: { type: 'click', target: { type: 'inline', componentId: 'comp-save-btn' } },
    actions: [
      { type: 'setScenario', scenarioId: 'scenario-edit-success' },
      { type: 'callApi', apiOperationId: 'api-save-task' },
    ],
  }
  const updatedEvent = applyTransaction(sampleProject, [updateEventCommand])
  stableFragment(
    updatedEvent,
    document => document.events['event-save-task'],
    () => {
      updateEventCommand.trigger.target.componentId = 'comp-cancel-edit-btn'
      updateEventCommand.actions[0].scenarioId = 'scenario-edit-error'
      updateEventCommand.actions.length = 0
    },
    'updateEvent transaction payload',
  )

  const bindApiCommand = {
    type: 'bindApiOperation',
    operationId: 'api-isolated',
    screenId: 'screen-edit',
    name: 'Isolated API',
    method: 'POST',
    path: '/isolated',
    requestBindings: [
      { source: { type: 'inline', componentId: 'comp-task-name-input' }, targetPath: 'body.name' },
    ],
    successScenarioId: 'scenario-edit-success',
    errorScenarioId: 'scenario-edit-error',
  }
  const boundApi = applyCommandWithoutRevision(sampleProject, bindApiCommand)
  stableFragment(
    boundApi,
    document => document.apiOperations['api-isolated'],
    () => {
      bindApiCommand.requestBindings[0].targetPath = 'body.mutated'
      bindApiCommand.requestBindings.push({
        source: { type: 'inline', componentId: 'comp-edit-summary' },
        targetPath: 'body.description',
      })
    },
    'bindApiOperation requestBindings',
  )

  const updateApiCommand = {
    type: 'updateApiOperation',
    operationId: 'api-save-task',
    name: 'Updated API',
    method: 'PATCH',
    path: '/api/tasks/{taskId}',
    requestBindings: [
      { source: { type: 'inline', componentId: 'comp-task-status-select' }, targetPath: 'body.status' },
    ],
    successScenarioId: 'scenario-edit-success',
    errorScenarioId: 'scenario-edit-error',
  }
  const updatedApi = applyCommandWithoutRevision(sampleProject, updateApiCommand)
  stableFragment(
    updatedApi,
    document => document.apiOperations['api-save-task'],
    () => {
      updateApiCommand.requestBindings[0].source.componentId = 'comp-task-name-input'
      updateApiCommand.requestBindings.length = 0
    },
    'updateApiOperation requestBindings',
  )

  const snapshot = createComponentSubtreeSnapshot(sampleProject, 'comp-launch-task-card')
  assert(snapshot, 'failed to create paste isolation snapshot')
  let generatedId = 0
  const pasteCommand = createPasteComponentCommand(
    sampleProject,
    snapshot,
    'comp-list-page',
    () => `comp-isolated-copy-${generatedId++}`,
  )
  assert(pasteCommand, 'failed to create paste isolation command')
  const pasted = applyCommandWithoutRevision(sampleProject, pasteCommand)
  const pastedRootId = pasteCommand.componentIdMap[pasteCommand.snapshot.rootComponentId]
  stableFragment(
    pasted,
    document => ({
      root: document.components[pastedRootId],
      components: Object.values(document.components)
        .filter(component => component.id.startsWith('comp-isolated-copy-')),
      scenarios: document.screenScenarios,
    }),
    () => {
      pasteCommand.componentIdMap[pasteCommand.snapshot.rootComponentId] = 'mutated-id'
      pasteCommand.snapshot.components['comp-launch-task-card'].childIds.length = 0
      pasteCommand.snapshot.components['comp-launch-task-image'].config.alt = 'Mutated'
    },
    'pasteComponent snapshot and ID map',
  )

  const duplicateCommand = {
    type: 'duplicateComponent',
    componentId: 'comp-edit-summary',
    componentIdMap: { 'comp-edit-summary': 'comp-isolated-duplicate' },
    eventIdMap: {},
    apiOperationIdMap: {},
  }
  const duplicated = applyCommandWithoutRevision(sampleProject, duplicateCommand)
  stableFragment(
    duplicated,
    document => document.components['comp-isolated-duplicate'],
    () => {
      duplicateCommand.componentIdMap['comp-edit-summary'] = 'mutated-id'
    },
    'duplicateComponent ID map',
  )

  memoryStorage.clear()
  const reviewStore = await freshStore('command-isolation-change-set')
  const review = reviewStore.getState().beginChangeSet('Isolate command payload')
  const reviewCommand = {
    type: 'updateEvent',
    eventId: 'event-save-task',
    name: 'Review event',
    trigger: { type: 'click', target: { type: 'inline', componentId: 'comp-save-btn' } },
    actions: [{ type: 'setScenario', scenarioId: 'scenario-edit-success' }],
  }
  reviewStore.getState().dispatchToChangeSet(review.id, reviewCommand)
  const operationBeforeMutation = JSON.stringify(
    reviewStore.getState().activeChangeSet.operations[0].command,
  )
  const effectiveBeforeMutation = JSON.stringify(
    reviewStore.getState().effectiveDocument.events['event-save-task'],
  )
  reviewCommand.trigger.target.componentId = 'comp-cancel-edit-btn'
  reviewCommand.actions[0].scenarioId = 'scenario-edit-error'
  reviewCommand.actions.push({ type: 'navigate', destinationScreenId: 'screen-list' })
  assert(
    JSON.stringify(reviewStore.getState().activeChangeSet.operations[0].command) ===
      operationBeforeMutation &&
      JSON.stringify(reviewStore.getState().effectiveDocument.events['event-save-task']) ===
        effectiveBeforeMutation,
    'change set retained the caller command or nested payload',
  )
  reviewStore.getState().acceptChangeSet()
  assert(
    reviewStore.getState().document.events['event-save-task'].actions[0].scenarioId ===
      'scenario-edit-success',
    'Accept replayed a caller-mutated command payload',
  )

  const sparseOptions = []
  sparseOptions.length = 1
  let sparseRejected = false
  try {
    applyCommandWithoutRevision(sampleProject, {
      type: 'updateComponentSpec',
      componentId: 'comp-task-status-select',
      patch: { config: { options: sparseOptions } },
    })
  } catch (error) {
    sparseRejected = error?.code === 'INVARIANT_VIOLATION'
  }
  assert(sparseRejected, 'a sparse nested command array bypassed domain validation')

  let unknownPatchRejected = false
  try {
    applyCommandWithoutRevision(sampleProject, {
      type: 'updateComponentSpec',
      componentId: 'comp-list-summary',
      patch: {
        common: { description: 'Valid part' },
        unexpected: { nested: true },
      },
    })
  } catch (error) {
    unknownPatchRejected = error?.code === 'INVARIANT_VIOLATION'
  }
  assert(
    unknownPatchRejected,
    'command cloning removed an unknown patch key before domain validation',
  )

  for (const invalidCommand of [
    { type: 'unsupportedCommand' },
    {
      type: 'addComponent',
      componentId: 'comp-invalid-kind',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'text',
      placement: { mode: 'flow' },
      config: { kind: 'unsupportedConfig' },
    },
    {
      type: 'updateEvent',
      eventId: 'event-save-task',
      name: 'Invalid action',
      trigger: { type: 'click', target: { type: 'inline', componentId: 'comp-save-btn' } },
      actions: [{ type: 'unsupportedAction' }],
    },
    Object.assign([], {
      type: 'duplicateComponent',
      componentId: 'comp-task-status-select',
      componentIdMap: Object.assign([], {
        'comp-task-status-select': 'comp-array-map-copy',
      }),
      eventIdMap: {},
      apiOperationIdMap: {},
    }),
    {
      type: 'updateScreenState',
      stateId: 'scenario-edit-saving',
      overrides: [null],
    },
  ]) {
    let domainError = false
    try {
      applyCommandWithoutRevision(sampleProject, invalidCommand)
    } catch (error) {
      domainError = error?.code === 'INVARIANT_VIOLATION'
    }
    assert(
      domainError,
      `clone validation bypassed the DomainError contract: ${JSON.stringify(invalidCommand)}`,
    )
  }

  memoryStorage.clear()
  const webModule = await import(moduleUrl(toolsBundle, 'command-isolation-webmcp'))
  const webTool = name => webModule.WEBMCP_TOOLS.find(tool => tool.name === name)
  const webBegin = webTool('begin_change_set').execute({
    summary: 'WebMCP payload isolation',
  })
  assert(webBegin.ok, 'WebMCP isolation change set did not start')
  const webInput = {
    changeSetId: webBegin.data.changeSetId,
    expectedRevision: webBegin.data.baseRevision,
    expectedChangeSetVersion: 0,
    componentId: 'comp-task-name-input',
    patch: {
      config: {
        validationRules: [
          { id: 'web-rule', type: 'required', message: 'Web required' },
        ],
      },
    },
  }
  const webUpdate = webTool('update_component_spec').execute(webInput)
  assert(webUpdate.ok, 'WebMCP nested component update failed')
  webInput.patch.config.validationRules[0].message = 'Mutated after WebMCP execute'
  webInput.patch.config.validationRules.push({
    id: 'web-late-rule',
    type: 'custom',
    description: 'Late',
    message: 'Late',
  })
  const webComponent = webTool('get_component').execute({
    componentId: 'comp-task-name-input',
  })
  assert(
    webComponent.data.component.config.validationRules.length === 1 &&
      webComponent.data.component.config.validationRules[0].message === 'Web required',
    'WebMCP retained a caller-owned nested argument in the change set',
  )
})

await test('UI references reconcile after preview, accept, initialization, and undo', async () => {
  memoryStorage.clear()
  const previewStore = await freshStore('ui-reconcile-preview')
  previewStore.getState().setActiveScreen('screen-edit')
  previewStore.getState().setActiveState('scenario-edit-saving')
  previewStore.getState().selectScreenComponent('comp-task-name-input')
  const changeSet = previewStore.getState().beginChangeSet('Remove active screen')
  previewStore.getState().dispatchToChangeSet(changeSet.id, {
    type: 'removeEvent',
    eventId: 'event-open-task-item',
  })
  previewStore.getState().dispatchToChangeSet(changeSet.id, {
    type: 'removeScreen',
    screenId: 'screen-edit',
  })
  let state = previewStore.getState()
  assert(state.ui.activeScreenId === 'screen-list', 'preview retained a removed active screen')
  assert(state.ui.activeStateId === null, 'preview retained an invalid active scenario')
  assert(state.ui.selection === null, 'preview retained a removed component selection')
  assert(state.effectiveDocument.screens[state.ui.activeScreenId], 'preview reconciled to no screen')
  state.acceptChangeSet()
  state = previewStore.getState()
  assert(state.ui.activeScreenId === 'screen-list', 'accept retained a removed active screen')
  assert(state.effectiveDocument.screens[state.ui.activeScreenId], 'accept left the canvas without a screen')

  memoryStorage.clear()
  const undoStore = await freshStore('ui-reconcile-undo')
  undoStore.getState().dispatch({
    type: 'addScreen',
    screenId: 'screen-added',
    rootComponentId: 'comp-added-root',
    name: 'Added',
    route: '/added',
  })
  undoStore.getState().setActiveScreen('screen-added')
  undoStore.getState().undo()
  state = undoStore.getState()
  assert(state.ui.activeScreenId === 'screen-list', 'undo retained the removed added screen')
  assert(state.ui.activeStateId === null, 'undo retained the added screen scenario')
  assert(state.effectiveDocument.screens[state.ui.activeScreenId], 'undo left the canvas without a screen')
  undoStore.getState().redo()
  state = undoStore.getState()
  assert(state.document.screens['screen-added'], 'redo did not restore the added screen')
  assert(state.effectiveDocument.screens[state.ui.activeScreenId], 'redo left the canvas without a screen')

  const stored = JSON.parse(memoryStorage.getItem(storageKey))
  stored.activeScreenId = 'ghost-screen'
  memoryStorage.setItem(storageKey, JSON.stringify(stored))
  const restoredStore = await freshStore('ui-reconcile-initialization')
  assert(restoredStore.getState().ui.activeScreenId === 'screen-list', 'initialization retained a missing screen')
})

await test('duplicateComponent atomically copies subtrees, overrides, and safe config', async () => {
  const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'duplicate-domain'))
  const { sampleProject } = await import(moduleUrl(sampleProjectBundle, 'duplicate-domain-sample'))

  const duplicated = applyCommandWithoutRevision(sampleProject, {
    type: 'duplicateComponent',
    componentId: 'comp-launch-task-card',
    componentIdMap: {
      'comp-launch-task-card': 'copy-task-card',
      'comp-launch-task-status': 'copy-task-status',
      'comp-launch-task-title': 'copy-task-title',
      'comp-launch-task-image': 'copy-task-image',
      'comp-edit-launch-task-btn': 'copy-edit-task',
    },
    eventIdMap: { 'event-edit-launch-task': 'copy-event-edit-launch-task' },
    apiOperationIdMap: {},
  })
  assert(
    duplicated.components['comp-task-list'].childIds.join(',').includes(
      'comp-launch-task-card,copy-task-card',
    ) &&
      duplicated.components['copy-task-card'].parentId === 'comp-task-list' &&
      duplicated.components['copy-task-card'].childIds.join(',') ===
        'copy-task-status,copy-task-title,copy-task-image,copy-edit-task' &&
      duplicated.components['copy-edit-task'].parentId === 'copy-task-card',
    'duplicated subtree hierarchy or immediate-after insertion was incorrect',
  )
  assert(
    JSON.stringify(duplicated.components['copy-task-image'].config) ===
      JSON.stringify(sampleProject.components['comp-launch-task-image'].config) &&
      duplicated.components['copy-edit-task'].config.eventId === 'copy-event-edit-launch-task' &&
      sampleProject.components['comp-edit-launch-task-btn'].config.eventId ===
        'event-edit-launch-task',
    'duplicate did not preserve component config or rewrite the event connection',
  )
  assert(
    duplicated.events['copy-event-edit-launch-task'].trigger.target.componentId ===
      'copy-edit-task',
    'duplicated event target was not rewritten',
  )
  assert(
    duplicated.events['copy-event-edit-launch-task'].actions[0].destinationScreenId ===
      'screen-edit',
    'duplicated event action was not preserved',
  )
  assert(
    Object.keys(duplicated.apiOperations).length === Object.keys(sampleProject.apiOperations).length,
    'unrelated API operations were duplicated',
  )

  for (const invalidCommand of [
    {
      type: 'duplicateComponent',
      componentId: 'comp-edit-page',
      componentIdMap: { 'comp-edit-page': 'copy-page' },
      eventIdMap: {},
      apiOperationIdMap: {},
    },
    {
      type: 'duplicateComponent',
      componentId: 'comp-launch-task-card',
      componentIdMap: { 'comp-launch-task-card': 'copy-task-card' },
      eventIdMap: { 'event-edit-launch-task': 'copy-event-edit-launch-task' },
      apiOperationIdMap: {},
    },
    {
      type: 'duplicateComponent',
      componentId: 'comp-edit-summary',
      componentIdMap: { 'comp-edit-summary': 'comp-list-summary' },
      eventIdMap: {},
      apiOperationIdMap: {},
    },
  ]) {
    let rejected = false
    try {
      applyCommandWithoutRevision(sampleProject, invalidCommand)
    } catch {
      rejected = true
    }
    assert(rejected, `invalid duplicate command was accepted: ${JSON.stringify(invalidCommand)}`)
  }
})

await test('component duplication preserves selection through history and change review', async () => {
  memoryStorage.clear()
  const store = await freshStore('duplicate-selection-history')
  store.getState().selectScreenComponent('comp-launch-task-card')
  assert(
    store.getState().duplicateComponent('comp-launch-task-card', 'Duplicate component'),
    'store duplication failed',
  )
  const parent = store.getState().document.components['comp-task-list']
  const duplicatedRootId = parent.childIds[parent.childIds.indexOf('comp-launch-task-card') + 1]
  assert(
    duplicatedRootId &&
      duplicatedRootId !== 'comp-launch-task-card' &&
      store.getState().ui.selection?.componentId === duplicatedRootId &&
      store.getState().history.length === 1,
    'duplicated root was not inserted, selected, or committed as one history entry',
  )
  store.getState().undo()
  assert(
    store.getState().ui.selection?.componentId === 'comp-launch-task-card' &&
      !store.getState().document.components[duplicatedRootId],
    'duplicate Undo did not restore the source selection',
  )
  store.getState().redo()
  assert(
    store.getState().ui.selection?.componentId === duplicatedRootId &&
      store.getState().document.components[duplicatedRootId],
    'duplicate Redo did not restore the duplicated selection',
  )

  store.getState().resetToSample()
  store.getState().selectScreenComponent('comp-launch-task-card')
  const duplicateReview = store.getState().beginChangeSet('Duplicate subtree')
  assert(
    !store.getState().duplicateComponent('comp-launch-task-card', 'Duplicate component') &&
      duplicateReview.operations.length === 0 &&
      store.getState().ui.selection?.componentId === 'comp-launch-task-card',
    'human duplicate was not blocked during review',
  )
  const { createDuplicateComponentCommand } = await import(
    moduleUrl(componentDuplicationBundle, 'duplicate-review-command')
  )
  let duplicateId = 0
  const duplicateCommand = createDuplicateComponentCommand(
    store.getState().effectiveDocument,
    'comp-launch-task-card',
    () => `review-duplicate-${duplicateId++}`,
  )
  assert(duplicateCommand, 'agent duplicate command could not be created')
  store.getState().dispatchToChangeSet(duplicateReview.id, duplicateCommand)
  const previewRootId = duplicateCommand.componentIdMap['comp-launch-task-card']
  store.getState().selectScreenComponent(previewRootId)
  const changeSet = store.getState().activeChangeSet
  const operation = changeSet?.operations[0]
  const { presentChangeSetOperations } = await import(
    moduleUrl(changeSetPresentationBundle, 'duplicate-presentation')
  )
  const { getChangeSetComponentChanges } = await import(
    moduleUrl(changeSetComponentChangesBundle, 'duplicate-markers')
  )
  const presentation = presentChangeSetOperations(changeSet, 'en')[0]
  const markers = getChangeSetComponentChanges(changeSet)
  assert(
    operation?.command.type === 'duplicateComponent' &&
      changeSet.operations.length === 1 &&
      previewRootId &&
      store.getState().ui.selection?.componentId === previewRootId &&
      presentation.commandType === 'duplicateComponent' &&
      presentation.navigation.componentId === previewRootId &&
      [...markers.statuses.values()].filter(status => status === 'added').length === 1,
    `change set duplication was not a single reviewable operation with added subtree markers: ${JSON.stringify({
      commandType: operation?.command.type,
      operationCount: changeSet?.operations.length,
      previewRootId,
      selectedComponentId: store.getState().ui.selection?.componentId,
      presentationCommandType: presentation.commandType,
      navigationComponentId: presentation.navigation?.componentId,
      impact: presentation.impact,
      addedCount: [...markers.statuses.values()].filter(status => status === 'added').length,
    })}`,
  )

  const reloaded = await freshStore('duplicate-active-reload')
  assert(
    reloaded.getState().activeChangeSet?.operations[0].command.type === 'duplicateComponent' &&
      reloaded.getState().effectiveDocument.components[previewRootId],
    'active duplicate change set did not survive reload',
  )
  reloaded.getState().selectScreenComponent(previewRootId)
  reloaded.getState().rejectChangeSet()
  assert(
    reloaded.getState().ui.selection?.componentId === 'comp-launch-task-card' &&
      !reloaded.getState().effectiveDocument.components[previewRootId],
    'reject did not restore the source selection',
  )

  store.getState().acceptChangeSet()
  assert(
    store.getState().document.components[previewRootId] &&
      store.getState().ui.selection?.componentId === previewRootId,
    'accept did not retain the duplicated subtree selection',
  )
  store.getState().undo()
  assert(
    store.getState().ui.selection?.componentId === 'comp-launch-task-card' &&
      !store.getState().document.components[previewRootId],
    'accepted duplicate Undo did not restore the source selection',
  )
  store.getState().redo()
  assert(
    store.getState().ui.selection?.componentId === previewRootId &&
      store.getState().document.components[previewRootId],
    'accepted duplicate Redo did not restore the duplicated selection',
  )
})

await test('component clipboard snapshots subtrees and pastes with safe target and state rules', async () => {
  memoryStorage.clear()
  const {
    canPasteComponent,
    resolveComponentPasteTarget,
  } = await import(moduleUrl(componentDuplicationBundle, 'component-copy-paste'))
  const store = await freshStore('component-copy-paste')
  store.getState().selectScreenComponent('comp-launch-task-card')
  const documentBeforeCopy = store.getState().document
  assert(store.getState().copyComponent('comp-launch-task-card'), 'component copy failed')
  const clipboard = store.getState().componentClipboard
  assert(
    store.getState().document === documentBeforeCopy &&
      store.getState().history.length === 0 &&
      clipboard?.rootComponentId === 'comp-launch-task-card' &&
    Object.keys(clipboard.components).length === 1 &&
    Object.keys(clipboard.events).length === 1,
    'copy mutated the document/history or captured an incomplete subtree snapshot',
  )

  assert(
    store.getState().dispatch(
      { type: 'removeComponent', componentId: 'comp-launch-task-card' },
      'Remove copied source',
    ),
    'source removal after copy failed',
  )
  store.getState().selectScreenComponent('comp-list-page')
  assert(
    canPasteComponent(
      store.getState().effectiveDocument,
      clipboard,
      'comp-list-page',
    ) &&
      store.getState().pasteComponent('comp-list-page', 'Paste component'),
    'snapshot could not be pasted after its source was deleted',
  )
  const section = store.getState().document.components['comp-list-page']
  const pastedRootId = section.childIds.at(-1)
  const pastedRoot = store.getState().document.components[pastedRootId]
  assert(
    pastedRootId !== 'comp-launch-task-card' &&
      pastedRoot.kind === 'collection' &&
      pastedRoot.childIds.length === 0 &&
      store.getState().ui.selection?.componentId === pastedRootId &&
      store.getState().history.length === 2,
    'Collection paste was not one atomic insertion with a new ID and selection',
  )
  store.getState().undo()
  assert(
    store.getState().ui.selection?.componentId === 'comp-list-page' &&
      !store.getState().document.components[pastedRootId],
    'paste Undo did not restore the destination selection',
  )
  store.getState().redo()
  assert(
    store.getState().ui.selection?.componentId === pastedRootId &&
      store.getState().document.components[pastedRootId],
    'paste Redo did not restore the pasted root selection',
  )

  store.getState().resetToSample()
  store.getState().selectScreenComponent('comp-create-task-btn')
  store.getState().copyComponent('comp-create-task-btn')
  const copiedAcrossScreens = store.getState().componentClipboard
  assert(copiedAcrossScreens, 'dependent clipboard snapshot was not retained')
  store.getState().setActiveScreen('screen-list')
  const pageTarget = resolveComponentPasteTarget(
    store.getState().effectiveDocument,
    'comp-list-page',
  )
  assert(
    pageTarget?.destinationParentId === 'comp-list-page' &&
      pageTarget.position === store.getState().document.components['comp-list-page'].childIds.length,
    'Page root did not resolve to an inside-at-end paste target',
  )
  store.getState().setActiveScreen('screen-edit')
  assert(
    !canPasteComponent(
      store.getState().effectiveDocument,
      copiedAcrossScreens,
      'comp-edit-page',
    ) &&
      !store.getState().pasteComponent('comp-edit-page', 'Paste component'),
    'cross-screen paste silently dropped event dependencies',
  )
  assert(
    !store.getState().copyComponent('comp-edit-page'),
    'Page root was copied even though it cannot be pasted as a child',
  )
  return

  store.getState().resetToSample()
  store.getState().setActiveScreen('screen-edit')
  store.getState().copyComponent('comp-task-title-input')
  store.getState().setActiveScreen('screen-list')
  store.getState().setSelectedComponent('comp-list-page')
  store.getState().pasteComponent('comp-list-page', 'Paste component')
  const pastedInputId = store.getState().ui.selectedComponentId
  assert(
    store.getState().document.components[pastedInputId].config.fieldKey === 'title_copy' &&
      !store.getState().document.apiOperations['api-update-task'].requestBindings.some(
        binding => binding.componentId === pastedInputId,
      ),
    'pasted input did not reuse fieldKey uniqueness or retained an API request binding',
  )

  store.getState().resetToSample()
  store.getState().setSelectedComponent('comp-task-launch-title')
  store.getState().copyComponent('comp-task-launch-title')
  store.getState().setSelectedComponent('comp-task-launch-meta')
  store.getState().pasteComponent('comp-task-launch-meta', 'Paste component')
  const cardChildren = store.getState().document.components['comp-task-launch-card'].childIds
  const metadataIndex = cardChildren.indexOf('comp-task-launch-meta')
  assert(
    metadataIndex >= 0 &&
      cardChildren[metadataIndex + 1] === store.getState().ui.selectedComponentId,
    'non-container paste was not inserted immediately after the destination',
  )
  assert(
    !store.getState().copyComponent('comp-list-page'),
    'Page root was copied even though it cannot be pasted as a child',
  )

  store.getState().setSelectedComponent('comp-task-launch-title')
  store.getState().copyComponent('comp-task-launch-title')
  store.getState().dispatch({
    type: 'addComponent',
    componentId: 'copy-paste-modal',
    screenId: 'screen-list',
    parentId: null,
    kind: 'modal',
    placement: { mode: 'flow' },
    sizing: rootSizing(),
    config: {
      kind: 'modal',
      layout: 'vertical',
      gap: 'md',
      columns: 2,
      justify: 'start',
      align: 'stretch',
      wrap: false,
    },
  }, 'Add modal')
  store.getState().setSelectedComponent('copy-paste-modal')
  assert(
    store.getState().pasteComponent('copy-paste-modal', 'Paste component') &&
      store.getState().document.components['copy-paste-modal'].childIds.length === 1,
    'Modal root did not accept a copied child at the end',
  )

  const invalidClipboard = structuredClone(store.getState().componentClipboard)
  invalidClipboard.projectId = 'another-project'
  store.setState({ componentClipboard: invalidClipboard })
  const historyBeforeInvalidPaste = store.getState().history.length
  assert(
    !store.getState().pasteComponent('comp-list-page', 'Paste component') &&
      store.getState().history.length === historyBeforeInvalidPaste &&
      store.getState().toast?.message.key === 'clipboard.pasteUnavailable',
    'cross-project clipboard was not rejected without mutation',
  )

  store.getState().resetToSample()
  store.getState().setActiveScreen('screen-edit')
  store.getState().copyComponent('comp-actions')
  const staleStateClipboard = store.getState().componentClipboard
  store.getState().dispatch(
    { type: 'removeScreenState', stateId: 'state-edit-saving' },
    'Remove copied state',
  )
  assert(
    !canPasteComponent(
      store.getState().effectiveDocument,
      staleStateClipboard,
      'comp-edit-section',
    ),
    'clipboard with a removed same-screen override state remained pasteable',
  )
})

await test('pasteComponent remains reviewable and selection-safe in active change sets', async () => {
  memoryStorage.clear()
  const store = await freshStore('paste-change-set')
  store.getState().selectScreenComponent('comp-launch-task-card')
  store.getState().copyComponent('comp-launch-task-card')
  store.getState().selectScreenComponent('comp-list-page')
  const pasteReview = store.getState().beginChangeSet('Paste subtree')
  assert(
    !store.getState().pasteComponent('comp-list-page', 'Paste component') &&
      pasteReview.operations.length === 0 &&
      store.getState().ui.selection?.componentId === 'comp-list-page',
    'human paste was not blocked during review',
  )
  const { createPasteComponentCommand } = await import(
    moduleUrl(componentDuplicationBundle, 'paste-review-command')
  )
  let pasteId = 0
  const pasteCommand = createPasteComponentCommand(
    store.getState().effectiveDocument,
    store.getState().componentClipboard,
    'comp-list-page',
    () => `review-paste-${pasteId++}`,
  )
  assert(pasteCommand, 'agent paste command could not be created')
  store.getState().dispatchToChangeSet(pasteReview.id, pasteCommand)
  const pastedRootId = pasteCommand.componentIdMap[pasteCommand.snapshot.rootComponentId]
  store.getState().selectScreenComponent(pastedRootId)
  const changeSet = store.getState().activeChangeSet
  const command = changeSet?.operations[0]?.command
  const { presentChangeSetOperations } = await import(
    moduleUrl(changeSetPresentationBundle, 'paste-presentation')
  )
  const { getChangeSetComponentChanges } = await import(
    moduleUrl(changeSetComponentChangesBundle, 'paste-markers')
  )
  const row = presentChangeSetOperations(changeSet, 'en')[0]
  const markers = getChangeSetComponentChanges(changeSet)
  assert(
    command?.type === 'pasteComponent' &&
      changeSet.operations.length === 1 &&
      pastedRootId &&
      store.getState().ui.selection?.componentId === pastedRootId &&
      row.commandType === 'pasteComponent' &&
      row.navigation?.componentId === pastedRootId &&
      [...markers.statuses.values()].filter(status => status === 'added').length === 1,
    'paste was not represented as one reviewable operation with added subtree markers',
  )

  const reloaded = await freshStore('paste-active-reload')
  assert(
    reloaded.getState().activeChangeSet?.operations[0].command.type === 'pasteComponent' &&
      reloaded.getState().effectiveDocument.components[pastedRootId] &&
      reloaded.getState().componentClipboard === null,
    'active paste did not reload safely or incorrectly persisted the app clipboard',
  )
  reloaded.getState().copyComponent('comp-launch-task-card')
  reloaded.getState().selectScreenComponent(pastedRootId)
  reloaded.getState().rejectChangeSet()
  assert(
    reloaded.getState().ui.selection?.componentId === 'comp-list-page' &&
      !reloaded.getState().effectiveDocument.components[pastedRootId] &&
      reloaded.getState().componentClipboard?.rootComponentId === 'comp-launch-task-card',
    'paste Reject did not restore selection or incorrectly cleared the same-project clipboard',
  )

  store.getState().acceptChangeSet()
  assert(
    store.getState().document.components[pastedRootId] &&
      store.getState().ui.selection?.componentId === pastedRootId &&
      store.getState().componentClipboard?.rootComponentId === 'comp-launch-task-card',
    'paste Accept did not retain the pasted selection or same-project clipboard',
  )
  store.getState().undo()
  assert(
    store.getState().ui.selection?.componentId === 'comp-list-page' &&
      !store.getState().document.components[pastedRootId],
    'accepted paste Undo did not restore the destination selection',
  )
  store.getState().redo()
  assert(
    store.getState().ui.selection?.componentId === pastedRootId &&
      store.getState().document.components[pastedRootId],
    'accepted paste Redo did not restore the pasted selection',
  )
})

await test('normal edit storage failures remain visible and exportable', async () => {
  memoryStorage.clear()
  const store = await freshStore('persistence-unavailable-edit')
  memoryStorage.throwOnSetKeys.add(storageKey)
  store.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Unsaved edit',
  })
  memoryStorage.throwOnSetKeys.delete(storageKey)
  assert(store.getState().document.screens['screen-list'].name === 'Unsaved edit', 'edit was lost in memory')
  assert(store.getState().persistenceUnavailable, 'storage failure was not retained in store state')
  assert(typeof store.getState().exportCurrentData === 'function', 'current JSON export is unavailable')
})

await test('undo and redo allocate monotonically increasing revisions and clear branches', async () => {
  localStorage.clear()
  const store = await freshStore('undo-revision')
  const revisions = [store.getState().revision]

  store.getState().dispatch({ type: 'updateScreen', screenId: 'screen-list', name: 'First edit' })
  revisions.push(store.getState().revision)
  store.getState().dispatch({ type: 'updateScreen', screenId: 'screen-list', name: 'Second edit' })
  revisions.push(store.getState().revision)
  store.getState().undo()
  revisions.push(store.getState().revision)
  store.getState().redo()
  revisions.push(store.getState().revision)
  assert(store.getState().document.screens['screen-list'].name === 'Second edit', 'redo did not restore content')
  store.getState().undo()
  revisions.push(store.getState().revision)
  store.getState().dispatch({ type: 'updateScreen', screenId: 'screen-list', name: 'After undo' })
  revisions.push(store.getState().revision)
  assert(store.getState().redoStack.length === 0, 'new confirmed edit did not clear redo')
  const revisionAfterBranch = store.getState().revision
  store.getState().redo()
  assert(
    store.getState().revision === revisionAfterBranch &&
      store.getState().document.screens['screen-list'].name === 'After undo',
    'redo restored an abandoned branch',
  )

  assert(
    revisions.every((revision, index) => index === 0 || revision > revisions[index - 1]),
    `revisions were not monotonic: ${revisions.join(', ')}`,
  )
})

await test('redo restores human operations and respects review and persistence boundaries', async () => {
  memoryStorage.clear()
  const store = await freshStore('redo-operation-coverage')

  const textBefore = store.getState().document.components['comp-list-summary'].config.text
  const historyBeforeText = store.getState().history.length
  const coalescedText = '12345678901234567890123456789012345678901234567890'
  store.getState().dispatch({
    type: 'updateComponentSpec',
    componentId: 'comp-list-summary',
    patch: { config: { text: coalescedText } },
  }, 'Update text text: comp-list-summary')
  assert(
    store.getState().history.length === historyBeforeText + 1,
    'coalesced text edit created more than one history entry',
  )
  const textRevision = store.getState().revision
  store.getState().undo()
  assert(
    store.getState().document.components['comp-list-summary'].config.text === textBefore,
    'text Undo failed',
  )
  store.getState().redo()
  assert(
    store.getState().document.components['comp-list-summary'].config.text === coalescedText &&
      store.getState().revision > textRevision,
    'text Redo failed or rewound revision',
  )

  const originalGridPosition = store.getState()
    .document.components['comp-list-page'].childIds.indexOf('comp-create-task-btn')
  store.getState().dispatch({
    type: 'moveComponent',
    componentId: 'comp-create-task-btn',
    newParentId: 'comp-list-page',
    position: 0,
  }, 'Move component')
  store.getState().undo()
  assert(
    store.getState().document.components['comp-list-page']
      .childIds[originalGridPosition] === 'comp-create-task-btn',
    'move Undo failed',
  )
  store.getState().redo()
  assert(
    store.getState().document.components['comp-list-page'].childIds[0] === 'comp-create-task-btn',
    'move Redo failed',
  )

  store.getState().selectScreenComponent('comp-list-summary')
  store.getState().dispatch({
    type: 'removeComponent',
    componentId: 'comp-list-summary',
  }, 'Delete component')
  assert(store.getState().ui.selection === null, 'delete did not reconcile selection')
  store.getState().undo()
  assert(store.getState().document.components['comp-list-summary'], 'delete Undo did not restore component')
  store.getState().redo()
  assert(
    store.getState().document.components['comp-list-summary'] === undefined &&
      store.getState().ui.selection === null,
    'delete Redo did not remove component or reconcile selection',
  )

  store.getState().dispatch({
    type: 'addScreen',
    screenId: 'screen-redo',
    rootComponentId: 'component-redo-page',
    name: 'Redo screen',
    route: '/redo',
  }, 'Add screen')
  store.getState().setActiveScreen('screen-redo')
  store.getState().undo()
  assert(
    store.getState().document.screens['screen-redo'] === undefined &&
      store.getState().ui.activeScreenId === 'screen-list',
    'screen Undo did not reconcile active screen',
  )
  store.getState().redo()
  assert(
    store.getState().document.screens['screen-redo'] &&
      store.getState().effectiveDocument.screens[store.getState().ui.activeScreenId],
    'screen Redo failed or left an invalid active screen',
  )

  store.getState().dispatch({
    type: 'createScreenState',
    stateId: 'scenario-redo-extra',
    screenId: 'screen-list',
    name: 'Redo state',
    description: '',
  }, 'Add state')
  store.getState().setActiveScreen('screen-list')
  store.getState().setActiveState('scenario-redo-extra')
  store.getState().undo()
  assert(
    store.getState().document.screenScenarios['scenario-redo-extra'] === undefined &&
      store.getState().ui.activeStateId === null,
    'state Undo did not reconcile active state',
  )
  store.getState().redo()
  assert(
    store.getState().document.screenScenarios['scenario-redo-extra'] &&
      store.getState().ui.activeStateId === null,
    'state Redo failed or left an invalid active state',
  )

  const persistedRevision = store.getState().revision
  const reloaded = await freshStore('redo-operation-reload')
  assert(
    reloaded.getState().revision === persistedRevision &&
      reloaded.getState().document.screenScenarios['scenario-redo-extra'] &&
      reloaded.getState().history.length === 0 &&
      reloaded.getState().redoStack.length === 0,
    'reload did not preserve redone content or reset session history',
  )

  memoryStorage.clear()
  const reviewStore = await freshStore('redo-review-boundaries')
  reviewStore.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Redo candidate',
  })
  reviewStore.getState().undo()
  const redoCandidate = reviewStore.getState().redoStack[0]
  reviewStore.getState().beginChangeSet('Reject without branching confirmed history')
  const reviewRevision = reviewStore.getState().revision
  reviewStore.getState().undo()
  reviewStore.getState().redo()
  assert(
    reviewStore.getState().revision === reviewRevision &&
      reviewStore.getState().redoStack[0]?.id === redoCandidate.id,
    'Undo or Redo changed content during an active change set',
  )
  reviewStore.getState().rejectChangeSet()
  assert(reviewStore.getState().redoStack.length === 1, 'reject cleared valid redo history')
  reviewStore.getState().redo()
  assert(
    reviewStore.getState().document.screens['screen-list'].name === 'Redo candidate',
    'redo failed after rejecting a change set',
  )

  reviewStore.getState().undo()
  const acceptBranch = reviewStore.getState().beginChangeSet('Accept branches history')
  reviewStore.getState().dispatchToChangeSet(acceptBranch.id, {
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Accepted branch',
  })
  reviewStore.getState().acceptChangeSet()
  assert(
    reviewStore.getState().document.screens['screen-list'].name === 'Accepted branch' &&
      reviewStore.getState().redoStack.length === 0,
    'accept did not clear abandoned redo history',
  )
  reviewStore.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Reset candidate',
  })
  reviewStore.getState().undo()
  assert(reviewStore.getState().redoStack.length === 1, 'reset redo seed failed')
  reviewStore.getState().resetToSample()
  assert(
    reviewStore.getState().history.length === 0 &&
      reviewStore.getState().redoStack.length === 0,
    'reset did not clear Undo and Redo history',
  )

  memoryStorage.clear()
  const boundedStore = await freshStore('redo-history-bound')
  for (let index = 0; index < 55; index += 1) {
    boundedStore.getState().dispatch({
      type: 'updateScreen',
      screenId: 'screen-list',
      name: `Bounded edit ${index}`,
    })
  }
  assert(boundedStore.getState().history.length === 50, 'Undo history exceeded its limit')
  for (let index = 0; index < 55; index += 1) boundedStore.getState().undo()
  assert(boundedStore.getState().redoStack.length === 50, 'Redo history exceeded its limit')
  for (let index = 0; index < 50; index += 1) boundedStore.getState().redo()
  assert(
    boundedStore.getState().redoStack.length === 0 &&
      boundedStore.getState().document.screens['screen-list'].name === 'Bounded edit 54',
    'bounded Redo did not restore the newest content',
  )
})

await test('state and screen removal clean API/event references', async () => {
  localStorage.clear()
  const store = await freshStore('cleanup')
  let document = store.getState().document
  const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'cleanup-domain'))

  document = applyCommandWithoutRevision(document, {
    type: 'bindApiOperation',
    operationId: 'edit-api',
    screenId: 'screen-edit',
    name: 'Edit',
    method: 'POST',
    path: '/tasks',
    requestBindings: [{
      source: { type: 'inline', componentId: 'comp-task-name-input' },
      targetPath: 'body.title',
    }],
    successScenarioId: 'scenario-edit-saving',
    errorScenarioId: 'scenario-edit-saving',
  })
  document = applyCommandWithoutRevision(document, {
    type: 'removeScreenState',
    stateId: 'scenario-edit-saving',
  })
  assert(document.apiOperations['edit-api'].successScenarioId === null, 'success scenario was not cleared')
  assert(document.apiOperations['edit-api'].errorScenarioId === null, 'error scenario was not cleared')
  assert(
    document.events['event-save-task'].actions.every(action => action.type !== 'setScenario'),
    'setScenario action was not cleared',
  )

  document = applyCommandWithoutRevision(document, {
    type: 'removeEvent',
    eventId: 'event-open-task-item',
  })
  document = applyCommandWithoutRevision(document, {
    type: 'removeScreen',
    screenId: 'screen-edit',
  })
  assert(document.apiOperations['edit-api'] === undefined, 'screen API operation was not removed')
  assert(
    Object.values(document.components).every(component => component.screenId !== 'screen-edit'),
    'screen components were not removed',
  )
})

await test('non-trigger component removal preserves event actions', async () => {
  memoryStorage.clear()
  const store = await freshStore('event-cleanup')
  const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'event-cleanup-domain'))
  let document = store.getState().document

  document = applyCommandWithoutRevision(document, {
    type: 'connectEvent',
    eventId: 'event-mixed-actions',
    screenId: 'screen-edit',
    name: 'Mixed action event',
    trigger: { type: 'click', target: { type: 'inline', componentId: 'comp-save-btn' } },
    actions: [
      { type: 'setScenario', scenarioId: 'scenario-edit-saving' },
      { type: 'navigate', destinationScreenId: 'screen-list' },
    ],
  })
  document = applyCommandWithoutRevision(document, {
    type: 'updateComponentSpec',
    componentId: 'comp-save-btn',
    patch: { config: { eventId: 'event-mixed-actions' } },
  })
  document = applyCommandWithoutRevision(document, {
    type: 'removeComponent',
    componentId: 'comp-edit-summary',
  })

  const event = document.events['event-mixed-actions']
  assert(event !== undefined, 'non-trigger component removal deleted the event')
  assert(event.actions.some(action => action.type === 'setScenario'), 'setScenario action was removed')
  assert(event.actions.some(action => action.type === 'navigate'), 'navigate action was removed')
  assert(
    document.components['comp-save-btn'].config.eventId === 'event-mixed-actions',
    'button event binding was cleared',
  )
  assert(
    document.screens['screen-edit'].eventIds.includes('event-mixed-actions'),
    'screen event ID was removed',
  )

  document = applyCommandWithoutRevision(document, {
    type: 'removeComponent',
    componentId: 'comp-save-btn',
  })
  assert(document.events['event-mixed-actions'] === undefined, 'trigger removal retained the event')
  assert(
    !document.screens['screen-edit'].eventIds.includes('event-mixed-actions'),
    'trigger removal retained screen event ID',
  )
})

await test('API request bindings clean up on component removal and reload', async () => {
  memoryStorage.clear()
  const store = await freshStore('api-binding-cleanup')
  store.getState().dispatch({ type: 'removeComponent', componentId: 'comp-task-name-input' })
  assert(
    !store.getState().document.apiOperations['api-save-task'].requestBindings.some(
      binding => binding.source.type === 'inline' &&
        binding.source.componentId === 'comp-task-name-input',
    ),
    'API request binding was not cleared when its component was removed',
  )

  const reloadedStore = await freshStore('api-binding-cleanup-reload')
  assert(
    !reloadedStore.getState().document.apiOperations['api-save-task'].requestBindings.some(
      binding => binding.source.type === 'inline' &&
        binding.source.componentId === 'comp-task-name-input',
    ),
    'cleaned API request binding was not persisted',
  )
})

await test('event actions and API bindings reject cross-screen references', async () => {
  localStorage.clear()
  const store = await freshStore('same-screen')
  const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'same-screen-domain'))
  let document = store.getState().document

  document = applyCommandWithoutRevision(document, {
    type: 'bindApiOperation',
    operationId: 'edit-api',
    screenId: 'screen-edit',
    name: 'Edit API',
    method: 'POST',
    path: '/users',
    requestBindings: [],
  })

  await test('direct commands reject invalid entity metadata', async () => {
    memoryStorage.clear()
    const store = await freshStore('direct-metadata-rejection')
    const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'direct-metadata-domain'))
    const invalidCommands = [
      {
        type: 'updateScreen',
        screenId: 'screen-list',
        name: { invalid: true },
      },
      {
        type: 'addScreen',
        screenId: 'invalid-screen',
        rootComponentId: 'invalid-root',
        defaultStateId: 'invalid-default',
        name: 'Invalid',
        route: { invalid: true },
      },
      {
        type: 'updateComponentSpec',
        componentId: 'comp-list-summary',
        patch: { name: { invalid: true } },
      },
      {
        type: 'updateComponentSpec',
        componentId: 'comp-task-title-input',
        patch: { config: { requestBinding: null } },
      },
      {
        type: 'createScreenState',
        stateId: 'invalid-state',
        screenId: 'screen-list',
        name: 'Invalid',
        kind: 'loading',
      },
    ]
    for (const command of invalidCommands) {
      let rejected = false
      try {
        applyCommandWithoutRevision(store.getState().document, command)
      } catch {
        rejected = true
      }
      assert(rejected, `${command.type} accepted invalid metadata`)
    }
  })

  await test('prototype-chain IDs and cross-screen ownership are rejected without pollution', async () => {
    memoryStorage.clear()
    const store = await freshStore('prototype-domain')
    const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'prototype-domain-commands'))
    const beforePrototype = snapshotObjectPrototype()
    const invalidCommands = [
      {
        type: 'addComponent',
        componentId: 'safe-component',
        screenId: 'toString',
        parentId: 'comp-list-page',
        kind: 'text',
        placement: { mode: 'flow' },
        config: { kind: 'text', text: 'Wrong', style: 'body' },
      },
      {
        type: 'addComponent',
        componentId: '__proto__',
        screenId: 'screen-list',
        parentId: 'comp-list-page',
        kind: 'text',
        placement: { mode: 'flow' },
        config: { kind: 'text', text: 'Wrong', style: 'body' },
      },
      {
        type: 'addComponent',
        componentId: 'cross-screen-component',
        screenId: 'screen-edit',
        parentId: 'comp-list-page',
        kind: 'text',
        placement: { mode: 'flow' },
        config: { kind: 'text', text: 'Wrong', style: 'body' },
      },
      {
        type: 'bindApiOperation',
        operationId: 'ghost-api',
        screenId: 'ghost-screen',
        name: 'Ghost',
        method: 'GET',
        path: '/ghost',
      },
      {
        type: 'bindApiOperation',
        operationId: 'prototype',
        screenId: 'screen-list',
        name: 'Prototype',
        method: 'GET',
        path: '/prototype',
      },
    ]
    for (const command of invalidCommands) {
      let rejected = false
      try {
        applyCommandWithoutRevision(store.getState().document, command)
      } catch {
        rejected = true
      }
      assert(rejected, `${command.type} accepted unsafe ID or screen ownership`)
    }
    assertObjectPrototypeUnchanged(beforePrototype, 'direct commands changed Object.prototype')
    assert(({}).name === undefined && ({}).polluted === undefined, 'direct command polluted Object.prototype')
  })

  await test('WebMCP rejects prototype-chain IDs with unchanged operations and prototype', async () => {
    memoryStorage.clear()
    const module = await import(moduleUrl(toolsBundle, 'prototype-webmcp'))
    const byName = name => module.WEBMCP_TOOLS.find(tool => tool.name === name)
    const begin = byName('begin_change_set').execute({ summary: 'Prototype ID checks' })
    assert(begin.ok, 'prototype change set did not begin')
    const common = {
      changeSetId: begin.data.changeSetId,
      expectedRevision: begin.data.baseRevision,
      expectedChangeSetVersion: 0,
    }
    const pending = () => byName('get_pending_change_set').execute({}).data.activeChangeSet
    const beforePrototype = snapshotObjectPrototype()
    const dangerousIds = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty']

    for (const id of dangerousIds) {
      const cases = [
        ['change_screen_structure', {
          ...common,
          operation: 'update',
          screenId: id,
          name: 'Polluted screen',
        }],
        ['update_component_spec', {
          ...common,
          componentId: id,
          patch: { common: { description: 'Polluted component' } },
        }],
        ['upsert_screen_state', {
          ...common,
          operation: 'update',
          stateId: id,
          name: 'Polluted state',
        }],
      ]
      for (const [toolName, input] of cases) {
        const beforeCount = pending().operationCount
        const result = byName(toolName).execute(input)
        assert(!result.ok, `${toolName} accepted dangerous ID ${id}`)
        assert(pending().operationCount === beforeCount, `${toolName} changed ops for ${id}`)
        assert(({}).name === undefined && ({}).polluted === undefined, `${toolName} polluted prototype`)
      }
    }

    const ghostApi = byName('connect_behavior').execute({
      ...common,
      operation: 'bindApi',
      screenId: 'ghost-screen',
      name: 'Ghost API',
      method: 'GET',
      path: '/ghost',
    })
    assert(!ghostApi.ok && pending().operationCount === 0, 'ghost screen API was retained')
    assertObjectPrototypeUnchanged(beforePrototype, 'WebMCP changed Object.prototype')

    const restoredStore = await freshStore('prototype-webmcp-accept')
    assert(restoredStore.getState().activeChangeSet?.operations.length === 0, 'invalid ops persisted')
    restoredStore.getState().acceptChangeSet()
    const reloadedStore = await freshStore('prototype-webmcp-reload')
    assert(reloadedStore.getState().activeChangeSet === null, 'empty validated change set remained active')
    assert(reloadedStore.getState().document.apiOperations['ghost-api'] === undefined, 'ghost API survived reload')
    assertObjectPrototypeUnchanged(beforePrototype, 'accept/reload changed Object.prototype')
  })

  const invalidCommands = [
    {
      type: 'connectEvent',
      eventId: 'cross-state',
      screenId: 'screen-list',
      name: 'Cross state',
      trigger: { type: 'click', target: { type: 'inline', componentId: 'comp-list-summary' } },
      actions: [{ type: 'setState', stateId: 'state-edit-default' }],
    },
    {
      type: 'connectEvent',
      eventId: 'cross-api',
      screenId: 'screen-list',
      name: 'Cross API',
      trigger: {
        type: 'click',
        target: { type: 'inline', componentId: 'comp-list-summary' },
      },
      actions: [{ type: 'callApi', apiOperationId: 'edit-api' }],
    },
    {
      type: 'bindApiOperation',
      operationId: 'cross-binding',
      screenId: 'screen-list',
      name: 'Cross binding',
      method: 'POST',
      path: '/users',
      requestBindings: [{ componentId: 'comp-task-title-input', targetPath: 'name' }],
    },
    {
      type: 'bindApiOperation',
      operationId: 'cross-result-state',
      screenId: 'screen-list',
      name: 'Cross result state',
      method: 'POST',
      path: '/users',
      requestBindings: [],
      successStateId: 'state-edit-default',
    },
  ]

  for (const command of invalidCommands) {
    let rejected = false
    try {
      applyCommandWithoutRevision(document, command)
    } catch {
      rejected = true
    }
    assert(rejected, `${command.type} accepted a cross-screen reference`)
  }
})

await test('WebMCP tool catalog stays within ChatGPT compatibility budgets', async () => {
  localStorage.clear()
  const { WEBMCP_TOOLS } = await import(moduleUrl(toolsBundle, 'schema-budget'))
  const metrics = measureToolSchemas(WEBMCP_TOOLS)
  assert(metrics.toolCount === 11, `expected 11 tools, got ${metrics.toolCount}`)
  assert(metrics.totalBytes <= 35_000, `schema total is ${metrics.totalBytes} bytes`)
  assert(
    metrics.maxIndividualBytes <= 8_000,
    `largest schema is ${metrics.maxIndividualBytes} bytes`,
  )
  assert(metrics.maxDepth <= 8, `schema depth is ${metrics.maxDepth}`)
  assert(metrics.unionBranches <= 30, `schema unions have ${metrics.unionBranches} branches`)
  assert(
    metrics.forbiddenKeywordCount === 0,
    `agent schemas contain ${metrics.forbiddenKeywordCount} risky composition keywords`,
  )
  assert(
    WEBMCP_TOOLS.every(tool => tool.description.length <= 500),
    'a tool description exceeds Chrome compatibility guidance',
  )
  console.log(`WebMCP schema metrics: ${JSON.stringify(metrics)}`)
})

await test('eleven tools register and invalid writes fail without adding operations', async () => {
  localStorage.clear()
  const module = await import(moduleUrl(toolsBundle, 'invalid-writes'))
  const tools = module.WEBMCP_TOOLS
  assert(tools.length === 11, `expected 11 tools, got ${tools.length}`)

  const registered = []
  document.modelContext = {
    registerTool: async tool => {
      registered.push(tool)
      return undefined
    },
  }
  const registrationSucceeded = await module.registerWebMCPTools()
  assert(registrationSucceeded, 'valid Promise registrations reported failure')
  assert(registered.length === 11, `expected 11 registered tools, got ${registered.length}`)

  const byName = name => tools.find(tool => tool.name === name)
  const begin = byName('begin_change_set').execute({ summary: 'Invalid writes' })
  assert(begin.ok, 'begin_change_set failed')
  const common = {
    changeSetId: begin.data.changeSetId,
    expectedRevision: begin.data.baseRevision,
    expectedChangeSetVersion: 0,
  }
  const pending = () => byName('get_pending_change_set').execute({}).data.activeChangeSet
  const invalidCases = [
    ['change_component_structure', {
      ...common,
      operation: 'add',
      screenId: 'screen-list',
      parentId: 'ghost',
      kind: 'text',
      config: { kind: 'text', text: 'Ghost', style: 'body' },
    }],
    ['change_component_structure', { ...common, operation: 'remove', componentId: 'ghost' }],
    ['change_component_structure', {
      ...common,
      operation: 'add',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'text',
      config: { kind: 'text', text: { evil: 1 }, style: 'body' },
    }],
    ['change_component_structure', {
      ...common,
      operation: 'add',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'text',
      config: { kind: 'text', text: 'Bad', style: 'display' },
    }],
    ['change_component_structure', {
      ...common,
      operation: 'add',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'text',
      config: { kind: 'text', text: 'Bad', style: 'body', evil: true },
    }],
    ['change_component_structure', {
      ...common,
      operation: 'add',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'textInput',
      config: {
        kind: 'textInput',
        fieldKey: 'ghost_binding',
        label: 'Ghost',
        inputType: 'text',
        required: false,
        placeholder: '',
        defaultValue: '',
        validationRules: [],
        requestBinding: { componentId: 'ghost', targetPath: 'value' },
      },
    }],
    ['change_component_structure', {
      ...common,
      operation: 'add',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'textInput',
      config: {
        kind: 'textInput',
        fieldKey: 'cross_binding',
        label: 'Cross',
        inputType: 'text',
        required: false,
        placeholder: '',
        defaultValue: '',
        validationRules: [],
        requestBinding: { componentId: 'comp-task-title-input', targetPath: 'value' },
      },
    }],
    ['update_component_spec', { ...common, componentId: 'ghost', patch: { name: 'Ghost' } }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-title',
      patch: { config: { text: { evil: 1 } } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-title',
      patch: { config: { style: 'display' } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-title',
      patch: { config: { evil: true } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-title',
      patch: { config: { requestBinding: { componentId: 'ghost', targetPath: 'value' } } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-task-title-input',
      patch: { config: { requestBinding: { componentId: 'ghost', targetPath: 'value' } } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-task-title-input',
      patch: { config: { requestBinding: { componentId: 'comp-list-title', targetPath: 'value' } } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-title',
      patch: { common: { visible: 'yes' } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-title',
      patch: { common: { evil: true } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-title',
      patch: { common: 'wrong type' },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-title',
      patch: {
        placement: {
          mode: 'viewport',
          anchor: 'center',
          insetX: 'sm',
          insetY: 'none',
        },
      },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-title',
      patch: { name: { invalid: true } },
    }],
    ['change_screen_structure', {
      ...common,
      operation: 'update',
      screenId: 'screen-list',
      name: { invalid: true },
    }],
    ['upsert_screen_state', {
      ...common,
      operation: 'create',
      screenId: 'screen-list',
      name: 'Bad override',
      overrides: {
        'comp-list-title': { value: 'not valid for text' },
      },
    }],
    ['upsert_screen_state', {
      ...common,
      operation: 'create',
      screenId: 'screen-list',
      name: 'Object override',
      overrides: {
        'comp-list-title': { text: { evil: 1 } },
      },
    }],
    ['upsert_screen_state', {
      ...common,
      operation: 'create',
      screenId: 'screen-list',
      name: 'Obsolete payload',
      kind: 'obsolete',
    }],
    ['upsert_screen_state', {
      ...common,
      operation: 'update',
      stateId: 'state-list-default',
      overrides: {
        'comp-list-title': { text: 'default override' },
      },
    }],
    ['connect_behavior', {
      ...common,
      operation: 'connectEvent',
      screenId: 'screen-list',
      name: 'Ghost event',
      trigger: { type: 'click', componentId: 'ghost' },
      actions: [],
    }],
    ['connect_behavior', {
      ...common,
      operation: 'connectEvent',
      screenId: 'screen-list',
      name: 'Hover event',
      trigger: { type: 'hover', componentId: 'comp-list-title' },
      actions: [],
    }],
    ['connect_behavior', {
      ...common,
      operation: 'connectEvent',
      screenId: 'screen-list',
      name: 'Unknown action',
      trigger: { type: 'click', componentId: 'comp-list-title' },
      actions: [{ type: 'unknown', value: true }],
    }],
    ['connect_behavior', {
      ...common,
      operation: 'connectEvent',
      screenId: 'screen-list',
      name: 'Foreign action key',
      trigger: { type: 'click', componentId: 'comp-list-title' },
      actions: [{ type: 'navigate', destinationScreenId: 'screen-edit', evil: true }],
    }],
    ['connect_behavior', {
      ...common,
      operation: 'connectEvent',
      screenId: 'screen-list',
      name: 'Cross screen event',
      trigger: { type: 'click', componentId: 'comp-edit-page' },
      actions: [],
    }],
    ['connect_behavior', {
      ...common,
      operation: 'updateEvent',
      eventId: 'event-save-task',
      name: 'Cross screen update',
      trigger: { type: 'click', componentId: 'comp-list-title' },
      actions: [],
    }],
    ['connect_behavior', {
      ...common,
      operation: 'bindApi',
      screenId: 'screen-list',
      name: 'Ghost API',
      method: 'GET',
      path: '/ghost',
      successStateId: 'ghost',
    }],
    ['connect_behavior', {
      ...common,
      operation: 'bindApi',
      screenId: 'screen-list',
      name: 'Invalid method',
      method: 'TELEPORT',
      path: '/somewhere',
    }],
    ['connect_behavior', {
      ...common,
      operation: 'bindApi',
      screenId: 'screen-list',
      name: 'Invalid target path',
      method: 'POST',
      path: '/users',
      requestBindings: [{ componentId: 'comp-list-title', targetPath: { evil: true } }],
    }],
    ['connect_behavior', {
      ...common,
      operation: 'bindApi',
      screenId: 'screen-list',
      name: 'Cross screen API',
      method: 'POST',
      path: '/cross',
      requestBindings: [{ componentId: 'comp-task-title-input', targetPath: 'name' }],
    }],
    ['connect_behavior', {
      ...common,
      operation: 'updateApi',
      operationId: 'api-update-task',
      name: 'Cross screen API update',
      method: 'POST',
      path: '/users',
      requestBindings: [{ componentId: 'comp-list-title', targetPath: 'name' }],
      successStateId: null,
      errorStateId: null,
    }],
  ]

  for (const [toolName, input] of invalidCases) {
    const before = pending().operationCount
    const result = byName(toolName).execute(input)
    assert(!result.ok && result.error.code, `${toolName} returned a false success`)
    assert(pending().operationCount === before, `${toolName} added an invalid operation`)
  }
})

await test('WebMCP registration awaits failures, aborts partial tools, and leaves UI startup available', async () => {
  const module = await import(moduleUrl(toolsBundle, 'registration-failure'))
  const active = new Set()
  const attempted = []
  const infoMessages = []
  const errorMessages = []
  const originalInfo = console.info
  const originalError = console.error
  console.info = (...values) => infoMessages.push(values)
  console.error = (...values) => errorMessages.push(values)
  try {
    document.modelContext = {
      registerTool: async (tool, options) => {
        attempted.push(tool.name)
        if (attempted.length === 4) throw new Error('Injected registration failure')
        active.add(tool.name)
        options.signal.addEventListener('abort', () => active.delete(tool.name), { once: true })
        return undefined
      },
    }
    const result = await module.registerWebMCPTools()
    assert(result === false, 'partial registration returned a false success')
    assert(attempted.length === 4, 'registration continued after the first rejection')
    assert(active.size === 0, 'AbortSignal did not clean up partially registered tools')
    assert(
      !infoMessages.some(values => String(values[0]).includes('Registered')),
      'registration logged success after rejection',
    )
    assert(
      errorMessages.length === 1 &&
        String(errorMessages[0][0]).includes('human UI remains available'),
      'registration failure was not reported as a visible non-blocking error',
    )

    document.modelContext = undefined
    assert(
      await module.registerWebMCPTools() === false,
      'missing native API did not remain a non-failing feature detection path',
    )
    const mainSource = readFileSync(join(root, 'src/main.tsx'), 'utf8')
    assert(
      mainSource.includes('void registerWebMCPTools()') &&
        mainSource.indexOf('void registerWebMCPTools()') < mainSource.indexOf('createRoot('),
      'UI startup is coupled to awaiting native tool registration',
    )
  } finally {
    console.info = originalInfo
    console.error = originalError
  }
})

await test('representative screen/component/state/event/API writes reach the change set', async () => {
  localStorage.clear()
  const module = await import(moduleUrl(toolsBundle, 'representative-writes'))
  const byName = name => module.WEBMCP_TOOLS.find(tool => tool.name === name)
  const begin = byName('begin_change_set').execute({ summary: 'Representative writes' })
  assert(begin.ok, 'begin_change_set failed')
  const revision = begin.data.baseRevision
  const changeSetId = begin.data.changeSetId
  let version = 0

  const execute = (name, input) => {
    const result = byName(name).execute({
      changeSetId,
      expectedRevision: revision,
      expectedChangeSetVersion: version,
      ...input,
    })
    assert(result.ok, `${name} failed: ${JSON.stringify(result)}`)
    version = result.data.changeSetVersion
    return result
  }
  const pending = () => byName('get_pending_change_set').execute({}).data.activeChangeSet
  assert(
    byName('change_screen_structure').inputSchema.properties.operation.enum.join(',') ===
      'add,update,remove',
    'screen structure tool does not expose add, update, and remove',
  )
  assert(
    byName('connect_behavior').inputSchema.properties.operation.enum.length === 6,
    'behavior tool does not expose create, update, and remove for events and APIs',
  )
  execute('connect_behavior', {
    operation: 'updateEvent',
    eventId: 'event-save-task',
    name: 'Save from form',
    trigger: { type: 'click', target: { type: 'inline', componentId: 'comp-edit-page' } },
    actions: [{ type: 'callApi', apiOperationId: 'api-save-task' }],
  })
  assert(
    byName('get_component').execute({ componentId: 'comp-save-btn' })
      .data.component.config.eventId === null,
    'moving an event trigger retained the old button event reference',
  )
  const context = byName('get_current_screen_context').execute({})
  assert(
    context.ok &&
      Object.keys(context.data.project).sort().join(',') === 'id,name,screenCount',
    'screen context project metadata has an unexpected shape',
  )
  const stateSchema = byName('upsert_screen_state').inputSchema
  assert(
    stateSchema.properties.kind === undefined &&
      !stateSchema.required.includes('kind') &&
      !JSON.stringify(stateSchema).includes('"message"'),
    'WebMCP state schema exposes a removed state kind or message override',
  )
  const componentSchema = byName('change_component_structure').inputSchema
  assert(
    componentSchema.properties.kind.enum.includes('modal') &&
      componentSchema.properties.kind.enum.includes('container') &&
      componentSchema.properties.parentId.type.includes('null') &&
      componentSchema.properties.operation.enum.includes('duplicate') &&
      componentSchema.properties.placement &&
      componentSchema.properties.sizing &&
      byName('change_component_structure').description.includes('modal parentId=null'),
    'WebMCP component structure schema lost compact typed operation guidance',
  )

  const screenResult = execute('change_screen_structure', {
    operation: 'add',
    name: 'Agent screen',
    route: '/agent',
  })
  const addedScreenId = screenResult.data.createdScreenId
  execute('change_screen_structure', { operation: 'update', screenId: addedScreenId, name: 'Updated agent screen' })
  execute('change_screen_structure', { operation: 'remove', screenId: addedScreenId })

  const containerResult = execute('change_component_structure', {
    operation: 'add',
    screenId: 'screen-list',
    parentId: 'comp-list-page',
    kind: 'container',
    placement: { mode: 'flow' },
    sizing: defaultSizing(),
    config: {
      kind: 'container',
      layout: 'horizontal',
      gap: 'sm',
      columns: 2,
      justify: 'center',
      align: 'stretch',
      wrap: true,
    },
  })
  const addedContainerId = containerResult.data.createdComponentId
  execute('update_component_spec', {
    componentId: addedContainerId,
    patch: {
      config: { layout: 'grid', columns: 3, gap: 'lg' },
      placement: {
        mode: 'overlay',
        anchor: 'topRight',
        insetX: 'sm',
        insetY: 'md',
      },
    },
  })
  let addedContainer = byName('get_component').execute({ componentId: addedContainerId })
  assert(
    addedContainer.data.component.config.layout === 'grid' &&
      addedContainer.data.component.config.columns === 3 &&
      addedContainer.data.component.placement.mode === 'overlay',
    'WebMCP layout or placement update did not reach the change set',
  )
  execute('update_component_spec', {
    componentId: addedContainerId,
    patch: {
      sizing: defaultSizing({
        inlineSize: 'content',
        minWidth: 'xs',
        maxWidth: 'md',
      }),
    },
  })
  addedContainer = byName('get_component').execute({ componentId: addedContainerId })
  assert(
    addedContainer.data.component.sizing.inlineSize === 'content' &&
      addedContainer.data.component.sizing.minWidth === 'xs' &&
      addedContainer.data.component.sizing.maxWidth === 'md',
    'WebMCP sizing-only update did not reach the change set',
  )

  const textResult = execute('change_component_structure', {
    operation: 'add',
    screenId: 'screen-list',
    parentId: addedContainerId,
    kind: 'text',
    placement: { mode: 'flow' },
    sizing: defaultSizing(),
    config: { kind: 'text', text: 'Agent text', style: 'heading2' },
  })
  const addedComponentId = textResult.data.createdComponentId
  const duplicateResult = execute('change_component_structure', {
    operation: 'duplicate',
    componentId: addedComponentId,
  })
  assert(
    duplicateResult.data.createdComponentId !== addedComponentId &&
      byName('get_component').execute({
        componentId: duplicateResult.data.createdComponentId,
      }).ok,
    'WebMCP duplicate did not return a readable generated component',
  )
  execute('change_component_structure', {
    operation: 'move',
    componentId: addedComponentId,
    newParentId: 'comp-list-page',
  })
  execute('update_component_spec', {
    componentId: addedComponentId,
    patch: { config: { text: 'Updated text', style: 'caption' } },
  })
  execute('change_component_structure', { operation: 'remove', componentId: addedComponentId })
  execute('change_component_structure', { operation: 'remove', componentId: addedContainerId })

  const modalResult = execute('change_component_structure', {
    operation: 'add',
    screenId: 'screen-list',
    parentId: null,
    kind: 'modal',
    placement: { mode: 'flow' },
    sizing: rootSizing(),
    config: {
      kind: 'modal',
      layout: 'vertical',
      gap: 'md',
      columns: 2,
      justify: 'start',
      align: 'stretch',
      wrap: false,
    },
  })
  const addedModalId = modalResult.data.createdComponentId
  const addedModal = byName('get_component').execute({ componentId: addedModalId })
  assert(
    addedModal.ok &&
      addedModal.data.component.parentId === null &&
      addedModal.data.component.kind === 'modal',
    `WebMCP modal add did not create a readable independent root: ${JSON.stringify(addedModal)}`,
  )
  const invalidNestedModal = byName('change_component_structure').execute({
    changeSetId,
    expectedRevision: revision,
    expectedChangeSetVersion: version,
    operation: 'add',
    screenId: 'screen-list',
    parentId: 'comp-list-page',
    kind: 'modal',
    placement: { mode: 'flow' },
    config: {
      kind: 'modal',
      layout: 'vertical',
      gap: 'md',
      columns: 2,
      justify: 'start',
      align: 'stretch',
      wrap: false,
    },
  })
  assert(
    !invalidNestedModal.ok && pending().operationCount === version,
    'WebMCP accepted a nested modal or changed the change set after rejection',
  )
  execute('change_component_structure', { operation: 'remove', componentId: addedModalId })

  const stateResult = execute('upsert_screen_state', {
    operation: 'create',
    screenId: 'screen-list',
    name: 'Agent state',
  })
  const addedStateId = stateResult.data.stateId
  execute('upsert_screen_state', {
    operation: 'update',
    stateId: addedStateId,
    name: 'Agent error state',
    description: 'Updated',
    overrides: [{
      target: { type: 'inline', componentId: 'comp-list-summary' },
      override: { text: 'Could not load users.' },
    }, {
      target: {
        type: 'collectionItemNode',
        collectionId: 'comp-launch-task-card',
        nodePath: ['task-card-action'],
      },
        override: { enabled: false },
    }],
  })

  const apiResult = execute('connect_behavior', {
    operation: 'bindApi',
    screenId: 'screen-list',
    name: 'List API',
    method: 'GET',
    path: '/users',
    successStateId: addedStateId,
  })
  const addedApiId = apiResult.data.apiId
  const eventResult = execute('connect_behavior', {
    operation: 'connectEvent',
    screenId: 'screen-list',
    name: 'Load list',
    trigger: { type: 'click', target: { type: 'inline', componentId: 'comp-list-summary' } },
    actions: [{ type: 'callApi', apiOperationId: addedApiId }],
  })
  const addedEventId = eventResult.data.eventId
  execute('connect_behavior', {
    operation: 'updateApi',
    operationId: addedApiId,
    name: 'Updated list API',
    method: 'POST',
    path: '/users/search',
    requestBindings: [],
    successStateId: addedStateId,
    errorStateId: null,
  })
  execute('connect_behavior', {
    operation: 'updateEvent',
    eventId: addedEventId,
    name: 'Updated load list',
    trigger: { type: 'click', target: { type: 'inline', componentId: 'comp-list-page' } },
    actions: [{ type: 'callApi', apiOperationId: addedApiId }],
  })
  const updatedContext = byName('get_current_screen_context').execute({})
  const updatedApi = updatedContext.data.activeScreen.apiOperations
    .find(operation => operation.id === addedApiId)
  const updatedEvent = updatedContext.data.activeScreen.events
    .find(event => event.id === addedEventId)
  assert(
    updatedApi?.name === 'Updated list API' &&
      updatedApi.path === '/users/search' &&
      updatedEvent?.name === 'Updated load list' &&
      updatedEvent.actionTypes[0] === 'callApi',
    'behavior updates replaced IDs or lost event/API references',
  )
  execute('connect_behavior', { operation: 'removeEvent', eventId: addedEventId })
  execute('connect_behavior', { operation: 'removeApi', operationId: addedApiId })
  execute('upsert_screen_state', { operation: 'remove', stateId: addedStateId })

  assert(pending().operationCount === version, 'operation count and version diverged')
})

await test('WebMCP supports Definition node edits, partial sizing, and generated result IDs', async () => {
  localStorage.clear()
  const module = await import(moduleUrl(toolsBundle, 'definition-node-and-result-ids'))
  const byName = name => module.WEBMCP_TOOLS.find(tool => tool.name === name)
  const begin = byName('begin_change_set').execute({ summary: 'Edit Definitions and collect IDs' })
  assert(begin.ok, 'Definition edit change set did not begin')
  const common = {
    changeSetId: begin.data.changeSetId,
    expectedRevision: begin.data.baseRevision,
  }
  let version = 0
  const execute = (name, input) => {
    const result = byName(name).execute({
      ...common,
      expectedChangeSetVersion: version,
      ...input,
    })
    assert(result.ok, `${name} failed: ${JSON.stringify(result)}`)
    version = result.data.changeSetVersion
    return result
  }
  const pending = () => byName('get_pending_change_set').execute({}).data.activeChangeSet

  const sizingPatchSchema = byName('update_component_spec')
    .inputSchema.properties.patch.properties.sizing
  const validateSizingPatch = new Ajv2020({ strict: false }).compile(sizingPatchSchema)
  assert(
    validateSizingPatch({ gridSpan: 10 }) &&
      !sizingPatchSchema.required,
    'update_component_spec sizing schema still requires a complete ComponentSizing',
  )

  const screenResult = execute('change_screen_structure', {
    operation: 'add',
    name: 'Generated ID screen',
    route: '/generated-id',
  })
  assert(
    typeof screenResult.data.createdScreenId === 'string' &&
      typeof screenResult.data.createdRootComponentId === 'string' &&
      screenResult.data.createdScreenId !== screenResult.data.createdRootComponentId,
    'screen add result omitted its generated screen or root ID',
  )

  const containerResult = execute('change_component_structure', {
    operation: 'add',
    screenId: 'screen-list',
    parentId: 'comp-list-page',
    kind: 'container',
    placement: { mode: 'flow' },
    sizing: defaultSizing(),
    config: {
      kind: 'container',
      layout: 'grid',
      gap: 'md',
      columns: 12,
      justify: 'start',
      align: 'stretch',
      wrap: false,
    },
  })
  const containerId = containerResult.data.createdComponentId
  assert(
    typeof containerId === 'string' &&
      byName('get_component').execute({ componentId: containerId }).ok,
    'component add result omitted its generated component ID',
  )

  const textResult = execute('change_component_structure', {
    operation: 'add',
    screenId: 'screen-list',
    parentId: containerId,
    kind: 'text',
    placement: { mode: 'flow' },
    sizing: defaultSizing(),
    config: { kind: 'text', text: 'Generated ID source', style: 'body' },
  })
  const textId = textResult.data.createdComponentId
  const partialSizingResult = execute('update_component_spec', {
    componentId: textId,
    patch: { sizing: { gridSpan: 10 } },
  })
  assert(
    partialSizingResult.ok &&
      byName('get_component').execute({ componentId: textId }).data.component.sizing.gridSpan === 10 &&
      byName('get_component').execute({ componentId: textId }).data.component.sizing.inlineSize === 'auto' &&
      byName('get_component').execute({ componentId: textId }).data.component.sizing.minWidth === 'none' &&
      byName('get_component').execute({ componentId: textId }).data.component.sizing.maxWidth === 'none' &&
      byName('get_component').execute({ componentId: textId }).data.component.sizing.grow === 0 &&
      byName('get_component').execute({ componentId: textId }).data.component.sizing.shrink === 'allow',
    'partial sizing was not merged over the current complete sizing',
  )

  const duplicateComponentResult = execute('change_component_structure', {
    operation: 'duplicate',
    componentId: textId,
  })
  assert(
    duplicateComponentResult.data.createdComponentId !== textId &&
      byName('get_component').execute({
        componentId: duplicateComponentResult.data.createdComponentId,
      }).ok,
    'component duplicate result omitted its generated root component ID',
  )

  const definitionNodeResult = execute('manage_component_definition', {
    operation: 'updateNode',
    definitionId: 'shared/task-card',
    nodePath: ['task-card-action'],
    patch: {
      common: { description: 'Open a task from WebMCP' },
      config: { label: 'Open task now' },
      sizing: defaultSizing({ gridSpan: 2 }),
    },
  })
  const updatedDefinitionNode = byName('get_component').execute({
    target: {
      type: 'collectionItemNode',
      collectionId: 'comp-launch-task-card',
      nodePath: ['task-card-action'],
    },
  })
  assert(
    definitionNodeResult.data.definitionId === 'shared/task-card' &&
      JSON.stringify(definitionNodeResult.data.nodePath) ===
        JSON.stringify(['task-card-action']) &&
      updatedDefinitionNode.data.component.common.description ===
        'Open a task from WebMCP' &&
      updatedDefinitionNode.data.component.config.kind === 'button',
    `Definition-owned node update was not visible through its Collection target: ${JSON.stringify(updatedDefinitionNode)}`,
  )
  const definitionDetail = byName('get_current_screen_context').execute({
    include: 'definition',
    detailId: 'shared/task-card',
  })
  assert(
    definitionDetail.data.detail.value.nodes['task-card-action'].config.label === 'Open task now',
    'Definition-owned config update was not visible in Definition detail',
  )
  const operationCountBeforeInvalidPath = pending().operationCount
  const invalidPath = byName('manage_component_definition').execute({
    ...common,
    expectedChangeSetVersion: version,
    operation: 'updateNode',
    definitionId: 'shared/task-card',
    nodePath: ['task-card-title', 'task-card-action'],
    patch: { common: { description: 'Invalid path' } },
  })
  assert(
    !invalidPath.ok &&
      invalidPath.error.code === 'INVALID_REFERENCE' &&
      pending().operationCount === operationCountBeforeInvalidPath,
    'Definition node update accepted a path outside the owned parent-child chain',
  )

  const createdDefinition = execute('manage_component_definition', {
    operation: 'create',
    name: 'Generated Definition',
  })
  assert(
    typeof createdDefinition.data.createdDefinitionId === 'string' &&
      typeof createdDefinition.data.createdNodeId === 'string' &&
      byName('get_current_screen_context').execute({}).data.definitions.some(
        definition => definition.id === createdDefinition.data.createdDefinitionId,
      ),
    'Definition create result omitted its generated Definition or root node ID',
  )
  const duplicatedDefinition = execute('manage_component_definition', {
    operation: 'duplicate',
    definitionId: createdDefinition.data.createdDefinitionId,
  })
  assert(
    duplicatedDefinition.data.createdDefinitionId !== createdDefinition.data.createdDefinitionId &&
      typeof duplicatedDefinition.data.createdNodeId === 'string',
    'Definition duplicate result omitted its generated Definition or root node ID',
  )
  const updatedDefinition = execute('manage_component_definition', {
    operation: 'updateMeta',
    definitionId: createdDefinition.data.createdDefinitionId,
    name: 'Generated Definition Updated',
    description: 'Updated through WebMCP',
  })
  assert(
    updatedDefinition.data.definitionId === createdDefinition.data.createdDefinitionId,
    'Definition metadata update replaced the Definition ID',
  )
  execute('manage_component_definition', {
    operation: 'publishStringProp',
    definitionId: createdDefinition.data.createdDefinitionId,
    key: 'description',
    name: 'Description',
    nodePath: [createdDefinition.data.createdNodeId],
    field: 'common.description',
  })
  const variantResult = execute('manage_component_definition', {
    operation: 'addVariant',
    definitionId: createdDefinition.data.createdDefinitionId,
    name: 'Compact',
    propertyKey: 'density',
    propertyValue: 'compact',
  })
  assert(
    typeof variantResult.data.createdVariantId === 'string' &&
      byName('get_current_screen_context').execute({}).data.definitions.find(
        definition => definition.id === createdDefinition.data.createdDefinitionId,
      ).variantCount === 1,
    'Definition addVariant result omitted its generated Variant ID',
  )

  const instanceResult = execute('manage_definition_instance', {
    operation: 'add',
    screenId: 'screen-list',
    parentId: 'comp-list-page',
    definitionId: createdDefinition.data.createdDefinitionId,
  })
  assert(
    byName('get_component').execute({
      componentId: instanceResult.data.createdInstanceId,
    }).ok,
    'Definition Instance add result omitted its generated instance ID',
  )
  const updatedInstance = execute('manage_definition_instance', {
    operation: 'update',
    componentId: instanceResult.data.createdInstanceId,
    variantId: variantResult.data.createdVariantId,
    props: { description: 'Instance description' },
    placement: { mode: 'flow' },
    sizing: defaultSizing(),
  })
  const updatedInstanceDetail = byName('get_component').execute({
    componentId: instanceResult.data.createdInstanceId,
  })
  assert(
    updatedInstance.data.instanceId === instanceResult.data.createdInstanceId &&
      updatedInstanceDetail.data.component.props.description === 'Instance description' &&
      updatedInstanceDetail.data.component.variantId === variantResult.data.createdVariantId,
    'Definition Instance update replaced its ID or lost props/Variant',
  )
  execute('manage_component_definition', {
    operation: 'remove',
    definitionId: duplicatedDefinition.data.createdDefinitionId,
  })

  const stateResult = execute('upsert_screen_state', {
    operation: 'create',
    screenId: 'screen-list',
    name: 'Generated state',
  })
  assert(
    typeof stateResult.data.stateId === 'string',
    'state create result omitted its generated state ID',
  )
  const eventResult = execute('connect_behavior', {
    operation: 'connectEvent',
    screenId: 'screen-list',
    name: 'Generated event',
    trigger: { type: 'click', target: { type: 'inline', componentId: textId } },
    actions: [],
  })
  assert(
    typeof eventResult.data.eventId === 'string',
    'event create result omitted its generated event ID',
  )
  const apiResult = execute('connect_behavior', {
    operation: 'bindApi',
    screenId: 'screen-list',
    name: 'Generated API',
    method: 'GET',
    path: '/generated',
  })
  assert(
    typeof apiResult.data.apiId === 'string' &&
      typeof apiResult.data.operationId === 'string' &&
      apiResult.data.apiId !== apiResult.data.operationId,
    'API create result omitted its generated API ID or replaced the change operation ID',
  )

  const extracted = execute('manage_definition_instance', {
    operation: 'extract',
    componentId: textId,
    name: 'Extracted Definition',
  })
  assert(
    typeof extracted.data.createdDefinitionId === 'string' &&
      typeof extracted.data.createdInstanceId === 'string',
    'Definition extraction result omitted its generated Definition or replacement Instance ID',
  )
  const detached = execute('manage_definition_instance', {
    operation: 'detach',
    componentId: extracted.data.createdInstanceId,
  })
  assert(
    detached.data.createdComponentIds.length > 0 &&
      detached.data.createdComponentIds.every(id => typeof id === 'string'),
    'Definition detach result omitted generated inline component IDs',
  )
  assert(pending().operationCount === version, 'generated-ID operations diverged from version')
})

await test('Definition node ownership rejects nested Definition Instance boundaries', async () => {
  const { resolveOwnedDefinitionInlineNodeAtPath } = await import(
    moduleUrl(definitionEditingBundle, 'owned-definition-paths')
  )
  const definition = {
    id: 'outer',
    rootNodeId: 'root',
    nodes: {
      root: { nodeType: 'inline', id: 'root', parentId: null, childIds: ['nested'] },
      nested: {
        nodeType: 'definitionInstance',
        id: 'nested',
        parentId: 'root',
        childIds: [],
      },
    },
  }
  let nestedBoundaryError
  try {
    resolveOwnedDefinitionInlineNodeAtPath(definition, ['nested', 'inner-root'])
  } catch (error) {
    nestedBoundaryError = error
  }
  assert(
    nestedBoundaryError?.code === 'INVALID_ARGUMENT' &&
      nestedBoundaryError.message.includes('nested Definition Instance'),
    'Definition-owned path resolution crossed a nested Definition Instance boundary',
  )
})

await test('Shared component editor stays visual, view-aware, and bounded', async () => {
  const styles = readFileSync(
    join(root, 'src/features/definitions/DefinitionEditor.module.css'),
    'utf8',
  )
  const editorSource = readFileSync(
    join(root, 'src/features/definitions/DefinitionEditor.tsx'),
    'utf8',
  )
  const inspectorSource = readFileSync(
    join(root, 'src/features/definitions/DefinitionInspector.tsx'),
    'utf8',
  )
  const appSource = readFileSync(join(root, 'src/app/App.tsx'), 'utf8')
  const canvasSource = readFileSync(
    join(root, 'src/features/canvas/Canvas.tsx'),
    'utf8',
  )
  const messagesSource = readFileSync(join(root, 'src/i18n/messages.ts'), 'utf8')
  assert(
    styles.includes('grid-template-columns: minmax(180px, 220px) minmax(0, 1fr)') &&
      styles.includes('overflow-x: hidden;') &&
      styles.includes('text-overflow: ellipsis;') &&
      editorSource.includes('data-definition-preview') &&
      editorSource.includes('data-definition-preview-node') === false &&
      inspectorSource.includes('data-definition-inspector') &&
      inspectorSource.includes('nestedReadOnly') &&
      inspectorSource.includes('activeChangeSet') &&
      appSource.includes("editorView === 'definition'") &&
      appSource.includes('<DefinitionInspector') &&
      canvasSource.includes('export function ResolvedDefinitionPreview') &&
      canvasSource.includes('definitionEditorNodeSelection') === false &&
      messagesSource.includes("'editor.definitionView': 'Shared components'") &&
      messagesSource.includes("'editor.definitionView': '共通コンポーネント'"),
    'Shared component editor lost visual preview, view-aware Inspector, lock, naming, or geometry contracts',
  )
})

await test('WebMCP reads are compact, discoverable, and serializable', async () => {
  localStorage.clear()
  const module = await import(moduleUrl(toolsBundle, 'agent-read-surfaces'))
  const byName = name => module.WEBMCP_TOOLS.find(tool => tool.name === name)
  const initialContext = byName('get_current_screen_context').execute({})
  const instanceDetail = byName('get_component').execute({
    componentId: 'comp-list-header',
  })
  assert(initialContext.ok, 'initial screen context failed')
  const initialBytes = Buffer.byteLength(JSON.stringify(initialContext))
  assert(
    initialContext.data.documentView === 'effective' &&
      initialContext.data.activeScreen.id === 'screen-list' &&
      initialContext.data.activeScreen.componentOutline.length > 1 &&
      Array.isArray(initialContext.data.activeScreen.states) &&
      Array.isArray(initialContext.data.activeScreen.events) &&
      Array.isArray(initialContext.data.activeScreen.apiOperations) &&
      instanceDetail.data.canonicalTarget.type === 'definitionNode' &&
      instanceDetail.data.hierarchy.length > 0 &&
      initialBytes <= 8_000,
    `default active screen summary is incomplete or ${initialBytes} bytes`,
  )
  console.log(`WebMCP fresh TaskFlow context: ${initialBytes} bytes`)
  const begin = byName('begin_change_set').execute({ summary: 'Read surface review' })
  assert(begin.ok, 'read surface change set failed to begin')
  let version = begin.data.changeSetVersion
  const write = input => {
    const result = byName('connect_behavior').execute({
      changeSetId: begin.data.changeSetId,
      expectedRevision: begin.data.baseRevision,
      expectedChangeSetVersion: version,
      ...input,
    })
    assert(result.ok, `read fixture write failed: ${JSON.stringify(result)}`)
    version = result.data.changeSetVersion
  }
  write({
    operation: 'connectEvent',
    screenId: 'screen-list',
    name: 'Empty behavior',
    trigger: { type: 'click', target: { type: 'inline', componentId: 'comp-list-summary' } },
    actions: [],
  })
  write({
    operation: 'bindApi',
    screenId: 'screen-list',
    name: 'Incomplete API',
    method: 'GET',
    path: '/incomplete',
    requestBindings: [],
  })

  const context = byName('get_current_screen_context').execute({})
  const pending = byName('get_pending_change_set').execute({})
  assert(
    context.ok &&
      context.data.activeChangeSet.operationCount === 2 &&
      context.data.activeChangeSet.baseDocument === undefined &&
      context.data.activeChangeSet.operations === undefined,
    'context duplicates raw change set document or operations',
  )
  assert(
    pending.ok &&
      pending.data.activeChangeSet.baseDocument === undefined &&
      pending.data.activeChangeSet.operations === undefined &&
      pending.data.activeChangeSet.operationSummaries.length === 2 &&
      pending.data.activeChangeSet.operationSummaries.every(operation =>
        operation.source === 'agent' &&
        typeof operation.action === 'string' &&
        Array.isArray(operation.changes) &&
        operation.changes.every(change =>
          typeof change.before === 'string' &&
          typeof change.after === 'string')
      ),
    'pending change set exposed commands or omitted compact review summaries',
  )
  assert(
    JSON.parse(JSON.stringify(context)).ok && JSON.parse(JSON.stringify(pending)).ok,
    'WebMCP read results are not JSON serializable',
  )
  for (const tool of module.WEBMCP_TOOLS) {
    assert(
      tool.description.includes('get_current_screen_context') ||
        tool.name === 'get_current_screen_context',
      `${tool.name} does not lead the agent to the workflow entry point`,
    )
    if (!tool.annotations?.readOnlyHint) {
      assert(
        tool.description.includes('Only a human can Accept or Reject'),
        `${tool.name} does not explain the human-only review boundary`,
      )
    }
  }
})

await test('WebMCP default context stays bounded for a complex workspace', async () => {
  memoryStorage.clear()
  const store = await freshStore('complex-context-seed')
  for (let index = 0; index < 120; index += 1) {
    store.getState().dispatch({
      type: 'addComponent',
      componentId: `complex-component-${index}`,
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'text',
      placement: { mode: 'flow' },
      sizing: defaultSizing(),
      config: {
        kind: 'text',
        text: `Complex workspace component ${index}`,
        style: 'body',
      },
    }, `Add complex component ${index}`)
  }
  const review = store.getState().beginChangeSet('Large pending proposal')
  for (let index = 0; index < 55; index += 1) {
    store.getState().dispatchToChangeSet(review.id, {
      type: 'updateComponentSpec',
      componentId: 'complex-component-0',
      patch: { common: { description: `Pending summary ${index}` } },
    })
  }
  const module = await import(moduleUrl(toolsBundle, 'complex-context'))
  const tool = name => module.WEBMCP_TOOLS.find(candidate => candidate.name === name)
  const context = tool('get_current_screen_context').execute({})
  const continued = tool('get_current_screen_context').execute({
    index: 'components',
    offset: context.data.activeScreen.nextOffsets.components,
  })
  const pendingFirst = tool('get_pending_change_set').execute({})
  const pendingSecond = tool('get_pending_change_set').execute({
    offset: pendingFirst.data.activeChangeSet.nextOffset,
  })
  const bytes = Buffer.byteLength(JSON.stringify(context))
  assert(
    context.ok &&
      context.data.activeScreen.counts.components > 120 &&
      context.data.activeScreen.componentOutline.length === 60 &&
      context.data.activeScreen.truncated.componentOutline &&
      continued.data.page.offset === 60 &&
      continued.data.activeScreen.componentOutline.length > 0 &&
      !continued.data.activeScreen.componentOutline.some(component =>
        context.data.activeScreen.componentOutline.some(first => first.id === component.id)) &&
      pendingFirst.data.activeChangeSet.operationSummaries.length === 50 &&
      pendingFirst.data.activeChangeSet.nextOffset === 50 &&
      pendingSecond.data.activeChangeSet.operationSummaries.length === 5 &&
      pendingSecond.data.activeChangeSet.nextOffset === null &&
      bytes <= 15_000,
    `complex default context was not bounded: ${bytes} bytes`,
  )
  console.log(`WebMCP complex context: ${bytes} bytes`)
})

await test('TaskFlow sample is a complete two-screen task specification', async () => {
  const { sampleProject } = await import(moduleUrl(sampleProjectBundle, 'taskflow-completeness'))
  const { validateInvariants } = await import(moduleUrl(invariantsBundle, 'taskflow-completeness'))
  const { selectScreenFlow } = await import(moduleUrl(screenFlowBundle, 'taskflow-completeness'))
  const { effectiveComponent } = await import(moduleUrl(selectorsBundle, 'taskflow-completeness'))

  validateInvariants(sampleProject)
  assert(
    sampleProject.project.name === 'TaskFlow' &&
      sampleProject.screens['screen-list'].name === 'Task List' &&
      sampleProject.screens['screen-list'].route === '/tasks' &&
      sampleProject.screens['screen-edit'].name === 'Edit Task' &&
      sampleProject.screens['screen-edit'].route === '/tasks/:taskId',
    'TaskFlow project or screen story is incomplete',
  )
  assert(
    [...new Set(Object.values(sampleProject.components)
      .filter(component => component.nodeType === 'inline')
      .map(component => component.kind))]
      .sort().join(',') ===
      ['button', 'collection', 'container', 'image', 'link', 'modal', 'page', 'select', 'text', 'textInput']
        .sort().join(','),
    'TaskFlow does not exercise all canonical component kinds',
  )
  assert(
    !Object.values(sampleProject.components).some(component =>
      component.nodeType === 'inline' &&
        component.config.kind === 'select' &&
        component.config.fieldKey === 'priority'
    ),
    'Priority must remain absent until the WebMCP demo',
  )
  for (const component of Object.values(sampleProject.components)) {
    if (
      component.nodeType !== 'inline' ||
      component.config.kind !== 'button' ||
      !component.common.enabled
    ) continue
    const event = sampleProject.events[component.config.eventId]
    assert(
      event?.trigger.target.type === 'inline' &&
        event.trigger.target.componentId === component.id &&
        event.actions.length > 0,
      `enabled button ${component.id} is not connected to an actionable event`,
    )
  }
  assert(
    Object.values(sampleProject.events).every(event => event.actions.length > 0),
    'TaskFlow contains an event without actions',
  )
  for (const operation of Object.values(sampleProject.apiOperations)) {
    assert(
      (!operation.successScenarioId ||
        sampleProject.screenScenarios[operation.successScenarioId]?.screenId ===
          operation.screenId) &&
        (!operation.errorScenarioId ||
          sampleProject.screenScenarios[operation.errorScenarioId]?.screenId ===
            operation.screenId),
      `API ${operation.id} has a cross-screen outcome scenario`,
    )
    const bindingKeys = operation.requestBindings.map(binding =>
      `${JSON.stringify(binding.source)}:${binding.targetPath}`
    )
    assert(
      new Set(bindingKeys).size === bindingKeys.length &&
        operation.requestBindings.every(binding =>
          binding.source.type !== 'inline' ||
            sampleProject.components[binding.source.componentId]?.screenId === operation.screenId
        ),
      `API ${operation.id} has duplicate or cross-screen request bindings`,
    )
  }
  const titleRules =
    sampleProject.components['comp-task-name-input'].config.validationRules
  assert(
    titleRules.some(rule => rule.type === 'required'),
    'Task title validation does not require a value',
  )
  assert(
    sampleProject.screens['screen-edit'].modalComponentIds.join(',') === 'comp-discard-modal' &&
      sampleProject.components['comp-discard-modal'].parentId === null &&
      sampleProject.screenScenarios['scenario-edit-confirm-exit'].componentOverrides.some(
        entry => entry.target.type === 'inline' &&
          entry.target.componentId === 'comp-discard-modal' &&
          entry.override.visible === true,
      ),
    'discard confirmation is not modeled as an independent modal scenario',
  )

  const flow = selectScreenFlow(sampleProject, 'en')
  const listToEdit = flow.edges.find(edge =>
    edge.source.screenId === 'screen-list' && edge.target.screenId === 'screen-edit'
  )
  const editToList = flow.edges.find(edge =>
    edge.source.screenId === 'screen-edit' && edge.target.screenId === 'screen-list'
  )
  assert(
    listToEdit?.transitions.length === 2 &&
      listToEdit.transitions.some(transition => transition.eventId === 'event-edit-launch-task') &&
      listToEdit.transitions.some(transition => transition.eventId === 'event-open-task-item') &&
      editToList?.transitions.length === 1 &&
      editToList.transitions[0].eventId === 'event-discard-task-changes',
    'TaskFlow navigation edges do not explain edit/discard paths',
  )
  assert(
    sampleProject.screens['screen-list'].modalComponentIds.includes('comp-create-modal') &&
      sampleProject.events['event-open-create'].actions[0].scenarioId ===
        'scenario-list-create' &&
      sampleProject.events['event-submit-create'].actions.some(
        action => action.type === 'callApi' && action.apiOperationId === 'api-create-task',
      ) &&
      sampleProject.apiOperations['api-create-task'].method === 'POST' &&
      sampleProject.apiOperations['api-create-task'].requestBindings[0].source.componentId ===
        'comp-create-title-input',
    'Create task does not use its own modal form and POST operation',
  )
})

await test('TaskFlow reset is explicit and preserves existing saved projects by default', async () => {
  memoryStorage.clear()
  const editedStore = await freshStore('taskflow-reset-existing')
  editedStore.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'My saved task board',
  }, 'Rename saved project screen')
  const reloaded = await freshStore('taskflow-reset-existing-reload')
  assert(
    reloaded.getState().document.screens['screen-list'].name === 'My saved task board',
    'loading the updated sample silently replaced existing local data',
  )

  const rejectedReview = reloaded.getState().beginChangeSet('Old project proposal')
  reloaded.getState().dispatchToChangeSet(rejectedReview.id, {
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Rejected task board',
  }, 'agent')
  reloaded.getState().rejectChangeSet()
  assert(reloaded.getState().rejectedRecords.length === 1, 'rejected proposal fixture was not stored')
  reloaded.getState().resetToSample()
  assert(
    reloaded.getState().rejectedRecords.length === 0,
    'reset retained rejected proposal history from the replaced project',
  )
  const resetReload = await freshStore('taskflow-reset-explicit-reload')
  assert(
    resetReload.getState().document.project.name === 'TaskFlow' &&
      resetReload.getState().document.screens['screen-list'].name === 'Task List' &&
      resetReload.getState().history.length === 0 &&
      resetReload.getState().activeChangeSet === null,
    'explicit reset did not persist a clean TaskFlow sample',
  )

  const appSource = readFileSync(join(root, 'src/app/App.tsx'), 'utf8')
  const errorBoundarySource = readFileSync(join(root, 'src/app/AppErrorBoundary.tsx'), 'utf8')
  const pagesWorkflow = readFileSync(join(root, '.github/workflows/pages.yml'), 'utf8')
  const envExample = readFileSync(join(root, '.env.example'), 'utf8')
  const viteEnvTypes = readFileSync(join(root, 'src/vite-env.d.ts'), 'utf8')
  assert(
    appSource.includes("window.confirm(t('app.resetSampleConfirm'))") &&
      appSource.includes('disabled={Boolean(activeChangeSet)}') &&
      appSource.includes('BUILD_FEATURE_FLAGS.sampleReset') &&
      appSource.includes('resetToSample()') &&
      appSource.includes("initializeWithRecovery('sample')") &&
      errorBoundarySource.includes('resetToSample()') &&
      !pagesWorkflow.includes('VITE_ENABLE_SAMPLE_RESET') &&
      envExample.includes('VITE_ENABLE_SAMPLE_RESET=true') &&
      viteEnvTypes.includes('readonly VITE_ENABLE_SAMPLE_RESET?: string'),
    'sample reset gating lost config typing/example/recovery or leaked into Pages',
  )
})

await test('sample reset build flag is exact and leaves default UI recovery-safe', async () => {
  memoryStorage.clear()
  installStorage(memoryStorage)
  const { parseExactTrueFlag } = await import(
    moduleUrl(buildFeatureFlagsBundle, 'sample-reset-parser')
  )
  for (const value of [undefined, '', 'false', '1', 'TRUE', ' true', 'true ']) {
    assert(!parseExactTrueFlag(value), `sample reset flag accepted ${JSON.stringify(value)}`)
  }
  assert(parseExactTrueFlag('true'), 'sample reset flag rejected exact true')

  const defaultRenderer = await import(moduleUrl(renderAppBundle, 'sample-reset-default'))
  const defaultMarkup = defaultRenderer.renderApp('en')
  const { document: defaultDocument } = parseHTML(`<html><body>${defaultMarkup}</body></html>`)
  const defaultUndo = defaultDocument.querySelector('[data-history-undo]')
  const defaultRedo = defaultDocument.querySelector('[data-history-redo]')
  assert(
    !defaultDocument.querySelector('[data-sample-reset]') &&
      defaultUndo?.nextElementSibling === defaultRedo,
    'default build left a sample reset focus stop or gap before Undo/Redo',
  )

  const recoveryMarkup = defaultRenderer.renderRecoveryApp('en')
  const { document: recoveryDocument } = parseHTML(`<html><body>${recoveryMarkup}</body></html>`)
  assert(
    !recoveryDocument.querySelector('[data-sample-reset]') &&
      [...recoveryDocument.querySelectorAll('button')]
        .some(button => button.textContent.trim() === 'Reset to sample'),
    'flag-disabled Recovery UI lost its always-available sample reset',
  )

  const flaggedRenderer = await import(
    moduleUrl(renderAppSampleResetBundle, 'sample-reset-enabled')
  )
  const flaggedMarkup = flaggedRenderer.renderApp('en')
  const { document: flaggedDocument } = parseHTML(`<html><body>${flaggedMarkup}</body></html>`)
  assert(
    flaggedDocument.querySelector('[data-sample-reset]')?.hasAttribute('disabled'),
    'flag-enabled review UI did not render a locked sample reset button',
  )
})

await test('flag-enabled sample reset confirms and restores TaskFlow', async () => {
  memoryStorage.clear()
  installStorage(memoryStorage)
  const document = installInteractiveDom()
  let confirmationCount = 0
  Object.defineProperty(globalThis.window, 'confirm', {
    configurable: true,
    value: () => {
      confirmationCount += 1
      return true
    },
  })
  const { mountReviewLockApp } = await import(
    moduleUrl(renderAppSampleResetBundle, 'sample-reset-enabled-mounted')
  )
  const harness = mountReviewLockApp('en')
  harness.prepareHistory()
  const reset = document.querySelector('[data-sample-reset]')
  assert(
    reset &&
      !reset.disabled &&
      harness.state().historyLength === 1 &&
      harness.state().editScreenName === 'Edit Task prepared for review',
    'flag-enabled sample reset fixture did not begin in a modified writable state',
  )
  harness.click(reset)
  assert(
    confirmationCount === 1 &&
      harness.state().historyLength === 0 &&
      harness.state().editScreenName === 'Edit Task',
    'confirmed flag-enabled sample reset did not restore clean TaskFlow',
  )
  harness.beginReview()
  assert(
    document.querySelector('[data-sample-reset]')?.disabled,
    'flag-enabled sample reset remained writable during change-set review',
  )
  harness.unmount()
})

await test('Priority demo reuses human edits and preserves the Update Task API ID', async () => {
  memoryStorage.clear()
  const seedStore = await freshStore('priority-demo-seed')
  seedStore.getState().setActiveScreen('screen-edit')
  seedStore.getState().selectScreenComponent('comp-task-status-select')

  const firstModule = await import(moduleUrl(toolsBundle, 'priority-demo-first-agent'))
  const firstTool = name => firstModule.WEBMCP_TOOLS.find(tool => tool.name === name)
  const firstContext = firstTool('get_current_screen_context').execute({})
  const statusDetail = firstTool('get_component').execute({})
  const statusPlacement = statusDetail.data.hierarchy.at(-1)
  assert(
    firstContext.ok &&
      firstContext.data.activeScreen.id === 'screen-edit' &&
      firstContext.data.selection.canonicalTarget.componentId === 'comp-task-status-select' &&
      statusDetail.data.component.config.fieldKey === 'taskStatus' &&
      statusPlacement.parentId === 'comp-edit-page' &&
      !firstContext.data.activeScreen.componentOutline.some(component =>
        component.label === 'Priority'),
    `Priority demo context/detail was incomplete: ${JSON.stringify({ firstContext, statusDetail })}`,
  )
  const firstReview = firstTool('begin_change_set').execute({
    summary: 'Add Priority after Status',
  })
  const addPriority = firstTool('change_component_structure').execute({
    changeSetId: firstReview.data.changeSetId,
    expectedRevision: firstReview.data.baseRevision,
    expectedChangeSetVersion: firstReview.data.changeSetVersion,
    operation: 'add',
    screenId: 'screen-edit',
    parentId: statusPlacement.parentId,
    kind: 'select',
    position: statusPlacement.order + 1,
    placement: { mode: 'flow' },
    sizing: defaultSizing(),
    config: {
      kind: 'select',
      fieldKey: 'priority',
      label: 'Priority',
      required: true,
      options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
      defaultValue: 'medium',
    },
  })
  assert(addPriority.ok, `Priority proposal failed: ${JSON.stringify(addPriority)}`)
  const proposedContext = firstTool('get_current_screen_context').execute({})
  const proposedPriorityId = addPriority.data.createdComponentId
  const proposedPriority = firstTool('get_component').execute({
    componentId: proposedPriorityId,
  }).data.component
  const savingStateSummary = proposedContext.data.activeScreen.states.find(
    state => state.id === 'scenario-edit-saving',
  )
  const savingState = firstTool('get_current_screen_context').execute({
    include: 'state',
    detailId: savingStateSummary.id,
  }).data.detail.value
  assert(proposedPriority && savingState, 'Priority or Saving state was missing from the proposal')
  const integratePriority = firstTool('upsert_screen_state').execute({
    changeSetId: firstReview.data.changeSetId,
    expectedRevision: firstReview.data.baseRevision,
    expectedChangeSetVersion: addPriority.data.changeSetVersion,
    operation: 'update',
    stateId: savingState.id,
    overrides: [
      ...savingState.componentOverrides,
      {
        target: { type: 'inline', componentId: proposedPriority.id },
        override: { enabled: false },
      },
    ],
  })
  assert(integratePriority.ok, `Priority saving-state integration failed: ${JSON.stringify(integratePriority)}`)
  const integratedContext = firstTool('get_current_screen_context').execute({})
  const integratedState = firstTool('get_current_screen_context').execute({
    include: 'state',
    detailId: savingState.id,
  }).data.detail.value
  const firstPending = firstTool('get_pending_change_set').execute({})
  const outline = integratedContext.data.activeScreen.componentOutline
  const priorityOutline = outline.find(component => component.id === proposedPriority.id)
  const statusOutline = outline.find(component => component.id === 'comp-task-status-select')
  assert(
    proposedPriority &&
      priorityOutline.parentId === statusOutline.parentId &&
      priorityOutline.order === statusOutline.order + 1 &&
      integratedState.componentOverrides.some(
        entry => entry.target.type === 'inline' &&
          entry.target.componentId === proposedPriority.id &&
          entry.override.enabled === false,
      ) &&
      firstPending.data.activeChangeSet.operationSummaries.length === 2,
    'Priority proposal was not discoverable after Status, disabled while saving, or reviewable',
  )

  const firstHumanStore = await freshStore('priority-demo-first-human')
  firstHumanStore.getState().acceptChangeSet()
  firstHumanStore.getState().dispatch({
    type: 'updateComponentSpec',
    componentId: proposedPriority.id,
    patch: {
      config: {
        options: [
          { value: 'low', label: 'Low' },
          { value: 'normal', label: 'Normal' },
          { value: 'critical', label: 'Critical' },
        ],
        defaultValue: 'normal',
      },
    },
  }, 'Refine Priority options')

  const secondModule = await import(moduleUrl(toolsBundle, 'priority-demo-second-agent'))
  const secondTool = name => secondModule.WEBMCP_TOOLS.find(tool => tool.name === name)
  const correctedPriority = secondTool('get_component').execute({
    componentId: proposedPriority.id,
  }).data.component
  const updateTask = secondTool('get_current_screen_context').execute({
    include: 'api',
    detailId: 'api-save-task',
  }).data.detail.value
  assert(
    correctedPriority.config.defaultValue === 'normal' &&
      correctedPriority.config.options[2].label === 'Critical' &&
      !updateTask.requestBindings.some(binding => binding.targetPath === 'body.priority'),
    'second agent did not re-read the human-corrected live model',
  )

  const secondReview = secondTool('begin_change_set').execute({
    summary: 'Bind Priority to Update Task',
  })
  const updateApi = secondTool('connect_behavior').execute({
    changeSetId: secondReview.data.changeSetId,
    expectedRevision: secondReview.data.baseRevision,
    expectedChangeSetVersion: secondReview.data.changeSetVersion,
    operation: 'updateApi',
    operationId: updateTask.id,
    name: updateTask.name,
    method: updateTask.method,
    path: updateTask.path,
    requestBindings: [
      ...updateTask.requestBindings,
      {
        source: { type: 'inline', componentId: correctedPriority.id },
        targetPath: 'priority',
      },
    ],
    successStateId: updateTask.successScenarioId,
    errorStateId: updateTask.errorScenarioId,
  })
  assert(updateApi.ok, `Priority API binding proposal failed: ${JSON.stringify(updateApi)}`)
  const secondPending = secondTool('get_pending_change_set').execute({})
  assert(
    secondPending.data.activeChangeSet.operationSummaries.length === 1 &&
      updateApi.data.apiId === 'api-save-task',
    'Priority API proposal did not retain the existing operation ID',
  )

  const secondHumanStore = await freshStore('priority-demo-second-human')
  secondHumanStore.getState().acceptChangeSet()
  const reloaded = await freshStore('priority-demo-reload')
  const persistedPriority =
    reloaded.getState().document.components[proposedPriority.id]
  const persistedApi = reloaded.getState().document.apiOperations['api-save-task']
  assert(
    persistedPriority.config.kind === 'select' &&
      persistedPriority.config.defaultValue === 'normal' &&
      persistedApi.id === 'api-save-task' &&
      persistedApi.requestBindings.some(binding =>
        binding.source.type === 'inline' &&
          binding.source.componentId === proposedPriority.id &&
          binding.targetPath === 'priority'
      ),
    'accepted Priority field, human correction, or API binding did not survive reload',
  )
})

await test('palette factory and component drops use validated commands', async () => {
  memoryStorage.clear()
  const store = await freshStore('direct-edit-factory')
  const { createAddComponentCommand } = await import(moduleUrl(componentFactoryBundle, 'factory'))
  const { resolveComponentDrop } = await import(moduleUrl(editorDndBundle, 'drop-resolution'))
  const command = createAddComponentCommand(
    store.getState().document,
    'screen-list',
    'comp-list-page',
    'textInput',
    'en',
    0,
  )
  assert(command.config.fieldKey === 'field_1', 'palette factory did not allocate a unique field key')
  assert(command.config.label === 'Field', 'English palette default was not localized')
  assert(!Object.hasOwn(command, 'name'), 'palette command still contains component name')
  const japaneseCommand = createAddComponentCommand(
    store.getState().document,
    'screen-list',
    'comp-list-page',
    'button',
    'ja',
  )
  assert(japaneseCommand.config.label === 'ボタン', 'Japanese palette default was not localized')
  const modalCommand = createAddComponentCommand(
    store.getState().document,
    'screen-list',
    null,
    'modal',
    'en',
  )
  assert(
    modalCommand.parentId === null && modalCommand.kind === 'modal',
    'palette factory did not create an independent modal root command',
  )
  store.getState().dispatch(command, 'Palette drag add')
  assert(
    store.getState().document.components['comp-list-page'].childIds[0] === command.componentId,
    'palette add command did not honor the drop position',
  )
  const selectCommand = createAddComponentCommand(
    store.getState().document,
    'screen-list',
    'comp-list-page',
    'select',
    'en',
  )
  assert(
    selectCommand.config.kind === 'select' &&
      selectCommand.config.options.length === 1 &&
      selectCommand.config.options[0]?.value === selectCommand.config.defaultValue,
    'palette factory did not create a valid atomic Select default',
  )
  store.getState().dispatch(selectCommand, 'Palette Select add')
  assert(
    store.getState().document.components[selectCommand.componentId]?.config.kind === 'select',
    'new Select could not be added through invariant validation',
  )

  const resolution = resolveComponentDrop(
    store.getState().document,
    'comp-list-summary',
    {
      type: 'component-drop',
      surface: 'canvas',
      parentId: 'comp-list-page',
      screenId: 'screen-list',
      position: 0,
      label: 'first',
    },
  )
  assert(
    resolution.status === 'moved' && resolution.position === 0,
    'drop position was not resolved',
  )
})

await test('sample and component surfaces cover every canonical component kind', async () => {
  memoryStorage.clear()
  const {
    CHILD_COMPONENT_KINDS,
    COMPONENT_KIND_CATALOG,
    COMPONENT_KINDS,
    PALETTE_COMPONENT_KINDS,
    assertCompleteComponentKindCoverage,
  } = await import(moduleUrl(modelBundle, 'all-component-kinds-model'))
  const { sampleProject } = await import(
    moduleUrl(sampleProjectBundle, 'all-component-kinds-sample')
  )
  const {
    validateComponentConfig,
    validateScreenComponent,
  } = await import(moduleUrl(runtimeValidationBundle, 'all-component-kinds-validation'))
  const { validateInvariants } = await import(
    moduleUrl(invariantsBundle, 'all-component-kinds-invariants')
  )
  const {
    COMPONENT_KIND_MESSAGE_KEYS,
    getComponentSelectionContext,
    getComponentTreeLabel,
  } = await import(moduleUrl(componentDisplayLabelBundle, 'all-component-kinds-labels'))
  const {
    PALETTE_ITEMS,
    createAddComponentCommand,
  } = await import(moduleUrl(componentFactoryBundle, 'all-component-kinds-factory'))
  const {
    canDuplicateComponent,
    createComponentSubtreeSnapshot,
    createDuplicateComponentCommand,
    createPasteComponentCommand,
  } = await import(moduleUrl(componentDuplicationBundle, 'all-component-kinds-copy'))
  const { applyCommandWithoutRevision } = await import(
    moduleUrl(domainBundle, 'all-component-kinds-commands')
  )
  const { classifyComponentAdd } = await import(
    moduleUrl(componentPlacementBundle, 'all-component-kinds-placement')
  )
  const { WEBMCP_TOOLS } = await import(moduleUrl(toolsBundle, 'all-component-kinds-tools'))
  const { createCanvasComponentPreview } = await import(
    moduleUrl(componentPreviewBundle, 'all-component-kinds-preview')
  )

  validateInvariants(sampleProject)
  const components = Object.values(sampleProject.components)
    .filter(component => component.nodeType === 'inline')
  const sampleKinds = [...new Set(components.map(component => component.kind))]
  assertCompleteComponentKindCoverage('sample project', sampleKinds)
  components.forEach(component => validateScreenComponent(component))
  assertCompleteComponentKindCoverage(
    'component labels',
    Object.keys(COMPONENT_KIND_MESSAGE_KEYS),
  )

  const representativeByKind = new Map()
  for (const kind of COMPONENT_KINDS) {
    const candidates = components.filter(component => component.kind === kind)
    const representative = kind === 'button'
      ? candidates.find(component =>
          component.config.kind === 'button' && component.config.eventId !== null)
      : candidates[0]
    assert(representative, `sample has no representative ${kind} component`)
    representativeByKind.set(kind, representative)
    const preview = createCanvasComponentPreview(representative.config)
    const definition = COMPONENT_KIND_CATALOG.find(candidate => candidate.kind === kind)
    assert(
      preview.kind === kind &&
        preview.rendersContent === definition?.canvasContent,
      `Canvas preview is unavailable or misclassified for ${kind}`,
    )
    assert(
      getComponentTreeLabel(representative, 'en').length > 0 &&
        getComponentTreeLabel(representative, 'ja').length > 0,
      `Tree label is unavailable for ${kind}`,
    )
    const selection = getComponentSelectionContext(
      sampleProject,
      representative.id,
      'en',
    )
    assert(
      selection?.hierarchy.at(-1)?.componentId === representative.id,
      `Inspector selection context is unavailable for ${kind}`,
    )
  }

  const modal = representativeByKind.get('modal')
  assert(
    modal.parentId === null &&
      sampleProject.screens[modal.screenId].modalComponentIds.includes(modal.id) &&
      modal.childIds.length > 0,
    'sample Modal is not a populated independent root',
  )
  const select = representativeByKind.get('select').config
  assert(
    select.kind === 'select' &&
      select.options.length >= 2 &&
      select.options.some(option => option.value === select.defaultValue),
    'sample Select does not demonstrate options and a default',
  )
  const textInput = representativeByKind.get('textInput').config
  assert(
    textInput.kind === 'textInput' &&
      textInput.validationRules.some(rule => rule.type === 'required'),
    'sample TextInput does not demonstrate validation rules',
  )
  const button = representativeByKind.get('button')
  assert(
    button.config.kind === 'button' &&
      button.config.eventId !== null &&
      sampleProject.events[button.config.eventId]?.trigger.target.type === 'inline' &&
      sampleProject.events[button.config.eventId]?.trigger.target.componentId === button.id,
    'sample Button does not demonstrate an Event reference',
  )
  assert(
    Object.values(sampleProject.apiOperations).some(operation =>
      operation.requestBindings.some(binding =>
        binding.source.type === 'inline' &&
        (binding.source.componentId === representativeByKind.get('textInput').id ||
          binding.source.componentId === representativeByKind.get('select').id))),
    'sample inputs do not demonstrate API request bindings',
  )

  assert(
    PALETTE_ITEMS.map(item => item.kind).join(',') === PALETTE_COMPONENT_KINDS.join(','),
    'Palette kinds diverged from the canonical component catalog',
  )
  for (const definition of COMPONENT_KIND_CATALOG) {
    const { kind, placement: catalogPlacement } = definition
    const expected = catalogPlacement === 'screen-root'
      ? { status: 'invalid', reason: 'componentConstraint' }
      : { status: 'moved' }
    const placement = classifyComponentAdd(
      sampleProject,
      'screen-list',
      catalogPlacement === 'child' ? 'comp-list-page' : null,
      kind,
    )
    assert(
      placement.status === expected.status &&
        (expected.reason === undefined || placement.reason === expected.reason),
      `add availability is incorrect for ${kind}`,
    )
    if (catalogPlacement !== 'screen-root') {
      const command = createAddComponentCommand(
        sampleProject,
        'screen-list',
        catalogPlacement === 'child' ? 'comp-list-page' : null,
        kind,
        'en',
      )
      validateComponentConfig(command.config, kind)
    }
  }

  let generatedId = 0
  const createId = () => `coverage-component-${generatedId += 1}`
  for (const kind of COMPONENT_KINDS) {
    const source = representativeByKind.get(kind)
    const independentRoot = source.parentId === null
    const snapshot = createComponentSubtreeSnapshot(sampleProject, source.id)
    assert(
      canDuplicateComponent(sampleProject, source.id) === Boolean(snapshot),
      `duplicate availability is incorrect for ${kind}`,
    )
    if (independentRoot) {
      assert(
        createComponentSubtreeSnapshot(sampleProject, source.id) === null,
        `independent ${kind} root was copyable`,
      )
      let deletion
      let deletionError
      try {
        deletion = applyCommandWithoutRevision(clone(sampleProject), {
          type: 'removeComponent',
          componentId: source.id,
        })
      } catch (error) {
        deletionError = error
      }
      assert(
        kind === 'page'
          ? deletionError !== undefined
          : deletion?.components[source.id] === undefined &&
            !deletion?.screens[source.screenId].modalComponentIds.includes(source.id),
        `delete availability is incorrect for independent ${kind} root`,
      )
      continue
    }
    if (!snapshot) {
      assert(
        kind === 'select',
        `non-root ${kind} dependencies unexpectedly prevent safe duplication`,
      )
      continue
    }

    const duplicate = createDuplicateComponentCommand(sampleProject, source.id, createId)
    assert(duplicate, `duplicate command is unavailable for ${kind}`)
    const duplicated = applyCommandWithoutRevision(clone(sampleProject), duplicate)
    assert(
      duplicated.components[duplicate.componentIdMap[source.id]]?.kind === kind,
      `duplicate did not preserve ${kind}`,
    )

    const destination = source.parentId
    const paste = createPasteComponentCommand(sampleProject, snapshot, destination, createId)
    assert(paste, `paste command is unavailable for ${kind}`)
    const pasted = applyCommandWithoutRevision(clone(sampleProject), paste)
    assert(
      pasted.components[paste.componentIdMap[source.id]]?.kind === kind,
      `paste did not preserve ${kind}`,
    )

    const deleted = applyCommandWithoutRevision(clone(sampleProject), {
      type: 'removeComponent',
      componentId: source.id,
    })
    assert(!deleted.components[source.id], `delete did not remove ${kind}`)
  }

  const structureTool = WEBMCP_TOOLS.find(tool => tool.name === 'change_component_structure')
  const updateTool = WEBMCP_TOOLS.find(tool => tool.name === 'update_component_spec')
  const webMcpAddKinds = structureTool?.inputSchema.properties.kind.enum ?? []
  const webMcpConfigKinds =
    structureTool?.inputSchema.properties.config.properties.kind.enum ?? []
  assert(
    webMcpAddKinds.join(',') === PALETTE_COMPONENT_KINDS.join(',') &&
      structureTool.description.includes('modal parentId=null'),
    'WebMCP component add kinds diverged from the canonical component catalog',
  )
  assertCompleteComponentKindCoverage('WebMCP add config schema', webMcpConfigKinds ?? [])
  assertCompleteComponentKindCoverage(
    'WebMCP update config schema',
    updateTool?.inputSchema.properties.patch.properties.config.properties.kind.enum ?? [],
  )

  const treeSource = readFileSync(
    join(root, 'src/features/structure-tree/StructureTree.tsx'),
    'utf8',
  )
  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  assert(
    treeSource.includes('getComponentTreeLabel(component, locale)') &&
      inspectorSource.includes('getComponentSelectionContext('),
    'Tree or Inspector bypassed the exhaustive component label and selection path',
  )

  memoryStorage.clear()
  const persistenceSourceStore = await freshStore('all-component-kinds-persistence-source')
  persistenceSourceStore.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Task List coverage',
  }, 'Persist all component kinds')
  const persistedComponents = clone(persistenceSourceStore.getState().document.components)
  const persistenceReload = await freshStore('all-component-kinds-persistence-reload')
  assert(
    JSON.stringify(persistenceReload.getState().document.components) ===
      JSON.stringify(persistedComponents),
    'all-kind sample components did not survive persistence round-trip',
  )
  assertCompleteComponentKindCoverage(
    'persisted sample project',
    [...new Set([
      ...Object.values(persistedComponents)
        .filter(component => component.nodeType === 'inline')
        .map(component => component.kind),
      ...Object.values(persistenceReload.getState().document.componentDefinitions)
        .flatMap(definition => Object.values(definition.nodes).map(node => node.kind)),
    ])],
  )
})

await test('semantic Image and Link configs enforce portable URL and destination contracts', async () => {
  const { validateComponentConfig } = await import(
    moduleUrl(runtimeValidationBundle, 'semantic-media-validation')
  )
  const { applyCommandWithoutRevision } = await import(
    moduleUrl(domainBundle, 'semantic-media-screen-reference')
  )
  const { sampleProject } = await import(
    moduleUrl(sampleProjectBundle, 'semantic-media-sample')
  )
  const { resolveImagePreviewStatus } = await import(
    moduleUrl(componentPreviewBundle, 'semantic-media-image-status')
  )
  const {
    SAFE_EXTERNAL_URL_PATTERN,
    isSafeExternalUrl,
    isSafePortableUrl,
  } = await import(moduleUrl(portableUrlBundle, 'semantic-media-urls'))
  const { componentConfigSchema } = await import(
    moduleUrl(webMcpSchemasBundle, 'semantic-media-webmcp-schema')
  )
  const { cloneDomainCommand } = await import(
    moduleUrl(modelCloneBundle, 'semantic-media-command-clone')
  )
  const canonicalSchema = JSON.parse(readFileSync(
    join(root, 'public/schemas/screen-blueprint-project-v3.schema.json'),
    'utf8',
  ))
  assert(
    canonicalSchema.$defs.externalUrl.pattern === SAFE_EXTERNAL_URL_PATTERN,
    'canonical external URL pattern drifted from the runtime contract',
  )
  const externalCorpus = [
    ['https://example.com', true],
    ['HTTP://localhost:4173/path?q=1', true],
    ['http:foo', false],
    ['https:/example.com', false],
    ['https://?', false],
    ['https://[bad', false],
    ['https://example.com ', false],
    ['https://example.com:65535/path', true],
    ['https://example.com:65536/path', false],
    ['https://127.0.0.1:4173/path', true],
    ['https://999.999.999.999', false],
    ['javascript:alert(1)', false],
    ['//example.com', false],
    ['https:\\\\example.com', false],
  ]
  const validateExternalSchema = new Ajv2020({ strict: true }).compile(
    canonicalSchema.$defs.externalUrl,
  )
  const validatePortableSchema = new Ajv2020({ strict: true }).compile({
    $schema: canonicalSchema.$schema,
    $defs: canonicalSchema.$defs,
    $ref: '#/$defs/portableUrl',
  })
  const portableCorpus = [
    ['./images/board.png', true],
    ['../images/board.png', true],
    ['images/my board.png', true],
    ['//example.com/image.png', false],
    [' images/board.png', false],
    ['images/board.png ', false],
    ['file:///tmp/image.png', false],
  ]
  assert(
    externalCorpus.every(([value, expected]) =>
      isSafeExternalUrl(value) === expected &&
      validateExternalSchema(value) === expected
    ) &&
      portableCorpus.every(([value, expected]) =>
        isSafePortableUrl(value) === expected &&
        validatePortableSchema(value) === expected
      ),
    'runtime and canonical URL acceptance corpus diverged',
  )
  const rejects = config => {
    try {
      validateComponentConfig(config, config.kind)
      return false
    } catch {
      return true
    }
  }
  const image = {
    kind: 'image',
    source: './images/board.png',
    alt: 'Task board',
    fit: 'cover',
    aspectRatio: '16:9',
    placeholderStyle: 'icon',
  }
  const external = {
    kind: 'link',
    label: 'Documentation',
    destination: { type: 'external', url: 'https://example.com/docs' },
    openMode: 'newContext',
  }
  validateComponentConfig(image, 'image')
  validateComponentConfig(external, 'link')
  assert(
    resolveImagePreviewStatus('', null) === 'missing' &&
      resolveImagePreviewStatus('javascript:alert(1)', null) === 'invalid' &&
      resolveImagePreviewStatus('./broken.png', './broken.png') === 'failed' &&
      resolveImagePreviewStatus('./working.png', './broken.png') === 'ready',
    'Image preview did not distinguish errors or reset failure on source change',
  )
  assert(
    [
      { ...image, source: 'javascript:alert(1)' },
      { ...image, source: '//example.com/image.png' },
      { ...image, source: '\\\\example.com\\image.png' },
      { ...image, source: './image\u0000.png' },
      { ...image, alt: ' ' },
      { ...external, destination: { type: 'external', url: '/relative' } },
      { ...external, destination: { type: 'external', url: 'data:text/plain,x' } },
      { ...external, openMode: 'download' },
      {
        ...external,
        destination: { type: 'internal', screenId: 'screen-list' },
        openMode: 'newContext',
      },
    ].every(rejects),
    'unsafe URL or incompatible Link open mode passed runtime validation',
  )
  validateComponentConfig({
    ...external,
    destination: {
      type: 'resource',
      resourceId: 'opaque-report',
      url: '../reports/status.pdf',
      displayName: 'Status report',
    },
    openMode: 'download',
  }, 'link')
  const validateWebMcpConfig = new Ajv2020({ strict: false }).compile(
    componentConfigSchema,
  )
  assert(
    validateWebMcpConfig(external) &&
      componentConfigSchema.properties.destination.properties.type.enum.includes('resource') &&
      componentConfigSchema.properties.openMode.enum.includes('download') &&
      !JSON.stringify(componentConfigSchema).includes('"oneOf"') &&
      !JSON.stringify(componentConfigSchema).includes('"if"'),
    'WebMCP config schema lost typed Link fields or reintroduced conditional composition',
  )
  const callerDestination = { type: 'external', url: 'https://example.com/original' }
  const clonedCommand = cloneDomainCommand({
    type: 'updateComponentSpec',
    componentId: 'comp-list-help-link',
    patch: { config: { destination: callerDestination } },
  })
  callerDestination.url = 'https://example.com/mutated'
  assert(
    clonedCommand.patch.config.destination.url === 'https://example.com/original',
    'Link destination patch retained a caller-owned object',
  )

  const document = clone(sampleProject)
  document.components['comp-edit-summary'].kind = 'link'
  document.components['comp-edit-summary'].config = {
    kind: 'link',
    label: 'Back to tasks',
    destination: { type: 'internal', screenId: 'screen-list' },
    openMode: 'sameContext',
  }
  for (const event of Object.values(document.events)) {
    event.actions = event.actions.filter(action =>
      action.type !== 'navigate' || action.destinationScreenId !== 'screen-list'
    )
  }
  let rejectedBrokenLink = false
  try {
    applyCommandWithoutRevision(document, { type: 'removeScreen', screenId: 'screen-list' })
  } catch (error) {
    rejectedBrokenLink = String(error).includes('referenced by link')
  }
  assert(rejectedBrokenLink, 'screen deletion silently left a broken internal Link')
})

await test('modal roots own independent trees and clean references on removal', async () => {
  memoryStorage.clear()
  const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'modal-root-domain'))
  const store = await freshStore('modal-root-store')
  const layout = {
    layout: 'vertical',
    gap: 'md',
    columns: 2,
    justify: 'start',
    align: 'stretch',
    wrap: false,
  }
  let document = applyCommandWithoutRevision(store.getState().document, {
    type: 'addComponent',
    componentId: 'modal-root',
    screenId: 'screen-list',
    parentId: null,
    kind: 'modal',
    placement: { mode: 'flow' },
    sizing: rootSizing(),
    config: { kind: 'modal', ...layout },
  })
  assert(
    document.screens['screen-list'].modalComponentIds.includes('comp-create-modal') &&
      document.screens['screen-list'].modalComponentIds.includes('modal-root') &&
      document.components['modal-root'].parentId === null,
    'modal was not registered as an independent screen root',
  )

  document = applyCommandWithoutRevision(document, {
    type: 'addComponent',
    componentId: 'modal-button',
    screenId: 'screen-list',
    parentId: 'modal-root',
    kind: 'button',
    placement: { mode: 'flow' },
    sizing: defaultSizing(),
    config: {
      kind: 'button',
      label: 'Close',
      variant: 'secondary',
      eventId: null,
      confirmationMessage: null,
      preventDoubleSubmit: false,
    },
  })
  document = applyCommandWithoutRevision(document, {
    type: 'moveComponent',
    componentId: 'comp-list-summary',
    newParentId: 'modal-root',
    position: 0,
  })
  assert(
    document.components['comp-list-summary'].parentId === 'modal-root' &&
      document.components['modal-root'].childIds[0] === 'comp-list-summary',
    'page child could not be moved into a modal tree',
  )
  document = applyCommandWithoutRevision(document, {
    type: 'moveComponent',
    componentId: 'comp-list-summary',
    newParentId: 'comp-list-page',
    position: 0,
  })
  document = applyCommandWithoutRevision(document, {
    type: 'createScreenState',
    stateId: 'scenario-modal-hidden',
    screenId: 'screen-list',
    name: 'Modal hidden',
    overrides: [{
      target: { type: 'inline', componentId: 'modal-button' },
      override: { visible: false },
    }],
  })
  document = applyCommandWithoutRevision(document, {
    type: 'connectEvent',
    eventId: 'event-modal-button',
    screenId: 'screen-list',
    name: 'Close modal',
    trigger: { type: 'click', target: { type: 'inline', componentId: 'modal-button' } },
    actions: [],
  })

  for (const command of [
    {
      type: 'addComponent',
      componentId: 'nested-modal',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'modal',
      placement: { mode: 'flow' },
      sizing: rootSizing(),
      config: { kind: 'modal', ...layout },
    },
    {
      type: 'addComponent',
      componentId: 'orphan-text',
      screenId: 'screen-list',
      parentId: null,
      kind: 'text',
      placement: { mode: 'flow' },
      config: { kind: 'text', text: 'Orphan', style: 'body' },
    },
    {
      type: 'moveComponent',
      componentId: 'modal-root',
      newParentId: 'comp-list-page',
    },
  ]) {
    let rejected = false
    try {
      applyCommandWithoutRevision(document, command)
    } catch {
      rejected = true
    }
    assert(rejected, `invalid modal structure was accepted: ${JSON.stringify(command)}`)
  }

  const orphaned = clone(document)
  orphaned.screens['screen-list'].modalComponentIds = []
  let orphanRejected = false
  try {
    applyCommandWithoutRevision(orphaned, {
      type: 'updateScreen',
      screenId: 'screen-list',
      name: 'Task List',
    })
  } catch {
    orphanRejected = true
  }
  assert(orphanRejected, 'an unlisted modal root passed reachability validation')

  document = applyCommandWithoutRevision(document, {
    type: 'removeComponent',
    componentId: 'modal-root',
  })
  assert(
    document.screens['screen-list'].modalComponentIds.join(',') === 'comp-create-modal' &&
      !document.components['modal-root'] &&
      !document.components['modal-button'] &&
      !document.events['event-modal-button'] &&
      !document.screenScenarios['scenario-modal-hidden'].componentOverrides.some(
        entry => entry.target.type === 'inline' && entry.target.componentId === 'modal-button',
      ),
    'modal subtree removal left roots, descendants, or references behind',
  )

  const modalReview = store.getState().beginChangeSet('Add modal frame')
  store.getState().dispatchToChangeSet(modalReview.id, {
    type: 'addComponent',
    componentId: 'human-modal-root',
    screenId: 'screen-list',
    parentId: null,
    kind: 'modal',
    placement: { mode: 'flow' },
    sizing: rootSizing(),
    config: { kind: 'modal', ...layout },
  })
  const state = store.getState()
  assert(
    state.activeChangeSet.operations.at(-1)?.source === 'agent' &&
      state.effectiveDocument.screens['screen-list'].modalComponentIds.includes('human-modal-root') &&
      !state.document.screens['screen-list'].modalComponentIds.includes('human-modal-root'),
    'agent modal addition did not route through the active change set',
  )
})

await test('component reorder and reparent classify moved, no-op, and invalid targets', async () => {
  memoryStorage.clear()
  const store = await freshStore('direct-edit-moves')
  const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'direct-edit-domain'))
  const {
    canAcceptDrop,
    isComponentDropData,
    isEditorDragData,
    resolveComponentDrop,
    resolveEditorDrop,
  } = await import(moduleUrl(editorDndBundle, 'invalid-drops'))
  const baseline = store.getState().document
  assert(
    !isEditorDragData({
      type: 'component',
      componentId: 'comp-task-title-input',
      screenId: 'screen-edit',
      label: 'Name',
    }) &&
      !isComponentDropData({
        type: 'component-drop',
        parentId: 'comp-edit-section',
        screenId: 'screen-edit',
        position: 0,
        label: 'Missing surface',
      }),
    'malformed DnD data without a typed surface was accepted',
  )

  const reordered = applyCommandWithoutRevision(baseline, {
    type: 'moveComponent',
    componentId: 'comp-cancel-edit-btn',
    newParentId: 'comp-edit-page',
    position: 4,
  })
  assert(
    reordered.components['comp-edit-page'].childIds.slice(4, 6).join(',') ===
      'comp-cancel-edit-btn,comp-save-btn',
    'same-parent reorder failed',
  )
  const reparented = applyCommandWithoutRevision(baseline, {
    type: 'moveComponent',
    componentId: 'comp-edit-summary',
    newParentId: 'comp-discard-modal',
    position: 0,
  })
  assert(
    reparented.components['comp-edit-summary'].parentId === 'comp-discard-modal',
    'cross-container reparent failed',
  )
  const currentNoOpTarget = {
    type: 'component-drop',
    surface: 'canvas',
    parentId: 'comp-edit-page',
    screenId: 'screen-edit',
    position: 2,
    label: 'current position',
  }
  assert(
    resolveComponentDrop(baseline, 'comp-task-name-input', currentNoOpTarget).status === 'no-op' &&
      canAcceptDrop(baseline, {
        type: 'component',
        surface: 'canvas',
        componentId: 'comp-task-name-input',
        screenId: 'screen-edit',
        label: 'Name',
      }, currentNoOpTarget) &&
      resolveEditorDrop(baseline, {
        type: 'palette',
        kind: 'text',
        label: 'Text',
      }, currentNoOpTarget).status === 'moved',
    'no-op or palette drop classification drifted',
  )
  for (const [componentId, parentId, reason] of [
    ['comp-edit-page', 'comp-discard-modal', 'root'],
    ['comp-discard-copy', 'comp-task-name-input', 'parentCannotContainChildren'],
    ['comp-list-summary', 'comp-edit-page', 'crossScreen'],
  ]) {
    const parent = baseline.components[parentId]
    const result = resolveComponentDrop(baseline, componentId, {
      type: 'component-drop',
      surface: 'canvas',
      parentId,
      screenId: parent.screenId,
      position: 0,
      label: 'invalid target',
    })
    assert(
      result.status === 'invalid' && result.reason === reason,
      `drop classification mismatch: ${componentId} -> ${parentId}`,
    )
  }
  return

  let document = applyCommandWithoutRevision(baseline, {
    type: 'moveComponent',
    componentId: 'comp-cancel-btn',
    newParentId: 'comp-actions',
    position: 1,
  })
  assert(
    document.components['comp-actions'].childIds.join(',') === 'comp-save-btn,comp-cancel-btn',
    'same-parent reorder failed',
  )

  document = applyCommandWithoutRevision(document, {
    type: 'moveComponent',
    componentId: 'comp-task-description-input',
    newParentId: 'comp-actions',
    position: 0,
  })
  assert(
    document.components['comp-task-description-input'].parentId === 'comp-actions' &&
      document.components['comp-actions'].childIds[0] === 'comp-task-description-input',
    'cross-container reparent failed',
  )

  const invalidCommands = [
    {
      type: 'moveComponent',
      componentId: 'comp-edit-page',
      newParentId: 'comp-edit-section',
      position: 0,
    },
    {
      type: 'moveComponent',
      componentId: 'comp-edit-section',
      newParentId: 'comp-actions',
      position: 0,
    },
    {
      type: 'moveComponent',
      componentId: 'comp-cancel-btn',
      newParentId: 'comp-task-title-input',
      position: 0,
    },
    {
      type: 'moveComponent',
      componentId: 'comp-list-title',
      newParentId: 'comp-edit-section',
      position: 0,
    },
    {
      type: 'moveComponent',
      componentId: 'comp-task-title-input',
      newParentId: 'comp-edit-section',
      position: 2,
    },
  ]
  for (const command of invalidCommands) {
    let rejected = false
    try {
      applyCommandWithoutRevision(baseline, command)
    } catch {
      rejected = true
    }
    assert(rejected, `invalid move was accepted: ${JSON.stringify(command)}`)
  }

  const classifiedDrops = [
    {
      componentId: 'comp-edit-page',
      parentId: 'comp-edit-section',
      position: 0,
      status: 'invalid',
      reason: 'root',
    },
    {
      componentId: 'comp-edit-section',
      parentId: 'comp-actions',
      position: 0,
      status: 'invalid',
      reason: 'selfOrDescendant',
    },
    {
      componentId: 'comp-edit-section',
      parentId: 'comp-edit-section',
      position: 0,
      status: 'invalid',
      reason: 'selfOrDescendant',
    },
    {
      componentId: 'comp-cancel-btn',
      parentId: 'comp-task-title-input',
      position: 0,
      status: 'invalid',
      reason: 'parentCannotContainChildren',
    },
    {
      componentId: 'comp-list-title',
      parentId: 'comp-edit-section',
      position: 0,
      status: 'invalid',
      reason: 'crossScreen',
    },
    {
      componentId: 'comp-task-title-input',
      parentId: 'comp-edit-section',
      position: 2,
      status: 'no-op',
    },
    {
      componentId: 'comp-task-title-input',
      parentId: 'comp-edit-section',
      position: 3,
      status: 'no-op',
    },
    {
      componentId: 'missing-component',
      parentId: 'comp-edit-section',
      position: 0,
      status: 'invalid',
      reason: 'stale',
    },
    {
      componentId: 'comp-task-title-input',
      parentId: 'missing-parent',
      position: 0,
      status: 'invalid',
      reason: 'stale',
    },
    {
      componentId: 'comp-task-title-input',
      parentId: 'comp-edit-section',
      position: 99,
      status: 'invalid',
      reason: 'invalidPosition',
    },
  ]
  for (const expected of classifiedDrops) {
    const parent = baseline.components[expected.parentId]
    const resolution = resolveComponentDrop(baseline, expected.componentId, {
      type: 'component-drop',
      surface: 'canvas',
      parentId: expected.parentId,
      screenId: parent?.screenId ?? 'screen-edit',
      position: expected.position,
      label: 'invalid target',
    })
    assert(
      resolution.status === expected.status &&
        (resolution.status !== 'invalid' || resolution.reason === expected.reason),
      `drop classification mismatch: ${expected.componentId} -> ${expected.parentId}`,
    )
  }

  const noOpTarget = {
    type: 'component-drop',
    surface: 'canvas',
    parentId: 'comp-edit-section',
    screenId: 'screen-edit',
    position: 1,
    label: 'current position',
  }
  assert(
    canAcceptDrop(baseline, {
      type: 'component',
      surface: 'canvas',
      componentId: 'comp-task-title-input',
      screenId: 'screen-edit',
      label: 'Name',
    }, noOpTarget),
    'a normalized no-op target was disabled',
  )
  const paletteAdd = resolveEditorDrop(baseline, {
    type: 'palette',
    kind: 'text',
    label: 'Text',
  }, noOpTarget)
  const paletteModal = resolveEditorDrop(baseline, {
    type: 'palette',
    kind: 'modal',
    label: 'Modal',
  }, noOpTarget)
  const invalidPaletteParent = resolveEditorDrop(baseline, {
    type: 'palette',
    kind: 'button',
    label: 'Button',
  }, {
    ...noOpTarget,
    parentId: 'comp-task-title-input',
  })
  const crossSurfaceCanvas = resolveEditorDrop(baseline, {
    type: 'component',
    surface: 'canvas',
    componentId: 'comp-task-title-input',
    screenId: 'screen-edit',
    label: 'Name',
  }, {
    ...noOpTarget,
    surface: 'tree',
  })
  const crossSurfaceTree = resolveEditorDrop(baseline, {
    type: 'component',
    surface: 'tree',
    componentId: 'comp-task-title-input',
    screenId: 'screen-edit',
    label: 'Name',
  }, noOpTarget)
  const crossSurfacePalette = resolveEditorDrop(baseline, {
    type: 'palette',
    kind: 'text',
    label: 'Text',
  }, {
    ...noOpTarget,
    surface: 'tree',
  })
  assert(
    paletteAdd.status === 'moved' &&
      paletteAdd.action === 'add' &&
      paletteAdd.parentId === 'comp-edit-section' &&
      paletteModal.status === 'moved' &&
      paletteModal.action === 'add' &&
      paletteModal.parentId === null &&
      invalidPaletteParent.status === 'invalid' &&
      invalidPaletteParent.reason === 'parentCannotContainChildren' &&
      crossSurfaceCanvas.status === 'invalid' &&
      crossSurfaceCanvas.reason === 'surfaceMismatch' &&
      crossSurfaceTree.status === 'invalid' &&
      crossSurfaceTree.reason === 'surfaceMismatch' &&
      crossSurfacePalette.status === 'invalid' &&
      crossSurfacePalette.reason === 'surfaceMismatch',
    'palette drops did not use typed placement classification',
  )

  memoryStorage.clear()
  const noOpStore = await freshStore('direct-edit-no-op')
  noOpStore.getState().setActiveScreen('screen-edit')
  noOpStore.getState().setSelectedComponent('comp-task-description-input')
  const beforeNoOp = noOpStore.getState()
  const noOpApplied = noOpStore.getState().dispatch({
    type: 'moveComponent',
    componentId: 'comp-task-title-input',
    newParentId: 'comp-edit-section',
    position: 2,
  }, 'No-op move')
  const afterNoOp = noOpStore.getState()
  assert(
    noOpApplied &&
      afterNoOp.document === beforeNoOp.document &&
      afterNoOp.document.revision === beforeNoOp.document.revision &&
      afterNoOp.history.length === beforeNoOp.history.length &&
      afterNoOp.ui.selectedComponentId === beforeNoOp.ui.selectedComponentId &&
      afterNoOp.toast === null,
    'confirmed no-op move changed document, history, selection, or Toast',
  )
  const changeSet = noOpStore.getState().beginChangeSet('No-op review')
  noOpStore.getState().dispatch({
    type: 'moveComponent',
    componentId: 'comp-task-title-input',
    newParentId: 'comp-edit-section',
    position: 2,
  }, 'No-op review move')
  assert(
    noOpStore.getState().activeChangeSet?.id === changeSet.id &&
      noOpStore.getState().activeChangeSet?.version === 0 &&
      noOpStore.getState().activeChangeSet?.operations.length === 0,
    'active change set recorded a no-op move',
  )
})

await test('review lock blocks human document mutations and screen management reconciles selection', async () => {
  memoryStorage.clear()
  const changeSetStore = await freshStore('direct-edit-change-set')
  const beforeOrder = changeSetStore.getState().document.components['comp-edit-page'].childIds.join(',')
  const lockChangeSet = changeSetStore.getState().beginChangeSet('AI review lock')
  const beforeLockedAttempt = changeSetStore.getState()
  const persistedBeforeLockedAttempt = memoryStorage.getItem(storageKey)
  const applied = changeSetStore.getState().dispatch({
    type: 'moveComponent',
    componentId: 'comp-cancel-edit-btn',
    newParentId: 'comp-edit-page',
    position: 4,
  }, 'Human drag')
  const changeSet = changeSetStore.getState().activeChangeSet
  assert(
    !applied &&
      changeSet?.id === lockChangeSet.id &&
      changeSet.operations.length === 0 &&
      changeSet.version === 0 &&
      changeSetStore.getState().document === beforeLockedAttempt.document &&
      changeSetStore.getState().effectiveDocument === beforeLockedAttempt.effectiveDocument &&
      changeSetStore.getState().history === beforeLockedAttempt.history &&
      changeSetStore.getState().redoStack === beforeLockedAttempt.redoStack &&
      changeSetStore.getState().document.components['comp-edit-page'].childIds.join(',') === beforeOrder &&
      memoryStorage.getItem(storageKey) === persistedBeforeLockedAttempt &&
      changeSetStore.getState().toast?.message.key === 'changes.editLocked',
    'human mutation changed review state, history, document, or persistence',
  )
  assert(
    changeSetStore.getState().copyComponent('comp-launch-task-card') &&
      changeSetStore.getState().componentClipboard?.rootComponentId === 'comp-launch-task-card',
    'review lock blocked the non-mutating component copy operation',
  )
  let invalidSourceRejected = false
  try {
    changeSetStore.getState().dispatchToChangeSet(lockChangeSet.id, {
      type: 'updateScreen',
      screenId: 'screen-list',
      name: 'Must not be previewed',
    }, 'human')
  } catch (error) {
    invalidSourceRejected = error?.code === 'INVALID_CHANGE_SET_SOURCE'
  }
  assert(
    invalidSourceRejected &&
      changeSetStore.getState().activeChangeSet?.operations.length === 0,
    'the central change set API accepted a human operation',
  )
  changeSetStore.getState().setActiveScreen('screen-edit')
  changeSetStore.getState().setActiveState('scenario-edit-saving')
  changeSetStore.getState().selectScreenComponent('comp-save-btn')
  changeSetStore.getState().setReviewDraftProtected('regression-dialog', true)
  changeSetStore.getState().dispatchToChangeSet(lockChangeSet.id, {
    type: 'removeScreenState',
    stateId: 'scenario-edit-saving',
  })
  changeSetStore.getState().dispatchToChangeSet(lockChangeSet.id, {
    type: 'removeComponent',
    componentId: 'comp-save-btn',
  })
  assert(
    changeSetStore.getState().ui.activeScreenId === 'screen-edit' &&
      changeSetStore.getState().ui.activeStateId === 'scenario-edit-saving' &&
      changeSetStore.getState().ui.selection?.componentId === 'comp-save-btn' &&
      !changeSetStore.getState().effectiveDocument.screenScenarios['scenario-edit-saving'] &&
      !changeSetStore.getState().effectiveDocument.components['comp-save-btn'],
    'agent preview removal discarded the confirmed dialog selection or state context',
  )
  changeSetStore.getState().rejectChangeSet()
  assert(
    changeSetStore.getState().ui.activeStateId === 'scenario-edit-saving' &&
      changeSetStore.getState().ui.selection?.componentId === 'comp-save-btn' &&
      changeSetStore.getState().effectiveDocument.screenScenarios['scenario-edit-saving'] &&
      changeSetStore.getState().effectiveDocument.components['comp-save-btn'],
    'Reject did not restore a preview-removed dialog selection or state context',
  )
  changeSetStore.getState().setReviewDraftProtected('regression-dialog', false)
  const documentBeforeEmptyAccept = changeSetStore.getState().document
  const revisionBeforeEmptyAccept = changeSetStore.getState().revision
  const historyBeforeEmptyAccept = changeSetStore.getState().history
  changeSetStore.getState().beginChangeSet('Empty review')
  changeSetStore.getState().acceptChangeSet()
  assert(
    changeSetStore.getState().document === documentBeforeEmptyAccept &&
      changeSetStore.getState().revision === revisionBeforeEmptyAccept &&
      changeSetStore.getState().history === historyBeforeEmptyAccept &&
      changeSetStore.getState().activeChangeSet === null,
    'accepting an empty change set changed the document revision or history',
  )
  changeSetStore.getState().selectScreenComponent('comp-save-btn')
  changeSetStore.getState().setReviewDraftProtected('accepted-dialog', true)
  const acceptedRemoval = changeSetStore.getState().beginChangeSet('Accepted dialog removal')
  changeSetStore.getState().dispatchToChangeSet(acceptedRemoval.id, {
    type: 'removeComponent',
    componentId: 'comp-save-btn',
  })
  changeSetStore.getState().acceptChangeSet()
  assert(
    changeSetStore.getState().ui.selection?.componentId === 'comp-save-btn' &&
      changeSetStore.getState().reviewDraftDocument?.components['comp-save-btn'] &&
      !changeSetStore.getState().document.components['comp-save-btn'],
    'Accept discarded a protected dialog before its stale draft could be closed',
  )
  changeSetStore.getState().setReviewDraftProtected('accepted-dialog', false)
  assert(
    changeSetStore.getState().ui.selection === null &&
      changeSetStore.getState().reviewDraftDocument === null,
    'closing an accepted stale dialog did not reconcile its removed selection',
  )

  memoryStorage.clear()
  const screenStore = await freshStore('direct-edit-screens')
  screenStore.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-edit',
    name: 'Task editor',
    route: '/tasks/:taskId/details',
  })

  await test('human state editing persists overrides and protects the default state', async () => {
    {
      memoryStorage.clear()
      const scenarioStore = await freshStore('human-scenario-editing')
      const initialRevisionValue = scenarioStore.getState().revision
      scenarioStore.getState().dispatch({
        type: 'createScreenState',
        stateId: 'scenario-human-error',
        screenId: 'screen-list',
        name: 'Request failed',
        description: 'Created in the human UI',
      }, 'Create scenario')
      scenarioStore.getState().setActiveState('scenario-human-error')
      scenarioStore.getState().dispatch({
        type: 'updateScreenState',
        stateId: 'scenario-human-error',
        name: 'Request complete',
        description: 'Updated in the human UI',
        overrides: [{
          target: { type: 'inline', componentId: 'comp-list-summary' },
          override: { visible: true, enabled: false, text: 'Tasks loaded.' },
        }],
      }, 'Update scenario')
      const scenario = scenarioStore.getState().document.screenScenarios['scenario-human-error']
      assert(
        scenarioStore.getState().ui.activeStateId === 'scenario-human-error' &&
          scenarioStore.getState().document.screens['screen-list'].scenarioIds.includes(
            'scenario-human-error',
          ) &&
          scenario.componentOverrides[0].override.text === 'Tasks loaded.',
        'created scenario was not selected, listed, or updated',
      )
      const { effectiveComponent } = await import(
        moduleUrl(selectorsBundle, 'scenario-override-preview')
      )
      const effectiveText = effectiveComponent(
        scenarioStore.getState().document,
        scenarioStore.getState().document.components['comp-list-summary'],
        scenario,
      )
      assert(
        effectiveText.config.text === 'Tasks loaded.' &&
          effectiveText.common.enabled === false,
        'scenario override was not reflected in the effective component',
      )
      scenarioStore.getState().dispatch({
        type: 'updateScreenState',
        stateId: 'scenario-human-error',
        overrides: [],
      }, 'Clear scenario overrides')
      const reloadedScenarioStore = await freshStore('human-scenario-editing-reload')
      assert(
        reloadedScenarioStore.getState().document.screenScenarios['scenario-human-error']
          .componentOverrides.length === 0 &&
          reloadedScenarioStore.getState().revision > initialRevisionValue,
        'scenario edits were not persisted',
      )
      reloadedScenarioStore.getState().setActiveState('scenario-human-error')
      reloadedScenarioStore.getState().dispatch({
        type: 'removeScreenState',
        stateId: 'scenario-human-error',
      }, 'Delete scenario')
      assert(
        !reloadedScenarioStore.getState().document.screenScenarios['scenario-human-error'] &&
          reloadedScenarioStore.getState().ui.activeStateId === null,
        'scenario delete did not reconcile the active scenario',
      )
      return
    }
    memoryStorage.clear()
    const store = await freshStore('human-state-editing')
    const initialRevision = store.getState().document.revision

    store.getState().dispatch({
      type: 'createScreenState',
      stateId: 'state-human-error',
      screenId: 'screen-list',
      name: 'Request failed',
      description: 'Created in the human UI',
    }, 'Create state')
    store.getState().setActiveState('state-human-error')
    assert(
      store.getState().ui.activeStateId === 'state-human-error' &&
        store.getState().document.screens['screen-list'].stateIds.includes('state-human-error'),
      'created state was not selected or listed',
    )

    store.getState().dispatch({
      type: 'updateScreenState',
      stateId: 'state-human-error',
      name: 'Request complete',
      description: 'Updated in the human UI',
      overrides: {
        'comp-list-title': {
          visible: true,
          enabled: false,
          text: 'Tasks loaded.',
        },
      },
    }, 'Update state')
    const updated = store.getState().document.screenStates['state-human-error']
    assert(
      updated.name === 'Request complete' &&
        updated.description === 'Updated in the human UI' &&
        updated.componentOverrides['comp-list-title'].text === 'Tasks loaded.',
      'state metadata or overrides were not updated',
    )

    const { effectiveComponent } = await import(moduleUrl(selectorsBundle, 'state-override-preview'))
    const effectiveText = effectiveComponent(
      store.getState().document.components['comp-list-title'],
      updated,
    )
    assert(
      effectiveText.config.text === 'Tasks loaded.' &&
        effectiveText.common.enabled === false,
      'state override was not reflected in the effective component',
    )
    const successMessage = effectiveComponent(
      store.getState().document.components['comp-status-message'],
      store.getState().document.screenStates['state-edit-success'],
    )
    const successMessageText =
      store.getState().document.components['comp-status-message-text']
    assert(
      successMessage.common.visible === true &&
        successMessageText.config.text === 'Task updated successfully.',
      'message visibility or text content was not reflected in the preview',
    )
    const savingState = store.getState().document.screenStates['state-edit-saving']
    store.getState().dispatch({
      type: 'updateScreenState',
      stateId: savingState.id,
      overrides: {
        ...savingState.componentOverrides,
        'comp-task-title-input': { value: 'Alex Morgan' },
      },
    }, 'Set state field value')
    const effectiveInput = effectiveComponent(
      store.getState().document.components['comp-task-title-input'],
      store.getState().document.screenStates['state-edit-saving'],
    )
    assert(
      effectiveInput.config.defaultValue === 'Alex Morgan',
      'field value override was not reflected in the preview',
    )

    store.getState().dispatch({
      type: 'updateScreenState',
      stateId: 'state-human-error',
      overrides: {},
    }, 'Clear state overrides')
    assert(
      Object.keys(
        store.getState().document.screenStates['state-human-error'].componentOverrides,
      ).length === 0,
      'cleared state overrides left an empty component entry',
    )

    const beforeDefaultDescription = store.getState().document.revision
    const originalDefaultDescription =
      store.getState().document.screenStates['state-list-default'].description
    store.getState().dispatch({
      type: 'updateScreenState',
      stateId: 'state-list-default',
      description: 'Base task-list experience',
    }, 'Update default state description')
    assert(
      store.getState().document.revision === beforeDefaultDescription + 1 &&
        store.getState().document.screenStates['state-list-default'].name === 'Default' &&
        store.getState().document.screenStates['state-list-default'].description ===
          'Base task-list experience',
      'default state description metadata was not updated without renaming the state',
    )
    store.getState().undo()
    assert(
      store.getState().document.screenStates['state-list-default'].description ===
        originalDefaultDescription,
      'Undo did not restore the default state description',
    )
    store.getState().redo()
    assert(
      store.getState().document.screenStates['state-list-default'].description ===
        'Base task-list experience',
      'Redo did not restore the default state description',
    )

    const beforeDefaultEdit = store.getState().document.revision
    store.getState().dispatch({
      type: 'updateScreenState',
      stateId: 'state-list-default',
      overrides: { 'comp-list-title': { text: 'Not allowed' } },
    }, 'Invalid default state edit')
    store.getState().dispatch({
      type: 'removeScreenState',
      stateId: 'state-list-default',
    }, 'Invalid default state delete')
    assert(
      store.getState().document.revision === beforeDefaultEdit &&
        store.getState().document.screenStates['state-list-default'] !== undefined &&
        store.getState().document.screens['screen-list'].defaultStateId === 'state-list-default',
      'default state was modified or deleted',
    )

    const reloaded = await freshStore('human-state-editing-reload')
    assert(
      reloaded.getState().document.screenStates['state-human-error'].name === 'Request complete' &&
        reloaded.getState().document.screenStates['state-list-default'].description ===
          'Base task-list experience' &&
        reloaded.getState().document.revision > initialRevision,
      'state edits were not persisted',
    )

    const stateReview = reloaded.getState().beginChangeSet('AI state change set edit')
    const confirmedDescription =
      reloaded.getState().document.screenStates['state-human-error'].description
    reloaded.getState().dispatchToChangeSet(stateReview.id, {
      type: 'updateScreenState',
      stateId: 'state-human-error',
      description: 'Edited during review',
    })
    assert(
      reloaded.getState().activeChangeSet?.operations.at(-1)?.source === 'agent' &&
        reloaded.getState().document.screenStates['state-human-error'].description ===
          confirmedDescription &&
        reloaded.getState().effectiveDocument.screenStates['state-human-error'].description ===
          'Edited during review',
      'agent state edit did not stay inside the active change set',
    )
    reloaded.getState().rejectChangeSet()
    reloaded.getState().setActiveState('state-human-error')
    reloaded.getState().dispatch({
      type: 'removeScreenState',
      stateId: 'state-human-error',
    }, 'Delete state')
    assert(
      reloaded.getState().document.screenStates['state-human-error'] === undefined &&
        reloaded.getState().ui.activeStateId === 'state-list-default',
      'state delete did not remove the state or reconcile the active state',
    )
  })
  screenStore.getState().dispatch({
    type: 'removeEvent',
    eventId: 'event-discard-task-changes',
  })
  screenStore.getState().dispatch({
    type: 'removeScreen',
    screenId: 'screen-list',
  })
  assert(
    screenStore.getState().document.screens['screen-edit'].name === 'Task editor' &&
      screenStore.getState().document.screens['screen-list'] === undefined &&
      screenStore.getState().ui.activeScreenId === 'screen-edit',
    'screen edit, delete, or active-screen reconciliation failed',
  )
})

await test('review lock static coverage is limited to non-DOM draft recovery wiring', async () => {
  // These recovery paths depend on persisted revision metadata and preview-removed entities.
  // Interactive controls and DnD are covered by the mounted App behavior test below.
  const sources = Object.fromEntries([
    'src/app/App.tsx',
    'src/features/screens/ScreenList.tsx',
    'src/features/inspector/Inspector.tsx',
    'src/components/DraftTextField.tsx',
  ].map(path => [path, readFileSync(join(root, path), 'utf8')]))
  assert(
    !sources['src/app/App.tsx'].includes("key={activeChangeSet?.id ?? 'editable'}") &&
      sources['src/components/DraftTextField.tsx'].includes(
        'revision !== baselineRevision',
      ) &&
      sources['src/components/DraftTextField.tsx'].includes(
        "revision: typeof parsed.revision === 'number' ? parsed.revision : null",
      ) &&
      sources['src/features/inspector/Inspector.tsx'].includes('inspectorDocument') &&
      sources['src/features/inspector/Inspector.tsx'].includes('reviewDraftDocument') &&
      sources['src/features/inspector/Inspector.tsx'].includes(
        'protectedActiveStateMissing',
      ) &&
      sources['src/features/inspector/Inspector.tsx'].includes(
        'inspectorDialogProtected',
      ) &&
      sources['src/features/screens/ScreenList.tsx'].includes(
        'reviewDraftDocument.screens',
      ),
    'non-DOM draft recovery wiring is incomplete',
  )
})

await test('mounted App review lock blocks mutations while preserving UI-only interaction', async () => {
  memoryStorage.clear()
  installStorage(memoryStorage)
  const document = installInteractiveDom()
  let nextAnimationFrameId = 1
  const deferAnimationFrame = () => nextAnimationFrameId++
  Object.defineProperties(globalThis, {
    requestAnimationFrame: {
      configurable: true,
      writable: true,
      value: deferAnimationFrame,
    },
    cancelAnimationFrame: {
      configurable: true,
      writable: true,
      value: () => {},
    },
  })
  const { mountReviewLockApp } = await import(
    moduleUrl(renderAppBundle, 'review-lock-surfaces')
  )
  const harness = mountReviewLockApp('en')
  harness.prepareHistory()

  const unlockedTreeHandle = document.querySelector(
    '[data-drag-surface="tree"][data-drag-component="comp-task-name-input"]',
  )
  assert(unlockedTreeHandle && !unlockedTreeHandle.disabled, 'Tree drag did not begin unlocked')
  const unlockedCanvasComponent = document.querySelector(
    '[data-component-id="comp-task-name-input"]',
  )
  const unlockedCanvasRoot = document.querySelector(
    '[data-component-id="comp-edit-page"]',
  )
  assert(
    unlockedCanvasComponent?.getAttribute('tabindex') === '0' &&
      unlockedCanvasComponent.getAttribute('role') === 'button' &&
      unlockedCanvasRoot?.getAttribute('tabindex') === '-1' &&
      !unlockedCanvasRoot.hasAttribute('role'),
    'Canvas unlocked component or root semantics are incomplete',
  )
  assert(
    unlockedCanvasComponent.hasAttribute('data-canvas-draggable') &&
      unlockedCanvasComponent.className.includes('draggable'),
    'Canvas unlocked component has no draggable cursor affordance',
  )
  const assertVisibleDropSurface = expectedSurface => {
    const visibleZones = [...document.querySelectorAll('[data-drop-visible="true"]')]
    assert(
      visibleZones.length > 0 &&
        visibleZones.every(
          zone => zone.getAttribute('data-drop-surface') === expectedSurface,
        ) &&
        [...document.querySelectorAll(
          `[data-drop-surface]:not([data-drop-surface="${expectedSurface}"])`,
        )].every(
          zone =>
            !zone.hasAttribute('data-drop-visible') &&
            !zone.hasAttribute('data-drop-outcome'),
        ),
      `${expectedSurface} drag exposed an opposite-surface drop target`,
    )
  }

  const unlockedPalette = document.querySelector('[data-palette-kind="text"]')
  harness.pointer(unlockedPalette, 'pointerdown', { clientX: 120, clientY: 200 })
  harness.pointer(document, 'pointermove', { clientX: 132, clientY: 212 })
  await Promise.resolve()
  assertVisibleDropSurface('canvas')
  harness.keyDown(document, 'Escape', { code: 'Escape' })

  harness.pointer(
    unlockedCanvasComponent,
    'pointerdown',
    { clientX: 600, clientY: 400 },
  )
  harness.pointer(document, 'pointermove', { clientX: 612, clientY: 412 })
  await Promise.resolve()
  assertVisibleDropSurface('canvas')
  harness.keyDown(document, 'Escape', { code: 'Escape' })

  unlockedTreeHandle.focus()
  harness.keyDown(unlockedTreeHandle, ' ', { code: 'Space' })
  await Promise.resolve()
  assertVisibleDropSurface('tree')
  harness.keyDown(document, 'Escape', { code: 'Escape' })

  harness.pointer(unlockedTreeHandle, 'pointerdown', { clientX: 400, clientY: 300 })
  harness.pointer(
    document,
    'pointermove',
    { clientX: 412, clientY: 312 },
  )
  await Promise.resolve()
  assertVisibleDropSurface('tree')
  assert(
    document.selectionClearCount > 0,
    `pointer Tree DnD did not activate its sensor ` +
      `(selection clears: ${document.selectionClearCount})`,
  )

  let reviewCancelEvents = 0
  document.addEventListener('keydown', event => {
    if (event.code === 'Escape') reviewCancelEvents += 1
  })
  harness.beginReview()
  await Promise.resolve()
  assert(
    reviewCancelEvents === 1,
    'starting a change set did not cancel in-flight pointer DnD',
  )
  const lockedSnapshot = harness.protectedSnapshot()
  const expectProtected = (label, action) => {
    action()
    assert(
      harness.protectedSnapshot() === lockedSnapshot,
      `${label} changed document, base, operations, version, history, or persisted data`,
    )
  }

  const lockStatus = [...document.querySelectorAll('[role="status"]')]
    .find(node => node.textContent.includes('Editing is locked'))
  assert(lockStatus, 'mounted App does not expose its review lock status')
  const edgeFocusControls = [
    ...document.querySelectorAll(
      'aside[aria-label="Project navigation"] h2 > button[aria-expanded]',
    ),
    ...document.querySelectorAll(
      'aside[aria-label="Details"] [role="group"][aria-label="Details view"] > button',
    ),
  ]
  assert(
    edgeFocusControls.length === 4,
    `expected four edge-aligned focus controls, found ${edgeFocusControls.length}`,
  )
  for (const control of edgeFocusControls) {
    control.focus()
    assert(document.activeElement === control, 'edge-aligned control is not keyboard focusable')
  }

  const screensRegion = document.querySelector('[role="region"][aria-label="Screens"]')
  const screenInputs = [...screensRegion.querySelectorAll('input')]
  const screenButtons = [...screensRegion.querySelectorAll('button')]
  const addScreen = screenButtons.find(button => button.textContent.includes('Add screen'))
  const deleteScreen = screenButtons.find(button => button.textContent.includes('Delete screen'))
  assert(
    screenInputs.length === 2 &&
      screenInputs.every(input => input.disabled) &&
      addScreen?.disabled &&
      deleteScreen?.disabled,
    'Screen mutation controls remain enabled during review',
  )
  expectProtected('disabled Screen add', () => harness.click(addScreen))
  expectProtected('disabled Screen delete', () => harness.click(deleteScreen))

  const paletteButtons = [...document.querySelectorAll('[data-palette-kind]')]
  assert(
    paletteButtons.length > 0 && paletteButtons.every(button => button.disabled),
    'Palette drag controls remain enabled during review',
  )
  expectProtected('locked Palette pointer drag', () => {
    harness.pointer(paletteButtons[0], 'pointerdown')
    harness.pointer(window, 'pointermove', { clientX: 160, clientY: 160 })
    harness.pointer(window, 'pointerup', { clientX: 160, clientY: 160 })
  })

  const tree = document.querySelector('[role="tree"]')
  const treeHandles = [...tree.querySelectorAll('[data-drag-surface="tree"]')]
  assert(
    treeHandles.length > 0 && treeHandles.every(button => button.disabled),
    'Tree drag controls remain enabled during review',
  )
  const treeNode = tree.querySelector('[data-tree-component-id="comp-task-name-input"]')
  const treeItem = treeNode.closest('[role="treeitem"]')
  const treeMutationButtons = [...treeItem.querySelectorAll('button')]
    .filter(button => (
      button.getAttribute('aria-label')?.startsWith('Move') ||
      button.getAttribute('aria-label')?.startsWith('Delete')
    ))
  assert(
    treeMutationButtons.length >= 2 && treeMutationButtons.every(button => button.disabled),
    'Tree move or delete controls remain enabled during review',
  )
  for (const button of treeMutationButtons) {
    expectProtected(`locked Tree action ${button.getAttribute('aria-label')}`, () => {
      harness.click(button)
    })
  }
  expectProtected('locked Tree keyboard drag', () => {
    harness.keyDown(treeHandles[0], ' ', { code: 'Space' })
  })
  assert(!document.querySelector('[data-drag-overlay]'), 'locked Tree keyboard DnD started')

  const canvasComponent = document.querySelector('[data-component-id="comp-task-name-input"]')
  assert(
    canvasComponent &&
      !canvasComponent.hasAttribute('data-canvas-draggable') &&
      !canvasComponent.hasAttribute('data-drag-surface') &&
      !canvasComponent.hasAttribute('data-canvas-dragging') &&
      canvasComponent.getAttribute('tabindex') === '-1' &&
      !canvasComponent.hasAttribute('role') &&
      !canvasComponent.className.includes('draggable') &&
      !canvasComponent.className.includes('dragging'),
    'Canvas component retains drag semantics or cursor affordance during review',
  )
  const lockedCanvasRoot = document.querySelector('[data-component-id="comp-edit-page"]')
  assert(
    lockedCanvasRoot?.getAttribute('tabindex') === '-1' &&
      !lockedCanvasRoot.hasAttribute('role'),
    'Canvas root entered the review-mode tab order',
  )
  expectProtected('locked Canvas pointer drag', () => {
    harness.pointer(canvasComponent, 'pointerdown')
    harness.pointer(window, 'pointermove', { clientX: 180, clientY: 180 })
    harness.pointer(window, 'pointerup', { clientX: 180, clientY: 180 })
  })
  assert(
    !document.querySelector('[data-drag-overlay]') &&
      !canvasComponent.hasAttribute('data-canvas-dragging'),
    'locked Canvas pointer movement started visual drag feedback',
  )
  const canvasMenuTarget = document.querySelector('[data-component-id="comp-edit-summary"]')
  harness.contextMenu(canvasMenuTarget)
  const canvasLockedMenu = document.querySelector('[data-component-add-menu]')
  assert(
    harness.state().selectedComponentId === 'comp-edit-summary' &&
      canvasLockedMenu?.querySelector('[data-component-copy]') &&
      !canvasLockedMenu.querySelector('[data-component-duplicate]') &&
      !canvasLockedMenu.querySelector('[data-component-paste]') &&
      !canvasLockedMenu.querySelector('[data-component-delete]') &&
      !canvasLockedMenu.querySelector('[data-insert-placement]'),
    'review-mode Canvas pointer context menu or selection is unavailable: ' +
      JSON.stringify({
        selected: harness.state().selectedComponentId,
        menu: Boolean(canvasLockedMenu),
        copy: Boolean(canvasLockedMenu?.querySelector('[data-component-copy]')),
        duplicate: Boolean(canvasLockedMenu?.querySelector('[data-component-duplicate]')),
        paste: Boolean(canvasLockedMenu?.querySelector('[data-component-paste]')),
        delete: Boolean(canvasLockedMenu?.querySelector('[data-component-delete]')),
        insert: Boolean(canvasLockedMenu?.querySelector('[data-insert-placement]')),
      }),
  )
  harness.keyDown(canvasLockedMenu, 'Escape', { code: 'Escape' })
  assert(
    !document.querySelector('[data-component-add-menu]'),
    'Canvas context menu did not close before continuing review interactions',
  )

  const editSuccessState = document.querySelector('button[aria-label="Edit Success"]')
  const defaultStateTab = document.querySelector('[data-state-id="base"]')
  harness.click(defaultStateTab)
  const stateMutationButtons = [
    document.querySelector('button[aria-label="Add state"]'),
    editSuccessState,
  ]
  assert(
    stateMutationButtons.every(button => button?.disabled),
    'State mutation controls remain enabled during review',
  )
  for (const button of stateMutationButtons) {
    expectProtected(`locked State action ${button.getAttribute('aria-label')}`, () => {
      harness.click(button)
    })
  }
  const canvasSelectionTarget = document.querySelector('[data-component-id="comp-save-btn"]')
  harness.click(canvasSelectionTarget)
  assert(
    harness.state().selectedComponentId === 'comp-save-btn',
    'review lock incorrectly blocked Canvas selection',
  )
  const rightPanelTabs = document.querySelector(
    'aside[aria-label="Details"] [role="group"][aria-label="Details view"]',
  )
  harness.click(rightPanelTabs.querySelectorAll('button')[0])
  assert(
    harness.state().rightPanelTab === 'inspector',
    'review lock incorrectly blocked Inspector/Changes navigation',
  )
  const inspector = document.querySelector('aside[aria-label="Details"]')
  const inspectorFieldsets = [...inspector.querySelectorAll('fieldset')]
  assert(
    inspectorFieldsets.length > 0 &&
      inspectorFieldsets.every(fieldset => fieldset.hasAttribute('disabled')),
    'Inspector left a mutation fieldset enabled',
  )
  assert(
    !inspector.querySelector(
      [
        '[data-component-copy-inspector]',
        '[data-component-duplicate-inspector]',
        '[data-component-paste-inspector]',
        '[data-component-delete-inspector]',
      ].join(','),
    ),
    'Inspector still exposes component operation buttons',
  )

  const copyableTreeNode = tree.querySelector('[data-tree-component-id="comp-edit-summary"]')
  harness.contextMenu(copyableTreeNode)
  const lockedMenu = document.querySelector('[data-component-add-menu]')
  assert(
    lockedMenu?.querySelector('[role="note"]') &&
      lockedMenu.querySelector('[data-component-copy]') &&
      !lockedMenu.querySelector('[data-component-duplicate]') &&
      !lockedMenu.querySelector('[data-component-paste]') &&
      !lockedMenu.querySelector('[data-component-delete]') &&
      !lockedMenu.querySelector('[data-insert-placement]'),
    'locked context menu exposes mutation actions or hides Copy',
  )
  expectProtected('context menu Copy', () => {
    harness.click(lockedMenu.querySelector('[data-component-copy]'))
  })
  assert(
    harness.state().clipboardRootComponentId === 'comp-edit-summary',
    'review lock incorrectly blocked context-menu Copy',
  )

  const shortcutTarget = document.querySelector('[data-hierarchy-shortcut-scope="canvas"]')
  for (const [label, key, init] of [
    ['Delete shortcut', 'Delete', { code: 'Delete' }],
    ['Duplicate shortcut', 'd', { code: 'KeyD', metaKey: true }],
    ['Paste shortcut', 'v', { code: 'KeyV', metaKey: true }],
    ['Undo shortcut', 'z', { code: 'KeyZ', metaKey: true }],
  ]) {
    expectProtected(label, () => {
      const event = harness.keyDown(shortcutTarget, key, init)
      assert(event.defaultPrevented, `${label} was not handled as a locked mutation`)
    })
  }
  assert(
    !harness.state().pendingDelete &&
      harness.state().toastKey === 'changes.editLocked' &&
      harness.state().operationCount === 0 &&
      harness.state().changeSetVersion === 0,
    'locked shortcuts created deletion state, operations, or version changes',
  )

  const sectionTreeNode = tree.querySelector('[data-tree-component-id="comp-edit-page"]')
  const disclosure = sectionTreeNode.closest('[role="treeitem"]').querySelector(
    'button[aria-expanded]',
  )
  const expandedBefore = disclosure.getAttribute('aria-expanded')
  harness.click(disclosure)
  assert(
    disclosure.getAttribute('aria-expanded') !== expandedBefore,
    'review lock incorrectly blocked Tree collapse',
  )

  const zoomIn = document.querySelector('button[title="Zoom in"]')
  const zoomGroup = zoomIn.closest('[role="group"]')
  const zoomBefore = zoomGroup.textContent
  harness.click(zoomIn)
  assert(zoomGroup.textContent !== zoomBefore, 'review lock incorrectly blocked Canvas zoom')

  harness.keyDown(shortcutTarget, ' ', { code: 'Space' })
  const panViewport = document.querySelector('[data-pan-ready]')
  assert(panViewport, 'review lock incorrectly blocked Space pan mode')
  const surface = panViewport.firstElementChild
  const transformBefore = surface.getAttribute('style')
  harness.pointer(panViewport, 'pointerdown', { clientX: 100, clientY: 100 })
  assert(panViewport.hasAttribute('data-panning'), 'review lock blocked Canvas pan start')
  harness.pointer(window, 'pointermove', { clientX: 140, clientY: 135 })
  assert(surface.getAttribute('style') !== transformBefore, 'review lock blocked Canvas pan move')
  harness.pointer(window, 'pointerup', { clientX: 140, clientY: 135 })
  harness.keyUp(shortcutTarget, ' ', { code: 'Space' })

  const viewSwitch = document.querySelector('[data-editor-view-switch]')
  harness.click(viewSwitch.querySelectorAll('button')[1])
  assert(
    document.querySelector('[data-editor-view="screen"]').hidden &&
      !document.querySelector('[data-editor-view="flow"]').hidden,
    'review lock incorrectly blocked Flow view switching',
  )

  const otherScreen = screenButtons.find(button => button.textContent.trim() === 'Task List')
  harness.click(otherScreen)
  assert(
    harness.state().activeScreenId === 'screen-list' &&
      document.querySelector('[data-canvas-surface]')
        ?.getAttribute('data-viewport-initialized') === 'true',
    'review lock blocked Screen selection or left its Canvas viewport uninitialized',
  )
  const finalProtectedSnapshot = harness.protectedSnapshot()
  const protectedBefore = JSON.parse(lockedSnapshot)
  const protectedAfter = JSON.parse(finalProtectedSnapshot)
  const changedProtectedKeys = Object.keys(protectedBefore)
    .filter(key => JSON.stringify(protectedBefore[key]) !== JSON.stringify(protectedAfter[key]))
  assert(
    finalProtectedSnapshot === lockedSnapshot,
    `UI-only review interactions changed protected document state: ${changedProtectedKeys.join(', ')}`,
  )
  harness.unmount()
})

await test('Canvas DOM supports discoverable pan without stealing component or inner-scroll input', async () => {
  memoryStorage.clear()
  installStorage(memoryStorage)
  const document = installInteractiveDom()
  let nextAnimationFrameId = 1
  Object.defineProperties(globalThis, {
    requestAnimationFrame: {
      configurable: true,
      writable: true,
      value: () => nextAnimationFrameId++,
    },
    cancelAnimationFrame: {
      configurable: true,
      writable: true,
      value: () => {},
    },
  })
  const { mountReviewLockApp } = await import(
    moduleUrl(renderAppBundle, 'canvas-pan-gestures')
  )
  const harness = mountReviewLockApp('en')
  const viewport = document.querySelector('[data-canvas-viewport]')
  const surface = document.querySelector('[data-canvas-surface]')
  const component = document.querySelector('[data-component-id="comp-task-name-input"]')
  const previewInput = component.querySelector('input')
  assert(
    viewport &&
      surface?.getAttribute('data-viewport-initialized') === 'true' &&
      viewport.querySelector('[data-editor-chrome][role="group"]')
        ?.getAttribute('title')?.includes('dragging empty canvas'),
    'Canvas did not expose an initialized, discoverable pan surface',
  )

  const initialTransform = surface.getAttribute('style')
  harness.pointer(viewport, 'pointerdown', { clientX: 100, clientY: 100 })
  assert(viewport.hasAttribute('data-panning'), 'empty-background primary drag did not start pan')
  harness.pointer(window, 'pointermove', { clientX: 145, clientY: 130 })
  harness.pointer(window, 'pointerup', { clientX: 145, clientY: 130 })
  const backgroundPanTransform = surface.getAttribute('style')
  assert(
    backgroundPanTransform !== initialTransform && !viewport.hasAttribute('data-panning'),
    'empty-background primary drag did not move and finish Canvas pan',
  )
  harness.click(viewport)
  assert(
    harness.state().selectedComponentId === 'comp-task-name-input',
    'pan tail click incorrectly cleared Canvas selection',
  )
  harness.click(viewport)
  assert(
    harness.state().selectedComponentId === null,
    'stationary empty-background click no longer clears Canvas selection',
  )

  harness.click(component)
  const beforeComponentDrag = surface.getAttribute('style')
  harness.pointer(component, 'pointerdown', { clientX: 240, clientY: 220 })
  harness.pointer(window, 'pointermove', { clientX: 275, clientY: 245 })
  harness.pointer(window, 'pointerup', { clientX: 275, clientY: 245 })
  assert(
    surface.getAttribute('style') === beforeComponentDrag,
    'ordinary component primary drag was stolen by Canvas pan',
  )

  harness.pointer(component, 'pointerdown', {
    button: 1,
    buttons: 4,
    pointerId: 2,
    clientX: 240,
    clientY: 220,
  })
  harness.pointer(window, 'pointermove', {
    button: 1,
    buttons: 4,
    pointerId: 2,
    clientX: 270,
    clientY: 245,
  })
  harness.pointer(window, 'pointerup', {
    button: 1,
    buttons: 0,
    pointerId: 2,
    clientX: 270,
    clientY: 245,
  })
  const middlePanTransform = surface.getAttribute('style')
  assert(
    middlePanTransform !== beforeComponentDrag,
    'middle drag over a component did not pan the Canvas',
  )
  const otherComponent = document.querySelector('[data-component-id="comp-task-status-select"]')
  harness.click(otherComponent)
  assert(
    harness.state().selectedComponentId === 'comp-task-status-select',
    'middle pan swallowed the next primary Canvas click',
  )
  const zoomControl = viewport.querySelector('button[title="Zoom in"]')
  harness.pointer(zoomControl, 'pointerdown', {
    button: 1,
    buttons: 4,
    pointerId: 5,
    clientX: 300,
    clientY: 280,
  })
  harness.pointer(window, 'pointermove', {
    button: 1,
    buttons: 4,
    pointerId: 5,
    clientX: 320,
    clientY: 295,
  })
  harness.pointer(window, 'pointerup', {
    button: 1,
    buttons: 0,
    pointerId: 5,
    clientX: 320,
    clientY: 295,
  })
  assert(
    surface.getAttribute('style') !== middlePanTransform,
    'middle drag over Canvas controls did not pan',
  )

  harness.keyDown(window, ' ', { code: 'Space' })
  assert(viewport.hasAttribute('data-pan-ready'), 'Space did not expose Canvas pan mode')
  const beforeSpacePan = surface.getAttribute('style')
  harness.pointer(component, 'pointerdown', {
    pointerId: 3,
    clientX: 260,
    clientY: 230,
  })
  harness.pointer(window, 'pointermove', {
    pointerId: 3,
    clientX: 280,
    clientY: 250,
  })
  harness.pointer(window, 'pointerup', {
    pointerId: 3,
    clientX: 280,
    clientY: 250,
  })
  harness.keyUp(window, ' ', { code: 'Space' })
  const spacePanTransform = surface.getAttribute('style')
  assert(spacePanTransform !== beforeSpacePan, 'Space drag over Canvas content did not pan')
  harness.click(component)
  assert(
    surface.getAttribute('style') === spacePanTransform &&
      harness.state().selectedComponentId === 'comp-task-status-select',
    'Space-pan tail click incorrectly changed Canvas selection',
  )
  harness.click(component)
  assert(
    harness.state().selectedComponentId === 'comp-task-name-input',
    'Space-pan click suppression did not clear after the compatibility click',
  )
  harness.click(zoomControl)
  const postSuppressionZoomTransform = surface.getAttribute('style')
  assert(
    postSuppressionZoomTransform !== spacePanTransform,
    'Space-pan click suppression did not clear after the compatibility click',
  )

  const backgroundWheel = harness.wheel(viewport, { deltaX: 18, deltaY: 24 })
  const wheelPanTransform = surface.getAttribute('style')
  assert(
    backgroundWheel.defaultPrevented && wheelPanTransform !== postSuppressionZoomTransform,
    'background wheel/trackpad input did not pan the Canvas',
  )
  const innerWheel = harness.wheel(previewInput, { deltaY: 60 })
  assert(
    !innerWheel.defaultPrevented && surface.getAttribute('style') === wheelPanTransform,
    'Canvas stole wheel input from a preview component',
  )
  const zoomWheel = harness.wheel(previewInput, {
    ctrlKey: true,
    deltaY: -100,
    clientX: 300,
    clientY: 300,
  })
  assert(
    zoomWheel.defaultPrevented && surface.getAttribute('style') !== wheelPanTransform,
    'Ctrl/Meta wheel over content no longer zooms at the pointer',
  )

  harness.pointer(viewport, 'pointerdown', {
    pointerId: 4,
    clientX: 100,
    clientY: 100,
  })
  harness.pointer(window, 'pointermove', {
    pointerId: 4,
    clientX: 130,
    clientY: 125,
  })
  harness.pointer(window, 'pointercancel', {
    pointerId: 4,
    clientX: 130,
    clientY: 125,
  })
  assert(!viewport.hasAttribute('data-panning'), 'pointer cancellation left Canvas pan active')
  harness.click(viewport)
  assert(
    harness.state().selectedComponentId === null,
    'canceled pan swallowed the next primary Canvas click',
  )
  harness.unmount()
})

await test('Canvas Containers expose persistent selectable and droppable structure', async () => {
  memoryStorage.clear()
  installStorage(memoryStorage)
  const document = installInteractiveDom()
  Object.defineProperties(globalThis, {
    requestAnimationFrame: {
      configurable: true,
      writable: true,
      value: () => 1,
    },
    cancelAnimationFrame: {
      configurable: true,
      writable: true,
      value: () => {},
    },
  })
  const { mountReviewLockApp } = await import(
    moduleUrl(renderAppBundle, 'canvas-container-affordance')
  )
  const harness = mountReviewLockApp('en')
  harness.addContainerAffordanceFixture()

  const empty = document.querySelector(
    '[data-component-id="regression-empty-container"]',
  )
  const nested = document.querySelector(
    '[data-component-id="regression-nested-container"]',
  )
  const inner = document.querySelector(
    '[data-component-id="regression-inner-container"]',
  )
  assert(
    empty?.hasAttribute('data-container-component') &&
      nested?.hasAttribute('data-container-component') &&
      inner?.hasAttribute('data-container-component') &&
      !empty.querySelector('[data-container-identity]') &&
      !nested.querySelector('[data-container-identity]') &&
      !inner.querySelector('[data-container-identity]'),
    'Container descriptions leaked into Canvas content',
  )
  const emptyDropTarget = empty.querySelector(
    '[data-drop-surface="canvas"][data-drop-parent="regression-empty-container"]',
  )
  assert(
    emptyDropTarget?.getAttribute('data-drop-orientation') === 'horizontal',
    'empty horizontal Container did not retain its child drop target',
  )

  const surface = document.querySelector('[data-canvas-surface]')
  const beforeIdentityPan = surface.getAttribute('style')
  const selectionBeforeIdentityPan = harness.state().selectedComponentId
  harness.keyDown(window, ' ', { code: 'Space' })
  harness.pointer(empty, 'pointerdown', { clientX: 200, clientY: 200 })
  harness.pointer(window, 'pointermove', { clientX: 230, clientY: 220 })
  harness.pointer(window, 'pointerup', { clientX: 230, clientY: 220 })
  harness.keyUp(window, ' ', { code: 'Space' })
  assert(
    surface.getAttribute('style') !== beforeIdentityPan,
    'persistent Container identity blocked Space-drag panning',
  )

  harness.click(empty)
  assert(
    harness.state().selectedComponentId === selectionBeforeIdentityPan,
    'Space-drag trailing click was not suppressed on Container identity',
  )
  harness.click(empty)
  assert(
    harness.state().selectedComponentId === 'regression-empty-container' &&
      empty.hasAttribute('data-editor-selected'),
    'clicking the empty Container did not select it',
  )
  harness.contextMenu(empty)
  assert(
    harness.state().selectedComponentId === 'regression-empty-container' &&
      document.querySelector('[data-component-add-menu][role="menu"]'),
    'empty Container did not open its add context menu',
  )

  harness.keyDown(document, 'Escape', { code: 'Escape' })
  harness.markInnerContainerChanged()
  assert(
    inner.getAttribute('data-component-change') === 'modified' &&
      inner.querySelector('[data-editor-chrome] [data-change-status]'),
    'nested Container boundary did not coexist with its change marker',
  )
  harness.unmount()
})

await test('Canvas projects placement once per owning frame without changing logical targets', async () => {
  memoryStorage.clear()
  installStorage(memoryStorage)
  const document = installInteractiveDom()
  Object.defineProperties(globalThis, {
    requestAnimationFrame: {
      configurable: true,
      writable: true,
      value: callback => {
        callback(0)
        return 1
      },
    },
    cancelAnimationFrame: {
      configurable: true,
      writable: true,
      value: () => {},
    },
  })
  const { mountReviewLockApp } = await import(
    moduleUrl(renderAppBundle, 'canvas-placement-projection')
  )
  const harness = mountReviewLockApp('en')
  harness.addPlacementFixture()

  const pageFrame = document.querySelector(
    '[data-owning-frame-kind="page"][data-owning-frame-id="comp-list-page"]',
  )
  const modalFrame = document.querySelector(
    '[data-owning-frame-kind="modal"][data-owning-frame-id="comp-create-modal"]',
  )
  const pageScrollport = pageFrame?.querySelector('[data-frame-scrollport]')
  const stickyTitle = document.querySelector('[data-component-id="comp-list-header"]')
  const viewportLink = document.querySelector('[data-component-id="comp-list-help-link"]')
  const modalTitle = document.querySelector('[data-component-id="comp-create-title-input"]')
  const viewportContainer = document.querySelector(
    '[data-component-id="regression-viewport-container"]',
  )
  const nestedOverlay = document.querySelector(
    '[data-component-id="regression-nested-overlay"]',
  )

  for (const componentId of [
    'comp-list-header',
    'comp-list-help-link',
    'comp-create-title-input',
    'regression-viewport-container',
    'regression-nested-overlay',
  ]) {
    assert(
      document.querySelectorAll(`[data-component-id="${componentId}"]`).length === 1,
      `${componentId} projection count was ` +
        document.querySelectorAll(`[data-component-id="${componentId}"]`).length,
    )
    assert(
      document.querySelectorAll(
        `[data-drag-surface="canvas"][data-drag-component="${componentId}"]`,
      ).length === 1,
      `${componentId} registered more than one Canvas drag origin`,
    )
  }
  assert(
    stickyTitle?.closest('[data-placement-projection="sticky"]')
      ?.getAttribute('data-owning-frame-id') === 'comp-list-page' &&
      viewportLink?.closest('[data-placement-projection="viewport"]')
        ?.getAttribute('data-owning-frame-id') === 'comp-list-page' &&
      !pageScrollport?.contains(stickyTitle) &&
      !pageScrollport?.contains(viewportLink),
    'Page sticky/viewport components were not projected outside Page scroll content',
  )
  assert(
    modalTitle?.closest('[data-placement-projection="viewport"]')
      ?.getAttribute('data-owning-frame-id') === 'comp-create-modal' &&
      modalFrame?.contains(modalTitle) &&
      !pageFrame?.contains(modalTitle),
    'Modal descendant crossed its owning frame during projection',
  )
  assert(
    viewportContainer?.contains(nestedOverlay) &&
      nestedOverlay?.closest('[data-placement-layer="overlay"]')?.parentElement ===
        viewportContainer,
    'nested overlay did not use its projected immediate parent bounds',
  )
  const logicalPositions = [
    ...document.querySelectorAll(
      '[data-drop-surface="canvas"][data-drop-parent="comp-list-page"]',
    ),
  ].map(zone => Number(zone.getAttribute('data-drop-position')))
  assert(
    logicalPositions.includes(0) &&
      logicalPositions.includes(3) &&
      logicalPositions.includes(7),
    'projected children lost canonical parent/index drop targets',
  )
  const stickyDropTarget = document.querySelector(
    '[data-drop-surface="canvas"][data-drop-parent="comp-list-page"]' +
      '[data-drop-position="0"]',
  )
  const viewportDropTarget = document.querySelector(
    '[data-drop-surface="canvas"][data-drop-parent="comp-list-page"]' +
      '[data-drop-position="6"]',
  )
  assert(
    stickyDropTarget?.closest('[data-placement-projection="sticky"]') &&
      viewportDropTarget?.closest('[data-placement-projection="viewport"]'),
    'projected canonical drop targets collapsed into the logical parent origin',
  )
  const linkAnchor = viewportLink?.querySelector('a')
  linkAnchor?.focus()
  assert(
    document.activeElement === linkAnchor &&
      linkAnchor?.getAttribute('target') === '_blank' &&
      linkAnchor?.getAttribute('rel') === 'noopener noreferrer',
    'projected Link lost its trusted keyboard focus or anchor contract',
  )
  harness.click(viewportLink)
  assert(
    harness.state().selectedComponentId === 'comp-list-help-link',
    'projected component selection did not preserve its canonical component ID',
  )
  const dropIds = [
    ...document.querySelectorAll('[data-editor-drop-id]'),
  ].map(zone => zone.getAttribute('data-editor-drop-id'))
  assert(
    new Set(dropIds).size === dropIds.length,
    'placement projection duplicated a logical droppable registration',
  )
  harness.unmount()
})

await test('visible Screen and Inspector labels focus their draft controls', async () => {
  for (const locale of ['en', 'ja']) {
    memoryStorage.clear()
    installStorage(memoryStorage)
    const document = installInteractiveDom()
    const { mountReviewLockApp } = await import(
      moduleUrl(renderAppBundle, `visible-field-labels-${locale}`)
    )
    const harness = mountReviewLockApp(locale)
    const fields = [
      ['screen:screen-edit:name', 'Screen Name'],
      ['screen:screen-edit:route', 'Screen Route'],
      ['component:comp-task-name-input:common.description', 'Inspector Description'],
    ]
    const ids = []

    for (const [draftId, labelName] of fields) {
      const control = document.querySelector(
        `[data-draft-id="${draftId}"] > input, [data-draft-id="${draftId}"] > textarea`,
      )
      assert(control?.id, `${labelName} control has no stable id in ${locale}`)
      ids.push(control.id)
      const label = document.querySelector(`label[for="${control.id}"]`)
      assert(label, `${labelName} visible label is not associated in ${locale}`)
      assert(
        !control.hasAttribute('aria-label'),
        `${labelName} retained a redundant aria-label in ${locale}`,
      )
      document.body.focus()
      harness.click(label)
      assert(
        document.activeElement === control,
        `${labelName} visible label did not focus its control in ${locale}`,
      )
    }

    assert(new Set(ids).size === ids.length, `visible field ids collide in ${locale}`)
    harness.unmount()
  }
})

await test('editor shortcuts ignore form controls and resolve standard keys', async () => {
  const {
    resolveEditorShortcut,
    resolveHierarchySelectionShortcut,
    resolveHierarchySelectionTarget,
  } = await import(moduleUrl(editorShortcutsBundle, 'shortcut-guards'))
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert(
      resolveEditorShortcut({ key: 'Backspace', target: { tagName } }) === null &&
        resolveEditorShortcut({
          key: 'z',
          metaKey: true,
          shiftKey: true,
          target: { tagName },
        }) === null &&
        resolveEditorShortcut({ key: 'y', ctrlKey: true, target: { tagName } }) === null,
      `${tagName} did not guard editing shortcuts`,
    )
  }
  assert(
    resolveEditorShortcut({ key: 'Delete', target: { tagName: 'DIV' } }) === 'delete-selection',
    'Delete shortcut was not resolved',
  )
  const blockedDeleteTarget = {
    tagName: 'BUTTON',
    closest(selector) {
      return selector.includes('[role="dialog"]') ? this : null
    },
  }
  const flowDeleteTarget = {
    tagName: 'BUTTON',
    closest(selector) {
      return selector.includes('[data-read-only-editor-view="true"]') ? this : null
    },
  }
  assert(
    resolveEditorShortcut({ key: 'Delete', repeat: true, target: { tagName: 'DIV' } }) === null &&
      resolveEditorShortcut({ key: 'Delete', isComposing: true, target: { tagName: 'DIV' } }) === null &&
      resolveEditorShortcut({ key: 'Delete', dragActive: true, target: { tagName: 'DIV' } }) === null &&
      resolveEditorShortcut({ key: 'Delete', ctrlKey: true, target: { tagName: 'DIV' } }) === null &&
      resolveEditorShortcut({ key: 'Delete', target: blockedDeleteTarget }) === null &&
      resolveEditorShortcut({ key: 'Delete', target: flowDeleteTarget }) === null,
    'Delete shortcut was not guarded during repeat, IME, DnD, modifiers, dialogs, or Flow',
  )
  const flowEditingTarget = {
    tagName: 'BUTTON',
    closest(selector) {
      return selector.includes('[data-hierarchy-shortcut-scope="inspector"]') ? this : null
    },
  }
  assert(
    resolveEditorShortcut({
      key: 'Delete',
      readOnlyEditorView: true,
      target: { tagName: 'BODY' },
    }) === null &&
      resolveEditorShortcut({
        key: 'Delete',
        readOnlyEditorView: true,
        target: flowEditingTarget,
      }) === 'delete-selection',
    'Flow delete guard did not distinguish read-only chrome from Inspector editing scope',
  )
  assert(
    resolveEditorShortcut({ key: 'Escape', target: { tagName: 'DIV' } }) === 'clear-selection',
    'Escape shortcut was not resolved',
  )
  assert(
    resolveEditorShortcut({ key: 'z', metaKey: true, target: { tagName: 'DIV' } }) === 'undo' &&
      resolveEditorShortcut({ key: 'z', ctrlKey: true, target: { tagName: 'DIV' } }) === 'undo',
    'Cmd/Ctrl+Z shortcut was not resolved',
  )
  assert(
    resolveEditorShortcut({
      key: 'z',
      metaKey: true,
      shiftKey: true,
      target: { tagName: 'DIV' },
    }) === 'redo' &&
      resolveEditorShortcut({
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        target: { tagName: 'DIV' },
      }) === 'redo' &&
      resolveEditorShortcut({ key: 'y', ctrlKey: true, target: { tagName: 'DIV' } }) === 'redo',
    'standard Mac/Windows redo shortcuts were not resolved',
  )

  const scopedTarget = {
    tagName: 'DIV',
    closest(selector) {
      return selector === '[data-hierarchy-shortcut-scope]' ? this : null
    },
  }
  assert(
    resolveEditorShortcut({
      key: 'd',
      metaKey: true,
      target: scopedTarget,
    }) === 'duplicate-selection' &&
      resolveEditorShortcut({
        key: 'D',
        ctrlKey: true,
        target: scopedTarget,
      }) === 'duplicate-selection',
    'Cmd/Ctrl+D did not resolve in Canvas or Inspector scope',
  )
  assert(
    resolveEditorShortcut({
      key: 'c',
      metaKey: true,
      target: scopedTarget,
    }) === 'copy-selection' &&
      resolveEditorShortcut({
        key: 'v',
        ctrlKey: true,
        target: scopedTarget,
      }) === 'paste-selection',
    'Cmd/Ctrl+C and Cmd/Ctrl+V did not resolve in Canvas or Inspector scope',
  )
  for (const key of ['c', 'v', 'd']) {
    for (const guard of [
      { repeat: true },
      { isComposing: true },
      { keyCode: 229 },
      { dragActive: true },
      { shiftKey: true },
      { altKey: true },
      { metaKey: true, ctrlKey: true },
      { target: { tagName: 'DIV', closest: () => null } },
      {
        target: {
          tagName: 'INPUT',
          closest: scopedTarget.closest,
        },
      },
      {
        target: {
          tagName: 'BUTTON',
          closest(selector) {
            return selector.includes('[role="tree"]') ||
              selector === '[data-hierarchy-shortcut-scope]'
              ? this
              : null
          },
        },
      },
    ]) {
      assert(
        resolveEditorShortcut({
          key,
          metaKey: true,
          target: scopedTarget,
          ...guard,
        }) === null,
        'component clipboard shortcut guard was bypassed',
      )
    }
  }
  const hierarchyShortcut = (overrides = {}) =>
    resolveHierarchySelectionShortcut({
      key: '[',
      code: 'BracketLeft',
      target: scopedTarget,
      ...overrides,
    })
  assert(
    hierarchyShortcut() === 'select-parent' &&
      hierarchyShortcut({ key: ']', code: 'BracketRight' }) === 'select-first-child' &&
      hierarchyShortcut({ shiftKey: true }) === 'select-previous-sibling' &&
      hierarchyShortcut({ key: '}', code: 'BracketRight', shiftKey: true }) ===
        'select-next-sibling' &&
      hierarchyShortcut({ key: 'x', code: 'KeyX' }) === null,
    'hierarchy selection bracket shortcuts were not resolved',
  )
  for (const guard of [
    { metaKey: true },
    { ctrlKey: true },
    { altKey: true },
    { repeat: true },
    { isComposing: true },
    { keyCode: 229 },
    { dragActive: true },
    { target: { tagName: 'INPUT', closest: scopedTarget.closest } },
    {
      target: {
        tagName: 'DIV',
        isContentEditable: true,
        closest: scopedTarget.closest,
      },
    },
    { target: { tagName: 'DIV', closest: () => null } },
  ]) {
    assert(hierarchyShortcut(guard) === null, 'hierarchy shortcut guard was bypassed')
  }
  for (const blockedRole of ['tree', 'dialog', 'menu']) {
    const target = {
      tagName: 'BUTTON',
      closest(selector) {
        return selector.includes(`[role="${blockedRole}"]`) ||
          selector === '[data-hierarchy-shortcut-scope]'
          ? this
          : null
      },
    }
    assert(
      hierarchyShortcut({ target }) === null,
      `${blockedRole} did not block hierarchy shortcuts`,
    )
  }

  memoryStorage.clear()
  const hierarchyStore = await freshStore('hierarchy-selection-shortcuts')
  const document = hierarchyStore.getState().effectiveDocument
  assert(
    resolveHierarchySelectionTarget(document, 'comp-list-summary', 'select-parent') ===
      'comp-list-page' &&
      resolveHierarchySelectionTarget(document, 'comp-task-list', 'select-first-child') ===
        'comp-launch-task-card' &&
      resolveHierarchySelectionTarget(document, 'comp-list-summary', 'select-next-sibling') ===
        'comp-task-list' &&
      resolveHierarchySelectionTarget(document, 'comp-task-list', 'select-previous-sibling') ===
        'comp-list-summary',
    'hierarchy selection did not follow parent childIds order',
  )
  assert(
    resolveHierarchySelectionTarget(document, 'comp-list-page', 'select-parent') === null &&
      resolveHierarchySelectionTarget(document, 'comp-list-page', 'select-next-sibling') === null &&
      resolveHierarchySelectionTarget(document, 'comp-list-header', 'select-previous-sibling') ===
        null,
    'hierarchy selection crossed a root or sibling boundary',
  )
  const documentWithModal = structuredClone(document)
  documentWithModal.components['comp-shortcut-modal'] = {
    id: 'comp-shortcut-modal',
    screenId: 'screen-list',
    parentId: null,
    childIds: [],
    kind: 'modal',
    common: { description: '', visible: true, enabled: true },
    config: {
      kind: 'modal',
      layout: 'vertical',
      gap: 'md',
      columns: 2,
      justify: 'start',
      align: 'stretch',
      wrap: false,
    },
  }
  documentWithModal.screens['screen-list'].modalComponentIds.push('comp-shortcut-modal')
  assert(
    resolveHierarchySelectionTarget(
      documentWithModal,
      'comp-list-page',
      'select-next-sibling',
    ) === null &&
      resolveHierarchySelectionTarget(
        documentWithModal,
        'comp-shortcut-modal',
        'select-previous-sibling',
      ) === null,
    'Page and Modal roots were incorrectly treated as siblings',
  )

  const editorShortcutSource = readFileSync(
    join(root, 'src/app/EditorKeyboardShortcuts.tsx'),
    'utf8',
  )
  const canvasSource = readFileSync(join(root, 'src/features/canvas/Canvas.tsx'), 'utf8')
  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  assert(
    editorShortcutSource.includes("document.querySelector('[data-drag-overlay]')") &&
      editorShortcutSource.includes("addEventListener('keydown', handleHierarchySelection, true)") &&
    editorShortcutSource.includes(
      '[data-hierarchy-shortcut-scope="inspector"] [aria-current="page"]',
    ) &&
      canvasSource.includes('data-hierarchy-shortcut-scope="canvas"') &&
      inspectorSource.includes('data-hierarchy-shortcut-scope="inspector"') &&
      !inspectorSource.includes('hierarchyShortcutHint'),
    'hierarchy shortcut scope or DnD guard changed, or the removed hint remains',
  )
})

await test('Toast severity, replacement, and action APIs are token safe', async () => {
  memoryStorage.clear()
  const store = await freshStore('toast-severity-action')
  const { TOAST_AUTO_DISMISS_MS } = await import(moduleUrl(toastModelBundle, 'toast-model'))
  let actionCalls = 0

  const infoId = store.getState().showToast({
    severity: 'info',
    message: { key: 'errors.invalidDrop' },
  })
  assert(
    store.getState().toast?.id === infoId &&
      store.getState().toast?.severity === 'info' &&
      TOAST_AUTO_DISMISS_MS.info === 5_000 &&
      TOAST_AUTO_DISMISS_MS.success === 5_000 &&
      TOAST_AUTO_DISMISS_MS.error === 8_000,
    'Toast severity or auto-dismiss policy was not retained',
  )

  const actionId = store.getState().showToast({
    severity: 'success',
    message: { key: 'errors.invalidDrop' },
    action: {
      label: { key: 'app.undo' },
      callback: () => {
        actionCalls += 1
      },
    },
  })
  store.getState().dismissToast(infoId)
  assert(
    store.getState().toast?.id === actionId,
    'a stale dismiss removed the replacement Toast',
  )
  assert(
    store.getState().runToastAction(infoId) === false &&
      store.getState().runToastAction(actionId) === true &&
      store.getState().runToastAction(actionId) === false &&
      actionCalls === 1 &&
      store.getState().toast === null,
    'Toast action was stale, repeated, or not dismissed atomically',
  )

  const errorId = store.getState().showToast({
    severity: 'error',
    message: { key: 'errors.unexpected', params: { message: 'test' } },
  })
  store.getState().dismissToast(errorId)
  assert(store.getState().toast === null, 'current Toast could not be dismissed by token')
  const throwingActionId = store.getState().showToast({
    severity: 'info',
    message: { key: 'errors.invalidDrop' },
    action: {
      label: { key: 'app.undo' },
      callback: () => {
        throw new Error('action failed')
      },
    },
  })
  assert(
    store.getState().runToastAction(throwingActionId) === true &&
      store.getState().toast?.severity === 'error',
    'Toast action errors were not surfaced as a replacement error Toast',
  )

  const toastSource = readFileSync(join(root, 'src/app/Toast.tsx'), 'utf8')
  const appSource = readFileSync(join(root, 'src/app/App.tsx'), 'utf8')
  const toastStyles = readFileSync(join(root, 'src/app/App.module.css'), 'utf8')
  assert(
    toastSource.includes('role="status"') &&
      toastSource.includes('role="alert"') &&
      toastSource.includes('role="group"') &&
      toastSource.includes('TOAST_AUTO_DISMISS_MS[toast.severity]') &&
      toastSource.includes('data-toast-paused={paused || undefined}') &&
      toastSource.includes('returnFocus.focus({ preventScroll: true })') &&
      appSource.includes('<Toast toast={toast}') &&
      appSource.includes('dismissToast(toast.id)') &&
      toastStyles.includes('@media (max-width: 640px)'),
    'Toast live region, timer pause, focus return, Escape, or narrow layout wiring was lost',
  )
})

await test('delete impact analysis follows command cleanup and confirmation thresholds', async () => {
  const { analyzeDeleteImpact } = await import(moduleUrl(deleteImpactBundle, 'delete-impact'))
  const { sampleProject } = await import(moduleUrl(sampleProjectBundle, 'delete-impact-sample'))

  const leaf = analyzeDeleteImpact(sampleProject, {
    type: 'removeComponent',
    componentId: 'comp-launch-task-status',
  })
  assert(
    leaf.counts.components === 1 &&
      leaf.counts.stateOverrides === 0 &&
      leaf.requiresConfirmation === false,
    'a clean component leaf was not classified as an immediate deletion',
  )

  const subtree = analyzeDeleteImpact(sampleProject, {
    type: 'removeComponent',
    componentId: 'comp-create-form',
  })
  assert(
    subtree.counts.components === 4 &&
      subtree.counts.events === 2 &&
      subtree.counts.eventActions === 2 &&
      subtree.counts.apiBindings === 1 &&
      subtree.requiresConfirmation,
    'component subtree cleanup impact did not match removeComponent',
  )

  const state = analyzeDeleteImpact(sampleProject, {
    type: 'removeScreenState',
    stateId: 'scenario-edit-saving',
  })
  assert(
    state.counts.states === 1 &&
      state.counts.stateOverrides === 1 &&
      state.requiresConfirmation,
    'state override and setState cleanup impact was incomplete',
  )

  const event = analyzeDeleteImpact(sampleProject, {
    type: 'removeEvent',
    eventId: 'event-save-task',
  })
  assert(
    event.counts.events === 1 &&
      event.counts.eventActions === 1 &&
      event.counts.buttonEventConnections === 1 &&
      event.requiresConfirmation,
    'event action and Button connection impact was incomplete',
  )

  const api = analyzeDeleteImpact(sampleProject, {
    type: 'removeApiOperation',
    operationId: 'api-save-task',
  })
  assert(
    api.counts.apiOperations === 1 &&
      api.counts.apiBindings === 2 &&
      api.counts.eventActions === 1 &&
      api.counts.apiStateConnections === 2 &&
      api.requiresConfirmation,
    'API binding and callApi cleanup impact was incomplete',
  )

  const screenDeleteDocument = clone(sampleProject)
  delete screenDeleteDocument.events['event-discard-task-changes']
  screenDeleteDocument.screens['screen-edit'].eventIds = screenDeleteDocument
    .screens['screen-edit'].eventIds.filter(id => id !== 'event-discard-task-changes')
  screenDeleteDocument.components['comp-discard-confirm-btn'].config.eventId = null
  const screen = analyzeDeleteImpact(screenDeleteDocument, {
    type: 'removeScreen',
    screenId: 'screen-list',
  })
  assert(
    screen.counts.components > 0 &&
      screen.counts.states > 0 &&
      screen.counts.stateOverrides > 0 &&
      screen.requiresConfirmation,
    `screen-owned entity impact was incomplete: ${JSON.stringify(screen.counts)}`,
  )

  const emptyEventDocument = clone(sampleProject)
  emptyEventDocument.events['event-empty'] = {
    id: 'event-empty',
    screenId: 'screen-list',
    name: 'Empty event',
    trigger: {
      type: 'click',
      target: { type: 'inline', componentId: 'comp-list-summary' },
    },
    actions: [],
  }
  emptyEventDocument.screens['screen-list'].eventIds.push('event-empty')
  const emptyEvent = analyzeDeleteImpact(emptyEventDocument, {
    type: 'removeEvent',
    eventId: 'event-empty',
  })
  assert(
    emptyEvent.counts.events === 1 && emptyEvent.requiresConfirmation === false,
    'an unreferenced empty event was forced through blanket confirmation',
  )
})

await test('human delete flow confirms impact and only undoes the current deletion', async () => {
  memoryStorage.clear()
  const store = await freshStore('impact-aware-human-delete')

  assert(
    store.getState().requestHumanDelete(
      { type: 'removeComponent', componentId: 'comp-list-help-link' },
      'Delete component',
    ) === 'executed' &&
      !store.getState().effectiveDocument.components['comp-list-help-link'] &&
      store.getState().history.length === 1 &&
      store.getState().toast?.action,
    'clean leaf deletion was not immediate or actionable',
  )
  const undoToastId = store.getState().toast.id
  store.getState().runToastAction(undoToastId)
  assert(
    store.getState().document.components['comp-list-help-link'] &&
      store.getState().history.length === 0 &&
      store.getState().redoStack.length === 1,
    'delete Toast action did not perform one normal history Undo',
  )

  store.getState().resetToSample()
  assert(
    store.getState().requestHumanDelete(
      { type: 'removeComponent', componentId: 'comp-create-form' },
      'Delete component',
    ) === 'pending' &&
      store.getState().pendingDelete?.analysis.counts.components === 4 &&
      store.getState().history.length === 0,
    'impactful subtree deletion did not wait for confirmation',
  )
  store.getState().cancelPendingDelete()
  assert(
    store.getState().pendingDelete === null &&
      store.getState().document.components['comp-create-form'],
    'cancelling deletion changed the document',
  )

  store.getState().requestHumanDelete(
    { type: 'removeComponent', componentId: 'comp-create-form' },
    'Delete component',
  )
  store.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-edit',
    name: 'Changed while confirming',
  })
  store.getState().confirmPendingDelete()
  assert(
    store.getState().pendingDelete?.notice?.key === 'delete.impactChanged' &&
      store.getState().pendingDelete?.needsReviewAcknowledgement &&
      store.getState().document.components['comp-create-form'],
    'stale confirmation deleted without requiring updated impact review',
  )
  store.getState().confirmPendingDelete()
  assert(
    store.getState().pendingDelete !== null &&
      store.getState().document.components['comp-create-form'],
    'repeat activation bypassed updated impact review',
  )
  store.getState().acknowledgePendingDeleteImpact()
  store.getState().confirmPendingDelete()
  assert(
    store.getState().pendingDelete === null &&
      !store.getState().document.components['comp-create-form'] &&
      store.getState().toast?.action,
    'reconfirmed current impact did not execute the deletion',
  )

  store.getState().resetToSample()
  store.getState().requestHumanDelete(
    { type: 'removeComponent', componentId: 'comp-list-help-link' },
    'Delete component',
  )
  const staleUndoId = store.getState().toast.id
  store.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-edit',
    name: 'Later edit',
  })
  store.getState().runToastAction(staleUndoId)
  assert(
    !store.getState().document.components['comp-list-help-link'] &&
      store.getState().document.screens['screen-edit'].name === 'Later edit' &&
      store.getState().history.length === 2 &&
      store.getState().toast?.message.key === 'delete.undoUnavailable',
    'stale delete Undo rewound a later human edit',
  )

  store.getState().resetToSample()
  const deleteReview = store.getState().beginChangeSet('AI review blocks delete')
  const lockedDeleteResult = store.getState().requestHumanDelete(
    { type: 'removeComponent', componentId: 'comp-list-help-link' },
    'Delete component',
  )
  assert(
    lockedDeleteResult === 'failed' &&
    store.getState().activeChangeSet?.id === deleteReview.id &&
    store.getState().activeChangeSet?.version === 0 &&
    store.getState().activeChangeSet?.operations.length === 0 &&
    store.getState().effectiveDocument.components['comp-list-help-link'] &&
    store.getState().pendingDelete === null &&
    !store.getState().toast?.action,
    'review lock created a human delete operation, confirmation, or Undo action',
  )

  store.getState().rejectChangeSet()
  store.getState().requestHumanDelete(
    { type: 'removeComponent', componentId: 'comp-list-help-link' },
    'Delete component',
  )
  const deleteUndoBeforeReview = store.getState().toast.id
  const secondReview = store.getState().beginChangeSet('AI review blocks delete Undo')
  store.getState().runToastAction(deleteUndoBeforeReview)
  assert(
    store.getState().activeChangeSet?.id === secondReview.id &&
    store.getState().activeChangeSet?.version === 0 &&
    store.getState().activeChangeSet?.operations.length === 0 &&
    !store.getState().effectiveDocument.components['comp-list-help-link'] &&
    store.getState().toast?.message.key === 'delete.undoUnavailable',
    'delete Undo changed a document while review lock was active',
  )

  const humanDeleteSources = [
    'src/features/screens/ScreenList.tsx',
    'src/features/structure-tree/StructureTree.tsx',
    'src/app/EditorKeyboardShortcuts.tsx',
    'src/features/canvas/StateDialog.tsx',
    'src/features/inspector/EventDialog.tsx',
    'src/features/inspector/ApiOperationDialog.tsx',
  ].map(path => readFileSync(join(root, path), 'utf8'))
  const webMcpSource = readFileSync(join(root, 'src/webmcp/tools.ts'), 'utf8')
  const confirmationSource = readFileSync(
    join(root, 'src/app/DeleteConfirmationDialog.tsx'),
    'utf8',
  )
  assert(
    humanDeleteSources.every(source => source.includes('requestHumanDelete')) &&
      !webMcpSource.includes('requestHumanDelete') &&
      confirmationSource.includes('trapDialogFocus') &&
      confirmationSource.includes('data-delete-confirmation') &&
      confirmationSource.includes("event.key === 'Escape'") &&
      confirmationSource.includes('cancelRef.current?.focus()'),
    'human entry points, agent bypass, or accessible confirmation wiring was incomplete',
  )
})

await test('Canvas auto-pan requires a fresh pointer or touch inside the viewport', async () => {
  const {
    canAutoPanCanvasDrag,
    classifyCanvasAutoPanStart,
    isPointInsideViewport,
  } = await import(moduleUrl(canvasViewportMathBundle, 'canvas-auto-pan'))
  const pointer = (activeId, x, y) => classifyCanvasAutoPanStart(activeId, {
    type: 'pointerdown',
    clientX: x,
    clientY: y,
    pointerId: 7,
  })
  const touch = classifyCanvasAutoPanStart('palette:button', {
    type: 'touchstart',
    touches: [{ clientX: 40, clientY: 50, identifier: 11 }],
  })
  const bounds = { left: 100, top: 100, right: 500, bottom: 400 }

  const sources = [
    ['canvas:component:button', 'canvas'],
    ['tree:component:button', 'tree'],
    ['palette:button', 'palette'],
  ]
  for (const [activeId, source] of sources) {
    const keyboard = classifyCanvasAutoPanStart(activeId, { type: 'keydown' })
    assert(
      keyboard.source === source && keyboard.sensor === 'keyboard',
      `${activeId} keyboard sensor or source was misclassified`,
    )
    assert(!canAutoPanCanvasDrag(keyboard), `${activeId} keyboard drag enabled auto-pan`)
    assert(
      canAutoPanCanvasDrag(pointer(activeId, 120, 130)),
      `${activeId} pointer drag did not enable auto-pan`,
    )
  }

  const canvasPointer = pointer('canvas:component:button', 120, 130)
  assert(
    canvasPointer.source === 'canvas' &&
      canvasPointer.pointerId === 7 &&
      canAutoPanCanvasDrag(canvasPointer),
    'Canvas pointer drag did not enable auto-pan',
  )
  assert(
    !isPointInsideViewport(pointer('tree:component:button', 10, 150).point, bounds),
    'Tree pointer start outside the Canvas was treated as fresh',
  )
  assert(
    isPointInsideViewport(pointer('tree:component:button', 101, 150).point, bounds),
    'Tree pointer entry into the Canvas was not recognized',
  )
  assert(
    touch.source === 'palette' &&
      touch.sensor === 'touch' &&
      touch.touchIdentifier === 11 &&
      canAutoPanCanvasDrag(touch),
    'Palette touch drag did not enable auto-pan',
  )
  assert(
    !canAutoPanCanvasDrag(pointer('unknown:button', 120, 130)),
    'Unknown drag source enabled Canvas auto-pan',
  )
})

await test('Canvas initial transforms fit readable frames without overriding a lower zoom', async () => {
  const {
    FIT_MARGIN,
    MIN_SCALE,
    computeInitialFrameTransform,
  } = await import(moduleUrl(canvasViewportMathBundle, 'canvas-initial-transform'))
  const viewport = { width: 700, height: 600 }
  const frames = { x: 0, y: 0, width: 1_200, height: 700 }
  const primaryPage = { x: 0, y: 0, width: 800, height: 700 }
  const fitted = computeInitialFrameTransform(frames, primaryPage, viewport, 1.5)
  assert(fitted && fitted.scale < 1.5, 'oversized persisted zoom was not reduced')
  assert(
    fitted.pan.x + frames.x * fitted.scale >= FIT_MARGIN - 0.01 &&
      fitted.pan.x + (frames.x + frames.width) * fitted.scale <=
        viewport.width - FIT_MARGIN + 0.01 &&
      fitted.pan.y + frames.y * fitted.scale >= FIT_MARGIN - 0.01 &&
      fitted.pan.y + (frames.y + frames.height) * fitted.scale <=
        viewport.height - FIT_MARGIN + 0.01,
    'readable frame set did not fit inside the initial margin',
  )

  const lowerZoom = computeInitialFrameTransform(frames, primaryPage, viewport, 0.4)
  assert(lowerZoom?.scale === 0.4, 'initial fit unnecessarily zoomed in a lower preference')

  const manyModals = { x: 0, y: 0, width: 10_000, height: 700 }
  const pageFirst = computeInitialFrameTransform(manyModals, primaryPage, viewport, 1)
  assert(
    pageFirst &&
      pageFirst.scale >= MIN_SCALE &&
      pageFirst.pan.x + primaryPage.x * pageFirst.scale >= FIT_MARGIN - 0.01 &&
      pageFirst.pan.x + (primaryPage.x + primaryPage.width) * pageFirst.scale <=
        viewport.width - FIT_MARGIN + 0.01,
    'extreme modal width did not preserve an operable primary Page',
  )

  const switchedFrames = { x: 100, y: 20, width: 900, height: 500 }
  const switchedPage = { x: 100, y: 20, width: 560, height: 500 }
  const switched = computeInitialFrameTransform(
    switchedFrames,
    switchedPage,
    viewport,
    fitted.scale,
  )
  assert(
    switched &&
      switched.pan.x + switchedFrames.x * switched.scale >= FIT_MARGIN - 0.01 &&
      switched.pan.x + (switchedFrames.x + switchedFrames.width) * switched.scale <=
        viewport.width - FIT_MARGIN + 0.01,
    'screen-switch transform did not fit the replacement frame set',
  )
  assert(
    computeInitialFrameTransform(frames, primaryPage, { width: 0, height: 600 }, 1) === null,
    'zero-size first measurement produced an initialized transform',
  )
})

await test('component add menu resolves valid positions and preserves atomic edit routing', async () => {
  memoryStorage.clear()
  const {
    clampContextMenuPosition,
    contextMenuPaletteItems,
    isComponentMenuKey,
    resolveComponentInsertTargets,
  } = await import(moduleUrl(componentAddMenuModelBundle, 'component-add-menu-model'))
  const { createAddComponentCommand, PALETTE_ITEMS } = await import(
    moduleUrl(componentFactoryBundle, 'component-add-menu-factory')
  )
  const store = await freshStore('component-add-menu-history')

  const placements = componentId =>
    resolveComponentInsertTargets(store.getState().effectiveDocument, componentId)
      .map(target => target.placement)
      .join(',')
  assert(placements('comp-list-page') === 'inside', 'page root exposed sibling positions')
  assert(
    placements('comp-task-list') === 'inside,before,after',
    'container did not expose inside and sibling positions',
  )
  assert(
    placements('comp-list-summary') === 'before,after',
    'leaf exposed an invalid inside position',
  )
  assert(placements('missing') === '', 'missing component exposed insertion positions')
  assert(
    contextMenuPaletteItems().map(item => item.kind).join(',') ===
      PALETTE_ITEMS.filter(item => item.kind !== 'modal').map(item => item.kind).join(','),
    'context menu types diverged from Palette constraints',
  )
  assert(isComponentMenuKey('ContextMenu', false), 'Context Menu key was not recognized')
  assert(isComponentMenuKey('F10', true), 'Shift+F10 was not recognized')
  assert(!isComponentMenuKey('F10', false), 'plain F10 opened the component menu')
  assert(
    JSON.stringify(clampContextMenuPosition(
      { x: 790, y: 590 },
      { width: 220, height: 300 },
      { width: 800, height: 600 },
    )) === JSON.stringify({ x: 572, y: 292 }) &&
      JSON.stringify(clampContextMenuPosition(
        { x: -20, y: -30 },
        { width: 220, height: 300 },
        { width: 800, height: 600 },
      )) === JSON.stringify({ x: 8, y: 8 }),
    'context menu position did not stay inside the viewport',
  )

  const beforeTarget = resolveComponentInsertTargets(
    store.getState().effectiveDocument,
    'comp-list-summary',
  ).find(target => target.placement === 'before')
  assert(beforeTarget, 'before insertion target was unavailable')
  const command = createAddComponentCommand(
    store.getState().effectiveDocument,
    beforeTarget.screenId,
    beforeTarget.parentId,
    'button',
    'en',
    beforeTarget.position,
  )
  const beforeHistory = store.getState().history.length
  assert(store.getState().dispatch(command, 'Add Button'), 'context menu add failed')
  store.getState().selectScreenComponent(command.componentId)
  assert(
    store.getState().history.length === beforeHistory + 1 &&
      store.getState().document.components[beforeTarget.parentId].childIds[beforeTarget.position] ===
        command.componentId &&
      store.getState().ui.selection?.componentId === command.componentId,
    'context menu add was not one selected history operation at the requested position',
  )
  store.getState().undo()
  assert(
    store.getState().document.components[command.componentId] === undefined,
    'Undo did not remove the context-menu component',
  )
  store.getState().redo()
  assert(
    store.getState().document.components[command.componentId] !== undefined,
    'Redo did not restore the context-menu component',
  )

  memoryStorage.clear()
  const changeSetStore = await freshStore('component-add-menu-change-set')
  const addReview = changeSetStore.getState().beginChangeSet('Add from component menu')
  const insideTarget = resolveComponentInsertTargets(
    changeSetStore.getState().effectiveDocument,
    'comp-task-list',
  ).find(target => target.placement === 'inside')
  assert(insideTarget, 'inside insertion target was unavailable')
  const proposed = createAddComponentCommand(
    changeSetStore.getState().effectiveDocument,
    insideTarget.screenId,
    insideTarget.parentId,
    'text',
    'en',
    insideTarget.position,
  )
  changeSetStore.getState().dispatchToChangeSet(addReview.id, proposed)
  assert(
    changeSetStore.getState().activeChangeSet?.operations.length === 1 &&
      changeSetStore.getState().activeChangeSet?.operations[0].source === 'agent' &&
      changeSetStore.getState().document.components[proposed.componentId] === undefined &&
      changeSetStore.getState().effectiveDocument.components[proposed.componentId] !== undefined,
    'agent component addition bypassed active change set routing',
  )
  changeSetStore.getState().rejectChangeSet()
  assert(
    changeSetStore.getState().effectiveDocument.components[proposed.componentId] === undefined,
    'Reject retained the context-menu component',
  )
  const acceptAddReview = changeSetStore.getState().beginChangeSet('Accept component menu add')
  changeSetStore.getState().dispatchToChangeSet(acceptAddReview.id, proposed)
  changeSetStore.getState().acceptChangeSet()
  assert(
    changeSetStore.getState().document.components[proposed.componentId] !== undefined,
    'Accept did not confirm the context-menu component',
  )

  const menuSource = readFileSync(
    join(root, 'src/features/component-add-menu/ComponentAddMenu.tsx'),
    'utf8',
  )
  assert(
    menuSource.includes('role="menu"') &&
      menuSource.includes('role="menuitem"') &&
      menuSource.includes('createAddComponentCommand') &&
      menuSource.includes('data-component-copy') &&
      menuSource.includes('data-component-paste') &&
      menuSource.includes('data-component-delete') &&
      menuSource.includes('openFromKeyboard') &&
      menuSource.includes("event.key === 'Escape'") &&
      menuSource.includes("event.key === 'Enter' || event.key === ' '") &&
      menuSource.includes("event.key === 'Home'") &&
      menuSource.includes("event.key === 'End'"),
    'shared component menu lost its command or keyboard accessibility path',
  )
})

await test('component display labels separate structure from visible content', async () => {
  memoryStorage.clear()
  const {
    getComponentDisplayLabel,
    getComponentSelectionContext,
  } = await import(
    moduleUrl(componentDisplayLabelBundle, 'visible-component-labels')
  )
  const store = await freshStore('visible-component-labels')
  const document = store.getState().document

  assert(
    getComponentDisplayLabel(document.components['comp-edit-page']) === 'Page',
    'page label did not use its structural kind fallback',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-task-list']) === 'Task card list',
    'container label did not use its editor description',
  )
  const undescribedContainer = clone(document.components['comp-task-list'])
  undescribedContainer.common.description = ''
  assert(
    getComponentDisplayLabel(undescribedContainer) === 'Container',
    'container label did not preserve its localized fallback',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-task-name-input']) === 'Task name',
    'input label did not use its visible label',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-save-btn']) === 'Save task',
    'button label did not use its visible label',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-launch-task-card']) ===
      'Task Collection',
    'Collection label did not use its editor description',
  )
  assert(
    getComponentDisplayLabel(undescribedContainer, 'ja') === 'コンテナ',
    'container fallback did not use the selected locale',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-edit-page'], 'ja') === 'ページ',
    'page label did not use the selected locale',
  )
  const longText = clone(document.components['comp-list-summary'])
  longText.config.text = '1234567890123456789012345678901234567890'
  assert(
    getComponentDisplayLabel(longText).endsWith('…'),
    'long visible text was not truncated',
  )

  const deepContext = getComponentSelectionContext(document, 'comp-save-btn', 'en')
  assert(
    deepContext?.screenName === 'Edit Task' &&
      deepContext.targetLabel === 'Save task' &&
      deepContext.hierarchy.map(item => item.label).join(' > ') ===
        'Page > Save task',
    'deep component context did not preserve its screen and real parent hierarchy',
  )
  assert(
    getComponentSelectionContext(
      document,
      'comp-list-loading-message',
      'en',
      document.screenScenarios['scenario-list-loading'],
    )?.targetLabel === 'Loading tasks…',
    'selection context did not use the active state semantic label',
  )
  assert(
    getComponentSelectionContext(document, 'comp-save-btn', 'ja')
      ?.hierarchy.slice(0, -1).map(item => item.label).join(' > ') ===
      'ページ',
    'component hierarchy labels did not use the selected locale',
  )
  assert(
    getComponentSelectionContext(document, 'missing-component') === null,
    'missing component produced a selection context',
  )
})

await test('Inspector hierarchy handles modal roots and reconciled selection without document edits', async () => {
  memoryStorage.clear()
  const { getComponentSelectionContext } = await import(
    moduleUrl(componentDisplayLabelBundle, 'inspector-component-hierarchy')
  )
  const { createAddComponentCommand } = await import(
    moduleUrl(componentFactoryBundle, 'inspector-component-hierarchy-factory')
  )
  const store = await freshStore('inspector-component-hierarchy')
  const modalNumber =
    store.getState().effectiveDocument.screens['screen-edit'].modalComponentIds.length + 1
  const modalCommand = createAddComponentCommand(
    store.getState().effectiveDocument,
    'screen-edit',
    null,
    'modal',
    'en',
  )
  store.getState().dispatch(modalCommand, 'Add Modal')
  const textCommand = createAddComponentCommand(
    store.getState().effectiveDocument,
    'screen-edit',
    modalCommand.componentId,
    'text',
    'en',
  )
  store.getState().dispatch(textCommand, 'Add Text')
  const modalContext = getComponentSelectionContext(
    store.getState().effectiveDocument,
    textCommand.componentId,
    'en',
  )
  assert(
    modalContext?.screenName === 'Edit Task' &&
      modalContext.hierarchy.map(item => item.label).join(' > ') ===
        `Modal ${modalNumber} > Text`,
    'modal breadcrumb mixed the page tree into its independent hierarchy',
  )

  store.getState().setActiveScreen('screen-edit')
  const historyBeforeSelection = store.getState().history.length
  store.getState().selectScreenComponent(textCommand.componentId)
  assert(
    store.getState().history.length === historyBeforeSelection,
    'breadcrumb-style selection created a document history operation',
  )
  store.getState().dispatch(
    { type: 'removeComponent', componentId: modalCommand.componentId },
    'Remove Modal',
  )
  assert(
    store.getState().ui.selection === null,
    'removing a selected hierarchy left a dangling selection',
  )
  store.getState().undo()
  assert(
    store.getState().ui.selection === null &&
      store.getState().document.components[textCommand.componentId],
    'Undo restored a dangling selection instead of only restoring the hierarchy',
  )

  memoryStorage.clear()
  const changeSetStore = await freshStore('inspector-selection-change-set')
  changeSetStore.getState().setActiveScreen('screen-edit')
  const selectionReview = changeSetStore.getState().beginChangeSet('Inspector selection reconcile')
  const proposed = createAddComponentCommand(
    changeSetStore.getState().effectiveDocument,
    'screen-edit',
    'comp-edit-page',
    'button',
    'en',
  )
  changeSetStore.getState().dispatchToChangeSet(selectionReview.id, proposed)
  changeSetStore.getState().selectScreenComponent(proposed.componentId)
  assert(
    changeSetStore.getState().activeChangeSet?.operations.length === 1 &&
      changeSetStore.getState().activeChangeSet?.operations[0].source === 'agent',
    'selection changed active change set operations',
  )
  changeSetStore.getState().rejectChangeSet()
  assert(
    changeSetStore.getState().ui.selection === null,
    'Reject left a selection pointing at a rejected component',
  )
  const selectionAccept = changeSetStore.getState().beginChangeSet('Inspector selection accept')
  changeSetStore.getState().dispatchToChangeSet(selectionAccept.id, proposed)
  changeSetStore.getState().selectScreenComponent(proposed.componentId)
  changeSetStore.getState().acceptChangeSet()
  assert(
    changeSetStore.getState().ui.selection?.componentId === proposed.componentId,
    'Accept discarded the valid selected component',
  )
  changeSetStore.getState().undo()
  assert(
    changeSetStore.getState().ui.selection === null,
    'Undo left a selection pointing at the removed accepted component',
  )
  changeSetStore.getState().redo()
  changeSetStore.getState().selectScreenComponent(proposed.componentId)
  changeSetStore.getState().setActiveScreen('screen-list')
  assert(
    changeSetStore.getState().ui.selection === null,
    'screen switching retained a selection from another screen',
  )

  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  assert(
    inspectorSource.includes('getComponentSelectionContext') &&
      inspectorSource.includes("aria-current={isCurrent ? 'page' : undefined}") &&
      inspectorSource.includes('onClick={() => selectScreenComponent(item.componentId)}') &&
      inspectorSource.includes("t('inspector.breadcrumbLabel')"),
    'Inspector breadcrumb lost its derived, accessible selection path',
  )
})

await test('Tree state presentation uses effective values and atomic override resets', async () => {
  {
    memoryStorage.clear()
    const { getComponentTreeLabel: treeLabel } = await import(
      moduleUrl(componentDisplayLabelBundle, 'tree-effective-labels-v3')
    )
    const { resolveEffectiveComponentState: resolveState } = await import(
      moduleUrl(selectorsBundle, 'tree-effective-state-v3')
    )
    const { createResetComponentOverrideCommand: resetInlineOverride } = await import(
      moduleUrl(stateOverridesBundle, 'tree-reset-override-v3')
    )
    const scenarioStore = await freshStore('tree-effective-scenario')
    const initialSuccessScenario =
      scenarioStore.getState().document.screenScenarios['scenario-edit-success']
    scenarioStore.getState().dispatch({
      type: 'updateScreenState',
      stateId: initialSuccessScenario.id,
      overrides: [
        ...initialSuccessScenario.componentOverrides,
        {
          target: { type: 'inline', componentId: 'comp-task-status-select' },
          override: { value: 'done' },
        },
      ],
    }, 'Set effective task status')
    const scenarioDocument = scenarioStore.getState().document
    const successScenario = scenarioDocument.screenScenarios['scenario-edit-success']
    const effectiveStatus = resolveState(
      scenarioDocument,
      scenarioDocument.components['comp-task-status-select'],
      successScenario,
    )
    assert(
      effectiveStatus.hasOverride &&
        effectiveStatus.component.config.defaultValue === 'done' &&
        treeLabel(effectiveStatus.component) === 'Status: Done',
      'Select Tree presentation did not resolve the effective scenario value',
    )
    const beforeResetHistory = scenarioStore.getState().history.length
    const resetCommand = resetInlineOverride(successScenario, 'comp-task-status-select')
    assert(resetCommand, 'existing scenario override did not produce a reset command')
    scenarioStore.getState().dispatch(resetCommand, 'Reset Status override')
    assert(
      scenarioStore.getState().history.length === beforeResetHistory + 1 &&
        scenarioStore.getState().document.screenScenarios[successScenario.id]
          .componentOverrides.length === 1,
      'reset was not one operation or removed unrelated scenario overrides',
    )
    scenarioStore.getState().undo()
    assert(
      scenarioStore.getState().document.screenScenarios[successScenario.id]
        .componentOverrides.length === 2,
      'Undo did not restore the reset scenario override',
    )
    scenarioStore.getState().redo()
    const reloadedScenarioStore = await freshStore('tree-effective-scenario-reload')
    assert(
      reloadedScenarioStore.getState().document.screenScenarios[successScenario.id]
        .componentOverrides.length === 1,
      'reset scenario override did not survive reload',
    )
    reloadedScenarioStore.getState().setActiveScreen('screen-edit')
    reloadedScenarioStore.getState().setActiveState(successScenario.id)
    reloadedScenarioStore.getState().dispatch({
      type: 'removeScreenState',
      stateId: successScenario.id,
    }, 'Remove Success scenario')
    assert(
      reloadedScenarioStore.getState().ui.activeStateId === null,
      'scenario deletion left the removed scenario active in Tree',
    )
    return
  }
  memoryStorage.clear()
  const {
    getComponentTreeLabel,
  } = await import(moduleUrl(componentDisplayLabelBundle, 'tree-effective-labels'))
  const {
    resolveEffectiveComponentState,
  } = await import(moduleUrl(selectorsBundle, 'tree-effective-state'))
  const {
    createResetComponentOverrideCommand,
  } = await import(moduleUrl(stateOverridesBundle, 'tree-reset-override'))
  const store = await freshStore('tree-effective-state')
  const initialDocument = store.getState().document
  const loading = initialDocument.screenStates['state-list-loading']
  const initialSuccess = initialDocument.screenStates['state-edit-success']
  store.getState().dispatch({
    type: 'updateScreenState',
    stateId: initialSuccess.id,
    name: initialSuccess.name,
    description: initialSuccess.description,
    overrides: {
      ...initialSuccess.componentOverrides,
      'comp-task-assignee-select': { value: 'leo-martins' },
    },
  }, 'Set effective assignee')
  const document = store.getState().document
  const success = document.screenStates['state-edit-success']

  const loadingTitle = resolveEffectiveComponentState(
    document.components['comp-list-title'],
    {
      ...loading,
      componentOverrides: {
        ...loading.componentOverrides,
        'comp-list-title': { enabled: false, text: 'Loading tasks...' },
      },
    },
  )
  assert(
    loadingTitle.hasOverride &&
      loadingTitle.component.config.text === 'Loading tasks...' &&
      !loadingTitle.component.common.enabled &&
      getComponentTreeLabel(loadingTitle.component) === 'Loading tasks...',
    'Text Tree presentation did not match the Canvas effective state',
  )
  const defaultTitle = resolveEffectiveComponentState(
    document.components['comp-list-title'],
    document.screenStates['state-list-default'],
  )
  assert(
    !defaultTitle.hasOverride &&
      defaultTitle.component.config.text === 'Team Tasks' &&
      defaultTitle.component.common.enabled,
    'default state incorrectly exposed an override',
  )

  const successRole = resolveEffectiveComponentState(
    document.components['comp-task-assignee-select'],
    success,
  )
  assert(
    successRole.hasOverride &&
      successRole.component.config.defaultValue === 'leo-martins' &&
      getComponentTreeLabel(successRole.component) === 'Assignee: Leo Martins',
    'Select Tree presentation did not resolve the effective option label',
  )
  const textInputWithValue = resolveEffectiveComponentState(
    document.components['comp-task-title-input'],
    {
      ...success,
      componentOverrides: {
       'comp-task-title-input': { value: 'Ship docs' },
      },
    },
  )
  assert(
    getComponentTreeLabel(textInputWithValue.component) === 'Task title: Ship docs',
    'TextInput Tree presentation did not include its effective value',
  )

  store.getState().setActiveScreen('screen-edit')
  store.getState().setActiveState(success.id)
  const beforeResetHistory = store.getState().history.length
  const reset = createResetComponentOverrideCommand(
    store.getState().effectiveDocument.screenStates[success.id],
    'comp-task-status-select',
  )
  assert(reset, 'existing Select override did not produce a reset command')
  store.getState().dispatch(reset, 'Reset Assignee override')
  assert(
    store.getState().history.length === beforeResetHistory + 1 &&
      !store.getState().document.screenStates[success.id]
        .componentOverrides['comp-task-assignee-select'] &&
      store.getState().document.screenStates[success.id]
        .componentOverrides['comp-status-message'] &&
      store.getState().document.screenStates[success.id]
        .componentOverrides['comp-actions'],
    'reset was not one operation or removed unrelated component overrides',
  )
  store.getState().undo()
  assert(
    store.getState().document.screenStates[success.id]
      .componentOverrides['comp-task-assignee-select'].value === 'leo-martins',
    'Undo did not restore the reset override',
  )
  store.getState().redo()
  assert(
    !store.getState().document.screenStates[success.id]
      .componentOverrides['comp-task-assignee-select'],
    'Redo did not remove the override again',
  )
  const reloaded = await freshStore('tree-effective-state-reload')
  assert(
    !reloaded.getState().document.screenStates[success.id]
      .componentOverrides['comp-task-assignee-select'],
    'reset override did not survive reload',
  )

  memoryStorage.clear()
  const changeSetStore = await freshStore('tree-reset-change-set')
  const changeSetSuccess =
    changeSetStore.getState().document.screenStates['state-edit-success']
  changeSetStore.getState().dispatch({
    type: 'updateScreenState',
    stateId: changeSetSuccess.id,
    name: changeSetSuccess.name,
    description: changeSetSuccess.description,
    overrides: {
      ...changeSetSuccess.componentOverrides,
      'comp-task-assignee-select': { value: 'leo-martins' },
    },
  }, 'Set effective assignee')
  changeSetStore.getState().setActiveScreen('screen-edit')
  changeSetStore.getState().setActiveState(success.id)
  const resetReview = changeSetStore.getState().beginChangeSet('Reset state override')
  const changeSetReset = createResetComponentOverrideCommand(
    changeSetStore.getState().effectiveDocument.screenStates[success.id],
    'comp-task-assignee-select',
  )
  changeSetStore.getState().dispatchToChangeSet(resetReview.id, changeSetReset)
  assert(
    changeSetStore.getState().activeChangeSet?.operations.length === 1 &&
      changeSetStore.getState().activeChangeSet?.operations[0].source === 'agent' &&
      changeSetStore.getState().document.screenStates[success.id]
        .componentOverrides['comp-task-assignee-select'].value === 'leo-martins' &&
      !changeSetStore.getState().effectiveDocument.screenStates[success.id]
        .componentOverrides['comp-task-assignee-select'],
    'agent reset bypassed active change set preview routing',
  )
  changeSetStore.getState().rejectChangeSet()
  assert(
    changeSetStore.getState().effectiveDocument.screenStates[success.id]
      .componentOverrides['comp-task-assignee-select'].value === 'leo-martins',
    'Reject did not restore the effective override',
  )
  const resetAccept = changeSetStore.getState().beginChangeSet('Accept state override reset')
  const acceptedReset = createResetComponentOverrideCommand(
    changeSetStore.getState().effectiveDocument.screenStates[success.id],
    'comp-task-assignee-select',
  )
  changeSetStore.getState().dispatchToChangeSet(resetAccept.id, acceptedReset)
  changeSetStore.getState().acceptChangeSet()
  assert(
    !changeSetStore.getState().document.screenStates[success.id]
      .componentOverrides['comp-task-assignee-select'],
    'Accept did not persist the override reset',
  )
  changeSetStore.getState().dispatch({
    type: 'removeScreenState',
    stateId: success.id,
  }, 'Remove Success state')
  assert(
    changeSetStore.getState().ui.activeStateId === 'state-edit-default',
    'state deletion left the removed state active in Tree',
  )
  assert(
    createResetComponentOverrideCommand(
      changeSetStore.getState().effectiveDocument.screenStates['state-edit-default'],
      'comp-task-assignee-select',
    ) === null,
    'default state exposed a reset command without an override',
  )

  const treeSource = readFileSync(
    join(root, 'src/features/structure-tree/StructureTree.tsx'),
    'utf8',
  )
  const treeStyles = readFileSync(
    join(root, 'src/features/structure-tree/StructureTree.module.css'),
    'utf8',
  )
  assert(
    treeSource.includes('resolveEffectiveComponentState') &&
      treeSource.includes('getComponentTreeLabel') &&
      treeSource.includes('data-state-hidden') &&
      treeSource.includes('data-state-disabled') &&
      treeSource.includes('data-state-overridden') &&
      treeSource.includes('createResetComponentOverrideCommand'),
    'Tree lost its shared effective-state presentation or reset path',
  )
  assert(
    treeStyles.includes('.nodeBody') &&
      treeStyles.includes('flex-direction: column') &&
      treeStyles.includes('.stateStatus') &&
      treeStyles.includes('flex-wrap: wrap'),
    'Tree state markers no longer preserve narrow label space',
  )
})

await test('Tree state badges remain atomic in deep English and Japanese hierarchies', async () => {
  for (const locale of ['en', 'ja']) {
    memoryStorage.clear()
    installStorage(memoryStorage)
    const document = installInteractiveDom()
    const { mountReviewLockApp } = await import(
      moduleUrl(renderAppBundle, `tree-state-badges-${locale}`)
    )
    const harness = mountReviewLockApp(locale)
    harness.addTreeStateBadgeFixture()

    const node = document.querySelector(
      '[data-tree-component-id="regression-tree-state-message"]',
    )
    const status = node?.querySelector('[data-tree-state-status]')
    const stateBadges = [...(status?.querySelectorAll('[data-state-badge]') ?? [])]
    const changeBadge = status?.querySelector('[data-change-status="modified"]')
    const expected = locale === 'en'
      ? ['Hidden', 'Disabled', 'Override ×']
      : ['非表示', '無効', '上書き ×']
    assert(
      node &&
        node.closest('[role="treeitem"]')?.getAttribute('aria-level') === '5' &&
        stateBadges.length === 3 &&
        stateBadges.map(badge => badge.textContent.trim()).join('|') === expected.join('|') &&
        changeBadge?.textContent.trim() === 'AI ~',
      `deep ${locale} Tree did not expose all atomic state and AI badges: ` +
        JSON.stringify({
          node: Boolean(node),
          level: node?.closest('[role="treeitem"]')?.getAttribute('aria-level'),
          badges: stateBadges.map(badge => badge.textContent.trim()),
          change: changeBadge?.textContent.trim(),
        }),
    )
    for (const badge of [...stateBadges, changeBadge]) {
      assert(
        badge?.getAttribute('aria-label') &&
          badge.getAttribute('title') &&
          !badge.textContent.includes('\n'),
        `deep ${locale} Tree badge lost its full accessible label`,
      )
    }
    assert(
      status.children.length === 4 &&
        stateBadges.find(badge => badge.getAttribute('data-state-badge') === 'override')
          ?.disabled === true,
      `deep ${locale} Tree badge grouping or review-lock reset state regressed`,
    )
    harness.unmount()
  }
})

await test('Inspector keeps base values separate from field-level state overrides', async () => {
  {
    memoryStorage.clear()
    const {
      createResetComponentOverrideCommand: resetOverride,
      createSetComponentOverrideFieldCommand: setOverrideField,
    } = await import(moduleUrl(stateOverridesBundle, 'inspector-field-overrides-v3'))
    const { resolveEffectiveComponentState: resolveOverrideState } = await import(
      moduleUrl(selectorsBundle, 'inspector-effective-overrides-v3')
    )
    const inspectorStore = await freshStore('inspector-field-overrides-v3')
    inspectorStore.getState().setActiveScreen('screen-edit')
    inspectorStore.getState().setActiveState('scenario-edit-success')
    const successScenario =
      inspectorStore.getState().effectiveDocument.screenScenarios['scenario-edit-success']
    const setValue = setOverrideField(
      successScenario,
      'comp-task-name-input',
      'value',
      'Ship docs',
    )
    assert(setValue, 'field-level scenario override did not produce a command')
    inspectorStore.getState().dispatch(setValue, 'Override task name')
    const documentAfterOverride = inspectorStore.getState().document
    const effectiveName = resolveOverrideState(
      documentAfterOverride,
      documentAfterOverride.components['comp-task-name-input'],
      documentAfterOverride.screenScenarios['scenario-edit-success'],
    )
    assert(
      documentAfterOverride.components['comp-task-name-input'].config.defaultValue ===
        'Launch onboarding checklist' &&
        effectiveName.component.config.defaultValue === 'Ship docs',
      'Inspector scenario edit changed the base value or failed to resolve the override',
    )
    const resetValue = resetOverride(
      documentAfterOverride.screenScenarios['scenario-edit-success'],
      'comp-task-name-input',
    )
    assert(resetValue, 'field-level scenario reset did not produce a command')
    inspectorStore.getState().dispatch(resetValue, 'Reset task name override')
    assert(
      inspectorStore.getState().document.screenScenarios['scenario-edit-success']
        .componentOverrides.length === 1,
      'field-level reset removed unrelated scenario overrides',
    )
    return
  }
  memoryStorage.clear()
  const {
    createResetComponentOverrideCommand,
    createSetComponentOverrideFieldCommand,
  } = await import(moduleUrl(stateOverridesBundle, 'inspector-field-overrides'))
  const {
    resolveEffectiveComponentState,
  } = await import(moduleUrl(selectorsBundle, 'inspector-effective-overrides'))
  const store = await freshStore('inspector-field-overrides')
  store.getState().setActiveScreen('screen-edit')
  store.getState().setActiveState('state-edit-success')

  const initialSuccessState =
    store.getState().effectiveDocument.screenStates['state-edit-success']
  store.getState().dispatch({
    type: 'updateScreenState',
    stateId: initialSuccessState.id,
    name: initialSuccessState.name,
    description: initialSuccessState.description,
    overrides: {
      ...initialSuccessState.componentOverrides,
      'comp-task-assignee-select': { value: 'leo-martins' },
      'comp-status-message-text': {
        ...initialSuccessState.componentOverrides['comp-status-message-text'],
        text: 'Task saved successfully.',
      },
    },
  }, 'Set state-specific Task values')
  const successState = store.getState().effectiveDocument.screenStates['state-edit-success']
  const addVisibleOverride = createSetComponentOverrideFieldCommand(
    successState,
    'comp-task-assignee-select',
    'visible',
    false,
  )
  assert(addVisibleOverride, 'field override command was not created')
  store.getState().dispatch(addVisibleOverride, 'Override Assignee visibility')
  let roleOverride = store.getState().document.screenStates['state-edit-success']
    .componentOverrides['comp-task-assignee-select']
  let effectiveRole = resolveEffectiveComponentState(
    store.getState().document.components['comp-task-assignee-select'],
    store.getState().document.screenStates['state-edit-success'],
  )
  assert(
    store.getState().history.length === 2 &&
      roleOverride.value === 'leo-martins' &&
      roleOverride.visible === false &&
      store.getState().document.components['comp-task-assignee-select'].common.visible === true &&
      effectiveRole.component.common.visible === false &&
      effectiveRole.component.config.defaultValue === 'leo-martins',
    'field override did not preserve the base value, sibling override, or effective projection',
  )

  const resetValue = createSetComponentOverrideFieldCommand(
    store.getState().effectiveDocument.screenStates['state-edit-success'],
    'comp-task-assignee-select',
    'value',
    undefined,
  )
  store.getState().dispatch(resetValue, 'Use base Assignee value')
  roleOverride = store.getState().document.screenStates['state-edit-success']
    .componentOverrides['comp-task-assignee-select']
  effectiveRole = resolveEffectiveComponentState(
    store.getState().document.components['comp-task-assignee-select'],
    store.getState().document.screenStates['state-edit-success'],
  )
  assert(
    roleOverride.value === undefined &&
      roleOverride.visible === false &&
      effectiveRole.component.config.defaultValue === 'maya-chen' &&
      !effectiveRole.component.common.visible,
    'field reset removed another override or retained the overridden effective value as base',
  )
  store.getState().undo()
  assert(
    store.getState().document.screenStates['state-edit-success']
    .componentOverrides['comp-task-assignee-select'].value === 'leo-martins',
    'field reset Undo did not restore exactly one operation',
  )
  store.getState().redo()

  const textInputValue = createSetComponentOverrideFieldCommand(
    store.getState().effectiveDocument.screenStates['state-edit-success'],
    'comp-task-title-input',
    'value',
    'State-specific task',
  )
  store.getState().dispatch(textInputValue, 'Override Task title value')
  assert(
    store.getState().document.components['comp-task-title-input'].config.defaultValue ===
        'Launch onboarding checklist' &&
      resolveEffectiveComponentState(
        store.getState().document.components['comp-task-title-input'],
        store.getState().document.screenStates['state-edit-success'],
      ).component.config.defaultValue === 'State-specific task',
    'TextInput value override mutated or replaced its base default value',
  )
  const resetAllName = createResetComponentOverrideCommand(
    store.getState().effectiveDocument.screenStates['state-edit-success'],
    'comp-task-title-input',
  )
  store.getState().dispatch(resetAllName, 'Reset Task title overrides')
  assert(
    !store.getState().document.screenStates['state-edit-success']
      .componentOverrides['comp-task-title-input'],
    'component-level reset did not agree with field-level override storage',
  )

  const reloaded = await freshStore('inspector-field-overrides-reload')
  assert(
    reloaded.getState().document.screenStates['state-edit-success']
      .componentOverrides['comp-task-assignee-select'].visible === false &&
      reloaded.getState().document.screenStates['state-edit-success']
        .componentOverrides['comp-task-assignee-select'].value === undefined,
    'field-level override state did not survive reload',
  )

  memoryStorage.clear()
  const changeSetStore = await freshStore('inspector-field-override-change-set')
  changeSetStore.getState().setActiveScreen('screen-edit')
  changeSetStore.getState().setActiveState('state-edit-success')
  const reviewSuccess =
    changeSetStore.getState().effectiveDocument.screenStates['state-edit-success']
  changeSetStore.getState().dispatch({
    type: 'updateScreenState',
    stateId: reviewSuccess.id,
    name: reviewSuccess.name,
    description: reviewSuccess.description,
    overrides: {
      ...reviewSuccess.componentOverrides,
      'comp-status-message-text': {
        ...reviewSuccess.componentOverrides['comp-status-message-text'],
        text: 'Task saved successfully.',
      },
    },
  }, 'Set review baseline message')
  const overrideReview = changeSetStore.getState().beginChangeSet('Edit one override field')
  const changeSet = createSetComponentOverrideFieldCommand(
    changeSetStore.getState().effectiveDocument.screenStates['state-edit-success'],
    'comp-status-message-text',
    'text',
    'Preview-only message',
  )
  changeSetStore.getState().dispatchToChangeSet(overrideReview.id, changeSet)
  assert(
    changeSetStore.getState().activeChangeSet?.operations.length === 1 &&
      changeSetStore.getState().document.screenStates['state-edit-success']
        .componentOverrides['comp-status-message-text'].text === 'Task saved successfully.' &&
      changeSetStore.getState().effectiveDocument.screenStates['state-edit-success']
        .componentOverrides['comp-status-message-text'].text === 'Preview-only message',
    'field override bypassed active change set preview routing',
  )
  changeSetStore.getState().rejectChangeSet()
  assert(
    changeSetStore.getState().effectiveDocument.screenStates['state-edit-success']
      .componentOverrides['comp-status-message-text'].text === 'Task saved successfully.',
    'Reject did not restore the prior field override',
  )
  const overrideAccept = changeSetStore.getState().beginChangeSet('Accept one override field')
  const accepted = createSetComponentOverrideFieldCommand(
    changeSetStore.getState().effectiveDocument.screenStates['state-edit-success'],
    'comp-status-message-text',
    'text',
    'Accepted message',
  )
  changeSetStore.getState().dispatchToChangeSet(overrideAccept.id, accepted)
  changeSetStore.getState().acceptChangeSet()
  assert(
    changeSetStore.getState().document.screenStates['state-edit-success']
      .componentOverrides['comp-status-message-text'].text === 'Accepted message',
    'Accept did not persist the field override',
  )

  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  const inspectorStyles = readFileSync(
    join(root, 'src/features/inspector/Inspector.module.css'),
    'utf8',
  )
  assert(
    inspectorSource.includes('data-base-settings') &&
      inspectorSource.includes('data-state-overrides') &&
      inspectorSource.includes('resolveEffectiveComponentState') &&
      inspectorSource.includes('createSetComponentOverrideFieldCommand') &&
      inspectorSource.includes('createResetComponentOverrideCommand') &&
      inspectorSource.includes('data-field-overridden'),
    'Inspector lost its explicit base/override/effective or shared reset path',
  )
  assert(
    inspectorStyles.includes('.inspectorSection') &&
      inspectorStyles.includes('.overrideValues') &&
      inspectorStyles.includes('text-overflow: ellipsis') &&
      inspectorStyles.includes('min-width: 0'),
    'Inspector override presentation no longer protects the 300px layout',
  )
})

await test('Inspector sections classify kinds, defaults, and review markers', async () => {
  memoryStorage.clear()
  const {
    componentHasContentSection,
    componentHasLayoutSection,
    countOverrideFields,
    defaultInspectorSectionOpen,
    inspectorSectionChangeCounts,
    inspectorSectionPreferenceKey,
  } = await import(moduleUrl(inspectorSectionsBundle, 'inspector-sections'))
  const { COMPONENT_KINDS } = await import(moduleUrl(modelBundle, 'inspector-section-kinds'))
  const contentKinds = new Set(['text', 'textInput', 'select', 'button', 'image', 'link', 'collection'])
  const layoutKinds = new Set(['page', 'container', 'modal'])

  for (const kind of COMPONENT_KINDS) {
    assert(
      componentHasContentSection(kind) === contentKinds.has(kind) &&
        componentHasLayoutSection(kind) === layoutKinds.has(kind),
      `Inspector section classification is incomplete for ${kind}`,
    )
  }

  const emptySignals = {
    hasBehavior: false,
    validationRuleCount: 0,
    overrideFieldCount: 0,
  }
  assert(
    defaultInspectorSectionOpen('basic', emptySignals) &&
      defaultInspectorSectionOpen('content', emptySignals) &&
      !defaultInspectorSectionOpen('layout', emptySignals) &&
      !defaultInspectorSectionOpen('placement', emptySignals) &&
      !defaultInspectorSectionOpen('behavior', emptySignals) &&
      !defaultInspectorSectionOpen('validation', emptySignals) &&
      !defaultInspectorSectionOpen('stateOverrides', emptySignals),
    'Inspector progressive-disclosure defaults changed unexpectedly',
  )
  assert(
    defaultInspectorSectionOpen('behavior', { ...emptySignals, hasBehavior: true }) &&
      defaultInspectorSectionOpen('validation', {
        ...emptySignals,
        validationRuleCount: 1,
      }) &&
      defaultInspectorSectionOpen('stateOverrides', {
        ...emptySignals,
        overrideFieldCount: 1,
      }) &&
      inspectorSectionPreferenceKey('textInput', 'validation') ===
        'textInput:validation' &&
      countOverrideFields({ visible: false, value: '' }) === 2,
    'Inspector data-aware defaults, preference scope, or override count changed',
  )

  const store = await freshStore('inspector-section-markers')
  const base = store.getState().document
  const preview = structuredClone(base)
  preview.components['comp-task-name-input'].common.description = 'Changed by AI'
  preview.components['comp-task-name-input'].config.placeholder = 'Updated placeholder'
  preview.components['comp-task-name-input'].config.validationRules = [{
    id: 'rule-ai',
    type: 'required',
    message: 'Required',
  }]
  preview.screenScenarios['scenario-edit-success'].componentOverrides.push({
    target: { type: 'inline', componentId: 'comp-task-name-input' },
    override: { value: 'Preview name' },
  })
  preview.components['comp-task-list'].config.gap = 'lg'
  preview.components['comp-task-list'].placement = {
    mode: 'overlay',
    anchor: 'bottomRight',
    insetX: 'sm',
    insetY: 'sm',
  }
  preview.components['comp-save-btn'].config.eventId = null

  const inputMarkers = inspectorSectionChangeCounts(
    base,
    preview,
    'comp-task-name-input',
    'scenario-edit-success',
  )
  const layoutMarkers = inspectorSectionChangeCounts(
    base,
    preview,
    'comp-task-list',
    'scenario-edit-success',
  )
  const behaviorMarkers = inspectorSectionChangeCounts(
    base,
    preview,
    'comp-save-btn',
    'scenario-edit-success',
  )
  assert(
    inputMarkers.basic > 0 &&
      inputMarkers.content > 0 &&
      inputMarkers.validation > 0 &&
      inputMarkers.stateOverrides > 0 &&
      layoutMarkers.layout > 0 &&
      layoutMarkers.placement > 0 &&
      behaviorMarkers.behavior > 0,
    'Inspector review markers do not identify the changed specification section',
  )

  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  const disclosureSource = readFileSync(
    join(root, 'src/features/inspector/InspectorSection.tsx'),
    'utf8',
  )
  const behaviorSource = readFileSync(
    join(root, 'src/features/inspector/BehaviorDetails.tsx'),
    'utf8',
  )
  const draftSource = readFileSync(
    join(root, 'src/components/DraftTextField.tsx'),
    'utf8',
  )
  assert(
    disclosureSource.includes('aria-expanded={expanded}') &&
      disclosureSource.includes('aria-controls={contentId}') &&
      disclosureSource.includes('role="region"') &&
      disclosureSource.includes('hidden={!expanded}') &&
      inspectorSource.includes('sectionId="basic"') &&
      inspectorSource.includes('sectionId="content"') &&
      inspectorSource.includes('sectionId="layout"') &&
      inspectorSource.includes('sectionId="placement"') &&
      inspectorSource.includes('sectionId="behavior"') &&
      inspectorSource.includes('sectionId="validation"') &&
      inspectorSource.includes('sectionId="stateOverrides"'),
    'Inspector disclosures lost accessible semantics or a specification section',
  )
  assert(
    behaviorSource.includes('data-behavior-specification') &&
      behaviorSource.includes('data-validation-specification') &&
    draftSource.includes('shouldPreserveTextDraftBlur') &&
    disclosureSource.includes('data-preserve-text-draft="true"'),
    'Inspector section split or collapse-safe draft handling is missing',
  )
})

await test('screen flow projects navigate actions and net review changes', async () => {
  memoryStorage.clear()
  const { selectScreenFlow } = await import(moduleUrl(screenFlowBundle, 'screen-flow'))
  const store = await freshStore('screen-flow')
  const base = structuredClone(store.getState().document)
  base.events['event-open-launch-task'] = {
    id: 'event-open-launch-task',
    screenId: 'screen-list',
    name: 'Open launch task',
    trigger: {
      type: 'click',
      target: { type: 'inline', componentId: 'comp-create-task-btn' },
    },
    actions: [{ type: 'navigate', destinationScreenId: 'screen-edit' }],
  }
  base.events['event-open-docs-task'] = {
    id: 'event-open-docs-task',
    screenId: 'screen-list',
    name: 'Open documentation task',
    trigger: {
      type: 'click',
      target: { type: 'inline', componentId: 'comp-list-summary' },
    },
    actions: [{ type: 'navigate', destinationScreenId: 'screen-edit' }],
  }
  base.events['event-cancel-edit'] = {
    id: 'event-cancel-edit',
    screenId: 'screen-edit',
    name: 'Cancel editing',
    trigger: {
      type: 'click',
      target: { type: 'inline', componentId: 'comp-cancel-edit-btn' },
    },
    actions: [{ type: 'navigate', destinationScreenId: 'screen-list' }],
  }
  base.screens['screen-list'].eventIds = [
    'event-open-launch-task',
    'event-open-docs-task',
  ]
  base.screens['screen-edit'].eventIds = ['event-cancel-edit']
  const flow = selectScreenFlow(base, 'en')
  const listToEdit = flow.edges.find(edge =>
    edge.source.screenId === 'screen-list' &&
    edge.target.screenId === 'screen-edit',
  )
  const editToList = flow.edges.find(edge =>
    edge.source.screenId === 'screen-edit' &&
    edge.target.screenId === 'screen-list',
  )
  assert(
    flow.nodes.map(node => node.screenId).join(',') === 'screen-list,screen-edit' &&
      flow.nodes.every((node, index) => node.order === index && node.exists) &&
      listToEdit?.transitions.length === 3 &&
      listToEdit.transitions[0].eventId === 'event-open-launch-task' &&
      listToEdit.transitions[1].eventId === 'event-open-docs-task' &&
      listToEdit.transitions[2].eventId === 'event-open-task-item' &&
      listToEdit.transitions[0].actionIndex === 0 &&
      listToEdit.transitions[1].actionIndex === 0 &&
      listToEdit.transitions[2].actionIndex === 1 &&
      listToEdit.transitions.every(transition =>
        transition.triggerResolved &&
        transition.target.route === '/tasks/:taskId') &&
      editToList?.transitions.length === 2 &&
      editToList.transitions[0].triggerComponentId === 'comp-cancel-edit-btn',
    'screen flow lost screen order, duplicate edges, routes, triggers, or action order: ' +
      JSON.stringify({
        nodes: flow.nodes,
        listToEdit,
        editToList,
      }),
  )

  const withSelfLoop = structuredClone(base)
  withSelfLoop.events['event-refresh-list'] = {
    id: 'event-refresh-list',
    screenId: 'screen-list',
    name: 'Refresh list route',
    trigger: {
      type: 'click',
      target: { type: 'inline', componentId: 'comp-list-summary' },
    },
    actions: [{ type: 'navigate', destinationScreenId: 'screen-list' }],
  }
  withSelfLoop.screens['screen-list'].eventIds.push('event-refresh-list')
  const selfLoop = selectScreenFlow(withSelfLoop, 'en').edges.find(edge =>
    edge.source.screenId === 'screen-list' &&
    edge.target.screenId === 'screen-list',
  )
  assert(
    selfLoop?.selfLoop &&
      selfLoop.transitions[0].eventName === 'Refresh list route',
    'screen flow did not retain a self transition',
  )

  const unresolved = structuredClone(base)
  delete unresolved.screens['screen-edit']
  unresolved.project.screenIds = ['screen-list']
  const unresolvedFlow = selectScreenFlow(unresolved, 'en')
  const unresolvedEdge = unresolvedFlow.edges.find(edge =>
    edge.source.screenId === 'screen-list' &&
    edge.target.screenId === 'screen-edit',
  )
  assert(
    unresolvedEdge &&
      !unresolvedEdge.target.resolved &&
      unresolvedEdge.target.name === null &&
      unresolvedEdge.target.route === null &&
      unresolvedEdge.transitions.length === 3,
    'screen flow discarded unresolved navigate targets',
  )

  const preview = structuredClone(base)
  preview.screens['screen-edit'].name = 'Edit account'
  preview.screens['screen-edit'].route = '/accounts/:id/edit'
  preview.screens['screen-new'] = {
    id: 'screen-new',
    name: 'Audit log',
    route: '/audit',
    rootComponentId: 'unused-root',
    modalComponentIds: [],
    baseDescription: '',
    scenarioIds: [],
    eventIds: [],
  }
  preview.project.screenIds.push('screen-new')
  preview.events['event-open-launch-task'].actions[0] = {
    type: 'navigate',
    destinationScreenId: 'screen-list',
  }
  preview.events['event-open-docs-task'].actions = []
  const review = selectScreenFlow(preview, 'en', base)
  const changedTransition = review.edges
    .flatMap(edge => edge.transitions)
    .find(transition => transition.id === 'event-open-launch-task:0')
  const removedTransition = review.edges
    .flatMap(edge => edge.transitions)
    .find(transition =>
      transition.eventId === 'event-open-docs-task' && !transition.exists)
  assert(
    review.nodes.find(node => node.screenId === 'screen-edit')?.changeStatus === 'modified' &&
      review.nodes.find(node => node.screenId === 'screen-new')?.changeStatus === 'added' &&
      changedTransition?.changeStatus === 'modified' &&
      changedTransition.previous?.target.screenId === 'screen-edit' &&
      changedTransition.target.screenId === 'screen-list' &&
      removedTransition?.changeStatus === 'removed' &&
      !removedTransition.exists,
    'screen flow review did not preserve added, modified, removed, or previous targets',
  )

  const removedPreview = structuredClone(base)
  delete removedPreview.screens['screen-edit']
  removedPreview.project.screenIds = ['screen-list']
  delete removedPreview.events['event-save-task']
  delete removedPreview.events['event-cancel-edit']
  const removedReview = selectScreenFlow(removedPreview, 'ja', base)
  assert(
    removedReview.nodes.find(node => node.screenId === 'screen-edit')?.changeStatus ===
      'removed' &&
      removedReview.nodes.find(node => node.screenId === 'screen-edit')?.exists === false,
    'screen flow review did not retain a removed screen ghost',
  )

  const shiftedBase = structuredClone(base)
  shiftedBase.events['event-sequence'] = {
    id: 'event-sequence',
    screenId: 'screen-list',
    name: 'Sequential navigation',
    trigger: {
      type: 'click',
      target: { type: 'inline', componentId: 'comp-list-summary' },
    },
    actions: [
      { type: 'navigate', destinationScreenId: 'screen-edit' },
      { type: 'setScenario', scenarioId: 'scenario-list-loading' },
      { type: 'navigate', destinationScreenId: 'screen-list' },
    ],
  }
  shiftedBase.screens['screen-list'].eventIds.push('event-sequence')
  const shiftedPreview = structuredClone(shiftedBase)
  shiftedPreview.events['event-sequence'].actions.shift()
  const shiftedReview = selectScreenFlow(shiftedPreview, 'en', shiftedBase)
  const sequenceTransitions = shiftedReview.edges
    .flatMap(edge => edge.transitions)
    .filter(transition => transition.eventId === 'event-sequence')
  const retainedSequence = sequenceTransitions.find(transition =>
    transition.target.screenId === 'screen-list' && transition.exists)
  const removedSequence = sequenceTransitions.find(transition =>
    transition.target.screenId === 'screen-edit' && !transition.exists)
  assert(
    sequenceTransitions.length === 2 &&
      retainedSequence?.changeStatus === 'modified' &&
      retainedSequence.previous === null &&
      retainedSequence.actionIndex === 1 &&
      removedSequence?.changeStatus === 'removed',
    'screen flow sequence matching mispaired navigate actions after an earlier removal',
  )

  const duplicateTargetBase = structuredClone(base)
  duplicateTargetBase.events['event-duplicate-target'] = {
    id: 'event-duplicate-target',
    screenId: 'screen-list',
    name: 'Repeated destination',
    trigger: {
      type: 'click',
      target: { type: 'inline', componentId: 'comp-list-summary' },
    },
    actions: [
      { type: 'navigate', destinationScreenId: 'screen-edit' },
      { type: 'navigate', destinationScreenId: 'screen-edit' },
    ],
  }
  duplicateTargetBase.screens['screen-list'].eventIds.push('event-duplicate-target')
  const duplicateTargetPreview = structuredClone(duplicateTargetBase)
  duplicateTargetPreview.events['event-duplicate-target'].actions[0] = {
    type: 'navigate',
    destinationScreenId: 'screen-list',
  }
  const duplicateTargetTransitions = selectScreenFlow(
    duplicateTargetPreview,
    'en',
    duplicateTargetBase,
  ).edges
    .flatMap(edge => edge.transitions)
    .filter(transition => transition.eventId === 'event-duplicate-target')
  const changedDuplicateTarget = duplicateTargetTransitions.find(
    transition => transition.actionIndex === 0,
  )
  const retainedDuplicateTarget = duplicateTargetTransitions.find(
    transition => transition.actionIndex === 1,
  )
  assert(
    duplicateTargetTransitions.length === 2 &&
      changedDuplicateTarget?.changeStatus === 'modified' &&
      changedDuplicateTarget.previous?.target.screenId === 'screen-edit' &&
      changedDuplicateTarget.target.screenId === 'screen-list' &&
      retainedDuplicateTarget?.changeStatus === null &&
      retainedDuplicateTarget.previous === null,
    'screen flow sequence matching mispaired repeated navigate destinations',
  )

  const mixedEdgePreview = structuredClone(base)
  mixedEdgePreview.screens['screen-edit'].name = 'Edit account'
  mixedEdgePreview.screens['screen-edit'].route = '/accounts/:id/edit'
  delete mixedEdgePreview.events['event-open-launch-task']
  mixedEdgePreview.screens['screen-list'].eventIds =
    mixedEdgePreview.screens['screen-list'].eventIds.filter(
      eventId => eventId !== 'event-open-launch-task',
    )
  const mixedEdge = selectScreenFlow(mixedEdgePreview, 'en', base).edges.find(edge =>
    edge.source.screenId === 'screen-list' &&
    edge.target.screenId === 'screen-edit',
  )
  assert(
    mixedEdge?.transitions.some(transition => !transition.exists) &&
      mixedEdge.transitions.some(transition => transition.exists) &&
      mixedEdge.target.name === 'Edit account' &&
      mixedEdge.target.route === '/accounts/:id/edit',
    'screen flow edge used stale endpoint metadata from a removed transition',
  )

  const appSource = readFileSync(join(root, 'src/app/App.tsx'), 'utf8')
  const flowSource = readFileSync(
    join(root, 'src/features/screen-flow/ScreenFlow.tsx'),
    'utf8',
  )
  const flowStyles = readFileSync(
    join(root, 'src/features/screen-flow/ScreenFlow.module.css'),
    'utf8',
  )
  const technicalDesign = readFileSync(
    join(root, 'docs/MVP_TECHNICAL_DESIGN.md'),
    'utf8',
  )
  assert(
    appSource.includes('role="group"') &&
      appSource.includes("aria-pressed={editorView === 'screen'}") &&
      appSource.includes("aria-pressed={editorView === 'flow'}") &&
      appSource.includes('data-editor-view="screen"') &&
      appSource.includes('data-editor-view="flow"') &&
      appSource.includes("openScreenView(focusComponentId?: string)") &&
      appSource.includes('data-read-only-editor-view=') &&
      appSource.includes('<EditorKeyboardShortcuts readOnlyEditorView='),
    'Screen and Flow switch lost segmented-control or panel semantics',
  )
  assert(
    flowSource.includes('selectScreenFlow(') &&
      flowSource.includes('setActiveScreen(transition.source.screenId)') &&
      flowSource.includes('selectScreenComponent(transition.triggerComponentId)') &&
      flowSource.includes('<details>') &&
      flowSource.includes('<summary>') &&
      !flowSource.includes('dispatch('),
    'Flow view is no longer a read-only keyboard-navigable projection',
  )
  assert(
    flowStyles.includes('overflow: auto') &&
      flowStyles.includes('width: max-content') &&
      flowStyles.includes('text-overflow: ellipsis') &&
      technicalDesign.includes('node座標、edge形状、独立したdiagram metadataは保存しない'),
    'Flow layout no longer contains scrolling or its read-only model boundary',
  )
})

await test('change set review presents sequential diffs for every command type', async () => {
  {
    memoryStorage.clear()
    const { presentChangeSetOperations: presentOperations } = await import(
      moduleUrl(changeSetPresentationBundle, 'change-set-presenter-v3')
    )
    const { createAddComponentCommand: createComponent } = await import(
      moduleUrl(componentFactoryBundle, 'change-set-presenter-factory-v3')
    )
    const reviewStore = await freshStore('change-set-presenter-v3')
    const reviewBase = clone(reviewStore.getState().document)
    const addedComponent = createComponent(
      reviewBase,
      'screen-list',
      'comp-task-list',
      'text',
      'en',
    )
    const reviewDefinition = clone(reviewBase.componentDefinitions['shared/header'])
    reviewDefinition.id = 'review-definition'
    reviewDefinition.name = 'Review definition'
    const commands = [
      {
        type: 'addScreen',
        screenId: 'screen-review',
        rootComponentId: 'comp-review-page',
        name: 'Review screen',
        route: '/review',
      },
      {
        type: 'updateScreen',
        screenId: 'screen-review',
        name: 'Review screen updated',
      },
      { type: 'removeScreen', screenId: 'screen-review' },
      { type: 'putComponentDefinition', mode: 'create', definition: reviewDefinition },
      {
        type: 'addDefinitionInstance',
        componentId: 'comp-review-instance',
        screenId: 'screen-list',
        parentId: 'comp-task-list',
        definitionId: reviewDefinition.id,
        variantId: null,
        props: {},
        placement: { mode: 'flow' },
        sizing: clone(reviewBase.components['comp-list-header'].sizing),
      },
      {
        type: 'updateDefinitionInstance',
        componentId: 'comp-review-instance',
        variantId: 'compact',
      },
      { type: 'removeComponent', componentId: 'comp-review-instance' },
      { type: 'removeComponentDefinition', definitionId: reviewDefinition.id },
      addedComponent,
      {
        type: 'updateComponentSpec',
        componentId: addedComponent.componentId,
        patch: { config: { text: 'Reviewed copy' } },
      },
      {
        type: 'moveComponent',
        componentId: addedComponent.componentId,
        newParentId: 'comp-task-list',
        position: 0,
      },
      { type: 'removeComponent', componentId: addedComponent.componentId },
      {
        type: 'createScreenState',
        stateId: 'scenario-review',
        screenId: 'screen-list',
        name: 'Review',
        overrides: [],
      },
      {
        type: 'updateScreenState',
        stateId: 'scenario-review',
        description: 'Reviewed scenario',
      },
      { type: 'removeScreenState', stateId: 'scenario-review' },
      {
        type: 'connectEvent',
        eventId: 'event-review',
        screenId: 'screen-list',
        name: 'Review event',
        trigger: {
          type: 'click',
          target: { type: 'inline', componentId: 'comp-list-summary' },
        },
        actions: [{ type: 'clearScenario' }],
      },
      {
        type: 'updateEvent',
        eventId: 'event-review',
        name: 'Review event updated',
        trigger: {
          type: 'click',
          target: { type: 'inline', componentId: 'comp-list-summary' },
        },
        actions: [],
      },
      { type: 'removeEvent', eventId: 'event-review' },
      {
        type: 'bindApiOperation',
        operationId: 'api-review',
        screenId: 'screen-list',
        name: 'Review API',
        method: 'POST',
        path: '/review',
        requestBindings: [{
          source: { type: 'inline', componentId: 'comp-create-title-input' },
          targetPath: 'summary',
        }],
      },
      {
        type: 'updateApiOperation',
        operationId: 'api-review',
        name: 'Review API updated',
        method: 'PATCH',
        path: '/review/:id',
        requestBindings: [],
        successScenarioId: null,
        errorScenarioId: null,
      },
      { type: 'removeApiOperation', operationId: 'api-review' },
    ]
    const reviewChangeSet = {
      id: 'review-v3',
      summary: 'Review canonical operations',
      baseRevision: reviewStore.getState().revision,
      version: commands.length,
      baseDocument: reviewBase,
      operations: commands.map((command, index) => ({
        id: `review-v3-op-${index}`,
        source: 'agent',
        command,
        issuedAt: '2026-01-01T00:00:00.000Z',
      })),
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const rows = presentOperations(reviewChangeSet, 'en')
    assert(
      rows.length === commands.length &&
        rows.every((row, index) => row.operationId === `review-v3-op-${index}`),
      'canonical command presentation lost sequential operations',
    )
    return
  }
  memoryStorage.clear()
  const { presentChangeSetOperations } = await import(
    moduleUrl(changeSetPresentationBundle, 'change-set-presenter')
  )
  const { createAddComponentCommand } = await import(
    moduleUrl(componentFactoryBundle, 'change-set-presenter-factory')
  )
  const store = await freshStore('change-set-presenter')
  const baseDocument = clone(store.getState().document)
  baseDocument.components['comp-list-section'].common.description = 'List content'
  baseDocument.components['comp-list-grid'].common.description = 'User grid'
  let operationNumber = 0
  const makeChangeSet = commands => ({
    id: `review-${operationNumber}`,
    summary: 'Review operations',
    baseRevision: baseDocument.revision,
    version: commands.length,
    baseDocument,
    operations: commands.map(command => ({
      id: `review-op-${++operationNumber}`,
      source: 'agent',
      command,
      issuedAt: '2026-01-01T00:00:00.000Z',
    })),
    createdAt: '2026-01-01T00:00:00.000Z',
  })
  let mixedReviewRejected = false
  try {
    const mixed = makeChangeSet([{
      type: 'updateScreen',
      screenId: 'screen-list',
      name: 'Legacy mixed review',
    }])
    mixed.operations[0].source = 'human'
    presentChangeSetOperations(mixed, 'en')
  } catch (error) {
    mixedReviewRejected = error?.code === 'INVALID_CHANGE_SET_SOURCE'
  }
  assert(mixedReviewRejected, 'change set presenter treated a legacy human operation as AI')

  const screenRows = presentChangeSetOperations(makeChangeSet([
    {
      type: 'addScreen',
      screenId: 'screen-review',
      rootComponentId: 'comp-review-page',
      defaultStateId: 'state-review-default',
      name: 'Review screen',
      route: '/review',
    },
    {
      type: 'updateScreen',
      screenId: 'screen-review',
      name: 'Review screen updated',
      route: '/review/updated',
    },
    { type: 'removeScreen', screenId: 'screen-review' },
  ]), 'en')
  assert(
    screenRows[0].navigation?.componentId === 'comp-review-page' &&
      screenRows[1].changes.some(change =>
        change.field === 'Name' &&
        change.before.text === 'Review screen' &&
        change.after.text === 'Review screen updated'
      ) &&
      screenRows[2].targetLabel === 'Review screen updated' &&
      screenRows[2].navigation === null &&
      screenRows[2].impact.includes('1 components') &&
      screenRows[2].impact.includes('1 states'),
    'screen add/update/delete review lost sequential values, navigation, or cleanup impact',
  )

  const addedComponent = createAddComponentCommand(
    baseDocument,
    'screen-list',
    'comp-list-page',
    'button',
    'en',
    0,
  )
  const componentRows = presentChangeSetOperations(makeChangeSet([
    addedComponent,
    {
      type: 'updateComponentSpec',
      componentId: addedComponent.componentId,
      patch: { config: { label: 'First label' } },
    },
    {
      type: 'updateComponentSpec',
      componentId: addedComponent.componentId,
      patch: { config: { label: 'Second label\nwith another line' } },
    },
    {
      type: 'moveComponent',
      componentId: addedComponent.componentId,
      newParentId: 'comp-list-section',
      position: 1,
    },
    {
      type: 'moveComponent',
      componentId: addedComponent.componentId,
      newParentId: 'comp-list-grid',
      position: 0,
    },
    { type: 'removeComponent', componentId: addedComponent.componentId },
  ]), 'en')
  assert(
    componentRows[0].changes.some(change => change.field === 'Type') &&
      componentRows[0].navigation?.componentId === addedComponent.componentId &&
      componentRows[2].changes.some(change =>
        change.field === 'Label' &&
        change.before.text === 'First label' &&
        change.after.fullText === 'Second label ↵ with another line'
      ) &&
      componentRows[3].action === 'Reorder component' &&
      componentRows[4].action === 'Move component to another parent' &&
      componentRows[4].changes.some(change =>
        change.field === 'Parent' &&
        change.before.text === 'List content' &&
        change.after.text === 'User grid'
      ) &&
      componentRows[5].navigation === null,
    'component review lost nested config, immediate snapshots, move semantics, or navigation',
  )

  const nestedComponentRows = presentChangeSetOperations(makeChangeSet([
    {
      type: 'updateComponentSpec',
      componentId: 'comp-task-title-input',
      patch: {
        common: { visible: false, enabled: false },
        config: {
          placeholder: '',
          validationRules: [
            { id: 'review-required', type: 'required', message: 'Required\nmessage' },
            { id: 'review-max', type: 'maxLength', value: 10, message: 'Ten max' },
          ],
        },
      },
    },
  ]), 'en')
  assert(
    nestedComponentRows[0].changes.some(change =>
      change.field === 'Visible' && change.before.text === 'Yes' && change.after.text === 'No'
    ) &&
      nestedComponentRows[0].changes.some(change =>
        change.field === 'Placeholder' && change.after.text === 'Empty string'
      ) &&
      nestedComponentRows[0].changes.some(change =>
        change.field === 'Validation rules' &&
        change.after.fullText.includes('Required: Required ↵ message') &&
        change.after.fullText.includes('Maximum length (10): Ten max')
      ),
    'component review did not distinguish booleans, empty strings, newlines, or validation arrays',
  )

  const stateRows = presentChangeSetOperations(makeChangeSet([
    {
      type: 'createScreenState',
      stateId: 'state-review',
      screenId: 'screen-list',
      name: 'Review',
      description: '',
      overrides: { 'comp-list-title': { text: 'Draft' } },
    },
    {
      type: 'updateScreenState',
      stateId: 'state-review',
      name: 'Review updated',
      description: 'Ready',
      overrides: { 'comp-list-title': { text: 'Published', enabled: false } },
    },
    { type: 'removeScreenState', stateId: 'state-review' },
  ]), 'en')
  assert(
    stateRows[0].changes.some(change =>
      change.field === 'State overrides' && change.after.fullText.includes('Text=Draft')
    ) &&
      stateRows[1].changes.some(change =>
        change.field === 'State overrides' &&
        change.before.fullText.includes('Text=Draft') &&
        change.after.fullText.includes('Text=Published') &&
        change.after.fullText.includes('Enabled=No')
      ) &&
      stateRows[1].navigation?.componentId === 'comp-list-title' &&
      stateRows[1].navigation?.stateId === 'state-review' &&
      stateRows[2].navigation === null,
    'state review lost nested overrides, component navigation, or deletion semantics',
  )

  const eventRows = presentChangeSetOperations(makeChangeSet([
    {
      type: 'connectEvent',
      eventId: 'event-review',
      screenId: 'screen-edit',
      name: 'Cancel review',
      trigger: { type: 'click', componentId: 'comp-cancel-btn' },
      actions: [
        { type: 'setState', stateId: 'state-edit-saving' },
        { type: 'callApi', apiOperationId: 'api-update-task' },
      ],
    },
    {
      type: 'updateEvent',
      eventId: 'event-review',
      name: 'Cancel review updated',
      trigger: { type: 'submit', componentId: 'comp-cancel-btn' },
      actions: [
        { type: 'setState', stateId: 'state-edit-error' },
        { type: 'navigate', destinationScreenId: 'screen-list' },
      ],
    },
    { type: 'removeEvent', eventId: 'event-review' },
  ]), 'en')
  assert(
    eventRows[0].changes.some(change =>
      change.field === 'Actions' &&
      change.after.fullText.includes('Set state: Saving') &&
      change.after.fullText.includes('Call API: PUT /api/tasks/{taskId}')
    ) &&
      eventRows[1].changes.some(change =>
        change.field === 'Trigger' &&
        change.before.text.includes('Click') &&
        change.after.text.includes('Submit')
      ) &&
      eventRows[1].changes.some(change =>
        change.field === 'Actions' &&
        change.after.fullText.includes('Set state: Error') &&
        change.after.fullText.includes('Navigate: Task List')
      ) &&
      eventRows[1].navigation?.componentId === 'comp-cancel-btn' &&
      eventRows[2].navigation === null,
    'event review lost ordered actions, resolved references, trigger diff, or navigation',
  )

  const apiRows = presentChangeSetOperations(makeChangeSet([
    {
      type: 'bindApiOperation',
      operationId: 'api-review',
      screenId: 'screen-edit',
      name: 'Review API',
      method: 'POST',
      path: '/api/review',
      requestBindings: [
        { componentId: 'comp-task-title-input', targetPath: 'body.title' },
      ],
      successStateId: 'state-edit-success',
    },
    {
      type: 'updateApiOperation',
      operationId: 'api-review',
      name: 'Review API updated',
      method: 'PATCH',
      path: '/api/review/{id}',
      requestBindings: [
        { componentId: 'comp-task-description-input', targetPath: 'body.description' },
        { componentId: 'comp-task-assignee-select', targetPath: 'body.assigneeId' },
      ],
      successStateId: null,
      errorStateId: 'state-edit-error',
    },
    { type: 'removeApiOperation', operationId: 'api-review' },
  ]), 'en')
  assert(
    apiRows[0].changes.some(change =>
      change.field === 'Request bindings' &&
      change.after.fullText === 'Task title → body.title'
    ) &&
      apiRows[1].changes.some(change =>
        change.field === 'Request bindings' &&
        change.before.fullText === 'Task title → body.title' &&
        change.after.fullText.includes('Description → body.description') &&
        change.after.fullText.includes('Assignee → body.assigneeId')
      ) &&
      apiRows[1].changes.some(change =>
        change.field === 'Success state' &&
        change.before.text === 'Success' &&
        change.after.text === 'None'
      ) &&
      apiRows[1].navigation?.componentId === 'comp-task-description-input' &&
      apiRows[2].navigation === null,
    'API review lost binding arrays, null state references, or navigation',
  )

  const allRows = [
    ...screenRows,
    ...componentRows,
    ...nestedComponentRows,
    ...stateRows,
    ...eventRows,
    ...apiRows,
  ]
  assert(
    new Set(allRows.map(row => row.commandType)).size === 16,
    'change set presenter does not cover all DomainCommand variants',
  )

  let invalidRaised = false
  try {
    presentChangeSetOperations(makeChangeSet([
      {
        type: 'updateComponentSpec',
        componentId: 'missing-component',
        patch: { common: { visible: false } },
      },
    ]), 'en')
  } catch {
    invalidRaised = true
  }
  assert(invalidRaised, 'invalid change set operation was silently presented')

  const listSource = readFileSync(
    join(root, 'src/features/change-review/ChangeOperationList.tsx'),
    'utf8',
  )
  assert(
    listSource.includes('presentChangeSetOperations') &&
      listSource.includes('data-command-type') &&
      listSource.includes('setActiveScreen') &&
      listSource.includes('setActiveState') &&
      listSource.includes('setSelectedComponent') &&
      listSource.includes('setRightPanelTab') &&
      listSource.includes('operation.navigation ? ('),
    'Changes UI lost sequential presentation, safe navigation, or static deletion rows',
  )
})

await test('active change set component markers reflect final net effects', async () => {
  {
    memoryStorage.clear()
    const {
      compareComponentChanges: compareChanges,
      getChangeSetComponentChanges: getMarkerChanges,
    } = await import(
      moduleUrl(changeSetComponentChangesBundle, 'change-set-component-changes-v3')
    )
    const { createAddComponentCommand: createMarkerComponent } = await import(
      moduleUrl(componentFactoryBundle, 'change-set-component-marker-factory-v3')
    )
    const { applyCommandWithoutRevision: applyMarkerCommand } = await import(
      moduleUrl(domainBundle, 'change-set-component-marker-domain-v3')
    )
    const markerStore = await freshStore('change-set-component-markers-v3')
    const markerBase = markerStore.getState().document
    let markerOperation = 0
    const markerChangeSet = commands => ({
      id: `marker-v3-${markerOperation}`,
      summary: 'Component marker operations',
      baseRevision: markerStore.getState().revision,
      version: commands.length,
      baseDocument: markerBase,
      operations: commands.map(command => ({
        id: `marker-v3-op-${++markerOperation}`,
        source: 'agent',
        command,
        issuedAt: '2026-01-01T00:00:00.000Z',
      })),
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const temporaryComponent = createMarkerComponent(
      markerBase,
      'screen-list',
      'comp-task-list',
      'text',
      'en',
    )
    const reverted = getMarkerChanges(markerChangeSet([
      temporaryComponent,
      {
        type: 'updateComponentSpec',
        componentId: temporaryComponent.componentId,
        patch: { config: { text: 'Temporary update' } },
      },
      { type: 'removeComponent', componentId: temporaryComponent.componentId },
      {
        type: 'updateComponentSpec',
        componentId: 'comp-list-summary',
        patch: { config: { text: 'Temporary summary' } },
      },
      {
        type: 'updateComponentSpec',
        componentId: 'comp-list-summary',
        patch: { config: { text: markerBase.components['comp-list-summary'].config.text } },
      },
    ]))
    assert(
      reverted.statuses.size === 0 && reverted.removedComponents.length === 0,
      'add/delete or edit/revert sequences created a final marker',
    )
    const scenario = markerBase.screenScenarios['scenario-edit-success']
    const scenarioChanges = getMarkerChanges(markerChangeSet([{
      type: 'updateScreenState',
      stateId: scenario.id,
      overrides: [
        ...scenario.componentOverrides,
        {
          target: { type: 'inline', componentId: 'comp-task-name-input' },
          override: { value: 'Draft name' },
        },
      ],
    }]))
    assert(
      scenarioChanges.statuses.get('comp-task-name-input') === 'modified',
      'scenario override changes did not mark their canonical target',
    )
    const removedPreview = applyMarkerCommand(markerBase, {
      type: 'removeComponent',
      componentId: 'comp-launch-task-card',
    })
    const removed = compareChanges(markerBase, removedPreview)
    assert(
      removed.statuses.get('comp-task-list') === 'modified' &&
        removed.removedComponents.length === 1,
      'subtree removal did not preserve canonical hierarchy markers',
    )
    return
  }
  memoryStorage.clear()
  const {
    compareComponentChanges,
    getChangeSetComponentChanges,
  } = await import(moduleUrl(changeSetComponentChangesBundle, 'change-set-component-changes'))
  const { createAddComponentCommand } = await import(
    moduleUrl(componentFactoryBundle, 'change-set-component-marker-factory')
  )
  const { applyCommandWithoutRevision } = await import(
    moduleUrl(domainBundle, 'change-set-component-marker-domain')
  )
  const store = await freshStore('change-set-component-markers')
  const baseDocument = store.getState().document
  let operationNumber = 0
  const makeChangeSet = commands => ({
    id: `marker-${operationNumber}`,
    summary: 'Component marker operations',
    baseRevision: baseDocument.revision,
    version: commands.length,
    baseDocument,
    operations: commands.map(command => ({
      id: `marker-op-${++operationNumber}`,
      source: 'agent',
      command,
      issuedAt: '2026-01-01T00:00:00.000Z',
    })),
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  const revisionOnly = compareComponentChanges(
    baseDocument,
    { ...baseDocument, revision: baseDocument.revision + 100 },
  )
  assert(
    revisionOnly.statuses.size === 0 && revisionOnly.removedComponents.length === 0,
    'revision-only changes must not create component markers',
  )

  const temporary = createAddComponentCommand(
    baseDocument,
    'screen-list',
    'comp-list-section',
    'button',
    'en',
  )
  const reverted = getChangeSetComponentChanges(makeChangeSet([
    temporary,
    {
      type: 'updateComponentSpec',
      componentId: temporary.componentId,
      patch: { config: { label: 'Temporary update' } },
    },
    { type: 'removeComponent', componentId: temporary.componentId },
    {
      type: 'updateComponentSpec',
      componentId: 'comp-list-summary',
      patch: { config: { text: 'Temporary title' } },
    },
    {
      type: 'updateComponentSpec',
      componentId: 'comp-list-title',
      patch: { config: { text: 'Team Tasks' } },
    },
  ]))
  assert(
    reverted.statuses.size === 0 && reverted.removedComponents.length === 0,
    'add/delete or edit/revert sequences must have no final marker',
  )

  const added = createAddComponentCommand(
    baseDocument,
    'screen-list',
    'comp-list-section',
    'button',
    'en',
  )
  const addedModal = createAddComponentCommand(
    baseDocument,
    'screen-list',
    null,
    'modal',
    'en',
  )
  const structural = getChangeSetComponentChanges(makeChangeSet([
    added,
    addedModal,
    {
      type: 'moveComponent',
      componentId: 'comp-list-grid',
      newParentId: 'comp-list-section',
      position: 0,
    },
  ]))
  assert(
    structural.statuses.get(added.componentId) === 'added' &&
      structural.statuses.get(addedModal.componentId) === 'added' &&
      structural.statuses.get('comp-list-grid') === 'modified' &&
      structural.statuses.get('comp-list-title') === 'modified' &&
      structural.statuses.get('comp-list-section') === 'modified',
    'add, Modal root, parent children, and reordered sibling markers were not derived',
  )

  const state = baseDocument.screenStates['state-edit-saving']
  const stateChanges = getChangeSetComponentChanges(makeChangeSet([{
    type: 'updateScreenState',
    stateId: state.id,
    name: state.name,
    description: state.description,
    overrides: {
      ...state.componentOverrides,
      'comp-task-title-input': { value: 'Draft name' },
    },
  }]))
  assert(
    stateChanges.statuses.size === 1 &&
      stateChanges.statuses.get('comp-task-title-input') === 'modified',
    'state override changes must mark only their component',
  )

  const event = baseDocument.events['event-save-task']
  const eventChanges = getChangeSetComponentChanges(makeChangeSet([{
    type: 'updateEvent',
    eventId: event.id,
    name: `${event.name} updated`,
    trigger: event.trigger,
    actions: [{ type: 'navigate', destinationScreenId: 'screen-list' }],
  }]))
  assert(
    eventChanges.statuses.size === 1 &&
      eventChanges.statuses.get('comp-save-btn') === 'modified',
    'event changes must mark the trigger component without unrelated targets',
  )

  const api = baseDocument.apiOperations['api-update-task']
  const apiMetadataOnly = getChangeSetComponentChanges(makeChangeSet([{
    type: 'updateApiOperation',
    operationId: api.id,
    name: `${api.name} updated`,
    method: 'PATCH',
    path: '/api/tasks/{taskId}/review',
    requestBindings: api.requestBindings,
    successStateId: api.successStateId,
    errorStateId: api.errorStateId,
  }]))
  assert(
    apiMetadataOnly.statuses.size === 0,
    'API-only metadata changes must not be misattributed to bound components',
  )

  const apiBindingChanges = getChangeSetComponentChanges(makeChangeSet([{
    type: 'updateApiOperation',
    operationId: api.id,
    name: api.name,
    method: api.method,
    path: api.path,
    requestBindings: api.requestBindings.map(binding =>
      binding.componentId === 'comp-task-title-input'
        ? { ...binding, targetPath: 'body.displayName' }
        : binding
    ),
    successStateId: api.successStateId,
    errorStateId: api.errorStateId,
  }]))
  assert(
    apiBindingChanges.statuses.size === 1 &&
      apiBindingChanges.statuses.get('comp-task-title-input') === 'modified',
    'API request binding changes must mark the bound component',
  )

  const validationChanges = getChangeSetComponentChanges(makeChangeSet([{
    type: 'updateComponentSpec',
    componentId: 'comp-task-title-input',
    patch: {
      config: {
        validationRules: [
          { id: 'marker-required', type: 'required', message: 'Required' },
        ],
      },
    },
  }]))
  assert(
    validationChanges.statuses.get('comp-task-title-input') === 'modified',
    'validation rules must be included in component config markers',
  )

  const removedPreview = applyCommandWithoutRevision(baseDocument, {
    type: 'removeComponent',
    componentId: 'comp-list-grid',
  })
  const removed = compareComponentChanges(baseDocument, removedPreview)
  assert(
    removed.statuses.get('comp-list-section') === 'modified' &&
      removed.removedComponents.map(change => change.componentId).join(',') ===
        [
          'comp-list-grid',
          'comp-task-launch-card',
          'comp-task-launch-title',
          'comp-task-launch-meta',
          'comp-edit-launch-task-btn',
          'comp-task-docs-card',
          'comp-task-docs-title',
          'comp-task-docs-meta',
          'comp-edit-docs-task-btn',
        ].join(','),
    'subtree removal must preserve base hierarchy order and mark the surviving parent',
  )

  const screenOnly = getChangeSetComponentChanges(makeChangeSet([{
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Renamed list',
    route: '/renamed-list',
  }]))
  assert(
    screenOnly.statuses.size === 0 && screenOnly.removedComponents.length === 0,
    'Screen-only changes must not create component markers',
  )

  const canvasSource = readFileSync(join(root, 'src/features/canvas/Canvas.tsx'), 'utf8')
  const treeSource = readFileSync(
    join(root, 'src/features/structure-tree/StructureTree.tsx'),
    'utf8',
  )
  const ghostSource = readFileSync(
    join(root, 'src/features/change-review/RemovedComponentGhostList.tsx'),
    'utf8',
  )
  assert(
    canvasSource.includes('data-component-change={changeStatus}') &&
      treeSource.includes('data-component-change={changeStatus}') &&
      canvasSource.includes('RemovedComponentGhostList') &&
      treeSource.includes('RemovedComponentGhostList') &&
      ghostSource.includes('data-removed-component-ghosts={surface}') &&
      !ghostSource.includes('useSortable') &&
      !ghostSource.includes('ComponentDropZone'),
    'Canvas/Tree marker chrome or non-DnD removed ghosts are not wired safely',
  )
})

await test('central editor screen context follows the effective active screen', async () => {
  memoryStorage.clear()
  const store = await freshStore('active-screen-context')
  store.getState().setActiveScreen('screen-list')

  const previewChangeSet = store.getState().beginChangeSet('Preview screen context')
  store.getState().dispatchToChangeSet(previewChangeSet.id, {
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Preview task list',
    route: '/preview/tasks',
  }, 'agent')
  assert(
    store.getState().document.screens['screen-list'].name === 'Task List' &&
      store.getState().effectiveDocument.screens['screen-list'].name === 'Preview task list' &&
      store.getState().effectiveDocument.screens['screen-list'].route === '/preview/tasks',
    'screen context source did not distinguish confirmed and preview values',
  )

  store.getState().rejectChangeSet()
  assert(
    store.getState().effectiveDocument.screens['screen-list'].name === 'Task List',
    'reject did not restore the screen context source',
  )

  const acceptedChangeSet = store.getState().beginChangeSet('Accept screen context')
  store.getState().dispatchToChangeSet(acceptedChangeSet.id, {
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Accepted task list',
    route: '/accepted/tasks',
  }, 'agent')
  store.getState().acceptChangeSet()
  assert(
    store.getState().effectiveDocument.screens['screen-list'].name === 'Accepted task list',
    'accept did not retain the effective screen context',
  )
  store.getState().undo()
  assert(
    store.getState().effectiveDocument.screens['screen-list'].name === 'Task List',
    'undo did not update the effective screen context',
  )
  store.getState().redo()
  assert(
    store.getState().effectiveDocument.screens['screen-list'].route === '/accepted/tasks',
    'redo did not update the effective screen route',
  )

  const appSource = readFileSync(join(root, 'src/app/App.tsx'), 'utf8')
  const appStyles = readFileSync(join(root, 'src/app/App.module.css'), 'utf8')
  const contextIndex = appSource.indexOf('className={styles.screenContext}')
  const canvasIndex = appSource.indexOf('<Canvas />', contextIndex)
  assert(
    appSource.includes('getOwnEntity(effectiveDocument.screens, ui.activeScreenId)') &&
      appSource.includes('data-active-screen-context={activeScreen.id}') &&
      appSource.includes("t('editor.screenName')") &&
      appSource.includes("t('editor.screenRoute')") &&
      contextIndex >= 0 &&
      canvasIndex > contextIndex,
    'screen context is not derived from the effective document or placed before Canvas',
  )
  assert(
    appStyles.includes('.editor') &&
      appStyles.includes('.screenContext') &&
      appStyles.includes('.screenContextList') &&
      appStyles.includes('text-overflow: ellipsis') &&
      appStyles.includes('ui-monospace') &&
      appStyles.includes('.canvas') &&
      appStyles.includes('min-height: 0'),
    'screen context lost its fixed, truncating, route-readable central-pane layout',
  )
})

await test('Structure Tree keyboard model follows the ARIA tree pattern', async () => {
  memoryStorage.clear()
  const {
    getVisibleTreeItemIds,
    resolveTreeKeyboardIntent,
  } = await import(moduleUrl(structureTreeKeyboardBundle, 'structure-tree-keyboard'))
  const store = await freshStore('structure-tree-keyboard')
  const document = store.getState().effectiveDocument
  const screen = document.screens['screen-list']
  const expandedIds = getVisibleTreeItemIds(document, screen, new Set())
  assert(
    expandedIds.join(',') === [
      'comp-list-page',
      'comp-list-header',
      'comp-list-summary',
      'comp-task-list',
      'comp-launch-task-card',
      'comp-create-task-btn',
      'comp-list-loading-message',
      'comp-list-empty-message',
      'comp-list-help-link',
      'comp-create-modal',
      'comp-create-form',
      'comp-create-title-input',
      'comp-create-submit-btn',
      'comp-create-cancel-btn',
    ].join(','),
    'visible Tree order does not follow the expanded hierarchy',
  )

  const collapsedIds = new Set(['comp-task-list'])
  const visibleIds = getVisibleTreeItemIds(document, screen, collapsedIds)
  const intent = (key, componentId, ids = visibleIds, collapsed = collapsedIds) =>
    resolveTreeKeyboardIntent({
      key,
      componentId,
      visibleIds: ids,
      document,
      collapsedIds: collapsed,
    })
  assert(
    visibleIds.join(',') === [
      'comp-list-page',
      'comp-list-header',
      'comp-list-summary',
      'comp-task-list',
      'comp-create-task-btn',
      'comp-list-loading-message',
      'comp-list-empty-message',
      'comp-list-help-link',
      'comp-create-modal',
      'comp-create-form',
      'comp-create-title-input',
      'comp-create-submit-btn',
      'comp-create-cancel-btn',
    ].join(',') &&
      intent('ArrowDown', 'comp-list-header')?.componentId === 'comp-list-summary' &&
      intent('ArrowUp', 'comp-task-list')?.componentId === 'comp-list-summary' &&
      intent('Home', 'comp-task-list')?.componentId === 'comp-list-page' &&
      intent('End', 'comp-list-page')?.componentId === 'comp-create-cancel-btn',
    'Tree previous/next/Home/End navigation does not use visible items',
  )
  assert(
    intent('ArrowRight', 'comp-task-list')?.type === 'expand' &&
      intent('ArrowRight', 'comp-list-page', expandedIds, new Set())?.componentId ===
        'comp-list-header' &&
      intent('ArrowLeft', 'comp-list-page', expandedIds, new Set())?.type === 'collapse' &&
      intent('ArrowLeft', 'comp-list-header', expandedIds, new Set())?.componentId ===
        'comp-list-page' &&
      intent('Enter', 'comp-list-summary')?.type === 'select' &&
      intent(' ', 'comp-list-summary')?.type === 'select',
    'Tree expand/collapse/parent/child/selection keyboard intents are incomplete',
  )

  const treeSource = readFileSync(
    join(root, 'src/features/structure-tree/StructureTree.tsx'),
    'utf8',
  )
  const treeStyles = readFileSync(
    join(root, 'src/features/structure-tree/StructureTree.module.css'),
    'utf8',
  )
  assert(
    treeSource.includes('role="tree"') &&
      treeSource.includes('role="treeitem"') &&
      treeSource.includes('role="group"') &&
      treeSource.includes('aria-level={depth + 1}') &&
      treeSource.includes('aria-selected={isSelected}') &&
      treeSource.includes('aria-expanded={hasChildren ? !isCollapsed : undefined}') &&
      treeSource.includes('tabIndex={isFocused ? 0 : -1}'),
    'Structure Tree lost ARIA hierarchy or roving tabindex semantics',
  )
  assert(
    treeSource.includes('event.target !== event.currentTarget') &&
      treeSource.includes("intent.type === 'focus'") &&
      treeSource.includes("intent.type === 'select'") &&
      treeSource.includes('data-drag-surface="tree"') &&
      treeSource.includes('{...listeners}') &&
      treeSource.includes('lastRevealedSelectionKeyRef.current !== revealKey') &&
      treeSource.includes('lastRevealedSelectionKeyRef.current = revealKey'),
    'Tree keys conflict with internal controls/DnD or selection reveal reopens user collapse',
  )
  assert(
    treeStyles.includes('.nodeWrapper:focus-visible > .node') &&
      treeStyles.includes('outline: 2px solid var(--accent)'),
    'Treeitem focus ring is not visibly preserved',
  )
})

await test('editor-only drop affordances and internal names stay out of idle UI', async () => {
  const dropZoneSource = readFileSync(
    join(root, 'src/dnd/ComponentDropZone.tsx'),
    'utf8',
  )
  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  assert(
    !dropZoneSource.includes('ここに追加') && !dropZoneSource.includes('ここにドロップ'),
    'visible drop instructions remain in the drop zone',
  )
  assert(
    dropZoneSource.includes('const showAffordance = compatibleSurface') &&
      dropZoneSource.includes('disabled: validDrag && !compatibleSurface') &&
      dropZoneSource.includes('data-drop-visible={showAffordance || undefined}') &&
      dropZoneSource.includes('compatibleSurface ? accepts ?') &&
      dropZoneSource.includes('isDropSurfaceCompatible'),
    'drop affordances or registration do not isolate origin and target surfaces',
  )
  assert(
    !inspectorSource.includes('コンポーネント名'),
    'internal component name remains editable in the inspector',
  )
  assert(
    !inspectorSource.includes("t('inspector.pageTitle')") &&
      !inspectorSource.includes("t('inspector.sectionTitle')") &&
      !inspectorSource.includes("t('inspector.modalTitle')"),
    'structural content title fields remain in the inspector',
  )
})

await test('active state descriptions stay in accessible editor chrome', async () => {
  const canvasSource = readFileSync(
    join(root, 'src/features/canvas/Canvas.tsx'),
    'utf8',
  )
  const canvasStyles = readFileSync(
    join(root, 'src/features/canvas/Canvas.module.css'),
    'utf8',
  )
  assert(
    canvasSource.includes('activeState?.description.trim()') &&
      canvasSource.includes('aria-describedby={isActive ? activeStateDescriptionId : undefined}') &&
      canvasSource.includes('className={styles.stateDescriptionSlot}') &&
      canvasSource.includes('aria-hidden={activeStateDescription ? undefined : true}') &&
      canvasSource.includes('className={styles.stateDescription}') &&
      canvasSource.includes('title={activeStateDescription}') &&
      canvasSource.indexOf('className={styles.stateDescription}') <
        canvasSource.indexOf('className={styles.wireframe}'),
    'active state description is not conditionally linked inside fixed editor chrome',
  )
  assert(
    canvasStyles.includes('.stateDescriptionSlot') &&
      canvasStyles.includes('height: 18px') &&
      canvasStyles.includes('flex: 0 0 18px') &&
    canvasStyles.includes('.stateDescription') &&
      canvasStyles.includes('overflow: hidden') &&
      canvasStyles.includes('text-overflow: ellipsis') &&
      canvasStyles.includes('white-space: nowrap'),
    'state description slot does not remain fixed or truncate safely',
  )
})

await test('Canvas chrome stays transient while Containers expose structural bounds', async () => {
  const canvasSource = readFileSync(
    join(root, 'src/features/canvas/Canvas.tsx'),
    'utf8',
  )
  const canvasStyles = readFileSync(
    join(root, 'src/features/canvas/Canvas.module.css'),
    'utf8',
  )
  const dropZoneStyles = readFileSync(
    join(root, 'src/dnd/ComponentDropZone.module.css'),
    'utf8',
  )
  const idleComponentRule = canvasStyles.match(/\.comp \{([^}]*)\}/)?.[1] ?? ''
  const containerRule =
    canvasStyles.match(/[.]containerComponent\s*\{([^}]*)\}/)?.[1] ?? ''

  assert(
    !canvasSource.includes('COMPONENT_KIND_MESSAGE_KEYS') &&
    !canvasSource.includes('styles.componentKind') &&
    canvasSource.includes('<span className={styles.componentLabel}>{displayName}</span>') &&
    !canvasSource.includes('containerIdentity') &&
    !canvasSource.includes('data-container-identity') &&
    canvasSource.includes('data-container-component='),
    'Canvas does not keep all labels transient or leaked Container identity content',
  )
  assert(
    !idleComponentRule.includes('border:') &&
      !idleComponentRule.includes('background:') &&
      !idleComponentRule.includes('padding:') &&
      !idleComponentRule.includes('margin:'),
    'idle Canvas component wrappers still add visible chrome or spacing',
  )
  assert(
    canvasStyles.includes('.componentChrome') &&
      canvasStyles.includes('position: absolute') &&
      canvasStyles.includes('opacity: 0') &&
      canvasStyles.includes('.hovered > .componentChrome') &&
      canvasStyles.includes('.selected > .componentChrome') &&
      canvasStyles.includes('.comp:focus-visible::after'),
    'floating Canvas chrome is not gated by hover, selection, or focus',
  )
  assert(
    containerRule.includes('box-sizing: border-box') &&
      containerRule.includes('min-height: 64px') &&
      containerRule.includes('padding: 10px') &&
      containerRule.includes('border: 1px dashed') &&
      !canvasStyles.includes('.containerIdentity') &&
      canvasStyles.includes("width: 100%") &&
      canvasStyles.includes('@media (forced-colors: active)'),
    'Container structure lost its persistent boundary, empty height, or forced-color fallback',
  )
  assert(
    canvasSource.includes('hoveredComponentId === component.id') &&
      canvasSource.includes('event.stopPropagation()') &&
      canvasSource.includes('data-editor-hovered={isHovered || undefined}'),
    'Canvas does not enforce one most-specific hovered component',
  )
  assert(
    dropZoneStyles.includes('.canvas {') &&
      dropZoneStyles.includes('position: absolute') &&
      dropZoneStyles.includes('.canvas.end { inset: auto 0 -5px; }'),
    'Canvas insertion targets still consume preview layout space',
  )
})

await test('Canvas component surfaces are isolated accessible drag activators', async () => {
  const canvasSource = readFileSync(
    join(root, 'src/features/canvas/Canvas.tsx'),
    'utf8',
  )
  const canvasStyles = readFileSync(
    join(root, 'src/features/canvas/Canvas.module.css'),
    'utf8',
  )
  const dndSource = readFileSync(
    join(root, 'src/dnd/EditorDndContext.tsx'),
    'utf8',
  )
  const dndStyles = readFileSync(
    join(root, 'src/dnd/EditorDndContext.module.css'),
    'utf8',
  )
  const treeSource = readFileSync(
    join(root, 'src/features/structure-tree/StructureTree.tsx'),
    'utf8',
  )

  assert(
    !canvasSource.includes('styles.dragHandle') &&
      !canvasSource.includes('data-drag-surface="canvas"') &&
      canvasSource.includes('<span className={styles.componentLabel}>{displayName}</span>'),
    'Canvas still renders a dedicated drag grip',
  )
  assert(
    canvasSource.includes('const canDrag = !isRoot && !reviewLocked && !spacePanActive') &&
      canvasSource.includes('{...(canDrag ? attributes : {})}') &&
      canvasSource.includes('{...(canDrag ? listeners : {})}') &&
      canvasSource.includes('canDrag ? styles.draggable :') &&
      canvasSource.includes('isDragging && canDrag ? styles.dragging :') &&
      canvasSource.includes('tabIndex={isRoot || reviewLocked ? -1 : 0}') &&
      canvasSource.includes('data-canvas-draggable={canDrag || undefined}') &&
      canvasSource.includes('data-canvas-dragging={isDragging && canDrag || undefined}') &&
      canvasSource.includes("data-drag-surface={canDrag ? 'canvas' : undefined}") &&
      canvasSource.includes(
        "aria-label={isRoot || reviewLocked ? displayName : t('canvas.dragAria', { label: displayName })}",
      ),
    'non-root Canvas wrappers are not accessible whole-surface drag activators',
  )
  assert(
    canvasSource.includes('draggable: isRoot || reviewLocked || spacePanActive') &&
      !canvasSource.includes('listeners?.onPointerDown?.(event)') &&
      !canvasSource.includes('listeners?.onTouchStart?.(event)') &&
      !canvasSource.includes('listeners?.onKeyDown?.(event)') &&
      /onKeyDownCapture=\{event => \{[\s\S]*?closest<HTMLElement>\('\[data-component-id\]'\)[\s\S]*?if \(closestComponent !== event\.currentTarget\) return[\s\S]*?addMenu\.openFromKeyboard/.test(
        canvasSource,
      ) &&
      canvasSource.includes("if (event.key !== ' ' && event.key !== 'Enter')") &&
      !canvasSource.match(/onPointerMove=\{event => \{\s*event\.stopPropagation\(\)/),
    'Canvas still manually forwards dnd activators or blocks the document pointer sensor',
  )
  assert(
    dndSource.includes('PointerSensor, { activationConstraint: { distance: 5 } }') &&
      dndSource.includes('KeyboardSensor, { coordinateGetter: defaultKeyboardCoordinateGetter }') &&
      dndSource.includes('compatibleContainers') &&
      dndSource.includes('isDropSurfaceCompatible(drag, target)') &&
      dndSource.includes('pointerWithin(compatibleArguments)') &&
      dndSource.includes('closestCenter(compatibleArguments)'),
    'click separation, keyboard DnD, or surface-filtered collision support is missing',
  )
  assert(
    canvasStyles.includes('.draggable') &&
      canvasStyles.includes('cursor: grab') &&
      canvasStyles.includes('.dragging { cursor: grabbing') &&
      canvasStyles.includes('.comp:focus-visible::after') &&
      canvasStyles.includes('.comp:focus-visible > .componentChrome') &&
      canvasStyles.includes('.previewControl { pointer-events: none; }') &&
      dndStyles.includes('cursor: grabbing'),
    'whole-surface cursor, focus, preview-control, or overlay feedback is incomplete',
  )
  assert(
    treeSource.includes('className={styles.dragHandle}') &&
      treeSource.includes('data-drag-surface="tree"'),
    'Tree drag grip changed with the Canvas-only interaction',
  )
})

await test('Canvas and Tree present modal roots as independent frames', async () => {
  const canvasSource = readFileSync(
    join(root, 'src/features/canvas/Canvas.tsx'),
    'utf8',
  )
  const canvasStyles = readFileSync(
    join(root, 'src/features/canvas/Canvas.module.css'),
    'utf8',
  )
  const treeSource = readFileSync(
    join(root, 'src/features/structure-tree/StructureTree.tsx'),
    'utf8',
  )
  const paletteSource = readFileSync(
    join(root, 'src/features/palette/Palette.tsx'),
    'utf8',
  )
  const dndSource = readFileSync(
    join(root, 'src/dnd/EditorDndContext.tsx'),
    'utf8',
  )
  const placementSource = readFileSync(
    join(root, 'src/domain/componentPlacement.ts'),
    'utf8',
  )

  assert(
    canvasSource.includes('screen.modalComponentIds.map') &&
      canvasSource.includes('data-canvas-frame={frameKind}') &&
      canvasSource.includes('independentRoot') &&
      canvasSource.includes("t('canvas.hiddenInState')"),
    'Canvas does not render Page and Modal roots as independently editable frames',
  )
  assert(
    canvasStyles.includes('.frames {') &&
      canvasStyles.includes('.pageFrame') &&
      canvasStyles.includes('.modalFrame') &&
      canvasStyles.includes('width: max-content') &&
      !canvasStyles.includes('.modalComponent {'),
    'Canvas frame layout still treats Modal as an in-flow component card',
  )
  assert(
    treeSource.includes('screen.modalComponentIds.map') &&
      treeSource.includes("data-tree-root={isPageRoot ? 'page' : isModalRoot ? 'modal' : undefined}") &&
      treeSource.includes('disabled: { draggable: isIndependentRoot'),
    'Structure Tree does not expose separate non-draggable Page and Modal roots',
  )
  assert(
    paletteSource.includes("if (item.kind !== 'modal')") &&
      dndSource.includes('outcome.parentId') &&
      placementSource.includes("kind === 'modal' ? null : targetParentId") &&
      placementSource.includes("kind === 'modal' ? undefined : dropPosition"),
    'palette click and drag do not route Modal creation to an independent root',
  )
})

await test('container layouts drive preview, DnD, and palette feedback', async () => {
  const canvasSource = readFileSync(
    join(root, 'src/features/canvas/Canvas.tsx'),
    'utf8',
  )
  const canvasStyles = readFileSync(
    join(root, 'src/features/canvas/Canvas.module.css'),
    'utf8',
  )
  const dropZoneStyles = readFileSync(
    join(root, 'src/dnd/ComponentDropZone.module.css'),
    'utf8',
  )
  const dndSource = readFileSync(
    join(root, 'src/dnd/EditorDndContext.tsx'),
    'utf8',
  )
  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  const horizontalChildrenRule =
    canvasStyles.match(/[.]horizontalChildren\s*\{([^}]*)\}/)?.[1] ?? ''
  const wrapChildrenRule =
    canvasStyles.match(/[.]wrapChildren\s*\{([^}]*)\}/)?.[1] ?? ''
  const gridChildrenRule =
    canvasStyles.match(/[.]gridChildren\s*\{([^}]*)\}/)?.[1] ?? ''
  const gridEndRule =
    dropZoneStyles.match(/[.]grid[.]end\s*\{([^}]*)\}/)?.[1] ?? ''
  assert(
    canvasSource.includes('horizontalListSortingStrategy') &&
      canvasSource.includes('rectSortingStrategy') &&
      canvasSource.includes('orientation={dropOrientation}') &&
      canvasSource.includes("'--layout-columns'"),
    'container layout does not select matching sorting, drop orientation, and column settings',
  )
  assert(
    horizontalChildrenRule.includes('flex-direction: row') &&
      horizontalChildrenRule.includes('overflow-x: auto') &&
      horizontalChildrenRule.includes('overflow-y: hidden') &&
      wrapChildrenRule.includes('overflow: visible') &&
      gridChildrenRule.includes('grid-template-columns: repeat(var(--layout-columns') &&
      gridChildrenRule.includes('overflow-x: auto') &&
      gridChildrenRule.includes('overflow-y: hidden') &&
      canvasStyles.includes('gap: var(--layout-gap'),
    'horizontal and grid layouts do not keep horizontal overflow without vertical scrolling',
  )
  assert(
    dropZoneStyles.includes('.horizontal') &&
      dropZoneStyles.includes('.grid') &&
      dropZoneStyles.includes('border-left: 2px solid transparent') &&
      gridEndRule.includes('inset: auto 0 0') &&
      !gridEndRule.includes('-5px'),
    'horizontal and grid insertion targets are missing or grid end overflows vertically',
  )
  assert(
    inspectorSource.includes("cfg.kind === 'container'") &&
      inspectorSource.includes("layout.layout === 'grid'") &&
      inspectorSource.includes("layout.layout === 'horizontal'") &&
    inspectorSource.includes("t('inspector.sectionLayout')"),
    'shared layout controls are missing or not mode-sensitive',
  )
  assert(
    dndSource.includes("drag.type === 'palette'") &&
      dndSource.includes('dropAnimation={isPaletteDrag ? null : undefined}'),
    'palette add still uses the move-style overlay drop animation',
  )
})

await test('semantic containers replace legacy layout kinds across commands and persistence', async () => {
  memoryStorage.clear()
  const store = await freshStore('semantic-container-layout')
  const { createAddComponentCommand, PALETTE_ITEMS } = await import(
    moduleUrl(componentFactoryBundle, 'semantic-container-factory')
  )
  const { PALETTE_COMPONENT_KINDS } = await import(
    moduleUrl(modelBundle, 'semantic-container-kinds')
  )
  const kinds = PALETTE_ITEMS.map(item => item.kind)
  assert(
    kinds.includes('container') && !kinds.includes('section'),
    'palette did not consolidate structural grouping into Container',
  )
  assert(
    kinds.join(',') === PALETTE_COMPONENT_KINDS.join(','),
    'palette diverged from the canonical component catalog',
  )

  const containerCommand = createAddComponentCommand(
    store.getState().document,
    'screen-list',
    'comp-task-list',
    'container',
    'en',
  )
  assert(
    JSON.stringify(containerCommand.config) === JSON.stringify({
      kind: 'container',
      layout: 'vertical',
      gap: 'md',
      columns: 2,
      justify: 'start',
      align: 'stretch',
      wrap: false,
    }),
    'container factory did not create the complete default layout',
  )
  store.getState().dispatch(containerCommand, 'Add semantic container')
  store.getState().dispatch({
    type: 'updateComponentSpec',
    componentId: containerCommand.componentId,
    patch: {
      config: {
        layout: 'grid',
        gap: 'lg',
        columns: 4,
        justify: 'center',
        align: 'end',
        wrap: false,
      },
    },
  }, 'Configure semantic container')
  let config = store.getState().document.components[containerCommand.componentId].config
  assert(
    config.kind === 'container' &&
      config.layout === 'grid' &&
      config.gap === 'lg' &&
      config.columns === 4 &&
      config.justify === 'center' &&
      config.align === 'end',
    'container layout command was not applied',
  )

  const changeSet = store.getState().beginChangeSet('AI layout adjustment')
  store.getState().dispatchToChangeSet(changeSet.id, {
    type: 'updateComponentSpec',
    componentId: containerCommand.componentId,
    patch: { config: { layout: 'horizontal', wrap: true, justify: 'between' } },
  })
  const active = store.getState().activeChangeSet
  assert(
    active?.id === changeSet.id &&
      active.operations.at(-1)?.source === 'agent' &&
      store.getState().effectiveDocument.components[containerCommand.componentId].config.layout === 'horizontal',
    'agent layout edit did not join the active change set',
  )
  store.getState().acceptChangeSet()
  const reloaded = await freshStore('semantic-container-layout-reload')
  config = reloaded.getState().document.components[containerCommand.componentId].config
  assert(
    config.kind === 'container' && config.layout === 'horizontal' && config.wrap === true,
    'container layout did not survive reload',
  )

  const invalidCommands = [
    {
      type: 'addComponent',
      componentId: 'unsupported-layout-kind',
      screenId: 'screen-list',
      parentId: 'comp-task-list',
      kind: 'layoutPreset',
      placement: { mode: 'flow' },
      config: { kind: 'layoutPreset', gap: 'md' },
    },
    {
      type: 'addComponent',
      componentId: 'incomplete-container',
      screenId: 'screen-list',
      parentId: 'comp-task-list',
      kind: 'container',
      placement: { mode: 'flow' },
      config: { kind: 'container', layout: 'vertical' },
    },
    {
      type: 'updateComponentSpec',
      componentId: 'comp-list-title',
      patch: { config: { layout: 'grid' } },
    },
  ]
  const { applyCommandWithoutRevision } = await import(
    moduleUrl(domainBundle, 'layout-shape-rejection')
  )
  for (const command of invalidCommands) {
    let rejected = false
    try {
      applyCommandWithoutRevision(reloaded.getState().document, command)
    } catch {
      rejected = true
    }
    assert(rejected, `invalid layout command was accepted: ${JSON.stringify(command)}`)
  }
})

await test('Text styles replace Heading across model, UI, persistence, and WebMCP', async () => {
  memoryStorage.clear()
  const store = await freshStore('styled-text')
  const baseline = store.getState().document
  const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'styled-text-domain'))
  const { createAddComponentCommand, PALETTE_ITEMS } = await import(
    moduleUrl(componentFactoryBundle, 'styled-text-factory')
  )
  const styles = ['heading1', 'heading2', 'heading3', 'body', 'caption']

  assert(
    PALETTE_ITEMS.filter(item => item.kind === 'text').length === 1 &&
      !PALETTE_ITEMS.some(item => item.kind === 'heading'),
    'palette does not expose exactly one Text item',
  )
  const textCommand = createAddComponentCommand(
    baseline,
    'screen-list',
    'comp-list-page',
    'text',
    'en',
  )
  assert(
    textCommand.config.kind === 'text' &&
      textCommand.config.text === 'Text' &&
      textCommand.config.style === 'body',
    'Text factory did not default to body style',
  )

  for (const style of styles) {
    const styled = applyCommandWithoutRevision(baseline, {
      type: 'updateComponentSpec',
      componentId: 'comp-list-summary',
      patch: { config: { style } },
    })
    assert(
      styled.components['comp-list-summary'].config.style === style,
      `Text style ${style} was not accepted by the domain`,
    )
  }

  const loadingState = store.getState().document.screenScenarios['scenario-list-loading']
  store.getState().dispatch({
    type: 'updateScreenState',
    stateId: loadingState.id,
    name: loadingState.name,
    description: loadingState.description,
    overrides: [
      ...loadingState.componentOverrides,
      {
        target: { type: 'inline', componentId: 'comp-list-summary' },
        override: { text: 'Loading tasks...' },
      },
    ],
  }, 'Set loading title')
  const textRoleReview = store.getState().beginChangeSet('Change text role')
  store.getState().dispatchToChangeSet(textRoleReview.id, {
    type: 'updateComponentSpec',
    componentId: 'comp-list-summary',
    patch: { config: { style: 'heading3' } },
  })
  assert(
    store.getState().activeChangeSet.operations.at(-1)?.source === 'agent' &&
      store.getState().effectiveDocument.components['comp-list-summary'].config.style === 'heading3',
    'agent Text style edit did not route through the active change set',
  )
  store.getState().acceptChangeSet()
  const reloaded = await freshStore('styled-text-reload')
  assert(
    reloaded.getState().document.components['comp-list-summary'].config.style === 'heading3' &&
      reloaded.getState().document.screenScenarios['scenario-list-loading']
        .componentOverrides.some(entry =>
          entry.target.type === 'inline' &&
          entry.target.componentId === 'comp-list-summary' &&
          entry.override.text === 'Loading tasks...'
        ),
    'Text style or text state override did not survive reload',
  )

  const legacyDocument = clone(baseline)
  legacyDocument.components['comp-list-summary'].kind = 'heading'
  legacyDocument.components['comp-list-summary'].config = {
    kind: 'heading',
    text: 'Legacy heading',
    level: 1,
  }
  memoryStorage.setItem(storageKey, JSON.stringify({ document: legacyDocument }))
  const legacyReload = await freshStore('legacy-heading-document')
  assert(legacyReload.getState().recoveryState !== null, 'legacy Heading document did not enter recovery')

  let directRejected = false
  try {
    applyCommandWithoutRevision(baseline, {
      type: 'addComponent',
      componentId: 'legacy-heading',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'heading',
      placement: { mode: 'flow' },
      config: { kind: 'heading', text: 'Legacy heading', level: 2 },
    })
  } catch {
    directRejected = true
  }
  assert(directRejected, 'direct command accepted legacy Heading')

  memoryStorage.clear()
  const module = await import(moduleUrl(toolsBundle, 'legacy-heading-webmcp'))
  const byName = name => module.WEBMCP_TOOLS.find(tool => tool.name === name)
  const begin = byName('begin_change_set').execute({ summary: 'Reject legacy Heading' })
  assert(begin.ok, 'legacy Heading change set did not begin')
  const common = {
    changeSetId: begin.data.changeSetId,
    expectedRevision: begin.data.baseRevision,
    expectedChangeSetVersion: 0,
  }
  const addTool = byName('change_component_structure')
  const schemaJson = JSON.stringify(addTool.inputSchema)
  assert(
    !schemaJson.includes('"const":"heading"') &&
      schemaJson.includes('"heading1"') &&
      schemaJson.includes('"caption"'),
    'WebMCP schema still exposes Heading or omits Text styles',
  )
  const webResult = addTool.execute({
    ...common,
    operation: 'add',
    screenId: 'screen-list',
    parentId: 'comp-list-page',
    kind: 'heading',
    config: { kind: 'heading', text: 'Legacy heading', level: 2 },
  })
  assert(!webResult.ok, 'WebMCP accepted legacy Heading')
  assert(
    byName('get_pending_change_set').execute({}).data.activeChangeSet.operationCount === 0,
    'rejected Heading changed pending operations',
  )

  const { createCanvasComponentPreview } = await import(
    moduleUrl(componentPreviewBundle, 'text-style-preview')
  )
  const canvasStyles = readFileSync(join(root, 'src/features/canvas/Canvas.module.css'), 'utf8')
  const inspectorSource = readFileSync(join(root, 'src/features/inspector/Inspector.tsx'), 'utf8')
  const textElements = Object.fromEntries(styles.map(style => [
    style,
    createCanvasComponentPreview({ kind: 'text', text: 'Preview', style }).element,
  ]))
  assert(
    styles.every(style => canvasStyles.includes(`.${style}`)) &&
      JSON.stringify(textElements) === JSON.stringify({
        heading1: 'h1',
        heading2: 'h2',
        heading3: 'h3',
        body: 'p',
        caption: 'small',
      }),
    'Canvas does not map all Text styles to visual and semantic output',
  )
  assert(
    styles.every(style => inspectorSource.includes(`value="${style}"`)) &&
      inspectorSource.includes("t('inspector.textStyle')"),
    'Inspector does not expose all Text display styles',
  )
})

await test('component name metadata is rejected across document, command, and WebMCP inputs', async () => {
  memoryStorage.clear()
  const store = await freshStore('component-name-removed')
  const baseline = store.getState().document
  assert(
    Object.values(baseline.components).every(component => !Object.hasOwn(component, 'name')),
    'sample components still contain name metadata',
  )
  assert(
    !/[ぁ-んァ-ヶ一-龠]/.test(JSON.stringify(baseline)),
    'English sample contains Japanese user content',
  )

  const legacyDocument = clone(baseline)
  legacyDocument.components['comp-list-summary'].name = 'Legacy component name'
  memoryStorage.setItem(storageKey, JSON.stringify({ document: legacyDocument }))
  const legacyReload = await freshStore('legacy-component-name')
  assert(legacyReload.getState().recoveryState !== null, 'legacy component name did not enter recovery')

  const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'legacy-name-command'))
  let directRejected = false
  try {
    applyCommandWithoutRevision(baseline, {
      type: 'addComponent',
      componentId: 'legacy-component',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'text',
      name: 'Legacy component name',
      config: { kind: 'text', text: 'Legacy', style: 'body' },
    })
  } catch {
    directRejected = true
  }
  assert(directRejected, 'direct addComponent accepted legacy name metadata')

  memoryStorage.clear()
  const module = await import(moduleUrl(toolsBundle, 'legacy-name-webmcp'))
  const byName = name => module.WEBMCP_TOOLS.find(tool => tool.name === name)
  const begin = byName('begin_change_set').execute({ summary: 'Reject legacy component names' })
  assert(begin.ok, 'legacy-name change set did not begin')
  const common = {
    changeSetId: begin.data.changeSetId,
    expectedRevision: begin.data.baseRevision,
    expectedChangeSetVersion: 0,
  }
  const addTool = byName('change_component_structure')
  const updateTool = byName('update_component_spec')
  assert(
    addTool.inputSchema.properties.name === undefined &&
      updateTool.inputSchema.properties.patch.properties.name === undefined,
    'WebMCP schema still exposes component name',
  )
  const addResult = addTool.execute({
    ...common,
    operation: 'add',
    screenId: 'screen-list',
    parentId: 'comp-list-page',
    kind: 'text',
    name: 'Legacy component name',
    config: { kind: 'text', text: 'Legacy', style: 'body' },
  })
  assert(!addResult.ok, 'WebMCP add accepted legacy component name')
  const updateResult = updateTool.execute({
    ...common,
    componentId: 'comp-list-summary',
    patch: {
      name: 'Legacy component name',
      config: { text: 'Changed' },
    },
  })
  assert(!updateResult.ok, 'WebMCP update accepted legacy component name')
  assert(
    byName('get_pending_change_set').execute({}).data.activeChangeSet.operationCount === 0,
    'legacy component name changed the pending operations',
  )
  const componentResult = byName('get_component').execute({ componentId: 'comp-list-summary' })
  assert(componentResult.ok && !Object.hasOwn(componentResult.data.component, 'name'), 'read tool returned component name')
})

await test('structural components reject content titles across every write path', async () => {
  memoryStorage.clear()
  const store = await freshStore('structural-title-baseline')
  const baseline = store.getState().document
  const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'structural-title-domain'))
  const layout = {
    layout: 'vertical',
    gap: 'md',
    columns: 2,
    justify: 'start',
    align: 'stretch',
    wrap: false,
  }

  for (const command of [
    {
      type: 'addComponent',
      componentId: 'legacy-modal-title',
      screenId: 'screen-list',
      parentId: null,
      kind: 'modal',
      placement: { mode: 'flow' },
      config: { kind: 'modal', title: 'Legacy modal title', ...layout },
    },
    {
      type: 'updateComponentSpec',
      componentId: 'comp-task-list',
      patch: { config: { title: 'Legacy section title' } },
    },
  ]) {
    let rejected = false
    try {
      applyCommandWithoutRevision(baseline, command)
    } catch {
      rejected = true
    }
    assert(rejected, `direct command accepted a structural title: ${JSON.stringify(command)}`)
  }

  memoryStorage.clear()
  const module = await import(moduleUrl(toolsBundle, 'structural-title-webmcp'))
  const byName = name => module.WEBMCP_TOOLS.find(tool => tool.name === name)
  const begin = byName('begin_change_set').execute({ summary: 'Reject structural titles' })
  assert(begin.ok, 'structural-title change set did not begin')
  const common = {
    changeSetId: begin.data.changeSetId,
    expectedRevision: begin.data.baseRevision,
    expectedChangeSetVersion: 0,
  }
  const addTool = byName('change_component_structure')
  const updateTool = byName('update_component_spec')
  assert(
    !JSON.stringify(addTool.inputSchema).includes('"title"') &&
      !JSON.stringify(updateTool.inputSchema).includes('"title"'),
    'WebMCP component schemas still expose structural titles',
  )
  const addResult = addTool.execute({
    ...common,
    operation: 'add',
    screenId: 'screen-list',
    parentId: null,
    kind: 'modal',
    config: { kind: 'modal', title: 'Legacy modal title', ...layout },
  })
  assert(!addResult.ok, 'WebMCP add accepted a structural title')
  const updateResult = updateTool.execute({
    ...common,
    componentId: 'comp-task-list',
    patch: { config: { title: 'Legacy section title' } },
  })
  assert(!updateResult.ok, 'WebMCP update accepted a structural title')
  assert(
    byName('get_pending_change_set').execute({}).data.activeChangeSet.operationCount === 0,
    'rejected structural titles changed pending operations',
  )

  const canvasSource = readFileSync(join(root, 'src/features/canvas/Canvas.tsx'), 'utf8')
  const canvasStyles = readFileSync(join(root, 'src/features/canvas/Canvas.module.css'), 'utf8')
  const treeSource = readFileSync(join(root, 'src/features/structure-tree/StructureTree.tsx'), 'utf8')
  const labelSource = readFileSync(join(root, 'src/domain/componentDisplayLabel.ts'), 'utf8')
  assert(
    !canvasSource.includes('cfg.title') &&
      !canvasStyles.includes('.pageTitle') &&
      !canvasStyles.includes('.sectionTitle') &&
      !canvasStyles.includes('.modalTitle'),
    'Canvas still renders structural titles in content flow',
  )
  assert(
    canvasSource.includes("frameKind === 'page'") &&
      canvasSource.includes("t('canvas.modalFrameLabel'") &&
      treeSource.includes('getComponentHierarchyLabel') &&
      labelSource.includes("translate(locale, 'canvas.modalFrameLabel'"),
    'Page and modal editor frames do not use contextual editor-only labels',
  )
  assert(
    baseline.components['comp-list-summary'].config.text.startsWith('Review the launch queue') &&
      baseline.components['comp-edit-summary'].config.text.startsWith('Update assignees'),
    'sample visible structure was not represented by styled Text children',
  )
})

await test('typed localization resolves and persists JA and EN safely', async () => {
  const {
    changeSetOperationCountMessage,
    translate,
  } = await import(moduleUrl(messagesBundle, 'typed-translations'))
  const { LOCALE_STORAGE_KEY, persistLocale, resolveInitialLocale } = await import(
    moduleUrl(localeBundle, 'locale-storage')
  )
  assert(translate('en', 'tabs.screens') === 'Screens', 'English catalog did not resolve')
  assert(translate('ja', 'tabs.screens') === '画面', 'Japanese catalog did not resolve')
  const formatChangeCount = (locale, count) => {
    const message = changeSetOperationCountMessage(count)
    return translate(locale, message.key, message.params)
  }
  assert(
    translate('en', 'changes.reviewing') === 'Reviewing change set:' &&
      translate('en', 'changeMarker.review') === 'View change set →' &&
      translate('en', 'review.operationsLabel') === 'Change set operations' &&
      translate('en', 'changes.accept') === 'Accept' &&
      translate('en', 'changes.reject') === 'Reject' &&
      formatChangeCount('en', 0) === '0 changes' &&
      formatChangeCount('en', 1) === '1 change' &&
      formatChangeCount('en', 2) === '2 changes',
    'English change set terminology or operation count is inconsistent',
  )
  assert(
    translate('ja', 'tabs.changes') === '変更セット' &&
      translate('ja', 'changes.reviewing') === '変更セットを確認中:' &&
      translate('ja', 'changeMarker.review') === '変更セットを見る →' &&
      translate('ja', 'review.operationsLabel') === '変更セットの操作' &&
      translate('ja', 'changes.accept') === '反映' &&
      translate('ja', 'changes.reject') === '破棄' &&
      formatChangeCount('ja', 0) === '0件の変更' &&
      formatChangeCount('ja', 1) === '1件の変更',
    'Japanese change set terminology or operation count is inconsistent',
  )
  assert(
    resolveInitialLocale(undefined, 'ja-JP') === 'ja' &&
      resolveInitialLocale(undefined, 'en-US') === 'en',
    'navigator locale fallback is incorrect',
  )

  const values = new Map()
  const storage = {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, value) },
  }
  assert(persistLocale(storage, 'ja'), 'locale persistence reported failure')
  assert(values.get(LOCALE_STORAGE_KEY) === 'ja', 'locale preference was not persisted')
  assert(resolveInitialLocale(storage, 'en-US') === 'ja', 'stored locale did not win')
  assert(
    !persistLocale({ setItem() { throw new DOMException('Denied', 'SecurityError') } }, 'en'),
    'locale storage failure was not contained',
  )
  assert(
    resolveInitialLocale({
      getItem() { throw new DOMException('Denied', 'SecurityError') },
      setItem() {},
    }, 'en-US') === 'en',
    'locale read failure blocked navigator fallback',
  )
})

await test('editor pane resizing shares coherent bounds and persists safely', async () => {
  const {
    DEFAULT_LEFT_PANE_WIDTH,
    DEFAULT_RIGHT_PANE_WIDTH,
    LEFT_PANE_WIDTH_STORAGE_KEY,
    MAX_LEFT_PANE_WIDTH,
    MIN_EDITOR_WIDTH,
    MIN_LEFT_PANE_WIDTH,
    MIN_RIGHT_PANE_WIDTH,
    PANE_RESIZE_HANDLE_WIDTH,
    RIGHT_PANE_WIDTH_STORAGE_KEY,
    clampLeftPaneWidth,
    clampRightPaneWidth,
    getLeftPaneWidthBounds,
    getRightPaneWidthBounds,
    paneWidthForKey,
    persistPaneWidth,
    resolveInitialLeftPaneWidth,
    resolveInitialRightPaneWidth,
    resolvePaneWidths,
  } = await import(moduleUrl(paneWidthsBundle, 'pane-preferences'))
  const values = new Map()
  const storage = {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, value) },
  }

  assert(
    resolveInitialLeftPaneWidth(storage) === DEFAULT_LEFT_PANE_WIDTH &&
      resolveInitialRightPaneWidth(storage) === DEFAULT_RIGHT_PANE_WIDTH,
    'editor panes did not use their established defaults',
  )
  values.set(LEFT_PANE_WIDTH_STORAGE_KEY, '9999')
  assert(
    resolveInitialLeftPaneWidth(storage) === MAX_LEFT_PANE_WIDTH,
    'oversized stored left width was not clamped',
  )
  values.set(LEFT_PANE_WIDTH_STORAGE_KEY, '100')
  assert(
    resolveInitialLeftPaneWidth(storage) === MIN_LEFT_PANE_WIDTH,
    'undersized stored left width was not clamped',
  )
  values.set(LEFT_PANE_WIDTH_STORAGE_KEY, 'NaN')
  assert(
    resolveInitialLeftPaneWidth(storage) === DEFAULT_LEFT_PANE_WIDTH,
    'invalid stored left width did not fall back safely',
  )
  assert(
    resolveInitialLeftPaneWidth({
      getItem() { throw new DOMException('Denied', 'SecurityError') },
    }) === DEFAULT_LEFT_PANE_WIDTH,
    'left pane storage read failure escaped',
  )
  values.set(RIGHT_PANE_WIDTH_STORAGE_KEY, '9999')
  const oversizedRight = resolvePaneWidths(
    DEFAULT_LEFT_PANE_WIDTH,
    resolveInitialRightPaneWidth(storage),
    1000,
  )
  assert(
    oversizedRight.right === getRightPaneWidthBounds(1000, oversizedRight.left).max,
    'oversized stored right width was not clamped by the live layout',
  )
  assert(
    !persistPaneWidth({
      setItem() { throw new DOMException('Denied', 'SecurityError') },
    }, LEFT_PANE_WIDTH_STORAGE_KEY, 400),
    'pane storage write failure escaped',
  )
  assert(
    persistPaneWidth(storage, LEFT_PANE_WIDTH_STORAGE_KEY, 340) &&
      persistPaneWidth(storage, RIGHT_PANE_WIDTH_STORAGE_KEY, 400) &&
      values.get(LEFT_PANE_WIDTH_STORAGE_KEY) === '340' &&
      values.get(RIGHT_PANE_WIDTH_STORAGE_KEY) === '400',
    'pane widths were not persisted under their independent keys',
  )

  const leftBounds = getLeftPaneWidthBounds(1440, 380)
  const rightBounds = getRightPaneWidthBounds(1440, 220)
  assert(
    paneWidthForKey('left', 'ArrowLeft', 220, leftBounds) === 212 &&
      paneWidthForKey('left', 'ArrowRight', 220, leftBounds) === 228 &&
      paneWidthForKey('left', 'ArrowRight', 220, leftBounds, true) === 252 &&
      paneWidthForKey('right', 'ArrowLeft', 380, rightBounds) === 388 &&
      paneWidthForKey('right', 'ArrowRight', 380, rightBounds) === 372,
    'left or right keyboard resize direction and step is incorrect',
  )
  assert(
    paneWidthForKey('left', 'Home', 380, leftBounds) === MIN_LEFT_PANE_WIDTH &&
      paneWidthForKey('left', 'End', 220, leftBounds) === leftBounds.max &&
      paneWidthForKey('right', 'Home', 380, rightBounds) === MIN_RIGHT_PANE_WIDTH &&
      paneWidthForKey('right', 'End', 380, rightBounds) === rightBounds.max &&
      paneWidthForKey('left', 'Escape', 220, leftBounds) === null,
    'keyboard resize limits or unrelated-key handling is incorrect',
  )

  const constrained = resolvePaneWidths(480, 700, 1280)
  assert(
    constrained.left >= MIN_LEFT_PANE_WIDTH &&
      constrained.left <= MAX_LEFT_PANE_WIDTH &&
      constrained.right >= MIN_RIGHT_PANE_WIDTH &&
      constrained.left +
        constrained.right +
        MIN_EDITOR_WIDTH +
        PANE_RESIZE_HANDLE_WIDTH * 2 <= 1280 &&
      clampLeftPaneWidth(9999, 1280, constrained.right) ===
        getLeftPaneWidthBounds(1280, constrained.right).max &&
      clampRightPaneWidth(9999, 1280, constrained.left) ===
        getRightPaneWidthBounds(1280, constrained.left).max,
    'coupled pane bounds did not preserve the minimum editor width',
  )
  assert(
    resolvePaneWidths(420, 520, 899).left === 420 &&
      resolvePaneWidths(420, 520, 899).right === 520,
    'stacked layout discarded preferred pane widths before desktop restoration',
  )

  const appSource = readFileSync(join(root, 'src/app/App.tsx'), 'utf8')
  const appStyles = readFileSync(join(root, 'src/app/App.module.css'), 'utf8')
  assert(
    appSource.includes("paneResizeHandle('left')") &&
      appSource.includes("paneResizeHandle('right')") &&
      appSource.includes('data-left-pane-resizer=') &&
      appSource.includes('data-right-pane-resizer=') &&
      appSource.includes('aria-orientation="vertical"') &&
      appSource.includes('setPointerCapture') &&
      appSource.includes('onPointerCancel={finishPaneResize}') &&
      appSource.includes('onLostPointerCapture='),
    'shared split-pane separators lack pointer capture cleanup or accessibility metadata',
  )
  assert(
    appStyles.includes('cursor: col-resize') &&
      appStyles.includes('-webkit-user-select: none') &&
      appStyles.includes('user-select: none') &&
      appStyles.includes('@media (max-width: 899px)') &&
      appStyles.includes('display: none'),
    'split-pane feedback or stacked responsive behavior is missing',
  )

  memoryStorage.clear()
  installStorage(memoryStorage)
  const document = installInteractiveDom()
  Object.defineProperty(globalThis, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 1280,
  })
  const { mountReviewLockApp } = await import(
    moduleUrl(renderAppBundle, 'pane-resize-dom')
  )
  const harness = mountReviewLockApp('en')
  const leftHandle = document.querySelector('[data-left-pane-resizer]')
  const rightHandle = document.querySelector('[data-right-pane-resizer]')
  const leftPane = document.querySelector('aside[aria-label="Project navigation"]')
  const rightPane = document.querySelector('aside[aria-label="Details"]')
  assert(
    leftHandle &&
      rightHandle &&
      leftPane.style.width === '220px' &&
      rightPane.style.width === '380px' &&
      leftHandle.getAttribute('role') === 'separator' &&
      leftHandle.getAttribute('aria-orientation') === 'vertical' &&
      Number(leftHandle.getAttribute('aria-valuemin')) === MIN_LEFT_PANE_WIDTH &&
      Number(leftHandle.getAttribute('aria-valuemax')) > DEFAULT_LEFT_PANE_WIDTH,
    'mounted editor did not expose both bounded pane separators',
  )
  harness.pointer(leftHandle, 'pointerdown', {
    pointerId: 71,
    clientX: 220,
  })
  const activeLeftHandle = document.querySelector('[data-left-pane-resizer]')
  assert(
    activeLeftHandle.getAttribute('data-resizing') === 'true',
    'left pane pointer start did not expose active resize feedback',
  )
  harness.pointer(
    document.querySelector('[data-left-pane-resizer]'),
    'pointercancel',
    {
      pointerId: 71,
      clientX: 220,
    },
  )
  const settledLeftHandle = document.querySelector('[data-left-pane-resizer]')
  assert(
    memoryStorage.getItem(LEFT_PANE_WIDTH_STORAGE_KEY) === '220' &&
      !settledLeftHandle.hasAttribute('data-resizing'),
    'left pane pointer cancellation did not persist or clean up',
  )
  harness.keyDown(settledLeftHandle, 'ArrowRight')
  assert(
    leftPane.style.width === '228px' &&
      memoryStorage.getItem(LEFT_PANE_WIDTH_STORAGE_KEY) === '228',
    'left pane keyboard resize did not widen and persist',
  )
  harness.keyDown(document.querySelector('[data-left-pane-resizer]'), 'ArrowLeft', {
    shiftKey: true,
  })
  assert(leftPane.style.width === '196px', 'left pane large keyboard step is incorrect')
  harness.keyDown(document.querySelector('[data-left-pane-resizer]'), 'Home')
  assert(leftPane.style.width === '180px', 'left pane Home did not use its minimum')
  const endLeftHandle = document.querySelector('[data-left-pane-resizer]')
  const mountedMax = Number(endLeftHandle.getAttribute('aria-valuemax'))
  harness.keyDown(endLeftHandle, 'End')
  assert(
    leftPane.style.width === `${mountedMax}px` &&
      Number(rightHandle.getAttribute('aria-valuemax')) <=
        getRightPaneWidthBounds(1280, mountedMax).max,
    'left pane End or coupled right bounds are stale',
  )
  harness.pointer(rightHandle, 'pointerdown', {
    pointerId: 72,
    clientX: 900,
  })
  harness.pointer(rightHandle, 'pointercancel', {
    pointerId: 72,
    clientX: 850,
  })
  assert(
    memoryStorage.getItem(RIGHT_PANE_WIDTH_STORAGE_KEY) ===
      rightPane.style.width.replace('px', ''),
    'right pane pointer cancellation did not use shared cleanup',
  )
  harness.unmount()
})

await test('Changes review UI is contextual to active change sets', async () => {
  memoryStorage.clear()
  const store = await freshStore('contextual-changes-inactive')
  assert(
    store.getState().activeChangeSet === null &&
      store.getState().ui.rightPanelTab === 'inspector',
    'inactive startup did not select Inspector',
  )
  store.getState().setRightPanelTab('changes')
  assert(
    store.getState().ui.rightPanelTab === 'inspector',
    'inactive store allowed the hidden Changes panel to open',
  )

  store.getState().beginChangeSet('Contextual review')
  assert(
    store.getState().activeChangeSet !== null &&
      store.getState().ui.rightPanelTab === 'inspector',
    'begin change set did not reveal Changes while preserving the active Inspector context',
  )
  store.getState().setRightPanelTab('inspector')
  assert(store.getState().ui.rightPanelTab === 'inspector', 'Inspector did not open during review')
  store.getState().setRightPanelTab('changes')
  assert(store.getState().ui.rightPanelTab === 'changes', 'Changes did not reopen during review')

  const restored = await freshStore('contextual-changes-restored')
  assert(
    restored.getState().activeChangeSet !== null &&
      restored.getState().ui.rightPanelTab === 'changes',
    'restored active change set did not reveal and select Changes',
  )
  restored.getState().acceptChangeSet()
  assert(
    restored.getState().activeChangeSet === null &&
      restored.getState().ui.rightPanelTab === 'inspector',
    'accept did not hide Changes and restore Inspector',
  )

  restored.getState().beginChangeSet('Contextual rejection')
  restored.getState().rejectChangeSet()
  assert(
    restored.getState().activeChangeSet === null &&
      restored.getState().ui.rightPanelTab === 'inspector',
    'reject did not hide Changes and restore Inspector',
  )
  const inactiveReload = await freshStore('contextual-changes-inactive-reload')
  assert(
    inactiveReload.getState().activeChangeSet === null &&
      inactiveReload.getState().ui.rightPanelTab === 'inspector',
    'inactive reload did not remain on Inspector',
  )

  const appSource = readFileSync(join(root, 'src/app/App.tsx'), 'utf8')
  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  const messageSource = readFileSync(join(root, 'src/i18n/messages.ts'), 'utf8')
  assert(
    appSource.includes('{activeChangeSet ? (') &&
      appSource.includes('className={styles.rightHeading}') &&
      appSource.includes("`${t('tabs.changes')} (${activeChangeSet.operations.length})`"),
    'right pane does not conditionally render review tabs',
  )
  assert(
    !inspectorSource.includes("t('changes.none')") &&
      !messageSource.includes("'changes.none'"),
    'obsolete empty Changes state remains in source',
  )
})

await test('Select state values share one validated effective path', async () => {
  {
    memoryStorage.clear()
    const selectStore = await freshStore('select-scenario-effective-v3')
    const { effectiveComponent: resolveSelect } = await import(
      moduleUrl(selectorsBundle, 'select-scenario-effective-v3')
    )
    const baseSelect = selectStore.getState().document.components['comp-task-status-select']
    const baseScenario =
      selectStore.getState().document.screenScenarios['scenario-edit-success']
    const successScenario = {
      ...baseScenario,
      componentOverrides: [
        ...baseScenario.componentOverrides,
        {
          target: { type: 'inline', componentId: 'comp-task-status-select' },
          override: { value: 'done' },
        },
      ],
    }
    const effectiveSelect = resolveSelect(
      selectStore.getState().document,
      baseSelect,
      successScenario,
    )
    assert(
      baseSelect.config.kind === 'select' &&
        baseSelect.config.defaultValue === 'in-progress' &&
        effectiveSelect.config.defaultValue === 'done' &&
        baseSelect.config.defaultValue === 'in-progress',
      'Select scenario override did not produce an immutable effective value',
    )
    const initialRevision = selectStore.getState().revision
    for (const command of [
      {
        type: 'updateScreenState',
        stateId: baseScenario.id,
        overrides: [{
          target: { type: 'inline', componentId: 'comp-task-status-select' },
          override: { value: 'unknown' },
        }],
      },
      {
        type: 'updateComponentSpec',
        componentId: 'comp-task-status-select',
        patch: { config: { defaultValue: 'unknown' } },
      },
    ]) {
      selectStore.getState().dispatch(command, 'Reject invalid Select value')
      assert(
        selectStore.getState().revision === initialRevision,
        `invalid Select command changed revision: ${command.type}`,
      )
    }
    selectStore.getState().dispatch({
      type: 'updateScreenState',
      stateId: 'scenario-edit-saving',
      overrides: [
        {
          target: { type: 'inline', componentId: 'comp-save-btn' },
          override: { enabled: false },
        },
        {
          target: { type: 'inline', componentId: 'comp-task-status-select' },
          override: { value: 'done' },
        },
      ],
    }, 'Set Select scenario value')
    const effectiveSavingSelect = resolveSelect(
      selectStore.getState().document,
      selectStore.getState().document.components['comp-task-status-select'],
      selectStore.getState().document.screenScenarios['scenario-edit-saving'],
    )
    assert(
      effectiveSavingSelect.config.defaultValue === 'done',
      'valid Select scenario override was not applied',
    )
    return
  }
  memoryStorage.clear()
  const store = await freshStore('select-state-effective')
  const { effectiveComponent } = await import(moduleUrl(selectorsBundle, 'select-state-effective'))
  const baseSelect = store.getState().document.components['comp-task-assignee-select']
  const baseSuccessState = store.getState().document.screenStates['state-edit-success']
  const successState = {
    ...baseSuccessState,
    componentOverrides: {
      ...baseSuccessState.componentOverrides,
      'comp-task-assignee-select': { value: 'leo-martins' },
    },
  }

  assert(
    baseSelect.config.kind === 'select' &&
      baseSelect.config.defaultValue === 'maya-chen' &&
      baseSelect.config.options.some(option => option.value === 'leo-martins'),
    'sample Select does not define options and a valid default value',
  )
  const effectiveSuccessSelect = effectiveComponent(baseSelect, successState)
  assert(
    effectiveSuccessSelect.config.kind === 'select' &&
      effectiveSuccessSelect.config.defaultValue === 'leo-martins' &&
      baseSelect.config.defaultValue === 'maya-chen',
    'Select override did not produce an immutable effective selected value',
  )

  const invalidCommands = [
    {
      type: 'updateScreenState',
      stateId: 'state-edit-success',
      overrides: {
        ...successState.componentOverrides,
        'comp-task-assignee-select': { value: 'owner' },
      },
    },
    {
      type: 'updateComponentSpec',
      componentId: 'comp-task-assignee-select',
      patch: {
        config: {
          options: [{ value: 'leo-martins', label: 'Leo Martins' }],
        },
      },
    },
    {
      type: 'updateComponentSpec',
      componentId: 'comp-task-assignee-select',
      patch: { config: { defaultValue: 'owner' } },
    },
  ]
  const initialRevision = store.getState().document.revision
  for (const command of invalidCommands) {
    store.getState().dispatch(command, 'Reject invalid Select value')
    assert(
      store.getState().document.revision === initialRevision,
      `invalid Select command changed revision: ${command.type}`,
    )
  }

  const savingState = store.getState().document.screenStates['state-edit-saving']
  store.getState().dispatch({
    type: 'updateScreenState',
    stateId: savingState.id,
    overrides: {
      ...savingState.componentOverrides,
      'comp-task-assignee-select': { value: 'leo-martins' },
    },
  }, 'Set Select state value')
  store.getState().setActiveState(savingState.id)
  const effectiveSavingSelect = effectiveComponent(
    store.getState().document.components['comp-task-assignee-select'],
    store.getState().document.screenStates[savingState.id],
  )
  assert(
    effectiveSavingSelect.config.kind === 'select' &&
    effectiveSavingSelect.config.defaultValue === 'leo-martins',
    'valid Select state override was not applied',
  )

  const reloaded = await freshStore('select-state-effective-reload')
  const reloadedSelect = effectiveComponent(
    reloaded.getState().document.components['comp-task-assignee-select'],
    reloaded.getState().document.screenStates[savingState.id],
  )
  assert(
    reloadedSelect.config.kind === 'select' &&
      reloadedSelect.config.defaultValue === 'leo-martins',
    'Select state override did not survive reload',
  )

  const selectReview = reloaded.getState().beginChangeSet('AI Select override')
  const confirmedSavingValue =
    reloaded.getState().document.screenStates[savingState.id]
      .componentOverrides['comp-task-assignee-select'].value
  reloaded.getState().dispatchToChangeSet(selectReview.id, {
    type: 'updateScreenState',
    stateId: savingState.id,
    overrides: {
      ...reloaded.getState().effectiveDocument.screenStates[savingState.id].componentOverrides,
      'comp-task-assignee-select': { value: 'unassigned' },
    },
  })
  assert(
    reloaded.getState().activeChangeSet?.operations.at(-1)?.source === 'agent' &&
      reloaded.getState().document.screenStates[savingState.id]
        .componentOverrides['comp-task-assignee-select'].value === confirmedSavingValue &&
      reloaded.getState().effectiveDocument.screenStates[savingState.id]
        .componentOverrides['comp-task-assignee-select'].value === 'unassigned',
    'agent Select override did not remain inside the active change set',
  )

  memoryStorage.clear()
  const persistedStore = await freshStore('select-invalid-persistence-seed')
  const invalidDocument = clone(persistedStore.getState().document)
  invalidDocument.screenStates['state-edit-success']
    .componentOverrides['comp-task-assignee-select'] = { value: 'owner' }
  memoryStorage.setItem(storageKey, JSON.stringify({ document: invalidDocument }))
  const invalidPersisted = await freshStore('select-invalid-persistence')
  assert(
    invalidPersisted.getState().recoveryState !== null,
    'persisted out-of-options Select override bypassed document validation',
  )

  memoryStorage.clear()
  const module = await import(moduleUrl(toolsBundle, 'select-state-webmcp'))
  const byName = name => module.WEBMCP_TOOLS.find(tool => tool.name === name)
  const begin = byName('begin_change_set').execute({ summary: 'Select state values' })
  assert(begin.ok, 'Select WebMCP change set did not begin')
  const common = {
    changeSetId: begin.data.changeSetId,
    expectedRevision: begin.data.baseRevision,
  }
  const validResult = byName('upsert_screen_state').execute({
    ...common,
    expectedChangeSetVersion: 0,
    operation: 'update',
    stateId: 'state-edit-saving',
    overrides: {
      'comp-save-btn': { enabled: false },
      'comp-cancel-btn': { enabled: false },
      'comp-task-assignee-select': { value: 'leo-martins' },
    },
  })
  assert(validResult.ok, `valid Select WebMCP override failed: ${JSON.stringify(validResult)}`)
  const pending = () => byName('get_pending_change_set').execute({}).data.activeChangeSet
  const operationCount = pending().operationCount

  const invalidWebMcpInputs = [
    ['upsert_screen_state', {
      ...common,
      expectedChangeSetVersion: 1,
      operation: 'update',
      stateId: 'state-edit-saving',
      overrides: {
        'comp-task-assignee-select': { value: 'owner' },
      },
    }],
    ['update_component_spec', {
      ...common,
      expectedChangeSetVersion: 1,
      componentId: 'comp-task-assignee-select',
      patch: {
        config: {
          options: [{ value: 'maya-chen', label: 'Maya Chen' }],
        },
      },
    }],
    ['update_component_spec', {
      ...common,
      expectedChangeSetVersion: 1,
      componentId: 'comp-task-assignee-select',
      patch: { config: { defaultValue: 'owner' } },
    }],
  ]
  for (const [toolName, input] of invalidWebMcpInputs) {
    const result = byName(toolName).execute(input)
    assert(!result.ok, `${toolName} accepted an invalid Select value`)
    assert(
      pending().operationCount === operationCount,
      `${toolName} added an invalid Select operation`,
    )
  }
  assert(
    JSON.stringify(byName('change_component_structure').inputSchema).includes('"defaultValue"') &&
      JSON.stringify(byName('update_component_spec').inputSchema).includes('"defaultValue"'),
    'WebMCP Select schemas do not expose the required default value',
  )

  const { createCanvasComponentPreview } = await import(
    moduleUrl(componentPreviewBundle, 'select-state-preview')
  )
  const treeSource = readFileSync(
    join(root, 'src/features/structure-tree/StructureTree.tsx'),
    'utf8',
  )
  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  const toolsSource = readFileSync(join(root, 'src/webmcp/tools.ts'), 'utf8')
  const effectiveSelectPreview = createCanvasComponentPreview(effectiveSuccessSelect.config)
  assert(
    effectiveSelectPreview.kind === 'select' &&
      effectiveSelectPreview.value === 'leo-martins' &&
      baseSelect.config.defaultValue === 'maya-chen',
    'Canvas still bypasses the effective Select config',
  )
  assert(
    treeSource.includes('resolveEffectiveComponentState(baseComponent, activeState)') &&
      toolsSource.includes('effectiveComponent(baseComponent, activeState)'),
    'Tree or get_component does not use the domain effective-component selector',
  )
  assert(
    inspectorSource.includes('content.options ? (') &&
      inspectorSource.includes('content.options.map(option =>') &&
      inspectorSource.includes("override[content.key] === undefined && content.baseValue === ''") &&
      inspectorSource.includes('disabled={content.options?.length === 0}'),
    'Inspector Select overrides are not constrained to configured options',
  )
})

await test('text drafts commit as one human operation', async () => {
  memoryStorage.clear()
  const { shouldCommitTextKey } = await import(moduleUrl(textDraftBundle, 'text-draft-keys'))
  assert(shouldCommitTextKey('Enter', false, false), 'single-line Enter did not commit')
  assert(!shouldCommitTextKey('Enter', true, false), 'multiline Enter did not remain a newline')
  assert(!shouldCommitTextKey('Enter', false, true), 'IME composition Enter committed early')
  assert(!shouldCommitTextKey('Escape', false, false), 'Escape was treated as a commit')

  const store = await freshStore('text-draft-history')
  const originalText = store.getState().document.components['comp-list-summary'].config.text
  const moveResult = store.getState().dispatch({
    type: 'moveComponent',
    componentId: 'comp-task-list',
    newParentId: 'comp-list-page',
    position: 1,
  }, 'Move summary before text editing')
  assert(moveResult && store.getState().history.length === 1, 'structural history seed failed')

  let fiftyCharacterDraft = ''
  for (let index = 0; index < 50; index += 1) fiftyCharacterDraft += String(index % 10)
  assert(
    store.getState().history.length === 1,
    'local typing changed history before the draft was committed',
  )
  const textResult = store.getState().dispatch({
    type: 'updateComponentSpec',
    componentId: 'comp-list-summary',
    patch: { config: { text: fiftyCharacterDraft } },
  }, 'Update text text: comp-list-summary')
  assert(textResult, 'committed text draft failed')
  assert(
    store.getState().history.length === 2 &&
      store.getState().history[0].label === 'Move summary before text editing' &&
      store.getState().history[1].label.includes('comp-list-summary'),
    '50-character draft did not create exactly one targeted history entry',
  )

  store.getState().undo()
  const afterUndo = store.getState()
  const restoredText = afterUndo.document.components['comp-list-summary'].config
  assert(
    restoredText.kind === 'text' &&
      restoredText.text === originalText &&
      afterUndo.document.components['comp-list-page'].childIds[1] === 'comp-task-list' &&
      afterUndo.history.length === 1,
    'one Undo did not restore the whole text edit while retaining structural history',
  )

  const nameResult = store.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Persisted screen name',
  }, 'Update screen name: Task List')
  assert(nameResult, 'screen name draft commit failed')
  const reloaded = await freshStore('text-draft-reload')
  assert(
    reloaded.getState().document.screens['screen-list'].name === 'Persisted screen name',
    'committed text draft did not survive reload',
  )

  const historyBeforeInvalidRoute = reloaded.getState().history.length
  const duplicateRoute = reloaded.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-edit',
    route: '/tasks',
  }, 'Update screen route: Edit Task')
  assert(
    !duplicateRoute &&
      reloaded.getState().document.screens['screen-edit'].route === '/tasks/:taskId' &&
      reloaded.getState().history.length === historyBeforeInvalidRoute &&
      reloaded.getState().toast?.severity === 'error',
    'duplicate route was reported as a successful text commit',
  )

  const textReview = reloaded.getState().beginChangeSet('Atomic AI text edit')
  let changeSetDraft = ''
  for (let index = 0; index < 50; index += 1) changeSetDraft += String.fromCharCode(65 + (index % 26))
  const changeSetResult = reloaded.getState().dispatch({
    type: 'updateComponentSpec',
    componentId: 'comp-list-summary',
    patch: { config: { text: changeSetDraft } },
  }, 'Update text text: comp-list-summary')
  const changeSet = reloaded.getState().activeChangeSet
  assert(
    !changeSetResult &&
      changeSet?.id === textReview.id &&
      changeSet.operations.length === 0 &&
      reloaded.getState().document.components['comp-list-summary'].config.text !== changeSetDraft &&
      reloaded.getState().effectiveDocument.components['comp-list-summary'].config.text !== changeSetDraft,
    '50-character human draft changed the document during review lock',
  )
  const invalidChangeSetRoute = reloaded.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-edit',
    route: '/blocked/tasks',
  }, 'Update screen route: Edit Task')
  assert(
    !invalidChangeSetRoute && reloaded.getState().activeChangeSet?.operations.length === 0,
    'human route edit was added to the active change set',
  )

  const draftSource = readFileSync(
    join(root, 'src/components/DraftTextField.tsx'),
    'utf8',
  )
  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  const screenSource = readFileSync(
    join(root, 'src/features/screens/ScreenList.tsx'),
    'utf8',
  )
  const stateDialogSource = readFileSync(
    join(root, 'src/features/canvas/StateDialog.tsx'),
    'utf8',
  )
  assert(
    draftSource.includes('onChange: updateDraft') &&
      draftSource.includes('onBlur: handleBlur') &&
      draftSource.includes('commitDraft()') &&
      draftSource.includes("window.addEventListener('beforeunload', flush)") &&
      draftSource.includes("window.addEventListener('pagehide', flush)") &&
      draftSource.includes('window.sessionStorage.setItem(storageKey(draftId)') &&
      draftSource.includes('onCompositionStart: handleCompositionStart') &&
        draftSource.includes('draftCache.set(draftId') &&
        draftSource.includes('if (validationError || externalChanged) return false'),
    'draft field does not preserve and flush local edits safely',
  )
  assert(
    (inspectorSource.match(/<DraftTextField/g) ?? []).length >= 11 &&
      !inspectorSource.includes('onChange={e => updateConfig({ text:'),
    'Inspector text controls still dispatch per keystroke',
  )
  assert(
    screenSource.includes('errors.screenRouteDuplicate') &&
      screenSource.includes('<DraftTextField') &&
      !screenSource.includes("onChange={event => dispatch({\n                type: 'updateScreen'"),
    'Screen text controls still dispatch per keystroke or omit route feedback',
  )
  assert(
    stateDialogSource.includes('onChange={event => setName(event.target.value)}') &&
      stateDialogSource.includes('if (saved) onClose()'),
    'State dialog does not preserve its submitted local draft on failure',
  )
})

await test('AI writes expose only the change set review flow', async () => {
  memoryStorage.clear()
  const store = await freshStore('review-only-contract')
  assert(
    !Object.hasOwn(store.getState(), ['agent', 'Write', 'Policy'].join('')),
    'store still exposes the removed constant write policy',
  )
  store.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Confirmed human edit',
  })
  const aiReview = store.getState().beginChangeSet('Reviewed AI edit')
  store.getState().dispatchToChangeSet(aiReview.id, {
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'AI adjustment in review',
  })
  store.getState().acceptChangeSet()
  assert(
    store.getState().history.map(entry => entry.source).join(',') ===
      'human,accepted-change-set',
    'history generated a source outside direct human edits and accepted change sets',
  )

  memoryStorage.clear()
  const module = await import(moduleUrl(toolsBundle, 'review-only-context'))
  const context = module.WEBMCP_TOOLS
    .find(tool => tool.name === 'get_current_screen_context')
    .execute({})
  assert(context.ok, 'screen context failed')
  assert(
    Object.keys(context.data).sort().join(',') === [
      'activeChangeSet',
      'activeScreen',
      'activeStateId',
      'definitions',
      'documentView',
      'nextOffsets',
      'page',
      'project',
      'rejectedChangeSets',
      'revision',
      'screens',
      'selectedComponentId',
      'selection',
      'truncated',
    ].sort().join(','),
    'screen context retained a constant policy field or lost a current field: ' +
      Object.keys(context.data).sort().join(','),
  )

  const appStoreSource = readFileSync(join(root, 'src/app/appStore.ts'), 'utf8')
  const appStyles = readFileSync(join(root, 'src/app/App.module.css'), 'utf8')
  const toolsSource = readFileSync(join(root, 'src/webmcp/tools.ts'), 'utf8')
  const designSource = readFileSync(join(root, 'docs/MVP_TECHNICAL_DESIGN.md'), 'utf8')
  const readmeSource = readFileSync(join(root, 'README.md'), 'utf8')
  const readmeJaSource = readFileSync(join(root, 'README.ja.md'), 'utf8')
  const obsoleteMode = ['auto', '-apply'].join('')
  const obsoletePolicy = ['agent', 'Write', 'Policy'].join('')
  const obsoleteEntryDisplay = ['entry', '表示'].join('')
  const obsoleteEntrySelection = ['entry', '指定'].join('')
  assert(
    !appStoreSource.includes(obsoleteMode) &&
      !appStoreSource.includes(obsoletePolicy) &&
      !toolsSource.includes(obsoletePolicy) &&
      !appStyles.includes(['policy', 'Label'].join('')) &&
      !appStyles.includes(['policy', 'Select'].join('')),
    'runtime source still contains removed write-policy code',
  )
  assert(
    !designSource.toLowerCase().includes(obsoleteMode) &&
      !designSource.includes(obsoleteEntryDisplay) &&
      !designSource.includes(obsoleteEntrySelection) &&
    readmeSource.includes('AI proposals appear as change sets inside the application') &&
    readmeJaSource.includes('AIの提案はアプリ内のchange setとして表示') &&
    designSource.includes('新しいactive change setへ追加できるのは`source: "agent"`だけ'),
    'documentation still describes a deleted collaboration or entry concept',
  )
})

await test('Recovery actions use light-theme tokens with AA contrast', async () => {
  const appSource = readFileSync(join(root, 'src/app/App.tsx'), 'utf8')
  const appStyles = readFileSync(join(root, 'src/app/App.module.css'), 'utf8')
  const globalStyles = readFileSync(join(root, 'src/styles/global.css'), 'utf8')
  const recoveryMarkup = appSource.slice(
    appSource.indexOf('// ── Recovery screen'),
    appSource.indexOf('// ── Main UI'),
  )
  const token = name => {
    const match = globalStyles.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
    assert(match, `missing color token --${name}`)
    return match[1]
  }
  const luminance = hex => {
    const channels = hex.slice(1).match(/../g).map(value => {
      const channel = Number.parseInt(value, 16) / 255
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }
  const contrast = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
    return (values[0] + 0.05) / (values[1] + 0.05)
  }

  assert(!recoveryMarkup.includes('style={{'), 'Recovery still uses inline visual styles')
  assert(
    recoveryMarkup.includes('styles.recoveryTitle') &&
      recoveryMarkup.includes('styles.recoveryError') &&
      recoveryMarkup.includes('styles.recoveryPrimary') &&
      recoveryMarkup.includes('styles.recoverySecondary'),
    'Recovery visual roles are not represented by CSS module classes',
  )
  assert(
    appStyles.includes('.recoveryAction:hover:not(:disabled)') &&
      appStyles.includes('.recoveryAction:focus-visible') &&
      appStyles.includes('.recoveryAction:disabled') &&
      appStyles.includes('flex-wrap: wrap'),
    'Recovery action hover, focus, disabled, or narrow-width behavior is missing',
  )
  assert(
    appStyles.includes('background: var(--accent)') &&
      appStyles.includes('color: var(--bg-surface)') &&
      !recoveryMarkup.includes('#07131a'),
    'Recovery primary action does not use the accessible light-theme token pair',
  )
  assert(
    contrast(token('bg-surface'), token('accent')) >= 4.5,
    'Recovery primary action contrast is below WCAG AA',
  )
  assert(
    contrast(token('bg-surface'), token('accent-hover')) >= 4.5,
    'Recovery primary hover contrast is below WCAG AA',
  )
  assert(
    contrast(token('text-muted'), token('bg-surface')) >= 4.5,
    'Recovery secondary action contrast is below WCAG AA',
  )
  assert(
    appStyles.includes('.logo') &&
      appStyles.includes('color: var(--accent-hover)') &&
      appStyles.includes('.toast[data-toast-severity="error"]') &&
      appStyles.includes('background: var(--danger-surface)') &&
      contrast(token('info'), token('info-surface')) >= 4.5 &&
      contrast(token('success'), token('success-surface')) >= 4.5 &&
      contrast(token('danger'), token('danger-surface')) >= 4.5 &&
      !appStyles.includes('#3730a3') &&
      !appStyles.includes('#991b1b') &&
      !appStyles.includes('#7f1d1d'),
    'App shell retains hard-coded colors that duplicate existing light-theme tokens',
  )
})

await test('focus indicators and compact metadata meet light-theme contrast thresholds', async () => {
  const globalStyles = readFileSync(join(root, 'src/styles/global.css'), 'utf8')
  const appStyles = readFileSync(join(root, 'src/app/App.module.css'), 'utf8')
  const leftPaneStyles = readFileSync(join(root, 'src/app/LeftPane.module.css'), 'utf8')
  const canvasStyles = readFileSync(
    join(root, 'src/features/canvas/Canvas.module.css'),
    'utf8',
  )
  const eventDialogStyles = readFileSync(
    join(root, 'src/features/inspector/EventDialog.module.css'),
    'utf8',
  )
  const inspectorStyles = readFileSync(
    join(root, 'src/features/inspector/Inspector.module.css'),
    'utf8',
  )
  const flowStyles = readFileSync(
    join(root, 'src/features/screen-flow/ScreenFlow.module.css'),
    'utf8',
  )
  const changeSetBarStyles = readFileSync(
    join(root, 'src/features/change-review/ChangeSetBar.module.css'),
    'utf8',
  )
  const token = name => {
    const match = globalStyles.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
    assert(match, `missing opaque color token --${name}`)
    return match[1]
  }
  const channels = hex => hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16))
  const color = values => `#${values
    .map(value => Math.round(value).toString(16).padStart(2, '0'))
    .join('')}`
  const composite = (foreground, background, alpha) => {
    const foregroundChannels = channels(foreground)
    const backgroundChannels = channels(background)
    return color(foregroundChannels.map(
      (value, index) => value * alpha + backgroundChannels[index] * (1 - alpha),
    ))
  }
  const luminance = hex => {
    const values = channels(hex).map(value => {
      const channel = value / 255
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]
  }
  const contrast = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)]
      .sort((left, right) => right - left)
    return (values[0] + 0.05) / (values[1] + 0.05)
  }

  const focusRule = globalStyles.match(/button:focus-visible\s*\{([^}]*)\}/)?.[1] ?? ''
  const focusRing = token('focus-ring')
  const leftSectionBodyRule =
    leftPaneStyles.match(/[.]sectionBody\s*\{([^}]*)\}/)?.[1] ?? ''
  const leftTreeSectionRule =
    leftPaneStyles.match(/[.]treeSection\s*\{([^}]*)\}/)?.[1] ?? ''
  const leftTreeBodyRule =
    leftPaneStyles.match(/[.]treeBody\s*\{([^}]*)\}/)?.[1] ?? ''
  const outerLeftRule = appStyles.match(/[.]left\s*\{([^}]*)\}/)?.[1] ?? ''
  assert(
    outerLeftRule.includes('overflow-y: auto') &&
      !leftSectionBodyRule.includes('max-height') &&
      !leftSectionBodyRule.includes('overflow') &&
      !leftTreeSectionRule.includes('overflow') &&
      !leftTreeBodyRule.includes('overflow'),
    'left pane scroll ownership is not isolated to the outer aside',
  )
  assert(
    focusRule.includes('outline: 3px solid var(--focus-ring)') &&
      focusRule.includes('outline-offset: 2px'),
    'global buttons do not use the opaque focus-ring token with sufficient separation',
  )
  for (const background of [
    token('bg'),
    token('bg-surface'),
    token('bg-hover'),
    token('bg-selected'),
    token('danger-surface'),
    '#f8fafc',
  ]) {
    assert(
      contrast(focusRing, background) >= 3,
      `button focus ring contrast is below 3:1 on ${background}`,
    )
  }
  for (const [name, styles, selector] of [
    ['left pane section header', leftPaneStyles, 'sectionHeader'],
    ['right pane tab', appStyles, 'tab'],
  ]) {
    const rule = styles.match(
      new RegExp(`\\.${selector}:focus-visible\\s*\\{([^}]*)\\}`),
    )?.[1] ?? ''
    const insetWidth = Number(
      rule.match(/box-shadow:\s*inset 0 0 0 (\d+)px var\(--focus-ring\)/)?.[1],
    )
    assert(
      rule.includes('outline: none') && insetWidth >= 2 && insetWidth <= 3,
      `${name} does not keep its focus perimeter inside overflow bounds`,
    )
    const forcedColorsRule = styles.match(
      new RegExp(
        `@media\\s*\\(forced-colors:\\s*active\\)[\\s\\S]*?` +
          `\\.${selector}:focus-visible\\s*\\{([^}]*)\\}`,
      ),
    )?.[1] ?? ''
    assert(
      forcedColorsRule.includes('outline: 2px solid Highlight') &&
        forcedColorsRule.includes('outline-offset: -2px') &&
        forcedColorsRule.includes('box-shadow: none'),
      `${name} has no internal system-color fallback in forced-colors mode`,
    )
  }
  assert(
    /[.]tabActive\s*\{[^}]*border-bottom:\s*2px solid var\(--accent\)/s.test(appStyles),
    'right pane focus perimeter no longer differs in shape from the active underline',
  )
  const flowSummaryRule = flowStyles.match(
    /[.]edge summary:focus-visible\s*\{([^}]*)\}/,
  )?.[1] ?? ''
  const flowForcedColorsRule = flowStyles.match(
    /@media\s*\(forced-colors:\s*active\)[\s\S]*?[.]edge summary:focus-visible\s*\{([^}]*)\}/,
  )?.[1] ?? ''
  assert(
    flowSummaryRule.includes('outline: none') &&
      flowSummaryRule.includes('box-shadow: inset 0 0 0 3px var(--focus-ring)'),
    'Screen Flow transition summary does not use the inset focus perimeter',
  )
  assert(
    flowForcedColorsRule.includes('outline: 2px solid Highlight') &&
      flowForcedColorsRule.includes('outline-offset: -2px') &&
      flowForcedColorsRule.includes('box-shadow: none'),
    'Screen Flow transition summary has no internal forced-colors focus perimeter',
  )
  const flowMetadataLabelRule = flowStyles.match(
    /[.]transitionContent dt\s*\{([^}]*)\}/,
  )?.[1] ?? ''
  assert(
    flowMetadataLabelRule.includes('color: var(--text-muted)') &&
      flowMetadataLabelRule.includes('font-weight: 600'),
    'Screen Flow metadata labels do not preserve hierarchy with readable color and weight',
  )

  const agentChange = globalStyles.match(
    /--agent-change:\s*rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/,
  )
  assert(agentChange, 'missing translucent --agent-change token')
  const agentForeground = color(agentChange.slice(1, 4).map(Number))
  const agentAlpha = Number(agentChange[4])
  const countRule = changeSetBarStyles.match(/\.count\s*\{([^}]*)\}/)?.[1] ?? ''
  assert(
    countRule.includes('color: var(--text-muted)'),
    'change set count does not use the readable muted text token',
  )
  for (const baseBackground of [token('bg'), token('bg-surface')]) {
    const renderedBackground = composite(agentForeground, baseBackground, agentAlpha)
    assert(
      contrast(token('text-muted'), renderedBackground) >= 4.5,
      `change set count contrast is below 4.5:1 on ${renderedBackground}`,
    )
  }
  for (const [name, styles, selector, background] of [
    ['Canvas state badge', canvasStyles, 'frameStateBadge', token('bg-hover')],
    ['Event action position', eventDialogStyles, 'actionPosition', token('bg')],
    [
      'state override heading',
      inspectorStyles,
      'overrideHeading span',
      composite(agentForeground, token('bg-surface'), agentAlpha),
    ],
    [
      'state override explanation',
      inspectorStyles,
      'overrideExplanation',
      composite(agentForeground, token('bg-surface'), agentAlpha),
    ],
  ]) {
    const rules = [...styles.matchAll(
      new RegExp(`[.]${selector.replace(' ', '\\s+')}\\s*\\{([^}]*)\\}`, 'g'),
    )]
    const rule = rules.at(-1)?.[1] ?? ''
    assert(
      rule.includes('color: var(--text-muted)') &&
        contrast(token('text-muted'), background) >= 4.5,
      `${name} does not retain readable compact-text contrast`,
    )
  }
})

await test('brand assets integrate without duplicate accessible names', async () => {
  const appSource = readFileSync(join(root, 'src/app/App.tsx'), 'utf8')
  const appStyles = readFileSync(join(root, 'src/app/App.module.css'), 'utf8')
  const indexSource = readFileSync(join(root, 'index.html'), 'utf8')
  const readmeSource = readFileSync(join(root, 'README.md'), 'utf8')
  const markSource = readFileSync(join(root, 'brand/logo-mark.svg'), 'utf8')
  const faviconSource = readFileSync(join(root, 'brand/favicon.svg'), 'utf8')
  const lockupSource = readFileSync(join(root, 'brand/logo-lockup.svg'), 'utf8')

  assert(
    appSource.includes("import logoMarkUrl from '../../brand/logo-mark.svg'") &&
      appSource.includes('src={logoMarkUrl}') &&
      appSource.includes('alt=""') &&
      appSource.includes('aria-hidden="true"') &&
      appSource.includes('<span className={styles.logoText}>Screen Blueprint Studio</span>'),
    'Header does not pair one decorative mark with accessible HTML text',
  )
  assert(
    appSource.includes('width="24"') &&
      appSource.includes('height="24"') &&
      appStyles.includes('.logoMark') &&
      appStyles.includes('flex: 0 0 24px') &&
      appStyles.includes('.logoText') &&
      appStyles.includes('clip: rect(0, 0, 0, 0)'),
    'Header logo does not reserve stable space or retain its narrow accessible name',
  )
  assert(
    indexSource.includes('<link rel="icon" type="image/svg+xml" href="/brand/favicon.svg" />') &&
      readmeSource.includes('<img src="./brand/logo-lockup.svg" alt="Screen Blueprint Studio"'),
    'favicon or README lockup is not wired to the committed brand assets',
  )
  for (const [name, source] of [
    ['mark', markSource],
    ['favicon', faviconSource],
    ['lockup', lockupSource],
  ]) {
    assert(
      /<svg[^>]+viewBox="[^"]+"/.test(source) &&
        !/<image\b|<script\b|https?:\/\//.test(source.replace('http://www.w3.org/2000/svg', '')),
      `${name} SVG is missing its viewBox or contains an external dependency`,
    )
  }
})

await test('Inspector behavior projection resolves events APIs and validation', async () => {
  {
    memoryStorage.clear()
    const { getComponentBehavior: resolveBehavior } = await import(
      moduleUrl(componentBehaviorBundle, 'component-behavior-v3')
    )
    const behaviorStore = await freshStore('component-behavior-sample-v3')
    const behaviorDocument = behaviorStore.getState().effectiveDocument
    const saveBehavior = resolveBehavior(behaviorDocument, 'comp-save-btn', 'en')
    assert(
      saveBehavior?.events.length === 1 &&
        saveBehavior.events[0].name === 'Save task' &&
        saveBehavior.events[0].triggerType === 'click' &&
        saveBehavior.events[0].configuredByButton &&
        saveBehavior.events[0].triggeredByComponent &&
        saveBehavior.events[0].actions.map(action => action.type).join(',') === 'callApi',
      'Save button event was missing, duplicated, or ordered incorrectly',
    )
    const callApiAction = saveBehavior.events[0].actions[0]
    assert(
      callApiAction.type === 'callApi' &&
        callApiAction.operation.method === 'PATCH' &&
        callApiAction.operation.path === '/tasks/:taskId' &&
        callApiAction.operation.label === 'Save task' &&
        callApiAction.operation.successScenario?.label === 'Success' &&
        callApiAction.operation.errorScenario?.label === 'Error',
      'event action references were not resolved to readable API and scenario details',
    )
    const nameBehavior = resolveBehavior(behaviorDocument, 'comp-task-name-input', 'en')
    const statusBehavior = resolveBehavior(behaviorDocument, 'comp-task-status-select', 'ja')
    assert(
      nameBehavior?.validationRules.length === 1 &&
        nameBehavior.validationRules[0].type === 'required' &&
        nameBehavior.apiBindings[0]?.targetPath === 'title' &&
        statusBehavior?.apiBindings[0]?.targetPath === 'status' &&
        resolveBehavior(behaviorDocument, 'comp-list-summary', 'en')?.hasBehavior === false,
      'input validation or typed API request binding projection is incomplete',
    )
    const expandedDocument = structuredClone(behaviorDocument)
    expandedDocument.events['event-second'] = {
      id: 'event-second',
      screenId: 'screen-edit',
      name: 'Second save trigger',
      trigger: {
        type: 'click',
        target: { type: 'inline', componentId: 'comp-save-btn' },
      },
      actions: [{ type: 'navigate', destinationScreenId: 'screen-list' }],
    }
    expandedDocument.screens['screen-edit'].eventIds.push('event-second')
    const expandedSave = resolveBehavior(expandedDocument, 'comp-save-btn', 'en')
    assert(
      expandedSave.events.length === 2 &&
        new Set(expandedSave.events.map(event => event.id)).size === 2 &&
        expandedSave.events[1].actions[0].screen.label === 'Task List',
      'action targets or event deduplication failed',
    )
    return
  }
  memoryStorage.clear()
  const { getComponentBehavior } = await import(
    moduleUrl(componentBehaviorBundle, 'component-behavior')
  )
  const store = await freshStore('component-behavior-sample')
  const document = store.getState().effectiveDocument

  const saveBehavior = getComponentBehavior(document, 'comp-save-btn', 'en')
  assert(
    saveBehavior?.events.length === 1 &&
      saveBehavior.events[0].name === 'Save task' &&
      saveBehavior.events[0].triggerType === 'submit' &&
      saveBehavior.events[0].configuredByButton &&
      saveBehavior.events[0].triggeredByComponent &&
      saveBehavior.events[0].actions.map(action => action.type).join(',') === 'setState,callApi',
    'Save button event was missing, duplicated, or ordered incorrectly',
  )
  const setStateAction = saveBehavior.events[0].actions[0]
  const callApiAction = saveBehavior.events[0].actions[1]
  assert(
    setStateAction.type === 'setState' &&
      setStateAction.state.label === 'Saving' &&
      callApiAction.type === 'callApi' &&
      callApiAction.operation.method === 'PUT' &&
      callApiAction.operation.path === '/api/tasks/{taskId}' &&
      callApiAction.operation.label === 'Update task' &&
      callApiAction.operation.successState?.label === 'Success' &&
      callApiAction.operation.errorState?.label === 'Error',
    'event action references were not resolved to readable API and state details',
  )

  const nameBehavior = getComponentBehavior(document, 'comp-task-title-input', 'en')
  assert(
    nameBehavior?.validationRules.length === 3 &&
      nameBehavior.validationRules[0].type === 'required' &&
      nameBehavior.validationRules[0].message === 'Task title is required' &&
      nameBehavior.validationRules[1].type === 'minLength' &&
      nameBehavior.validationRules[1].value === 3 &&
      nameBehavior.validationRules[2].type === 'maxLength' &&
      nameBehavior.validationRules[2].value === 80 &&
      nameBehavior.validationRules[2].message === 'Enter no more than 80 characters' &&
      nameBehavior.apiBindings.length === 1 &&
      nameBehavior.apiBindings[0].targetPath === 'body.title' &&
      nameBehavior.apiBindings[0].operation.method === 'PUT',
    'TextInput validation or API request binding projection is incomplete',
  )
  const roleBehavior = getComponentBehavior(document, 'comp-task-assignee-select', 'ja')
  assert(
    roleBehavior?.validationRules.length === 0 &&
      roleBehavior.apiBindings[0]?.targetPath === 'body.assigneeId',
    'Select API request binding was not projected',
  )
  assert(
    getComponentBehavior(document, 'comp-list-title', 'en')?.hasBehavior === false,
    'unrelated leaf received an empty Behavior section',
  )

  const expanded = structuredClone(document)
  expanded.events['event-save-task'].actions.push(
    { type: 'navigate', destinationScreenId: 'screen-list' },
  )
  expanded.events['event-second'] = {
    id: 'event-second',
    screenId: 'screen-edit',
    name: 'Second save trigger',
    trigger: { type: 'submit', componentId: 'comp-save-btn' },
    actions: [],
  }
  expanded.screens['screen-edit'].eventIds.push('event-second')
  const expandedSave = getComponentBehavior(expanded, 'comp-save-btn', 'en')
  const navigateAction = expandedSave.events[0].actions[2]
  assert(
    expandedSave.events.length === 2 &&
      new Set(expandedSave.events.map(event => event.id)).size === 2 &&
      expandedSave.events[0].configuredByButton &&
      !expandedSave.events[1].configuredByButton &&
      navigateAction.type === 'navigate' &&
      navigateAction.screen.label === 'Task List' &&
      navigateAction.screen.route === '/tasks',
    'action targets or event deduplication failed',
  )

  const dangling = structuredClone(expanded)
  dangling.events['event-save-task'].actions = [
    { type: 'setState', stateId: 'missing-state' },
    { type: 'callApi', apiOperationId: 'missing-api' },
    { type: 'navigate', destinationScreenId: 'missing-screen' },
  ]
  const danglingActions = getComponentBehavior(dangling, 'comp-save-btn', 'en').events[0].actions
  assert(
    danglingActions[0].state.label === null &&
      danglingActions[1].operation.label === null &&
      danglingActions[2].screen.label === null &&
      danglingActions.every(action => JSON.stringify(action).includes('missing-')),
    'dangling behavior references were silently blanked or threw',
  )

  memoryStorage.clear()
  const changeSetStore = await freshStore('component-behavior-change-set')
  const behaviorReview = changeSetStore.getState().beginChangeSet('Edit behavior in change set')
  changeSetStore.getState().dispatchToChangeSet(behaviorReview.id, {
    type: 'bindApiOperation',
    operationId: 'api-proposed',
    screenId: 'screen-edit',
    name: 'Validate assignee',
    method: 'POST',
    path: '/api/assignees/validate',
    requestBindings: [{ componentId: 'comp-task-assignee-select', targetPath: 'body.assigneeId' }],
    successStateId: 'state-edit-success',
    errorStateId: 'state-edit-error',
  })
  changeSetStore.getState().dispatchToChangeSet(behaviorReview.id, {
    type: 'connectEvent',
    eventId: 'event-proposed',
    screenId: 'screen-edit',
    name: 'Cancel change set event',
    trigger: { type: 'click', componentId: 'comp-cancel-btn' },
    actions: [{ type: 'callApi', apiOperationId: 'api-proposed' }],
  })
  assert(
    !getComponentBehavior(
      changeSetStore.getState().document,
      'comp-task-assignee-select',
      'en',
    ).apiBindings.some(binding => binding.operation.id === 'api-proposed') &&
      getComponentBehavior(
        changeSetStore.getState().effectiveDocument,
        'comp-task-assignee-select',
        'en',
      ).apiBindings.some(binding => binding.operation.id === 'api-proposed') &&
      getComponentBehavior(
        changeSetStore.getState().effectiveDocument,
        'comp-cancel-btn',
        'en',
      ).events.some(event => event.id === 'event-proposed'),
    'active change set behavior was not isolated to the effective document',
  )
  const reloaded = await freshStore('component-behavior-change-set-reload')
  assert(
    getComponentBehavior(
      reloaded.getState().effectiveDocument,
      'comp-cancel-btn',
      'en',
    ).events.some(event => event.id === 'event-proposed'),
    'effective behavior projection did not survive active change set reload',
  )

  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  const detailsSource = readFileSync(
    join(root, 'src/features/inspector/BehaviorDetails.tsx'),
    'utf8',
  )
  assert(
    inspectorSource.includes('getComponentBehavior(inspectorDocument, comp.id)') &&
      inspectorSource.includes('eventEditor={eventEditor}') &&
      detailsSource.includes('data-behavior-specification') &&
      detailsSource.includes('missingReference(operation.id, t)'),
    'Inspector does not render the effective behavior projection with visible fallbacks',
  )
})

await test('Event editor saves validated ordered actions as one human operation', async () => {
  {
    memoryStorage.clear()
    const { applyCommandWithoutRevision: applyEventCommand } = await import(
      moduleUrl(domainBundle, 'event-editor-domain-v3')
    )
    const { getEventEditorContext: eventEditorContext } = await import(
      moduleUrl(componentBehaviorBundle, 'event-editor-context-v3')
    )
    const eventStore = await freshStore('event-editor-history-v3')
    const originalEvent = structuredClone(
      eventStore.getState().document.events['event-save-task'],
    )
    const updateEventCommand = {
      type: 'updateEvent',
      eventId: 'event-save-task',
      name: 'Save and return',
      trigger: {
        type: 'click',
        target: { type: 'inline', componentId: 'comp-save-btn' },
      },
      actions: [
        { type: 'navigate', destinationScreenId: 'screen-list' },
        { type: 'callApi', apiOperationId: 'api-save-task' },
        { type: 'setScenario', scenarioId: 'scenario-edit-success' },
      ],
    }
    const beforeRevision = eventStore.getState().revision
    const beforeHistory = eventStore.getState().history.length
    assert(
      eventStore.getState().dispatch(updateEventCommand, 'Edit save event'),
      'event update failed',
    )
    assert(
      eventStore.getState().revision === beforeRevision + 1 &&
        eventStore.getState().history.length === beforeHistory + 1 &&
        eventStore.getState().document.events['event-save-task'].actions
          .map(action => action.type).join(',') === 'navigate,callApi,setScenario',
      'event draft did not commit as one ordered history entry',
    )
    eventStore.getState().undo()
    assert(
      JSON.stringify(eventStore.getState().document.events['event-save-task']) ===
        JSON.stringify(originalEvent),
      'Undo did not restore the event before editing',
    )
    eventStore.getState().redo()
    const context = eventEditorContext(
      eventStore.getState().effectiveDocument,
      'comp-save-btn',
      'en',
    )
    assert(
      context?.events.length === 1 &&
        context.states.every(scenario => scenario.id.startsWith('scenario-edit-')) &&
        context.apiOperations.map(operation => operation.id).join(',') === 'api-save-task' &&
        context.screens.map(screen => screen.id).join(',') === 'screen-list,screen-edit',
      'event editor candidates were not restricted or resolved correctly',
    )
    let invalidRejected = false
    try {
      applyEventCommand(eventStore.getState().document, {
        ...updateEventCommand,
        actions: [{ type: 'setScenario', scenarioId: 'scenario-list-loading' }],
      })
    } catch {
      invalidRejected = true
    }
    assert(invalidRejected, 'cross-screen scenario event update was accepted')
    return
  }
  memoryStorage.clear()
  const { applyCommandWithoutRevision } = await import(
    moduleUrl(domainBundle, 'event-editor-domain')
  )
  const { getEventEditorContext } = await import(
    moduleUrl(componentBehaviorBundle, 'event-editor-context')
  )
  const store = await freshStore('event-editor-history')
  const original = structuredClone(store.getState().document.events['event-save-task'])
  const editedActions = [
    { type: 'navigate', destinationScreenId: 'screen-list' },
    { type: 'callApi', apiOperationId: 'api-update-task' },
    { type: 'setState', stateId: 'state-edit-default' },
  ]
  const updateCommand = {
    type: 'updateEvent',
    eventId: 'event-save-task',
    name: 'Save and return',
    trigger: { type: 'submit', componentId: 'comp-save-btn' },
    actions: editedActions,
  }
  const beforeRevision = store.getState().document.revision
  const beforeHistory = store.getState().history.length
  assert(store.getState().dispatch(updateCommand, 'Edit save event'), 'event update failed')
  assert(
    store.getState().document.revision === beforeRevision + 1 &&
      store.getState().history.length === beforeHistory + 1 &&
      store.getState().document.events['event-save-task'].name === 'Save and return' &&
      store.getState().document.events['event-save-task'].trigger.type === 'submit' &&
      store.getState().document.events['event-save-task'].actions
        .map(action => action.type)
        .join(',') === 'navigate,callApi,setState',
    'event draft did not commit as one ordered history entry',
  )
  store.getState().undo()
  assert(
    JSON.stringify(store.getState().document.events['event-save-task']) ===
      JSON.stringify(original),
    'Undo did not restore the event before editing',
  )
  store.getState().redo()
  assert(
    store.getState().document.events['event-save-task'].name === 'Save and return',
    'Redo did not restore the edited event',
  )

  const context = getEventEditorContext(
    store.getState().effectiveDocument,
    'comp-save-btn',
    'en',
  )
  assert(
    context?.events.length === 1 &&
      context.events[0].event.id === 'event-save-task' &&
      context.states.every(state => state.id.startsWith('state-edit-')) &&
      context.states.some(state => state.id === 'state-edit-default' && state.isDefault) &&
      context.apiOperations.map(operation => operation.id).join(',') === 'api-update-task' &&
      context.screens.map(screen => screen.id).join(',') === 'screen-list,screen-edit',
    'event editor candidates were not restricted or resolved correctly',
  )
  assert(
    getEventEditorContext(
      store.getState().effectiveDocument,
      'comp-list-title',
      'en',
    )?.supportsEventCreation === true &&
      getEventEditorContext(
        store.getState().effectiveDocument,
        'comp-list-page',
        'en',
      )?.supportsEventCreation === false,
    'event creation was not limited to semantic leaf components',
  )

  for (const [label, command] of [
    ['cross-screen state', {
      ...updateCommand,
      actions: [{ type: 'setState', stateId: 'state-list-default' }],
    }],
    ['cross-screen API', {
      ...updateCommand,
      actions: [{ type: 'callApi', apiOperationId: 'missing-api' }],
    }],
    ['unsupported action', {
      ...updateCommand,
      actions: [{ type: 'unsupportedAction' }],
    }],
    ['unknown command field', {
      ...updateCommand,
      unexpected: true,
    }],
  ]) {
    let rejected = false
    try {
      applyCommandWithoutRevision(store.getState().document, command)
    } catch {
      rejected = true
    }
    assert(rejected, `${label} event update was accepted`)
  }

  memoryStorage.clear()
  const changeSetStore = await freshStore('event-editor-change-set')
  const eventReview = changeSetStore.getState().beginChangeSet('Edit event')
  changeSetStore.getState().dispatchToChangeSet(eventReview.id, updateCommand)
  assert(
    changeSetStore.getState().activeChangeSet.operations.length === 1 &&
      changeSetStore.getState().activeChangeSet.operations[0].source === 'agent' &&
      changeSetStore.getState().activeChangeSet.operations[0].command.type === 'updateEvent' &&
      changeSetStore.getState().document.events['event-save-task'].name === original.name &&
      changeSetStore.getState().effectiveDocument.events['event-save-task'].name ===
        'Save and return',
    'agent event edit did not remain one effective-only change set operation',
  )
  const changeSetReload = await freshStore('event-editor-change-set-reload')
  assert(
    changeSetReload.getState().activeChangeSet?.operations.length === 1 &&
      changeSetReload.getState().effectiveDocument.events['event-save-task'].name ===
        'Save and return',
    'event edit did not survive active change set reload',
  )
  changeSetReload.getState().rejectChangeSet()
  assert(
    changeSetReload.getState().document.events['event-save-task'].name === original.name,
    'Reject did not discard the agent event edit',
  )

  const eventAccept = changeSetReload.getState().beginChangeSet('Accept event edit')
  changeSetReload.getState().dispatchToChangeSet(eventAccept.id, updateCommand)
  changeSetReload.getState().acceptChangeSet()
  assert(
    changeSetReload.getState().activeChangeSet === null &&
      changeSetReload.getState().document.events['event-save-task'].name === 'Save and return',
    'Accept did not confirm the agent event edit',
  )

  memoryStorage.clear()
  const deleteStore = await freshStore('event-editor-delete')
  assert(
    deleteStore.getState().document.components['comp-save-btn'].config.eventId ===
      'event-save-task',
    'sample button event reference is missing',
  )
  deleteStore.getState().dispatch(
    { type: 'removeEvent', eventId: 'event-save-task' },
    'Delete save event',
  )
  assert(
    deleteStore.getState().document.events['event-save-task'] === undefined &&
      deleteStore.getState().document.components['comp-save-btn'].config.eventId === null,
    'event deletion did not clear the event and Button primary reference',
  )
  deleteStore.getState().undo()
  assert(
    deleteStore.getState().document.events['event-save-task']?.name === original.name &&
      deleteStore.getState().document.components['comp-save-btn'].config.eventId ===
        'event-save-task',
    'Undo did not restore the deleted event and Button primary reference',
  )

  const eventDialogSource = readFileSync(
    join(root, 'src/features/inspector/EventDialog.tsx'),
    'utf8',
  )
  assert(
    eventDialogSource.includes("type: 'connectEvent'") &&
      eventDialogSource.includes("type: 'updateEvent'") &&
      eventDialogSource.includes("type: 'removeEvent'") &&
      eventDialogSource.includes('setActions') &&
      !eventDialogSource.includes("type: 'bindApiOperation'"),
    'Inspector event UI is not draft-based or crossed into API operation editing',
  )
})

await test('API editor commands preserve references and enforce canonical bindings', async () => {
  {
    memoryStorage.clear()
    const { applyCommandWithoutRevision: applyApiCommand } = await import(
      moduleUrl(domainBundle, 'api-editor-domain-v3')
    )
    const { getApiEditorContext: apiEditorContext } = await import(
      moduleUrl(componentBehaviorBundle, 'api-editor-context-v3')
    )
    const apiStore = await freshStore('api-editor-history-v3')
    const originalApi = structuredClone(apiStore.getState().document.apiOperations['api-save-task'])
    const originalEvent = structuredClone(apiStore.getState().document.events['event-save-task'])
    const updateApiCommand = {
      type: 'updateApiOperation',
      operationId: 'api-save-task',
      name: 'Update task details',
      method: 'POST',
      path: '/tasks/:taskId/details',
      requestBindings: [{
        source: { type: 'inline', componentId: 'comp-task-status-select' },
        targetPath: 'status',
      }],
      successScenarioId: 'scenario-edit-success',
      errorScenarioId: null,
    }
    const beforeRevision = apiStore.getState().revision
    const beforeHistory = apiStore.getState().history.length
    assert(
      apiStore.getState().dispatch(updateApiCommand, 'Edit save API'),
      'API update failed',
    )
    assert(
      apiStore.getState().revision === beforeRevision + 1 &&
        apiStore.getState().history.length === beforeHistory + 1 &&
        apiStore.getState().document.apiOperations['api-save-task'].requestBindings[0]
          .source.componentId === 'comp-task-status-select' &&
        JSON.stringify(apiStore.getState().document.events['event-save-task']) ===
          JSON.stringify(originalEvent),
      'API draft did not commit atomically or changed its callApi reference',
    )
    apiStore.getState().undo()
    assert(
      JSON.stringify(apiStore.getState().document.apiOperations['api-save-task']) ===
        JSON.stringify(originalApi),
      'Undo did not restore the API operation before editing',
    )
    apiStore.getState().redo()
    const context = apiEditorContext(
      apiStore.getState().effectiveDocument,
      'comp-save-btn',
      'en',
    )
    const operation = context?.operations.find(candidate =>
      candidate.operation.id === 'api-save-task'
    )
    assert(
      context?.supportsApiEditing === true &&
        context.states.every(scenario => scenario.id.startsWith('scenario-edit-')) &&
        context.inputComponents.map(component => component.id).join(',') ===
          'comp-task-name-input,comp-task-status-select' &&
        operation?.eventReferences[0]?.event.id === 'event-save-task',
      'API editor candidates, bindings, or callApi impacts are incomplete',
    )
    let invalidRejected = false
    try {
      applyApiCommand(apiStore.getState().document, {
        ...updateApiCommand,
        requestBindings: [{
          source: { type: 'inline', componentId: 'comp-create-title-input' },
          targetPath: 'title',
        }],
      })
    } catch {
      invalidRejected = true
    }
    assert(invalidRejected, 'cross-screen API binding was accepted')
    return
  }
  memoryStorage.clear()
  const { applyCommandWithoutRevision } = await import(
    moduleUrl(domainBundle, 'api-editor-domain')
  )
  const { getApiEditorContext } = await import(
    moduleUrl(componentBehaviorBundle, 'api-editor-context')
  )
  const store = await freshStore('api-editor-history')
  const original = structuredClone(store.getState().document.apiOperations['api-update-task'])
  const originalEvent = structuredClone(store.getState().document.events['event-save-task'])
  const updateCommand = {
    type: 'updateApiOperation',
    operationId: 'api-update-task',
    name: 'Update task details',
    method: 'PATCH',
    path: '/api/tasks/{taskId}/details/with/a/long/path',
    requestBindings: [
      { componentId: 'comp-task-assignee-select', targetPath: 'body.assigneeId' },
      { componentId: 'comp-task-description-input', targetPath: 'body.description' },
    ],
    successStateId: 'state-edit-success',
    errorStateId: null,
  }
  const beforeRevision = store.getState().document.revision
  const beforeHistory = store.getState().history.length
  assert(store.getState().dispatch(updateCommand, 'Edit save API'), 'API update failed')
  assert(
    store.getState().document.revision === beforeRevision + 1 &&
      store.getState().history.length === beforeHistory + 1 &&
      store.getState().document.apiOperations['api-update-task'].method === 'PATCH' &&
      store.getState().document.apiOperations['api-update-task'].requestBindings
        .map(binding => binding.componentId)
        .join(',') === 'comp-task-assignee-select,comp-task-description-input' &&
      JSON.stringify(store.getState().document.events['event-save-task']) ===
        JSON.stringify(originalEvent),
    'API draft did not commit atomically or changed its callApi reference',
  )
  store.getState().undo()
  assert(
    JSON.stringify(store.getState().document.apiOperations['api-update-task']) ===
      JSON.stringify(original),
    'Undo did not restore the API operation before editing',
  )
  store.getState().redo()
  assert(
    store.getState().document.apiOperations['api-update-task'].name ===
      'Update task details',
    'Redo did not restore the edited API operation',
  )

  const context = getApiEditorContext(
    store.getState().effectiveDocument,
    'comp-save-btn',
    'en',
  )
  const operation = context?.operations.find(candidate =>
    candidate.operation.id === 'api-update-task',
  )
  assert(
    context?.supportsApiEditing === true &&
      context.states.every(state => state.id.startsWith('state-edit-')) &&
      context.inputComponents.map(component => component.id).join(',') ===
        'comp-task-title-input,comp-task-description-input,comp-task-assignee-select,comp-task-status-select' &&
      operation?.bindings.map(binding => binding.component.label).join(',') ===
        'Assignee,Description' &&
      operation.eventReferences.length === 1 &&
      operation.eventReferences[0].event.id === 'event-save-task' &&
      operation.eventReferences[0].actionCount === 1,
    'API editor candidates, binding labels, or callApi impacts are incomplete',
  )
  assert(
    getApiEditorContext(
      store.getState().effectiveDocument,
      'comp-edit-page',
      'en',
    )?.supportsApiEditing === false,
    'API editing was exposed from a structural component',
  )

  let documentWithForeignInput = applyCommandWithoutRevision(
    store.getState().document,
    {
      type: 'addComponent',
      componentId: 'foreign-input',
      screenId: 'screen-list',
      parentId: 'comp-list-section',
      kind: 'textInput',
      placement: { mode: 'flow' },
      sizing: defaultSizing(),
      config: {
        kind: 'textInput',
        fieldKey: 'foreign',
        label: 'Foreign',
        inputType: 'text',
        required: false,
        placeholder: '',
        defaultValue: '',
        validationRules: [],
      },
    },
  )
  for (const [label, requestBindings] of [
    ['duplicate component', [
      { componentId: 'comp-task-title-input', targetPath: 'body.name' },
      { componentId: 'comp-task-title-input', targetPath: 'body.alias' },
    ]],
    ['duplicate target path', [
      { componentId: 'comp-task-title-input', targetPath: 'body.name' },
      { componentId: 'comp-task-description-input', targetPath: ' body.name ' },
    ]],
    ['empty target path', [
      { componentId: 'comp-task-title-input', targetPath: '   ' },
    ]],
    ['non-input component', [
      { componentId: 'comp-save-btn', targetPath: 'body.submit' },
    ]],
    ['cross-screen input', [
      { componentId: 'foreign-input', targetPath: 'body.foreign' },
    ]],
  ]) {
    let rejected = false
    try {
      applyCommandWithoutRevision(documentWithForeignInput, {
        ...updateCommand,
        requestBindings,
      })
    } catch {
      rejected = true
    }
    assert(rejected, `${label} API binding was accepted`)
  }
  let unknownFieldRejected = false
  try {
    applyCommandWithoutRevision(documentWithForeignInput, {
      ...updateCommand,
      unexpected: true,
    })
  } catch {
    unknownFieldRejected = true
  }
  assert(unknownFieldRejected, 'unknown API update command field was accepted')

  memoryStorage.clear()
  const changeSetStore = await freshStore('api-editor-change-set')
  const apiReview = changeSetStore.getState().beginChangeSet('Edit API')
  changeSetStore.getState().dispatchToChangeSet(apiReview.id, updateCommand)
  assert(
    changeSetStore.getState().activeChangeSet.operations.length === 1 &&
      changeSetStore.getState().activeChangeSet.operations[0].source === 'agent' &&
      changeSetStore.getState().activeChangeSet.operations[0].command.type ===
        'updateApiOperation' &&
      changeSetStore.getState().document.apiOperations['api-update-task'].name ===
        original.name &&
      changeSetStore.getState().effectiveDocument.apiOperations['api-update-task'].name ===
        'Update task details',
    'agent API edit did not remain one effective-only change set operation',
  )
  const changeSetReload = await freshStore('api-editor-change-set-reload')
  assert(
    changeSetReload.getState().activeChangeSet?.operations.length === 1 &&
      changeSetReload.getState().effectiveDocument.apiOperations['api-update-task'].name ===
        'Update task details',
    'API edit did not survive active change set reload',
  )
  changeSetReload.getState().rejectChangeSet()
  assert(
    changeSetReload.getState().document.apiOperations['api-update-task'].name ===
      original.name,
    'Reject did not discard the agent API edit',
  )
  const apiAccept = changeSetReload.getState().beginChangeSet('Accept API edit')
  changeSetReload.getState().dispatchToChangeSet(apiAccept.id, updateCommand)
  changeSetReload.getState().acceptChangeSet()
  assert(
    changeSetReload.getState().activeChangeSet === null &&
      changeSetReload.getState().document.apiOperations['api-update-task'].name ===
        'Update task details',
    'Accept did not confirm the agent API edit',
  )

  memoryStorage.clear()
  const deleteStore = await freshStore('api-editor-delete')
  deleteStore.getState().dispatch(
    { type: 'removeApiOperation', operationId: 'api-update-task' },
    'Delete save API',
  )
  assert(
    deleteStore.getState().document.apiOperations['api-update-task'] === undefined &&
      !deleteStore.getState().document.events['event-save-task'].actions.some(
        action => action.type === 'callApi',
      ),
    'API deletion did not clear the operation and callApi actions',
  )
  deleteStore.getState().undo()
  assert(
    deleteStore.getState().document.apiOperations['api-update-task'] !== undefined &&
      deleteStore.getState().document.events['event-save-task'].actions.some(
        action => action.type === 'callApi' &&
          action.apiOperationId === 'api-update-task',
      ),
    'Undo did not restore the API operation and callApi actions',
  )

  for (const [label, componentId, legacyValue] of [
    ['text input null', 'comp-task-description-input', null],
    ['select null', 'comp-task-assignee-select', null],
    ['text input value', 'comp-task-description-input', {
      componentId: 'comp-task-title-input',
      targetPath: 'body.name',
    }],
  ]) {
    const documentWithLegacyField = structuredClone(deleteStore.getState().document)
    documentWithLegacyField.components[componentId].config.requestBinding = legacyValue
    memoryStorage.setItem(storageKey, JSON.stringify({ document: documentWithLegacyField }))
    const rejectedStore = await freshStore(`api-binding-legacy-${label}`)
    assert(
      rejectedStore.getState().recoveryState !== null,
      `${label} legacy component binding did not enter Recovery`,
    )
  }

  assert(
    Object.values(deleteStore.getState().document.components).every(component =>
      !Object.prototype.hasOwnProperty.call(component.config, 'requestBinding')
    ),
    'canonical component fixtures contain the legacy requestBinding field',
  )
  const persistenceSource = readFileSync(
    join(root, 'src/persistence/localStorage.ts'),
    'utf8',
  )
  assert(
    !persistenceSource.includes('requestBinding'),
    'persistence retains legacy requestBinding compatibility handling',
  )

  const apiDialogSource = readFileSync(
    join(root, 'src/features/inspector/ApiOperationDialog.tsx'),
    'utf8',
  )
  assert(
    apiDialogSource.includes("type: 'bindApiOperation'") &&
      apiDialogSource.includes("type: 'updateApiOperation'") &&
      apiDialogSource.includes("type: 'removeApiOperation'") &&
      apiDialogSource.includes('setBindings') &&
      apiDialogSource.includes(
        '.filter(binding => isComponentTargetRef(binding.value.source))',
      ) &&
      !apiDialogSource.includes('validationRules'),
    'Inspector API UI is not draft-based or crossed into validation editing',
  )
})

await test('Validation rules editor enforces invariants and commits as one human operation', async () => {
  memoryStorage.clear()
  const { applyCommandWithoutRevision } = await import(
    moduleUrl(domainBundle, 'validation-rules-domain')
  )
  const { getValidationRulesEditorContext } = await import(
    moduleUrl(componentBehaviorBundle, 'validation-rules-context')
  )
  const store = await freshStore('validation-rules-history')
  const original = structuredClone(
    store.getState().document.components['comp-task-name-input'].config.validationRules,
  )

  const editedRules = [
    { id: 'vr-1', type: 'required', message: 'Task title is required' },
    { id: 'vr-new', type: 'minLength', value: 2, message: 'Enter at least 2 characters' },
    { id: 'vr-2', type: 'maxLength', value: 80, message: 'Enter no more than 80 characters' },
  ]
  const updateCommand = {
    type: 'updateComponentSpec',
    componentId: 'comp-task-name-input',
    patch: { config: { validationRules: editedRules } },
  }
  const beforeRevision = store.getState().revision
  const beforeHistory = store.getState().history.length
  assert(
    store.getState().dispatch(updateCommand, 'Edit validation rules'),
    'validation rules update failed',
  )
  assert(
    store.getState().revision === beforeRevision + 1 &&
      store.getState().history.length === beforeHistory + 1 &&
      store.getState().document.components['comp-task-name-input'].config.validationRules
        .map(rule => `${rule.type}:${rule.value ?? ''}`)
        .join(',') === 'required:,minLength:2,maxLength:80',
    'validation rules draft did not commit as one ordered history entry',
  )
  store.getState().undo()
  assert(
    JSON.stringify(
      store.getState().document.components['comp-task-name-input'].config.validationRules,
    ) === JSON.stringify(original),
    'Undo did not restore validation rules before editing',
  )
  store.getState().redo()
  assert(
    store.getState().document.components['comp-task-name-input'].config.validationRules.length === 3,
    'Redo did not restore the edited validation rules',
  )

  const context = getValidationRulesEditorContext(
    store.getState().effectiveDocument,
    'comp-task-name-input',
    'en',
  )
  assert(
    context?.supportsValidationEditing === true &&
      context.label === 'Task name' &&
      context.rules.length === 3,
    'validation rules editor context was not resolved correctly for a textInput',
  )
  assert(
    getValidationRulesEditorContext(
      store.getState().effectiveDocument,
      'comp-task-status-select',
      'en',
    )?.supportsValidationEditing === false &&
      getValidationRulesEditorContext(
        store.getState().effectiveDocument,
        'comp-save-btn',
        'en',
      )?.supportsValidationEditing === false,
    'validation rule editing was exposed from a non-textInput component',
  )

  for (const [label, rules] of [
    ['duplicate required', [
      { id: 'a', type: 'required', message: 'm1' },
      { id: 'b', type: 'required', message: 'm2' },
    ]],
    ['duplicate email', [
      { id: 'a', type: 'email', message: 'm1' },
      { id: 'b', type: 'email', message: 'm2' },
    ]],
    ['duplicate minLength', [
      { id: 'a', type: 'minLength', value: 1, message: 'm1' },
      { id: 'b', type: 'minLength', value: 2, message: 'm2' },
    ]],
    ['min greater than max', [
      { id: 'a', type: 'minLength', value: 10, message: 'm1' },
      { id: 'b', type: 'maxLength', value: 5, message: 'm2' },
    ]],
    ['empty message', [
      { id: 'a', type: 'required', message: '   ' },
    ]],
    ['negative length value', [
      { id: 'a', type: 'minLength', value: -1, message: 'm1' },
    ]],
    ['non safe integer length value', [
      { id: 'a', type: 'minLength', value: 1.5, message: 'm1' },
    ]],
    ['empty pattern value', [
      { id: 'a', type: 'pattern', value: '   ', message: 'm1' },
    ]],
    ['invalid pattern regex', [
      { id: 'a', type: 'pattern', value: '(', message: 'm1' },
    ]],
    ['duplicate pattern value', [
      { id: 'a', type: 'pattern', value: '^a+$', message: 'm1' },
      { id: 'b', type: 'pattern', value: ' ^a+$ ', message: 'm2' },
    ]],
    ['empty custom description', [
      { id: 'a', type: 'custom', description: '   ', message: 'm1' },
    ]],
    ['duplicate custom description', [
      { id: 'a', type: 'custom', description: 'Must be unique', message: 'm1' },
      { id: 'b', type: 'custom', description: ' Must be unique ', message: 'm2' },
    ]],
    ['duplicate rule id', [
      { id: 'dup', type: 'required', message: 'm1' },
      { id: 'dup', type: 'email', message: 'm2' },
    ]],
    ['unknown rule type', [
      { id: 'a', type: 'unsupported', message: 'm1' },
    ]],
  ]) {
    let rejected = false
    try {
      applyCommandWithoutRevision(store.getState().document, {
        type: 'updateComponentSpec',
        componentId: 'comp-task-name-input',
        patch: { config: { validationRules: rules } },
      })
    } catch {
      rejected = true
    }
    assert(rejected, `${label} validation rules were accepted`)
  }

  const reordered = [
    ...store.getState().document.components['comp-task-name-input'].config.validationRules,
  ].reverse()
  const reorderedResult = applyCommandWithoutRevision(store.getState().document, {
    type: 'updateComponentSpec',
    componentId: 'comp-task-name-input',
    patch: { config: { validationRules: reordered } },
  })
  assert(
    reorderedResult.components['comp-task-name-input'].config.validationRules
      .map(rule => rule.id)
      .join(',') === reordered.map(rule => rule.id).join(','),
    'reordering validation rules did not preserve the new order',
  )

  memoryStorage.clear()
  const changeSetStore = await freshStore('validation-rules-change-set')
  const validationReview = changeSetStore.getState().beginChangeSet('Edit validation rules')
  changeSetStore.getState().dispatchToChangeSet(validationReview.id, updateCommand)
  assert(
    changeSetStore.getState().activeChangeSet.operations.length === 1 &&
      changeSetStore.getState().activeChangeSet.operations[0].source === 'agent' &&
      changeSetStore.getState().activeChangeSet.operations[0].command.type ===
        'updateComponentSpec' &&
      changeSetStore.getState().document.components['comp-task-name-input'].config.validationRules
        .length === original.length &&
      changeSetStore.getState().effectiveDocument.components['comp-task-name-input'].config
        .validationRules.length === 3,
    'agent validation rules edit did not remain one effective-only change set operation',
  )
  const changeSetReload = await freshStore('validation-rules-change-set-reload')
  assert(
    changeSetReload.getState().activeChangeSet?.operations.length === 1 &&
      changeSetReload.getState().effectiveDocument.components['comp-task-name-input'].config
        .validationRules.length === 3,
    'validation rules edit did not survive active change set reload',
  )
  changeSetReload.getState().rejectChangeSet()
  assert(
    changeSetReload.getState().document.components['comp-task-name-input'].config.validationRules
      .length === original.length,
    'Reject did not discard the agent validation rules edit',
  )
  const validationAccept = changeSetReload.getState().beginChangeSet('Accept validation rules edit')
  changeSetReload.getState().dispatchToChangeSet(validationAccept.id, updateCommand)
  changeSetReload.getState().acceptChangeSet()
  assert(
    changeSetReload.getState().activeChangeSet === null &&
      changeSetReload.getState().document.components['comp-task-name-input'].config.validationRules
        .length === 3,
    'Accept did not confirm the agent validation rules edit',
  )

  const validationDialogSource = readFileSync(
    join(root, 'src/features/inspector/ValidationRulesDialog.tsx'),
    'utf8',
  )
  assert(
    validationDialogSource.includes("type: 'updateComponentSpec'") &&
      validationDialogSource.includes('setRules') &&
      !validationDialogSource.includes("type: 'connectEvent'") &&
      !validationDialogSource.includes("type: 'bindApiOperation'"),
    'Inspector validation rules UI is not draft-based or crossed into event/API editing',
  )

  const behaviorDetailsSource = readFileSync(
    join(root, 'src/features/inspector/BehaviorDetails.tsx'),
    'utf8',
  )
  assert(
    behaviorDetailsSource.includes('ValidationRulesDialog') &&
      behaviorDetailsSource.includes('supportsValidationEditing'),
    'Behavior details did not wire the validation rules editor',
  )
})

await test('WebMCP separates invalid version arguments from retryable conflicts', async () => {
  memoryStorage.clear()
  const { WEBMCP_TOOLS } = await import(moduleUrl(toolsBundle, 'version-error-semantics'))
  const byName = name => WEBMCP_TOOLS.find(tool => tool.name === name)
  const writeToolNames = [
    'change_screen_structure',
    'change_component_structure',
    'update_component_spec',
    'upsert_screen_state',
    'connect_behavior',
  ]
  for (const toolName of writeToolNames) {
    const schema = byName(toolName).inputSchema
    const branches = schema.oneOf ?? [schema]
    for (const branch of branches) {
      for (const argument of ['expectedRevision', 'expectedChangeSetVersion']) {
        const property = branch.properties?.[argument]
        assert(
          property?.type === 'integer' &&
            property.minimum === 0 &&
            property.description.includes('REVISION_CONFLICT') &&
            branch.required.includes(argument),
          `${toolName} schema does not require a documented non-negative ${argument}`,
        )
      }
    }
  }

  const begin = byName('begin_change_set').execute({ summary: 'Version error semantics' })
  assert(begin.ok, 'version semantics change set did not begin')
  const baseInput = {
    changeSetId: begin.data.changeSetId,
    expectedRevision: begin.data.baseRevision,
    expectedChangeSetVersion: 0,
    componentId: 'comp-list-summary',
    patch: { common: { description: 'Version semantics' } },
  }
  const invalidArguments = [
    ['expectedRevision', undefined],
    ['expectedRevision', null],
    ['expectedRevision', '1'],
    ['expectedRevision', 0.5],
    ['expectedRevision', -1],
    ['expectedChangeSetVersion', undefined],
    ['expectedChangeSetVersion', null],
    ['expectedChangeSetVersion', '0'],
    ['expectedChangeSetVersion', 0.5],
    ['expectedChangeSetVersion', -1],
  ]

  for (const [argument, value] of invalidArguments) {
    const input = { ...baseInput, [argument]: value }
    if (value === undefined) delete input[argument]
    const result = byName('update_component_spec').execute(input)
    assert(
      !result.ok &&
        result.error.code === 'INVALID_ARGUMENT' &&
        result.error.details?.argument === argument,
      `${argument}=${String(value)} did not return INVALID_ARGUMENT`,
    )
    const active = byName('get_pending_change_set').execute({}).data.activeChangeSet
    assert(
      active.version === 0 && active.operationCount === 0,
      `${argument}=${String(value)} consumed a change set version`,
    )
  }

  for (const staleInput of [
    { ...baseInput, expectedRevision: begin.data.baseRevision + 1 },
    { ...baseInput, expectedChangeSetVersion: 1 },
  ]) {
    const result = byName('update_component_spec').execute(staleInput)
    assert(
      !result.ok &&
        result.error.code === 'REVISION_CONFLICT' &&
        result.error.details.actualRevision === begin.data.baseRevision &&
        result.error.details.actualChangeSetVersion === 0,
      'a valid but stale revision/version did not return a retryable conflict',
    )
  }

  const corrected = byName('update_component_spec').execute(baseInput)
  assert(
    corrected.ok && corrected.data.changeSetVersion === 1,
    'corrected arguments could not retry without restarting the change set',
  )
  const staleRetry = byName('update_component_spec').execute({
    ...baseInput,
    patch: { common: { description: 'Stale retry' } },
  })
  assert(
    !staleRetry.ok &&
      staleRetry.error.code === 'REVISION_CONFLICT' &&
      staleRetry.error.details.actualChangeSetVersion === 1,
    'stale retry did not return the current change set version',
  )
  const refreshedRetry = byName('update_component_spec').execute({
    ...baseInput,
    expectedChangeSetVersion: staleRetry.error.details.actualChangeSetVersion,
    patch: { common: { description: 'Refreshed retry' } },
  })
  assert(
    refreshedRetry.ok && refreshedRetry.data.changeSetVersion === 2,
    'refreshing after REVISION_CONFLICT did not allow retry',
  )
})

await test('Inspector select controls use unique IDs and visible accessible labels', async () => {
  memoryStorage.clear()
  const { renderInspector } = await import(
    moduleUrl(renderInspectorBundle, 'inspector-select-labels')
  )
  const { translate } = await import(moduleUrl(messagesBundle, 'inspector-select-labels'))
  const cases = [
    { componentId: 'comp-list-summary', labels: ['inspector.textStyle'] },
    { componentId: 'comp-task-name-input', labels: ['inspector.inputType'] },
    { componentId: 'comp-task-status-select', labels: ['inspector.defaultValue'] },
    { componentId: 'comp-save-btn', labels: ['inspector.variant'] },
    {
      componentId: 'comp-list-page',
      labels: ['inspector.layout', 'inspector.gap', 'inspector.justify', 'inspector.alignment'],
    },
    {
      componentId: 'comp-task-list',
      labels: ['inspector.layout', 'inspector.gap', 'inspector.justify', 'inspector.alignment'],
    },
    {
      componentId: 'comp-launch-task-card',
      labels: [
        'collection.itemDefinition',
        'collection.apiSource',
        'collection.fallbackVariant',
      ],
    },
    {
      componentId: 'comp-discard-modal',
      labels: ['inspector.layout', 'inspector.gap', 'inspector.justify', 'inspector.alignment'],
    },
  ]

  for (const locale of ['en', 'ja']) {
    for (const testCase of cases) {
      const html = renderInspector(testCase.componentId, locale)
      const { document } = parseHTML(html)
      const selects = [...document.querySelectorAll('select')]
      const selectIds = selects.map(select => select.getAttribute('id'))
      assert(selectIds.every(Boolean), `${locale} ${testCase.componentId} select is missing an ID`)
      assert(
        new Set(selectIds).size === selectIds.length,
        `${locale} ${testCase.componentId} select IDs are not unique`,
      )

      const visibleLabels = selects.map(select => {
        const id = select.getAttribute('id')
        const label = [...document.querySelectorAll('label')]
          .find(candidate => candidate.getAttribute('for') === id)
        assert(label, `${locale} ${testCase.componentId} select is not connected to a label`)
        const text = label.textContent.trim()
        assert(text.length > 0, `${locale} ${testCase.componentId} select label is empty`)
        return text
      })

      for (const labelKey of testCase.labels) {
        const expected = translate(locale, labelKey)
        assert(
          visibleLabels.includes(expected),
          `${locale} ${testCase.componentId} select has no accessible label "${expected}" ` +
            `(found: ${visibleLabels.join(', ')})`,
        )
      }

      const overrideHtml = renderInspector(
        'comp-task-status-select',
        locale,
        1,
        'scenario-edit-success',
      )
      const { document: overrideDocument } = parseHTML(overrideHtml)
      const overrideSelects = [...overrideDocument.querySelectorAll('select')]
      const overrideLabels = overrideSelects.map(select => {
        const id = select.getAttribute('id')
        const label = [...overrideDocument.querySelectorAll('label')]
          .find(candidate => candidate.getAttribute('for') === id)
        assert(label, `${locale} state override select is not connected to a label`)
        return label.textContent.trim()
      })
      for (const labelKey of ['inspector.visible', 'inspector.enabled', 'overrides.value']) {
        const expected = translate(locale, labelKey)
        assert(
          overrideLabels.includes(expected),
          `${locale} state override select has no accessible label "${expected}"`,
        )
      }
    }
  }

  const multipleHtml = renderInspector('comp-launch-task-card', 'en', 2)
  const { document: multipleDocument } = parseHTML(multipleHtml)
  const allControlIds = [...multipleDocument.querySelectorAll('select, input, textarea')]
    .map(control => control.getAttribute('id'))
    .filter(Boolean)
  assert(
    new Set(allControlIds).size === allControlIds.length,
    'multiple Inspector instances produced duplicate control IDs',
  )
})

await test('editor landmarks, active states, and canvas roots expose correct semantics', async () => {
  const { renderApp } = await import(moduleUrl(renderAppBundle, 'editor-semantics'))
  for (const [locale, expected] of [
    ['en', {
      leftPane: 'Project navigation',
      rightPane: 'Details',
      rightTabs: 'Details view',
      defaultManage: 'Edit Default',
    }],
    ['ja', {
      leftPane: 'プロジェクトナビゲーション',
      rightPane: '詳細',
      rightTabs: '詳細表示',
      defaultManage: 'デフォルトを編集',
    }],
  ]) {
    const rendered = renderApp(locale)
    const { document } = parseHTML(`<html><body>${rendered}</body></html>`)
    const leftPane = document.querySelector(`aside[aria-label="${expected.leftPane}"]`)
    const rightPane = document.querySelector(`aside[aria-label="${expected.rightPane}"]`)
    const rightTabs = rightPane?.querySelector(
      `[role="group"][aria-label="${expected.rightTabs}"]`,
    )
    const tabStates = [...(rightTabs?.querySelectorAll('button') ?? [])]
      .map(button => button.getAttribute('aria-pressed'))
    assert(leftPane && rightPane, `${locale} editor panes have no accessible names`)
    assert(
      JSON.stringify(tabStates) === JSON.stringify(['true', 'false']),
      `${locale} right pane does not expose its active view (${JSON.stringify(tabStates)})`,
    )
    assert(
      leftPane.querySelectorAll('button[aria-current="page"]').length === 1,
      `${locale} Screen list does not expose exactly one active page`,
    )
    const stateActions = document.querySelector('[data-state-actions]')
    assert(
      stateActions?.querySelectorAll('button').length === 2 &&
        stateActions.querySelector('[data-state-manage]')?.hasAttribute('disabled') &&
        stateActions.querySelector('[data-state-add]')?.hasAttribute('disabled') &&
        stateActions.querySelector('[data-state-manage]')?.getAttribute('aria-label') ===
          expected.defaultManage,
      `${locale} default state does not reserve operable manage and add action slots`,
    )
    for (const rootId of ['comp-edit-page', 'comp-discard-modal']) {
      assert(
        document.querySelector(`[data-component-id="${rootId}"]`)?.getAttribute('tabindex') === '-1',
        `${locale} ${rootId} remains a dead stop in the sequential tab order`,
      )
    }
    assert(
      document.querySelector('[data-component-id="comp-task-name-input"]')?.getAttribute('tabindex') === '-1' &&
        !document.querySelector('[data-component-id="comp-task-name-input"]')?.hasAttribute('role'),
      `${locale} review-mode canvas component remains a dead keyboard stop`,
    )
  }
})

await test('mounted default state keeps fixed metadata and stable toolbar actions', async () => {
  memoryStorage.clear()
  installStorage(memoryStorage)
  const document = installInteractiveDom()
  const { mountReviewLockApp } = await import(
    moduleUrl(renderAppBundle, 'default-state-description')
  )
  const harness = mountReviewLockApp('en')
  const baseTab = document.querySelector('[data-state-id="base"]')
  assert(baseTab, 'base state tab did not render')
  harness.click(baseTab)
  const actions = document.querySelector('[data-state-actions]')
  const manage = actions?.querySelector('[data-state-manage]')
  assert(
    actions?.querySelectorAll('button').length === 2 &&
      manage?.getAttribute('aria-label') === 'Edit Default' &&
      manage?.hasAttribute('disabled') &&
      baseTab.getAttribute('aria-pressed') === 'true',
    'default state did not remain fixed while keeping the stable two-action toolbar',
  )
  harness.click(manage)
  assert(
    !document.querySelector('[data-state-dialog]'),
    'fixed default state opened a metadata editor',
  )
  harness.unmount()
})

await test('Japanese state override guidance uses localized product terms', async () => {
  const { translate } = await import(moduleUrl(messagesBundle, 'localized-override-terms'))
  for (const key of [
    'inspector.baseSettingsDescription',
    'overrides.noState',
    'overrides.defaultStateExplanation',
    'overrides.noStateExplanation',
    'overrides.inheritExplanation',
    'overrides.activeExplanation',
    'overrides.overridden',
    'overrides.resetAll',
  ]) {
    const message = translate('ja', key)
    assert(
      !/\b(state|field|override|default)\b/i.test(message),
      `${key} still mixes English state override terminology into Japanese: ${message}`,
    )
  }
})

await test('delete confirmation enforces dialog focus and stale-impact behavior', async () => {
  memoryStorage.clear()
  memoryStorage.setItem('screen-blueprint-studio:locale:v1', 'en')
  let document = installInteractiveDom()
  const { mountDeleteDialog } = await import(
    moduleUrl(mountDeleteDialogBundle, 'delete-dialog-behavior')
  )

  let harness = mountDeleteDialog()
  harness.open()
  let dialog = document.querySelector('[role="dialog"]')
  const impactItems = [...dialog.querySelectorAll('ul li')]
    .map(item => item.textContent.trim())
  assert(
    dialog?.getAttribute('aria-modal') === 'true' &&
      document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent.trim() ===
        'Confirm deletion' &&
      document.getElementById(dialog.getAttribute('aria-describedby'))?.textContent.includes(
        'Delete',
      ) &&
      JSON.stringify(impactItems) === JSON.stringify([
        'Components removed: 2',
        'Events removed: 1',
        'Event actions removed: 2',
        'API field bindings removed: 1',
        'State overrides removed: 2',
      ]),
    'delete dialog has no accessible name, description, or impact details: ' +
      JSON.stringify(impactItems),
  )
  let cancel = [...dialog.querySelectorAll('button')]
    .find(button => button.textContent.trim() === 'Cancel')
  let deleteButton = [...dialog.querySelectorAll('button')]
    .find(button => button.textContent.trim() === 'Delete')
  assert(
    document.activeElement === cancel && !cancel.disabled && !deleteButton.disabled,
    'delete dialog did not focus its safe default action',
  )
  deleteButton.focus()
  harness.keyDown(deleteButton, 'Tab')
  assert(document.activeElement === cancel, 'Tab escaped past the last delete dialog control')
  harness.keyDown(cancel, 'Tab', true)
  assert(document.activeElement === deleteButton, 'Shift+Tab escaped before the first control')
  harness.keyDown(deleteButton, 'Escape')
  assert(
    !document.querySelector('[role="dialog"]') &&
      !harness.state().pending &&
      harness.state().targetExists &&
      document.activeElement?.hasAttribute('data-delete-opener'),
    'Escape did not cancel deletion and restore opener focus',
  )
  harness.unmount()

  document = installInteractiveDom()
  harness = mountDeleteDialog()
  harness.open()
  dialog = document.querySelector('[role="dialog"]')
  deleteButton = [...dialog.querySelectorAll('button')]
    .find(button => button.textContent.trim() === 'Delete')
  harness.changeDocument()
  deleteButton.focus()
  harness.click(deleteButton)
  const reviewButton = [...dialog.querySelectorAll('button')]
    .find(button => button.textContent.trim() === 'I reviewed the updated impact')
  cancel = [...dialog.querySelectorAll('button')]
    .find(button => button.textContent.trim() === 'Cancel')
  assert(
    reviewButton &&
      deleteButton.disabled &&
      document.activeElement === cancel &&
      dialog.querySelector('[role="alert"]'),
    'stale delete impact did not require review or return focus to Cancel ' +
      `(review: ${Boolean(reviewButton)}, disabled: ${deleteButton.disabled}, ` +
      `focus: ${document.activeElement?.textContent?.trim()}, ` +
      `alert: ${Boolean(dialog.querySelector('[role="alert"]'))})`,
  )
  harness.click(reviewButton)
  assert(!deleteButton.disabled && document.activeElement === cancel, 'impact review did not re-enable delete safely')
  harness.click(deleteButton)
  assert(
    !harness.state().pending &&
      !harness.state().targetExists &&
      harness.state().historyLength === 2 &&
      harness.state().hasUndoAction &&
      document.activeElement?.hasAttribute('data-delete-opener'),
    'reviewed deletion did not close, restore focus, or create one actionable delete history entry',
  )
  harness.unmount()

  document = installInteractiveDom()
  harness = mountDeleteDialog()
  harness.open()
  dialog = document.querySelector('[role="dialog"]')
  deleteButton = [...dialog.querySelectorAll('button')]
    .find(button => button.textContent.trim() === 'Delete')
  harness.beginReview()
  assert(
    deleteButton.disabled &&
      dialog.querySelector('[role="status"]') &&
      harness.state().pending &&
      harness.state().targetExists,
    'review lock left pending deletion executable or hid its reason',
  )
  harness.click(deleteButton)
  assert(
    harness.state().pending && harness.state().targetExists,
    'disabled pending delete mutated the document during review',
  )
  harness.removeOpener()
  harness.keyDown(dialog, 'Escape')
  assert(
    !harness.state().pending &&
      document.activeElement?.hasAttribute('data-delete-focus-fallback'),
    'delete dialog did not use its focus fallback when the opener disappeared',
  )
  harness.rejectReview()
  harness.unmount()
})

await test('review lock disables every dialog draft control without discarding it', async () => {
  memoryStorage.clear()
  function installDialogDom() {
    return installInteractiveDom()
  }

  let document = installDialogDom()
  const { mountLockedDialog } = await import(
    moduleUrl(mountLockedDialogBundle, 'locked-dialog-controls')
  )
  const controlValue = control => (
    control.tagName === 'TEXTAREA' && control.value === ''
      ? control.textContent
      : control.value
  )
  for (const kind of ['event', 'api', 'validation', 'state']) {
    document = installDialogDom()
    const harness = mountLockedDialog(kind)
    const dialog = document.querySelector('[role="dialog"]')
    assert(dialog, `${kind} dialog did not mount`)
    const fieldset = dialog.querySelector('fieldset')
    assert(fieldset && !fieldset.hasAttribute('disabled'), `${kind} draft began disabled`)
    const draftControls = [...dialog.querySelectorAll('input, select, textarea')]
    assert(draftControls.length > 0, `${kind} dialog has no draft controls`)
    assert(
      draftControls.every(control => fieldset.contains(control)),
      `${kind} dialog left a draft control outside its lock fieldset`,
    )
    if (kind === 'validation') {
      const invalidControls = [...dialog.querySelectorAll('[aria-invalid="true"]')]
      assert(invalidControls.length >= 4, 'validation fixture did not expose every error field')
      assert(
        invalidControls.every(control => {
          const errorId = control.getAttribute('aria-errormessage')
          return control.id && errorId && document.getElementById(errorId)?.getAttribute('role') === 'alert'
        }),
        'validation errors are not programmatically associated with their invalid controls',
      )
      assert(
        new Set(invalidControls.map(control => control.id)).size === invalidControls.length,
        'validation error controls have duplicate IDs',
      )
    }
    if (kind === 'state') {
      assert(
        document.activeElement === draftControls[0],
        'State dialog did not move focus to its first draft field',
      )
      const focusable = [...dialog.querySelectorAll('button, input, select, textarea')]
        .filter(control => !control.disabled && control.getAttribute('tabindex') !== '-1')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      last.focus()
      harness.keyDown(last, 'Tab')
      assert(document.activeElement === first, 'Tab escaped past the last State dialog control')
      harness.keyDown(first, 'Tab', true)
      assert(document.activeElement === last, 'Shift+Tab escaped before the first State dialog control')
    }
    const draftSnapshot = draftControls.map(controlValue)
    const rowCount = dialog.querySelectorAll(
      '[data-event-action], [data-api-binding], [data-validation-rule]',
    ).length

    draftControls[0].focus()
    assert(document.activeElement === draftControls[0], `${kind} draft control could not receive focus`)
    harness.startReview()
    assert(fieldset.hasAttribute('disabled'), `${kind} fieldset stayed editable during review`)
    const noticeId = fieldset.getAttribute('aria-describedby')
    assert(noticeId && document.getElementById(noticeId), `${kind} lock reason is not described`)
    assert(
      draftControls.every((control, index) => (
        draftSnapshot[index] === '' || controlValue(control) === draftSnapshot[index]
      )),
      `${kind} review lock discarded a local draft ` +
        `(before: ${JSON.stringify(draftSnapshot)}, after: ${JSON.stringify(
          draftControls.map(controlValue),
        )})`,
    )
    const localMutationButton = fieldset.querySelector('button')
    if (localMutationButton) harness.click(localMutationButton)
    assert(
      dialog.querySelectorAll(
        '[data-event-action], [data-api-binding], [data-validation-rule]',
      ).length === rowCount,
      `${kind} fieldset allowed add, reorder, or remove while locked`,
    )

    const reviewActions = dialog.querySelector('[data-dialog-review-actions]')
    assert(reviewActions, `${kind} dialog hid Accept and Reject while locked`)
    assert(
      reviewActions.contains(document.activeElement),
      `${kind} dialog lost focus when its draft became disabled ` +
        `(active: ${document.activeElement?.tagName ?? 'none'} ` +
        `${document.activeElement?.textContent?.trim() ?? ''})`,
    )
    const reviewButtons = [...reviewActions.querySelectorAll('button')]
    assert(
      reviewButtons.length === 2 && reviewButtons.every(button => !button.disabled),
      `${kind} dialog disabled its review actions`,
    )
    const cancel = [...dialog.querySelectorAll('button')]
      .find(button => button.textContent.trim() === 'Cancel')
    assert(cancel && !cancel.disabled, `${kind} dialog disabled Cancel`)
    const submit = dialog.querySelector('button[type="submit"]')
    assert(submit?.disabled, `${kind} dialog left Save enabled`)

    harness.click(reviewButtons[0])
    assert(!fieldset.hasAttribute('disabled'), `${kind} draft did not unlock after Reject`)
    harness.click(cancel)
    assert(harness.getCloseCount() === 1, `${kind} Cancel stopped working after Reject`)
    if (kind === 'state') {
      await Promise.resolve()
      assert(
        document.activeElement === harness.getOpener(),
        'State dialog did not restore focus to its opener',
      )
    }
    harness.unmount()
  }

  document = installDialogDom()
  const acceptedHarness = mountLockedDialog('event')
  const acceptedDialog = document.querySelector('[role="dialog"]')
  const acceptedFieldset = acceptedDialog.querySelector('fieldset')
  const acceptedDraft = acceptedDialog.querySelector('input').value
  acceptedHarness.startReview(true)
  const acceptButton = [...acceptedDialog.querySelectorAll('[data-dialog-review-actions] button')]
    .find(button => button.textContent.trim() === 'Accept')
  assert(acceptButton, 'locked Event dialog did not expose Accept')
  acceptedHarness.click(acceptButton)
  assert(
    acceptedFieldset.hasAttribute('disabled') &&
      acceptedDialog.querySelector('[role="alert"]') &&
      acceptedDialog.querySelector('input').value === acceptedDraft,
    'Accept did not preserve and stale-lock the open Event draft',
  )
  acceptedHarness.unmount()

  document = installDialogDom()
  const externalFocusHarness = mountLockedDialog('state')
  const externalFocusDialog = document.querySelector('[role="dialog"]')
  const externalDraft = externalFocusDialog.querySelector('input')
  const closeButton = externalFocusDialog.querySelector('[aria-label="Close"]')
  externalDraft.focus()
  closeButton.focus()
  externalFocusHarness.startReview()
  assert(
    document.activeElement === closeButton,
    'review lock stole focus that had already left the dialog draft',
  )
  externalFocusHarness.unmount()

  document = installDialogDom()
  const lockedCloseHarness = mountLockedDialog('state')
  const lockedCloseDialog = document.querySelector('[role="dialog"]')
  lockedCloseHarness.startReview()
  const lockedCancel = [...lockedCloseDialog.querySelectorAll('button')]
    .find(button => button.textContent.trim() === 'Cancel')
  lockedCloseHarness.click(lockedCancel)
  await Promise.resolve()
  assert(
    document.activeElement?.hasAttribute('data-delete-focus-fallback'),
    'State dialog did not use its focus fallback when review lock disabled the opener',
  )
  lockedCloseHarness.unmount()
})

console.log(`\n${passed} regression groups passed`)
rmSync(temp, { recursive: true, force: true })
