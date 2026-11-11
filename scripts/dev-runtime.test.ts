import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureSharedDevVarsLink,
  ensureMainRuntime,
  assertMainRuntimeIdentity,
  classifyRuntimeHealth,
  decideMainRuntimeAction,
  issueViteEnvironment,
  managedViteArgs,
  parseDevRuntimeArgs,
  portIsAvailable,
  probeService,
  probeRuntimeHealth,
  runtimeBranchLabel,
  runtimeSessionCookies,
  runtimeStartSummary,
  runtimeUiUrl,
  touchWranglerTmpEntries,
} from './dev-runtime'
import type { RuntimeAssignment, RuntimeManifest } from './dev-runtime-core'

describe('complete managed-runtime health', () => {
  const uiUrl = 'http://localhost:5202/PXLBLZ-IDE/'
  const entry = `${uiUrl}src/main.tsx`
  const dependency = `${uiUrl}node_modules/.vite/deps/react-dom_client.js?v=fresh`
  const healthy = { api: 'ok', ui: 'ok', client: 'ok' } as const
  const mainRoot = '/tmp/main'
  const vite = { pid: 101, command: `node ${mainRoot}/node_modules/vite/bin/vite.js --host 0.0.0.0` }
  const worker = { pid: 102, command: `${mainRoot}/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve` }

  function responses(failedUrl?: string, status = 504): typeof fetch {
    return vi.fn(async (input) => {
      const url = String(input)
      if (url === failedUrl) return new Response('', { status })
      if (url.endsWith('/api/me')) return new Response('{}', { status: 401 })
      if (url === uiUrl) return new Response('<script type="module" src="/PXLBLZ-IDE/@vite/client"></script><script src="/PXLBLZ-IDE/src/main.tsx" type="module"></script>')
      if (url === entry) return new Response(`import ReactDOM from ${JSON.stringify(dependency)};`, { headers: { 'content-type': 'text/javascript' } })
      if (url === dependency) return new Response('export default {};', { headers: { 'content-type': 'text/javascript' } })
      throw new Error(`Unexpected request ${url}`)
    })
  }

  it('follows the served app entry to its current optimized dependency', async () => {
    const fetcher = responses()
    expect(await probeRuntimeHealth(uiUrl, 1_000, fetcher)).toEqual(healthy)
    expect(vi.mocked(fetcher).mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      'http://localhost:5202/api/me', uiUrl, entry, dependency,
    ]))
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  for (const api of ['ok', 'error', 'unresponsive'] as const) {
    for (const ui of ['ok', 'error', 'unresponsive'] as const) {
      for (const client of ['ok', 'error', 'unresponsive'] as const) {
        it(`classifies API ${api}, UI ${ui}, client ${client}`, () => {
          expect(classifyRuntimeHealth({ api, ui, client })).toBe(
            api === 'ok' && ui === 'ok' && client === 'ok' ? 'healthy' : 'unhealthy',
          )
        })
      }
    }
  }

  it.each([404, 500, 504])('rejects an optimized dependency HTTP %i', async (status) => {
    const probes = await probeRuntimeHealth(uiUrl, 1_000, responses(dependency, status))
    expect(probes).toEqual({ ...healthy, client: 'error' })
    expect(decideMainRuntimeAction([vite], probes, mainRoot)).toBe('recover')
  })

  it.each([uiUrl, entry])('rejects an unsuccessful HTML/entry request at %s', async (url) => {
    expect(classifyRuntimeHealth(await probeRuntimeHealth(uiUrl, 1_000, responses(url, 404)))).toBe('unhealthy')
  })

  it.each(['https://elsewhere.test/main.js', 'data:text/javascript,export default 1', ''])('fails closed for an unavailable app entry %s', async (src) => {
    const fetcher = responses()
    vi.mocked(fetcher).mockImplementationOnce(async () => new Response('{}'))
      .mockImplementationOnce(async () => new Response(`<script type="module" src="${src}"></script>`))
    expect(await probeRuntimeHealth(uiUrl, 1_000, fetcher)).toEqual({ ...healthy, client: 'error' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects an HTML fallback at a dependency URL', async () => {
    const fetcher = responses()
    vi.mocked(fetcher).mockImplementation(async (input) => String(input) === dependency
      ? new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } })
      : responses()(input))
    expect(await probeRuntimeHealth(uiUrl, 1_000, fetcher)).toEqual({ ...healthy, client: 'error' })
  })

  it.each(['export const app = 1', 'invalid JavaScript !', 'import x from "https://foreign.test/node_modules/.vite/deps/x.js?v=1"'])(
    'rejects an entry without a usable same-origin optimized import: %s', async (source) => {
      const fetcher: typeof fetch = vi.fn(async (input) => String(input) === entry
        ? new Response(source, { headers: { 'content-type': 'text/javascript' } })
        : responses()(input))
      expect(await probeRuntimeHealth(uiUrl, 1_000, fetcher)).toEqual({ ...healthy, client: 'error' })
      expect(fetcher).toHaveBeenCalledTimes(3)
    },
  )

  it('derives fresh dependency hashes on every recheck', async () => {
    let version = 'old'
    const fetcher: typeof fetch = vi.fn(async (input) => {
      const url = String(input)
      if (url === entry) return new Response(`import ReactDOM from "${dependency.replace('fresh', version)}"`, { headers: { 'content-type': 'text/javascript' } })
      if (url === dependency.replace('fresh', version)) return new Response('', {
        status: version === 'old' ? 504 : 200, headers: { 'content-type': 'text/javascript' },
      })
      return responses()(input)
    })
    const first = await probeRuntimeHealth(uiUrl, 1_000, fetcher)
    expect(decideMainRuntimeAction([vite], first, mainRoot)).toBe('recover')
    version = 'new'
    expect(decideMainRuntimeAction([vite], await probeRuntimeHealth(uiUrl, 1_000, fetcher), mainRoot)).toBe('none')
  })

  it.each([uiUrl, entry, dependency])('bounds a fetch that ignores abort at %s', async (url) => {
    vi.useFakeTimers()
    try {
      const fetcher: typeof fetch = (input) => String(input) === url ? new Promise(() => {}) : responses()(input)
      const pending = probeRuntimeHealth(uiUrl, 100, fetcher)
      await vi.advanceTimersByTimeAsync(100)
      expect(classifyRuntimeHealth(await pending)).toBe('unhealthy')
    } finally { vi.useRealTimers() }
  })

  it.each([uiUrl, entry, dependency])('bounds a body read that never settles at %s', async (url) => {
    vi.useFakeTimers()
    try {
      const fetcher: typeof fetch = (input) => String(input) === url
        ? Promise.resolve(new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'text/javascript' } }))
        : responses()(input)
      const pending = probeRuntimeHealth(uiUrl, 100, fetcher)
      await vi.advanceTimersByTimeAsync(100)
      expect(classifyRuntimeHealth(await pending)).toBe('unhealthy')
    } finally { vi.useRealTimers() }
  })

  it('preserves API failures, UI refusal and stopped behavior', () => {
    expect(decideMainRuntimeAction([vite], { ...healthy, api: 'error', client: 'error' }, mainRoot)).toBe('unhealthy')
    expect(decideMainRuntimeAction([vite], { ...healthy, api: 'unresponsive' }, mainRoot)).toBe('recover')
    expect(decideMainRuntimeAction([vite], { ...healthy, ui: 'error' }, mainRoot)).toBe('unhealthy')
    expect(decideMainRuntimeAction([], healthy, mainRoot)).toBe('start')
    expect(decideMainRuntimeAction([{ pid: 1, command: 'foreign' }], { ...healthy, client: 'error' }, mainRoot)).toBe('refuse')
  })

  it('preserves every single-process identity refusal during client recovery', () => {
    expect(() => assertMainRuntimeIdentity([vite], [101], [vite, worker], mainRoot, 5202, true)).not.toThrow()
    const cases = [
      [[{ pid: 1, command: 'foreign' }], [101], [vite, worker]],
      [[worker], [101], [worker]],
      [[vite], [101, 102], [vite, worker]],
      [[vite], [101], [vite]],
      [[vite], [101], [vite, worker, { pid: 999, command: 'foreign' }]],
    ] as const
    for (const [listeners, groups, members] of cases) {
      expect(() => assertMainRuntimeIdentity(listeners, groups, members, mainRoot, 5202, true)).toThrow(/refusing/)
    }
  })
})

vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>()
  return { ...actual, createServer: vi.fn(actual.createServer) }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execFileSync: vi.fn(actual.execFileSync), spawn: vi.fn(actual.spawn) }
})

describe('main coordinator client recovery', () => {
  it.each(['persistent', 'transient', 'api-error', 'foreign'] as const)(
    '%s failure takes the guarded action without accessing a real process', async (scenario) => {
      const root = mkdtempSync(join(tmpdir(), 'pxlblz-client-recovery-'))
      writeFileSync(join(root, '.dev.vars'), 'test fixture')
      const manifest: RuntimeManifest = {
        schemaVersion: 1, project: 'pxlblz-ide', basePath: '/PXLBLZ-IDE/',
        shared: { vitePort: 5202, issueVitePorts: { start: 5175, end: 5199 } },
        isolated: { vitePorts: { start: 5200, end: 5299 } },
        localIdentities: { developerUserId: 'github:local-dev', agentUserIdPrefix: 'github:local-agent-', agentPoolSize: 2 },
      }
      let running = true
      let restarted = false
      let probes = 0
      const vite = scenario === 'foreign' ? 'node /foreign/server.js' : `node ${root}/node_modules/vite/bin/vite.js`
      vi.mocked(execFileSync).mockImplementation(((command: string, args: string[]) => {
        if (command === 'lsof') return running ? '101\n' : ''
        if (command === 'ps' && args.includes('pgid=')) return '101'
        if (command === 'ps' && args.includes('command=')) return vite
        if (command === 'ps') return running
          ? `101 101 ${vite}\n102 101 ${root}/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve\n`
          : ''
        if (command === process.execPath) return '' // D1 subprocesses are inert fixtures.
        throw new Error(`Unexpected subprocess ${command}`)
      }) as typeof execFileSync)
      const kill = vi.spyOn(process, 'kill').mockImplementation(((_pid: number, signal: string | number) => {
        if (signal === 'SIGTERM') { running = false; return true }
        if (signal === 0 && !running) throw Object.assign(new Error('gone'), { code: 'ESRCH' })
        return true
      }) as typeof process.kill)
      vi.mocked(spawn).mockImplementation((() => {
        restarted = true; running = true
        return { pid: 202, unref() {} }
      }) as unknown as typeof spawn)
      vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
        const url = String(input)
        if (url.endsWith('/api/me')) return new Response('{}', { status: scenario === 'api-error' && probes > 0 ? 500 : 401 })
        if (url.endsWith('/PXLBLZ-IDE/')) {
          probes += 1
          return new Response('<script type="module" src="/PXLBLZ-IDE/src/main.tsx"></script>')
        }
        if (url.includes('/src/main.tsx')) return new Response('import ReactDOM from "/PXLBLZ-IDE/node_modules/.vite/deps/react-dom_client.js?v=actual"', { headers: { 'content-type': 'text/javascript' } })
        return new Response('', { status: restarted || (scenario === 'transient' && probes > 1) ? 200 : 504, headers: { 'content-type': 'text/javascript' } })
      }))
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        const result = ensureMainRuntime({ worktree: root, mainWorktree: root, branch: 'main', gitCommonDirectory: join(root, '.git'), runtimeDirectory: join(root, 'runtime') }, manifest)
        if (scenario === 'foreign' || scenario === 'api-error') {
          await expect(result).rejects.toThrow(/refusing/)
        } else await result
        if (scenario === 'persistent') {
          expect(kill).toHaveBeenCalledWith(-101, 'SIGTERM')
          expect(spawn).toHaveBeenCalledWith(process.execPath, expect.arrayContaining(['--force']), expect.objectContaining({ cwd: root }))
          expect(probes).toBeGreaterThanOrEqual(3)
        } else {
          expect(kill).not.toHaveBeenCalled()
          expect(spawn).not.toHaveBeenCalled()
        }
      } finally {
        kill.mockRestore(); log.mockRestore(); vi.unstubAllGlobals()
        vi.mocked(execFileSync).mockReset(); vi.mocked(spawn).mockReset()
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})

describe('development runtime command', () => {
  it.each(['/tmp/main', '/tmp/issue-1208'])('binds the managed Vite launch for %s to all IPv4 interfaces', (worktree) => {
    expect(managedViteArgs(worktree)).toEqual([
      `${worktree}/node_modules/vite/bin/vite.js`, '--host', '0.0.0.0',
    ])
  })

  it.each([5174, 5175, 5201])('advertises the LAN UI URL for port %i', (port) => {
    expect(runtimeUiUrl(port, '/PXLBLZ-IDE/')).toBe(`http://Agent-Mini.local:${port}/PXLBLZ-IDE/`)
  })

  it('preserves a custom UI base path', () => {
    expect(runtimeUiUrl(5175, '/custom/editor/')).toBe('http://Agent-Mini.local:5175/custom/editor/')
  })

  it.each(['shared', 'isolated'] as const)('prints the LAN UI and localhost API for a %s assignment', (profile) => {
    const manifest: RuntimeManifest = {
      schemaVersion: 1,
      project: 'pxlblz-ide',
      basePath: '/PXLBLZ-IDE/',
      shared: { vitePort: 5174, issueVitePorts: { start: 5175, end: 5199 } },
      isolated: { vitePorts: { start: 5200, end: 5299 } },
      localIdentities: {
        developerUserId: 'github:local-dev', agentUserIdPrefix: 'github:local-agent-', agentPoolSize: 32,
      },
    }
    const uiPort = profile === 'shared' ? 5175 : 5201
    const apiPort = profile === 'shared' ? 5174 : uiPort
    const assignment: RuntimeAssignment = {
      issue: '1208', description: 'LAN managed runtimes', worktree: '/tmp/issue-1208',
      branch: 'issue-1208-lan-runtimes', profile, uiPort, apiPort,
      apiTarget: `http://localhost:${apiPort}`, userId: 'github:local-agent-01',
      createdAt: '2026-10-22T00:00:00.000Z', updatedAt: '2026-10-22T00:00:00.000Z',
    }
    expect(runtimeStartSummary(assignment, manifest)).toBe([
      `Issue 1208 runtime: http://Agent-Mini.local:${uiPort}/PXLBLZ-IDE/`,
      `API: http://localhost:${apiPort} (${profile})`,
      'Local identity: github:local-agent-01',
      `Task title: 1208:${uiPort} - LAN managed runtimes`,
    ].join('\n'))
  })

  it.each([
    ['pxlblz_session', 'synthetic-token'], ['other_session', 'other-token'],
  ])('serializes %s for localhost and LAN browser contexts', (name, value) => {
    expect(runtimeSessionCookies(name, value)).toEqual([
      { name, value, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' },
      { name, value, domain: 'agent-mini.local', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' },
    ])
  })

  it('requires an explicit profile for issue startup', () => {
    expect(() => parseDevRuntimeArgs([
      'start',
      '--issue',
      '627',
      '--description',
      'managed local runtime',
    ])).toThrow('start requires --profile shared or --profile isolated')
  })

  it('links a worktree to main runtime variables without copying secrets', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-dev-vars-'))
    const main = join(directory, 'main')
    const worktree = join(directory, 'issue')
    mkdirSync(main)
    mkdirSync(worktree)
    const shared = join(main, '.dev.vars')
    writeFileSync(shared, 'SESSION_SECRET=test-secret\n')

    ensureSharedDevVarsLink({
      worktree,
      branch: 'codex/issue-627',
      mainWorktree: main,
      gitCommonDirectory: join(main, '.git'),
      runtimeDirectory: join(main, '.git/pxlblz/dev-runtime/v1'),
    })

    expect(realpathSync(join(worktree, '.dev.vars'))).toBe(realpathSync(shared))
  })

  it('gives a detached HEAD a readable stable branch label', () => {
    expect(runtimeBranchLabel('', '02d8d9badfcc2fda2b4a96919db1375f9c23c0d6'))
      .toBe('detached@02d8d9badfcc')
    expect(runtimeBranchLabel('codex/issue-627', '02d8d9badfcc')).toBe('codex/issue-627')
  })

  it('gives each isolated Worker its own canonical OAuth origin', () => {
    expect(issueViteEnvironment(
      { uiPort: 5211 },
      { kind: 'worker', persistState: '/tmp/issue-1009' },
    )).toEqual({
      VITE_PORT: '5211',
      VITE_CF_PERSIST_STATE: '/tmp/issue-1009',
      PXLBLZ_DEV_AGENT_OAUTH_ORIGIN: 'http://localhost:5211',
    })
    expect(issueViteEnvironment(
      { uiPort: 5175 },
      { kind: 'proxy', target: 'http://localhost:5174' },
    )).toEqual({
      VITE_PORT: '5175',
      VITE_API_PROXY_TARGET: 'http://localhost:5174',
    })
  })
})

describe('runtime port availability', () => {
  class FakeServer extends EventEmitter {
    listen = vi.fn<(options: { host: string; port: number; exclusive: boolean }, callback: () => void) => FakeServer>(() => this)
    close = vi.fn<(callback: () => void) => FakeServer>(() => this)
  }

  let server: FakeServer
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset().mockReturnValue('')
    server = new FakeServer()
    vi.mocked(createServer).mockReset().mockReturnValue(server as unknown as ReturnType<typeof createServer>)
  })
  afterEach(() => {
    vi.mocked(execFileSync).mockReset()
    vi.mocked(createServer).mockReset()
  })

  it('binds the Vite address exclusively and waits for close completion before returning true', async () => {
    let resolved = false
    const availability = portIsAvailable(5301).then((value) => { resolved = true; return value })
    expect(server.listen).toHaveBeenCalledWith({ host: '0.0.0.0', port: 5301, exclusive: true }, expect.any(Function))
    server.listen.mock.calls[0][1]()
    expect(server.close).toHaveBeenCalledOnce()
    await Promise.resolve()
    expect(resolved).toBe(false)
    server.close.mock.calls[0][0]()
    expect(await availability).toBe(true)
  })

  it('refuses a port occupied according to lsof without opening a server', async () => {
    vi.mocked(execFileSync).mockReturnValue('12345\n')
    expect(await portIsAvailable(5301)).toBe(false)
    expect(createServer).not.toHaveBeenCalled()
  })

  it('returns false when binding emits an error', async () => {
    const availability = portIsAvailable(5301)
    server.emit('error', new Error('address unavailable'))
    expect(await availability).toBe(false)
    expect(server.close).not.toHaveBeenCalled()
  })
})

describe('bounded service probe', () => {
  it('distinguishes an answering endpoint from one answering with server errors', async () => {
    expect(await probeService('http://localhost:1/api/me', 1_000, async () => new Response('{}', { status: 200 }))).toBe('ok')
    expect(await probeService('http://localhost:1/api/me', 1_000, async () => new Response('', { status: 502 }))).toBe('error')
  })

  it('reports unresponsive when the request itself fails', async () => {
    expect(await probeService('http://localhost:1/api/me', 1_000, async () => {
      throw new Error('connection refused')
    })).toBe('unresponsive')
  })

  it('gives up within the timeout even when the fetcher ignores its abort signal', async () => {
    const startedAt = Date.now()
    const neverSettles: typeof fetch = () => new Promise(() => {})

    expect(await probeService('http://localhost:1/api/me', 100, neverSettles)).toBe('unresponsive')
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })
})

describe('wrangler tmp keepalive', () => {
  it('refreshes stale tmp entry mtimes so the upstream 24h sweep never reaps a live server', () => {
    const root = mkdtempSync(join(tmpdir(), 'pxlblz-tmp-keepalive-'))
    const tmp = join(root, '.wrangler', 'tmp')
    const staleBundle = join(tmp, 'bundle-STALE1')
    mkdirSync(staleBundle, { recursive: true })
    writeFileSync(join(staleBundle, 'middleware-loader.entry.ts'), 'export {}\n')
    const file = join(tmp, 'stray-file')
    writeFileSync(file, 'x')
    const staleTime = new Date(Date.now() - 30 * 60 * 60 * 1000)
    utimesSync(staleBundle, staleTime, staleTime)
    utimesSync(file, staleTime, staleTime)
    const floor = Date.now() - 1_000

    const touched = touchWranglerTmpEntries(tmp)

    expect(touched).toBe(1)
    expect(statSync(staleBundle).mtimeMs).toBeGreaterThanOrEqual(floor)
    // Directories only: the sweep targets directories, and files stay untouched.
    expect(statSync(file).mtimeMs).toBeLessThan(floor)
    // Contents are preserved; only the directory timestamp moves.
    expect(readFileSync(join(staleBundle, 'middleware-loader.entry.ts'), 'utf8')).toBe('export {}\n')
  })

  it('is a safe no-op when the tmp root does not exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'pxlblz-tmp-keepalive-'))
    expect(touchWranglerTmpEntries(join(root, '.wrangler', 'tmp'))).toBe(0)
  })
})
