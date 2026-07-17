import { compileShow } from './showCompiler'
import { countShowPersistentGlobals } from './showVmResourceLedger'

describe('Show compiler resource ledger integration (#514)', () => {
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
