import { describe, expect, it } from 'vitest'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from './showCompositionV2'
import { editShowLayoutIntervalsV2 } from './showLayoutIntervalsV2'

// D7 (issue #1041): the Layout occurrence owner supplies duplication so the
// manual inspector and the v2 command share one implementation. The command
// layer never composes append plus a content copy.

function duplicateRecord(): ShowRecordV2 {
  return {
    version: 2,
    id: 'duplicate-show',
    name: 'Layout duplicate fixture',
    zones: [{ id: 'left', name: 'Left', nominalPixelCount: 8 }],
    zoneLayouts: [
      { id: 'both', name: 'Both', zones: [], logical: { kind: 'single', zoneIds: ['left'] } },
      { id: 'alternate', name: 'Alternate', zones: [], logical: { kind: 'single', zoneIds: ['left'] } },
    ],
    outputContract: {
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 16,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    },
    composition: {
      version: 2,
      executionModel: 'continuous',
      showEndMs: 1_000,
      sampleRemap: { repeatScale: 1 },
      patternInstances: [{
        id: 'instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      layers: [{ id: 'layer', zoneId: 'left', name: 'Left', rank: 0 }],
      clips: [{
        id: 'inside-clip', instanceId: 'instance', zoneId: 'left', layerId: 'layer',
        startMs: 0, durationMs: 400, entryPolicy: 'restart', zoneSampleMode: 'span',
        appearance: { keys: [{
          id: 'inside-appearance', timeMs: 0,
          value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
        }] },
      }, {
        id: 'later-clip', instanceId: 'instance', zoneId: 'left', layerId: 'layer',
        startMs: 600, durationMs: 400, entryPolicy: 'continue', zoneSampleMode: 'span',
        appearance: { keys: [{
          id: 'later-appearance', timeMs: 600,
          value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
        }] },
      }],
      transitions: [],
      layoutOccurrences: [
        { id: 'first', layoutId: 'both', startMs: 0, durationMs: 500, parameters: { splitPosition: 0.25 } },
        { id: 'second', layoutId: 'alternate', startMs: 500, durationMs: 500, parameters: {} },
      ],
      propertyTracks: [{
        id: 'inside-track',
        target: { kind: 'clip-opacity', clipId: 'inside-clip' },
        activeStartMs: 0,
        activeDurationMs: 400,
        keyframes: [
          { id: 'inside-key-start', timeMs: 0, value: 0, easing: { curve: 'linear' } },
          { id: 'inside-key-end', timeMs: 400, value: 1, easing: { curve: 'linear' } },
        ],
      }],
      markers: [
        { id: 'inside-marker', name: 'Inside', timeMs: 100 },
        { id: 'later-marker', name: 'Later', timeMs: 700 },
      ],
      groupDefinitions: [],
      groupOccurrences: [],
    },
    updatedAt: 1,
  }
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

describe('Layout occurrence duplication (D7)', () => {
  it('duplicates an occurrence empty, shifting only later content once', () => {
    const record = duplicateRecord()
    const preimage = structuredClone(record)
    const result = editShowLayoutIntervalsV2(record, {
      kind: 'duplicate', occurrenceId: 'first', newOccurrenceId: 'first-copy',
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(record).toEqual(preimage)
    const composition = result.record.composition
    expect(composition.showEndMs).toBe(1_500)
    expect(composition.layoutOccurrences).toEqual([
      { id: 'first', layoutId: 'both', startMs: 0, durationMs: 500, parameters: { splitPosition: 0.25 } },
      { id: 'first-copy', layoutId: 'both', startMs: 500, durationMs: 500, parameters: { splitPosition: 0.25 } },
      { id: 'second', layoutId: 'alternate', startMs: 1_000, durationMs: 500, parameters: {} },
    ])
    // Content inside the source interval stays; content after it moves once.
    expect(composition.clips.find(clip => clip.id === 'inside-clip')).toEqual(preimage.composition.clips[0])
    expect(composition.clips.find(clip => clip.id === 'later-clip')).toMatchObject({ startMs: 1_100 })
    expect(composition.clips.find(clip => clip.id === 'later-clip')!.appearance.keys[0].timeMs).toBe(1_100)
    expect(composition.propertyTracks).toEqual(preimage.composition.propertyTracks)
    expect(composition.markers).toEqual([
      { id: 'inside-marker', name: 'Inside', timeMs: 100 },
      { id: 'later-marker', name: 'Later', timeMs: 1_200 },
    ])
    // Duplication never mints a Pattern runtime.
    expect(composition.patternInstances).toEqual(preimage.composition.patternInstances)
    expect(result.affectedLayoutOccurrenceIds).toEqual(['first-copy', 'second'])
    expect(result.affectedClipIds).toEqual(['later-clip'])
    expect(result.affectedMarkerIds).toEqual(['later-marker'])
    expect(validateShowRecordV2(reopen(result.record))).toEqual([])
  })

  it('copies the interval content under an exact identity plan without cloning a runtime', () => {
    const record = duplicateRecord()
    const preimage = structuredClone(record)
    const result = editShowLayoutIntervalsV2(record, {
      kind: 'duplicate',
      occurrenceId: 'first',
      newOccurrenceId: 'first-copy',
      content: {
        idsBySourceId: {
          'inside-clip': 'inside-clip-copy',
          'inside-appearance': 'inside-appearance-copy',
          'inside-track': 'inside-track-copy',
          'inside-key-start': 'inside-key-start-copy',
          'inside-key-end': 'inside-key-end-copy',
        },
      },
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(record).toEqual(preimage)
    const composition = result.record.composition
    const copy = composition.clips.find(clip => clip.id === 'inside-clip-copy')!
    expect(copy).toEqual({
      ...preimage.composition.clips[0],
      id: 'inside-clip-copy',
      startMs: 500,
      appearance: { keys: [{ ...preimage.composition.clips[0].appearance.keys[0], id: 'inside-appearance-copy', timeMs: 500 }] },
    })
    // Duplication shares the Pattern runtime and carries the authored Restart.
    expect(copy.instanceId).toBe('instance')
    expect(copy.entryPolicy).toBe('restart')
    expect(composition.patternInstances).toEqual(preimage.composition.patternInstances)
    expect(composition.propertyTracks.find(track => track.id === 'inside-track-copy')).toEqual({
      id: 'inside-track-copy',
      target: { kind: 'clip-opacity', clipId: 'inside-clip-copy' },
      activeStartMs: 500,
      activeDurationMs: 400,
      keyframes: [
        { id: 'inside-key-start-copy', timeMs: 500, value: 0, easing: { curve: 'linear' } },
        { id: 'inside-key-end-copy', timeMs: 900, value: 1, easing: { curve: 'linear' } },
      ],
    })
    expect(result.affectedClipIds).toEqual(['inside-clip-copy', 'later-clip'])
    expect(result.affectedTrackIds).toEqual(['inside-track-copy'])
    expect(validateShowRecordV2(reopen(result.record))).toEqual([])
  })

  it('refuses an incomplete, colliding or blank content identity plan atomically', () => {
    const record = duplicateRecord()
    const preimage = structuredClone(record)
    const complete = {
      'inside-clip': 'inside-clip-copy',
      'inside-appearance': 'inside-appearance-copy',
      'inside-track': 'inside-track-copy',
      'inside-key-start': 'inside-key-start-copy',
      'inside-key-end': 'inside-key-end-copy',
    }
    for (const idsBySourceId of [
      { ...complete, 'inside-key-end': undefined } as unknown as Record<string, string>,
      { ...complete, 'unknown-source': 'extra-copy' },
      { ...complete, 'inside-clip': 'later-clip' },
      { ...complete, 'inside-clip': '   ' },
      { ...complete, 'inside-clip': 'inside-appearance-copy' },
    ]) {
      const refused = editShowLayoutIntervalsV2(record, {
        kind: 'duplicate', occurrenceId: 'first', newOccurrenceId: 'first-copy', content: { idsBySourceId },
      })
      expect(refused).toMatchObject({ status: 'refused', code: 'invalid-intent' })
      expect(refused.record).toBe(record)
      expect(refused.affectedLayoutOccurrenceIds).toEqual([])
      expect(refused.affectedClipIds).toEqual([])
    }
    expect(record).toEqual(preimage)
  })

  it('refuses a content plan that reuses the new occurrence identity', () => {
    const record = duplicateRecord()
    const preimage = structuredClone(record)
    const refused = editShowLayoutIntervalsV2(record, {
      kind: 'duplicate', occurrenceId: 'first', newOccurrenceId: 'first-copy',
      content: { idsBySourceId: {
        'inside-clip': 'first-copy',
        'inside-appearance': 'inside-appearance-copy',
        'inside-track': 'inside-track-copy',
        'inside-key-start': 'inside-key-start-copy',
        'inside-key-end': 'inside-key-end-copy',
      } },
    })
    expect(refused).toMatchObject({ status: 'refused', code: 'invalid-intent' })
    expect(refused.record).toBe(record)
    expect(refused.affectedLayoutOccurrenceIds).toEqual([])
    expect(refused.affectedClipIds).toEqual([])
    expect(record).toEqual(preimage)
  })

  it('refuses a fresh occurrence identity that is already owned, and an unknown occurrence', () => {
    const record = duplicateRecord()
    expect(editShowLayoutIntervalsV2(record, {
      kind: 'duplicate', occurrenceId: 'first', newOccurrenceId: 'second',
    })).toMatchObject({ status: 'refused', code: 'invalid-intent' })
    expect(editShowLayoutIntervalsV2(record, {
      kind: 'duplicate', occurrenceId: 'missing', newOccurrenceId: 'copy',
    })).toMatchObject({ status: 'refused', code: 'missing-occurrence' })
  })

  it('refuses when authored content crosses the duplicated occurrence boundary', () => {
    const crossingClip = duplicateRecord()
    crossingClip.composition.clips[0].durationMs = 600
    crossingClip.composition.propertyTracks[0].activeDurationMs = 600
    crossingClip.composition.propertyTracks[0].keyframes[1].timeMs = 600
    const refusedClip = editShowLayoutIntervalsV2(crossingClip, {
      kind: 'duplicate', occurrenceId: 'first', newOccurrenceId: 'first-copy',
    })
    expect(refusedClip).toMatchObject({ status: 'refused', code: 'boundary-crossing-content' })
    expect(refusedClip.record).toBe(crossingClip)

    const crossingTransition = duplicateRecord()
    crossingTransition.composition.clips[0].durationMs = 450
    crossingTransition.composition.propertyTracks[0].activeDurationMs = 450
    crossingTransition.composition.propertyTracks[0].keyframes[1].timeMs = 450
    crossingTransition.composition.clips[1].startMs = 550
    crossingTransition.composition.clips[1].durationMs = 450
    crossingTransition.composition.clips[1].appearance.keys[0].timeMs = 550
    crossingTransition.composition.transitions = [{
      id: 'crossing', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' },
      participants: [{
        id: 'crossing-pair', zoneId: 'left', layerId: 'layer',
        fromClipId: 'inside-clip', toClipId: 'later-clip',
      }],
      propertyRamps: [],
    }]
    expect(validateShowRecordV2(crossingTransition)).toEqual([])
    const refusedTransition = editShowLayoutIntervalsV2(crossingTransition, {
      kind: 'duplicate', occurrenceId: 'first', newOccurrenceId: 'first-copy',
    })
    expect(refusedTransition).toMatchObject({ status: 'refused', code: 'boundary-crossing-content' })
    expect(refusedTransition.record).toBe(crossingTransition)
  })

  it('duplicates the final occurrence and restores the original coverage through Show End', () => {
    const record = duplicateRecord()
    const duplicated = editShowLayoutIntervalsV2(record, {
      kind: 'duplicate', occurrenceId: 'second', newOccurrenceId: 'second-copy',
    })
    expect(duplicated.status).toBe('changed')
    if (duplicated.status !== 'changed') return
    expect(duplicated.record.composition.showEndMs).toBe(1_500)
    expect(duplicated.record.composition.layoutOccurrences.map(occurrence => occurrence.id))
      .toEqual(['first', 'second', 'second-copy'])
    const restored = editShowLayoutIntervalsV2(reopen(duplicated.record), {
      kind: 'set-show-end', showEndMs: 1_000,
    })
    expect(restored.status).toBe('changed')
    if (restored.status !== 'changed') return
    expect(restored.record.composition.layoutOccurrences).toEqual(record.composition.layoutOccurrences)
  })
})

it('duplicates interval content without carrying conversion provenance (#1068 gap 8, part A2)', () => {
  const record = duplicateRecord()
  record.composition.clips[0].logicalClipId = 'solo'
  expect(validateShowRecordV2(record)).toEqual([])
  const result = editShowLayoutIntervalsV2(record, {
    kind: 'duplicate',
    occurrenceId: 'first',
    newOccurrenceId: 'first-copy',
    content: {
      idsBySourceId: {
        'inside-clip': 'inside-clip-copy',
        'inside-appearance': 'inside-appearance-copy',
        'inside-track': 'inside-track-copy',
        'inside-key-start': 'inside-key-start-copy',
        'inside-key-end': 'inside-key-end-copy',
      },
    },
  })
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const composition = result.record.composition
  expect(composition.clips.find(clip => clip.id === 'inside-clip')!.logicalClipId).toBe('solo')
  const copy = composition.clips.find(clip => clip.id === 'inside-clip-copy')!
  expect(copy.logicalClipId).toBeUndefined()
  expect('logicalClipId' in copy).toBe(false)
})
