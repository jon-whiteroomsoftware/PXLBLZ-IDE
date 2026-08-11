#!/usr/bin/env node

// Playwright session driver for goal-based manual test campaigns.
// One instance serves one tester batch over HTTP POST /cmd and writes evidence
// below --evidence-dir.

import { mkdirSync, readFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'

function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      parsed[key] = next
      index += 1
    } else {
      parsed[key] = true
    }
  }
  return parsed
}

const args = parseArgs(process.argv.slice(2))
const port = Number(args.port ?? 9301)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`--port must be an integer from 1 to 65535; received ${args.port}`)
}

const baseUrl = String(args.base ?? process.env.BASE_URL ?? '')
if (!baseUrl) throw new Error('Pass --base or set BASE_URL to the managed issue runtime URL.')

const repoRoot = path.resolve(String(
  args['repo-root'] ?? process.env.PXLBLZ_REPO_ROOT ?? process.cwd(),
))
const evidenceDirectory = path.resolve(String(args['evidence-dir'] ?? './evidence'))
mkdirSync(evidenceDirectory, { recursive: true })

const require = createRequire(path.join(repoRoot, 'package.json'))
const { chromium } = require('playwright')

let browser
let context
if (args.extension) {
  const userDataDirectory = args['profile-dir']
    ? path.resolve(String(args['profile-dir']))
    : path.join(evidenceDirectory, 'chrome-profile')
  context = await chromium.launchPersistentContext(userDataDirectory, {
    headless: !args.headed,
    channel: 'chromium',
    viewport: { width: 1440, height: 900 },
    args: [
      `--disable-extensions-except=${args.extension}`,
      `--load-extension=${args.extension}`,
    ],
  })
  if (context.serviceWorkers().length === 0) {
    await context.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => {})
  }
  console.log(JSON.stringify({
    extensionWorkers: context.serviceWorkers().map((worker) => worker.url()),
  }))
  browser = context.browser()
} else {
  browser = await chromium.launch({ headless: !args.headed })
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
}

if (args.session) {
  const session = JSON.parse(readFileSync(path.resolve(String(args.session)), 'utf8'))
  if (!session.cookie) throw new Error(`Session file ${args.session} contains no cookie.`)
  await context.addCookies([session.cookie])
}

const consoleErrors = []
const apiLog = []
const downloads = []
const pages = []
let page

function wirePage(candidate) {
  candidate.setDefaultTimeout(5000)
  candidate.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push({ time: Date.now(), text: message.text().slice(0, 500) })
    }
  })
  candidate.on('pageerror', (error) => {
    consoleErrors.push({ time: Date.now(), text: `pageerror: ${String(error).slice(0, 500)}` })
  })
  candidate.on('request', (request) => {
    if (request.url().includes('/api/')) {
      apiLog.push({
        time: Date.now(),
        method: request.method(),
        url: request.url().slice(0, 200),
      })
    }
  })
  candidate.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 400) {
      apiLog.push({
        time: Date.now(),
        status: response.status(),
        url: response.url().slice(0, 200),
      })
    }
  })
  candidate.on('download', async (download) => {
    const file = path.join(evidenceDirectory, 'downloads', download.suggestedFilename())
    mkdirSync(path.dirname(file), { recursive: true })
    await download.saveAs(file).catch(() => {})
    downloads.push({ time: Date.now(), file, name: download.suggestedFilename() })
  })
  pages.push(candidate)
  return candidate
}

page = wirePage(await context.newPage())

function locate(command) {
  let locator
  if (command.role) {
    locator = page.getByRole(
      command.role,
      command.name !== undefined
        ? { name: command.name, exact: command.exact ?? false }
        : {},
    )
  } else if (command.label) {
    locator = page.getByLabel(command.label, { exact: command.exact ?? false })
  } else if (command.text) {
    locator = page.getByText(command.text, { exact: command.exact ?? false })
  } else if (command.placeholder) {
    locator = page.getByPlaceholder(command.placeholder)
  } else if (command.testid) {
    locator = page.getByTestId(command.testid)
  } else {
    throw new Error('Provide role and name, label, text, placeholder, or testid.')
  }
  return command.nth === undefined ? locator : locator.nth(command.nth)
}

async function ambient() {
  return { url: page.url(), recentErrors: consoleErrors.slice(-5) }
}

const handlers = {
  async goto(command) {
    const url = command.url.startsWith('http') ? command.url : new URL(command.url, baseUrl).href
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(command.settleMs ?? 600)
    return {}
  },
  async reload(command) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(command.settleMs ?? 600)
    return {}
  },
  async click(command) {
    await locate(command).click({
      modifiers: command.modifiers,
      position: command.position,
      force: command.force,
    })
    await page.waitForTimeout(command.settleMs ?? 200)
    return {}
  },
  async dblclick(command) {
    await locate(command).dblclick({
      modifiers: command.modifiers,
      position: command.position,
    })
    await page.waitForTimeout(command.settleMs ?? 200)
    return {}
  },
  async fill(command) {
    await locate(command).fill(String(command.value))
    if (command.commit !== false) await locate(command).press('Enter').catch(() => {})
    await page.waitForTimeout(command.settleMs ?? 150)
    return {}
  },
  async select(command) {
    const value = await locate(command)
      .selectOption(command.value !== undefined ? { label: command.value } : { index: command.index })
      .catch(async () => locate(command).selectOption(String(command.value)))
    return { value }
  },
  async check(command) {
    await locate(command).setChecked(command.checked ?? true)
    return {}
  },
  async press(command) {
    await page.keyboard.press(command.keys)
    await page.waitForTimeout(command.settleMs ?? 150)
    return {}
  },
  async type(command) {
    await page.keyboard.type(command.text, { delay: command.delay ?? 20 })
    return {}
  },
  async hover(command) {
    await locate(command).hover()
    await page.waitForTimeout(command.settleMs ?? 200)
    return {}
  },
  async drag(command) {
    await locate(command.from).dragTo(locate(command.to), {
      sourcePosition: command.sourcePosition,
      targetPosition: command.targetPosition,
    })
    await page.waitForTimeout(command.settleMs ?? 300)
    return {}
  },
  async mouse(command) {
    for (const action of command.actions) {
      if (action.op === 'move') {
        await page.mouse.move(action.x, action.y, { steps: action.steps ?? 1 })
      } else if (action.op === 'down') {
        await page.mouse.down({ button: action.button })
      } else if (action.op === 'up') {
        await page.mouse.up({ button: action.button })
      } else if (action.op === 'wheel') {
        await page.mouse.wheel(action.dx ?? 0, action.dy ?? 0)
      } else if (action.op === 'pause') {
        await page.waitForTimeout(action.ms ?? 100)
      } else if (action.op === 'keydown') {
        await page.keyboard.down(action.key)
      } else if (action.op === 'keyup') {
        await page.keyboard.up(action.key)
      } else {
        throw new Error(`Unknown mouse action: ${action.op}`)
      }
    }
    await page.waitForTimeout(command.settleMs ?? 200)
    return {}
  },
  async bbox(command) {
    const box = await locate(command).boundingBox()
    return box
      ? { box, center: { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
      : { box: null }
  },
  async count(command) {
    return { count: await locate(command).count() }
  },
  async snapshot(command) {
    const locator = command.role || command.label || command.text || command.testid
      ? locate(command)
      : page.locator('body')
    const snapshot = await locator.ariaSnapshot()
    const maximum = command.max ?? 12000
    return {
      snapshot: snapshot.length > maximum
        ? `${snapshot.slice(0, maximum)}\n...truncated (${snapshot.length} chars total)`
        : snapshot,
    }
  },
  async text(command) {
    const locator = command.role || command.label || command.text || command.testid
      ? locate(command)
      : page.locator('body')
    const body = await locator.innerText()
    const maximum = command.max ?? 8000
    return { text: body.length > maximum ? `${body.slice(0, maximum)}...` : body }
  },
  async screenshot(command) {
    const file = path.join(evidenceDirectory, `${command.name || `shot-${Date.now()}`}.png`)
    await page.screenshot({ path: file, fullPage: command.fullPage ?? false })
    return { file }
  },
  async resize(command) {
    await page.setViewportSize({ width: command.width, height: command.height })
    await page.waitForTimeout(command.settleMs ?? 300)
    return {}
  },
  async eval(command) {
    const result = await page.evaluate(
      new Function(`return (async () => { return ${command.js}; })()`),
    )
    return { result }
  },
  async errors() {
    return { errors: consoleErrors }
  },
  async downloads() {
    return { downloads }
  },
  async apilog(command) {
    const log = command.filter
      ? apiLog.filter((entry) => entry.url.includes(command.filter))
      : apiLog
    return { apilog: log.slice(-(command.last ?? 50)) }
  },
  async offline(command) {
    await context.setOffline(command.on ?? true)
    return { offline: command.on ?? true }
  },
  async tab(command) {
    if (command.index !== undefined && pages[command.index]) {
      page = pages[command.index]
    } else {
      page = wirePage(await context.newPage())
    }
    return { tab: pages.indexOf(page), tabs: pages.length }
  },
  async close() {
    setTimeout(() => void shutdown(0), 100)
    return { closing: true }
  },
}

async function shutdown(exitCode) {
  server.close()
  await context.close().catch(() => {})
  if (browser) await browser.close().catch(() => {})
  process.exit(exitCode)
}

const server = http.createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== '/cmd') {
    response.writeHead(404).end()
    return
  }

  let body = ''
  request.on('data', (chunk) => { body += chunk })
  request.on('end', async () => {
    let output
    try {
      const command = JSON.parse(body)
      const handler = handlers[command.cmd]
      if (!handler) throw new Error(`Unknown command: ${command.cmd}`)
      output = { ok: true, ...await handler(command), ...await ambient() }
    } catch (error) {
      output = {
        ok: false,
        error: String(error?.message ?? error).slice(0, 1200),
        ...await ambient().catch(() => ({})),
      }
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(output))
  })
})

process.on('SIGINT', () => void shutdown(130))
process.on('SIGTERM', () => void shutdown(143))

server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({
    ready: true,
    port,
    base: baseUrl,
    evidence: evidenceDirectory,
    repoRoot,
  }))
})
