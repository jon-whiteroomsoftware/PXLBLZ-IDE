import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const repoRoot = process.cwd()
const repoNodeModules = path.join(repoRoot, 'node_modules')
const repoNodeModulesReal = fs.realpathSync(repoNodeModules)
const playwrightPath = require.resolve('playwright')
const playwrightPathReal = fs.realpathSync(playwrightPath)
const playwrightPkg = require('playwright/package.json')
const playwrightCorePkgPath = require.resolve('playwright-core/package.json')
const browsersPath = path.join(path.dirname(playwrightCorePkgPath), 'browsers.json')
const browsers = JSON.parse(fs.readFileSync(browsersPath, 'utf8')).browsers

const chromium = browsers.find((browser) => browser.name === 'chromium')
const headlessShell = browsers.find((browser) => browser.name === 'chromium-headless-shell')

if (!playwrightPathReal.startsWith(`${repoNodeModulesReal}${path.sep}`)) {
  fail([
    'Playwright resolved outside this repository.',
    `resolved=${playwrightPath}`,
    `resolved real path=${playwrightPathReal}`,
    `expected real prefix=${repoNodeModulesReal}`,
    'Run this check from the repo with npm, not through a bundled app Node REPL.',
  ])
}

if (!chromium || !headlessShell) {
  fail(['Could not find chromium browser revisions in playwright-core/browsers.json.'])
}

const cacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0'
  ? process.env.PLAYWRIGHT_BROWSERS_PATH
  : defaultBrowserCacheRoot()

const expectedDirs = [
  `chromium-${chromium.revision}`,
  `chromium_headless_shell-${headlessShell.revision}`,
]

const missing = expectedDirs.filter((dir) => !fs.existsSync(path.join(cacheRoot, dir)))
if (missing.length > 0) {
  fail([
    'Playwright browser cache is missing required Chromium directories.',
    `playwright=${playwrightPkg.version}`,
    `cache=${cacheRoot}`,
    `missing=${missing.join(', ')}`,
    'Fix: npx playwright install chromium',
  ])
}

console.log(`OK playwright=${playwrightPkg.version}`)
console.log(`resolved=${playwrightPath}`)
console.log(`cache=${cacheRoot}`)
console.log(`chromium=${expectedDirs[0]}`)
console.log(`headless=${expectedDirs[1]}`)

function defaultBrowserCacheRoot() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright')
  }
  return path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'ms-playwright')
}

function fail(lines) {
  console.error(lines.join('\n'))
  process.exit(1)
}
