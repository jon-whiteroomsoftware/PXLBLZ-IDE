import { describe, expect, it } from 'vitest'
import { showCommandFixture } from '../../test/showCommandFixture'
import { showLayerCommandFixture } from '../../test/showLayerCommandFixture'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '../showFileBundle'
import { projectShowUnifiedTimeline } from '../showUnifiedTimelineProjection'
import { applyShowGrammarOperation } from '../../agent-harness/grammar/registry'
import { openShowDocument } from '../../agent-harness/grammar/openShow'
import { applyShowCommand, runShowCommandTransaction } from './registry'

function accepted(record: ReturnType<typeof showCommandFixture>, name: string, input: Record<string, unknown>) {
  const outcome = applyShowCommand(record, name, input)
  expect(outcome.ok, outcome.ok ? '' : JSON.stringify(outcome.issues)).toBe(true)
  if (!outcome.ok) throw new Error('expected accepted command')
  return outcome
}

function clips(record: ReturnType<typeof showCommandFixture>) {
  return projectShowUnifiedTimeline(record, record.composition!).zones
    .flatMap(zone => zone.layers.flatMap(layer => layer.clips))
}

async function reopen(record: ReturnType<typeof showCommandFixture>) {
  const { bundle } = buildShowFileBundle(record, { patterns: [], maps: [] }, {
    appVersion: '1012-layer-commands', exportedAt: '2026-09-12T00:00:00Z',
  })
  return (await parseShowFileBundle(await serializeShowFileBundle(bundle))).show
}

describe('consistent Layer addressing (#1012)', () => {
  it('targets Main by omission or explicit layer and accepts the legacy overlay alias equivalently', async () => {
    const { addClipCommandOutcome } = await import('./clips')
    const base = showLayerCommandFixture()
    const common = {
      zone_id: 'zone-1', start_ms: 10_000, duration_ms: 4_000,
      pattern_kind: 'stock', pattern_id: 'CometLoom',
    }
    const ids = (() => {
      const values = ['new-instance', 'new-clip']
      return () => values.shift()!
    })
    const implicitMain = addClipCommandOutcome(base, common, ids())
    const explicitMain = addClipCommandOutcome(base, { ...common, layer: 'main' }, ids())
    expect(implicitMain.ok && explicitMain.ok).toBe(true)
    if (!implicitMain.ok || !explicitMain.ok) return
    expect(explicitMain.record.composition).toEqual(implicitMain.record.composition)

    const legacy = addClipCommandOutcome(base, { ...common, overlay_layer_index: 2 }, ids())
    const preferred = addClipCommandOutcome(base, { ...common, layer: 2 }, ids())
    expect(legacy.ok && preferred.ok).toBe(true)
    if (!legacy.ok || !preferred.ok) return
    expect(preferred.record.composition).toEqual(legacy.record.composition)
    expect(preferred.changes[0].details).toMatchObject({
      instanceId: 'new-instance', zoneId: 'zone-1', layer: 2,
      startMs: 10_000, endMs: 14_000, durationMs: 4_000,
    })
  })

  it('refuses ambiguous or malformed add destinations before minting an edit', () => {
    const base = showLayerCommandFixture()
    const common = {
      zone_id: 'zone-1', start_ms: 10_000, pattern_kind: 'stock', pattern_id: 'CometLoom',
    }
    for (const input of [
      { ...common, layer: 0, overlay_layer_index: 0 },
      { ...common, layer: -1 },
      { ...common, layer: 0.5 },
      { ...common, layer: Number.MAX_SAFE_INTEGER + 1 },
      { ...common, overlay_layer_index: -1 },
      { ...common, overlay_layer_index: 0.5 },
      { ...common, layer: null },
    ]) {
      expect(applyShowCommand(base, 'add_clip', input)).toMatchObject({
        ok: false, issues: [{ code: 'invalid-argument' }],
      })
    }
  })

  it('moves between Layers without resupplying start and reports the actual destination', () => {
    const first = accepted(showLayerCommandFixture(), 'move_clip', { clip_id: 'clip-b', start_ms: 34_000 })
    const moved = accepted(first.record, 'move_clip', { clip_id: 'clip-b', layer: 1 })
    const clip = clips(moved.record).find(candidate => candidate.id === 'clip-b')!
    expect(clip).toMatchObject({ startMs: 34_000, zoneId: 'zone-1', kind: 'overlay', layerIndex: 1 })
    expect(moved.changes[0].details).toMatchObject({
      zoneId: 'zone-1', layer: 1, startMs: 34_000, endMs: 42_000, durationMs: 8_000,
    })
    expect(applyShowCommand(moved.record, 'move_clip', { clip_id: 'clip-b', layer: 1 }))
      .toEqual({ ok: true, record: moved.record, changes: [] })
    expect(applyShowCommand(showLayerCommandFixture(), 'move_clip', { clip_id: 'clip-b' }))
      .toMatchObject({ ok: false, issues: [{ code: 'invalid-argument' }] })
  })

  it('uses one current-candidate address for Main, overlay and another Zone destinations', () => {
    const mainToOverlay = accepted(showLayerCommandFixture(), 'move_clip', {
      clip_id: 'clip-b', layer: 1,
    })
    expect(clips(mainToOverlay.record).find(candidate => candidate.id === 'clip-b'))
      .toMatchObject({ startMs: 12_000, zoneId: 'zone-1', kind: 'overlay', layerIndex: 1 })

    const movedLater = accepted(showLayerCommandFixture(), 'move_clip', {
      clip_id: 'clip-ov', start_ms: 34_000,
    })
    const overlayToMain = accepted(movedLater.record, 'move_clip', {
      clip_id: 'clip-ov', layer: 'main',
    })
    expect(clips(overlayToMain.record).find(candidate => candidate.id === 'clip-ov'))
      .toMatchObject({ startMs: 34_000, zoneId: 'zone-1', kind: 'main' })

    const anotherZone = accepted(showLayerCommandFixture(), 'move_clip', {
      clip_id: 'clip-b', zone_id: 'zone-2', layer: 'main',
    })
    expect(clips(anotherZone.record).find(candidate => candidate.id === 'clip-b'))
      .toMatchObject({ startMs: 12_000, zoneId: 'zone-2', kind: 'main' })
  })

  it('creates, moves and fills a Layer in one atomic exportable transaction', async () => {
    const before = showLayerCommandFixture()
    const outcome = runShowCommandTransaction(before, [
      { name: 'add_overlay_layer', input: { zone_id: 'zone-1' } },
      { name: 'move_clip', input: { clip_id: 'clip-a', layer: 0 } },
      { name: 'add_clip', input: {
        zone_id: 'zone-1', start_ms: 10_000, duration_ms: 4_000, layer: 0,
        pattern_kind: 'stock', pattern_id: 'CometLoom',
      } },
    ])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(before).toEqual(showLayerCommandFixture())
    const layer = projectShowUnifiedTimeline(outcome.record, outcome.record.composition!)
      .zones.find(zone => zone.id === 'zone-1')!.layers[0]
    expect(layer.clips.map(clip => ({ id: clip.id, startMs: clip.startMs }))).toEqual([
      { id: 'clip-a', startMs: 0 },
      { id: outcome.changes[2].targetId, startMs: 10_000 },
    ])
    const reopened = await reopen(outcome.record)
    expect(reopened).toEqual({ ...outcome.record, updatedAt: reopened.updatedAt })
  })

  it('resolves later indices against preceding Layer creations in the same transaction', () => {
    const outcome = runShowCommandTransaction(showLayerCommandFixture(), [
      { name: 'add_overlay_layer', input: { zone_id: 'zone-1' } },
      { name: 'add_overlay_layer', input: { zone_id: 'zone-1' } },
      { name: 'move_clip', input: { clip_id: 'clip-a', layer: 1 } },
      { name: 'add_clip', input: {
        zone_id: 'zone-1', start_ms: 10_000, duration_ms: 4_000, layer: 0,
        pattern_kind: 'stock', pattern_id: 'CometLoom',
      } },
    ])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const layers = projectShowUnifiedTimeline(outcome.record, outcome.record.composition!).zones[0].layers
    expect(layers[0].clips).toHaveLength(1)
    expect(layers[1].clips.map(clip => clip.id)).toEqual(['clip-a'])
  })

  it('returns no partial candidate when a later placement refuses', () => {
    const before = showLayerCommandFixture()
    const outcome = runShowCommandTransaction(before, [
      { name: 'add_overlay_layer', input: { zone_id: 'zone-1' } },
      { name: 'move_clip', input: { clip_id: 'clip-a', layer: 0 } },
      { name: 'add_clip', input: {
        zone_id: 'zone-1', start_ms: 5_000, duration_ms: 4_000, layer: 0,
        pattern_kind: 'stock', pattern_id: 'CometLoom',
      } },
    ])
    expect(outcome).toMatchObject({ ok: false, step: 2, issues: [{ code: 'occupied' }] })
    expect(before).toEqual(showLayerCommandFixture())

    const noOp = runShowCommandTransaction(before, [{
      name: 'move_clip', input: { clip_id: 'clip-b', start_ms: 12_000 },
    }])
    expect(noOp).toEqual({ ok: true, record: before, changes: [] })
  })
})

describe('canonical whole-Layer commands (#1013, #1014)', () => {
  it('returns the same complete records and receipts through the canonical and diagnostic adapters', () => {
    const before = showLayerCommandFixture()
    const opened = openShowDocument(before)
    expect(opened.ok, opened.ok ? '' : JSON.stringify(opened.issues)).toBe(true)
    if (!opened.ok) return
    for (const [command, args] of [
      ['reorder_overlay_layer', { zone_id: 'zone-1', layer_index: 2, target_index: 0 }],
      ['remove_overlay_layer', { zone_id: 'zone-1', layer_index: 2 }],
    ] as const) {
      const canonical = applyShowCommand(before, command, args)
      const diagnostic = applyShowGrammarOperation(opened.document, command, args)
      expect(canonical.ok && diagnostic.ok).toBe(true)
      if (!canonical.ok || !diagnostic.ok) continue
      expect(diagnostic.document.show).toEqual({ ...canonical.record, updatedAt: diagnostic.document.show.updatedAt })
      expect(diagnostic.changes).toEqual(canonical.changes.map(({ command: _name, ...change }) => ({
        ...change, op: command,
      })))
    }
  })

  it('reorders by final front-to-back index with compact selected-ID and permutation receipts', () => {
    const before = showLayerCommandFixture()
    const outcome = accepted(before, 'reorder_overlay_layer', {
      zone_id: 'zone-1', layer_index: 2, target_index: 0,
    })
    for (const scene of outcome.record.composition!.scenes) {
      expect(scene.zones[0].overlays.map(layer => layer.id)).toEqual([
        `bottom-${scene.sceneId}`, `top-${scene.sceneId}`, `middle-${scene.sceneId}`,
      ])
    }
    expect(outcome.changes[0]).toMatchObject({
      targetId: 'bottom-scene-1',
      details: {
        zoneId: 'zone-1', fromIndex: 2, toIndex: 0,
        layerIdsBySceneId: { 'scene-1': 'bottom-scene-1', 'scene-2': 'bottom-scene-2' },
        indexMap: { 0: 1, 1: 2, 2: 0 },
      },
    })
    expect(applyShowCommand(before, 'reorder_overlay_layer', {
      zone_id: 'zone-1', layer_index: 1, target_index: 1,
    })).toEqual({ ok: true, record: before, changes: [] })
  })

  it('removes only the requested empty Layer and reports the compacted indices', () => {
    const before = showLayerCommandFixture()
    const outcome = accepted(before, 'remove_overlay_layer', { zone_id: 'zone-1', layer_index: 1 })
    for (const scene of outcome.record.composition!.scenes) {
      expect(scene.zones[0].overlays.map(layer => layer.id)).toEqual([
        `top-${scene.sceneId}`, `bottom-${scene.sceneId}`,
      ])
    }
    expect(outcome.changes[0]).toMatchObject({
      targetId: 'middle-scene-1',
      details: {
        zoneId: 'zone-1', removedIndex: 1,
        layerIdsBySceneId: { 'scene-1': 'middle-scene-1', 'scene-2': 'middle-scene-2' },
        indexMap: { 0: 0, 1: null, 2: 1 },
      },
    })
  })

  it('refuses malformed indices, unsupported stacks, Groups and occupied Layers without mutation', () => {
    const base = showLayerCommandFixture()
    for (const [command, input] of [
      ['reorder_overlay_layer', { zone_id: 'zone-1', layer_index: -1, target_index: 0 }],
      ['reorder_overlay_layer', { zone_id: 'zone-1', layer_index: 0.5, target_index: 0 }],
      ['reorder_overlay_layer', { zone_id: 'zone-1', layer_index: 0, target_index: 9 }],
      ['remove_overlay_layer', { zone_id: 'zone-1', layer_index: null }],
      ['remove_overlay_layer', { zone_id: 'zone-1', layer_index: 0 }],
      ['remove_overlay_layer', { zone_id: 'zone-1', layer_index: 1, force: true }],
    ] as const) {
      const before = structuredClone(base)
      expect(applyShowCommand(base, command, input).ok).toBe(false)
      expect(base).toEqual(before)
    }
    const sparse = showLayerCommandFixture()
    sparse.composition!.scenes[1].zones[0].overlays.pop()
    expect(applyShowCommand(sparse, 'reorder_overlay_layer', {
      zone_id: 'zone-1', layer_index: 1, target_index: 1,
    })).toMatchObject({ ok: false, issues: [{ code: 'unsupported-topology' }] })

    const grouped = showLayerCommandFixture()
    grouped.composition!.groupDefinitions = [{ id: 'definition', name: 'Group', patternInstances: [], placements: [] }]
    grouped.composition!.groupOccurrences = [{
      id: 'occurrence', definitionId: 'definition', sceneId: 'scene-1', zoneId: 'zone-1',
      startMs: 0, baseLayer: 0, translationX: 0, translationY: 0,
    }]
    expect(applyShowCommand(grouped, 'remove_overlay_layer', {
      zone_id: 'zone-1', layer_index: 1,
    })).toMatchObject({ ok: false, issues: [{ code: 'unsupported-topology' }] })
  })

  it('moves out, reorders and removes against current private indices, then rolls back on a later failure', () => {
    const before = showLayerCommandFixture()
    const acceptedBatch = runShowCommandTransaction(before, [
      { name: 'move_clip', input: { clip_id: 'clip-ov', layer: 1 } },
      { name: 'reorder_overlay_layer', input: { zone_id: 'zone-1', layer_index: 1, target_index: 0 } },
      { name: 'remove_overlay_layer', input: { zone_id: 'zone-1', layer_index: 1 } },
    ])
    expect(acceptedBatch.ok).toBe(true)
    if (acceptedBatch.ok) {
      expect(acceptedBatch.record.composition!.scenes[0].zones[0].overlays.map(layer => layer.id))
        .toEqual(['middle-scene-1', 'bottom-scene-1'])
      expect(clips(acceptedBatch.record).find(clip => clip.id === 'clip-ov')).toMatchObject({ layerIndex: 0 })
    }

    const refused = runShowCommandTransaction(before, [
      { name: 'remove_overlay_layer', input: { zone_id: 'zone-1', layer_index: 1 } },
      { name: 'remove_overlay_layer', input: { zone_id: 'zone-1', layer_index: 0 } },
    ])
    expect(refused).toMatchObject({ ok: false, step: 1, issues: [{ code: 'layer-not-empty' }] })
    expect(before).toEqual(showLayerCommandFixture())
  })
})
