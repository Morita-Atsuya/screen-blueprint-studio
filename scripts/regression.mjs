import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

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

function bundle(entry, output) {
  execFileSync(
    join(root, 'node_modules', '.bin', 'esbuild'),
    [join(root, entry), '--bundle', '--platform=node', '--format=esm', `--outfile=${output}`],
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
const componentDisplayLabelBundle = join(temp, 'componentDisplayLabel.mjs')
const selectorsBundle = join(temp, 'selectors.mjs')
const messagesBundle = join(temp, 'messages.mjs')
const localeBundle = join(temp, 'locale.mjs')
bundle('src/app/appStore.ts', appStoreBundle)
bundle('src/webmcp/tools.ts', toolsBundle)
bundle('src/domain/applyCommand.ts', domainBundle)
bundle('src/features/screens/screenNaming.ts', screenNamingBundle)
bundle('src/features/palette/componentFactory.ts', componentFactoryBundle)
bundle('src/dnd/editorDnd.ts', editorDndBundle)
bundle('src/app/editorShortcuts.ts', editorShortcutsBundle)
bundle('src/domain/componentDisplayLabel.ts', componentDisplayLabelBundle)
bundle('src/domain/selectors.ts', selectorsBundle)
bundle('src/i18n/messages.ts', messagesBundle)
bundle('src/i18n/locale.ts', localeBundle)

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
    assert(store.getState().ui.rightPanelTab === 'changes', 'change set did not open the Changes tab')
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
  assert(writeFailureStore.getState().errorMessage !== null, 'history save failure did not set a warning')
  const reloadedStore = await freshStore('rejected-write-failure-reload')
  assert(reloadedStore.getState().activeChangeSet === null, 'failed history save restored rejected proposal')
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
  assert(afterRemovalReload.getState().activeChangeSet === null, 'removed stale proposal was restored')
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
  assert(guardedReload.getState().activeChangeSet === null, 'rejected ID guard restored stale proposal')
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
  assert(memoryStorage.getItem(storageKey) === null, 'stale proposal survived both rejection write failures')
  assert(bothWritesFailStore.getState().activeChangeSet === null, 'both write failures restored active state')
  assert(bothWritesFailStore.getState().persistenceUnavailable, 'both write failures were not surfaced')
  assert(typeof bothWritesFailStore.getState().exportCurrentData === 'function', 'confirmed JSON cannot be exported')
})

await test('recovery blocks mutations and exposes only recovery context', async () => {
  memoryStorage.clear()
  const baselineStore = await freshStore('recovery-gate-baseline')
  const poisoned = clone(baselineStore.getState().document)
  poisoned.components['comp-list-heading'].name = { poison: true }
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
  const changeSet = firstStore.getState().beginChangeSet('Reload proposal')
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

await test('malformed active change sets enter recovery state', async () => {
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
    assert(store.getState().recoveryState !== null, `case ${index} did not enter recovery`)
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
    assert(store.getState().recoveryState !== null, `dangerous replay ${index} did not enter recovery`)
    assert(({}).name === undefined, `dangerous replay ${index} modified Object.prototype`)
  }
})

await test('poisoned component config and default overrides enter recovery state', async () => {
  localStorage.clear()
  const baselineStore = await freshStore('poisoned-baseline')
  const baseline = clone(baselineStore.getState().document)
  const poisonedDocuments = []

  const objectText = clone(baseline)
  objectText.components['comp-list-heading'].config.text = { evil: 1 }
  poisonedDocuments.push(objectText)

  const invalidLevel = clone(baseline)
  invalidLevel.components['comp-list-heading'].config.level = 99
  poisonedDocuments.push(invalidLevel)

  const foreignConfigKey = clone(baseline)
  foreignConfigKey.components['comp-list-heading'].config.evil = true
  poisonedDocuments.push(foreignConfigKey)

  const invalidOverride = clone(baseline)
  invalidOverride.screenStates['state-list-loading'].componentOverrides['comp-list-heading'] = {
    value: 'not valid for a heading',
  }
  poisonedDocuments.push(invalidOverride)

  const defaultOverride = clone(baseline)
  defaultOverride.screenStates['state-list-default'].componentOverrides['comp-list-heading'] = {
    text: 'not allowed',
  }
  poisonedDocuments.push(defaultOverride)

  const invalidCommonType = clone(baseline)
  invalidCommonType.components['comp-list-heading'].common.visible = 'yes'
  poisonedDocuments.push(invalidCommonType)

  const foreignCommonKey = clone(baseline)
  foreignCommonKey.components['comp-list-heading'].common.evil = true
  poisonedDocuments.push(foreignCommonKey)

  const invalidTrigger = clone(baseline)
  invalidTrigger.events['event-submit'].trigger.type = 'hover'
  poisonedDocuments.push(invalidTrigger)

  const invalidAction = clone(baseline)
  invalidAction.events['event-submit'].actions = [{ type: 'unknown', value: true }]
  poisonedDocuments.push(invalidAction)

  const foreignActionKey = clone(baseline)
  foreignActionKey.events['event-submit'].actions[0].evil = true
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
    requestBindings: [{ componentId: 'comp-name-input', targetPath: { evil: true } }],
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

  for (const schemaVersion of ['1', null, 2]) {
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
  componentName.components['comp-list-heading'].name = { invalid: true }
  poisonedDocuments.push(componentName)
  const componentKeyMismatch = clone(baseline)
  componentKeyMismatch.components['comp-list-heading'].id = 'different-component-id'
  poisonedDocuments.push(componentKeyMismatch)
  const stateDescription = clone(baseline)
  stateDescription.screenStates['state-list-loading'].description = { invalid: true }
  poisonedDocuments.push(stateDescription)
  const stateKind = clone(baseline)
  stateKind.screenStates['state-list-loading'].kind = 'pending'
  poisonedDocuments.push(stateKind)
  const dangerousMapKey = clone(baseline)
  Object.defineProperty(dangerousMapKey.components, '__proto__', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {
      ...dangerousMapKey.components['comp-list-heading'],
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

await test('UI references reconcile after preview, accept, initialization, and undo', async () => {
  memoryStorage.clear()
  const previewStore = await freshStore('ui-reconcile-preview')
  previewStore.getState().setActiveScreen('screen-edit')
  previewStore.getState().setActiveState('state-edit-saving')
  previewStore.getState().setSelectedComponent('comp-name-input')
  const changeSet = previewStore.getState().beginChangeSet('Remove active screen')
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

  const stored = JSON.parse(memoryStorage.getItem(storageKey))
  stored.activeScreenId = 'ghost-screen'
  memoryStorage.setItem(storageKey, JSON.stringify(stored))
  const restoredStore = await freshStore('ui-reconcile-initialization')
  assert(restoredStore.getState().ui.activeScreenId === 'screen-list', 'initialization retained a missing screen')
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

await test('undo allocates a monotonically increasing revision', async () => {
  localStorage.clear()
  const store = await freshStore('undo-revision')
  const revisions = [store.getState().document.revision]

  store.getState().dispatch({ type: 'updateScreen', screenId: 'screen-list', name: 'First edit' })
  revisions.push(store.getState().document.revision)
  store.getState().dispatch({ type: 'updateScreen', screenId: 'screen-list', name: 'Second edit' })
  revisions.push(store.getState().document.revision)
  store.getState().undo()
  revisions.push(store.getState().document.revision)
  store.getState().dispatch({ type: 'updateScreen', screenId: 'screen-list', name: 'After undo' })
  revisions.push(store.getState().document.revision)

  assert(
    revisions.every((revision, index) => index === 0 || revision > revisions[index - 1]),
    `revisions were not monotonic: ${revisions.join(', ')}`,
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
    path: '/users',
    requestBindings: [{ componentId: 'comp-name-input', targetPath: 'name' }],
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
    document.events['event-submit'].actions.every(action => action.type !== 'setState'),
    'setState action was not cleared',
  )

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

await test('component request bindings reject invalid targets and clean up on removal', async () => {
  memoryStorage.clear()
  const store = await freshStore('component-binding-cleanup')
  store.getState().dispatch({
    type: 'updateComponentSpec',
    componentId: 'comp-email-input',
    patch: {
      config: {
        requestBinding: { componentId: 'comp-name-input', targetPath: 'name' },
      },
    },
  })
  store.getState().dispatch({ type: 'removeComponent', componentId: 'comp-name-input' })
  assert(
    store.getState().document.components['comp-email-input'].config.requestBinding === null,
    'component requestBinding was not cleared when its target was removed',
  )

  const reloadedStore = await freshStore('component-binding-cleanup-reload')
  assert(
    reloadedStore.getState().document.components['comp-email-input'].config.requestBinding === null,
    'cleaned component requestBinding was not persisted',
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
        componentId: 'comp-list-heading',
        patch: { name: { invalid: true } },
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
        kind: 'heading',
        config: { kind: 'heading', text: 'Wrong', level: 2 },
      },
      {
        type: 'addComponent',
        componentId: '__proto__',
        screenId: 'screen-list',
        parentId: 'comp-list-page',
        kind: 'heading',
        config: { kind: 'heading', text: 'Wrong', level: 2 },
      },
      {
        type: 'addComponent',
        componentId: 'cross-screen-component',
        screenId: 'screen-edit',
        parentId: 'comp-list-page',
        kind: 'heading',
        config: { kind: 'heading', text: 'Wrong', level: 2 },
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
      trigger: { type: 'click', componentId: 'comp-list-heading' },
      actions: [{ type: 'setState', stateId: 'state-edit-default' }],
    },
    {
      type: 'connectEvent',
      eventId: 'cross-api',
      screenId: 'screen-list',
      name: 'Cross API',
      trigger: { type: 'click', componentId: 'comp-list-heading' },
      actions: [{ type: 'callApi', apiOperationId: 'edit-api' }],
    },
    {
      type: 'connectEvent',
      eventId: 'cross-alert',
      screenId: 'screen-list',
      name: 'Cross alert',
      trigger: { type: 'click', componentId: 'comp-list-heading' },
      actions: [{ type: 'showAlert', componentId: 'edit-alert' }],
    },
    {
      type: 'bindApiOperation',
      operationId: 'cross-binding',
      screenId: 'screen-list',
      name: 'Cross binding',
      method: 'POST',
      path: '/users',
      requestBindings: [{ componentId: 'comp-name-input', targetPath: 'name' }],
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

await test('ten tools register and invalid writes fail without adding operations', async () => {
  localStorage.clear()
  const module = await import(moduleUrl(toolsBundle, 'invalid-writes'))
  const tools = module.WEBMCP_TOOLS
  assert(tools.length === 10, `expected 10 tools, got ${tools.length}`)

  const registered = []
  document.modelContext = { registerTool: tool => registered.push(tool) }
  module.registerWebMCPTools()
  assert(registered.length === 10, `expected 10 registered tools, got ${registered.length}`)

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
      kind: 'heading',
      config: { kind: 'heading', text: 'Ghost', level: 2 },
    }],
    ['change_component_structure', { ...common, operation: 'remove', componentId: 'ghost' }],
    ['change_component_structure', {
      ...common,
      operation: 'add',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'heading',
      config: { kind: 'heading', text: { evil: 1 }, level: 2 },
    }],
    ['change_component_structure', {
      ...common,
      operation: 'add',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'heading',
      config: { kind: 'heading', text: 'Bad', level: 99 },
    }],
    ['change_component_structure', {
      ...common,
      operation: 'add',
      screenId: 'screen-list',
      parentId: 'comp-list-page',
      kind: 'heading',
      config: { kind: 'heading', text: 'Bad', level: 2, evil: true },
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
        requestBinding: { componentId: 'comp-name-input', targetPath: 'value' },
      },
    }],
    ['update_component_spec', { ...common, componentId: 'ghost', patch: { name: 'Ghost' } }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-heading',
      patch: { config: { text: { evil: 1 } } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-heading',
      patch: { config: { level: 99 } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-heading',
      patch: { config: { evil: true } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-heading',
      patch: { config: { requestBinding: { componentId: 'ghost', targetPath: 'value' } } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-name-input',
      patch: { config: { requestBinding: { componentId: 'ghost', targetPath: 'value' } } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-name-input',
      patch: { config: { requestBinding: { componentId: 'comp-list-heading', targetPath: 'value' } } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-heading',
      patch: { common: { visible: 'yes' } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-heading',
      patch: { common: { evil: true } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-heading',
      patch: { common: 'wrong type' },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-list-heading',
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
      kind: 'success',
      overrides: {
        'comp-list-heading': { value: 'not valid for a heading' },
      },
    }],
    ['upsert_screen_state', {
      ...common,
      operation: 'create',
      screenId: 'screen-list',
      name: 'Object override',
      kind: 'success',
      overrides: {
        'comp-list-heading': { text: { evil: 1 } },
      },
    }],
    ['upsert_screen_state', {
      ...common,
      operation: 'update',
      stateId: 'state-list-default',
      overrides: {
        'comp-list-heading': { text: 'default override' },
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
      trigger: { type: 'hover', componentId: 'comp-list-heading' },
      actions: [],
    }],
    ['connect_behavior', {
      ...common,
      operation: 'connectEvent',
      screenId: 'screen-list',
      name: 'Unknown action',
      trigger: { type: 'click', componentId: 'comp-list-heading' },
      actions: [{ type: 'unknown', value: true }],
    }],
    ['connect_behavior', {
      ...common,
      operation: 'connectEvent',
      screenId: 'screen-list',
      name: 'Foreign action key',
      trigger: { type: 'click', componentId: 'comp-list-heading' },
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
      requestBindings: [{ componentId: 'comp-list-heading', targetPath: { evil: true } }],
    }],
    ['connect_behavior', {
      ...common,
      operation: 'bindApi',
      screenId: 'screen-list',
      name: 'Cross screen API',
      method: 'POST',
      path: '/cross',
      requestBindings: [{ componentId: 'comp-name-input', targetPath: 'name' }],
    }],
  ]

  for (const [toolName, input] of invalidCases) {
    const before = pending().operations.length
    const result = byName(toolName).execute(input)
    assert(!result.ok && result.error.code, `${toolName} returned a false success`)
    assert(pending().operations.length === before, `${toolName} added an invalid operation`)
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
  const context = byName('get_current_screen_context').execute({})
  assert(
    context.ok &&
      Object.keys(context.data.project).sort().join(',') === 'id,name,screenIds',
    'screen context project metadata has an unexpected shape',
  )

  execute('change_screen_structure', { operation: 'add', name: 'Agent screen', route: '/agent' })
  const addedScreenId = latestCommand().screenId
  execute('change_screen_structure', { operation: 'update', screenId: addedScreenId, name: 'Updated agent screen' })
  execute('change_screen_structure', { operation: 'remove', screenId: addedScreenId })

  execute('change_component_structure', {
    operation: 'add',
    screenId: 'screen-list',
    parentId: 'comp-list-page',
    kind: 'heading',
    config: { kind: 'heading', text: 'Agent heading', level: 2 },
  })
  const addedComponentId = latestCommand().componentId
  execute('change_component_structure', {
    operation: 'move',
    componentId: addedComponentId,
    newParentId: 'comp-list-section',
  })
  execute('update_component_spec', {
    componentId: addedComponentId,
    patch: { config: { text: 'Updated heading' } },
  })
  execute('change_component_structure', { operation: 'remove', componentId: addedComponentId })

  execute('upsert_screen_state', {
    operation: 'create',
    screenId: 'screen-list',
    name: 'Agent state',
    kind: 'success',
  })
  const addedStateId = latestCommand().stateId
  execute('upsert_screen_state', {
    operation: 'update',
    stateId: addedStateId,
    kind: 'error',
    description: 'Updated',
    overrides: {
      'comp-list-heading': { text: 'Could not load users.' },
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
    trigger: { type: 'click', componentId: 'comp-list-heading' },
    actions: [{ type: 'callApi', apiOperationId: addedApiId }],
  })
  const addedEventId = latestCommand().eventId
  execute('connect_behavior', { operation: 'removeEvent', eventId: addedEventId })
  execute('connect_behavior', { operation: 'removeApi', operationId: addedApiId })
  execute('upsert_screen_state', { operation: 'remove', stateId: addedStateId })

  assert(pending().operations.length === version, 'operation count and version diverged')
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
  store.getState().dispatch(command, 'Palette drag add')
  assert(
    store.getState().document.components['comp-list-section'].childIds[0] === command.componentId,
    'palette add command did not honor the drop position',
  )

  const resolution = resolveComponentDrop(
    store.getState().document,
    'comp-list-heading',
    {
      type: 'component-drop',
      parentId: 'comp-list-section',
      screenId: 'screen-list',
      position: 0,
      label: 'first',
    },
  )
  assert(resolution.ok && resolution.position === 0, 'drop position was not resolved')
})

await test('component reorder and reparent reject invalid targets', async () => {
  memoryStorage.clear()
  const store = await freshStore('direct-edit-moves')
  const { applyCommandWithoutRevision } = await import(moduleUrl(domainBundle, 'direct-edit-domain'))
  const { resolveComponentDrop } = await import(moduleUrl(editorDndBundle, 'invalid-drops'))
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
    componentId: 'comp-email-input',
    newParentId: 'comp-actions',
    position: 0,
  })
  assert(
    document.components['comp-email-input'].parentId === 'comp-actions' &&
      document.components['comp-actions'].childIds[0] === 'comp-email-input',
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
      newParentId: 'comp-name-input',
      position: 0,
    },
    {
      type: 'moveComponent',
      componentId: 'comp-list-heading',
      newParentId: 'comp-edit-section',
      position: 0,
    },
    {
      type: 'moveComponent',
      componentId: 'comp-name-input',
      newParentId: 'comp-edit-section',
      position: 0,
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

  const invalidDrops = [
    ['comp-edit-page', 'comp-edit-section'],
    ['comp-edit-section', 'comp-actions'],
    ['comp-cancel-btn', 'comp-name-input'],
    ['comp-list-heading', 'comp-edit-section'],
    ['comp-name-input', 'comp-edit-section'],
  ]
  for (const [componentId, parentId] of invalidDrops) {
    const parent = baseline.components[parentId]
    const resolution = resolveComponentDrop(baseline, componentId, {
      type: 'component-drop',
      parentId,
      screenId: parent.screenId,
      position: 0,
      label: 'invalid target',
    })
    assert(!resolution.ok, `invalid UI drop was accepted: ${componentId} -> ${parentId}`)
  }
})

await test('human moves join active change sets and screen management reconciles selection', async () => {
  memoryStorage.clear()
  const proposalStore = await freshStore('direct-edit-change-set')
  const beforeOrder = proposalStore.getState().document.components['comp-actions'].childIds.join(',')
  proposalStore.getState().beginChangeSet('Human direct manipulation')
  proposalStore.getState().dispatch({
    type: 'moveComponent',
    componentId: 'comp-cancel-btn',
    newParentId: 'comp-actions',
    position: 1,
  }, 'Human drag')
  const proposal = proposalStore.getState().activeChangeSet
  assert(
    proposal?.operations.at(-1)?.source === 'human' &&
      proposal.operations.at(-1)?.command.type === 'moveComponent',
    'human drag did not join the active change set',
  )
  assert(
    proposalStore.getState().document.components['comp-actions'].childIds.join(',') === beforeOrder,
    'human drag mutated the confirmed document during review',
  )
  assert(
    proposalStore.getState().effectiveDocument.components['comp-actions'].childIds.join(',') !== beforeOrder,
    'human drag did not update the proposal preview',
  )

  memoryStorage.clear()
  const screenStore = await freshStore('direct-edit-screens')
  screenStore.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-edit',
    name: 'Account editor',
    route: '/accounts/:id',
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
      kind: 'error',
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
      kind: 'success',
      description: 'Updated in the human UI',
      overrides: {
        'comp-list-heading': {
          visible: true,
          enabled: false,
          text: 'Users loaded.',
        },
      },
    }, 'Update state')
    const updated = store.getState().document.screenStates['state-human-error']
    assert(
      updated.kind === 'success' &&
        updated.componentOverrides['comp-list-heading'].text === 'Users loaded.',
      'state metadata or overrides were not updated',
    )

    const { effectiveComponent } = await import(moduleUrl(selectorsBundle, 'state-override-preview'))
    const effectiveHeading = effectiveComponent(
      store.getState().document.components['comp-list-heading'],
      updated,
    )
    assert(
      effectiveHeading.config.text === 'Users loaded.' &&
        effectiveHeading.common.enabled === false,
      'state override was not reflected in the effective component',
    )
    const successAlert = effectiveComponent(
      store.getState().document.components['comp-status-alert'],
      store.getState().document.screenStates['state-edit-success'],
    )
    assert(
      successAlert.common.visible === true &&
        successAlert.config.message === 'User saved successfully.',
      'alert visibility or message override was not reflected in the preview',
    )
    const savingState = store.getState().document.screenStates['state-edit-saving']
    store.getState().dispatch({
      type: 'updateScreenState',
      stateId: savingState.id,
      overrides: {
        ...savingState.componentOverrides,
        'comp-name-input': { value: 'Alex Morgan' },
      },
    }, 'Set state field value')
    const effectiveInput = effectiveComponent(
      store.getState().document.components['comp-name-input'],
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
      kind: 'custom',
    }, 'Invalid default state edit')
    assert(
      store.getState().document.revision === beforeDefaultEdit &&
        store.getState().document.screenStates['state-list-default'].kind === 'default',
      'default state kind was changed',
    )

    const reloaded = await freshStore('human-state-editing-reload')
    assert(
      reloaded.getState().document.screenStates['state-human-error'].name === 'Request complete' &&
        reloaded.getState().document.revision > initialRevision,
      'state edits were not persisted',
    )

    reloaded.getState().beginChangeSet('Human state proposal edit')
    const confirmedDescription =
      reloaded.getState().document.screenStates['state-human-error'].description
    reloaded.getState().dispatch({
      type: 'updateScreenState',
      stateId: 'state-human-error',
      description: 'Edited during review',
    }, 'Edit state in proposal')
    assert(
      reloaded.getState().activeChangeSet?.operations.at(-1)?.source === 'human' &&
        reloaded.getState().document.screenStates['state-human-error'].description ===
          confirmedDescription &&
        reloaded.getState().effectiveDocument.screenStates['state-human-error'].description ===
          'Edited during review',
      'human state edit did not stay inside the active change set',
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
    type: 'removeScreen',
    screenId: 'screen-list',
  })
  assert(
    screenStore.getState().document.screens['screen-edit'].name === 'Account editor' &&
      screenStore.getState().document.screens['screen-list'] === undefined &&
      screenStore.getState().ui.activeScreenId === 'screen-edit',
    'screen edit, delete, or active-screen reconciliation failed',
  )
})

await test('editor shortcuts ignore form controls and resolve standard keys', async () => {
  const { resolveEditorShortcut } = await import(moduleUrl(editorShortcutsBundle, 'shortcut-guards'))
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert(
      resolveEditorShortcut({ key: 'Backspace', target: { tagName } }) === null,
      `${tagName} did not guard Backspace`,
    )
  }
  assert(
    resolveEditorShortcut({ key: 'Delete', target: { tagName: 'DIV' } }) === 'delete-selection',
    'Delete shortcut was not resolved',
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
})

await test('component display labels come from visible specification fields', async () => {
  memoryStorage.clear()
  const { getComponentDisplayLabel } = await import(
    moduleUrl(componentDisplayLabelBundle, 'visible-component-labels')
  )
  const store = await freshStore('visible-component-labels')
  const document = store.getState().document

  assert(
    getComponentDisplayLabel(document.components['comp-edit-page'], 'Fallback screen') === 'Edit User',
    'page label did not use the page title',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-edit-section']) === 'User Details',
    'section label did not use its title',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-name-input']) === 'Name',
    'input label did not use its visible label',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-save-btn']) === 'Save',
    'button label did not use its visible label',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-actions']) === 'Action area',
    'container label did not use its kind fallback',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-actions'], undefined, 'ja') === '操作エリア',
    'container label did not use the selected locale',
  )

  const pageWithoutTitle = clone(document.components['comp-edit-page'])
  pageWithoutTitle.config.title = ' '
  assert(
    getComponentDisplayLabel(pageWithoutTitle, 'Managed screen') === 'Managed screen',
    'page label did not fall back to the screen name',
  )
  const longHeading = clone(document.components['comp-list-heading'])
  longHeading.config.text = '1234567890123456789012345678901234567890'
  assert(
    getComponentDisplayLabel(longHeading).endsWith('…'),
    'long visible text was not truncated',
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
    dropZoneSource.includes('validDrag && accepts'),
    'drop affordance is not gated by an active valid drag',
  )
  assert(
    !inspectorSource.includes('コンポーネント名'),
    'internal component name remains editable in the inspector',
  )
  assert(
    inspectorSource.includes("t('inspector.pageTitle')"),
    'page content title is not clearly labeled in the inspector',
  )
})

await test('column previews and palette drops use layout-specific feedback', async () => {
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
  assert(
    canvasSource.includes("component.config.kind === 'columns'") &&
      canvasSource.includes("'--column-width'") &&
      canvasSource.includes("orientation={isColumns ? 'horizontal' : 'vertical'}"),
    'column children do not select a count-aware horizontal layout and drop orientation',
  )
  assert(
    canvasStyles.includes('.columnChildren') &&
      canvasStyles.includes('flex-direction: row') &&
      canvasStyles.includes('flex: 0 0 var(--column-width)') &&
      canvasStyles.includes('overflow-x: auto'),
    'column children are not equal-width horizontal regions with narrow-width overflow',
  )
  assert(
    dropZoneStyles.includes('.horizontal') &&
      dropZoneStyles.includes('border-left: 2px solid transparent'),
    'horizontal column insertion targets do not use vertical indicators',
  )
  assert(
    dndSource.includes("drag.type === 'palette'") &&
      dndSource.includes('dropAnimation={isPaletteDrag ? null : undefined}'),
    'palette add still uses the move-style overlay drop animation',
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
  legacyDocument.components['comp-list-heading'].name = 'Legacy component name'
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
      kind: 'heading',
      name: 'Legacy component name',
      config: { kind: 'heading', text: 'Legacy', level: 2 },
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
    kind: 'heading',
    name: 'Legacy component name',
    config: { kind: 'heading', text: 'Legacy', level: 2 },
  })
  assert(!addResult.ok, 'WebMCP add accepted legacy component name')
  const updateResult = updateTool.execute({
    ...common,
    componentId: 'comp-list-heading',
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
  const componentResult = byName('get_component').execute({ componentId: 'comp-list-heading' })
  assert(componentResult.ok && !Object.hasOwn(componentResult.data.component, 'name'), 'read tool returned component name')
})

await test('typed localization resolves and persists JA and EN safely', async () => {
  const { translate } = await import(moduleUrl(messagesBundle, 'typed-translations'))
  const { LOCALE_STORAGE_KEY, persistLocale, resolveInitialLocale } = await import(
    moduleUrl(localeBundle, 'locale-storage')
  )
  assert(translate('en', 'tabs.screens') === 'Screens', 'English catalog did not resolve')
  assert(translate('ja', 'tabs.screens') === '画面', 'Japanese catalog did not resolve')
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

console.log(`\n${passed} regression groups passed`)
rmSync(temp, { recursive: true, force: true })
