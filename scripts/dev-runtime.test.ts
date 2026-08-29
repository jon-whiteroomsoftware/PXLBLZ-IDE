import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureSharedDevVarsLink,
  parseDevRuntimeArgs,
  probeUrl,
  runtimeBranchLabel,
  touchWranglerTmpEntries,
} from './dev-runtime'

describe('development runtime command', () => {
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
})

describe('bounded service probe', () => {
  it('reports success for an answering endpoint and failure for a server error', async () => {
    expect(await probeUrl('http://localhost:1/api/me', 1_000, async () => new Response('{}', { status: 200 }))).toBe(true)
    expect(await probeUrl('http://localhost:1/api/me', 1_000, async () => new Response('', { status: 502 }))).toBe(false)
  })

  it('reports failure when the request itself fails', async () => {
    expect(await probeUrl('http://localhost:1/api/me', 1_000, async () => {
      throw new Error('connection refused')
    })).toBe(false)
  })

  it('gives up on a hanging endpoint within the timeout instead of waiting forever', async () => {
    const startedAt = Date.now()
    const hangingFetch: typeof fetch = (_input, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })

    expect(await probeUrl('http://localhost:1/api/me', 100, hangingFetch)).toBe(false)
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
