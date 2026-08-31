import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseHTML } from 'linkedom'

const root = resolve(import.meta.dirname, '..')
const temp = mkdtempSync(join(tmpdir(), 'screen-spec-regression-'))
const storageKey = 'screen-blueprint-studio:v1'
const rejectedKey = 'screen-blueprint-studio:rejected:v1'

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
const rightPaneWidthBundle = join(temp, 'rightPaneWidth.mjs')
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
const renderInspectorBundle = join(temp, 'renderInspector.mjs')
const renderAppBundle = join(temp, 'renderApp.mjs')
const mountLockedDialogBundle = join(temp, 'mountLockedDialog.mjs')
const mountDeleteDialogBundle = join(temp, 'mountDeleteDialog.mjs')
const migratePersistedDataBundle = join(temp, 'migratePersistedData.mjs')
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
bundle('src/app/rightPaneWidth.ts', rightPaneWidthBundle)
bundle('src/components/textDraft.ts', textDraftBundle)
bundle('src/domain/componentBehavior.ts', componentBehaviorBundle)
bundle('src/features/canvas/canvasViewportMath.ts', canvasViewportMathBundle)
bundle('src/features/component-add-menu/componentAddMenuModel.ts', componentAddMenuModelBundle)
bundle('src/domain/stateOverrides.ts', stateOverridesBundle)
bundle('src/domain/changeSetPresentation.ts', changeSetPresentationBundle)
bundle('src/domain/changeSetComponentChanges.ts', changeSetComponentChangesBundle)
bundle('src/features/structure-tree/structureTreeKeyboard.ts', structureTreeKeyboardBundle)
bundle('src/domain/deleteImpact.ts', deleteImpactBundle)
bundle('src/sample/sampleProject.ts', sampleProjectBundle)
bundle('src/domain/componentDuplication.ts', componentDuplicationBundle)
bundle('src/domain/model.ts', modelBundle)
bundle('src/domain/runtimeValidation.ts', runtimeValidationBundle)
bundle('src/domain/invariants.ts', invariantsBundle)
bundle('src/domain/componentPlacement.ts', componentPlacementBundle)
bundle('src/features/canvas/componentPreview.ts', componentPreviewBundle)
bundle('src/features/inspector/inspectorSections.ts', inspectorSectionsBundle)
bundle('src/domain/screenFlow.ts', screenFlowBundle)
bundle('src/persistence/migratePersistedData.ts', migratePersistedDataBundle)
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

await test('schema v1 sections migrate to containers across persisted change set data', async () => {
  memoryStorage.clear()
  const baselineStore = await freshStore('section-migration-baseline')
  const legacyDocument = clone(baselineStore.getState().document)
  legacyDocument.schemaVersion = 1
  for (const componentId of ['comp-list-section', 'comp-edit-section']) {
    legacyDocument.components[componentId].kind = 'section'
    legacyDocument.components[componentId].config.kind = 'section'
  }

  const legacyBaseDocument = clone(legacyDocument)
  const operations = [
    {
      id: 'legacy-add-operation',
      source: 'agent',
      command: {
        type: 'addComponent',
        componentId: 'legacy-section-added',
        screenId: 'screen-edit',
        parentId: 'comp-edit-section',
        kind: 'section',
        config: {
          kind: 'section',
          layout: 'vertical',
          gap: 'md',
          columns: 2,
          justify: 'start',
          align: 'stretch',
          wrap: false,
        },
      },
      issuedAt: new Date().toISOString(),
    },
    {
      id: 'legacy-paste-operation',
      source: 'agent',
      command: {
        type: 'pasteComponent',
        snapshot: {
          projectId: legacyDocument.project.id,
          sourceScreenId: 'screen-edit',
          rootComponentId: 'legacy-snapshot-section',
          components: {
            'legacy-snapshot-section': {
              id: 'legacy-snapshot-section',
              screenId: 'screen-edit',
              parentId: null,
              childIds: [],
              kind: 'section',
              common: { description: 'Snapshot group', visible: true, enabled: true },
              config: {
                kind: 'section',
                layout: 'vertical',
                gap: 'sm',
                columns: 1,
                justify: 'start',
                align: 'stretch',
                wrap: false,
              },
            },
          },
          stateOverrides: {},
        },
        destinationComponentId: 'legacy-pasted-container',
        destinationScreenId: 'screen-edit',
        destinationParentId: 'comp-edit-section',
        position: 0,
        componentIdMap: {
          'legacy-snapshot-section': 'legacy-pasted-container',
        },
      },
      issuedAt: new Date().toISOString(),
    },
    {
      id: 'legacy-update-operation',
      source: 'agent',
      command: {
        type: 'updateComponentSpec',
        componentId: 'comp-edit-section',
        patch: { config: { kind: 'section' } },
      },
      issuedAt: new Date().toISOString(),
    },
  ]
  const legacyPayload = {
    document: legacyDocument,
    activeScreenId: 'screen-edit',
    activeChangeSet: {
      id: 'legacy-section-change-set',
      summary: 'Migrate structural grouping',
      baseRevision: legacyDocument.revision,
      version: operations.length,
      baseDocument: legacyBaseDocument,
      operations,
      createdAt: new Date().toISOString(),
    },
  }

  const { migratePersistedData } = await import(
    moduleUrl(migratePersistedDataBundle, 'section-migration-direct')
  )
  const migration = migratePersistedData(legacyPayload)
  assert(migration.migrated, 'schema v1 payload was not marked as migrated')
  const migrated = migration.value
  assert(
    migrated.document.schemaVersion === 2 &&
      migrated.document.revision === legacyDocument.revision &&
      migrated.document.components['comp-list-section'].kind === 'container' &&
      migrated.document.components['comp-edit-section'].config.kind === 'container',
    'confirmed document identity, revision, or Section conversion was not preserved',
  )
  assert(
    migrated.activeChangeSet.baseDocument.schemaVersion === 2 &&
      migrated.activeChangeSet.baseDocument.components['comp-edit-section'].kind === 'container',
    'active change set base document was not migrated',
  )
  assert(
    migrated.activeChangeSet.operations[0].command.kind === 'container' &&
      migrated.activeChangeSet.operations[0].command.config.kind === 'container' &&
      migrated.activeChangeSet.operations[1].command.snapshot.components[
        'legacy-snapshot-section'
      ].config.kind === 'container' &&
      migrated.activeChangeSet.operations[2].command.patch.config.kind === 'container',
    'embedded add, paste, or update component data was not migrated',
  )
  assert(
    legacyPayload.document.schemaVersion === 1 &&
      legacyPayload.document.components['comp-edit-section'].kind === 'section',
    'migration mutated the parsed legacy payload',
  )

  const replayPayload = clone(legacyPayload)
  replayPayload.activeChangeSet.operations = [clone(operations[0])]
  replayPayload.activeChangeSet.version = 1
  memoryStorage.setItem(storageKey, JSON.stringify(replayPayload))
  const migratedStore = await freshStore('section-migration-replay')
  const state = migratedStore.getState()
  assert(
    state.recoveryState === null &&
      state.document.schemaVersion === 2 &&
      state.document.components['comp-edit-section'].kind === 'container' &&
      state.effectiveDocument.components['legacy-section-added'].kind === 'container',
    'valid migrated change set did not reload and replay as containers',
  )
  const persisted = JSON.parse(memoryStorage.getItem(storageKey))
  assert(
    persisted.document.schemaVersion === 2 &&
      persisted.activeChangeSet.baseDocument.schemaVersion === 2 &&
      persisted.activeChangeSet.operations[0].command.kind === 'container',
    'successful migration was not persisted as current schema data',
  )

  const dangerousLegacy = clone(legacyDocument)
  dangerousLegacy.components = JSON.parse(JSON.stringify(dangerousLegacy.components))
  Object.defineProperty(dangerousLegacy.components, '__proto__', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {
      ...dangerousLegacy.components['comp-list-title'],
      id: '__proto__',
    },
  })
  memoryStorage.setItem(storageKey, JSON.stringify({ document: dangerousLegacy }))
  const dangerousStore = await freshStore('section-migration-dangerous-id')
  assert(
    dangerousStore.getState().recoveryState !== null &&
      ({}).polluted === undefined &&
      ({}).name === undefined,
    'legacy prototype-like IDs bypassed recovery or polluted the prototype',
  )
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
        baseRevision: confirmed.revision,
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
    assert(state.document.revision === confirmed.revision, `${testCase.name} changed revision`)
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
  poisoned.components['comp-list-title'].name = { poison: true }
  const raw = JSON.stringify({ document: poisoned })
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
  const activeChangeSet = {
    id: 'legacy-mixed-change-set',
    summary: 'Legacy mixed review',
    baseRevision: document.revision,
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
  const raw = JSON.stringify({ document, activeChangeSet })
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
  const common = {
    id: 'change-set',
    summary: 'Broken',
    baseRevision: document.revision,
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
    localStorage.setItem(storageKey, JSON.stringify({ document, activeChangeSet }))
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
    localStorage.setItem(storageKey, JSON.stringify({ document, activeChangeSet }))
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
  const poisonedDocuments = []

  const objectText = clone(baseline)
  objectText.components['comp-list-title'].config.text = { evil: 1 }
  poisonedDocuments.push(objectText)

  const invalidTextStyle = clone(baseline)
  invalidTextStyle.components['comp-list-title'].config.style = 'display'
  poisonedDocuments.push(invalidTextStyle)

  const missingTextStyle = clone(baseline)
  delete missingTextStyle.components['comp-list-title'].config.style
  poisonedDocuments.push(missingTextStyle)

  const foreignConfigKey = clone(baseline)
  foreignConfigKey.components['comp-list-title'].config.evil = true
  poisonedDocuments.push(foreignConfigKey)

  const invalidOverride = clone(baseline)
  invalidOverride.screenStates['state-list-loading'].componentOverrides['comp-list-title'] = {
    value: 'not valid for text',
  }
  poisonedDocuments.push(invalidOverride)

  const defaultOverride = clone(baseline)
  defaultOverride.screenStates['state-list-default'].componentOverrides['comp-list-title'] = {
    text: 'not allowed',
  }
  poisonedDocuments.push(defaultOverride)

  const invalidCommonType = clone(baseline)
  invalidCommonType.components['comp-list-title'].common.visible = 'yes'
  poisonedDocuments.push(invalidCommonType)

  const foreignCommonKey = clone(baseline)
  foreignCommonKey.components['comp-list-title'].common.evil = true
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
    localStorage.setItem(storageKey, JSON.stringify({ document }))
    const store = await freshStore(`poisoned-${index}`)
    assert(store.getState().recoveryState !== null, `poisoned document ${index} did not enter recovery`)
  }
})

await test('invalid schema, revision, and entity metadata enter recovery state', async () => {
  memoryStorage.clear()
  const baselineStore = await freshStore('metadata-poison-baseline')
  const baseline = clone(baselineStore.getState().document)
  const poisonedDocuments = []
  const revisions = ['1', null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]
  for (const revision of revisions) {
    const document = clone(baseline)
    document.revision = revision
    poisonedDocuments.push(document)
  }
  const missingRevision = clone(baseline)
  delete missingRevision.revision
  poisonedDocuments.push(missingRevision)

  for (const schemaVersion of ['1', null, 3]) {
    const document = clone(baseline)
    document.schemaVersion = schemaVersion
    poisonedDocuments.push(document)
  }
  const missingSchema = clone(baseline)
  delete missingSchema.schemaVersion
  poisonedDocuments.push(missingSchema)

  const projectName = clone(baseline)
  projectName.project.name = { invalid: true }
  poisonedDocuments.push(projectName)
  const projectUnknown = clone(baseline)
  projectUnknown.project.unknown = true
  poisonedDocuments.push(projectUnknown)
  const duplicateScreens = clone(baseline)
  duplicateScreens.project.screenIds.push('screen-list')
  poisonedDocuments.push(duplicateScreens)
  const screenName = clone(baseline)
  screenName.screens['screen-list'].name = { invalid: true }
  poisonedDocuments.push(screenName)
  const duplicateStates = clone(baseline)
  duplicateStates.screens['screen-list'].stateIds.push('state-list-default')
  poisonedDocuments.push(duplicateStates)
  const screenKeyMismatch = clone(baseline)
  screenKeyMismatch.screens['screen-list'].id = 'different-screen-id'
  poisonedDocuments.push(screenKeyMismatch)
  const componentName = clone(baseline)
  componentName.components['comp-list-title'].name = { invalid: true }
  poisonedDocuments.push(componentName)
  const componentKeyMismatch = clone(baseline)
  componentKeyMismatch.components['comp-list-title'].id = 'different-component-id'
  poisonedDocuments.push(componentKeyMismatch)
  const stateDescription = clone(baseline)
  stateDescription.screenStates['state-list-loading'].description = { invalid: true }
  poisonedDocuments.push(stateDescription)
  const legacyStateKind = clone(baseline)
  legacyStateKind.screenStates['state-list-loading'].kind = 'loading'
  poisonedDocuments.push(legacyStateKind)
  const legacyStructuralTitle = clone(baseline)
  legacyStructuralTitle.components['comp-list-section'].config.title = 'Legacy section title'
  poisonedDocuments.push(legacyStructuralTitle)
  const dangerousMapKey = clone(baseline)
  Object.defineProperty(dangerousMapKey.components, '__proto__', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {
      ...dangerousMapKey.components['comp-list-title'],
      id: '__proto__',
    },
  })
  poisonedDocuments.push(dangerousMapKey)

  for (const [index, document] of poisonedDocuments.entries()) {
    memoryStorage.setItem(storageKey, JSON.stringify({ document }))
    const store = await freshStore(`metadata-poison-${index}`)
    assert(store.getState().recoveryState !== null, `metadata poison ${index} did not enter recovery`)
    assert(({}).name === undefined && ({}).polluted === undefined, `metadata poison ${index} polluted prototype`)
  }

  const maxRevisionDocument = clone(baseline)
  maxRevisionDocument.revision = Number.MAX_SAFE_INTEGER
  const { applyCommand } = await import(moduleUrl(domainBundle, 'max-revision-domain'))
  let rejected = false
  try {
    applyCommand(maxRevisionDocument, {
      type: 'updateScreen',
      screenId: 'screen-list',
      name: 'Unsafe next revision',
    })
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
    defaultStateId: `state-generated-${suffix}`,
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
    defaultStateId: 'state-generated-reused',
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
    parentId: 'comp-edit-section',
    kind: 'textInput',
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
      addCommand.config.validationRules[0].message = 'Mutated'
      addCommand.config.validationRules.push({
        id: 'rule-late',
        type: 'custom',
        description: 'Late rule',
        message: 'Late',
      })
    },
    'addComponent config',
  )

  const updateSpecCommand = {
    type: 'updateComponentSpec',
    componentId: 'comp-task-assignee-select',
    patch: {
      common: { description: 'Updated select' },
      config: {
        options: [
          { value: 'maya-chen', label: 'Maya Chen' },
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
    document => document.components['comp-task-assignee-select'],
    () => {
      updateSpecCommand.patch.common.description = 'Mutated'
      updateSpecCommand.patch.config.options[0].label = 'Mutated'
      updateSpecCommand.patch.config.options.push({ value: 'late', label: 'Late' })
    },
    'updateComponentSpec patch',
  )

  const createStateCommand = {
    type: 'createScreenState',
    stateId: 'state-isolated',
    screenId: 'screen-edit',
    name: 'Isolated',
    description: 'Command-owned state',
    overrides: {
      'comp-task-title-input': { enabled: false, value: 'Initial' },
    },
  }
  const createdState = applyCommandWithoutRevision(sampleProject, createStateCommand)
  stableFragment(
    createdState,
    document => document.screenStates['state-isolated'],
    () => {
      createStateCommand.overrides['comp-task-title-input'].value = 'Mutated'
      createStateCommand.overrides['comp-task-description-input'] = { visible: false }
    },
    'createScreenState overrides',
  )

  const updateStateCommand = {
    type: 'updateScreenState',
    stateId: 'state-edit-saving',
    overrides: {
      'comp-save-btn': { enabled: false },
      'comp-status-alert': { visible: true, message: 'Saving' },
    },
  }
  const updatedState = applyCommandWithoutRevision(sampleProject, updateStateCommand)
  stableFragment(
    updatedState,
    document => document.screenStates['state-edit-saving'].componentOverrides,
    () => {
      updateStateCommand.overrides['comp-status-alert'].message = 'Mutated'
      delete updateStateCommand.overrides['comp-save-btn']
    },
    'updateScreenState overrides',
  )

  const connectEventCommand = {
    type: 'connectEvent',
    eventId: 'event-isolated',
    screenId: 'screen-edit',
    name: 'Isolated event',
    trigger: { type: 'click', componentId: 'comp-cancel-btn' },
    actions: [
      { type: 'setState', stateId: 'state-edit-saving' },
      { type: 'navigate', destinationScreenId: 'screen-list' },
    ],
  }
  const connectedEvent = applyCommandWithoutRevision(sampleProject, connectEventCommand)
  stableFragment(
    connectedEvent,
    document => document.events['event-isolated'],
    () => {
      connectEventCommand.trigger.componentId = 'comp-save-btn'
      connectEventCommand.actions[0].stateId = 'state-edit-success'
      connectEventCommand.actions.push({ type: 'callApi', apiOperationId: 'api-update-task' })
    },
    'connectEvent trigger/actions',
  )

  const updateEventCommand = {
    type: 'updateEvent',
    eventId: 'event-save-task',
    name: 'Updated event',
    trigger: { type: 'submit', componentId: 'comp-edit-section' },
    actions: [
      { type: 'showAlert', componentId: 'comp-status-alert' },
      { type: 'callApi', apiOperationId: 'api-update-task' },
    ],
  }
  const updatedEvent = applyTransaction(sampleProject, [updateEventCommand])
  stableFragment(
    updatedEvent,
    document => document.events['event-save-task'],
    () => {
      updateEventCommand.trigger.componentId = 'comp-actions'
      updateEventCommand.actions[0].componentId = 'comp-task-title-input'
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
      { componentId: 'comp-task-title-input', targetPath: 'body.name' },
    ],
    successStateId: 'state-edit-success',
    errorStateId: 'state-edit-error',
  }
  const boundApi = applyCommandWithoutRevision(sampleProject, bindApiCommand)
  stableFragment(
    boundApi,
    document => document.apiOperations['api-isolated'],
    () => {
      bindApiCommand.requestBindings[0].targetPath = 'body.mutated'
      bindApiCommand.requestBindings.push({
        componentId: 'comp-task-description-input',
        targetPath: 'body.description',
      })
    },
    'bindApiOperation requestBindings',
  )

  const updateApiCommand = {
    type: 'updateApiOperation',
    operationId: 'api-update-task',
    name: 'Updated API',
    method: 'PATCH',
    path: '/api/tasks/{taskId}',
    requestBindings: [
      { componentId: 'comp-task-assignee-select', targetPath: 'body.assigneeId' },
    ],
    successStateId: 'state-edit-success',
    errorStateId: 'state-edit-error',
  }
  const updatedApi = applyCommandWithoutRevision(sampleProject, updateApiCommand)
  stableFragment(
    updatedApi,
    document => document.apiOperations['api-update-task'],
    () => {
      updateApiCommand.requestBindings[0].componentId = 'comp-task-title-input'
      updateApiCommand.requestBindings.length = 0
    },
    'updateApiOperation requestBindings',
  )

  const snapshot = createComponentSubtreeSnapshot(sampleProject, 'comp-edit-section')
  assert(snapshot, 'failed to create paste isolation snapshot')
  let generatedId = 0
  const pasteCommand = createPasteComponentCommand(
    sampleProject,
    snapshot,
    'comp-edit-page',
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
      states: document.screenStates,
    }),
    () => {
      pasteCommand.componentIdMap[pasteCommand.snapshot.rootComponentId] = 'mutated-id'
      pasteCommand.snapshot.components['comp-edit-section'].childIds.length = 0
      pasteCommand.snapshot.components['comp-task-title-input'].config.validationRules[0].message =
        'Mutated'
      pasteCommand.snapshot.components['comp-task-assignee-select'].config.options[0].label = 'Mutated'
      const stateOverrides = pasteCommand.snapshot.stateOverrides['state-edit-saving']
      if (stateOverrides?.['comp-save-btn']) {
        stateOverrides['comp-save-btn'].enabled = true
      }
    },
    'pasteComponent snapshot and ID map',
  )

  const duplicateCommand = {
    type: 'duplicateComponent',
    componentId: 'comp-task-assignee-select',
    componentIdMap: { 'comp-task-assignee-select': 'comp-isolated-duplicate' },
  }
  const duplicated = applyCommandWithoutRevision(sampleProject, duplicateCommand)
  stableFragment(
    duplicated,
    document => document.components['comp-isolated-duplicate'],
    () => {
      duplicateCommand.componentIdMap['comp-task-assignee-select'] = 'mutated-id'
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
    trigger: { type: 'click', componentId: 'comp-save-btn' },
    actions: [{ type: 'setState', stateId: 'state-edit-success' }],
  }
  reviewStore.getState().dispatchToChangeSet(review.id, reviewCommand)
  const operationBeforeMutation = JSON.stringify(
    reviewStore.getState().activeChangeSet.operations[0].command,
  )
  const effectiveBeforeMutation = JSON.stringify(
    reviewStore.getState().effectiveDocument.events['event-save-task'],
  )
  reviewCommand.trigger.componentId = 'comp-cancel-btn'
  reviewCommand.actions[0].stateId = 'state-edit-error'
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
    reviewStore.getState().document.events['event-save-task'].actions[0].stateId ===
      'state-edit-success',
    'Accept replayed a caller-mutated command payload',
  )

  const sparseOptions = []
  sparseOptions.length = 1
  let sparseRejected = false
  try {
    applyCommandWithoutRevision(sampleProject, {
      type: 'updateComponentSpec',
      componentId: 'comp-task-assignee-select',
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
      componentId: 'comp-list-title',
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
      parentId: 'comp-list-section',
      kind: 'text',
      config: { kind: 'unsupportedConfig' },
    },
    {
      type: 'updateEvent',
      eventId: 'event-save-task',
      name: 'Invalid action',
      trigger: { type: 'click', componentId: 'comp-save-btn' },
      actions: [{ type: 'unsupportedAction' }],
    },
    Object.assign([], {
      type: 'duplicateComponent',
      componentId: 'comp-task-assignee-select',
      componentIdMap: Object.assign([], {
        'comp-task-assignee-select': 'comp-array-map-copy',
      }),
    }),
    {
      type: 'updateScreenState',
      stateId: 'state-edit-saving',
      overrides: { 'comp-save-btn': null },
    },
  ]) {
    let domainError = false
    try {
      applyCommandWithoutRevision(sampleProject, invalidCommand)
    } catch (error) {
      domainError = error?.code === 'INVARIANT_VIOLATION'
    }
    assert(domainError, 'clone validation bypassed the DomainError contract')
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
    componentId: 'comp-task-title-input',
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
  const webCommandBeforeMutation = JSON.stringify(
    webTool('get_pending_change_set').execute({}).data.activeChangeSet.operations[0].command,
  )
  webInput.patch.config.validationRules[0].message = 'Mutated after WebMCP execute'
  webInput.patch.config.validationRules.push({
    id: 'web-late-rule',
    type: 'custom',
    description: 'Late',
    message: 'Late',
  })
  assert(
    JSON.stringify(
      webTool('get_pending_change_set').execute({}).data.activeChangeSet.operations[0].command,
    ) === webCommandBeforeMutation,
    'WebMCP retained a caller-owned nested argument in the change set',
  )
})

await test('UI references reconcile after preview, accept, initialization, and undo', async () => {
  memoryStorage.clear()
  const previewStore = await freshStore('ui-reconcile-preview')
  previewStore.getState().setActiveScreen('screen-edit')
  previewStore.getState().setActiveState('state-edit-saving')
  previewStore.getState().setSelectedComponent('comp-task-title-input')
  const changeSet = previewStore.getState().beginChangeSet('Remove active screen')
  for (const eventId of [
    'event-create-task',
    'event-edit-launch-task',
    'event-edit-docs-task',
  ]) {
    previewStore.getState().dispatchToChangeSet(changeSet.id, {
      type: 'removeEvent',
      eventId,
    })
  }
  previewStore.getState().dispatchToChangeSet(changeSet.id, {
    type: 'removeScreen',
    screenId: 'screen-edit',
  })
  let state = previewStore.getState()
  assert(state.ui.activeScreenId === 'screen-list', 'preview retained a removed active screen')
  assert(state.ui.activeStateId === 'state-list-default', 'preview retained an invalid active state')
  assert(state.ui.selectedComponentId === null, 'preview retained a removed component selection')
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
    defaultStateId: 'state-added-default',
    name: 'Added',
    route: '/added',
  })
  undoStore.getState().setActiveScreen('screen-added')
  undoStore.getState().undo()
  state = undoStore.getState()
  assert(state.ui.activeScreenId === 'screen-list', 'undo retained the removed added screen')
  assert(state.ui.activeStateId === 'state-list-default', 'undo retained the added screen state')
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
    componentId: 'comp-actions',
    componentIdMap: {
      'comp-actions': 'copy-actions',
      'comp-cancel-btn': 'copy-cancel',
      'comp-save-btn': 'copy-save',
    },
  })
  assert(
    duplicated.components['comp-edit-section'].childIds.join(',').includes(
      'comp-actions,copy-actions',
    ) &&
      duplicated.components['copy-actions'].parentId === 'comp-edit-section' &&
      duplicated.components['copy-actions'].childIds.join(',') === 'copy-cancel,copy-save' &&
      duplicated.components['copy-cancel'].parentId === 'copy-actions' &&
      duplicated.components['copy-save'].parentId === 'copy-actions',
    'duplicated subtree hierarchy or immediate-after insertion was incorrect',
  )
  assert(
    JSON.stringify(duplicated.components['copy-actions'].common) ===
      JSON.stringify(sampleProject.components['comp-actions'].common) &&
      duplicated.components['copy-save'].config.eventId === null &&
      sampleProject.components['comp-save-btn'].config.eventId === 'event-save-task',
    'duplicate did not preserve component config or clear the external event connection',
  )
  assert(
    duplicated.screenStates['state-edit-success'].componentOverrides['copy-actions']
      .visible === false &&
      duplicated.screenStates['state-edit-saving'].componentOverrides['copy-cancel']
        .enabled === false &&
      duplicated.screenStates['state-edit-saving'].componentOverrides['copy-save']
        .enabled === false,
    'subtree overrides were not cloned across all screen states',
  )
  assert(
    JSON.stringify(duplicated.events) === JSON.stringify(sampleProject.events) &&
      JSON.stringify(duplicated.apiOperations) === JSON.stringify(sampleProject.apiOperations) &&
      !duplicated.apiOperations['api-update-task'].requestBindings.some(
        binding => binding.componentId.startsWith('copy-'),
      ),
    'events or API request bindings were duplicated',
  )

  const inputCopy = applyCommandWithoutRevision(sampleProject, {
    type: 'duplicateComponent',
    componentId: 'comp-task-title-input',
    componentIdMap: { 'comp-task-title-input': 'copy-name-input' },
  })
  assert(
    inputCopy.components['copy-name-input'].config.fieldKey === 'title_copy' &&
      JSON.stringify(inputCopy.components['copy-name-input'].config.validationRules) ===
        JSON.stringify(sampleProject.components['comp-task-title-input'].config.validationRules),
    'duplicated input fieldKey was not made unique or validation config was lost',
  )

  for (const invalidCommand of [
    {
      type: 'duplicateComponent',
      componentId: 'comp-edit-page',
      componentIdMap: { 'comp-edit-page': 'copy-page' },
    },
    {
      type: 'duplicateComponent',
      componentId: 'comp-actions',
      componentIdMap: { 'comp-actions': 'copy-actions' },
    },
    {
      type: 'duplicateComponent',
      componentId: 'comp-edit-title',
      componentIdMap: { 'comp-edit-title': 'comp-list-title' },
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
  store.getState().setSelectedComponent('comp-list-grid')
  assert(
    store.getState().duplicateComponent('comp-list-grid', 'Duplicate component'),
    'store duplication failed',
  )
  const parent = store.getState().document.components['comp-list-section']
  const duplicatedRootId = parent.childIds[parent.childIds.indexOf('comp-list-grid') + 1]
  assert(
    duplicatedRootId &&
      duplicatedRootId !== 'comp-list-grid' &&
      store.getState().ui.selectedComponentId === duplicatedRootId &&
      store.getState().history.length === 1,
    'duplicated root was not inserted, selected, or committed as one history entry',
  )
  store.getState().undo()
  assert(
    store.getState().ui.selectedComponentId === 'comp-list-grid' &&
      !store.getState().document.components[duplicatedRootId],
    'duplicate Undo did not restore the source selection',
  )
  store.getState().redo()
  assert(
    store.getState().ui.selectedComponentId === duplicatedRootId &&
      store.getState().document.components[duplicatedRootId],
    'duplicate Redo did not restore the duplicated selection',
  )

  store.getState().resetToSample()
  store.getState().setActiveScreen('screen-edit')
  store.getState().setSelectedComponent('comp-actions')
  const duplicateReview = store.getState().beginChangeSet('Duplicate subtree')
  assert(
    !store.getState().duplicateComponent('comp-actions', 'Duplicate component') &&
      duplicateReview.operations.length === 0 &&
      store.getState().ui.selectedComponentId === 'comp-actions',
    'human duplicate was not blocked during review',
  )
  const { createDuplicateComponentCommand } = await import(
    moduleUrl(componentDuplicationBundle, 'duplicate-review-command')
  )
  let duplicateId = 0
  const duplicateCommand = createDuplicateComponentCommand(
    store.getState().effectiveDocument,
    'comp-actions',
    () => `review-duplicate-${duplicateId++}`,
  )
  assert(duplicateCommand, 'agent duplicate command could not be created')
  store.getState().dispatchToChangeSet(duplicateReview.id, duplicateCommand)
  const previewRootId = duplicateCommand.componentIdMap['comp-actions']
  store.getState().setSelectedComponent(previewRootId)
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
      store.getState().ui.selectedComponentId === previewRootId &&
      presentation.commandType === 'duplicateComponent' &&
      presentation.navigation.componentId === previewRootId &&
      presentation.impact.includes('3 components') &&
      [...markers.statuses.values()].filter(status => status === 'added').length === 3,
    `change set duplication was not a single reviewable operation with added subtree markers: ${JSON.stringify({
      commandType: operation?.command.type,
      operationCount: changeSet?.operations.length,
      previewRootId,
      selectedComponentId: store.getState().ui.selectedComponentId,
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
  reloaded.getState().setSelectedComponent(previewRootId)
  reloaded.getState().rejectChangeSet()
  assert(
    reloaded.getState().ui.selectedComponentId === 'comp-actions' &&
      !reloaded.getState().effectiveDocument.components[previewRootId],
    'reject did not restore the source selection',
  )

  store.getState().acceptChangeSet()
  assert(
    store.getState().document.components[previewRootId] &&
      store.getState().ui.selectedComponentId === previewRootId,
    'accept did not retain the duplicated subtree selection',
  )
  store.getState().undo()
  assert(
    store.getState().ui.selectedComponentId === 'comp-actions' &&
      !store.getState().document.components[previewRootId],
    'accepted duplicate Undo did not restore the source selection',
  )
  store.getState().redo()
  assert(
    store.getState().ui.selectedComponentId === previewRootId &&
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
  store.getState().setActiveScreen('screen-edit')
  store.getState().setSelectedComponent('comp-actions')
  const documentBeforeCopy = store.getState().document
  assert(store.getState().copyComponent('comp-actions'), 'component copy failed')
  const clipboard = store.getState().componentClipboard
  assert(
    store.getState().document === documentBeforeCopy &&
      store.getState().history.length === 0 &&
      clipboard?.rootComponentId === 'comp-actions' &&
      Object.keys(clipboard.components).length === 3 &&
      Object.values(clipboard.stateOverrides).reduce(
        (count, overrides) => count + Object.keys(overrides).length,
        0,
      ) === 3,
    'copy mutated the document/history or captured an incomplete subtree snapshot',
  )

  assert(
    store.getState().dispatch(
      { type: 'removeComponent', componentId: 'comp-actions' },
      'Remove copied source',
    ),
    'source removal after copy failed',
  )
  store.getState().setSelectedComponent('comp-edit-section')
  assert(
    canPasteComponent(
      store.getState().effectiveDocument,
      clipboard,
      'comp-edit-section',
    ) &&
      store.getState().pasteComponent('comp-edit-section', 'Paste component'),
    'snapshot could not be pasted after its source was deleted',
  )
  const section = store.getState().document.components['comp-edit-section']
  const pastedRootId = section.childIds.at(-1)
  const pastedRoot = store.getState().document.components[pastedRootId]
  const pastedSaveId = pastedRoot.childIds[1]
  assert(
    pastedRootId !== 'comp-actions' &&
      pastedRoot.kind === 'container' &&
      pastedRoot.childIds.length === 2 &&
      store.getState().document.components[pastedSaveId].config.eventId === null &&
      store.getState().ui.selectedComponentId === pastedRootId &&
      store.getState().history.length === 2,
    'paste was not one atomic insertion with new IDs, cleared event reference, and new selection',
  )
  assert(
    store.getState().document.screenStates['state-edit-success']
      .componentOverrides[pastedRootId]?.visible === false &&
      store.getState().document.screenStates['state-edit-saving']
        .componentOverrides[pastedSaveId]?.enabled === false &&
      !store.getState().document.events['event-save-task'] &&
      !store.getState().document.events['event-cancel-task-edit'] &&
      store.getState().document.events['event-create-task'],
    'same-screen paste did not copy snapshot overrides or recreated an event',
  )
  store.getState().undo()
  assert(
    store.getState().ui.selectedComponentId === 'comp-edit-section' &&
      !store.getState().document.components[pastedRootId],
    'paste Undo did not restore the destination selection',
  )
  store.getState().redo()
  assert(
    store.getState().ui.selectedComponentId === pastedRootId &&
      store.getState().document.components[pastedRootId],
    'paste Redo did not restore the pasted root selection',
  )

  store.getState().resetToSample()
  store.getState().setActiveScreen('screen-edit')
  store.getState().setSelectedComponent('comp-actions')
  store.getState().copyComponent('comp-actions')
  const copiedAcrossScreens = store.getState().componentClipboard
  store.getState().setActiveScreen('screen-list')
  const pageTarget = resolveComponentPasteTarget(
    store.getState().effectiveDocument,
    'comp-list-page',
  )
  const eventSnapshot = JSON.stringify(store.getState().document.events)
  const apiSnapshot = JSON.stringify(store.getState().document.apiOperations)
  assert(
    pageTarget?.destinationParentId === 'comp-list-page' &&
      pageTarget.position === store.getState().document.components['comp-list-page'].childIds.length,
    'Page root did not resolve to an inside-at-end paste target',
  )
  store.getState().setSelectedComponent('comp-list-page')
  assert(
    store.getState().pasteComponent('comp-list-page', 'Paste component'),
    'cross-screen root paste failed',
  )
  const listPage = store.getState().document.components['comp-list-page']
  const crossScreenRootId = listPage.childIds.at(-1)
  const crossScreenSubtree = [
    crossScreenRootId,
    ...store.getState().document.components[crossScreenRootId].childIds,
  ]
  assert(
    crossScreenSubtree.every(
      id => store.getState().document.components[id].screenId === 'screen-list',
    ) &&
      Object.values(store.getState().document.screenStates)
        .filter(state => state.screenId === 'screen-list')
        .every(state => crossScreenSubtree.every(id => !state.componentOverrides[id])) &&
      JSON.stringify(store.getState().document.events) === eventSnapshot &&
      JSON.stringify(store.getState().document.apiOperations) === apiSnapshot &&
      store.getState().toast?.message.key === 'clipboard.crossScreenOverridesOmitted',
    'cross-screen paste copied overrides/events/API bindings or omitted its notice',
  )

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
  store.getState().setActiveScreen('screen-edit')
  store.getState().setSelectedComponent('comp-actions')
  store.getState().copyComponent('comp-actions')
  store.getState().setSelectedComponent('comp-edit-section')
  const pasteReview = store.getState().beginChangeSet('Paste subtree')
  assert(
    !store.getState().pasteComponent('comp-edit-section', 'Paste component') &&
      pasteReview.operations.length === 0 &&
      store.getState().ui.selectedComponentId === 'comp-edit-section',
    'human paste was not blocked during review',
  )
  const { createPasteComponentCommand } = await import(
    moduleUrl(componentDuplicationBundle, 'paste-review-command')
  )
  let pasteId = 0
  const pasteCommand = createPasteComponentCommand(
    store.getState().effectiveDocument,
    store.getState().componentClipboard,
    'comp-edit-section',
    () => `review-paste-${pasteId++}`,
  )
  assert(pasteCommand, 'agent paste command could not be created')
  store.getState().dispatchToChangeSet(pasteReview.id, pasteCommand)
  const pastedRootId = pasteCommand.componentIdMap[pasteCommand.snapshot.rootComponentId]
  store.getState().setSelectedComponent(pastedRootId)
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
      store.getState().ui.selectedComponentId === pastedRootId &&
      row.commandType === 'pasteComponent' &&
      row.navigation?.componentId === pastedRootId &&
      row.impact.includes('3 components') &&
      row.impact.includes('3 state overrides') &&
      [...markers.statuses.values()].filter(status => status === 'added').length === 3,
    'paste was not represented as one reviewable operation with added subtree markers',
  )

  const reloaded = await freshStore('paste-active-reload')
  assert(
    reloaded.getState().activeChangeSet?.operations[0].command.type === 'pasteComponent' &&
      reloaded.getState().effectiveDocument.components[pastedRootId] &&
      reloaded.getState().componentClipboard === null,
    'active paste did not reload safely or incorrectly persisted the app clipboard',
  )
  reloaded.getState().copyComponent('comp-actions')
  reloaded.getState().setSelectedComponent(pastedRootId)
  reloaded.getState().rejectChangeSet()
  assert(
    reloaded.getState().ui.selectedComponentId === 'comp-edit-section' &&
      !reloaded.getState().effectiveDocument.components[pastedRootId] &&
      reloaded.getState().componentClipboard?.rootComponentId === 'comp-actions',
    'paste Reject did not restore selection or incorrectly cleared the same-project clipboard',
  )

  store.getState().acceptChangeSet()
  assert(
    store.getState().document.components[pastedRootId] &&
      store.getState().ui.selectedComponentId === pastedRootId &&
      store.getState().componentClipboard?.rootComponentId === 'comp-actions',
    'paste Accept did not retain the pasted selection or same-project clipboard',
  )
  store.getState().undo()
  assert(
    store.getState().ui.selectedComponentId === 'comp-edit-section' &&
      !store.getState().document.components[pastedRootId],
    'accepted paste Undo did not restore the destination selection',
  )
  store.getState().redo()
  assert(
    store.getState().ui.selectedComponentId === pastedRootId &&
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
  const revisions = [store.getState().document.revision]

  store.getState().dispatch({ type: 'updateScreen', screenId: 'screen-list', name: 'First edit' })
  revisions.push(store.getState().document.revision)
  store.getState().dispatch({ type: 'updateScreen', screenId: 'screen-list', name: 'Second edit' })
  revisions.push(store.getState().document.revision)
  store.getState().undo()
  revisions.push(store.getState().document.revision)
  store.getState().redo()
  revisions.push(store.getState().document.revision)
  assert(store.getState().document.screens['screen-list'].name === 'Second edit', 'redo did not restore content')
  store.getState().undo()
  revisions.push(store.getState().document.revision)
  store.getState().dispatch({ type: 'updateScreen', screenId: 'screen-list', name: 'After undo' })
  revisions.push(store.getState().document.revision)
  assert(store.getState().redoStack.length === 0, 'new confirmed edit did not clear redo')
  const revisionAfterBranch = store.getState().document.revision
  store.getState().redo()
  assert(
    store.getState().document.revision === revisionAfterBranch &&
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

  const textBefore = store.getState().document.components['comp-list-title'].config.text
  const historyBeforeText = store.getState().history.length
  const coalescedText = '12345678901234567890123456789012345678901234567890'
  store.getState().dispatch({
    type: 'updateComponentSpec',
    componentId: 'comp-list-title',
    patch: { config: { text: coalescedText } },
  }, 'Update text text: comp-list-title')
  assert(
    store.getState().history.length === historyBeforeText + 1,
    'coalesced text edit created more than one history entry',
  )
  const textRevision = store.getState().document.revision
  store.getState().undo()
  assert(
    store.getState().document.components['comp-list-title'].config.text === textBefore,
    'text Undo failed',
  )
  store.getState().redo()
  assert(
    store.getState().document.components['comp-list-title'].config.text === coalescedText &&
      store.getState().document.revision > textRevision,
    'text Redo failed or rewound revision',
  )

  const originalGridPosition = store.getState()
    .document.components['comp-list-section'].childIds.indexOf('comp-list-grid')
  store.getState().dispatch({
    type: 'moveComponent',
    componentId: 'comp-list-grid',
    newParentId: 'comp-list-section',
    position: 0,
  }, 'Move component')
  store.getState().undo()
  assert(
    store.getState().document.components['comp-list-section']
      .childIds[originalGridPosition] === 'comp-list-grid',
    'move Undo failed',
  )
  store.getState().redo()
  assert(
    store.getState().document.components['comp-list-section'].childIds[0] === 'comp-list-grid',
    'move Redo failed',
  )

  store.getState().setSelectedComponent('comp-task-launch-title')
  store.getState().dispatch({
    type: 'removeComponent',
    componentId: 'comp-task-launch-title',
  }, 'Delete component')
  assert(store.getState().ui.selectedComponentId === null, 'delete did not reconcile selection')
  store.getState().undo()
  assert(store.getState().document.components['comp-task-launch-title'], 'delete Undo did not restore component')
  store.getState().redo()
  assert(
    store.getState().document.components['comp-task-launch-title'] === undefined &&
      store.getState().ui.selectedComponentId === null,
    'delete Redo did not remove component or reconcile selection',
  )

  store.getState().dispatch({
    type: 'addScreen',
    screenId: 'screen-redo',
    rootComponentId: 'component-redo-page',
    defaultStateId: 'state-redo-default',
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
    stateId: 'state-redo-extra',
    screenId: 'screen-list',
    name: 'Redo state',
    description: '',
  }, 'Add state')
  store.getState().setActiveScreen('screen-list')
  store.getState().setActiveState('state-redo-extra')
  store.getState().undo()
  assert(
    store.getState().document.screenStates['state-redo-extra'] === undefined &&
      store.getState().ui.activeStateId === 'state-list-default',
    'state Undo did not reconcile active state',
  )
  store.getState().redo()
  assert(
    store.getState().document.screenStates['state-redo-extra'] &&
      store.getState().ui.activeStateId === 'state-list-default',
    'state Redo failed or left an invalid active state',
  )

  const persistedRevision = store.getState().document.revision
  const reloaded = await freshStore('redo-operation-reload')
  assert(
    reloaded.getState().document.revision === persistedRevision &&
      reloaded.getState().document.screenStates['state-redo-extra'] &&
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
  const reviewRevision = reviewStore.getState().document.revision
  reviewStore.getState().undo()
  reviewStore.getState().redo()
  assert(
    reviewStore.getState().document.revision === reviewRevision &&
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
    requestBindings: [{ componentId: 'comp-task-title-input', targetPath: 'body.title' }],
    successStateId: 'state-edit-saving',
    errorStateId: 'state-edit-saving',
  })
  document = applyCommandWithoutRevision(document, {
    type: 'removeScreenState',
    stateId: 'state-edit-saving',
  })
  assert(document.apiOperations['edit-api'].successStateId === null, 'success state was not cleared')
  assert(document.apiOperations['edit-api'].errorStateId === null, 'error state was not cleared')
  assert(
    document.events['event-save-task'].actions.every(action => action.type !== 'setState'),
    'setState action was not cleared',
  )

  for (const eventId of [
    'event-create-task',
    'event-edit-launch-task',
    'event-edit-docs-task',
  ]) {
    document = applyCommandWithoutRevision(document, { type: 'removeEvent', eventId })
  }
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

await test('alert target removal filters only matching showAlert actions', async () => {
  memoryStorage.clear()
  const store = await freshStore('show-alert-cleanup')
  const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'show-alert-cleanup-domain'))
  let document = store.getState().document

  for (const alertId of ['alert-one', 'alert-two']) {
    document = applyCommandWithoutRevision(document, {
      type: 'addComponent',
      componentId: alertId,
      screenId: 'screen-edit',
      parentId: 'comp-edit-section',
      kind: 'alert',
      config: { kind: 'alert', tone: 'error', message: alertId },
    })
  }
  document = applyCommandWithoutRevision(document, {
    type: 'connectEvent',
    eventId: 'event-mixed-alerts',
    screenId: 'screen-edit',
    name: 'Mixed alert event',
    trigger: { type: 'click', componentId: 'comp-save-btn' },
    actions: [
      { type: 'showAlert', componentId: 'alert-one' },
      { type: 'setState', stateId: 'state-edit-saving' },
      { type: 'showAlert', componentId: 'alert-two' },
      { type: 'navigate', destinationScreenId: 'screen-list' },
    ],
  })
  document = applyCommandWithoutRevision(document, {
    type: 'updateComponentSpec',
    componentId: 'comp-save-btn',
    patch: { config: { eventId: 'event-mixed-alerts' } },
  })
  document = applyCommandWithoutRevision(document, {
    type: 'removeComponent',
    componentId: 'alert-one',
  })

  const event = document.events['event-mixed-alerts']
  assert(event !== undefined, 'alert target removal deleted the event')
  assert(
    event.actions.some(action => action.type === 'showAlert' && action.componentId === 'alert-two'),
    'unrelated showAlert action was removed',
  )
  assert(
    !event.actions.some(action => action.type === 'showAlert' && action.componentId === 'alert-one'),
    'removed alert showAlert action was retained',
  )
  assert(event.actions.some(action => action.type === 'setState'), 'setState action was removed')
  assert(event.actions.some(action => action.type === 'navigate'), 'navigate action was removed')
  assert(
    document.components['comp-save-btn'].config.eventId === 'event-mixed-alerts',
    'button event binding was cleared',
  )
  assert(
    document.screens['screen-edit'].eventIds.includes('event-mixed-alerts'),
    'screen event ID was removed',
  )

  document = applyCommandWithoutRevision(document, {
    type: 'removeComponent',
    componentId: 'comp-save-btn',
  })
  assert(document.events['event-mixed-alerts'] === undefined, 'trigger removal retained the event')
  assert(
    !document.screens['screen-edit'].eventIds.includes('event-mixed-alerts'),
    'trigger removal retained screen event ID',
  )
})

await test('API request bindings clean up on component removal and reload', async () => {
  memoryStorage.clear()
  const store = await freshStore('api-binding-cleanup')
  store.getState().dispatch({ type: 'removeComponent', componentId: 'comp-task-title-input' })
  assert(
    !store.getState().document.apiOperations['api-update-task'].requestBindings.some(
      binding => binding.componentId === 'comp-task-title-input',
    ),
    'API request binding was not cleared when its component was removed',
  )

  const reloadedStore = await freshStore('api-binding-cleanup-reload')
  assert(
    !reloadedStore.getState().document.apiOperations['api-update-task'].requestBindings.some(
      binding => binding.componentId === 'comp-task-title-input',
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
    type: 'addComponent',
    componentId: 'edit-alert',
    screenId: 'screen-edit',
    parentId: 'comp-edit-page',
    kind: 'alert',
    config: { kind: 'alert', tone: 'error', message: 'Failed' },
  })
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
        componentId: 'comp-list-title',
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
        config: { kind: 'text', text: 'Wrong', style: 'body' },
      },
      {
        type: 'addComponent',
        componentId: '__proto__',
        screenId: 'screen-list',
        parentId: 'comp-list-page',
        kind: 'text',
        config: { kind: 'text', text: 'Wrong', style: 'body' },
      },
      {
        type: 'addComponent',
        componentId: 'cross-screen-component',
        screenId: 'screen-edit',
        parentId: 'comp-list-page',
        kind: 'text',
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
        const beforeCount = pending().operations.length
        const result = byName(toolName).execute(input)
        assert(!result.ok, `${toolName} accepted dangerous ID ${id}`)
        assert(pending().operations.length === beforeCount, `${toolName} changed ops for ${id}`)
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
    assert(!ghostApi.ok && pending().operations.length === 0, 'ghost screen API was retained')
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
      trigger: { type: 'click', componentId: 'comp-list-title' },
      actions: [{ type: 'setState', stateId: 'state-edit-default' }],
    },
    {
      type: 'connectEvent',
      eventId: 'cross-api',
      screenId: 'screen-list',
      name: 'Cross API',
      trigger: { type: 'click', componentId: 'comp-list-title' },
      actions: [{ type: 'callApi', apiOperationId: 'edit-api' }],
    },
    {
      type: 'connectEvent',
      eventId: 'cross-alert',
      screenId: 'screen-list',
      name: 'Cross alert',
      trigger: { type: 'click', componentId: 'comp-list-title' },
      actions: [{ type: 'showAlert', componentId: 'edit-alert' }],
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

await test('nine tools register and invalid writes fail without adding operations', async () => {
  localStorage.clear()
  const module = await import(moduleUrl(toolsBundle, 'invalid-writes'))
  const tools = module.WEBMCP_TOOLS
  assert(tools.length === 9, `expected 9 tools, got ${tools.length}`)

  const registered = []
  document.modelContext = {
    registerTool: async tool => {
      registered.push(tool)
      return undefined
    },
  }
  const registrationSucceeded = await module.registerWebMCPTools()
  assert(registrationSucceeded, 'valid Promise registrations reported failure')
  assert(registered.length === 9, `expected 9 registered tools, got ${registered.length}`)

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
    const before = pending().operations.length
    const result = byName(toolName).execute(input)
    assert(!result.ok && result.error.code, `${toolName} returned a false success`)
    assert(pending().operations.length === before, `${toolName} added an invalid operation`)
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
  const latestCommand = () => pending().operations.at(-1).command
  assert(
    byName('change_screen_structure').inputSchema.oneOf.length === 3,
    'screen structure tool does not expose exactly add, update, and remove',
  )
  assert(
    byName('connect_behavior').inputSchema.oneOf.length === 6,
    'behavior tool does not expose create, update, and remove for events and APIs',
  )
  execute('connect_behavior', {
    operation: 'updateEvent',
    eventId: 'event-save-task',
    name: 'Save from form',
    trigger: { type: 'submit', componentId: 'comp-edit-page' },
    actions: [{ type: 'callApi', apiOperationId: 'api-update-task' }],
  })
  assert(
    byName('get_component').execute({ componentId: 'comp-save-btn' })
      .data.component.config.eventId === null,
    'moving an event trigger retained the old button event reference',
  )
  const context = byName('get_current_screen_context').execute({})
  assert(
    context.ok &&
      Object.keys(context.data.project).sort().join(',') === 'id,name,screenIds',
    'screen context project metadata has an unexpected shape',
  )
  const stateSchema = byName('upsert_screen_state').inputSchema
  assert(
    stateSchema.oneOf[0].properties.kind === undefined &&
      stateSchema.oneOf[1].properties.kind === undefined &&
      !stateSchema.oneOf[0].required.includes('kind'),
    'WebMCP state schema still exposes a state kind',
  )
  const componentSchema = byName('change_component_structure').inputSchema
  assert(
    componentSchema.oneOf.some(variant =>
      variant.properties?.kind?.const === 'modal' &&
      variant.properties?.parentId?.type === 'null'
    ) &&
      componentSchema.oneOf.some(variant =>
        variant.properties?.kind?.enum?.includes('container') &&
        !variant.properties?.kind?.enum?.includes('modal')
      ) &&
      componentSchema.oneOf.some(variant =>
        variant.properties?.operation?.const === 'duplicate' &&
        variant.required?.includes('componentId')
      ),
    'WebMCP does not distinguish modal creation, child creation, and duplication',
  )

  execute('change_screen_structure', { operation: 'add', name: 'Agent screen', route: '/agent' })
  const addedScreenId = latestCommand().screenId
  execute('change_screen_structure', { operation: 'update', screenId: addedScreenId, name: 'Updated agent screen' })
  execute('change_screen_structure', { operation: 'remove', screenId: addedScreenId })

  execute('change_component_structure', {
    operation: 'add',
    screenId: 'screen-list',
    parentId: 'comp-list-page',
    kind: 'container',
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
  const addedContainerId = latestCommand().componentId
  execute('update_component_spec', {
    componentId: addedContainerId,
    patch: { config: { layout: 'grid', columns: 3, gap: 'lg' } },
  })
  assert(
    latestCommand().patch.config.layout === 'grid' &&
      latestCommand().patch.config.columns === 3,
    'WebMCP layout update did not reach the change set',
  )

  execute('change_component_structure', {
    operation: 'add',
    screenId: 'screen-list',
    parentId: addedContainerId,
    kind: 'text',
    config: { kind: 'text', text: 'Agent text', style: 'heading2' },
  })
  const addedComponentId = latestCommand().componentId
  execute('change_component_structure', {
    operation: 'duplicate',
    componentId: addedComponentId,
  })
  const duplicateCommand = latestCommand()
  assert(
    duplicateCommand.type === 'duplicateComponent' &&
      duplicateCommand.componentIdMap[addedComponentId] &&
      Object.keys(duplicateCommand.componentIdMap).length === 1,
    'WebMCP duplicate did not emit one atomic duplicateComponent command',
  )
  execute('change_component_structure', {
    operation: 'move',
    componentId: addedComponentId,
    newParentId: 'comp-list-section',
  })
  execute('update_component_spec', {
    componentId: addedComponentId,
    patch: { config: { text: 'Updated text', style: 'caption' } },
  })
  execute('change_component_structure', { operation: 'remove', componentId: addedComponentId })
  execute('change_component_structure', { operation: 'remove', componentId: addedContainerId })

  execute('change_component_structure', {
    operation: 'add',
    screenId: 'screen-list',
    parentId: null,
    kind: 'modal',
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
  const addedModalId = latestCommand().componentId
  assert(
    latestCommand().parentId === null &&
      pending().operations.at(-1).command.kind === 'modal',
    'WebMCP modal add did not create an independent root command',
  )
  const invalidNestedModal = byName('change_component_structure').execute({
    changeSetId,
    expectedRevision: revision,
    expectedChangeSetVersion: version,
    operation: 'add',
    screenId: 'screen-list',
    parentId: 'comp-list-page',
    kind: 'modal',
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
    !invalidNestedModal.ok && pending().operations.length === version,
    'WebMCP accepted a nested modal or changed the change set after rejection',
  )
  execute('change_component_structure', { operation: 'remove', componentId: addedModalId })

  execute('upsert_screen_state', {
    operation: 'create',
    screenId: 'screen-list',
    name: 'Agent state',
  })
  const addedStateId = latestCommand().stateId
  execute('upsert_screen_state', {
    operation: 'update',
    stateId: addedStateId,
    name: 'Agent error state',
    description: 'Updated',
    overrides: {
      'comp-list-title': { text: 'Could not load users.' },
    },
  })

  execute('connect_behavior', {
    operation: 'bindApi',
    screenId: 'screen-list',
    name: 'List API',
    method: 'GET',
    path: '/users',
    successStateId: addedStateId,
  })
  const addedApiId = latestCommand().operationId
  execute('connect_behavior', {
    operation: 'connectEvent',
    screenId: 'screen-list',
    name: 'Load list',
    trigger: { type: 'click', componentId: 'comp-list-title' },
    actions: [{ type: 'callApi', apiOperationId: addedApiId }],
  })
  const addedEventId = latestCommand().eventId
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
    trigger: { type: 'submit', componentId: 'comp-list-page' },
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
      updatedEvent.actions[0]?.apiOperationId === addedApiId &&
      updatedContext.data.activeScreen.screen.eventIds.includes(addedEventId),
    'behavior updates replaced IDs or lost event/API references',
  )
  execute('connect_behavior', { operation: 'removeEvent', eventId: addedEventId })
  execute('connect_behavior', { operation: 'removeApi', operationId: addedApiId })
  execute('upsert_screen_state', { operation: 'remove', stateId: addedStateId })

  assert(pending().operations.length === version, 'operation count and version diverged')
})

await test('WebMCP reads are compact, discoverable, and serializable', async () => {
  localStorage.clear()
  const module = await import(moduleUrl(toolsBundle, 'agent-read-surfaces'))
  const byName = name => module.WEBMCP_TOOLS.find(tool => tool.name === name)
  const initialContext = byName('get_current_screen_context').execute({})
  assert(initialContext.ok, 'initial screen context failed')
  assert(
    initialContext.data.documentView === 'effective' &&
      initialContext.data.activeScreen.documentView === 'effective' &&
      initialContext.data.activeScreen.screen.id === 'screen-list' &&
      initialContext.data.activeScreen.components.length > 1 &&
      Array.isArray(initialContext.data.activeScreen.states) &&
      Array.isArray(initialContext.data.activeScreen.events) &&
      Array.isArray(initialContext.data.activeScreen.apiOperations),
    'active screen context does not provide one complete effective projection',
  )
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
    trigger: { type: 'click', componentId: 'comp-list-title' },
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
      pending.data.activeChangeSet.operations.length === 2 &&
      pending.data.activeChangeSet.operationSummaries.length === 2 &&
      pending.data.activeChangeSet.operationSummaries.every(operation =>
        operation.source === 'agent' &&
        typeof operation.action === 'string' &&
        Array.isArray(operation.changes)
      ),
    'pending change set omitted raw operations or review-ready compact diffs',
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

await test('TaskFlow sample is a complete two-screen task specification', async () => {
  const { sampleProject } = await import(moduleUrl(sampleProjectBundle, 'taskflow-completeness'))
  const { validateInvariants } = await import(moduleUrl(invariantsBundle, 'taskflow-completeness'))
  const { selectScreenFlow } = await import(moduleUrl(screenFlowBundle, 'taskflow-completeness'))

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
    [...new Set(Object.values(sampleProject.components).map(component => component.kind))]
      .sort().join(',') ===
      ['alert', 'button', 'container', 'modal', 'page', 'select', 'text', 'textInput']
        .sort().join(','),
    'TaskFlow does not exercise all canonical component kinds',
  )
  assert(
    !Object.values(sampleProject.components).some(component =>
      component.config.kind === 'select' && component.config.fieldKey === 'priority'
    ),
    'Priority must remain absent until the WebMCP demo',
  )

  for (const screen of Object.values(sampleProject.screens)) {
    assert(
      Object.keys(sampleProject.screenStates[screen.defaultStateId].componentOverrides).length === 0,
      `${screen.name} default state contains overrides`,
    )
  }
  for (const component of Object.values(sampleProject.components)) {
    if (component.config.kind !== 'button' || !component.common.enabled) continue
    const event = sampleProject.events[component.config.eventId]
    assert(
      event?.trigger.componentId === component.id && event.actions.length > 0,
      `enabled button ${component.id} is not connected to an actionable event`,
    )
  }
  assert(
    Object.values(sampleProject.events).every(event => event.actions.length > 0),
    'TaskFlow contains an event without actions',
  )
  for (const operation of Object.values(sampleProject.apiOperations)) {
    assert(
      operation.successStateId &&
        operation.errorStateId &&
        sampleProject.screenStates[operation.successStateId]?.screenId === operation.screenId &&
        sampleProject.screenStates[operation.errorStateId]?.screenId === operation.screenId,
      `API ${operation.id} does not resolve both result states on its screen`,
    )
    const bindingKeys = operation.requestBindings.map(binding =>
      `${binding.componentId}:${binding.targetPath}`
    )
    assert(
      new Set(bindingKeys).size === bindingKeys.length &&
        operation.requestBindings.every(binding =>
          sampleProject.components[binding.componentId]?.screenId === operation.screenId
        ),
      `API ${operation.id} has duplicate or cross-screen request bindings`,
    )
  }
  const titleRules =
    sampleProject.components['comp-task-title-input'].config.validationRules
  assert(
    titleRules.map(rule => rule.type).join(',') === 'required,minLength,maxLength' &&
      titleRules[1].value === 3 &&
      titleRules[2].value === 80,
    'Task title validation does not cover required and bounded length',
  )
  assert(
    sampleProject.screens['screen-edit'].modalComponentIds.join(',') === 'comp-discard-modal' &&
      sampleProject.components['comp-discard-modal'].parentId === null &&
      sampleProject.screenStates['state-edit-confirm-exit']
        .componentOverrides['comp-discard-modal'].visible === true,
    'discard confirmation is not modeled as an independent modal state',
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
      editToList?.transitions.length === 1 &&
      editToList.transitions[0].eventId === 'event-discard-task-changes',
    'TaskFlow navigation edges do not explain edit/discard paths',
  )
  assert(
    sampleProject.screens['screen-list'].modalComponentIds.includes('comp-create-modal') &&
      sampleProject.events['event-create-task'].actions[0].stateId === 'state-list-create' &&
      sampleProject.events['event-submit-create-task'].actions.some(
        action => action.type === 'callApi' && action.apiOperationId === 'api-create-task',
      ) &&
      sampleProject.apiOperations['api-create-task'].method === 'POST' &&
      sampleProject.apiOperations['api-create-task'].requestBindings[0].componentId ===
        'comp-new-task-title-input',
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
  assert(
    appSource.includes("window.confirm(t('app.resetSampleConfirm'))") &&
      appSource.includes('disabled={Boolean(activeChangeSet)}') &&
      appSource.includes('resetToSample()'),
    'main UI reset is not confirmed or review-locked',
  )
})

await test('Priority demo reuses human edits and preserves the Update Task API ID', async () => {
  memoryStorage.clear()
  const seedStore = await freshStore('priority-demo-seed')
  seedStore.getState().setActiveScreen('screen-edit')

  const firstModule = await import(moduleUrl(toolsBundle, 'priority-demo-first-agent'))
  const firstTool = name => firstModule.WEBMCP_TOOLS.find(tool => tool.name === name)
  const firstContext = firstTool('get_current_screen_context').execute({})
  assert(
    firstContext.ok &&
      firstContext.data.activeScreen.screen.id === 'screen-edit' &&
      !firstContext.data.activeScreen.components.some(component =>
        component.config.kind === 'select' && component.config.fieldKey === 'priority'
      ),
    'Priority demo did not start from the live Edit Task context without Priority',
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
    parentId: 'comp-edit-section',
    kind: 'select',
    position: 6,
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
  const proposedPriority = proposedContext.data.activeScreen.components.find(component =>
    component.config.kind === 'select' && component.config.fieldKey === 'priority'
  )
  const savingState = proposedContext.data.activeScreen.states.find(
    state => state.id === 'state-edit-saving',
  )
  assert(proposedPriority && savingState, 'Priority or Saving state was missing from the proposal')
  const integratePriority = firstTool('upsert_screen_state').execute({
    changeSetId: firstReview.data.changeSetId,
    expectedRevision: firstReview.data.baseRevision,
    expectedChangeSetVersion: addPriority.data.changeSetVersion,
    operation: 'update',
    stateId: savingState.id,
    overrides: {
      ...savingState.componentOverrides,
      [proposedPriority.id]: { enabled: false },
    },
  })
  assert(integratePriority.ok, `Priority saving-state integration failed: ${JSON.stringify(integratePriority)}`)
  const integratedContext = firstTool('get_current_screen_context').execute({})
  const firstPending = firstTool('get_pending_change_set').execute({})
  assert(
    proposedPriority &&
      integratedContext.data.activeScreen.components.find(
        component => component.id === 'comp-edit-section',
      ).childIds.indexOf(proposedPriority.id) ===
        integratedContext.data.activeScreen.components.find(
          component => component.id === 'comp-edit-section',
        ).childIds.indexOf('comp-task-status-select') + 1 &&
      integratedContext.data.activeScreen.states.find(
        state => state.id === 'state-edit-saving',
      ).componentOverrides[proposedPriority.id].enabled === false &&
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
  const correctedContext = secondTool('get_current_screen_context').execute({})
  const correctedPriority = correctedContext.data.activeScreen.components.find(
    component => component.id === proposedPriority.id,
  )
  const updateTask = correctedContext.data.activeScreen.apiOperations.find(
    operation => operation.id === 'api-update-task',
  )
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
      { componentId: correctedPriority.id, targetPath: 'body.priority' },
    ],
    successStateId: updateTask.successStateId,
    errorStateId: updateTask.errorStateId,
  })
  assert(updateApi.ok, `Priority API binding proposal failed: ${JSON.stringify(updateApi)}`)
  const secondPending = secondTool('get_pending_change_set').execute({})
  assert(
    secondPending.data.activeChangeSet.operationSummaries.length === 1 &&
      secondPending.data.activeChangeSet.operations[0].command.operationId === 'api-update-task',
    'Priority API proposal did not retain the existing operation ID',
  )

  const secondHumanStore = await freshStore('priority-demo-second-human')
  secondHumanStore.getState().acceptChangeSet()
  const reloaded = await freshStore('priority-demo-reload')
  const persistedPriority =
    reloaded.getState().document.components[proposedPriority.id]
  const persistedApi = reloaded.getState().document.apiOperations['api-update-task']
  assert(
    persistedPriority.config.kind === 'select' &&
      persistedPriority.config.defaultValue === 'normal' &&
      persistedApi.id === 'api-update-task' &&
      persistedApi.requestBindings.some(binding =>
        binding.componentId === proposedPriority.id && binding.targetPath === 'body.priority'
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
    'comp-list-section',
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
    'comp-list-section',
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
    store.getState().document.components['comp-list-section'].childIds[0] === command.componentId,
    'palette add command did not honor the drop position',
  )

  const resolution = resolveComponentDrop(
    store.getState().document,
    'comp-list-title',
    {
      type: 'component-drop',
      parentId: 'comp-list-section',
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
      select.options.some(option => option.value === select.defaultValue) &&
      Object.values(sampleProject.screenStates).some(state =>
        state.componentOverrides[representativeByKind.get('select').id]?.enabled === false),
    'sample Select does not demonstrate options, default, and state behavior',
  )
  const textInput = representativeByKind.get('textInput').config
  assert(
    textInput.kind === 'textInput' &&
      textInput.validationRules.some(rule => rule.type === 'required') &&
      textInput.validationRules.some(rule => rule.type === 'maxLength'),
    'sample TextInput does not demonstrate validation rules',
  )
  const button = representativeByKind.get('button')
  assert(
    button.config.kind === 'button' &&
      button.config.eventId !== null &&
      sampleProject.events[button.config.eventId]?.trigger.componentId === button.id,
    'sample Button does not demonstrate an Event reference',
  )
  assert(
    Object.values(sampleProject.apiOperations).some(operation =>
      operation.requestBindings.some(binding =>
        binding.componentId === representativeByKind.get('textInput').id ||
        binding.componentId === representativeByKind.get('select').id)),
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
    assert(
      canDuplicateComponent(sampleProject, source.id) === !independentRoot,
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

    const duplicate = createDuplicateComponentCommand(sampleProject, source.id, createId)
    assert(duplicate, `duplicate command is unavailable for ${kind}`)
    const duplicated = applyCommandWithoutRevision(clone(sampleProject), duplicate)
    assert(
      duplicated.components[duplicate.componentIdMap[source.id]]?.kind === kind,
      `duplicate did not preserve ${kind}`,
    )

    const snapshot = createComponentSubtreeSnapshot(sampleProject, source.id)
    assert(snapshot, `copy snapshot is unavailable for ${kind}`)
    const destination = sampleProject.screens[source.screenId].rootComponentId
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
  const addChildSchema = structureTool?.inputSchema.oneOf?.[0]
  const addModalSchema = structureTool?.inputSchema.oneOf?.[1]
  const webMcpConfigKinds = addChildSchema?.properties.config.oneOf
    ?.map(variant => variant.properties.kind.const)
  const webMcpAddKinds = [
    ...(addChildSchema?.properties.kind.enum ?? []),
    addModalSchema?.properties.kind.const,
  ].filter(Boolean)
  assert(
    addChildSchema?.properties.kind.enum.join(',') === CHILD_COMPONENT_KINDS.join(',') &&
      webMcpAddKinds.join(',') === PALETTE_COMPONENT_KINDS.join(','),
    'WebMCP component add kinds diverged from the canonical component catalog',
  )
  assertCompleteComponentKindCoverage('WebMCP add config schema', webMcpConfigKinds ?? [])
  assertCompleteComponentKindCoverage(
    'WebMCP update config schema',
    updateTool?.inputSchema.properties.patch.properties.config.anyOf
      ?.map(variant => variant.properties.kind.const) ?? [],
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
    [...new Set(Object.values(persistedComponents).map(component => component.kind))],
  )
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
    componentId: 'comp-list-title',
    newParentId: 'modal-root',
    position: 0,
  })
  assert(
    document.components['comp-list-title'].parentId === 'modal-root' &&
      document.components['modal-root'].childIds[0] === 'comp-list-title',
    'page child could not be moved into a modal tree',
  )
  document = applyCommandWithoutRevision(document, {
    type: 'moveComponent',
    componentId: 'comp-list-title',
    newParentId: 'comp-list-section',
    position: 0,
  })
  document = applyCommandWithoutRevision(document, {
    type: 'createScreenState',
    stateId: 'state-modal-hidden',
    screenId: 'screen-list',
    name: 'Modal hidden',
    overrides: { 'modal-button': { visible: false } },
  })
  document = applyCommandWithoutRevision(document, {
    type: 'connectEvent',
    eventId: 'event-modal-button',
    screenId: 'screen-list',
    name: 'Close modal',
    trigger: { type: 'click', componentId: 'modal-button' },
    actions: [],
  })

  for (const command of [
    {
      type: 'addComponent',
      componentId: 'nested-modal',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'modal',
      config: { kind: 'modal', ...layout },
    },
    {
      type: 'addComponent',
      componentId: 'orphan-text',
      screenId: 'screen-list',
      parentId: null,
      kind: 'text',
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
      !document.screenStates['state-modal-hidden'].componentOverrides['modal-button'],
    'modal subtree removal left roots, descendants, or references behind',
  )

  const modalReview = store.getState().beginChangeSet('Add modal frame')
  store.getState().dispatchToChangeSet(modalReview.id, {
    type: 'addComponent',
    componentId: 'human-modal-root',
    screenId: 'screen-list',
    parentId: null,
    kind: 'modal',
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
    resolveComponentDrop,
    resolveEditorDrop,
  } = await import(moduleUrl(editorDndBundle, 'invalid-drops'))
  const baseline = store.getState().document

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
    parentId: 'comp-edit-section',
    screenId: 'screen-edit',
    position: 1,
    label: 'current position',
  }
  assert(
    canAcceptDrop(baseline, {
      type: 'component',
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
  assert(
    paletteAdd.status === 'moved' &&
      paletteAdd.action === 'add' &&
      paletteAdd.parentId === 'comp-edit-section' &&
      paletteModal.status === 'moved' &&
      paletteModal.action === 'add' &&
      paletteModal.parentId === null &&
      invalidPaletteParent.status === 'invalid' &&
      invalidPaletteParent.reason === 'parentCannotContainChildren',
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
  const beforeOrder = changeSetStore.getState().document.components['comp-actions'].childIds.join(',')
  const lockChangeSet = changeSetStore.getState().beginChangeSet('AI review lock')
  const beforeLockedAttempt = changeSetStore.getState()
  const persistedBeforeLockedAttempt = memoryStorage.getItem(storageKey)
  const applied = changeSetStore.getState().dispatch({
    type: 'moveComponent',
    componentId: 'comp-cancel-btn',
    newParentId: 'comp-actions',
    position: 1,
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
      changeSetStore.getState().document.components['comp-actions'].childIds.join(',') === beforeOrder &&
      memoryStorage.getItem(storageKey) === persistedBeforeLockedAttempt &&
      changeSetStore.getState().toast?.message.key === 'changes.editLocked',
    'human mutation changed review state, history, document, or persistence',
  )
  assert(
    changeSetStore.getState().copyComponent('comp-actions') &&
      changeSetStore.getState().componentClipboard?.rootComponentId === 'comp-actions',
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
  changeSetStore.getState().setActiveState('state-edit-saving')
  changeSetStore.getState().setSelectedComponent('comp-save-btn')
  changeSetStore.getState().setReviewDraftProtected('regression-dialog', true)
  changeSetStore.getState().dispatchToChangeSet(lockChangeSet.id, {
    type: 'removeScreenState',
    stateId: 'state-edit-saving',
  })
  changeSetStore.getState().dispatchToChangeSet(lockChangeSet.id, {
    type: 'removeComponent',
    componentId: 'comp-save-btn',
  })
  assert(
    changeSetStore.getState().ui.activeScreenId === 'screen-edit' &&
      changeSetStore.getState().ui.activeStateId === 'state-edit-saving' &&
      changeSetStore.getState().ui.selectedComponentId === 'comp-save-btn' &&
      !changeSetStore.getState().effectiveDocument.screenStates['state-edit-saving'] &&
      !changeSetStore.getState().effectiveDocument.components['comp-save-btn'],
    'agent preview removal discarded the confirmed dialog selection or state context',
  )
  changeSetStore.getState().rejectChangeSet()
  assert(
    changeSetStore.getState().ui.activeStateId === 'state-edit-saving' &&
      changeSetStore.getState().ui.selectedComponentId === 'comp-save-btn' &&
      changeSetStore.getState().effectiveDocument.screenStates['state-edit-saving'] &&
      changeSetStore.getState().effectiveDocument.components['comp-save-btn'],
    'Reject did not restore a preview-removed dialog selection or state context',
  )
  changeSetStore.getState().setReviewDraftProtected('regression-dialog', false)
  const documentBeforeEmptyAccept = changeSetStore.getState().document
  const historyBeforeEmptyAccept = changeSetStore.getState().history
  changeSetStore.getState().beginChangeSet('Empty review')
  changeSetStore.getState().acceptChangeSet()
  assert(
    changeSetStore.getState().document === documentBeforeEmptyAccept &&
      changeSetStore.getState().document.revision === documentBeforeEmptyAccept.revision &&
      changeSetStore.getState().history === historyBeforeEmptyAccept &&
      changeSetStore.getState().activeChangeSet === null,
    'accepting an empty change set changed the document revision or history',
  )
  changeSetStore.getState().setSelectedComponent('comp-save-btn')
  changeSetStore.getState().setReviewDraftProtected('accepted-dialog', true)
  const acceptedRemoval = changeSetStore.getState().beginChangeSet('Accepted dialog removal')
  changeSetStore.getState().dispatchToChangeSet(acceptedRemoval.id, {
    type: 'removeComponent',
    componentId: 'comp-save-btn',
  })
  changeSetStore.getState().acceptChangeSet()
  assert(
    changeSetStore.getState().ui.selectedComponentId === 'comp-save-btn' &&
      changeSetStore.getState().reviewDraftDocument?.components['comp-save-btn'] &&
      !changeSetStore.getState().document.components['comp-save-btn'],
    'Accept discarded a protected dialog before its stale draft could be closed',
  )
  changeSetStore.getState().setReviewDraftProtected('accepted-dialog', false)
  assert(
    changeSetStore.getState().ui.selectedComponentId === null &&
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
    const successAlert = effectiveComponent(
      store.getState().document.components['comp-status-alert'],
      store.getState().document.screenStates['state-edit-success'],
    )
    assert(
      successAlert.common.visible === true &&
        successAlert.config.message === 'Task updated successfully.',
      'alert visibility or message override was not reflected in the preview',
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
    '[data-drag-surface="tree"][data-drag-component="comp-task-title-input"]',
  )
  assert(unlockedTreeHandle && !unlockedTreeHandle.disabled, 'Tree drag did not begin unlocked')
  const unlockedCanvasComponent = document.querySelector(
    '[data-component-id="comp-task-title-input"]',
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
  harness.pointer(unlockedTreeHandle, 'pointerdown', { clientX: 400, clientY: 300 })
  harness.pointer(
    document,
    'pointermove',
    { clientX: 412, clientY: 312 },
  )
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
  const treeNode = tree.querySelector('[data-tree-component-id="comp-task-title-input"]')
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

  const canvasComponent = document.querySelector('[data-component-id="comp-task-title-input"]')
  assert(
    canvasComponent &&
      !canvasComponent.hasAttribute('data-canvas-draggable') &&
      !canvasComponent.hasAttribute('data-drag-surface') &&
      canvasComponent.getAttribute('tabindex') === '-1' &&
      !canvasComponent.hasAttribute('role'),
    'Canvas component remains draggable or a dead keyboard stop during review',
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
  const canvasMenuTarget = document.querySelector('[data-component-id="comp-task-assignee-select"]')
  harness.contextMenu(canvasMenuTarget)
  const canvasLockedMenu = document.querySelector('[data-component-add-menu]')
  assert(
    harness.state().selectedComponentId === 'comp-task-assignee-select' &&
      canvasLockedMenu?.querySelector('[data-component-copy]') &&
      !canvasLockedMenu.querySelector('[data-component-duplicate]') &&
      !canvasLockedMenu.querySelector('[data-component-paste]') &&
      !canvasLockedMenu.querySelector('[data-insert-placement]'),
    'review-mode Canvas pointer context menu or selection is unavailable',
  )
  harness.keyDown(canvasLockedMenu, 'Escape', { code: 'Escape' })
  assert(
    !document.querySelector('[data-component-add-menu]'),
    'Canvas context menu did not close before continuing review interactions',
  )

  const stateMutationButtons = [
    document.querySelector('button[aria-label="Add state"]'),
    document.querySelector('button[aria-label="Edit Success"]'),
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
  const canvasSelectionTarget = document.querySelector('[data-component-id="comp-task-description-input"]')
  harness.click(canvasSelectionTarget)
  assert(
    harness.state().selectedComponentId === 'comp-task-description-input',
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
  const inspectorCopy = inspector.querySelector('[data-component-copy-inspector]')
  const inspectorDuplicate = inspector.querySelector('[data-component-duplicate-inspector]')
  const inspectorDelete = inspector.querySelector('[data-component-delete-inspector]')
  assert(
    inspectorCopy && !inspectorCopy.hasAttribute('disabled'),
    'Inspector disabled the non-mutating Copy action',
  )
  assert(
    inspectorDuplicate?.hasAttribute('disabled') &&
      inspectorDelete?.hasAttribute('disabled'),
    'Inspector mutation actions were not explicitly disabled',
  )
  harness.click(inspectorCopy)
  assert(
    harness.state().clipboardRootComponentId === 'comp-task-description-input',
    'Inspector Copy stopped working during review',
  )
  const inspectorPaste = inspector.querySelector('[data-component-paste-inspector]')
  assert(
    inspectorPaste?.hasAttribute('disabled'),
    'Inspector Paste stayed enabled after Copy during review',
  )
  harness.click(inspectorDuplicate)
  harness.click(inspectorPaste)
  harness.click(inspectorDelete)

  harness.contextMenu(treeNode)
  const lockedMenu = document.querySelector('[data-component-add-menu]')
  assert(
    lockedMenu?.querySelector('[role="note"]') &&
      lockedMenu.querySelector('[data-component-copy]') &&
      !lockedMenu.querySelector('[data-component-duplicate]') &&
      !lockedMenu.querySelector('[data-component-paste]') &&
      !lockedMenu.querySelector('[data-insert-placement]'),
    'locked context menu exposes mutation actions or hides Copy',
  )
  expectProtected('context menu Copy', () => {
    harness.click(lockedMenu.querySelector('[data-component-copy]'))
  })
  assert(
    harness.state().clipboardRootComponentId === 'comp-task-title-input',
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

  const sectionTreeNode = tree.querySelector('[data-tree-component-id="comp-edit-section"]')
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
  const component = document.querySelector('[data-component-id="comp-task-title-input"]')
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
    harness.state().selectedComponentId === 'comp-task-title-input',
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
  const otherComponent = document.querySelector('[data-component-id="comp-task-description-input"]')
  harness.click(otherComponent)
  assert(
    harness.state().selectedComponentId === 'comp-task-description-input',
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
      harness.state().selectedComponentId === 'comp-task-description-input',
    'Space-pan tail click incorrectly changed Canvas selection',
  )
  harness.click(component)
  assert(
    harness.state().selectedComponentId === 'comp-task-title-input',
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
      empty.querySelector('[data-container-identity][aria-hidden="true"]')
        ?.textContent.trim() === 'Empty group' &&
      nested.querySelector('[data-container-identity][aria-hidden="true"]')
        ?.textContent.trim() === 'Nested group' &&
      inner.querySelector('[data-container-identity][aria-hidden="true"]')
        ?.textContent.trim() === 'Inner group',
    'empty or nested Containers did not render persistent editor identity',
  )
  const emptyDropTarget = empty.querySelector(
    '[data-drop-surface="canvas"][data-drop-parent="regression-empty-container"]',
  )
  assert(
    emptyDropTarget?.getAttribute('data-drop-orientation') === 'horizontal',
    'empty horizontal Container did not retain its child drop target',
  )

  const identity = empty.querySelector('[data-container-identity]')
  const surface = document.querySelector('[data-canvas-surface]')
  const beforeIdentityPan = surface.getAttribute('style')
  harness.keyDown(window, ' ', { code: 'Space' })
  harness.pointer(identity, 'pointerdown', { clientX: 200, clientY: 200 })
  harness.pointer(window, 'pointermove', { clientX: 230, clientY: 220 })
  harness.pointer(window, 'pointerup', { clientX: 230, clientY: 220 })
  harness.keyUp(window, ' ', { code: 'Space' })
  assert(
    surface.getAttribute('style') !== beforeIdentityPan,
    'persistent Container identity blocked Space-drag panning',
  )

  harness.click(empty)
  assert(
    harness.state().selectedComponentId === 'comp-task-title-input',
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
      ['component:comp-task-title-input:common.description', 'Inspector Description'],
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
    resolveHierarchySelectionTarget(document, 'comp-task-launch-title', 'select-parent') ===
      'comp-task-launch-card' &&
      resolveHierarchySelectionTarget(document, 'comp-list-grid', 'select-first-child') ===
        'comp-task-launch-card' &&
      resolveHierarchySelectionTarget(document, 'comp-task-launch-title', 'select-next-sibling') ===
        'comp-task-launch-meta' &&
      resolveHierarchySelectionTarget(document, 'comp-task-launch-meta', 'select-previous-sibling') ===
        'comp-task-launch-title',
    'hierarchy selection did not follow parent childIds order',
  )
  assert(
    resolveHierarchySelectionTarget(document, 'comp-list-page', 'select-parent') === null &&
      resolveHierarchySelectionTarget(document, 'comp-list-page', 'select-next-sibling') === null &&
      resolveHierarchySelectionTarget(document, 'comp-task-launch-title', 'select-previous-sibling') ===
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
      inspectorSource.includes("t('inspector.hierarchyShortcutHint')"),
    'hierarchy shortcut scope, DnD guard, or discovery UI was not wired',
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
    componentId: 'comp-edit-title',
  })
  assert(
    leaf.counts.components === 1 &&
      leaf.counts.stateOverrides === 0 &&
      leaf.requiresConfirmation === false,
    'a clean component leaf was not classified as an immediate deletion',
  )

  const subtree = analyzeDeleteImpact(sampleProject, {
    type: 'removeComponent',
    componentId: 'comp-actions',
  })
  assert(
    subtree.counts.components === 3 &&
      subtree.counts.events === 2 &&
      subtree.counts.eventActions === 3 &&
      subtree.counts.stateOverrides === 3 &&
      subtree.requiresConfirmation,
    'component subtree cleanup impact did not match removeComponent',
  )

  const state = analyzeDeleteImpact(sampleProject, {
    type: 'removeScreenState',
    stateId: 'state-edit-saving',
  })
  assert(
    state.counts.states === 1 &&
      state.counts.stateOverrides === 7 &&
      state.counts.eventActions === 1 &&
      state.requiresConfirmation,
    'state override and setState cleanup impact was incomplete',
  )

  const event = analyzeDeleteImpact(sampleProject, {
    type: 'removeEvent',
    eventId: 'event-save-task',
  })
  assert(
    event.counts.events === 1 &&
      event.counts.eventActions === 2 &&
      event.counts.buttonEventConnections === 1 &&
      event.requiresConfirmation,
    'event action and Button connection impact was incomplete',
  )

  const api = analyzeDeleteImpact(sampleProject, {
    type: 'removeApiOperation',
    operationId: 'api-update-task',
  })
  assert(
    api.counts.apiOperations === 1 &&
      api.counts.apiBindings === 4 &&
      api.counts.eventActions === 1 &&
      api.counts.apiStateConnections === 2 &&
      api.requiresConfirmation,
    'API binding and callApi cleanup impact was incomplete',
  )

  const screenDeleteDocument = clone(sampleProject)
  delete screenDeleteDocument.events['event-discard-task-changes']
  screenDeleteDocument.screens['screen-edit'].eventIds = screenDeleteDocument
    .screens['screen-edit'].eventIds.filter(id => id !== 'event-discard-task-changes')
  screenDeleteDocument.components['comp-discard-leave-btn'].config.eventId = null
  const screen = analyzeDeleteImpact(screenDeleteDocument, {
    type: 'removeScreen',
    screenId: 'screen-list',
  })
  assert(
    screen.counts.components === 27 &&
      screen.counts.states === 7 &&
      screen.counts.stateOverrides === 16 &&
      screen.requiresConfirmation,
    `screen-owned entity impact was incomplete: ${JSON.stringify(screen.counts)}`,
  )

  const emptyEventDocument = clone(sampleProject)
  emptyEventDocument.events['event-empty'] = {
    id: 'event-empty',
    screenId: 'screen-list',
    name: 'Empty event',
    trigger: { type: 'click', componentId: 'comp-list-title' },
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
      { type: 'removeComponent', componentId: 'comp-edit-title' },
      'Delete component',
    ) === 'executed' &&
      !store.getState().effectiveDocument.components['comp-edit-title'] &&
      store.getState().history.length === 1 &&
      store.getState().toast?.action,
    'clean leaf deletion was not immediate or actionable',
  )
  const undoToastId = store.getState().toast.id
  store.getState().runToastAction(undoToastId)
  assert(
    store.getState().document.components['comp-edit-title'] &&
      store.getState().history.length === 0 &&
      store.getState().redoStack.length === 1,
    'delete Toast action did not perform one normal history Undo',
  )

  store.getState().resetToSample()
  assert(
    store.getState().requestHumanDelete(
      { type: 'removeComponent', componentId: 'comp-actions' },
      'Delete component',
    ) === 'pending' &&
      store.getState().pendingDelete?.analysis.counts.components === 3 &&
      store.getState().history.length === 0,
    'impactful subtree deletion did not wait for confirmation',
  )
  store.getState().cancelPendingDelete()
  assert(
    store.getState().pendingDelete === null &&
      store.getState().document.components['comp-actions'],
    'cancelling deletion changed the document',
  )

  store.getState().requestHumanDelete(
    { type: 'removeComponent', componentId: 'comp-actions' },
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
      store.getState().document.components['comp-actions'],
    'stale confirmation deleted without requiring updated impact review',
  )
  store.getState().confirmPendingDelete()
  assert(
    store.getState().pendingDelete !== null &&
      store.getState().document.components['comp-actions'],
    'repeat activation bypassed updated impact review',
  )
  store.getState().acknowledgePendingDeleteImpact()
  store.getState().confirmPendingDelete()
  assert(
    store.getState().pendingDelete === null &&
      !store.getState().document.components['comp-actions'] &&
      store.getState().toast?.action,
    'reconfirmed current impact did not execute the deletion',
  )

  store.getState().resetToSample()
  store.getState().requestHumanDelete(
    { type: 'removeComponent', componentId: 'comp-edit-title' },
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
    !store.getState().document.components['comp-edit-title'] &&
      store.getState().document.screens['screen-edit'].name === 'Later edit' &&
      store.getState().history.length === 2 &&
      store.getState().toast?.message.key === 'delete.undoUnavailable',
    'stale delete Undo rewound a later human edit',
  )

  store.getState().resetToSample()
  const deleteReview = store.getState().beginChangeSet('AI review blocks delete')
  const lockedDeleteResult = store.getState().requestHumanDelete(
    { type: 'removeComponent', componentId: 'comp-edit-title' },
    'Delete component',
  )
  assert(
    lockedDeleteResult === 'failed' &&
    store.getState().activeChangeSet?.id === deleteReview.id &&
    store.getState().activeChangeSet?.version === 0 &&
    store.getState().activeChangeSet?.operations.length === 0 &&
    store.getState().effectiveDocument.components['comp-edit-title'] &&
    store.getState().pendingDelete === null &&
    !store.getState().toast?.action,
    'review lock created a human delete operation, confirmation, or Undo action',
  )

  store.getState().rejectChangeSet()
  store.getState().requestHumanDelete(
    { type: 'removeComponent', componentId: 'comp-edit-title' },
    'Delete component',
  )
  const deleteUndoBeforeReview = store.getState().toast.id
  const secondReview = store.getState().beginChangeSet('AI review blocks delete Undo')
  store.getState().runToastAction(deleteUndoBeforeReview)
  assert(
    store.getState().activeChangeSet?.id === secondReview.id &&
    store.getState().activeChangeSet?.version === 0 &&
    store.getState().activeChangeSet?.operations.length === 0 &&
    !store.getState().effectiveDocument.components['comp-edit-title'] &&
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
    placements('comp-list-section') === 'inside,before,after',
    'container did not expose inside and sibling positions',
  )
  assert(
    placements('comp-list-title') === 'before,after',
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
    'comp-list-title',
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
  store.getState().setSelectedComponent(command.componentId)
  assert(
    store.getState().history.length === beforeHistory + 1 &&
      store.getState().document.components[beforeTarget.parentId].childIds[0] ===
        command.componentId &&
      store.getState().ui.selectedComponentId === command.componentId,
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
    'comp-list-section',
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
    getComponentDisplayLabel(document.components['comp-edit-section']) === 'Task details form',
    'container label did not use its editor description',
  )
  const undescribedContainer = clone(document.components['comp-edit-section'])
  undescribedContainer.common.description = ''
  assert(
    getComponentDisplayLabel(undescribedContainer) === 'Container',
    'container label did not preserve its localized fallback',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-task-title-input']) === 'Task title',
    'input label did not use its visible label',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-save-btn']) === 'Save task',
    'button label did not use its visible label',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-actions']) === 'Task form actions',
    'container label did not use its editor description',
  )
  assert(
    getComponentDisplayLabel(undescribedContainer, 'ja') === 'コンテナ',
    'container fallback did not use the selected locale',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-edit-page'], 'ja') === 'ページ',
    'page label did not use the selected locale',
  )
  const longText = clone(document.components['comp-list-title'])
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
        'Page > Task details form > Task form actions > Save task',
    'deep component context did not preserve its screen and real parent hierarchy',
  )
  assert(
    getComponentSelectionContext(
      document,
      'comp-list-loading-alert',
      'en',
      document.screenStates['state-list-loading'],
    )?.targetLabel === 'Loading tasks...',
    'selection context did not use the active state semantic label',
  )
  assert(
    getComponentSelectionContext(document, 'comp-save-btn', 'ja')
      ?.hierarchy.slice(0, -1).map(item => item.label).join(' > ') ===
      'ページ > Task details form > Task form actions',
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
  const alertCommand = createAddComponentCommand(
    store.getState().effectiveDocument,
    'screen-edit',
    modalCommand.componentId,
    'alert',
    'en',
  )
  store.getState().dispatch(alertCommand, 'Add Alert')
  const modalContext = getComponentSelectionContext(
    store.getState().effectiveDocument,
    alertCommand.componentId,
    'en',
  )
  assert(
    modalContext?.screenName === 'Edit Task' &&
      modalContext.hierarchy.map(item => item.label).join(' > ') ===
        `Modal ${modalNumber} > Message`,
    'modal breadcrumb mixed the page tree into its independent hierarchy',
  )

  store.getState().setActiveScreen('screen-edit')
  const historyBeforeSelection = store.getState().history.length
  store.getState().setSelectedComponent(alertCommand.componentId)
  assert(
    store.getState().history.length === historyBeforeSelection,
    'breadcrumb-style selection created a document history operation',
  )
  store.getState().dispatch(
    { type: 'removeComponent', componentId: modalCommand.componentId },
    'Remove Modal',
  )
  assert(
    store.getState().ui.selectedComponentId === null,
    'removing a selected hierarchy left a dangling selection',
  )
  store.getState().undo()
  assert(
    store.getState().ui.selectedComponentId === null &&
      store.getState().document.components[alertCommand.componentId],
    'Undo restored a dangling selection instead of only restoring the hierarchy',
  )

  memoryStorage.clear()
  const changeSetStore = await freshStore('inspector-selection-change-set')
  changeSetStore.getState().setActiveScreen('screen-edit')
  const selectionReview = changeSetStore.getState().beginChangeSet('Inspector selection reconcile')
  const proposed = createAddComponentCommand(
    changeSetStore.getState().effectiveDocument,
    'screen-edit',
    'comp-edit-section',
    'button',
    'en',
  )
  changeSetStore.getState().dispatchToChangeSet(selectionReview.id, proposed)
  changeSetStore.getState().setSelectedComponent(proposed.componentId)
  assert(
    changeSetStore.getState().activeChangeSet?.operations.length === 1 &&
      changeSetStore.getState().activeChangeSet?.operations[0].source === 'agent',
    'selection changed active change set operations',
  )
  changeSetStore.getState().rejectChangeSet()
  assert(
    changeSetStore.getState().ui.selectedComponentId === null,
    'Reject left a selection pointing at a rejected component',
  )
  const selectionAccept = changeSetStore.getState().beginChangeSet('Inspector selection accept')
  changeSetStore.getState().dispatchToChangeSet(selectionAccept.id, proposed)
  changeSetStore.getState().setSelectedComponent(proposed.componentId)
  changeSetStore.getState().acceptChangeSet()
  assert(
    changeSetStore.getState().ui.selectedComponentId === proposed.componentId,
    'Accept discarded the valid selected component',
  )
  changeSetStore.getState().undo()
  assert(
    changeSetStore.getState().ui.selectedComponentId === null,
    'Undo left a selection pointing at the removed accepted component',
  )
  changeSetStore.getState().redo()
  changeSetStore.getState().setSelectedComponent(proposed.componentId)
  changeSetStore.getState().setActiveScreen('screen-list')
  assert(
    changeSetStore.getState().ui.selectedComponentId === null,
    'screen switching retained a selection from another screen',
  )

  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  assert(
    inspectorSource.includes('getComponentSelectionContext') &&
      inspectorSource.includes("aria-current={isCurrent ? 'page' : undefined}") &&
      inspectorSource.includes('onClick={() => setSelectedComponent(item.componentId)}') &&
      inspectorSource.includes("t('inspector.breadcrumbLabel')"),
    'Inspector breadcrumb lost its derived, accessible selection path',
  )
})

await test('Tree state presentation uses effective values and atomic override resets', async () => {
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
    'comp-task-assignee-select',
  )
  assert(reset, 'existing Select override did not produce a reset command')
  store.getState().dispatch(reset, 'Reset Assignee override')
  assert(
    store.getState().history.length === beforeResetHistory + 1 &&
      !store.getState().document.screenStates[success.id]
        .componentOverrides['comp-task-assignee-select'] &&
      store.getState().document.screenStates[success.id]
        .componentOverrides['comp-status-alert'] &&
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

await test('Inspector keeps base values separate from field-level state overrides', async () => {
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
      'comp-status-alert': {
        ...initialSuccessState.componentOverrides['comp-status-alert'],
        message: 'Task saved successfully.',
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
      'comp-status-alert': {
        ...reviewSuccess.componentOverrides['comp-status-alert'],
        message: 'Task saved successfully.',
      },
    },
  }, 'Set review baseline message')
  const overrideReview = changeSetStore.getState().beginChangeSet('Edit one override field')
  const changeSet = createSetComponentOverrideFieldCommand(
    changeSetStore.getState().effectiveDocument.screenStates['state-edit-success'],
    'comp-status-alert',
    'message',
    'Preview-only message',
  )
  changeSetStore.getState().dispatchToChangeSet(overrideReview.id, changeSet)
  assert(
    changeSetStore.getState().activeChangeSet?.operations.length === 1 &&
      changeSetStore.getState().document.screenStates['state-edit-success']
        .componentOverrides['comp-status-alert'].message === 'Task saved successfully.' &&
      changeSetStore.getState().effectiveDocument.screenStates['state-edit-success']
        .componentOverrides['comp-status-alert'].message === 'Preview-only message',
    'field override bypassed active change set preview routing',
  )
  changeSetStore.getState().rejectChangeSet()
  assert(
    changeSetStore.getState().effectiveDocument.screenStates['state-edit-success']
      .componentOverrides['comp-status-alert'].message === 'Task saved successfully.',
    'Reject did not restore the prior field override',
  )
  const overrideAccept = changeSetStore.getState().beginChangeSet('Accept one override field')
  const accepted = createSetComponentOverrideFieldCommand(
    changeSetStore.getState().effectiveDocument.screenStates['state-edit-success'],
    'comp-status-alert',
    'message',
    'Accepted message',
  )
  changeSetStore.getState().dispatchToChangeSet(overrideAccept.id, accepted)
  changeSetStore.getState().acceptChangeSet()
  assert(
    changeSetStore.getState().document.screenStates['state-edit-success']
      .componentOverrides['comp-status-alert'].message === 'Accepted message',
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
  const contentKinds = new Set(['text', 'textInput', 'select', 'button', 'alert'])
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
  preview.components['comp-task-title-input'].common.description = 'Changed by AI'
  preview.components['comp-task-title-input'].config.placeholder = 'Updated placeholder'
  preview.components['comp-task-title-input'].config.validationRules = [{
    id: 'rule-ai',
    type: 'required',
    message: 'Required',
  }]
  preview.screenStates['state-edit-success'].componentOverrides['comp-task-title-input'] = {
    value: 'Preview name',
  }
  preview.components['comp-actions'].config.gap = 'lg'
  preview.components['comp-save-btn'].config.eventId = null

  const inputMarkers = inspectorSectionChangeCounts(
    base,
    preview,
    'comp-task-title-input',
    'state-edit-success',
  )
  const layoutMarkers = inspectorSectionChangeCounts(
    base,
    preview,
    'comp-actions',
    'state-edit-success',
  )
  const behaviorMarkers = inspectorSectionChangeCounts(
    base,
    preview,
    'comp-save-btn',
    'state-edit-success',
  )
  assert(
    inputMarkers.basic > 0 &&
      inputMarkers.content > 0 &&
      inputMarkers.validation > 0 &&
      inputMarkers.stateOverrides > 0 &&
      layoutMarkers.layout > 0 &&
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
    trigger: { type: 'click', componentId: 'comp-task-launch-title' },
    actions: [{ type: 'navigate', destinationScreenId: 'screen-edit' }],
  }
  base.events['event-open-docs-task'] = {
    id: 'event-open-docs-task',
    screenId: 'screen-list',
    name: 'Open documentation task',
    trigger: { type: 'click', componentId: 'comp-task-docs-title' },
    actions: [{ type: 'navigate', destinationScreenId: 'screen-edit' }],
  }
  base.events['event-cancel-edit'] = {
    id: 'event-cancel-edit',
    screenId: 'screen-edit',
    name: 'Cancel editing',
    trigger: { type: 'click', componentId: 'comp-cancel-btn' },
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
      listToEdit?.transitions.length === 4 &&
      listToEdit.transitions[0].eventId === 'event-open-launch-task' &&
      listToEdit.transitions[1].eventId === 'event-open-docs-task' &&
      listToEdit.transitions.every(transition =>
        transition.actionIndex === 0 &&
        transition.triggerResolved &&
        transition.target.route === '/tasks/:taskId') &&
      editToList?.transitions.length === 2 &&
      editToList.transitions[0].triggerComponentId === 'comp-cancel-btn',
    'screen flow lost screen order, duplicate edges, routes, triggers, or action order',
  )

  const withSelfLoop = structuredClone(base)
  withSelfLoop.events['event-refresh-list'] = {
    id: 'event-refresh-list',
    screenId: 'screen-list',
    name: 'Refresh list route',
    trigger: { type: 'click', componentId: 'comp-list-title' },
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
      unresolvedEdge.transitions.length === 4,
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
    defaultStateId: 'unused-state',
    stateIds: [],
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
    trigger: { type: 'click', componentId: 'comp-list-title' },
    actions: [
      { type: 'navigate', destinationScreenId: 'screen-edit' },
      { type: 'setState', stateId: 'state-list-loading' },
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
    trigger: { type: 'click', componentId: 'comp-list-title' },
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
      flowSource.includes('setSelectedComponent(transition.triggerComponentId)') &&
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
    'comp-list-section',
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
        { type: 'showAlert', componentId: 'comp-status-alert' },
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
        change.after.fullText.includes('Show alert') &&
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
      componentId: 'comp-list-title',
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
      'comp-list-section',
      'comp-list-title',
      'comp-list-summary',
      'comp-create-task-btn',
      'comp-list-loading-alert',
      'comp-list-empty-alert',
      'comp-list-error-alert',
      'comp-list-grid',
      'comp-task-launch-card',
      'comp-task-launch-title',
      'comp-task-launch-meta',
      'comp-edit-launch-task-btn',
      'comp-task-docs-card',
      'comp-task-docs-title',
      'comp-task-docs-meta',
      'comp-edit-docs-task-btn',
      'comp-retry-tasks-btn',
      'comp-create-modal',
      'comp-create-modal-content',
      'comp-create-modal-title',
      'comp-new-task-title-input',
      'comp-create-task-progress-alert',
      'comp-create-task-error-alert',
      'comp-create-modal-actions',
      'comp-cancel-create-task-btn',
      'comp-submit-create-task-btn',
    ].join(','),
    'visible Tree order does not follow the expanded hierarchy',
  )

  const collapsedIds = new Set(['comp-list-grid'])
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
      'comp-list-section',
      'comp-list-title',
      'comp-list-summary',
      'comp-create-task-btn',
      'comp-list-loading-alert',
      'comp-list-empty-alert',
      'comp-list-error-alert',
      'comp-list-grid',
      'comp-retry-tasks-btn',
      'comp-create-modal',
      'comp-create-modal-content',
      'comp-create-modal-title',
      'comp-new-task-title-input',
      'comp-create-task-progress-alert',
      'comp-create-task-error-alert',
      'comp-create-modal-actions',
      'comp-cancel-create-task-btn',
      'comp-submit-create-task-btn',
    ].join(',') &&
      intent('ArrowDown', 'comp-list-title')?.componentId === 'comp-list-summary' &&
      intent('ArrowUp', 'comp-list-grid')?.componentId === 'comp-list-error-alert' &&
      intent('Home', 'comp-list-grid')?.componentId === 'comp-list-page' &&
      intent('End', 'comp-list-page')?.componentId === 'comp-submit-create-task-btn',
    'Tree previous/next/Home/End navigation does not use visible items',
  )
  assert(
    intent('ArrowRight', 'comp-list-grid')?.type === 'expand' &&
      intent('ArrowRight', 'comp-list-section', expandedIds, new Set())?.componentId ===
        'comp-list-title' &&
      intent('ArrowLeft', 'comp-list-section', expandedIds, new Set())?.type === 'collapse' &&
      intent('ArrowLeft', 'comp-list-title', expandedIds, new Set())?.componentId ===
        'comp-list-section' &&
      intent('Enter', 'comp-list-title')?.type === 'select' &&
      intent(' ', 'comp-list-title')?.type === 'select',
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
    dropZoneSource.includes('const showAffordance = validDrag') &&
      dropZoneSource.includes("data-drop-outcome={validDrag ? accepts ? 'allowed' : 'invalid' : undefined}"),
    'drop affordances do not distinguish active valid and invalid targets',
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

await test('Canvas leaf chrome stays transient while Containers expose structure', async () => {
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
      canvasSource.includes(
        'className={styles.containerIdentity} data-container-identity aria-hidden="true"',
      ) &&
      canvasSource.includes('data-container-component='),
    'Canvas does not separate transient leaf labels from persistent Container identity',
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
      canvasStyles.includes('.containerIdentity') &&
      canvasStyles.includes("width: 100%") &&
      canvasStyles.includes('@media (forced-colors: active)'),
    'Container structure has no persistent boundary, empty height, identity, or forced-color fallback',
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
    canvasSource.includes('{...(!isRoot && !reviewLocked ? attributes : {})}') &&
      canvasSource.includes('{...(!isRoot && !reviewLocked ? listeners : {})}') &&
      canvasSource.includes('tabIndex={isRoot || reviewLocked ? -1 : 0}') &&
      canvasSource.includes("data-canvas-draggable={!isRoot && !reviewLocked || undefined}") &&
      canvasSource.includes("data-drag-surface={!isRoot && !reviewLocked ? 'canvas' : undefined}") &&
      canvasSource.includes(
        "aria-label={isRoot || reviewLocked ? displayName : t('canvas.dragAria', { label: displayName })}",
      ),
    'non-root Canvas wrappers are not accessible whole-surface drag activators',
  )
  assert(
    canvasSource.includes('disabled: { draggable: isRoot || reviewLocked, droppable: true }') &&
      canvasSource.includes('if (!isRoot && !reviewLocked) listeners?.onPointerDown?.(event)') &&
      canvasSource.includes('if (!isRoot && !reviewLocked) listeners?.onTouchStart?.(event)') &&
    canvasSource.match(
      /onKeyDown=\{event => \{[\s\S]*?if \(active\) return\s*event\.stopPropagation\(\)/,
    ) &&
    canvasSource.includes('if (!isRoot && !reviewLocked) listeners?.onKeyDown?.(event)') &&
    canvasSource.match(/onPointerDown=\{event => \{\s*event\.stopPropagation\(\)/),
    'root gating or nested activator event isolation is missing',
  )
  assert(
    dndSource.includes('PointerSensor, { activationConstraint: { distance: 5 } }') &&
      dndSource.includes('KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }') &&
      dndSource.includes("return collisionArguments.pointerCoordinates\n            ? []\n            : closestCenter"),
    'click separation or keyboard DnD sensor support is missing',
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
  assert(
    canvasSource.includes('horizontalListSortingStrategy') &&
      canvasSource.includes('rectSortingStrategy') &&
      canvasSource.includes('orientation={dropOrientation}') &&
      canvasSource.includes("'--layout-columns'"),
    'container layout does not select matching sorting, drop orientation, and column settings',
  )
  assert(
    canvasStyles.includes('.horizontalChildren') &&
      canvasStyles.includes('flex-direction: row') &&
      canvasStyles.includes('.gridChildren') &&
      canvasStyles.includes('grid-template-columns: repeat(var(--layout-columns') &&
      canvasStyles.includes('gap: var(--layout-gap') &&
      canvasStyles.includes('overflow-x: auto'),
    'horizontal and grid layouts are not rendered with gap and narrow-width overflow',
  )
  assert(
    dropZoneStyles.includes('.horizontal') &&
      dropZoneStyles.includes('.grid') &&
      dropZoneStyles.includes('border-left: 2px solid transparent'),
    'horizontal and grid insertion targets do not use layout-specific indicators',
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
    'comp-list-section',
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
      parentId: 'comp-list-section',
      kind: 'layoutPreset',
      config: { kind: 'layoutPreset', gap: 'md' },
    },
    {
      type: 'addComponent',
      componentId: 'incomplete-container',
      screenId: 'screen-list',
      parentId: 'comp-list-section',
      kind: 'container',
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
    'comp-list-section',
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
      componentId: 'comp-list-title',
      patch: { config: { style } },
    })
    assert(
      styled.components['comp-list-title'].config.style === style,
      `Text style ${style} was not accepted by the domain`,
    )
  }

  const loadingState = store.getState().document.screenStates['state-list-loading']
  store.getState().dispatch({
    type: 'updateScreenState',
    stateId: loadingState.id,
    name: loadingState.name,
    description: loadingState.description,
    overrides: {
      ...loadingState.componentOverrides,
      'comp-list-title': { text: 'Loading tasks...' },
    },
  }, 'Set loading title')
  const textRoleReview = store.getState().beginChangeSet('Change text role')
  store.getState().dispatchToChangeSet(textRoleReview.id, {
    type: 'updateComponentSpec',
    componentId: 'comp-list-title',
    patch: { config: { style: 'heading3' } },
  })
  assert(
    store.getState().activeChangeSet.operations.at(-1)?.source === 'agent' &&
      store.getState().effectiveDocument.components['comp-list-title'].config.style === 'heading3',
    'agent Text style edit did not route through the active change set',
  )
  store.getState().acceptChangeSet()
  const reloaded = await freshStore('styled-text-reload')
  assert(
    reloaded.getState().document.components['comp-list-title'].config.style === 'heading3' &&
      reloaded.getState().document.screenStates['state-list-loading']
      .componentOverrides['comp-list-title'].text === 'Loading tasks...',
    'Text style or text state override did not survive reload',
  )

  const legacyDocument = clone(baseline)
  legacyDocument.components['comp-list-title'].kind = 'heading'
  legacyDocument.components['comp-list-title'].config = {
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
      parentId: 'comp-list-section',
      kind: 'heading',
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
    parentId: 'comp-list-section',
    kind: 'heading',
    config: { kind: 'heading', text: 'Legacy heading', level: 2 },
  })
  assert(!webResult.ok, 'WebMCP accepted legacy Heading')
  assert(
    byName('get_pending_change_set').execute({}).data.activeChangeSet.operations.length === 0,
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
  legacyDocument.components['comp-list-title'].name = 'Legacy component name'
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
    addTool.inputSchema.oneOf[0].properties.name === undefined &&
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
    componentId: 'comp-list-title',
    patch: {
      name: 'Legacy component name',
      config: { text: 'Changed' },
    },
  })
  assert(!updateResult.ok, 'WebMCP update accepted legacy component name')
  assert(
    byName('get_pending_change_set').execute({}).data.activeChangeSet.operations.length === 0,
    'legacy component name changed the pending operations',
  )
  const componentResult = byName('get_component').execute({ componentId: 'comp-list-title' })
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
      config: { kind: 'modal', title: 'Legacy modal title', ...layout },
    },
    {
      type: 'updateComponentSpec',
      componentId: 'comp-list-section',
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
    componentId: 'comp-list-section',
    patch: { config: { title: 'Legacy section title' } },
  })
  assert(!updateResult.ok, 'WebMCP update accepted a structural title')
  assert(
    byName('get_pending_change_set').execute({}).data.activeChangeSet.operations.length === 0,
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
    baseline.components['comp-list-title'].config.text === 'Team Tasks' &&
      baseline.components['comp-edit-title'].config.text === 'Edit task',
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

await test('right specification pane resizing clamps and persists safely', async () => {
  const {
    DEFAULT_RIGHT_PANE_WIDTH,
    MIN_RIGHT_PANE_WIDTH,
    RIGHT_PANE_WIDTH_STORAGE_KEY,
    clampRightPaneWidth,
    getRightPaneWidthBounds,
    persistRightPaneWidth,
    resolveInitialRightPaneWidth,
    rightPaneWidthForKey,
  } = await import(moduleUrl(rightPaneWidthBundle, 'right-pane-preference'))
  const values = new Map()
  const storage = {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, value) },
  }

  assert(
    resolveInitialRightPaneWidth(storage, 1440) === DEFAULT_RIGHT_PANE_WIDTH,
    'right pane did not use its wider default',
  )
  values.set(RIGHT_PANE_WIDTH_STORAGE_KEY, '9999')
  assert(
    resolveInitialRightPaneWidth(storage, 1000) === getRightPaneWidthBounds(1000).max,
    'oversized stored width was not clamped',
  )
  values.set(RIGHT_PANE_WIDTH_STORAGE_KEY, '100')
  assert(
    resolveInitialRightPaneWidth(storage, 1000) === MIN_RIGHT_PANE_WIDTH,
    'undersized stored width was not clamped',
  )
  values.set(RIGHT_PANE_WIDTH_STORAGE_KEY, 'NaN')
  assert(
    resolveInitialRightPaneWidth(storage, 1440) === DEFAULT_RIGHT_PANE_WIDTH,
    'invalid stored width did not fall back safely',
  )
  assert(
    resolveInitialRightPaneWidth({
      getItem() { throw new DOMException('Denied', 'SecurityError') },
    }, 1440) === DEFAULT_RIGHT_PANE_WIDTH,
    'right pane storage read failure escaped',
  )
  assert(
    !persistRightPaneWidth({
      setItem() { throw new DOMException('Denied', 'SecurityError') },
    }, 400),
    'right pane storage write failure escaped',
  )
  assert(persistRightPaneWidth(storage, 400), 'right pane width was not persisted')
  assert(values.get(RIGHT_PANE_WIDTH_STORAGE_KEY) === '400', 'persisted width is incorrect')

  assert(
    rightPaneWidthForKey('ArrowLeft', 380, 1440) === 388 &&
      rightPaneWidthForKey('ArrowRight', 380, 1440) === 372 &&
      rightPaneWidthForKey('ArrowRight', 380, 1440, true) === 348,
    'keyboard resize direction or step is incorrect',
  )
  assert(
    rightPaneWidthForKey('Home', 380, 1000) === MIN_RIGHT_PANE_WIDTH &&
      rightPaneWidthForKey('End', 380, 1000) === getRightPaneWidthBounds(1000).max &&
      rightPaneWidthForKey('Escape', 380, 1000) === null,
    'keyboard resize limits or unrelated-key handling is incorrect',
  )
  assert(
    clampRightPaneWidth(380, 900) === getRightPaneWidthBounds(900).max,
    'viewport resize did not preserve the minimum canvas width',
  )

  const appSource = readFileSync(join(root, 'src/app/App.tsx'), 'utf8')
  const appStyles = readFileSync(join(root, 'src/app/App.module.css'), 'utf8')
  assert(
    appSource.includes('role="separator"') &&
      appSource.includes('aria-orientation="vertical"') &&
      appSource.includes('setPointerCapture') &&
      appSource.includes('onPointerCancel={finishRightPaneResize}') &&
      appSource.includes('onLostPointerCapture='),
    'split-pane separator lacks pointer capture cleanup or accessibility metadata',
  )
  assert(
    appStyles.includes('cursor: col-resize') &&
      appStyles.includes('-webkit-user-select: none') &&
      appStyles.includes('user-select: none') &&
      appStyles.includes('@media (max-width: 899px)') &&
      appStyles.includes('display: none'),
    'split-pane feedback or stacked responsive behavior is missing',
  )
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
  const operationCount = pending().operations.length

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
      pending().operations.length === operationCount,
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
  const originalText = store.getState().document.components['comp-list-title'].config.text
  const moveResult = store.getState().dispatch({
    type: 'moveComponent',
    componentId: 'comp-list-grid',
    newParentId: 'comp-list-section',
    position: 0,
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
    componentId: 'comp-list-title',
    patch: { config: { text: fiftyCharacterDraft } },
  }, 'Update text text: comp-list-title')
  assert(textResult, 'committed text draft failed')
  assert(
    store.getState().history.length === 2 &&
      store.getState().history[0].label === 'Move summary before text editing' &&
      store.getState().history[1].label.includes('comp-list-title'),
    '50-character draft did not create exactly one targeted history entry',
  )

  store.getState().undo()
  const afterUndo = store.getState()
  const restoredText = afterUndo.document.components['comp-list-title'].config
  assert(
    restoredText.kind === 'text' &&
      restoredText.text === originalText &&
      afterUndo.document.components['comp-list-section'].childIds[0] === 'comp-list-grid' &&
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
    componentId: 'comp-list-title',
    patch: { config: { text: changeSetDraft } },
  }, 'Update text text: comp-list-title')
  const changeSet = reloaded.getState().activeChangeSet
  assert(
    !changeSetResult &&
      changeSet?.id === textReview.id &&
      changeSet.operations.length === 0 &&
      reloaded.getState().document.components['comp-list-title'].config.text !== changeSetDraft &&
      reloaded.getState().effectiveDocument.components['comp-list-title'].config.text !== changeSetDraft,
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
      'activeScreenId',
      'activeStateId',
      'documentView',
      'project',
      'rejectedRecords',
      'revision',
      'screen',
      'screens',
      'selectedComponentId',
    ].sort().join(','),
    'screen context retained a constant policy field or lost a current field',
  )

  const appStoreSource = readFileSync(join(root, 'src/app/appStore.ts'), 'utf8')
  const appStyles = readFileSync(join(root, 'src/app/App.module.css'), 'utf8')
  const toolsSource = readFileSync(join(root, 'src/webmcp/tools.ts'), 'utf8')
  const designSource = readFileSync(join(root, 'docs/MVP_TECHNICAL_DESIGN.md'), 'utf8')
  const readmeSource = readFileSync(join(root, 'README.md'), 'utf8')
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
    readmeSource.includes('active change set中はreview lockとなり') &&
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
    { type: 'showAlert', componentId: 'comp-status-alert' },
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
  const alertAction = expandedSave.events[0].actions[2]
  const navigateAction = expandedSave.events[0].actions[3]
  assert(
    expandedSave.events.length === 2 &&
      new Set(expandedSave.events.map(event => event.id)).size === 2 &&
      expandedSave.events[0].configuredByButton &&
      !expandedSave.events[1].configuredByButton &&
      alertAction.type === 'showAlert' &&
      alertAction.alert.label === 'Task updated successfully.' &&
      navigateAction.type === 'navigate' &&
      navigateAction.screen.label === 'Task List' &&
      navigateAction.screen.route === '/tasks',
    'action targets or event deduplication failed',
  )

  const dangling = structuredClone(expanded)
  dangling.events['event-save-task'].actions = [
    { type: 'setState', stateId: 'missing-state' },
    { type: 'callApi', apiOperationId: 'missing-api' },
    { type: 'showAlert', componentId: 'missing-alert' },
    { type: 'navigate', destinationScreenId: 'missing-screen' },
  ]
  const danglingActions = getComponentBehavior(dangling, 'comp-save-btn', 'en').events[0].actions
  assert(
    danglingActions[0].state.label === null &&
      danglingActions[1].operation.label === null &&
      danglingActions[2].alert.label === null &&
      danglingActions[3].screen.label === null &&
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
    inspectorSource.includes('getComponentBehavior(inspectorDocument, comp.id, locale)') &&
      inspectorSource.includes('eventEditor={eventEditor}') &&
      detailsSource.includes('data-behavior-specification') &&
      detailsSource.includes('missingReference(operation.id, t)'),
    'Inspector does not render the effective behavior projection with visible fallbacks',
  )
})

await test('Event editor saves validated ordered actions as one human operation', async () => {
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
    { type: 'showAlert', componentId: 'comp-status-alert' },
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
        .join(',') === 'navigate,showAlert,callApi,setState',
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
      context.alerts.map(alert => alert.id).join(',') ===
        'comp-saving-alert,comp-status-alert,comp-save-error-alert' &&
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
    ['non-alert component', {
      ...updateCommand,
      actions: [{ type: 'showAlert', componentId: 'comp-task-title-input' }],
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
    store.getState().document.components['comp-task-title-input'].config.validationRules,
  )

  const editedRules = [
    { id: 'vr-1', type: 'required', message: 'Task title is required' },
    { id: 'vr-new', type: 'minLength', value: 2, message: 'Enter at least 2 characters' },
    { id: 'vr-2', type: 'maxLength', value: 80, message: 'Enter no more than 80 characters' },
  ]
  const updateCommand = {
    type: 'updateComponentSpec',
    componentId: 'comp-task-title-input',
    patch: { config: { validationRules: editedRules } },
  }
  const beforeRevision = store.getState().document.revision
  const beforeHistory = store.getState().history.length
  assert(
    store.getState().dispatch(updateCommand, 'Edit validation rules'),
    'validation rules update failed',
  )
  assert(
    store.getState().document.revision === beforeRevision + 1 &&
      store.getState().history.length === beforeHistory + 1 &&
      store.getState().document.components['comp-task-title-input'].config.validationRules
        .map(rule => `${rule.type}:${rule.value ?? ''}`)
        .join(',') === 'required:,minLength:2,maxLength:80',
    'validation rules draft did not commit as one ordered history entry',
  )
  store.getState().undo()
  assert(
    JSON.stringify(
      store.getState().document.components['comp-task-title-input'].config.validationRules,
    ) === JSON.stringify(original),
    'Undo did not restore validation rules before editing',
  )
  store.getState().redo()
  assert(
    store.getState().document.components['comp-task-title-input'].config.validationRules.length === 3,
    'Redo did not restore the edited validation rules',
  )

  const context = getValidationRulesEditorContext(
    store.getState().effectiveDocument,
    'comp-task-title-input',
    'en',
  )
  assert(
    context?.supportsValidationEditing === true &&
      context.label === 'Task title' &&
      context.rules.length === 3,
    'validation rules editor context was not resolved correctly for a textInput',
  )
  assert(
    getValidationRulesEditorContext(
      store.getState().effectiveDocument,
      'comp-task-assignee-select',
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
        componentId: 'comp-task-title-input',
        patch: { config: { validationRules: rules } },
      })
    } catch {
      rejected = true
    }
    assert(rejected, `${label} validation rules were accepted`)
  }

  const reordered = [
    ...store.getState().document.components['comp-task-title-input'].config.validationRules,
  ].reverse()
  const reorderedResult = applyCommandWithoutRevision(store.getState().document, {
    type: 'updateComponentSpec',
    componentId: 'comp-task-title-input',
    patch: { config: { validationRules: reordered } },
  })
  assert(
    reorderedResult.components['comp-task-title-input'].config.validationRules
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
      changeSetStore.getState().document.components['comp-task-title-input'].config.validationRules
        .length === original.length &&
      changeSetStore.getState().effectiveDocument.components['comp-task-title-input'].config
        .validationRules.length === 3,
    'agent validation rules edit did not remain one effective-only change set operation',
  )
  const changeSetReload = await freshStore('validation-rules-change-set-reload')
  assert(
    changeSetReload.getState().activeChangeSet?.operations.length === 1 &&
      changeSetReload.getState().effectiveDocument.components['comp-task-title-input'].config
        .validationRules.length === 3,
    'validation rules edit did not survive active change set reload',
  )
  changeSetReload.getState().rejectChangeSet()
  assert(
    changeSetReload.getState().document.components['comp-task-title-input'].config.validationRules
      .length === original.length,
    'Reject did not discard the agent validation rules edit',
  )
  const validationAccept = changeSetReload.getState().beginChangeSet('Accept validation rules edit')
  changeSetReload.getState().dispatchToChangeSet(validationAccept.id, updateCommand)
  changeSetReload.getState().acceptChangeSet()
  assert(
    changeSetReload.getState().activeChangeSet === null &&
      changeSetReload.getState().document.components['comp-task-title-input'].config.validationRules
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
    componentId: 'comp-list-title',
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
      active.version === 0 && active.operations.length === 0,
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
    { componentId: 'comp-list-title', labels: ['inspector.textStyle'] },
    { componentId: 'comp-task-title-input', labels: ['inspector.inputType'] },
    { componentId: 'comp-task-assignee-select', labels: ['inspector.defaultValue'] },
    { componentId: 'comp-save-btn', labels: ['inspector.variant'] },
    { componentId: 'comp-status-alert', labels: ['inspector.tone'] },
    {
      componentId: 'comp-list-page',
      labels: ['inspector.layout', 'inspector.gap', 'inspector.justify', 'inspector.alignment'],
    },
    {
      componentId: 'comp-list-section',
      labels: ['inspector.layout', 'inspector.gap', 'inspector.justify', 'inspector.alignment'],
    },
    {
      componentId: 'comp-list-grid',
      labels: [
        'inspector.layout',
        'inspector.gap',
        'inspector.columns',
        'inspector.justify',
        'inspector.alignment',
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
        'comp-task-assignee-select',
        locale,
        1,
        'state-edit-success',
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

  const multipleHtml = renderInspector('comp-list-grid', 'en', 2)
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
    }],
    ['ja', {
      leftPane: 'プロジェクトナビゲーション',
      rightPane: '詳細',
      rightTabs: '詳細表示',
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
    for (const rootId of ['comp-edit-page', 'comp-discard-modal']) {
      assert(
        document.querySelector(`[data-component-id="${rootId}"]`)?.getAttribute('tabindex') === '-1',
        `${locale} ${rootId} remains a dead stop in the sequential tab order`,
      )
    }
    assert(
      document.querySelector('[data-component-id="comp-task-title-input"]')?.getAttribute('tabindex') === '-1' &&
        !document.querySelector('[data-component-id="comp-task-title-input"]')?.hasAttribute('role'),
      `${locale} review-mode canvas component remains a dead keyboard stop`,
    )
  }
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
        'Components removed: 3',
        'Events removed: 2',
        'Event actions removed: 3',
        'State overrides removed: 3',
      ]),
    'delete dialog has no accessible name, description, or impact details',
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
