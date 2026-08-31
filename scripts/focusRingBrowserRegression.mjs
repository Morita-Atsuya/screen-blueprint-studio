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
          rejectCall(new Error(`${method} timed out`))
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
      common: { description: 'Empty browser group', visible: true, enabled: true },
      config: { ...containerLayout, layout: 'horizontal' },
    }
    browserDocument.components['browser-nested-container'] = {
      id: 'browser-nested-container',
      screenId: 'screen-edit',
      parentId: 'comp-edit-section',
      childIds: ['browser-inner-container'],
      kind: 'container',
      common: { description: 'Nested browser group', visible: true, enabled: true },
      config: containerLayout,
    }
    browserDocument.components['browser-inner-container'] = {
      id: 'browser-inner-container',
      screenId: 'screen-edit',
      parentId: 'browser-nested-container',
      childIds: [],
      kind: 'container',
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
      ['browser-tree-level-3', 'browser-tree-level-2', 'browser-tree-state-alert', 'Status group'],
    ]) {
      browserDocument.components[id] = {
        id,
        screenId: 'screen-edit',
        parentId,
        childIds: [childId],
        kind: 'container',
        common: { description, visible: true, enabled: true },
        config: containerLayout,
      }
    }
    browserDocument.components['browser-tree-state-alert'] = {
      id: 'browser-tree-state-alert',
      screenId: 'screen-edit',
      parentId: 'browser-tree-level-3',
      childIds: [],
      kind: 'alert',
      common: { description: 'Deep review status', visible: false, enabled: false },
      config: { kind: 'alert', tone: 'info', message: 'Waiting for review' },
    }
    browserDocument.screenStates['state-edit-success'].componentOverrides[
      'browser-tree-state-alert'
    ] = { message: 'Ready for review' }
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
              componentId: 'browser-tree-state-alert',
              patch: { config: { message: 'Agent review pending' } },
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
          '[data-tree-component-id="browser-tree-state-alert"]'
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
            '[data-tree-component-id="browser-tree-state-alert"]'
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
          '[data-tree-component-id="browser-tree-state-alert"] [data-tree-state-status]'
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
              identity: element.querySelector(
                ':scope > [data-container-identity][aria-hidden="true"]'
              )?.textContent.trim(),
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
          containerMeasurement.empty.identity === 'Empty browser group' &&
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
          containerMeasurement.nested.identity === 'Nested browser group' &&
          containerMeasurement.inner.identity === 'Inner browser group updated' &&
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
    const dragPoints = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const source = document.querySelector('[data-palette-kind="container"]')
          .getBoundingClientRect()
        const target = document.querySelector(
          '[data-drop-surface="canvas"][data-drop-parent="browser-empty-container"]'
        ).getBoundingClientRect()
        return {
          source: { x: source.left + source.width / 2, y: source.top + source.height / 2 },
          target: { x: target.left + target.width / 2, y: target.top + target.height / 2 },
        }
      })()`,
      returnByValue: true,
    })
    const { source: dragSource, target: dragTarget } = dragPoints.result.value
    await cdp.call('Runtime.evaluate', {
      expression: `(async () => {
        const source = document.querySelector('[data-palette-kind="container"]')
        const pointer = (type, x, y, buttons) => new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 101,
          pointerType: 'mouse',
          isPrimary: true,
          button: type === 'pointerup' ? 0 : 0,
          buttons,
          clientX: x,
          clientY: y,
        })
        source.dispatchEvent(pointer(
          'pointerdown', ${dragSource.x}, ${dragSource.y}, 1
        ))
        document.dispatchEvent(pointer(
          'pointermove', ${dragSource.x + 10}, ${dragSource.y + 10}, 1
        ))
        await new Promise(resolveWait => setTimeout(resolveWait, 50))
        document.dispatchEvent(pointer(
          'pointermove', ${dragTarget.x}, ${dragTarget.y}, 1
        ))
        await new Promise(resolveWait => setTimeout(resolveWait, 100))
        return true
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
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
        dragState.result.value.overlay,
      `empty Container was not the active registered collision target: ` +
        JSON.stringify(dragState.result.value),
    )
    await cdp.call('Runtime.evaluate', {
      expression: `document.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerId: 101,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: ${dragTarget.x},
        clientY: ${dragTarget.y},
      }))`,
    })
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
          const sourceTarget = source.querySelector(
            ':scope > [data-container-identity]'
          ) ?? source
          const sourceRect = sourceTarget.getBoundingClientRect()
          const sourcePoint = {
            x: sourceRect.left + sourceRect.width / 2,
            y: sourceRect.top + sourceRect.height / 2,
          }
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
            targetActive: ${targetParentId === undefined
              ? 'true'
              : `[...document.querySelectorAll(
                  '[data-drop-surface="canvas"][data-drop-parent=${JSON.stringify(targetParentId)}]'
                )].some(target => target.className.includes('_over_'))`},
          }
        })()`,
        returnByValue: true,
      })
      assert(
        feedback.result.value.overlay &&
          feedback.result.value.dragging === 'true' &&
          feedback.result.value.cursor === 'grabbing' &&
          feedback.result.value.opacity === '0.3' &&
          feedback.result.value.targetActive,
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
