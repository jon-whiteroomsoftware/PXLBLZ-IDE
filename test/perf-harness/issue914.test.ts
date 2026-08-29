// #914 design spike: detection-rule recall/precision against the hand-proven
// ground truth, plus the eligible-site census across the stock catalogue.
//
// Recall: the rules must find the sites the hand pass actually tabled or
// memoized, using the pre-optimization sources preserved from git history
// (fixtures/issue914/*, provenance in each header). Precision: the shipped
// hand-optimized sources should show those same sites already consumed.
//
// Census JSON is written only under ISSUE914_CENSUS_OUT=1 (a date-free,
// deterministic report) so ordinary test runs never dirty the checkout.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { bundle } from '../../src/engine/bundle'
import { stripPatternManifest } from '../../src/engine/patternManifest'
import { inlineShowMemberHelpers } from '../../src/engine/showHelperInlining'
import { benchDemo } from './benchCore'
import { analyzeIssue914, type Issue914PatternReport } from './issue914'

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

/** The exact preparation the member-lowering pipeline applies before its
 * analysis passes run: bundle -> strip manifest -> tiny-helper inlining. */
function prepareMemberSource(source: string): string {
  const bundled = bundle(source, LIBRARIES).code
  const stripped = stripPatternManifest(bundled)
  return inlineShowMemberHelpers(stripped).source
}

function analyzePrepared(source: string): Issue914PatternReport {
  return analyzeIssue914(prepareMemberSource(source))
}

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8')
}

function readStock(name: string): string {
  return readFileSync(join(PATTERNS_DIR, `${name}.js`), 'utf8')
}

describe('issue914 detection rules', () => {
  it('Rule A recall: pre-optimization NeonSquircles exposes the hand-tabled ring sites', () => {
    const report = analyzePrepared(readFixture('NeonSquircles.preopt.js'))
    expect(report.parseError).toBeUndefined()
    const moduleSites = report.indexTabling.filter((site) => site.flavor === 'module-table')
    const frameSites = report.indexTabling.filter((site) => site.flavor === 'frame-table')
    // The hand pass moved the three colour cos terms into a module-scope table
    // and the anim (index+time) term into a beforeRender table.
    expect(moduleSites.length).toBeGreaterThanOrEqual(3)
    expect(moduleSites.some((site) => site.subtreeSource.includes('cos'))).toBe(true)
    expect(frameSites.length).toBeGreaterThanOrEqual(1)
    expect(report.indexTabling.every((site) => site.tripCount === 20)).toBe(true)
  })

  it('Rule B recall: pre-optimization Kishimisu exposes the hand-memoized exp site', () => {
    const report = analyzePrepared(readFixture('Kishimisu.preopt.js'))
    expect(report.parseError).toBeUndefined()
    const exact = report.positionMemo.filter((site) => site.kind === 'exact')
    expect(exact.some((site) => site.subtreeSource.includes('exp('))).toBe(true)
  })

  it('breakeven: single-atan2 sites price below the lazy read path (measured loss)', () => {
    // issue914-transform-pairs.json: memoizing atan2(y,x) measured -12.9%
    // (CoronalMassEjection) and -5.5% (TunnelOfSquares2D) median FPS — atan2
    // at 2.7x mul cannot beat the ~7x-mul read path. The detector must keep
    // these visible as below-breakeven, never offer them as exact sites.
    for (const name of ['CoronalMassEjection', 'TunnelOfSquares2D']) {
      const report = analyzePrepared(readStock(name))
      const atanSites = report.positionMemo.filter((site) => site.subtreeSource.includes('atan2'))
      expect(atanSites.length).toBeGreaterThanOrEqual(1)
      expect(atanSites.every((site) => site.kind === 'below-breakeven')).toBe(true)
    }
  })

  it('breakeven: op-chain sites past the total threshold are still not exact (measured loss)', () => {
    // ClockworkIris's band site (est 11.4x mul, clamp/frac/abs chain) measured
    // -7.3% median FPS memoized — an exact site must contain an exp/pow-class
    // call, not merely sum cheap ops past the threshold.
    const report = analyzePrepared(readStock('ClockworkIris'))
    const bandSites = report.positionMemo.filter((site) => site.subtreeSource.includes('frac((r - 0.05)'))
    expect(bandSites.length).toBeGreaterThanOrEqual(1)
    expect(bandSites.every((site) => site.kind === 'below-breakeven')).toBe(true)
  })

  it('precision: the shipped hand-optimized sources no longer offer those sites', () => {
    const squircles = analyzePrepared(readStock('NeonSquircles'))
    const kishimisu = analyzePrepared(readStock('Kishimisu'))
    expect(squircles.parseError).toBeUndefined()
    expect(kishimisu.parseError).toBeUndefined()
    // The shipped NeonSquircles reads its tables inside the ring loop; nothing
    // index-only remains to table. The shipped Kishimisu's lazy-fill arm still
    // contains exp(-len0), but the store-into-subscript idiom classifies it
    // already-cached, so a pass would not stack a second redundant cache.
    expect(squircles.indexTabling).toHaveLength(0)
    expect(kishimisu.positionMemo.filter((site) => site.kind === 'exact'
      && site.subtreeSource.includes('exp('))).toHaveLength(0)
    expect(kishimisu.positionMemo.filter((site) => site.kind === 'already-cached'
      && site.subtreeSource.includes('exp('))).toHaveLength(1)
  })
})

describe('issue914 hand-generated transforms: checksum parity', () => {
  // The emulator's job here is the checksum guard, not the stopwatch (§9: it
  // reads table/memo wins backwards). Equal per-mode checksums prove the
  // generated output is bit-identical in Fast float64 AND Precise 16.16.
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

describe('issue914 stock-catalogue census', () => {
  it('analyzes the full catalogue and reports eligible sites', () => {
    const names = readdirSync(PATTERNS_DIR)
      .filter((file) => file.endsWith('.js'))
      .map((file) => file.replace(/\.js$/, ''))
      .sort()
    expect(names.length).toBeGreaterThanOrEqual(95)

    const rows: Array<{
      name: string
      credit: string | null
      indexTablingModule: number
      indexTablingFrame: number
      positionMemoExact: number
      positionMemoBelowBreakeven: number
      positionMemoInvalidation: number
      paletteSpecialization: number
      maxMemoCostXMul: number
      parseError?: string
    }> = []
    for (const name of names) {
      const source = readStock(name)
      const creditMatch = source.match(/Credit:.*?by ([^\n-]+)/)
      let report: Issue914PatternReport
      try {
        report = analyzePrepared(source)
      } catch (error) {
        report = {
          indexTabling: [],
          positionMemo: [],
          paletteSpecialization: 0,
          parseError: error instanceof Error ? error.message : String(error),
        }
      }
      rows.push({
        name,
        credit: creditMatch ? creditMatch[1].trim() : null,
        indexTablingModule: report.indexTabling.filter((site) => site.flavor === 'module-table').length,
        indexTablingFrame: report.indexTabling.filter((site) => site.flavor === 'frame-table').length,
        positionMemoExact: report.positionMemo.filter((site) => site.kind === 'exact').length,
        positionMemoBelowBreakeven: report.positionMemo.filter((site) => site.kind === 'below-breakeven').length,
        positionMemoInvalidation: report.positionMemo.filter((site) => site.kind === 'needs-invalidation').length,
        paletteSpecialization: report.paletteSpecialization,
        maxMemoCostXMul: report.positionMemo.reduce((max, site) => Math.max(max, site.estCostXMul), 0),
        parseError: report.parseError,
      })
    }

    // Coverage invariants: the census is only meaningful if analysis actually
    // ran across the catalogue. Bundling/parse failures must stay rare and
    // visible, not silently zero the counts.
    const failed = rows.filter((row) => row.parseError !== undefined)
    expect(failed.map((row) => `${row.name}: ${row.parseError}`)).toEqual([])

    const totals = {
      patterns: rows.length,
      withAnySite: rows.filter((row) => row.indexTablingModule + row.indexTablingFrame
        + row.positionMemoExact + row.positionMemoBelowBreakeven + row.positionMemoInvalidation > 0).length,
      indexTablingModule: rows.reduce((sum, row) => sum + row.indexTablingModule, 0),
      indexTablingFrame: rows.reduce((sum, row) => sum + row.indexTablingFrame, 0),
      positionMemoExact: rows.reduce((sum, row) => sum + row.positionMemoExact, 0),
      positionMemoBelowBreakeven: rows.reduce((sum, row) => sum + row.positionMemoBelowBreakeven, 0),
      positionMemoInvalidation: rows.reduce((sum, row) => sum + row.positionMemoInvalidation, 0),
      paletteSpecialization: rows.reduce((sum, row) => sum + row.paletteSpecialization, 0),
    }

    // Population invariants first, so the zero below cannot be vacuous: the
    // analysis must actually find the candidate tail across the catalogue.
    expect(totals.withAnySite).toBeGreaterThanOrEqual(30)
    expect(totals.positionMemoBelowBreakeven).toBeGreaterThanOrEqual(50)
    // Living falsifier for the #914 decline: under the measured gates
    // (subtree >= 10x mul AND an exp/pow-class call AND position-stable AND
    // index in scope), the stock catalogue has ZERO exact memo sites and one
    // frame-table site. A new stock Pattern that breaks either zero fails
    // here with the evidence already collected — that, and only that,
    // reopens the build question.
    expect(totals.positionMemoExact).toBe(0)
    expect(totals.indexTablingModule).toBe(0)
    expect(totals.indexTablingFrame).toBe(1)

    if (process.env.ISSUE914_CENSUS_OUT === '1') {
      writeFileSync(
        join(HERE, 'issue914-eligibility-census.json'),
        `${JSON.stringify({ totals, rows }, null, 2)}\n`,
      )
    }

    // eslint-disable-next-line no-console
    console.log('[issue914] census totals:', JSON.stringify(totals))
  })
})
