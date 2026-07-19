import {
  buildShowVmResourceLedger,
  countShowPersistentGlobals,
  inspectGeneratedShowVmAllocations,
  PIXELBLAZE_MAX_PERSISTENT_GLOBALS,
  PIXELBLAZE_VM_ARRAY_WORDS,
  SHOW_ARTIFACT_BUDGET_BYTES,
  SHOW_MAX_OUTPUT_PIXELS,
} from './showVmResourceLedger'

describe('whole-Show Pixelblaze VM resource ledger (#514)', () => {
  it.each([
    { pixelCount: 0, words: 12 },
    { pixelCount: 1, words: 15 },
    { pixelCount: 2_000, words: 6_012 },
  ])('reserves three array headers plus RGB elements at $pixelCount pixels', ({ pixelCount, words }) => {
    expect(buildShowVmResourceLedger({ pixelCount, members: [] }).renderTargetWords).toBe(words)
  })

  it('reserves the fixed RGB arena and accounts for member and generated arrays by owner', () => {
    const ledger = buildShowVmResourceLedger({
      pixelCount: SHOW_MAX_OUTPUT_PIXELS,
      members: [{
        owner: 'Field Pattern',
        source: `
var literal = [1, 2, 3]
var pixels = array(pixelCount)
var constant = array(4 * 8)
export function render(index) { rgb(literal[index % 3], pixels[index], constant[0]) }
`,
      }],
      generatedAllocations: [
        { owner: 'physical routing', category: 'routing', elementCount: 12 },
        { owner: 'scene plans', category: 'plan', elementCount: 8 },
        { owner: 'coordinate cache', category: 'auxiliary-cache', elementCount: 20 },
      ],
      persistentGlobals: 17,
      artifactBytes: 12_345,
    })

    expect(ledger).toMatchObject({
      pixelCount: 2_000,
      pixelLimit: 2_000,
      vmWordBudget: PIXELBLAZE_VM_ARRAY_WORDS,
      renderTargetWords: 6_012,
      memberPatternWords: 2_047,
      routingWords: 16,
      planWords: 12,
      auxiliaryCacheWords: 24,
      persistentGlobals: 17,
      artifactBytes: 12_345,
      totalWords: 8_111,
      remainingWords: 2_129,
      blockers: [],
    })
    expect(ledger.allocations.map((allocation) => ({
      owner: allocation.owner,
      category: allocation.category,
      elementCount: allocation.elementCount,
      words: allocation.words,
    }))).toEqual([
      { owner: 'Show render target plane 1', category: 'render-target', elementCount: 2_000, words: 2_004 },
      { owner: 'Show render target plane 2', category: 'render-target', elementCount: 2_000, words: 2_004 },
      { owner: 'Show render target plane 3', category: 'render-target', elementCount: 2_000, words: 2_004 },
      { owner: 'Field Pattern: literal', category: 'member-pattern', elementCount: 3, words: 7 },
      { owner: 'Field Pattern: pixels', category: 'member-pattern', elementCount: 2_000, words: 2_004 },
      { owner: 'Field Pattern: constant', category: 'member-pattern', elementCount: 32, words: 36 },
      { owner: 'physical routing', category: 'routing', elementCount: 12, words: 16 },
      { owner: 'scene plans', category: 'plan', elementCount: 8, words: 12 },
      { owner: 'coordinate cache', category: 'auxiliary-cache', elementCount: 20, words: 24 },
    ])
  })

  it('blocks an unbounded member allocation with an owner and concrete remedy', () => {
    const ledger = buildShowVmResourceLedger({
      pixelCount: 256,
      members: [{
        owner: 'Dynamic Pattern',
        source: 'var samples = array(sliderSize); export function render(index) { rgb(samples[index], 0, 0) }',
      }],
    })

    expect(ledger.blockers).toEqual([{
      kind: 'unbounded-allocation',
      owner: 'Dynamic Pattern: samples',
      message: 'Dynamic Pattern: samples uses array(sliderSize), whose maximum size cannot be proven. Replace it with a literal, constant expression, or array(pixelCount).',
    }])
  })

  it('resolves a top-level scalar constant used by a later array allocation', () => {
    const ledger = buildShowVmResourceLedger({
      pixelCount: 2_000,
      members: [{
        owner: 'Named constant Pattern',
        source: 'var rows = 4, columns = rows * 8, field = array(columns); export function render(index) { rgb(field[index], 0, 0) }',
      }],
    })

    expect(ledger.memberPatternWords).toBe(36)
    expect(ledger.blockers).toEqual([])
  })

  it('reports an over-limit output without truncating the ledger', () => {
    const ledger = buildShowVmResourceLedger({ pixelCount: 2_001, members: [] })

    expect(ledger.pixelCount).toBe(2_001)
    expect(ledger.renderTargetWords).toBe(6_015)
    expect(ledger.blockers).toEqual([{
      kind: 'output-pixel-limit',
      owner: 'Show output contract',
      message: 'Show output contract requests 2,001 pixels; compiled Shows support at most 2,000. Reduce the Installation output or target Controller pixel count.',
    }])
  })

  it('keeps VM words, persistent globals, and artifact bytes as independent limits', () => {
    const source = `
var one = 1, two = 2
export var three = 3
function helper() { var local = 4; return local }
export function render(index) { var pixelLocal = helper(); rgb(one, two, three + pixelLocal) }
`
    expect(countShowPersistentGlobals(source)).toBe(3)

    const ledger = buildShowVmResourceLedger({
      pixelCount: 2_000,
      members: [],
      generatedAllocations: [{
        owner: 'oversized cache',
        category: 'auxiliary-cache',
        elementCount: 4_225,
      }],
      persistentGlobals: PIXELBLAZE_MAX_PERSISTENT_GLOBALS + 1,
      artifactBytes: SHOW_ARTIFACT_BUDGET_BYTES + 1,
    })

    expect(ledger.remainingWords).toBe(-1)
    expect(ledger.remainingGlobals).toBe(-1)
    expect(ledger.remainingArtifactBytes).toBe(-1)
    expect(ledger.blockers.map((blocker) => blocker.kind)).toEqual([
      'vm-word-budget',
      'persistent-global-limit',
      'artifact-byte-budget',
    ])
    expect(ledger.blockers[2].message).toContain(
      'Generated UTF-8 source is 1 byte over the source-size proxy derived from the observed 68,384-byte compiled-bytecode activation ceiling.',
    )
  })

  it('classifies compiler-owned arrays without double-counting isolated member arrays', () => {
    expect(inspectGeneratedShowVmAllocations(`
var __pxlblz_show_c0_pixels = array(10)
var __pxlblz_show_c0_slot_initialized = array(3)
var __pxlblz_show_c0_slot_bank_0 = array(3)
var __pxlblz_show_route_pixels = array(12)
var __pxlblz_show_plans = array(8)
var __pxlblz_show_coordinate_cache = array(20)
`)).toEqual([
      { owner: 'Compiler Pattern state bank: __pxlblz_show_c0_slot_initialized', category: 'auxiliary-cache', elementCount: 3 },
      { owner: 'Compiler Pattern state bank: __pxlblz_show_c0_slot_bank_0', category: 'auxiliary-cache', elementCount: 3 },
      { owner: 'Compiler physical routing: __pxlblz_show_route_pixels', category: 'routing', elementCount: 12 },
      { owner: 'Compiler scene plans: __pxlblz_show_plans', category: 'plan', elementCount: 8 },
      { owner: 'Compiler auxiliary cache: __pxlblz_show_coordinate_cache', category: 'auxiliary-cache', elementCount: 20 },
    ])
  })
})
