import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { STOCK_SHOWS_V2, stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { stockShowCatalogueById } from '@/pixelblaze/stock/showCatalogueV2'
import { SOURCE_STOCK_MAPS } from '@/pixelblaze/stock/maps/stockCatalogue'
import { resolveShowV2StageMap } from '@/store/showV2StageMap'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { installationOutputContract } from '@/pixelblaze/stock/showsV2Authoring'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from './showFileBundle'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'

// Every oracle here reads the delivered artifact: the exported EPE source run
// through the fast replay runtime on the real 960-sample chandelier Stage.
const ID = 'stock-show-installation-cloudburst'
const record = stockShowV2ById(ID)!
const MODES = ['fast', 'fidelity'] as const
const SLOW = 60_000
type Mode = typeof MODES[number]
type Rgb = number[]
const FRAME = 1000 / 30
const ZONES = [[0, 159], [160, 479], [480, 959]] as const
const WATER_LINES = [0.060, 0.185, 0.310, 0.716]
const HELD = [6_500, 11_500, 16_000, 22_000]
const ZERO_OFFSET = [0, 3_333, 39_625, 41_000]
const HELD_LIT = [[0.10, 0, 0], [0.40, 0.10, 0], [0.70, 0.40, 0.10], [1, 1, 1]]

function deliver(show: ShowRecordV2) {
  const capture = captureShowStageEditV2(show, {
    patterns: [], libraries: [], maps: [], profiles: [], stageMap: resolveShowV2StageMap(show.stageMapId, []),
  })
  if (capture.prepared.status !== 'ready') throw new Error(`${show.id} failed preparation`)
  const bundle = capture.prepared.bundle
  const artifact = bundle.artifact
  const exported = buildShowEpeExportV2(show, artifact.code, { stampedAt: '2026-10-24T00:00:00.000Z' })
  if (exported.status !== 'exported') throw new Error(exported.message)
  const delivered = parseEpe(exported.text).src
  const runtime = (fidelity: Mode) => createFastReplayRuntime({
    code: delivered, fxCode: artifact.fxCode, metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: bundle.presentation.layout.mapPoints, randomSeed: 7, fidelity })
  const frameAt = (fidelity: Mode, t: number) => runtime(fidelity).advanceTo(t, { stepMs: FRAME }).pixels
  return { bundle, artifact, exported, delivered, runtime, frameAt }
}

/** A copy of the Show with only the water voice; `keyed: false` exposes post-teal, pre-key RGB. */
function waterOnly(keyed: boolean): ShowRecordV2 {
  const c = record.composition
  const clips = c.clips.filter(clip => clip.instanceId === 'water').map(clip => keyed ? clip : {
    ...clip,
    appearance: { keys: clip.appearance.keys.map(key => ({ ...key, value: { ...key.value, effects: (key.value.effects ?? []).filter(e => e.kind !== 'luma-key') } })) },
  })
  return {
    ...record, id: `${ID}-water-${keyed ? 'keyed' : 'unkeyed'}`,
    composition: {
      ...c, clips,
      patternInstances: c.patternInstances.filter(instance => instance.id === 'water'),
      propertyTracks: c.propertyTracks.filter(track => track.target.kind === 'instance-control' && track.target.instanceId === 'water'),
    },
  }
}

function withoutKoi(entry: ShowRecordV2 = record): ShowRecordV2 {
  const c = entry.composition
  const koiClips = new Set(c.clips.filter(clip => clip.instanceId === 'koi').map(clip => clip.id))
  return {
    ...entry, id: `${ID}-no-koi`,
    composition: {
      ...c,
      clips: c.clips.filter(clip => !koiClips.has(clip.id)),
      patternInstances: c.patternInstances.filter(instance => instance.id !== 'koi'),
      propertyTracks: c.propertyTracks.filter(track => !('clipId' in track.target && koiClips.has(track.target.clipId))
        && !('instanceId' in track.target && track.target.instanceId === 'koi')),
    },
  }
}

function withoutKoiDart(entry: ShowRecordV2): ShowRecordV2 {
  return { ...entry, composition: { ...entry.composition,
    propertyTracks: entry.composition.propertyTracks.filter(track => track.id !== 'koi-dart-speed'),
  } }
}

const show = deliver(record)

function rainOnly(): ShowRecordV2 {
  const c = record.composition
  return { ...record, composition: {
    ...c,
    patternInstances: c.patternInstances.filter(instance => instance.id === 'rain').map(instance => ({
      ...instance, controlTargets: { ...instance.controlTargets, sliderDensity: 0, sliderSplash: 0 },
    })),
    clips: c.clips.filter(clip => clip.instanceId === 'rain'),
    propertyTracks: c.propertyTracks.filter(track => track.target.kind === 'instance-control' && track.target.instanceId === 'rain')
      .map(track => track.id === 'rain-density' ? { ...track, keyframes: track.keyframes.map(key => ({ ...key, value: 0 })) } : track),
  } }
}

function withPlacementWaterEffectIds(entry: ShowRecordV2): ShowRecordV2 {
  const result = structuredClone(entry)
  for (const clip of result.composition.clips.filter(clip => clip.instanceId === 'water')) {
    for (const key of clip.appearance.keys) {
      for (const effect of key.value.effects ?? []) {
        if (effect.id === 'water-teal') effect.id = `${clip.id}-teal`
        if (effect.id === 'water-key') effect.id = `${clip.id}-key`
      }
    }
  }
  return result
}

function withoutNewRainControls(entry: ShowRecordV2): ShowRecordV2 {
  return { ...entry, composition: { ...entry.composition,
    patternInstances: entry.composition.patternInstances.map(instance => {
      if (instance.id !== 'rain') return instance
      const controlTargets = { ...instance.controlTargets }
      delete controlTargets.sliderSplash
      delete controlTargets.sliderLandingGlow
      return { ...instance, controlTargets }
    }),
    propertyTracks: entry.composition.propertyTracks.filter(track => track.id !== 'rain-landing-glow'),
  } }
}
const points = show.bundle.presentation.layout.mapPoints
const ys = points.map(point => point.sample[1])
const sum = ([r, g, b]: Rgb) => r + g + b
const visible = (rgb: Rgb) => sum(rgb) > 0.02
const luma = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const displayLum = ([r, g, b]: Rgb) => 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b)
const zoneIndices = (n: number) => Array.from({ length: ZONES[n][1] - ZONES[n][0] + 1 }, (_, i) => ZONES[n][0] + i)
const tubeOf = (index: number) => Math.floor(index / 20)
const maxDelta = (a: Rgb[], b: Rgb[], indices = a.map((_, i) => i)) =>
  Math.max(0, ...indices.flatMap(i => a[i].map((v, c) => Math.abs(v - b[i][c]))))

// One continuous delivered-source replay per mode at 30 fps, shared by the
// flash, voicing, stillness, seek, koi and coda assertions.
const frameTime = (n: number) => n * FRAME
const frameIndex = (t: number) => Math.round(t / FRAME)
const performances = new Map<Mode, Rgb[][]>()
const tails = new Map<Mode, Sample[]>()
function performance(mode: Mode) {
  let frames = performances.get(mode)
  if (!frames) {
    const run = replay(mode, 30, true)
    frames = run.frames
    performances.set(mode, frames)
    tails.set(mode, run.tail)
  }
  return frames
}

// Port of telemetry/harness.ts's contrast-qualified extremum detector, as in
// afterHoursShow.test.ts.
function flashWindows(frames: Rgb[][]) {
  const count = frames[0].length
  const direction = new Int8Array(count)
  const extremum = new Float64Array(count)
  const previous = new Float64Array(count)
  const transitions = new Uint16Array(count)
  const windows: { second: number, fraction: number }[] = []
  frames.forEach((pixels, frame) => {
    pixels.forEach((rgb, index) => {
      const value = displayLum(rgb)
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
      windows.push({ second: Math.floor(frame / 30), fraction: violating / count })
      transitions.fill(0)
    }
  })
  return windows
}

const coda = record.composition.clips.find(clip => clip.id === 'rain-coda')!
const codaEndMs = coda.startMs + coda.durationMs
const DRAIN_END = 39_625
const TAIL_FROM = 39_000
const TUBE = 20
type Sample = { t: number, pixels: Rgb[] }
const black = (rgb: Rgb) => rgb.every(channel => channel === 0)

/**
 * One continuous delivered replay from 0 at `fps`: every frame when `keepAll`,
 * and the tail from 39 s with extra exact samples at the coda boundaries. Each
 * extra sample advances a snapshot and restores it, so the fixed timestep the
 * frames see is unchanged.
 */
function replay(mode: Mode, fps: number, keepAll: boolean) {
  const step = 1000 / fps
  const probes = [DRAIN_END + step, 42_125, coda.startMs, codaEndMs - 1, codaEndMs - 0.5].sort((a, b) => a - b)
  const runtime = show.runtime(mode)
  const frames: Rgb[][] = []
  const tail: Sample[] = []
  for (let n = 0; n * step < 49_000 - 1e-6; n++) {
    const t = n * step
    for (const p of probes) {
      if (n === 0 || p <= (n - 1) * step + 1e-6 || p >= t - 1e-6) continue
      const saved = runtime.snapshot()
      tail.push({ t: p, pixels: runtime.advanceTo(p, { stepMs: step }).pixels })
      runtime.restore(saved)
    }
    const pixels = runtime.advanceTo(t, { stepMs: step }).pixels
    if (keepAll) frames.push(pixels)
    if (t >= TAIL_FROM) tail.push({ t, pixels })
  }
  return { frames, tail }
}

type Episode = {
  tube: number, first: number, headBottom: number, tail: number, dark: number,
  firstHead: number, lastHead: number, deepest: number, brightness: number,
}

/**
 * The R coda oracle over consumer pixels (#1200 R rulings). Darkness begins
 * one frame after the drain's 50,625 ms key, at that replay's rate: the drain
 * key lands between frames, so the frame that straddles it may still hold the
 * last of the water (final ruling, #1204). From there every sample is exactly
 * black until the first coda light, which comes at least 2.5 s later and not
 * before the Clip opens. Then one to three complete Inner-tube drops fall, at
 * most two at once: each head enters at the top, falls to the bottom without
 * resetting upward, and its tail leaves the bottom LED to exact black before
 * the Clip closes. Everything stays black through the loop seam. Counts and
 * tubes are measurements per mode, never a cross-mode equality.
 */
function expectLastDrops(samples: Sample[], fps: number, label: string) {
  const darkFrom = DRAIN_END + 1000 / fps
  expect(samples.some(({ t }) => Math.abs(t - darkFrom) < 1e-6), `${label} samples darkness start`).toBe(true)
  const window = samples.filter(({ t }) => t >= darkFrom - 1e-6)
  const firstLight = window.find(({ pixels }) => !pixels.every(black))
  expect(firstLight, `${label} coda light`).toBeDefined()
  expect(firstLight!.t - darkFrom, `${label} dark gap`).toBeGreaterThanOrEqual(2_500)
  expect(firstLight!.t, `${label} light after Clip opens`).toBeGreaterThanOrEqual(coda.startMs)
  for (const { t, pixels } of window) {
    if (t >= codaEndMs) expect(pixels.every(black), `${label} black after Clip at ${t}`).toBe(true)
    expect(pixels.flatMap((rgb, i) => i > ZONES[0][1] && visible(rgb) ? [i] : []), `${label} outside Inner at ${t}`).toEqual([])
    const lit = new Set(pixels.flatMap((rgb, i) => visible(rgb) ? [tubeOf(i)] : []))
    expect(lit.size, `${label} concurrent drops at ${t}`).toBeLessThanOrEqual(2)
  }
  const episodes: Episode[] = []
  for (let tube = 0; tube < 8; tube++) {
    const local = Array.from({ length: TUBE }, (_, n) => tube * TUBE + n)
    let open: (Episode & { heads: number[], lastLit: Sample }) | null = null
    const close = () => {
      const { heads, lastLit, ...episode } = open!
      const tag = `${label} tube ${tube} drop from ${episode.first}`
      expect(visible(lastLit.pixels[tube * TUBE + 19]), `${tag} tail leaves the bottom`).toBe(true)
      expect(episode.deepest, `${tag} deepest head`).toBeGreaterThanOrEqual(18)
      expect(episode.deepest - episode.firstHead, `${tag} travel`).toBeGreaterThanOrEqual(0.75 * 19)
      heads.forEach((head, n) => { if (n) expect(head, `${tag} head ${n}`).toBeGreaterThanOrEqual(heads[n - 1] - 1) })
      const dark = window.find(({ t, pixels }) => t > lastLit.t && local.every(i => black(pixels[i])))
      expect(dark && dark.t < codaEndMs, `${tag} dark before Clip close`).toBe(true)
      episodes.push({ ...episode, tail: lastLit.t, dark: dark!.t })
      open = null
    }
    for (const sample of window) {
      const lit = local.filter(i => visible(sample.pixels[i]))
      if (!lit.length) { if (open) close(); continue }
      const head = lit.reduce((best, i) => sum(sample.pixels[i]) > sum(sample.pixels[best]) ? i : best) - tube * TUBE
      const brightness = Math.max(...lit.map(i => sum(sample.pixels[i])))
      if (!open) {
        const tag = `${label} tube ${tube} drop from ${sample.t}`
        expect(lit, `${tag} enters at the top`).toContain(tube * TUBE)
        expect(head, `${tag} first head`).toBeLessThanOrEqual(1)
        open = { tube, first: sample.t, headBottom: NaN, tail: NaN, dark: NaN, firstHead: head, lastHead: head, deepest: head, brightness, heads: [], lastLit: sample }
      }
      open.heads.push(head)
      open.lastHead = head
      open.deepest = Math.max(open.deepest, head)
      if (head >= 18 && Number.isNaN(open.headBottom)) open.headBottom = sample.t
      open.brightness = Math.max(open.brightness, brightness)
      open.lastLit = sample
    }
    expect(open, `${label} tube ${tube} lit at the loop seam`).toBeNull()
  }
  expect(episodes.length, `${label} drops`).toBeGreaterThanOrEqual(1)
  expect(episodes.length, `${label} drops`).toBeLessThanOrEqual(3)
  return episodes.sort((a, b) => a.first - b.first)
}

describe('Cloudburst delivered Installation Show (#1200)', () => {
  it.each(MODES)('compresses the opening to dry ground before 4000 ms and visible accumulation by 4500 ms (%s)', async mode => {
    const file = buildShowFileBundle(record, { patterns: [], maps: [] }, { appVersion: 'cloudburst-test', exportedAt: '2026-10-24T00:00:00.000Z' })
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(file.bundle), { acceptV2: true })
    if (reopened.version !== 2) throw new Error('wrong export version')
    expect(reopened.show.composition.showEndMs).toBe(49_000)
    const water = deliver(waterOnly(true)).runtime(mode)
    for (const t of [0, 1_333, 2_667, 3_999, 4_000]) {
      expect(water.advanceTo(t, { stepMs: FRAME }).pixels.filter(visible), `${mode} dry at ${t}`).toHaveLength(0)
    }
    for (const t of [4_500, 4_625, 5_000]) {
      expect(water.advanceTo(t, { stepMs: FRAME }).pixels.filter(visible).length, `${mode} accumulation at ${t}`).toBeGreaterThan(0)
    }
  }, 60_000)

  it('validates, reopens unchanged, renders the 960-sample 3D Stage and fits the artifact budgets', async () => {
    expect(validateShowRecordV2(record)).toEqual([])
    const file = buildShowFileBundle(record, { patterns: [], maps: [] }, { appVersion: 'cloudburst-test', exportedAt: '2026-10-22T00:00:00.000Z' })
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(file.bundle), { acceptV2: true })
    expect(reopened.version).toBe(2)
    if (reopened.version !== 2) throw new Error('wrong export version')
    expect(reopened.show).toEqual(record)
    expect(show.delivered.length).toBeGreaterThan(0)
    expect(points).toHaveLength(960)
    expect(points.map(point => point.sample)).toEqual(SOURCE_STOCK_MAPS.find(map => map.id === 'cloudburst-chandelier')!.resolve(960).map(point => point.sample))
    expect(nativeDimension(show.artifact.metadata.renderFns)).toBe(3)
    expect(record.outputContract).toEqual(installationOutputContract('cloudburst-chandelier', 960))
    expect(record.composition.executionModel).toBe('deterministic-loop')
    expect(record.composition.showEndMs).toBe(49_000)
    expect(record.composition.patternInstances.map(instance => instance.pattern)).toEqual([
      { kind: 'stock', id: 'TubeRain3D' }, { kind: 'stock', id: 'LumaPlane3D' }, { kind: 'stock', id: 'Koi3D' },
    ])
    expect(record.composition.transitions).toEqual([])
    expect(stockShowCatalogueById(ID)).toMatchObject({ collection: 'installations', order: 6 })
    expect(STOCK_SHOWS_V2.filter(entry => entry.stageMapId === 'cloudburst-chandelier').map(entry => entry.id)).toEqual([ID])
    // No white: no neutral colour map and no Effect animation remain.
    const effects = record.composition.clips.flatMap(clip => clip.appearance.keys.flatMap(key => key.value.effects ?? []))
    expect(effects.filter(effect => effect.kind === 'color-map' && effect.highlightR === effect.highlightG && effect.highlightG === effect.highlightB)).toEqual([])
    expect(record.composition.propertyTracks.filter(track => track.target.kind === 'clip-effect')).toEqual([])
    expect(record.composition.propertyTracks.filter(track => track.target.kind === 'clip-opacity' && track.target.clipId.startsWith('water'))).toEqual([])
    const resources = show.artifact.summary.resources
    // #1200 B before coda calibration: 63,427 source bytes, 136 globals, 2,892 words.
    // Row 8 coda (one rain-speed track fewer): 62,179 bytes, 136 globals, 2,892 words.
    // Resource analyzer counts runtime-sized arrays as zero elements. Include
    // the four existing rain geometry arrays at the installed 960 LED count.
    const actualWords = resources.totalWords + 4 * points.length
    console.info('Cloudburst ledger', { compiledBytes: resources.artifactBytes, deliveredBytes: new TextEncoder().encode(show.delivered).length,
      globals: resources.persistentGlobals, ledgerWords: resources.totalWords, actualWords })
    expect(resources.blockers).toEqual([])
    expect(resources.artifactBytes).toBeLessThan(68_384)
    expect(new TextEncoder().encode(show.delivered).length).toBeLessThan(68_384)
    expect(resources.persistentGlobals).toBeLessThan(256)
    expect(actualWords).toBeLessThanOrEqual(10_240)
  }, SLOW)

  it('retains every authored timing boundary, including appearance keys and active durations', () => {
    const c = record.composition
    expect(c.layoutOccurrences.map(o => [o.startMs, o.durationMs])).toEqual([[0, 49_000]])
    expect(c.clips.map(clip => [clip.startMs, clip.durationMs, clip.appearance.keys.map(key => key.timeMs)])).toEqual([
      [0, 19_625, [0]], [1_333, 18_292, [1_333]], [2_667, 16_958, [2_667]],
      [19_625, 9_375, [19_625]],
      [44_000, 4_375, [44_000]],
      ...Array.from({ length: 3 }, () => [0, 49_000, [0]]),
      ...Array.from({ length: 3 }, () => [29_000, 10_000, [29_000]]),
    ])
    expect(c.propertyTracks.map(track => [track.activeStartMs, track.activeDurationMs, track.keyframes.map(key => key.timeMs)])).toEqual([
      [0, 49_000, [0, 19_625, 44_000]],
      [0, 49_000, [0, 1_333, 2_667, 44_000, 48_375]],
      [0, 49_000, [27, 167, 4_000, 4_625]],
      [0, 49_000, [0, 4_000, 4_625, 9_000, 9_625, 14_000, 14_625, 19_000, 19_625, 39_000, 39_625, 49_000]],
      ...Array.from({ length: 3 }, () => [29_000, 10_000, [29_000, 31_500, 36_500, 39_000]]),
      [29_000, 10_000, [29_000, 31_000, 31_080, 31_250, 31_750, 34_000, 34_080, 34_250, 34_750, 37_000, 37_080, 37_250, 37_750, 39_000]],
    ])
    expect(c.markers.map(marker => marker.timeMs)).toEqual([0, 1_333, 4_000, 19_000, 19_625, 29_000, 39_000, 39_625])
    const dart = c.propertyTracks.find(track => track.id === 'koi-dart-speed')!
    expect(dart.target).toEqual({ kind: 'instance-time-scale', instanceId: 'koi' })
    expect(dart.keyframes.map(key => [key.timeMs, key.value, key.easing])).toEqual([
      [29_000, 0.5, { curve: 'hold', at: 1 }],
      ...[31_000, 34_000, 37_000].flatMap(start => [
        [start, 0.5, { curve: 'linear' }],
        [start + 80, 4, { curve: 'hold', at: 1 }],
        [start + 250, 4, { curve: 'sine', direction: 'in-out' }],
        [start + 750, 0.5, { curve: 'hold', at: 1 }],
      ]),
      [39_000, 0.5, { curve: 'hold', at: 1 }],
    ])
  }, 60_000)

  it.each(MODES)('shares water Effect identities without changing delivered frames (%s)', mode => {
    const waterClips = record.composition.clips.filter(clip => clip.instanceId === 'water')
    expect(waterClips).toHaveLength(3)
    const effects = waterClips.flatMap(clip => clip.appearance.keys.flatMap(key => key.value.effects ?? []))
    expect(new Set(effects.map(effect => effect.id)).size).toBe(2)
    const original = structuredClone(record)
    const untrimmed = withPlacementWaterEffectIds(record)
    expect(record).toEqual(original)
    // Lossless identity reuse: restoring shared IDs changes no other field.
    const shared = structuredClone(untrimmed)
    for (const clip of shared.composition.clips.filter(clip => clip.instanceId === 'water')) {
      for (const key of clip.appearance.keys) {
        for (const effect of key.value.effects ?? []) {
          if (effect.id === `${clip.id}-teal`) effect.id = 'water-teal'
          if (effect.id === `${clip.id}-key`) effect.id = 'water-key'
        }
      }
    }
    expect(shared).toEqual(record)
    const comparator = deliver(untrimmed)
    console.info('Cloudburst water identity delivered source', {
      currentBytes: new TextEncoder().encode(show.delivered).length,
      comparatorBytes: new TextEncoder().encode(comparator.delivered).length,
    })
    const samples = [0, 13, 27, 167, 1_333, 2_667, 4_000, 4_625, 9_000, 9_625,
      14_000, 14_625, 19_000, 19_625, 29_000, 31_500, 36_500, 39_000, 39_625, 44_000, 48_375, 49_000]
    for (const fps of [30, 60]) {
      const current = show.runtime(mode), reference = comparator.runtime(mode)
      const start = current.snapshot(), referenceStart = reference.snapshot()
      const compare = (t: number, stepMs: number) => {
        const actual = current.advanceTo(t, { stepMs }).pixels
        const expected = reference.advanceTo(t, { stepMs }).pixels
        expect(actual).toHaveLength(960)
        expect(expected).toHaveLength(960)
        const delta = maxDelta(actual, expected)
        expect(delta, `${mode} ${fps}fps at ${t}`).toBe(0)
        return delta
      }
      let maximum = 0
      for (let n = 0; n <= 60 * fps; n++) maximum = Math.max(maximum, compare(n * 1000 / fps, 1000 / fps))
      console.info('Cloudburst water identity frames', { mode, fps, frames: 60 * fps + 1, maxDelta: maximum })
      current.restore(start)
      reference.restore(referenceStart)
      for (const t of samples) compare(t, FRAME)
      current.restore(start)
      reference.restore(referenceStart)
      compare(11_500, FRAME)
      console.info('Cloudburst water identity boundaries and restore', { mode, fps, samples: samples.length, restoredMs: 11_500, maxDelta: 0 })
    }
  }, SLOW)

  it.each(MODES)('delivers stationary floor anchors only on active rain tubes (%s)', mode => {
    const anchor = deliver(rainOnly())
    for (const [t, count] of [[667, 8], [2_000, 24], [3_333, 48]]) {
      const a = anchor.frameAt(mode, t), b = anchor.frameAt(mode, t + 625)
      const lit = a.flatMap((rgb, i) => visible(rgb) ? [i] : [])
      expect(lit).toHaveLength(count)
      expect(maxDelta(a, b)).toBe(0)
      expect(new Set(lit.map(tubeOf)).size).toBe(count)
      for (const i of lit) {
        const [x, y, z] = points[i].sample
        expect(y).toBe(Math.min(...points.filter(p => p.sample[0] === x && p.sample[2] === z).map(p => p.sample[1])))
      }
      expect(Math.max(...a.flat())).toBeCloseTo(0.16, 4)
    }
    for (const t of [0, 13, 27, 4_625, 19_625, 44_000, 48_375, 49_000]) expect(anchor.frameAt(mode, t).flat().every(v => v === 0), `anchor black at ${t}`).toBe(true)
  }, SLOW)

  it.each(MODES)('seeks and restores the actual opening without adding a loop seam (%s)', mode => {
    const runtime = show.runtime(mode), start = runtime.snapshot()
    const reference = performance(mode)[frameIndex(3_333)]
    expect(maxDelta(runtime.advanceTo(frameTime(frameIndex(3_333)), { stepMs: FRAME }).pixels, reference)).toBeLessThan(1e-9)
    runtime.restore(start)
    expect(maxDelta(runtime.advanceTo(frameTime(frameIndex(3_333)), { stepMs: FRAME }).pixels, reference)).toBeLessThan(1e-9)
    const noGlow = deliver({ ...record, composition: { ...record.composition,
      propertyTracks: record.composition.propertyTracks.filter(track => track.id !== 'rain-landing-glow'),
    } })
    const noNewRainControls = deliver(withoutNewRainControls(record))
    const noDart = deliver(withoutKoiDart(record))
    for (const fps of [30, 60]) {
      const stepMs = 1000 / fps
      const actual = show.runtime(mode), glowDisabled = noGlow.runtime(mode)
      const rainDisabled = noNewRainControls.runtime(mode), dartDisabled = noDart.runtime(mode)
      const deltas: number[] = [], combinedDeltas: number[] = [], dartDeltas: number[] = []
      for (const t of [0, 49_000 - stepMs, 49_000]) {
        const pixels = actual.advanceTo(t, { stepMs }).pixels
        deltas.push(maxDelta(pixels, glowDisabled.advanceTo(t, { stepMs }).pixels))
        combinedDeltas.push(maxDelta(pixels, rainDisabled.advanceTo(t, { stepMs }).pixels))
        dartDeltas.push(maxDelta(pixels, dartDisabled.advanceTo(t, { stepMs }).pixels))
      }
      console.info('Cloudburst landing glow seam', mode, fps, deltas)
      expect(deltas).toEqual([0, 0, 0])
      console.info('Cloudburst combined rain controls seam', mode, fps, combinedDeltas)
      expect(combinedDeltas).toEqual([0, 0, 0])
      console.info('Cloudburst koi dart seam', mode, fps, dartDeltas)
      expect(dartDeltas).toEqual([0, 0, 0])
    }
  }, SLOW)

  it.each(MODES)('reports 960 LED startup and steady frame timing (%s)', mode => {
    const start = globalThis.performance.now()
    const runtime = show.runtime(mode)
    runtime.advanceLive(0)
    const initialized = globalThis.performance.now()
    for (let i = 0; i < 120; i++) runtime.advanceLive(FRAME)
    console.info('Cloudburst 960 LED timing', mode, { startupMs: initialized - start, frameMs: (globalThis.performance.now() - initialized) / 120 })
  }, SLOW)

  it('keys only the dry water out, with margins on every Zone in both modes', () => {
    const unkeyed = deliver(waterOnly(false))
    for (const mode of MODES) {
      for (const t of ZERO_OFFSET) {
        const pixels = unkeyed.frameAt(mode, t)
        for (let n = 0; n < 3; n++) {
          const maxL = Math.max(...zoneIndices(n).map(i => luma(pixels[i])))
          expect(maxL, `${mode} zone ${n} at ${t} max luma`).toBeLessThan(0.20)
        }
      }
      HELD.forEach((t, level) => {
        const pixels = unkeyed.frameAt(mode, t)
        for (let n = 0; n < 3; n++) {
          const submerged = zoneIndices(n).filter(i => ys[i] < WATER_LINES[level])
          if (!submerged.length) continue
          const minL = Math.min(...submerged.map(i => luma(pixels[i])))
          expect(minL, `${mode} zone ${n} at ${t} min submerged luma`).toBeGreaterThan(0.25)
        }
        if (level === 3) expect(points.every((_, i) => ys[i] < WATER_LINES[3])).toBe(true)
      })
    }
  }, SLOW)

  it('holds four level waterlines over black air, occludes the rain, and drains to darkness', () => {
    const keyed = deliver(waterOnly(true))
    for (const mode of MODES) {
      for (const t of ZERO_OFFSET) expect(keyed.frameAt(mode, t).filter(visible), `${mode} water at ${t}`).toHaveLength(0)
      HELD.forEach((t, level) => {
        const pixels = keyed.frameAt(mode, t)
        for (let n = 0; n < 3; n++) {
          const lit = zoneIndices(n).filter(i => visible(pixels[i])).length
          const expected = HELD_LIT[level][n] * zoneIndices(n).length
          expect(Math.abs(lit - expected), `${mode} zone ${n} at ${t}: ${lit} lit`).toBeLessThanOrEqual(2)
          // Black air: everything clearly above the line stays dark.
          expect(zoneIndices(n).filter(i => ys[i] > WATER_LINES[level] + 0.05 && visible(pixels[i])), `${mode} air ${n} at ${t}`).toEqual([])
        }
      })
      const occlusion = [[6_500, 7_000], [11_500, 12_000], [16_000, 16_200], [22_000, 23_000]]
      occlusion.forEach((times, level) => {
        const deep = points.flatMap((_, i) => ys[i] <= WATER_LINES[level] - 0.05 ? [i] : [])
        for (const t of times) {
          expect(maxDelta(show.frameAt(mode, t), keyed.frameAt(mode, t), deep), `${mode} occlusion at ${t}`).toBeLessThan(1e-6)
        }
      })
      for (const t of [39_625, 40_000, 41_000, 44_000]) {
        expect(show.frameAt(mode, t).filter(visible), `${mode} drained at ${t}`).toHaveLength(0)
      }
    }
  }, SLOW)

  it.each(MODES)('never flashes, never shows white, enters ring by ring and holds still under water (%s)', (mode) => {
    const frames = performance(mode)
    console.info('Cloudburst max flash-window violation fraction', mode, Math.max(...flashWindows(frames).map(window => window.fraction)))
    for (const window of flashWindows(frames)) expect(window.fraction, `${mode} second ${window.second}`).toBeLessThanOrEqual(0.25)
    const white = (rgb: Rgb) => sum(rgb) > 0.15 && Math.max(...rgb) - Math.min(...rgb) < 0.1 * Math.max(...rgb)
    expect(frames.findIndex(pixels => pixels.some(white)), `${mode} first white frame`).toBe(-1)
    const ringLit = (from: number, to: number, n: number) => frames.slice(frameIndex(from), frameIndex(to) + 1)
      .some(pixels => zoneIndices(n).some(i => visible(pixels[i])))
    for (const [t, rings] of [[667, [true, false, false]], [2_000, [true, true, false]], [3_333, [true, true, true]]] as const) {
      expect([0, 1, 2].map(n => ringLit(t - 100, t + 100, n)), `${mode} rings at ${t}`).toEqual(rings)
    }
    const still = frames[frameIndex(22_000)]
    for (let n = frameIndex(22_000); n <= frameIndex(26_000); n++) expect(maxDelta(frames[n], still), `${mode} still at ${frameTime(n)}`).toBeLessThan(1e-9)
  }, SLOW)

  it.each(MODES)('seeks deterministically into the rise (%s)', (mode) => {
    const reference = performance(mode)[frameIndex(11_500)]
    expect(maxDelta(show.frameAt(mode, frameTime(frameIndex(11_500))), reference)).toBeLessThan(1e-9)
    const runtime = show.runtime(mode)
    const start = runtime.snapshot()
    runtime.advanceTo(22_000, { stepMs: FRAME })
    runtime.restore(start)
    expect(maxDelta(runtime.advanceTo(frameTime(frameIndex(11_500)), { stepMs: FRAME }).pixels, reference)).toBeLessThan(1e-9)
  }, SLOW)

  it.each(MODES)('swims one gold koi lap on the Middle ring above the teal (%s)', (mode) => {
    const frames = performance(mode)
    const noKoi = deliver(withoutKoi())
    expect(noKoi.delivered).toBe(deliver(withoutKoi(withoutKoiDart(record))).delivered)
    const noKoiRuntime = noKoi.runtime(mode)
    const middle = zoneIndices(1)
    for (const t of [31_500, 32_000, 33_000, 34_000, 36_500]) {
      const full = frames[frameIndex(t)]
      const base = noKoiRuntime.advanceTo(t, { stepMs: FRAME }).pixels
      expect(middle.filter(i => full[i][0] - base[i][0] > 0.02).length, `${mode} koi red at ${t}`).toBeGreaterThan(0)
    }
    const at45 = frames[frameIndex(34_000)]
    expect(middle.some(i => at45[i][0] > 0.3 && at45[i][0] > at45[i][2]), `${mode} gold over teal`).toBe(true)
    let maxRed = 0
    for (let n = frameIndex(31_500); n <= frameIndex(36_500); n++) {
      const pixels = frames[n]
      const body = middle.filter(i => pixels[i][0] > 0.3)
      maxRed = Math.max(maxRed, ...middle.map(i => pixels[i][0]))
      const tubes = [...new Set(body.map(tubeOf))].map(tube => tube - 8).sort((a, b) => a - b)
      expect(tubes.length, `${mode} body tubes at ${frameTime(n)}`).toBeGreaterThanOrEqual(1)
      expect(tubes.length, `${mode} body tubes at ${frameTime(n)}`).toBeLessThanOrEqual(2)
      if (tubes.length === 2) expect([1, 15], `${mode} adjacent at ${frameTime(n)}`).toContain(tubes[1] - tubes[0])
    }
    expect(maxRed).toBeGreaterThan(0.3)
  }, SLOW)

  it.each(MODES)('cruises, darts three times and releases to a slow gold cruise (%s)', mode => {
    const middle = zoneIndices(1)
    const appendAngle = (angles: number[], pixels: Rgb[], t: number) => {
      let x = 0, z = 0, weight = 0
      for (const i of middle) {
        const red = pixels[i][0]
        x += red * (points[i].sample[0] - 0.5)
        z += red * (points[i].sample[2] - 0.5)
        weight += red
      }
      expect(weight, `${mode} gold centroid at ${t}`).toBeGreaterThan(0)
      const angle = Math.atan2(z, x)
      const previous = angles[angles.length - 1]
      angles.push(previous === undefined ? angle : previous + Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous)))
    }
    const assertDart = (dartRate: number, cruiseRate: number, direction: number) => {
      expect(dartRate * direction).toBeGreaterThanOrEqual(3 * cruiseRate * direction)
    }
    for (const fps of [30, 60]) {
      const stepMs = 1000 / fps
      const index = (t: number) => Math.round(t / stepMs)
      const time = (n: number) => n * stepMs
      const first = index(29_500), last = index(38_500)
      const window = (angles: number[], start: number, end: number) => {
        const a = index(start), b = index(end)
        const distance = angles[b - first] - angles[a - first]
        return { startMs: time(a), endMs: time(b), distance, rate: distance / ((time(b) - time(a)) / 1000) }
      }
      for (const start of [31_000, 34_000, 37_000]) {
        // Same history, seed and cadence; only this pulse's two boost values
        // change. Earlier pulses, easing, activation and all other records stay.
        const cruiseRecord = structuredClone(record)
        const track = cruiseRecord.composition.propertyTracks.find(t => t.id === 'koi-dart-speed')!
        const originalTrack = record.composition.propertyTracks.find(t => t.id === track.id)!
        for (const key of track.keyframes) if (key.timeMs === start + 80 || key.timeMs === start + 250) key.value = 0.5
        expect(withoutKoiDart(cruiseRecord)).toEqual(withoutKoiDart(record))
        expect({ ...track, keyframes: originalTrack.keyframes }).toEqual(originalTrack)
        expect(track.keyframes.map((key, i) => ({ ...key, value: originalTrack.keyframes[i].value }))).toEqual(originalTrack.keyframes)
        expect(track.keyframes.flatMap((key, i) => key.value === originalTrack.keyframes[i].value ? [] : [
          [key.timeMs, originalTrack.keyframes[i].value, key.value],
        ])).toEqual([[start + 80, 4, 0.5], [start + 250, 4, 0.5]])
        const candidate = show.runtime(mode)
        const counterfactual = deliver(cruiseRecord).runtime(mode)
        // Fault injection at the same exported/rendered boundary: the candidate
        // also loses the current boost, so the unchanged >=3x oracle must fail.
        const fault = deliver(structuredClone(cruiseRecord)).runtime(mode)
        const angles: number[] = [], cruiseAngles: number[] = [], faultAngles: number[] = []
        let prefixDelta = 0, faultDelta = 0
        for (let n = 0; n <= last; n++) {
          const options = { stepMs, forceFullIntermediateRender: true }
          const full = candidate.advanceTo(time(n), options).pixels
          const cruise = counterfactual.advanceTo(time(n), options).pixels
          const faulty = fault.advanceTo(time(n), options).pixels
          if (time(n) < start) prefixDelta = Math.max(prefixDelta, maxDelta(full, cruise))
          faultDelta = Math.max(faultDelta, maxDelta(cruise, faulty))
          if (n >= first) {
            appendAngle(angles, full, time(n))
            appendAngle(cruiseAngles, cruise, time(n))
            appendAngle(faultAngles, faulty, time(n))
          }
        }
        expect(prefixDelta, `${mode}/${fps} identical prefix before ${start}`).toBe(0)
        expect(faultDelta).toBe(0)
        const quiet = [[30_000, 30_500], [32_000, 33_000], [35_000, 36_000], [38_000, 38_500]].map(([a, b]) => window(angles, a, b))
        const darts = [31_000, 34_000, 37_000].map(t => window(angles, t, t + 750))
        const dart = window(angles, start, start + 750)
        const cruise = window(cruiseAngles, start, start + 750)
        const faulty = window(faultAngles, start, start + 750)
        const direction = Math.sign(quiet[0].distance)
        console.info('Cloudburst koi causal angular windows', mode, fps, JSON.stringify({ start, prefixDelta, direction, quiet, darts, dart, cruise, ratio: dart.rate / cruise.rate, faultRatio: faulty.rate / cruise.rate }))
        for (const observation of [...quiet, ...darts, cruise]) expect(observation.distance * direction).toBeGreaterThan(0)
        for (const observation of darts) expect(quiet[quiet.length - 1].rate * direction).toBeLessThan(observation.rate * direction)
        expect(() => assertDart(faulty.rate, cruise.rate, direction)).toThrow()
        assertDart(dart.rate, cruise.rate, direction)
      }
    }
  }, SLOW)

  // Darkness starts one frame after the drain key at the replay's rate, per
  // https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1200#issuecomment-6339784729
  // and #1204; both rates replay continuously from 0.
  it.each(MODES)('lets one to three last drops fall through the empty dark, dark from one frame after the drain (%s)', (mode) => {
    performance(mode)
    expectLastDrops(tails.get(mode)!, 30, `${mode} 30fps`)
    expectLastDrops(replay(mode, 60, false).tail, 60, `${mode} 60fps`)
  }, SLOW)

  // Approved B (decision 6337003222), exported from incoming staged tree
  // f98e93cacdfe3204542a8acfe0970aa3f2150eaa. Its coda is incomplete; it is
  // preservation data for everything before the coda opens.
  // Authorized opening anchors/splash exceptions:
  // https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1200#issuecomment-6378412007
  // https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1200#issuecomment-6378424773
  it.each(MODES)('preserves approved B values and delivered behavior under the authorized timing and rain controls (%s)', async (mode) => {
    const reopened = await parseShowFileBundle(readFileSync(new URL('../test/fixtures/cloudburstApprovedB.pxlshow', import.meta.url)), { acceptV2: true })
    if (reopened.version !== 2) throw new Error('wrong fixture version')
    // Normalize only the authorized authored timing. This does not assert that
    // elapsed-time-driven rain matches frames shifted from the historical score.
    const approved = structuredClone(reopened.show)
    const time = (t: number) => t <= 15_000 ? Math.round(t * 4 / 15) : t - 11_000
    const interval = (entry: { startMs: number, durationMs: number }) => {
      const end = time(entry.startMs + entry.durationMs)
      entry.startMs = time(entry.startMs)
      entry.durationMs = end - entry.startMs
    }
    approved.composition.showEndMs = time(approved.composition.showEndMs)
    for (const entry of approved.composition.layoutOccurrences) interval(entry)
    for (const clip of approved.composition.clips) {
      interval(clip)
      for (const key of clip.appearance.keys) key.timeMs = time(key.timeMs)
    }
    for (const track of approved.composition.propertyTracks) {
      const end = time(track.activeStartMs + track.activeDurationMs)
      track.activeStartMs = time(track.activeStartMs)
      track.activeDurationMs = end - track.activeStartMs
      for (const key of track.keyframes) key.timeMs = time(key.timeMs)
    }
    for (const marker of approved.composition.markers) marker.timeMs = time(marker.timeMs)
    const withoutCoda = (entry: ShowRecordV2) => ({
      ...entry,
      composition: {
        ...entry.composition,
        clips: entry.composition.clips.filter(clip => clip.id !== 'rain-coda' && clip.id !== 'rain-phase-recovery'),
        propertyTracks: entry.composition.propertyTracks.filter(track => !track.id.startsWith('rain-')),
        markers: entry.composition.markers.filter(marker => marker.id !== 'm-last-drop'),
      },
    })
    // Expand losslessly shared water identities to the historical placement IDs.
    expect(withoutCoda(withoutKoiDart(withoutNewRainControls(withPlacementWaterEffectIds(record))))).toEqual(withoutCoda(approved))
    const frames = performance(mode)
    const runtime = deliver(approved).runtime(mode)
    const disabled = deliver(withoutKoiDart(withoutNewRainControls(record))).runtime(mode)
    for (let n = 0; frameTime(n) < coda.startMs; n++) {
      const approvedPixels = runtime.advanceTo(frameTime(n), { stepMs: FRAME }).pixels
      expect(maxDelta(approvedPixels, disabled.advanceTo(frameTime(n), { stepMs: FRAME }).pixels), `${mode} disabled at ${frameTime(n)}`).toBeLessThanOrEqual(1e-9)
      if (frameTime(n) >= 19_625 && (frameTime(n) < 29_000 || frameTime(n) >= 39_000)) expect(maxDelta(approvedPixels, frames[n]), `${mode} actual at ${frameTime(n)}`).toBeLessThanOrEqual(1e-9)
    }
  }, SLOW)
})
