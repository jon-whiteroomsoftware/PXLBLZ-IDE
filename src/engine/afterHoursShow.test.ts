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
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { nativeStockSourceLookupV2 } from '@/pixelblaze/stock/showsV2Compile'
import { LIBRARIES } from '@/pixelblaze/libs'

const ID = 'stock-show-installation-after-hours'
const record = stockShowV2ById(ID)!
const ranges = [[0, 49], [50, 109], [110, 169], [170, 236], [237, 377], [378, 393], [394, 409], [410, 425], [426, 441]] as const
type Rgb = number[]
const capture = captureShowStageEditV2(record, {
  patterns: [], libraries: [], maps: [], profiles: [], stageMap: resolveShowV2StageMap(record.stageMapId, []),
})
if (capture.prepared.status !== 'ready') throw new Error('After Hours failed preparation')
const bundle = capture.prepared.bundle
const artifact = bundle.artifact
const exported = buildShowEpeExportV2(record, artifact.code)
if (exported.status !== 'exported') throw new Error(exported.message)
const delivered = parseEpe(exported.text).src
const runtimeFor = () => createFastReplayRuntime({
  code: delivered, fxCode: artifact.fxCode, metadata: artifact.metadata,
  dimension: nativeDimension(artifact.metadata.renderFns),
}, { mapPoints: bundle.presentation.layout.mapPoints, randomSeed: 7, fidelity: 'fast' })
const frameAt = (t: number, stepMs = 50) => runtimeFor().advanceTo(t, { stepMs }).pixels
const zone = (pixels: Rgb[], n: number) => pixels.slice(ranges[n][0], ranges[n][1] + 1)
const sum = ([r, g, b]: Rgb) => r + g + b
const lit = (rgb: Rgb) => sum(rgb) > 0.05
const dark = (rgb: Rgb) => sum(rgb) < 0.02
const red = ([r, g, b]: Rgb) => r > 5 * g && r > 5 * b
const blue = ([r, g, b]: Rgb) => b > r && b > g
const white = (rgb: Rgb) => lit(rgb) && Math.max(...rgb) - Math.min(...rgb) < 0.1 * Math.max(...rgb)
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const lum = ([r, g, b]: Rgb) => 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b)
const meanLum = (pixels: Rgb[]) => pixels.reduce((total, rgb) => total + lum(rgb), 0) / pixels.length
const borderIndices = (pixels: Rgb[]) => zone(pixels, 4).flatMap((rgb, n) => lit(rgb) ? [n] : [])
function expectZone(t: number, n: number, predicate: (rgb: Rgb) => boolean) {
  expect(zone(frameAt(t), n).every(predicate), `zone ${n + 1} at ${t}`).toBe(true)
}
function expectEqual(a: Rgb[], b: Rgb[]) {
  expect(a).toHaveLength(b.length)
  expect(Math.max(...a.flatMap((rgb, i) => rgb.map((v, c) => Math.abs(v - b[i][c]))))).toBeLessThan(1e-9)
}

// One delivered-source runtime, sampled continuously at 30 fps, shared by
// uniformity, seek and flash assertions so they inspect the same performance.
const continuous = runtimeFor()
const frames = Array.from({ length: 2880 }, (_, n) => {
  const t = n * (1000 / 30)
  return { t, pixels: continuous.advanceTo(t, { stepMs: 1000 / 30 }).pixels }
})

// Port of telemetry/harness.ts's contrast-qualified extremum detector.
function flashWindows() {
  const direction = new Int8Array(442)
  const extremum = new Float64Array(442)
  const previous = new Float64Array(442)
  const transitions = new Uint16Array(442)
  const windows: { second: number, fraction: number }[] = []
  frames.forEach(({ pixels }, frame) => {
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
      windows.push({ second: Math.floor(frame / 30), fraction: violating / 442 })
      transitions.fill(0)
    }
  })
  return windows
}

describe('After Hours delivered Installation Show (#1196)', () => {
  it('validates, reopens unchanged and fits one time section and the artifact budgets', async () => {
    expect(validateShowRecordV2(record)).toEqual([])
    const file = buildShowFileBundle(record, { patterns: [], maps: [] }, { appVersion: 'after-hours-test', exportedAt: '2026-10-21T00:00:00.000Z' })
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(file.bundle), { acceptV2: true })
    expect(reopened.version).toBe(2)
    if (reopened.version !== 2) throw new Error('wrong export version')
    expect(reopened.show).toEqual(record)
    expect(capture.prepared.status).toBe('ready')
    const prepared = prepareShowV2ForCompile(record, nativeStockSourceLookupV2(record), { libraries: LIBRARIES })
    expect(prepared.status).toBe('ready')
    if (prepared.status !== 'ready') throw new Error('compile refused')
    expect(prepared.provenance.derivedSceneIds).toHaveLength(1)
    const resources = artifact.summary.resources
    // #1196 recensus: shared healthy-tube Effect IDs remove duplicate generated state/code;
    // measured artifactBytes 42,871; persistentGlobals 117; totalWords 1,338;
    // remainingWords 8,902; time sections 1.
    expect(resources.blockers).toEqual([])
    expect(resources.artifactBytes).toBeLessThan(68_384)
    expect(resources.persistentGlobals).toBeLessThan(256)
    expect(resources.totalWords).toBeLessThanOrEqual(10_240)
  })

  it('is catalogued as an installation on the 442-LED sign', () => {
    expect(stockShowCatalogueById(ID)).toMatchObject({ collection: 'installations', order: 5 })
    expect(record.outputContract).toEqual(installationOutputContract('after-hours-sign', 442))
    expect(record.composition.clips).toHaveLength(9)
    expect(record.composition.propertyTracks).toHaveLength(18)
    expect(record.composition.patternInstances).toHaveLength(3)
  })

  it('ignites in reading order', () => {
    expect(frameAt(1000).every(dark)).toBe(true)
    for (const [n, off, on] of [[0, 3900, 4100], [1, 5900, 6100], [3, 7900, 8100]]) {
      expectZone(off, n, dark)
      expectZone(on, n, rgb => lit(rgb) && red(rgb))
    }
    expectZone(11900, 4, dark)
    const bulbs = zone(frameAt(12100), 4).filter(lit)
    expect(bulbs.length).toBeGreaterThan(0)
    expect(bulbs.every(blue)).toBe(true)
    expectZone(1900, 2, dark)
    expectZone(14000, 2, rgb => lit(rgb) && red(rgb))
  })

  it('holds red letters above a blue every-third-bulb border at 28 s', () => {
    const pixels = frameAt(28000)
    for (const n of [0, 1, 2, 3]) expect(zone(pixels, n).every(rgb => lit(rgb) && red(rgb))).toBe(true)
    const indices = borderIndices(pixels)
    expect(indices).toHaveLength(47)
    expect(indices.slice(1).every((value, n) => value - indices[n] === 3)).toBe(true)
    const bulbs = zone(pixels, 4).filter(lit)
    expect(bulbs.every(blue)).toBe(true)
    expect(meanLum(bulbs)).toBeLessThan(meanLum(pixels.slice(0, 237)))
    for (const n of [5, 6, 7, 8]) expect(zone(pixels, n).every(dark)).toBe(true)
  })

  it('marches the chase one bulb each 250 ms', () => {
    const sets = [20000, 20250, 20500].map(t => borderIndices(frameAt(t)))
    sets.forEach(indices => expect(indices).toHaveLength(47))
    for (let n = 1; n < sets.length; n++) expect(sets[n]).toEqual(sets[n - 1].map(i => (i + 1) % 141).sort((a, b) => a - b))
  })

  it('fires the arrow progressively then extinguishes it', () => {
    for (const [t, count] of [[23350, 1], [23750, 3], [24100, 4], [24900, 4], [25100, 0]]) {
      for (let n = 0; n < 4; n++) expectZone(t, n + 5, n < count ? rgb => lit(rgb) && blue(rgb) : dark)
    }
  })

  it('hints at failure under the arrow load', () => {
    expectZone(40125, 8, lit)
    for (const [t, on] of [[40125, 0], [40400, 1], [48125, 0], [48375, 1], [48625, 0], [48875, 1]]) expectZone(t, 2, on ? lit : dark)
  })

  it('fails independently at 65.4 s', () => {
    expectZone(65400, 2, dark)
    for (const n of [0, 1, 3]) expectZone(65400, n, rgb => lit(rgb) && red(rgb))
    for (const n of [5, 6, 7, 8]) expectZone(65400, n, dark)
    expect(borderIndices(frameAt(65400))).toHaveLength(47)
  })

  it('shorts every pixel white at 80.3 s', () => {
    const pixels = frameAt(80300)
    expect(pixels).toHaveLength(442)
    expect(pixels.every(white)).toBe(true)
  })

  it('leaves only the broken O glowing at 87 s', () => {
    expectZone(87000, 2, rgb => lit(rgb) && red(rgb))
    for (const n of [0, 1, 3, 4, 5, 6, 7, 8]) expectZone(87000, n, dark)
  })

  it('keeps both sides of the seam dark', () => {
    for (const start of [0, 92000]) {
      const end = start === 0 ? 1750 : 95750
      for (let t = start; t <= end; t += 250) expect(frameAt(t).every(dark), `${t} ms`).toBe(true)
    }
  }, 30_000)

  it('keeps every tube uniform throughout the continuous run', () => {
    let maximum = 0
    for (const { pixels } of frames) for (const n of [0, 1, 2, 3, 5, 6, 7, 8]) {
      const lamp = zone(pixels, n)
      for (const rgb of lamp) for (let c = 0; c < 3; c++) maximum = Math.max(maximum, Math.abs(rgb[c] - lamp[0][c]))
    }
    expect(maximum).toBeLessThan(1e-6)
  })

  it('seeks identically across step sizes and continuous playback', () => {
    // Off-key instants: at an exact key time the result depends on floating-point accumulation of frame deltas (#1196).
    for (const t of [56_100, 65_400, 70_300, 75_000, 78_100, 80_300]) {
      expectEqual(frameAt(t), frames[t * 30 / 1000].pixels)
      expectEqual(frameAt(t), frameAt(t, 1000 / 30))
    }
  }, 30_000)

  it('limits flashing area in every second and confines white to the short', () => {
    const windows = flashWindows()
    // #1196 measured worst flash window: second 5, fraction 60 / 442 = 0.13574660633484162.
    for (const window of windows) expect(window.fraction, `second ${window.second}`).toBeLessThanOrEqual(0.25)
    for (const { t, pixels } of frames) if (pixels.some(white)) expect(t >= 80250 && t <= 81050, `${t} ms`).toBe(true)
  })
})
