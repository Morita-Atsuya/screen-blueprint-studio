import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const workspaceKey = 'screen-blueprint-studio:workspace:v3'

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
  if (!executable) throw new Error('Chrome or Chromium is required for browser regression')
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

async function startStaticServer(port) {
  const dist = join(root, 'dist')
  assert(existsSync(join(dist, 'index.html')), 'run npm run build before browser regression')
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

async function waitForJson(url, timeoutMs = 10_000) {
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
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', () => rejectOpen(
      new Error('Chrome DevTools WebSocket failed to open'),
    ), { once: true })
  })
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timeout)
    if (message.error || message.result?.exceptionDetails) {
      request.rejectCall(new Error(
        `${request.method}: ${JSON.stringify(message.error ?? message.result.exceptionDetails)}`,
      ))
    } else {
      request.resolveCall(message.result)
    }
  })
  return {
    open: () => openPromise,
    call(method, params = {}) {
      return new Promise((resolveCall, rejectCall) => {
        const id = ++nextId
        const timeout = setTimeout(() => {
          pending.delete(id)
          rejectCall(new Error(`${method} timed out`))
        }, 10_000)
        pending.set(id, { method, resolveCall, rejectCall, timeout })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
    close: () => socket.close(),
  }
}

async function stopChrome(chrome) {
  if (!chrome?.pid) return
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    try {
      process.kill(-chrome.pid, signal)
    } catch (error) {
      if (error.code === 'ESRCH') return
      throw error
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 250))
    try {
      process.kill(chrome.pid, 0)
    } catch (error) {
      if (error.code === 'ESRCH') return
    }
  }
}

async function sampleBrowserDocument(profile) {
  const bundle = join(profile, 'sampleProject.mjs')
  execFileSync(join(root, 'node_modules', '.bin', 'esbuild'), [
    join(root, 'src/sample/sampleProject.ts'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    `--outfile=${bundle}`,
  ], { stdio: 'pipe' })
  const { sampleProject } = await import(pathToFileURL(bundle))
  const document = structuredClone(sampleProject)
  const definition = document.componentDefinitions['shared/header']
  definition.nodes['header-copy'].childIds.push('header-link')
  definition.nodes['header-link'] = {
    nodeType: 'inline',
    id: 'header-link',
    parentId: 'header-copy',
    childIds: [],
    kind: 'link',
    placement: { mode: 'flow' },
    sizing: {
      inlineSize: 'content',
      minWidth: 'none',
      maxWidth: 'none',
      gridSpan: 1,
      grow: 0,
      shrink: 'allow',
    },
    common: {
      description: 'Shared planning guide link',
      visible: true,
      enabled: true,
    },
    config: {
      kind: 'link',
      label: 'Planning guide',
      destination: { type: 'external', url: 'https://example.com/planning' },
      openMode: 'newContext',
    },
  }
  return document
}

async function run() {
  let profile
  let server
  let chrome
  let cdp
  try {
    profile = mkdtempSync(join(tmpdir(), 'screen-blueprint-browser-'))
    const document = await sampleBrowserDocument(profile)
    const appPort = await freePort()
    const debuggingPort = await freePort()
    server = await startStaticServer(appPort)
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
    ], { detached: true, stdio: 'ignore' })

    const targets = await waitForJson(`http://127.0.0.1:${debuggingPort}/json`)
    const page = targets.find(target => target.type === 'page' && target.url === appUrl)
    assert(page, 'Chrome did not open the app page')
    cdp = connectCdp(page.webSocketDebuggerUrl)
    await cdp.open()
    await cdp.call('Runtime.enable')
    await cdp.call('Page.enable')

    const evaluate = async expression => {
      const result = await cdp.call('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      return result.result.value
    }
    const waitFor = async (expression, message) => {
      const deadline = Date.now() + 15_000
      while (Date.now() < deadline) {
        try {
          if (await evaluate(expression)) return
        } catch {
          // Reloads briefly replace the execution context.
        }
        await new Promise(resolveWait => setTimeout(resolveWait, 50))
      }
      throw new Error(message)
    }
    const reload = async () => {
      await cdp.call('Page.reload')
      await waitFor(
        `document.readyState === 'complete' && Boolean(document.querySelector('#root > *'))`,
        'application did not render after reload',
      )
    }

    await waitFor(
      `document.readyState === 'complete' && Boolean(document.querySelector('#root > *'))`,
      'application did not render',
    )
    await evaluate(`(() => {
      localStorage.setItem(${JSON.stringify(workspaceKey)}, ${JSON.stringify(JSON.stringify({
        revision: 0,
        document,
        activeScreenId: 'screen-list',
        activeStateId: undefined,
        selection: undefined,
      }))})
      localStorage.setItem('screen-blueprint-studio:locale:v1', 'en')
      return true
    })()`)
    await reload()

    const initial = await evaluate(`(() => {
      const frame = document.querySelector(
        '[data-owning-frame-kind="page"][data-owning-frame-id="comp-list-page"]'
      )
      const instance = document.querySelector('[data-component-id="comp-list-header"]')
      const nodes = [...document.querySelectorAll(
        '[data-instance-id="comp-list-header"][data-resolved-definition-node]'
      )]
      const ids = nodes.map(node => node.getAttribute('data-component-id'))
      const link = instance.querySelector('a')
      return {
        resetCount: document.querySelectorAll('[data-sample-reset]').length,
        instanceCount: document.querySelectorAll('[data-component-id="comp-list-header"]').length,
        dragCount: document.querySelectorAll(
          '[data-drag-surface="canvas"][data-drag-component="comp-list-header"]'
        ).length,
        nodeCount: nodes.length,
        uniqueIds: new Set(ids).size,
        projectedOnce: instance.closest('[data-placement-projection="sticky"]') !== null,
        owningFrame: frame?.contains(instance),
        resolvedDraggables: nodes.filter(node => node.hasAttribute('data-canvas-draggable')).length,
        link: link && {
          target: link.getAttribute('target'),
          rel: link.getAttribute('rel'),
          text: link.textContent.trim(),
        },
        nodePaths: nodes.map(node => node.getAttribute('data-node-path')),
      }
    })()`)
    assert(initial.resetCount === 0, 'default build exposed the sample reset button')
    assert(
      initial.instanceCount === 1 &&
        initial.dragCount === 1 &&
        initial.nodeCount === 5 &&
        initial.uniqueIds === 5 &&
        initial.projectedOnce &&
        initial.owningFrame &&
        initial.resolvedDraggables === 0,
      `resolved Instance identity or projection drifted: ${JSON.stringify(initial)}`,
    )
    assert(
      initial.link?.target === '_blank' &&
        initial.link.rel === 'noopener noreferrer' &&
        initial.link.text === 'Planning guide',
      `resolved Link lost safe anchor semantics: ${JSON.stringify(initial.link)}`,
    )
    assert(
      JSON.stringify(initial.nodePaths) === JSON.stringify([
        'header-root',
        'header-copy',
        'header-copy/header-title',
        'header-copy/header-subtitle',
        'header-copy/header-link',
      ]),
      `resolved DOM order no longer follows canonical node order: ${JSON.stringify(initial.nodePaths)}`,
    )
    console.log('PASS resolved Instance identity, projection, DnD, and Link semantics')

    await evaluate(`document.querySelector(
      '[data-instance-id="comp-list-header"][data-definition-node-id="header-title"]'
    ).click()`)
    await waitFor(
      `Boolean(document.querySelector('[data-resolved-node-inspector]'))`,
      'resolved node selection did not open its typed Inspector',
    )
    const selected = await evaluate(`(() => {
      const selected = document.querySelector('[data-editor-selected="true"]')
      return {
        instanceId: selected?.getAttribute('data-instance-id'),
        path: selected?.getAttribute('data-node-path'),
        sealed: document.querySelector('[data-resolved-node-inspector]')?.textContent.includes(
          'sealed'
        ),
        eventEditor: Boolean(document.querySelector(
          '[data-resolved-node-inspector] [data-event-add]'
        )),
        apiEditor: Boolean(document.querySelector(
          '[data-resolved-node-inspector] [data-api-add]'
        )),
      }
    })()`)
    assert(
      selected.instanceId === 'comp-list-header' &&
        selected.path === 'header-copy/header-title' &&
        selected.sealed &&
        selected.eventEditor &&
        selected.apiEditor,
      `resolved selection identity drifted: ${JSON.stringify(selected)}`,
    )
    const contextSelection = await evaluate(`(() => {
      const node = document.querySelector(
        '[data-instance-id="comp-list-header"][data-definition-node-id="header-title"]'
      )
      node.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      }))
      return document.querySelector('[data-editor-selected="true"]')
        ?.getAttribute('data-node-path')
    })()`)
    assert(
      contextSelection === 'header-copy/header-title',
      'resolved-node context menu selected the enclosing Instance',
    )
    await evaluate(`document.querySelector('[data-editor-selected="true"]').focus()`)
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: '[',
      code: 'BracketLeft',
      windowsVirtualKeyCode: 219,
    })
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: '[',
      code: 'BracketLeft',
      windowsVirtualKeyCode: 219,
    })
    await waitFor(
      `document.querySelector('[data-editor-selected="true"]')
        ?.getAttribute('data-node-path') === 'header-copy'`,
      'resolved hierarchy shortcut did not select the canonical parent',
    )
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: ']',
      code: 'BracketRight',
      windowsVirtualKeyCode: 221,
    })
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: ']',
      code: 'BracketRight',
      windowsVirtualKeyCode: 221,
    })
    await waitFor(
      `document.querySelector('[data-editor-selected="true"]')
        ?.getAttribute('data-node-path') === 'header-copy/header-title'`,
      'resolved hierarchy shortcut did not select the canonical first child',
    )
    console.log('PASS resolved Definition node selection stays typed and sealed')

    await evaluate(`document.querySelectorAll('[data-editor-view-switch] > button')[2].click()`)
    await waitFor(
      `document.querySelector('[data-editor-view="definition"]').hidden === false`,
      'Definition editor did not open',
    )
    const editorState = await evaluate(`(() => ({
      rootPath: document.querySelector(
        '[data-definition-tree-node="header-root"]'
      )?.getAttribute('data-definition-node-path'),
      childPath: document.querySelector(
        '[data-definition-tree-node="header-title"]'
      )?.getAttribute('data-definition-node-path'),
      impactVisible: Boolean(document.querySelector('[data-definition-usage-impact]')),
    }))()`)
    assert(
      editorState.rootPath === 'header-root' &&
        editorState.childPath === 'header-copy/header-title' &&
        editorState.impactVisible,
      `Definition editor node paths or impact list drifted: ${JSON.stringify(editorState)}`,
    )

    await evaluate(`(() => {
      document.querySelector('[data-definition-tree-node="header-link"]').click()
      return new Promise(resolve => setTimeout(resolve, 0))
    })()`)
    await evaluate(`(() => {
      const fields = [...document.querySelectorAll('[data-definition-editor] label')]
      const field = fields.find(label => label.querySelector('span')?.textContent.trim() === 'Label')
      const textarea = field?.querySelector('textarea')
      textarea.focus()
      textarea.select()
      return true
    })()`)
    await cdp.call('Input.insertText', { text: 'Shared planning workspace' })
    await waitFor(
      `Boolean(document.querySelector('[data-definition-editor] [data-dirty="true"]'))`,
      'Definition field did not retain its in-progress draft',
    )
    await evaluate(`document.querySelector('[data-definition-tree-node="header-root"]').focus()`)
    await waitFor(
      `JSON.parse(localStorage.getItem(${JSON.stringify(workspaceKey)}))
        .document.componentDefinitions['shared/header'].nodes['header-link']
        .config.label === 'Shared planning workspace'`,
      'Definition base field draft did not commit',
    )
    const revisionAfterEdit = await evaluate(
      `JSON.parse(localStorage.getItem(${JSON.stringify(workspaceKey)})).revision`,
    )
    assert(revisionAfterEdit === 1, 'Definition text edit was not one atomic history operation')

    await evaluate(`document.querySelectorAll('[data-editor-view-switch] > button')[0].click()`)
    await waitFor(
      `document.querySelector('[data-component-id="comp-list-header"]')
        ?.textContent.includes('Shared planning workspace')`,
      'Definition change did not propagate to the list Instance',
    )
    await evaluate(`[
      ...document.querySelectorAll('aside button')
    ].find(button => button.textContent.trim() === 'Edit Task').click()`)
    await waitFor(
      `document.querySelector('[data-component-id="comp-edit-header"]')
        ?.textContent.includes('Shared planning workspace')`,
      'Definition change did not propagate to the edit Instance',
    )
    console.log('PASS Definition edit commits once and propagates across Instances')

    await evaluate(`document.querySelector('[data-history-undo]').click()`)
    await waitFor(
      `!document.body.textContent.includes('Shared planning workspace') &&
        JSON.parse(localStorage.getItem(${JSON.stringify(workspaceKey)})).revision === 2`,
      'Undo did not restore the Definition base across Instances',
    )
    await evaluate(`document.querySelector('[data-history-redo]').click()`)
    await waitFor(
      `document.querySelector('[data-component-id="comp-edit-header"]')
        ?.textContent.includes('Shared planning workspace')`,
      'Redo did not restore the Definition change',
    )
    console.log('PASS Definition propagation participates in Undo and Redo')

    for (const width of [1280, 720]) {
      await cdp.call('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
      const responsive = await evaluate(`(() => {
        const instance = document.querySelector('[data-component-id="comp-edit-header"]')
        const frame = document.querySelector(
          '[data-owning-frame-kind="page"][data-owning-frame-id="comp-edit-page"]'
        )
        return {
          count: document.querySelectorAll('[data-component-id="comp-edit-header"]').length,
          inside: frame?.contains(instance),
          duplicateRuntimeIds: (() => {
            const ids = [...document.querySelectorAll('[data-component-id]')]
              .map(node => node.getAttribute('data-component-id'))
            return ids.length - new Set(ids).size
          })(),
        }
      })()`)
      assert(
        responsive.count === 1 && responsive.inside && responsive.duplicateRuntimeIds === 0,
        `${width}px responsive projection duplicated or escaped its frame: ${
          JSON.stringify(responsive)
        }`,
      )
    }
    console.log('PASS responsive owning-frame projection keeps one runtime DOM')

    await evaluate(`(() => {
      const key = ${JSON.stringify(workspaceKey)}
      const workspace = JSON.parse(localStorage.getItem(key))
      workspace.activeChangeSet = {
        id: 'browser-review-lock',
        summary: 'Review shared component',
        baseRevision: workspace.revision,
        baseDocument: workspace.document,
        operations: [],
        version: 0,
        createdAt: '2025-01-01T00:00:00.000Z',
      }
      localStorage.setItem(key, JSON.stringify(workspace))
      return true
    })()`)
    await reload()
    await evaluate(`document.querySelectorAll('[data-editor-view-switch] > button')[2].click()`)
    await waitFor(
      `document.querySelector('[data-editor-view="definition"]').hidden === false`,
      'Definition editor did not reopen under review lock',
    )
    const locked = await evaluate(`(() => {
      const editor = document.querySelector('[data-definition-editor]')
      const formControls = [...editor.querySelectorAll('input, textarea, select')]
      const mutationLabels = [
        'New definition',
        'Duplicate',
        'Delete',
        'Expose field',
        'Add variant',
      ]
      const mutationButtons = [...editor.querySelectorAll('button')].filter(button =>
        mutationLabels.some(label => button.textContent.includes(label))
      )
      return {
        notice: editor.textContent.includes('unavailable while reviewing changes'),
        editableMutationControls: [...formControls, ...mutationButtons]
          .filter(control => !control.disabled).length,
        navigationControls: [...editor.querySelectorAll(
          '[data-definition-tree-node], [aria-current="page"]'
        )].filter(control => !control.disabled).length,
        draft: JSON.parse(localStorage.getItem(${JSON.stringify(workspaceKey)}))
          .document.componentDefinitions['shared/header'].nodes['header-link'].config.label,
      }
    })()`)
    assert(
      locked.notice &&
        locked.editableMutationControls === 0 &&
        locked.navigationControls > 0 &&
        locked.draft === 'Shared planning workspace',
      `review lock exposed Definition mutation controls or discarded content: ${
        JSON.stringify(locked)
      }`,
    )
    console.log('PASS review lock seals Definition editor without discarding content')
    console.log('PASS trusted Chrome shared component regression (6 groups)')
  } finally {
    try {
      cdp?.close()
    } finally {
      await stopChrome(chrome)
      if (server) {
        await new Promise(resolveClose => server.close(resolveClose))
      }
      if (profile) rmSync(profile, { recursive: true, force: true })
    }
  }
}

await run()
