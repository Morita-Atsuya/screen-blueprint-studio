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
    browserDocument.events['event-submit'].actions.push({
      type: 'navigate',
      destinationScreenId: 'screen-list',
    })
    const persisted = JSON.stringify({
      document: browserDocument,
      activeScreenId: 'screen-edit',
      activeChangeSet: {
        id: 'focus-ring-browser-regression',
        summary: 'Edge focus regression',
        baseRevision: browserDocument.revision,
        baseDocument: browserDocument,
        operations: [],
        version: 0,
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
          const tabs = [...rightPane.querySelectorAll('[role="group"] > button[aria-pressed]')]
          const snapshots = []
          leftPane.style.height = '180px'
          leftPane.style.maxHeight = '180px'

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
          snapshot(headers[1], 'header-1-scroll-middle')
          const actualMiddleLeftScroll = leftPane.scrollTop
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
          const flowMetadata = [...(flowDetails?.querySelectorAll('dt') ?? [])].map(label => ({
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
        `${width}px did not render all five edge focus controls`,
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
          const labels = [...details.querySelectorAll('dt')].map(label => ({
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
        ['起点コンポーネント', 'イベント位置', 'action位置'],
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
      forcedColors.result.value.every(control => (
        control.outlineStyle === 'solid' &&
        control.outlineWidth === '2px' &&
        control.outlineOffset === '-2px' &&
        control.boxShadow === 'none'
      )),
      'forced-colors mode does not retain an internal system-color focus perimeter',
    )
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
