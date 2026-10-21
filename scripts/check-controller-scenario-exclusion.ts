import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'
import {
  CONTROLLER_SCENARIO_NEEDLES,
  findNeedleHits,
  isScannedBundleFile,
  previewRefusals,
  type BundleFile,
} from './controller-scenario-exclusion-lib'

function bundleFiles(dist: string, directory = dist): BundleFile[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return bundleFiles(dist, absolute)
    const relative = path.relative(dist, absolute)
    return entry.isFile() && isScannedBundleFile(relative)
      ? [{ path: relative, text: fs.readFileSync(absolute, 'utf8') }]
      : []
  })
}

async function freePort(): Promise<number> {
  const server = net.createServer()
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('could not allocate a preview port')))
        return
      }
      server.close(error => error ? reject(error) : resolve(address.port))
    })
  })
}

async function main(): Promise<void> {
  const dist = path.resolve('dist')
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('CONTROLLER SCENARIO EXCLUSION ERROR: dist/index.html is missing; run npm run build first.')
    process.exitCode = 2
    return
  }
  const files = bundleFiles(dist)
  const refusals = findNeedleHits(files, CONTROLLER_SCENARIO_NEEDLES)
    .map(hit => `${hit.path} contains "${hit.needle}"`)
  const port = await freePort()
  const base = process.env.VITE_BASE_PATH?.trim() || '/PXLBLZ-IDE/'
  const url = 'http://127.0.0.1:' + port + base
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  let spawnError: Error | undefined
  child.on('error', error => { spawnError = error })
  child.stdout.resume()
  child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-8000) })
  try {
    const deadline = Date.now() + 30_000
    let ready = false
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) })
        await response.body?.cancel()
        if (response.status === 200) {
          ready = true
          break
        }
      } catch {
        // The preview may still be starting; retry within the readiness budget.
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (!ready) {
      console.error(`CONTROLLER SCENARIO EXCLUSION ERROR: vite preview did not answer on ${url} within 30s`)
      if (stderr) console.error(stderr)
      process.exitCode = 2
      return
    }

    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      const consoleLines: string[] = []
      page.on('console', message => consoleLines.push(message.text()))
      await page.goto(url + '?controllerScenario=matched', { waitUntil: 'load' })
      let rootRendered = true
      try {
        await page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, null, { timeout: 15000 })
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error
        rootRendered = false
      }
      // A leaked dynamic import needs time to install its scenario after load.
      await page.waitForTimeout(1000)
      const scenarioGlobal = await page.evaluate(() => typeof (window as unknown as {
        __pxlblzControllerScenario?: unknown
      }).__pxlblzControllerScenario)
      refusals.push(...previewRefusals({ scenarioGlobal, consoleLines, rootRendered }))
    } finally {
      await browser.close()
    }

    if (refusals.length) {
      console.error('CONTROLLER SCENARIO EXCLUSION FAILED')
      for (const refusal of refusals) console.error('- ' + refusal)
      process.exitCode = 1
    } else {
      console.log(`CONTROLLER SCENARIO EXCLUDED: scanned ${files.length} files under dist/, production preview ${url} left window.__pxlblzControllerScenario undefined.`)
    }
  } finally {
    child.kill('SIGTERM')
  }
}

main().catch(error => {
  console.error('CONTROLLER SCENARIO EXCLUSION ERROR:', error)
  process.exitCode = 2
})
