import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { RuntimeAssignment } from './dev-runtime-core'
import { authenticatedPlaywrightSeedSql } from './authenticated-playwright-user'
import {
  ensureSharedDevVarsLink,
  loadManifest,
  portIsAvailable,
  repositoryContext,
} from './dev-runtime'
import {
  releaseRuntimeAssignment,
  reserveRuntimeAssignment,
} from './dev-runtime-store'

export function authenticatedPlaywrightEnvironment(
  assignment: RuntimeAssignment,
  persistenceDirectory: string,
  devVarsFile: string,
  basePath = '/PXLBLZ-IDE/',
): Record<string, string> {
  return {
    PLAYWRIGHT_AUTH_SMOKE_VITE_PORT: String(assignment.uiPort),
    PLAYWRIGHT_AUTH_SMOKE_WRANGLER_PORT: String(assignment.apiPort),
    PLAYWRIGHT_STUDIO_URL: `http://localhost:${assignment.uiPort}${basePath}`,
    PXLBLZ_D1_PERSIST_TO: persistenceDirectory,
    PXLBLZ_DEV_VARS_FILE: devVarsFile,
  }
}

export { authenticatedPlaywrightSeedSql }

async function main(): Promise<void> {
  const testFiles = process.argv.slice(2)
  if (testFiles.length === 0) {
    console.error('Authenticated Playwright requires at least one test file.')
    process.exitCode = 1
    return
  }
  const context = repositoryContext(process.cwd())
  const manifest = loadManifest(context.worktree)
  ensureSharedDevVarsLink(context)
  const runId = `playwright-${process.pid}-${Date.now()}`
  const persistenceDirectory = join(context.runtimeDirectory, 'playwright', runId)
  const devVarsFile = join(context.mainWorktree, '.dev.vars')
  if (!existsSync(devVarsFile)) {
    console.error(`Shared main .dev.vars is required: ${devVarsFile}`)
    process.exitCode = 1
    return
  }
  const assignment = await reserveRuntimeAssignment({
    directory: context.runtimeDirectory,
    request: {
      issue: runId,
      description: 'authenticated Playwright',
      worktree: context.worktree,
      branch: context.branch,
      profile: 'isolated',
    },
    manifest,
    now: () => new Date().toISOString(),
    portIsAvailable,
  })
  mkdirSync(persistenceDirectory, { recursive: true })
  const env = {
    ...process.env,
    ...authenticatedPlaywrightEnvironment(
      assignment,
      persistenceDirectory,
      devVarsFile,
      manifest.basePath,
    ),
  }
  try {
    run(process.execPath, [
      resolve(context.worktree, 'node_modules/wrangler/bin/wrangler.js'),
      'd1',
      'migrations',
      'apply',
      'pxlblz-ide',
      '--local',
      '--persist-to',
      persistenceDirectory,
    ], context.worktree, env)
    run(process.execPath, [
      resolve(context.worktree, 'node_modules/wrangler/bin/wrangler.js'),
      'd1',
      'execute',
      'pxlblz-ide',
      '--local',
      '--persist-to',
      persistenceDirectory,
      '--command',
      authenticatedPlaywrightSeedSql(Math.floor(Date.now() / 1000)),
    ], context.worktree, env)
    run('npm', ['run', 'build'], context.worktree, env)
    run(process.execPath, [
      resolve(context.worktree, 'node_modules/playwright/cli.js'),
      'test',
      ...testFiles,
      '--config=playwright.auth.config.ts',
    ], context.worktree, env)
  } finally {
    await releaseRuntimeAssignment(context.runtimeDirectory, runId)
    rmSync(persistenceDirectory, { recursive: true, force: true })
  }
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): void {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? 'without a status'}.`)
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
