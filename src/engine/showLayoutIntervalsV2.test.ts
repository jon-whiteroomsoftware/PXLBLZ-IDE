import { describe, expect, it } from 'vitest'
import { LIBRARIES } from '../pixelblaze/libs'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from './showCompositionV2'
import {
  editShowLayoutIntervalsV2,
  showLayoutOccurrenceAtTimeV2,
  showLayoutZoneIdAtTimeV2,
  validateClipLayoutAvailabilityV2,
} from './showLayoutIntervalsV2'

function layoutRecord(): ShowRecordV2 {
  return {
    version: 2,
    id: 'layout-show',
    name: 'Layout owner fixture',
    zones: [
      { id: 'left', name: 'Left', nominalPixelCount: 8 },
      { id: 'right', name: 'Right', nominalPixelCount: 8 },
    ],
    zoneLayouts: [
      { id: 'both', name: 'Both', zones: [], logical: { kind: 'split', axis: 'x', zoneIds: ['left', 'right'] } },
      { id: 'left-only', name: 'Left only', zones: [], logical: { kind: 'single', zoneIds: ['left'] } },
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
      layers: [
        { id: 'left-layer', zoneId: 'left', name: 'Left', rank: 0 },
        { id: 'right-layer', zoneId: 'right', name: 'Right', rank: 0 },
      ],
      clips: [{
        id: 'left-clip', instanceId: 'instance', zoneId: 'left', layerId: 'left-layer',
        startMs: 0, durationMs: 1_000, entryPolicy: 'continue', zoneSampleMode: 'span',
        appearance: { keys: [{
          id: 'left-appearance', timeMs: 0,
          value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
        }] },
      }],
      transitions: [],
      layoutOccurrences: [{ id: 'first', layoutId: 'both', startMs: 0, durationMs: 1_000, parameters: {} }],
      propertyTracks: [],
      markers: [],
      groupDefinitions: [],
      groupOccurrences: [],
    },
    updatedAt: 1,
  }
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  expect(opened.record).toEqual(record)
  return opened.record
}

const statefulSource = 'export var calls=0; export var elapsed=0; export function beforeRender(delta){calls++;elapsed+=delta} export function render2D(index,x,y){rgb(1,0,0)}'

function compiledRuntime(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const prepared = prepareShowV2ForCompile(reopen(record), {
    byCellId: {}, byPatternInstanceId: { instance: statefulSource }, stageDimension: 2,
  })
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, {
    mapPoints: [
      { sample: [0.25, 0.25], pos: [0.25, 0.25] },
      { sample: [0.75, 0.25], pos: [0.75, 0.25] },
    ],
    randomSeed: 1036,
    fidelity,
  })
  const prefix = artifact.summary.clips.find(clip => clip.id === 'instance')?.prefix
  if (!prefix) throw new Error('Compiled Layout fixture omitted its Pattern runtime.')
  return { runtime, prefix, prepared }
}

describe('first-class Layout occurrence edits', () => {
  it('inserts a switch without moving spanning content and resolves half-open time/Zone ownership', () => {
    const record = layoutRecord()
    const before = structuredClone(record)
    expect(validateShowRecordV2(record)).toEqual([])

    const result = editShowLayoutIntervalsV2(record, {
      kind: 'insert', occurrenceId: 'second', atMs: 400, layoutId: 'left-only',
    })

    expect(record).toEqual(before)
    expect(result).toMatchObject({ status: 'changed', affectedLayoutOccurrenceIds: ['first', 'second'] })
    if (result.status !== 'changed') return
    expect(result.record.composition.layoutOccurrences).toEqual([
      { id: 'first', layoutId: 'both', startMs: 0, durationMs: 400, parameters: {} },
      { id: 'second', layoutId: 'left-only', startMs: 400, durationMs: 600, parameters: {} },
    ])
    expect(result.record.composition.clips).toEqual(record.composition.clips)
    expect(showLayoutOccurrenceAtTimeV2(result.record, 399)?.id).toBe('first')
    expect(showLayoutOccurrenceAtTimeV2(result.record, 400)?.id).toBe('second')
    expect(showLayoutOccurrenceAtTimeV2(result.record, 1_000)).toBeNull()
    expect(showLayoutZoneIdAtTimeV2(result.record, 400, 'right')).toBe('left')
  })

  it('refuses an inserted switch when a spanning Clip Zone disappears', () => {
    const record = layoutRecord()
    record.composition.clips[0] = {
      ...record.composition.clips[0], id: 'right-clip', zoneId: 'right', layerId: 'right-layer',
      appearance: { keys: [{ ...record.composition.clips[0].appearance.keys[0], id: 'right-appearance' }] },
    }
    const before = structuredClone(record)
    expect(validateShowRecordV2(record)).toEqual([])

    const result = editShowLayoutIntervalsV2(record, {
      kind: 'insert', occurrenceId: 'second', atMs: 400, layoutId: 'left-only',
    })

    expect(result).toMatchObject({ status: 'refused', code: 'zone-unavailable', record })
    expect(result.record).toBe(record)
    expect(record).toEqual(before)
  })

  it.each(['fast', 'fidelity'] as const)('transiently slices a spanning Clip without restarting its %s runtime', fidelity => {
    const source = layoutRecord()
    const inserted = editShowLayoutIntervalsV2(source, {
      kind: 'insert', occurrenceId: 'second', atMs: 400, layoutId: 'left-only',
    })
    if (inserted.status !== 'changed') throw new Error('message' in inserted ? inserted.message : inserted.status)
    const baseline = compiledRuntime(source, fidelity)
    const switched = compiledRuntime(inserted.record, fidelity)
    for (const timeMs of [399, 400, 401, 999]) {
      const before = baseline.runtime.advanceTo(timeMs, { stepMs: 1, forceFullIntermediateRender: true })
      const after = switched.runtime.advanceTo(timeMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(after.exports[`${switched.prefix}_calls`], `calls at ${timeMs}`).toBe(before.exports[`${baseline.prefix}_calls`])
      expect(after.exports[`${switched.prefix}_elapsed`], `elapsed at ${timeMs}`).toBe(before.exports[`${baseline.prefix}_elapsed`])
      expect(Array.from(after.frame.slice(0, 3)), `left pixel at ${timeMs}`).toEqual([1, 0, 0])
      if (timeMs >= 400 && timeMs < 999) expect(Array.from(after.frame.slice(3, 6)), `re-routed pixel at ${timeMs}`).toEqual([1, 0, 0])
    }
    expect(switched.prepared.provenance.runtimeInstanceIdByClipId).toEqual({ 'left-clip': 'instance' })
  })

  it('moves only the switch boundary and refuses when an occurrence track would leave its owner', () => {
    const inserted = editShowLayoutIntervalsV2(layoutRecord(), {
      kind: 'insert', occurrenceId: 'second', atMs: 400, layoutId: 'both',
    })
    if (inserted.status !== 'changed') throw new Error('message' in inserted ? inserted.message : inserted.status)
    inserted.record.composition.propertyTracks.push({
      id: 'split-track',
      target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: 'second' },
      activeStartMs: 500,
      activeDurationMs: 300,
      keyframes: [
        { id: 'split-start', timeMs: 500, value: 0.2, easing: { curve: 'linear' } },
        { id: 'split-end', timeMs: 800, value: 0.8, easing: { curve: 'linear' } },
      ],
    })
    const before = structuredClone(inserted.record)

    const moved = editShowLayoutIntervalsV2(inserted.record, {
      kind: 'move', occurrenceId: 'second', startMs: 450,
    })

    expect(inserted.record).toEqual(before)
    expect(moved).toMatchObject({
      status: 'changed',
      affectedLayoutOccurrenceIds: ['first', 'second'],
      affectedTrackIds: [],
    })
    if (moved.status !== 'changed') return
    expect(moved.record.composition.layoutOccurrences.map(({ id, startMs, durationMs }) => ({ id, startMs, durationMs }))).toEqual([
      { id: 'first', startMs: 0, durationMs: 450 },
      { id: 'second', startMs: 450, durationMs: 550 },
    ])
    expect(moved.record.composition.clips).toEqual(before.composition.clips)
    expect(moved.record.composition.propertyTracks).toEqual(before.composition.propertyTracks)

    const refused = editShowLayoutIntervalsV2(moved.record, {
      kind: 'move', occurrenceId: 'second', startMs: 600,
    })
    expect(refused).toMatchObject({ status: 'refused', code: 'owned-track-out-of-bounds' })
    expect(refused.record).toBe(moved.record)
  })

  it('selects routing, edits split parameters, and owns one positive incoming transfer', () => {
    const inserted = editShowLayoutIntervalsV2(layoutRecord(), {
      kind: 'insert', occurrenceId: 'second', atMs: 400, layoutId: 'both',
    })
    if (inserted.status !== 'changed') throw new Error('message' in inserted ? inserted.message : inserted.status)

    const selected = editShowLayoutIntervalsV2(inserted.record, {
      kind: 'select-layout', occurrenceId: 'second', layoutId: 'left-only',
    })
    expect(selected).toMatchObject({ status: 'changed', affectedLayoutOccurrenceIds: ['second'] })
    if (selected.status !== 'changed') return
    expect(selected.record.composition.clips).toEqual(inserted.record.composition.clips)

    const parameterized = editShowLayoutIntervalsV2(selected.record, {
      kind: 'set-parameters', occurrenceId: 'second', parameters: { splitPosition: 0.3 },
    })
    expect(parameterized).toMatchObject({ status: 'changed', affectedLayoutOccurrenceIds: ['second'] })
    if (parameterized.status !== 'changed') return
    expect(parameterized.record.composition.layoutOccurrences).toHaveLength(2)
    expect(parameterized.record.composition.layoutOccurrences[1].parameters).toEqual({ splitPosition: 0.3 })

    const transferred = editShowLayoutIntervalsV2(parameterized.record, {
      kind: 'set-transfer',
      occurrenceId: 'second',
      transfer: {
        id: 'transfer', durationMs: 200, direction: 'reverse',
        easing: { curve: 'sine', direction: 'in-out' },
      },
    })
    expect(transferred).toMatchObject({ status: 'changed', affectedLayoutOccurrenceIds: ['second'] })
    if (transferred.status !== 'changed') return
    const transferredRecord = reopen(transferred.record)
    expect(transferredRecord.composition.layoutOccurrences[1].incomingTransfer).toEqual({
      id: 'transfer', fromOccurrenceId: 'first', durationMs: 200, direction: 'reverse',
      easing: { curve: 'sine', direction: 'in-out' },
    })
    expect(validateShowRecordV2(transferredRecord)).toEqual([])

    const cleared = editShowLayoutIntervalsV2(transferred.record, {
      kind: 'set-transfer', occurrenceId: 'second', transfer: null,
    })
    expect(cleared).toMatchObject({ status: 'changed', affectedLayoutOccurrenceIds: ['second'] })
    if (cleared.status === 'changed') expect(cleared.record.composition.layoutOccurrences[1].incomingTransfer).toBeUndefined()
  })

  it('rebinds a later transfer when insertion changes its adjacent source occurrence', () => {
    const second = editShowLayoutIntervalsV2(layoutRecord(), {
      kind: 'insert', occurrenceId: 'second', atMs: 700, layoutId: 'both',
    })
    if (second.status !== 'changed') throw new Error('message' in second ? second.message : second.status)
    const transferred = editShowLayoutIntervalsV2(second.record, {
      kind: 'set-transfer', occurrenceId: 'second',
      transfer: { id: 'later-transfer', durationMs: 100, direction: 'forward' },
    })
    if (transferred.status !== 'changed') throw new Error('message' in transferred ? transferred.message : transferred.status)

    const inserted = editShowLayoutIntervalsV2(transferred.record, {
      kind: 'insert', occurrenceId: 'middle', atMs: 400, layoutId: 'both',
    })

    expect(inserted).toMatchObject({
      status: 'changed',
      affectedLayoutOccurrenceIds: ['first', 'middle', 'second'],
    })
    if (inserted.status === 'changed') {
      expect(inserted.record.composition.layoutOccurrences.find(item => item.id === 'second')?.incomingTransfer?.fromOccurrenceId).toBe('middle')
      expect(validateShowRecordV2(reopen(inserted.record))).toEqual([])
    }
  })

  it('refuses a routing selection that would hide a contributing Zone', () => {
    const record = layoutRecord()
    record.composition.clips[0] = {
      ...record.composition.clips[0], id: 'right-clip', zoneId: 'right', layerId: 'right-layer',
      appearance: { keys: [{ ...record.composition.clips[0].appearance.keys[0], id: 'right-appearance' }] },
    }
    const inserted = editShowLayoutIntervalsV2(record, {
      kind: 'insert', occurrenceId: 'second', atMs: 400, layoutId: 'both',
    })
    if (inserted.status !== 'changed') throw new Error('message' in inserted ? inserted.message : inserted.status)

    const refused = editShowLayoutIntervalsV2(inserted.record, {
      kind: 'select-layout', occurrenceId: 'second', layoutId: 'left-only',
    })

    expect(refused).toMatchObject({ status: 'refused', code: 'zone-unavailable' })
    expect(refused.record).toBe(inserted.record)
  })

  it('makes a repeated Layout definition unique without cloning Zones and removes only plain occurrences', () => {
    const inserted = editShowLayoutIntervalsV2(layoutRecord(), {
      kind: 'insert', occurrenceId: 'second', atMs: 400, layoutId: 'both',
    })
    if (inserted.status !== 'changed') throw new Error('message' in inserted ? inserted.message : inserted.status)
    const before = structuredClone(inserted.record)

    const unique = editShowLayoutIntervalsV2(inserted.record, {
      kind: 'make-unique',
      occurrenceId: 'second',
      layoutId: 'both-copy',
      name: 'Both copy',
    })

    expect(inserted.record).toEqual(before)
    expect(unique).toMatchObject({
      status: 'changed',
      affectedLayoutOccurrenceIds: ['second'],
      affectedLayoutDefinitionIds: ['both-copy'],
    })
    if (unique.status !== 'changed') return
    expect(unique.record.zones).toEqual(before.zones)
    expect(unique.record.zoneLayouts).toEqual([
      ...before.zoneLayouts,
      { ...before.zoneLayouts[0], id: 'both-copy', name: 'Both copy' },
    ])
    expect(unique.record.composition.layoutOccurrences[1].layoutId).toBe('both-copy')

    unique.record.composition.propertyTracks.push({
      id: 'owned',
      target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: 'second' },
      activeStartMs: 500,
      activeDurationMs: 300,
      keyframes: [
        { id: 'owned-a', timeMs: 500, value: 0.2, easing: { curve: 'linear' } },
        { id: 'owned-b', timeMs: 800, value: 0.8, easing: { curve: 'linear' } },
      ],
    })
    const protectedResult = editShowLayoutIntervalsV2(unique.record, {
      kind: 'remove', occurrenceId: 'second',
    })
    expect(protectedResult).toMatchObject({ status: 'refused', code: 'meaningful-occurrence-data' })
    expect(protectedResult.record).toBe(unique.record)

    unique.record.composition.propertyTracks = []
    const removed = editShowLayoutIntervalsV2(unique.record, {
      kind: 'remove', occurrenceId: 'second',
    })
    expect(removed).toMatchObject({
      status: 'changed',
      affectedLayoutOccurrenceIds: ['first'],
      removedLayoutOccurrenceIds: ['second'],
    })
    if (removed.status === 'changed') {
      const reopened = reopen(removed.record)
      expect(reopened.composition.layoutOccurrences).toEqual([
        { id: 'first', layoutId: 'both', startMs: 0, durationMs: 1_000, parameters: {} },
      ])
      expect(removed.record.zoneLayouts.some(layout => layout.id === 'both-copy')).toBe(true)
    }
  })

  it('appends coverage and changes Show End exactly while preserving dormant Markers', () => {
    const record = layoutRecord()
    record.composition.markers.push({ id: 'later-note', name: 'Later', timeMs: 1_400 })
    const appended = editShowLayoutIntervalsV2(record, {
      kind: 'append', occurrenceId: 'second', durationMs: 500, layoutId: 'both',
    })
    expect(appended).toMatchObject({ status: 'changed', affectedLayoutOccurrenceIds: ['second'] })
    if (appended.status !== 'changed') return
    expect(appended.record.composition.showEndMs).toBe(1_500)
    expect(appended.record.composition.layoutOccurrences[1]).toEqual({
      id: 'second', layoutId: 'both', startMs: 1_000, durationMs: 500, parameters: {},
    })
    expect(appended.record.composition.clips).toEqual(record.composition.clips)

    const appendedRecord = reopen(appended.record)
    const shortened = editShowLayoutIntervalsV2(appendedRecord, {
      kind: 'set-show-end', showEndMs: 1_000,
    })
    expect(shortened).toMatchObject({
      status: 'changed',
      affectedLayoutOccurrenceIds: [],
      removedLayoutOccurrenceIds: ['second'],
    })
    if (shortened.status !== 'changed') return
    expect(shortened.record.composition.showEndMs).toBe(1_000)
    expect(shortened.record.composition.layoutOccurrences).toEqual(appended.record.composition.layoutOccurrences.slice(0, 1))
    expect(shortened.record.composition.markers).toEqual(record.composition.markers)

    const extended = editShowLayoutIntervalsV2(shortened.record, {
      kind: 'set-show-end', showEndMs: 1_600,
    })
    expect(extended).toMatchObject({ status: 'changed', affectedLayoutOccurrenceIds: ['first'] })
    if (extended.status === 'changed') {
      expect(extended.record.composition.layoutOccurrences[0].durationMs).toBe(1_600)
      expect(extended.record.composition.markers).toEqual(record.composition.markers)
    }
  })

  it('refuses an appended Zone Layout definition the definition owner refuses, writing nothing', () => {
    const record = layoutRecord()
    const before = structuredClone(record)
    const mismatched = editShowLayoutIntervalsV2(record, {
      kind: 'append', occurrenceId: 'second', durationMs: 500, layoutId: 'fresh-layout',
      definition: { kind: 'add', layoutId: 'other-layout', name: 'Fresh' },
    })
    expect(mismatched).toMatchObject({ status: 'refused', code: 'invalid-intent' })
    expect(mismatched.record).toBe(record)
    const collidingId = editShowLayoutIntervalsV2(record, {
      kind: 'append', occurrenceId: 'second', durationMs: 500, layoutId: 'both',
      definition: { kind: 'add', layoutId: 'both', name: 'Fresh' },
    })
    expect(collidingId).toMatchObject({ status: 'refused', code: 'invalid-intent' })
    expect(collidingId.record).toBe(record)
    const collidingName = editShowLayoutIntervalsV2(record, {
      kind: 'append', occurrenceId: 'second', durationMs: 500, layoutId: 'fresh-layout',
      definition: { kind: 'add', layoutId: 'fresh-layout', name: 'Both' },
    })
    expect(collidingName).toMatchObject({ status: 'refused', code: 'invalid-intent' })
    expect(collidingName.record).toBe(record)
    expect(record).toEqual(before)
  })

  it('refuses Show End shortening across content, track activation, or a timed transfer', () => {
    const record = layoutRecord()
    expect(editShowLayoutIntervalsV2(record, {
      kind: 'set-show-end', showEndMs: 900,
    })).toMatchObject({ status: 'refused', code: 'protected-content' })

    record.composition.clips[0].durationMs = 800
    const inserted = editShowLayoutIntervalsV2(record, {
      kind: 'insert', occurrenceId: 'second', atMs: 700, layoutId: 'both',
    })
    if (inserted.status !== 'changed') throw new Error('message' in inserted ? inserted.message : inserted.status)
    inserted.record.composition.propertyTracks.push({
      id: 'show-track',
      target: { kind: 'show-repeat-scale' },
      activeStartMs: 0,
      activeDurationMs: 950,
      keyframes: [
        { id: 'show-start', timeMs: 0, value: 1, easing: { curve: 'linear' } },
        { id: 'show-end', timeMs: 950, value: 2, easing: { curve: 'linear' } },
      ],
    })
    expect(editShowLayoutIntervalsV2(inserted.record, {
      kind: 'set-show-end', showEndMs: 900,
    })).toMatchObject({ status: 'refused', code: 'protected-content' })

    inserted.record.composition.propertyTracks = []
    const transferred = editShowLayoutIntervalsV2(inserted.record, {
      kind: 'set-transfer', occurrenceId: 'second',
      transfer: { id: 'transfer', durationMs: 250, direction: 'forward' },
    })
    if (transferred.status !== 'changed') throw new Error('message' in transferred ? transferred.message : transferred.status)
    const before = structuredClone(transferred.record)
    const refused = editShowLayoutIntervalsV2(transferred.record, {
      kind: 'set-show-end', showEndMs: 900,
    })
    expect(refused).toMatchObject({ status: 'refused', code: 'protected-content' })
    expect(refused.record).toBe(transferred.record)
    expect(transferred.record).toEqual(before)
  })

  it('allows a Group to span switches where its Zone remains available and rebinds its start association', () => {
    const record = layoutRecord()
    record.composition.clips = []
    record.composition.groupDefinitions = [{
      id: 'group',
      name: 'Spanning Group',
      patternInstances: structuredClone(record.composition.patternInstances),
      layers: [{ id: 'group-layer', name: 'Main', rank: 0 }],
      clips: [{
        id: 'child', instanceId: 'instance', layerId: 'group-layer',
        startMs: 0, durationMs: 600, entryPolicy: 'continue', zoneSampleMode: 'span',
        appearance: { keys: [{
          id: 'child-appearance', timeMs: 0,
          value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
        }] },
      }],
      transitions: [],
      propertyTracks: [],
    }]
    record.composition.groupOccurrences = [{
      id: 'group-use', definitionId: 'group', layoutOccurrenceId: 'first', zoneId: 'left',
      startMs: 200, translationX: 0, translationY: 0,
      layerBindings: [{ definitionLayerId: 'group-layer', layerId: 'left-layer' }],
      holds: [],
    }]
    expect(validateShowRecordV2(record)).toEqual([])

    const unavailable = structuredClone(record)
    unavailable.composition.groupOccurrences[0].zoneId = 'right'
    unavailable.composition.groupOccurrences[0].layerBindings[0].layerId = 'right-layer'
    expect(editShowLayoutIntervalsV2(unavailable, {
      kind: 'insert', occurrenceId: 'second', atMs: 400, layoutId: 'left-only',
    })).toMatchObject({ status: 'refused', code: 'zone-unavailable' })

    const inserted = editShowLayoutIntervalsV2(record, {
      kind: 'insert', occurrenceId: 'second', atMs: 400, layoutId: 'left-only',
    })
    expect(inserted).toMatchObject({ status: 'changed' })
    if (inserted.status !== 'changed') return
    expect(validateShowRecordV2(inserted.record)).toEqual([])
    expect(inserted.record.composition.groupOccurrences[0].layoutOccurrenceId).toBe('first')
    const prepared = prepareShowV2ForCompile(reopen(inserted.record), {
      byCellId: {}, byPatternInstanceId: { instance: statefulSource }, stageDimension: 2,
    })
    expect(prepared.status).toBe('ready')
    if (prepared.status === 'ready') {
      expect(() => compileShow(prepared.recipe, LIBRARIES)).not.toThrow()
    }

    const moved = editShowLayoutIntervalsV2(inserted.record, {
      kind: 'move', occurrenceId: 'second', startMs: 100,
    })
    expect(moved).toMatchObject({
      status: 'changed',
      affectedGroupOccurrenceIds: ['group-use'],
    })
    if (moved.status === 'changed') {
      expect(moved.record.composition.groupOccurrences[0].layoutOccurrenceId).toBe('second')
      expect(moved.record.composition.groupOccurrences[0].startMs).toBe(200)
    }
  })

  it('includes Transition contribution windows in Zone availability', () => {
    const record = layoutRecord()
    const source = { ...structuredClone(record.composition.clips[0]), id: 'source', durationMs: 400 }
    const target = {
      ...structuredClone(record.composition.clips[0]),
      id: 'target', instanceId: 'instance', zoneId: 'right', layerId: 'right-layer', startMs: 500, durationMs: 500,
      appearance: { keys: [{ ...record.composition.clips[0].appearance.keys[0], id: 'target-appearance', timeMs: 500 }] },
    }
    record.composition.clips = [source, target]
    record.composition.transitions = [{
      id: 'whole', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' },
      wholeOutput: { startMs: 400, fromClipIds: ['source'], toClipIds: ['target'] },
      participants: [], propertyRamps: [], crossfadePolicy: 'snapshot-live',
    }]
    const inserted = editShowLayoutIntervalsV2(record, {
      kind: 'insert', occurrenceId: 'second', atMs: 400, layoutId: 'both',
    })
    if (inserted.status !== 'changed') throw new Error('message' in inserted ? inserted.message : inserted.status)
    const selected = editShowLayoutIntervalsV2(inserted.record, {
      kind: 'select-layout', occurrenceId: 'first', layoutId: 'left-only',
    })
    if (selected.status !== 'changed') throw new Error('message' in selected ? selected.message : selected.status)
    expect(validateClipLayoutAvailabilityV2(selected.record)).toEqual([])

    const moved = structuredClone(selected.record)
    moved.composition.layoutOccurrences[0].durationMs = 450
    moved.composition.layoutOccurrences[1].startMs = 450
    moved.composition.layoutOccurrences[1].durationMs = 550
    expect(validateClipLayoutAvailabilityV2(moved, ['target'])).toEqual([{
      entityKind: 'clip',
      entityId: 'target',
      zoneId: 'right',
      startMs: 400,
      endMs: 1_000,
      layoutOccurrenceId: 'first',
      layoutId: 'left-only',
    }])
    expect(editShowLayoutIntervalsV2(selected.record, {
      kind: 'move', occurrenceId: 'second', startMs: 450,
    })).toMatchObject({ status: 'refused', code: 'zone-unavailable' })
  })
})

describe('remove-switch routing marker removal (#1066 rt-corrective)', () => {
  function threeOccurrences(): ShowRecordV2 {
    const first = editShowLayoutIntervalsV2(layoutRecord(), {
      kind: 'insert', occurrenceId: 'second', atMs: 400, layoutId: 'both',
    })
    if (first.status !== 'changed') throw new Error('setup insert second failed')
    const second = editShowLayoutIntervalsV2(first.record, {
      kind: 'insert', occurrenceId: 'third', atMs: 700, layoutId: 'both',
    })
    if (second.status !== 'changed') throw new Error('setup insert third failed')
    return second.record
  }
  it('removes a timed transfer, merging into the predecessor and re-pointing the successor', () => {
    const base = threeOccurrences()
    const ordered = [...base.composition.layoutOccurrences].sort((left, right) => left.startMs - right.startMs)
    const [first, second, third] = ordered
    const withTransfers = structuredClone(base)
    withTransfers.composition.layoutOccurrences.find(entry => entry.id === second.id)!.incomingTransfer = {
      id: 'transfer-2', fromOccurrenceId: first.id, durationMs: 100, direction: 'forward',
    }
    withTransfers.composition.layoutOccurrences.find(entry => entry.id === third.id)!.incomingTransfer = {
      id: 'transfer-3', fromOccurrenceId: second.id, durationMs: 100, direction: 'forward',
    }
    const result = editShowLayoutIntervalsV2(withTransfers, { kind: 'remove-switch', occurrenceId: second.id } as never)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.removedLayoutOccurrenceIds).toEqual([second.id])
    expect(result.record.composition.layoutOccurrences.map(entry => entry.id)).toEqual([first.id, third.id])
    const keptFirst = result.record.composition.layoutOccurrences.find(entry => entry.id === first.id)!
    expect(keptFirst.durationMs).toBe(first.durationMs + second.durationMs)
    const keptThird = result.record.composition.layoutOccurrences.find(entry => entry.id === third.id)!
    expect(keptThird.incomingTransfer?.fromOccurrenceId).toBe(first.id)
    expect(keptThird.incomingTransfer?.id).toBe('transfer-3')
    expect(result.record.composition.layoutOccurrences.some(entry => entry.id === second.id)).toBe(false)
    expect(validateShowRecordV2(result.record)).toEqual([])
  })
  it('removes a native Cut, merging into the predecessor and re-pointing the successor', () => {
    const base = threeOccurrences()
    const ordered = [...base.composition.layoutOccurrences].sort((left, right) => left.startMs - right.startMs)
    const [first, second, third] = ordered
    const withCut = structuredClone(base)
    withCut.composition.layoutOccurrences.find(entry => entry.id === third.id)!.incomingTransfer = {
      id: 'transfer-3', fromOccurrenceId: second.id, durationMs: 100, direction: 'forward',
    }
    const result = editShowLayoutIntervalsV2(withCut, { kind: 'remove-switch', occurrenceId: second.id } as never)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.removedLayoutOccurrenceIds).toEqual([second.id])
    expect(result.record.composition.layoutOccurrences.map(entry => entry.id)).toEqual([first.id, third.id])
    expect(result.record.composition.layoutOccurrences.find(entry => entry.id === first.id)!.durationMs)
      .toBe(first.durationMs + second.durationMs)
    expect(result.record.composition.layoutOccurrences.find(entry => entry.id === third.id)?.incomingTransfer?.fromOccurrenceId)
      .toBe(first.id)
    expect(validateShowRecordV2(result.record)).toEqual([])
  })
  it('removes a converted switch, dropping stale successor provenance', () => {
    const base = threeOccurrences()
    const ordered = [...base.composition.layoutOccurrences].sort((left, right) => left.startMs - right.startMs)
    const [first, second, third] = ordered
    const withSwitch = structuredClone(base)
    withSwitch.composition.layoutOccurrences.find(entry => entry.id === second.id)!.incomingSwitch = {
      origin: 'converted-routing-cut', id: 'switch-2', fromOccurrenceId: first.id, easing: { curve: 'linear' },
    } as never
    withSwitch.composition.layoutOccurrences.find(entry => entry.id === third.id)!.incomingTransfer = {
      id: 'transfer-3', fromOccurrenceId: second.id, durationMs: 100, direction: 'forward',
    }
    const result = editShowLayoutIntervalsV2(withSwitch, { kind: 'remove-switch', occurrenceId: second.id } as never)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.layoutOccurrences.map(entry => entry.id)).toEqual([first.id, third.id])
    expect(result.record.composition.layoutOccurrences.find(entry => entry.id === third.id)?.incomingTransfer?.fromOccurrenceId)
      .toBe(first.id)
    expect(result.record.composition.layoutOccurrences.some(entry => entry.incomingSwitch)).toBe(false)
    const stale = structuredClone(base)
    stale.composition.layoutOccurrences.find(entry => entry.id === second.id)!.incomingSwitch = {
      origin: 'converted-routing-cut', id: 'switch-2', fromOccurrenceId: first.id, easing: { curve: 'linear' },
    } as never
    stale.composition.layoutOccurrences.find(entry => entry.id === third.id)!.incomingSwitch = {
      origin: 'converted-routing-cut', id: 'switch-3', fromOccurrenceId: second.id, easing: { curve: 'linear' },
    } as never
    const dropped = editShowLayoutIntervalsV2(stale, { kind: 'remove-switch', occurrenceId: second.id } as never)
    expect(dropped.status).toBe('changed')
    if (dropped.status !== 'changed') return
    expect(dropped.record.composition.layoutOccurrences.find(entry => entry.id === third.id)?.incomingSwitch).toBeUndefined()
  })
  it('refuses when the occurrence owns a split-position track', () => {
    const base = threeOccurrences()
    const ordered = [...base.composition.layoutOccurrences].sort((left, right) => left.startMs - right.startMs)
    const tracked = structuredClone(base)
    tracked.composition.propertyTracks.push({
      id: 'owned', target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: ordered[1].id },
      activeStartMs: ordered[1].startMs, activeDurationMs: 100,
      keyframes: [
        { id: 'owned-a', timeMs: ordered[1].startMs, value: 0.2, easing: { curve: 'linear' } },
        { id: 'owned-b', timeMs: ordered[1].startMs + 100, value: 0.8, easing: { curve: 'linear' } },
      ],
    })
    expect(editShowLayoutIntervalsV2(tracked, { kind: 'remove-switch', occurrenceId: ordered[1].id } as never))
      .toMatchObject({ status: 'refused', code: 'meaningful-occurrence-data' })
  })
  it('refuses the first occurrence', () => {
    const base = threeOccurrences()
    const ordered = [...base.composition.layoutOccurrences].sort((left, right) => left.startMs - right.startMs)
    expect(editShowLayoutIntervalsV2(base, { kind: 'remove-switch', occurrenceId: ordered[0].id } as never).status).toBe('refused')
  })
})
