// #914 design spike evidence. Two claims, both bounded and executable:
//
// 1. Checksum parity: the four hand-generated transforms are bit-identical
//    to their shipped bases in Fast float64 AND Precise 16.16, via the
//    emulator bench over committed fixtures. (The emulator is the checksum
//    guard, not the stopwatch — guide §9: it reads table/memo wins
//    backwards. The FPS verdicts live in issue914-transform-pairs.json,
//    measured paired on the pb32.)
//
// 2. Data consistency: the committed census artifact
//    (issue914-eligibility-census.json — the archived spike tool over the
//    101-Pattern catalogue; see the results doc's methodology section, tool
//    at commit feee49f1) agrees with the totals the results document and
//    the #914 decline rest on.
//
// Deliberately absent: no static analyzer runs here. The census tool is
// archived methodology, not tested infrastructure — the results doc
// explains the claim scope and why.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { benchDemo } from './benchCore'

const HERE = dirname(fileURLToPath(import.meta.url))
const PATTERNS_DIR = join(HERE, '../../src/pixelblaze/stock/patterns')
const LIB_DIR = join(HERE, '../../src/pixelblaze/lib')
const FIXTURES_DIR = join(HERE, 'fixtures/issue914')

function loadLibraries(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of readdirSync(LIB_DIR)) {
    if (file.endsWith('.js')) out[file.replace(/\.js$/, '')] = readFileSync(join(LIB_DIR, file), 'utf8')
  }
  return out
}

const LIBRARIES = loadLibraries()

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8')
}

function readStock(name: string): string {
  return readFileSync(join(PATTERNS_DIR, `${name}.js`), 'utf8')
}

describe('issue914 hand-generated transforms: checksum parity', () => {
  const CASES = [
    { base: 'CoronalMassEjection', transformed: 'CoronalMassEjection.memoized.js' },
    { base: 'TunnelOfSquares2D', transformed: 'TunnelOfSquares2D.memoized.js' },
    { base: 'IridescentFibers', transformed: 'IridescentFibers.tabled.js' },
    { base: 'ClockworkIris', transformed: 'ClockworkIris.memoized.js' },
  ] as const

  it.each(CASES)('$base matches its transformed output in both modes', ({ base, transformed }) => {
    const baseline = benchDemo(readStock(base), LIBRARIES, { frames: 20 })
    const candidate = benchDemo(readFixture(transformed), LIBRARIES, { frames: 20 })
    expect(candidate.fast.checksum).toBe(baseline.fast.checksum)
    expect(candidate.precise.checksum).toBe(baseline.precise.checksum)
  })
})

describe('issue914 committed evidence consistency', () => {
  it('census artifact totals match the documented decline basis', () => {
    const census = JSON.parse(readFileSync(join(HERE, 'issue914-eligibility-census.json'), 'utf8'))
    // The exact totals the results doc and the #914 decline cite. Editing the
    // census artifact or the doc's numbers requires updating both — this is
    // consistency between committed data and committed prose, nothing more.
    expect(census.totals).toEqual({
      patterns: 101,
      withAnySite: 36,
      indexTablingModule: 0,
      indexTablingFrame: 1,
      positionMemoExact: 0,
      positionMemoBelowBreakeven: 98,
      positionMemoInvalidation: 8,
      paletteSpecialization: 2,
      outsideScopeSubset: 18,
    })
    expect(census.rows).toHaveLength(101)
  })

  it('hardware pairs artifact carries the four measured verdicts', () => {
    const pairs = JSON.parse(readFileSync(join(HERE, 'issue914-transform-pairs.json'), 'utf8'))
    const byPattern = new Map<string, Record<string, { fps: { median: number } }>>()
    for (const row of pairs.rows) {
      const entry = byPattern.get(row.pattern) ?? {}
      entry[row.variant] = row
      byPattern.set(row.pattern, entry)
    }
    expect([...byPattern.keys()].sort()).toEqual([
      'ClockworkIris', 'CoronalMassEjection', 'IridescentFibers', 'TunnelOfSquares2D',
    ])
    // The signs the decline rests on: three memo transforms measured as
    // losses, the one tabling transform as a gain.
    for (const loser of ['CoronalMassEjection', 'TunnelOfSquares2D', 'ClockworkIris']) {
      const entry = byPattern.get(loser)!
      expect(entry.transformed.fps.median).toBeLessThan(entry.base.fps.median)
    }
    const tabled = byPattern.get('IridescentFibers')!
    expect(tabled.transformed.fps.median).toBeGreaterThan(tabled.base.fps.median)
  })
})
