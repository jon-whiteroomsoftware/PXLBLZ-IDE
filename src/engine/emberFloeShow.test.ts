import { beforeAll, describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { stockShowCatalogueById } from '@/pixelblaze/stock/showCatalogueV2'
import { resolveShowV2StageMap } from '@/store/showV2StageMap'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { portableOutputContract } from '@/pixelblaze/stock/showsV2Authoring'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from './showFileBundle'
import { validateShowRecordV2 } from './showCompositionV2'

// #1199: Ember & Floe holds a front line between fire (MetaballsOfFire2D) and
// ice (IceFloes2D) on the 44 x 44 plane (design #1194). These contracts read
// the score off rendered frames of the exported .epe as its importer reopens
// it. Ice is the full-field voice, so a pixel is ice when blue leads red; fire
// is blobs on black, so every pixel that is not ice is fire's territory.

const ID = 'stock-show-portable-ember-floe'
const GRID = 44

type Rgb = number[]

function compiled() {
  const record = stockShowV2ById(ID)!
  const capture = captureShowStageEditV2(record, {
    patterns: [], libraries: [], maps: [], profiles: [], stageMap: resolveShowV2StageMap(record.stageMapId, []),
  })
  if (capture.prepared.status !== 'ready') throw new Error('stock v2 Show failed preparation')
  return capture.prepared.bundle
}

const bundle = compiled()
const artifact = bundle.artifact
const epe = buildShowEpeExportV2(stockShowV2ById(ID)!, artifact.code)
if (epe.status !== 'exported') throw new Error(epe.message)
const delivered = parseEpe(epe.text).src
const mapPoints = bundle.presentation.layout.mapPoints
const cells = mapPoints.map(({ sample }) => [Math.round(sample[0] * (GRID - 1)), Math.round(sample[1] * (GRID - 1))] as const)

function runtime(fidelity: 'fast' | 'fidelity' = 'fast') {
  return createFastReplayRuntime({
    code: delivered, fxCode: artifact.fxCode, metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints, randomSeed: 7, fidelity })
}
const frameAt = (timeMs: number): Rgb[] => runtime().advanceTo(timeMs, { stepMs: 33 }).pixels

const ice = ([r, , b]: Rgb) => b > r + 0.02
const white = ([r, g, b]: Rgb) => Math.min(r, g, b) > 0.5 && Math.max(r, g, b) - Math.min(r, g, b) < 0.15
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const lum = ([r, g, b]: Rgb) => 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b)
const share = (pixels: Rgb[], test: (rgb: Rgb) => boolean) => pixels.filter(test).length / pixels.length
const fireShare = (pixels: Rgb[]) => 1 - share(pixels, ice)

/** Ownership-boundary edges between 4-neighbours on the plane grid. */
function boundaryEdges(pixels: Rgb[]): number {
  const owner = new Map(cells.map(([x, y], index) => [`${x},${y}`, ice(pixels[index])]))
  let edges = 0
  for (const [x, y] of cells) {
    const here = owner.get(`${x},${y}`)
    if (x + 1 < GRID && owner.get(`${x + 1},${y}`) !== here) edges++
    if (y + 1 < GRID && owner.get(`${x},${y + 1}`) !== here) edges++
  }
  return edges
}

/** Mean per-pixel RGB change between two frames over the rows `keep` selects. */
function change(a: Rgb[], b: Rgb[], keep: (y: number) => boolean): number {
  let total = 0, count = 0
  a.forEach((rgb, index) => {
    if (!keep(mapPoints[index].sample[1])) return
    total += Math.abs(rgb[0] - b[index][0]) + Math.abs(rgb[1] - b[index][1]) + Math.abs(rgb[2] - b[index][2])
    count++
  })
  return total / count
}

describe('Ember & Floe portable show (#1199)', () => {
  const catalogue = stockShowCatalogueById(ID)
  const record = stockShowV2ById(ID)

  it('is catalogued as the third Portable Show: two ZRanger1 voices on two Zones of the plane', () => {
    expect(catalogue).toMatchObject({ name: 'Ember & Floe', track: 'portable', collection: 'portable-shows', order: 3 })
    expect(catalogue!.note.notice).toContain('ZRanger1')
    expect(record!.stageMapId).toBe('plane')
    expect(record!.outputContract).toEqual(portableOutputContract())
    expect(record!.composition.executionModel).toBe('continuous')
    expect(record!.composition.showEndMs).toBe(90_000)
    expect(record!.composition.patternInstances.map((entry) => entry.patternName)).toEqual(['MetaballsOfFire2D', 'IceFloes2D'])
    expect(record!.zoneLayouts.map((layout) => layout.name)).toEqual(['Front', 'Buckle', 'Teeth', 'Shatter 4', 'Shatter 8', 'Shoreline'])
    expect(record!.composition.markers.filter((marker) => marker.role === 'chapter').map((marker) => [marker.timeMs, marker.name]))
      .toEqual([[0, 'Cold'], [10_000, 'Front'], [30_000, 'Buckle'], [40_000, 'Shatter'], [50_000, 'Blaze'], [60_000, 'Shoreline'], [80_000, 'Thaw']])
  })

  it('compiles deterministically inside the delivered-artifact, globals and array-word budgets', () => {
    const resources = artifact.summary.resources
    expect(resources.blockers).toEqual([])
    // The issue budget; the build measured 47,827 B, 57 globals and 6,048 words.
    expect(resources.artifactBytes).toBeLessThan(68_384)
    expect(resources.persistentGlobals).toBeLessThan(256)
    expect(resources.totalWords).toBeLessThanOrEqual(10_240)
    expect(compiled().artifact.code).toBe(artifact.code)
  })

  it('reopens unchanged from its exported .pxlshow, with no user content to carry', async () => {
    const { filename, bundle: file } = buildShowFileBundle(record!, { patterns: [], maps: [] }, { appVersion: 'ember-floe-test', exportedAt: '2026-10-22T00:00:00.000Z' })
    expect(filename).toBe('ember-floe.pxlshow')
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(file), { acceptV2: true })
    expect(reopened.version).toBe(2)
    if (reopened.version !== 2) return
    expect(reopened.show).toEqual(record)
    expect(validateShowRecordV2(reopened.show)).toEqual([])
    expect([reopened.patterns, reopened.maps, reopened.libraries]).toEqual([[], [], []])
  })

  it('holds five blobs in Precise mode until the white hit, then blazes to eight (#1197)', () => {
    const replay = runtime('fidelity')
    const failures: { timeMs: number; count: number }[] = []
    for (let t = 1_000; t <= 49_900; t += 100) {
      const result = replay.advanceTo(t, { stepMs: 33 })
      // c0 is clip-ember, the first clip.
      const count = Number(result.exports.__pxlblz_show_c0_numPoints) / 65536
      if (count !== 5) failures.push({ timeMs: t, count })
    }
    const firstFailure = failures[0]
    expect(firstFailure?.count ?? 5, `${firstFailure?.timeMs ?? 49_900} ms`).toBe(5)
    const result = replay.advanceTo(50_100, { stepMs: 33 })
    expect(Number(result.exports.__pxlblz_show_c0_numPoints) / 65536, '50100 ms').toBe(8)
  }, 120_000)

  describe('flash limit over the delivered score', () => {
    const frames: { t: number; pixels: Rgb[] }[] = []
    beforeAll(() => {
      const replay = runtime()
      for (let n = 0; n < 2700; n++) {
        const t = n * (1000 / 30)
        frames.push({ t, pixels: replay.advanceTo(t, { stepMs: 1000 / 30 }).pixels })
      }
    }, 180_000)

    // Port of telemetry/harness.ts's contrast-qualified extremum detector.
    function flashWindows(sampled: { pixels: Rgb[] }[]) {
      const direction = new Int8Array(mapPoints.length)
      const extremum = new Float64Array(mapPoints.length)
      const previous = new Float64Array(mapPoints.length)
      const transitions = new Uint16Array(mapPoints.length)
      const windows: { second: number; fraction: number }[] = []
      sampled.forEach(({ pixels }, frame) => {
        pixels.forEach((rgb, index) => {
          const value = lum(rgb)
          if (frame === 0) extremum[index] = value
          else {
            const step = value - previous[index]
            const nextDirection = step > 0 ? 1 : step < 0 ? -1 : 0
            if (nextDirection !== 0) {
              if (direction[index] === 0) direction[index] = nextDirection
              else if (nextDirection !== direction[index]) {
                if (Math.abs(previous[index] - extremum[index]) >= 0.1) transitions[index]++
                extremum[index] = previous[index]
                direction[index] = nextDirection
              }
            }
          }
          previous[index] = value
        })
        if ((frame + 1) % 30 === 0) {
          const violating = Array.from(transitions).filter(n => n / 2 > 3 && n / 2 <= 15).length
          windows.push({ second: Math.floor(frame / 30), fraction: violating / mapPoints.length })
          transitions.fill(0)
        }
      })
      return windows
    }

    it('limits flashing area in every second of the 90 s score', () => {
      const windows = flashWindows(frames)
      // #1199 measured worst flash window: second 52, fraction 2 / 1936 = 0.0010330578512396695.
      for (const window of windows) expect(window.fraction, `second ${window.second}`).toBeLessThanOrEqual(0.25)
    })

    it('shows Stage-wide white only inside the 50.00-51.25 s hit', () => {
      // #1199 measured largest out-of-hit white share: 9 / 1936 = 0.0046487603305785125 at 87233.33333333334 ms.
      for (const { t, pixels } of frames) {
        if (t < 50_000 || t > 51_250) expect(share(pixels, white), `${t} ms`).toBeLessThan(0.01)
      }
      const nearest = frames.reduce((closest, frame) => Math.abs(frame.t - 50_000) < Math.abs(closest.t - 50_000) ? frame : closest)
      expect(share(nearest.pixels, white), `${nearest.t} ms`).toBeGreaterThan(0.9)
    })

    it('detects a synthetic flash, so the limit is not vacuous', () => {
      const synthetic = Array.from({ length: 30 }, (_, n) => ({
        pixels: mapPoints.map(() => Array(3).fill(Math.floor(n / 3) % 2)),
      }))
      expect(flashWindows(synthetic)).toEqual([{ second: 0, fraction: 1 }])
    })
  })

  describe('rendered score', () => {
    const frames = new Map<number, Rgb[]>()
    const at = (timeMs: number) => frames.get(timeMs)!
    beforeAll(() => {
      const sampled = [5_000, 7_400, 7_600, 12_400, 13_000, 21_000, 28_750, 32_000, 37_000, 42_000, 47_000,
        49_900, 50_000, 50_600, 51_300, 55_000, 59_500, 59_700, 59_900, 60_100, 75_000, 89_500, 89_700, 89_900, 90_100]
      const replay = runtime()
      for (const timeMs of sampled) frames.set(timeMs, replay.advanceTo(timeMs, { stepMs: 33 }).pixels)
    }, 60_000)

    it('opens cold: ice owns the whole Stage until the first step at 7.5 s', () => {
      expect(fireShare(at(5_000))).toBe(0)
      expect(fireShare(at(7_400))).toBe(0)
      expect(fireShare(at(7_600))).toBeGreaterThan(0.06)
    })

    it('moves the front in held steps: the fire share matches the key table on and between keys', () => {
      // One grid column is 1/44 of the Stage, so the tolerance is one column.
      for (const [timeMs, position] of [[7_600, 0.08], [12_400, 0.2], [13_000, 0.32], [21_000, 0.52], [28_750, 0.5]]) {
        expect(fireShare(at(timeMs)), `${timeMs} ms`).toBeCloseTo(position, 1)
        expect(Math.abs(fireShare(at(timeMs)) - position), `${timeMs} ms`).toBeLessThanOrEqual(1 / GRID)
      }
    })

    it('lengthens the front at every escalation: Front, Buckle, Teeth, Shatter 4, Shatter 8', () => {
      const edges = [28_750, 32_000, 37_000, 42_000, 47_000].map((timeMs) => boundaryEdges(at(timeMs)))
      expect(edges).toEqual([44, 120, 238, 264, 616])
    })

    it('detonates once: white across the Stage at 50 s and nowhere outside 50.00-51.25 s', () => {
      expect(share(at(50_000), white)).toBe(1)
      for (const timeMs of [49_900, 50_600, 51_300, 55_000, 75_000, 89_900]) {
        expect(share(at(timeMs), white), `${timeMs} ms`).toBeLessThan(0.01)
      }
    })

    it('gives fire the whole Stage from the blaze until the shoreline', () => {
      for (const timeMs of [51_300, 55_000, 59_900]) expect(share(at(timeMs), ice), `${timeMs} ms`).toBe(0)
    })

    it('raises ice from the bottom edge as a soft shoreline and thaws back to cold', () => {
      const iceBelow = (pixels: Rgb[], y: number) => pixels.filter((_, index) => mapPoints[index].sample[1] >= y).every(ice)
      const iceAbove = (pixels: Rgb[], y: number) => pixels.some((rgb, index) => mapPoints[index].sample[1] < y && ice(rgb))
      expect(iceBelow(at(60_100), 0.95)).toBe(true)
      expect(iceAbove(at(60_100), 0.8)).toBe(false)
      expect(iceBelow(at(75_000), 0.75)).toBe(true)
      expect(iceBelow(at(89_900), 0.2)).toBe(true)
    })

    it('carries both voices across the 60 s seam and the loop without a jump', () => {
      const upper = (y: number) => y < 0.75
      const lower = (y: number) => y > 0.25
      // A seam may change no more than ordinary motion over the same 200 ms.
      expect(change(at(59_900), at(60_100), upper)).toBeLessThan(1.25 * change(at(59_500), at(59_700), upper))
      expect(change(at(89_900), at(90_100), lower)).toBeLessThan(1.25 * change(at(89_500), at(89_700), lower))
      // Sensitivity: a restarted replay at the loop differs far more.
      expect(change(at(89_900), frameAt(100), lower)).toBeGreaterThan(2 * change(at(89_500), at(89_700), lower))
    })
  })
})
