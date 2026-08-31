import { execFileSync, spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function contrastRatio(first, second) {
  const luminance = color => {
    const values = color.match(/[\d.]+/g).slice(0, 3).map(value => {
      const channel = Number(value) / 255
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]
  }
  const values = [luminance(first), luminance(second)]
    .sort((left, right) => right - left)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

function assertFlowMetadata(labels, expectedTexts, width, locale) {
  assert(
    JSON.stringify(labels.map(label => label.text)) === JSON.stringify(expectedTexts),
    `${width}px ${locale} Flow metadata labels are incomplete`,
  )
  for (const label of labels) {
    assert(
      contrastRatio(label.foreground, label.background) >= 4.5,
      `${width}px ${locale} "${label.text}" contrast is below 4.5:1`,
    )
    assert(
      Math.abs(Number.parseFloat(label.fontSize) - 9.8) < 0.1 &&
        label.fontWeight === '600' &&
        label.columnGap === '8px' &&
        label.rowGap === '3px',
      `${width}px ${locale} "${label.text}" lost its metadata hierarchy metrics`,
    )
  }
}

const smallTextMeasurementExpression = `(() => {
  function renderedBackground(element) {
    const layers = []
    for (let current = element; current; current = current.parentElement) {
      const color = getComputedStyle(current).backgroundColor
      const channels = color?.match(/[\\d.]+/g)?.map(Number)
      if (channels && (channels[3] ?? 1) > 0) {
        layers.push({
          red: channels[0],
          green: channels[1],
          blue: channels[2],
          alpha: channels[3] ?? 1,
        })
      }
    }
    let result = { red: 255, green: 255, blue: 255 }
    for (const layer of layers.reverse()) {
      result = {
        red: layer.red * layer.alpha + result.red * (1 - layer.alpha),
        green: layer.green * layer.alpha + result.green * (1 - layer.alpha),
        blue: layer.blue * layer.alpha + result.blue * (1 - layer.alpha),
      }
    }
    return 'rgb(' + [result.red, result.green, result.blue].map(Math.round).join(', ') + ')'
  }

  function measurement(element, kind) {
    const style = getComputedStyle(element)
    return {
      kind,
      text: element.textContent.trim(),
      foreground: style.color,
      background: renderedBackground(element),
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
    }
  }

  const overrideCard = document.querySelector(
    '[data-state-overrides][data-override-mode="override"]'
  )
  return {
    locale: document.documentElement.lang,
    measurements: [
      measurement(document.querySelector('[data-frame-state-badge]'), 'frame-state-badge'),
      ...[...document.querySelectorAll('[data-event-action-position]')].map(
        element => measurement(element, 'event-action-position')
      ),
      measurement(overrideCard.querySelector('[data-override-heading]'), 'override-heading'),
      measurement(
        overrideCard.querySelector('[data-override-explanation]'),
        'override-explanation'
      ),
    ],
  }
})()`

function assertSmallTextMeasurements(result, width, locale) {
  assert(result.locale === locale, `${width}px small-text measurement used ${result.locale}`)
  const counts = Object.groupBy(result.measurements, item => item.kind)
  assert(
    counts['frame-state-badge']?.length === 1 &&
      counts['event-action-position']?.length === 2 &&
      counts['override-heading']?.length === 1 &&
      counts['override-explanation']?.length === 1,
    `${width}px ${locale} did not reach every small-text contrast surface`,
  )
  for (const item of result.measurements) {
    assert(
      contrastRatio(item.foreground, item.background) >= 4.5,
      `${width}px ${locale} ${item.kind} contrast is below 4.5:1`,
    )
  }
  assert(
    counts['frame-state-badge'][0].fontWeight === '600' &&
      counts['event-action-position'].every(item => item.fontWeight === '700') &&
      counts['override-heading'][0].fontWeight === '600',
    `${width}px ${locale} small-text hierarchy no longer uses weight`,
  )
}

function injectFailure(stage) {
  if (process.env.FOCUS_RING_FAILURE_STAGE === stage) {
    throw new Error(`Injected focus-ring regression failure: ${stage}`)
  }
}

function chromeExecutable() {
  if (process.platform === 'win32') {
    throw new Error(
      'The focus-ring browser regression supports macOS and Linux; ' +
        'Windows process-tree cleanup is not implemented safely.',
    )
  }
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  const executable = candidates.find(candidate => existsSync(candidate))
  if (!executable) {
    throw new Error('Chrome or Chromium is required for the focus-ring browser regression')
  }
  return executable
}

async function freePort() {
  const server = createNetServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  await new Promise((resolveClose, reject) => {
    server.close(error => error ? reject(error) : resolveClose())
  })
  return address.port
}

async function waitForJson(url, timeoutMs = 8_000, abortError) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (abortError?.()) throw abortError()
    try {
      const response = await fetch(url)
      if (response.ok) return response.json()
    } catch (error) {
      lastError = error
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }
  throw new Error(`Chrome DevTools endpoint did not start: ${lastError ?? url}`)
}

function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  let nextId = 0
  const pending = new Map()
  const openPromise = new Promise((resolveOpen, rejectOpen) => {
    const timeout = setTimeout(
      () => rejectOpen(new Error('Chrome DevTools WebSocket did not open')),
      10_000,
    )
    socket.addEventListener('open', () => {
      clearTimeout(timeout)
      resolveOpen()
    }, { once: true })
    socket.addEventListener('error', () => {
      clearTimeout(timeout)
      rejectOpen(new Error('Chrome DevTools WebSocket failed to open'))
    }, { once: true })
  })
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const { resolveCall, rejectCall, method, timeout } = pending.get(message.id)
    pending.delete(message.id)
    clearTimeout(timeout)
    if (message.error) rejectCall(new Error(`${method}: ${JSON.stringify(message.error)}`))
    else if (message.result?.exceptionDetails) {
      rejectCall(new Error(
        `${method}: ${message.result.exceptionDetails.exception?.description ?? 'evaluation failed'}`,
      ))
    }
    else resolveCall(message.result)
  })
  const rejectPending = reason => {
    for (const { rejectCall, timeout } of pending.values()) {
      clearTimeout(timeout)
      rejectCall(reason)
    }
    pending.clear()
  }
  socket.addEventListener('close', () => {
    rejectPending(new Error('Chrome DevTools WebSocket closed'))
  })
  socket.addEventListener('error', () => {
    rejectPending(new Error('Chrome DevTools WebSocket failed'))
  })

  return {
    async open() {
      await openPromise
    },
    call(method, params = {}) {
      return new Promise((resolveCall, rejectCall) => {
        const id = ++nextId
        const timeout = setTimeout(() => {
          pending.delete(id)
          rejectCall(new Error(`${method} timed out: ${JSON.stringify(params)}`))
        }, 10_000)
        pending.set(id, { resolveCall, rejectCall, method, timeout })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
    close() {
      socket.close()
    },
  }
}

async function startStaticServer(port) {
  const dist = join(root, 'dist')
  assert(
    existsSync(join(dist, 'index.html')),
    'built application is required; run npm run build before the regression suite',
  )
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
  }
  const server = createHttpServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1))
    const filePath = resolve(dist, relativePath)
    if (filePath !== dist && !filePath.startsWith(`${dist}${sep}`)) {
      response.writeHead(400).end()
      return
    }
    try {
      const content = await readFile(filePath)
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      })
      response.end(content)
    } catch {
      response.writeHead(404).end()
    }
  })
  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolveListen)
    })
  } catch (error) {
    try {
      server.close()
    } catch {
      // A bind failure can leave the server unstarted; the original error is authoritative.
    }
    throw error
  }
  return server
}

function chromeProcessGroupPids(processGroupId) {
  const rows = execFileSync('ps', ['-axo', 'pid=,pgid='], {
    encoding: 'utf8',
  })
  return rows
    .trim()
    .split('\n')
    .map(row => row.trim().split(/\s+/).map(Number))
    .filter(([, groupId]) => groupId === processGroupId)
    .map(([pid]) => pid)
}

function chromeProcessGroupExists(processGroupId) {
  return chromeProcessGroupPids(processGroupId).length > 0
}

function signalChromeProcessGroup(processGroupId, signal) {
  try {
    process.kill(-processGroupId, signal)
    return
  } catch (error) {
    if (error.code === 'ESRCH') return
    if (error.code !== 'EPERM') throw error
  }
  for (const pid of chromeProcessGroupPids(processGroupId)) {
    try {
      process.kill(pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
}

async function stopChrome(chrome) {
  if (!chrome.pid) return
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    if (!chromeProcessGroupExists(chrome.pid)) return
    signalChromeProcessGroup(chrome.pid, signal)
    const deadline = Date.now() + 1_000
    while (chromeProcessGroupExists(chrome.pid) && Date.now() < deadline) {
      await new Promise(resolveWait => setTimeout(resolveWait, 25))
    }
  }
  if (chromeProcessGroupExists(chrome.pid)) {
    throw new Error('Chrome process group did not exit after SIGTERM and SIGKILL')
  }
}

async function removeProfile(profile, options = {}) {
  const remove = options.remove ?? rmSync
  const exists = options.exists ?? existsSync
  const wait = options.wait ?? (
    milliseconds => new Promise(resolveWait => setTimeout(resolveWait, milliseconds))
  )
  const maxAttempts = options.maxAttempts ?? 40
  const requiredAbsentChecks = options.requiredAbsentChecks ?? 4
  let lastError
  let consecutiveAbsentChecks = 0
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      remove(profile, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 50,
      })
    } catch (error) {
      lastError = error
    }
    await wait(100)
    if (exists(profile)) {
      consecutiveAbsentChecks = 0
    } else {
      consecutiveAbsentChecks += 1
      if (consecutiveAbsentChecks === requiredAbsentChecks) return
    }
  }
  throw lastError ?? new Error(`temporary browser profile still exists: ${profile}`)
}

function throwCleanupErrors(primaryError, cleanupErrors) {
  if (cleanupErrors.length === 0) return
  if (primaryError) {
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      `browser regression failed and cleanup also failed: ${primaryError.message}`,
    )
  }
  throw new AggregateError(cleanupErrors, 'focus-ring browser regression cleanup failed')
}

async function run() {
  let profile
  let server
  let chrome
  let cdp
  let primaryError
  let interruptedError
  const handleSignal = signal => {
    interruptedError ??= new Error(`focus-ring browser regression interrupted by ${signal}`)
    try {
      cdp?.close()
    } catch {
      // The bounded cleanup below remains authoritative.
    }
    if (chrome?.pid) {
      try {
        if (chromeProcessGroupExists(chrome.pid)) {
          signalChromeProcessGroup(chrome.pid, 'SIGTERM')
        }
      } catch {
        // The bounded cleanup below retries with TERM and KILL.
      }
    }
  }
  const signalHandlers = new Map(
    ['SIGINT', 'SIGTERM'].map(signal => [
      signal,
      () => handleSignal(signal),
    ]),
  )
  for (const [signal, handler] of signalHandlers) process.once(signal, handler)

  try {
    const tempRoot = process.env.FOCUS_RING_TEMP_ROOT ?? tmpdir()
    profile = mkdtempSync(join(tempRoot, 'screen-blueprint-focus-'))
    injectFailure('after-profile')
    const debuggingPort = await freePort()
    const appPort = await freePort()
    server = await startStaticServer(appPort)
    injectFailure('after-server')
    const sampleBundle = join(profile, 'sampleProject.mjs')
    execFileSync(join(root, 'node_modules', '.bin', 'esbuild'), [
      join(root, 'src/sample/sampleProject.ts'),
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${sampleBundle}`,
    ], { stdio: 'pipe' })
    const { sampleProject } = await import(pathToFileURL(sampleBundle))
    const browserDocument = structuredClone(sampleProject)
    browserDocument.screenStates['state-edit-saving']
      .componentOverrides['comp-edit-page'] = { visible: false }
    browserDocument.components['comp-cancel-btn'].config.eventId = 'event-flow-regression'
    browserDocument.screens['screen-edit'].eventIds.push('event-flow-regression')
    browserDocument.events['event-flow-regression'] = {
      id: 'event-flow-regression',
      screenId: 'screen-edit',
      name: 'Return to task list',
      trigger: { type: 'click', componentId: 'comp-cancel-btn' },
      actions: [{ type: 'navigate', destinationScreenId: 'screen-list' }],
    }
    const containerLayout = {
      kind: 'container',
      layout: 'vertical',
      gap: 'sm',
      columns: 2,
      justify: 'start',
      align: 'stretch',
      wrap: false,
    }
    browserDocument.components['browser-empty-container'] = {
      id: 'browser-empty-container',
      screenId: 'screen-edit',
      parentId: 'comp-edit-section',
      childIds: [],
      kind: 'container',
      placement: { mode: 'flow' },
      common: { description: 'Empty browser group', visible: true, enabled: true },
      config: { ...containerLayout, layout: 'horizontal' },
    }
    browserDocument.components['browser-nested-container'] = {
      id: 'browser-nested-container',
      screenId: 'screen-edit',
      parentId: 'comp-edit-section',
      childIds: ['browser-inner-container'],
      kind: 'container',
      placement: { mode: 'flow' },
      common: { description: 'Nested browser group', visible: true, enabled: true },
      config: containerLayout,
    }
    browserDocument.components['browser-inner-container'] = {
      id: 'browser-inner-container',
      screenId: 'screen-edit',
      parentId: 'browser-nested-container',
      childIds: [],
      kind: 'container',
      placement: { mode: 'flow' },
      common: { description: 'Inner browser group', visible: true, enabled: true },
      config: containerLayout,
    }
    browserDocument.components['comp-edit-section'].childIds.push(
      'browser-empty-container',
      'browser-nested-container',
      'browser-tree-level-1',
    )
    for (const [id, parentId, childId, description] of [
      ['browser-tree-level-1', 'comp-edit-section', 'browser-tree-level-2', 'Details group'],
      ['browser-tree-level-2', 'browser-tree-level-1', 'browser-tree-level-3', 'Feedback group'],
      ['browser-tree-level-3', 'browser-tree-level-2', 'browser-tree-state-message', 'Status group'],
    ]) {
      browserDocument.components[id] = {
        id,
        screenId: 'screen-edit',
        parentId,
        childIds: [childId],
        kind: 'container',
        placement: { mode: 'flow' },
        common: { description, visible: true, enabled: true },
        config: containerLayout,
      }
    }
    browserDocument.components['browser-tree-state-message'] = {
      id: 'browser-tree-state-message',
      screenId: 'screen-edit',
      parentId: 'browser-tree-level-3',
      childIds: [],
      kind: 'text',
      placement: { mode: 'flow' },
      common: { description: 'Deep review status', visible: false, enabled: false },
      config: { kind: 'text', text: 'Waiting for review', style: 'body' },
    }
    browserDocument.screenStates['state-edit-success'].componentOverrides[
      'browser-tree-state-message'
    ] = { text: 'Ready for review' }
    browserDocument.components['comp-task-docs-title'].config.text =
      'Refresh the complete API documentation and integration reference'
    browserDocument.components['browser-resource-link'] = {
      id: 'browser-resource-link',
      screenId: 'screen-list',
      parentId: 'comp-list-section',
      childIds: [],
      kind: 'link',
      placement: { mode: 'flow' },
      common: {
        description: 'Downloadable resource regression',
        visible: true,
        enabled: true,
      },
      config: {
        kind: 'link',
        label: 'Download board',
        destination: {
          type: 'resource',
          resourceId: 'opaque-board',
          url: './examples/taskflow-board.svg',
          displayName: 'taskflow-board.svg',
        },
        openMode: 'download',
      },
    }
    browserDocument.components['browser-broken-image'] = {
      id: 'browser-broken-image',
      screenId: 'screen-list',
      parentId: 'comp-list-section',
      childIds: [],
      kind: 'image',
      placement: { mode: 'flow' },
      common: {
        description: 'Broken image regression',
        visible: true,
        enabled: true,
      },
      config: {
        kind: 'image',
        source: './examples/missing-image.png',
        alt: 'Unavailable illustration',
        fit: 'contain',
        aspectRatio: '4:3',
        placeholderStyle: 'skeleton',
      },
    }
    browserDocument.components['browser-horizontal-overflow'] = {
      id: 'browser-horizontal-overflow',
      screenId: 'screen-list',
      parentId: 'comp-list-section',
      childIds: Array.from({ length: 6 }, (_, index) => `browser-horizontal-item-${index + 1}`),
      kind: 'container',
      placement: { mode: 'flow' },
      common: {
        description: 'Horizontal overflow regression',
        visible: true,
        enabled: true,
      },
      config: { ...containerLayout, layout: 'horizontal' },
    }
    for (let index = 1; index <= 6; index += 1) {
      const id = `browser-horizontal-item-${index}`
      browserDocument.components[id] = {
        id,
        screenId: 'screen-list',
        parentId: 'browser-horizontal-overflow',
        childIds: [],
        kind: 'text',
        placement: { mode: 'flow' },
        common: {
          description: `Horizontal item ${index}`,
          visible: true,
          enabled: true,
        },
        config: {
          kind: 'text',
          text: `Scrollable item ${index}`,
          style: 'body',
        },
      }
    }
    browserDocument.components['browser-viewport-container'] = {
      id: 'browser-viewport-container',
      screenId: 'screen-list',
      parentId: 'comp-list-section',
      childIds: ['browser-nested-overlay'],
      kind: 'container',
      placement: {
        mode: 'viewport',
        anchor: 'bottomLeft',
        insetX: 'sm',
        insetY: 'sm',
      },
      common: {
        description: 'Projected viewport group',
        visible: true,
        enabled: true,
      },
      config: containerLayout,
    }
    browserDocument.components['browser-nested-overlay'] = {
      id: 'browser-nested-overlay',
      screenId: 'screen-list',
      parentId: 'browser-viewport-container',
      childIds: [],
      kind: 'text',
      placement: {
        mode: 'overlay',
        anchor: 'bottomRight',
        insetX: 'xs',
        insetY: 'xs',
      },
      common: {
        description: 'Nested projected overlay',
        visible: true,
        enabled: true,
      },
      config: {
        kind: 'text',
        text: 'Nested overlay',
        style: 'caption',
      },
    }
    browserDocument.components['comp-create-modal-title'].placement = {
      mode: 'viewport',
      anchor: 'topCenter',
      insetX: 'none',
      insetY: 'sm',
    }
    browserDocument.components['comp-list-section'].childIds.push(
      'browser-resource-link',
      'browser-broken-image',
      'browser-horizontal-overflow',
      'browser-viewport-container',
    )
    const persisted = JSON.stringify({
      document: browserDocument,
      activeScreenId: 'screen-edit',
      activeChangeSet: {
        id: 'focus-ring-browser-regression',
        summary: 'Edge focus regression',
        baseRevision: browserDocument.revision,
        baseDocument: browserDocument,
        operations: [
          {
            id: 'container-affordance-operation',
            source: 'agent',
            command: {
              type: 'updateComponentSpec',
              componentId: 'browser-inner-container',
              patch: { common: { description: 'Inner browser group updated' } },
            },
            issuedAt: '2025-01-01T00:00:00.000Z',
          },
          {
            id: 'tree-state-badge-operation',
            source: 'agent',
            command: {
              type: 'updateComponentSpec',
              componentId: 'browser-tree-state-message',
              patch: { config: { text: 'Agent review pending' } },
            },
            issuedAt: '2025-01-01T00:00:01.000Z',
          },
        ],
        version: 2,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    })
    const appUrl = `http://127.0.0.1:${appPort}/`
    const executable = process.env.FOCUS_RING_FAILURE_STAGE === 'chrome-spawn'
      ? profile
      : chromeExecutable()
    chrome = spawn(executable, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${debuggingPort}`,
      appUrl,
    ], {
      detached: true,
      stdio: 'ignore',
    })
    if (process.env.FOCUS_RING_PID_FILE && chrome.pid) {
      writeFileSync(process.env.FOCUS_RING_PID_FILE, String(chrome.pid))
    }
    const spawnFailure = new Promise(resolveFailure => {
      chrome.once('error', resolveFailure)
    })
    injectFailure('after-chrome')
    if (process.env.FOCUS_RING_FAILURE_STAGE === 'signal') {
      while (!interruptedError) {
        await new Promise(resolveWait => setTimeout(resolveWait, 25))
      }
      throw interruptedError
    }

    const targets = await Promise.race([
      waitForJson(
        `http://127.0.0.1:${debuggingPort}/json`,
        8_000,
        () => interruptedError,
      ),
      spawnFailure.then(error => {
        throw new Error(`Chrome failed to launch: ${error.message}`)
      }),
    ])
    const page = targets.find(target => target.type === 'page' && target.url === appUrl)
    assert(page, 'Chrome did not open the focus-ring regression page')
    cdp = connectCdp(page.webSocketDebuggerUrl)
    await cdp.open()
    await cdp.call('Runtime.enable')
    await cdp.call('Page.enable')

    const waitForExpression = async (expression, failureMessage) => {
      const deadline = Date.now() + 20_000
      while (Date.now() < deadline) {
        if (interruptedError) throw interruptedError
        try {
          const result = await cdp.call('Runtime.evaluate', {
            expression,
            returnByValue: true,
          })
          if (result.result.value) return
        } catch {
          // Navigation can replace the execution context while Chrome starts or reloads.
        }
        await new Promise(resolveWait => setTimeout(resolveWait, 50))
      }
      const diagnostic = await cdp.call('Runtime.evaluate', {
        expression: `({
          url: location.href,
          readyState: document.readyState,
          body: document.body?.innerText?.slice(0, 200),
        })`,
        returnByValue: true,
      }).catch(() => null)
      throw new Error(`${failureMessage}: ${JSON.stringify(diagnostic?.result?.value)}`)
    }
    await waitForExpression(
      `document.readyState === 'complete' && Boolean(document.querySelector('#root > *'))`,
      'initial application UI did not render in Chrome',
    )

    const setup = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        localStorage.setItem('screen-blueprint-studio:v1', ${JSON.stringify(persisted)})
        localStorage.setItem('screen-blueprint-studio:locale:v1', 'en')
        localStorage.removeItem('screen-blueprint-studio:left-pane-width:v1')
        localStorage.setItem('screen-blueprint-studio:right-pane-width:v1', '300')
        localStorage.setItem('screen-blueprint-studio:left-pane-sections:v1', JSON.stringify({
          screensExpanded: true,
          paletteExpanded: true,
        }))
        return true
      })()`,
      returnByValue: true,
    }).catch(error => {
      throw new Error(`browser state setup failed: ${error.message}`)
    })
    assert(setup.result.value === true, 'failed to prepare browser review state')
    await cdp.call('Page.reload')
    await waitForExpression(
      `Boolean(document.querySelector(
        'aside[aria-label="Details"] [role="group"] > button[aria-pressed]'
      ))`,
      'review UI did not render in Chrome',
    )
    const defaultHeaderActions = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const undo = document.querySelector('[data-history-undo]')
        const redo = document.querySelector('[data-history-redo]')
        return {
          resetCount: document.querySelectorAll('[data-sample-reset]').length,
          undoRedoAdjacent: undo?.nextElementSibling === redo,
          labels: [...document.querySelectorAll('header button')].map(
            button => button.getAttribute('aria-label')
          ),
        }
      })()`,
      returnByValue: true,
    })
    assert(
      defaultHeaderActions.result.value.resetCount === 0 &&
        defaultHeaderActions.result.value.undoRedoAdjacent,
      'default Chrome build left a reset focus stop or Undo/Redo gap: ' +
        JSON.stringify(defaultHeaderActions.result.value),
    )

    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })
    let narrowTreeNodeBodyWidth = 0
    for (const locale of ['en', 'ja']) {
      await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const locale = document.querySelector('[data-locale-selector]')
          const prototype = Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            'value'
          )
          prototype.set.call(locale, '${locale}')
          locale.dispatchEvent(new Event('change', { bubbles: true }))
          return true
        })()`,
      })
      await waitForExpression(
        `document.documentElement.lang === '${locale}'`,
        `Tree badge locale did not switch to ${locale}`,
      )
      await cdp.call('Runtime.evaluate', {
        expression: `[...document.querySelectorAll('button')].find(
          button => button.textContent.trim() === 'Success'
        ).click()`,
      })
      await waitForExpression(
        `document.querySelector(
          '[data-tree-component-id="browser-tree-state-message"]'
        )?.getAttribute('data-state-overridden') === 'true'`,
        `deep ${locale} Tree state badges did not render`,
      )
      const badgeResult = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const leftPane = document.querySelector(
            'aside[aria-label="${locale === 'en' ? 'Project navigation' : 'プロジェクトナビゲーション'}"]'
          )
          const tree = leftPane.querySelector('[role="tree"]')
          const node = tree.querySelector(
            '[data-tree-component-id="browser-tree-state-message"]'
          )
          const status = node.querySelector('[data-tree-state-status]')
          const badges = [...status.children].map(badge => {
            const style = getComputedStyle(badge)
            const range = document.createRange()
            range.selectNodeContents(badge)
            const lineTops = new Set(
              [...range.getClientRects()].map(rect => Math.round(rect.top * 10) / 10)
            )
            return {
              text: badge.textContent.trim(),
              whiteSpace: style.whiteSpace,
              overflowWrap: style.overflowWrap,
              lineCount: lineTops.size,
              height: badge.getBoundingClientRect().height,
              lineHeight: parseFloat(style.lineHeight),
              fullTextVisible: badge.scrollWidth <= badge.clientWidth + 1,
              accessibleName: badge.getAttribute('aria-label'),
              title: badge.getAttribute('title'),
            }
          })
          return {
            leftWidth: leftPane.getBoundingClientRect().width,
            leftOverflow: leftPane.scrollWidth - leftPane.clientWidth,
            treeOverflow: tree.scrollWidth - tree.clientWidth,
            nodeBodyWidth: status.parentElement.getBoundingClientRect().width,
            ariaLevel: node.closest('[role="treeitem"]').getAttribute('aria-level'),
            badgeCount: badges.length,
            badges,
            resizeLabels: {
              left: document.querySelector('[data-left-pane-resizer]')
                ?.getAttribute('aria-label'),
              right: document.querySelector('[data-right-pane-resizer]')
                ?.getAttribute('aria-label'),
            },
          }
        })()`,
        returnByValue: true,
      })
      const badgeMeasurement = badgeResult.result.value
      if (locale === 'en') narrowTreeNodeBodyWidth = badgeMeasurement.nodeBodyWidth
      assert(
        badgeMeasurement.leftWidth === 220 &&
          badgeMeasurement.leftOverflow <= 1 &&
          badgeMeasurement.treeOverflow <= 1,
        `deep ${locale} Tree badges introduced horizontal overflow`,
      )
      assert(
        badgeMeasurement.resizeLabels.left === (
          locale === 'en' ? 'Resize project panel' : 'プロジェクトパネルの幅を変更'
        ) &&
          badgeMeasurement.resizeLabels.right === (
            locale === 'en' ? 'Resize specification panel' : '仕様パネルの幅を変更'
          ),
        `pane separators do not expose localized labels in ${locale}`,
      )
      assert(
        badgeMeasurement.ariaLevel === '6' &&
          badgeMeasurement.badgeCount === 4 &&
          badgeMeasurement.badges.every(badge =>
            badge.whiteSpace === 'nowrap' &&
            badge.overflowWrap === 'normal' &&
            badge.lineCount === 1 &&
            badge.height <= badge.lineHeight + 5 &&
            badge.fullTextVisible &&
            badge.accessibleName &&
            badge.title
          ),
        `deep ${locale} Tree badge wrapped or lost accessible text: ` +
          JSON.stringify(badgeMeasurement.badges),
      )
    }
    await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const locale = document.querySelector('[data-locale-selector]')
        const prototype = Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          'value'
        )
        prototype.set.call(locale, 'en')
        locale.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })()`,
    })
    await waitForExpression(
      `document.documentElement.lang === 'en'`,
      'Tree badge regression did not restore English locale',
    )

    const leftResizeStart = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const handle = document.querySelector('[data-left-pane-resizer]')
        const rect = handle.getBoundingClientRect()
        const leftPane = document.querySelector('aside[aria-label="Project navigation"]')
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          handleWidth: rect.width,
          leftWidth: leftPane.getBoundingClientRect().width,
          min: Number(handle.getAttribute('aria-valuemin')),
          max: Number(handle.getAttribute('aria-valuemax')),
          now: Number(handle.getAttribute('aria-valuenow')),
          orientation: handle.getAttribute('aria-orientation'),
        }
      })()`,
      returnByValue: true,
    })
    const leftStart = leftResizeStart.result.value
    assert(
      leftStart.handleWidth === 7 &&
        leftStart.leftWidth === 220 &&
        leftStart.min === 180 &&
        leftStart.max === 480 &&
        leftStart.now === 220 &&
        leftStart.orientation === 'vertical',
      `left pane separator did not preserve its accessible 220px default: ` +
        JSON.stringify(leftStart),
    )
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      buttons: 1,
      clickCount: 1,
      x: leftStart.x,
      y: leftStart.y,
    })
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      button: 'left',
      buttons: 1,
      x: leftStart.x + 120,
      y: leftStart.y,
    })
    await waitForExpression(
      `document.querySelector('[data-left-pane-resizer]')
        ?.getAttribute('aria-valuenow') === '340'`,
      'left pane pointer resize did not reach 340px',
    )
    const activeResize = await cdp.call('Runtime.evaluate', {
      expression: `(() => ({
        active: document.querySelector('[data-left-pane-resizer]')
          .getAttribute('data-resizing'),
        userSelect: getComputedStyle(document.querySelector('#root > *')).userSelect,
      }))()`,
      returnByValue: true,
    })
    assert(
      activeResize.result.value.active === 'true' &&
        activeResize.result.value.userSelect === 'none',
      'left pane pointer resize did not expose active feedback or suppress selection',
    )
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      buttons: 0,
      clickCount: 1,
      x: leftStart.x + 120,
      y: leftStart.y,
    })
    const expandedLeft = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const leftPane = document.querySelector('aside[aria-label="Project navigation"]')
        const rightPane = document.querySelector('aside[aria-label="Details"]')
        const editor = document.querySelector('main')
        const handle = document.querySelector('[data-left-pane-resizer]')
        const status = document.querySelector(
          '[data-tree-component-id="browser-tree-state-message"] [data-tree-state-status]'
        )
        const viewport = document.querySelector('[data-canvas-viewport]').getBoundingClientRect()
        const page = document.querySelector('[data-canvas-frame="page"]').getBoundingClientRect()
        return {
          leftWidth: leftPane.getBoundingClientRect().width,
          rightWidth: rightPane.getBoundingClientRect().width,
          editorWidth: editor.getBoundingClientRect().width,
          nodeBodyWidth: status.parentElement.getBoundingClientRect().width,
          stored: localStorage.getItem('screen-blueprint-studio:left-pane-width:v1'),
          resizing: handle.hasAttribute('data-resizing'),
          leftOverflow: leftPane.scrollWidth - leftPane.clientWidth,
          documentOverflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          canvasReachable:
            page.right > viewport.left + 40 &&
            page.left < viewport.right - 40 &&
            page.bottom > viewport.top + 40 &&
            page.top < viewport.bottom - 40,
        }
      })()`,
      returnByValue: true,
    })
    const expanded = expandedLeft.result.value
    assert(
      expanded.leftWidth === 340 &&
        expanded.rightWidth === 300 &&
        expanded.editorWidth >= 360 &&
        expanded.nodeBodyWidth >= narrowTreeNodeBodyWidth + 119 &&
        expanded.stored === '340' &&
        !expanded.resizing &&
        expanded.leftOverflow <= 1 &&
        expanded.documentOverflow === 0 &&
        expanded.canvasReachable,
      `left pane expansion broke Tree space, pane bounds, or Canvas reachability: ` +
        JSON.stringify(expanded),
    )

    await cdp.call('Runtime.evaluate', {
      expression: `document.querySelector('[data-left-pane-resizer]').focus()`,
    })
    const pressResizeKey = async (key, shiftKey = false) => {
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code: key,
        modifiers: shiftKey ? 8 : 0,
      })
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code: key,
        modifiers: shiftKey ? 8 : 0,
      })
    }
    await pressResizeKey('ArrowLeft')
    await waitForExpression(
      `document.querySelector('[data-left-pane-resizer]')
        ?.getAttribute('aria-valuenow') === '332'`,
      'left pane ArrowLeft did not narrow by one step',
    )
    await pressResizeKey('ArrowRight', true)
    await waitForExpression(
      `document.querySelector('[data-left-pane-resizer]')
        ?.getAttribute('aria-valuenow') === '364'`,
      'left pane Shift+ArrowRight did not widen by a large step',
    )
    await pressResizeKey('Home')
    await waitForExpression(
      `document.querySelector('[data-left-pane-resizer]')
        ?.getAttribute('aria-valuenow') === '180'`,
      'left pane Home did not use its minimum',
    )
    await pressResizeKey('End')
    await waitForExpression(
      `document.querySelector('[data-left-pane-resizer]')
        ?.getAttribute('aria-valuenow') === '480'`,
      'left pane End did not use its maximum',
    )
    const maxLeftHandle = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const handle = document.querySelector('[data-left-pane-resizer]')
        const rect = handle.getBoundingClientRect()
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      })()`,
      returnByValue: true,
    })
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      buttons: 1,
      clickCount: 1,
      x: maxLeftHandle.result.value.x,
      y: maxLeftHandle.result.value.y,
    })
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      button: 'left',
      buttons: 1,
      x: maxLeftHandle.result.value.x - 140,
      y: maxLeftHandle.result.value.y,
    })
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      buttons: 0,
      clickCount: 1,
      x: maxLeftHandle.result.value.x - 140,
      y: maxLeftHandle.result.value.y,
    })
    await waitForExpression(
      `document.querySelector('[data-left-pane-resizer]')
        ?.getAttribute('aria-valuenow') === '340'`,
      'left pane did not restore the persisted smoke width',
    )
    await cdp.call('Page.reload')
    await waitForExpression(
      `document.querySelector('[data-left-pane-resizer]')
        ?.getAttribute('aria-valuenow') === '340'`,
      'left pane preferred width did not survive reload',
    )
    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: 899,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
    const stackedPanes = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const main = document.querySelector('main').parentElement
        const left = document.querySelector('aside[aria-label="Project navigation"]')
        const right = document.querySelector('aside[aria-label="Details"]')
        return {
          leftHandle: getComputedStyle(
            document.querySelector('[data-left-pane-resizer]')
          ).display,
          rightHandle: getComputedStyle(
            document.querySelector('[data-right-pane-resizer]')
          ).display,
          leftWidth: left.getBoundingClientRect().width,
          rightWidth: right.getBoundingClientRect().width,
          mainWidth: main.clientWidth,
          storedLeft: localStorage.getItem('screen-blueprint-studio:left-pane-width:v1'),
          overflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })()`,
      returnByValue: true,
    })
    const stacked = stackedPanes.result.value
    assert(
      stacked.leftHandle === 'none' &&
        stacked.rightHandle === 'none' &&
        Math.abs(stacked.leftWidth - stacked.mainWidth) < 1 &&
        Math.abs(stacked.rightWidth - stacked.mainWidth) < 1 &&
        stacked.storedLeft === '340' &&
        stacked.overflow === 0,
      `899px stacked panes did not hide separators or preserve preference: ` +
        JSON.stringify(stacked),
    )
    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await waitForExpression(
      `document.querySelector('[data-left-pane-resizer]')
        ?.getBoundingClientRect().width === 7 &&
        document.querySelector('[data-left-pane-resizer]')
          ?.getAttribute('aria-valuenow') === '340' &&
        Number(document.querySelector('[data-left-pane-resizer]')
          ?.getAttribute('aria-valuemax')) >= 340 &&
        Number(document.querySelector('[data-right-pane-resizer]')
          ?.getAttribute('aria-valuemax')) > 300`,
      'desktop layout did not restore the preferred left pane width',
    )
    await cdp.call('Runtime.evaluate', {
      expression: `document.querySelector('[data-right-pane-resizer]').focus()`,
    })
    await pressResizeKey('End')
    const coupledBounds = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const left = document.querySelector('aside[aria-label="Project navigation"]')
        const right = document.querySelector('aside[aria-label="Details"]')
        const editor = document.querySelector('main')
        const leftHandle = document.querySelector('[data-left-pane-resizer]')
        const rightHandle = document.querySelector('[data-right-pane-resizer]')
        return {
          left: left.getBoundingClientRect().width,
          right: right.getBoundingClientRect().width,
          editor: editor.getBoundingClientRect().width,
          leftMax: Number(leftHandle.getAttribute('aria-valuemax')),
          rightMax: Number(rightHandle.getAttribute('aria-valuemax')),
          rightNow: Number(rightHandle.getAttribute('aria-valuenow')),
          overflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })()`,
      returnByValue: true,
    })
    const coupled = coupledBounds.result.value
    assert(
      coupled.left === 340 &&
        coupled.right === coupled.rightMax &&
        coupled.rightNow === coupled.rightMax &&
        coupled.editor >= 360 &&
        coupled.left <= coupled.leftMax &&
        coupled.overflow === 0,
      `right pane did not honor dynamic left width and center bounds: ` +
        JSON.stringify(coupled),
    )

    for (const width of [1280, 899, 640]) {
      await cdp.call('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          localStorage.setItem('screen-blueprint-studio:right-pane-width:v1', '520')
          localStorage.setItem('screen-blueprint-studio:canvas-zoom:v1', '1.5')
          return true
        })()`,
      })
      await cdp.call('Page.reload')
      await waitForExpression(
        `document.querySelector(
          '[data-canvas-surface][data-viewport-initialized="true"]'
        )?.getBoundingClientRect().width > 0`,
        `${width}px Canvas initial fit did not finish`,
      )
      const initialFit = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const viewport = document.querySelector('[data-canvas-viewport]')
          const surface = document.querySelector('[data-canvas-surface]')
          const frames = document.querySelector('[data-canvas-frames]')
          const page = document.querySelector('[data-canvas-frame="page"]')
          const viewportRect = viewport.getBoundingClientRect()
          const framesRect = frames.getBoundingClientRect()
          const pageRect = page.getBoundingClientRect()
          const margin = 47
          return {
            viewport: {
              left: viewportRect.left,
              top: viewportRect.top,
              right: viewportRect.right,
              bottom: viewportRect.bottom,
            },
            framesInsideMargin:
              framesRect.left >= viewportRect.left + margin &&
              framesRect.top >= viewportRect.top + margin &&
              framesRect.right <= viewportRect.right - margin &&
              framesRect.bottom <= viewportRect.bottom - margin,
            pageInsideViewport:
              pageRect.left >= viewportRect.left &&
              pageRect.top >= viewportRect.top &&
              pageRect.right <= viewportRect.right &&
              pageRect.bottom <= viewportRect.bottom,
            taskSampleVisible:
              page.textContent.includes('Edit task') &&
              page.textContent.includes('Task title') &&
              page.textContent.includes('Assignee') &&
              page.textContent.includes('Status') &&
              !page.textContent.includes('Priority'),
            scale: new DOMMatrix(getComputedStyle(surface).transform).a,
            transform: surface.style.transform,
            panStart: {
              x: viewportRect.right - 20,
              y: viewportRect.top + 20,
            },
            overflow:
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
          }
        })()`,
        returnByValue: true,
      })
      const fitted = initialFit.result.value
      assert(fitted.framesInsideMargin, `${width}px initial Canvas frames missed the fit margin`)
      assert(fitted.pageInsideViewport, `${width}px initial Page frame remained clipped`)
      assert(fitted.taskSampleVisible, `${width}px TaskFlow edit sample is incomplete or includes Priority`)
      assert(fitted.scale < 1.5, `${width}px oversized persisted zoom was not reduced`)
      assert(fitted.overflow === 0, `${width}px Canvas initial fit introduced document overflow`)

      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        button: 'left',
        buttons: 1,
        clickCount: 1,
        x: fitted.panStart.x,
        y: fitted.panStart.y,
      })
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        button: 'left',
        buttons: 1,
        x: fitted.panStart.x - 60,
        y: fitted.panStart.y + 20,
      })
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button: 'left',
        buttons: 0,
        clickCount: 1,
        x: fitted.panStart.x - 60,
        y: fitted.panStart.y + 20,
      })
      const pannedTransform = await cdp.call('Runtime.evaluate', {
        expression: `document.querySelector('[data-canvas-surface]').style.transform`,
        returnByValue: true,
      })
      assert(
        pannedTransform.result.value !== fitted.transform,
        `${width}px real background pointer drag did not pan`,
      )

      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        button: 'left',
        buttons: 1,
        clickCount: 1,
        x: fitted.panStart.x - 60,
        y: fitted.panStart.y + 20,
      })
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        button: 'left',
        buttons: 1,
        x: fitted.panStart.x,
        y: fitted.panStart.y,
      })
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button: 'left',
        buttons: 0,
        clickCount: 1,
        x: fitted.panStart.x,
        y: fitted.panStart.y,
      })
      const restored = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const surface = document.querySelector('[data-canvas-surface]')
          const viewport = document.querySelector('[data-canvas-viewport]').getBoundingClientRect()
          const page = document.querySelector('[data-canvas-frame="page"]').getBoundingClientRect()
          return {
            transform: surface.style.transform,
            pageInside:
              page.left >= viewport.left &&
              page.top >= viewport.top &&
              page.right <= viewport.right &&
              page.bottom <= viewport.bottom,
          }
        })()`,
        returnByValue: true,
      })
      assert(
        restored.result.value.transform !== pannedTransform.result.value &&
          restored.result.value.pageInside,
        `${width}px reverse background drag could not recover the Page`,
      )
      await cdp.call('Runtime.evaluate', {
        expression: `document.querySelector(
          '[data-component-id="browser-inner-container"]'
        ).click()`,
      })
      await waitForExpression(
        `document.querySelector(
          '[data-component-id="browser-inner-container"]'
        ).hasAttribute('data-editor-selected')`,
        `${width}px nested Container could not be selected`,
      )
      const containerResult = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const empty = document.querySelector(
            '[data-component-id="browser-empty-container"]'
          )
          const nested = document.querySelector(
            '[data-component-id="browser-nested-container"]'
          )
          const inner = document.querySelector(
            '[data-component-id="browser-inner-container"]'
          )
          inner.focus({ preventScroll: true })
          const describe = element => {
            const style = getComputedStyle(element)
            return {
              offsetHeight: element.offsetHeight,
              borderStyle: style.borderStyle,
              borderWidth: style.borderWidth,
              padding: style.padding,
              hasIdentity: Boolean(element.querySelector('[data-container-identity]')),
            }
          }
          const nestedRect = nested.getBoundingClientRect()
          const innerRect = inner.getBoundingClientRect()
          const emptyDropTarget = empty.querySelector(
            '[data-drop-surface="canvas"][data-drop-parent="browser-empty-container"]'
          )
          return {
            empty: describe(empty),
            nested: describe(nested),
            inner: describe(inner),
            nestedIndent: innerRect.left - nestedRect.left,
            emptyDropTarget: {
              exists: Boolean(emptyDropTarget),
              orientation: emptyDropTarget?.getAttribute('data-drop-orientation'),
              width: emptyDropTarget?.offsetWidth,
              height: emptyDropTarget?.offsetHeight,
              expectedWidth: empty.clientWidth - 20,
            },
            innerChanged: inner.getAttribute('data-component-change'),
            changeMarker: Boolean(inner.querySelector('[data-change-status="modified"]')),
            selectedFocusOverlay: getComputedStyle(inner, '::after').boxShadow,
            horizontalOverflow:
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
          }
        })()`,
        returnByValue: true,
      })
      const containerMeasurement = containerResult.result.value
      assert(
        containerMeasurement.empty.offsetHeight >= 64 &&
          containerMeasurement.empty.borderStyle === 'dashed' &&
          containerMeasurement.empty.borderWidth === '1px' &&
          containerMeasurement.empty.padding === '10px' &&
          !containerMeasurement.empty.hasIdentity &&
          containerMeasurement.emptyDropTarget.exists &&
          containerMeasurement.emptyDropTarget.orientation === 'horizontal' &&
          containerMeasurement.emptyDropTarget.width >=
            containerMeasurement.emptyDropTarget.expectedWidth - 1 &&
          containerMeasurement.emptyDropTarget.height >= 32,
        `${width}px empty horizontal Container has no persistent full-area drop target`,
      )
      assert(
        containerMeasurement.nested.borderStyle === 'dashed' &&
          containerMeasurement.inner.borderStyle === 'dashed' &&
          !containerMeasurement.nested.hasIdentity &&
          !containerMeasurement.inner.hasIdentity &&
          containerMeasurement.nestedIndent > 0,
        `${width}px nested Container hierarchy is not visually distinguishable`,
      )
      assert(
        containerMeasurement.innerChanged === 'modified' &&
          containerMeasurement.changeMarker &&
          containerMeasurement.selectedFocusOverlay.includes('2px') &&
          containerMeasurement.horizontalOverflow === 0,
        `${width}px Container selection, focus, change marker, or overflow regressed`,
      )
      const cleanupState = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const inspector = document.querySelector('aside[aria-label="Details"]')
          return {
            inspectorActions: Boolean(inspector.querySelector(
              '[data-component-copy-inspector], [data-component-duplicate-inspector], ' +
              '[data-component-paste-inspector], [data-component-delete-inspector]'
            )),
            hierarchyHint: inspector.textContent.includes('Hierarchy:') ||
              inspector.textContent.includes('階層移動:'),
          }
        })()`,
        returnByValue: true,
      })
      assert(
        !cleanupState.result.value.inspectorActions &&
          !cleanupState.result.value.hierarchyHint,
        `${width}px Inspector still exposes removed actions or hierarchy hint`,
      )

      const switchScreen = async (name, componentId) => {
        await cdp.call('Runtime.evaluate', {
          expression: `(() => {
            const button = [...document.querySelectorAll('button')].find(
              candidate => candidate.textContent.trim() === ${JSON.stringify(name)}
            )
            button?.click()
            return Boolean(button)
          })()`,
          returnByValue: true,
        })
        await waitForExpression(
          `Boolean(document.querySelector(
            '[data-component-id=${JSON.stringify(componentId)}]'
          ))`,
          `${width}px could not switch to ${name}`,
        )
      }
      const setCanvasZoom = async targetPercent => {
        await cdp.call('Runtime.evaluate', {
          expression: `[...document.querySelectorAll('button')].find(
            button => /^\\d+%$/.test(button.textContent.trim())
          ).click()`,
        })
        await waitForExpression(
          `[...document.querySelectorAll('button')].some(
            button => button.textContent.trim() === '100%'
          )`,
          `${width}px Canvas zoom did not reset`,
        )
        const direction = targetPercent < 100 ? '−' : '+'
        const stepCount = Math.abs(targetPercent - 100) / 25
        for (let step = 1; step <= stepCount; step += 1) {
          const expected = 100 + (targetPercent < 100 ? -25 : 25) * step
          await cdp.call('Runtime.evaluate', {
            expression: `(() => {
              const level = [...document.querySelectorAll('button')].find(
                button => /^\\d+%$/.test(button.textContent.trim())
              )
              ;[...level.parentElement.querySelectorAll('button')].find(
                button => button.textContent.trim() === ${JSON.stringify(direction)}
              ).click()
            })()`,
          })
          await waitForExpression(
            `[...document.querySelectorAll('button')].some(
              button => button.textContent.trim() === '${expected}%'
            )`,
            `${width}px Canvas zoom did not reach ${expected}%`,
          )
        }
      }

      await switchScreen('Task List', 'comp-list-grid')
      await waitForExpression(
        `document.querySelector(
          '[data-component-id="browser-broken-image"] [data-image-placeholder="failed"]'
        )?.getAttribute('role') === 'img'`,
        `${width}px broken Image did not expose an accessible failure placeholder`,
      )
      const placementScrollResult = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const frame = document.querySelector(
            '[data-owning-frame-kind="page"][data-owning-frame-id="comp-list-page"]'
          )
          const scrollport = frame.querySelector('[data-frame-scrollport]')
          const sticky = document.querySelector('[data-component-id="comp-list-title"]')
          const viewport = document.querySelector('[data-component-id="comp-list-help-link"]')
          const flow = document.querySelector('[data-component-id="browser-resource-link"]')
          const projectedParent = document.querySelector(
            '[data-component-id="browser-viewport-container"]'
          )
          const nestedOverlay = document.querySelector(
            '[data-component-id="browser-nested-overlay"]'
          )
          const modalFrame = document.querySelector(
            '[data-owning-frame-kind="modal"][data-owning-frame-id="comp-create-modal"]'
          )
          const modalTitle = document.querySelector(
            '[data-component-id="comp-create-modal-title"]'
          )
          const stickyProjection = sticky.closest('[data-placement-projection]')
          const viewportProjection = viewport.closest('[data-placement-projection]')
          const nestedProjection = nestedOverlay.closest('[data-placement-projection]')
          const modalProjection = modalTitle.closest('[data-placement-projection]')
          const stickyDrop = stickyProjection.querySelector(
            '[data-drop-parent="comp-list-section"][data-drop-position="0"]'
          )
          const viewportDrop = viewportProjection.querySelector(
            '[data-drop-parent="comp-list-section"][data-drop-position="3"]'
          )
          scrollport.scrollTop = 0
          const before = {
            sticky: sticky.getBoundingClientRect().top,
            viewport: viewport.getBoundingClientRect().top,
            flow: flow.getBoundingClientRect().top,
          }
          scrollport.scrollTop = Math.min(120, scrollport.scrollHeight - scrollport.clientHeight)
          const after = {
            sticky: sticky.getBoundingClientRect().top,
            viewport: viewport.getBoundingClientRect().top,
            flow: flow.getBoundingClientRect().top,
          }
          const parentRect = projectedParent.getBoundingClientRect()
          const nestedRect = nestedOverlay.getBoundingClientRect()
          const result = {
            scrollTop: scrollport.scrollTop,
            scrollRange: scrollport.scrollHeight - scrollport.clientHeight,
            stickyShift: after.sticky - before.sticky,
            viewportShift: after.viewport - before.viewport,
            flowShift: after.flow - before.flow,
            stickyLayer: stickyProjection?.getAttribute('data-placement-projection'),
            stickyOwner: stickyProjection?.getAttribute('data-owning-frame-id'),
            viewportLayer: viewportProjection?.getAttribute('data-placement-projection'),
            viewportOwner: viewportProjection?.getAttribute('data-owning-frame-id'),
            projectedDropsSeparated: (() => {
              const stickyRect = stickyDrop?.getBoundingClientRect()
              const viewportRect = viewportDrop?.getBoundingClientRect()
              return Boolean(
                stickyRect &&
                viewportRect &&
                (
                  Math.abs(stickyRect.top - viewportRect.top) > 1 ||
                  Math.abs(stickyRect.left - viewportRect.left) > 1
                )
              )
            })(),
            outsideScrollport:
              !scrollport.contains(sticky) && !scrollport.contains(viewport),
            nestedLayer: nestedProjection?.getAttribute('data-placement-projection'),
            nestedInsideParent:
              projectedParent.contains(nestedOverlay) &&
              nestedRect.left >= parentRect.left - 0.5 &&
              nestedRect.top >= parentRect.top - 0.5 &&
              nestedRect.right <= parentRect.right + 0.5 &&
              nestedRect.bottom <= parentRect.bottom + 0.5,
            modalCount: document.querySelectorAll(
              '[data-component-id="comp-create-modal-title"]'
            ).length,
            modalLayer: modalProjection?.getAttribute('data-placement-projection'),
            modalOwner: modalProjection?.getAttribute('data-owning-frame-id'),
            modalInsideOwnFrame: modalFrame.contains(modalTitle),
            modalInsidePageFrame: frame.contains(modalTitle),
            componentCounts: [
              'comp-list-title',
              'comp-list-help-link',
              'browser-viewport-container',
              'browser-nested-overlay',
            ].map(id => document.querySelectorAll(
              '[data-component-id="' + id + '"]'
            ).length),
            reviewLockedDragCounts: [
              'comp-list-title',
              'comp-list-help-link',
              'browser-viewport-container',
              'browser-nested-overlay',
            ].map(id => document.querySelectorAll(
              '[data-drag-surface="canvas"][data-drag-component="' + id + '"]'
            ).length),
          }
          scrollport.scrollTop = 0
          return result
        })()`,
        returnByValue: true,
      })
      const placementScroll = placementScrollResult.result.value
      assert(
        placementScroll.scrollRange > 0 &&
          placementScroll.scrollTop > 0 &&
          Math.abs(placementScroll.stickyShift) <= 0.5 &&
          Math.abs(placementScroll.viewportShift) <= 0.5 &&
          placementScroll.flowShift < -1 &&
          placementScroll.stickyLayer === 'sticky' &&
          placementScroll.stickyOwner === 'comp-list-page' &&
          placementScroll.viewportLayer === 'viewport' &&
          placementScroll.viewportOwner === 'comp-list-page' &&
          placementScroll.projectedDropsSeparated &&
          placementScroll.outsideScrollport &&
          placementScroll.nestedLayer === 'overlay' &&
          placementScroll.nestedInsideParent &&
          placementScroll.modalCount === 1 &&
          placementScroll.modalLayer === 'viewport' &&
          placementScroll.modalOwner === 'comp-create-modal' &&
          placementScroll.modalInsideOwnFrame &&
          !placementScroll.modalInsidePageFrame &&
          placementScroll.componentCounts.every(count => count === 1) &&
          placementScroll.reviewLockedDragCounts.every(count => count === 0),
        `${width}px placement projection, frame scroll, or nested overlay regressed: ` +
          JSON.stringify(placementScroll),
      )
      const semanticMediaResult = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const image = document.querySelector(
            '[data-component-id="comp-list-illustration"] img'
          )
          const link = document.querySelector(
            '[data-component-id="comp-list-help-link"] a'
          )
          const resource = document.querySelector(
            '[data-component-id="browser-resource-link"] a'
          )
          const failedImage = document.querySelector(
            '[data-component-id="browser-broken-image"] [data-image-placeholder="failed"]'
          )
          const click = new MouseEvent('click', { bubbles: true, cancelable: true })
          const prevented = link ? !link.dispatchEvent(click) : false
          return {
            imageAlt: image?.getAttribute('alt'),
            imageFit: image?.getAttribute('data-image-fit'),
            imageAspect: image?.getAttribute('data-image-aspect'),
            linkTag: link?.tagName,
            href: link?.getAttribute('href'),
            target: link?.getAttribute('target'),
            rel: link?.getAttribute('rel'),
            tabIndex: link?.tabIndex,
            prevented,
            resourceDownload: resource?.getAttribute('download'),
            resourceTarget: resource?.getAttribute('target'),
            failedImageLabel: failedImage?.getAttribute('aria-label'),
            path: location.pathname,
          }
        })()`,
        returnByValue: true,
      })
      assert(
        semanticMediaResult.result.value.imageAlt ===
            'Task board organized into three columns' &&
          semanticMediaResult.result.value.imageFit === 'cover' &&
          semanticMediaResult.result.value.imageAspect === '16:9' &&
          semanticMediaResult.result.value.linkTag === 'A' &&
          semanticMediaResult.result.value.target === '_blank' &&
          semanticMediaResult.result.value.rel === 'noopener noreferrer' &&
          semanticMediaResult.result.value.tabIndex === 0 &&
          semanticMediaResult.result.value.prevented &&
          semanticMediaResult.result.value.resourceDownload === 'taskflow-board.svg' &&
          semanticMediaResult.result.value.resourceTarget === null &&
          semanticMediaResult.result.value.failedImageLabel.includes(
            'Image could not be loaded'
          ) &&
          semanticMediaResult.result.value.path === '/',
        `${width}px semantic Image or Link DOM contract drifted: ` +
          JSON.stringify(semanticMediaResult.result.value),
      )
      await cdp.call('Runtime.evaluate', {
        expression: `document.querySelector(
          '[data-component-id="comp-list-help-link"]'
        ).focus({ preventScroll: true })`,
      })
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      })
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      })
      await waitForExpression(
        `document.activeElement === document.querySelector(
          '[data-component-id="comp-list-help-link"] a'
        )`,
        `${width}px trusted Tab did not reach the projected Link`,
      )
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
      })
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
      })
      const projectedLinkKeyboard = await cdp.call('Runtime.evaluate', {
        expression: `({
          focused: document.activeElement === document.querySelector(
            '[data-component-id="comp-list-help-link"] a'
          ),
          path: location.pathname,
        })`,
        returnByValue: true,
      })
      assert(
        projectedLinkKeyboard.result.value.focused &&
          projectedLinkKeyboard.result.value.path === '/',
        `${width}px projected Link lost focus or navigated under trusted keyboard input`,
      )
      await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const card = document.querySelector('[data-component-id="comp-task-docs-card"]')
          card.click()
          card.focus({ preventScroll: true })
        })()`,
      })
      await new Promise(resolveWait => setTimeout(resolveWait, 100))
      for (const zoomPercent of [50, 100, 200]) {
        await setCanvasZoom(zoomPercent)
        const layoutResult = await cdp.call('Runtime.evaluate', {
          expression: `(() => {
            const gridComponent = document.querySelector(
              '[data-component-id="comp-list-grid"]'
            )
            const grid = gridComponent.querySelector(
              ':scope > [data-layout="grid"]'
            )
            const horizontalComponent = document.querySelector(
              '[data-component-id="browser-horizontal-overflow"]'
            )
            const horizontal = horizontalComponent.querySelector(
              ':scope > [data-layout="horizontal"]'
            )
            const gridStyle = getComputedStyle(grid)
            const horizontalStyle = getComputedStyle(horizontal)
            const gridRect = grid.getBoundingClientRect()
            const cards = [...grid.children]
              .map(slot => slot.querySelector(':scope > [data-component-id]'))
              .filter(Boolean)
            const endTarget = grid.querySelector(
              '[data-drop-surface="canvas"][data-drop-parent="comp-list-grid"]' +
              '[data-drop-position="2"]'
            )
            const endRect = endTarget.getBoundingClientRect()
            horizontal.scrollLeft = horizontal.scrollWidth
            const selected = document.querySelector(
              '[data-component-id="comp-task-docs-card"]'
            )
            const frame = document.querySelector(
              '[data-owning-frame-kind="page"][data-owning-frame-id="comp-list-page"]'
            )
            const sticky = document.querySelector('[data-component-id="comp-list-title"]')
            const viewport = document.querySelector(
              '[data-component-id="comp-list-help-link"]'
            )
            const frameRect = frame.getBoundingClientRect()
            const stickyRect = sticky.getBoundingClientRect()
            const viewportRect = viewport.getBoundingClientRect()
            return {
              zoom: [...document.querySelectorAll('button')].find(
                button => /^\\d+%$/.test(button.textContent.trim())
              ).textContent.trim(),
              grid: {
                overflowX: gridStyle.overflowX,
                overflowY: gridStyle.overflowY,
                clientHeight: grid.clientHeight,
                scrollHeight: grid.scrollHeight,
                verticalScrollbarWidth: grid.offsetWidth - grid.clientWidth,
                endInside:
                  endRect.top >= gridRect.top - 0.5 &&
                  endRect.bottom <= gridRect.bottom + 0.5,
                endCssHeight: getComputedStyle(endTarget).height,
                rect: {
                  top: gridRect.top,
                  bottom: gridRect.bottom,
                },
                endRect: {
                  top: endRect.top,
                  bottom: endRect.bottom,
                  height: endRect.height,
                },
                cardsFit: cards.every(card => {
                  const rect = card.getBoundingClientRect()
                  return rect.top >= gridRect.top - 0.5 &&
                    rect.bottom <= gridRect.bottom + 0.5 &&
                    card.scrollHeight <= card.clientHeight
                }),
              },
              horizontal: {
                overflowX: horizontalStyle.overflowX,
                overflowY: horizontalStyle.overflowY,
                clientHeight: horizontal.clientHeight,
                scrollHeight: horizontal.scrollHeight,
                scrollWidth: horizontal.scrollWidth,
                clientWidth: horizontal.clientWidth,
                scrollLeft: horizontal.scrollLeft,
              },
              selected: {
                marker: getComputedStyle(selected, '::after').boxShadow,
              },
              placement: {
                stickyInside:
                  stickyRect.top >= frameRect.top - 0.5 &&
                  stickyRect.bottom <= frameRect.bottom + 0.5,
                viewportInside:
                  viewportRect.left >= frameRect.left - 0.5 &&
                  viewportRect.top >= frameRect.top - 0.5 &&
                  viewportRect.right <= frameRect.right + 0.5 &&
                  viewportRect.bottom <= frameRect.bottom + 0.5,
                stickyOwner: sticky.closest('[data-placement-projection]')
                  ?.getAttribute('data-owning-frame-id'),
                viewportOwner: viewport.closest('[data-placement-projection]')
                  ?.getAttribute('data-owning-frame-id'),
              },
              documentOverflow:
                document.documentElement.scrollWidth - document.documentElement.clientWidth,
            }
          })()`,
          returnByValue: true,
        })
        const layout = layoutResult.result.value
        assert(
          layout.zoom === `${zoomPercent}%` &&
            layout.grid.overflowX === 'auto' &&
            layout.grid.overflowY === 'hidden' &&
            layout.grid.clientHeight === layout.grid.scrollHeight &&
            layout.grid.verticalScrollbarWidth === 0 &&
            layout.grid.endInside &&
            layout.grid.endCssHeight === '10px' &&
            layout.grid.cardsFit &&
            layout.horizontal.overflowX === 'auto' &&
            layout.horizontal.overflowY === 'hidden' &&
            layout.horizontal.clientHeight === layout.horizontal.scrollHeight &&
            layout.horizontal.scrollWidth > layout.horizontal.clientWidth &&
            layout.horizontal.scrollLeft > 0 &&
            layout.selected.marker.includes('2px') &&
            layout.placement.stickyInside &&
            layout.placement.viewportInside &&
            layout.placement.stickyOwner === 'comp-list-page' &&
            layout.placement.viewportOwner === 'comp-list-page' &&
            layout.documentOverflow === 0,
          `${width}px ${zoomPercent}% horizontal/grid overflow geometry regressed: ` +
            JSON.stringify(layout),
        )
      }

      await setCanvasZoom(100)
      if (width === 1280) {
        const wheelStart = await cdp.call('Runtime.evaluate', {
          expression: `(() => {
            const horizontal = document.querySelector(
              '[data-component-id="browser-horizontal-overflow"]' +
              ' > [data-layout="horizontal"]'
            )
            horizontal.scrollLeft = 0
            horizontal.scrollIntoView({ block: 'center', inline: 'center' })
            const rect = horizontal.getBoundingClientRect()
            const x = Math.round(rect.left + rect.width / 2)
            const y = Math.round(rect.top + rect.height / 2)
            return {
              x,
              y,
              transform: document.querySelector('[data-canvas-surface]').style.transform,
              hitHorizontal: horizontal.contains(document.elementFromPoint(x, y)),
              hitComponent: document.elementFromPoint(x, y)
                ?.closest('[data-component-id]')?.getAttribute('data-component-id'),
            }
          })()`,
          returnByValue: true,
        })
        assert(
          wheelStart.result.value.hitHorizontal,
          'horizontal wheel point was covered by placement projection: ' +
            JSON.stringify(wheelStart.result.value),
        )
        await cdp.call('Input.synthesizeScrollGesture', {
          x: wheelStart.result.value.x,
          y: wheelStart.result.value.y,
          xDistance: -160,
          yDistance: 0,
          speed: 800,
          gestureSourceType: 'mouse',
        })
        await waitForExpression(
          `document.querySelector(
            '[data-component-id="browser-horizontal-overflow"]' +
            ' > [data-layout="horizontal"]'
          ).scrollLeft > 0`,
          'horizontal Container did not consume horizontal wheel input',
        )
        const wheelEnd = await cdp.call('Runtime.evaluate', {
          expression: `(() => ({
            scrollLeft: document.querySelector(
              '[data-component-id="browser-horizontal-overflow"]' +
              ' > [data-layout="horizontal"]'
            ).scrollLeft,
            transform: document.querySelector('[data-canvas-surface]').style.transform,
          }))()`,
          returnByValue: true,
        })
        assert(
          wheelEnd.result.value.scrollLeft > 0 &&
            wheelEnd.result.value.transform === wheelStart.result.value.transform,
          'horizontal content wheel leaked into Canvas pan: ' +
            JSON.stringify({
              before: wheelStart.result.value,
              after: wheelEnd.result.value,
            }),
        )
      }
      await switchScreen('Edit Task', 'browser-inner-container')
    }

    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        localStorage.setItem('screen-blueprint-studio:right-pane-width:v1', '300')
        localStorage.setItem('screen-blueprint-studio:canvas-zoom:v1', '1')
        return true
      })()`,
    })
    await cdp.call('Page.reload')
    await waitForExpression(
      `Boolean(document.querySelector(
        'aside[aria-label="Details"] [role="group"] > button[aria-pressed]'
      ))`,
      'review UI did not restore after Canvas viewport checks',
    )
    await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const changes = [...document.querySelectorAll('button')].find(
          button => button.textContent.trim() === 'Changes'
        )
        changes?.click()
      })()`,
    })
    await waitForExpression(
      `[...document.querySelectorAll('button')].some(
        button => button.textContent.trim() === 'Accept'
      )`,
      'change set Accept action did not render before Container DnD',
    )
    await cdp.call('Runtime.evaluate', {
      expression: `[...document.querySelectorAll('button')].find(
        button => button.textContent.trim() === 'Accept'
      ).click()`,
    })
    await waitForExpression(
      `!document.querySelector('[data-palette-kind="container"]').disabled`,
      'accepting the review did not unlock Container DnD',
    )
    const dispatchTrustedKey = async (
      key,
      code,
      windowsVirtualKeyCode,
    ) => {
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code,
        windowsVirtualKeyCode,
      })
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code,
        windowsVirtualKeyCode,
      })
    }
    await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const taskList = [...document.querySelectorAll('button')].find(
          button => button.textContent.trim() === 'Task List'
        )
        taskList?.click()
        return Boolean(taskList)
      })()`,
    })
    await waitForExpression(
      `Boolean(document.querySelector(
        '[data-component-id="comp-list-help-link"]'
      ))`,
      'Task List did not render before projected Canvas keyboard DnD',
    )
    await cdp.call('Runtime.evaluate', {
      expression: `document.querySelector(
        '[data-component-id="comp-list-help-link"]'
      ).focus({ preventScroll: true })`,
    })
    await dispatchTrustedKey(' ', 'Space', 32)
    await waitForExpression(
      `Boolean(document.querySelector('[data-drag-overlay]'))`,
      'trusted projected Canvas keyboard drag did not start',
    )
    const projectedKeyboardDrag = await cdp.call('Runtime.evaluate', {
      expression: `(() => ({
        dragging: document.querySelector(
          '[data-component-id="comp-list-help-link"]'
        )?.getAttribute('data-canvas-dragging'),
        canvasOrigins: document.querySelectorAll(
          '[data-drag-surface="canvas"][data-drag-component="comp-list-help-link"]'
        ).length,
        visibleSurfaces: [...document.querySelectorAll('[data-drop-visible="true"]')]
          .map(zone => zone.getAttribute('data-drop-surface')),
        treeOutcomes: document.querySelectorAll(
          '[data-drop-surface="tree"][data-drop-outcome]'
        ).length,
      }))()`,
      returnByValue: true,
    })
    assert(
      projectedKeyboardDrag.result.value.dragging === 'true' &&
        projectedKeyboardDrag.result.value.canvasOrigins === 1 &&
        projectedKeyboardDrag.result.value.visibleSurfaces.length > 0 &&
        projectedKeyboardDrag.result.value.visibleSurfaces.every(
          surface => surface === 'canvas'
        ) &&
        projectedKeyboardDrag.result.value.treeOutcomes === 0,
      'trusted projected Canvas keyboard drag exposed invalid surfaces or duplicate origins: ' +
        JSON.stringify(projectedKeyboardDrag.result.value),
    )
    const projectedOrderBefore = await cdp.call('Runtime.evaluate', {
      expression: `JSON.stringify(
        JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
          .document.components['comp-list-section'].childIds
      )`,
      returnByValue: true,
    })
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
    await dispatchTrustedKey('Escape', 'Escape', 27)
    await new Promise(resolveWait => setTimeout(resolveWait, 250))
    const projectedKeyboardCancel = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const persisted = JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
        return {
          overlay: Boolean(document.querySelector('[data-drag-overlay]')),
          dragging: [...document.querySelectorAll('[data-canvas-dragging="true"]')]
            .map(node => node.getAttribute('data-component-id')),
          active: document.activeElement?.getAttribute('data-component-id') ??
            document.activeElement?.tagName,
          order: JSON.stringify(
            persisted.document.components['comp-list-section'].childIds
          ),
          parentId: persisted.document.components['comp-list-help-link'].parentId,
          placement: persisted.document.components['comp-list-help-link'].placement.mode,
        }
      })()`,
      returnByValue: true,
    })
    assert(
      !projectedKeyboardCancel.result.value.overlay &&
        projectedKeyboardCancel.result.value.dragging.length === 0 &&
        projectedKeyboardCancel.result.value.order === projectedOrderBefore.result.value &&
        projectedKeyboardCancel.result.value.parentId === 'comp-list-section' &&
        projectedKeyboardCancel.result.value.placement === 'viewport',
      'trusted projected Canvas keyboard drop changed canonical placement or order: ' +
        JSON.stringify(projectedKeyboardCancel.result.value),
    )
    await cdp.call('Runtime.evaluate', {
      expression: `[...document.querySelectorAll('button')].find(
        button => button.textContent.trim() === 'Edit Task'
      ).click()`,
    })
    await waitForExpression(
      `Boolean(document.querySelector(
        '[data-drag-surface="tree"][data-drag-component="comp-edit-summary"]'
      ))`,
      'Edit Task did not restore after projected Canvas keyboard DnD',
    )
    await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const left = document.querySelector('aside[aria-label="Project navigation"]')
        for (const button of left.querySelectorAll('h2 button[aria-expanded="true"]')) {
          const label = button.textContent.trim()
          if (label.startsWith('Screens') || label.startsWith('Palette')) {
            button.click()
          }
        }
        left.scrollTop = 0
        const handle = document.querySelector(
          '[data-drag-surface="tree"][data-drag-component="comp-edit-summary"]'
        )
        handle.focus({ preventScroll: true })
        return document.activeElement === handle
      })()`,
    })
    await dispatchTrustedKey(' ', 'Space', 32)
    await waitForExpression(
      `Boolean(document.querySelector('[data-drag-overlay]'))`,
      'trusted Tree keyboard drag did not start',
    )
    const keyboardTreeSurface = await cdp.call('Runtime.evaluate', {
      expression: `(() => ({
        visibleSurfaces: [...document.querySelectorAll('[data-drop-visible="true"]')]
          .map(zone => zone.getAttribute('data-drop-surface')),
        canvasOutcomes: document.querySelectorAll(
          '[data-drop-surface="canvas"][data-drop-outcome]'
        ).length,
      }))()`,
      returnByValue: true,
    })
    assert(
      keyboardTreeSurface.result.value.visibleSurfaces.length > 0 &&
        keyboardTreeSurface.result.value.visibleSurfaces.every(
          surface => surface === 'tree'
        ) &&
        keyboardTreeSurface.result.value.canvasOutcomes === 0,
      'trusted Tree keyboard drag exposed Canvas drop targets: ' +
        JSON.stringify(keyboardTreeSurface.result.value),
    )
    for (let step = 0; step < 3; step += 1) {
      await dispatchTrustedKey('ArrowUp', 'ArrowUp', 38)
      await new Promise(resolveWait => setTimeout(resolveWait, 75))
    }
    const keyboardTreeOver = await cdp.call('Runtime.evaluate', {
      expression: `(() => ({
        over: [...document.querySelectorAll(
          '[data-drop-surface="tree"]'
        )].filter(zone => zone.className.includes('_over_')).map(zone => ({
          parent: zone.getAttribute('data-drop-parent'),
          position: zone.getAttribute('data-drop-position'),
          outcome: zone.getAttribute('data-drop-outcome'),
        })),
        live: [...document.querySelectorAll('[role="status"]')]
          .map(node => node.textContent.trim()).filter(Boolean),
      }))()`,
      returnByValue: true,
    })
    assert(
      keyboardTreeOver.result.value.over.some(
        target => target.parent === 'comp-edit-section' && target.position === '0'
      ) &&
        keyboardTreeOver.result.value.live.some(
          message => message.includes('Start of')
        ),
      'trusted Tree keyboard drag did not resolve the first Tree target: ' +
        JSON.stringify(keyboardTreeOver.result.value),
    )
    await dispatchTrustedKey(' ', 'Space', 32)
    await new Promise(resolveWait => setTimeout(resolveWait, 250))
    const keyboardTreeEnd = await cdp.call('Runtime.evaluate', {
      expression: `(() => ({
        overlay: Boolean(document.querySelector('[data-drag-overlay]')),
        visibleSurfaces: document.querySelectorAll('[data-drop-visible="true"]').length,
        order: JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
          .document.components['comp-edit-section'].childIds.slice(0, 3),
      }))()`,
      returnByValue: true,
    })
    assert(
      keyboardTreeEnd.result.value.visibleSurfaces === 0 &&
        keyboardTreeEnd.result.value.order[0] === 'comp-edit-summary',
      'trusted Tree keyboard drop did not finish and persist cleanly: ' +
        JSON.stringify(keyboardTreeEnd.result.value),
    )
    await waitForExpression(
      `JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
        .document.components['comp-edit-section'].childIds[0] ===
          'comp-edit-summary'`,
      'trusted Tree keyboard drag did not reorder its component',
    )
    await cdp.call('Page.reload')
    await waitForExpression(
      `Boolean(document.querySelector('[data-tree-component-id]')) &&
        !document.querySelector('[data-drag-overlay]')`,
      'Tree did not restore after keyboard reorder',
    )
    const treePointerPoints = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const treeIds = [...document.querySelectorAll('[data-tree-component-id]')]
          .map(node => node.getAttribute('data-tree-component-id'))
        const treeNode = document.querySelector(
          '[data-tree-component-id="comp-edit-title"]'
        )
        const source = treeNode?.closest('[role="treeitem"]')
          ?.querySelector('[data-drag-surface="tree"]')
        if (!source) return { treeIds, missingSource: true }
        source.scrollIntoView({ block: 'center' })
        const target = document.querySelector(
          '[data-drop-surface="tree"][data-drop-parent="comp-edit-section"]' +
          '[data-drop-position="0"]'
        )
        const sourceRect = source.getBoundingClientRect()
        const targetRect = target.getBoundingClientRect()
        const sourcePoint = {
          x: sourceRect.left + sourceRect.width / 2,
          y: sourceRect.top + sourceRect.height / 2,
        }
        return {
          source: sourcePoint,
          target: {
            x: targetRect.left + targetRect.width / 2,
            y: targetRect.top + targetRect.height / 2,
          },
          hitSurface: document.elementFromPoint(sourcePoint.x, sourcePoint.y)
            ?.closest('[data-drag-surface]')?.getAttribute('data-drag-surface'),
          treeIds,
        }
      })()`,
      returnByValue: true,
    })
    const treePoints = treePointerPoints.result.value
    assert(
      treePoints.hitSurface === 'tree',
      'trusted Tree pointer did not hit the drag handle: ' +
        JSON.stringify(treePoints),
    )
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      buttons: 1,
      clickCount: 1,
      x: treePoints.source.x,
      y: treePoints.source.y,
    })
    for (const ratio of [0.25, 0.6, 1]) {
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        button: 'left',
        buttons: 1,
        x: treePoints.source.x +
          (treePoints.target.x - treePoints.source.x) * ratio,
        y: treePoints.source.y +
          (treePoints.target.y - treePoints.source.y) * ratio,
      })
      await new Promise(resolveWait => setTimeout(resolveWait, 75))
    }
    const pointerTreeSurface = await cdp.call('Runtime.evaluate', {
      expression: `(() => ({
        overlay: Boolean(document.querySelector('[data-drag-overlay]')),
        visibleSurfaces: [...document.querySelectorAll('[data-drop-visible="true"]')]
          .map(zone => zone.getAttribute('data-drop-surface')),
        canvasOutcomes: document.querySelectorAll(
          '[data-drop-surface="canvas"][data-drop-outcome]'
        ).length,
      }))()`,
      returnByValue: true,
    })
    assert(
      pointerTreeSurface.result.value.overlay &&
        pointerTreeSurface.result.value.visibleSurfaces.length > 0 &&
        pointerTreeSurface.result.value.visibleSurfaces.every(
          surface => surface === 'tree'
        ) &&
        pointerTreeSurface.result.value.canvasOutcomes === 0,
      'trusted Tree pointer drag exposed Canvas drop targets: ' +
        JSON.stringify(pointerTreeSurface.result.value),
    )
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      buttons: 0,
      clickCount: 1,
      x: treePoints.target.x,
      y: treePoints.target.y,
    })
    await waitForExpression(
      `JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
        .document.components['comp-edit-section'].childIds[0] ===
          'comp-edit-title'`,
      'trusted Tree pointer drag did not persist its reorder',
    )
    await cdp.call('Page.reload')
    await waitForExpression(
      `Boolean(document.querySelector('[data-canvas-surface]')) &&
        !document.querySelector('[data-drag-overlay]')`,
      'Tree pointer reorder did not restore cleanly across reload',
    )
    const contextPointResult = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const target = document.querySelector(
          '[data-component-id="comp-edit-section"]'
        )
        const rect = target.getBoundingClientRect()
        let point = null
        for (let y = Math.ceil(rect.top); y < Math.floor(rect.bottom) && !point; y += 2) {
          for (let x = Math.ceil(rect.left); x < Math.floor(rect.right); x += 2) {
            const owner = document.elementFromPoint(x, y)?.closest('[data-component-id]')
            if (owner === target) {
              point = { x, y }
              break
            }
          }
        }
        if (!point) return { x: 0, y: 0, componentId: null }
        return {
          ...point,
          componentId: document.elementFromPoint(point.x, point.y)
            ?.closest('[data-component-id]')?.getAttribute('data-component-id'),
        }
      })()`,
      returnByValue: true,
    })
    const contextPoint = contextPointResult.result.value
    assert(
      contextPoint.componentId === 'comp-edit-section',
      'trusted context-menu point did not hit the intended Container: ' +
        JSON.stringify(contextPoint),
    )
    const openContextMenu = async () => {
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        button: 'right',
        buttons: 2,
        clickCount: 1,
        x: contextPoint.x,
        y: contextPoint.y,
      })
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button: 'right',
        buttons: 0,
        clickCount: 1,
        x: contextPoint.x,
        y: contextPoint.y,
      })
      await waitForExpression(
        `Boolean(document.querySelector('[data-component-add-menu]'))`,
        'trusted right-click did not open the component menu',
      )
    }
    await openContextMenu()
    const initialMenu = await cdp.call('Runtime.evaluate', {
      expression: `(() => ({
        copy: Boolean(document.querySelector('[data-component-copy]')),
        duplicate: Boolean(document.querySelector('[data-component-duplicate]')),
        deleteAction: Boolean(document.querySelector('[data-component-delete]')),
      }))()`,
      returnByValue: true,
    })
    assert(
      initialMenu.result.value.copy &&
        initialMenu.result.value.duplicate &&
        initialMenu.result.value.deleteAction,
      'component context menu lost Copy, Duplicate, or Delete: ' +
        JSON.stringify(initialMenu.result.value),
    )
    await cdp.call('Runtime.evaluate', {
      expression: `document.querySelector('[data-component-copy]').click()`,
    })
    await waitForExpression(
      `!document.querySelector('[data-component-add-menu]')`,
      'component Copy did not close its context menu',
    )
    await openContextMenu()
    const clipboardMenu = await cdp.call('Runtime.evaluate', {
      expression: `(() => ({
        copy: Boolean(document.querySelector('[data-component-copy]')),
        duplicate: Boolean(document.querySelector('[data-component-duplicate]')),
        paste: Boolean(document.querySelector('[data-component-paste]')),
        deleteAction: Boolean(document.querySelector('[data-component-delete]')),
      }))()`,
      returnByValue: true,
    })
    assert(
      Object.values(clipboardMenu.result.value).every(Boolean),
      'component context menu did not expose all four preserved actions',
    )
    await cdp.call('Runtime.evaluate', {
      expression: `document.querySelector('[data-component-delete]').click()`,
    })
    await waitForExpression(
      `document.querySelector('[data-delete-confirmation="component"]') &&
        document.activeElement ===
          document.querySelector('[data-delete-confirmation="component"] button')`,
      'context-menu Delete did not open a focused confirmation dialog',
    )
    const deleteDialogState = await cdp.call('Runtime.evaluate', {
      expression: `(() => ({
        markedComponentId: document.querySelector('[data-delete-return-focus]')
          ?.getAttribute('data-component-id'),
      }))()`,
      returnByValue: true,
    })
    assert(
      deleteDialogState.result.value.markedComponentId === contextPoint.componentId,
      'context-menu Delete did not preserve its return-focus marker: ' +
        JSON.stringify(deleteDialogState.result.value),
    )
    await cdp.call('Runtime.evaluate', {
      expression: `document.querySelector(
        '[data-delete-confirmation="component"] button'
      ).click()`,
    })
    await waitForExpression(
      `!document.querySelector('[data-delete-confirmation]')`,
      'canceling context-menu Delete did not close the dialog',
    )
    const restoredDeleteFocus = await cdp.call('Runtime.evaluate', {
      expression: `new Promise(resolve => setTimeout(() => resolve({
          componentId: document.activeElement?.getAttribute('data-component-id'),
          tag: document.activeElement?.tagName,
          text: document.activeElement?.textContent?.trim(),
        }), 50))`,
      awaitPromise: true,
      returnByValue: true,
    })
    assert(
      restoredDeleteFocus.result.value.componentId === contextPoint.componentId,
      'canceling context-menu Delete did not restore focus to its trigger: ' +
        JSON.stringify(restoredDeleteFocus.result.value),
    )
    await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const button = [...document.querySelectorAll('h2 button[aria-expanded]')]
          .find(candidate => candidate.textContent.trim().startsWith('Palette'))
        if (button?.getAttribute('aria-expanded') === 'false') button.click()
      })()`,
    })
    await waitForExpression(
      `document.querySelector('[data-palette-kind="container"]')
        ?.getBoundingClientRect().width > 0`,
      'Palette did not expand before trusted drag',
    )
    const dragPoints = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const sourceElement = document.querySelector('[data-palette-kind="container"]')
        sourceElement.scrollIntoView({ block: 'center' })
        const source = sourceElement.getBoundingClientRect()
        const target = document.querySelector(
          '[data-drop-surface="canvas"][data-drop-parent="browser-empty-container"]'
        ).getBoundingClientRect()
        const sourcePoint = {
          x: source.left + source.width / 2,
          y: source.top + source.height / 2,
        }
        return {
          source: sourcePoint,
          target: { x: target.left + target.width / 2, y: target.top + target.height / 2 },
          hitKind: document.elementFromPoint(sourcePoint.x, sourcePoint.y)
            ?.closest('[data-palette-kind]')?.getAttribute('data-palette-kind'),
        }
      })()`,
      returnByValue: true,
    })
    const { source: dragSource, target: dragTarget } = dragPoints.result.value
    assert(
      dragPoints.result.value.hitKind === 'container',
      'trusted Palette pointer did not hit its production button: ' +
        JSON.stringify(dragPoints.result.value),
    )
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      buttons: 1,
      clickCount: 1,
      x: dragSource.x,
      y: dragSource.y,
    })
    for (const ratio of [0.15, 0.5, 1]) {
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        button: 'left',
        buttons: 1,
        x: dragSource.x + (dragTarget.x - dragSource.x) * ratio,
        y: dragSource.y + (dragTarget.y - dragSource.y) * ratio,
      })
      await new Promise(resolveWait => setTimeout(resolveWait, 75))
    }
    const dragState = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const point = document.elementFromPoint(${dragTarget.x}, ${dragTarget.y})
        const target = document.querySelector(
          '[data-drop-surface="canvas"][data-drop-parent="browser-empty-container"]'
        )
        return {
          pointTag: point?.tagName,
          pointDropParent: point?.getAttribute('data-drop-parent'),
          targetOutcome: target?.getAttribute('data-drop-outcome'),
          targetVisible: target?.getAttribute('data-drop-visible'),
          targetBorder: getComputedStyle(target).borderTopColor,
          targetClass: target?.className,
          visibleSurfaces: [...document.querySelectorAll('[data-drop-visible="true"]')]
            .map(zone => zone.getAttribute('data-drop-surface')),
          oppositeOutcomes: [...document.querySelectorAll(
            '[data-drop-surface="tree"][data-drop-outcome]'
          )].length,
          dropParentsAtPoint: document.elementsFromPoint(
            ${dragTarget.x}, ${dragTarget.y}
          ).map(element => element.getAttribute('data-drop-parent')).filter(Boolean),
          overlay: Boolean(document.querySelector('[data-drag-overlay]')),
        }
      })()`,
      returnByValue: true,
    })
    assert(
      dragState.result.value.targetClass.includes('_over_') &&
        dragState.result.value.dropParentsAtPoint.includes('browser-empty-container') &&
        dragState.result.value.visibleSurfaces.length > 0 &&
        dragState.result.value.visibleSurfaces.every(surface => surface === 'canvas') &&
        dragState.result.value.oppositeOutcomes === 0 &&
        dragState.result.value.overlay,
      `empty Container was not the active registered collision target: ` +
        JSON.stringify(dragState.result.value),
    )
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      buttons: 0,
      clickCount: 1,
      x: dragTarget.x,
      y: dragTarget.y,
    })
    await waitForExpression(
      `Boolean(document.querySelector(
        '[data-component-id="browser-empty-container"] [data-container-component]'
      ))`,
      `real palette DnD did not add a child inside the empty Container: ` +
        `${JSON.stringify({ dragPoints: dragPoints.result.value, dragState: dragState.result.value })}`,
    )
    await cdp.call('Page.reload')
    await waitForExpression(
      `Boolean(document.querySelector(
        '[data-component-id="browser-empty-container"] [data-container-component]'
      )) && !document.querySelector('[data-drag-overlay]')`,
      'successful Container DnD did not persist cleanly across reload',
    )
    const componentPoint = async (componentId, targetParentId, targetIndex = -1) => {
      await waitForExpression(
        `Boolean(document.querySelector(
          '[data-component-id=${JSON.stringify(componentId)}]'
        ))`,
        `Canvas component ${componentId} did not render before trusted input`,
      )
      const result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const componentId = ${JSON.stringify(componentId)}
          const source = document.querySelector(
            '[data-component-id="' + componentId + '"]'
          )
          source.scrollIntoView({ block: 'center', inline: 'center' })
          const sourceRect = source.getBoundingClientRect()
          const candidates = [
            { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 },
            { x: sourceRect.left + 5, y: sourceRect.top + 5 },
            { x: sourceRect.right - 5, y: sourceRect.top + 5 },
            { x: sourceRect.left + 5, y: sourceRect.bottom - 5 },
            { x: sourceRect.right - 5, y: sourceRect.bottom - 5 },
          ]
          const sourcePoint = candidates.find(point => {
            const owner = document.elementFromPoint(point.x, point.y)
              ?.closest('[data-component-id]')
            return owner === source
          }) ?? candidates[0]
          const hit = document.elementFromPoint(sourcePoint.x, sourcePoint.y)
          const targets = ${targetParentId === undefined
            ? '[]'
            : `[...document.querySelectorAll(
                '[data-drop-surface="canvas"][data-drop-parent=${JSON.stringify(targetParentId)}]'
              )]`}
          const target = targets.length === 0
            ? null
            : targets.at(${targetIndex})
          const targetRect = target?.getBoundingClientRect()
          return {
            source: sourcePoint,
            target: targetRect ? {
              x: targetRect.left + targetRect.width / 2,
              y: targetRect.top + targetRect.height / 2,
            } : {
              x: sourcePoint.x + 18,
              y: sourcePoint.y + 9,
            },
            hit: {
              tag: hit?.tagName,
              componentId: hit?.closest('[data-component-id]')
                ?.getAttribute('data-component-id'),
              dragSurface: hit?.closest('[data-drag-surface]')
                ?.getAttribute('data-drag-surface'),
            },
            targetParent: target?.getAttribute('data-drop-parent') ?? null,
            targetPosition: target?.getAttribute('data-drop-position') ?? null,
            draggable: source.getAttribute('data-canvas-draggable'),
            cursor: getComputedStyle(source).cursor,
          }
        })()`,
        returnByValue: true,
      })
      return result.result.value
    }

    const pressTrustedComponent = async (
      componentId,
      targetParentId,
      targetIndex = -1,
    ) => {
      const points = await componentPoint(componentId, targetParentId, targetIndex)
      assert(
        points.hit.componentId === componentId &&
          points.hit.dragSurface === 'canvas' &&
          points.draggable === 'true' &&
          points.cursor === 'grab' &&
          (targetParentId === undefined || points.targetParent === targetParentId),
        `trusted Canvas drag did not start on the production hit target: ` +
          JSON.stringify({ componentId, points }),
      )
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        button: 'left',
        buttons: 1,
        clickCount: 1,
        x: points.source.x,
        y: points.source.y,
      })
      for (const ratio of [0.12, 0.45, 1]) {
        await cdp.call('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          button: 'left',
          buttons: 1,
          x: points.source.x + (points.target.x - points.source.x) * ratio,
          y: points.source.y + (points.target.y - points.source.y) * ratio,
        })
        await new Promise(resolveWait => setTimeout(resolveWait, 75))
      }
      await waitForExpression(
        `document.querySelector(
          '[data-component-id=${JSON.stringify(componentId)}]'
        )?.getAttribute('data-canvas-dragging') === 'true' &&
          Boolean(document.querySelector('[data-drag-overlay]'))`,
        `trusted Canvas drag did not activate for ${componentId}`,
      )
      const feedback = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const source = document.querySelector(
            '[data-component-id=${JSON.stringify(componentId)}]'
          )
          return {
            overlay: Boolean(document.querySelector('[data-drag-overlay]')),
            dragging: source.getAttribute('data-canvas-dragging'),
            cursor: getComputedStyle(source).cursor,
            opacity: getComputedStyle(source).opacity,
            visibleSurfaces: [...document.querySelectorAll(
              '[data-drop-visible="true"]'
            )].map(zone => zone.getAttribute('data-drop-surface')),
            oppositeOutcomes: [...document.querySelectorAll(
              '[data-drop-surface="tree"][data-drop-outcome]'
            )].length,
            targetActive: ${targetParentId === undefined
              ? 'true'
              : `[...document.querySelectorAll(
                  '[data-drop-surface="canvas"][data-drop-parent=${JSON.stringify(targetParentId)}]'
                )].some(target => target.className.includes('_over_'))`},
            over: [...document.querySelectorAll(
              '[data-drop-surface="canvas"]'
            )].filter(target => target.className.includes('_over_')).map(target => ({
              parent: target.getAttribute('data-drop-parent'),
              position: target.getAttribute('data-drop-position'),
              outcome: target.getAttribute('data-drop-outcome'),
            })),
          }
        })()`,
        returnByValue: true,
      })
      assert(
        feedback.result.value.overlay &&
          feedback.result.value.dragging === 'true' &&
          feedback.result.value.cursor === 'grabbing' &&
          feedback.result.value.opacity === '0.3' &&
          feedback.result.value.visibleSurfaces.length > 0 &&
          feedback.result.value.visibleSurfaces.every(
            surface => surface === 'canvas'
          ) &&
          feedback.result.value.oppositeOutcomes === 0 &&
          feedback.result.value.targetActive &&
          (targetParentId === undefined || feedback.result.value.over.some(
            target => target.parent === points.targetParent &&
              target.position === points.targetPosition
          )),
        `trusted Canvas drag feedback is incomplete for ${componentId}: ` +
          JSON.stringify(feedback.result.value),
      )
      return points
    }

    const cancelTrustedComponent = async points => {
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
      })
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
      })
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button: 'left',
        buttons: 0,
        clickCount: 1,
        x: points.target.x,
        y: points.target.y,
      })
      await cdp.call('Page.reload')
      await waitForExpression(
        `!document.querySelector('[data-drag-overlay]') &&
          !document.querySelector('[data-canvas-dragging]') &&
          Boolean(document.querySelector('[data-canvas-surface]'))`,
        'trusted Canvas drag cancellation did not clean up',
      )
    }

    const releaseTrustedComponent = async points => {
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button: 'left',
        buttons: 0,
        clickCount: 1,
        x: points.target.x,
        y: points.target.y,
      })
    }

    await cdp.call('Runtime.evaluate', {
      expression: `[...document.querySelectorAll('button')].find(
        button => button.textContent.trim() === 'Task List'
      ).click()`,
    })
    await waitForExpression(
      `Boolean(document.querySelector('[data-component-id="comp-list-grid"]'))`,
      'Task List did not render before trusted grid DnD',
    )
    const projectedLinkPoints = await pressTrustedComponent('comp-list-help-link')
    await cancelTrustedComponent(projectedLinkPoints)
    await waitForExpression(
      `Boolean(document.querySelector(
        '[data-component-id="comp-list-help-link"][data-placement-mode="viewport"]'
      ))`,
      'projected Link placement did not survive trusted pointer drag cancellation',
    )
    const gridPoints = await pressTrustedComponent(
      'comp-task-launch-card',
      'comp-list-grid',
      -1,
    )
    const draggingGrid = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const grid = document.querySelector(
          '[data-component-id="comp-list-grid"] > [data-layout="grid"]'
        )
        const style = getComputedStyle(grid)
        const endTarget = [...grid.querySelectorAll(
          '[data-drop-surface="canvas"][data-drop-parent="comp-list-grid"]'
        )].at(-1)
        return {
          overflowY: style.overflowY,
          clientHeight: grid.clientHeight,
          scrollHeight: grid.scrollHeight,
          endOutcome: endTarget.getAttribute('data-drop-outcome'),
          endOver: endTarget.className.includes('_over_'),
          visibleSurfaces: [...document.querySelectorAll('[data-drop-visible="true"]')]
            .map(zone => zone.getAttribute('data-drop-surface')),
        }
      })()`,
      returnByValue: true,
    })
    assert(
      draggingGrid.result.value.overflowY === 'hidden' &&
        draggingGrid.result.value.clientHeight === draggingGrid.result.value.scrollHeight &&
        draggingGrid.result.value.endOutcome === 'allowed' &&
        draggingGrid.result.value.endOver &&
        draggingGrid.result.value.visibleSurfaces.length > 0 &&
        draggingGrid.result.value.visibleSurfaces.every(surface => surface === 'canvas'),
      'trusted grid drag reintroduced vertical overflow or lost its end target: ' +
        JSON.stringify(draggingGrid.result.value),
    )
    await releaseTrustedComponent(gridPoints)
    await waitForExpression(
      `JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
        .document.components['comp-list-grid'].childIds.at(-1) ===
          'comp-task-launch-card'`,
      'trusted grid end drop did not persist',
    )
    await cdp.call('Page.reload')
    await waitForExpression(
      `JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
        .document.components['comp-list-grid'].childIds.at(-1) ===
          'comp-task-launch-card' &&
        document.querySelector(
          '[data-component-id="comp-list-grid"] > [data-layout="grid"]'
        ).clientHeight === document.querySelector(
          '[data-component-id="comp-list-grid"] > [data-layout="grid"]'
        ).scrollHeight &&
        !document.querySelector('[data-drag-overlay]')`,
      'trusted grid end drop or scrollbar fix did not survive reload',
    )
    await cdp.call('Runtime.evaluate', {
      expression: `[...document.querySelectorAll('button')].find(
        button => button.textContent.trim() === 'Edit Task'
      ).click()`,
    })
    await waitForExpression(
      `Boolean(document.querySelector('[data-component-id="comp-task-title-input"]'))`,
      'Edit Task did not restore after trusted grid DnD',
    )

    const clickPoint = await componentPoint('comp-task-title-input')
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      buttons: 1,
      clickCount: 1,
      x: clickPoint.source.x,
      y: clickPoint.source.y,
    })
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
    const heldClick = await cdp.call('Runtime.evaluate', {
      expression: `({
        overlay: Boolean(document.querySelector('[data-drag-overlay]')),
        dragging: document.querySelector(
          '[data-component-id="comp-task-title-input"]'
        ).getAttribute('data-canvas-dragging'),
      })`,
      returnByValue: true,
    })
    assert(
      !heldClick.result.value.overlay &&
        heldClick.result.value.dragging === null,
      'trusted stationary Canvas press crossed the drag activation threshold',
    )
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      buttons: 0,
      clickCount: 1,
      x: clickPoint.source.x,
      y: clickPoint.source.y,
    })

    for (const componentId of [
      'comp-edit-title',
      'comp-task-title-input',
      'comp-save-btn',
      'browser-nested-container',
    ]) {
      const points = await pressTrustedComponent(componentId)
      await cancelTrustedComponent(points)
    }

    const buttonPoints = await pressTrustedComponent('comp-save-btn', 'comp-actions', 0)
    await releaseTrustedComponent(buttonPoints)
    await waitForExpression(
      `JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
        .document.components['comp-actions'].childIds[0] === 'comp-save-btn'`,
      'trusted Canvas Button drag did not reorder within its parent',
    )
    await cdp.call('Page.reload')
    await waitForExpression(
      `JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
        .document.components['comp-actions'].childIds[0] === 'comp-save-btn' &&
        !document.querySelector('[data-drag-overlay]')`,
      'trusted Canvas Button reorder did not persist across reload',
    )

    const inputPoints = await pressTrustedComponent(
      'comp-task-title-input',
      'browser-empty-container',
      -1,
    )
    await releaseTrustedComponent(inputPoints)
    await waitForExpression(
      `JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
        .document.components['comp-task-title-input'].parentId ===
          'browser-empty-container'`,
      'trusted Canvas Input drag did not reparent into the target Container',
    )
    await cdp.call('Page.reload')
    await waitForExpression(
      `Boolean(document.querySelector(
        '[data-component-id="browser-empty-container"] ' +
        '[data-component-id="comp-task-title-input"]'
      )) && !document.querySelector('[data-drag-overlay]')`,
      'trusted Canvas Input reparent did not persist across reload',
    )

    const containerPoints = await pressTrustedComponent(
      'browser-nested-container',
      'browser-empty-container',
      -1,
    )
    await releaseTrustedComponent(containerPoints)
    await waitForExpression(
      `JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
        .document.components['browser-nested-container'].parentId ===
          'browser-empty-container'`,
      'trusted Canvas Container drag did not reparent',
    )
    await cdp.call('Page.reload')
    await waitForExpression(
      `Boolean(document.querySelector(
        '[data-component-id="browser-empty-container"] ' +
        '[data-component-id="browser-nested-container"]'
      )) &&
        JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
          .document.components['comp-actions'].childIds[0] === 'comp-save-btn' &&
        !document.querySelector('[data-drag-overlay]')`,
      'trusted Canvas component moves did not persist together across reload',
    )
    await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const key = 'screen-blueprint-studio:v1'
        const data = JSON.parse(localStorage.getItem(key))
        data.activeChangeSet = {
          id: 'post-dnd-focus-regression',
          summary: 'Verify edge focus after Container DnD',
          baseRevision: data.document.revision,
          baseDocument: data.document,
          operations: [],
          version: 0,
          createdAt: '2025-01-01T00:00:00.000Z',
        }
        localStorage.setItem(key, JSON.stringify(data))
        return true
      })()`,
    })
    await cdp.call('Page.reload')
    await waitForExpression(
      `Boolean(document.querySelector(
        'aside[aria-label="Details"] [role="group"] > button[aria-pressed]'
      )) && !document.querySelector('[data-drag-overlay]')`,
      'post-DnD focus review state did not restore',
    )
    const lockedPoints = await componentPoint('comp-task-title-input')
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      buttons: 1,
      clickCount: 1,
      x: lockedPoints.source.x,
      y: lockedPoints.source.y,
    })
    for (const distance of [8, 20, 36]) {
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        button: 'left',
        buttons: 1,
        x: lockedPoints.source.x + distance,
        y: lockedPoints.source.y + distance / 2,
      })
      await new Promise(resolveWait => setTimeout(resolveWait, 50))
    }
    const lockedCanvasDrag = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const source = document.querySelector(
          '[data-component-id="comp-task-title-input"]'
        )
        return {
          parent: JSON.parse(
            localStorage.getItem('screen-blueprint-studio:v1')
          ).document.components['comp-task-title-input'].parentId,
          draggable: source.getAttribute('data-canvas-draggable'),
          dragging: source.getAttribute('data-canvas-dragging'),
          cursor: getComputedStyle(source).cursor,
          overlay: Boolean(document.querySelector('[data-drag-overlay]')),
          hitComponent: document.elementFromPoint(
            ${lockedPoints.source.x},
            ${lockedPoints.source.y}
          )?.closest('[data-component-id]')?.getAttribute('data-component-id'),
        }
      })()`,
      returnByValue: true,
    })
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      buttons: 0,
      clickCount: 1,
      x: lockedPoints.source.x + 36,
      y: lockedPoints.source.y + 18,
    })
    assert(
      lockedCanvasDrag.result.value.parent === 'browser-empty-container' &&
        lockedCanvasDrag.result.value.hitComponent === 'comp-task-title-input' &&
        lockedCanvasDrag.result.value.draggable === null &&
        lockedCanvasDrag.result.value.dragging === null &&
        lockedCanvasDrag.result.value.cursor !== 'grab' &&
        lockedCanvasDrag.result.value.cursor !== 'grabbing' &&
        !lockedCanvasDrag.result.value.overlay,
      `review-locked Canvas exposed or started component dragging: ` +
        JSON.stringify(lockedCanvasDrag.result.value),
    )
    await cdp.call('Runtime.evaluate', {
      expression: `document.querySelectorAll(
        '[data-editor-view-switch] > button'
      )[1].click()`,
    })
    await waitForExpression(
      `document.querySelector('[data-editor-view="flow"]').hidden === false`,
      'initial Flow view did not become active',
    )

    for (const width of [1280, 899, 640]) {
      await cdp.call('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      })
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      })
      await new Promise(resolveWait => setTimeout(resolveWait, 100))
      await waitForExpression(
        `document.querySelector('[data-editor-view="flow"]').hidden === false`,
        `${width}px did not begin with Flow view active`,
      )
      await cdp.call('Runtime.evaluate', {
        expression: `document.querySelectorAll(
          '[data-editor-view-switch] > button'
        )[0].click()`,
      })
      await waitForExpression(
        `document.querySelector('[data-editor-view="screen"]').hidden === false &&
          document.querySelector('[data-editor-view="flow"]').hidden === true`,
        `${width}px Screen view did not become active before Flow switching`,
      )
      await cdp.call('Runtime.evaluate', {
        expression: `document.querySelectorAll(
          '[data-editor-view-switch] > button'
        )[1].click()`,
      })
      await waitForExpression(
        `document.querySelector('[data-editor-view="screen"]').hidden === true &&
          document.querySelector('[data-editor-view="flow"]').hidden === false &&
          Boolean(document.querySelector(
            '[data-screen-flow] [data-flow-edge] details > summary'
          ))`,
        `${width}px Screen Flow transition summary did not render`,
      )

      const result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const leftPane = document.querySelector('aside[aria-label="Project navigation"]')
          const rightPane = document.querySelector('aside[aria-label="Details"]')
          const main = leftPane.parentElement
          const headers = [...leftPane.querySelectorAll('h2 > button[aria-expanded]')]
          const sectionBodies = headers.map(header =>
            document.getElementById(header.getAttribute('aria-controls'))
          )
          const tree = leftPane.querySelector('[role="tree"]')
          const treeBody = tree?.parentElement
          const treeSection = treeBody?.closest('section')
          const tabs = [...rightPane.querySelectorAll('[role="group"] > button[aria-pressed]')]
          const snapshots = []
          const productionLeftPane = {
            height: leftPane.getBoundingClientRect().height,
            maxHeight: getComputedStyle(leftPane).maxHeight,
            mainHeight: main.getBoundingClientRect().height,
          }

          function opaqueBackground(element) {
            for (let current = element; current; current = current.parentElement) {
              const color = getComputedStyle(current).backgroundColor
              if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color
            }
            return 'rgb(255, 255, 255)'
          }

          function channels(color) {
            return color.match(/[\\d.]+/g).slice(0, 3).map(Number)
          }

          function luminance(color) {
            const values = channels(color).map(value => {
              const channel = value / 255
              return channel <= 0.04045
                ? channel / 12.92
                : ((channel + 0.055) / 1.055) ** 2.4
            })
            return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]
          }

          function contrast(first, second) {
            const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
            return (values[0] + 0.05) / (values[1] + 0.05)
          }

          function snapshot(element, label) {
            element.focus({ preventScroll: true })
            const style = getComputedStyle(element)
            const rect = element.getBoundingClientRect()
            const clipRects = []
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
              const parentStyle = getComputedStyle(parent)
              if (/(auto|hidden|scroll|clip)/.test(
                parentStyle.overflow + parentStyle.overflowX + parentStyle.overflowY
              )) {
                clipRects.push(parent.getBoundingClientRect())
              }
            }
            const ringColor = style.boxShadow.match(/rgba?\\([^)]+\\)/)?.[0]
            snapshots.push({
              label,
              focusVisible: element.matches(':focus-visible'),
              boxShadow: style.boxShadow,
              outlineStyle: style.outlineStyle,
              contrast: ringColor ? contrast(ringColor, opaqueBackground(element)) : 0,
              fullyInsideClips: clipRects.every(clip => (
                rect.left >= clip.left - 0.5 &&
                rect.top >= clip.top - 0.5 &&
                rect.right <= clip.right + 0.5 &&
                rect.bottom <= clip.bottom + 0.5
              )),
            })
          }

          const maxLeftScroll = leftPane.scrollHeight - leftPane.clientHeight
          const middleLeftScroll = maxLeftScroll / 2
          main.scrollTop = 0
          leftPane.scrollTop = 0
          snapshot(headers[0], 'header-0-scroll-top')
          leftPane.scrollTop = middleLeftScroll
          const actualMiddleLeftScroll = leftPane.scrollTop
          headers[1].scrollIntoView({ block: 'nearest' })
          snapshot(headers[1], 'header-1-after-middle-scroll')
          const internalScrollOwners = [
            ...sectionBodies,
            treeSection,
            treeBody,
          ].map(element => {
            const style = getComputedStyle(element)
            return {
              overflowY: style.overflowY,
              maxHeight: style.maxHeight,
              scrollRange: element.scrollHeight - element.clientHeight,
            }
          })
          leftPane.scrollTop = 0
          const treeItems = [...tree.querySelectorAll('[role="treeitem"]')]
          treeItems[0]?.focus()
          treeItems[0]?.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'End',
            bubbles: true,
            cancelable: true,
          }))
          const focusedTreeItem = document.activeElement
          const focusedTreeRect = focusedTreeItem?.getBoundingClientRect()
          const leftPaneRect = leftPane.getBoundingClientRect()
          const keyboardTreeReach = {
            focusedLastItem: focusedTreeItem === treeItems.at(-1),
            outerScrollTop: leftPane.scrollTop,
            visibleInOuterPane: Boolean(
              focusedTreeRect &&
              focusedTreeRect.top >= leftPaneRect.top - 0.5 &&
              focusedTreeRect.bottom <= leftPaneRect.bottom + 0.5
            ),
          }
          rightPane.scrollIntoView({ block: 'nearest' })
          tabs.forEach((tab, index) => {
            snapshot(tab, 'tab-' + index)
            snapshots.at(-1).activeBorderWidth = getComputedStyle(tab).borderBottomWidth
          })
          const flowViewport = document.querySelector('[data-screen-flow]')
          const flowSummary = flowViewport?.querySelector('[data-flow-edge] details > summary')
          flowViewport?.scrollIntoView({ block: 'nearest' })
          flowSummary?.scrollIntoView({ block: 'nearest' })
          const flowDetails = flowSummary?.closest('details')
          const flowInitiallyOpen = flowDetails?.open
          flowSummary?.click()
          const flowOpened = flowDetails?.open
          const flowMetadata = [
            ...(flowDetails?.querySelector('dl')?.querySelectorAll('dt') ?? []),
          ].map(label => ({
            text: label.textContent.trim(),
            foreground: getComputedStyle(label).color,
            background: opaqueBackground(label),
            fontSize: getComputedStyle(label).fontSize,
            fontWeight: getComputedStyle(label).fontWeight,
            columnGap: getComputedStyle(label.parentElement).columnGap,
            rowGap: getComputedStyle(label.closest('dl')).rowGap,
          }))
          flowSummary?.click()
          const flowClosed = !flowDetails?.open
          if (flowSummary) snapshot(flowSummary, 'flow-summary')

          return {
            controls: snapshots,
            headerCount: headers.length,
            tabCount: tabs.length,
            flowSummaryCount: flowSummary ? 1 : 0,
            flowInitiallyOpen,
            flowOpened,
            flowClosed,
            flowMetadata,
            maxLeftScroll,
            middleLeftScroll,
            actualMiddleLeftScroll,
            internalScrollOwners,
            outerOverflowY: getComputedStyle(leftPane).overflowY,
            productionLeftPane,
            keyboardTreeReach,
            rightPaneWidth: rightPane.getBoundingClientRect().width,
            responsiveContainerWidth: rightPane.parentElement.clientWidth,
            viewportWidth: document.documentElement.clientWidth,
            horizontalOverflow:
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
          }
        })()`,
        returnByValue: true,
      })
      const measurement = result.result.value
      assert(
        measurement.headerCount === 2 &&
          measurement.tabCount === 2 &&
          measurement.flowSummaryCount === 1,
        `${width}px did not render all five edge focus controls: ` +
          JSON.stringify({
            headers: measurement.headerCount,
            tabs: measurement.tabCount,
            flow: measurement.flowSummaryCount,
          }),
      )
      assert(
        measurement.flowInitiallyOpen === false &&
          measurement.flowOpened === true &&
          measurement.flowClosed === true,
        `${width}px Screen Flow transition details did not open and close`,
      )
      assertFlowMetadata(
        measurement.flowMetadata,
        ['Trigger component', 'Event position', 'Action position'],
        width,
        'English',
      )
      assert(
        measurement.maxLeftScroll > 0 &&
          measurement.middleLeftScroll > 0 &&
          Math.abs(measurement.actualMiddleLeftScroll - measurement.middleLeftScroll) < 1,
        `${width}px did not preserve a real middle left-pane scroll position`,
      )
      assert(
        measurement.outerOverflowY === 'auto' &&
          measurement.internalScrollOwners.length === 4 &&
          measurement.internalScrollOwners.every(owner =>
            owner.overflowY === 'visible' &&
            owner.maxHeight === 'none' &&
            owner.scrollRange <= 1
          ),
        `${width}px left pane retained a nested section or Tree scroll owner`,
      )
      assert(
        width < 900
          ? measurement.productionLeftPane.maxHeight === '320px' &&
            measurement.productionLeftPane.height <= 320
          : measurement.productionLeftPane.maxHeight === 'none' &&
            Math.abs(
              measurement.productionLeftPane.height -
              measurement.productionLeftPane.mainHeight
            ) < 1,
        `${width}px left pane production bounds were not preserved`,
      )
      assert(
        measurement.keyboardTreeReach.focusedLastItem &&
          measurement.keyboardTreeReach.outerScrollTop > 0 &&
          measurement.keyboardTreeReach.visibleInOuterPane,
        `${width}px keyboard navigation did not reveal the last Tree item through outer scrolling`,
      )
      for (const control of measurement.controls) {
        assert(control.focusVisible, `${width}px ${control.label} did not match :focus-visible`)
        assert(
          control.outlineStyle === 'none' &&
            control.boxShadow.includes('inset') &&
            control.boxShadow.includes('3px'),
          `${width}px ${control.label} did not render the inset focus perimeter`,
        )
        assert(
          control.fullyInsideClips,
          `${width}px ${control.label} focus perimeter intersects a clipping boundary`,
        )
        assert(
          control.contrast >= 3,
          `${width}px ${control.label} focus contrast is below 3:1`,
        )
      }
      assert(
        measurement.controls
          .filter(control => control.label.startsWith('tab-'))
          .map(control => control.activeBorderWidth)
          .sort()
          .join(',') === '0px,2px',
        `${width}px active tab underline is not distinct from its focus perimeter`,
      )
      assert(
        width < 900
          ? Math.abs(
              measurement.rightPaneWidth - measurement.responsiveContainerWidth
            ) < 1
          : Math.abs(measurement.rightPaneWidth - 300) < 1,
        `${width}px right pane did not use its expected responsive width ` +
          `(${measurement.rightPaneWidth}/${measurement.responsiveContainerWidth})`,
      )
      assert(
        measurement.horizontalOverflow === 0,
        `${width}px focus controls introduced document overflow`,
      )

      await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const selector = document.querySelector('[data-locale-selector]')
          selector.value = 'ja'
          selector.dispatchEvent(new Event('change', { bubbles: true }))
        })()`,
      })
      await waitForExpression(
        `document.documentElement.lang === 'ja'`,
        `${width}px locale did not switch to Japanese`,
      )
      const japaneseResult = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const details = document.querySelector(
            '[data-screen-flow] [data-flow-edge] details'
          )
          if (!details.open) details.querySelector('summary').click()
          function opaqueBackground(element) {
            for (let current = element; current; current = current.parentElement) {
              const color = getComputedStyle(current).backgroundColor
              if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color
            }
            return 'rgb(255, 255, 255)'
          }
          const labels = [...details.querySelector('dl').querySelectorAll('dt')].map(label => ({
            text: label.textContent.trim(),
            foreground: getComputedStyle(label).color,
            background: opaqueBackground(label),
            fontSize: getComputedStyle(label).fontSize,
            fontWeight: getComputedStyle(label).fontWeight,
            columnGap: getComputedStyle(label.parentElement).columnGap,
            rowGap: getComputedStyle(label.closest('dl')).rowGap,
          }))
          details.querySelector('summary').click()
          return labels
        })()`,
        returnByValue: true,
      })
      const japaneseMetadata = japaneseResult.result.value
      assertFlowMetadata(
        japaneseMetadata,
        ['起点コンポーネント', 'イベント位置', 'アクション位置'],
        width,
        'Japanese',
      )
      await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const selector = document.querySelector('[data-locale-selector]')
          selector.value = 'en'
          selector.dispatchEvent(new Event('change', { bubbles: true }))
        })()`,
      })
      await waitForExpression(
        `document.documentElement.lang === 'en'`,
        `${width}px locale did not switch back to English`,
      )
    }

    await cdp.call('Emulation.setEmulatedMedia', {
      features: [{ name: 'forced-colors', value: 'active' }],
    })
    const forcedColors = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const controls = [
          ...document.querySelectorAll(
            'aside[aria-label="Project navigation"] h2 > button[aria-expanded]'
          ),
          ...document.querySelectorAll(
            'aside[aria-label="Details"] [role="group"] > button[aria-pressed]'
          ),
          document.querySelector('[data-screen-flow] [data-flow-edge] details > summary'),
        ].filter(Boolean)
        return controls.map(control => {
          control.focus({ preventScroll: true })
          const style = getComputedStyle(control)
          return {
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            outlineOffset: style.outlineOffset,
            boxShadow: style.boxShadow,
          }
        })
      })()`,
      returnByValue: true,
    })
    assert(
      forcedColors.result.value.length === 5 &&
        forcedColors.result.value.every(control => (
          control.outlineStyle === 'solid' &&
          control.outlineWidth === '2px' &&
          control.outlineOffset === '-2px' &&
          control.boxShadow === 'none'
        )),
      'forced-colors mode does not retain all five internal focus perimeters',
    )
    await cdp.call('Emulation.setEmulatedMedia', { features: [] })

    await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const reject = [...document.querySelectorAll('button')]
          .find(button => button.textContent.trim() === 'Reject')
        reject.click()
      })()`,
    })
    await waitForExpression(
      `!document.querySelector(
        'aside[aria-label="Details"] [role="group"] > button[aria-pressed]'
      )`,
      'review lock did not clear before small-text contrast checks',
    )
    const historyFixture = await cdp.call('Runtime.evaluate', {
      expression: `(async () => {
        const down = [...document.querySelectorAll('button')].find(button => (
          !button.disabled && / down$/.test(button.getAttribute('aria-label') ?? '')
        ))
        const node = down?.closest('[data-tree-component-id]')
        const componentId = node?.dataset.treeComponentId
        const stored = JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
        const parentId = stored.document.components[componentId]?.parentId
        const originalOrder = stored.document.components[parentId]?.childIds
        down?.click()
        await new Promise(resolve => setTimeout(resolve, 0))
        const movedNode = document.querySelector(
          '[data-tree-component-id="' + componentId + '"]'
        )
        const up = [...movedNode.querySelectorAll('button')].find(button => (
          !button.disabled && / up$/.test(button.getAttribute('aria-label') ?? '')
        ))
        up?.click()
        await new Promise(resolve => setTimeout(resolve, 0))
        return { componentId, parentId, originalOrder, movedBack: Boolean(up) }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    assert(
      historyFixture.result.value.componentId &&
        historyFixture.result.value.parentId &&
        historyFixture.result.value.movedBack,
      'focus-order regression could not prepare reversible Tree moves',
    )
    await waitForExpression(
      `!document.querySelector('[data-history-undo]').disabled`,
      'reversible Tree moves did not create Header history',
    )
    await cdp.call('Runtime.evaluate', {
      expression: `document.querySelector('[data-history-undo]').click()`,
    })
    await waitForExpression(
      `!document.querySelector('[data-history-undo]').disabled &&
        !document.querySelector('[data-history-redo]').disabled`,
      'Undo did not prepare enabled adjacent history controls for focus-order testing',
    )
    await cdp.call('Runtime.evaluate', {
      expression: `document.querySelector('[data-locale-selector]').focus()`,
    })
    const pressTrustedTab = async () => {
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      })
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      })
    }
    await pressTrustedTab()
    const firstHistoryFocus = await cdp.call('Runtime.evaluate', {
      expression: `document.activeElement?.hasAttribute('data-history-undo')`,
      returnByValue: true,
    })
    await pressTrustedTab()
    const secondHistoryFocus = await cdp.call('Runtime.evaluate', {
      expression: `document.activeElement?.hasAttribute('data-history-redo')`,
      returnByValue: true,
    })
    assert(
      firstHistoryFocus.result.value === true && secondHistoryFocus.result.value === true,
      'default Header Tab order did not move directly from locale to Undo to Redo',
    )
    await cdp.call('Runtime.evaluate', {
      expression: `document.querySelector('[data-history-undo]').click()`,
    })
    await waitForExpression(
      `JSON.stringify(
          JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
            .document.components[${JSON.stringify(historyFixture.result.value.parentId)}].childIds
        ) === ${JSON.stringify(JSON.stringify(historyFixture.result.value.originalOrder))}`,
      'focus-order regression did not restore the original Tree order',
    )

    for (const toolbarWidth of [1280, 899, 640]) {
      await cdp.call('Emulation.setDeviceMetricsOverride', {
        width: toolbarWidth,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
      const toolbarGeometry = await cdp.call('Runtime.evaluate', {
        expression: `(async () => {
          const stateIds = [
            'state-edit-default',
            'state-edit-saving',
            'state-edit-success',
            'state-edit-error',
            'state-edit-confirm-exit',
          ]
          const settle = () => new Promise(resolve => setTimeout(resolve, 0))
          const samples = []
          for (const stateId of stateIds) {
            document.querySelector('[data-state-id="' + stateId + '"]').click()
            await settle()
            const bar = document.querySelector('[data-state-bar]').getBoundingClientRect()
            const actions = document.querySelector('[data-state-actions]').getBoundingClientRect()
            const tabs = [...document.querySelectorAll('[data-state-id]')].map(tab => {
              const rect = tab.getBoundingClientRect()
              return { id: tab.dataset.stateId, top: rect.top }
            })
            samples.push({
              stateId,
              barHeight: bar.height,
              actionsWidth: actions.width,
              actionCount: document.querySelectorAll('[data-state-actions] button').length,
              tabs,
            })
          }
          return samples
        })()`,
        awaitPromise: true,
        returnByValue: true,
      })
      const toolbarSamples = toolbarGeometry.result.value
      const toolbarBaseline = toolbarSamples[0]
      assert(
        toolbarSamples.length === 5 &&
          toolbarSamples.every(sample => (
            sample.actionCount === 2 &&
            Math.abs(sample.barHeight - toolbarBaseline.barHeight) < 0.5 &&
            Math.abs(sample.actionsWidth - toolbarBaseline.actionsWidth) < 0.5 &&
            sample.tabs.every((tab, index) => (
              tab.id === toolbarBaseline.tabs[index].id &&
              Math.abs(tab.top - toolbarBaseline.tabs[index].top) < 0.5
            ))
          )),
        `${toolbarWidth}px active state changes shifted tab rows or toolbar geometry: ` +
          JSON.stringify(toolbarSamples),
      )
    }

    const feedbackStates = await cdp.call('Runtime.evaluate', {
      expression: `(async () => {
        const cases = [
          ['Task List', 'state-list-loading', 'comp-list-loading-message', 'comp-list-loading-message-text', 'Loading tasks...'],
          ['Task List', 'state-list-empty', 'comp-list-empty-message', 'comp-list-empty-message-text', 'No tasks yet. Create the first task for your team.'],
          ['Task List', 'state-list-error', 'comp-list-error-message', 'comp-list-error-message-text', 'Could not load tasks. Try again.'],
          ['Task List', 'state-list-creating', 'comp-create-task-progress-message', 'comp-create-task-progress-message-text', 'Creating task...'],
          ['Task List', 'state-list-create-error', 'comp-create-task-error-message', 'comp-create-task-error-message-text', 'Could not create the task. Try again.'],
          ['Edit Task', 'state-edit-saving', 'comp-saving-message', 'comp-saving-message-text', 'Saving task...'],
          ['Edit Task', 'state-edit-success', 'comp-status-message', 'comp-status-message-text', 'Task updated successfully.'],
          ['Edit Task', 'state-edit-error', 'comp-save-error-message', 'comp-save-error-message-text', 'Could not update the task. Review the details and try again.'],
        ]
        const settle = () => new Promise(resolve => setTimeout(resolve, 0))
        const results = []
        let activeScreen = ''
        for (const [screenName, stateId, containerId, textId, expectedText] of cases) {
          if (screenName !== activeScreen) {
            const screenButton = [...document.querySelectorAll('button')].find(button =>
              button.textContent.trim() === screenName
            )
            screenButton?.click()
            await settle()
            activeScreen = screenName
          }
          document.querySelector('[data-state-id="' + stateId + '"]')?.click()
          await settle()
          const container = document.querySelector('[data-component-id="' + containerId + '"]')
          const text = document.querySelector('[data-component-id="' + textId + '"]')
          results.push({
            stateId,
            containerVisible: container?.getAttribute('data-component-visible'),
            childOwned: text?.parentElement?.closest('[data-component-id]') === container,
            actualText: text?.textContent.trim(),
            expectedText,
          })
        }
        return results
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    assert(
      feedbackStates.result.value.length === 8 &&
        feedbackStates.result.value.every(result =>
          result.containerVisible === 'true' &&
          result.childOwned &&
          result.actualText.includes(result.expectedText)
        ),
      `TaskFlow feedback states did not render their Container and Text content: ${
        JSON.stringify(feedbackStates.result.value)
      }`,
    )

    const defaultDialog = await cdp.call('Runtime.evaluate', {
      expression: `(async () => {
        document.querySelector('[data-state-id="state-edit-default"]').click()
        await new Promise(resolve => setTimeout(resolve, 0))
        const manage = document.querySelector('[data-state-manage]')
        manage.focus()
        manage.click()
        await new Promise(resolve => setTimeout(resolve, 0))
        const dialog = document.querySelector(
          '[data-state-dialog="edit"][data-default-state="true"]'
        )
        const name = dialog.querySelector('[data-state-name]')
        const description = dialog.querySelector('[data-state-description]')
        const result = {
          opened: Boolean(dialog),
          nameReadOnly: name.readOnly,
          deleteCount: dialog.querySelectorAll('[data-state-delete]').length,
          manageLabel: document.querySelector('[data-state-manage]').getAttribute('aria-label'),
        }
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value'
        ).set
        setter.call(description, 'Base edit experience')
        description.dispatchEvent(new Event('input', { bubbles: true }))
        dialog.querySelector('button[type="submit"]').click()
        await new Promise(resolve => setTimeout(resolve, 0))
        return result
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    assert(
      defaultDialog.result.value.opened &&
      defaultDialog.result.value.nameReadOnly &&
      defaultDialog.result.value.deleteCount === 0 &&
      defaultDialog.result.value.manageLabel === 'Edit Default',
      'Default state dialog did not preserve its fixed-name/editable-description contract: ' +
        JSON.stringify(defaultDialog.result.value),
    )
    await waitForExpression(
      `document.querySelector('[data-state-description]') === null &&
        document.querySelector('[data-state-bar]').textContent.includes('Base edit experience') &&
        JSON.parse(localStorage.getItem('screen-blueprint-studio:v1'))
          .document.screenStates['state-edit-default'].description === 'Base edit experience'`,
      'Default state description did not save to Canvas and persistence',
    )
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'z',
      code: 'KeyZ',
      windowsVirtualKeyCode: 90,
      modifiers: 4,
    })
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'z',
      code: 'KeyZ',
      windowsVirtualKeyCode: 90,
      modifiers: 4,
    })
    await waitForExpression(
      `document.querySelector('[data-state-bar]').textContent.includes(
          'Task details are ready to edit'
        )`,
      'Undo did not restore the previous Default description',
    )
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'z',
      code: 'KeyZ',
      windowsVirtualKeyCode: 90,
      modifiers: 12,
    })
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'z',
      code: 'KeyZ',
      windowsVirtualKeyCode: 90,
      modifiers: 12,
    })
    await waitForExpression(
      `document.querySelector('[data-state-bar]').textContent.includes(
          'Base edit experience'
        )`,
      'Redo did not restore the edited Default description',
    )
    await cdp.call('Page.reload')
    await waitForExpression(
      `document.querySelector('[data-state-id="state-edit-default"][aria-pressed="true"]') &&
        document.querySelector('[data-state-actions]')?.children.length === 2 &&
        document.querySelector('[data-state-bar]').textContent.includes(
          'Base edit experience'
        )`,
      'Default description or stable action slots did not survive reload',
    )

    for (const width of [1280, 899, 640]) {
      await cdp.call('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          document.querySelectorAll('[data-editor-view-switch] > button')[0].click()
          const saving = [...document.querySelectorAll(
            '[data-editor-view="screen"] button[aria-pressed]'
          )].find(button => button.textContent.trim() === 'Saving')
          saving.click()
          document.querySelector('[data-component-id="comp-save-btn"]').click()
        })()`,
      })
      await waitForExpression(
        `Boolean(
          document.querySelector('[data-frame-state-badge]') &&
          document.querySelector(
            '[data-state-overrides][data-override-mode="override"]'
          ) &&
          document.querySelector('[data-inspector-section-toggle="behavior"]')
        )`,
        `${width}px small-text contrast surfaces did not render`,
      )
      await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const toggle = document.querySelector(
            '[data-inspector-section-toggle="behavior"]'
          )
          if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click()
        })()`,
      })
      await waitForExpression(
        `document.querySelector(
          '[data-inspector-section-toggle="behavior"]'
        ).getAttribute('aria-expanded') === 'true' &&
          Boolean(document.querySelector('[data-event-edit="event-save-task"]'))`,
        `${width}px Event section did not expand`,
      )
      const eventButtonState = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const button = document.querySelector('[data-event-edit="event-save-task"]')
          const fieldset = button.closest('fieldset')
          const state = {
            disabled: button.disabled,
            fieldsetDisabled: fieldset?.disabled ?? false,
            hidden: button.closest('[hidden]') !== null,
          }
          button.click()
          return state
        })()`,
        returnByValue: true,
      })
      assert(
        !eventButtonState.result.value.disabled &&
          !eventButtonState.result.value.fieldsetDisabled &&
          !eventButtonState.result.value.hidden,
        `${width}px Event edit button is not operable: ` +
          JSON.stringify(eventButtonState.result.value),
      )
      await waitForExpression(
        `Boolean(document.querySelector('[data-event-dialog="edit"]'))`,
        `${width}px Event dialog did not open`,
      )
      const eventActionCount = await cdp.call('Runtime.evaluate', {
        expression: `document.querySelectorAll(
          '[data-event-dialog="edit"] [data-event-action-position]'
        ).length`,
        returnByValue: true,
      })
      assert(
        eventActionCount.result.value === 2,
        `${width}px Event dialog has ${eventActionCount.result.value} actions instead of two`,
      )
      const englishSmallText = await cdp.call('Runtime.evaluate', {
        expression: smallTextMeasurementExpression,
        returnByValue: true,
      })
      assertSmallTextMeasurements(englishSmallText.result.value, width, 'en')

      await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          const selector = document.querySelector('[data-locale-selector]')
          selector.value = 'ja'
          selector.dispatchEvent(new Event('change', { bubbles: true }))
        })()`,
      })
      await waitForExpression(
        `document.documentElement.lang === 'ja'`,
        `${width}px small-text locale did not switch to Japanese`,
      )
      const japaneseSmallText = await cdp.call('Runtime.evaluate', {
        expression: smallTextMeasurementExpression,
        returnByValue: true,
      })
      assertSmallTextMeasurements(japaneseSmallText.result.value, width, 'ja')

      await cdp.call('Runtime.evaluate', {
        expression: `(() => {
          document.querySelector('[data-event-dialog="edit"] button').click()
          const selector = document.querySelector('[data-locale-selector]')
          selector.value = 'en'
          selector.dispatchEvent(new Event('change', { bubbles: true }))
        })()`,
      })
      await waitForExpression(
        `document.documentElement.lang === 'en' &&
          !document.querySelector('[data-event-dialog]')`,
        `${width}px Event dialog or locale did not reset`,
      )
    }

  } catch (error) {
    primaryError = interruptedError ?? error
    throw primaryError
  } finally {
    const cleanupErrors = []
    try {
      cdp?.close()
    } catch (error) {
      cleanupErrors.push(error)
    }
    if (chrome?.pid) {
      try {
        await stopChrome(chrome)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (server) {
      try {
        await new Promise((resolveClose, rejectClose) => {
          server.close(error => error ? rejectClose(error) : resolveClose())
        })
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (profile) {
      try {
        await removeProfile(profile)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler)
    }
    primaryError ??= interruptedError
    if (primaryError && cleanupErrors.length === 0) throw primaryError
    throwCleanupErrors(primaryError, cleanupErrors)
  }
}

function verifyEarlyFailureCleanup() {
  const testRoot = mkdtempSync(join(tmpdir(), 'screen-blueprint-focus-cleanup-'))
  try {
    for (const stage of ['after-profile', 'after-server', 'after-chrome', 'chrome-spawn']) {
      const pidFile = join(testRoot, `${stage}.pid`)
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(import.meta.url)],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            FOCUS_RING_FAILURE_STAGE: stage,
            FOCUS_RING_TEMP_ROOT: testRoot,
            FOCUS_RING_PID_FILE: stage === 'after-chrome' ? pidFile : '',
          },
        },
      )
      assert(result.status !== 0, `${stage} cleanup injection did not fail`)
      if (stage === 'after-chrome') {
        const chromePid = Number(readFileSync(pidFile, 'utf8'))
        const chromeAlive = chromeProcessGroupExists(chromePid)
        unlinkSync(pidFile)
        assert(!chromeAlive, 'after-chrome cleanup left the browser process group alive')
      }
      assert(
        readdirSync(testRoot).length === 0,
        `${stage} cleanup left a temporary browser profile`,
      )
    }
  } finally {
    rmSync(testRoot, { recursive: true, force: true })
  }
}

async function verifySignalCleanup() {
  const testRoot = mkdtempSync(join(tmpdir(), 'screen-blueprint-focus-signal-'))
  const pidFile = join(testRoot, 'chrome.pid')
  let chromePid
  let primaryError
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: root,
    env: {
      ...process.env,
      FOCUS_RING_FAILURE_STAGE: 'signal',
      FOCUS_RING_PID_FILE: pidFile,
      FOCUS_RING_TEMP_ROOT: testRoot,
    },
    stdio: 'ignore',
  })
  try {
    const pidDeadline = Date.now() + 8_000
    while (!existsSync(pidFile) && Date.now() < pidDeadline) {
      await new Promise(resolveWait => setTimeout(resolveWait, 25))
    }
    assert(existsSync(pidFile), 'signal cleanup test did not start Chrome')
    chromePid = Number(readFileSync(pidFile, 'utf8'))
    child.kill('SIGTERM')
    const exitDeadline = Date.now() + 10_000
    while (child.exitCode === null && child.signalCode === null && Date.now() < exitDeadline) {
      await new Promise(resolveWait => setTimeout(resolveWait, 25))
    }
    assert(
      child.exitCode !== null || child.signalCode !== null,
      'signal cleanup test process did not exit',
    )
    assert(
      !chromeProcessGroupExists(chromePid),
      'signal cleanup left the Chrome process group alive',
    )
    unlinkSync(pidFile)
    assert(readdirSync(testRoot).length === 0, 'signal cleanup left a browser profile')
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const cleanupErrors = []
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill('SIGKILL')
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (chromePid) {
      try {
        await stopChrome({ pid: chromePid })
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    try {
      await removeProfile(testRoot)
    } catch (error) {
      cleanupErrors.push(error)
    }
    throwCleanupErrors(primaryError, cleanupErrors)
  }
}

async function verifyProfileCleanupSemantics() {
  let transientAttempts = 0
  let transientProfileExists = true
  await removeProfile('/injected/transient-profile', {
    exists: () => transientProfileExists,
    maxAttempts: 6,
    requiredAbsentChecks: 2,
    remove: () => {
      transientAttempts += 1
      if (transientAttempts === 1) {
        const error = new Error('injected ENOTEMPTY')
        error.code = 'ENOTEMPTY'
        throw error
      }
      transientProfileExists = false
    },
    wait: async () => {},
  })
  assert(
    transientAttempts >= 3 && !transientProfileExists,
    'transient ENOTEMPTY cleanup did not retry through stable profile removal',
  )

  const permanentCleanupError = new Error('injected permanent ENOTEMPTY')
  permanentCleanupError.code = 'ENOTEMPTY'
  let reportedCleanupError
  try {
    await removeProfile('/injected/permanent-profile', {
      exists: () => true,
      maxAttempts: 2,
      requiredAbsentChecks: 1,
      remove: () => {
        throw permanentCleanupError
      },
      wait: async () => {},
    })
  } catch (error) {
    reportedCleanupError = error
  }
  assert(
    reportedCleanupError === permanentCleanupError,
    'permanent profile cleanup failure was not reported',
  )

  const primaryError = new Error('injected browser assertion failure')
  let aggregate
  try {
    throwCleanupErrors(primaryError, [permanentCleanupError])
  } catch (error) {
    aggregate = error
  }
  assert(
    aggregate instanceof AggregateError &&
      aggregate.errors[0] === primaryError &&
      aggregate.errors[1] === permanentCleanupError,
    'cleanup AggregateError did not preserve both primary and cleanup failures',
  )
}

if (process.platform === 'win32') {
  throw new Error(
    'The focus-ring browser regression supports macOS and Linux; ' +
      'Windows process-tree cleanup is not implemented safely.',
  )
} else if (process.env.FOCUS_RING_FAILURE_STAGE) {
  await run()
} else {
  await verifyProfileCleanupSemantics()
  verifyEarlyFailureCleanup()
  await verifySignalCleanup()
  const stressRuns = Number.parseInt(process.env.FOCUS_RING_STRESS_RUNS ?? '1', 10)
  assert(
    Number.isInteger(stressRuns) && stressRuns >= 1 && stressRuns <= 50,
    'FOCUS_RING_STRESS_RUNS must be an integer between 1 and 50',
  )
  for (let runIndex = 0; runIndex < stressRuns; runIndex += 1) {
    await run()
  }
  console.log(
    `PASS edge focus rings stay visible in real browser clipping layouts (${stressRuns} run` +
      `${stressRuns === 1 ? '' : 's'})`,
  )
}
