import { describe, expect, it } from 'vitest'
import { projectShowEditorTimelineCommandsV2 } from './showEditorTimelinePresentation'
import type {
  ShowTimelineItemView,
  ShowTimelineLayerView,
  ShowTimelineViewModel,
} from './showTimelineViewModel'
import {
  planShowV2ClipMove,
  planShowV2ClipResize,
  planShowV2ClipSplit,
  planShowV2ManualClipResize,
  resolveShowV2SplitTarget,
} from './showV2ClipTemporalPlanning'

function item(
  id: string,
  zoneId: string,
  layerId: string,
  startMs: number,
  durationMs: number,
  groupOccurrenceId?: string,
): ShowTimelineItemView {
  return {
    id,
    selection: { kind: 'clip', clipId: id },
    instanceId: `${id}-instance`,
    patternName: id,
    compiled: true,
    zoneId,
    layerId,
    startMs,
    durationMs,
    endMs: startMs + durationMs,
    entryPolicy: 'continue',
    heldAppearance: { opacity: 1, effectKinds: [] },
    diagnostics: [],
    ...(groupOccurrenceId ? { groupOccurrenceId } : {}),
  }
}

function layer(id: string, zoneId: string, items: ShowTimelineItemView[]): ShowTimelineLayerView {
  return { id, zoneId, name: id, rank: 0, layerIndex: 0, items, junctions: [] }
}

/**
 * Zone z1 holds main layer l1 with a joined pair a -> b, plus an overlay layer
 * l2 with a free clip c. Zone z2 holds one free clip d. Show End is 20000.
 */
function fixture(): ShowTimelineViewModel {
  const a = item('a', 'z1', 'l1', 0, 4000)
  const b = item('b', 'z1', 'l1', 5000, 2000)
  const c = item('c', 'z1', 'l2', 12000, 2000)
  const d = item('d', 'z2', 'l3', 0, 2000)
  const e = item('e', 'z1', 'l1', 14000, 2000)
  const f = item('f', 'z1', 'l1', 18000, 2000)
  const h = item('h', 'z1', 'l2', 14000, 2000)
  const i = item('i', 'z1', 'l2', 18000, 2000)
  const j = item('j', 'z2', 'l3', 4000, 2000)
  const k = item('k', 'z2', 'l3', 9000, 2000)
  const g = item('g', 'z1', 'l1', 12000, 1000, 'use-1')
  return {
    recordVersion: 2,
    showId: 'planning',
    showEndMs: 20000,
    rows: [
      {
        zoneId: 'z1', zoneName: 'Zone 1', nominalPixelCount: 16, pixelCount: 16,
        composed: true, layers: [layer('l1', 'z1', [a, b, g, e, f]), layer('l2', 'z1', [c, h, i])], groups: [],
      },
      {
        zoneId: 'z2', zoneName: 'Zone 2', nominalPixelCount: 16, pixelCount: 16,
        composed: true, layers: [layer('l3', 'z2', [d, j, k])], groups: [],
      },
    ],
    transitions: [{
      id: 't1', kind: 'crossfade', origin: 'converted-layer-transition',
      startMs: 4000, durationMs: 1000, endMs: 5000,
      scope: {
        kind: 'participants',
        participants: [{ zoneId: 'z1', layerId: 'l1', fromItemId: 'a', toItemId: 'b' }],
      },
    }, {
      id: 't2', kind: 'crossfade', origin: 'converted-boundary-transition',
      startMs: 16000, durationMs: 2000, endMs: 18000,
      scope: {
        kind: 'participants',
        participants: [{ zoneId: 'z1', layerId: 'l1', fromItemId: 'e', toItemId: 'f' }],
      },
    }, {
      id: 't3', kind: 'crossfade',
      startMs: 16000, durationMs: 2000, endMs: 18000,
      scope: {
        kind: 'participants',
        participants: [{ zoneId: 'z1', layerId: 'l2', fromItemId: 'h', toItemId: 'i' }],
      },
    }, {
      id: 't4', kind: 'crossfade', origin: 'converted-boundary-transition',
      startMs: 6000, durationMs: 3000, endMs: 9000,
      scope: { kind: 'whole-output', fromItemIds: ['j'], toItemIds: ['k'] },
    }],
    layoutIntervals: [{
      id: 'occ-all',
      definitionId: 'layout-1',
      definitionName: 'Zone Layout',
      zoneIds: ['z1', 'z2'],
      startMs: 0,
      endMs: 20000,
      durationMs: 20000,
      parameters: {},
      selection: { kind: 'layout-occurrence', occurrenceId: 'occ-all' },
    }],
    markers: [],
    structuralTimesMs: [0, 4000, 5000, 7000, 12000, 13000, 14000, 20000],
  }
}

describe('planShowV2ClipMove', () => {
  it('plans a same-layer move of a free clip as a temporal move', () => {
    expect(planShowV2ClipMove(fixture(), { clipId: 'c', zoneId: 'z1', layerId: 'l2', startMs: 13000 }))
      .toEqual({ kind: 'temporal', intent: { kind: 'move', clipId: 'c', startMs: 13000 } })
  })

  it('plans a same-layer move of a joined clip as a connected move', () => {
    expect(planShowV2ClipMove(fixture(), { clipId: 'a', zoneId: 'z1', layerId: 'l1', startMs: 1000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'move-connected', clipId: 'a', startMs: 1000 } })
    expect(planShowV2ClipMove(fixture(), { clipId: 'b', zoneId: 'z1', layerId: 'l1', startMs: 6000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'move-connected', clipId: 'b', startMs: 6000 } })
  })

  it('plans a cross-layer drop of a free clip as a placement replacement', () => {
    expect(planShowV2ClipMove(fixture(), { clipId: 'c', zoneId: 'z1', layerId: 'l1', startMs: 13000 }))
      .toEqual({
        kind: 'temporal',
        intent: { kind: 'replace-placement', clipId: 'c', zoneId: 'z1', layerId: 'l1', startMs: 13000, detachParticipantTransitions: true },
      })
  })

  it('plans a cross-zone drop of a free clip as a placement replacement', () => {
    expect(planShowV2ClipMove(fixture(), { clipId: 'c', zoneId: 'z2', layerId: 'l3', startMs: 5000 }))
      .toEqual({
        kind: 'temporal',
        intent: { kind: 'replace-placement', clipId: 'c', zoneId: 'z2', layerId: 'l3', startMs: 5000, detachParticipantTransitions: true },
      })
  })

  it('re-places a cross-layer drop of a joined clip and grants the detach permission', () => {
    // Gap 2 flips the connected-reroute refusal into a detach-and-move: the
    // planner grants the detach permission the agent command withholds, and
    // the temporal owner detaches plain participant Transitions (refusing ramp
    // carriers) at commit. Without the grant the same intent refuses.
    expect(planShowV2ClipMove(fixture(), { clipId: 'a', zoneId: 'z1', layerId: 'l2', startMs: 1000 }))
      .toEqual({
        kind: 'temporal',
        intent: { kind: 'replace-placement', clipId: 'a', zoneId: 'z1', layerId: 'l2', startMs: 1000, detachParticipantTransitions: true },
      })
  })

  it('re-places a whole-output-only endpoint instead of refusing it up front', () => {
    const view = fixture()
    view.transitions = [{
      id: 'w', kind: 'crossfade', startMs: 4000, durationMs: 1000, endMs: 5000,
      scope: { kind: 'whole-output', fromItemIds: ['a'], toItemIds: ['b'] },
    }]
    // A whole-output contributor list is not a placement bond: the planner
    // routes the drop and the temporal owner stays the authority at commit.
    expect(planShowV2ClipMove(view, { clipId: 'a', zoneId: 'z1', layerId: 'l2', startMs: 1000 }))
      .toEqual({
        kind: 'temporal',
        intent: { kind: 'replace-placement', clipId: 'a', zoneId: 'z1', layerId: 'l2', startMs: 1000, detachParticipantTransitions: true },
      })
  })

  it('refuses a no-op and a missing clip without naming an intent', () => {
    const view = fixture()
    expect(planShowV2ClipMove(view, { clipId: 'c', zoneId: 'z1', layerId: 'l2', startMs: 12000 }))
      .toEqual({ kind: 'refuse', reason: 'no-change' })
    expect(planShowV2ClipMove(view, { clipId: 'missing', zoneId: 'z1', layerId: 'l1', startMs: 0 }))
      .toEqual({ kind: 'refuse', reason: 'missing-clip' })
    expect(planShowV2ClipMove(view, { clipId: 'g', zoneId: 'z1', layerId: 'l1', startMs: 12000 }))
      .toEqual({ kind: 'refuse', reason: 'group-child' })
  })

  it('rounds a fractional Alt-drag start before planning, exactly as v1 moveShowClip does', () => {
    const view = fixture()
    expect(planShowV2ClipMove(view, { clipId: 'c', zoneId: 'z1', layerId: 'l1', startMs: 11234.57 }))
      .toEqual({
        kind: 'temporal',
        intent: { kind: 'replace-placement', clipId: 'c', zoneId: 'z1', layerId: 'l1', startMs: 11235, detachParticipantTransitions: true },
      })
    expect(planShowV2ClipMove(view, { clipId: 'c', zoneId: 'z2', layerId: 'l3', startMs: 5000.5 }))
      .toEqual({
        kind: 'temporal',
        intent: { kind: 'replace-placement', clipId: 'c', zoneId: 'z2', layerId: 'l3', startMs: 5001, detachParticipantTransitions: true },
      })
    expect(planShowV2ClipMove(view, { clipId: 'a', zoneId: 'z1', layerId: 'l1', startMs: 1000.49 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'move-connected', clipId: 'a', startMs: 1000 } })
    expect(planShowV2ClipMove(view, { clipId: 'c', zoneId: 'z1', layerId: 'l2', startMs: 13000.5 }))
      .toEqual({ kind: 'temporal', intent: { kind: 'move', clipId: 'c', startMs: 13001 } })
    expect(planShowV2ClipMove(view, { clipId: 'c', zoneId: 'z1', layerId: 'l2', startMs: 12000.4 }))
      .toEqual({ kind: 'refuse', reason: 'no-change' })
  })
})

describe('planShowV2ClipResize', () => {
  it('plans a free trailing shrink as a trim and a free trailing growth as an extend', () => {
    const view = fixture()
    expect(planShowV2ClipResize(view, { clipId: 'c', edge: 'trailing', startMs: 12000, endMs: 13000 }))
      .toEqual({ kind: 'temporal', intent: { kind: 'trim', clipId: 'c', startMs: 12000, endMs: 13000 } })
    expect(planShowV2ClipResize(view, { clipId: 'c', edge: 'trailing', startMs: 12000, endMs: 15000 }))
      .toEqual({ kind: 'temporal', intent: { kind: 'extend', clipId: 'c', startMs: 12000, endMs: 15000 } })
  })

  it('plans a free leading shrink as a trim and a free leading growth as an extend', () => {
    const view = fixture()
    expect(planShowV2ClipResize(view, { clipId: 'c', edge: 'leading', startMs: 12500, endMs: 14000 }))
      .toEqual({ kind: 'temporal', intent: { kind: 'trim', clipId: 'c', startMs: 12500, endMs: 14000 } })
    expect(planShowV2ClipResize(view, { clipId: 'c', edge: 'leading', startMs: 11000, endMs: 14000 }))
      .toEqual({ kind: 'temporal', intent: { kind: 'extend', clipId: 'c', startMs: 11000, endMs: 14000 } })
  })

  it('plans a joined trailing edge as a connected trailing resize', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'a', edge: 'trailing', startMs: 0, endMs: 3000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-trailing', clipId: 'a', endMs: 3000 } })
  })

  it('plans a joined leading edge as a connected leading resize', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'b', edge: 'leading', startMs: 6000, endMs: 7000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-leading', clipId: 'b', startMs: 6000 } })
  })

  it('plans the unjoined edge of a joined clip through the temporal owner', () => {
    const view = fixture()
    expect(planShowV2ClipResize(view, { clipId: 'a', edge: 'leading', startMs: 1000, endMs: 4000 }))
      .toEqual({ kind: 'temporal', intent: { kind: 'trim', clipId: 'a', startMs: 1000, endMs: 4000 } })
    expect(planShowV2ClipResize(view, { clipId: 'b', edge: 'trailing', startMs: 5000, endMs: 8000 }))
      .toEqual({ kind: 'temporal', intent: { kind: 'extend', clipId: 'b', startMs: 5000, endMs: 8000 } })
  })

  it('refuses a no-op, a straddle and a missing clip', () => {
    const view = fixture()
    expect(planShowV2ClipResize(view, { clipId: 'c', edge: 'trailing', startMs: 12000, endMs: 14000 }))
      .toEqual({ kind: 'refuse', reason: 'no-change' })
    expect(planShowV2ClipResize(view, { clipId: 'c', edge: 'trailing', startMs: 13000, endMs: 15000 }))
      .toEqual({ kind: 'refuse', reason: 'outside-clip' })
    expect(planShowV2ClipResize(view, { clipId: 'missing', edge: 'trailing', startMs: 0, endMs: 10 }))
      .toEqual({ kind: 'refuse', reason: 'missing-clip' })
  })
})

/** `resizeBoundaryShow` on one Layer: free `ra` 0-4000 and free `rb` 8000-10000. */
function resizeBoundaryView(): ShowTimelineViewModel {
  const view = fixture()
  view.rows = [{
    zoneId: 'z1', zoneName: 'Zone 1', nominalPixelCount: 16, pixelCount: 16, composed: true,
    layers: [layer('l1', 'z1', [item('ra', 'z1', 'l1', 0, 4000), item('rb', 'z1', 'l1', 8000, 2000)])],
    groups: [],
  }]
  view.transitions = []
  return view
}

describe('planShowV2ManualClipResize (#1099)', () => {
  it('clamps a trailing drag past an unconnected neighbour at its start, as v1 does', () => {
    expect(planShowV2ManualClipResize(resizeBoundaryView(), { clipId: 'ra', edge: 'trailing', startMs: 0, endMs: 12000 }))
      .toEqual({
        startMs: 0,
        endMs: 8000,
        plan: { kind: 'temporal', intent: { kind: 'extend', clipId: 'ra', startMs: 0, endMs: 8000 } },
      })
  })

  it('clamps a leading drag past an unconnected previous neighbour at its end', () => {
    expect(planShowV2ManualClipResize(resizeBoundaryView(), { clipId: 'rb', edge: 'leading', startMs: 1000, endMs: 10000 }))
      .toEqual({
        startMs: 4000,
        endMs: 10000,
        plan: { kind: 'temporal', intent: { kind: 'extend', clipId: 'rb', startMs: 4000, endMs: 10000 } },
      })
  })

  it('refuses a drag that clamps back to the unchanged edge as a no-change', () => {
    // `c` ends at 14000 exactly where unconnected `h` starts on the same Layer.
    expect(planShowV2ManualClipResize(fixture(), { clipId: 'c', edge: 'trailing', startMs: 12000, endMs: 15000 }))
      .toEqual({ startMs: 12000, endMs: 14000, plan: { kind: 'refuse', reason: 'no-change' } })
  })

  it('allows exact adjacency: the end may equal the neighbour start', () => {
    expect(planShowV2ManualClipResize(resizeBoundaryView(), { clipId: 'ra', edge: 'trailing', startMs: 0, endMs: 8000 }))
      .toEqual({
        startMs: 0,
        endMs: 8000,
        plan: { kind: 'temporal', intent: { kind: 'extend', clipId: 'ra', startMs: 0, endMs: 8000 } },
      })
  })

  it('keeps a Transition-connected edge on the connected ripple resize, unclamped', () => {
    expect(planShowV2ManualClipResize(fixture(), { clipId: 'a', edge: 'trailing', startMs: 0, endMs: 6000 }))
      .toEqual({
        startMs: 0,
        endMs: 6000,
        plan: { kind: 'transition-resize', intent: { kind: 'resize-trailing', clipId: 'a', endMs: 6000 } },
      })
  })
})

describe('planShowV2ClipSplit', () => {
  it('plans an interior split as a temporal split', () => {
    expect(planShowV2ClipSplit(fixture(), { clipId: 'a', atMs: 2000, rightClipId: 'a-right' }))
      .toEqual({ kind: 'temporal', intent: { kind: 'split', clipId: 'a', atMs: 2000, rightClipId: 'a-right' } })
  })

  it('refuses a split at or outside the clip bounds and a group child', () => {
    const view = fixture()
    for (const atMs of [0, 4000, 9000]) {
      expect(planShowV2ClipSplit(view, { clipId: 'a', atMs, rightClipId: 'a-right' }))
        .toEqual({ kind: 'refuse', reason: 'outside-clip' })
    }
    expect(planShowV2ClipSplit(view, { clipId: 'g', atMs: 12500, rightClipId: 'g-right' }))
      .toEqual({ kind: 'refuse', reason: 'group-child' })
    expect(planShowV2ClipSplit(view, { clipId: 'missing', atMs: 100, rightClipId: 'x' }))
      .toEqual({ kind: 'refuse', reason: 'missing-clip' })
  })
})

describe('resolveShowV2SplitTarget', () => {
  it('agrees with the landed split capability on every selection and playhead', () => {
    const view = fixture()
    const selections: Array<string | null> = [null, 'a', 'b', 'c', 'g', 'missing']
    const playheads = [0, 1000, 4000, 4500, 5500, 6500, 7000, 12500, 19000]
    for (const selectionClipId of selections) {
      for (const playheadMs of playheads) {
        const target = resolveShowV2SplitTarget(view, {
          selectionClipId, playheadMs, isolatedGroupOccurrenceId: null,
        })
        const capability = projectShowEditorTimelineCommandsV2({
          view,
          selection: selectionClipId ? { kind: 'clip', clipId: selectionClipId } : { kind: 'other' },
          playheadMs,
          isolatedGroupOccurrenceId: null,
        }).split
        const targetItem = target ? view.rows.flatMap((row) => row.layers.flatMap((layer) => layer.items)).find((candidate) => candidate.id === target) : null
        expect(capability.enabled, `selection=${selectionClipId} playhead=${playheadMs}`).toBe(
          targetItem != null && playheadMs > targetItem.startMs && playheadMs < targetItem.endMs,
        )
        if (capability.enabled) expect(target).not.toBeNull()
      }
    }
  })

  it('resolves nothing inside group isolation', () => {
    expect(resolveShowV2SplitTarget(fixture(), {
      selectionClipId: 'a', playheadMs: 2000, isolatedGroupOccurrenceId: 'use-1',
    })).toBeNull()
  })
})

describe('planShowV2ClipResize across conversion provenance (#1068)', () => {
  it('routes a resize that pulls a converted-boundary leading edge away through the connected repair door', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'f', edge: 'leading', startMs: 18500, endMs: 20000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-leading', clipId: 'f', startMs: 18500 } })
  })

  it('routes a resize that pulls a converted-boundary trailing edge away through the connected repair door', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'e', edge: 'trailing', startMs: 14000, endMs: 15500 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-trailing', clipId: 'e', endMs: 15500 } })
  })

  it('routes a pull-away from a whole-output converted boundary edge through the connected repair door', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'j', edge: 'trailing', startMs: 4000, endMs: 5500 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-trailing', clipId: 'j', endMs: 5500 } })
    expect(planShowV2ClipResize(fixture(), { clipId: 'k', edge: 'leading', startMs: 9500, endMs: 11000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-leading', clipId: 'k', startMs: 9500 } })
  })

  it('refuses a resize that grows a Clip into a whole-output converted boundary', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'j', edge: 'trailing', startMs: 4000, endMs: 6500 }))
      .toEqual({ kind: 'refuse', reason: 'boundary-extend-unsupported' })
    expect(planShowV2ClipResize(fixture(), { clipId: 'k', edge: 'leading', startMs: 8500, endMs: 11000 }))
      .toEqual({ kind: 'refuse', reason: 'boundary-extend-unsupported' })
  })

  it('refuses a resize that grows a converted-boundary Clip into the boundary', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'f', edge: 'leading', startMs: 17500, endMs: 20000 }))
      .toEqual({ kind: 'refuse', reason: 'boundary-extend-unsupported' })
    expect(planShowV2ClipResize(fixture(), { clipId: 'e', edge: 'trailing', startMs: 14000, endMs: 16500 }))
      .toEqual({ kind: 'refuse', reason: 'boundary-extend-unsupported' })
  })

  it('refuses a two-edge extend that grows into a converted boundary instead of planning a temporal extend', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'f', edge: 'leading', startMs: 17500, endMs: 20500 }))
      .toEqual({ kind: 'refuse', reason: 'boundary-extend-unsupported' })
  })

  it('refuses a detach-away resize whose reclaim window a spanning Clip blocks', () => {
    const view = fixture()
    view.rows[0].layers[1].items.push(item('s', 'z1', 'l2', 17000, 2000))
    expect(planShowV2ClipResize(view, { clipId: 'f', edge: 'leading', startMs: 18500, endMs: 20000 }))
      .toEqual({ kind: 'refuse', reason: 'boundary-repair-blocked' })
  })

  it('refuses a detach-away resize whose owning Layout occurrence cannot absorb the reclaim', () => {
    const view = fixture()
    const interval = (id: string, startMs: number, durationMs: number) => ({
      id,
      definitionId: 'layout-1',
      definitionName: 'Zone Layout',
      zoneIds: ['z1', 'z2'],
      startMs,
      endMs: startMs + durationMs,
      durationMs,
      parameters: {},
      selection: { kind: 'layout-occurrence' as const, occurrenceId: id },
    })
    view.layoutIntervals = [interval('occ-a', 0, 15000), interval('occ-b', 15000, 2000), interval('occ-c', 17000, 3000)]
    expect(planShowV2ClipResize(view, { clipId: 'f', edge: 'leading', startMs: 18500, endMs: 20000 }))
      .toEqual({ kind: 'refuse', reason: 'boundary-repair-blocked' })
  })

  it('routes an inexact converted-boundary junction through the connected grow form', () => {
    const view = fixture()
    const drifting = view.rows[0].layers[0].items.find(candidate => candidate.id === 'f')!
    drifting.startMs = 18100
    drifting.durationMs = 1900
    drifting.endMs = 20000
    expect(planShowV2ClipResize(view, { clipId: 'f', edge: 'leading', startMs: 18600, endMs: 20000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-leading', clipId: 'f', startMs: 18600 } })
  })

  it('keeps the connected form away from a converted-layer join', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'b', edge: 'leading', startMs: 6000, endMs: 7000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-leading', clipId: 'b', startMs: 6000 } })
    expect(planShowV2ClipResize(fixture(), { clipId: 'a', edge: 'trailing', startMs: 0, endMs: 3000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-trailing', clipId: 'a', endMs: 3000 } })
  })

  it('keeps the connected form away from a natively authored join', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'i', edge: 'leading', startMs: 18500, endMs: 20000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-leading', clipId: 'i', startMs: 18500 } })
    expect(planShowV2ClipResize(fixture(), { clipId: 'h', edge: 'trailing', startMs: 14000, endMs: 15500 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-trailing', clipId: 'h', endMs: 15500 } })
  })
})

describe('planShowV2ClipResize across Group occurrences (#1068)', () => {
  function group(id: string, startMs: number, durationMs: number) {
    return {
      id,
      definitionId: 'def',
      name: id,
      zoneId: 'z1',
      startMs,
      endMs: startMs + durationMs,
      durationMs,
      topLayerIndex: 0,
      bottomLayerIndex: 1,
      linkedOccurrenceCount: 1,
      selection: { kind: 'group' as const, occurrenceId: id },
    }
  }

  it('refuses a detach-away resize whose reclaim window a Group occurrence spans', () => {
    const view = fixture()
    view.rows[0].groups.push(group('grp-span', 17000, 2000))
    expect(planShowV2ClipResize(view, { clipId: 'f', edge: 'leading', startMs: 18500, endMs: 20000 }))
      .toEqual({ kind: 'refuse', reason: 'boundary-repair-blocked' })
  })

  it('routes a detach-away resize past a Group occurrence starting exactly at the window end', () => {
    const view = fixture()
    view.rows[0].groups.push(group('grp-exact', 18000, 2000))
    expect(planShowV2ClipResize(view, { clipId: 'f', edge: 'leading', startMs: 18500, endMs: 20000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-leading', clipId: 'f', startMs: 18500 } })
  })
})

describe('v2 Clip inspector Start and Duration oracle (#1066)', () => {
  it('v1 Duration edit then convert equals v2 trailing resize plus its owner on the converted before-record', async () => {
    const { createDefaultShow } = await import('./showModel')
    const { updateShowClipInspector } = await import('./showClipInspectorModel')
    const { convertShowRecordV1ToV2 } = await import('./showRecordV1ToV2')
    const { DEMOS, resolveStockPatternId } = await import('../pixelblaze/stock/patterns')
    const { validateShowRecordV2 } = await import('./showCompositionV2')
    const { projectShowEditorTimelineV2 } = await import('./showEditorTimelinePresentation')
    const { editShowClipTemporalV2 } = await import('./showClipTemporalV2')

    const base = createDefaultShow('inspector-oracle-v1', 'Inspector oracle', 1)
    const sceneId = base.scenes[0]!.id
    const zoneId = base.zones[0]!.id
    const sceneDurationMs = base.scenes[0]!.durationMs
    const before: typeof base = {
      ...base,
      composition: {
        version: 1,
        patternInstances: [
          { id: 'instance-main', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 } },
          { id: 'instance-overlay', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'CometLoom', time: { timeScale: 1, timeOffsetMs: 0 } },
        ],
        scenes: [{
          sceneId,
          zones: [{
            zoneId,
            main: [{ id: 'placement-main', instanceId: 'instance-main', startMs: 0, durationMs: sceneDurationMs, view: { mirror: false, phase: 0, brightness: 1 } }],
            overlays: [{
              id: 'layer-front',
              name: 'Front',
              placements: [{ id: 'placement-overlay', instanceId: 'instance-overlay', startMs: 1_000, durationMs: 2_000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } }],
            }],
          }],
        }],
      },
    }
    const owner = { kind: 'scene-overlay' as const, sceneId, zoneId, layerId: 'layer-front', placementId: 'placement-overlay' }
    const v1Edited = updateShowClipInspector(before, owner, { local: { durationMs: 3_000 } })
    expect(v1Edited).not.toBe(before)

    const convert = (show: typeof base) => {
      const result = convertShowRecordV1ToV2(show, {
        byCellId: Object.fromEntries(show.cells.map((cell) => {
          const source = DEMOS[resolveStockPatternId(cell.pattern.id)]
          if (!source) throw new Error(`missing stock source ${cell.pattern.id}`)
          return [cell.id, source]
        })),
      })
      if (result.status !== 'converted') throw new Error(JSON.stringify(result.issues))
      expect(validateShowRecordV2(result.record)).toEqual([])
      return result.record
    }
    const convertedBefore = convert(before)
    const convertedAfter = convert(v1Edited)

    const view = projectShowEditorTimelineV2(convertedBefore)
    const item = view.rows.flatMap((row) => row.layers.flatMap((layer) => layer.items))
      .find((candidate) => candidate.startMs === 1_000 && candidate.durationMs === 2_000)
    if (!item) throw new Error('converted free clip not found at 1000+2000')
    const planned = planShowV2ClipResize(view, { clipId: item.id, edge: 'trailing', startMs: item.startMs, endMs: item.startMs + 3_000 })
    expect(planned.kind).not.toBe('refuse')
    if (planned.kind === 'refuse') throw new Error(`resize refused: ${planned.reason}`)
    if (planned.kind !== 'temporal') throw new Error(`expected temporal plan, got ${planned.kind}`)
    const applied = editShowClipTemporalV2(convertedBefore, planned.intent)
    expect(applied.status).toBe('changed')
    if (applied.status !== 'changed') throw new Error(`owner refused: ${JSON.stringify(applied)}`)

    const shape = (record: typeof convertedBefore) => ({
      showEndMs: record.composition.showEndMs,
      clips: [...record.composition.clips]
        .map((clip) => [clip.startMs, clip.durationMs].join(':'))
        .sort(),
    })
    expect(shape(applied.record)).toEqual(shape(convertedAfter))
  })
})
