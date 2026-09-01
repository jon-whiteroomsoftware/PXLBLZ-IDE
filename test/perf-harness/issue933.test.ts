// #933: display-exact tier census for the integer-pow lowering.
//
// Two oracles. (1) Stock Pattern census: every stock Pattern is run through
// the pass on its bundled source and its sites classified; the eligible set
// is pinned so a catalogue change that adds or removes a lowerable site is
// a visible decision, not drift. (2) Stock Show catalogue: compiling with
// `memberPowLowering: true` changes only the artifacts whose members carry
// eligible sites, and each changed artifact is display-exact against the
// exact one in both modes (max 8-bit channel delta 0 over the window).
import { describe, expect, it } from 'vitest'
import { bundle } from '../../src/engine/bundle'
import { compileShowForArtifact } from '../../src/engine/showPreviewArtifact'
import { lowerShowMemberPow } from '../../src/engine/showMemberPowLowering'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'
import { qualifyDisplayExact } from './benchCore'
import { issue933Candidates } from './issue933'

describe('integer-pow lowering census (#933)', () => {
  it('classifies every pow site in the stock Patterns; the eligible set is pinned', () => {
    const census: Record<string, { rewritten: number; skipped: string[] }> = {}
    for (const [name, source] of Object.entries(DEMOS)) {
      if (!/\bpow\s*\(/.test(source)) continue
      const bundled = bundle(source, LIBRARIES).code
      const result = lowerShowMemberPow(bundled)
      census[name] = { rewritten: result.rewrittenSites, skipped: result.skipped.map((entry) => entry.reason) }
    }
    const eligible = Object.entries(census).filter(([, entry]) => entry.rewritten > 0).map(([name]) => name).sort()
    // Oasis: the once-at-activation gamma table `pow(wave(...), 4)`. Every
    // other stock site is non-integer (Caustics 1.3, WavyBands 1.25, Orrery3D
    // 1.5, RealWorldLights negative), above k = 4 (IridescentFibers 8 already
    // hand-expanded, PendulumWave 8, ShoalScatter3D 6), a per-frame table
    // fill with a variable exponent (ZippyZaps `pow(a, i)` in beforeRender),
    // or an unbounded name. No stock per-pixel site exists.
    expect(eligible).toEqual(['Oasis'])
    expect(Object.keys(census).length).toBeGreaterThanOrEqual(12)
  })

  const compileStock = (item: (typeof STOCK_SHOWS)[number], memberPowLowering?: boolean) => {
    const compiled = compileShowForArtifact(item.show, [], undefined, LIBRARIES, { stageDimension: 2, ...(memberPowLowering === undefined ? {} : { memberPowLowering }) })
    if (!compiled.artifact) throw new Error(`${item.id}: ${compiled.error}`)
    return compiled.artifact
  }

  it('leaves every stock Show artifact byte-identical with the option off (the default)', () => {
    for (const item of STOCK_SHOWS) {
      const exact = compileStock(item)
      const explicit = compileStock(item, false)
      expect(explicit.code).toBe(exact.code)
      expect(exact.summary.specializations.powLowering).toEqual({ selected: false, reason: 'disabled', rewrittenSites: 0, hoistedTemps: 0, skippedSites: 0 })
    }
  }, 300_000)

  it('changes only artifacts with eligible member sites, and each is display-exact in both modes', () => {
    const changed: string[] = []
    for (const item of STOCK_SHOWS) {
      const exact = compileStock(item)
      const lowered = compileStock(item, true)
      const summary = lowered.summary.specializations.powLowering
      expect(summary.selected).toBe(true)
      if (summary.rewrittenSites === 0) {
        expect(lowered.code).toBe(exact.code)
        continue
      }
      changed.push(item.id)
      expect(lowered.code).not.toBe(exact.code)
      const verdict = qualifyDisplayExact(exact.code, lowered.code, {}, { frames: 12, warmup: 1 })
      expect(verdict.displayExact, `${item.id}: fast max ${verdict.fast.max}, precise max ${verdict.precise.max}`).toBe(true)
    }
    // No stock Show carries Oasis as a member today; the pinned list makes
    // any future member change a visible decision.
    expect(changed).toEqual([])
  }, 300_000)

  it('lowers six sites of the hardware fixture: checksum-exact in Fast, one 16.16 LSB short of display-exact in Precise', () => {
    const candidates = issue933Candidates()
    expect(candidates.rewrittenSites).toBe(6)
    expect(candidates.hoistedTemps).toBe(5)
    expect(candidates.skipped).toEqual([])
    const verdict = qualifyDisplayExact(candidates.exact, candidates.lowered, {}, { frames: 12, warmup: 1, grid: { rows: 16, cols: 16 } })
    // Pinned verdict, not a wish: Fast float64 pow and the chain agree to
    // the checksum; the Precise emulator's pow differs from the chain by one
    // 16.16 LSB on the k = 3 / k = 4 sites, which lands on an 8-bit edge in
    // a handful of channels (max delta 1, changed fraction rounds to 0%).
    // The bench firmware matched the chain on every positive-base sample
    // (show-runtime-costs.md round five), so this is the emulator's Precise
    // pow fidelity bounding the tier, recorded in the results doc.
    expect(verdict.fast.max).toBe(0)
    expect(verdict.fast.base.checksum).toBe(verdict.fast.candidate.checksum)
    expect(verdict.precise.max).toBe(1)
    expect(verdict.precise.changedPct).toBeLessThan(0.0005)
    expect(verdict.tier).toBe('lossy')
  })
})
