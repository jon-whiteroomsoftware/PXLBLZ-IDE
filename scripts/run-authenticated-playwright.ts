import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { RuntimeAssignment } from './dev-runtime-core'
import { authenticatedPlaywrightSeedSql, authenticatedPlaywrightWorkerCount } from './authenticated-playwright-user'
import { readWorkerCount, workerCountLine } from './worker-count-env'
import {
  acquirePlaywrightDevVars,
  loadPlaywrightManifest,
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
    // Hermetic browser suites exercise external MCP without production
    // credentials. Static preregistration stays empty; DCR and CIMD remain
    // available through the real Worker authority.
    AGENT_SERVICE_ENABLED: '1',
    AGENT_OAUTH_CLIENTS: '[]',
    PLAYWRIGHT_AUTH_SMOKE_VITE_PORT: String(assignment.uiPort),
    PLAYWRIGHT_STUDIO_URL: `http://localhost:${assignment.uiPort}${basePath}`,
    PXLBLZ_D1_PERSIST_TO: persistenceDirectory,
    PXLBLZ_DEV_VARS_FILE: devVarsFile,
    PXLBLZ_DEV_AGENT_OAUTH_ORIGIN: `http://localhost:${assignment.uiPort}`,
  }
}

export { authenticatedPlaywrightSeedSql }

export function resolveAuthenticatedWorkers(
  args: string[],
  env: Record<string, string | undefined>,
  poolWorkers: number,
): { args: string[]; workers: number; line: string } {
  const authName = 'WRSP_HOST_PLAYWRIGHT_AUTH_WORKERS'
  let sourceName: string | null = authName
  let workers = poolWorkers
  const resolvedArgs = args.map((arg) => {
    if (arg.startsWith('--workers-env=')) {
      const token = arg.slice('--workers-env='.length)
      const colon = token.lastIndexOf(':')
      if (colon <= 0) throw new Error(`Invalid authenticated Playwright worker token: ${arg}`)
      const name = token.slice(0, colon)
      const fallback = readWorkerCount({ [name]: token.slice(colon + 1) }, name, poolWorkers)
      workers = readWorkerCount(env, name, fallback)
      sourceName = name
      return `--workers=${workers}`
    }
    if (arg.startsWith('--workers=')) {
      workers = readWorkerCount({ argument: arg.slice('--workers='.length) }, 'argument', poolWorkers)
      sourceName = null
    }
    return arg
  })
  if (workers > poolWorkers) {
    throw new Error(`Authenticated Playwright was asked for ${workers} workers but its account pool is sized for ${poolWorkers}; set ${authName} to at least ${workers}.`)
  }
  const line = sourceName === null
    ? `Authenticated Playwright workers: ${workers} (argument)`
    : workerCountLine('Authenticated Playwright', env, sourceName, workers)
  return { args: resolvedArgs, workers, line }
}

async function main(): Promise<void> {
  let resolvedWorkers: ReturnType<typeof resolveAuthenticatedWorkers>
  try {
    resolvedWorkers = resolveAuthenticatedWorkers(process.argv.slice(2), process.env, authenticatedPlaywrightWorkerCount)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }
  console.log(resolvedWorkers.line)
  const testFiles = resolvedWorkers.args
  if (testFiles.length === 0) {
    console.error('Authenticated Playwright requires at least one test file.')
    process.exitCode = 1
    return
  }
  const context = repositoryContext(process.cwd())
  const manifest = loadPlaywrightManifest(context.worktree, 'isolated')
  const devVars = acquirePlaywrightDevVars(context)
  const runId = `playwright-${process.pid}-${Date.now()}`
  const persistenceDirectory = join(context.runtimeDirectory, 'playwright', runId)
  let assignment: RuntimeAssignment | null = null
  try {
    assignment = await reserveRuntimeAssignment({
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
        devVars.file,
        manifest.basePath,
      ),
    }
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
    run(process.execPath, [
      resolve(context.worktree, 'node_modules/playwright/cli.js'),
      'test',
      ...testFiles,
      '--config=playwright.auth.config.ts',
    ], context.worktree, env)
  } finally {
    if (assignment) await releaseRuntimeAssignment(context.runtimeDirectory, runId)
    rmSync(persistenceDirectory, { recursive: true, force: true })
    devVars.release()
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
