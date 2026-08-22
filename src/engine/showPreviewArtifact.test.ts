import {
  compileShowForArtifact,
  compileShowForPreview,
  resolveShowCompilationControllerZones,
  sourceForShowPatternRef,
} from './showPreviewArtifact'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import {
  addShowZone,
  createDefaultShow,
  extendShowCell,
  splitShowAtTime,
  updateShowCellAdaptations,
  updateShowCellRestartOnEntry,
  updateShowTransition,
  updateShowBoundaryTransition,
  createShowWithOutputContract,
  removeShowBoundaryTransition,
  removeShowClip,
  placeShowClip,
  updateShowCellPattern,
  updateShowRoutingLayout,
} from './showModel'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from './showOutputContract'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { LIBRARIES } from '@/pixelblaze/libs'

describe('retired stock Pattern references (#63)', () => {
  it('resolves a retired stock id to its successor source', () => {
    const retired = { kind: 'stock' as const, id: 'DoomFire' }
    const successor = { kind: 'stock' as const, id: 'DoomFireV20_2D' }
    expect(sourceForShowPatternRef(retired, [])).toBe(sourceForShowPatternRef(successor, []))
    expect(sourceForShowPatternRef(retired, [])).not.toBe(DEMOS.TestPattern1D)
  })
})

describe('compileShowForPreview temporal adaptations (#379)', () => {
  it('reuses one compiled artifact across equivalent preview and artifact consumers', () => {
    const show = createDefaultShow('show-shared-compile', 'Shared compile', 1)

    const preview = compileShowForPreview(show, [], undefined, {})
    const artifact = compileShowForArtifact(structuredClone(show), [], undefined, {})

    expect(preview.error).toBeNull()
    expect(artifact.error).toBeNull()
    expect(artifact.artifact).toBe(preview.artifact)
  })

  it('invalidates the shared artifact when compiler inputs change, not for record metadata', () => {
    const show = createDefaultShow('show-compile-invalidation', 'Compile invalidation', 1)
    const initial = compileShowForPreview(show, [], undefined, {})
    const metadataOnly = compileShowForPreview(
      { ...show, updatedAt: show.updatedAt + 1 },
      [],
      undefined,
      {},
    )
    const adapted = compileShowForPreview(
      updateShowCellAdaptations(show, 'cell-1', { brightness: 0.5 }),
      [],
      undefined,
      {},
    )

    expect(metadataOnly.artifact).toBe(initial.artifact)
    expect(adapted.artifact).not.toBe(initial.artifact)
  })

  // #775: the resolution ladder collapsed to the Show's own physical Zone
  // Layout. One case per former branch.
  describe('resolveShowCompilationControllerZones (#775)', () => {
    it('installation + physical layout resolves the saved routing ranges', () => {
      const show = createShowWithOutputContract(
        'show-shared-installation-zones',
        'Shared Installation zones',
        createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
      )
      show.routingLayouts[0].zones[0].ranges = [{ start: 0, end: 7 }]

      expect(resolveShowCompilationControllerZones(show)).toEqual([{
        id: `${show.routingLayouts[0].id}:${show.zones[0].id}`,
        name: show.zones[0].name,
        ranges: [{ start: 0, end: 7 }],
      }])
    })

    it('installation + logical layout resolves no zones', () => {
      const show = createShowWithOutputContract(
        'show-logical-resolve',
        'Logical resolve',
        createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
      )
      show.routingLayouts[0].logical = { kind: 'single', zoneIds: [show.zones[0].id] }

      expect(resolveShowCompilationControllerZones(show)).toBeUndefined()
    })

    it('portable-2d resolves no zones', () => {
      const show = createShowWithOutputContract(
        'show-portable-resolve',
        'Portable resolve',
        createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 64 }),
      )

      expect(resolveShowCompilationControllerZones(show)).toBeUndefined()
    })
  })

  // #775: Controller-profile zone ranges never reach a loadable Show's
  // compiled artifact. Every installation-contract recipe shadows the
  // caller-provided controllerZones with the Show's own layout data, so the
  // profile-zone retirement is a no-op for compiled output. These fixtures are
  // the mechanical proof: they must hold both before and after the removal.
  describe('caller-provided controller zones cannot change installation artifacts (#775)', () => {
    const legacyProfileZones = [
      { id: 'legacy-a', name: 'main', ranges: [{ start: 0, end: 99 }] },
      { id: 'legacy-b', name: 'spire', ranges: [{ start: 100, end: 149 }] },
    ]

    it('physical Zone Layout: identical artifact with and without profile zones', () => {
      const show = createShowWithOutputContract(
        'show-775-physical',
        'Physical shadowing',
        createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
      )
      show.routingLayouts[0].zones[0].ranges = [{ start: 0, end: 7 }]

      const bare = compileShowForPreview(structuredClone(show), [], undefined, {})
      const withProfileZones = compileShowForPreview(structuredClone(show), [], legacyProfileZones, {})

      expect(bare.error).toBeNull()
      expect(withProfileZones.artifact?.code).toBe(bare.artifact?.code)
    })

    it('logical Zone Layout: identical artifact with and without profile zones', () => {
      const show = createShowWithOutputContract(
        'show-775-logical',
        'Logical shadowing',
        createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
      )
      show.stageMapId = 'plane'
      show.routingLayouts[0].logical = { kind: 'single', zoneIds: [show.zones[0].id] }

      const bare = compileShowForPreview(structuredClone(show), [], undefined, {}, { stageDimension: 2 })
      const withProfileZones = compileShowForPreview(
        structuredClone(show), [], legacyProfileZones, {}, { stageDimension: 2 },
      )

      expect(bare.error).toBeNull()
      expect(withProfileZones.artifact?.code).toBe(bare.artifact?.code)
    })
  })

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

  it('resolves Group definition Patterns for every linked occurrence (#587)', () => {
    const show = createDefaultShow('show-group-preview', 'Group preview', 1)
    const source = 'export function render(index) { rgb(0.2, 0.4, 0.8) }'
    const patterns = [{ id: 'group-pattern', name: 'Group Pattern', src: source, controls: {}, updatedAt: 1 }]
    show.composition = {
      version: 1,
      executionModel: 'deterministic-loop',
      patternInstances: [],
      scenes: [{ sceneId: 'scene-1', zones: [{ zoneId: 'zone-1', main: [], overlays: [] }] }],
      groupDefinitions: [{
        id: 'phrase',
        name: 'Phrase',
        patternInstances: [{
          id: 'inside-instance',
          pattern: { kind: 'user', id: 'group-pattern' },
          patternName: 'Group Pattern',
          time: { timeScale: 1, timeOffsetMs: 0 },
        }],
        placements: [{
          id: 'inside-clip', instanceId: 'inside-instance', layerOffset: 0,
          startMs: 0, durationMs: 1_000, opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
      }],
      groupOccurrences: [
        { id: 'use-a', definitionId: 'phrase', sceneId: 'scene-1', zoneId: 'zone-1', startMs: 0, baseLayer: 0, translationX: 0, translationY: 0 },
        { id: 'use-b', definitionId: 'phrase', sceneId: 'scene-1', zoneId: 'zone-1', startMs: 2_000, baseLayer: 0, translationX: 0, translationY: 0 },
      ],
    }

    const compiled = compileShowForPreview(show, patterns, undefined, {})

    expect(compiled.error).toBeNull()
    // Both occurrences resolve and compile; with #717 branch grouping the
    // slotted candidate (#546) now wins the size selection, so the two
    // disjoint-lifetime occurrence machines legally share one physical slot.
    expect(compiled.artifact?.summary.clips.map((clip) => clip.id).filter((id) => id !== '__pxlblz_empty-routed')).toEqual([
      'use-a:inside-instance',
    ])
    expect(compiled.artifact?.summary.specializations.patternSlots).toMatchObject({
      selected: true,
      reclaimedMachineCount: 1,
    })
    expect(compiled.artifact?.expandedCode).toContain('__pxlblz_show_c0_rgb(0.2')
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

  it('keeps an over-limit Installation previewable but blocks every artifact action (#514)', () => {
    const show = createShowWithOutputContract(
      'show-installation-over-limit',
      'Oversized Installation',
      { version: 1, kind: 'installation', outputMapId: 'plane', pixelCount: 2_001, resolution: 'fixed' },
    )
    const preview = compileShowForPreview(show, [], undefined, {})
    const artifact = compileShowForArtifact(show, [], undefined, {})

    expect(preview.artifact).not.toBeNull()
    expect(preview.artifact?.summary.resources.blockers).toContainEqual(expect.objectContaining({
      kind: 'output-pixel-limit',
    }))
    expect(artifact.artifact).not.toBeNull()
    expect(artifact.error).toBeNull()
    expect(artifact.artifactBlocker).toBe(
      'Show output contract requests 2,001 pixels; compiled Shows support at most 2,000. Reduce the Installation output or target Controller pixel count.',
    )
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

  it('blocks a Portable artifact for a Controller above the runtime ceiling without changing its reference preview (#514)', () => {
    const show = createShowWithOutputContract(
      'show-portable-over-limit-target',
      'Portable field',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1_024 }),
    )
    show.cells = show.cells.map((cell) => ({
      ...cell,
      pattern: { kind: 'stock' as const, id: 'ShapeShifter' },
      patternName: 'ShapeShifter',
    }))

    const preview = compileShowForPreview(show, [], undefined, LIBRARIES, { stageDimension: 2 })
    const artifact = compileShowForArtifact(show, [], undefined, LIBRARIES, {
      stageDimension: 2,
      targetPixelCount: 2_001,
    })

    expect(preview.artifact?.summary.resources.pixelCount).toBe(2_000)
    expect(preview.artifact?.summary.resources.blockers).toEqual([])
    expect(artifact.artifact).not.toBeNull()
    expect(artifact.artifactBlocker).toBe(
      'Target Controller reports 2,001 pixels; compiled Shows support at most 2,000. Reduce the Controller pixel count before Run or Save.',
    )
  })

  it('keeps a dynamic member allocation previewable but blocks artifact output with a remedy (#514)', () => {
    const show = createDefaultShow('show-dynamic-allocation', 'Dynamic allocation', 1)
    const patterns = [{
      id: 'dynamic-array',
      name: 'Dynamic array',
      src: `
export var sliderSize = 0.5
var field = array(sliderSize)
export function render(index) { rgb(field[index], 0, 0) }
`,
      controls: {},
      updatedAt: 1,
    }]
    show.cells = show.cells.map((cell) => ({
      ...cell,
      pattern: { kind: 'user' as const, id: 'dynamic-array' },
      patternName: 'Dynamic array',
    }))

    const preview = compileShowForPreview(show, patterns, undefined, {})
    const artifact = compileShowForArtifact(show, patterns, undefined, {})

    expect(preview.artifact).not.toBeNull()
    expect(artifact.artifact).not.toBeNull()
    expect(artifact.artifactBlocker).toBe(
      'cell-1: field uses array(sliderSize), whose maximum size cannot be proven. Replace it with a literal, constant expression, or array(pixelCount).',
    )
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
    const adapted = updateShowCellAdaptations(base, rightCell.id, { timeOffsetMs: 500 })
    const show = updateShowRoutingLayout(adapted, adapted.routingLayouts[0].id, {
      zones: [
        { zoneId: 'zone-1', ranges: [{ start: 0, end: 1 }, { start: 4, end: 5 }] },
        { zoneId: 'zone-2', ranges: [{ start: 2, end: 3 }, { start: 6, end: 7 }] },
      ],
    })
    const compiled = compileShowForPreview(show, [], undefined, {})
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
      renderPolicy: 'snapshot-outgoing-transition-live-incoming',
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
      revealMode: 'grow-incoming',
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

  it.each(['fast', 'fidelity'] as const)(
    'keeps a Clock Wipe near its beginning after an absolute seek in %s preview (#592)',
    (fidelity) => {
      let show = createDefaultShow('show-clock-wipe-timing', 'Clock Wipe timing', 1)
      show = {
        ...show,
        stageMapId: 'plane',
        scenes: show.scenes.map((scene) => ({ ...scene, durationMs: 8_000 })),
      }
      show = updateShowCellPattern(show, 'cell-1', {
        pattern: { kind: 'user', id: 'solid-red' },
        patternName: 'Solid red',
      })
      show = updateShowCellPattern(show, 'cell-2', {
        pattern: { kind: 'user', id: 'solid-green' },
        patternName: 'Solid green',
      })
      show = updateShowTransition(show, 'scene-1', 'wipe', 2_000, 0)
      show = updateShowBoundaryTransition(show, show.transitions![0].id, {
        wipeVariant: 'clock',
        centerX: 0.5,
        centerY: 0.5,
        phase: 0,
        clockwise: true,
        edgePolicy: 'hard',
        easing: { curve: 'sine', direction: 'in-out' },
      })
      const patterns = [
        { id: 'solid-red', name: 'Solid red', src: 'export function render2D(index, x, y) { rgb(1, 0, 0) }', controls: {}, updatedAt: 1 },
        { id: 'solid-green', name: 'Solid green', src: 'export function render2D(index, x, y) { rgb(0, 1, 0) }', controls: {}, updatedAt: 1 },
      ]
      const compiled = compileShowForPreview(show, patterns, undefined, {}, { stageDimension: 2 })
      expect(compiled.error).toBeNull()
      const artifact = compiled.artifact!
      const mapPoints = Array.from({ length: 64 * 64 }, (_, index) => ({
        sample: [(index % 64) / 63, Math.floor(index / 64) / 63],
      }))
      const runtime = createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: nativeDimension(artifact.metadata.renderFns),
      }, { mapPoints, randomSeed: 1, fidelity })

      const frame = runtime.advanceTo(8_100, { stepMs: 1000 / 60 })
      const incomingFraction = frame.pixels.filter((pixel) => pixel[1] > pixel[0]).length / mapPoints.length
      const mix = Number(frame.exports.__pxlblz_show_mix) / (fidelity === 'fidelity' ? 65_536 : 1)

      expect(mix).toBeCloseTo(0.0062, 3)
      expect(incomingFraction).toBeGreaterThan(0.002)
      expect(incomingFraction).toBeLessThan(0.015)
    },
  )

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
