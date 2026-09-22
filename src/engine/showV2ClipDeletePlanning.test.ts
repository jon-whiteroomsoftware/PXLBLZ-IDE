import { describe, expect, it } from 'vitest'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { createDefaultShow } from './showModel'
import { resizeBoundaryShow } from '@/agent-harness/baseline/fixtures'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { propertyEditRecord } from '@/test/showV2PropertyEditsFixture'
import { deleteShowClipInShow } from './showClipDeletion'
import { showRecordClipCount } from './showClipInvariant'
import { validateShowComposition } from './showCompositionModel'
import type { ShowRecord } from './personalContentRecords'
import {
  planShowV2ClipDelete,
  showV2ClipCount,
  showV2ConnectedTransitionIds,
} from './showV2ClipDeletePlanning'

const LEFT = 'placement-cell-1-scene-1'
const RIGHT = 'placement-cell-2-scene-2'
const BOUNDARY = 'transition-scene-1'

function convertedDefaultShow(): ShowRecordV2 {
  const source = createDefaultShow('boundary-repair', 'Boundary repair', 1)
  const byCellId = Object.fromEntries(
    source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]]),
  )
  const converted = convertShowRecordV1ToV2(source, { byCellId })
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  expect(converted.record.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
    [LEFT, 0, 30000],
    [RIGHT, 32000, 30000],
  ])
  expect(converted.record.composition.showEndMs).toBe(62000)
  return converted.record
}

function twoClipRecord(id: string) {
  const source: ShowRecord = resizeBoundaryShow(id)
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  expect(validateShowRecordV2(converted.record)).toEqual([])
  return converted.record
}

describe('planShowV2ClipDelete', () => {
  it('plans a free Clip as a bare delete-clip intent', () => {
    const record = twoClipRecord('delete-plan-free')
    const target = record.composition.clips[0].id
    const plan = planShowV2ClipDelete(record, target, { confirmed: false, allocate: () => 'fresh-1' })
    expect(plan).toEqual({ kind: 'ready', intent: { kind: 'delete-clip', clipId: target } })
    expect(showV2ConnectedTransitionIds(record, target)).toEqual([])
  })
  it('asks for confirmation when the Clip carries a joined Transition', () => {
    const record = twoClipRecord('delete-plan-joined')
    const first = record.composition.clips[0]
    const second = record.composition.clips[1]
    first.startMs = 0
    first.durationMs = 4000
    second.startMs = 4000
    second.durationMs = 4000
    const target = first.id
    record.composition.transitions = [{
      id: 'join',
      kind: 'crossfade',
      durationMs: 500,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
      participants: [{ id: 'join-p', fromClipId: first.id, toClipId: second.id, zoneId: first.zoneId, layerId: first.layerId }],
      wholeOutput: undefined as never,
      propertyRamps: [],
    }]
    const connected = showV2ConnectedTransitionIds(record, target)
    expect(connected).toEqual(['join'])
    expect(planShowV2ClipDelete(record, target, { confirmed: false, allocate: () => 'x' })).toEqual({ kind: 'needs-confirm', clipId: target, connectedTransitionIds: ['join'] })
    expect(planShowV2ClipDelete(record, target, { confirmed: true, allocate: () => 'x' }).kind).toBe('ready')
  })
  it('does not ask for confirmation across a converted Scene boundary, as v1 does not', () => {
    for (const id of [LEFT, RIGHT]) {
      const record = convertedDefaultShow()
      expect(record.composition.transitions.map((t) => t.id)).toEqual([BOUNDARY])
      expect(showV2ConnectedTransitionIds(record, id)).toEqual([])
      const plan = planShowV2ClipDelete(record, id, { confirmed: false, allocate: () => 'x' })
      expect(plan).toEqual({ kind: 'ready', intent: { kind: 'delete-clip', clipId: id } })
      if (plan.kind !== 'ready') throw new Error('not ready')
      expect(editShowTransitionV2(record, plan.intent).status).toBe('changed')
    }
  })
  it('still asks for a converted Layer Transition', () => {
    const record = twoClipRecord('delete-plan-joined')
    const first = record.composition.clips[0]
    const second = record.composition.clips[1]
    first.startMs = 0
    first.durationMs = 4000
    second.startMs = 4000
    second.durationMs = 4000
    const target = first.id
    record.composition.transitions = [{
      id: 'join',
      kind: 'crossfade',
      durationMs: 500,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
      origin: 'converted-layer-transition',
      participants: [{ id: 'join-p', fromClipId: first.id, toClipId: second.id, zoneId: first.zoneId, layerId: first.layerId }],
      wholeOutput: undefined as never,
      propertyRamps: [],
    }]
    const connected = showV2ConnectedTransitionIds(record, target)
    expect(connected).toEqual(['join'])
    expect(planShowV2ClipDelete(record, target, { confirmed: false, allocate: () => 'x' })).toEqual({ kind: 'needs-confirm', clipId: target, connectedTransitionIds: ['join'] })
    expect(planShowV2ClipDelete(record, target, { confirmed: true, allocate: () => 'x' }).kind).toBe('ready')
  })
  it('refuses the final remaining Clip', () => {
    const record = propertyEditRecord()
    const single = structuredClone(record)
    single.composition.clips = [single.composition.clips[0]]
    single.composition.groupOccurrences = []
    single.composition.groupDefinitions = []
    expect(showV2ClipCount(single)).toBe(1)
    expect(planShowV2ClipDelete(single, single.composition.clips[0].id, { confirmed: true, allocate: () => 'x' })).toEqual({ kind: 'refuse', reason: 'final-clip', message: 'A Show must contain at least one Clip.' })
  })
  it('refuses group-child and missing identities without allocating', () => {
    const record = twoClipRecord('delete-plan-group-missing')
    let allocated = 0
    const counting = () => `fresh-${++allocated}`
    expect(planShowV2ClipDelete(record, 'occ-0:child', { confirmed: true, allocate: counting })).toMatchObject({ kind: 'refuse', reason: 'group-child' })
    expect(planShowV2ClipDelete(record, 'missing', { confirmed: true, allocate: counting })).toMatchObject({ kind: 'refuse', reason: 'missing-clip' })
    expect(planShowV2ClipDelete(record, '  ', { confirmed: true, allocate: counting })).toMatchObject({ kind: 'refuse', reason: 'invalid-request' })
    expect(allocated).toBe(0)
  })
  it('carries ramp projections for a property-carrying Transition', async () => {
    const { transitionV1Show } = await import('@/test/showV2TracerFixture')
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const record = converted.record
    record.composition.transitions = [{
      id: 'boundary', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' },
      crossfadePolicy: 'live-live', participants: [],
      wholeOutput: { startMs: 400, fromClipIds: ['out'], toClipIds: ['in'] },
      propertyRamps: [{ target: { kind: 'show-repeat-scale' }, from: 2, easing: { curve: 'quadratic', direction: 'in' } }],
    }]
    expect(validateShowRecordV2(record)).toEqual([])
    let serial = 0
    const plan = planShowV2ClipDelete(record, 'out', { confirmed: true, allocate: () => `ramp-${++serial}` })
    expect(plan.kind).toBe('ready')
    if (plan.kind !== 'ready') return
    expect(plan.intent.propertyRampProjections).toHaveLength(1)
    expect(editShowTransitionV2(record, plan.intent).status).toBe('changed')
  })
})
 
describe('layout-segmented and guarded deletes (#1068 gaps)', () => {
  const probeView = { mirror: false, phase: 0, brightness: 1 }

  function layoutSegmentedSingleLogicalClipShow(): ShowRecord {
    const show = convertibleV1Show()
    show.id = 'layout-segmented-single-clip'
    show.name = 'Layout segmented single Clip'
    show.scenes = [
      { id: 'a', name: 'A', durationMs: 400 },
      { id: 'b', name: 'B', durationMs: 400 },
      { id: 'c', name: 'C', durationMs: 400 },
    ]
    show.zones = [
      { id: 'zone', name: 'Main', nominalPixelCount: 16 },
      { id: 'other', name: 'Other', nominalPixelCount: 16 },
    ]
    show.routingLayouts = [
      { id: 'full', name: 'Full', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } },
      { id: 'other-only', name: 'Other only', zones: [], logical: { kind: 'single', zoneIds: ['other'] } },
    ]
    show.transitions = [
      { id: 'to-other', afterSceneId: 'a', kind: 'routing', layoutId: 'other-only', durationMs: 0, easing: { curve: 'linear' } },
      { id: 'to-full', afterSceneId: 'b', kind: 'routing', layoutId: 'full', durationMs: 0, easing: { curve: 'linear' } },
    ]
    show.composition = {
      version: 1,
      executionModel: 'deterministic-loop',
      durationMs: 1_200,
      patternInstances: [{
        id: 'instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: (['a', 'b', 'c'] as const).map((sceneId, index) => ({
        sceneId,
        zones: [
          {
            zoneId: 'zone',
            main: [{
              id: index === 0 ? 'solo' : `solo--span-${sceneId}`,
              ...(index === 0 ? {} : { logicalClipId: 'solo' }),
              instanceId: 'instance', startMs: 0, durationMs: 400, view: probeView,
            }],
            overlays: [],
          },
          { zoneId: 'other', main: [], overlays: [] },
        ],
      })),
    }
    return show
  }

  function boundaryDeleteFixture(): ShowRecord {
    const show = convertibleV1Show()
    show.id = 'boundary-delete'
    show.name = 'Boundary delete'
    show.scenes = [
      { id: 's1', name: 'Outgoing', durationMs: 400 },
      { id: 's2', name: 'Incoming', durationMs: 400 },
    ]
    show.transitions = [{
      id: 'x', afterSceneId: 's1', kind: 'crossfade', durationMs: 200,
      easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
    }]
    show.composition = {
      version: 1,
      executionModel: 'deterministic-loop',
      durationMs: 1_000,
      patternInstances: [
        {
          id: 'i1', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'Outgoing',
          time: { timeScale: 1, timeOffsetMs: 0 },
        },
        {
          id: 'i2', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Incoming',
          time: { timeScale: 1, timeOffsetMs: 0 },
        },
      ],
      scenes: [
        {
          sceneId: 's1',
          zones: [{
            zoneId: 'zone',
            main: [{ id: 'outgoing', instanceId: 'i1', startMs: 0, durationMs: 400, view: probeView }],
            overlays: [],
          }],
        },
        {
          sceneId: 's2',
          zones: [{
            zoneId: 'zone',
            main: [{ id: 'incoming', instanceId: 'i2', startMs: 0, durationMs: 400, view: probeView }],
            overlays: [],
          }],
        },
      ],
    }
    return show
  }

  // The converter splits one v1 logical Clip into `solo--layout-1` and
  // `solo--layout-2` wherever its Zone is unavailable for part of its span.
  // ShowClipV2 carries no logical-clip provenance (the #1065 contract names
  // exactly three provenance owners and clips are not one, and the schema
  // closes clips with additionalProperties: false), so the record cannot
  // recover the segments of one former logical Clip without an id-shape
  // heuristic the contract bars. Pinned as a #1068 gap: v1 counts and deletes
  // the logical Clip (deduped count 1, so the editor refuses with Keep one
  // Clip), while v2 counts two runs, admits the delete, and removes only one
  // segment. When the gap closes this test fails and forces an update.
  it('counts and deletes a layout-segmented logical Clip per run, unlike v1 (#1068)', () => {
    const show = layoutSegmentedSingleLogicalClipShow()
    expect(validateShowComposition(show, show.composition!)).toEqual([])
    expect(showRecordClipCount(show)).toBe(1)
    expect(deleteShowClipInShow(show, show.composition!, {
      kind: 'main', sceneId: 'a', zoneId: 'zone', placementId: 'solo',
    })).toMatchObject({ status: 'refused' })
    const converted = convertShowRecordV1ToV2(show)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const record = converted.record
    expect(validateShowRecordV2(record)).toEqual([])
    expect(record.composition.clips.map((clip) => clip.id).sort()).toEqual(['solo--layout-1', 'solo--layout-2'])
    expect(showV2ClipCount(record)).toBe(2)
    const plan = planShowV2ClipDelete(record, 'solo--layout-1', { confirmed: true, allocate: () => 'unused' })
    expect(plan.kind).toBe('ready')
    if (plan.kind !== 'ready') return
    const applied = editShowTransitionV2(record, plan.intent)
    expect(applied.status).toBe('changed')
    expect(applied.record.composition.clips.map((clip) => clip.id)).toEqual(['solo--layout-2'])
    expect(validateShowRecordV2(applied.record)).toEqual([])
  })

  // v1 refuses a delete whose boundary repair meets armed Trails output
  // effects; the v2 owner has no such guard. Pinned as #1068 gap 6: the
  // converted record keeps the armed Trails effect, yet the confirmed plan is
  // ready and the owner applies it. When the gap closes this test fails and
  // forces an update.
  it('admits a Trails-armed delete v1 refuses (#1068 gap 6)', () => {
    const show = boundaryDeleteFixture()
    show.outputEffects = [{ id: 'trails', kind: 'trails', retention: 0.8 }]
    expect(validateShowComposition(show, show.composition!)).toEqual([])
    expect(deleteShowClipInShow(show, show.composition!, {
      kind: 'main', sceneId: 's2', zoneId: 'zone', placementId: 'incoming',
    })).toMatchObject({ status: 'refused', reason: 'output-feedback-state' })
    const converted = convertShowRecordV1ToV2(show)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    expect(validateShowRecordV2(converted.record)).toEqual([])
    expect(converted.record.outputEffects?.some((effect) => effect.kind === 'trails')).toBe(true)
    const plan = planShowV2ClipDelete(converted.record, 'incoming', { confirmed: true, allocate: () => 'unused' })
    expect(plan).toMatchObject({ kind: 'ready' })
    if (plan.kind !== 'ready') return
    const applied = editShowTransitionV2(converted.record, plan.intent)
    expect(applied.status).toBe('changed')
    expect(applied.record.composition.clips.some((clip) => clip.id === 'incoming')).toBe(false)
    expect(validateShowRecordV2(applied.record)).toEqual([])
  })

  // v1 refuses a delete whose boundary repair meets a Pattern instance shared
  // across the removed boundary; the v2 owner has no such guard. Pinned as
  // #1068 gap 6: the confirmed plan is ready and the owner applies it. When
  // the gap closes this test fails and forces an update.
  it('admits a shared-instance delete v1 refuses (#1068 gap 6)', () => {
    const show = boundaryDeleteFixture()
    show.composition!.scenes[1].zones[0].overlays = [{
      id: 'keep-layer', name: 'Keep',
      placements: [{ id: 'overlay-keep', instanceId: 'i1', startMs: 100, durationMs: 300, view: probeView, opacity: 1 }],
    }]
    expect(validateShowComposition(show, show.composition!)).toEqual([])
    expect(deleteShowClipInShow(show, show.composition!, {
      kind: 'main', sceneId: 's2', zoneId: 'zone', placementId: 'incoming',
    })).toMatchObject({ status: 'refused', reason: 'cross-boundary-shared-instance' })
    const converted = convertShowRecordV1ToV2(show)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    expect(validateShowRecordV2(converted.record)).toEqual([])
    const plan = planShowV2ClipDelete(converted.record, 'incoming', { confirmed: true, allocate: () => 'unused' })
    expect(plan).toMatchObject({ kind: 'ready' })
    if (plan.kind !== 'ready') return
    const applied = editShowTransitionV2(converted.record, plan.intent)
    expect(applied.status).toBe('changed')
    expect(applied.record.composition.clips.some((clip) => clip.id === 'incoming')).toBe(false)
    expect(validateShowRecordV2(applied.record)).toEqual([])
  })
})
