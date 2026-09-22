import { describe, expect, it } from 'vitest'
import type { ShowRecordV2 } from './showCompositionV2'
import {
  completeShowGroupSelectionV2,
  projectShowEditorPropertyLanesV2,
  projectShowEditorTimeColumnsV2,
  projectShowEditorTimelineCommandsV2,
  projectShowEditorTimelineV2,
  projectShowEditorTransitionSettingsV2,
} from './showEditorTimelinePresentation'

function record(): ShowRecordV2 {
  return {
    version: 2,
    id: 'show',
    name: 'Show',
    zones: [{ id: 'zone', name: 'Main', nominalPixelCount: 60, color: '#38bdf8' }],
    zoneLayouts: [{ id: 'layout', name: 'Full', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } }],
    stageMapId: null,
    outputContract: {
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 60,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    },
    composition: {
      version: 2,
      executionModel: 'continuous',
      showEndMs: 12_000,
      sampleRemap: { repeatScale: 1 },
      patternInstances: [
        { id: 'instance-a', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'First', time: { timeScale: 1, timeOffsetMs: 0 } },
        { id: 'instance-b', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Second', time: { timeScale: 1, timeOffsetMs: 0 } },
      ],
      layers: [{ id: 'layer', zoneId: 'zone', name: 'Main', rank: 0 }],
      clips: [
        { id: 'clip-a', instanceId: 'instance-a', zoneId: 'zone', layerId: 'layer', startMs: 0, durationMs: 5_000, entryPolicy: 'continue', zoneSampleMode: 'independent', appearance: { keys: [{ id: 'appearance-a', timeMs: 0, value: { opacity: 1, view: { brightness: 1, phase: 0, mirror: false } } }] } },
        { id: 'clip-b', instanceId: 'instance-b', zoneId: 'zone', layerId: 'layer', startMs: 7_000, durationMs: 5_000, entryPolicy: 'continue', zoneSampleMode: 'independent', appearance: { keys: [{ id: 'appearance-b', timeMs: 7_000, value: { opacity: 0.75, view: { brightness: 1, phase: 0, mirror: false } } }] } },
      ],
      transitions: [{
        id: 'transition', kind: 'crossfade', durationMs: 2_000, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live', propertyRamps: [],
        participants: [{ id: 'participant', zoneId: 'zone', layerId: 'layer', fromClipId: 'clip-a', toClipId: 'clip-b' }],
      }],
      layoutOccurrences: [{ id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 12_000, parameters: {} }],
      propertyTracks: [],
      markers: [{ id: 'chapter-a', timeMs: 0, name: 'Opening', role: 'chapter' }, { id: 'chapter-b', timeMs: 7_000, name: 'Second', role: 'chapter' }],
      groupDefinitions: [],
      groupOccurrences: [],
    },
    updatedAt: 1,
  }
}

describe('projectShowEditorTimelineV2', () => {
  it('presents authored Clip, Transition, Layout and Marker identities without mutating the record', () => {
    const source = record()
    const before = structuredClone(source)

    const view = projectShowEditorTimelineV2(source)

    expect(source).toEqual(before)
    expect(view).toMatchObject({ recordVersion: 2, showId: 'show', showEndMs: 12_000 })
    expect(view.rows[0]?.layers[0]?.items.map(item => ({ id: item.id, selection: item.selection, startMs: item.startMs, endMs: item.endMs }))).toEqual([
      { id: 'clip-a', selection: { kind: 'clip', clipId: 'clip-a' }, startMs: 0, endMs: 5_000 },
      { id: 'clip-b', selection: { kind: 'clip', clipId: 'clip-b' }, startMs: 7_000, endMs: 12_000 },
    ])
    expect(view.rows[0]?.layers[0]?.junctions).toEqual([expect.objectContaining({
      id: 'transition', transitionId: 'transition', leftItemId: 'clip-a', rightItemId: 'clip-b', startMs: 5_000, endMs: 7_000,
    })])
    expect(view.layoutIntervals[0]).toMatchObject({ id: 'layout-use', definitionId: 'layout', selection: { kind: 'layout-occurrence', occurrenceId: 'layout-use' } })
    expect(view.markers.map(marker => marker.selection)).toEqual([
      { kind: 'marker', markerId: 'chapter-a' },
      { kind: 'marker', markerId: 'chapter-b' },
    ])
    expect(view.structuralTimesMs).toEqual([0, 5_000, 7_000, 12_000])
  })

  it('threads the record conversion provenance onto the presented Transition', () => {
    const source = record()
    source.composition.transitions[0]!.origin = 'converted-boundary-transition'

    expect(projectShowEditorTimelineV2(source).transitions[0]).toMatchObject({
      id: 'transition',
      origin: 'converted-boundary-transition',
    })
  })

  it('omits the provenance field for a natively authored Transition', () => {
    const view = projectShowEditorTimelineV2(record())

    expect(view.transitions).toHaveLength(1)
    expect('origin' in view.transitions[0]!).toBe(false)
  })
})

describe('whole-output boundary junctions (#1065)', () => {
  /** The same pair, owned by the whole output instead of one Layer's participants. */
  function wholeOutputRecord(): ShowRecordV2 {
    const source = record()
    const transition = source.composition.transitions[0]
    transition.wholeOutput = { startMs: 5_000, fromClipIds: ['clip-a'], toClipIds: ['clip-b'] }
    transition.participants = []
    return source
  }

  it('draws the junction the whole-output Transition owns, as the v1 timeline does', () => {
    const view = projectShowEditorTimelineV2(wholeOutputRecord())

    // Same band, same identity, same selection as the participant-scoped pair -
    // only the scope differs, which is what sends it to the boundary inspector.
    expect(view.rows[0]?.layers[0]?.junctions).toEqual([expect.objectContaining({
      id: 'transition',
      transitionId: 'transition',
      scope: 'whole-output',
      kind: 'crossfade',
      leftItemId: 'clip-a',
      rightItemId: 'clip-b',
      startMs: 5_000,
      endMs: 7_000,
      durationMs: 2_000,
      selection: { kind: 'transition', transitionId: 'transition' },
    })])
  })

  it('draws no junction for a pair the whole-output Transition does not name', () => {
    const source = wholeOutputRecord()
    source.composition.transitions[0].wholeOutput = { startMs: 5_000, fromClipIds: [], toClipIds: [] }

    const view = projectShowEditorTimelineV2(source)

    // The Clips are not adjacent, so v1 draws nothing here either: a boundary
    // band is never attached to a pair the record does not name.
    expect(view.rows[0]?.layers[0]?.junctions).toEqual([])
  })

  it('draws no junction where the named pair does not span the boundary window', () => {
    const source = wholeOutputRecord()
    source.composition.transitions[0].wholeOutput!.startMs = 4_000

    const view = projectShowEditorTimelineV2(source)

    expect(view.rows[0]?.layers[0]?.junctions).toEqual([])
  })

  it('keeps a participant-scoped junction on the Layer surface', () => {
    const view = projectShowEditorTimelineV2(record())

    expect(view.rows[0]?.layers[0]?.junctions[0]).toMatchObject({ scope: 'layer' })
  })
})

describe('Show editor Marker visibility', () => {
  it('draws authored Markers and hides only the converter\'s migrated Scene labels', () => {
    const base = record()
    base.composition.markers = [
      { id: 'authored', timeMs: 1_000, name: 'Cue', role: 'chapter' },
      { id: 'absorbed', timeMs: 0, name: 'Opening', role: 'chapter' },
      { id: 'migrated', timeMs: 7_000, name: 'Scene 2', role: 'chapter', origin: 'converted-scene-label' },
    ]
    expect(projectShowEditorTimelineV2(base).markers.map((marker) => marker.id))
      .toEqual(['absorbed', 'authored'])
  })
})

describe('Show editor timeline commands v2', () => {
  const view = () => projectShowEditorTimelineV2(record())
  const settings = () => projectShowEditorTransitionSettingsV2(record())
  const commands = (input: Partial<Parameters<typeof projectShowEditorTimelineCommandsV2>[0]> = {}) =>
    projectShowEditorTimelineCommandsV2({
      view: view(),
      selection: { kind: 'other' },
      playheadMs: 0,
      isolatedGroupOccurrenceId: null,
      ...input,
    })

  it('reports the v1 refusals with nothing selected and the playhead at zero', () => {
    expect(commands()).toEqual({
      split: { enabled: false, reason: 'Place the playhead inside a Clip.' },
      clone: { enabled: false, reason: 'Select one simple Clip to Clone' },
      group: { enabled: false, reason: 'Select two or more Clips to make a Group.' },
    })
  })

  it('enables Split only strictly inside the selected Clip, never on its boundaries', () => {
    const selection = { kind: 'clip', clipId: 'clip-a' } as const
    expect(commands({ selection, playheadMs: 0 }).split)
      .toEqual({ enabled: false, reason: 'Place the playhead inside the selected Clip.' })
    expect(commands({ selection, playheadMs: 2_500 }).split)
      .toEqual({ enabled: true, reason: 'Split the selected Clip at the playhead.' })
    expect(commands({ selection, playheadMs: 5_000 }).split)
      .toEqual({ enabled: false, reason: 'Place the playhead inside the selected Clip.' })
  })

  it('resolves Split at the playhead only when no Clip is selected', () => {
    expect(commands({ playheadMs: 2_500 }).split)
      .toEqual({ enabled: true, reason: 'Split the selected Clip at the playhead.' })
    expect(commands({ playheadMs: 2_500, isolatedGroupOccurrenceId: 'occurrence' }).split)
      .toEqual({ enabled: false, reason: 'Place the playhead inside a Clip.' })
  })

  it('enables Clone only when the Layer holds another Clip length after the selection', () => {
    // clip-a ends at 5000 and clip-b starts at 7000: 2000 ms of room for a
    // 5000 ms copy is not enough.
    expect(commands({ selection: { kind: 'clip', clipId: 'clip-a' } }).clone)
      .toEqual({ enabled: false, reason: 'The selected Clip needs empty time after it on this Layer' })
    // clip-b ends at 12000, exactly Show End, so it has no room either.
    expect(commands({ selection: { kind: 'clip', clipId: 'clip-b' } }).clone)
      .toEqual({ enabled: false, reason: 'The selected Clip needs empty time after it on this Layer' })
    expect(commands({ selection: { kind: 'clip', clipId: 'missing' } }).clone)
      .toEqual({ enabled: false, reason: 'Select one simple Clip to Clone' })
  })

  it('refuses a Group whose Transition chain is only partly selected', () => {
    expect(commands({ selection: { kind: 'multi', placementIds: ['clip-a'], transitionIds: [] } }).group)
      .toEqual({ enabled: false, reason: 'Select both Clips and the complete non-Cut Transition chain.' })
    expect(commands({ selection: { kind: 'multi', placementIds: ['clip-a', 'clip-b'], transitionIds: [] } }).group)
      .toEqual({ enabled: false, reason: 'Select both Clips and the complete non-Cut Transition chain.' })
    expect(commands({ selection: { kind: 'multi', placementIds: [], transitionIds: [] } }).group)
      .toEqual({ enabled: false, reason: 'Select at least one Clip.' })
    expect(commands({ selection: { kind: 'multi', placementIds: ['clip-a', 'missing'], transitionIds: [] } }).group)
      .toEqual({ enabled: false, reason: 'One or more selected Clips no longer exist.' })
  })

  it('enables a Group over the whole selected chain', () => {
    const junctionIds = view().rows.flatMap((row) => row.layers.flatMap((layer) => layer.junctions))
      .filter((junction) => junction.transitionId)
      .map((junction) => junction.transitionId!)
    expect(junctionIds.length).toBeGreaterThan(0)
    expect(commands({
      selection: { kind: 'multi', placementIds: ['clip-a', 'clip-b'], transitionIds: junctionIds },
    }).group).toEqual({
      enabled: true,
      reason: 'Keep the selected choreography together and make it reusable',
    })
  })

  it('exposes authored Transition settings under the identity a junction carries', () => {
    const junction = view().rows.flatMap((row) => row.layers.flatMap((layer) => layer.junctions))
      .find((candidate) => candidate.transitionId)
    expect(junction?.transitionId).toBeTruthy()
    expect(settings()[junction!.transitionId!]).toMatchObject({
      kind: 'crossfade',
      durationMs: 2_000,
      easing: { curve: 'linear' },
    })
  })
})

describe('Zone Layout lane naming', () => {
  it('names the lane by the authored Zone Layout, keeping two same-kind Layouts distinct', () => {
    const source = record()
    // Two physical-range Layouts share one kind label ("Physical ranges"), so a
    // lane naming itself by kind could not tell them apart (#1065 F1).
    source.zoneLayouts = [
      { id: 'layout', name: 'Full Surface', zones: [{ zoneId: 'zone', ranges: [{ start: 0, end: 29 }] }] },
      { id: 'layout-b', name: 'Alternating Bands', zones: [{ zoneId: 'zone', ranges: [{ start: 30, end: 59 }] }] },
    ]
    source.composition.layoutOccurrences = [
      { id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 6_000, parameters: {} },
      { id: 'layout-use-b', layoutId: 'layout-b', startMs: 6_000, durationMs: 6_000, parameters: {} },
    ]

    const view = projectShowEditorTimelineV2(source)

    expect(view.layoutIntervals.map(interval => interval.definitionName))
      .toEqual(['Full Surface', 'Alternating Bands'])
  })
})

describe('projectShowEditorPropertyLanesV2', () => {
  function withBrightnessTrack(source: ShowRecordV2): ShowRecordV2 {
    source.composition.propertyTracks = [{
      id: 'track-brightness',
      target: { kind: 'clip-view', clipId: 'clip-a', property: 'brightness' },
      activeStartMs: 0,
      activeDurationMs: 5_000,
      keyframes: [
        { id: 'key-a', timeMs: 0, value: 0.45, easing: { curve: 'linear' } },
        { id: 'key-b', timeMs: 5_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]
    return source
  }

  it('draws an authored Property track as one lane named by its owning Clip', () => {
    const source = withBrightnessTrack(record())
    const before = structuredClone(source)

    const lanes = projectShowEditorPropertyLanesV2(source)

    expect(source).toEqual(before)
    expect(lanes).toHaveLength(1)
    expect(lanes[0]).toMatchObject({
      zoneId: 'zone',
      label: 'First brightness',
      patternName: 'First',
      propertyLabel: 'brightness',
      family: 'appearance',
      valueKind: 'percent',
      ariaKind: 'animation',
      selectsTransition: false,
    })
    // Keyframe times are already Show-global on an authored v2 record, so the
    // lane needs no Scene-offset remap; the extrema are the authored bounds.
    expect(lanes[0]!.projection.durationMs).toBe(12_000)
    expect(lanes[0]!.projection.extrema).toEqual({ min: 0.45, max: 1 })
    expect(lanes[0]!.projection.beats.map(beat => beat.timeMs)).toEqual([0, 5_000])
  })

  it('omits a track whose value never changes, exactly as the v1 lane does', () => {
    const source = withBrightnessTrack(record())
    source.composition.propertyTracks[0]!.keyframes.forEach(key => { key.value = 0.6 })

    expect(projectShowEditorPropertyLanesV2(source)).toEqual([])
  })

  it('draws a Zone value lane only when a Transition ramps the value, as the v1 lane does', () => {
    // v1's per-Zone lane is time-varying only where a boundary ramp changes the
    // value; two Clips simply holding different values draw no lane there, and
    // the authored-v2 reading must not invent one.
    const held = record()
    held.composition.patternInstances[1]!.time.timeScale = 0.32
    expect(projectShowEditorPropertyLanesV2(held)).toEqual([])

    const ramped = record()
    ramped.composition.patternInstances[1]!.time.timeScale = 0.32
    ramped.composition.transitions[0]!.propertyRamps = [{
      target: { kind: 'instance-time-scale', instanceId: 'instance-b' },
      from: 1,
      durationMs: 2_000,
    }]

    const lanes = projectShowEditorPropertyLanesV2(ramped)

    expect(lanes).toHaveLength(1)
    expect(lanes[0]).toMatchObject({
      id: 'timeScale',
      zoneId: 'zone',
      label: 'animation speed',
      propertyLabel: 'speed',
      family: 'time',
      valueKind: 'multiplier',
      ariaKind: 'lane',
      selectsTransition: true,
    })
    expect(lanes[0]!.projection.extrema).toEqual({ min: 0.32, max: 1 })
    expect(lanes[0]!.projection.beats.map(beat => ({ timeMs: beat.timeMs, value: beat.value }))).toEqual([
      { timeMs: 5_000, value: 1 },
      { timeMs: 7_000, value: 0.32 },
    ])
  })

  it('names a Zone control lane from the supplied control metadata', () => {
    const source = record()
    source.composition.patternInstances[0]!.controlTargets = { sliderGlow: 0.2 }
    source.composition.patternInstances[1]!.controlTargets = { sliderGlow: 0.8 }
    source.composition.transitions[0]!.propertyRamps = [{
      target: { kind: 'instance-control', instanceId: 'instance-b', exportName: 'sliderGlow' },
      from: 0.2,
      durationMs: 2_000,
    }]

    const [lane] = projectShowEditorPropertyLanesV2(source, [
      { exportName: 'sliderGlow', label: 'Glow', defaultValue: 0.5 },
    ])

    expect(lane).toMatchObject({
      id: 'control:sliderGlow',
      label: 'Glow',
      propertyLabel: 'Glow',
      family: 'control',
      valueKind: 'percent',
      ariaKind: 'control-lane',
    })
    expect(lane!.projection.extrema).toEqual({ min: 0.2, max: 0.8 })
  })

  it('reads a Group child\'s own Property tracks as internal, as the v1 editor does', () => {
    const source = withBrightnessTrack(record())
    // A Group definition owns its animation; v1's lane projection reads Scene
    // tracks only, so the Show timeline draws nothing for it.
    source.composition.groupDefinitions = [{
      id: 'definition',
      name: 'Pulse',
      layers: [{ id: 'definition-layer', name: 'Main', rank: 0 }],
      patternInstances: [{ id: 'slot', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'Slot', time: { timeScale: 1, timeOffsetMs: 0 } }],
      clips: [{ id: 'child', instanceId: 'slot', layerId: 'definition-layer', startMs: 0, durationMs: 1_000, entryPolicy: 'continue', zoneSampleMode: 'independent', appearance: { keys: [{ id: 'child-key', timeMs: 0, value: { opacity: 1, view: { brightness: 1, phase: 0, mirror: false } } }] } }],
      transitions: [],
      propertyTracks: [{
        id: 'definition-track',
        target: { kind: 'clip-opacity', clipId: 'child' },
        activeStartMs: 0,
        activeDurationMs: 1_000,
        keyframes: [
          { id: 'definition-key-a', timeMs: 0, value: 0, easing: { curve: 'linear' } },
          { id: 'definition-key-b', timeMs: 1_000, value: 0.9, easing: { curve: 'linear' } },
        ],
      }],
    }]
    source.composition.groupOccurrences = [{
      id: 'occurrence', definitionId: 'definition', zoneId: 'zone', layoutOccurrenceId: 'layout-use',
      startMs: 1_000, translationX: 0, translationY: 0, holds: [],
      layerBindings: [{ definitionLayerId: 'definition-layer', layerId: 'layer' }],
    }]

    const lanes = projectShowEditorPropertyLanesV2(source)

    expect(lanes.map(lane => lane.id)).toEqual(['track:zone:track-brightness'])
  })
})

describe('Group-local Transition settings (#1065)', () => {
  /**
   * One Group occurrence on its own Layer, joined by a definition-local Layer
   * Transition, alongside the top-level Transition the base record already
   * authors. Both families therefore draw a junction in one projection.
   */
  function groupRecord(): ShowRecordV2 {
    const source = record()
    source.composition.layers.push({ id: 'layer-group', zoneId: 'zone', name: 'Group', rank: 1 })
    source.composition.groupDefinitions = [{
      id: 'definition',
      name: 'Mandala pulse',
      patternInstances: [{ id: 'pulse', pattern: { kind: 'stock', id: 'SignalMandala' }, patternName: 'SignalMandala', time: { timeScale: 1, timeOffsetMs: 0 } }],
      layers: [{ id: 'definition-layer', name: 'Layer 0', rank: 0 }],
      clips: [
        { id: 'lead', instanceId: 'pulse', layerId: 'definition-layer', startMs: 0, durationMs: 2_000, entryPolicy: 'continue', zoneSampleMode: 'span', appearance: { keys: [{ id: 'lead-key', timeMs: 0, value: { opacity: 1, view: { brightness: 1, phase: 0, mirror: false } } }] } },
        { id: 'echo', instanceId: 'pulse', layerId: 'definition-layer', startMs: 3_000, durationMs: 1_000, entryPolicy: 'continue', zoneSampleMode: 'span', appearance: { keys: [{ id: 'echo-key', timeMs: 3_000, value: { opacity: 1, view: { brightness: 1, phase: 0, mirror: false } } }] } },
      ],
      transitions: [{
        id: 'join', fromPlacementId: 'lead', toPlacementId: 'echo',
        kind: 'crossfade', durationMs: 1_000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
      }],
      propertyTracks: [],
    }]
    source.composition.groupOccurrences = [{
      id: 'occurrence', definitionId: 'definition', zoneId: 'zone', layoutOccurrenceId: 'layout-use',
      startMs: 2_000, translationX: 0, translationY: 0, holds: [],
      layerBindings: [{ definitionLayerId: 'definition-layer', layerId: 'layer-group' }],
    }]
    return source
  }

  it('exposes the authored Group-local settings under the identity its junction carries', () => {
    const junction = projectShowEditorTimelineV2(groupRecord()).rows
      .flatMap(row => row.layers.flatMap(layer => layer.junctions))
      .find(candidate => candidate.transitionId?.startsWith('occurrence:'))
    // The junction is named by the occurrence and the definition child, which
    // is the only identity the timeline offers the pictogram.
    expect(junction?.transitionId).toBe('occurrence:join')

    expect(projectShowEditorTransitionSettingsV2(groupRecord())[junction!.transitionId!])
      .toMatchObject({
        kind: 'crossfade',
        durationMs: 1_000,
        crossfadePolicy: 'live-live',
        easing: { curve: 'linear' },
      })
  })

  it('carries settings for every junction the timeline names a Transition on', () => {
    const source = groupRecord()
    const settings = projectShowEditorTransitionSettingsV2(source)
    const named = projectShowEditorTimelineV2(source).rows
      .flatMap(row => row.layers.flatMap(layer => layer.junctions))
      .flatMap(junction => junction.transitionId ? [junction.transitionId] : [])

    // Both families are present, so this cannot pass by drawing only one.
    expect(named.sort()).toEqual(['occurrence:join', 'transition'])
    // The pictogram reads settings by exactly this key: a junction the map
    // misses is drawn blank on v2 while v1 draws its glyph.
    expect(named.filter(id => !settings[id])).toEqual([])
  })
})

describe('projectShowEditorTimeColumnsV2 (#1065)', () => {
  it('lays a chaptered Show out in one section column per chapter span', () => {
    const source = record()
    const before = structuredClone(source)

    const columns = projectShowEditorTimeColumnsV2(source)

    expect(source).toEqual(before)
    expect(columns).toEqual([
      { kind: 'section', startMs: 0, durationMs: 7_000 },
      { kind: 'boundary', startMs: 7_000, durationMs: 0 },
      { kind: 'section', startMs: 7_000, durationMs: 5_000 },
    ])
  })

  /**
   * v1 draws a Scene column, then the boundary Transition's own column, then the
   * next Scene. The converted record keeps the chapter at the next Scene's start,
   * so the boundary's duration belongs to the boundary column and must come off
   * the preceding section rather than being counted twice.
   */
  it('gives a converted boundary Transition its own column out of the preceding section', () => {
    const source = record()
    source.composition.transitions[0]!.origin = 'converted-boundary-transition'

    expect(projectShowEditorTimeColumnsV2(source)).toEqual([
      { kind: 'section', startMs: 0, durationMs: 5_000 },
      { kind: 'boundary', startMs: 5_000, durationMs: 2_000 },
      { kind: 'section', startMs: 7_000, durationMs: 5_000 },
    ])
  })

  /** A Layer Transition lives inside a section and never owns a column. */
  it('ignores a converted Layer Transition', () => {
    const source = record()
    source.composition.transitions[0]!.origin = 'converted-layer-transition'

    expect(projectShowEditorTimeColumnsV2(source)).toEqual([
      { kind: 'section', startMs: 0, durationMs: 7_000 },
      { kind: 'boundary', startMs: 7_000, durationMs: 0 },
      { kind: 'section', startMs: 7_000, durationMs: 5_000 },
    ])
  })

  it('lays a Show with no chapter out in one section spanning the whole Show', () => {
    const source = record()
    source.composition.markers = []

    expect(projectShowEditorTimeColumnsV2(source)).toEqual([
      { kind: 'section', startMs: 0, durationMs: 12_000 },
    ])
  })

  it('ignores an ordinary authored Marker and a chapter outside the Show', () => {
    const source = record()
    source.composition.markers = [
      { id: 'chapter-a', timeMs: 0, name: 'Opening', role: 'chapter' },
      { id: 'cue', timeMs: 4_000, name: 'Cue' },
      { id: 'chapter-end', timeMs: 12_000, name: 'End', role: 'chapter' },
    ]

    expect(projectShowEditorTimeColumnsV2(source)).toEqual([
      { kind: 'section', startMs: 0, durationMs: 12_000 },
    ])
  })
})

describe('completeShowGroupSelectionV2 (#1066 L2583)', () => {
  const view = () => projectShowEditorTimelineV2(record())
  const group = (selection: { kind: 'multi'; placementIds: string[]; transitionIds: string[] }) =>
    projectShowEditorTimelineCommandsV2({
      view: view(),
      selection,
      playheadMs: 0,
      isolatedGroupOccurrenceId: null,
    }).group

  it('collects the joining Transition when both Clips are selected, enabling Group', () => {
    const selection = completeShowGroupSelectionV2(view(), ['clip-a', 'clip-b'])

    expect(selection).toEqual({ placementIds: ['clip-a', 'clip-b'], transitionIds: ['transition'] })
    expect(group({
      kind: 'multi',
      placementIds: selection.placementIds,
      transitionIds: selection.transitionIds,
    })).toEqual({
      enabled: true,
      reason: 'Keep the selected choreography together and make it reusable',
    })
  })

  it('excludes the Transition when only one side is selected', () => {
    expect(completeShowGroupSelectionV2(view(), ['clip-a']))
      .toEqual({ placementIds: ['clip-a'], transitionIds: [] })
  })

  it('never includes a derived-cut junction', () => {
    const source = record()
    source.composition.clips.find((clip) => clip.id === 'clip-b')!.startMs = 5_000
    source.composition.transitions = []
    const adjacent = projectShowEditorTimelineV2(source)
    const junction = adjacent.rows
      .flatMap((row) => row.layers.flatMap((layer) => layer.junctions))
      .find((candidate) => candidate.leftItemId === 'clip-a')
    expect(junction?.scope).toBe('derived-cut')

    expect(completeShowGroupSelectionV2(adjacent, ['clip-a', 'clip-b']))
      .toEqual({ placementIds: ['clip-a', 'clip-b'], transitionIds: [] })
  })

  it('collapses duplicate placement ids', () => {
    expect(completeShowGroupSelectionV2(view(), ['clip-b', 'clip-a', 'clip-b', 'clip-a']))
      .toEqual({ placementIds: ['clip-b', 'clip-a'], transitionIds: ['transition'] })
  })
})

describe('native v2 Layout boundary Cut identity (#1066)', () => {
  it('gives a native boundary a layout-cut handle and none to the first occurrence', () => {
    const source = record()
    source.composition.layoutOccurrences = [
      { id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 6_000, parameters: {} },
      { id: 'layout-use-b', layoutId: 'layout', startMs: 6_000, durationMs: 6_000, parameters: {} },
    ]
    const before = structuredClone(source)
    const view = projectShowEditorTimelineV2(source)
    expect(source).toEqual(before)
    expect(view.layoutIntervals).toHaveLength(2)
    expect(view.layoutIntervals[0]?.incomingTransfer).toBeUndefined()
    expect(view.layoutIntervals[1]?.incomingTransfer).toEqual({
      id: 'layout-cut:layout-use-b',
      fromOccurrenceId: 'layout-use',
      durationMs: 0,
    })
  })
  it('keeps a timed transfer identity unchanged', () => {
    const source = record()
    source.composition.layoutOccurrences = [
      { id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 6_000, parameters: {} },
      {
        id: 'layout-use-b', layoutId: 'layout', startMs: 6_000, durationMs: 6_000, parameters: {},
        incomingTransfer: { id: 'timed-1', fromOccurrenceId: 'layout-use', durationMs: 1_500, direction: 'forward', easing: { curve: 'linear' } },
      },
    ]
    const view = projectShowEditorTimelineV2(source)
    expect(view.layoutIntervals[1]?.incomingTransfer).toEqual({
      id: 'timed-1',
      fromOccurrenceId: 'layout-use',
      durationMs: 1_500,
    })
  })
  it('keeps a converted switch identity unchanged', () => {
    const source = record()
    source.composition.layoutOccurrences = [
      { id: 'layout-use', layoutId: 'layout', startMs: 0, durationMs: 6_000, parameters: {} },
      {
        id: 'layout-use-b', layoutId: 'layout', startMs: 6_000, durationMs: 6_000, parameters: {},
        incomingSwitch: { origin: 'converted-routing-cut', id: 'switch-1', fromOccurrenceId: 'layout-use' },
      },
    ]
    const view = projectShowEditorTimelineV2(source)
    expect(view.layoutIntervals[1]?.incomingTransfer).toEqual({
      id: 'switch-1',
      fromOccurrenceId: 'layout-use',
      durationMs: 0,
    })
  })
})
