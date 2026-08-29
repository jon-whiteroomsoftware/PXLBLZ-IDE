// Candidate-aware public Playwright wrapper (#746).
//
// The stable reviewed-main runtime intentionally always occupies Vite 5174,
// so a config that reuses whatever listens there makes a worktree gate run
// silently test old main instead of its candidate. This wrapper reserves a
// shared-profile UI port from the managed runtime registry, points the suite
// at a candidate-owned dev server, and releases the reservation afterwards.
// When PLAYWRIGHT_STUDIO_URL is already set — for example at a managed issue
// runtime that is already serving this worktree — the wrapper reserves
// nothing and the global setup's identity check remains the gate.
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { RuntimeAssignment } from './dev-runtime-core'
import {
  loadManifest,
  portIsAvailable,
  repositoryContext,
} from './dev-runtime'
import {
  releaseRuntimeAssignment,
  reserveRuntimeAssignment,
} from './dev-runtime-store'

export function publicPlaywrightEnvironment(
  assignment: RuntimeAssignment,
  persistStateDirectory: string,
  basePath = '/PXLBLZ-IDE/',
): Record<string, string> {
  // The candidate server is hermetic (#901): one worker-dev Vite process
  // serving the candidate's UI, its Worker, and a throwaway migrated D1 —
  // the push gate no longer depends on the stable main runtime being
  // healthy. VITE_BASE_PATH must bind to the same manifest base the Studio
  // URL is built from; an inherited shell or .env value would otherwise make
  // Playwright target one base while the spawned Vite serves another.
  return {
    PLAYWRIGHT_PUBLIC_VITE_PORT: String(assignment.uiPort),
    PLAYWRIGHT_PUBLIC_PERSIST_STATE: persistStateDirectory,
    PLAYWRIGHT_STUDIO_URL: `http://localhost:${assignment.uiPort}${basePath}`,
    VITE_BASE_PATH: basePath,
  }
}

export interface ServedIdentity {
  worktree: string
  commit: string | null
}

// The served worktree must be the worktree under test. Canonicalization is
// injected so callers compare real paths (symlinked invocation directories,
// /tmp vs /private/tmp) while tests stay pure; a canonicalization failure
// propagates because an unresolvable path is not a verified match.
export function verifyServedIdentity(
  payload: unknown,
  expectedWorktree: string,
  canonicalize: (path: string) => string,
): ServedIdentity {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`The server returned a malformed identity payload: ${JSON.stringify(payload)}`)
  }
  const { worktree, commit } = payload as { worktree?: unknown; commit?: unknown }
  if (typeof worktree !== 'string' || worktree.length === 0) {
    throw new Error(`The server identity names no worktree: ${JSON.stringify(payload)}`)
  }
  if (canonicalize(worktree) !== canonicalize(expectedWorktree)) {
    throw new Error(
      `The server serves ${worktree}, not the candidate worktree ${expectedWorktree}; `
      + 'refusing to run the public suite against a different build (#746).',
    )
  }
  return {
    worktree,
    commit: typeof commit === 'string' && commit.length > 0 ? commit : null,
  }
}

async function main(): Promise<void> {
  const testArgs = process.argv.slice(2)
  const context = repositoryContext(process.cwd())

  if (process.env.PLAYWRIGHT_STUDIO_URL) {
    console.log(
      `Public e2e target: ${process.env.PLAYWRIGHT_STUDIO_URL} (explicit; identity check gates the run)`,
    )
    runPlaywright(context.worktree, testArgs, process.env)
    return
  }

  const manifest = loadManifest(context.worktree)
  const runId = `playwright-public-${process.pid}-${Date.now()}`
  const persistStateDirectory = join(context.runtimeDirectory, 'playwright', runId)
  const assignment = await reserveRuntimeAssignment({
    directory: context.runtimeDirectory,
    request: {
      issue: runId,
      description: 'public Playwright',
      worktree: context.worktree,
      branch: context.branch,
      profile: 'shared',
    },
    manifest,
    now: () => new Date().toISOString(),
    portIsAvailable,
  })
  mkdirSync(persistStateDirectory, { recursive: true })
  const environment = publicPlaywrightEnvironment(assignment, persistStateDirectory, manifest.basePath)
  console.log(
    `Public e2e target: ${environment.PLAYWRIGHT_STUDIO_URL} (hermetic candidate-owned server for ${context.worktree})`,
  )
  try {
    const migrate = spawnSync(process.execPath, [
      resolve(context.worktree, 'node_modules/wrangler/bin/wrangler.js'),
      'd1', 'migrations', 'apply', 'pxlblz-ide',
      '--local', '--persist-to', persistStateDirectory,
    ], { cwd: context.worktree, stdio: 'inherit' })
    if (migrate.status !== 0) {
      throw new Error(`Migrating the throwaway public-suite D1 exited ${migrate.status ?? 'without a status'}.`)
    }
    runPlaywright(context.worktree, testArgs, { ...process.env, ...environment })
  } finally {
    await releaseRuntimeAssignment(context.runtimeDirectory, runId)
    rmSync(persistStateDirectory, { recursive: true, force: true })
  }
}

function runPlaywright(
  worktree: string,
  testArgs: readonly string[],
  env: NodeJS.ProcessEnv,
): void {
  const result = spawnSync(process.execPath, [
    resolve(worktree, 'node_modules/playwright/cli.js'),
    'test',
    '--config=playwright.config.ts',
    ...testArgs,
  ], {
    cwd: worktree,
    env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`playwright test exited ${result.status ?? 'without a status'}.`)
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
