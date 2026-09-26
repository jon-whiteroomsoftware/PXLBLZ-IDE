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

// #1136: Totality plays a solar eclipse on the Eclipse Dome (#1135): a 400-LED
// spiral-wound dome inside a 90-LED halo. One gold-tinted LumaCells instance is
// the sun; the moon is an inverted Aperture stepping across it; the halo holds
// back until the diamond ring. These contracts read the score off rendered
// frames on the real map, at the times the issue's acceptance table names,
// replaying the exported .epe as its importer reopens it.

const ID = 'stock-show-installation-totality'
const DOME = [0, 399] as const
const HALO = [400, 489] as const
// Moon diameter in dome diameters; its Aperture x is the moon's left edge.
const MOON = 1.04

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
/** Dome-relative horizontal position: 0 at the left rim, 1 at the right. */
const across = ([x]: [number, number]) => (x - (centre[0] - domeRadius)) / (2 * domeRadius)

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
const warm = ([r, g, b]: Rgb) => r >= g && g >= b && r > b
const neutral = ([r, g, b]: Rgb) => Math.max(r, g, b) - Math.min(r, g, b) < 0.15 * Math.max(r, g, b)
const coolWhite = ([r, g, b]: Rgb) => b >= g - 0.02 && g >= r - 0.02 && r > 0.5 * b
const red = ([r, g, b]: Rgb) => r > 3 * g && r > 3 * b

function dome(pixels: Rgb[]) {
  return pixels.slice(0, DOME[1] + 1).map((rgb, index) => ({ rgb, point: points[index] }))
}
function halo(pixels: Rgb[]) {
  return pixels.slice(HALO[0], HALO[1] + 1)
}
const fraction = <T>(items: readonly T[], test: (item: T) => boolean) => items.filter(test).length / items.length
const meanAcross = (items: readonly { point: [number, number] }[]) =>
  items.reduce((total, { point }) => total + across(point), 0) / items.length

/** Whether a dome point sits inside the moon, by `margin` dome diameters, when its left edge is at `edge`. */
function underMoon(point: [number, number], edge: number, margin: number) {
  const centreAcross = edge + MOON / 2
  const dx = across(point) - centreAcross
  const dy = (point[1] - centre[1]) / (2 * domeRadius)
  return Math.hypot(dx, dy) < MOON / 2 - margin
}

describe('Totality Installation show (#1136)', () => {
  const catalogue = stockShowCatalogueById(ID)
  const record = stockShowV2ById(ID)

  it('is catalogued as the third installation: one LumaCells instance on one Zone over the Eclipse Dome', () => {
    expect(catalogue).toMatchObject({ name: 'Totality Installation', track: 'installation', collection: 'installations', order: 3 })
    expect(record!.name).toBe('Totality Installation')
    expect(record!.stageMapId).toBe('eclipse-dome-2d')
    expect(record!.outputContract).toEqual(installationOutputContract('eclipse-dome-2d', 490))
    expect(record!.composition.executionModel).toBe('continuous')
    expect(record!.composition.showEndMs).toBe(72_000)
    expect(record!.composition.patternInstances.map((entry) => entry.patternName)).toEqual(['LumaCells'])
    expect(record!.zoneLayouts).toHaveLength(1)
    expect(record!.composition.markers.filter((marker) => marker.role === 'chapter').map((marker) => [marker.timeMs, marker.name]))
      .toEqual([[0, 'Sun'], [12_000, 'First contact'], [31_500, 'Diamond ring'], [32_500, 'Totality'], [48_000, 'Third contact'], [49_000, 'Release']])
  })

  it('compiles deterministically inside the delivered-artifact and globals budgets', () => {
    const resources = artifact.summary.resources
    expect(resources.blockers).toEqual([])
    // The accepted budget trade (#1136): the diamond is the sun's own last
    // sliver, not a separate bead Clip, which keeps the score to three time
    // sections. The prototype measured 54,188 B and 72 globals.
    expect(resources.artifactBytes).toBeLessThan(60_000)
    expect(resources.persistentGlobals).toBeLessThan(100)
    expect(compiled().artifact.code).toBe(artifact.code)
  })

  it('reopens unchanged from its exported .pxlshow, with no user content to carry', async () => {
    const { filename, bundle: file } = buildShowFileBundle(record!, { patterns: [], maps: [] }, { appVersion: 'totality-test', exportedAt: '2026-09-25T00:00:00.000Z' })
    expect(filename).toBe('totality-installation.pxlshow')
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(file), { acceptV2: true })
    expect(reopened.version).toBe(2)
    if (reopened.version !== 2) return
    expect(reopened.show).toEqual(record)
    expect(validateShowRecordV2(reopened.show)).toEqual([])
    expect([reopened.patterns, reopened.maps, reopened.libraries]).toEqual([[], [], []])
  })

  it('opens on a full boiling gold sun with the halo dark', () => {
    const pixels = frameAt(6_000)
    const sun = dome(pixels)
    expect(fraction(sun, ({ rgb }) => lit(rgb))).toBeGreaterThan(0.95)
    expect(sun.filter(({ rgb }) => lit(rgb)).every(({ rgb }) => warm(rgb))).toBe(true)
    // Boiling: the cells give the surface real contrast, not a flat fill.
    const sums = sun.map(({ rgb }) => sum(rgb))
    expect(Math.max(...sums) - Math.min(...sums)).toBeGreaterThan(0.8)
    expect(halo(pixels).every(dark)).toBe(true)
  })

  it('advances the moon in stair steps, holding between steps', () => {
    for (const [edge, holdStart, holdEnd, nextEdge] of [[0.8, 14_200, 16_800, 0.6], [0.6, 19_200, 21_800, 0.4], [0.4, 24_200, 26_800, 0.16]] as const) {
      for (const timeMs of [holdStart, holdEnd]) {
        const sun = dome(frameAt(timeMs))
        const covered = sun.filter(({ point }) => underMoon(point, edge, 0.02))
        expect(covered.length, `${timeMs} ms`).toBeGreaterThan(20)
        expect(covered.every(({ rgb }) => dark(rgb)), `${timeMs} ms`).toBe(true)
        // Still held: the band the next step will take is still sun.
        const band = sun.filter(({ point }) => underMoon(point, nextEdge, 0.02) && !underMoon(point, edge, -0.02))
        expect(fraction(band, ({ rgb }) => lit(rgb)), `${timeMs} ms`).toBeGreaterThan(0.9)
      }
    }
  })

  it('leaves a gibbous sun on the left at 20 s', () => {
    const sun = dome(frameAt(20_000))
    expect(fraction(sun.filter(({ point }) => across(point) < 0.3), ({ rgb }) => lit(rgb))).toBeGreaterThan(0.9)
    // The moon is a disc, so its bite is a lens on the right, not a strip:
    // the rim above and below it stays sun.
    const bitten = sun.filter(({ rgb }) => dark(rgb))
    expect(bitten.length / sun.length).toBeGreaterThan(0.2)
    expect(bitten.every(({ point }) => across(point) > 0.55)).toBe(true)
  })

  it('thins to a gold crescent on the left at 30 s', () => {
    const pixels = frameAt(30_000)
    const shown = dome(pixels).filter(({ rgb }) => lit(rgb))
    expect(shown.length).toBeGreaterThan(3)
    expect(shown.length).toBeLessThan(0.3 * 400)
    // A crescent: its horns follow the rim towards the middle, its body hugs
    // the left limb.
    expect(shown.every(({ point }) => across(point) < 0.5)).toBe(true)
    expect(meanAcross(shown)).toBeLessThan(0.25)
    expect(shown.every(({ rgb }) => warm(rgb))).toBe(true)
    expect(halo(pixels).every(dark)).toBe(true)
  })

  for (const [timeMs, side] of [[31_900, 'left'], [48_300, 'right']] as const) {
    it(`flashes the diamond ring on the ${side} at ${timeMs / 1_000} s: a white bead and a white halo`, () => {
      const pixels = frameAt(timeMs)
      // A sliver: the moon leaves only the dome's outermost turn uncovered.
      const sliver = dome(pixels).filter(({ rgb }) => lit(rgb))
      expect(sliver.every(({ point }) => radius(point) > 0.9 * domeRadius)).toBe(true)
      expect(sliver.length).toBeLessThan(0.1 * 400)
      expect(sliver.every(({ rgb }) => neutral(rgb))).toBe(true)
      // The bead is the sliver's bright core, within 45 degrees of the limb's
      // west or east point; only faint horn remnants lie farther round.
      const limb = 0.5 - 0.5 * Math.SQRT1_2
      const bead = sliver.filter(({ rgb }) => Math.max(...rgb) > 0.5)
      expect(bead.length).toBeGreaterThan(0)
      expect(bead.every(({ point }) => side === 'left' ? across(point) < limb : across(point) > 1 - limb)).toBe(true)
      const ring = halo(pixels)
      expect(fraction(ring, lit)).toBeGreaterThan(0.5)
      expect(ring.filter(lit).every((rgb) => coolWhite(rgb) && Math.max(...rgb) > 0.6)).toBe(true)
    })
  }

  for (const timeMs of [34_000, 42_000]) {
    it(`holds totality at ${timeMs / 1_000} s: red prominences at the rim, a black interior and a cool-white corona`, () => {
      const pixels = frameAt(timeMs)
      const sun = dome(pixels)
      expect(sun.filter(({ point }) => radius(point) < 0.75 * domeRadius).every(({ rgb }) => dark(rgb))).toBe(true)
      const rim = sun.filter(({ point, rgb }) => radius(point) > 0.85 * domeRadius && lit(rgb))
      expect(rim.length).toBeGreaterThan(5)
      expect(rim.every(({ rgb }) => red(rgb))).toBe(true)
      // No gold survives anywhere on the dome.
      expect(sun.filter(({ rgb }) => lit(rgb) && warm(rgb) && !red(rgb))).toHaveLength(0)
      const corona = halo(pixels).filter(lit)
      expect(corona.length / (HALO[1] - HALO[0] + 1)).toBeGreaterThan(0.3)
      expect(corona.every(coolWhite)).toBe(true)
    })
  }

  it('releases to a gold crescent on the right at 49.5 s with the halo dark', () => {
    const pixels = frameAt(49_500)
    const shown = dome(pixels).filter(({ rgb }) => lit(rgb))
    expect(shown.length).toBeGreaterThan(3)
    expect(shown.every(({ point }) => across(point) > 0.5)).toBe(true)
    expect(meanAcross(shown)).toBeGreaterThan(0.75)
    expect(shown.every(({ rgb }) => warm(rgb))).toBe(true)
    expect(halo(pixels).every(dark)).toBe(true)
  })

  it('returns the sun from the right at 60 s', () => {
    const pixels = frameAt(60_000)
    const sun = dome(pixels)
    expect(fraction(sun.filter(({ point }) => across(point) > 0.75), ({ rgb }) => lit(rgb))).toBeGreaterThan(0.9)
    expect(fraction(sun.filter(({ point }) => across(point) < 0.1), ({ rgb }) => lit(rgb))).toBeLessThan(0.1)
    expect(sun.filter(({ rgb }) => lit(rgb)).every(({ rgb }) => warm(rgb))).toBe(true)
    expect(halo(pixels).every(dark)).toBe(true)
  })
})
