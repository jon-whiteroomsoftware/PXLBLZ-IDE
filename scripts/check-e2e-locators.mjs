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
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const allowlistPath = join(repositoryRoot, 'e2e', 'known-stale-locators.json')

// Live source only. Prototypes are design studies and unit tests carry their own
// fixtures, so neither proves a string still reaches a user.
export function liveSourceText(root = repositoryRoot) {
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
  walk(join(root, 'src'))
  return chunks.join('\n')
}

const LOCATOR_PATTERNS = [
  /getByRole\(\s*'[a-z]+'\s*,\s*\{\s*name:\s*'([^']+)'/g,
  /getByLabel\(\s*'([^']+)'/g,
  /getByTitle\(\s*'([^']+)'/g,
  /getByPlaceholder\(\s*'([^']+)'/g,
]

export function specLocators(root = repositoryRoot) {
  const found = new Map()
  const directory = join(root, 'e2e')
  for (const entry of readdirSync(directory).filter((name) => name.endsWith('.spec.ts')).sort()) {
    const text = readFileSync(join(directory, entry), 'utf8')
    for (const pattern of LOCATOR_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        const name = match[1]
        if (name.includes('${') || name.length < 6) continue
        if (!found.has(name)) found.set(name, entry)
      }
    }
  }
  return found
}

// Interpolation can sit anywhere in a label, and this codebase's dominant shape
// is `Verb ${x} Noun` — `Edit ${kind} Transition between ${a} and ${b}`,
// `Use ${item.label} Transition`, `${layout.name} routing mode`. An earlier
// prefix-only rule required a six-character literal immediately before the first
// interpolation, so it reported all of those as stale and froze them into the
// allowlist, leaving the check blind to the very renames it exists to catch.
const TEMPLATE_PATTERNS = [
  /`([^`\\]*\$\{[^`]*)`/g,
  /aria-?[Ll]abel=\{`([^`]*)`\}/g,
]

// `${collapsed ? 'Expand' : 'Collapse'} zone ${name}` is a common idiom here,
// and its only unconditionally static word is "zone". Treat quoted literals
// inside an interpolation as static alternatives so the branch text counts
// toward coverage; otherwise every such label looks unverifiable.
const DYNAMIC = '\u0000'

function expandAlternatives(raw) {
  const parts = raw.split(/(\$\{[^}]*\})/)
  let variants = ['']
  for (const part of parts) {
    if (!part.startsWith('${')) {
      variants = variants.map((variant) => variant + part)
      continue
    }
    const literals = [...part.matchAll(/['"]([^'"]{2,})['"]/g)].map((match) => match[1])
    const options = literals.length > 0 && literals.length <= 4 ? literals : [DYNAMIC]
    if (variants.length * options.length > 16) {
      variants = variants.map((variant) => variant + DYNAMIC)
      continue
    }
    variants = variants.flatMap((variant) => options.map((option) => variant + option))
  }
  return variants
}

export function sourceTemplates(source) {
  const templates = []
  for (const pattern of TEMPLATE_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const raw = match[1]
      if (!raw.includes('${')) continue
      for (const variant of expandAlternatives(raw)) {
        const segments = variant.split(DYNAMIC).map((segment) => segment.trim()).filter(Boolean)
        if (segments.length === 0) continue
        templates.push({
          segments,
          startsStatic: !variant.startsWith(DYNAMIC),
          endsStatic: !variant.endsWith(DYNAMIC),
        })
      }
    }
  }
  return templates
}

// Segments alone are far too weak once hundreds of templates are in play: a
// template as thin as `Scene ${n}` would bless anything containing "Scene". Also
// honour the template's own anchoring, so extra words cannot be smuggled onto
// either end, and require the static text to carry a real share of the name.
const MINIMUM_STATIC_COVERAGE = 0.35

// Returns 'produced' when the static text carries enough of the name to be
// meaningful, 'weak' when the shape fits but the name is mostly runtime data
// (`Select ${clip.patternName}` can yield anything), or false when it does not
// fit at all.
export function matchesTemplate(name, { segments, startsStatic, endsStatic }) {
  if (!segments.some((segment) => segment.length >= 4)) return false
  let cursor = 0
  let covered = 0
  for (const [index, segment] of segments.entries()) {
    const at = name.indexOf(segment, cursor)
    if (at === -1) return false
    if (index === 0 && startsStatic && at !== 0) return false
    covered += segment.length
    cursor = at + segment.length
  }
  if (endsStatic && cursor !== name.length) return false
  return covered / name.length >= MINIMUM_STATIC_COVERAGE ? 'produced' : 'weak'
}

export function sourceProduces(name, source, templates = sourceTemplates(source)) {
  return classify(name, source, templates) === 'produced'
}

// Three outcomes, not two. A name built mostly from runtime data cannot be
// confirmed or refuted statically, and filing it as "stale" is what made the
// ratchet meaningless: no spec change and no source change could ever repair it,
// so it buried the genuinely broken names it was meant to surface.
export function classify(name, source, templates = sourceTemplates(source)) {
  if (source.includes(name)) return 'produced'
  let best = 'stale'
  for (const template of templates) {
    const outcome = matchesTemplate(name, template)
    if (outcome === 'produced') return 'produced'
    if (outcome === 'weak') best = 'unverifiable'
  }
  return best
}

export function auditLocators(root = repositoryRoot) {
  const source = liveSourceText(root)
  const templates = sourceTemplates(source)
  const stale = []
  const unverifiable = []
  for (const [name, spec] of specLocators(root)) {
    const outcome = classify(name, source, templates)
    if (outcome === 'stale') stale.push({ name, spec })
    else if (outcome === 'unverifiable') unverifiable.push({ name, spec })
  }
  const byName = (a, b) => a.name.localeCompare(b.name)
  return { stale: stale.sort(byName), unverifiable: unverifiable.sort(byName) }
}

function main() {
  const record = process.argv.includes('--record')
  const { stale, unverifiable } = auditLocators()

  if (record) {
    const payload = {
      comment: 'Ratchet for scripts/check-e2e-locators.mjs (#638). "stale" names are produced nowhere in live src and must shrink to zero. "unverifiable" names are assembled mostly from runtime data (`Select ${clip.patternName}`); no spec edit can repair them, so they are recorded separately and never gate.',
      stale,
      unverifiable,
    }
    writeFileSync(allowlistPath, `${JSON.stringify(payload, null, 2)}\n`)
    console.log(`Recorded ${stale.length} stale and ${unverifiable.length} unverifiable locators to ${relative(repositoryRoot, allowlistPath)}.`)
    return 0
  }

  let allowed
  try {
    allowed = new Set(JSON.parse(readFileSync(allowlistPath, 'utf8')).stale.map((entry) => entry.name))
  } catch {
    console.error(`Missing or unreadable ${relative(repositoryRoot, allowlistPath)}. Run: npm run check:e2e-locators -- --record`)
    return 1
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
`)
    return 1
  }

  if (repaired.length > 0) {
    console.log(`${repaired.length} allowlisted locator(s) now resolve. Tighten the ratchet:`)
    for (const name of repaired.slice(0, 10)) console.log(`  ${JSON.stringify(name)}`)
    console.log('  npm run check:e2e-locators -- --record')
    return 1
  }

  console.log(`No new stale e2e locators (${allowed.size} known stale, ${unverifiable.length} unverifiable).`)
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main())
}
