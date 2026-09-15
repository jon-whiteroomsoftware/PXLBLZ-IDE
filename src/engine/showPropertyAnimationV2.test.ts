import { describe, expect, it } from 'vitest'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV1Structure, validateShowRecordV2, type ShowPropertyTrackV2, type ShowRecordV2 } from './showCompositionV2'
import { copyShowInstancePropertyTracksV2, deriveShowRestartEventsV2, editShowClipPropertyTracksV2, evaluateShowPropertyTrackV2, findShowInstancePropertyTrackConflictsV2, insertTimeInShowPropertyTracksV2, projectShowTransitionPropertyRampsV2, reauthorShowPropertyKeyframeV2 } from './showPropertyAnimationV2'
import { editShowClipV2 } from './showClipsV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { emitShowPropertyTrackExpression, evaluateShowPropertyTrack } from './showPropertyAnimation'
import { SHOW_EASING_OPTIONS } from './showEasing'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { LIBRARIES } from '../pixelblaze/libs'

function animatedRecord(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Fixture conversion failed')
  const record = converted.record
  record.composition.showEndMs = 2_000
  record.composition.layoutOccurrences[0].durationMs = 2_000
  const clip = record.composition.clips[0]
  clip.startMs = 100
  clip.durationMs = 1_000
  clip.appearance.keys[0].timeMs = 100
  record.composition.propertyTracks = [{
    id: 'brightness',
    target: { kind: 'clip-view', clipId: clip.id, property: 'brightness' },
    activeStartMs: 100,
    activeDurationMs: 1_000,
    keyframes: [
      { id: 'dark', timeMs: 100, value: 0, easing: { curve: 'sine', direction: 'in-out' } },
      { id: 'bright', timeMs: 1_100, value: 1, easing: { curve: 'linear' } },
    ],
  }]
  return record
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

function compiledPropertyRuntime(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const prepared = prepareShowV2ForCompile(reopen(record), {
    byCellId: {},
    byPatternInstanceId: { instance: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
    stageDimension: 2,
  })
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, {
    fidelity,
    randomSeed: 1037,
    mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }],
  })
}

describe('v2 property animation', () => {
  it('evaluates retained source curves only inside the half-open activation interval', () => {
    const track: ShowPropertyTrackV2 = {
      id: 'brightness',
      target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' },
      activeStartMs: 250,
      activeDurationMs: 500,
      keyframes: [
        {
          id: 'retained-start',
          timeMs: 250,
          value: 0.1464466094067262,
          easing: { curve: 'linear' },
          curveSegment: {
            baseValue: 0,
            deltaValue: 1,
            easing: { curve: 'sine', direction: 'in-out' },
            sourceDurationMs: 1_000,
            elapsedOffsetMs: 250,
          },
        },
        { id: 'retained-end', timeMs: 750, value: 0.8535533905932737, easing: { curve: 'linear' } },
      ],
    }

    expect(evaluateShowPropertyTrackV2(track, 249)).toBeUndefined()
    expect(evaluateShowPropertyTrackV2(track, 250)).toBeCloseTo(0.1464466094067262)
    expect(evaluateShowPropertyTrackV2(track, 500)).toBeCloseTo(0.5)
    expect(evaluateShowPropertyTrackV2(track, 749)).toBeCloseTo(0.852441)
    expect(evaluateShowPropertyTrackV2(track, 750)).toBeUndefined()
  })

  it('trim and extend preserve the exact nonlinear source interval without restoring discarded keys', () => {
    const source = animatedRecord()
    const before = structuredClone(source)
    const original = source.composition.propertyTracks[0]
    const trimmed = editShowClipV2(source, { kind: 'trim', clipId: 'clip', startMs: 350, endMs: 850 })

    expect(trimmed.status).toBe('changed')
    if (trimmed.status !== 'changed') return
    const reopened = reopen(trimmed.record)
    const track = reopened.composition.propertyTracks[0]
    expect(track).toMatchObject({
      id: 'brightness', activeStartMs: 350, activeDurationMs: 500,
      keyframes: [{
        timeMs: 350,
        curveSegment: { sourceDurationMs: 1_000, elapsedOffsetMs: 250 },
      }, { timeMs: 850 }],
    })
    for (const atMs of [350, 500, 849]) {
      expect(evaluateShowPropertyTrackV2(track, atMs)).toBeCloseTo(evaluateShowPropertyTrackV2(original, atMs)!)
    }
    expect(source).toEqual(before)

    const extended = editShowClipV2(reopened, { kind: 'extend', clipId: 'clip', startMs: 100, endMs: 1_100 })
    expect(extended.status).toBe('changed')
    if (extended.status !== 'changed') return
    const extendedTrack = reopen(extended.record).composition.propertyTracks[0]
    expect(extendedTrack.keyframes.map(key => key.timeMs)).toEqual([100, 350, 850, 1_100])
    expect(evaluateShowPropertyTrackV2(extendedTrack, 200)).toBeCloseTo(evaluateShowPropertyTrackV2(track, 350)!)
    expect(evaluateShowPropertyTrackV2(extendedTrack, 1_000)).toBeCloseTo(track.keyframes[track.keyframes.length - 1].value)
    expect(extendedTrack.keyframes.some(key => key.id === 'dark' && key.timeMs === 100)).toBe(false)
  })

  it.each(SHOW_EASING_OPTIONS.map(option => [option.id, option.easing] as const))(
    'preserves %s through move, trim, extend, split and reopen',
    (_id, easing) => {
      const source = animatedRecord()
      source.composition.propertyTracks[0].keyframes[0].easing = structuredClone(easing)
      const moved = editShowClipV2(source, { kind: 'move', clipId: 'clip', startMs: 200 })
      if (moved.status !== 'changed') throw new Error('Move failed')
      const movedTrack = moved.record.composition.propertyTracks[0]
      const trimmed = editShowClipV2(moved.record, { kind: 'trim', clipId: 'clip', startMs: 450, endMs: 950 })
      if (trimmed.status !== 'changed') throw new Error('Trim failed')
      const extended = editShowClipV2(trimmed.record, { kind: 'extend', clipId: 'clip', startMs: 200, endMs: 1_200 })
      if (extended.status !== 'changed') throw new Error('Extend failed')
      const split = editShowClipV2(extended.record, { kind: 'split', clipId: 'clip', atMs: 700, rightClipId: 'right' })
      if (split.status !== 'changed') throw new Error('Split failed')
      const reopened = reopen(split.record)
      const tracks = reopened.composition.propertyTracks
        .filter(track => track.target.kind === 'clip-view')
        .sort((left, right) => left.activeStartMs - right.activeStartMs)
      expect(tracks).toHaveLength(2)
      for (const atMs of [200, 449, 450, 451, 699, 700, 701, 949, 950, 951, 1_199]) {
        const actualTrack = atMs < 700 ? tracks[0] : tracks[1]
        const sourceTime = Math.max(450, Math.min(950, atMs))
        expect(evaluateShowPropertyTrackV2(actualTrack, atMs), `${_id} at ${atMs}`)
          .toBeCloseTo(evaluateShowPropertyTrackV2(movedTrack, sourceTime)!, 10)
      }
      expect(reopened.composition.patternInstances).toEqual(source.composition.patternInstances)
    },
  )

  it.each(['fast', 'fidelity'] as const)(
    'emits retained nonlinear curve values through the generated %s runtime',
    fidelity => {
      const source = animatedRecord()
      const original = structuredClone(source.composition.propertyTracks[0])
      const trimmed = editShowClipV2(source, { kind: 'trim', clipId: 'clip', startMs: 350, endMs: 850 })
      if (trimmed.status !== 'changed') throw new Error('Trim failed')
      const runtime = compiledPropertyRuntime(trimmed.record, fidelity)
      const reference = compiledPropertyRuntime(source, fidelity)
      for (const atMs of [349, 350, 351, 500, 849, 850]) {
        const result = runtime.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
        const referenceResult = reference.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
        if (atMs >= 350 && atMs < 850 && !(atMs === 849 && fidelity === 'fidelity')) {
          result.frame.forEach((channel, index) => {
            expect(channel, `${fidelity} source parity at ${atMs}, channel ${index}`)
              .toBeCloseTo(referenceResult.frame[index], 12)
          })
          if (fidelity === 'fast') {
            expect(result.frame[0], `evaluator at ${atMs}`).toBeCloseTo(evaluateShowPropertyTrackV2(original, atMs)!, 8)
          }
        } else if (atMs === 349 && fidelity === 'fidelity') {
          // The 16.16 accumulator crosses this logical boundary early. Compare
          // against the uncut generated source kernel at the measured boundary.
          expect(Array.from(result.frame)).toEqual(Array.from(referenceResult.frame))
        } else expect(Array.from(result.frame)).toEqual([0, 0, 0])
      }
    },
  )

  it('shares retained-curve semantics with generated Show expressions even when stored endpoints are equal', () => {
    const track = {
      id: 'retained', target: { kind: 'instance-time-scale' as const, instanceId: 'instance' },
      keyframes: [
        {
          id: 'left', timeMs: 250, value: 0, easing: { curve: 'linear' as const },
          curveSegment: {
            baseValue: 0, deltaValue: 1, easing: { curve: 'linear' as const },
            sourceDurationMs: 1_000, elapsedOffsetMs: 250,
          },
        },
        { id: 'right', timeMs: 750, value: 0, easing: { curve: 'linear' as const } },
      ],
    }
    const emitted = emitShowPropertyTrackExpression(track, 'atMs')
    const evaluateEmitted = new Function('atMs', `return ${emitted}`) as (atMs: number) => number

    expect(evaluateShowPropertyTrack(track, 500)).toBeCloseTo(0.5)
    expect(evaluateEmitted(500)).toBeCloseTo(0.5)
    expect(evaluateEmitted(750)).toBe(0)
  })

  it('keeps the v1 persistence schema closed to the v2 retained-curve descriptor', () => {
    const source = convertibleV1Show()
    source.composition!.scenes[0].propertyTracks = [{
      id: 'v1-track', target: { kind: 'instance-time-scale', instanceId: 'instance' },
      keyframes: [{
        id: 'left', timeMs: 0, value: 0, easing: { curve: 'linear' },
        curveSegment: {
          baseValue: 0, deltaValue: 1, easing: { curve: 'linear' },
          sourceDurationMs: 1_000, elapsedOffsetMs: 0,
        },
      }, { id: 'right', timeMs: 1_000, value: 1, easing: { curve: 'linear' } }],
    }]

    expect(validateShowRecordV1Structure(source)).toContainEqual(expect.objectContaining({
      code: 'schema', message: expect.stringContaining('additional properties'),
    }))
  })

  it('drops only the retained descriptors adjacent to an explicitly reauthored endpoint', () => {
    const source = animatedRecord()
    const segment = (baseValue: number, deltaValue: number, sourceDurationMs: number) => ({
      baseValue, deltaValue, easing: { curve: 'sine' as const, direction: 'in-out' as const },
      sourceDurationMs, elapsedOffsetMs: 0,
    })
    source.composition.propertyTracks[0].keyframes = [
      { id: 'a', timeMs: 100, value: 0, easing: { curve: 'linear' }, curveSegment: segment(0, 0.25, 300) },
      { id: 'b', timeMs: 400, value: 0.25, easing: { curve: 'linear' }, curveSegment: segment(0.25, 0.25, 300) },
      { id: 'c', timeMs: 700, value: 0.5, easing: { curve: 'linear' }, curveSegment: segment(0.5, 0.5, 400) },
      { id: 'd', timeMs: 1_100, value: 1, easing: { curve: 'linear' } },
    ]
    const before = structuredClone(source)
    const result = reauthorShowPropertyKeyframeV2(source, 'brightness', 'b', { value: 0.4 })

    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.propertyTracks[0].keyframes.map(key => Boolean(key.curveSegment)))
      .toEqual([false, false, true, false])
    expect(result.affectedTrackIds).toEqual(['brightness'])
    expect(source).toEqual(before)

    const refused = reauthorShowPropertyKeyframeV2(source, 'brightness', 'b', { timeMs: 1_200 })
    expect(refused).toMatchObject({ status: 'refused', record: source, affectedTrackIds: [] })
    expect(source).toEqual(before)
  })

  it('splits Clip-owned animation into exact left and right tracks while the instance stays shared', () => {
    const source = animatedRecord()
    const original = source.composition.propertyTracks[0]
    source.composition.propertyTracks.push({
      ...structuredClone(original), id: 'speed',
      target: { kind: 'instance-time-scale', instanceId: 'instance' },
      keyframes: original.keyframes.map(key => ({ ...structuredClone(key), id: `speed:${key.id}` })),
    })
    const before = structuredClone(source)
    const result = editShowClipV2(source, { kind: 'split', clipId: 'clip', atMs: 600, rightClipId: 'right' })

    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const reopened = reopen(result.record)
    const clipTracks = reopened.composition.propertyTracks.filter(track => 'clipId' in track.target)
    expect(clipTracks.map(track => [track.target, track.activeStartMs, track.activeDurationMs])).toEqual([
      [{ kind: 'clip-view', clipId: 'clip', property: 'brightness' }, 100, 500],
      [{ kind: 'clip-view', clipId: 'right', property: 'brightness' }, 600, 500],
    ])
    for (const atMs of [100, 350, 599]) {
      expect(evaluateShowPropertyTrackV2(clipTracks[0], atMs)).toBeCloseTo(evaluateShowPropertyTrackV2(original, atMs)!)
    }
    for (const atMs of [600, 850, 1_099]) {
      expect(evaluateShowPropertyTrackV2(clipTracks[1], atMs)).toBeCloseTo(evaluateShowPropertyTrackV2(original, atMs)!)
    }
    expect(reopened.composition.propertyTracks.find(track => track.id === 'speed')).toEqual(before.composition.propertyTracks[1])
    expect(new Set(clipTracks.flatMap(track => track.keyframes.map(key => key.id))).size)
      .toBe(clipTracks.flatMap(track => track.keyframes).length)
    expect(reopened.composition.clips.map(clip => clip.instanceId)).toEqual(['instance', 'instance'])
    expect(source).toEqual(before)
  })

  it('inserts an exact hold at a discontinuous key and shifts each shared-instance track once', () => {
    const source = animatedRecord()
    const track: ShowPropertyTrackV2 = {
      id: 'stepped-speed', target: { kind: 'instance-time-scale', instanceId: 'instance' },
      activeStartMs: 0, activeDurationMs: 1_000,
      keyframes: [
        { id: 'zero', timeMs: 0, value: 0, easing: { curve: 'steps', steps: 2, position: 'end' } },
        { id: 'jump', timeMs: 500, value: 1, easing: { curve: 'hold', at: 0.5 } },
        { id: 'end', timeMs: 1_000, value: 0, easing: { curve: 'linear' } },
      ],
    }
    source.composition.propertyTracks = [track]
    const before = structuredClone(source)
    const inserted = insertTimeInShowPropertyTracksV2(source, 500, 200)

    expect(inserted.status).toBe('changed')
    if (inserted.status !== 'changed') return
    const next = inserted.propertyTracks[0]
    expect(next.activeDurationMs).toBe(1_200)
    expect(next.keyframes.map(key => [key.id, key.timeMs, key.value])).toEqual([
      ['zero', 0, 0],
      ['stepped-speed:hold:500', 500, 1],
      ['jump', 700, 1],
      ['end', 1_200, 0],
    ])
    for (const atMs of [0, 250, 499]) {
      expect(evaluateShowPropertyTrackV2(next, atMs)).toBe(evaluateShowPropertyTrackV2(track, atMs))
    }
    for (const atMs of [500, 600, 699]) expect(evaluateShowPropertyTrackV2(next, atMs)).toBe(1)
    for (const atMs of [700, 900, 1_199]) {
      expect(evaluateShowPropertyTrackV2(next, atMs)).toBe(evaluateShowPropertyTrackV2(track, atMs - 200))
    }
    expect(inserted.affectedTrackIds).toEqual(['stepped-speed'])
    expect(source).toEqual(before)
  })

  it('maps Insert Time at start, exclusive end and the last active key without stretching a curve', () => {
    const source = animatedRecord()
    const track = source.composition.propertyTracks[0]
    track.activeStartMs = 100
    track.activeDurationMs = 1_000
    track.keyframes = [
      { id: 'start', timeMs: 100, value: 0, easing: { curve: 'quadratic', direction: 'in' } },
      { id: 'last-authored', timeMs: 600, value: 1, easing: { curve: 'linear' } },
    ]

    const atStart = insertTimeInShowPropertyTracksV2(source, 100, 200)
    expect(atStart.status).toBe('changed')
    expect(atStart.propertyTracks[0]).toMatchObject({ activeStartMs: 300, activeDurationMs: 1_000 })
    expect(atStart.propertyTracks[0].keyframes.map(key => key.timeMs)).toEqual([300, 800])

    const atEnd = insertTimeInShowPropertyTracksV2(source, 1_100, 200)
    expect(atEnd).toEqual({ status: 'unchanged', propertyTracks: source.composition.propertyTracks, affectedTrackIds: [] })

    const atLastKey = insertTimeInShowPropertyTracksV2(source, 600, 200)
    expect(atLastKey.status).toBe('changed')
    const inserted = atLastKey.propertyTracks[0]
    expect(inserted.keyframes.map(key => [key.id, key.timeMs, key.value])).toEqual([
      ['start', 100, 0],
      ['brightness:hold:600', 600, 1],
      ['last-authored', 800, 1],
    ])
    for (const atMs of [599, 600, 700, 799, 800, 1_299]) {
      const expected = atMs < 600
        ? evaluateShowPropertyTrackV2(track, atMs)
        : atMs < 800 ? 1 : evaluateShowPropertyTrackV2(track, atMs - 200)
      expect(evaluateShowPropertyTrackV2(inserted, atMs), `last key at ${atMs}`).toBeCloseTo(expected!)
    }
  })

  it('refuses invalid Insert Time atomically', () => {
    const source = animatedRecord()
    const before = structuredClone(source.composition.propertyTracks)
    for (const [atMs, durationMs] of [[-1, 100], [0, 0], [2_001, 100], [500, Number.MAX_SAFE_INTEGER]]) {
      expect(insertTimeInShowPropertyTracksV2(source, atMs, durationMs)).toMatchObject({
        status: 'refused', propertyTracks: source.composition.propertyTracks, affectedTrackIds: [],
      })
      expect(source.composition.propertyTracks).toEqual(before)
    }
  })

  it('derives first-contribution Restart events and coalesces simultaneous resets per shared instance', () => {
    const source = animatedRecord()
    const base = source.composition.clips[0]
    source.composition.layers.push(
      { id: 'overlay-2', zoneId: base.zoneId, name: 'Overlay 2', rank: 2 },
      { id: 'overlay-3', zoneId: base.zoneId, name: 'Overlay 3', rank: 3 },
    )
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'independent' })
    source.composition.clips = [
      { ...structuredClone(base), id: 'visible', entryPolicy: 'continue' },
      { ...structuredClone(base), id: 'incoming-a', layerId: 'overlay-2', startMs: 600, entryPolicy: 'restart', appearance: { keys: [{ ...structuredClone(base.appearance.keys[0]), id: 'incoming-a:key', timeMs: 600 }] } },
      { ...structuredClone(base), id: 'incoming-b', layerId: 'overlay-3', startMs: 600, entryPolicy: 'restart', appearance: { keys: [{ ...structuredClone(base.appearance.keys[0]), id: 'incoming-b:key', timeMs: 600 }] } },
      { ...structuredClone(base), id: 'independent-clip', instanceId: 'independent', startMs: 900, entryPolicy: 'restart', appearance: { keys: [{ ...structuredClone(base.appearance.keys[0]), id: 'independent:key', timeMs: 900 }] } },
    ]
    source.composition.propertyTracks = []
    const before = structuredClone(source)

    const result = deriveShowRestartEventsV2(source, {
      'incoming-a': 400,
      'incoming-b': 400,
    })

    expect(result).toEqual({
      status: 'derived',
      events: [
        { id: 'restart:["instance",400]', instanceId: 'instance', atMs: 400, clipIds: ['incoming-a', 'incoming-b'] },
        { id: 'restart:["independent",900]', instanceId: 'independent', atMs: 900, clipIds: ['independent-clip'] },
      ],
    })
    expect(source).toEqual(before)
  })

  it('materializes Group users for sole-user movement and Restart derivation', () => {
    const source = animatedRecord()
    const base = source.composition.clips[0]
    const { zoneId: _zoneId, ...groupClip } = structuredClone(base)
    groupClip.id = 'child-clip'
    groupClip.instanceId = 'child-instance'
    groupClip.layerId = 'group-layer'
    groupClip.startMs = 0
    groupClip.durationMs = 200
    groupClip.entryPolicy = 'restart'
    groupClip.appearance.keys = [{ ...groupClip.appearance.keys[0], id: 'child:key', timeMs: 0 }]
    source.composition.groupDefinitions = [{
      id: 'definition', name: 'Definition',
      patternInstances: [{ ...structuredClone(source.composition.patternInstances[0]), id: 'child-instance' }],
      layers: [{ id: 'group-layer', name: 'Group Layer', rank: 0 }],
      clips: [groupClip], transitions: [], propertyTracks: [],
    }]
    source.composition.groupOccurrences = [{
      id: 'occurrence', definitionId: 'definition', layoutOccurrenceId: source.composition.layoutOccurrences[0].id,
      zoneId: base.zoneId, startMs: 1_200, translationX: 0, translationY: 0,
      instanceBindings: { 'child-instance': 'instance' },
      layerBindings: [{ definitionLayerId: 'group-layer', layerId: base.layerId }],
    }]
    source.composition.propertyTracks = [{
      id: 'speed', target: { kind: 'instance-time-scale', instanceId: 'instance' },
      activeStartMs: 100, activeDurationMs: 1_000,
      keyframes: [
        { id: 'speed:start', timeMs: 100, value: 1, easing: { curve: 'linear' } },
        { id: 'speed:end', timeMs: 1_100, value: 2, easing: { curve: 'linear' } },
      ],
    }]
    expect(validateShowRecordV2(source)).toEqual([])
    const before = structuredClone(source)

    const movedTracks = editShowClipPropertyTracksV2(source, base, { kind: 'move', startMs: 0 })
    expect(movedTracks).toEqual({ propertyTracks: source.composition.propertyTracks, affectedTrackIds: [] })
    expect(deriveShowRestartEventsV2(source)).toMatchObject({
      status: 'derived',
      events: [{ instanceId: 'instance', atMs: 1_200, clipIds: ['occurrence:child-clip'] }],
    })
    expect(source).toEqual(before)
  })

  it('accepts half-open adjacent instance animation and rejects an overlapping second owner', () => {
    const source = animatedRecord()
    const makeTrack = (id: string, activeStartMs: number): ShowPropertyTrackV2 => ({
      id, target: { kind: 'instance-time-scale', instanceId: 'instance' }, activeStartMs, activeDurationMs: 500,
      keyframes: [
        { id: `${id}:start`, timeMs: activeStartMs, value: 1, easing: { curve: 'linear' } },
        { id: `${id}:end`, timeMs: activeStartMs + 500, value: 2, easing: { curve: 'linear' } },
      ],
    })
    const left = makeTrack('left', 0)
    const right = makeTrack('right', 500)
    source.composition.propertyTracks = [left, right]
    expect(findShowInstancePropertyTrackConflictsV2(source.composition.propertyTracks)).toEqual([])
    source.composition.propertyTracks = [right, left]
    expect(findShowInstancePropertyTrackConflictsV2(source.composition.propertyTracks)).toEqual([])

    source.composition.propertyTracks = [left, right]
    source.composition.propertyTracks[1].activeStartMs = 499
    source.composition.propertyTracks[1].keyframes.forEach(key => { key.timeMs -= 1 })
    expect(findShowInstancePropertyTrackConflictsV2(source.composition.propertyTracks)).toEqual([{
      target: { kind: 'instance-time-scale', instanceId: 'instance' }, trackIds: ['left', 'right'],
    }])
  })

  it('copies eligible instance tracks for independence or replacement and reports discarded controls', () => {
    const source = animatedRecord()
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'replacement' })
    const makeTrack = (id: string, target: ShowPropertyTrackV2['target']): ShowPropertyTrackV2 => ({
      id, target, activeStartMs: 100, activeDurationMs: 1_000,
      keyframes: [
        { id: `${id}:start`, timeMs: 100, value: 0, easing: { curve: 'linear' } },
        { id: `${id}:end`, timeMs: 1_100, value: 1, easing: { curve: 'linear' } },
      ],
    })
    source.composition.propertyTracks = [
      makeTrack('speed', { kind: 'instance-time-scale', instanceId: 'instance' }),
      makeTrack('kept-control', { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderKept' }),
      makeTrack('dropped-control', { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderDropped' }),
    ]
    const before = structuredClone(source)
    const copied = copyShowInstancePropertyTracksV2(source, {
      fromInstanceId: 'instance', toInstanceId: 'replacement', placementDeltaMs: 200,
      compatibleControlExports: ['sliderKept'],
    })

    expect(copied.status).toBe('changed')
    if (copied.status !== 'changed') return
    expect(copied.copiedTrackIds).toEqual(['speed:instance:replacement', 'kept-control:instance:replacement'])
    expect(copied.discardedTargets).toEqual([{ kind: 'instance-control', instanceId: 'instance', exportName: 'sliderDropped' }])
    expect(copied.propertyTracks.slice(-2).map(track => [track.target, track.activeStartMs, track.keyframes.map(key => key.timeMs)])).toEqual([
      [{ kind: 'instance-time-scale', instanceId: 'replacement' }, 300, [300, 1_300]],
      [{ kind: 'instance-control', instanceId: 'replacement', exportName: 'sliderKept' }, 300, [300, 1_300]],
    ])
    expect(source).toEqual(before)
  })

  it('refuses an instance-track copy conflict with the complete preimage unchanged', () => {
    const source = animatedRecord()
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'replacement' })
    const original = source.composition.propertyTracks[0]
    source.composition.propertyTracks = [
      { ...structuredClone(original), id: 'source-speed', target: { kind: 'instance-time-scale', instanceId: 'instance' } },
      { ...structuredClone(original), id: 'destination-speed', target: { kind: 'instance-time-scale', instanceId: 'replacement' } },
    ]
    const before = structuredClone(source)
    const result = copyShowInstancePropertyTracksV2(source, {
      fromInstanceId: 'instance', toInstanceId: 'replacement', placementDeltaMs: 0,
    })

    expect(result).toMatchObject({
      status: 'refused', propertyTracks: source.composition.propertyTracks,
      copiedTrackIds: [], discardedTargets: [], message: expect.stringContaining('destination-speed'),
    })
    expect(source).toEqual(before)
  })

  it('projects a property-only Transition ramp into an independently activated track before carrier reset', () => {
    const source = animatedRecord()
    const base = source.composition.clips[0]
    source.composition.clips = [
      { ...structuredClone(base), id: 'from', startMs: 100, durationMs: 300, appearance: { keys: [{ ...structuredClone(base.appearance.keys[0]), id: 'from:key', timeMs: 100 }] } },
      { ...structuredClone(base), id: 'to', startMs: 600, durationMs: 500, appearance: { keys: [{ ...structuredClone(base.appearance.keys[0]), id: 'to:key', timeMs: 600 }] } },
    ]
    source.composition.propertyTracks = []
    source.composition.transitions = [{
      id: 'carrier', kind: 'crossfade', crossfadePolicy: 'snapshot-live', durationMs: 200, easing: { curve: 'linear' },
      participants: [{ id: 'pair', zoneId: base.zoneId, layerId: base.layerId, fromClipId: 'from', toClipId: 'to' }],
      propertyRamps: [{ participantId: 'pair', target: { kind: 'clip-opacity', clipId: 'to' }, from: 0, easing: { curve: 'quadratic', direction: 'in' } }],
    }]
    const before = structuredClone(source)

    const result = projectShowTransitionPropertyRampsV2(source, 'carrier', [{
      rampIndex: 0, trackId: 'opacity-track', startKeyId: 'opacity-start', endKeyId: 'opacity-end',
      activeEndMs: 1_100, toValue: 1,
    }])

    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const reopened = reopen(result.record)
    expect(reopened.composition.transitions[0].propertyRamps).toEqual([])
    expect(reopened.composition.propertyTracks).toEqual([{
      id: 'opacity-track', target: { kind: 'clip-opacity', clipId: 'to' }, activeStartMs: 400, activeDurationMs: 700,
      keyframes: [
        { id: 'opacity-start', timeMs: 400, value: 0, easing: { curve: 'quadratic', direction: 'in' } },
        { id: 'opacity-end', timeMs: 600, value: 1, easing: { curve: 'linear' } },
      ],
    }])
    expect(evaluateShowPropertyTrackV2(reopened.composition.propertyTracks[0], 500)).toBeCloseTo(0.25)
    expect(evaluateShowPropertyTrackV2(reopened.composition.propertyTracks[0], 900)).toBe(1)
    expect(source).toEqual(before)
  })
})
