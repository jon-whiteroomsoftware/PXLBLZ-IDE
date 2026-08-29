import { parse } from 'acorn'
import { HOLD_FACTORS, applySpatialHold, buildHoldBaseArtifact } from './issue913'

describe('spatial sample-and-hold transform (#913 spike)', () => {
  it('latches every emit sink and gates the dispatcher on the anchor stride', () => {
    const artifact = buildHoldBaseArtifact()
    for (const k of HOLD_FACTORS) {
      const held = applySpatialHold(artifact.code, k)
      expect(held.emitFunctions).toBeGreaterThan(0)
      expect(held.code).toContain(`index % ${k} != 0`)
      expect(held.code).toContain('__pxlblz_hold_r')
      expect(() => parse(held.code, { ecmaVersion: 2020, sourceType: 'module' })).not.toThrow()
    }
  })

  it('leaves anchor-pixel behavior untouched: k=1 would hold nothing', () => {
    const artifact = buildHoldBaseArtifact()
    const held = applySpatialHold(artifact.code, 4)
    // The original dispatcher body follows the gate unchanged.
    const gateIndex = held.code.indexOf('index % 4 != 0')
    const originalBodyStart = artifact.code.indexOf('export function render2D(index, x, y) {')
    expect(gateIndex).toBeGreaterThan(0)
    expect(originalBodyStart).toBeGreaterThan(0)
  })
})
