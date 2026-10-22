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
const SLOW = 180_000
type Mode = typeof MODES[number]
type Rgb = number[]
const FRAME = 1000 / 30
const ZONES = [[0, 159], [160, 479], [480, 959]] as const
const WATER_LINES = [0.060, 0.185, 0.310, 0.716]
const HELD = [17_500, 22_500, 27_000, 33_000]
const ZERO_OFFSET = [0, 12_500, 50_625, 52_000]
const HELD_LIT = [[0.10, 0, 0], [0.40, 0.10, 0], [0.70, 0.40, 0.10], [1, 1, 1]]

function deliver(show: ShowRecordV2) {
  const capture = captureShowStageEditV2(show, {
    patterns: [], libraries: [], maps: [], profiles: [], stageMap: resolveShowV2StageMap(show.stageMapId, []),
  })
  if (capture.prepared.status !== 'ready') throw new Error(`${show.id} failed preparation`)
  const bundle = capture.prepared.bundle
  const artifact = bundle.artifact
  const exported = buildShowEpeExportV2(show, artifact.code)
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

function withoutKoi(): ShowRecordV2 {
  const c = record.composition
  const koiClips = new Set(c.clips.filter(clip => clip.instanceId === 'koi').map(clip => clip.id))
  return {
    ...record, id: `${ID}-no-koi`,
    composition: {
      ...c,
      clips: c.clips.filter(clip => !koiClips.has(clip.id)),
      patternInstances: c.patternInstances.filter(instance => instance.id !== 'koi'),
      propertyTracks: c.propertyTracks.filter(track => !('clipId' in track.target && koiClips.has(track.target.clipId))
        && !(track.target.kind === 'instance-control' && track.target.instanceId === 'koi')),
    },
  }
}

const show = deliver(record)
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
const DRAIN_END = 50_625
const TAIL_FROM = 50_000
const TUBE = 20
type Sample = { t: number, pixels: Rgb[] }
const black = (rgb: Rgb) => rgb.every(channel => channel === 0)

/**
 * One continuous delivered replay from 0 at `fps`: every frame when `keepAll`,
 * and the tail from 50 s with extra exact samples at the coda boundaries. Each
 * extra sample advances a snapshot and restores it, so the fixed timestep the
 * frames see is unchanged.
 */
function replay(mode: Mode, fps: number, keepAll: boolean) {
  const step = 1000 / fps
  const probes = [DRAIN_END + step, 53_125, coda.startMs, codaEndMs - 1, codaEndMs - 0.5].sort((a, b) => a - b)
  const runtime = show.runtime(mode)
  const frames: Rgb[][] = []
  const tail: Sample[] = []
  for (let n = 0; n * step < 60_000 - 1e-6; n++) {
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
    expect(record.composition.showEndMs).toBe(60_000)
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
    expect(resources.blockers).toEqual([])
    expect(resources.artifactBytes).toBeLessThan(68_384)
    expect(new TextEncoder().encode(show.delivered).length).toBeLessThan(68_384)
    expect(resources.persistentGlobals).toBeLessThan(256)
    expect(resources.totalWords).toBeLessThanOrEqual(10_240)
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
      const occlusion = [[17_500, 18_000], [22_500, 23_000], [27_000, 27_200], [33_000, 34_000]]
      occlusion.forEach((times, level) => {
        const deep = points.flatMap((_, i) => ys[i] <= WATER_LINES[level] - 0.05 ? [i] : [])
        for (const t of times) {
          expect(maxDelta(show.frameAt(mode, t), keyed.frameAt(mode, t), deep), `${mode} occlusion at ${t}`).toBeLessThan(1e-6)
        }
      })
      for (const t of [50_625, 51_000, 52_000, 55_000]) {
        expect(show.frameAt(mode, t).filter(visible), `${mode} drained at ${t}`).toHaveLength(0)
      }
    }
  }, SLOW)

  it.each(MODES)('never flashes, never shows white, enters ring by ring and holds still under water (%s)', (mode) => {
    const frames = performance(mode)
    for (const window of flashWindows(frames)) expect(window.fraction, `${mode} second ${window.second}`).toBeLessThanOrEqual(0.25)
    const white = (rgb: Rgb) => sum(rgb) > 0.15 && Math.max(...rgb) - Math.min(...rgb) < 0.1 * Math.max(...rgb)
    expect(frames.findIndex(pixels => pixels.some(white)), `${mode} first white frame`).toBe(-1)
    const ringLit = (from: number, to: number, n: number) => frames.slice(frameIndex(from), frameIndex(to) + 1)
      .some(pixels => zoneIndices(n).some(i => visible(pixels[i])))
    for (const [t, rings] of [[2_500, [true, false, false]], [7_500, [true, true, false]], [12_500, [true, true, true]]] as const) {
      expect([0, 1, 2].map(n => ringLit(t - 500, t + 500, n)), `${mode} rings at ${t}`).toEqual(rings)
    }
    const still = frames[frameIndex(33_000)]
    for (let n = frameIndex(33_000); n <= frameIndex(37_000); n++) expect(maxDelta(frames[n], still), `${mode} still at ${frameTime(n)}`).toBeLessThan(1e-9)
  }, SLOW)

  it.each(MODES)('seeks deterministically into the rise (%s)', (mode) => {
    const reference = performance(mode)[frameIndex(22_500)]
    expect(maxDelta(show.frameAt(mode, frameTime(frameIndex(22_500))), reference)).toBeLessThan(1e-9)
    const runtime = show.runtime(mode)
    const start = runtime.snapshot()
    runtime.advanceTo(33_000, { stepMs: FRAME })
    runtime.restore(start)
    expect(maxDelta(runtime.advanceTo(frameTime(frameIndex(22_500)), { stepMs: FRAME }).pixels, reference)).toBeLessThan(1e-9)
  }, SLOW)

  it.each(MODES)('swims one gold koi lap on the Middle ring above the teal (%s)', (mode) => {
    const frames = performance(mode)
    const noKoi = deliver(withoutKoi())
    const middle = zoneIndices(1)
    for (const t of [42_500, 43_000, 44_000, 45_000, 47_500]) {
      const full = show.frameAt(mode, t)
      const base = noKoi.frameAt(mode, t)
      expect(middle.filter(i => full[i][0] - base[i][0] > 0.02).length, `${mode} koi red at ${t}`).toBeGreaterThan(0)
    }
    const at45 = show.frameAt(mode, 45_000)
    expect(middle.some(i => at45[i][0] > 0.3 && at45[i][0] > at45[i][2]), `${mode} gold over teal`).toBe(true)
    let maxRed = 0
    for (let n = frameIndex(42_500); n <= frameIndex(47_500); n++) {
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
  it.each(MODES)('keeps approved B pixel-identical before the coda opens (%s)', async (mode) => {
    const reopened = await parseShowFileBundle(readFileSync(new URL('../test/fixtures/cloudburstApprovedB.pxlshow', import.meta.url)), { acceptV2: true })
    if (reopened.version !== 2) throw new Error('wrong fixture version')
    const approved = reopened.show
    const withoutCoda = (entry: ShowRecordV2) => ({
      ...entry,
      composition: {
        ...entry.composition,
        clips: entry.composition.clips.filter(clip => clip.id !== 'rain-coda'),
        propertyTracks: entry.composition.propertyTracks.filter(track => !track.id.startsWith('rain-')),
        markers: entry.composition.markers.filter(marker => marker.id !== 'm-last-drop'),
      },
    })
    expect(withoutCoda(record)).toEqual(withoutCoda(approved))
    const frames = performance(mode)
    const runtime = deliver(approved).runtime(mode)
    for (let n = 0; frameTime(n) < coda.startMs; n++) {
      expect(maxDelta(runtime.advanceTo(frameTime(n), { stepMs: FRAME }).pixels, frames[n]), `${mode} at ${frameTime(n)}`).toBeLessThanOrEqual(1e-9)
    }
  }, SLOW)
})
