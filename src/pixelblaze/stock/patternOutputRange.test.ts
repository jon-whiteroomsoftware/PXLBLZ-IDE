import { createFastReplayRuntime } from '@/engine/fastReplay'
import { nativeDim } from '@/engine/dimLens'
import { nativeDimension } from '@/engine/loadPattern'
import { createShowWithOutputContract, updateShowCellAdaptations, updateShowCellPattern } from '@/engine/showModel'
import { createPortableShowOutputContract } from '@/engine/showOutputContract'
import { compileShowForArtifact } from '@/engine/showPreviewArtifact'
import { SOURCE_STOCK_MAPS } from './maps/stockCatalogue'
import { DEMOS } from './patterns'

const SHOW_CASTABLE_STOCK_PATTERNS = Object.entries(DEMOS)
  .filter(([, source]) => nativeDim(source) === 2)
  .map(([patternId]) => patternId)

const RANGE_REGRESSIONS = [
  'AllLasersFire',
  'PerlinKaleidoscope2D',
  'GeometryMorphingDemo2D',
] as const

// The existing casting census includes seven mild negative-mean color
// excursions. Pin their measured floors so they cannot worsen silently and so
// every newly imported Pattern must begin with non-negative mean RGB channels.
const ACCEPTED_NEGATIVE_MEAN_CHANNEL_FLOORS: Record<string, number> = {
  BlueHolidayStar2D: -0.06,
  CarriesHolidayStar2D: -0.07,
  CoronalMassEjection: -0.15,
  DoomFireV20_2D: -0.01,
  PerlinFireWindTunnel: -0.03,
  Raindrops2D: -0.02,
}

const ACCEPTED_NEGATIVE_MEAN_LUMA_FLOORS: Record<string, number> = {
  // These two established Patterns also retain mild negative aggregate luma.
  CarriesHolidayStar2D: -0.02,
  CoronalMassEjection: -0.07,
}

const mapPoints = SOURCE_STOCK_MAPS.find((map) => map.id === 'plane')!.resolve(1_936)

function replayStockPattern(patternId: string, targetMs = 1_000): number[][] {
  const base = createShowWithOutputContract(
    `range-${patternId}`,
    `${patternId} range probe`,
    createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1_936 }),
    1,
  )
  const patterned = updateShowCellPattern(base, 'cell-1', {
    pattern: { kind: 'stock', id: patternId },
    patternName: patternId,
  })
  const show = updateShowCellAdaptations(patterned, 'cell-1', { timeScale: 0.32 })
  const compiled = compileShowForArtifact(show, [], undefined, {}, { stageDimension: 2 })
  expect(compiled.error, patternId).toBeNull()

  const artifact = compiled.artifact!
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, {
    mapPoints,
    randomSeed: 363,
    fidelity: 'fast',
  }).advanceTo(targetMs, { stepMs: 100 }).pixels
}

describe('stock Pattern Show output range (#728)', () => {
  it.each(SHOW_CASTABLE_STOCK_PATTERNS)('%s stays inside the casting census envelope', (patternId) => {
    const pixels = replayStockPattern(patternId)
    const channels = pixels.flat()
    const meanChannels = pixels.reduce((sums, pixel) => sums.map((sum, index) => (
      sum + pixel[index] / pixels.length
    )), [0, 0, 0])
    const meanLuma = pixels.reduce((sum, [r, g, b]) => (
      sum + 0.2126 * r + 0.7152 * g + 0.0722 * b
    ), 0) / pixels.length
    expect(channels.every(Number.isFinite), patternId).toBe(true)
    expect(Math.min(...meanChannels), `${patternId} minimum mean channel`).toBeGreaterThanOrEqual(
      ACCEPTED_NEGATIVE_MEAN_CHANNEL_FLOORS[patternId] ?? 0,
    )
    expect(meanLuma, `${patternId} mean luminance`).toBeGreaterThanOrEqual(
      ACCEPTED_NEGATIVE_MEAN_LUMA_FLOORS[patternId] ?? 0,
    )
    expect(meanLuma, `${patternId} mean luminance`).toBeLessThanOrEqual(1.05)
  })

  it.each(RANGE_REGRESSIONS)('%s emits normalized RGB for Show math', (patternId) => {
    const channels = replayStockPattern(patternId).flat()

    expect(Math.min(...channels), `${patternId} minimum channel`).toBeGreaterThanOrEqual(0)
    expect(Math.max(...channels), `${patternId} maximum channel`).toBeLessThanOrEqual(1)
  })
})
