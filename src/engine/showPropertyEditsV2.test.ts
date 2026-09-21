import { describe, expect, it } from 'vitest'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { validateShowRecordV2, serializeProvisionalShowRecordV2, parseProvisionalShowRecordV2, type ShowRecordV2, type ShowPropertyTrackV2 } from './showCompositionV2'
import { editShowPropertyV2 } from './showPropertyEditsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { LIBRARIES } from '../pixelblaze/libs'
function record(): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(convertibleV1Show())
  if (result.status !== 'converted') throw Error('Fixture conversion')
  return result.record
}
function track(): ShowPropertyTrackV2 {
  return { id: 'brightness', target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'left', timeMs: 0, value: 0.2, easing: { curve: 'linear' } }, { id: 'right', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] }
}
function reopen(value: ShowRecordV2): ShowRecordV2 {
  const result = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(value))
  if (result.status !== 'opened') throw Error(JSON.stringify(result.issues))
  return result.record
}
describe('native persisted Property CRUD', () => {
  it('adds a complete track without changing runtime payload or aliasing caller/input', () => {
    const input = record(); const before = structuredClone(input); const payload = track()
    const result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'add-track', track: payload })
    expect(result.status).toBe('changed'); expect(validateShowRecordV2(result.record)).toEqual([])
    expect(reopen(result.record).composition.propertyTracks).toEqual([payload])
    expect(result.record.composition.patternInstances).toEqual(before.composition.patternInstances)
    expect(result.affectedTrackIds).toEqual(['brightness']); expect(result.affectedClipIds).toEqual(['clip'])
    expect(result.affectedPropertyKeyIds).toEqual(['left', 'right'])
    result.record.composition.propertyTracks[0].keyframes[0].value = 0.9
    expect(payload).toEqual(track()); expect(input).toEqual(before)
  })
  it('reauthors only endpoint-adjacent kernels, including an explicitly equal value', () => {
    const input = record(); const authored = track()
    authored.keyframes = [
      { id: 'a', timeMs: 0, value: 0.2, easing: { curve: 'linear' }, curveSegment: { baseValue: 0, deltaValue: 1, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 1000, elapsedOffsetMs: 100 } },
      { id: 'b', timeMs: 300, value: 0.4, easing: { curve: 'linear' }, curveSegment: { baseValue: 0, deltaValue: 1, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 1000, elapsedOffsetMs: 400 } },
      { id: 'c', timeMs: 600, value: 0.7, easing: { curve: 'linear' }, curveSegment: { baseValue: 0, deltaValue: 1, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 1000, elapsedOffsetMs: 700 } },
      { id: 'd', timeMs: 900, value: 1, easing: { curve: 'linear' } },
    ]
    input.composition.propertyTracks = [authored]
    const result = editShowPropertyV2(input, { kind: 'show' }, { kind: 'update-key', trackId: authored.id, keyId: 'b', patch: { value: 0.4 } })
    expect(result.status).toBe('changed')
    const keys = reopen(result.record).composition.propertyTracks[0].keyframes
    expect(keys[0]).not.toHaveProperty('curveSegment'); expect(keys[1]).not.toHaveProperty('curveSegment')
    expect(keys[2]).toEqual(authored.keyframes[2]); expect(input.composition.propertyTracks[0]).toEqual(authored)
    expect(result.affectedPropertyKeyIds).toEqual(['a', 'b'])
    const again = editShowPropertyV2(result.record, { kind: 'show' }, { kind: 'update-key', trackId: authored.id, keyId: 'b', patch: { value: 0.4 } })
    expect(again.status).toBe('unchanged'); expect(again.record).toBe(result.record)
  })

})
describe('converted boundary promotion on section-scoped Property tracks (#1068)', () => {
  const boundaryLookup = { byCellId: {}, byPatternInstanceId: {
    'out-instance': 'export var calls=0; export var elapsed=0; export function beforeRender(delta) { calls++; elapsed+=delta/1000 } export function render2D(index,x,y) { rgb(1,x,y) }',
    'in-instance': 'export var calls=0; export var elapsed=0; export function beforeRender(delta) { calls++; elapsed+=delta/1000 } export function render2D(index,x,y) { rgb(x,y,1) }',
  }, stageDimension: 2 as const }
  function twoSceneV1(withTrack: boolean) {
    const show = transitionV1Show('crossfade')
    const composition = show.composition!
    const [out, incoming] = composition.scenes[0].zones[0].main
    out.durationMs = 30000
    const inn = { ...incoming, startMs: 0, durationMs: 2000 }
    show.scenes = [
      { id: 'scene-a', name: 'Scene 1', durationMs: 30000 },
      { id: 'scene-b', name: 'Scene 2', durationMs: 2000 },
    ]
    composition.scenes = [
      { sceneId: 'scene-a', zones: [{ zoneId: 'zone', main: [out], overlays: [] }] },
      { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: [inn], overlays: [] }] },
    ]
    const { fromPlacementId: _from, toPlacementId: _to, ...settings } = composition.transitions![0]
    show.transitions = [{ ...settings, durationMs: 2000, afterSceneId: 'scene-a' }]
    delete composition.transitions
    composition.durationMs = 34000
    if (withTrack) {
      composition.scenes[0].propertyTracks = [{
        id: 'brightness-1',
        target: { kind: 'placement-view', placementId: 'out', property: 'brightness' },
        keyframes: [
          { id: 'k0', timeMs: 0, value: 1, easing: { curve: 'linear' } },
          { id: 'k1', timeMs: 30000, value: 0.5, easing: { curve: 'linear' } },
        ],
      }]
    }
    return show
  }
  function convertedTwoScene(withTrack: boolean): ShowRecordV2 {
    const result = convertShowRecordV1ToV2(twoSceneV1(withTrack))
    expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
    if (result.status !== 'converted') throw new Error('Fixture conversion refused')
    return result.record
  }
  function sectionTrack(id: string, clipId: string, activeStartMs: number, activeDurationMs: number, endKeyTimeMs: number): ShowPropertyTrackV2 {
    return {
      id, target: { kind: 'clip-view', clipId, property: 'brightness' },
      activeStartMs, activeDurationMs,
      keyframes: [
        { id: `${id}-k0`, timeMs: activeStartMs, value: 1, easing: { curve: 'linear' } },
        { id: `${id}-k1`, timeMs: endKeyTimeMs, value: 0.5, easing: { curve: 'linear' } },
      ],
    }
  }
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, canonical(item)]))
    }
    return value
  }
  function parityTrack(track: ShowPropertyTrackV2): unknown {
    return canonical({
      target: track.target,
      activeStartMs: track.activeStartMs,
      activeDurationMs: track.activeDurationMs,
      keyframes: track.keyframes.map(key => Object.fromEntries(Object.entries(key).filter(([name]) => name !== 'id'))),
    })
  }
  function paritySignature(record: ShowRecordV2): string {
    return JSON.stringify({
      transitions: canonical(record.composition.transitions),
      clips: canonical(record.composition.clips),
      tracks: record.composition.propertyTracks.map(parityTrack),
      showEndMs: record.composition.showEndMs,
    })
  }
  function withSecondLayerTransition(record: ShowRecordV2): ShowRecordV2 {
    const next = structuredClone(record)
    const [boundary] = next.composition.transitions
    next.composition.layers.push({ id: 'second-layer', zoneId: 'zone', name: 'Second', rank: 1 })
    const out = next.composition.clips.find(clip => clip.id === 'out')!
    const incoming = next.composition.clips.find(clip => clip.id === 'in')!
    const first = structuredClone(out)
    first.id = 'second-a'
    first.layerId = 'second-layer'
    first.startMs = 0
    first.durationMs = 10000
    first.appearance.keys = out.appearance.keys.map((key, index) => ({ ...structuredClone(key), id: `second-a:appearance:${index}`, timeMs: 0 }))
    const second = structuredClone(incoming)
    second.id = 'second-b'
    second.layerId = 'second-layer'
    second.startMs = 12000
    second.durationMs = 22000
    second.appearance.keys = incoming.appearance.keys.map((key, index) => ({ ...structuredClone(key), id: `second-b:appearance:${index}`, timeMs: 12000 }))
    next.composition.clips.push(first, second)
    next.composition.transitions.push({
      ...structuredClone(boundary),
      id: 'layer-transition',
      origin: 'converted-layer-transition',
      participants: [{ id: 'layer-transition:participant:1', zoneId: 'zone', layerId: 'second-layer', fromClipId: 'second-a', toClipId: 'second-b' }],
    })
    return next
  }
  function withOverlaySpanningWindow(record: ShowRecordV2): ShowRecordV2 {
    const next = structuredClone(record)
    next.composition.layers.push({ id: 'overlay-layer', zoneId: 'zone', name: 'Overlay', rank: 1 })
    const overlay = structuredClone(next.composition.clips[1])
    overlay.id = 'overlay-clip'
    overlay.layerId = 'overlay-layer'
    overlay.startMs = 29000
    overlay.durationMs = 4000
    overlay.appearance.keys.forEach((key, index) => {
      key.id = `overlay-key-${index}`
      if (index === 0) key.timeMs = 29000
    })
    next.composition.clips.push(overlay)
    return next
  }
  it('P1 promotes the participant boundary to whole-output when the first section-scoped track lands', () => {
    const recordA = convertedTwoScene(false)
    const firstClipId = recordA.composition.clips[0].id
    const result = editShowPropertyV2(recordA, { kind: 'show' }, { kind: 'add-track', track: sectionTrack('p1-track', firstClipId, 0, 32000, 30000) })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(validateShowRecordV2(result.record)).toEqual([])
    const [transition] = result.record.composition.transitions
    expect(transition.participants).toEqual([])
    expect(transition.wholeOutput).toEqual({ startMs: 30000, fromClipIds: ['out'], toClipIds: ['in'] })
    expect(result.affectedTransitionIds).toEqual([transition.id])
    const prepared = prepareShowV2ForCompile(result.record, boundaryLookup)
    expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues[0] : '')).toBe('ready')
  })
  it('P2 promoted result deep-equals the converter output for the same v1 Show carrying the track', () => {
    const recordA = convertedTwoScene(false)
    const firstClipId = recordA.composition.clips[0].id
    const promoted = editShowPropertyV2(recordA, { kind: 'show' }, { kind: 'add-track', track: sectionTrack('p1-track', firstClipId, 0, 32000, 30000) })
    expect(promoted.status).toBe('changed')
    if (promoted.status !== 'changed') return
    expect(paritySignature(promoted.record)).toBe(paritySignature(convertedTwoScene(true)))
  })
  it('P3 promoted and converter-direct records compile to identical artifacts', () => {
    const recordA = convertedTwoScene(false)
    const firstClipId = recordA.composition.clips[0].id
    const promoted = editShowPropertyV2(recordA, { kind: 'show' }, { kind: 'add-track', track: sectionTrack('p1-track', firstClipId, 0, 32000, 30000) })
    expect(promoted.status).toBe('changed')
    if (promoted.status !== 'changed') return
    const preparedPromoted = prepareShowV2ForCompile(promoted.record, boundaryLookup)
    expect(preparedPromoted.status).toBe('ready')
    if (preparedPromoted.status !== 'ready') return
    const preparedDirect = prepareShowV2ForCompile(convertedTwoScene(true), boundaryLookup)
    expect(preparedDirect.status).toBe('ready')
    if (preparedDirect.status !== 'ready') return
    const artifactPromoted = compileShow(preparedPromoted.recipe, LIBRARIES)
    const artifactDirect = compileShow(preparedDirect.recipe, LIBRARIES)
    expect(artifactPromoted.code).toBe(artifactDirect.code)
    expect(artifactPromoted.fxCode ?? '').toBe(artifactDirect.fxCode ?? '')
    expect(artifactPromoted.metadata).toEqual(artifactDirect.metadata)
  })
  it('P4 a track that avoids the window leaves Transitions alone and prepares ready', () => {
    const recordA = convertedTwoScene(false)
    const firstClipId = recordA.composition.clips[0].id
    const before = structuredClone(recordA.composition.transitions)
    const result = editShowPropertyV2(recordA, { kind: 'show' }, { kind: 'add-track', track: sectionTrack('p4-track', firstClipId, 0, 15000, 15000) })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.transitions).toEqual(before)
    expect(result.record.composition.transitions[0].wholeOutput).toBeUndefined()
    expect(result.affectedTransitionIds).toEqual([])
    const prepared = prepareShowV2ForCompile(result.record, boundaryLookup)
    expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues[0] : '')).toBe('ready')
  })
  it('P5 a layer transition blocks promotion for the whole record', () => {
    const layered = withSecondLayerTransition(convertedTwoScene(false))
    expect(validateShowRecordV2(layered)).toEqual([])
    const preparedBase = prepareShowV2ForCompile(layered, boundaryLookup)
    expect(preparedBase.status, JSON.stringify(preparedBase.status === 'refused' ? preparedBase.issues[0] : '')).toBe('ready')
    const before = structuredClone(layered.composition.transitions)
    const firstClipId = layered.composition.clips[0].id
    const result = editShowPropertyV2(layered, { kind: 'show' }, { kind: 'add-track', track: sectionTrack('p5-track', firstClipId, 0, 32000, 30000) })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.transitions).toEqual(before)
    expect(result.record.composition.transitions[0].wholeOutput).toBeUndefined()
    expect(result.affectedTransitionIds).toEqual([])
    const prepared = prepareShowV2ForCompile(result.record, boundaryLookup)
    expect(prepared.status).toBe('refused')
    if (prepared.status !== 'refused') return
    expect(prepared.issues[0].code).toBe('unsupported-transition-property-track')
  })
  it('P6 a second section-scoped track changes nothing about the Transitions', () => {
    const recordA = convertedTwoScene(false)
    const [outClip, inClip] = recordA.composition.clips
    const first = editShowPropertyV2(recordA, { kind: 'show' }, { kind: 'add-track', track: sectionTrack('p1-track', outClip.id, 0, 32000, 30000) })
    expect(first.status).toBe('changed')
    if (first.status !== 'changed') return
    const before = structuredClone(first.record.composition.transitions)
    const second = editShowPropertyV2(first.record, { kind: 'show' }, { kind: 'add-track', track: sectionTrack('p6-track', inClip.id, 32000, 2000, 34000) })
    expect(second.status).toBe('changed')
    if (second.status !== 'changed') return
    expect(second.record.composition.transitions).toEqual(before)
    expect(second.affectedTransitionIds).toEqual([])
    // The incoming-Clip activation crosses a derived Clip/appearance section,
    // so preparation refuses it. The same track on the converter-direct
    // whole-output record refuses identically: a pre-existing cross-section
    // limitation, independent of promotion.
    const prepared = prepareShowV2ForCompile(second.record, boundaryLookup)
    expect(prepared.status).toBe('refused')
    if (prepared.status !== 'refused') return
    expect(prepared.issues[0].code).toBe('unsupported-track-activation')
    expect(prepared.issues[0].path).toBe('composition.propertyTracks[1]')
  })
  it('P7 removing the track keeps whole-output scope and identical compiled bytes', () => {
    const recordA = convertedTwoScene(false)
    const firstClipId = recordA.composition.clips[0].id
    const added = editShowPropertyV2(recordA, { kind: 'show' }, { kind: 'add-track', track: sectionTrack('p1-track', firstClipId, 0, 32000, 30000) })
    expect(added.status).toBe('changed')
    if (added.status !== 'changed') return
    const removed = editShowPropertyV2(added.record, { kind: 'show' }, { kind: 'remove-track', trackId: 'p1-track' })
    expect(removed.status).toBe('changed')
    if (removed.status !== 'changed') return
    const [transition] = removed.record.composition.transitions
    expect(transition.participants).toEqual([])
    expect(transition.wholeOutput).toEqual({ startMs: 30000, fromClipIds: ['out'], toClipIds: ['in'] })
    const preparedRemoved = prepareShowV2ForCompile(removed.record, boundaryLookup)
    expect(preparedRemoved.status).toBe('ready')
    if (preparedRemoved.status !== 'ready') return
    const preparedA = prepareShowV2ForCompile(recordA, boundaryLookup)
    expect(preparedA.status).toBe('ready')
    if (preparedA.status !== 'ready') return
    const artifactRemoved = compileShow(preparedRemoved.recipe, LIBRARIES)
    const artifactA = compileShow(preparedA.recipe, LIBRARIES)
    expect(artifactRemoved.code).toBe(artifactA.code)
    expect(artifactRemoved.fxCode ?? '').toBe(artifactA.fxCode ?? '')
    expect(artifactRemoved.metadata).toEqual(artifactA.metadata)
  })
  it('P8 a group-definition owner never promotes', () => {
    const recordA = convertedTwoScene(false)
    const withGroup = structuredClone(recordA)
    withGroup.composition.groupDefinitions = structuredClone(propertyEditGroupRecord().composition.groupDefinitions)
    expect(validateShowRecordV2(withGroup)).toEqual([])
    const before = structuredClone(withGroup.composition.transitions)
    const result = editShowPropertyV2(withGroup, { kind: 'group-definition', definitionId: 'definition' }, { kind: 'add-track', track: sectionTrack('group-track', 'child', 0, 400, 400) })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.transitions).toEqual(before)
    expect(result.record.composition.transitions[0].wholeOutput).toBeUndefined()
    expect(result.affectedTransitionIds).toEqual([])
  })
  it('P9 a spanning Clip blocks promotion; an avoiding track still prepares', () => {
    const recordA = convertedTwoScene(false)
    const withOverlay = withOverlaySpanningWindow(recordA)
    expect(validateShowRecordV2(withOverlay)).toEqual([])
    const preparedBase = prepareShowV2ForCompile(withOverlay, boundaryLookup)
    expect(preparedBase.status, JSON.stringify(preparedBase.status === 'refused' ? preparedBase.issues[0] : '')).toBe('ready')
    const firstClipId = withOverlay.composition.clips[0].id
    const blocked = editShowPropertyV2(withOverlay, { kind: 'show' }, { kind: 'add-track', track: sectionTrack('p9-track', firstClipId, 0, 32000, 30000) })
    expect(blocked.status).toBe('changed')
    if (blocked.status !== 'changed') return
    expect(blocked.record.composition.transitions).toEqual(withOverlay.composition.transitions)
    expect(blocked.record.composition.transitions[0].wholeOutput).toBeUndefined()
    expect(blocked.affectedTransitionIds).toEqual([])
    const preparedBlocked = prepareShowV2ForCompile(blocked.record, boundaryLookup)
    expect(preparedBlocked.status).toBe('refused')
    if (preparedBlocked.status !== 'refused') return
    expect(preparedBlocked.issues[0].code).toBe('unsupported-transition-property-track')
    const avoiding = editShowPropertyV2(withOverlay, { kind: 'show' }, { kind: 'add-track', track: sectionTrack('p9-avoid-track', firstClipId, 0, 15000, 15000) })
    expect(avoiding.status).toBe('changed')
    if (avoiding.status !== 'changed') return
    expect(avoiding.record.composition.transitions).toEqual(withOverlay.composition.transitions)
    expect(avoiding.affectedTransitionIds).toEqual([])
    const preparedAvoiding = prepareShowV2ForCompile(avoiding.record, boundaryLookup)
    expect(preparedAvoiding.status, JSON.stringify(preparedAvoiding.status === 'refused' ? preparedAvoiding.issues[0] : '')).toBe('ready')
  })
  it('P10 malformed add-track on the participant record refuses invalid-result without throwing', () => {
    const recordA = convertedTwoScene(false)
    const result = editShowPropertyV2(recordA, { kind: 'show' }, { kind: 'add-track', track: { id: 'bad' } as never })
    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.code).toBe('invalid-result')
    expect(result.record).toBe(recordA)
  })
})
