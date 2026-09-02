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
  document.componentDefinitions['shared/wrapped-header'] = {
    id: 'shared/wrapped-header',
    name: 'Wrapped Header',
    description: 'Nested shared component regression fixture.',
    rootNodeId: 'wrapped-root',
    nodes: {
      'wrapped-root': {
        nodeType: 'inline',
        id: 'wrapped-root',
        parentId: null,
        childIds: ['nested-header'],
        kind: 'container',
        placement: { mode: 'flow' },
        sizing: {
          inlineSize: 'fill',
          minWidth: 'none',
          maxWidth: 'none',
          gridSpan: 1,
          grow: 0,
          shrink: 'allow',
        },
        common: { description: 'Wrapper', visible: true, enabled: true },
        config: {
          kind: 'container',
          layout: 'vertical',
          gap: 'sm',
          columns: 1,
          justify: 'start',
          align: 'stretch',
          wrap: false,
        },
      },
      'nested-header': {
        nodeType: 'definitionInstance',
        id: 'nested-header',
        parentId: 'wrapped-root',
        childIds: [],
        placement: { mode: 'flow' },
        sizing: {
          inlineSize: 'fill',
          minWidth: 'none',
          maxWidth: 'none',
          gridSpan: 1,
          grow: 0,
          shrink: 'allow',
        },
        source: structuredClone(document.components['comp-list-header'].source),
        props: {},
        variantId: 'comfortable',
      },
    },
    publicProps: [],
    variantProperties: [],
    variants: [],
    representativeVariantId: null,
  }
  const addHorizontalFixture = (containerId, labels, minWidth = 'none') => {
    const horizontal = structuredClone(document.components['comp-task-list'])
    horizontal.id = containerId
    horizontal.parentId = 'comp-list-page'
    horizontal.childIds = labels.map((_, index) => `${containerId}-item-${index}`)
    horizontal.common.description = containerId
    horizontal.config = {
      ...horizontal.config,
      layout: 'horizontal',
      columns: labels.length,
      wrap: false,
    }
    document.components[containerId] = horizontal
    for (const [index, componentId] of horizontal.childIds.entries()) {
      const child = structuredClone(document.components['comp-create-task-btn'])
      child.id = componentId
      child.parentId = containerId
      child.sizing.inlineSize = 'content'
      child.sizing.minWidth = minWidth
      child.common.description = `Horizontal item ${index + 1}`
      child.config = { ...child.config, label: labels[index], eventId: null }
      document.components[componentId] = child
    }
  }
  addHorizontalFixture(
    'browser-horizontal-container',
    ['Horizontal Alpha', 'Horizontal Beta', 'Horizontal Gamma'],
  )
  addHorizontalFixture('browser-horizontal-single', ['Single horizontal button'])
  addHorizontalFixture(
    'browser-horizontal-overflow',
    ['Overflow One', 'Overflow Two', 'Overflow Three'],
    'xl',
  )
  document.components['comp-list-page'].childIds.splice(
    2,
    0,
    'browser-horizontal-container',
    'browser-horizontal-single',
    'browser-horizontal-overflow',
  )
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
    await cdp.call('DOM.enable')
    await cdp.call('CSS.enable')
    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })

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
    const dragComponent = async (sourceId, targetId, targetFraction, expectedDropPosition) => {
      await evaluate(`document.querySelector(
        '[data-drag-surface="canvas"][data-drag-component=${JSON.stringify(sourceId)}]'
      )?.scrollIntoView({ block: 'center', inline: 'center' })`)
      const points = await evaluate(`(() => {
        const source = document.querySelector(
          '[data-drag-surface="canvas"][data-drag-component=${JSON.stringify(sourceId)}]'
        )
        const target = document.querySelector(
          '[data-horizontal-drop-slot] > [data-component-id=${JSON.stringify(targetId)}]'
        )?.closest('[data-horizontal-drop-slot]')
        const sourceRect = source?.getBoundingClientRect()
        const targetRect = target?.getBoundingClientRect()
        return sourceRect && targetRect ? {
          source: {
            x: sourceRect.left + sourceRect.width / 2,
            y: sourceRect.top + sourceRect.height / 2,
          },
          target: {
            x: targetRect.left + targetRect.width * ${targetFraction},
            y: targetRect.top + targetRect.height / 2,
          },
        } : null
      })()`)
      assert(points, `horizontal drag geometry missing: ${sourceId} -> ${targetId}`)
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: points.source.x,
        y: points.source.y,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      })
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: points.source.x + 8,
        y: points.source.y,
        button: 'left',
        buttons: 1,
      })
      await waitFor(
        `Boolean(document.querySelector('[data-drag-overlay]'))`,
        `horizontal drag did not activate for ${sourceId}`,
      )
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: points.target.x,
        y: points.target.y,
        button: 'left',
        buttons: 1,
      })
      await waitFor(
        `document.querySelector(
          '[data-editor-drop-id="canvas:drop:browser-horizontal-container:${expectedDropPosition}"]'
        )?.getAttribute('data-drop-over') === 'true'`,
        `horizontal drag did not select boundary ${expectedDropPosition}`,
      )
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: points.target.x,
        y: points.target.y,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      })
    }
    const horizontalOrder = () => evaluate(`(() => {
      const container = document.querySelector(
        '[data-component-id="browser-horizontal-container"]'
      )
      const ui = [...container.querySelector('[data-layout="horizontal"]').children]
        .filter(node => node.hasAttribute('data-horizontal-drop-slot'))
        .map(node => node.querySelector(':scope > [data-component-id]')
          ?.getAttribute('data-component-id'))
      const saved = JSON.parse(localStorage.getItem(${JSON.stringify(workspaceKey)}))
        .document.components['browser-horizontal-container'].childIds
      return { ui, saved }
    })()`)

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
        inFlow: instance.closest('[data-placement-projection]') === null,
        owningFrame: frame?.contains(instance),
        resolvedDraggables: nodes.filter(node => node.hasAttribute('data-canvas-draggable')).length,
        link: link && {
          target: link.getAttribute('target'),
          rel: link.getAttribute('rel'),
          text: link.textContent.trim(),
        },
        images: (() => {
          const imageNodes = [...document.querySelectorAll(
            '[data-collection-id="comp-launch-task-card"]' +
              '[data-definition-node-id="task-card-image"]'
          )]
          const image = imageNodes.find(node => node.querySelector('img'))?.querySelector('img')
          const placeholder = imageNodes.find(node =>
            node.querySelector('[data-image-placeholder="missing"]')
          )?.querySelector('[data-image-placeholder="missing"]')
          return {
            nodeCount: imageNodes.length,
            renderedImageCount: imageNodes.filter(node => node.querySelector('img')).length,
            placeholderCount: imageNodes.filter(node =>
              node.querySelector('[data-image-placeholder]')
            ).length,
            imageAlt: image?.getAttribute('alt'),
            placeholderLabel: placeholder?.getAttribute('aria-label'),
            placeholderText: placeholder?.textContent.trim(),
            placeholderHasIcon: Boolean(placeholder?.querySelector('svg')),
            hasErrorCopy: imageNodes.some(node =>
              /Image URL|could not be loaded|画像URL|読み込めません/.test(node.textContent)
            ),
          }
        })(),
        nodePaths: nodes.map(node => node.getAttribute('data-node-path')),
      }
    })()`)
    assert(initial.resetCount === 0, 'default build exposed the sample reset button')
    assert(
      initial.instanceCount === 1 &&
        initial.dragCount === 1 &&
        initial.nodeCount === 5 &&
        initial.uniqueIds === 5 &&
        initial.inFlow &&
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
      initial.images.nodeCount === 2 &&
        initial.images.renderedImageCount === 1 &&
        initial.images.placeholderCount === 1 &&
        initial.images.imageAlt === 'TaskFlow board preview' &&
        initial.images.placeholderLabel === 'Task preview' &&
        initial.images.placeholderText === 'Task preview' &&
        initial.images.placeholderHasIcon &&
        !initial.images.hasErrorCopy,
      `sample Image preview was not neutral and low fidelity: ${JSON.stringify(initial.images)}`,
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
    console.log('PASS resolved Instance identity, flow placement, DnD, and Link semantics')

    const geometry = await evaluate(`(() => {
      const header = document.querySelector('[data-component-id="comp-list-header"]')
      const summary = document.querySelector('[data-component-id="comp-list-summary"]')
      const collection = document.querySelector('[data-component-id="comp-launch-task-card"]')
      const itemRoots = [...document.querySelectorAll(
        '[data-collection-id="comp-launch-task-card"][data-definition-node-id="task-card-root"]'
      )]
      const grid = itemRoots[0]?.querySelector('[data-layout="grid"]')
      const resolved = Object.fromEntries(
        ['task-card-status', 'task-card-image', 'task-card-action'].map(nodeId => {
          const node = document.querySelector(
            \`[data-collection-id="comp-launch-task-card"][data-definition-node-id="\${nodeId}"]\`
          )
          const style = node && getComputedStyle(node)
          return [nodeId, style && {
            borderStyle: style.borderTopStyle,
            borderWidth: style.borderTopWidth,
          }]
        })
      )
      const rootStyle = itemRoots[0] && getComputedStyle(itemRoots[0])
      const headerRect = header?.getBoundingClientRect()
      const summaryRect = summary?.getBoundingClientRect()
      const collectionRect = collection?.getBoundingClientRect()
      const gridRect = grid?.getBoundingClientRect()
      return {
        noHeaderOverlap: Boolean(
          headerRect && summaryRect &&
          (headerRect.bottom <= summaryRect.top || summaryRect.bottom <= headerRect.top)
        ),
        collectionWidth: collectionRect?.width,
        gridWidth: gridRect?.width,
        gridClientWidth: grid?.clientWidth,
        gridScrollWidth: grid?.scrollWidth,
        itemHeights: itemRoots.map(node => node.getBoundingClientRect().height),
        itemWidths: itemRoots.map(node => node.getBoundingClientRect().width),
        rootBorder: rootStyle && {
          borderStyle: rootStyle.borderTopStyle,
          borderWidth: rootStyle.borderTopWidth,
        },
        resolved,
      }
    })()`)
    assert(
      geometry.noHeaderOverlap &&
        geometry.rootBorder?.borderStyle === 'dashed' &&
        geometry.rootBorder.borderWidth === '1px' &&
        Object.values(geometry.resolved).every(
          border => border?.borderStyle === 'none' && border.borderWidth === '0px'
        ) &&
        geometry.gridScrollWidth <= geometry.gridClientWidth + 1 &&
        geometry.gridWidth <= geometry.collectionWidth + 1 &&
        geometry.itemHeights.length === 2 &&
        Math.max(...geometry.itemHeights) < 360 &&
        Math.min(...geometry.itemWidths) > 0,
      `default Canvas geometry or resolved borders drifted: ${JSON.stringify(geometry)}`,
    )
    console.log('PASS default Canvas geometry keeps flow, borders, and 12-track cards bounded')

    const horizontalOverflow = await evaluate(`(() => {
      const measure = id => {
        const component = document.querySelector(\`[data-component-id="\${id}"]\`)
        const children = component?.querySelector('[data-layout="horizontal"]')
        const end = [...children?.querySelectorAll(
          '[data-drop-orientation="horizontal"][data-drop-position]'
        ) ?? []].at(-1)
        const style = children && getComputedStyle(children)
        const endRect = end?.getBoundingClientRect()
        const childrenRect = children?.getBoundingClientRect()
        return {
          clientWidth: children?.clientWidth,
          scrollWidth: children?.scrollWidth,
          overflowX: style?.overflowX,
          endBeyondRight: Boolean(endRect && childrenRect && endRect.right > childrenRect.right + 1),
        }
      }
      const single = measure('browser-horizontal-single')
      const overflowNode = document.querySelector(
        '[data-component-id="browser-horizontal-overflow"] [data-layout="horizontal"]'
      )
      const overflow = measure('browser-horizontal-overflow')
      overflowNode.scrollLeft = overflowNode.scrollWidth
      overflow.scrollLeft = overflowNode.scrollLeft
      return { single, overflow }
    })()`)
    assert(
      horizontalOverflow.single.scrollWidth <= horizontalOverflow.single.clientWidth + 1 &&
        horizontalOverflow.single.overflowX === 'auto' &&
        !horizontalOverflow.single.endBeyondRight &&
        horizontalOverflow.overflow.scrollWidth > horizontalOverflow.overflow.clientWidth &&
        horizontalOverflow.overflow.endBeyondRight &&
        horizontalOverflow.overflow.scrollLeft > 0,
      `horizontal overflow geometry regressed: ${JSON.stringify(horizontalOverflow)}`,
    )
    console.log(
      `PASS horizontal Canvas only scrolls when child content overflows ` +
        `(single ${horizontalOverflow.single.scrollWidth}/` +
        `${horizontalOverflow.single.clientWidth}px, overflow ` +
        `${horizontalOverflow.overflow.scrollWidth}/` +
        `${horizontalOverflow.overflow.clientWidth}px)`,
    )

    const hoverPoint = await evaluate(`(() => {
      const node = document.querySelector(
        '[data-collection-id="comp-launch-task-card"][data-definition-node-id="task-card-title"]'
      )
      const rect = node.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })()`)
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: hoverPoint.x,
      y: hoverPoint.y,
    })
    await waitFor(
      `getComputedStyle(document.querySelector(
        '[data-collection-id="comp-launch-task-card"][data-definition-node-id="task-card-title"]'
      ).querySelector(':scope > [data-editor-chrome]')).opacity === '1'`,
      'resolved hover chrome did not finish appearing',
    )
    const hoverChrome = await evaluate(`(() => {
      const leaf = document.querySelector(
        '[data-collection-id="comp-launch-task-card"][data-definition-node-id="task-card-title"]'
      )
      const root = leaf.closest(
        '[data-collection-id="comp-launch-task-card"][data-definition-node-id="task-card-root"]'
      )
      return {
        leafOutline: getComputedStyle(leaf, '::after').boxShadow,
        rootOutline: getComputedStyle(root, '::after').boxShadow,
        leafChrome: getComputedStyle(
          leaf.querySelector(':scope > [data-editor-chrome]')
        ).opacity,
        rootChrome: getComputedStyle(
          root.querySelector(':scope > [data-editor-chrome]')
        ).opacity,
      }
    })()`)
    assert(
      hoverChrome.leafOutline !== hoverChrome.rootOutline &&
        hoverChrome.leafChrome === '1' &&
        hoverChrome.rootChrome === '0',
      `resolved hover escaped the deepest target: ${JSON.stringify(hoverChrome)}`,
    )
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })

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
    const selectedOutline = await evaluate(`getComputedStyle(
      document.querySelector('[data-editor-selected="true"]'),
      '::after'
    ).boxShadow`)
    assert(
      selectedOutline !== 'none' && selectedOutline.includes('2px'),
      `resolved selection outline disappeared: ${selectedOutline}`,
    )
    const { root: domRoot } = await cdp.call('DOM.getDocument')
    const { nodeId: subtitleNodeId } = await cdp.call('DOM.querySelector', {
      nodeId: domRoot.nodeId,
      selector: '[data-instance-id="comp-list-header"][data-definition-node-id="header-subtitle"]',
    })
    await cdp.call('CSS.forcePseudoState', {
      nodeId: subtitleNodeId,
      forcedPseudoClasses: ['focus', 'focus-visible'],
    })
    const focusedOutline = await evaluate(`getComputedStyle(
      document.querySelector(
        '[data-instance-id="comp-list-header"][data-definition-node-id="header-subtitle"]'
      ),
      '::after'
    ).boxShadow`)
    assert(
      focusedOutline !== 'none' && focusedOutline.includes('1px'),
      `resolved focus outline disappeared: ${focusedOutline}`,
    )
    await cdp.call('CSS.forcePseudoState', {
      nodeId: subtitleNodeId,
      forcedPseudoClasses: [],
    })
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

    await cdp.call('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await evaluate(`document.querySelectorAll('[data-editor-view-switch] > button')[2].click()`)
    await waitFor(
      `document.querySelector('[data-editor-view="definition"]').hidden === false`,
      'Definition editor did not open',
    )
    await evaluate(`[
      ...document.querySelectorAll('[data-definition-editor] aside button')
    ].find(button => button.textContent.includes('Task Card')).click()`)
    await waitFor(
      `Boolean(document.querySelector(
        '[data-definition-preview-node="task-card-image"] img'
      ))`,
      'Task Card shared preview Image did not render',
    )
    await evaluate(`document.querySelector(
      '[data-definition-preview-node="task-card-image"] img'
    ).src = '/missing-shared-preview-image.png'`)
    await waitFor(
      `Boolean(document.querySelector(
        '[data-definition-preview-node="task-card-image"] [data-image-placeholder="failed"]'
      ))`,
      'broken shared preview Image did not fall back to the placeholder',
    )
    const sharedImageFallback = await evaluate(`(() => {
      const placeholder = document.querySelector(
        '[data-definition-preview-node="task-card-image"] [data-image-placeholder="failed"]'
      )
      return {
        label: placeholder?.getAttribute('aria-label'),
        text: placeholder?.textContent.trim(),
        hasIcon: Boolean(placeholder?.querySelector('svg')),
        hasBrokenImage: Boolean(document.querySelector(
          '[data-definition-preview-node="task-card-image"] img'
        )),
      }
    })()`)
    assert(
      sharedImageFallback.label === 'Task preview' &&
        sharedImageFallback.text === 'Task preview' &&
        sharedImageFallback.hasIcon &&
        !sharedImageFallback.hasBrokenImage,
      `Shared Image failure did not use the neutral placeholder: ${
        JSON.stringify(sharedImageFallback)
      }`,
    )
    await evaluate(`[
      ...document.querySelectorAll('[data-definition-editor] aside button')
    ].find(button => button.textContent.includes('Shared Header')).click()`)
    await waitFor(
      `Boolean(document.querySelector('[data-definition-tree-node="header-root"]'))`,
      'Shared Header did not reopen after Image preview verification',
    )
    const editorState = await evaluate(`(() => ({
      rootPath: document.querySelector(
        '[data-definition-tree-node="header-root"]'
      )?.getAttribute('data-definition-node-path'),
      childPath: document.querySelector(
        '[data-definition-tree-node="header-title"]'
      )?.getAttribute('data-definition-node-path'),
      impactVisible: Boolean(document.querySelector(
        '[data-definition-inspector] [data-definition-usage-impact]'
      )),
      previewVisible: Boolean(document.querySelector(
        '[data-definition-preview] [data-definition-preview-node="header-root"]'
      )),
      inspectorVisible: Boolean(document.querySelector('[data-definition-inspector]')),
      verticalContained: (() => {
        const stage = document.querySelector('[data-definition-preview]')
        const scrollport = document.querySelector(
          '[data-definition-preview-surface] > div:first-child'
        )
        return scrollport.clientHeight <= stage.clientHeight &&
          getComputedStyle(scrollport).overflowY === 'auto'
      })(),
      horizontalOverflow: Math.max(
        document.querySelector('[data-definition-editor]').scrollWidth -
          document.querySelector('[data-definition-editor]').clientWidth,
        document.querySelector('[data-definition-inspector]').scrollWidth -
          document.querySelector('[data-definition-inspector]').clientWidth
      ),
    }))()`)
    assert(
      editorState.rootPath === 'header-root' &&
        editorState.childPath === 'header-copy/header-title' &&
        editorState.impactVisible &&
        editorState.previewVisible &&
        editorState.inspectorVisible &&
        editorState.verticalContained &&
        editorState.horizontalOverflow <= 1,
      `Definition editor node paths or impact list drifted: ${JSON.stringify(editorState)}`,
    )
    await evaluate(`document.querySelector(
      '[aria-label="Preview display pattern"] button'
    ).click()`)
    await waitFor(
      `!document.querySelector('[data-definition-inspector]')
        ?.textContent.includes('Selected pattern override')`,
      'Base preview exposed a display-pattern override editor',
    )
    await evaluate(`[
      ...document.querySelectorAll('[aria-label="Preview display pattern"] button')
    ].find(button => button.textContent.trim() === 'Comfortable').click()`)
    await evaluate(`[
      ...document.querySelectorAll('[data-definition-editor] button')
    ].find(button => button.textContent.trim() === 'Usage sample').click()`)
    await waitFor(
      `document.querySelector('[data-definition-preview]')
        ?.textContent.includes('Track what needs to ship next.')`,
      'Usage-sample preview did not resolve public field values from a real usage location',
    )
    await evaluate(`[
      ...document.querySelectorAll('[data-definition-editor] button')
    ].find(button => button.querySelector('strong')?.textContent === 'Task Card').click()`)
    await waitFor(
      `Boolean(document.querySelector(
        '[data-definition-preview-node="task-card-action"]'
      ))`,
      'Task Card did not render as an isolated shared component preview',
    )
    await evaluate(`[
      ...document.querySelectorAll('[data-definition-editor] button')
    ].find(button => button.querySelector('strong')?.textContent === 'Wrapped Header').click()`)
    await waitFor(
      `Boolean(document.querySelector(
        '[data-definition-preview-node="header-root"]'
      ))`,
      'Nested shared component did not resolve in the isolated preview',
    )
    await evaluate(`document.querySelector(
      '[data-definition-tree-node="nested-header"]'
    ).click()`)
    await waitFor(
      `document.querySelector(
        '[data-definition-preview-node="header-root"]'
      )?.getAttribute('aria-selected') === 'true' &&
      document.querySelector('[data-definition-inspector]')
        ?.textContent.includes('belongs to a nested shared component')`,
      'Nested shared component boundary selection was not highlighted and sealed',
    )
    await evaluate(`[
      ...document.querySelectorAll('[data-definition-editor] button')
    ].find(button => button.querySelector('strong')?.textContent === 'Shared Header').click()`)
    await waitFor(
      `Boolean(document.querySelector(
        '[data-definition-preview-node="header-link"]'
      ))`,
      'Shared Header preview did not reopen after switching shared components',
    )

    await evaluate(`(() => {
      document.querySelector(
        '[data-definition-preview-node="header-link"]'
      ).click()
      return new Promise(resolve => setTimeout(resolve, 0))
    })()`)
    await evaluate(`(() => {
      const fields = [...document.querySelectorAll('[data-definition-inspector] label')]
      const field = fields.find(label => label.textContent.trim() === 'Label')
      const textarea = field?.parentElement.querySelector('textarea')
      textarea.focus()
      textarea.select()
      return true
    })()`)
    await cdp.call('Input.insertText', { text: 'Shared planning workspace' })
    await waitFor(
      `Boolean(document.querySelector('[data-definition-inspector] [data-dirty="true"]'))`,
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
    await waitFor(
      `document.querySelector('[data-definition-preview]')
        ?.textContent.includes('Shared planning workspace')`,
      'Definition Inspector edit did not update the isolated preview immediately',
    )

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

    const expectedHorizontalOrders = [
      [
        'browser-horizontal-container-item-1',
        'browser-horizontal-container-item-2',
        'browser-horizontal-container-item-0',
      ],
      [
        'browser-horizontal-container-item-0',
        'browser-horizontal-container-item-1',
        'browser-horizontal-container-item-2',
      ],
      [
        'browser-horizontal-container-item-1',
        'browser-horizontal-container-item-0',
        'browser-horizontal-container-item-2',
      ],
    ]
    await evaluate(`[
      ...document.querySelectorAll('aside button')
    ].find(button => button.textContent.trim() === 'Task List').click()`)
    await waitFor(
      `Boolean(document.querySelector('[data-component-id="browser-horizontal-container"]'))`,
      'Task List did not reopen for horizontal DnD',
    )
    await dragComponent(
      'browser-horizontal-container-item-0',
      'browser-horizontal-container-item-2',
      0.75,
      3,
    )
    let horizontalResult = await horizontalOrder()
    assert(
      JSON.stringify(horizontalResult.ui) === JSON.stringify(expectedHorizontalOrders[0]) &&
        JSON.stringify(horizontalResult.saved) === JSON.stringify(expectedHorizontalOrders[0]),
      `right-half horizontal drop did not move to the end: ${JSON.stringify(horizontalResult)}`,
    )
    await dragComponent(
      'browser-horizontal-container-item-0',
      'browser-horizontal-container-item-1',
      0.25,
      0,
    )
    horizontalResult = await horizontalOrder()
    assert(
      JSON.stringify(horizontalResult.ui) === JSON.stringify(expectedHorizontalOrders[1]) &&
        JSON.stringify(horizontalResult.saved) === JSON.stringify(expectedHorizontalOrders[1]),
      `left-half horizontal drop did not move to the start: ${JSON.stringify(horizontalResult)}`,
    )
    await dragComponent(
      'browser-horizontal-container-item-0',
      'browser-horizontal-container-item-1',
      0.75,
      2,
    )
    horizontalResult = await horizontalOrder()
    assert(
      JSON.stringify(horizontalResult.ui) === JSON.stringify(expectedHorizontalOrders[2]) &&
        JSON.stringify(horizontalResult.saved) === JSON.stringify(expectedHorizontalOrders[2]),
      `adjacent horizontal swap did not persist: ${JSON.stringify(horizontalResult)}`,
    )
    console.log('PASS horizontal Canvas body halves reorder components in UI and document')

    await evaluate(`[
      ...document.querySelectorAll('aside button')
    ].find(button => button.textContent.trim() === 'Task List').click()`)
    await waitFor(
      `Boolean(document.querySelector('[data-component-id="comp-launch-task-card"]'))`,
      'Task List did not reopen for responsive geometry checks',
    )
    for (const width of [899, 640]) {
      await cdp.call('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
      const responsive = await evaluate(`(() => {
        const instance = document.querySelector('[data-component-id="comp-list-header"]')
        const frame = document.querySelector(
          '[data-owning-frame-kind="page"][data-owning-frame-id="comp-list-page"]'
        )
        const collection = document.querySelector('[data-component-id="comp-launch-task-card"]')
        const grid = document.querySelector(
          '[data-collection-id="comp-launch-task-card"][data-definition-node-id="task-card-root"]'
        )?.querySelector('[data-layout="grid"]')
        const itemRoots = [...document.querySelectorAll(
          '[data-collection-id="comp-launch-task-card"][data-definition-node-id="task-card-root"]'
        )]
        return {
          count: document.querySelectorAll('[data-component-id="comp-list-header"]').length,
          inside: frame?.contains(instance),
          duplicateRuntimeIds: (() => {
            const ids = [...document.querySelectorAll('[data-component-id]')]
              .map(node => node.getAttribute('data-component-id'))
            return ids.length - new Set(ids).size
          })(),
          collectionOverflow: collection.scrollWidth - collection.clientWidth,
          gridOverflow: grid.scrollWidth - grid.clientWidth,
          maxItemHeight: Math.max(...itemRoots.map(node => node.getBoundingClientRect().height)),
        }
      })()`)
      assert(
        responsive.count === 1 &&
          responsive.inside &&
          responsive.duplicateRuntimeIds === 0 &&
          responsive.collectionOverflow <= 1 &&
          responsive.gridOverflow <= 1 &&
          responsive.maxItemHeight < 360,
        `${width}px responsive projection duplicated or escaped its frame: ${
          JSON.stringify(responsive)
        }`,
      )
    }
    await cdp.call('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 })
    await evaluate(`(() => {
      const node = document.querySelector(
        '[data-collection-id="comp-launch-task-card"][data-definition-node-id="task-card-action"]'
      )
      node.scrollIntoView({ block: 'center', inline: 'center' })
      node.click()
    })()`)
    await waitFor(
      `document.querySelector('[data-editor-selected="true"]')
        ?.getAttribute('data-node-path') === 'task-card-action'`,
      'Collection item target selection failed after responsive zoom',
    )
    const collectionSelection = await evaluate(`(() => {
      const selected = document.querySelector('[data-editor-selected="true"]')
      const inspector = document.querySelector('[data-resolved-node-inspector]')
      return {
        collectionId: selected?.getAttribute('data-collection-id'),
        nodePath: selected?.getAttribute('data-node-path'),
        itemKey: selected?.getAttribute('data-collection-item-key'),
        inspectorText: inspector?.textContent,
        projectionCount: document.querySelectorAll(
          '[data-collection-id="comp-launch-task-card"][data-definition-node-id="task-card-action"]'
        ).length,
      }
    })()`)
    assert(
      collectionSelection.collectionId === 'comp-launch-task-card' &&
        collectionSelection.nodePath === 'task-card-action' &&
        collectionSelection.itemKey !== null &&
        collectionSelection.inspectorText.includes('Applies to every Collection item') &&
        collectionSelection.projectionCount === 2,
      `Collection template target review drifted after zoom: ${
        JSON.stringify(collectionSelection)
      }`,
    )
    await cdp.call('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
    console.log('PASS 899/640 responsive geometry, zoom, and Collection target review')

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
    await evaluate(`[
      ...document.querySelectorAll('button')
    ].find(button => button.textContent.trim() === 'Inspector')?.click()`)
    await evaluate(`document.querySelectorAll('[data-editor-view-switch] > button')[2].click()`)
    await waitFor(
      `document.querySelector('[data-editor-view="definition"]').hidden === false &&
        Boolean(document.querySelector('[data-definition-inspector]'))`,
      'Definition editor did not reopen under review lock',
    )
    const locked = await evaluate(`(() => {
      const editor = document.querySelector('[data-definition-editor]')
      const inspector = document.querySelector('[data-definition-inspector]')
      const formControls = [...inspector.querySelectorAll('input, textarea, select')]
      const mutationLabels = [
        'New shared component',
        'Duplicate',
        'Delete',
        'Expose as public field',
        'Add display pattern',
      ]
      const mutationButtons = [
        ...editor.querySelectorAll('button'),
        ...inspector.querySelectorAll('button')
      ].filter(button =>
        mutationLabels.some(label => button.textContent.includes(label))
      )
      return {
        notice: editor.textContent.includes('unavailable while reviewing changes') &&
          inspector.textContent.includes('unavailable while reviewing changes'),
        editableMutationControls: [...formControls, ...mutationButtons]
          .filter(control => !control.matches(':disabled')).length,
        inspectorSectionToggles: [...inspector.querySelectorAll(
          '[data-inspector-section-toggle]'
        )].filter(control => !control.matches(':disabled')).length,
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
        locked.inspectorSectionToggles > 0 &&
        locked.navigationControls > 0 &&
        locked.draft === 'Shared planning workspace',
      `review lock exposed Definition mutation controls or discarded content: ${
        JSON.stringify(locked)
      }`,
    )
    console.log('PASS review lock seals Definition editor without discarding content')
    console.log('PASS trusted Chrome Canvas regression (10 groups)')
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
