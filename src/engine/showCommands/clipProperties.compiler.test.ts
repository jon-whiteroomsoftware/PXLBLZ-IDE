import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from '../fastReplay'
import { nativeDimension } from '../loadPattern'
import type { PatternRecord, ShowRecord } from '../personalContentRecords'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '../showFileBundle'
import { createDefaultShow } from '../showModel'
import { createPortableShowOutputContract } from '../showOutputContract'
import { compileShowForArtifact } from '../showPreviewArtifact'
import { splitShowClipAtGlobalTime } from '../showTimelineClipAuthoring'
import { applyShowCommand } from './registry'

const patterns: PatternRecord[] = [
  { id: 'solid-red', name: 'Solid red', src: 'export function render2D(index, x, y) { rgb(1, 0, 0) }', controls: {}, updatedAt: 1 },
  { id: 'asymmetric', name: 'Asymmetric coordinates', src: 'export function render2D(index, x, y) { rgb(x, y, 1) }', controls: {}, updatedAt: 1 },
]

function visualShow(overlay = true): ShowRecord {
  const show = createDefaultShow('inspector-visual', 'Inspector visual acceptance', 1)
  show.outputContract = createPortableShowOutputContract({ referenceMapId: null, referencePixelCount: 4 })
  show.routingLayouts = [{ id: 'layout-1', name: 'Default', zones: [], logical: { kind: 'single', zoneIds: ['zone-1'] } }]
  show.transitions = [{ id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'cut', durationMs: 0, easing: { curve: 'linear' } }]
  show.composition = {
    version: 1,
    patternInstances: [
      { id: 'red', pattern: { kind: 'user', id: 'solid-red' }, patternName: 'Solid red', time: { timeScale: 1, timeOffsetMs: 0 } },
      { id: 'target', pattern: { kind: 'user', id: overlay ? 'asymmetric' : 'solid-red' }, patternName: overlay ? 'Asymmetric coordinates' : 'Solid red', time: { timeScale: 1, timeOffsetMs: 0 } },
    ],
    scenes: [{
      sceneId: 'scene-1',
      zones: [{
        zoneId: 'zone-1',
        main: [{
          id: overlay ? 'lower' : 'clip-target', instanceId: overlay ? 'red' : 'target', startMs: 0, durationMs: 30_000,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
        overlays: overlay ? [{
          id: 'overlay', name: 'Target overlay', placements: [{
            id: 'clip-target', instanceId: 'target', startMs: 0, durationMs: 30_000, opacity: 1,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
        }] : [],
      }],
    }, {
      sceneId: 'scene-2',
      zones: [{ zoneId: 'zone-1', main: [], overlays: [] }],
    }],
  }
  return show
}

function splitVisualShow(): ShowRecord {
  const show = visualShow(false)
  const first = show.composition!.scenes[0].zones[0].main[0]
  first.durationMs = 30_000
  first.opacity = 0.6
  first.transform = { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
  first.viewport = { enabled: true, x: 0, y: 0, width: 0.5, height: 1, aperture: 'rectangle' }
  show.composition!.scenes[1].zones[0].main = [{
    ...structuredClone(first),
    id: 'clip-target--span-scene-2',
    logicalClipId: 'clip-target',
    startMs: 0,
    transform: { positionX: 0.25, positionY: 0, rotation: 0, scaleX: 0.5, scaleY: 1 },
    viewport: { enabled: true, x: 0.5, y: 0, width: 0.5, height: 1, aperture: 'ellipse' },
  }]
  show.composition!.patternInstances[1].pattern = { kind: 'user', id: 'asymmetric' }
  show.composition!.patternInstances[1].patternName = 'Asymmetric coordinates'
  return show
}

function applied(show: ShowRecord, command: string, input: Record<string, unknown>): ShowRecord {
  const outcome = applyShowCommand(show, command, { clip_id: 'clip-target', ...input })
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
  if (!outcome.ok) throw new Error('command refused')
  return outcome.record
}

async function reopen(show: ShowRecord): Promise<ShowRecord> {
  const { bundle } = buildShowFileBundle(show, { patterns, maps: [] }, { appVersion: '1011-1017', exportedAt: '2026-09-12T00:00:00Z' })
  return (await parseShowFileBundle(await serializeShowFileBundle(bundle))).show
}

async function pixelAt(show: ShowRecord, x: number, y: number, timeMs = 100): Promise<number[]> {
  const reopened = await reopen(show)
  const compiled = compileShowForArtifact(reopened, patterns, undefined, {}, { stageDimension: 2 })
  expect(compiled.error).toBeNull()
  if (!compiled.artifact) throw new Error('compile failed')
  const runtime = createFastReplayRuntime({
    code: compiled.artifact.code,
    fxCode: compiled.artifact.fxCode,
    metadata: compiled.artifact.metadata,
    dimension: nativeDimension(compiled.artifact.metadata.renderFns),
  }, { mapPoints: [{ sample: [x, y], pos: [x, y] }], randomSeed: 1011, fidelity: 'fast' })
  return runtime.advanceLive(timeMs).pixels[0]
}

describe('compiled and reopened static Clip inspector commands (#1011, #1017)', () => {
  it('distinguishes Main black fade from overlay source-over opacity at 0, partial and 1', async () => {
    for (const [opacity, expected] of [[0, [0, 0, 0]], [0.4, [0.4, 0, 0]], [1, [1, 0, 0]]] as const) {
      expect(await pixelAt(applied(visualShow(false), 'set_clip_opacity', { opacity }), 0.75, 0.5)).toEqual(expected)
    }
    for (const [opacity, expected] of [[0, [1, 0, 0]], [0.4, [0.9, 0.2, 0.4]], [1, [0.75, 0.5, 1]]] as const) {
      const pixel = await pixelAt(applied(visualShow(), 'set_clip_opacity', { opacity }), 0.75, 0.5)
      expected.forEach((value, index) => expect(pixel[index]).toBeCloseTo(value, 8))
    }
  })

  it('keeps the right-half aperture fixed while Content position, quarter-turn rotation and nonuniform scale change source coordinates', async () => {
    const framed = applied(visualShow(), 'set_clip_aperture', {
      enabled: true, x: 0.5, y: 0, width: 0.5, height: 1, aperture: 'rectangle', edge: 'hard',
    })
    expect(await pixelAt(framed, 0.25, 0.75)).toEqual([1, 0, 0])
    expect(await pixelAt(framed, 0.75, 0.75)).toEqual([0.75, 0.75, 1])

    const posed = applied(framed, 'set_clip_transform', {
      position_x: 0.25, position_y: 0, rotation: 0.25, scale_x: 0.5, scale_y: 1,
    })
    expect(await pixelAt(posed, 0.25, 0.75)).toEqual([1, 0, 0])
    const posedPixel = await pixelAt(posed, 0.75, 0.75)
    expect(posedPixel[0]).toBeCloseTo(1, 12)
    expect(posedPixel.slice(1)).toEqual([0.5, 1])
  })

  it('renders enabled, disabled, re-enabled and inverted ellipse states from command-authored records', async () => {
    const ellipse = applied(visualShow(), 'set_clip_aperture', {
      enabled: true, x: 0.5, y: 0, width: 0.5, height: 1, aperture: 'ellipse', edge: 'hard',
    })
    expect(await pixelAt(ellipse, 0.25, 0.5)).toEqual([1, 0, 0])
    expect(await pixelAt(ellipse, 0.75, 0.5)).toEqual([0.75, 0.5, 1])

    const disabled = applied(ellipse, 'set_clip_aperture', { enabled: false })
    expect(await pixelAt(disabled, 0.25, 0.5)).toEqual([0.25, 0.5, 1])
    const reenabled = applied(disabled, 'set_clip_aperture', { enabled: true })
    expect(await pixelAt(reenabled, 0.75, 0.5)).toEqual([0.75, 0.5, 1])
    const inverted = applied(reenabled, 'set_clip_aperture', { invert: true })
    expect(await pixelAt(inverted, 0.75, 0.5)).toEqual([1, 0, 0])
    expect(await pixelAt(inverted, 0.25, 0.5)).toEqual([0.25, 0.5, 1])
  })

  it('compiles both reopened physical segments after independently merging their divergent Transform and Aperture state', async () => {
    const source = splitVisualShow()
    const posed = applied(source, 'set_clip_transform', { position_y: 0.25, rotation: 0.25 })
    const edged = applied(posed, 'set_clip_aperture', { edge: 'hard' })
    const opacity = applied(edged, 'set_clip_opacity', { opacity: 0.6 })
    const reopened = await reopen(opacity)
    const [first, second] = reopened.composition!.scenes.map(scene => scene.zones[0].main[0])
    expect(first.transform).toEqual({ positionX: 0, positionY: 0.25, rotation: 0.25, scaleX: 1, scaleY: 1 })
    expect(second.transform).toEqual({ positionX: 0.25, positionY: 0.25, rotation: 0.25, scaleX: 0.5, scaleY: 1 })
    expect(first.viewport).toEqual({ enabled: true, x: 0, y: 0, width: 0.5, height: 1, edge: 'hard' })
    expect(second.viewport).toEqual({ enabled: true, x: 0.5, y: 0, width: 0.5, height: 1, aperture: 'ellipse', edge: 'hard' })
    expect(first.opacity).toBe(0.6)
    expect(second.opacity).toBe(0.6)
    expect(await pixelAt(reopened, 0.75, 0.5, 100)).toEqual([0, 0, 0])
    expect(await pixelAt(reopened, 0.25, 0.5, 100)).not.toEqual([0, 0, 0])
    expect(await pixelAt(reopened, 0.25, 0.5, 30_100)).toEqual([0, 0, 0])
    const viewportOnly = structuredClone(reopened)
    delete viewportOnly.composition!.scenes[1].zones[0].main[0].transform
    const viewportOnlyPixel = await pixelAt(viewportOnly, 0.75, 0.625, 30_100)
    ;[0.45, 0.375, 0.6].forEach((value, index) => expect(viewportOnlyPixel[index]).toBeCloseTo(value, 12))
    const transformOnly = structuredClone(reopened)
    delete transformOnly.composition!.scenes[1].zones[0].main[0].viewport
    // Inverse pose at Zone point (.75,.625): subtract (.25,.25), rotate
    // -0.25 turns around center, then divide X by .5 => source (.25,.5).
    const transformOnlyPixel = await pixelAt(transformOnly, 0.75, 0.625, 30_100)
    ;[0.15, 0.3, 0.6].forEach((value, index) => expect(transformOnlyPixel[index]).toBeCloseTo(value, 12))
    // The fixed Aperture evaluates the original Zone point, whose normalized
    // ellipse distance is .25 from frame center (.75,.5), while Content alone
    // receives the inverse-pose source coordinate above.
    const combinedPixel = await pixelAt(reopened, 0.75, 0.625, 30_100)
    ;[0.15, 0.3, 0.6].forEach((value, index) => expect(combinedPixel[index]).toBeCloseTo(value, 12))
  })

  it('reopens and compiles each divergent physical appearance after a partial setter and logical split', async () => {
    const source = splitVisualShow()
    const posed = applied(source, 'set_clip_transform', { position_y: 0.25, rotation: 0.25 })
    const edged = applied(posed, 'set_clip_aperture', { edge: 'hard' })
    const opacity = applied(edged, 'set_clip_opacity', { opacity: 0.6 })
    const composition = splitShowClipAtGlobalTime(opacity, opacity.composition!, {
      owner: { kind: 'main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'clip-target' },
      globalTimeMs: 15_000,
      newPlacementId: 'right',
    })
    expect(composition).not.toBe(opacity.composition)

    const reopened = await reopen({ ...opacity, composition })
    expect(reopened.composition!.scenes[0].zones[0].main).toMatchObject([
      {
        id: 'clip-target',
        transform: { positionX: 0, positionY: 0.25, rotation: 0.25, scaleX: 1, scaleY: 1 },
        viewport: { enabled: true, x: 0, y: 0, width: 0.5, height: 1, edge: 'hard' },
      },
      {
        id: 'right',
        transform: { positionX: 0, positionY: 0.25, rotation: 0.25, scaleX: 1, scaleY: 1 },
        viewport: { enabled: true, x: 0, y: 0, width: 0.5, height: 1, edge: 'hard' },
      },
    ])
    expect(reopened.composition!.scenes[1].zones[0].main).toMatchObject([{
      id: 'right--span-scene-2',
      logicalClipId: 'right',
      transform: { positionX: 0.25, positionY: 0.25, rotation: 0.25, scaleX: 0.5, scaleY: 1 },
      viewport: { enabled: true, x: 0.5, y: 0, width: 0.5, height: 1, aperture: 'ellipse', edge: 'hard' },
    }])
    const compiledTail = await pixelAt(reopened, 0.75, 0.625, 30_100)
    ;[0.15, 0.3, 0.6].forEach((value, index) => expect(compiledTail[index]).toBeCloseTo(value, 12))
  })
})
