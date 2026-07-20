// #570 characterization: the routing-representation refactor must keep the
// generated output of every representation byte-identical. These hashes were
// recorded on the pre-refactor compiler; any intentional emission change must
// be separately documented and re-recorded.
import { createHash } from 'node:crypto'
import { compileShow, type ShowRecipe } from './showCompiler'

const SOURCE_A = 'export function render(index) { rgb(1, index / pixelCount, 0) }'
const SOURCE_B = 'export function render(index) { rgb(0, index / pixelCount, 1) }'

function digest(recipe: ShowRecipe): { hash: string; representation: string; warnings: string[] } {
  const artifact = compileShow(recipe, {})
  return {
    hash: createHash('sha256').update(artifact.code).update('\n--\n').update(artifact.expandedCode).digest('hex').slice(0, 16),
    representation: artifact.summary.routingRepresentation,
    warnings: artifact.summary.warnings,
  }
}

function layoutRecipe(
  layouts: NonNullable<ShowRecipe['routingLayouts']>,
  overrides: Partial<ShowRecipe> = {},
): ShowRecipe {
  return {
    clips: [
      { id: 'red', zone: 'red', source: SOURCE_A },
      { id: 'blue', zone: 'blue', source: SOURCE_B },
    ],
    zones: layouts[0].zones,
    routingLayouts: layouts,
    routingSwitches: [{ atMs: 1_000, layoutId: layouts[layouts.length - 1].id }],
    loopDurationMs: 2_000,
    ...overrides,
  }
}

function zone(id: string, name: string, ranges: Array<{ start: number; end: number }>) {
  return { id, name, ranges }
}

const rangeBranches = layoutRecipe([
  {
    id: 'first',
    name: 'first',
    zones: [
      zone('a-red', 'red', [{ start: 0, end: 59 }]),
      zone('a-blue', 'blue', [{ start: 60, end: 127 }]),
    ],
  },
  {
    id: 'second',
    name: 'second',
    zones: [
      zone('b-red', 'red', [{ start: 60, end: 127 }]),
      zone('b-blue', 'blue', [{ start: 0, end: 59 }]),
    ],
  },
])

const packedPixels = layoutRecipe([
  {
    id: 'striped',
    name: 'striped',
    zones: [
      zone('s-red', 'red', Array.from({ length: 16 }, (_, block) => ({
        start: block * 2 * 4 + (block === 0 ? 0 : 1),
        end: block * 2 * 4 + 3,
      }))),
      zone('s-blue', 'blue', Array.from({ length: 16 }, (_, block) => ({
        start: block * 2 * 4 + 4,
        end: block * 2 * 4 + 7 + (block === 15 ? 0 : 1),
      }))),
    ],
  },
  {
    id: 'swapped',
    name: 'swapped',
    zones: [
      zone('w-red', 'red', Array.from({ length: 16 }, (_, block) => ({
        start: block * 2 * 4 + 4,
        end: block * 2 * 4 + 7,
      }))),
      zone('w-blue', 'blue', Array.from({ length: 16 }, (_, block) => ({
        start: block * 2 * 4,
        end: block * 2 * 4 + 3,
      }))),
    ],
  },
])

const generatedFormula = layoutRecipe([
  {
    id: 'blocks',
    name: 'blocks',
    zones: [
      zone('f-red', 'red', [{ start: 0, end: 63 }]),
      zone('f-blue', 'blue', [{ start: 64, end: 127 }]),
    ],
  },
  {
    id: 'shifted',
    name: 'shifted',
    zones: [
      zone('g-red', 'red', [{ start: 64, end: 127 }]),
      zone('g-blue', 'blue', [{ start: 0, end: 63 }]),
    ],
  },
])

const coordinatePredicates: ShowRecipe = {
  clips: [
    { id: 'red', zone: 'red', source: SOURCE_A },
    { id: 'blue', zone: 'blue', source: SOURCE_B },
  ],
  zones: [
    zone('p-red', 'red', [{ start: 0, end: 63 }]),
    zone('p-blue', 'blue', [{ start: 64, end: 127 }]),
  ],
  routingLayouts: [
    {
      id: 'stripes',
      name: 'stripes',
      zones: [
        zone('p-red', 'red', [{ start: 0, end: 63 }]),
        zone('p-blue', 'blue', [{ start: 64, end: 127 }]),
      ],
      logical: { kind: 'stripes', zoneNames: ['red', 'blue'], axis: 'x' },
    },
  ],
  loopDurationMs: 2_000,
}

const gapsAndOverlaps = layoutRecipe([
  {
    id: 'sparse',
    name: 'sparse',
    zones: [
      zone('o-red', 'red', [{ start: 0, end: 40 }]),
      // Overlaps red's tail and leaves 100..127 unassigned.
      zone('o-blue', 'blue', [{ start: 24, end: 99 }]),
    ],
  },
  {
    id: 'flipped',
    name: 'flipped',
    zones: [
      zone('q-red', 'red', [{ start: 64, end: 127 }]),
      zone('q-blue', 'blue', [{ start: 0, end: 63 }]),
    ],
  },
], { masterPixelCount: 128 })

const routeMode: ShowRecipe = {
  clips: [
    { id: 'red', zone: 'red', source: SOURCE_A },
    { id: 'blue', zone: 'blue', source: SOURCE_B },
  ],
  zones: [
    zone('r-red', 'red', [{ start: 0, end: 63 }]),
    zone('r-blue', 'blue', [{ start: 64, end: 127 }, { start: 200, end: 231 }]),
  ],
}

describe('routing representation characterization (#570)', () => {
  const cases: Array<[string, ShowRecipe, string, string]> = [
    ['range-branches', rangeBranches, 'range-branches', ''],
    ['packed-pixels', packedPixels, 'packed-pixels', ''],
    ['generated-formula', generatedFormula, 'generated-formula', ''],
    ['coordinate-predicates', coordinatePredicates, 'coordinate-predicates', ''],
    ['gaps-and-overlaps', gapsAndOverlaps, 'range-branches', ''],
    ['route-mode', routeMode, 'range-branches', ''],
  ]

  it.each(cases)('%s output is byte-stable', (label, recipe, representation) => {
    const result = digest(recipe)
    expect(result.representation, label).toBe(representation)
    expect(result.hash, label).toMatchSnapshot()
  })

  it('keeps the gap and overlap warnings', () => {
    const result = digest(gapsAndOverlaps)
    expect(result.warnings.some((warning) => warning.includes('unassigned'))).toBe(true)
    expect(result.warnings.some((warning) => warning.includes('first route wins'))).toBe(true)
  })
})

describe('short-circuit 2D zone-local coordinates (#570 fix)', () => {
  it('parenthesizes the offset local index in zoneLocalX', () => {
    // Pre-#570, `(index - 64 % 8)` parsed as `index - 0`: every multi-row
    // zone in the short-circuit 2D dispatch received a garbage local X.
    const artifact = compileShow({
      masterPixelCount: 128,
      clips: [
        { id: 'left', zone: 'left', source: 'export function render2D(index, x, y) { rgb(x, y, 0.2) }' },
        { id: 'right', zone: 'right', source: 'export function render2D(index, x, y) { rgb(x, y, 0.2) }' },
      ],
      zones: [
        { id: 'z-left', name: 'left', ranges: [{ start: 0, end: 63 }] },
        { id: 'z-right', name: 'right', ranges: [{ start: 64, end: 127 }] },
      ],
    }, {})
    expect(artifact.expandedCode).toContain('__pxlblz_show_c1_zoneLocalX = ((index - 64) % 8) / 7')
    expect(artifact.expandedCode).not.toMatch(/zoneLocalX = \(index - \d+ %/)
  })
})
