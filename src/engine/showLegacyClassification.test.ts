import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import { showRecordToCompileRecipe } from './showModel'
import {
  classifyShowOutputContract,
  legacyShowModeledPixelCount,
} from './showLegacyClassification'
import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
} from './showOutputContract'
import { compileShow } from './showCompiler'
import { createShim } from './shim'
import { loadPattern } from './loadPattern'

describe('legacy Show output classification (#438)', () => {
  const cases = [
    {
      name: 'recognizes a versioned Installation record',
      mutate: () => ({
        ...createDefaultShow('show', 'Versioned'),
        outputContract: createInstallationShowOutputContract({ outputMapId: 'map-1', pixelCount: 120 }),
      }),
      outcome: 'installation',
      source: 'versioned',
    },
    {
      name: 'recognizes a versioned Portable record',
      mutate: () => ({
        ...createDefaultShow('show', 'Versioned'),
        outputContract: createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 256 }),
      }),
      outcome: 'portable-2d',
      source: 'versioned',
    },
    {
      name: 'treats an unknown contract version as unclassified legacy data',
      mutate: () => {
        const show = createDefaultShow('show', 'Unknown version')
        show.routingLayouts[0].zones = []
        show.outputContract = { version: 2, kind: 'portable-2d' } as never
        return show
      },
      outcome: 'ambiguous',
      source: 'legacy-evidence',
    },
    {
      name: 'proves Installation from an explicit target Controller',
      mutate: () => {
        const show = createDefaultShow('show', 'Controller target')
        show.routingLayouts[0].zones = []
        show.targetControllerProfileId = 'controller-1'
        return show
      },
      outcome: 'installation',
      source: 'legacy-evidence',
    },
    {
      name: 'proves Installation from authored physical ranges',
      mutate: () => createDefaultShow('show', 'Physical ranges'),
      outcome: 'installation',
      source: 'legacy-evidence',
    },
    {
      name: 'does not infer Portable from missing physical ranges',
      mutate: () => {
        const show = createDefaultShow('show', 'No ranges')
        show.routingLayouts[0].zones = []
        return show
      },
      outcome: 'ambiguous',
      source: 'legacy-evidence',
    },
    {
      name: 'does not infer either contract from a 2D Stage and logical routing',
      mutate: () => {
        const show = createDefaultShow('show', 'Logical 2D')
        show.stageMapId = 'plane'
        show.routingLayouts[0].zones = []
        show.routingLayouts[0].logical = { kind: 'single', zoneIds: ['zone-1'] }
        return show
      },
      outcome: 'ambiguous',
      source: 'legacy-evidence',
    },
  ] as const

  it.each(cases)('$name', ({ mutate, outcome, source }) => {
    const result = classifyShowOutputContract(mutate())
    expect(result.outcome).toBe(outcome)
    expect(result.source).toBe(source)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it('derives a stable modeled count from zones without consulting Stage dimension', () => {
    const show = createDefaultShow('show', 'Count')
    show.zones = [
      { ...show.zones[0], nominalPixelCount: 40 },
      { id: 'zone-2', name: 'side', nominalPixelCount: 80, color: '#f00' },
    ]
    expect(legacyShowModeledPixelCount(show)).toBe(120)
  })

  it('preserves representative one-zone playback before and after automatic classification', () => {
    const legacy = createDefaultShow('show', 'Playback', 1)
    const result = classifyShowOutputContract(legacy)
    if (result.outcome !== 'installation') throw new Error('Expected proven Installation evidence.')
    const classified = { ...legacy, outputContract: result.contract }
    const lookup = {
      byCellId: {
        'cell-1': 'export function render(index) { rgb(index / pixelCount, 0, 0) }',
        'cell-2': 'export function render(index) { rgb(0, index / pixelCount, 0) }',
      },
    }
    const before = compileShow(showRecordToCompileRecipe(legacy, lookup), {})
    const after = compileShow(showRecordToCompileRecipe(classified, lookup), {})

    for (const elapsedMs of [1_000, 30_500, 45_000]) {
      const beforePixels = renderFrame(before, elapsedMs, 60)
      const afterPixels = renderFrame(after, elapsedMs, 60)
      expect(afterPixels).toEqual(beforePixels)
    }
  })
})

function renderFrame(
  artifact: ReturnType<typeof compileShow>,
  elapsedMs: number,
  pixelCount: number,
): Array<[number, number, number]> {
  const mapPoints = Array.from({ length: pixelCount }, (_, index) => ({ sample: [index / Math.max(1, pixelCount - 1)] }))
  const shim = createShim({ pixelCount, dimensions: 1, mapPoints, getVirtualTime: () => 0, randomSeed: 1 })
  const handle = loadPattern(artifact.code, artifact.metadata, shim.builtins)
  handle.beforeRender(elapsedMs)
  return [0, 20, 59].map((index) => {
    handle.render(index)
    return shim.capturedPixel()
  })
}
