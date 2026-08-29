import { parse } from 'acorn'
import { HOLD_FACTORS, applySpatialHold, buildHoldBaseArtifact } from './issue913'

describe('spatial sample-and-hold transform (#913 spike)', () => {
  it('routes every paint site through the latch and gates the dispatcher on the anchor stride', () => {
    const artifact = buildHoldBaseArtifact()
    const originalPaintSites = [...artifact.code.matchAll(/\brgb\(/g)].length
    for (const k of HOLD_FACTORS) {
      const held = applySpatialHold(artifact.code, k)
      expect(held.paintSites).toBe(originalPaintSites)
      expect(held.code).toContain(`index % ${k} != 0`)
      // Total latch coverage (the first review's P1): the ONLY raw rgb(...)
      // calls left are the gate's replay and the helper's own paint — every
      // original site, including the crossfade blend and the out-of-range
      // fallback, now latches through __pxlblz_hold_emit.
      const rawPaints = [...held.code.matchAll(/\brgb\(/g)].length
      expect(rawPaints).toBe(2)
      const latchedPaints = [...held.code.matchAll(/__pxlblz_hold_emit\(/g)].length
      expect(latchedPaints).toBe(originalPaintSites + 1) // sites + helper declaration
      expect(() => parse(held.code, { ecmaVersion: 2020, sourceType: 'module' })).not.toThrow()
    }
  })

  it('latches the crossfade arm, not only the shared emit wrappers', () => {
    const artifact = buildHoldBaseArtifact()
    const held = applySpatialHold(artifact.code, 4)
    // The crossfade paints a blended color through a direct multi-line call;
    // after the transform that call site must be the latch helper.
    const crossfadeBlend = /__pxlblz_hold_emit\(\n\s+\w+ \* \(1 - __pxlblz_\w+\)/
    expect(held.code).toMatch(crossfadeBlend)
    // The black fallback latches too: a held pixel after an out-of-range
    // anchor replays black rather than a stale color.
    expect(held.code).toContain('__pxlblz_hold_emit(0, 0, 0)')
  })
})
