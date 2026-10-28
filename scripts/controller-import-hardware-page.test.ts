import { createServer } from 'node:http'
import { once } from 'node:events'
import { build } from 'esbuild'
import { chromium, type Page } from '@playwright/test'
import { expect, it } from 'vitest'
import { installBenchPageAccess } from './controller-import-hardware-page'

const providerPath = '/PXLBLZ-IDE/src/engine/ExtensionControllerProvider.ts'
const registryPath = '/PXLBLZ-IDE/src/engine/controllerProviderRegistry.ts'
const storePath = '/PXLBLZ-IDE/src/store/controllerStore.ts'
const methods = ['compile', 'getActiveProgramBytecodeSize', 'saveProgram', 'pushBytecode', 'readSavedProgram', 'getConfig', 'listPrograms', 'setVars', 'setRendererPaused', 'setControls', 'setBrightness', 'setName', 'setPixelCount', 'setActiveProgram', 'deleteProgram', 'setPixelMap']

// Only state and method effects are synthetic. Class identity and the active
// provider registry come from repository source bundled as browser ESM.
async function fixture(graph: '' | '?t=hot', run: (page: Page, requests: string[]) => Promise<void>) {
  const bundle = async (entry: string) => (await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'browser' })).outputFiles[0].text
  const [provider, registry] = await Promise.all([
    bundle('src/engine/ExtensionControllerProvider.ts'), bundle('src/engine/controllerProviderRegistry.ts'),
  ])
  const delegates = `
    for (const method of ${JSON.stringify([...methods, 'disconnect'])}) {
      if (typeof ExtensionControllerProvider.prototype[method] !== 'function') throw new Error('Missing real method ' + method);
      ExtensionControllerProvider.prototype[method] = async function (...args) {
        window.fx.events.push({ phase: 'delegate', method, args, receiver: this === window.fx.provider });
        if (window.fx.fail === method) throw window.fx.error;
        if (method === 'getConfig') return window.fx.config;
        if (method === 'listPrograms') return window.fx.list;
        if (method === 'compile') return new Uint8Array([7, 8]);
        return window.fx.result;
      };
    }
  `
  const store = (query: string) => `
    import { getControllerProvider } from '${registryPath}${query}';
    export { getControllerProvider };
    export const state = { pushing: false, pushResult: null, privateField: 'excluded' };
    export const useControllerStore = { getState: () => state };
  `
  const entry = `
    import { ExtensionControllerProvider } from '${providerPath}${graph}';
    import { setControllerProvider } from '${registryPath}${graph}';
    import { state, useControllerStore, getControllerProvider } from '${storePath}${graph}';
    const fx = window.fx;
    const transport = { send() { fx.sends++; throw new Error('Transport forbidden'); }, subscribe() { return () => {}; } };
    fx.provider = new ExtensionControllerProvider({ transport });
    fx.state = state;
    fx.store = useControllerStore;
    fx.getter = getControllerProvider;
    fx.set = setControllerProvider;
    fx.transport = transport;
    setControllerProvider(fx.provider);
    fx.ready = true;
  `
  const requests: string[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://fixture')
    requests.push(url.pathname + url.search)
    if (url.pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end(`<script type="module" src="/entry.js"></script>`)
      return
    }
    response.setHeader('content-type', 'text/javascript')
    if (url.search === '?bad=type') response.setHeader('content-type', 'text/html')
    if (url.search === '?bad=status') response.statusCode = 503
    if (url.pathname === providerPath) response.end(provider + delegates)
    else if (url.pathname === registryPath) response.end(registry)
    else if (url.pathname === storePath) response.end(store(url.search))
    else if (url.pathname === '/entry.js') response.end(entry)
    else if (url.pathname === '/unrelated.js') response.end('export const untouched = true;')
    else { response.statusCode = 404; response.end('missing') }
  })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing fixture address')
    const origin = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch()
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.route(url => url.origin !== origin, route => route.abort())
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>
      const fx = { events: [] as unknown[], sends: 0, sockets: 0, reject: false,
        config: { activeProgramId: 'slot', name: 'offline' }, list: [{ id: 'slot', name: 'memory' }],
        result: { memory: true }, error: new Error('delegate failure') }
      w.fx = fx
      w.WebSocket = class { constructor() { fx.sockets++; throw new Error('WebSocket forbidden') } }
      w.__i20Span = async (message: { phase: string }) => {
        fx.events.push(message)
        if (message.phase === 'start' && fx.reject) throw new Error('admission refused')
      }
    })
    await installBenchPageAccess(page, origin)
    await page.goto(origin)
    await page.waitForFunction('window.fx.ready === true')
    await run(page, requests)
    expect(await page.evaluate('({ sends: fx.sends, sockets: fx.sockets })')).toEqual({ sends: 0, sockets: 0 })
  } finally {
    await browser?.close()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

for (const graph of ['?t=hot', ''] as const) {
  it(`snapshots the page-owned ${graph || 'bare'} graph with admission before delegation`, async () => {
    await fixture(graph, async (page, requests) => {
      expect(await page.evaluate(`(async () => {
        const p = window.__benchPageAccess.getProvider();
        const config = await p.getConfig(); const list = await p.listPrograms();
        return { same: p === fx.provider, config, list, retained: config === fx.config && list === fx.list, events: fx.events };
      })()`)).toEqual({ same: true, config: { activeProgramId: 'slot', name: 'offline' }, list: [{ id: 'slot', name: 'memory' }], retained: true,
        events: ['getConfig', 'listPrograms'].flatMap((method, index) => [
          expect.objectContaining({ phase: 'start', method, span: index + 1 }),
          expect.objectContaining({ phase: 'execute', method, span: index + 1 }),
          { phase: 'delegate', method, args: [], receiver: true },
          expect.objectContaining({ phase: 'end', method, span: index + 1 }),
        ]) })
      expect(requests.filter(path => path.includes('/src/'))).toEqual(expect.arrayContaining([
        providerPath + graph, registryPath + graph, storePath + graph,
      ]))
      if (graph) {
        expect(requests).not.toContain(registryPath)
        expect(requests).not.toContain(providerPath)
        expect(await page.evaluate(`(async () => {
          const bare = await import('${registryPath}');
          const { ExtensionControllerProvider: Bare } = await import('${providerPath}');
          let error;
          try { if (!(bare.getControllerProvider() instanceof Bare)) throw new Error('Real ExtensionControllerProvider is required'); }
          catch (e) { error = e.message; }
          return { nullProvider: bare.getControllerProvider().getStatus().kind, bareInstance: fx.provider instanceof Bare, error };
        })()`)).toEqual({ nullProvider: 'no-extension', bareInstance: false, error: 'Real ExtensionControllerProvider is required' })
      }
    })
  }, 30_000)
}

it('reads current Save state and preserves operation arguments, returns and original errors', async () => {
  await fixture('?t=hot', async page => {
    for (const state of [{ pushing: true, pushResult: null }, { pushing: false, pushResult: { ok: true, created: false } }, { pushing: false, pushResult: { ok: false, message: 'failed' } }]) {
      await page.evaluate(state => Object.assign((window as unknown as { fx: { state: object } }).fx.state, state), state)
      expect(await page.evaluate(() => window.__benchPageAccess.getSaveState())).toEqual(state)
    }
    expect(await page.evaluate(`(async () => {
      const p = window.__benchPageAccess.getProvider();
      fx.events = [];
      const returns = [];
      returns.push(await p.readSavedProgram('read'));
      returns.push(await p.setActiveProgram('active', { save: false }));
      returns.push(await p.deleteProgram('delete'));
      returns.push(await p.disconnect());
      fx.fail = 'getConfig';
      let sameError = false;
      try { await p.getConfig(); } catch (error) { sameError = error === fx.error; }
      return { retained: returns.every(r => r === fx.result), sameError, events: fx.events };
    })()`)).toEqual({ retained: true, sameError: true, events: expect.arrayContaining([
      { phase: 'delegate', method: 'readSavedProgram', args: ['read'], receiver: true },
      { phase: 'delegate', method: 'setActiveProgram', args: ['active', { save: false }], receiver: true },
      { phase: 'delegate', method: 'deleteProgram', args: ['delete'], receiver: true },
      { phase: 'delegate', method: 'disconnect', args: [], receiver: true },
      expect.objectContaining({ phase: 'error', method: 'getConfig', error: 'delegate failure' }),
    ]) })
    expect(await page.evaluate(`(async () => {
      fx.events = []; fx.reject = true;
      try { await window.__benchPageAccess.getProvider().listPrograms(); } catch (e) { return { error: e.message, events: fx.events }; }
    })()`)).toEqual({ error: 'admission refused', events: [expect.objectContaining({ phase: 'start', method: 'listPrograms' })] })
  })
}, 30_000)

it('rejects non-real providers and ambiguous stores, with identical registration idempotent', async () => {
  await fixture('?t=hot', async page => {
    await page.evaluate(`window.__benchPageAccess.registerStore(fx.store, fx.getter)`)
    await page.evaluate(() => window.__benchPageAccess.assertReady())
    expect(await page.evaluate(`(async () => {
      const nullProvider = (await import('${registryPath}')).getControllerProvider();
      const errors = [];
      for (const provider of [nullProvider, { getConfig() { throw new Error('must not delegate'); } }]) {
        fx.set(provider);
        try { window.__benchPageAccess.getProvider(); } catch (e) { errors.push(e.message); }
      }
      return { errors, events: fx.events };
    })()`)).toEqual({ errors: ['Real ExtensionControllerProvider is required', 'Real ExtensionControllerProvider is required'], events: [] })
    await expect(page.evaluate(`import('${storePath}?t=duplicate')`)).rejects.toThrow('Ambiguous page Controller store')
    await expect(page.evaluate(() => window.__benchPageAccess.assertReady())).rejects.toThrow('Ambiguous page Controller store')
  })
}, 30_000)

it('wraps every registered real class and retains byte, source and span handling', async () => {
  await fixture('?t=hot', async page => {
    expect(await page.evaluate(`(async () => {
      const { ExtensionControllerProvider: Second } = await import('${providerPath}?t=second');
      fx.provider = new Second({ transport: fx.transport }); fx.set(fx.provider);
      window.__benchPageAccess.registerProvider(Second);
      const p = window.__benchPageAccess.getProvider();
      await p.compile('source'); await p.saveProgram(new Uint8Array([1, 2]), 'slot');
      await p.pushBytecode(new Uint8Array([3, 4]), 'arg');
      fx.reject = true;
      try { await p.listPrograms(); } catch (e) { fx.admissionError = e.message; }
      return { wrapped: ${JSON.stringify(methods)}.every(method => typeof Second.prototype[method] === 'function'), events: fx.events, error: fx.admissionError };
    })()`)).toEqual({ wrapped: true, error: 'admission refused', events: expect.arrayContaining([
      expect.objectContaining({ phase: 'start', method: 'compile', span: 1, source: 'source' }),
      expect.objectContaining({ phase: 'end', method: 'compile', bytes: [7, 8] }),
      expect.objectContaining({ phase: 'start', method: 'saveProgram', span: 2, args: [null, 'slot'], bytes: [1, 2] }),
      expect.objectContaining({ phase: 'start', method: 'pushBytecode', span: 3, args: [null, 'arg'], bytes: [3, 4] }),
    ]) })
    expect(await page.evaluate(`fx.events.filter(e => e.phase === 'delegate' && e.method === 'listPrograms')`)).toEqual([])
  })
}, 30_000)

it('requires module registrations and leaves unrelated paths and origins untouched', async () => {
  await fixture('?t=hot', async page => {
    const other = await page.context().newPage()
    try {
      const origin = new URL(page.url()).origin
      await other.route('http://external.invalid/**', route => route.fulfill({
        contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: 'export const untouched = true;',
      }))
      await installBenchPageAccess(other, origin)
      await other.goto(origin + '/empty')
      await expect(other.evaluate(() => window.__benchPageAccess.assertReady())).rejects.toThrow('Page Controller modules are unavailable')
      await expect(other.evaluate(() => window.__benchPageAccess.getProvider())).rejects.toThrow('Page Controller modules are unavailable')
      await expect(other.evaluate(() => window.__benchPageAccess.getSaveState())).rejects.toThrow('Page Controller modules are unavailable')
      expect(await other.evaluate(`fetch('/unrelated.js').then(r => r.text())`)).toBe('export const untouched = true;')
      expect(await other.evaluate(`fetch('http://external.invalid${providerPath}?t=hot').then(r => r.text())`)).toBe('export const untouched = true;')
      for (const suffix of ['?bad=type', '?bad=status']) {
        await expect(other.evaluate(`import('${providerPath}${suffix}')`)).rejects.toThrow()
      }
    } finally { await other.close() }
  })
}, 30_000)
