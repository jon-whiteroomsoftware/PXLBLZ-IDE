import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createGitFixture } from './wrsp-guard-fixture'
import { main, observePublication, type CommandResult, type ReadCommand } from './publication-status'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/publication-check-runs.json', import.meta.url), 'utf8'))
const captured = fixture.response.check_runs[0]
const sha: string = captured.head_sha
const old = 'a'.repeat(40)
const ok = (stdout: string): CommandResult => ({ status: 0, stdout, stderr: '' })
// All variations below are synthetic clones; the captured fixture stays unchanged.
const synthetic = (patch = {}) => ({ ...structuredClone(captured), ...patch })
function runner(pages: unknown = [fixture.response], remote = `${sha}\trefs/heads/main\n`, overrides: Partial<CommandResult> = {}): ReadCommand {
  return async (command, args) => {
    if (command === 'git') {
      expect(args).toEqual(['ls-remote', '--exit-code', 'origin', 'refs/heads/main'])
      return { ...ok(remote), ...overrides }
    }
    expect(command).toBe('gh')
    expect(args).toEqual(['api', '--method', 'GET', '--paginate', '--slurp', `repos/jon-whiteroomsoftware/PXLBLZ-IDE/commits/${sha}/check-runs?per_page=100&filter=all`])
    return ok(JSON.stringify(pages))
  }
}

describe('publication evidence', () => {
  it('reports the entire captured success identity using only the two reads', async () => {
    const priorIssue = Object.freeze({ state: 'open' })
    const calls: string[] = []
    const run = runner()
    const report = await observePublication(sha, 0, async (command, args) => {
      calls.push(command)
      return run(command, args)
    })
    expect(calls.sort()).toEqual(['gh', 'git'])
    expect(report).toMatchObject({ state: 'verified', sha, push: { state: 'verified', exitCode: 0 }, remote: { state: 'verified', ref: 'refs/heads/main', sha }, worker: { state: 'verified', service: 'pxlblz-ide-worker', head_sha: sha, checkId: captured.id, checkUrl: captured.html_url, buildUrl: captured.details_url, externalId: captured.external_id, versionId: '56d7d50c-9d05-4343-92c5-fb238da174b1' } })
    expect(Number.isNaN(Date.parse(report.observedAt))).toBe(false)
    expect(priorIssue).toEqual({ state: 'open' })
  })

  it.each([
    [null, sha, 'pending'], [1, sha, 'failed'], [37, old, 'failed'],
    [0, old, 'failed'], [null, old, 'pending'],
  ] as const)('preserves push %s and remote %s', async (exit, remote, state) => {
    const report = await observePublication(sha, exit, runner(undefined, `${remote}\trefs/heads/main`))
    expect(report.state).toBe(state)
    expect(report.push.exitCode).toBe(exit)
    expect(report.remote.sha).toBe(remote)
  })

  it.each(['', `${sha}\trefs/heads/other`, `bad\trefs/heads/main`, `${sha}\trefs/heads/main\n${sha}\trefs/heads/main`])('rejects invalid remote %s', async (remote) => {
    expect((await observePublication(sha, 0, runner(undefined, remote))).state).toBe('failed')
  })

  it.each([null, 1])('retains remote command status %s', async (status) => {
    const report = await observePublication(sha, 0, runner(undefined, '', { status }))
    expect(report.remote.command.status).toBe(status)
    expect(report.state).toBe('failed')
  })

  it.each([
    [{ head_sha: old }, 'pending'], [{ name: 'Cloudflare Pages' }, 'pending'],
    [{ name: 'Workers Builds: another' }, 'pending'], [{ app: { id: 1, slug: 'cloudflare-workers-and-pages' } }, 'pending'],
    [{ app: { id: 85455, slug: 'other' } }, 'pending'],
    ...['queued', 'in_progress', 'waiting', 'requested', 'pending'].map(status => [{ status }, 'pending']),
    ...['failure', 'cancelled', 'timed_out', 'skipped', 'neutral', 'action_required', 'stale'].map(conclusion => [{ conclusion }, 'failed']),
    [{ conclusion: null }, 'pending'], [{ conclusion: undefined }, 'pending'],
    [{ status: 'unknown' }, 'failed'], [{ status: ['queued'] }, 'failed'], [{ status: null }, 'failed'], [{ conclusion: 'unknown' }, 'failed'],
    [{ external_id: 'bad' }, 'failed'], [{ id: 'invalid' }, 'failed'],
    ...['bcb0dc2806acf947e2b4873e034b8988', 'pxlblz-ide-worker', captured.external_id].map(part => [{ details_url: captured.details_url.replace(part, 'wrong') }, 'failed']),
    ...['?x=1', '#fragment', ':443'].map((part) => [{ details_url: part === ':443' ? captured.details_url.replace('.com/', '.com:443/') : captured.details_url + part }, 'failed']),
    [{ details_url: captured.details_url.replace('https://', 'https://user@') }, 'failed'],
    [{ details_url: captured.details_url.replace('https://', 'http://') }, 'failed'],
    [{ details_url: undefined }, 'failed'],
  ] as [Record<string, unknown>, string][])('classifies synthetic check %j as %s', async (patch, state) => {
    const report = await observePublication(sha, 0, runner([{ check_runs: [synthetic(patch)] }]))
    expect(report.worker.state).toBe(state)
    expect(report.state).toBe(state)
  })

  it.each([[], {}, [null], [{ check_runs: {} }], [{ check_runs: [null] }]])('fails closed or stays pending for envelope %j', async (pages) => {
    const report = await observePublication(sha, 0, runner(pages))
    expect(report.state).toBe(Array.isArray(pages) && pages.length === 0 ? 'pending' : 'failed')
  })

  it.each(['pending', 'failure'])('newest %s outranks success across pages and order', async (outcome) => {
    const newest = synthetic({ id: captured.id + 1, status: outcome === 'pending' ? 'queued' : 'completed', conclusion: outcome === 'pending' ? null : 'failure' })
    for (const records of [[newest, captured], [captured, newest]]) {
      const report = await observePublication(sha, 0, runner([{ check_runs: [] }, { check_runs: records }]))
      expect(report.worker.checkId).toBe(newest.id)
      expect(report.state).toBe(outcome === 'pending' ? 'pending' : 'failed')
    }
    expect((await observePublication(sha, 0, runner([{ check_runs: [] }, fixture.response]))).state).toBe('verified')
  })

  it('keeps absent checks pending and parses only supported Version ID lines', async () => {
    expect((await observePublication(sha, 0, runner([{ check_runs: [] }]))).worker.state).toBe('pending')
    const report = await observePublication(sha, 0, runner([{ check_runs: [synthetic({ output: { summary: `Other Version ID: 56d7d50c-9d05-4343-92c5-fb238da174b1\nVersion ID: invalid` } })] }]))
    expect(report.worker.state).toBe('verified')
    expect(report.worker.versionId).toBeUndefined()
  })

  it('fails on thrown, null-status and malformed API observations', async () => {
    for (const api of [async () => { throw new Error('transport') }, async () => ({ ...ok('[]'), status: null }), async () => ok('{'), async () => ({ ...ok('[]'), status: 1 })]) {
      const run: ReadCommand = (cmd, args) => cmd === 'gh' ? api() : runner()(cmd, args)
      expect((await observePublication(sha, 0, run)).worker.state).toBe('failed')
    }
    const remoteFailure = await observePublication(sha, 0, async (cmd, args) => {
      if (cmd === 'git') throw new Error('remote transport')
      return runner()(cmd, args)
    })
    expect(remoteFailure.remote).toMatchObject({ state: 'failed', command: { status: null } })
  })
})

describe('CLI JSON boundary', () => {
  it('helps without observations', async () => {
    expect(await main(['--help'], { run: async () => { throw new Error('must not read') }, out: () => {} })).toBe(0)
  })
  it.each([[], ['--sha'], ['--sha', 'BAD'], ['--sha', sha, '--sha', sha], ['--sha', sha, '--unknown'], ['--sha', sha, '--push-exit', '256'], ['--sha', sha, '--push-exit', '-1'], ['--sha', sha, '--push-exit', '1.0'], ['--sha', sha, '--push-exit'], ['--sha', sha, '--push-exit', '0', '--push-exit', '0']])('rejects %j before observations', async (...wrapped) => {
    const args = wrapped.flat() as string[]
    const errors: string[] = []
    const code = await main(args, { run: async () => { throw new Error('must not read') }, out: () => { throw new Error('must not output JSON') }, error: text => errors.push(text) })
    expect(code).toBe(1)
    expect(errors[0]).toMatch(/argument|sha|push-exit/i)
  })
  it.each([[null, 2], [0, 0], [47, 1]] as const)('maps supplied push %s to report exit %s', async (exit, expected) => {
    const output: string[] = []
    const args = ['--sha', sha, ...(exit === null ? [] : ['--push-exit', String(exit)])]
    expect(await main(args, { run: runner(), out: text => output.push(text), error: () => {} })).toBe(expected)
    expect(JSON.parse(output[0]).push.exitCode).toBe(exit)
  })
})

it('executes the documented completion block with refusing and accepting real hooks', async () => {
  const repo = createGitFixture('publication-status')
  const temp = mkdtempSync(join(tmpdir(), 'publication-remote-'))
  try {
    const bare = join(temp, 'remote.git')
    execFileSync('git', ['init', '--bare', '-q', bare], { env: repo.env })
    repo.git('remote', 'add', 'origin', bare)
    writeFileSync(join(repo.directory, 'content'), 'initial')
    const initial = repo.commitAll('initial')
    repo.git('push', 'origin', 'HEAD:refs/heads/main')
    writeFileSync(join(repo.directory, 'content'), 'second')
    const second = repo.commitAll('second')
    const hook = join(repo.directory, '.git/hooks/pre-push')
    const bin = join(temp, 'bin')
    mkdirSync(bin)
    const capture = join(temp, 'arguments')
    writeFileSync(join(bin, 'npx'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$PUBLICATION_CAPTURE"\necho observer-after-push\nexit 0\n', { mode: 0o755 })
    const docs = readFileSync(new URL('../docs/reference/Cloudflare Operations.md', import.meta.url), 'utf8')
    const block = docs.match(/<!-- publication-completion-command -->\s*```sh\n([\s\S]*?)```/)?.[1]
    expect(block).toBeTruthy()
    for (const refusal of [true, false]) {
      writeFileSync(hook, `#!/bin/sh\nexit ${refusal ? 1 : 0}\n`, { mode: 0o755 })
      const completion = spawnSync('sh', ['-c', block!], { cwd: repo.directory, env: { ...repo.env, PATH: `${bin}:${repo.env.PATH}`, PUBLICATION_CAPTURE: capture }, encoding: 'utf8', timeout: 10_000 })
      const args = readFileSync(capture, 'utf8').trim().split('\n')
      const exit = Number(args[args.indexOf('--push-exit') + 1])
      expect(args[args.indexOf('--sha') + 1]).toBe(second)
      expect(completion.status).toBe(exit)
      expect(exit === 0).toBe(!refusal)
      expect(completion.stdout).toContain('observer-after-push')
      const log = completion.stdout.match(/Push log: (.+)/)?.[1]
      expect(log).toBeTruthy()
      expect(readFileSync(log!, 'utf8').length).toBeGreaterThan(0)
      rmSync(log!)
      const remote = repo.git('ls-remote', '--exit-code', 'origin', 'refs/heads/main')
      expect(remote.split(/\s/)[0]).toBe(refusal ? initial : second)
      const report = await observePublication(second, exit, async (cmd, readArgs) => cmd === 'git' ? ok(repo.git(...readArgs)) : ok(JSON.stringify([{ check_runs: [synthetic({ head_sha: second })] }])))
      expect(report.state).toBe(refusal ? 'failed' : 'verified')
      expect(report.remote.sha).toBe(refusal ? initial : second)
    }
  } finally {
    repo.dispose()
    rmSync(temp, { recursive: true, force: true })
  }
})
