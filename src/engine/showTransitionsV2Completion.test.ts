import { describe, expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { deriveShowRestartEventsV2 } from './showPropertyAnimationV2'
import { editShowTransitionV2, projectShowTransitionJunctionsV2 } from './showTransitionsV2'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
  type ShowTransitionV2,
} from './showCompositionV2'

function converted(): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (result.status !== 'converted') throw new Error(JSON.stringify(result.issues))
  return result.record
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

function cutShow(gapMs = 0): ShowRecordV2 {
  const record = converted()
  const incoming = record.composition.clips.find(clip => clip.id === 'in')!
  incoming.startMs = 400 + gapMs
  incoming.appearance.keys.forEach(key => { key.timeMs -= 200 - gapMs })
  record.composition.transitions = []
  record.composition.showEndMs = 1_500
  record.composition.layoutOccurrences[0].durationMs = 1_500
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function participant(id: string, zoneId: string, layerId: string, fromClipId: string, toClipId: string) {
  return { id, zoneId, layerId, fromClipId, toClipId }
}

function crossfade(id: string, durationMs: number, policy: 'live-live' | 'snapshot-live', participants: ShowTransitionV2['participants']): ShowTransitionV2 {
  return { id, kind: 'crossfade', durationMs, easing: { curve: 'linear' }, crossfadePolicy: policy, participants, propertyRamps: [] }
}

/** Two Zones meeting at one exact boundary; only whole-output scope covers both. */
function twoZoneShow(): ShowRecordV2 {
  const record = cutShow()
  const outgoing = record.composition.clips.find(clip => clip.id === 'out')!
  const incoming = record.composition.clips.find(clip => clip.id === 'in')!
  record.zones.push({ id: 'zone-b', name: 'Second', nominalPixelCount: 16 })
  record.zoneLayouts[0].logical = { kind: 'split', zoneIds: ['zone', 'zone-b'], axis: 'x' }
  record.composition.layers.push({ id: 'layer:zone-b:main', zoneId: 'zone-b', name: 'Main', rank: 0 })
  record.composition.clips.push(
    { ...structuredClone(outgoing), id: 'out-b', zoneId: 'zone-b', layerId: 'layer:zone-b:main', appearance: { keys: [{ ...structuredClone(outgoing.appearance.keys[0]), id: 'out-b:1' }] } },
    { ...structuredClone(incoming), id: 'in-b', zoneId: 'zone-b', layerId: 'layer:zone-b:main', appearance: { keys: [{ ...structuredClone(incoming.appearance.keys[0]), id: 'in-b:1' }] } },
  )
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

describe('v2 Transition route completion partitions', () => {
  it.each(['live-live', 'snapshot-live'] as const)('retains %s crossfade policy through insert and reopen', policy => {
    const source = cutShow()

    const inserted = editShowTransitionV2(source, {
      kind: 'insert',
      transition: crossfade('boundary', 200, policy, [participant('p1', 'zone', 'layer:zone:main', 'out', 'in')]),
    })

    expect(inserted.status).toBe('changed')
    if (inserted.status !== 'changed') return
    const reopened = reopen(inserted.record)
    expect(reopened.composition.transitions[0]).toMatchObject({ kind: 'crossfade', crossfadePolicy: policy, durationMs: 200 })
    expect(reopened.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([['out', 0], ['in', 600]])
  })

  it('inserts, resizes and resets on an overlay Layer without touching the Main Layer', () => {
    const source = cutShow()
    const overlayLayerId = source.composition.layers.find(layer => layer.rank === 1)!.id
    const outgoing = source.composition.clips.find(clip => clip.id === 'out')!
    const incoming = source.composition.clips.find(clip => clip.id === 'in')!
    // The Main Layer keeps one spanning Clip so an overlay edit must leave it fixed.
    source.composition.clips = [
      { ...structuredClone(outgoing), id: 'main-span', durationMs: 1_500, appearance: { keys: [{ ...structuredClone(outgoing.appearance.keys[0]), id: 'main-span:1', timeMs: 0 }] } },
      { ...structuredClone(outgoing), id: 'overlay-out', layerId: overlayLayerId, appearance: { keys: [{ ...structuredClone(outgoing.appearance.keys[0]), id: 'overlay-out:1' }] } },
      { ...structuredClone(incoming), id: 'overlay-in', layerId: overlayLayerId, appearance: { keys: [{ ...structuredClone(incoming.appearance.keys[0]), id: 'overlay-in:1', timeMs: 400 }] } },
    ]
    expect(validateShowRecordV2(source)).toEqual([])
    expect(projectShowTransitionJunctionsV2(source).map(junction => [junction.layerId, junction.atMs])).toEqual([[overlayLayerId, 400]])

    const inserted = editShowTransitionV2(source, {
      kind: 'insert',
      transition: crossfade('overlay-boundary', 200, 'live-live', [participant('p1', 'zone', overlayLayerId, 'overlay-out', 'overlay-in')]),
    })
    expect(inserted).toMatchObject({ status: 'changed', affectedClipIds: ['overlay-in'] })
    if (inserted.status !== 'changed') return
    expect(inserted.record.composition.clips.find(clip => clip.id === 'main-span')).toEqual(source.composition.clips[0])

    const reset = editShowTransitionV2(reopen(inserted.record), { kind: 'reset-to-cut', transitionId: 'overlay-boundary' })
    expect(reset).toMatchObject({ status: 'changed', removedIds: ['overlay-boundary'] })
    if (reset.status !== 'changed') return
    expect(reset.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([
      ['main-span', 0], ['overlay-out', 0], ['overlay-in', 400],
    ])
  })

  it('moves every Zone contributor once through a whole-output insert, resize and reset', () => {
    const source = twoZoneShow()
    const wholeOutput = { startMs: 400, fromClipIds: ['out', 'out-b'], toClipIds: ['in', 'in-b'] }

    const inserted = editShowTransitionV2(source, {
      kind: 'insert',
      transition: { ...crossfade('whole', 200, 'live-live', []), wholeOutput },
    })
    expect(inserted).toMatchObject({ status: 'changed', affectedClipIds: ['in', 'in-b'] })
    if (inserted.status !== 'changed') return
    expect(inserted.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([
      ['out', 0], ['in', 600], ['out-b', 0], ['in-b', 600],
    ])

    const resized = editShowTransitionV2(reopen(inserted.record), { kind: 'resize-transition', transitionId: 'whole', durationMs: 300 })
    expect(resized.status).toBe('changed')
    if (resized.status !== 'changed') return
    expect(resized.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([
      ['out', 0], ['in', 700], ['out-b', 0], ['in-b', 700],
    ])

    const reset = editShowTransitionV2(reopen(resized.record), { kind: 'reset-to-cut', transitionId: 'whole' })
    expect(reset.status).toBe('changed')
    if (reset.status !== 'changed') return
    expect(reset.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([
      ['out', 0], ['in', 400], ['out-b', 0], ['in-b', 400],
    ])
    expect(reset.record.composition.transitions).toEqual([])
  })

  it('moves a converging chain Clip exactly once', () => {
    const source = twoZoneShow()
    source.composition.showEndMs = 2_500
    source.composition.layoutOccurrences[0].durationMs = 2_500
    const incoming = source.composition.clips.find(clip => clip.id === 'in')!
    // One later Clip on each Zone converges into a shared whole-output boundary.
    source.composition.clips.push(
      { ...structuredClone(incoming), id: 'tail', startMs: 1_000, durationMs: 300, appearance: { keys: [{ ...structuredClone(incoming.appearance.keys[0]), id: 'tail:1', timeMs: 1_000 }] } },
      { ...structuredClone(incoming), id: 'tail-b', zoneId: 'zone-b', layerId: 'layer:zone-b:main', startMs: 1_000, durationMs: 300, appearance: { keys: [{ ...structuredClone(incoming.appearance.keys[0]), id: 'tail-b:1', timeMs: 1_000 }] } },
    )
    source.composition.clips.forEach(clip => { if (clip.id === 'in' || clip.id === 'in-b') { clip.durationMs = 600 } })
    source.composition.transitions = [{
      ...crossfade('converge', 100, 'live-live', []),
      wholeOutput: { startMs: 1_000, fromClipIds: ['in', 'in-b'], toClipIds: ['tail', 'tail-b'] },
    }]
    source.composition.clips.forEach(clip => { if (clip.id === 'tail' || clip.id === 'tail-b') { clip.startMs = 1_100; clip.appearance.keys[0].timeMs = 1_100 } })
    expect(validateShowRecordV2(source)).toEqual([])

    const inserted = editShowTransitionV2(source, {
      kind: 'insert',
      transition: { ...crossfade('whole', 200, 'live-live', []), wholeOutput: { startMs: 400, fromClipIds: ['out', 'out-b'], toClipIds: ['in', 'in-b'] } },
    })

    expect(inserted).toMatchObject({ status: 'changed', affectedClipIds: ['in', 'in-b', 'tail', 'tail-b'] })
    if (inserted.status !== 'changed') return
    // Each downstream Clip shifts by exactly one duration even though two edges reach it.
    expect(inserted.record.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([
      ['out', 0], ['in', 600], ['out-b', 0], ['in-b', 600], ['tail', 1_300], ['tail-b', 1_300],
    ])
    expect(inserted.record.composition.transitions.find(transition => transition.id === 'converge')?.wholeOutput?.startMs).toBe(1_200)
  })

  it('moves the Restart trigger to the incoming contribution window and back', () => {
    const source = cutShow()
    source.composition.clips.find(clip => clip.id === 'in')!.entryPolicy = 'restart'
    expect(validateShowRecordV2(source)).toEqual([])
    expect(deriveShowRestartEventsV2(source)).toMatchObject({ status: 'derived', events: [{ atMs: 400, clipIds: ['in'] }] })

    const inserted = editShowTransitionV2(source, {
      kind: 'insert',
      transition: crossfade('boundary', 200, 'live-live', [participant('p1', 'zone', 'layer:zone:main', 'out', 'in')]),
    })
    expect(inserted.status).toBe('changed')
    if (inserted.status !== 'changed') return
    // The Clip now starts at 600 but its full reset still fires at first contribution.
    expect(inserted.record.composition.clips.find(clip => clip.id === 'in')?.startMs).toBe(600)
    expect(deriveShowRestartEventsV2(inserted.record)).toMatchObject({ status: 'derived', events: [{ atMs: 400, clipIds: ['in'] }] })

    const resized = editShowTransitionV2(reopen(inserted.record), { kind: 'resize-trailing', clipId: 'out', endMs: 300 })
    expect(resized.status).toBe('changed')
    if (resized.status !== 'changed') return
    expect(deriveShowRestartEventsV2(resized.record)).toMatchObject({ status: 'derived', events: [{ atMs: 300, clipIds: ['in'] }] })

    const reset = editShowTransitionV2(reopen(resized.record), { kind: 'reset-to-cut', transitionId: 'boundary' })
    expect(reset.status).toBe('changed')
    if (reset.status !== 'changed') return
    expect(reset.record.composition.clips.find(clip => clip.id === 'in')?.startMs).toBe(300)
    expect(deriveShowRestartEventsV2(reset.record)).toMatchObject({ status: 'derived', events: [{ atMs: 300, clipIds: ['in'] }] })
  })

  it('re-adds a deleted Clip as a plain Cut only at exact adjacency', () => {
    const source = converted()
    const deleted = editShowTransitionV2(source, { kind: 'delete-clip', clipId: 'in' })
    expect(deleted.status).toBe('changed')
    if (deleted.status !== 'changed') return
    const template = source.composition.clips.find(clip => clip.id === 'in')!

    for (const [startMs, expectedJunctions] of [[400, 1], [401, 0]] as const) {
      const readded = reopen(deleted.record)
      readded.composition.clips.push({
        ...structuredClone(template), id: 'replacement', startMs,
        appearance: { keys: [{ ...structuredClone(template.appearance.keys[0]), id: 'replacement:1', timeMs: startMs }] },
      })
      expect(validateShowRecordV2(readded)).toEqual([])
      expect(readded.composition.transitions).toEqual([])
      expect(projectShowTransitionJunctionsV2(reopen(readded))).toHaveLength(expectedJunctions)
    }
  })

  it('refuses connected resize and move topologies it cannot own atomically', () => {
    const source = cutShow()
    const inserted = editShowTransitionV2(source, {
      kind: 'insert',
      transition: crossfade('boundary', 200, 'live-live', [participant('p1', 'zone', 'layer:zone:main', 'out', 'in')]),
    })
    if (inserted.status !== 'changed') throw new Error('insert')
    const record = reopen(inserted.record)
    const before = structuredClone(record)

    const crossZone = editShowTransitionV2(record, { kind: 'move-connected', clipId: 'in', startMs: 700, zoneId: 'zone-b' })
    expect(crossZone).toMatchObject({ status: 'refused', code: 'invalid-topology' })
    expect(crossZone.record).toBe(record)

    const noOutgoing = editShowTransitionV2(record, { kind: 'resize-trailing', clipId: 'in', endMs: 900 })
    expect(noOutgoing).toMatchObject({ status: 'refused', code: 'invalid-topology' })

    const noIncoming = editShowTransitionV2(record, { kind: 'resize-leading', clipId: 'out', startMs: 100 })
    expect(noIncoming).toMatchObject({ status: 'refused', code: 'invalid-topology' })

    const multiContributor = twoZoneShow()
    const whole = editShowTransitionV2(multiContributor, {
      kind: 'insert',
      transition: { ...crossfade('whole', 200, 'live-live', []), wholeOutput: { startMs: 400, fromClipIds: ['out', 'out-b'], toClipIds: ['in', 'in-b'] } },
    })
    if (whole.status !== 'changed') throw new Error('whole')
    const split = editShowTransitionV2(reopen(whole.record), { kind: 'resize-trailing', clipId: 'out', endMs: 300 })
    expect(split).toMatchObject({ status: 'refused', code: 'invalid-topology', message: expect.stringContaining('multi-contributor') })

    expect(record).toEqual(before)
  })
})
