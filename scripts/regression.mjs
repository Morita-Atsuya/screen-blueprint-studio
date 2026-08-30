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
const rightPaneWidthBundle = join(temp, 'rightPaneWidth.mjs')
const textDraftBundle = join(temp, 'textDraft.mjs')
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
bundle('src/app/rightPaneWidth.ts', rightPaneWidthBundle)
bundle('src/components/textDraft.ts', textDraftBundle)

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

await test('broken pending change sets never block or mutate confirmed data', async () => {
  memoryStorage.clear()
  const seedStore = await freshStore('broken-change-set-seed')
  seedStore.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Confirmed before broken proposal',
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
      `${testCase.name} did not surface the discarded proposal`,
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

await test('failed broken-change-set cleanup stays non-blocking and explicit', async () => {
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
  assert(state.activeChangeSet === null, 'cleanup write failure restored the broken proposal')
  assert(
    JSON.stringify(state.document) === JSON.stringify(confirmed),
    'cleanup write failure changed confirmed data',
  )
  assert(state.persistenceUnavailable, 'cleanup write failure did not expose persistence failure')
  assert(
    state.startupNotice?.key === 'app.invalidChangeSetDiscardFailed',
    'cleanup write failure did not explain that the proposal remains in storage',
  )
  assert(memoryStorage.getItem(storageKey) === raw, 'cleanup write failure altered the stored payload')

  memoryStorage.throwOnSetKeys.delete(storageKey)
  const retryStore = await freshStore('broken-cleanup-write-retry')
  assert(retryStore.getState().recoveryState === null, 'cleanup retry entered recovery')
  assert(retryStore.getState().activeChangeSet === null, 'cleanup retry restored the broken proposal')
  assert(
    retryStore.getState().startupNotice?.key === 'app.invalidChangeSetDiscarded',
    'cleanup retry did not report successful discard',
  )
  assert(
    !('activeChangeSet' in JSON.parse(memoryStorage.getItem(storageKey))),
    'cleanup retry left the broken proposal in storage',
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

  store.getState().dispatch({
    type: 'moveComponent',
    componentId: 'comp-list-grid',
    newParentId: 'comp-list-section',
    position: 0,
  }, 'Move component')
  store.getState().undo()
  assert(
    store.getState().document.components['comp-list-section'].childIds[1] === 'comp-list-grid',
    'move Undo failed',
  )
  store.getState().redo()
  assert(
    store.getState().document.components['comp-list-section'].childIds[0] === 'comp-list-grid',
    'move Redo failed',
  )

  store.getState().setSelectedComponent('comp-list-active')
  store.getState().dispatch({
    type: 'removeComponent',
    componentId: 'comp-list-active',
  }, 'Delete component')
  assert(store.getState().ui.selectedComponentId === null, 'delete did not reconcile selection')
  store.getState().undo()
  assert(store.getState().document.components['comp-list-active'], 'delete Undo did not restore component')
  store.getState().redo()
  assert(
    store.getState().document.components['comp-list-active'] === undefined &&
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
  reviewStore.getState().beginChangeSet('Accept branches history')
  reviewStore.getState().dispatch({
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
        componentId: 'comp-list-title',
        patch: { name: { invalid: true } },
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
        requestBinding: { componentId: 'comp-name-input', targetPath: 'value' },
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
      componentId: 'comp-name-input',
      patch: { config: { requestBinding: { componentId: 'ghost', targetPath: 'value' } } },
    }],
    ['update_component_spec', {
      ...common,
      componentId: 'comp-name-input',
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
      ),
    'WebMCP does not distinguish modal root creation from child creation',
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
    'WebMCP accepted a nested modal or changed the proposal after rejection',
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
  assert(resolution.ok && resolution.position === 0, 'drop position was not resolved')
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
    document.screens['screen-list'].modalComponentIds.join(',') === 'modal-root' &&
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
      name: 'User List',
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
    document.screens['screen-list'].modalComponentIds.length === 0 &&
      !document.components['modal-root'] &&
      !document.components['modal-button'] &&
      !document.events['event-modal-button'] &&
      !document.screenStates['state-modal-hidden'].componentOverrides['modal-button'],
    'modal subtree removal left roots, descendants, or references behind',
  )

  store.getState().beginChangeSet('Add modal frame')
  store.getState().dispatch({
    type: 'addComponent',
    componentId: 'human-modal-root',
    screenId: 'screen-list',
    parentId: null,
    kind: 'modal',
    config: { kind: 'modal', ...layout },
  })
  const state = store.getState()
  assert(
    state.activeChangeSet.operations.at(-1)?.source === 'human' &&
      state.effectiveDocument.screens['screen-list'].modalComponentIds.includes('human-modal-root') &&
      !state.document.screens['screen-list'].modalComponentIds.includes('human-modal-root'),
    'human modal addition did not route through the active change set',
  )
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
      componentId: 'comp-list-title',
      newParentId: 'comp-edit-section',
      position: 0,
    },
    {
      type: 'moveComponent',
      componentId: 'comp-name-input',
      newParentId: 'comp-edit-section',
      position: 1,
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
    ['comp-list-title', 'comp-edit-section'],
    ['comp-name-input', 'comp-edit-section', 1],
  ]
  for (const [componentId, parentId, position = 0] of invalidDrops) {
    const parent = baseline.components[parentId]
    const resolution = resolveComponentDrop(baseline, componentId, {
      type: 'component-drop',
      parentId,
      screenId: parent.screenId,
      position,
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
          text: 'Users loaded.',
        },
      },
    }, 'Update state')
    const updated = store.getState().document.screenStates['state-human-error']
    assert(
      updated.name === 'Request complete' &&
        updated.description === 'Updated in the human UI' &&
        updated.componentOverrides['comp-list-title'].text === 'Users loaded.',
      'state metadata or overrides were not updated',
    )

    const { effectiveComponent } = await import(moduleUrl(selectorsBundle, 'state-override-preview'))
    const effectiveText = effectiveComponent(
      store.getState().document.components['comp-list-title'],
      updated,
    )
    assert(
      effectiveText.config.text === 'Users loaded.' &&
        effectiveText.common.enabled === false,
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
})

await test('component display labels separate structure from visible content', async () => {
  memoryStorage.clear()
  const { getComponentDisplayLabel } = await import(
    moduleUrl(componentDisplayLabelBundle, 'visible-component-labels')
  )
  const store = await freshStore('visible-component-labels')
  const document = store.getState().document

  assert(
    getComponentDisplayLabel(document.components['comp-edit-page']) === 'Page',
    'page label did not use its structural kind fallback',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-edit-section']) === 'Section',
    'section label did not use its structural kind fallback',
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
    getComponentDisplayLabel(document.components['comp-actions']) === 'Container',
    'container label did not use its kind fallback',
  )
  assert(
    getComponentDisplayLabel(document.components['comp-actions'], 'ja') === 'コンテナ',
    'container label did not use the selected locale',
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

await test('Canvas component chrome stays outside the idle preview flow', async () => {
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

  assert(
    !canvasSource.includes('COMPONENT_KIND_MESSAGE_KEYS') &&
      !canvasSource.includes('styles.componentKind') &&
      canvasSource.includes('<span className={styles.componentLabel}>{displayName}</span>'),
    'Canvas still renders kind labels instead of semantic floating labels',
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
    canvasSource.includes('{...(!isRoot ? attributes : {})}') &&
      canvasSource.includes('{...(!isRoot ? listeners : {})}') &&
      canvasSource.includes("data-canvas-draggable={!isRoot || undefined}") &&
      canvasSource.includes("data-drag-surface={!isRoot ? 'canvas' : undefined}") &&
      canvasSource.includes("aria-label={!isRoot ? t('canvas.dragAria'"),
    'non-root Canvas wrappers are not accessible whole-surface drag activators',
  )
  assert(
    canvasSource.includes('disabled: { draggable: isRoot, droppable: true }') &&
      canvasSource.includes('if (!isRoot) listeners?.onPointerDown?.(event)') &&
      canvasSource.includes('if (!isRoot) listeners?.onTouchStart?.(event)') &&
    canvasSource.match(/onKeyDown=\{event => \{\s*if \(active\) return\s*event\.stopPropagation\(\)/) &&
    canvasSource.includes('if (!isRoot) listeners?.onKeyDown?.(event)') &&
    canvasSource.match(/onPointerDown=\{event => \{\s*event\.stopPropagation\(\)/),
    'root gating or nested activator event isolation is missing',
  )
  assert(
    dndSource.includes('PointerSensor, { activationConstraint: { distance: 5 } }') &&
      dndSource.includes('KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }'),
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
      dndSource.includes("drag.kind === 'modal' ? null : target.parentId") &&
      dndSource.includes("drag.kind === 'modal' ? undefined : target.position"),
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
      inspectorSource.includes("t('inspector.layoutTitle')"),
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
  const kinds = PALETTE_ITEMS.map(item => item.kind)
  assert(kinds.includes('section') && kinds.includes('container'), 'semantic containers are missing from palette')
  assert(kinds.length === 8, 'palette exposes an unexpected component kind')

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

  const changeSet = store.getState().beginChangeSet('Human layout adjustment')
  store.getState().dispatch({
    type: 'updateComponentSpec',
    componentId: containerCommand.componentId,
    patch: { config: { layout: 'horizontal', wrap: true, justify: 'between' } },
  }, 'Adjust layout')
  const active = store.getState().activeChangeSet
  assert(
    active?.id === changeSet.id &&
      active.operations.at(-1)?.source === 'human' &&
      store.getState().effectiveDocument.components[containerCommand.componentId].config.layout === 'horizontal',
    'human layout edit did not join the active change set',
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

  store.getState().beginChangeSet('Change text role')
  store.getState().dispatch({
    type: 'updateComponentSpec',
    componentId: 'comp-list-title',
    patch: { config: { style: 'heading3' } },
  }, 'Update text display style')
  assert(
    store.getState().activeChangeSet.operations.at(-1)?.source === 'human' &&
      store.getState().effectiveDocument.components['comp-list-title'].config.style === 'heading3',
    'human Text style edit did not route through the active change set',
  )
  store.getState().acceptChangeSet()
  const reloaded = await freshStore('styled-text-reload')
  assert(
    reloaded.getState().document.components['comp-list-title'].config.style === 'heading3' &&
      reloaded.getState().document.screenStates['state-list-loading']
        .componentOverrides['comp-list-title'].text === 'Loading users...',
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

  const canvasSource = readFileSync(join(root, 'src/features/canvas/Canvas.tsx'), 'utf8')
  const canvasStyles = readFileSync(join(root, 'src/features/canvas/Canvas.module.css'), 'utf8')
  const inspectorSource = readFileSync(join(root, 'src/features/inspector/Inspector.tsx'), 'utf8')
  assert(
    styles.every(style => canvasSource.includes(`'${style}'`) || canvasStyles.includes(`.${style}`)) &&
      canvasSource.includes("? 'h1'") &&
      canvasSource.includes("? 'h2'") &&
      canvasSource.includes("? 'h3'") &&
      canvasSource.includes("? 'small'") &&
      canvasSource.includes(": 'p'"),
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
      treeSource.includes("t('canvas.modalFrameLabel'"),
    'Page and modal editor frames do not use contextual editor-only labels',
  )
  assert(
    baseline.components['comp-list-title'].config.text === 'User List' &&
      baseline.components['comp-edit-title'].config.text === 'User Details',
    'sample visible structure was not represented by styled Text children',
  )
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
      store.getState().ui.rightPanelTab === 'changes',
    'begin change set did not reveal and select Changes',
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
  const baseSelect = store.getState().document.components['comp-role-select']
  const successState = store.getState().document.screenStates['state-edit-success']

  assert(
    baseSelect.config.kind === 'select' &&
      baseSelect.config.defaultValue === 'member' &&
      baseSelect.config.options.some(option => option.value === 'admin'),
    'sample Select does not define options and a valid default value',
  )
  const effectiveSuccessSelect = effectiveComponent(baseSelect, successState)
  assert(
    effectiveSuccessSelect.config.kind === 'select' &&
      effectiveSuccessSelect.config.defaultValue === 'admin' &&
      baseSelect.config.defaultValue === 'member',
    'Select override did not produce an immutable effective selected value',
  )

  const invalidCommands = [
    {
      type: 'updateScreenState',
      stateId: 'state-edit-success',
      overrides: {
        ...successState.componentOverrides,
        'comp-role-select': { value: 'owner' },
      },
    },
    {
      type: 'updateComponentSpec',
      componentId: 'comp-role-select',
      patch: {
        config: {
          options: [{ value: 'member', label: 'Member' }],
        },
      },
    },
    {
      type: 'updateComponentSpec',
      componentId: 'comp-role-select',
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
      'comp-role-select': { value: 'admin' },
    },
  }, 'Set Select state value')
  store.getState().setActiveState(savingState.id)
  const effectiveSavingSelect = effectiveComponent(
    store.getState().document.components['comp-role-select'],
    store.getState().document.screenStates[savingState.id],
  )
  assert(
    effectiveSavingSelect.config.kind === 'select' &&
      effectiveSavingSelect.config.defaultValue === 'admin',
    'valid Select state override was not applied',
  )

  const reloaded = await freshStore('select-state-effective-reload')
  const reloadedSelect = effectiveComponent(
    reloaded.getState().document.components['comp-role-select'],
    reloaded.getState().document.screenStates[savingState.id],
  )
  assert(
    reloadedSelect.config.kind === 'select' &&
      reloadedSelect.config.defaultValue === 'admin',
    'Select state override did not survive reload',
  )

  reloaded.getState().beginChangeSet('Human Select override')
  const confirmedSavingValue =
    reloaded.getState().document.screenStates[savingState.id]
      .componentOverrides['comp-role-select'].value
  reloaded.getState().dispatch({
    type: 'updateScreenState',
    stateId: savingState.id,
    overrides: {
      ...reloaded.getState().effectiveDocument.screenStates[savingState.id].componentOverrides,
      'comp-role-select': { value: 'member' },
    },
  }, 'Edit Select override during review')
  assert(
    reloaded.getState().activeChangeSet?.operations.at(-1)?.source === 'human' &&
      reloaded.getState().document.screenStates[savingState.id]
        .componentOverrides['comp-role-select'].value === confirmedSavingValue &&
      reloaded.getState().effectiveDocument.screenStates[savingState.id]
        .componentOverrides['comp-role-select'].value === 'member',
    'human Select override did not remain inside the active change set',
  )

  memoryStorage.clear()
  const persistedStore = await freshStore('select-invalid-persistence-seed')
  const invalidDocument = clone(persistedStore.getState().document)
  invalidDocument.screenStates['state-edit-success']
    .componentOverrides['comp-role-select'].value = 'owner'
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
      'comp-role-select': { value: 'admin' },
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
        'comp-role-select': { value: 'owner' },
      },
    }],
    ['update_component_spec', {
      ...common,
      expectedChangeSetVersion: 1,
      componentId: 'comp-role-select',
      patch: {
        config: {
          options: [{ value: 'member', label: 'Member' }],
        },
      },
    }],
    ['update_component_spec', {
      ...common,
      expectedChangeSetVersion: 1,
      componentId: 'comp-role-select',
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

  const canvasSource = readFileSync(join(root, 'src/features/canvas/Canvas.tsx'), 'utf8')
  const treeSource = readFileSync(
    join(root, 'src/features/structure-tree/StructureTree.tsx'),
    'utf8',
  )
  const inspectorSource = readFileSync(
    join(root, 'src/features/inspector/Inspector.tsx'),
    'utf8',
  )
  const toolsSource = readFileSync(join(root, 'src/webmcp/tools.ts'), 'utf8')
  assert(
    canvasSource.includes('value={cfg.defaultValue}') &&
      !canvasSource.includes('override?.value') &&
      !canvasSource.includes('stateOverride'),
    'Canvas still bypasses the effective Select config',
  )
  assert(
    treeSource.includes('effectiveComponent(baseComponent, activeState)') &&
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
  }, 'Update screen name: User List')
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
    route: '/users',
  }, 'Update screen route: Edit User')
  assert(
    !duplicateRoute &&
      reloaded.getState().document.screens['screen-edit'].route === '/users/:id/edit' &&
      reloaded.getState().history.length === historyBeforeInvalidRoute &&
      reloaded.getState().errorMessage !== null,
    'duplicate route was reported as a successful text commit',
  )

  reloaded.getState().beginChangeSet('Atomic human text edit')
  let proposalDraft = ''
  for (let index = 0; index < 50; index += 1) proposalDraft += String.fromCharCode(65 + (index % 26))
  const proposalResult = reloaded.getState().dispatch({
    type: 'updateComponentSpec',
    componentId: 'comp-list-title',
    patch: { config: { text: proposalDraft } },
  }, 'Update text text: comp-list-title')
  const proposal = reloaded.getState().activeChangeSet
  assert(
    proposalResult &&
      proposal?.operations.length === 1 &&
      proposal.operations[0].source === 'human',
    '50-character draft did not create exactly one human change-set operation',
  )
  const invalidProposalRoute = reloaded.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-edit',
    route: '/users',
  }, 'Update screen route: Edit User')
  assert(
    !invalidProposalRoute && reloaded.getState().activeChangeSet?.operations.length === 1,
    'invalid route was added to the active change set',
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
      draftSource.includes('onBlur: commitDraft') &&
      draftSource.includes("window.addEventListener('beforeunload', flush)") &&
      draftSource.includes("window.addEventListener('pagehide', flush)") &&
      draftSource.includes('window.sessionStorage.setItem(storageKey(draftId)') &&
      draftSource.includes('onCompositionStart: handleCompositionStart') &&
      draftSource.includes('draftCache.set(draftId'),
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

await test('AI writes expose only the change-set review flow', async () => {
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
  store.getState().beginChangeSet('Reviewed AI edit')
  store.getState().dispatch({
    type: 'updateScreen',
    screenId: 'screen-list',
    name: 'Human adjustment in review',
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
      'activeScreenId',
      'activeStateId',
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
      readmeSource.includes('承認・却下は人間向けUIからのみ行います'),
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
      appStyles.includes('background: var(--danger)') &&
      !appStyles.includes('#3730a3') &&
      !appStyles.includes('#991b1b') &&
      !appStyles.includes('#7f1d1d'),
    'App shell retains hard-coded colors that duplicate existing light-theme tokens',
  )
})

console.log(`\n${passed} regression groups passed`)
rmSync(temp, { recursive: true, force: true })
