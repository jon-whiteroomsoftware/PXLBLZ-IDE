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
    layoutIntervals: [],
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
        intent: { kind: 'replace-placement', clipId: 'c', zoneId: 'z1', layerId: 'l1', startMs: 13000 },
      })
  })

  it('plans a cross-zone drop of a free clip as a placement replacement', () => {
    expect(planShowV2ClipMove(fixture(), { clipId: 'c', zoneId: 'z2', layerId: 'l3', startMs: 5000 }))
      .toEqual({
        kind: 'temporal',
        intent: { kind: 'replace-placement', clipId: 'c', zoneId: 'z2', layerId: 'l3', startMs: 5000 },
      })
  })

  it('refuses a cross-layer drop of a joined clip instead of detaching its transition', () => {
    expect(planShowV2ClipMove(fixture(), { clipId: 'a', zoneId: 'z1', layerId: 'l2', startMs: 1000 }))
      .toEqual({ kind: 'refuse', reason: 'connected-reroute' })
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
        intent: { kind: 'replace-placement', clipId: 'a', zoneId: 'z1', layerId: 'l2', startMs: 1000 },
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
  it('refuses a resize that pulls a converted-boundary leading edge away', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'f', edge: 'leading', startMs: 18500, endMs: 20000 }))
      .toEqual({ kind: 'refuse', reason: 'boundary-detach-unsupported' })
  })

  it('refuses a resize that pulls a converted-boundary trailing edge away', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'e', edge: 'trailing', startMs: 14000, endMs: 15500 }))
      .toEqual({ kind: 'refuse', reason: 'boundary-detach-unsupported' })
  })

  it('refuses a resize that pulls a whole-output boundary edge away', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'j', edge: 'trailing', startMs: 4000, endMs: 5500 }))
      .toEqual({ kind: 'refuse', reason: 'boundary-detach-unsupported' })
    expect(planShowV2ClipResize(fixture(), { clipId: 'k', edge: 'leading', startMs: 9500, endMs: 11000 }))
      .toEqual({ kind: 'refuse', reason: 'boundary-detach-unsupported' })
  })

  it('keeps the connected leading form toward a converted-boundary join', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'f', edge: 'leading', startMs: 17500, endMs: 20000 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-leading', clipId: 'f', startMs: 17500 } })
  })

  it('keeps the connected trailing form toward a converted-boundary join', () => {
    expect(planShowV2ClipResize(fixture(), { clipId: 'e', edge: 'trailing', startMs: 14000, endMs: 16500 }))
      .toEqual({ kind: 'transition-resize', intent: { kind: 'resize-trailing', clipId: 'e', endMs: 16500 } })
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
