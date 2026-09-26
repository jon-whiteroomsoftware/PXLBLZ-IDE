import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { stockShowCatalogueById } from '@/pixelblaze/stock/showCatalogueV2'
import { resolveShowV2StageMap } from '@/store/showV2StageMap'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { installationOutputContract } from '@/pixelblaze/stock/showsV2Authoring'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from './showFileBundle'
import { validateShowRecordV2 } from './showCompositionV2'

// #1137: Black Sun plays a 120 BPM black hole on the Eclipse Dome (#1135):
// a 400-LED spiral-wound dome inside a 90-LED halo. These contracts read the
// score off rendered frames on the real map, at the issue's acceptance times,
// replaying the exported .epe as its importer reopens it.

const ID = 'stock-show-installation-black-sun'
const DOME = [0, 399] as const
const HALO = [400, 489] as const

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
const points = bundle.presentation.layout.mapPoints.map((point) => point.sample as [number, number])

// Dome geometry in Stage coordinates, read off the map rather than restated.
const haloXs = points.slice(HALO[0]).map(([x]) => x)
const haloYs = points.slice(HALO[0]).map(([, y]) => y)
const centre = [(Math.min(...haloXs) + Math.max(...haloXs)) / 2, (Math.min(...haloYs) + Math.max(...haloYs)) / 2]
const radius = ([x, y]: [number, number]) => Math.hypot(x - centre[0], y - centre[1])
const domeRadius = Math.max(...points.slice(0, DOME[1] + 1).map(radius))

function frameAt(timeMs: number): Rgb[] {
  const runtime = createFastReplayRuntime({
    code: delivered, fxCode: artifact.fxCode, metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: bundle.presentation.layout.mapPoints, randomSeed: 7, fidelity: 'fast' })
  return runtime.advanceTo(timeMs, { stepMs: 50 }).pixels
}

const sum = ([r, g, b]: Rgb) => r + g + b
const lit = (rgb: Rgb) => sum(rgb) > 0.05
const dark = (rgb: Rgb) => sum(rgb) < 0.02
const neutral = ([r, g, b]: Rgb) => Math.max(r, g, b) - Math.min(r, g, b) < 0.15 * Math.max(r, g, b)

function dome(pixels: Rgb[]) {
  return pixels.slice(0, DOME[1] + 1).map((rgb, index) => ({ rgb, point: points[index] }))
}
function halo(pixels: Rgb[]) {
  return pixels.slice(HALO[0], HALO[1] + 1)
}
/** Distance from the dome centre in dome radii. */
const rel = (point: [number, number]) => radius(point) / domeRadius
const violet = ([r, g, b]: Rgb) => b > r && r > g && b > 2 * g
const cyan = ([r, g, b]: Rgb) => g > 3 * r && b > 3 * r
const white = (rgb: Rgb) => neutral(rgb) && sum(rgb) > 2.4
const litDome = (pixels: Rgb[]) => dome(pixels).filter(({ rgb }) => lit(rgb))

function expectHaloViolet(pixels: Rgb[], timeMs: number) {
  const shown = halo(pixels).filter(lit)
  expect(shown.length, `${timeMs} ms`).toBeGreaterThan(5)
  expect(shown.every(violet), `${timeMs} ms`).toBe(true)
}

describe('Black Sun Installation show (#1137)', () => {
  const catalogue = stockShowCatalogueById(ID)
  const record = stockShowV2ById(ID)

  it('is catalogued as the fourth installation: four Luma instances on one Zone over the Eclipse Dome', () => {
    expect(catalogue).toMatchObject({ name: 'Black Sun Installation', track: 'installation', collection: 'installations', order: 4 })
    expect(record!.name).toBe('Black Sun Installation')
    expect(record!.stageMapId).toBe('eclipse-dome-2d')
    expect(record!.outputContract).toEqual(installationOutputContract('eclipse-dome-2d', 490))
    expect(record!.composition.executionModel).toBe('continuous')
    expect(record!.composition.showEndMs).toBe(64_000)
    expect(record!.composition.patternInstances.map((entry) => entry.patternName)).toEqual(['LumaPinwheel', 'LumaPinwheel', 'LumaRings', 'LumaSpiral'])
    expect(record!.zoneLayouts).toHaveLength(1)
    expect(record!.composition.markers.filter((marker) => marker.role === 'chapter').map((marker) => [marker.timeMs, marker.name]))
      .toEqual([[0, 'Event horizon'], [8_000, 'Escape'], [24_000, 'Vacuum'], [36_000, 'Spiral'], [52_000, 'Lock'], [62_000, 'Close']])
  })

  it('compiles deterministically inside the delivered-artifact and globals budgets', () => {
    const resources = artifact.summary.resources
    expect(resources.blockers).toEqual([])
    // The issue budget; the prototype measured 47,348 B and 200 globals.
    expect(resources.artifactBytes).toBeLessThan(68_384)
    expect(resources.persistentGlobals).toBeLessThan(256)
    expect(compiled().artifact.code).toBe(artifact.code)
  })

  it('reopens unchanged from its exported .pxlshow, with no user content to carry', async () => {
    const { filename, bundle: file } = buildShowFileBundle(record!, { patterns: [], maps: [] }, { appVersion: 'black-sun-test', exportedAt: '2026-09-25T00:00:00.000Z' })
    expect(filename).toBe('black-sun-installation.pxlshow')
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(file), { acceptV2: true })
    expect(reopened.version).toBe(2)
    if (reopened.version !== 2) return
    expect(reopened.show).toEqual(record)
    expect(validateShowRecordV2(reopened.show)).toEqual([])
    expect([reopened.patterns, reopened.maps, reopened.libraries]).toEqual([[], [], []])
  })

  it('opens with a dark dome and violet halo comets at 4 s', () => {
    const timeMs = 4_000
    const pixels = frameAt(timeMs)
    expect(dome(pixels).every(({ rgb }) => dark(rgb)), `${timeMs} ms`).toBe(true)
    expectHaloViolet(pixels, timeMs)
  })

  it('lets violet rings escape a black disc at 10 s', () => {
    const timeMs = 10_000
    const pixels = frameAt(timeMs)
    expect(dome(pixels).filter(({ point }) => rel(point) < 0.27).every(({ rgb }) => dark(rgb)), `${timeMs} ms`).toBe(true)
    expect(litDome(pixels).filter(({ point }) => rel(point) > 0.33).length, `${timeMs} ms`).toBeGreaterThan(10)
    expect(litDome(pixels).every(({ rgb }) => violet(rgb)), `${timeMs} ms`).toBe(true)
    expectHaloViolet(pixels, timeMs)
  })

  it('holds a violet photon ring in the vacuum at 28 s', () => {
    const timeMs = 28_000
    const pixels = frameAt(timeMs)
    const shown = litDome(pixels)
    expect(shown.length, `${timeMs} ms`).toBeGreaterThan(10)
    expect(shown.every(({ rgb, point }) => violet(rgb) && rel(point) <= 0.45), `${timeMs} ms`).toBe(true)
    expect(dome(pixels).filter(({ point }) => rel(point) < 0.25).every(({ rgb }) => dark(rgb)), `${timeMs} ms`).toBe(true)
    expect(halo(pixels).every(dark), `${timeMs} ms`).toBe(true)
  })

  for (const timeMs of [38_000, 44_000]) {
    it(`turns a cyan spiral outside the black disc at ${timeMs / 1_000} s`, () => {
      const pixels = frameAt(timeMs)
      expect(dome(pixels).filter(({ point }) => rel(point) < 0.27).every(({ rgb }) => dark(rgb)), `${timeMs} ms`).toBe(true)
      const shown = litDome(pixels)
      expect(shown.length, `${timeMs} ms`).toBeGreaterThan(20)
      expect(shown.every(({ rgb }) => cyan(rgb)), `${timeMs} ms`).toBe(true)
      expectHaloViolet(pixels, timeMs)
    })
  }

  it('closes the iris in four beat-locked steps', () => {
    for (const [startMs, radius] of [[52_000, 0.3], [54_000, 0.225], [56_000, 0.15], [58_000, 0.075]]) {
      for (let k = 0; k < 8; k++) {
        const timeMs = startMs + 250 * k
        const shown = litDome(frameAt(timeMs))
        expect.soft(shown.every(({ point }) => rel(point) >= radius - 0.03), `${timeMs} ms`).toBe(true)
      }
    }
    for (const timeMs of [53_000, 57_000, 60_000]) {
      const pixels = frameAt(timeMs)
      const shown = litDome(pixels)
      if (timeMs === 53_000) {
        expect(dome(pixels).filter(({ point }) => rel(point) < 0.27).every(({ rgb }) => dark(rgb)), `${timeMs} ms`).toBe(true)
      } else if (timeMs === 57_000) {
        expect(dome(pixels).filter(({ point }) => rel(point) < 0.13).every(({ rgb }) => dark(rgb)), `${timeMs} ms`).toBe(true)
        expect(shown.some(({ point }) => rel(point) < 0.27), `${timeMs} ms`).toBe(true)
      } else {
        expect(shown.some(({ point }) => rel(point) < 0.13), `${timeMs} ms`).toBe(true)
      }
      expectHaloViolet(pixels, timeMs)
    }
  }, 15_000)

  it('closes on an all-white hit at 62.1 s', () => {
    const timeMs = 62_100
    const pixels = frameAt(timeMs)
    expect(pixels, `${timeMs} ms`).toHaveLength(490)
    expect(pixels.every(white), `${timeMs} ms`).toBe(true)
  })

  it('leaves every pixel dark at 63 s', () => {
    const timeMs = 63_000
    const pixels = frameAt(timeMs)
    expect(pixels, `${timeMs} ms`).toHaveLength(490)
    expect(pixels.every(dark), `${timeMs} ms`).toBe(true)
  })
})
