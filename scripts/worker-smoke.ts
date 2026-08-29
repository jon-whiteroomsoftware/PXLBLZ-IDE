// Headless smoke for the Workers-migration config (#898): builds the app at
// the production base path, serves it with `wrangler dev --config
// wrangler.workers.jsonc` against a throwaway local D1, and verifies the
// behaviors the Pages platform provided implicitly — SPA fallback for deep
// links and unknown paths, real asset serving, worker-first /api routing —
// plus the API's signed-out semantics through the served Worker.
//
//   npm run smoke:worker              # build, serve, check
//   npm run smoke:worker -- --skip-build   # reuse the existing dist/
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { portIsAvailable, probeService } from './dev-runtime'

interface SmokeFailure {
  check: string
  detail: string
}

const workerConfig = 'wrangler.workers.jsonc'

async function main(): Promise<void> {
  const worktree = process.cwd()
  const skipBuild = process.argv.includes('--skip-build')

  if (!skipBuild) {
    console.log('Building at the production base path (VITE_BASE_PATH=/)...')
    run('npm', ['run', 'build'], worktree, { VITE_BASE_PATH: '/' })
  }
  const indexHtml = readFileSync(join(worktree, 'dist', 'index.html'), 'utf8')

  let state: string | undefined
  let server: ChildProcess | undefined
  const serverLog: string[] = []
  // A canceled smoke must not leave the detached group or the throwaway D1
  // behind; the signal path is blunt (immediate SIGKILL escalation) because
  // it cannot await.
  const abruptCleanup = () => {
    if (server?.pid) {
      for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
        try {
          process.kill(-server.pid, signal)
        } catch {
          /* already gone */
        }
      }
    }
    if (state) rmSync(state, { recursive: true, force: true })
  }
  process.on('SIGINT', () => {
    abruptCleanup()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    abruptCleanup()
    process.exit(143)
  })

  const failures: SmokeFailure[] = []
  try {
    state = mkdtempSync(join(tmpdir(), 'pxlblz-worker-smoke-'))
    const wranglerBin = resolve(worktree, 'node_modules/wrangler/bin/wrangler.js')
    console.log('Applying migrations to a throwaway local D1...')
    run(process.execPath, [
      wranglerBin, 'd1', 'migrations', 'apply', 'pxlblz-ide',
      '--local', '--persist-to', state, '--config', workerConfig,
    ], worktree)

    const port = await firstFreePort(8900, 8929)
    console.log(`Serving wrangler dev --config ${workerConfig} on ${port}...`)
    server = spawn(process.execPath, [
      wranglerBin, 'dev',
      '--config', workerConfig,
      '--port', String(port),
      '--inspector-port', '0',
      '--persist-to', state,
    ], { cwd: worktree, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stdout?.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()))
    server.stderr?.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()))

    await waitForOk(`http://localhost:${port}/api/me`, 60_000)
    const base = `http://localhost:${port}`

    // The SPA fallback serves the exact index document for the root, deep
    // links, and unknown paths — byte equality is the oracle.
    for (const path of ['/', '/p/oasis', '/gallery/zranger1', '/no-such-page']) {
      await check(failures, `SPA shell at ${path}`, async () => {
        const response = await fetch(`${base}${path}`)
        expectEqual(response.status, 200, 'status')
        expectEqual(await response.text() === indexHtml, true, 'body equals dist/index.html')
      })
    }

    // A real hashed asset must be served as itself, not the fallback.
    const assetPath = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
    await check(failures, `hashed asset ${assetPath ?? '(not found in index.html)'}`, async () => {
      if (!assetPath) throw new Error('dist/index.html references no /assets/*.js entry')
      const response = await fetch(`${base}${assetPath}`)
      expectEqual(response.status, 200, 'status')
      const body = await response.text()
      expectEqual(body === indexHtml, false, 'asset is not the SPA fallback')
    })

    await check(failures, 'cookieless /api/me is signed out', async () => {
      const response = await fetch(`${base}/api/me`)
      expectEqual(response.status, 200, 'status')
      expectEqual(JSON.stringify(await response.json()), '{"authenticated":false}', 'payload')
    })

    await check(failures, 'D1 health reports the migrated schema', async () => {
      const response = await fetch(`${base}/api/d1/health`)
      expectEqual(response.status, 200, 'status')
      const payload = await response.json() as { ok?: boolean; schemaVersion?: unknown }
      expectEqual(payload.ok, true, 'ok')
      // d1HealthResponse reports the schema version as a non-empty string.
      expectEqual(typeof payload.schemaVersion === 'string' && payload.schemaVersion.length > 0, true, 'schemaVersion present')
    })

    await check(failures, 'unknown /api path answers worker-first JSON 404', async () => {
      const response = await fetch(`${base}/api/no-such-route`)
      expectEqual(response.status, 404, 'status')
      expectEqual(JSON.stringify(await response.json()), '{"error":"Not found"}', 'payload')
    })

    await check(failures, 'bare /api is worker-first, not the SPA fallback', async () => {
      const response = await fetch(`${base}/api`)
      expectEqual(response.status, 404, 'status')
      expectEqual(JSON.stringify(await response.json()), '{"error":"Not found"}', 'payload')
    })

    await check(failures, 'unsupported method answers 405 with Allow', async () => {
      const response = await fetch(`${base}/api/me`, { method: 'PATCH' })
      expectEqual(response.status, 405, 'status')
      expectEqual(response.headers.get('Allow'), 'GET', 'Allow header')
    })

    await check(failures, 'personal content requires a session', async () => {
      const response = await fetch(`${base}/api/patterns`)
      expectEqual(response.status, 401, 'status')
    })
  } finally {
    await stopServer(server)
    if (state) rmSync(state, { recursive: true, force: true })
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) FAILED:`)
    for (const failure of failures) console.error(`  ✗ ${failure.check}: ${failure.detail}`)
    console.error('\nRecent server output:\n' + serverLog.join('').split('\n').slice(-20).join('\n'))
    process.exitCode = 1
    return
  }
  console.log('\nAll worker smoke checks passed.')
}

// Graceful teardown: SIGTERM the detached group, then decide escalation from
// group liveness — not from the Wrangler child's exit event, which can fire
// while a wedged workerd descendant lingers in the group holding the port.
async function stopServer(server: ChildProcess | undefined): Promise<void> {
  if (!server?.pid) return
  const group = server.pid
  try {
    process.kill(-group, 'SIGTERM')
  } catch {
    return
  }
  if (await waitForGroupExit(group, 5_000)) return
  try {
    process.kill(-group, 'SIGKILL')
  } catch {
    return
  }
  if (!await waitForGroupExit(group, 5_000)) {
    throw new Error(`Worker smoke process group ${group} survived SIGKILL; inspect it manually.`)
  }
}

// kill(-group, 0) succeeds while any member of the group is still alive.
function groupAlive(group: number): boolean {
  try {
    process.kill(-group, 0)
    return true
  } catch {
    return false
  }
}

async function waitForGroupExit(group: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!groupAlive(group)) return true
    await new Promise((resolveWait) => setTimeout(resolveWait, 150))
  }
  return !groupAlive(group)
}

async function check(
  failures: SmokeFailure[],
  name: string,
  body: () => Promise<void>,
): Promise<void> {
  try {
    await body()
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failures.push({ check: name, detail: error instanceof Error ? error.message : String(error) })
    console.log(`  ✗ ${name}`)
  }
}

function expectEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

async function waitForOk(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probeService(url, 2_000) === 'ok') return
    await new Promise((resolveWait) => setTimeout(resolveWait, 300))
  }
  throw new Error(`Timed out waiting for ${url}.`)
}

async function firstFreePort(start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port += 1) {
    if (await portIsAvailable(port)) return port
  }
  throw new Error(`No free port in ${start}-${end}.`)
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): void {
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
