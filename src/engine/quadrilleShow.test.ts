import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShowForArtifact } from './showPreviewArtifact'

// #832: Quadrille holds Line Dancer 2D inside its full-field bloom by
// choreography alone. The pattern's look rides zoom = wave(time(0.075)), a
// 4.9152 s member-time swell. At the show's shared edge rate each 6.4 s
// phrase advances the swell by exactly half a cycle, so phrases pair A/B
// (bloom-led, then lace-led); the entrance phrase's shaped clock glides
// into a slow dwell that holds the bloom, then whips through the swell's
// structured half. These contracts read that engineering off rendered
// frames: the entrance dwell must be full-field (no dark gaps), its whip
// must surface the lace, and later phrases must not drift.

const MAP_POINTS = Array.from({ length: 256 }, (_, index) => ({
  sample: [(index % 16) / 15, Math.floor(index / 16) / 15] as [number, number],
}))

const PHRASE_MS = 6_400
const SCENE_STARTS = Array.from({ length: 8 }, (_, index) => index * PHRASE_MS)

type Artifact = NonNullable<ReturnType<typeof compileShowForArtifact>['artifact']>

function frameAt(artifact: Artifact, timeMs: number) {
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: MAP_POINTS, randomSeed: 7, fidelity: 'fast' })
  const result = runtime.advanceTo(timeMs, { stepMs: 50 })
  return { pixels: result.pixels, checksum: result.checksum }
}

// Column/row space is the 16x16 sample grid; row 0 is the top of the stage.
function quadrantPixels(pixels: number[][], quadrant: 'nw' | 'ne' | 'sw' | 'se'): number[][] {
  const cols = quadrant === 'nw' || quadrant === 'sw' ? [0, 7] : [8, 15]
  const rows = quadrant === 'nw' || quadrant === 'ne' ? [0, 7] : [8, 15]
  const out: number[][] = []
  for (let row = rows[0]; row <= rows[1]; row++) {
    for (let col = cols[0]; col <= cols[1]; col++) out.push(pixels[row * 16 + col])
  }
  return out
}

function darkFraction(pixels: number[][]): number {
  return pixels.filter(([r, g, b]) => r + g + b < 0.1).length / pixels.length
}

describe('Quadrille remix show (#832)', () => {
  const fixture = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-remix-quadrille')

  it('is catalogued as the second remix with two instances, one layout, eight phrases', () => {
    expect(fixture).toBeDefined()
    expect(fixture!.collection).toBe('remixes')
    expect(fixture!.order).toBe(2)
    const composition = fixture!.show.composition!
    expect(composition.patternInstances).toHaveLength(2)
    expect(composition.patternInstances.map((entry) => entry.pattern.id).sort())
      .toEqual(['LineDancer2D', 'WavyBands'])
    expect(fixture!.show.routingLayouts).toHaveLength(1)
    expect(fixture!.show.scenes).toHaveLength(6)
    expect(composition.durationMs).toBe(8 * PHRASE_MS)
  })

  it('compiles, and renders deterministically', () => {
    const compiled = compileShowForArtifact(fixture!.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    expect(compiled.artifactBlocker).toBeUndefined()
    const artifact = compiled.artifact!
    expect(artifact.summary).toMatchObject({
      steadyStateRenderersPerPixel: 2,
      worstInstantRenderersPerPixel: 4,
      cost: { cpu: { patternEvaluations: { formula: 'S * N', samplesPerPixel: 4 } } },
    })
    const coverage = artifact.summary.specializations.viewportCoverage?.stacks ?? []
    expect(coverage.filter((decision) => decision.status === 'selected')).toHaveLength(4)
    expect(coverage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        framedPlacementCount: 4,
        hasSharedGround: false,
        maxPatternEvaluationsPerPixel: 1,
      }),
      expect.objectContaining({
        framedPlacementCount: 4,
        hasSharedGround: true,
        maxPatternEvaluationsPerPixel: 2,
      }),
    ]))
    expect(frameAt(artifact, 9_600).checksum).toBe(frameAt(artifact, 9_600).checksum)
  })

  it('proves the generated render path is state-pure for deterministic replay (#847)', () => {
    const compiled = compileShowForArtifact(fixture!.show, [], undefined, {}, { stageDimension: 2 })

    expect(compiled.artifact!.metadata).toMatchObject({
      deterministicReplay: { intermediateRender: 'state-pure' },
    })
  })

  it('mirrors the same live Wavy Bands frame across the center seam once the quarters condense', () => {
    const compiled = compileShowForArtifact(fixture!.show, [], undefined, {}, { stageDimension: 2 })
    const { pixels } = frameAt(compiled.artifact!, SCENE_STARTS[1] + 3_200)
    // The NE quadrant mirrors the NW instance placement, so the stage is
    // symmetric about the vertical center seam: (col, row) vs (15-col, row).
    for (const row of [2, 7, 13]) {
      for (let col = 0; col < 8; col++) {
        const left = pixels[row * 16 + col]
        const right = pixels[row * 16 + (15 - col)]
        for (let channel = 0; channel < 3; channel++) {
          expect(Math.abs(left[channel] - right[channel]), `row ${row} col ${col} ch ${channel}`)
            .toBeLessThan(0.02)
        }
      }
    }
  })

  it('holds the bloom in solid phrases and keeps laced phrases lit', () => {
    const compiled = compileShowForArtifact(fixture!.show, [], undefined, {}, { stageDimension: 2 })
    const artifact = compiled.artifact!
    // Two clock regimes. The solid-dancer entrance (phrase 3 at 12.8 s)
    // runs the shaped clock: mid-dwell the quadrant is a full field with
    // almost no dark pixels. Laced phrases run the constant edge rate -
    // the lace breathes through each phrase, but the bands beneath keep
    // the composite lit. Any drift in the per-phrase half-swell integral
    // compounds across phrases and shows up here.
    const { pixels } = frameAt(artifact, SCENE_STARTS[2] + 2_600)
    expect(darkFraction(quadrantPixels(pixels, 'ne')), 'entrance mid-dwell').toBeLessThan(0.15)
    for (const phraseIndex of [3, 4, 5, 6, 7]) {
      const laced = frameAt(artifact, SCENE_STARTS[phraseIndex] + 2_600)
      expect(darkFraction(quadrantPixels(laced.pixels, 'ne')), `laced phrase ${phraseIndex + 1}`).toBeLessThan(0.4)
    }
  })

  it('surfaces the lace in the turnaround, and the black key fills its gaps with the bands', () => {
    const compiled = compileShowForArtifact(fixture!.show, [], undefined, {}, { stageDimension: 2 })
    const artifact = compiled.artifact!
    // The lace is soft-edged, so its dark fraction breathes as the
    // turnaround runs; judge the window's peak, not one instant.
    const TURNAROUND_SAMPLES = [4_800, 5_200, 5_600]
    const peakDark = (sceneStart: number) => Math.max(...TURNAROUND_SAMPLES.map((offset) => (
      darkFraction(quadrantPixels(frameAt(artifact, sceneStart + offset).pixels, 'ne'))
    )))
    // Scene 3 (solid dancer): the turnaround crosses the swell's structured
    // half and the thin-line filigree darkens the quadrant.
    const solidDark = peakDark(SCENE_STARTS[2])
    expect(solidDark, 'solid turnaround lace').toBeGreaterThan(0.35)
    // Scene 4 (dancer chroma-keyed on black over the bands): the same
    // turnaround keys the dark gaps away and the bands glow through them.
    const lacedDark = peakDark(SCENE_STARTS[3])
    expect(lacedDark, 'keyed turnaround shows the bands').toBeLessThan(solidDark - 0.2)
  })

  it('animates every phrase against a trackless clone', () => {
    const compiled = compileShowForArtifact(fixture!.show, [], undefined, {}, { stageDimension: 2 })
    const bareShow = structuredClone(fixture!.show)
    for (const sceneEntry of bareShow.composition!.scenes) delete sceneEntry.propertyTracks
    const bare = compileShowForArtifact(bareShow, [], undefined, {}, { stageDimension: 2 })
    expect(bare.error).toBeNull()
    // The dancer's shaped clock is a track: without it the turnaround
    // never happens and the frames diverge.
    expect(frameAt(compiled.artifact!, SCENE_STARTS[2] + 5_000).checksum)
      .not.toBe(frameAt(bare.artifact!, SCENE_STARTS[2] + 5_000).checksum)
  })
})
