import { compileShow } from './showCompiler'
import { countShowPersistentGlobals } from './showVmResourceLedger'

describe('Show compiler resource ledger integration (#514)', () => {
  it('emits exactly three physical arena planes at the Show output extent (#515)', () => {
    const artifact = compileShow({
      masterPixelCount: 2_000,
      clips: [{ id: 'solid', source: 'export function render(index) { rgb(1, 0, 0) }' }],
    }, {})

    expect(artifact.expandedCode.match(/var __pxlblz_show_rt_plane_[0-2] = array\(2000\)/g)).toHaveLength(3)
    expect(artifact.expandedCode.match(/__pxlblz_show_rt_plane_/g)).toHaveLength(3)
  })

  it('publishes deterministic named role bindings without claiming an active cache', () => {
    const artifact = compileShow({
      masterPixelCount: 2_000,
      clips: [{ id: 'solid', source: 'export function render(index) { rgb(1, 0, 0) }' }],
    }, {})

    expect(artifact.summary.renderTarget).toEqual({
      elementCount: 2_000,
      planeCount: 3,
      words: 6_012,
      emitted: true,
      activeRole: null,
      roleBindings: [
        { role: 'stage-rgb', channels: { r: 0, g: 1, b: 2 } },
        { role: 'sample-xy', channels: { x: 0, y: 1 } },
        { role: 'scalar-field', channels: { value: 0 } },
        { role: 'previous-rgb', channels: { r: 0, g: 1, b: 2 } },
      ],
    })
  })

  it('retains the logical reservation in the explicit no-emission benchmark counterfactual', () => {
    const artifact = compileShow({
      masterPixelCount: 2_000,
      clips: [{ id: 'solid', source: 'export function render(index) { rgb(1, 0, 0) }' }],
    }, {}, { renderTargetArenaEmission: false })

    expect(artifact.expandedCode).not.toContain('__pxlblz_show_rt_plane_')
    expect(artifact.summary.renderTarget.emitted).toBe(false)
    expect(artifact.summary.resources.renderTargetWords).toBe(6_012)
  })

  it('reuses the three-plane arena for snapshot/live with one readiness scalar and no new array (#516)', () => {
    const compile = (crossfadePolicy: 'live-live' | 'snapshot-live') => compileShow({
      masterPixelCount: 2_000,
      clips: [
        { id: 'outgoing', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'incoming', source: 'export function render(index) { rgb(0, 0, 1) }' },
      ],
      crossfade: { startMs: 1000, durationMs: 1000, crossfadePolicy },
    }, {})
    const live = compile('live-live')
    const snapshot = compile('snapshot-live')

    expect(snapshot.summary.resources.renderTargetWords).toBe(live.summary.resources.renderTargetWords)
    expect(snapshot.summary.resources.allocations).toEqual(live.summary.resources.allocations)
    expect(snapshot.summary.resources.persistentGlobals).toBe(live.summary.resources.persistentGlobals + 1)
    expect(snapshot.summary.renderTarget.activeRole).toBe('stage-rgb')
  })

  it('publishes the mandatory arena and complete member allocation in the compile summary', () => {
    const artifact = compileShow({
      masterPixelCount: 2_000,
      clips: [{
        id: 'field-pattern',
        source: `
var field = array(pixelCount)
export function render(index) { rgb(field[index], 0, 0) }
`,
      }],
    }, {})

    expect(artifact.summary.resources).toMatchObject({
      pixelCount: 2_000,
      renderTargetWords: 6_012,
      memberPatternWords: 2_004,
      routingWords: 0,
      planWords: 0,
      auxiliaryCacheWords: 0,
      totalWords: 8_016,
      remainingWords: 2_224,
      artifactBytes: artifact.summary.artifactBytes,
      blockers: [],
    })
    expect(artifact.summary.resources.persistentGlobals).toBe(countShowPersistentGlobals(artifact.code))
  })

  it('accepts the exact residual VM fit and rejects one additional member word', () => {
    const compileWithMemberElements = (elementCount: number) => compileShow({
      masterPixelCount: 2_000,
      clips: [{
        id: 'residual-field',
        source: `var field = array(${elementCount}); export function render(index) { rgb(field[0], 0, 0) }`,
      }],
    }, {})
    const exact = compileWithMemberElements(4_224)
    const over = compileWithMemberElements(4_225)

    expect(exact.summary.resources).toMatchObject({
      renderTargetWords: 6_012,
      memberPatternWords: 4_228,
      totalWords: 10_240,
      remainingWords: 0,
      blockers: [],
    })
    expect(over.summary.resources).toMatchObject({
      totalWords: 10_241,
      remainingWords: -1,
    })
    expect(over.summary.resources.blockers).toContainEqual(expect.objectContaining({
      kind: 'vm-word-budget',
      owner: 'Whole Show',
    }))
  })

  it('keeps an unbounded allocation previewable while reporting its artifact blocker', () => {
    const artifact = compileShow({
      clips: [{
        id: 'dynamic-pattern',
        source: `
export var sliderSize = 0.5
var field = array(sliderSize)
export function render(index) { rgb(field[index], 0, 0) }
`,
      }],
    }, {})

    expect(artifact.code).toContain('export function render(index)')
    expect(artifact.summary.resources.blockers).toContainEqual(expect.objectContaining({
      kind: 'unbounded-allocation',
      owner: 'dynamic-pattern: field',
    }))
  })

  it('accounts for compiler-owned packed routing arrays including their header', () => {
    const singletonRanges = (indices: number[]) => indices.map((index) => ({ start: index, end: index }))
    const even = Array.from({ length: 32 }, (_, index) => index * 2)
    const odd = Array.from({ length: 32 }, (_, index) => index * 2 + 1)
    const irregularRed = [0, ...odd.filter((index) => index !== 1)]
    const irregularBlue = [1, ...even.filter((index) => index !== 0)]
    const layout = (id: string, red: number[], blue: number[]) => ({
      id,
      name: id,
      zones: [
        { id: `${id}-red`, name: 'red', ranges: singletonRanges(red) },
        { id: `${id}-blue`, name: 'blue', ranges: singletonRanges(blue) },
      ],
    })
    const artifact = compileShow({
      clips: [
        { id: 'red', zone: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'blue', zone: 'blue', source: 'export function render(index) { rgb(0, 0, 1) }' },
      ],
      zones: layout('base', even, odd).zones,
      routingLayouts: [
        layout('alternating', even, odd),
        layout('irregular', irregularRed, irregularBlue),
      ],
      routingSwitches: [{ atMs: 1000, layoutId: 'irregular' }],
      loopDurationMs: 2000,
    }, {})

    expect(artifact.summary.routingRepresentation).toBe('packed-pixels')
    expect(artifact.summary.resources.routingWords).toBe(132)
    expect(artifact.summary.resources.allocations).toContainEqual(expect.objectContaining({
      owner: 'Compiler physical routing: __pxlblz_show_route_pixels',
      category: 'routing',
      elementCount: 128,
      words: 132,
    }))
    expect(artifact.summary.cost.memory.generatedArrayElements).toBe(128)
  })

  it('accounts for compiler-owned interned render-plan arrays including their header', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 1 }] },
      { id: 'right', name: 'right', ranges: [{ start: 2, end: 3 }] },
    ]
    const placement = (placementId: string, zoneName: string, brightness: number) => ({
      placementId,
      zoneName,
      clipId: 'shared',
      brightness,
    })
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export function render2D(index, x, y) { rgb(1, 0.5, 0.25) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [placement('left-a', 'left', 0.5), placement('right-a', 'right', 0.5)],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1000,
            placements: [placement('left-b', 'left', 0.5), placement('right-b', 'right', 1)],
          },
        ],
      },
      loopDurationMs: 2000,
    }, {})

    expect(artifact.summary.resources.planWords).toBe(8)
    expect(artifact.summary.resources.allocations).toContainEqual(expect.objectContaining({
      owner: 'Compiler scene plans: __pxlblz_show_plans',
      category: 'plan',
      elementCount: 4,
      words: 8,
    }))
    expect(artifact.summary.cost.memory.generatedArrayElements).toBe(4)
  })
})
