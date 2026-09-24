import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import type { ShowRecord } from './personalContentRecords'
import { formatShowBoundaryIdentity, showBoundaryClipIdentity } from './showClipIdentity'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { createDefaultShow } from './showModel'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertTransitionClipRampProbe, transitionClipRampProbeV1 } from '../test/showV2TransitionClipRampFixture'
import { planShowV2BoundaryTransitionChanges } from './showV2TransitionEditorModel'
import {
  projectShowEditorBoundaryTransitionsV2,
  projectShowEditorInspectorPresentationV2,
  projectShowEditorRoutingTransfersV2,
  projectShowEditorTimelineClipSummarySourcesV2,
  projectShowEditorZoneMapV2,
} from './showEditorInspectorPresentation'
import { projectResolvedShowClipSummary } from './showClipSummary'

function record(): ShowRecordV2 {
  return {
    version: 2,
    id: 'show',
    name: 'Authored Show',
    zones: [
      { id: 'zone-main', name: 'Main', nominalPixelCount: 50, color: '#38bdf8', icon: 'circle' },
      { id: 'zone-side', name: 'Side', nominalPixelCount: 30, color: '#f97316' },
    ],
    zoneLayouts: [{
      id: 'layout',
      name: 'Physical',
      zones: [
        { zoneId: 'zone-main', ranges: [{ start: 0, end: 59 }] },
        { zoneId: 'zone-side', ranges: [{ start: 60, end: 99 }] },
      ],
    }],
    targetControllerProfileId: 'controller',
    stageMapId: 'stage-map',
    outputContract: { version: 1, kind: 'installation', pixelCount: 100, outputMapId: 'output-map', resolution: 'fixed' },
    outputEffects: [{ id: 'trails', kind: 'trails', retention: 0.75 }],
    composition: {
      version: 2,
      executionModel: 'continuous',
      showEndMs: 10_000,
      sampleRemap: { repeatScale: 1.5 },
      patternInstances: [
        {
          id: 'instance-a', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'First',
          time: { timeScale: 1.25, timeOffsetMs: 125 }, controlTargets: { sliderSpeed: 0.4 },
        },
        {
          id: 'instance-b', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Second',
          time: { timeScale: 1, timeOffsetMs: 0 },
        },
        {
          id: 'bound-runtime', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Bound Group Runtime',
          time: { timeScale: 0.5, timeOffsetMs: 250 }, controlTargets: { sliderDensity: 0.8 },
        },
      ],
      layers: [
        { id: 'layer-main', zoneId: 'zone-main', name: 'Main', rank: 0 },
        { id: 'layer-overlay', zoneId: 'zone-main', name: 'Overlay', rank: 1 },
      ],
      clips: [
        {
          id: 'clip-a', instanceId: 'instance-a', zoneId: 'zone-main', layerId: 'layer-main',
          startMs: 0, durationMs: 3_000, entryPolicy: 'restart', zoneSampleMode: 'independent',
          appearance: { keys: [
            { id: 'clip-a-look-1', timeMs: 0, value: { opacity: 1, view: { brightness: 0.9, phase: 0, mirror: false } } },
            {
              id: 'clip-a-look-2', timeMs: 2_000,
              value: {
                opacity: 0.25,
                view: { brightness: 0.6, phase: 0.2, mirror: true },
                transform: { positionX: 0.1, positionY: 0.2, rotation: 0.25, scaleX: 1.2, scaleY: 0.8 },
                effects: [{ id: 'opacity-effect', kind: 'opacity', opacity: 0.5 }],
              },
            },
          ] },
        },
        {
          id: 'clip-b', instanceId: 'instance-b', zoneId: 'zone-main', layerId: 'layer-main',
          startMs: 4_000, durationMs: 3_000, entryPolicy: 'continue', zoneSampleMode: 'independent',
          appearance: { keys: [
            { id: 'clip-b-look', timeMs: 4_000, value: { opacity: 1, view: { brightness: 1, phase: 0, mirror: false } } },
          ] },
        },
      ],
      transitions: [{
        id: 'transition', kind: 'crossfade', durationMs: 1_000, easing: { curve: 'linear' },
        crossfadePolicy: 'snapshot-live', propertyRamps: [],
        participants: [{
          id: 'participant', zoneId: 'zone-main', layerId: 'layer-main', fromClipId: 'clip-a', toClipId: 'clip-b',
        }],
      }],
      layoutOccurrences: [{ id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 10_000, parameters: {} }],
      propertyTracks: [
        {
          id: 'ordinary-opacity', target: { kind: 'clip-opacity', clipId: 'clip-a' },
          activeStartMs: 2_000, activeDurationMs: 1_000,
          keyframes: [
            { id: 'ordinary-opacity-a', timeMs: 2_000, value: 0.25, easing: { curve: 'linear' } },
            { id: 'ordinary-opacity-b', timeMs: 3_000, value: 0.5, easing: { curve: 'linear' } },
          ],
        },
        {
          id: 'ordinary-control', target: { kind: 'instance-control', instanceId: 'instance-a', exportName: 'sliderSpeed' },
          activeStartMs: 2_000, activeDurationMs: 1_000,
          keyframes: [
            { id: 'ordinary-control-a', timeMs: 2_000, value: 0.4, easing: { curve: 'linear' } },
            { id: 'ordinary-control-b', timeMs: 3_000, value: 0.8, easing: { curve: 'linear' } },
          ],
        },
      ],
      markers: [],
      groupDefinitions: [{
        id: 'group-definition',
        name: 'Linked Group',
        patternInstances: [{
          id: 'group-slot', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'Definition Runtime',
          time: { timeScale: 1, timeOffsetMs: 0 },
        }],
        layers: [{ id: 'group-layer', name: 'Group Layer', rank: 0 }],
        clips: [{
          id: 'group-clip', instanceId: 'group-slot', layerId: 'group-layer', startMs: 0, durationMs: 1_500,
          entryPolicy: 'continue', zoneSampleMode: 'independent',
          appearance: { keys: [
            { id: 'group-look-1', timeMs: 0, value: { opacity: 0.8, view: { brightness: 0.7, phase: 0, mirror: false } } },
            { id: 'group-look-2', timeMs: 700, value: { opacity: 0.3, view: { brightness: 0.2, phase: 0.5, mirror: true } } },
          ] },
        }],
        transitions: [],
        propertyTracks: [{
          id: 'group-opacity', target: { kind: 'clip-opacity', clipId: 'group-clip' },
          activeStartMs: 0, activeDurationMs: 1_500,
          keyframes: [
            { id: 'group-opacity-a', timeMs: 0, value: 0.8, easing: { curve: 'linear' } },
            { id: 'group-opacity-b', timeMs: 1_500, value: 0.3, easing: { curve: 'linear' } },
          ],
        }],
      }],
      groupOccurrences: [
        {
          id: 'group-use-a', definitionId: 'group-definition', layoutOccurrenceId: 'layout-use', zoneId: 'zone-main',
          startMs: 3_000, translationX: 0.1, translationY: 0.2,
          layerBindings: [{ definitionLayerId: 'group-layer', layerId: 'layer-overlay' }],
          instanceBindings: { 'group-slot': 'bound-runtime' },
          holds: [{ id: 'hold', localTimeMs: 500, durationMs: 1_000 }],
        },
        {
          id: 'group-use-b', definitionId: 'group-definition', layoutOccurrenceId: 'layout-use', zoneId: 'zone-main',
          startMs: 7_500, translationX: -0.1, translationY: 0,
          layerBindings: [{ definitionLayerId: 'group-layer', layerId: 'layer-overlay' }],
          holds: [],
        },
      ],
    },
    updatedAt: 1,
  }
}

describe('projectShowEditorInspectorPresentationV2', () => {
  it('projects authored Show, Zone, Transition and Layout reads without changing their identities', () => {
    const source = record()
    const before = structuredClone(source)

    const view = projectShowEditorInspectorPresentationV2(source, 2_500)

    expect(source).toEqual(before)
    expect(view).toMatchObject({ recordVersion: 2, atMs: 2_500 })
    expect(view.show).toMatchObject({
      id: 'show', name: 'Authored Show', showEndMs: 10_000, executionModel: 'continuous', repeatScale: 1.5,
      targetControllerProfileId: 'controller', stageMapId: 'stage-map', zoneCount: 2, nominalPixelCount: 80,
    })
    expect(view.zonesById['zone-main']).toMatchObject({
      zone: { id: 'zone-main', name: 'Main', color: '#38bdf8', icon: 'circle', nominalPixelCount: 50 },
      pixelCount: { source: 'physical', value: 60 },
    })
    expect(view.transitionsById.transition).toMatchObject({
      id: 'transition', startMs: 3_000, endMs: 4_000,
      fromClipIds: ['clip-a'], toClipIds: ['clip-b'],
      transition: { id: 'transition', participants: [{ id: 'participant' }] },
    })
    expect(view.zoneLayoutsById.layout).toMatchObject({ id: 'layout', occurrenceIds: ['layout-use'], useCount: 1 })
    expect(view.layoutOccurrencesById['layout-use']).toMatchObject({
      id: 'layout-use', definitionId: 'layout', active: true,
      occurrence: { id: 'layout-use' }, definition: { id: 'layout' },
    })

    view.show.outputContract.kind = 'portable-2d' as never
    view.zonesById['zone-main'].zone.name = 'Changed outside'
    view.transitionsById.transition.transition.durationMs = 10
    expect(source.outputContract.kind).toBe('installation')
    expect(source.zones[0].name).toBe('Main')
    expect(source.composition.transitions[0].durationMs).toBe(1_000)
  })

  it('reads the ordinary Clip appearance held at the requested time and supplies exact animation inputs', () => {
    const source = record()

    const view = projectShowEditorInspectorPresentationV2(source, 2_500)
    const clip = view.clipsById['clip-a']

    expect(clip.owner).toEqual({ kind: 'clip', clipId: 'clip-a' })
    expect(clip.value).toMatchObject({
      owner: { kind: 'clip', clipId: 'clip-a' },
      scope: 'scene-main',
      placementId: 'clip-a',
      instanceId: 'instance-a',
      effectiveInstanceId: 'instance-a',
      layerId: 'layer-main',
      heldAppearanceKeyId: 'clip-a-look-2',
      heldAppearanceTimeMs: 2_000,
      local: { startMs: 0, durationMs: 3_000, opacity: 0.25 },
      view: { brightness: 0.6, phase: 0.2, mirror: true },
      simulation: { timeScale: 1.25, timeOffsetMs: 125, controlTargets: { sliderSpeed: 0.4 } },
      entryPolicy: 'restart',
      zoneSampleMode: 'independent',
    })
    expect(clip.value.effects).toEqual([{ id: 'opacity-effect', kind: 'opacity', opacity: 0.5 }])
    expect(clip.animation).toMatchObject({
      owner: { kind: 'clip', clipId: 'clip-a' },
      showTimeOffsetMs: 2_000,
      storageDurationMs: 1_000,
      instanceUseCount: 1,
    })
    expect(clip.animation.tracks.map((entry) => ({
      id: entry.authored.id,
      authoredTimes: entry.authored.keyframes.map((key) => key.timeMs),
      editorTimes: entry.editor.keyframes.map((key) => key.timeMs),
      target: entry.editor.target,
    }))).toEqual([
      {
        id: 'ordinary-opacity', authoredTimes: [2_000, 3_000], editorTimes: [0, 1_000],
        target: { kind: 'placement-opacity', placementId: 'clip-a' },
      },
      {
        id: 'ordinary-control', authoredTimes: [2_000, 3_000], editorTimes: [0, 1_000],
        target: { kind: 'instance-control', instanceId: 'instance-a', exportName: 'sliderSpeed' },
      },
    ])
    expect(source.composition.clips[0].appearance.keys[1].value.opacity).toBe(0.25)
  })

  it('maps held Group time and keeps repeated occurrence ownership and runtimes distinct', () => {
    const source = record()

    const duringHold = projectShowEditorInspectorPresentationV2(source, 4_200)
    const afterHold = projectShowEditorInspectorPresentationV2(source, 4_700)
    const repeated = projectShowEditorInspectorPresentationV2(source, 8_200)
    const first = duringHold.groupsByOccurrenceId['group-use-a']
    const firstClip = first.clipsById['group-clip']
    const afterHoldClip = afterHold.groupsByOccurrenceId['group-use-a'].clipsById['group-clip']
    const secondClip = repeated.groupsByOccurrenceId['group-use-b'].clipsById['group-clip']

    expect(first).toMatchObject({
      id: 'group-use-a', definitionId: 'group-definition', name: 'Linked Group', linkedOccurrenceCount: 2,
      startMs: 3_000, durationMs: 2_500, endMs: 5_500, baseLayer: 1,
      clipCount: 1, layerCount: 1,
    })
    expect(firstClip.owner).toEqual({
      kind: 'group-clip', occurrenceId: 'group-use-a', definitionId: 'group-definition', clipId: 'group-clip',
    })
    expect(firstClip.value).toMatchObject({
      instanceId: 'group-slot', effectiveInstanceId: 'bound-runtime', patternName: 'Bound Group Runtime',
      heldAppearanceKeyId: 'group-look-1', requestedLocalTimeMs: 500,
      local: { startMs: 3_000, durationMs: 2_500, opacity: 0.8 },
      scope: 'scene-overlay', layerId: 'layer-overlay',
    })
    expect(afterHoldClip.value).toMatchObject({
      heldAppearanceKeyId: 'group-look-2', requestedLocalTimeMs: 700,
      local: { startMs: 3_000, durationMs: 2_500, opacity: 0.3 },
    })
    expect(secondClip.value).toMatchObject({
      instanceId: 'group-slot', effectiveInstanceId: 'group:["group-definition","group-slot"]',
      patternName: 'Definition Runtime', heldAppearanceKeyId: 'group-look-2', requestedLocalTimeMs: 700,
    })
    expect(firstClip.animation).toMatchObject({
      owner: { kind: 'group-clip', occurrenceId: 'group-use-a', definitionId: 'group-definition', clipId: 'group-clip' },
      showTimeOffsetMs: 3_000, storageDurationMs: 2_500, instanceUseCount: 2,
    })
    // The slot is authored once on the definition and every occurrence
    // instantiates it, so an edit reaches one Clip per occurrence - the count
    // the v1 editor reports. `group-use-a` binds its own runtime and
    // `group-use-b` takes the default, so a count read from the materialized
    // runtime would report 1 for each and hide the linkage entirely.
    expect(secondClip.animation.instanceUseCount).toBe(2)
    expect(firstClip.animation.tracks).toHaveLength(1)
    expect(firstClip.animation.tracks[0]).toMatchObject({
      authored: { id: 'group-opacity', keyframes: [{ id: 'group-opacity-a', timeMs: 0 }, { id: 'group-opacity-b', timeMs: 1_500 }] },
      editor: { id: 'group-opacity', keyframes: [{ id: 'group-opacity-a', timeMs: 0 }, { id: 'group-opacity-b', timeMs: 2_500 }] },
    })
    expect(Object.keys(first.clipsById)).toEqual(['group-clip'])
    expect(source.composition.groupDefinitions[0].propertyTracks[0].keyframes[1].timeMs).toBe(1_500)
  })

  it('keeps a Group Speed and control track on the definition-local slot id (#1075 G3 corrective)', () => {
    const source = record()
    source.composition.groupDefinitions[0]!.propertyTracks = [
      ...source.composition.groupDefinitions[0]!.propertyTracks,
      {
        id: 'group-speed',
        target: { kind: 'instance-time-scale', instanceId: 'group-slot' },
        activeStartMs: 0,
        activeDurationMs: 1_500,
        keyframes: [
          { id: 'group-speed-a', timeMs: 0, value: 1, easing: { curve: 'linear' } },
          { id: 'group-speed-b', timeMs: 1_500, value: 2, easing: { curve: 'linear' } },
        ],
      },
      {
        id: 'group-control',
        target: { kind: 'instance-control', instanceId: 'group-slot', exportName: 'sliderSpeed' },
        activeStartMs: 0,
        activeDurationMs: 1_500,
        keyframes: [
          { id: 'group-control-a', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
          { id: 'group-control-b', timeMs: 1_500, value: 0.8, easing: { curve: 'linear' } },
        ],
      },
    ]

    const view = projectShowEditorInspectorPresentationV2(source, 4_200)
    const tracks = view.groupsByOccurrenceId['group-use-a']!.clipsById['group-clip']!.animation.tracks
    const speed = tracks.find(entry => entry.authored.id === 'group-speed')!
    const control = tracks.find(entry => entry.authored.id === 'group-control')!
    expect(speed.editor.target).toEqual({ kind: 'instance-time-scale', instanceId: 'group-slot' })
    expect(control.editor.target).toEqual({ kind: 'instance-control', instanceId: 'group-slot', exportName: 'sliderSpeed' })
  })
})

describe('projectShowEditorRoutingTransfersV2', () => {
  it('presents the destination Layout, transfer timing and direction the record authored', () => {
    const source = record()
    source.zoneLayouts = [
      ...source.zoneLayouts,
      { id: 'layout-split', name: 'Split', zones: [], logical: { kind: 'split', axis: 'x', zoneIds: ['zone-main', 'zone-side'] } },
    ]
    source.composition.layoutOccurrences = [
      { id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 3_000, parameters: {} },
      {
        id: 'layout-use-b',
        layoutId: 'layout-split',
        startMs: 3_000,
        durationMs: 4_000,
        parameters: {},
        incomingTransfer: {
          id: 'routing-switch',
          fromOccurrenceId: 'layout-use',
          durationMs: 1_500,
          direction: 'forward',
          easing: { curve: 'sine', direction: 'in-out' },
        },
      },
    ]
    const before = structuredClone(source)

    const transfers = projectShowEditorRoutingTransfersV2(source)

    expect(source).toEqual(before)
    // Only a Layout occurrence that actually performs a switch appears.
    expect(Object.keys(transfers)).toEqual(['routing-switch'])
    expect(transfers['routing-switch']).toMatchObject({
      occurrenceId: 'layout-use-b',
      layoutId: 'layout-split',
      durationMs: 1_500,
      direction: 'forward',
      easing: { curve: 'sine', direction: 'in-out' },
      // v1 bounds the duration field by the destination's own length.
      maxDurationMs: 4_000,
    })
    expect(transfers['routing-switch']!.layoutOptions.map(option => option.id))
      .toEqual(['layout', 'layout-split'])
  })

  it('names the switch by destination time and the Clips that start there, as v1 does', () => {
    const source = record()
    // Two Clips now begin at 3.0 s: an ordinary Clip on the base Layer and the
    // Group occurrence's child on the overlay. v1 reads the unified timeline,
    // so a materialized Group child counts, and the base Layer is read first.
    source.composition.clips[1]!.startMs = 3_000
    source.composition.clips[1]!.appearance.keys[0]!.timeMs = 3_000
    source.composition.layoutOccurrences = [
      { id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 3_000, parameters: {} },
      {
        id: 'layout-use-b',
        layoutId: 'layout',
        startMs: 3_000,
        durationMs: 4_000,
        parameters: {},
        incomingTransfer: { id: 'routing-switch', fromOccurrenceId: 'layout-use', durationMs: 1_500, direction: 'forward' },
      },
    ]

    const identity = projectShowEditorRoutingTransfersV2(source)['routing-switch']?.boundaryIdentity

    expect(identity).toBe('3.0: Second + 1')
  })

  it('falls back to the destination time alone when no Clip starts there', () => {
    const source = record()
    source.composition.layoutOccurrences = [
      { id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 3_000, parameters: {} },
      {
        id: 'layout-use-b',
        layoutId: 'layout',
        startMs: 2_500,
        durationMs: 4_000,
        parameters: {},
        incomingTransfer: { id: 'routing-switch', fromOccurrenceId: 'layout-use', durationMs: 0, direction: 'forward' },
      },
    ]

    expect(projectShowEditorRoutingTransfersV2(source)['routing-switch']?.boundaryIdentity).toBe('2.5')
  })
})

describe('routing transfer parity on the committed corpus', () => {
  const manifest = JSON.parse(readFileSync(
    new URL('../../e2e/fixtures/showEditorEquivalence.json', import.meta.url),
    'utf8',
  )) as { version: 1; corpus: Array<{ key: string; source: ShowRecord; converted: ShowRecordV2 }> }

  it('presents the Installation switch exactly as the v1 routing Transition does', () => {
    const installation = manifest.corpus.find(entry => entry.key === 'installation-layouts')
    expect(installation, 'installation-layouts corpus case').toBeDefined()
    const { source, converted } = installation!
    const routing = source.transitions?.find(candidate => candidate.kind === 'routing' && candidate.durationMs > 0)
    expect(routing, 'v1 routing Transition with a transfer').toBeDefined()

    const transfer = projectShowEditorRoutingTransfersV2(converted)[routing!.id]

    expect(transfer, `v2 transfer for ${routing!.id}`).toBeDefined()
    expect(transfer!.boundaryIdentity).toBe(showBoundaryClipIdentity(source, routing!.afterSceneId))
    expect(transfer!.layoutId).toBe(routing!.layoutId)
    expect(transfer!.durationMs).toBe(routing!.durationMs)
    expect(transfer!.easing).toEqual(routing!.easing)
    expect(transfer!.direction).toBe(routing!.routingDirection ?? 'forward')
    expect(transfer!.layoutOptions.map(option => option.name))
      .toEqual(source.routingLayouts.map(layout => layout.name))
  })
})

describe('projectShowEditorZoneMapV2', () => {
  it('lists the authored Zones with the physical counts an Installation resolves', () => {
    const source = record()
    const before = structuredClone(source)

    const zoneMap = projectShowEditorZoneMapV2(source)

    expect(source).toEqual(before)
    expect(zoneMap.installation).toBe(true)
    // zone-main authors ranges 0-59, so the map shows 60 rather than its
    // nominal 50; a nominal reading would hide a real wiring mismatch.
    expect(zoneMap.entries.map(entry => [entry.zone.id, entry.zone.name, entry.zone.color, entry.pixelCount]))
      .toEqual([
        ['zone-main', 'Main', '#38bdf8', 60],
        ['zone-side', 'Side', '#f97316', 40],
      ])
    expect(zoneMap.entries[0]!.zone.nominalPixelCount).toBe(50)
  })

  it('hides the physical count line for a portable Show, as the v1 map does', () => {
    const source = record()
    source.outputContract = {
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 100,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    }

    expect(projectShowEditorZoneMapV2(source).installation).toBe(false)
  })
})

describe('projectShowEditorTimelineClipSummarySourcesV2', () => {
  it('draws a Group child where its occurrence actually places it', () => {
    const source = record()
    const sources = projectShowEditorTimelineClipSummarySourcesV2(source)

    const definitionLocal = source.composition.groupDefinitions[0]!.clips[0]!
      .appearance.keys[0]!.value.transform
    expect(definitionLocal, 'definition-local transform').toBeUndefined()

    // Both occurrences instantiate the same definition-local Clip, so a caption
    // reading only the definition would repeat one position for both. The
    // occurrence translation is what tells them apart, exactly as v1's
    // materialization does.
    const first = sources['group-use-a:group-clip']
    const second = sources['group-use-b:group-clip']
    expect(first?.facts.transform).toMatchObject({ positionX: 0.1, positionY: 0.2 })
    expect(second?.facts.transform).toMatchObject({ positionX: -0.1, positionY: 0 })

    // The inspector keeps the authored definition-local value untouched.
    expect(projectShowEditorInspectorPresentationV2(source, 3_000)
      .groupsByOccurrenceId['group-use-a']?.clipsById['group-clip']?.value.transform)
      .toMatchObject({ positionX: 0, positionY: 0 })
  })

  it('shifts an animated position by the same occurrence translation', () => {
    const source = record()
    source.composition.groupDefinitions[0]!.propertyTracks = [{
      id: 'group-position',
      target: { kind: 'clip-transform', clipId: 'group-clip', property: 'positionX' },
      activeStartMs: 0,
      activeDurationMs: 1_500,
      keyframes: [
        { id: 'group-position-a', timeMs: 0, value: 0, easing: { curve: 'linear' } },
        { id: 'group-position-b', timeMs: 1_500, value: 0.5, easing: { curve: 'linear' } },
      ],
    }]

    const sources = projectShowEditorTimelineClipSummarySourcesV2(source)

    expect(sources['group-use-a:group-clip']?.animation.tracks[0]?.keyframes.map(key => key.value))
      .toEqual([0.1, 0.6])
    expect(sources['group-use-b:group-clip']?.animation.tracks[0]?.keyframes.map(key => key.value))
      .toEqual([-0.1, 0.4])
  })

  it('keeps a Group Speed track in the animated-range caption overlay (#1075 G3 corrective)', () => {
    const source = record()
    source.composition.groupDefinitions[0]!.propertyTracks = [{
      id: 'group-speed',
      target: { kind: 'instance-time-scale', instanceId: 'group-slot' },
      activeStartMs: 0,
      activeDurationMs: 1_500,
      keyframes: [
        { id: 'group-speed-a', timeMs: 0, value: 0.5, easing: { curve: 'linear' } },
        { id: 'group-speed-b', timeMs: 1_500, value: 1, easing: { curve: 'linear' } },
      ],
    }]

    const sources = projectShowEditorTimelineClipSummarySourcesV2(source)
    const summary = projectResolvedShowClipSummary(
      sources['group-use-a:group-clip']!.facts,
      {},
      sources['group-use-a:group-clip']!.animation,
    )
    expect(sources['group-use-a:group-clip']!.animation.instanceId).toBe('group-slot')
    expect(JSON.stringify(summary)).toContain('Animation speed')
  })
})

describe('Transition Clip-value ramp summary tracks (#1111-D)', () => {
  function convertDefault(show: ShowRecord): ShowRecordV2 {
    const result = convertShowRecordV1ToV2(show, {
      byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]!])),
    })
    if (result.status !== 'converted') throw new Error(JSON.stringify(result.issues))
    expect(validateShowRecordV2(result.record)).toEqual([])
    return result.record
  }

  function rampedShow(): ShowRecord {
    const show = createDefaultShow('show-ramp-summary', 'Ramp summary', 1000)
    show.transitions = [{
      ...show.transitions![0]!,
      propertyTransitions: {
        timeScale: {
          fromByCellId: { [show.cells[1]!.id]: 0.5 },
          durationMs: 1_000,
          easing: { curve: 'linear' },
        },
      },
    }]
    return show
  }

  it('carries a boundary speed ramp as a summary track on the incoming Clip only', () => {
    const source = convertDefault(rampedShow())
    const transition = source.composition.transitions[0]!
    const incomingClipId = transition.participants[0]!.toClipId
    const incoming = source.composition.clips.find(clip => clip.id === incomingClipId)!
    const presentation = projectShowEditorInspectorPresentationV2(source, incoming.startMs)

    const animation = presentation.clipsById[incomingClipId]!.animation
    expect(animation.tracks).toEqual([])
    expect(animation.rampSummaryTracks).toHaveLength(1)
    expect(animation.rampSummaryTracks[0]).toMatchObject({
      id: `transition-ramp:${transition.id}:0`,
      target: { kind: 'instance-time-scale', instanceId: incoming.instanceId },
    })
    expect(animation.rampSummaryTracks[0]!.keyframes.map(key => key.value)).toEqual([0.5, 1])

    for (const clip of source.composition.clips.filter(candidate => candidate.id !== incomingClipId)) {
      expect(projectShowEditorInspectorPresentationV2(source, clip.startMs)
        .clipsById[clip.id]!.animation.rampSummaryTracks).toEqual([])
    }

    const sources = projectShowEditorTimelineClipSummarySourcesV2(source)
    const summary = projectResolvedShowClipSummary(sources[incomingClipId]!.facts, {}, sources[incomingClipId]!.animation)
    expect(summary.flatMap(section => section.items).find(item => item.label === 'Animation speed'))
      .toMatchObject({ animated: true })
  })

  it('admits the ramp by incoming endpoint when the Clip follows the Transition after a gap', () => {
    const source = convertDefault(rampedShow())
    const incomingClipId = source.composition.transitions[0]!.participants[0]!.toClipId
    const incoming = source.composition.clips.find(clip => clip.id === incomingClipId)!
    incoming.startMs += 5_000

    const presentation = projectShowEditorInspectorPresentationV2(source, incoming.startMs)
    expect(presentation.clipsById[incomingClipId]!.animation.rampSummaryTracks).toHaveLength(1)
  })

  it('gives no summary track to a Clip that is only the Transition\'s outgoing endpoint', () => {
    const source = convertDefault(rampedShow())
    const transition = source.composition.transitions[0]!
    const outgoing = source.composition.clips.find(clip => clip.id === transition.participants[0]!.fromClipId)!
    const ramp = transition.propertyRamps[0]!
    if (ramp.target.kind !== 'instance-time-scale') throw new Error('expected a speed ramp')
    ramp.target.instanceId = outgoing.instanceId

    for (const clip of source.composition.clips) {
      expect(projectShowEditorInspectorPresentationV2(source, clip.startMs)
        .clipsById[clip.id]!.animation.rampSummaryTracks).toEqual([])
    }
  })

  it('has no summary tracks for a record without ramps', () => {
    const source = convertDefault(createDefaultShow('show-no-ramp', 'No ramp', 1000))
    for (const clip of source.composition.clips) {
      expect(projectShowEditorInspectorPresentationV2(source, clip.startMs)
        .clipsById[clip.id]!.animation.rampSummaryTracks).toEqual([])
    }
  })
})



/**
 * Boundary Transition reads (#1065).
 *
 * Every positive case below is a record the real converter produced from a
 * valid v1 Show - the committed corpus, or a minimal mutation of it the
 * converter admits - so the v2 fixtures cannot drift into a competing model of
 * the domain. Each one is asserted valid before it is read.
 */
describe('projectShowEditorBoundaryTransitionsV2', () => {
  const manifest = JSON.parse(readFileSync(
    new URL('../../e2e/fixtures/showEditorEquivalence.json', import.meta.url),
    'utf8',
  )) as { version: 1; corpus: Array<{ key: string; source: ShowRecord; converted: ShowRecordV2 }> }

  function corpusSource(key: string): ShowRecord {
    const entry = manifest.corpus.find(candidate => candidate.key === key)
    if (!entry) throw new Error(`No corpus case ${key}.`)
    return structuredClone(entry.source)
  }

  function convert(source: ShowRecord): ShowRecordV2 {
    // Flat conversion needs each Clip's exact Pattern source, the same way the
    // reviewed equivalence oracle supplies it.
    const result = convertShowRecordV1ToV2(source, {
      byCellId: Object.fromEntries(source.cells.map(cell => {
        if (cell.pattern.kind !== 'stock') throw new Error(`${source.id}: non-stock flat dependency`)
        const patternSource = DEMOS[resolveStockPatternId(cell.pattern.id)]
        if (!patternSource) throw new Error(`${source.id}: missing stock source ${cell.pattern.id}`)
        return [cell.id, patternSource]
      })),
    })
    if (result.status !== 'converted') throw new Error(`${source.id} refused: ${JSON.stringify(result.issues)}`)
    expect(validateShowRecordV2(result.record), `${source.id} converted`).toEqual([])
    return result.record
  }

  /**
   * The committed `fresh` boundary: one Layer's pair, converted at participant
   * scope because nothing at that boundary needs whole-output ownership.
   */
  function participantBoundary(): ShowRecordV2 {
    return convert(corpusSource('fresh'))
  }

  /**
   * A minimal mutation of the same Show: the outgoing Clip spans two Scenes
   * while the repeat scale changes inside that span. The converter gives this
   * boundary whole-output ownership, because a Show-wide scalar moves across
   * it - which is also the only shape that can tell an outgoing Clip's start
   * apart from the boundary it actually hands over at.
   */
  function spanningSource(): ShowRecord {
    const source = corpusSource('fresh')
    source.id = 'spanning-outgoing-source'
    source.scenes = [
      { id: 'scene-1', name: 'Scene 1', durationMs: 30_000, sampleTargets: { repeatScale: 1 } },
      { id: 'scene-2', name: 'Scene 2', durationMs: 30_000, sampleTargets: { repeatScale: 2 } },
      { id: 'scene-3', name: 'Scene 3', durationMs: 30_000, sampleTargets: { repeatScale: 3 } },
    ]
    source.cells = [
      { ...source.cells[0], sceneId: 'scene-1', sceneSpan: 2 },
      { ...source.cells[1], sceneId: 'scene-3', sceneSpan: 1 },
    ]
    source.transitions = [{
      id: 'transition-scene-2',
      afterSceneId: 'scene-2',
      kind: 'crossfade',
      durationMs: 2_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'snapshot-live',
    }]
    return source
  }

  function wholeOutputBoundary(): ShowRecordV2 {
    return convert(spanningSource())
  }

  /** The same converted record with only its provenance removed. */
  function withoutOrigin(record: ShowRecordV2): ShowRecordV2 {
    const next = structuredClone(record)
    for (const transition of next.composition.transitions) delete transition.origin
    expect(validateShowRecordV2(next), 'record without provenance').toEqual([])
    return next
  }

  it.each([
    {
      family: 'a converted boundary Transition at participant scope',
      build: participantBoundary,
      presented: ['transition-scene-1'],
    },
    {
      family: 'a converted boundary Transition that owns the whole output',
      build: wholeOutputBoundary,
      presented: ['transition-scene-2'],
    },
    {
      family: 'a native Transition that owns the whole output',
      build: () => withoutOrigin(wholeOutputBoundary()),
      presented: ['transition-scene-2'],
    },
    {
      family: 'a converted Layer Transition',
      build: () => convert(corpusSource('stock-lesson')),
      presented: [],
    },
    {
      family: 'a native Transition at participant scope',
      build: () => withoutOrigin(participantBoundary()),
      presented: [],
    },
  ])('presents $family on the boundary surface: $presented', ({ build, presented }) => {
    const boundaries = projectShowEditorBoundaryTransitionsV2(build())

    // Conversion provenance decides the family wherever v1 authored one. A
    // native record claims none, so only whole-output ownership can say the
    // boundary owns the junction; nothing is inferred from an id or a kind.
    expect(Object.keys(boundaries)).toEqual(presented)
  })

  it('reads the destination and outgoing sides the authored Transition names', () => {
    const source = corpusSource('fresh')
    const record = participantBoundary()
    const before = structuredClone(record)

    const boundary = projectShowEditorBoundaryTransitionsV2(record)['transition-scene-1']

    // Destination time and the Pattern starting there, exactly as the existing
    // boundary identity reads it from v1.
    expect(boundary.boundaryIdentity).toBe(showBoundaryClipIdentity(source, 'scene-1'))
    expect(boundary.destinations).toEqual([{
      zoneId: 'zone-1',
      zoneName: 'main',
      id: 'placement-cell-2-scene-2',
      controlSourceId: 'cell-2',
      patternKey: 'stock:CometLoom',
      adaptations: { timeScale: 1, brightness: 1 },
      transform: { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      controlTargets: {},
      outgoing: {
        id: 'placement-cell-1-scene-1',
        controlSourceId: 'cell-1',
        patternKey: 'stock:TestPattern1D',
        adaptations: { timeScale: 1, brightness: 1 },
        transform: { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        controlTargets: {},
      },
    }])
    expect(record).toEqual(before)
  })

  it('carries only Transition settings, without the v2 structure the panel never reads', () => {
    const source = corpusSource('fresh')
    const { afterSceneId: _afterSceneId, ...v1Settings } = source.transitions![0]

    const boundary = projectShowEditorBoundaryTransitionsV2(participantBoundary())['transition-scene-1']

    expect(boundary.settings).toEqual(v1Settings)
    expect(boundary.settings).not.toHaveProperty('afterSceneId')
    for (const field of ['participants', 'wholeOutput', 'propertyRamps', 'origin']) {
      expect(boundary.settings, field).not.toHaveProperty(field)
    }
  })

  /**
   * A minimal two-Zone mutation whose one Layout routes a moving Split, with a
   * different split position authored on each side of the boundary.
   */
  function splitSource(): ShowRecord {
    const source = corpusSource('fresh')
    source.id = 'split-position-source'
    source.zones = [
      { id: 'zone-1', name: 'Left', nominalPixelCount: 32, color: '#38bdf8' },
      { id: 'zone-2', name: 'Right', nominalPixelCount: 32, color: '#f97316' },
    ]
    source.scenes = [
      { id: 'scene-1', name: 'Scene 1', durationMs: 30_000, routingTargets: { splitPosition: 0.25 } },
      { id: 'scene-2', name: 'Scene 2', durationMs: 30_000, routingTargets: { splitPosition: 0.75 } },
    ]
    source.routingLayouts = [{
      id: 'layout-1',
      name: 'Moving Split',
      zones: [
        { zoneId: 'zone-1', ranges: [{ start: 0, end: 31 }] },
        { zoneId: 'zone-2', ranges: [{ start: 32, end: 63 }] },
      ],
      logical: { kind: 'split', zoneIds: ['zone-1', 'zone-2'], axis: 'x' },
    }]
    source.cells = [
      { ...source.cells[0], id: 'cell-left-1', zoneId: 'zone-1', sceneId: 'scene-1' },
      { ...source.cells[1], id: 'cell-right-1', zoneId: 'zone-2', sceneId: 'scene-1' },
      { ...source.cells[0], id: 'cell-left-2', zoneId: 'zone-1', sceneId: 'scene-2' },
      { ...source.cells[1], id: 'cell-right-2', zoneId: 'zone-2', sceneId: 'scene-2' },
    ]
    return source
  }

  it('shows the split position each side holds, where the v1 panel reads its Scenes', () => {
    const source = splitSource()
    const v1From = source.scenes[0].routingTargets?.splitPosition ?? 0.5
    const v1To = source.scenes[1].routingTargets?.splitPosition ?? 0.5

    const boundary = projectShowEditorBoundaryTransitionsV2(convert(source))['transition-scene-1']

    expect(boundary.split).toEqual({ from: v1From, to: v1To })
  })

  it('reads an authored scalar ramp through the same carrier the existing controls edit', () => {
    const source = spanningSource()
    const authored = { from: 1.5, durationMs: 500, easing: { curve: 'quadratic' as const, direction: 'in' as const } }
    source.transitions![0].propertyTransitions = { sample: { repeatScale: authored } }

    const boundary = projectShowEditorBoundaryTransitionsV2(convert(source))['transition-scene-2']

    // The same descriptor the v1 control edits, read back from the ramp the
    // converter wrote for it.
    expect(boundary.settings.propertyTransitions).toEqual({ sample: { repeatScale: authored } })
  })

  it('projects incoming speed and brightness ramps under the destination Clip id', () => {
    const boundary = projectShowEditorBoundaryTransitionsV2(convertTransitionClipRampProbe()).xfade
    expect(boundary.clipValueRampsUnavailable).toBe(false)
    const destinationId = boundary.destinations[0].id
    expect(boundary.settings.propertyTransitions).toEqual({
      timeScale: { fromByCellId: { [destinationId]: 1 }, durationMs: 400, easing: { curve: 'sine', direction: 'in-out' } },
      brightness: { fromByCellId: { [destinationId]: 0.2 } },
    })
  })

  it('keeps a speed ramp without participantId when enabling brightness', () => {
    const record = convertTransitionClipRampProbe()
    const speed = record.composition.transitions[0].propertyRamps.find(ramp => ramp.target.kind === 'instance-time-scale')!
    record.composition.transitions[0].propertyRamps = [speed]
    delete speed.participantId
    expect(validateShowRecordV2(record)).toEqual([])
    const boundary = projectShowEditorBoundaryTransitionsV2(record).xfade
    const destinationId = boundary.destinations[0].id
    expect(boundary.settings.propertyTransitions?.timeScale?.fromByCellId).toEqual({ [destinationId]: speed.from })
    const plan = planShowV2BoundaryTransitionChanges(record, 'xfade', {
      propertyTransitions: {
        ...boundary.settings.propertyTransitions,
        brightness: { fromByCellId: { [destinationId]: 0.4 } },
      },
    })
    expect(plan.status).toBe('ready')
    if (plan.status === 'ready') {
      expect(plan.intent.transition.propertyRamps.some(ramp => ramp.target.kind === 'instance-time-scale' && ramp.from === speed.from)).toBe(true)
    }
  })

  it('marks a non-base Layer route unavailable for Clip value ramps', () => {
    const record = convertTransitionClipRampProbe()
    record.composition.layers.push({ id: 'overlay', zoneId: record.zones[0].id, name: 'Overlay', rank: 1 })
    expect(projectShowEditorBoundaryTransitionsV2(record).xfade.clipValueRampsUnavailable).toBe(true)
  })

  it('marks whole-output and multi-participant Transitions unavailable for Clip value ramps', () => {
    expect(projectShowEditorBoundaryTransitionsV2(wholeOutputBoundary())['transition-scene-2'].clipValueRampsUnavailable).toBe(true)
    const record = convertTransitionClipRampProbe()
    record.composition.transitions[0].participants.push({ ...record.composition.transitions[0].participants[0], id: 'second-participant' })
    expect(projectShowEditorBoundaryTransitionsV2(record).xfade.clipValueRampsUnavailable).toBe(true)
  })

  it('matches the v1 boundary descriptors after conversion maps the Cell to its destination Clip', () => {
    const source = transitionClipRampProbeV1()
    const boundary = projectShowEditorBoundaryTransitionsV2(convertTransitionClipRampProbe(source)).xfade
    const destinationId = boundary.destinations[0].id
    const v1 = source.transitions![0].propertyTransitions!
    expect(boundary.settings.propertyTransitions?.timeScale).toEqual({
      ...v1.timeScale,
      fromByCellId: { [destinationId]: v1.timeScale!.fromByCellId['cell-2'] },
    })
    expect(boundary.settings.propertyTransitions?.brightness).toEqual({
      ...v1.brightness,
      fromByCellId: { [destinationId]: v1.brightness!.fromByCellId['cell-2'] },
    })
  })

  it('reads the outgoing scalar where the handover happens, not where the outgoing Clip began', () => {
    // The converter breaks a spanning v1 Clip at every Scene start, so a
    // converted outgoing Clip never spans a repeat-scale change. A native
    // record can: this one holds one Clip across the change the v1 Show made
    // mid-span, which is the only shape that tells the two readings apart.
    const record = wholeOutputBoundary()
    const outgoing = record.composition.clips.find(clip => clip.id === 'placement-cell-1-scene-1')!
    const superseded = record.composition.clips.find(clip => clip.id === 'placement-cell-1-scene-2')!
    outgoing.durationMs = superseded.startMs + superseded.durationMs - outgoing.startMs
    record.composition.clips = record.composition.clips.filter(clip => clip !== superseded)
    record.composition.transitions[0].wholeOutput!.fromClipIds = [outgoing.id]
    expect(validateShowRecordV2(record), 'native spanning record').toEqual([])
    // The Clip now begins where the repeat scale is still 1 and hands over
    // where it is 2.
    expect(outgoing.startMs).toBe(0)
    expect(record.composition.transitions[0].wholeOutput!.startMs)
      .toBe(outgoing.startMs + outgoing.durationMs)

    const boundary = projectShowEditorBoundaryTransitionsV2(record)['transition-scene-2']

    expect(boundary.repeat).toEqual({ from: 2, to: 3 })
  })

  it('shows the repeat scale of the Scene the boundary follows, not the outgoing Clip\'s first Scene', () => {
    const source = spanningSource()
    // The v1 inspector's own reads: the Scene the Transition follows, and the
    // one after it. The outgoing Clip begins a Scene earlier, at a different
    // repeat scale, which is what makes this case discriminating.
    const sceneIndex = source.scenes.findIndex(scene => scene.id === source.transitions![0].afterSceneId)
    const v1From = source.scenes[sceneIndex].sampleTargets?.repeatScale ?? 1
    const v1To = source.scenes[sceneIndex + 1].sampleTargets?.repeatScale ?? 1
    expect([v1From, v1To]).toEqual([2, 3])

    const boundary = projectShowEditorBoundaryTransitionsV2(wholeOutputBoundary())['transition-scene-2']

    expect(boundary.repeat).toEqual({ from: v1From, to: v1To })
    // No split Layout exists, so the v1 panel draws no split row either.
    expect(boundary.split).toBeUndefined()
  })

  /**
   * One-sided boundaries (#1068): the converter admits an empty contributor
   * set on either side, and the empty side is the compiler-owned Empty. Every
   * record below is a real conversion the domain validator accepts, so the
   * projection cannot drift into a competing model of the shape.
   */
  function oneSidedBoundarySource(variant: 'fade-out' | 'fade-in' | 'empty-both'): ShowRecord {
    const show = convertibleV1Show()
    show.stageMapId = 'plane'
    show.composition!.durationMs = 11000
    show.scenes = [
      { id: 'scene-a', name: 'Outgoing', durationMs: 5000 },
      { id: 'scene-b', name: 'Incoming', durationMs: 5000 },
    ]
    show.composition!.patternInstances = [
      { id: 'out-instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'Outgoing', time: { timeScale: 1, timeOffsetMs: 0 } },
      { id: 'in-instance', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Incoming', time: { timeScale: 1, timeOffsetMs: 0 } },
    ]
    const outgoing = variant === 'fade-in' ? [] : [{
      id: 'out', instanceId: 'out-instance', startMs: 0, durationMs: variant === 'empty-both' ? 1000 : 5000,
      view: { mirror: false, phase: 0, brightness: 1 },
    }]
    const incoming = variant === 'fade-out' || variant === 'empty-both' ? [] : [{
      id: 'in', instanceId: 'in-instance', startMs: 0, durationMs: 5000,
      view: { mirror: false, phase: 0, brightness: 1 },
    }]
    show.composition!.scenes = [
      { sceneId: 'scene-a', zones: [{ zoneId: 'zone', main: outgoing, overlays: [] }] },
      { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: incoming, overlays: [] }] },
    ]
    show.transitions = [{
      id: 't1', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 1000,
      easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
    }]
    return show
  }

  function oneSidedBoundaryRecord(variant: 'fade-out' | 'fade-in' | 'empty-both'): ShowRecordV2 {
    const record = convert(oneSidedBoundarySource(variant))
    expect(record.composition.transitions).toHaveLength(1)
    expect(record.composition.transitions[0].origin).toBe('converted-boundary-transition')
    return record
  }

  it('presents a fade-out boundary with an empty destination side, not a missing entry', () => {
    const record = oneSidedBoundaryRecord('fade-out')
    const before = structuredClone(record)
    const transition = record.composition.transitions[0]

    const boundaries = projectShowEditorBoundaryTransitionsV2(record)

    expect(Object.keys(boundaries)).toEqual(['t1'])
    const boundary = boundaries['t1']
    // The empty side is the compiler-owned Empty: no destination rows, rather
    // than no entry at all. This matches v1's own construction, which builds
    // destinations from the next Scene's covering cells and yields none when
    // no cell covers it.
    expect(boundary.destinations).toEqual([])
    // The window comes from the Transition's own recorded window, not from
    // contributor extents: validation pins every contributor edge to
    // wholeOutput.startMs and startMs + durationMs, so those fields are
    // authoritative where a side contributes nothing.
    expect(transition.wholeOutput).toEqual({ startMs: 5000, fromClipIds: ['out'], toClipIds: [] })
    expect(boundary.boundaryIdentity).toBe(formatShowBoundaryIdentity(6000, []))
    expect(boundary.repeat).toEqual({ from: 1, to: 1 })
    expect(boundary.split).toBeUndefined()
    expect(boundary.settings).toMatchObject({ id: 't1', kind: 'crossfade', durationMs: 1000 })
    for (const field of ['participants', 'wholeOutput', 'propertyRamps', 'origin']) {
      expect(boundary.settings, field).not.toHaveProperty(field)
    }
    expect(record).toEqual(before)
  })

  it('presents a fade-in boundary with destinations but no outgoing side', () => {
    const record = oneSidedBoundaryRecord('fade-in')
    const before = structuredClone(record)
    const transition = record.composition.transitions[0]
    expect(transition.wholeOutput).toEqual({ startMs: 5000, fromClipIds: [], toClipIds: ['in'] })

    const boundaries = projectShowEditorBoundaryTransitionsV2(record)

    expect(Object.keys(boundaries)).toEqual(['t1'])
    const boundary = boundaries['t1']
    expect(boundary.destinations).toHaveLength(1)
    expect(boundary.destinations[0].id).toBe('in')
    expect('outgoing' in boundary.destinations[0]).toBe(false)
    const incoming = record.composition.clips.find(clip => clip.id === 'in')!
    expect(boundary.boundaryIdentity).toBe(
      formatShowBoundaryIdentity(incoming.startMs, ['Incoming']),
    )
    expect(record).toEqual(before)
  })

  it('presents an empty/empty boundary with an empty destination side, not a missing entry', () => {
    const record = oneSidedBoundaryRecord('empty-both')
    const before = structuredClone(record)
    const transition = record.composition.transitions[0]
    expect(transition.wholeOutput).toEqual({ startMs: 5000, fromClipIds: [], toClipIds: [] })

    const boundaries = projectShowEditorBoundaryTransitionsV2(record)

    expect(Object.keys(boundaries)).toEqual(['t1'])
    expect(boundaries['t1'].destinations).toEqual([])
    expect(boundaries['t1'].boundaryIdentity).toBe(formatShowBoundaryIdentity(6000, []))
    expect(record).toEqual(before)
  })

  it('presents the time-zero fade-in the converter already admitted', () => {
    const show = convertibleV1Show()
    show.stageMapId = 'plane'
    show.composition!.durationMs = 6000
    show.scenes = [
      { id: 'scene-a', name: 'Opening', durationMs: 0 },
      { id: 'scene-b', name: 'Incoming', durationMs: 5000 },
    ]
    show.composition!.patternInstances = [
      { id: 'in-instance', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Incoming', time: { timeScale: 1, timeOffsetMs: 0 } },
    ]
    show.composition!.scenes = [
      { sceneId: 'scene-a', zones: [{ zoneId: 'zone', main: [], overlays: [] }] },
      { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: [{
        id: 'in', instanceId: 'in-instance', startMs: 0, durationMs: 5000,
        view: { mirror: false, phase: 0, brightness: 1 },
      }], overlays: [] }] },
    ]
    show.transitions = [{
      id: 't1', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 1000,
      easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
    }]
    const record = convert(show)
    expect(record.composition.transitions).toEqual([expect.objectContaining({
      id: 't1',
      wholeOutput: { startMs: 0, fromClipIds: [], toClipIds: ['in'] },
    })])
    const before = structuredClone(record)

    const boundaries = projectShowEditorBoundaryTransitionsV2(record)

    expect(Object.keys(boundaries)).toEqual(['t1'])
    expect(boundaries['t1'].destinations).toHaveLength(1)
    expect('outgoing' in boundaries['t1'].destinations[0]).toBe(false)
    expect(record).toEqual(before)
  })
})

describe('native v2 routing transfer Cut identity (#1066)', () => {
  it('emits a synthetic Cut for a native boundary and none for the first occurrence', () => {
    const source = record()
    source.composition.layoutOccurrences = [
      { id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 3_000, parameters: {} },
      { id: 'layout-use-b', layoutId: 'layout', startMs: 3_000, durationMs: 4_000, parameters: {} },
    ]
    const before = structuredClone(source)
    const transfers = projectShowEditorRoutingTransfersV2(source)
    expect(source).toEqual(before)
    expect(Object.keys(transfers)).toEqual(['layout-cut:layout-use-b'])
    const entry = transfers['layout-cut:layout-use-b']!
    expect(entry.occurrenceId).toBe('layout-use-b')
    expect(entry.durationMs).toBe(0)
    expect(entry.easing).toEqual({ curve: 'linear' })
    expect(entry.direction).toBe('forward')
    expect(entry.directionAuthored).toBe(false)
    expect(entry.layoutId).toBe('layout')
    expect(entry.maxDurationMs).toBe(4_000)
    expect(entry.layoutOptions.map(option => option.id)).toEqual(['layout'])
    expect(typeof entry.boundaryIdentity).toBe('string')
  })
  it('keeps a timed transfer identity unchanged', () => {
    const source = record()
    source.composition.layoutOccurrences = [
      { id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 3_000, parameters: {} },
      {
        id: 'layout-use-b', layoutId: 'layout', startMs: 3_000, durationMs: 4_000, parameters: {},
        incomingTransfer: { id: 'timed-1', fromOccurrenceId: 'layout-use', durationMs: 1_500, direction: 'reverse', easing: { curve: 'sine', direction: 'in-out' } },
      },
    ]
    const transfers = projectShowEditorRoutingTransfersV2(source)
    expect(Object.keys(transfers)).toEqual(['timed-1'])
    expect(transfers['timed-1']).toMatchObject({
      occurrenceId: 'layout-use-b',
      durationMs: 1_500,
      direction: 'reverse',
      directionAuthored: true,
    })
  })
  it('keeps a converted switch identity unchanged', () => {
    const source = record()
    source.composition.layoutOccurrences = [
      { id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 3_000, parameters: {} },
      {
        id: 'layout-use-b', layoutId: 'layout', startMs: 3_000, durationMs: 4_000, parameters: {},
        incomingSwitch: { origin: 'converted-routing-cut', id: 'switch-1', fromOccurrenceId: 'layout-use' },
      },
    ]
    const transfers = projectShowEditorRoutingTransfersV2(source)
    expect(Object.keys(transfers)).toEqual(['switch-1'])
    expect(transfers['switch-1']).toMatchObject({
      occurrenceId: 'layout-use-b',
      durationMs: 0,
      direction: 'forward',
      directionAuthored: false,
      easing: { curve: 'linear' },
    })
  })
})
