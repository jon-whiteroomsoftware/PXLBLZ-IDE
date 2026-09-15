import { describe, expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { LIBRARIES } from '../pixelblaze/libs'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
import { editShowTransitionV2, projectShowTransitionJunctionsV2 } from './showTransitionsV2'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
  type ShowTransitionV2,
} from './showCompositionV2'

function convertedTransitionShow(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

function cutShow(gapMs = 0): ShowRecordV2 {
  const record = convertedTransitionShow()
  const incoming = record.composition.clips.find(clip => clip.id === 'in')!
  incoming.startMs = 400 + gapMs
  incoming.appearance.keys.forEach(key => { key.timeMs -= 200 - gapMs })
  record.composition.transitions = []
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

function unequalWholeOutputShow(): ShowRecordV2 {
  const record = cutShow()
  record.composition.showEndMs = 2_000
  record.composition.layoutOccurrences = [
    { id: 'layout-before', layoutId: 'layout', startMs: 0, durationMs: 400, parameters: {} },
    { id: 'layout-after', layoutId: 'layout', startMs: 400, durationMs: 1_600, parameters: {} },
  ]
  const overlayLayerId = record.composition.layers.find(layer => layer.rank === 1)!.id
  const outgoing = record.composition.clips.find(clip => clip.id === 'out')!
  const incoming = record.composition.clips.find(clip => clip.id === 'in')!
  record.composition.clips.push(
    {
      ...structuredClone(outgoing), id: 'out-overlay', layerId: overlayLayerId,
      appearance: { keys: [{ ...structuredClone(outgoing.appearance.keys[0]), id: 'out-overlay:appearance:1' }] },
    },
    {
      ...structuredClone(incoming), id: 'in-overlay', layerId: overlayLayerId,
      appearance: { keys: [{ ...structuredClone(incoming.appearance.keys[0]), id: 'in-overlay:appearance:1' }] },
    },
  )
  record.composition.patternInstances.push({
    ...structuredClone(record.composition.patternInstances[0]),
    id: 'tail-instance', patternName: 'Tail',
  })
  record.composition.clips.push({
    ...structuredClone(incoming), id: 'tail', instanceId: 'tail-instance', startMs: 900, durationMs: 300,
    appearance: { keys: [{ ...structuredClone(incoming.appearance.keys[0]), id: 'tail:appearance:1', timeMs: 900 }] },
  })
  record.composition.transitions = [{
    id: 'next', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
    wholeOutput: { startMs: 800, fromClipIds: ['in', 'in-overlay'], toClipIds: ['tail'] },
    participants: [], propertyRamps: [],
  }]
  const track = {
    activeStartMs: 400, activeDurationMs: 400,
    keyframes: [
      { id: 'start', timeMs: 400, value: 1, easing: { curve: 'linear' as const } },
      { id: 'end', timeMs: 800, value: 0.5, easing: { curve: 'linear' as const } },
    ],
  }
  record.composition.propertyTracks = [
    { ...structuredClone(track), id: 'clip-track', target: { kind: 'clip-opacity', clipId: 'in' } },
    { ...structuredClone(track), id: 'shared-instance-track', target: { kind: 'instance-time-scale', instanceId: 'in-instance' } },
    {
      ...structuredClone(track), id: 'tail-instance-track', target: { kind: 'instance-time-scale', instanceId: 'tail-instance' },
      activeStartMs: 900, activeDurationMs: 300,
      keyframes: [
        { id: 'tail-start', timeMs: 900, value: 1, easing: { curve: 'linear' } },
        { id: 'tail-end', timeMs: 1_200, value: 0.5, easing: { curve: 'linear' } },
      ],
    },
    { ...structuredClone(track), id: 'show-track', target: { kind: 'show-repeat-scale' } },
  ]
  record.composition.markers = [{ id: 'marker', timeMs: 400, name: 'Boundary' }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function crossZoneWholeOutputShow(): ShowRecordV2 {
  const record = cutShow()
  const incoming = record.composition.clips.find(clip => clip.id === 'in')!
  record.zones.push({ id: 'zone-b', name: 'Second', nominalPixelCount: 16 })
  record.zoneLayouts[0].logical = { kind: 'split', zoneIds: ['zone', 'zone-b'], axis: 'x' }
  record.zoneLayouts.push({
    id: 'layout-b', name: 'Second only', zones: [], logical: { kind: 'single', zoneIds: ['zone-b'] },
  })
  record.composition.layers.push({ id: 'layer:zone-b:main', zoneId: 'zone-b', name: 'Main', rank: 0 })
  incoming.zoneId = 'zone-b'
  incoming.layerId = 'layer:zone-b:main'
  incoming.startMs = 500
  incoming.appearance.keys.forEach(key => { key.timeMs = 500 })
  record.composition.layoutOccurrences = [
    { id: 'layout-both', layoutId: 'layout', startMs: 0, durationMs: 500, parameters: {} },
    { id: 'layout-b', layoutId: 'layout-b', startMs: 500, durationMs: 500, parameters: {} },
  ]
  record.composition.transitions = [{
    id: 'whole', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' },
    crossfadePolicy: 'live-live', propertyRamps: [], participants: [],
    wholeOutput: { startMs: 400, fromClipIds: ['out'], toClipIds: ['in'] },
  }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function compiledFrames(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const compileCandidate = reopen(record)
  // #1037 projects these owned tracks; this proof isolates the Transition topology/artifact.
  compileCandidate.composition.propertyTracks = []
  const prepared = prepareShowV2ForCompile(compileCandidate, {
    byCellId: {},
    byPatternInstanceId: {
      'out-instance': 'export function render2D(index, x, y) { rgb(1, x / 4, y / 4) }',
      'in-instance': 'export function render2D(index, x, y) { rgb(x / 4, y / 4, 1) }',
      'tail-instance': 'export function render2D(index, x, y) { rgb(x / 4, 1, y / 4) }',
    },
    stageDimension: 2,
  })
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const runtime = createFastReplayRuntime({
    code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata, dimension: 2,
  }, {
    randomSeed: 1035,
    fidelity,
    mapPoints: Array.from({ length: 4 }, (_, index) => ({
      sample: [index / 3, 0.5] as [number, number], pos: [index / 3, 0.5] as [number, number],
    })),
  })
  return [0, 399, 400, 500, 599, 600, 899, 900, 999, 1_000, 1_199]
    .filter(timeMs => timeMs < record.composition.showEndMs)
    .map((timeMs, index) => Array.from(index === 0
      ? runtime.renderCurrentFrame().frame
      : runtime.advanceTo(timeMs, { stepMs: 1, forceFullIntermediateRender: true }).frame))
}

describe('v2 Transition ownership', () => {
  it('derives an identity-free Cut only at exact same-Layer adjacency', () => {
    const exact = cutShow()
    const before = structuredClone(exact)

    expect(projectShowTransitionJunctionsV2(exact)).toEqual([{
      kind: 'cut',
      atMs: 400,
      zoneId: 'zone',
      layerId: 'layer:zone:main',
      fromClipId: 'out',
      toClipId: 'in',
    }])
    expect(projectShowTransitionJunctionsV2(cutShow(1))).toEqual([])
    expect(exact).toEqual(before)
  })

  it('inserts, moves, resizes and resets one Transition as immutable atomic edits', () => {
    const source = cutShow()
    source.composition.showEndMs = 1_500
    source.composition.layoutOccurrences[0].durationMs = 1_500
    const before = structuredClone(source)
    const inserted = editShowTransitionV2(source, {
      kind: 'insert',
      transition: {
        id: 'transition', kind: 'crossfade', durationMs: 200, easing: { curve: 'sine', direction: 'in-out' },
        crossfadePolicy: 'snapshot-live', propertyRamps: [],
        participants: [{ id: 'participant', zoneId: 'zone', layerId: 'layer:zone:main', fromClipId: 'out', toClipId: 'in' }],
      },
    })
    expect(inserted).toMatchObject({
      status: 'changed', affectedClipIds: ['in'], affectedTransitionIds: ['transition'], affectedTrackIds: [], removedIds: [],
    })
    if (inserted.status !== 'changed') return
    expect(source).toEqual(before)
    expect(inserted.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([['out', 0], ['in', 600]])

    const moved = editShowTransitionV2(reopen(inserted.record), { kind: 'move-connected', clipId: 'in', startMs: 700 })
    expect(moved).toMatchObject({ status: 'changed', affectedClipIds: ['in', 'out'], affectedTransitionIds: ['transition'] })
    if (moved.status !== 'changed') return
    expect(moved.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([['out', 100], ['in', 700]])

    const resized = editShowTransitionV2(reopen(moved.record), { kind: 'resize-transition', transitionId: 'transition', durationMs: 300 })
    expect(resized).toMatchObject({ status: 'changed', affectedClipIds: ['in'], affectedTransitionIds: ['transition'] })
    if (resized.status !== 'changed') return
    expect(resized.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([['out', 100], ['in', 800]])

    const reset = editShowTransitionV2(reopen(resized.record), { kind: 'reset-to-cut', transitionId: 'transition' })
    expect(reset).toMatchObject({
      status: 'changed', affectedClipIds: ['in'], affectedTransitionIds: ['transition'], removedIds: ['transition'],
    })
    if (reset.status !== 'changed') return
    expect(reset.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([['out', 100], ['in', 500]])
    expect(reset.record.composition.transitions).toEqual([])
    expect(projectShowTransitionJunctionsV2(reopen(reset.record))).toEqual([expect.objectContaining({ kind: 'cut', atMs: 500 })])
  })

  it('projects Property ramps before resetting their visual Transition carrier', () => {
    const source = convertedTransitionShow()
    const transition = source.composition.transitions[0]
    const incoming = source.composition.clips.find(clip => clip.id === transition.participants[0].toClipId)!
    transition.propertyRamps = [{
      participantId: transition.participants[0].id,
      target: { kind: 'clip-view', clipId: incoming.id, property: 'brightness' },
      from: 0.2,
      easing: { curve: 'quadratic', direction: 'in' },
    }]
    const before = structuredClone(source)

    const reset = editShowTransitionV2(source, {
      kind: 'reset-to-cut',
      transitionId: transition.id,
      propertyRampProjections: [{
        rampIndex: 0,
        trackId: 'brightness-track',
        startKeyId: 'brightness-start',
        endKeyId: 'brightness-end',
        activeEndMs: incoming.startMs + incoming.durationMs,
        toValue: incoming.appearance.keys[0].value.view.brightness,
      }],
    })

    expect(source).toEqual(before)
    expect(reset).toMatchObject({
      status: 'changed', affectedTransitionIds: [transition.id], affectedTrackIds: ['brightness-track'],
      removedIds: [transition.id],
    })
    if (reset.status !== 'changed') return
    const reopened = reopen(reset.record)
    expect(reopened.composition.transitions).toEqual([])
    expect(reopened.composition.clips.find(clip => clip.id === incoming.id)?.startMs).toBe(400)
    expect(reopened.composition.propertyTracks).toEqual([{
      id: 'brightness-track',
      target: { kind: 'clip-view', clipId: incoming.id, property: 'brightness' },
      activeStartMs: 400,
      activeDurationMs: incoming.startMs + incoming.durationMs - 400,
      keyframes: [
        { id: 'brightness-start', timeMs: 400, value: 0.2, easing: { curve: 'quadratic', direction: 'in' } },
        { id: 'brightness-end', timeMs: 600, value: 1, easing: { curve: 'linear' } },
      ],
    }])
    expect(evaluateShowPropertyTrackV2(reopened.composition.propertyTracks[0], 500)).toBeCloseTo(0.4)
    expect(validateShowRecordV2(reopened)).toEqual([])
  })

  it('retains the exact owned curve when a connected Clip edge is resized', () => {
    const source = convertedTransitionShow()
    const outgoing = source.composition.clips.find(clip => clip.id === 'out')!
    source.composition.propertyTracks = [{
      id: 'brightness-track',
      target: { kind: 'clip-view', clipId: outgoing.id, property: 'brightness' },
      activeStartMs: outgoing.startMs,
      activeDurationMs: outgoing.durationMs,
      keyframes: [
        { id: 'brightness-start', timeMs: outgoing.startMs, value: 0, easing: { curve: 'quadratic', direction: 'in' } },
        { id: 'brightness-end', timeMs: outgoing.startMs + outgoing.durationMs, value: 1, easing: { curve: 'linear' } },
      ],
    }]
    const expected = evaluateShowPropertyTrackV2(source.composition.propertyTracks[0], 299)

    const resized = editShowTransitionV2(source, { kind: 'resize-trailing', clipId: outgoing.id, endMs: 300 })

    expect(resized).toMatchObject({ status: 'changed', affectedTrackIds: ['brightness-track'] })
    if (resized.status !== 'changed') return
    const track = resized.record.composition.propertyTracks[0]
    expect(track.activeDurationMs).toBe(300)
    expect(track.keyframes[0].curveSegment).toMatchObject({ sourceDurationMs: 400, elapsedOffsetMs: 0 })
    expect(evaluateShowPropertyTrackV2(track, 299)).toBeCloseTo(expected!)
    expect(validateShowRecordV2(reopen(resized.record))).toEqual([])
  })

  it('deletes a Clip and its Transition without retaining ghost identity on re-add', () => {
    const source = convertedTransitionShow()
    const before = structuredClone(source)
    const deleted = editShowTransitionV2(source, { kind: 'delete-clip', clipId: 'in' })
    expect(deleted).toMatchObject({
      status: 'changed', affectedClipIds: ['in'], affectedTransitionIds: ['transition-crossfade'],
      removedIds: ['in', 'transition-crossfade'],
    })
    if (deleted.status !== 'changed') return
    expect(source).toEqual(before)
    expect(deleted.record.composition.showEndMs).toBe(source.composition.showEndMs)
    expect(deleted.record.composition.clips.find(clip => clip.id === 'out')).toEqual(source.composition.clips.find(clip => clip.id === 'out'))
    expect(deleted.record.composition.transitions).toEqual([])

    const readded = reopen(deleted.record)
    readded.composition.clips.push({
      ...structuredClone(source.composition.clips.find(clip => clip.id === 'in')!),
      id: 'replacement',
      startMs: 400,
      appearance: { keys: [{
        ...structuredClone(source.composition.clips.find(clip => clip.id === 'in')!.appearance.keys[0]),
        id: 'replacement:appearance:1',
        timeMs: 400,
      }] },
    })
    expect(validateShowRecordV2(readded)).toEqual([])
    expect(projectShowTransitionJunctionsV2(reopen(readded))).toEqual([
      expect.objectContaining({ kind: 'cut', atMs: 400, fromClipId: 'out', toClipId: 'replacement' }),
    ])
    expect(readded.composition.transitions).toEqual([])
  })

  it('moves unequal whole-output contributors and a converging successor once while global owners stay fixed', () => {
    const source = unequalWholeOutputShow()
    const insertedTransition: ShowTransitionV2 = {
      id: 'whole', kind: 'fade-color', color: '#204060', durationMs: 200, easing: { curve: 'linear' },
      wholeOutput: { startMs: 400, fromClipIds: ['out', 'out-overlay'], toClipIds: ['in', 'in-overlay'] },
      participants: [], propertyRamps: [],
    }
    const inserted = editShowTransitionV2(source, { kind: 'insert', transition: insertedTransition })
    expect(inserted).toMatchObject({
      status: 'changed',
      affectedClipIds: ['in', 'in-overlay', 'tail'],
      affectedTransitionIds: ['next', 'whole'],
      affectedTrackIds: ['clip-track', 'tail-instance-track'],
    })
    if (inserted.status !== 'changed') return
    expect(inserted.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([
      ['out', 0], ['in', 600], ['out-overlay', 0], ['in-overlay', 600], ['tail', 1_100],
    ])
    expect(inserted.record.composition.transitions.find(transition => transition.id === 'next')?.wholeOutput?.startMs).toBe(1_000)
    expect(inserted.record.composition.propertyTracks.map(track => [track.id, track.activeStartMs])).toEqual([
      ['clip-track', 600], ['shared-instance-track', 400], ['tail-instance-track', 1_100], ['show-track', 400],
    ])
    expect(inserted.record.composition.layoutOccurrences).toEqual(source.composition.layoutOccurrences)
    expect(inserted.record.composition.markers).toEqual(source.composition.markers)

    for (const fidelity of ['fast', 'fidelity'] as const) compiledFrames(inserted.record, fidelity)

    const resized = editShowTransitionV2(reopen(inserted.record), { kind: 'resize-transition', transitionId: 'whole', durationMs: 300 })
    expect(resized).toMatchObject({
      status: 'changed', affectedClipIds: ['in', 'in-overlay', 'tail'], affectedTransitionIds: ['next', 'whole'],
    })
    if (resized.status !== 'changed') return
    expect(resized.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([
      ['out', 0], ['in', 700], ['out-overlay', 0], ['in-overlay', 700], ['tail', 1_200],
    ])
    for (const fidelity of ['fast', 'fidelity'] as const) compiledFrames(resized.record, fidelity)

    const moved = editShowTransitionV2(reopen(resized.record), { kind: 'move-connected', clipId: 'in', startMs: 800 })
    expect(moved).toMatchObject({
      status: 'changed', affectedClipIds: ['in', 'in-overlay', 'out', 'out-overlay', 'tail'], affectedTransitionIds: ['next', 'whole'],
    })
    if (moved.status !== 'changed') return
    expect(moved.record.composition.transitions.find(transition => transition.id === 'whole')?.wholeOutput?.startMs).toBe(500)
    for (const fidelity of ['fast', 'fidelity'] as const) compiledFrames(moved.record, fidelity)

    const reset = editShowTransitionV2(reopen(moved.record), { kind: 'reset-to-cut', transitionId: 'whole' })
    expect(reset).toMatchObject({
      status: 'changed', affectedClipIds: ['in', 'in-overlay', 'tail'], removedIds: ['whole'],
    })
    if (reset.status !== 'changed') return
    expect(reset.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([
      ['out', 100], ['in', 500], ['out-overlay', 100], ['in-overlay', 500], ['tail', 1_000],
    ])
    expect(reset.record.composition.transitions.find(transition => transition.id === 'next')?.wholeOutput?.startMs).toBe(900)
    expect(reset.record.composition.layoutOccurrences).toEqual(source.composition.layoutOccurrences)
    expect(reset.record.composition.markers).toEqual(source.composition.markers)
    for (const fidelity of ['fast', 'fidelity'] as const) compiledFrames(reset.record, fidelity)
  })

  it('keeps instance animation global when a materialized Group Clip shares the moved Clip instance', () => {
    const source = cutShow()
    const incoming = source.composition.clips.find(clip => clip.id === 'in')!
    const sharedInstance = source.composition.patternInstances.find(instance => instance.id === incoming.instanceId)!
    const overlayLayer = source.composition.layers.find(layer => layer.rank === 1)!
    const { zoneId: _zoneId, ...groupClip } = structuredClone(incoming)
    source.composition.groupDefinitions = [{
      id: 'group-definition', name: 'Shared runtime Group',
      patternInstances: [{ ...structuredClone(sharedInstance), id: 'group-slot' }],
      layers: [{ id: 'group-layer', name: 'Main', rank: 0 }],
      clips: [{
        ...groupClip, id: 'group-clip', instanceId: 'group-slot', layerId: 'group-layer',
        startMs: 0, durationMs: 100,
        appearance: { keys: [{ ...groupClip.appearance.keys[0], id: 'group-appearance', timeMs: 0 }] },
      }],
      transitions: [], propertyTracks: [],
    }]
    source.composition.groupOccurrences = [{
      id: 'group-use', definitionId: 'group-definition', layoutOccurrenceId: source.composition.layoutOccurrences[0].id,
      zoneId: 'zone', startMs: 800, translationX: 0, translationY: 0,
      instanceBindings: { 'group-slot': incoming.instanceId },
      layerBindings: [{ definitionLayerId: 'group-layer', layerId: overlayLayer.id }],
    }]
    source.composition.propertyTracks = [{
      id: 'shared-instance-track', target: { kind: 'instance-time-scale', instanceId: incoming.instanceId },
      activeStartMs: 400, activeDurationMs: 400,
      keyframes: [
        { id: 'shared-start', timeMs: 400, value: 1, easing: { curve: 'linear' } },
        { id: 'shared-end', timeMs: 800, value: 0.5, easing: { curve: 'linear' } },
      ],
    }]
    expect(validateShowRecordV2(source)).toEqual([])
    const before = structuredClone(source)

    const result = editShowTransitionV2(source, {
      kind: 'insert',
      transition: {
        id: 'transition', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' },
        crossfadePolicy: 'live-live', propertyRamps: [],
        participants: [{
          id: 'participant', zoneId: 'zone', layerId: 'layer:zone:main', fromClipId: 'out', toClipId: 'in',
        }],
      },
    })

    expect(result).toMatchObject({ status: 'changed', affectedClipIds: ['in'], affectedTrackIds: [] })
    if (result.status !== 'changed') return
    expect(result.record.composition.propertyTracks[0]).toEqual(source.composition.propertyTracks[0])
    expect(result.record.composition.groupDefinitions).toEqual(source.composition.groupDefinitions)
    expect(result.record.composition.groupOccurrences).toEqual(source.composition.groupOccurrences)
    expect(source).toEqual(before)
  })

  it('refuses collision and unavailable-Zone cascades atomically', () => {
    const transition: ShowTransitionV2 = {
      id: 'transition', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' },
      crossfadePolicy: 'snapshot-live', propertyRamps: [],
      participants: [{ id: 'participant', zoneId: 'zone', layerId: 'layer:zone:main', fromClipId: 'out', toClipId: 'in' }],
    }
    const collision = cutShow()
    const incoming = collision.composition.clips.find(clip => clip.id === 'in')!
    collision.composition.clips.push({
      ...structuredClone(incoming), id: 'blocker', startMs: 900, durationMs: 100,
      appearance: { keys: [{ ...structuredClone(incoming.appearance.keys[0]), id: 'blocker:appearance:1', timeMs: 900 }] },
    })
    const collisionBefore = structuredClone(collision)
    const collisionResult = editShowTransitionV2(collision, { kind: 'insert', transition })
    expect(collisionResult).toMatchObject({
      status: 'refused', code: 'invalid-result', affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [], removedIds: [],
    })
    expect(collisionResult.record).toBe(collision)
    expect(collision).toEqual(collisionBefore)

    const unavailable = cutShow()
    const shortIncoming = unavailable.composition.clips.find(clip => clip.id === 'in')!
    shortIncoming.durationMs = 50
    unavailable.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 16 })
    unavailable.zoneLayouts.push({ id: 'other-layout', name: 'Other', zones: [], logical: { kind: 'single', zoneIds: ['other'] } })
    unavailable.composition.layoutOccurrences = [
      { id: 'available', layoutId: 'layout', startMs: 0, durationMs: 500, parameters: {} },
      { id: 'unavailable', layoutId: 'other-layout', startMs: 500, durationMs: 500, parameters: {} },
    ]
    expect(validateShowRecordV2(unavailable)).toEqual([])
    const unavailableBefore = structuredClone(unavailable)
    const unavailableResult = editShowTransitionV2(unavailable, { kind: 'insert', transition: { ...transition, durationMs: 100 } })
    expect(unavailableResult).toMatchObject({ status: 'refused', code: 'unsupported-layout' })
    expect(unavailableResult.record).toBe(unavailable)
    expect(unavailable).toEqual(unavailableBefore)
  })

  it('refuses a whole-output insert that makes a stationary outgoing contributor unavailable', () => {
    const source = cutShow()
    const incoming = source.composition.clips.find(clip => clip.id === 'in')!
    source.zones.push({ id: 'zone-b', name: 'Second', nominalPixelCount: 16 })
    source.zoneLayouts.push({
      id: 'layout-b', name: 'Second only', zones: [], logical: { kind: 'single', zoneIds: ['zone-b'] },
    })
    source.composition.layers.push({ id: 'layer:zone-b:main', zoneId: 'zone-b', name: 'Main', rank: 0 })
    incoming.zoneId = 'zone-b'
    incoming.layerId = 'layer:zone-b:main'
    source.composition.layoutOccurrences = [
      { id: 'layout-a', layoutId: 'layout', startMs: 0, durationMs: 400, parameters: {} },
      { id: 'layout-b', layoutId: 'layout-b', startMs: 400, durationMs: 600, parameters: {} },
    ]
    expect(validateShowRecordV2(source)).toEqual([])
    const before = structuredClone(source)

    const result = editShowTransitionV2(source, {
      kind: 'insert',
      transition: {
        id: 'whole', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' },
        crossfadePolicy: 'live-live', propertyRamps: [], participants: [],
        wholeOutput: { startMs: 400, fromClipIds: ['out'], toClipIds: ['in'] },
      },
    })

    expect(result).toMatchObject({
      status: 'refused', code: 'unsupported-layout',
      message: expect.stringContaining('Clip "out"'),
      affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [], removedIds: [],
    })
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })

  it.each([
    ['duration edit', (record: ShowRecordV2) => editShowTransitionV2(record, {
      kind: 'resize-transition', transitionId: 'whole', durationMs: 200,
    })],
    ['leading Clip resize', (record: ShowRecordV2) => editShowTransitionV2(record, {
      kind: 'resize-leading', clipId: 'in', startMs: 600,
    })],
  ])('refuses a %s that extends a stationary outgoing contribution past Zone availability', (_name, edit) => {
    const source = crossZoneWholeOutputShow()
    const before = structuredClone(source)

    const result = edit(source)

    expect(result).toMatchObject({
      status: 'refused', code: 'unsupported-layout', message: expect.stringContaining('Clip "out"'),
    })
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })

  it('classifies RL08-RL10 compiler restrictions without mutating the candidate', () => {
    const fadeSource = convertedTransitionShow()
    const overlayLayerId = fadeSource.composition.layers.find(layer => layer.rank === 1)!.id
    const outgoing = fadeSource.composition.clips.find(clip => clip.id === 'out')!
    fadeSource.composition.clips.push({
      ...structuredClone(outgoing), id: 'spanning', layerId: overlayLayerId, durationMs: 1_000,
      appearance: { keys: [{ ...structuredClone(outgoing.appearance.keys[0]), id: 'spanning:appearance:1' }] },
    })
    const current = fadeSource.composition.transitions[0]
    const { crossfadePolicy: _crossfadePolicy, ...base } = current
    const fadeBefore = structuredClone(fadeSource)
    const fade = editShowTransitionV2(fadeSource, {
      kind: 'update-transition', transition: { ...base, kind: 'fade-color', color: '#204060' },
    })
    expect(fade).toMatchObject({ status: 'refused', code: 'compiler-ineligible', message: expect.stringContaining('RL08') })
    expect(fade.record).toBe(fadeSource)
    expect(fadeSource).toEqual(fadeBefore)

    const edgeSource = cutShow()
    const edgeIncoming = edgeSource.composition.clips.find(clip => clip.id === 'in')!
    edgeSource.composition.clips.push({
      ...structuredClone(edgeIncoming), id: 'edge', layerId: overlayLayerId, startMs: 500, durationMs: 100,
      appearance: { keys: [{ ...structuredClone(edgeIncoming.appearance.keys[0]), id: 'edge:appearance:1', timeMs: 500 }] },
    })
    const edgeBefore = structuredClone(edgeSource)
    const edge = editShowTransitionV2(edgeSource, {
      kind: 'insert',
      transition: {
        id: 'edge-transition', kind: 'wipe', durationMs: 200, easing: { curve: 'linear' }, wipeVariant: 'linear',
        participants: [{ id: 'edge-participant', zoneId: 'zone', layerId: 'layer:zone:main', fromClipId: 'out', toClipId: 'in' }],
        propertyRamps: [],
      },
    })
    expect(edge).toMatchObject({ status: 'refused', code: 'compiler-ineligible', message: expect.stringContaining('RL09') })
    expect(edge.record).toBe(edgeSource)
    expect(edgeSource).toEqual(edgeBefore)

    const overlapSource = cutShow()
    overlapSource.zones.push({ id: 'zone-b', name: 'Second', nominalPixelCount: 16 })
    overlapSource.zoneLayouts[0].logical = { kind: 'split', zoneIds: ['zone', 'zone-b'], axis: 'x' }
    overlapSource.composition.layers.push({ id: 'layer:zone-b:main', zoneId: 'zone-b', name: 'Main', rank: 0 })
    overlapSource.composition.clips.push(
      { ...structuredClone(outgoing), id: 'out-b', zoneId: 'zone-b', layerId: 'layer:zone-b:main' },
      {
        ...structuredClone(edgeIncoming), id: 'in-b', zoneId: 'zone-b', layerId: 'layer:zone-b:main', startMs: 400,
        appearance: { keys: [{ ...structuredClone(edgeIncoming.appearance.keys[0]), id: 'in-b:appearance:1', timeMs: 400 }] },
      },
    )
    const participant = (zoneId: string, layerId: string, fromClipId: string, toClipId: string) => ({
      id: `participant-${zoneId}`, zoneId, layerId, fromClipId, toClipId,
    })
    const first = editShowTransitionV2(overlapSource, {
      kind: 'insert', transition: {
        id: 'first', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
        participants: [participant('zone', 'layer:zone:main', 'out', 'in')], propertyRamps: [],
      },
    })
    expect(first.status).toBe('changed')
    if (first.status !== 'changed') return
    const overlapBefore = structuredClone(first.record)
    const overlapping = editShowTransitionV2(first.record, {
      kind: 'insert', transition: {
        id: 'second', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
        participants: [participant('zone-b', 'layer:zone-b:main', 'out-b', 'in-b')], propertyRamps: [],
      },
    })
    expect(overlapping).toMatchObject({ status: 'refused', code: 'compiler-ineligible', message: expect.stringContaining('RL10') })
    expect(overlapping.record).toBe(first.record)
    expect(first.record).toEqual(overlapBefore)
  })

  it('updates settings and applies connected trailing and leading Clip resize rules', () => {
    const source = convertedTransitionShow()
    source.composition.showEndMs = 1_200
    source.composition.layoutOccurrences[0].durationMs = 1_200
    const current = source.composition.transitions[0]
    const { crossfadePolicy: _crossfadePolicy, ...withoutCrossfade } = current
    const updated = editShowTransitionV2(source, {
      kind: 'update-transition',
      transition: { ...withoutCrossfade, kind: 'fade-color', color: '#204060' },
    })
    expect(updated).toMatchObject({ status: 'changed', affectedClipIds: [], affectedTransitionIds: ['transition-crossfade'] })
    if (updated.status !== 'changed') return
    expect(updated.record.composition.transitions[0]).toMatchObject({
      id: 'transition-crossfade', kind: 'fade-color', color: '#204060', durationMs: 200,
    })

    const trailing = editShowTransitionV2(source, { kind: 'resize-trailing', clipId: 'out', endMs: 450 })
    expect(trailing).toMatchObject({ status: 'changed', affectedClipIds: ['in', 'out'], affectedTransitionIds: ['transition-crossfade'] })
    if (trailing.status !== 'changed') return
    expect(trailing.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['out', 0, 450], ['in', 650, 400],
    ])

    const leading = editShowTransitionV2(source, { kind: 'resize-leading', clipId: 'in', startMs: 650 })
    expect(leading).toMatchObject({ status: 'changed', affectedClipIds: ['in'], affectedTransitionIds: ['transition-crossfade'] })
    if (leading.status !== 'changed') return
    expect(leading.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['out', 0, 400], ['in', 650, 350],
    ])
    expect(leading.record.composition.transitions[0].durationMs).toBe(250)

    const reset = editShowTransitionV2(source, { kind: 'resize-leading', clipId: 'in', startMs: 400 })
    expect(reset).toMatchObject({ status: 'changed', removedIds: ['transition-crossfade'] })
    if (reset.status !== 'changed') return
    expect(reset.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['out', 0, 400], ['in', 400, 400],
    ])
  })
})
