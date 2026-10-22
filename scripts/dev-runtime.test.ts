import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureSharedDevVarsLink,
  issueViteEnvironment,
  managedViteArgs,
  parseDevRuntimeArgs,
  portIsAvailable,
  probeService,
  runtimeBranchLabel,
  runtimeSessionCookies,
  runtimeStartSummary,
  runtimeUiUrl,
  touchWranglerTmpEntries,
} from './dev-runtime'
import type { RuntimeAssignment, RuntimeManifest } from './dev-runtime-core'

vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>()
  return { ...actual, createServer: vi.fn(actual.createServer) }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) }
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
