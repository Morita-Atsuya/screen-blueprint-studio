import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function chromeExecutable() {
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

async function waitForJson(url, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
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
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolveListen)
  })
  return server
}

async function run() {
  const profile = mkdtempSync(join(tmpdir(), 'screen-blueprint-focus-'))
  const debuggingPort = await freePort()
  const appPort = await freePort()
  const server = await startStaticServer(appPort)
  let chrome
  let cdp

  try {
    const sampleBundle = join(profile, 'sampleProject.mjs')
    execFileSync(join(root, 'node_modules', '.bin', 'esbuild'), [
      join(root, 'src/sample/sampleProject.ts'),
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${sampleBundle}`,
    ], { stdio: 'pipe' })
    const { sampleProject } = await import(pathToFileURL(sampleBundle))
    const persisted = JSON.stringify({
      document: sampleProject,
      activeScreenId: 'screen-edit',
      activeChangeSet: {
        id: 'focus-ring-browser-regression',
        summary: 'Edge focus regression',
        baseRevision: sampleProject.revision,
        baseDocument: sampleProject,
        operations: [],
        version: 0,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    })
    const appUrl = `http://127.0.0.1:${appPort}/`
    chrome = spawn(chromeExecutable(), [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${debuggingPort}`,
      appUrl,
    ], { stdio: 'ignore' })

    const targets = await waitForJson(`http://127.0.0.1:${debuggingPort}/json`)
    const page = targets.find(target => target.type === 'page' && target.url === appUrl)
    assert(page, 'Chrome did not open the focus-ring regression page')
    cdp = connectCdp(page.webSocketDebuggerUrl)
    await cdp.open()
    await cdp.call('Runtime.enable')
    await cdp.call('Page.enable')

    const waitForExpression = async (expression, failureMessage) => {
      const deadline = Date.now() + 20_000
      while (Date.now() < deadline) {
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

          return {
            controls: snapshots,
            headerCount: headers.length,
            tabCount: tabs.length,
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
        measurement.headerCount === 2 && measurement.tabCount === 2,
        `${width}px did not render all four edge focus controls`,
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
        ]
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
  } finally {
    cdp?.close()
    if (chrome && chrome.exitCode === null) {
      chrome.kill('SIGTERM')
      await new Promise(resolveExit => {
        chrome.once('exit', resolveExit)
        setTimeout(resolveExit, 1_000)
      })
      if (chrome.exitCode === null) {
        chrome.kill('SIGKILL')
        await new Promise(resolveExit => chrome.once('exit', resolveExit))
      }
    }
    await new Promise(resolveClose => server.close(resolveClose))
    rmSync(profile, { recursive: true, force: true })
  }
}

await run()
console.log('PASS edge focus rings stay visible in real browser clipping layouts')
