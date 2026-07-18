import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { compileShow, type ShowRecipe } from '../../src/engine/showCompiler'
import {
  attributeShowFrameTime,
  buildShowAttributionArtifacts,
} from './showAttribution'

const pixelCount = 20
const zones = [
  { id: 'left', name: 'left', ranges: [{ start: 0, end: 9 }] },
  { id: 'right', name: 'right', ranges: [{ start: 10, end: 19 }] },
]
const source = `
export var phase = 0
export function beforeRender(delta) { phase = phase + delta / 1000 }
export function sliderSpeed(value) { phase = value }
export function render(index) {
  var x = index / pixelCount
  var pulse = sin((x + phase) * 6.28318)
  rgb(pulse * pulse, x, 0.25)
}
`
const placements = zones.map((zone) => ({
  placementId: `placement-${zone.id}`,
  zoneName: zone.name,
  clipId: 'field',
}))
const recipe: ShowRecipe = {
  masterPixelCount: pixelCount,
  clips: [{ id: 'field', source, controlTargets: { sliderSpeed: 0.25 } }],
  zones,
  routingLayouts: [{ id: 'stage', name: 'stage', zones }],
  routedSceneSequence: {
    scenes: [
      { holdMs: 5_000, placements, transitionOut: { kind: 'cut', durationMs: 0 } },
      { holdMs: 5_000, placements },
    ],
  },
  loopDurationMs: 10_000,
}

describe('Show Controller attribution artifacts (#531)', () => {
  it('builds explicit diagnostic rungs without changing ordinary compilation', () => {
    const ordinary = compileShow(recipe, {}, { patternOutputReuse: false })
    const result = buildShowAttributionArtifacts({
      recipe,
      libraries: {},
      compileOptions: { patternOutputReuse: false },
      captureElision: {
        eligible: true,
        reason: 'one render-pure member per routed pixel with no output Effects',
      },
    })

    expect(result.full.code).toBe(ordinary.code)
    expect(result.full.expandedCode).toBe(ordinary.expandedCode)
    expect(result.trivialOutput.code).toContain('rgb(0.125, 0.25, 0.5)')
    expect(result.constantMembers.code).not.toContain('sin(')
    expect(result.constantMembers.expandedCode).toContain('sliderSpeed')
    expect(result.captureElided).toMatchObject({
      kind: 'capture-elided',
      exactBoundary: 'constant-members',
    })
    expect(result.captureElided?.expandedCode).toContain('rgb(r, g, b)')
    expect(result.captureElided?.expandedCode).toMatch(/function __pxlblz_show_c0_emit\(\) \{ \}/)
    expect(result.captureElided?.persistentGlobals).toBe(result.constantMembers.persistentGlobals)
    expect(result.full.vmWords).toBe(ordinary.summary.resources.totalWords)
  })

  it.each(['fast', 'fidelity'] as const)(
    'keeps the constant-member capture-elision boundary exact in %s mode',
    (fidelity) => {
      const result = buildShowAttributionArtifacts({
        recipe,
        libraries: {},
        compileOptions: { patternOutputReuse: false },
        captureElision: { eligible: true, reason: 'test fixture' },
      })
      const mapPoints = Array.from({ length: pixelCount }, (_, index) => [index / (pixelCount - 1)])
      const checksum = (artifact: typeof result.constantMembers) => createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: 1,
      }, { mapPoints, randomSeed: 531, fidelity }).advanceTo(2_500, { stepMs: 50 }).checksum

      expect(result.captureElided).not.toBeNull()
      expect(checksum(result.captureElided!)).toBe(checksum(result.constantMembers))
    },
  )

  it('leaves an explicit unresolved Show-overhead residual when capture cannot be isolated', () => {
    const report = attributeShowFrameTime({
      trivialOutput: { meanFps: 50, medianFps: 50 },
      constantMembers: { meanFps: 100 / 3, medianFps: 100 / 3 },
      full: { meanFps: 25, medianFps: 25 },
    })

    expect(report.median).toEqual({
      outputFloorMs: 20,
      routingCompositionMs: null,
      captureReplayMs: null,
      unresolvedShowOverheadMs: 10,
      patternEvaluationMs: 10,
      fullFrameMs: 40,
    })
  })

  it('attributes a semantically valid capture-elided rung and reports pairwise frame deltas', () => {
    const report = attributeShowFrameTime({
      trivialOutput: { meanFps: 50, medianFps: 50 },
      captureElided: { meanFps: 40, medianFps: 40 },
      constantMembers: { meanFps: 100 / 3, medianFps: 100 / 3 },
      full: { meanFps: 25, medianFps: 25 },
    })

    expect(report.median).toEqual({
      outputFloorMs: 20,
      routingCompositionMs: 5,
      captureReplayMs: 5,
      unresolvedShowOverheadMs: 0,
      patternEvaluationMs: 10,
      fullFrameMs: 40,
    })
    expect(report.pairwiseMedianMs).toEqual([
      { from: 'trivial-output', to: 'capture-elided', deltaMs: 5 },
      { from: 'capture-elided', to: 'constant-members', deltaMs: 5 },
      { from: 'constant-members', to: 'full', deltaMs: 10 },
    ])
  })
})
