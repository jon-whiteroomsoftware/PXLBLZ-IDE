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

const INLINE_SOURCE = `
export var t = 0
export function beforeRender(delta) { t = time(0.1) }
export function render(index) {
  hsv(t + wave(time(0.05)), 1, 0.5 + 0.5 * wave(time(0.05)))
  var plain = t * 2 + 1
  rgb(plain, time(index / pixelCount), random(1))
}
`

describe('inline call-subtree hoisting (#566)', () => {
  it('hoists maximal pure call subtrees and deduplicates identical ones', () => {
    const candidates = analyzeShowFrameInvariantCandidates(INLINE_SOURCE)
    const inline = candidates.filter((candidate) => candidate.binding.startsWith('inline'))
    // Two occurrences of wave(time(0.05)) plus the enclosing maximal
    // subtrees: `t + wave(time(0.05))` is maximal for the first argument;
    // `0.5 + 0.5 * wave(time(0.05))` for the third.
    expect(inline.length).toBe(2)
    expect(inline[0].initializerSource).toBe('t + wave(time(0.05))')
    expect(inline[1].initializerSource).toBe('0.5 + 0.5 * wave(time(0.05))')
    const applied = applyShowFrameInvariantHoists(INLINE_SOURCE, inline)
    expect(applied.updateFunctionName).toBeTruthy()
    expect(applied.source).toContain(`hsv(${applied.valueNames[0]}, 1, ${applied.valueNames[1]})`)
    // Update function recomputes both once per frame.
    expect(applied.source).toContain(`${applied.valueNames[0]} = t + wave(time(0.05))`)
  })

  it('refuses pixel-dependent, impure, and call-free subtrees', () => {
    const candidates = analyzeShowFrameInvariantCandidates(INLINE_SOURCE)
    const sources = candidates.map((candidate) => candidate.initializerSource)
    // time(index / pixelCount) is pixel-dependent; random(1) is impure;
    // `t * 2 + 1` has no call, so the INLINE path refuses it (reads are free,
    // hoisting would add a write). The classic #513 declarator path still owns
    // initializer decisions and is unchanged.
    const inline = candidates.filter((candidate) => candidate.binding.startsWith('inline'))
    expect(sources.some((source) => source.includes('index'))).toBe(false)
    expect(sources.some((source) => source.includes('random'))).toBe(false)
    expect(inline.some((candidate) => candidate.initializerSource.includes('t * 2'))).toBe(false)
  })

  it('deduplicates structurally identical subtrees into one global', () => {
    const source = `
export function render(index) {
  rgb(wave(time(0.05)), wave(time(0.05)), 0)
}
`
    const candidates = analyzeShowFrameInvariantCandidates(source)
    const inline = candidates.filter((candidate) => candidate.binding.startsWith('inline'))
    expect(inline.length).toBe(2)
    const applied = applyShowFrameInvariantHoists(source, inline)
    // One shared global, two replacement sites.
    expect(applied.valueNames.length).toBe(1)
    expect(applied.source.match(new RegExp(applied.valueNames[0], 'g'))!.length).toBeGreaterThanOrEqual(3)
  })

  it('refuses subtrees that read render-mutated state while inner pure calls still hoist', () => {
    const source = `
var offset = 0
export function render(index) {
  offset = offset + 1
  rgb(wave(time(0.05) + offset), 0, 0)
}
`
    const candidates = analyzeShowFrameInvariantCandidates(source)
    const inline = candidates.filter((candidate) => candidate.binding.startsWith('inline'))
    // The maximal walk refuses every subtree containing the mutated read...
    expect(inline.some((candidate) => candidate.initializerSource.includes('offset'))).toBe(false)
    // ...but the inner time(0.05) is still exact to hoist.
    expect(inline.map((candidate) => candidate.initializerSource)).toEqual(['time(0.05)'])
  })
})
