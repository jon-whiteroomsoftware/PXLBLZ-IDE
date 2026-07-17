import { compileShowForArtifact, compileShowForPreview } from './showPreviewArtifact'
import {
  addShowZone,
  createDefaultShow,
  extendShowCell,
  splitShowAtTime,
  updateShowCellAdaptations,
  updateShowCellRestartOnEntry,
  updateShowTransition,
  createShowWithOutputContract,
  removeShowBoundaryTransition,
  removeShowClip,
  placeShowClip,
  updateShowCellPattern,
} from './showModel'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from './showOutputContract'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { LIBRARIES } from '@/pixelblaze/libs'

describe('compileShowForPreview temporal adaptations (#379)', () => {
  it('uses the same ordered overlay compositor for preview and artifact output (#489)', () => {
    const show = createDefaultShow('show-overlay-preview', 'Overlay preview', 1)
    const patterns = [
      { id: 'solid-red', name: 'Solid red', src: 'export function render(index) { rgb(1, 0, 0) }', controls: {}, updatedAt: 1 },
      { id: 'solid-blue', name: 'Solid blue', src: 'export function render(index) { rgb(0, 0, 1) }', controls: {}, updatedAt: 1 },
    ]
    show.composition = {
      version: 1,
      patternInstances: [
        { id: 'red', pattern: { kind: 'user', id: 'solid-red' }, patternName: 'Solid red', time: { timeScale: 1, timeOffsetMs: 0 } },
        { id: 'blue', pattern: { kind: 'user', id: 'solid-blue' }, patternName: 'Solid blue', time: { timeScale: 1, timeOffsetMs: 0 } },
      ],
      scenes: [
        { sceneId: 'scene-1', zones: [{
          zoneId: 'zone-1',
          main: [{ id: 'red-main', instanceId: 'red', startMs: 0, durationMs: 30_000, view: { mirror: false, phase: 0, brightness: 1 } }],
          overlays: [{
            id: 'blue-layer', name: 'Blue wash', placements: [{
              id: 'blue-overlay', instanceId: 'blue', startMs: 0, durationMs: 30_000, opacity: 0.5,
              view: { mirror: false, phase: 0, brightness: 1 },
            }],
          }],
        }] },
        { sceneId: 'scene-2', zones: [{
          zoneId: 'zone-1',
          main: [{ id: 'red-main-2', instanceId: 'red', startMs: 0, durationMs: 30_000, view: { mirror: false, phase: 0, brightness: 1 } }],
          overlays: [],
        }] },
      ],
    }

    const preview = compileShowForPreview(show, patterns, undefined, {})
    const artifact = compileShowForArtifact(show, patterns, undefined, {})
    const runtime = createFastReplayRuntime({
      code: preview.artifact!.code,
      metadata: preview.artifact!.metadata,
      dimension: nativeDimension(preview.artifact!.metadata.renderFns),
    }, { mapPoints: [{ sample: [0] }], randomSeed: 1 })

    expect(preview.error).toBeNull()
    expect(artifact.error).toBeNull()
    expect(artifact.artifact?.code).toBe(preview.artifact?.code)
    expect(runtime.advanceTo(500, { stepMs: 1000 / 60 }).pixels[0]).toEqual([0.5, 0, 0.5])
  })

  it('resolves explicit Scene composition instances through the shared preview compiler (#488)', () => {
    const show = createDefaultShow('show-composition-preview', 'Composition preview', 1)
    const source = 'export function render(index) { rgb(0.25, index / pixelCount, 0.75) }'
    const patterns = [{ id: 'user-composition', name: 'Composition member', src: source, controls: {}, updatedAt: 1 }]
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-user',
        pattern: { kind: 'user', id: 'user-composition' },
        patternName: 'Composition member',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [
        {
          sceneId: 'scene-1',
          zones: [{
            zoneId: 'zone-1',
            main: [
              { id: 'placement-a', instanceId: 'instance-user', startMs: 0, durationMs: 10_000, view: { mirror: false, phase: 0, brightness: 1 } },
              { id: 'placement-b', instanceId: 'instance-user', startMs: 20_000, durationMs: 10_000, view: { mirror: false, phase: 0, brightness: 0.5 } },
            ],
            overlays: [],
          }],
        },
        {
          sceneId: 'scene-2',
          zones: [{
            zoneId: 'zone-1',
            main: [{ id: 'placement-c', instanceId: 'instance-user', startMs: 0, durationMs: 30_000, view: { mirror: false, phase: 0, brightness: 1 } }],
            overlays: [],
          }],
        },
      ],
    }

    const compiled = compileShowForPreview(show, patterns, undefined, {})

    expect(compiled.error).toBeNull()
    expect(compiled.artifact?.summary.clips.filter((clip) => clip.id === 'instance-user')).toHaveLength(1)
    expect(compiled.artifact?.expandedCode).toContain('__pxlblz_show_c0_rgb(0.25')
  })

  it('seeks deterministically across local Cut boundaries and explicit empty gaps (#488)', () => {
    const show = createDefaultShow('show-composition-seek', 'Composition seek', 1)
    const patterns = [
      { id: 'solid-red', name: 'Solid red', src: 'export function render(index) { rgb(1, 0, 0) }', controls: {}, updatedAt: 1 },
      { id: 'solid-blue', name: 'Solid blue', src: 'export function render(index) { rgb(0, 0, 1) }', controls: {}, updatedAt: 1 },
    ]
    show.composition = {
      version: 1,
      patternInstances: [
        { id: 'red', pattern: { kind: 'user', id: 'solid-red' }, patternName: 'Solid red', time: { timeScale: 1, timeOffsetMs: 0 } },
        { id: 'blue', pattern: { kind: 'user', id: 'solid-blue' }, patternName: 'Solid blue', time: { timeScale: 1, timeOffsetMs: 0 } },
      ],
      scenes: [
        {
          sceneId: 'scene-1',
          zones: [{ zoneId: 'zone-1', main: [
            { id: 'red-a', instanceId: 'red', startMs: 0, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } },
            { id: 'blue-a', instanceId: 'blue', startMs: 2_000, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } },
          ], overlays: [] }],
        },
        { sceneId: 'scene-2', zones: [{ zoneId: 'zone-1', main: [], overlays: [] }] },
      ],
    }
    const artifact = compileShowForPreview(show, patterns, undefined, {}).artifact!
    const createRuntime = () => createFastReplayRuntime({
      code: artifact.code,
      metadata: artifact.metadata,
      dimension: nativeDimension(artifact.metadata.renderFns),
    }, { mapPoints: Array.from({ length: 4 }, (_, index) => ({ sample: [index / 3] })), randomSeed: 1 })
    const runtime = createRuntime()

    expect(runtime.advanceTo(500, { stepMs: 1000 / 60 }).pixels[0]).toEqual([1, 0, 0])
    expect(createRuntime().advanceTo(1_500, { stepMs: 1000 / 60 }).pixels[0]).toEqual([0, 0, 0])
    expect(runtime.advanceTo(2_500, { stepMs: 1000 / 60 }).pixels[0]).toEqual([0, 0, 1])
    expect(createRuntime().advanceTo(1_500, { stepMs: 1000 / 60 }).pixels[0]).toEqual([0, 0, 0])
  })

  it('seeks through Scene-local Property animation with the artifact evaluator (#490)', () => {
    const show = createDefaultShow('show-property-seek', 'Property seek', 1)
    const patterns = [{
      id: 'solid-red', name: 'Solid red',
      src: 'export function render(index) { rgb(1, 0, 0) }',
      controls: {}, updatedAt: 1,
    }]
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'red', pattern: { kind: 'user', id: 'solid-red' }, patternName: 'Solid red',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [{
        sceneId: 'scene-1',
        propertyTracks: [{
          id: 'brightness',
          target: { kind: 'placement-view', placementId: 'red-main', property: 'brightness' },
          keyframes: [
            { id: 'brightness-a', timeMs: 0, value: 0, easing: { curve: 'linear' } },
            { id: 'brightness-b', timeMs: 1000, value: 1, easing: { curve: 'linear' } },
          ],
        }],
        zones: [{
          zoneId: 'zone-1',
          main: [{
            id: 'red-main', instanceId: 'red', startMs: 0, durationMs: 30_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      }, {
        sceneId: 'scene-2',
        zones: [{ zoneId: 'zone-1', main: [], overlays: [] }],
      }],
    }
    const preview = compileShowForPreview(show, patterns, undefined, {})
    const artifact = compileShowForArtifact(show, patterns, undefined, {})
    const createRuntime = () => createFastReplayRuntime({
      code: preview.artifact!.code,
      metadata: preview.artifact!.metadata,
      dimension: nativeDimension(preview.artifact!.metadata.renderFns),
    }, { mapPoints: [{ sample: [0] }], randomSeed: 490 })

    const firstSeek = createRuntime().advanceTo(500, { stepMs: 50 })
    const repeatedSeek = createRuntime().advanceTo(500, { stepMs: 50 })
    expect(preview.error).toBeNull()
    expect(artifact.error).toBeNull()
    expect(preview.artifact?.code).toBe(artifact.artifact?.code)
    expect(firstSeek.pixels[0][0]).toBeCloseTo(0.5)
    expect(repeatedSeek.checksum).toBe(firstSeek.checksum)
  })

  it('renders an empty first scene black after its clip is deleted', () => {
    const initial = updateShowCellPattern(createDefaultShow('show-empty-first', 'Empty first scene', 1), 'cell-2', {
      pattern: { kind: 'stock', id: 'ShapeShifter' },
      patternName: 'ShapeShifter',
    })
    const show = removeShowClip(initial, 'cell-1')
    const compiled = compileShowForPreview(show, [], undefined, LIBRARIES, { stageDimension: 2 })
    const artifact = compiled.artifact!
    const mapPoints = Array.from({ length: 64 }, (_, index) => ({
      sample: [(index % 8) / 7, Math.floor(index / 8) / 7],
    }))
    const createRuntime = () => createFastReplayRuntime({
      code: artifact.code,
      metadata: artifact.metadata,
      dimension: nativeDimension(artifact.metadata.renderFns),
    }, { mapPoints, randomSeed: 1 })

    const emptyFrame = createRuntime().advanceTo(8_000, { stepMs: 1000 / 60 })
    const secondSceneFrame = createRuntime().advanceTo(35_000, { stepMs: 1000 / 60 })

    expect(compiled.error).toBeNull()
    expect(emptyFrame.pixels.every((pixel) => pixel.every((channel) => channel === 0))).toBe(true)
    expect(secondSceneFrame.pixels.some((pixel) => pixel.some((channel) => channel > 0))).toBe(true)
  })

  it('renders a library-backed 2D Pattern after the second clip and transition are removed', () => {
    const initial = createDefaultShow('show-single-2d', 'Shape study', 1)
    const oneClip = removeShowClip(initial, 'cell-2')
    const cut = removeShowBoundaryTransition(oneClip, 'transition-scene-1')
    const show = updateShowCellPattern(cut, 'cell-1', {
      pattern: { kind: 'stock', id: 'ShapeShifter' },
      patternName: 'ShapeShifter',
    })
    const compiled = compileShowForPreview(show, [], undefined, LIBRARIES, { stageDimension: 2 })
    const artifact = compiled.artifact!
    const mapPoints = Array.from({ length: 256 }, (_, index) => ({
      sample: [(index % 16) / 15, Math.floor(index / 16) / 15],
    }))
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      metadata: artifact.metadata,
      dimension: nativeDimension(artifact.metadata.renderFns),
    }, { mapPoints, randomSeed: 1 })

    const frame = runtime.advanceTo(8_000, { stepMs: 1000 / 60 })
    const emptySecondScene = runtime.advanceTo(45_000, { stepMs: 1000 / 60 })

    expect(compiled.error).toBeNull()
    expect(artifact.metadata.renderFns).toMatchObject({ hasRender: false, hasRender2D: true })
    expect(frame.pixels.some((pixel) => pixel.some((channel) => channel > 0))).toBe(true)
    expect(emptySecondScene.pixels.every((pixel) => pixel.every((channel) => channel === 0))).toBe(true)
  })

  it('keeps invalid Installation coverage previewable but blocks artifact compilation (#435)', () => {
    const show = createShowWithOutputContract(
      'show-installation',
      'Installation',
      createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
    )
    show.routingLayouts[0].zones[0].ranges = [{ start: 0, end: 5 }]

    expect(compileShowForPreview(show, [], undefined, {}).artifact).not.toBeNull()
    expect(compileShowForArtifact(show, [], undefined, {})).toEqual({
      artifact: null,
      error: 'Installation output is incomplete: Default assigns 6 of 8 pixels (2 missing). Repair physical pixel ranges in Show properties.',
    })
  })

  it('keeps incompatible Portable members previewable but blocks artifact output (#436)', () => {
    const show = createShowWithOutputContract(
      'show-portable',
      'Portable',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
    )
    const patterns = [{
      id: 'three-d',
      name: 'Volumetric only',
      src: 'export function render3D(index, x, y, z) { rgb(x, y, z) }',
      controls: {},
      updatedAt: 1,
    }]
    show.cells = show.cells.map((cell) => ({
      ...cell,
      pattern: { kind: 'user' as const, id: 'three-d' },
      patternName: 'Volumetric only',
    }))

    expect(compileShowForPreview(show, patterns, undefined, {}, { stageDimension: 2 }).artifact).not.toBeNull()
    expect(compileShowForArtifact(show, patterns, undefined, {}, { stageDimension: 2 })).toEqual({
      artifact: null,
      error: 'Portable 2D compatibility failed: Volumetric only defines only render3D. Choose a Pattern with render2D or render, or author that renderer before export or send.',
    })
  })

  it('loads the exact stepped-clock artifact used by generated Show output', () => {
    const base = extendShowCell(createDefaultShow('show-1', 'Stepped hold'), 'cell-1', 2)
    const show = updateShowCellAdaptations(base, 'cell-1', {
      steppedClock: { stepMs: 125 },
    })

    const compiled = compileShowForPreview(show, [], undefined, {})

    expect(compiled.error).toBeNull()
    expect(compiled.artifact?.summary).toMatchObject({
      temporalPolicy: 'stepped-clock',
      renderPolicy: 'single-continuous-hold',
      clips: [expect.objectContaining({ stepMs: 125 })],
    })
    expect(compiled.artifact?.expandedCode).toContain('var __pxlblz_show_c0_step_ms = 125')
  })

  it('loads routed multi-range offsets and the later Scene schedule into the exact Stage artifact', () => {
    const withRightZone = addShowZone(createDefaultShow('show-1', 'Rounds'), {
      name: 'right',
      nominalPixelCount: 4,
    })
    const base = placeShowClip(withRightZone, 'zone-2', 'scene-1', {
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
    })
    const rightCell = base.cells.find((cell) => cell.zoneId === 'zone-2' && cell.sceneId === 'scene-1')!
    const show = updateShowCellAdaptations(base, rightCell.id, { timeOffsetMs: 500 })
    const compiled = compileShowForPreview(show, [], [
      { id: 'left', name: 'main', ranges: [{ start: 0, end: 1 }, { start: 4, end: 5 }] },
      { id: 'right', name: 'right', ranges: [{ start: 2, end: 3 }, { start: 6, end: 7 }] },
    ], {})
    const artifact = compiled.artifact!
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      metadata: artifact.metadata,
      dimension: nativeDimension(artifact.metadata.renderFns),
    }, {
      mapPoints: Array.from({ length: 8 }, (_, index) => ({ sample: [index / 7] })),
      randomSeed: 379,
    })
    const firstScene = runtime.advanceTo(8_000, { stepMs: 1000 / 60 })
    const secondScene = runtime.advanceTo(35_000, { stepMs: 1000 / 60 })
    const leftPixels = [0, 1, 4, 5]
    const rightPixels = [2, 3, 6, 7]

    expect(compiled.error).toBeNull()
    expect(artifact.summary).toMatchObject({
      clipCount: 4,
      transitionCount: 1,
      renderPolicy: 'steady-active-transition-both',
      timeOffsetPolicy: 'per-clip',
      clips: [
        expect.objectContaining({ timeOffsetMs: 0 }),
        expect.objectContaining({ timeOffsetMs: 500 }),
        expect.objectContaining({ id: 'cell-2', timeOffsetMs: 0 }),
        expect.objectContaining({ id: '__pxlblz_empty-routed', timeOffsetMs: 0 }),
      ],
    })
    expect(artifact.expandedCode).toContain('var __pxlblz_show_c1_elapsed_ms = 500')
    expect(rightPixels.some((index) => firstScene.pixels[index].some((channel) => channel > 0))).toBe(true)
    expect(leftPixels.some((index) => secondScene.pixels[index].some((channel) => channel > 0))).toBe(true)
    expect(rightPixels.every((index) => secondScene.pixels[index].every((channel) => channel === 0))).toBe(true)
  })

  it('validates and compiles the selected 2D Stage domain for portal transitions', () => {
    const base = { ...createDefaultShow('show-1', 'Portal'), stageMapId: 'plane' }
    const show = updateShowTransition(base, 'scene-1', 'portal', 2000, 0.1, {
      centerX: 0.5,
      centerY: 0.5,
      invert: false,
      featherPolicy: 'dither',
    })

    expect(compileShowForPreview(show, [], undefined, {}, { stageDimension: 3 }).error)
      .toMatch(/requires a 2D Stage Map/i)

    const compiled = compileShowForPreview(show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    expect(compiled.artifact?.metadata.renderFns).toEqual({
      hasBeforeRender: true,
      hasRender: false,
      hasRender2D: true,
      hasRender3D: false,
    })
  })

  it('uses shared preview state for Continue and isolated state for Restart (#415)', () => {
    const continued = splitShowAtTime(createDefaultShow('show-1', 'Split preview'), 10_000)
    const destination = continued.cells.find((cell) => cell.sceneId === 'scene-3')!

    const continueArtifact = compileShowForPreview(continued, [], undefined, {}).artifact
    expect(continueArtifact?.summary.clipCount).toBe(2)
    expect(continueArtifact?.expandedCode.match(/var __pxlblz_show_c0_elapsed_ms/g)).toHaveLength(1)

    const restarted = updateShowCellRestartOnEntry(continued, destination.id, true)
    const restartArtifact = compileShowForPreview(restarted, [], undefined, {}).artifact
    expect(restartArtifact?.summary.clipCount).toBe(3)
    expect(restartArtifact?.expandedCode).toContain('var __pxlblz_show_c2_elapsed_ms = 0')
  })
})
