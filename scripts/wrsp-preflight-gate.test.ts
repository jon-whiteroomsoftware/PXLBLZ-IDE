import { createServer, type Server } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGitFixture, runInstalledGuard, type GitFixture } from './wrsp-guard-fixture'

/**
 * The installed `wrsp-preflight` worktree and port checks in controlled
 * fixtures (#940). The shared-checkout refusal runs against a disposable
 * repository, never the real shared checkout; the occupied-port case binds a
 * listener this test process owns on an ephemeral port, so no unrelated
 * server is probed or touched. The blocker probes (`gh-auth`, `network`)
 * depend on host credentials and network and are qualified by hand from an
 * elevated shell, with the sandboxed verdict recorded as an observation
 * only (docs/agents/verification.md).
 */
const fixtures: GitFixture[] = []
const servers: Server[] = []
const directories: string[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) fixture.dispose()
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function preflight(args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv) {
  return runInstalledGuard('preflight', args, { cwd, env })
}

async function listenOnEphemeralPort(): Promise<number> {
  const server = createServer()
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener has no port')
  return address.port
}

describe('installed wrsp-preflight worktree check (#940)', () => {
  it('refuses the shared checkout and accepts a linked worktree of the same repository', () => {
    const fixture = createGitFixture('pxlblz-preflight-worktree')
    fixtures.push(fixture)
    writeFileSync(join(fixture.directory, 'README.md'), 'fixture\n')
    fixture.commitAll('base')

    const shared = preflight(['worktree'], fixture.directory, fixture.env)
    expect(shared.status).toBe(1)
    expect(shared.stderr).toContain('This is the shared checkout, not a task worktree.')
    expect(shared.stderr).toContain('git worktree add ~/src/worktrees/<repo>-<task-slug> -b <branch>')

    const linkedDirectory = mkdtempSync(join(tmpdir(), 'pxlblz-preflight-linked-'))
    directories.push(linkedDirectory)
    const linkedPath = join(linkedDirectory, 'task')
    fixture.git('worktree', 'add', '-q', '-b', 'task', linkedPath)
    const linked = preflight(['worktree'], linkedPath, fixture.env)
    expect(linked.status).toBe(0)
    expect(linked.stdout).toContain('Linked worktree confirmed; the shared checkout is untouched.')

    // Cleanup ordering: the worktree entry must go before the fixture repo.
    fixture.git('worktree', 'remove', '--force', linkedPath)
  })

  it('fails closed outside any repository', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-preflight-norepo-'))
    directories.push(directory)
    const fixture = createGitFixture('pxlblz-preflight-env')
    fixtures.push(fixture)

    const result = preflight(['worktree'], directory, fixture.env)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('This directory is not a git repository; substantive work starts in a task worktree.')
  })
})

describe('installed wrsp-preflight port check (#940)', () => {
  it('names the owning process of an occupied port and reports the same port free once released', async () => {
    const fixture = createGitFixture('pxlblz-preflight-port')
    fixtures.push(fixture)
    const port = await listenOnEphemeralPort()

    const occupied = preflight(['port', String(port)], fixture.directory, fixture.env)
    expect(occupied.status).toBe(1)
    expect(occupied.stderr).toContain(`Port ${port} is already in use by pid ${process.pid} (`)
    expect(occupied.stderr).toContain('never kill the listener')

    const server = servers.pop()!
    await new Promise<void>((resolve) => server.close(() => resolve()))
    const free = preflight(['port', String(port)], fixture.directory, fixture.env)
    expect(free.status).toBe(0)
    expect(free.stdout).toContain(`Port ${port} is free.`)
  })

  it('treats malformed and chained invocations as usage failures, never as passes', () => {
    const fixture = createGitFixture('pxlblz-preflight-usage')
    fixtures.push(fixture)

    const badPort = preflight(['port', '0'], fixture.directory, fixture.env)
    expect(badPort.status).toBe(2)
    expect(badPort.stderr).toContain('Usage: wrsp-preflight blocker <gh-auth|network> [--host] | worktree | port <number>')

    const chained = preflight(['worktree', 'port', '5173'], fixture.directory, fixture.env)
    expect(chained.status).toBe(2)
    expect(chained.stderr).toContain('Unexpected operand(s): 5173. Run one check per invocation.')

    const hostOnWorktree = preflight(['worktree', '--host'], fixture.directory, fixture.env)
    expect(hostOnWorktree.status).toBe(2)
    expect(hostOnWorktree.stderr).toContain('--host applies only to blocker probes.')
  })
})
