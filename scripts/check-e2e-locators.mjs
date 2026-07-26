#!/usr/bin/env node
// Fail when an e2e spec names a user-facing string that live source no longer
// produces.
//
// The 2.0 UX overhaul renamed affordances and the specs were updated only where
// someone happened to be looking: New show was fixed in two helpers but not four
// inline call sites, the transition selector in one call site but not eight, the
// pan slider but not the zoom slider on the line above it. Nothing objected,
// because nothing ran these specs. This closes that gap statically, in the
// commit that makes the change, instead of weeks later. See #638.
//
// Ratchet, not a wall: strings already known to be stale live in the allowlist
// beside this script. New staleness fails; fixing staleness requires shrinking
// the allowlist. It never silently grows.
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const repositoryRoot = new URL('..', import.meta.url).pathname
const allowlistPath = join(repositoryRoot, 'e2e', 'known-stale-locators.json')
const record = process.argv.includes('--record')

// Live source only. Prototypes are design studies and unit tests carry their own
// fixtures, so neither proves a string still reaches a user.
function liveSourceText() {
  const chunks = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry)
      if (statSync(path).isDirectory()) { walk(path); continue }
      if (!/\.(ts|tsx)$/.test(entry)) continue
      if (/Prototype/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) continue
      chunks.push(readFileSync(path, 'utf8'))
    }
  }
  walk(join(repositoryRoot, 'src'))
  return chunks.join('\n')
}

const LOCATOR_PATTERNS = [
  /getByRole\(\s*'[a-z]+'\s*,\s*\{\s*name:\s*'([^']+)'/g,
  /getByLabel\(\s*'([^']+)'/g,
  /getByTitle\(\s*'([^']+)'/g,
  /getByPlaceholder\(\s*'([^']+)'/g,
]

function specLocators() {
  const found = new Map()
  const directory = join(repositoryRoot, 'e2e')
  for (const entry of readdirSync(directory).filter((name) => name.endsWith('.spec.ts')).sort()) {
    const text = readFileSync(join(directory, entry), 'utf8')
    for (const pattern of LOCATOR_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        const name = match[1]
        // Template-interpolated and trivially short names cannot be checked literally.
        if (name.includes('${') || name.length < 6) continue
        if (!found.has(name)) found.set(name, entry)
      }
    }
  }
  return found
}

// A name may be assembled from a template such as `Collapse zone ${zone.name}`,
// so an exact miss is not proof. Accept a surviving prefix only where source
// interpolates directly after it. Accepting any surviving prefix is far too
// weak: "Add show" survives as a complete literal, which would silently bless
// an invented "Add show menu trigger".
function sourceProduces(name, source) {
  if (source.includes(name)) return true
  const words = name.split(' ')
  for (let index = words.length - 1; index > 0; index -= 1) {
    const prefix = words.slice(0, index).join(' ')
    if (prefix.length < 6) continue
    if (source.includes(`${prefix}${'${'}`) || source.includes(`${prefix} ${'${'}`)) return true
  }
  return false
}

const source = liveSourceText()
const stale = [...specLocators()]
  .filter(([name]) => !sourceProduces(name, source))
  .map(([name, spec]) => ({ name, spec }))

if (record) {
  const payload = {
    comment: 'Locators in e2e specs that live src no longer produces. Ratchet for scripts/check-e2e-locators.mjs (#638). Shrink this list; never grow it.',
    stale: stale.map(({ name, spec }) => ({ name, spec })).sort((a, b) => a.name.localeCompare(b.name)),
  }
  writeFileSync(allowlistPath, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`Recorded ${stale.length} known-stale locators to ${relative(repositoryRoot, allowlistPath)}.`)
  process.exit(0)
}

let allowed = new Set()
try {
  allowed = new Set(JSON.parse(readFileSync(allowlistPath, 'utf8')).stale.map((entry) => entry.name))
} catch {
  console.error(`Missing or unreadable ${relative(repositoryRoot, allowlistPath)}. Run: npm run check:e2e-locators -- --record`)
  process.exit(1)
}

const introduced = stale.filter(({ name }) => !allowed.has(name))
const staleNames = new Set(stale.map(({ name }) => name))
const repaired = [...allowed].filter((name) => !staleNames.has(name))

if (introduced.length > 0) {
  console.error('\nE2E locators that live source no longer produces:\n')
  for (const { name, spec } of introduced) console.error(`  ${JSON.stringify(name)}  (e2e/${spec})`)
  console.error(`
If you renamed or removed this affordance, update the specs in the same commit.
That is the failure this check exists to prevent: the 2.0 rename pass updated
some call sites and left others, and no gate ran these specs to notice.

If the name is assembled in a way this check cannot see, record it:
  npm run check:e2e-locators -- --record
`)
  process.exit(1)
}

if (repaired.length > 0) {
  console.log(`${repaired.length} allowlisted locator(s) now resolve. Tighten the ratchet:`)
  for (const name of repaired.slice(0, 10)) console.log(`  ${JSON.stringify(name)}`)
  console.log('  npm run check:e2e-locators -- --record')
  process.exit(1)
}

console.log(`No new stale e2e locators (${allowed.size} known, tracked in #638).`)
