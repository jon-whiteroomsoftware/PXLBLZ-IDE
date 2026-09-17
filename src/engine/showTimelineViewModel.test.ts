import { describe, expect, it } from 'vitest'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import type { ShowRecord } from './personalContentRecords'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import {
  projectShowTimelineViewModel,
  showTimelineSelectionKey,
  type ShowTimelineViewModel,
} from './showTimelineViewModel'
import { projectShowTimelineV2 } from './showTimelineViewModelV2'

function convert(show: ShowRecord): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(show)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

function onlyLayer(view: ShowTimelineViewModel) {
  const layer = view.rows[0].layers.find((candidate) => candidate.rank === 0)
  if (!layer) throw new Error('The Main Layer is missing from the view.')
  return layer
}

/** Two adjacent Clips on one Layer, separated by `gapMs` of blank time. */
function adjacentV1Show(gapMs: number): ShowRecord {
  const show = convertibleV1Show()
  show.scenes = [{ id: 'scene-a', name: 'Opening', durationMs: 1_000 + gapMs }]
  show.composition!.durationMs = 1_000 + gapMs
  show.composition!.patternInstances.push({
    id: 'second', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'CometLoom',
    time: { timeScale: 1, timeOffsetMs: 0 },
  })
  show.composition!.scenes[0].zones[0].main = [
    { id: 'clip', instanceId: 'instance', startMs: 0, durationMs: 400, view: { mirror: false, phase: 0, brightness: 1 } },
    {
      id: 'clip-2', instanceId: 'second', startMs: 400 + gapMs, durationMs: 600,
      view: { mirror: false, phase: 0, brightness: 1 },
    },
  ]
  return show
}

describe('Show timeline view model', () => {
  describe('derived Cut junctions', () => {
    it('offers a selectable Cut at exact adjacency in both views', () => {
      const show = adjacentV1Show(0)
      const v1 = projectShowTimelineViewModel(show)
      const v2 = projectShowTimelineV2(convert(show))
      for (const view of [v1, v2]) {
        const [junction] = onlyLayer(view).junctions
        expect(junction.kind).toBe('cut')
        expect(junction.scope).toBe('derived-cut')
        expect(junction.transitionId).toBeNull()
        expect(junction.startMs).toBe(400)
        expect(junction.durationMs).toBe(0)
        expect(junction.selection).toMatchObject({ kind: 'cut', atMs: 400 })
      }
      expect(v1.transitions).toEqual([])
      expect(v2.transitions).toEqual([])
    })

    it('leaves a 1 ms gap as blank time with no junction', () => {
      const show = adjacentV1Show(1)
      expect(onlyLayer(projectShowTimelineViewModel(show)).junctions).toEqual([])
      expect(onlyLayer(projectShowTimelineV2(convert(show))).junctions).toEqual([])
    })
  })

  describe('Transitions', () => {
    it('carries a Layer participant pair with its window in both views', () => {
      const show = transitionV1Show('crossfade')
      const v1 = projectShowTimelineViewModel(show)
      const v2 = projectShowTimelineV2(convert(show))
      expect(v1.transitions).toHaveLength(1)
      expect(v2.transitions).toHaveLength(1)
      expect(v1.transitions[0]).toMatchObject({ kind: 'crossfade', startMs: 400, durationMs: 200, endMs: 600 })
      expect(v2.transitions[0]).toMatchObject({ kind: 'crossfade', startMs: 400, durationMs: 200, endMs: 600 })
      expect(v1.transitions[0].scope).toEqual({
        kind: 'participants',
        participants: [{ zoneId: 'zone', layerId: 'zone:main', fromItemId: 'out', toItemId: 'in' }],
      })
      expect(v2.transitions[0].scope).toEqual({
        kind: 'participants',
        participants: [{ zoneId: 'zone', layerId: 'layer:zone:main', fromItemId: 'out', toItemId: 'in' }],
      })
      const junction = onlyLayer(v2).junctions[0]
      expect(junction.scope).toBe('layer')
      expect(junction.transitionId).toBe(v2.transitions[0].id)
    })

    it('reports a whole-output window with its explicit contributor sets', () => {
      const record = convert(transitionV1Show('crossfade'))
      const transition = record.composition.transitions[0]
      transition.participants = []
      transition.wholeOutput = { startMs: 400, fromClipIds: ['out'], toClipIds: ['in'] }
      expect(validateShowRecordV2(record)).toEqual([])
      const view = projectShowTimelineV2(record)
      expect(view.transitions[0].scope).toEqual({
        kind: 'whole-output',
        fromItemIds: ['out'],
        toItemIds: ['in'],
      })
      expect(onlyLayer(view).junctions[0].scope).toBe('whole-output')
    })
  })

  describe('rows, Layers and items', () => {
    it('orders Layers top to bottom with rank zero at the bottom', () => {
      const show = convertibleV1Show()
      const v1 = projectShowTimelineViewModel(show)
      const v2 = projectShowTimelineV2(convert(show))
      expect(v1.rows[0].layers.map((layer) => [layer.name, layer.rank, layer.layerIndex]))
        .toEqual([['Atmosphere', 1, 0], ['Main', 0, 1]])
      expect(v2.rows[0].layers.map((layer) => [layer.name, layer.rank, layer.layerIndex]))
        .toEqual([['Atmosphere', 1, 0], ['Main', 0, 1]])
    })

    it('marks a record with no composition as uncomposed and draws no Layers', () => {
      const show = convertibleV1Show()
      const view = projectShowTimelineViewModel({ ...show, composition: undefined })
      expect(view.rows[0].composed).toBe(false)
      expect(view.rows[0].layers).toEqual([])
      expect(view.showEndMs).toBe(1_000)
    })

    it('carries Pattern instance identity, entry policy and held appearance', () => {
      const show = transitionV1Show('crossfade')
      const item = onlyLayer(projectShowTimelineViewModel(show)).items[0]
      const converted = onlyLayer(projectShowTimelineV2(convert(show))).items[0]
      expect(item).toMatchObject({
        id: 'out',
        instanceId: 'out-instance',
        patternName: 'Outgoing',
        startMs: 0,
        durationMs: 400,
        endMs: 400,
        entryPolicy: 'continue',
        heldAppearance: { opacity: 1, effectKinds: [] },
      })
      expect(converted).toMatchObject({
        instanceId: 'out-instance',
        patternName: 'Outgoing',
        startMs: 0,
        durationMs: 400,
        entryPolicy: 'continue',
        heldAppearance: { opacity: 1, effectKinds: [] },
      })
    })

    it('keeps Scene identity in a v1-only sidecar the v2 view never carries', () => {
      const show = transitionV1Show('crossfade')
      expect(onlyLayer(projectShowTimelineViewModel(show)).items[0].legacy)
        .toMatchObject({ sceneId: 'scene-a', kind: 'main', startPlacementId: 'out' })
      expect(onlyLayer(projectShowTimelineV2(convert(show))).items[0].legacy).toBeUndefined()
    })

    it('reports an authored restart entry policy from the v2 record', () => {
      const record = convert(transitionV1Show('crossfade'))
      record.composition.clips.find((clip) => clip.id === 'in')!.entryPolicy = 'restart'
      expect(validateShowRecordV2(record)).toEqual([])
      expect(onlyLayer(projectShowTimelineV2(record)).items.map((item) => item.entryPolicy))
        .toEqual(['continue', 'restart'])
    })
  })

  describe('Layout occurrences, Markers and Show End', () => {
    it('covers the whole Show once and carries explicit routing parameters', () => {
      const record = convert(transitionV1Show('crossfade'))
      record.composition.layoutOccurrences = [
        { id: 'occurrence-1', layoutId: 'layout', startMs: 0, durationMs: 400, parameters: { splitPosition: 0.25 } },
        { id: 'occurrence-2', layoutId: 'layout', startMs: 400, durationMs: 600, parameters: { splitPosition: 0.75 } },
      ]
      expect(validateShowRecordV2(record)).toEqual([])
      const view = projectShowTimelineV2(record)
      expect(view.layoutIntervals.map((interval) => [interval.id, interval.startMs, interval.endMs]))
        .toEqual([['occurrence-1', 0, 400], ['occurrence-2', 400, 1_000]])
      expect(view.layoutIntervals[0].parameters).toEqual({ splitPosition: 0.25 })
      expect(view.layoutIntervals[0].definitionName).toBe('Full')
      expect(view.layoutIntervals[0].selection)
        .toEqual({ kind: 'layout-occurrence', occurrenceId: 'occurrence-1' })
      expect(view.layoutIntervals[0].legacy).toBeUndefined()
      expect(view.showEndMs).toBe(record.composition.showEndMs)
    })

    it('carries the chapter role a converted Scene label owns', () => {
      const show = transitionV1Show('crossfade')
      const view = projectShowTimelineV2(convert(show))
      expect(view.markers.map((marker) => [marker.name, marker.timeMs, marker.role]))
        .toEqual([['Opening', 0, 'chapter']])
      expect(view.markers[0].selection).toEqual({ kind: 'marker', markerId: view.markers[0].id })
      expect(projectShowTimelineViewModel(show).markers).toEqual([])
    })
  })

  describe('selection identity', () => {
    it('addresses every timeline entity without a Scene-local cell key', () => {
      expect(showTimelineSelectionKey({ kind: 'clip', clipId: 'clip-1' })).toBe('clip:clip-1')
      expect(showTimelineSelectionKey({ kind: 'group', occurrenceId: 'occurrence-1' })).toBe('group:occurrence-1')
      expect(showTimelineSelectionKey({ kind: 'group-clip', occurrenceId: 'occurrence-1', childId: 'child-1' }))
        .toBe('group-clip:occurrence-1:child-1')
      expect(showTimelineSelectionKey({ kind: 'layer', zoneId: 'zone', layerId: 'layer-1' }))
        .toBe('layer:zone:layer-1')
      expect(showTimelineSelectionKey({
        kind: 'cut', zoneId: 'zone', layerId: 'layer-1', fromClipId: 'a', toClipId: 'b', atMs: 400,
      })).toBe('cut:zone:layer-1:a:b')
      expect(showTimelineSelectionKey({ kind: 'layout-occurrence', occurrenceId: 'occurrence-1' }))
        .toBe('layout-occurrence:occurrence-1')
      expect(showTimelineSelectionKey({ kind: 'marker', markerId: 'marker-1' })).toBe('marker:marker-1')
      expect(showTimelineSelectionKey({ kind: 'zone', zoneId: 'zone' })).toBe('zone:zone')
      expect(showTimelineSelectionKey({ kind: 'show' })).toBe('show')
    })
  })

  describe('immutability and snap candidates', () => {
    it('leaves both records untouched and repeats exactly', () => {
      const show = transitionV1Show('crossfade')
      const record = convert(show)
      const showBefore = JSON.stringify(show)
      const recordBefore = JSON.stringify(record)
      expect(projectShowTimelineViewModel(show)).toEqual(projectShowTimelineViewModel(show))
      expect(projectShowTimelineV2(record)).toEqual(projectShowTimelineV2(record))
      expect(JSON.stringify(show)).toBe(showBefore)
      expect(JSON.stringify(record)).toBe(recordBefore)
    })

    it('offers Show End, Transition windows and item boundaries as snap candidates', () => {
      const view = projectShowTimelineV2(convert(transitionV1Show('crossfade')))
      expect(view.structuralTimesMs).toEqual([0, 1_000, 400, 600])
    })
  })
})
