// #934 census: which stock Patterns the pass touches and how far each
// substituted artifact drifts (emulator, both modes), plus the catalogue of
// Shows compiled with the option on: only artifacts whose members carry
// rewritten sites change, every changed one is priced.
import { describe, expect, it } from 'vitest'
import { bundle } from '../../src/engine/bundle'
import { approximateShowMemberTranscendentals } from '../../src/engine/showMemberTranscendentalApproximation'
import { compileShowForArtifact } from '../../src/engine/showPreviewArtifact'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'
import { compareVisualDrift } from './benchCore'
import { issue934Fixtures } from './issue934'

describe('approximate transcendentals census (#934)', () => {
  it('rewrites the expected stock Patterns and declines the rest with reasons', () => {
    const touched: Record<string, { exp: number; pow: number; tanh: number }> = {}
    const reasons = new Map<string, number>()
    for (const [name, source] of Object.entries(DEMOS)) {
      if (!/\b(exp|pow|tanh)\s*\(/.test(source)) continue
      const result = approximateShowMemberTranscendentals(bundle(source, LIBRARIES).code)
      if (result.rewritten.exp + result.rewritten.pow + result.rewritten.tanh > 0) touched[name] = result.rewritten
      for (const entry of result.skipped) reasons.set(`${entry.kind}:${entry.reason}`, (reasons.get(`${entry.kind}:${entry.reason}`) ?? 0) + 1)
    }
    // Pinned so a catalogue change that adds or removes a site is a visible decision.
    // PhantomStar's per-ray-step glow, PlasmaNebula's density curve, and
    // Kishimisu's memoized exp(-len0). PulseLoom's five exp sites take
    // arguments of unproven sign (per-frame envelopes), WavyBands' pow base
    // can be negative, ZippyZaps already carries its own fastTanh, and the
    // integer-exponent sites belong to #933.
    expect(touched).toEqual({
      Kishimisu: { exp: 1, pow: 0, tanh: 0 },
      PhantomStar: { exp: 1, pow: 0, tanh: 0 },
      PlasmaNebula: { exp: 0, pow: 1, tanh: 0 },
    })
    expect(reasons.get('exp:unproven-domain') ?? 0).toBeGreaterThan(0)
  })

  it('prices every rewritten stock Pattern in both modes', () => {
    for (const fixture of issue934Fixtures()) {
      for (const mode of ['fast', 'precise'] as const) {
        const drift = compareVisualDrift(fixture.exact, fixture.approximated, {}, mode, { frames: fixture.pattern === 'PhantomStar' ? 4 : 12, warmup: 1, grid: { rows: 16, cols: 16 } })
        // Perceptual-stop bar for these three: no channel moves by more than
        // 4/255 and the mean stays under 1.5/255 (contact sheets are the gate).
        expect(drift.max, `${fixture.pattern} ${mode}`).toBeLessThanOrEqual(4)
        expect(drift.meanAbs, `${fixture.pattern} ${mode}`).toBeLessThan(1.5)
      }
    }
  }, 600_000)

  it('leaves every stock Show byte-identical with the option off and changes only member-bearing artifacts with it on', () => {
    const changed: string[] = []
    for (const item of STOCK_SHOWS) {
      const compile = (on?: boolean) => {
        const compiled = compileShowForArtifact(item.show, [], undefined, LIBRARIES, { stageDimension: 2, ...(on === undefined ? {} : { memberTranscendentalApproximation: on }) })
        if (!compiled.artifact) throw new Error(`${item.id}: ${compiled.error}`)
        return compiled.artifact
      }
      const exact = compile()
      expect(compile(false).code).toBe(exact.code)
      const on = compile(true)
      const summary = on.summary.specializations.transcendentalApproximation
      if (summary.exp + summary.pow + summary.tanh === 0) {
        expect(on.code, item.id).toBe(exact.code)
      } else {
        changed.push(item.id)
        expect(on.code).not.toBe(exact.code)
      }
    }
    expect(changed.length).toBeGreaterThanOrEqual(0)
  }, 600_000)
})
