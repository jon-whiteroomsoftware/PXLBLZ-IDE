import { describe, expect, it, vi } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertTransitionClipRampProbe } from '../test/showV2TransitionClipRampFixture'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { editShowClipTemporalV2 } from './showClipTemporalV2'
import { editShowClipV2 } from './showClipsV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import { projectShowTimelineV2 } from './showTimelineViewModelV2'
import type { ShowPreparedStageDependenciesV2 } from './showPreparedStageV2'
import {
  checkShowTimelineDuplicateGestureV2,
  planShowTimelineGestureV2,
  resolveShowTimelineClipDropV2,
  resolveShowTimelineEdgeDropV2,
  showTimelineConnectedItemIdsV2,
  showTimelineGestureStepMs,
  type ShowTimelineGestureV2,
} from './showTimelineGesturesV2'

const DEPENDENCIES: ShowPreparedStageDependenciesV2 = {
  patterns: [], maps: [], libraries: [], profiles: [], stageMap: null,
}

/** Two Clips on one Layer joined by a 200 ms Crossfade, inside a four-second Show. */
function converted(): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (result.status !== 'converted') throw new Error(JSON.stringify(result.issues))
  const record = result.record
  record.composition.showEndMs = 4_000
  record.composition.layoutOccurrences[0].durationMs = 4_000
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

/** The same Show with no Transition, so each Clip moves and resizes alone. */
function detached(): ShowRecordV2 {
  const record = converted()
  record.composition.transitions = []
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function capture(record: ShowRecordV2) {
  return { record, dependencies: DEPENDENCIES, prepared: { status: 'empty' as const, record } }
}

function allocator(prefix: string): (() => string) & { calls: () => number } {
  let index = 0
  const allocate = () => `${prefix}-${++index}`
  return Object.assign(allocate, { calls: () => index })
}

function plan(record: ShowRecordV2, gesture: ShowTimelineGestureV2, prefix = 'fresh') {
  const allocate = allocator(prefix)
  return { result: planShowTimelineGestureV2(capture(record), gesture, allocate), allocate }
}

describe('v2 timeline gesture adapters', () => {
  it('maps a same-Layer drag onto the temporal move intent and reports an unmoved drop as no-op', () => {
    const record = converted()
    const clip = record.composition.clips[0]
    const moved = plan(record, {
      kind: 'move', clipId: 'out', startMs: 1_000, zoneId: clip.zoneId, layerId: clip.layerId,
    })

    expect(moved.result).toEqual({
      status: 'ready',
      submission: { owner: 'clip-temporal', intent: { kind: 'move', clipId: 'out', startMs: 1_000 } },
    })
    // Identity belongs to the owners that need it; a move needs none.
    expect(moved.allocate.calls()).toBe(0)
    expect(record).toEqual(converted())

    expect(plan(record, {
      kind: 'move', clipId: 'out', startMs: clip.startMs, zoneId: clip.zoneId, layerId: clip.layerId,
    }).result).toEqual({ status: 'unchanged' })
  })

  it('maps a drag onto another Layer of the Zone onto the re-placement intent', () => {
    const record = detached()
    const destination = record.composition.layers.find(layer => layer.rank === 1)!

    expect(plan(record, {
      kind: 'move', clipId: 'out', startMs: 800, zoneId: destination.zoneId, layerId: destination.id,
    }).result).toEqual({
      status: 'ready',
      submission: {
        owner: 'clip-temporal',
        intent: {
          kind: 'replace-placement', clipId: 'out', zoneId: destination.zoneId, layerId: destination.id, startMs: 800,
          detachParticipantTransitions: true,
        },
      },
    })
  })

  it('grants the detach permission on a joined cross-Layer drag, and the owner honours it', () => {
    const record = converted()
    const destination = record.composition.layers.find(layer => layer.rank === 1)!
    const planned = plan(record, {
      kind: 'move', clipId: 'out', startMs: 800, zoneId: destination.zoneId, layerId: destination.id,
    })
    expect(planned.result).toEqual({
      status: 'ready',
      submission: {
        owner: 'clip-temporal',
        intent: {
          kind: 'replace-placement', clipId: 'out', zoneId: destination.zoneId, layerId: destination.id, startMs: 800,
          detachParticipantTransitions: true,
        },
      },
    })
    if (planned.result.status !== 'ready' || planned.result.submission.owner !== 'clip-temporal') return
    // The granted permission is real: the same intent through the owner
    // detaches the join and moves only the dragged Clip.
    const applied = editShowClipTemporalV2(record, planned.result.submission.intent)
    expect(applied.status, JSON.stringify(applied)).toBe('changed')
    if (applied.status !== 'changed') return
    expect(applied.record.composition.transitions).toEqual([])
    expect(applied.record.composition.clips.find(clip => clip.id === 'out'))
      .toMatchObject({ layerId: destination.id, startMs: 800 })
    expect(applied.record.composition.clips.find(clip => clip.id === 'in'))
      .toMatchObject({ startMs: 600 })
  })

  it.each([
    ['trailing', 'grows', 900, { kind: 'extend', clipId: 'out', startMs: 0, endMs: 900 }],
    ['trailing', 'shrinks', 300, { kind: 'trim', clipId: 'out', startMs: 0, endMs: 300 }],
  ] as const)('maps a %s resize that %s onto the temporal bounds intent', (_edge, _direction, endMs, intent) => {
    expect(plan(detached(), { kind: 'resize-trailing', clipId: 'out', endMs }).result)
      .toEqual({ status: 'ready', submission: { owner: 'clip-temporal', intent } })
  })

  it.each([
    ['later', 800, { kind: 'trim', clipId: 'in', startMs: 800, endMs: 1_000 }],
    ['earlier', 500, { kind: 'extend', clipId: 'in', startMs: 500, endMs: 1_000 }],
  ] as const)('maps a leading resize that starts %s onto the temporal bounds intent', (_direction, startMs, intent) => {
    expect(plan(detached(), { kind: 'resize-leading', clipId: 'in', startMs }).result)
      .toEqual({ status: 'ready', submission: { owner: 'clip-temporal', intent } })
  })

  it.each([
    ['trailing', { kind: 'resize-trailing', clipId: 'out', endMs: 400 } as const],
    ['leading', { kind: 'resize-leading', clipId: 'out', startMs: 0 } as const],
  ])('reports an unmoved %s edge as no-op', (_edge, gesture) => {
    expect(plan(detached(), gesture).result).toEqual({ status: 'unchanged' })
  })

  it('carries complete ramp projections when a leading resize closes a carrier Transition', () => {
    const record = converted()
    record.composition.transitions = [{
      id: 'boundary', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
      participants: [], wholeOutput: { startMs: 400, fromClipIds: ['out'], toClipIds: ['in'] },
      propertyRamps: [{ target: { kind: 'show-repeat-scale' }, from: 3, easing: { curve: 'linear' } }],
    }]
    expect(validateShowRecordV2(record)).toEqual([])

    // Dragging the incoming edge back onto its outgoing neighbour closes the
    // window, so the Reset owner needs the carrier's ramps projected first.
    const closed = plan(record, { kind: 'resize-leading', clipId: 'in', startMs: 400 }, 'ramp').result
    expect(closed).toEqual({
      status: 'ready',
      submission: {
        owner: 'clip-temporal',
        intent: {
          kind: 'extend',
          clipId: 'in',
          startMs: 400,
          endMs: 1_000,
          propertyRampProjections: [{
            rampIndex: 0, trackId: 'ramp-1', startKeyId: 'ramp-2', endKeyId: 'ramp-3',
            activeEndMs: 600, toValue: record.composition.sampleRemap.repeatScale,
          }],
        },
      },
    })
    if (closed.status !== 'ready') return
    const applied = editShowClipTemporalV2(record, closed.submission.intent as never)
    expect(applied.status).toBe('changed')

    // A resize that only narrows the window keeps the carrier and needs none.
    const narrowed = plan(record, { kind: 'resize-leading', clipId: 'in', startMs: 500 }, 'ramp').result
    expect(narrowed.status).toBe('ready')
    if (narrowed.status !== 'ready') return
    expect(narrowed.submission.intent).not.toHaveProperty('propertyRampProjections')
  })

  it('allocates one fresh right Clip for an interior split and refuses a boundary before allocating', () => {
    const record = detached()
    const split = plan(record, { kind: 'split', clipId: 'out', atMs: 250 }, 'split')

    expect(split.result).toEqual({
      status: 'ready',
      submission: { owner: 'clip-temporal', intent: { kind: 'split', clipId: 'out', atMs: 250, rightClipId: 'split-1' } },
      selectAfterId: 'split-1',
    })
    expect(split.allocate.calls()).toBe(1)

    for (const atMs of [0, 400, 401, 250.5]) {
      const refused = plan(record, { kind: 'split', clipId: 'out', atMs }, 'split')
      expect(refused.result).toMatchObject({ status: 'refused' })
      expect(refused.allocate.calls()).toBe(0)
    }
  })

  it('duplicates linked: the copy keeps the source runtime and mints no Pattern instance', () => {
    const record = detached()
    const clip = record.composition.clips[0]
    const duplicated = plan(record, {
      kind: 'duplicate', clipId: 'out', startMs: 2_000, zoneId: clip.zoneId, layerId: clip.layerId,
    }, 'copy').result

    expect(duplicated).toMatchObject({
      status: 'ready',
      submission: {
        owner: 'clip-sharing',
        intent: {
          kind: 'duplicate', clipId: 'out', zoneId: clip.zoneId, layerId: clip.layerId, startMs: 2_000,
          identities: { clipId: 'copy-1', appearanceKeyIdsBySourceId: { 'out:appearance:1': 'copy-2' } },
        },
      },
      selectAfterId: 'copy-1',
    })
    if (duplicated.status !== 'ready' || duplicated.submission.owner !== 'clip-sharing') return
    const applied = editShowClipV2(record, duplicated.submission.intent)
    expect(applied.status).toBe('changed')
    if (applied.status !== 'changed') return
    expect(applied.record.composition.patternInstances).toEqual(record.composition.patternInstances)
    expect(applied.record.composition.clips.find(candidate => candidate.id === 'copy-1'))
      .toMatchObject({ instanceId: clip.instanceId, startMs: 2_000, durationMs: clip.durationMs })
  })

  it('refuses a duplicate onto a destination outside Show End without allocating', () => {
    const record = detached()
    const clip = record.composition.clips[0]
    const refused = plan(record, {
      kind: 'duplicate', clipId: 'out', startMs: 3_800, zoneId: clip.zoneId, layerId: clip.layerId,
    }, 'copy')
    expect(refused.result).toMatchObject({ status: 'refused' })
    expect(refused.allocate.calls()).toBe(0)
  })

  it('checks duplicate overlap with the sharing owner without changing the captured record or consuming identities', () => {
    const record = detached()
    const source = record.composition.clips[0]
    const blocker = record.composition.clips[1]
    const held = capture(record)
    const overlapping = {
      kind: 'duplicate', clipId: source.id, startMs: blocker.startMs,
      zoneId: source.zoneId, layerId: source.layerId,
    } as const

    expect(checkShowTimelineDuplicateGestureV2(held, overlapping)).toMatchObject({
      status: 'refused', code: 'owner-refused', message: expect.stringContaining('overlap'),
    })
    expect(held.record).toBe(record)

    const free = { ...overlapping, startMs: 2_000 }
    expect(checkShowTimelineDuplicateGestureV2(held, free)).toEqual({ status: 'ready' })
    expect(checkShowTimelineDuplicateGestureV2(held, free)).toEqual({ status: 'ready' })
    expect(held.record).toBe(record)
  })

  it('refuses a duplicate gesture for a missing Clip with the planner message', () => {
    const record = detached()
    const clip = record.composition.clips[0]
    const gesture = {
      kind: 'duplicate', clipId: 'missing', startMs: 2_000, zoneId: clip.zoneId, layerId: clip.layerId,
    } as const
    const allocate = vi.fn(() => 'unused')
    const planned = planShowTimelineGestureV2(capture(record), gesture, allocate)
    expect(planned.status).toBe('refused')
    if (planned.status !== 'refused') throw new Error('Missing duplicate refusal')
    expect(allocate).not.toHaveBeenCalled()
    expect(checkShowTimelineDuplicateGestureV2(capture(record), gesture)).toEqual({
      status: 'refused', message: planned.message, code: 'missing-clip',
    })
  })

  it('names a duplicate that would run past Show End by its code (#1098)', () => {
    const record = detached()
    const clip = record.composition.clips[0]
    const gesture = {
      kind: 'duplicate', clipId: clip.id, startMs: record.composition.showEndMs - clip.durationMs + 1, zoneId: clip.zoneId, layerId: clip.layerId,
    } as const
    expect(checkShowTimelineDuplicateGestureV2(capture(record), gesture)).toMatchObject({ status: 'refused', code: 'past-show-end' })
    expect(planShowTimelineGestureV2(capture(record), gesture, () => 'unused')).toMatchObject({ status: 'refused', code: 'past-show-end' })
  })

  it('maps delete onto the Clip delete intent, projecting each removed carrier', () => {
    const plain = plan(converted(), { kind: 'delete', clipId: 'in' }, 'gone')
    expect(plain.result).toEqual({
      status: 'ready',
      submission: { owner: 'clip-delete', intent: { kind: 'delete-clip', clipId: 'in' } },
    })
    expect(plain.allocate.calls()).toBe(0)

    const carrier = converted()
    carrier.composition.transitions = [{
      id: 'boundary', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
      participants: [], wholeOutput: { startMs: 400, fromClipIds: ['out'], toClipIds: ['in'] },
      propertyRamps: [{ target: { kind: 'show-repeat-scale' }, from: 3, easing: { curve: 'linear' } }],
    }]
    const projected = plan(carrier, { kind: 'delete', clipId: 'in' }, 'ramp').result
    expect(projected).toMatchObject({
      status: 'ready',
      submission: {
        owner: 'clip-delete',
        intent: {
          kind: 'delete-clip', clipId: 'in',
          propertyRampProjections: [{ transitionId: 'boundary', projections: [{ rampIndex: 0, trackId: 'ramp-1' }] }],
        },
      },
    })
    if (projected.status !== 'ready' || projected.submission.owner !== 'clip-delete') return
    expect(editShowTransitionV2(carrier, projected.submission.intent).status).toBe('changed')
  })

  it.each(['missing', 'occurrence-1:child'])('refuses the gesture on %s without allocating identity', id => {
    const record = converted()
    const refused = plan(record, { kind: 'delete', clipId: id }, 'none')
    expect(refused.result).toMatchObject({ status: 'refused' })
    expect(refused.allocate.calls()).toBe(0)
    expect(plan(record, { kind: 'split', clipId: id, atMs: 200 }).result).toMatchObject({ status: 'refused' })
  })

  it('carries the whole Transition-connected component through a rigid move', () => {
    const view = projectShowTimelineV2(converted())
    expect(showTimelineConnectedItemIdsV2(view, 'out')).toEqual(['in', 'out'])
    expect(showTimelineConnectedItemIdsV2(view, 'in')).toEqual(['in', 'out'])
    expect(showTimelineConnectedItemIdsV2(projectShowTimelineV2(detached()), 'in')).toEqual(['in'])
  })

  it('clamps and collides a rigid drop on the component, not on the dragged Clip alone', () => {
    const view = projectShowTimelineV2(converted())
    const drop = (candidateStartMs: number) => resolveShowTimelineClipDropV2(view, {
      itemId: 'in', candidateStartMs, altKey: true, shiftKey: false,
      visibleDurationMs: view.showEndMs, visibleWidthPx: 1_000,
    })

    // "out" starts at zero, so the chain cannot slide earlier at all.
    expect(drop(0)).toMatchObject({ startMs: 600, movedItemIds: ['in', 'out'] })
    // Show End stops the chain at its own last contribution, not the dragged Clip's.
    expect(drop(4_000)).toMatchObject({ startMs: 3_600, movedItemIds: ['in', 'out'] })
    expect(drop(1_600)).toMatchObject({ startMs: 1_600, collidingItemIds: [] })
  })

  it('carries the dragged Clip alone for a duplicate or a cross-Layer drop', () => {
    const view = projectShowTimelineV2(converted())
    const destination = view.rows[0].layers.find(layer => layer.rank === 1)!

    expect(resolveShowTimelineClipDropV2(view, {
      itemId: 'out', candidateStartMs: 600, carry: 'clip', altKey: false, shiftKey: false,
      visibleDurationMs: view.showEndMs, visibleWidthPx: 1_000,
    })).toMatchObject({ startMs: 600, movedItemIds: ['out'], collidingItemIds: ['in'] })

    expect(resolveShowTimelineClipDropV2(view, {
      itemId: 'out', candidateStartMs: 600, destination: { zoneId: 'zone', layerId: destination.id },
      altKey: true, shiftKey: false, visibleDurationMs: view.showEndMs, visibleWidthPx: 1_000,
    })).toMatchObject({ startMs: 600, movedItemIds: ['out'], collidingItemIds: [] })
  })

  it('reports the items a dropped component would overlap', () => {
    const record = detached()
    record.composition.clips.push({
      ...structuredClone(record.composition.clips[0]),
      id: 'later', startMs: 2_000,
      appearance: { keys: [{ ...structuredClone(record.composition.clips[0].appearance.keys[0]), id: 'later:1', timeMs: 2_000 }] },
    })
    expect(validateShowRecordV2(record)).toEqual([])
    const view = projectShowTimelineV2(record)

    expect(resolveShowTimelineClipDropV2(view, {
      itemId: 'out', candidateStartMs: 2_100, altKey: true, shiftKey: false,
      visibleDurationMs: view.showEndMs, visibleWidthPx: 1_000,
    })).toMatchObject({ startMs: 2_100, movedItemIds: ['out'], collidingItemIds: ['later'] })
  })

  it('snaps a free drop onto the structural boundaries the view already draws', () => {
    const view = projectShowTimelineV2(detached())
    const snapped = resolveShowTimelineClipDropV2(view, {
      itemId: 'out', candidateStartMs: 604, altKey: false, shiftKey: false,
      visibleDurationMs: view.showEndMs, visibleWidthPx: 1_000,
    })
    expect(snapped).toMatchObject({ startMs: 600, magnetized: true })

    // Alt asks for raw milliseconds, so the same pointer sample keeps its time.
    expect(resolveShowTimelineClipDropV2(view, {
      itemId: 'out', candidateStartMs: 604, altKey: true, shiftKey: false,
      visibleDurationMs: view.showEndMs, visibleWidthPx: 1_000,
    })).toMatchObject({ startMs: 604, magnetized: false })
  })

  it('resolves a drop against the snap candidates the surface offers, not the whole view (#1039)', () => {
    const view = projectShowTimelineV2(detached())
    const drop = (structuralTimesMs?: number[]) => resolveShowTimelineClipDropV2(view, {
      itemId: 'out', candidateStartMs: 604, altKey: false, shiftKey: false,
      visibleDurationMs: view.showEndMs, visibleWidthPx: 1_000,
      ...(structuralTimesMs ? { structuralTimesMs } : {}),
    })

    // No override: the view's own boundaries magnetize, exactly as before.
    expect(drop()).toMatchObject({ startMs: 600, magnetized: true })
    // Magnet off: nothing attracts, and the always-on drop grid still rounds
    // the raw pointer time onto a visible tick rather than raw milliseconds.
    expect(drop([])).toMatchObject({ startMs: 600, magnetized: false })
    // The surface may also offer a time the view model does not carry, such as
    // a Marker or the playhead the v1 toolbar snaps to.
    expect(drop([610])).toMatchObject({ startMs: 610, magnetized: true })
    // A running transport reports a fractional playhead; the drop still lands
    // on a whole millisecond, because the owner refuses anything else (#1039).
    const playing = drop([609.63])
    expect(playing).toMatchObject({ startMs: 610, magnetized: true })
    expect(Number.isInteger(playing.startMs)).toBe(true)
  })

  it('resolves an edge drag against the offered snap candidates too (#1039)', () => {
    const view = projectShowTimelineV2(detached())
    const edge = (structuralTimesMs?: number[]) => resolveShowTimelineEdgeDropV2(view, {
      itemId: 'in', edge: 'leading', candidateTimeMs: 404, altKey: false, shiftKey: false,
      visibleDurationMs: view.showEndMs, visibleWidthPx: 1_000,
      ...(structuralTimesMs ? { structuralTimesMs } : {}),
    })

    expect(edge()).toEqual({ timeMs: 400, magnetized: true })
    expect(edge([])).toEqual({ timeMs: 400, magnetized: false })
    expect(edge([410])).toEqual({ timeMs: 410, magnetized: true })
    expect(edge([409.63])).toEqual({ timeMs: 410, magnetized: true })
    expect(edge([Number.NaN, 410])).toEqual({ timeMs: 410, magnetized: true })
  })

  it('keeps an edge drag inside the Clip and inside Show End', () => {
    const view = projectShowTimelineV2(detached())
    const edge = (edgeKind: 'leading' | 'trailing', candidateTimeMs: number) => resolveShowTimelineEdgeDropV2(view, {
      itemId: 'in', edge: edgeKind, candidateTimeMs, altKey: true, shiftKey: false,
      visibleDurationMs: view.showEndMs, visibleWidthPx: 1_000,
    })

    expect(edge('leading', -500).timeMs).toBe(0)
    expect(edge('leading', 4_000).timeMs).toBe(999)
    expect(edge('trailing', 0).timeMs).toBe(601)
    expect(edge('trailing', 9_000).timeMs).toBe(4_000)
  })

  it('offers one keyboard step, refined while Shift is held', () => {
    expect(showTimelineGestureStepMs(false)).toBe(1_000)
    expect(showTimelineGestureStepMs(true)).toBe(100)
  })

  it('never reads a store, writes a record or allocates outside the explicit allocator', () => {
    const record = converted()
    const before = structuredClone(record)
    const allocate = vi.fn(() => 'once-1')
    planShowTimelineGestureV2(capture(record), { kind: 'split', clipId: 'out', atMs: 200 }, allocate)
    expect(record).toEqual(before)
    expect(allocate).toHaveBeenCalledTimes(1)
  })
})

it('plans and applies a closed leading window and delete for a Clip value only carrier', () => {
  const closeRecord = convertTransitionClipRampProbe()
  const clipId = closeRecord.composition.transitions[0].participants[0].toClipId
  const closed = plan(closeRecord, { kind: 'resize-leading', clipId, startMs: 4000 }).result
  expect(closed).toMatchObject({ status: 'ready', submission: { owner: 'clip-temporal', intent: { clipId } } })
  if (closed.status !== 'ready') return
  expect(closed.submission.intent).not.toHaveProperty('propertyRampProjections')
  const appliedClose = editShowClipTemporalV2(closeRecord, closed.submission.intent as never)
  expect(appliedClose.status, JSON.stringify(appliedClose)).toBe('changed')
  if (appliedClose.status === 'changed') expect(appliedClose.record.composition.transitions).toEqual([])

  const deleteRecord = convertTransitionClipRampProbe()
  const deleted = plan(deleteRecord, { kind: 'delete', clipId }).result
  expect(deleted).toMatchObject({ status: 'ready', submission: { owner: 'clip-delete', intent: { kind: 'delete-clip', clipId } } })
  if (deleted.status !== 'ready') return
  expect(deleted.submission.intent).not.toHaveProperty('propertyRampProjections')
  const appliedDelete = editShowTransitionV2(deleteRecord, deleted.submission.intent as never)
  expect(appliedDelete.status).toBe('changed')
  if (appliedDelete.status === 'changed') expect(appliedDelete.record.composition.transitions).toEqual([])
})
