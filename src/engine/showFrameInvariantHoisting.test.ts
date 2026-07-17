import {
  analyzeShowFrameInvariantCandidates,
  applyShowFrameInvariantHoists,
  selectShowFrameInvariantHoists,
} from './showFrameInvariantHoisting'

const SOURCE = `
export var amount = 0.5
export function sliderAmount(v) { amount = v }
var energy = 0
var renderAccumulator = 0
export function beforeRender(delta) { energy = delta / 1000 + amount }
function field(x) {
  var density = 4 + floor(energy * 10)
  var controlled = 2 + amount * 3
  var sampled = density + x * 4
  var changing = renderAccumulator + 1
  var unstable = random(1)
  return sampled + changing + unstable + controlled
}
export function render2D(index, x, y) {
  renderAccumulator = renderAccumulator + 1
  var punctuation = energy > 0.5 && amount > 0.2
  var indexed = index % 2
  var zoned = pixelCount > 500
  rgb(field(x) + indexed, y, punctuation + zoned)
}
`

describe('Show frame-invariant hoisting', () => {
  it('classifies only pure frame, control, and stable private-state expressions as candidates', () => {
    const candidates = analyzeShowFrameInvariantCandidates(SOURCE)

    expect(candidates.map((candidate) => candidate.binding)).toEqual([
      'density',
      'controlled',
      'punctuation',
    ])
    expect(candidates.find((candidate) => candidate.binding === 'density')?.dependencies).toEqual(['frame'])
    expect(candidates.find((candidate) => candidate.binding === 'controlled')?.dependencies).toEqual(['control'])
    expect(candidates.find((candidate) => candidate.binding === 'punctuation')?.dependencies)
      .toEqual(['control', 'frame'])
  })

  it('rejects candidates when byte headroom or avoided-work thresholds do not clear', () => {
    const candidates = analyzeShowFrameInvariantCandidates(SOURCE)
    const noHeadroom = selectShowFrameInvariantHoists(candidates, {
      pixelCount: 2_000,
      currentArtifactBytes: 900,
      artifactBudgetBytes: 900,
      maxAddedBytes: 256,
      minimumAvoidedOperationsPerFrame: 1,
    })
    const tooLittleWork = selectShowFrameInvariantHoists(candidates, {
      pixelCount: 1,
      currentArtifactBytes: 100,
      artifactBudgetBytes: 10_000,
      maxAddedBytes: 256,
      minimumAvoidedOperationsPerFrame: 1,
    })

    expect(noHeadroom.selected).toEqual([])
    expect(noHeadroom.reason).toBe('artifact-budget')
    expect(tooLittleWork.selected).toEqual([])
    expect(tooLittleWork.reason).toBe('benefit-threshold')
  })

  it('replaces selected initializers and emits one frame update function', () => {
    const candidates = analyzeShowFrameInvariantCandidates(SOURCE)
    const plan = selectShowFrameInvariantHoists(candidates, {
      pixelCount: 2_000,
      currentArtifactBytes: SOURCE.length,
      artifactBudgetBytes: 68_384,
      maxAddedBytes: 512,
      minimumAvoidedOperationsPerFrame: 100,
    })
    const transformed = applyShowFrameInvariantHoists(SOURCE, plan.selected)

    expect(plan.selected).toHaveLength(3)
    expect(transformed.updateFunctionName).toBe('__pxlblz_frame_update')
    expect(transformed.source).toContain('var density = __pxlblz_frame_value_0')
    expect(transformed.source).toContain('var __pxlblz_frame_value_0 = 4 + floor(energy * 10)')
    expect(transformed.source).toContain('__pxlblz_frame_value_0 = 4 + floor(energy * 10)')
    expect(transformed.avoidedOperationsPerPixel).toBeGreaterThanOrEqual(6)
  })
})
