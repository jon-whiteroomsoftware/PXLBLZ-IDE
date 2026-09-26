import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { admitJob, claimExecutionSlot, jobPaths, readJobState, updateExecutionOwnership, writeJobState } from '@whiteroom/software-process/dist/runner/daemon/store.js'
import { openParallelCoordinator } from '@whiteroom/software-process/dist/runner/daemon/parallel-store.js'
import { repositoryIdentityId } from '@whiteroom/software-process/dist/runner/repository.js'

const wrapper = resolve('scripts/with-suite-lock.ts')
const tsx = resolve('node_modules/tsx/dist/cli.mjs')
const marker = 'qualified-command-ran'

function runWrapper(label: string, cwd: string, env: NodeJS.ProcessEnv, script = `console.log('${marker}')`, args: string[] = []) {
  return spawnSync(process.execPath, [tsx, wrapper, label, '--', process.execPath, '-e', script, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 10_000,
  })
}

function withQualifiedJob(check: (fixture: { root: string; checkout: string; env: NodeJS.ProcessEnv }) => void) {
  const root = mkdtempSync(join(tmpdir(), 'pxlblz-qualified-lock-'))
  try {
    const daemon = { pid: process.pid, instanceId: 'fixture' }
    openParallelCoordinator(root, daemon, { capacity: 2, groups: ['vitest', 'playwright'] })
    const identity = { rootCommit: 'a'.repeat(40), originUrl: null }
    const jobId = '018fc4cf-8188-7000-8000-000000000001'
    admitJob(root, { protocolVersion: 3, jobId, repository: { id: repositoryIdentityId(identity), ...identity }, commit: 'b'.repeat(40), tree: 'c'.repeat(40),
      suite: { name: 'full-vitest', command: ['npm', 'run', 'test:full'], resourceClass: 'default', parallelGroup: 'vitest' }, requestedAt: '2026-09-07T00:00:00Z' })
    claimExecutionSlot(root, jobId, daemon, '2026-09-07T00:00:00Z')
    writeJobState(root, { ...readJobState(root, jobId), phase: 'running' })
    updateExecutionOwnership(root, jobId, (owner) => ({ ...owner, processGroupId: 12345 }))
    const checkout = jobPaths(root, jobId).checkout
    mkdirSync(checkout)
    const env = { ...process.env, WRSP_RUNNER_JOB_ROOT: root, WRSP_RUNNER_JOB_ID: jobId, WRSP_RUNNER_PARALLEL_GROUP: 'vitest' }
    check({ root, checkout, env })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

it('runs a matching qualified remote suite without the repository lock (WRSP #42)', () => {
  withQualifiedJob(({ checkout, env }) => {
    const accepted = runWrapper('test:full', checkout, env)
    expect(accepted.status, accepted.stderr).toBe(0)
    expect(accepted.stdout).toContain(marker)
  })
})

it('refuses a qualified suite with the wrong label or checkout', () => {
  withQualifiedJob(({ root, checkout, env }) => {
    for (const rejected of [runWrapper('test:e2e', checkout, env), runWrapper('test:full', root, env)]) {
      expect(rejected.status, rejected.stderr).toBe(1)
      expect(rejected.stdout).not.toContain(marker)
    }
  })
})

it('takes the repository lock for unqualified full and Shows suites', () => {
  const root = mkdtempSync(join(tmpdir(), 'pxlblz-local-lock-'))
  try {
    // Git hooks export GIT_* variables that would redirect this scratch checkout.
    const env: NodeJS.ProcessEnv = { ...process.env, WRSP_RUNNER_PARALLEL_GROUP: undefined }
    for (const key of Object.keys(env)) {
      if (key.startsWith('GIT_')) delete env[key]
    }
    const initialized = spawnSync('git', ['init', root], { encoding: 'utf8', env })
    expect(initialized.status, initialized.stderr).toBe(0)
    const lock = join(root, '.git', 'pxlblz', 'suite.lock')
    for (const label of ['test:full', 'test:e2e:shows']) {
      const run = runWrapper(label, root, env,
        'console.log(require("node:fs").existsSync(process.argv[1]) ? "lock-held" : "lock-missing")', [lock])
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).toContain('lock-held')
      expect(existsSync(lock)).toBe(false)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it('refuses a malformed qualified environment instead of using the local lock', () => {
  withQualifiedJob(({ checkout, env }) => {
    const rejected = runWrapper('test:full', checkout, { ...env, WRSP_RUNNER_JOB_ID: undefined })
    expect(rejected.status).not.toBe(0)
    expect(rejected.stdout).not.toContain(marker)
  })
})
