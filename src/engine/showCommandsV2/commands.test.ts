import { describe, expect, it } from 'vitest'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from '../showCompositionV2'
import { editShowClipAppearanceV2 } from '../showClipAppearanceEditsV2'
import { editShowTransitionV2 } from '../showTransitionsV2'
import { editShowLayoutIntervalsV2 } from '../showLayoutIntervalsV2'
import { showChaptersV2 } from '../showChaptersV2'
import { editShowClipTemporalV2 } from '../showClipTemporalV2'
import { applyShowCommandV2, runShowCommandV2Transaction, SHOW_COMMANDS_V2 } from './registry'
import { commandFixtureV2, fixtureContext } from './fixtures'

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

function changed(outcome: ReturnType<typeof applyShowCommandV2>): Extract<ReturnType<typeof applyShowCommandV2>, { status: 'changed' }> {
  if (outcome.status !== 'changed') {
    throw new Error(outcome.status === 'refused' ? JSON.stringify(outcome.issues) : 'expected a change')
  }
  expect(validateShowRecordV2(reopen(outcome.record))).toEqual([])
  return outcome
}

const context = fixtureContext()

describe('v2 Show and Layer commands', () => {
  it('renames the Show, edits a Zone and sets the exact Show End', () => {
    const record = commandFixtureV2()
    const renamed = changed(applyShowCommandV2(record, 'rename_show', { name: '  Night run  ' }))
    expect(renamed.record.name).toBe('Night run')
    expect(record.name).toBe('Command fixture')

    const zone = changed(applyShowCommandV2(renamed.record, 'update_zone', { zone_id: 'left', name: 'Stage left', nominal_pixel_count: 12 }))
    expect(zone.record.zones[0]).toMatchObject({ name: 'Stage left', nominalPixelCount: 12 })

    const extended = changed(applyShowCommandV2(zone.record, 'set_show_end', { end_ms: 11_000 }))
    expect(extended.record.composition.showEndMs).toBe(11_000)
    expect(extended.record.composition.layoutOccurrences[1].durationMs).toBe(6_000)

    // Exact rule: shortening across a Clip contribution refuses, naming it.
    const refused = applyShowCommandV2(extended.record, 'set_show_end', { end_ms: 5_000 })
    expect(refused.status).toBe('refused')
    if (refused.status !== 'refused') return
    expect(refused.issues[0].code).toBe('protected-content')
    expect(refused.issues[0].message).toContain('clip-b')
    expect(refused.record).toBe(extended.record)
  })

  it('creates, renames, restacks and removes Layers by identity', () => {
    const record = commandFixtureV2()
    const created = changed(applyShowCommandV2(record, 'create_layers', {
      layers: [{ zone_id: 'left', name: 'Top', rank: 0 }],
    }))
    const layers = created.record.composition.layers.filter(layer => layer.zoneId === 'left')
    expect(layers.map(layer => [layer.name, layer.rank])).toEqual(
      expect.arrayContaining([['Top', 0], ['Base', 1], ['Over', 2]]),
    )
    const added = created.record.composition.layers.find(layer => layer.name === 'Top')!.id

    const renamed = changed(applyShowCommandV2(created.record, 'rename_layer', { layer_id: added, name: 'Sky' }))
    expect(renamed.record.composition.layers.find(layer => layer.id === added)!.name).toBe('Sky')

    const restacked = changed(applyShowCommandV2(renamed.record, 'reorder_layer', { layer_id: added, above_layer_id: 'over' }))
    const ranks = Object.fromEntries(restacked.record.composition.layers.map(layer => [layer.id, layer.rank]))
    expect(ranks[added]).toBe(2)
    expect(ranks.base).toBe(0)
    expect(ranks.over).toBe(1)
    // Restacking never touches Clip identity or placement.
    expect(restacked.record.composition.clips).toEqual(record.composition.clips)

    const removed = changed(applyShowCommandV2(restacked.record, 'remove_layer', { layer_id: added }))
    expect(removed.record.composition.layers.some(layer => layer.id === added)).toBe(false)

    // A referenced Layer needs an explicit destination.
    const blocked = applyShowCommandV2(removed.record, 'remove_layer', { layer_id: 'over' })
    expect(blocked.status).toBe('refused')
    if (blocked.status !== 'refused') return
    expect(blocked.issues[0].code).toBe('incomplete-reassignment')

    // Reassigning into an occupied Layer refuses on the materialized collision.
    const collision = applyShowCommandV2(removed.record, 'remove_layer', { layer_id: 'over', reassign_to_layer_id: 'base' })
    expect(collision.status).toBe('refused')
    if (collision.status !== 'refused') return
    expect(collision.issues[0].code).toBe('invalid-result')
    expect(collision.issues[0].message).toContain('cannot overlap')

    const spareRecord = changed(applyShowCommandV2(removed.record, 'create_layers', { layers: [{ zone_id: 'left', name: 'Spare' }] }))
    const spare = spareRecord.record.composition.layers.find(layer => layer.name === 'Spare')!.id
    const reassigned = changed(applyShowCommandV2(spareRecord.record, 'remove_layer', { layer_id: 'over', reassign_to_layer_id: spare }))
    expect(reassigned.record.composition.clips.find(clip => clip.id === 'clip-c')!.layerId).toBe(spare)
  })
})

describe('v2 Clip commands', () => {
  it('creates Clips under each D3 instance policy', () => {
    const record = commandFixtureV2()
    // "sole" reuses the one existing runtime for that source.
    const sole = changed(applyShowCommandV2(record, 'create_clips', {
      clips: [{ zone_id: 'left', layer_id: 'over', start_ms: 4_000, duration_ms: 1_000, pattern: { kind: 'stock', id: 'TestPattern2D' } }],
    }, context))
    const soleClip = sole.record.composition.clips.find(clip => clip.startMs === 4_000 && clip.layerId === 'over')!
    expect(soleClip.instanceId).toBe('inst-b')
    expect(sole.record.composition.patternInstances).toEqual(record.composition.patternInstances)

    // "new" creates the first runtime for a source that has none.
    const fresh = changed(applyShowCommandV2(record, 'create_clips', {
      clips: [{
        zone_id: 'left', layer_id: 'over', start_ms: 4_000, duration_ms: 1_000,
        pattern: { kind: 'stock', id: 'TestPattern3D' }, instance: 'new',
      }],
    }, fixtureContext({ TestPattern3D: { name: 'TestPattern3D', sliders: [] } })))
    expect(fresh.record.composition.patternInstances).toHaveLength(3)

    // "new" refuses when a runtime already exists, naming the candidates.
    const conflict = applyShowCommandV2(record, 'create_clips', {
      clips: [{ zone_id: 'left', layer_id: 'over', start_ms: 4_000, duration_ms: 1_000, pattern: { kind: 'stock', id: 'TestPattern2D' }, instance: 'new' }],
    }, context)
    expect(conflict.status).toBe('refused')
    if (conflict.status !== 'refused') return
    expect(conflict.issues[0].code).toBe('ambiguous-instance')

    // An explicit instance identity is honoured.
    const explicit = changed(applyShowCommandV2(record, 'create_clips', {
      clips: [{ zone_id: 'left', layer_id: 'over', start_ms: 4_000, duration_ms: 1_000, pattern: { kind: 'stock', id: 'TestPattern1D' }, instance: 'inst-a' }],
    }, context))
    expect(explicit.record.composition.clips.find(clip => clip.startMs === 4_000 && clip.layerId === 'over')!.instanceId).toBe('inst-a')

    // "sole" refuses with candidates when several runtimes exist for one source.
    const twoRuntimes = changed(applyShowCommandV2(record, 'make_clip_pattern_independent', { clip_id: 'clip-b' }))
    const ambiguous = applyShowCommandV2(twoRuntimes.record, 'create_clips', {
      clips: [{ zone_id: 'left', layer_id: 'over', start_ms: 4_000, duration_ms: 1_000, pattern: { kind: 'stock', id: 'TestPattern1D' } }],
    }, context)
    expect(ambiguous.status).toBe('refused')
    if (ambiguous.status !== 'refused') return
    expect(ambiguous.issues[0].code).toBe('ambiguous-instance')
    expect(ambiguous.issues[0].candidates).toEqual(expect.arrayContaining(['inst-a']))
  })

  it('applies an appearance patch to the whole Clip or to one held key, retaining later keys', () => {
    const record = commandFixtureV2()
    const atTime = changed(applyShowCommandV2(record, 'update_clips', {
      updates: [{ clip_id: 'clip-a', appearance: { apply: { scope: 'at-time', at_ms: 2_000 }, opacity: 0.25 } }],
    }, context))
    const keys = atTime.record.composition.clips.find(clip => clip.id === 'clip-a')!.appearance.keys
    expect(keys.map(key => [key.timeMs, key.value.opacity])).toEqual([[0, 1], [2_000, 0.25]])

    const later = changed(applyShowCommandV2(atTime.record, 'update_clips', {
      updates: [{ clip_id: 'clip-a', appearance: { apply: { scope: 'at-time', at_ms: 3_000 }, opacity: 0.5 } }],
    }, context))
    expect(later.record.composition.clips.find(clip => clip.id === 'clip-a')!.appearance.keys
      .map(key => [key.timeMs, key.value.opacity])).toEqual([[0, 1], [2_000, 0.25], [3_000, 0.5]])

    const whole = changed(applyShowCommandV2(later.record, 'update_clips', {
      updates: [{ clip_id: 'clip-a', appearance: { apply: { scope: 'whole-clip' }, opacity: 0.75 } }],
    }, context))
    expect(whole.record.composition.clips.find(clip => clip.id === 'clip-a')!.appearance.keys
      .every(key => key.value.opacity === 0.75)).toBe(true)
  })

  it('moves a Transition-connected Clip rigidly and keeps Transition identity and settings', () => {
    const record = commandFixtureV2()
    const inserted = changed(applyShowCommandV2(record, 'insert_transition', {
      from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 500, kind: 'crossfade',
    }))
    const transitionId = inserted.changes[0].targetId!
    expect(inserted.record.composition.clips.find(clip => clip.id === 'clip-b')!.startMs).toBe(4_500)

    const moved = changed(applyShowCommandV2(inserted.record, 'update_clips', {
      updates: [{ clip_id: 'clip-a', start_ms: 1_000 }],
    }, context))
    const clips = Object.fromEntries(moved.record.composition.clips.map(clip => [clip.id, clip.startMs]))
    expect(clips['clip-a']).toBe(1_000)
    expect(clips['clip-b']).toBe(5_500)
    const transition = moved.record.composition.transitions.find(candidate => candidate.id === transitionId)!
    expect(transition.durationMs).toBe(500)
    expect(transition.participants[0]).toMatchObject({ fromClipId: 'clip-a', toClipId: 'clip-b' })
  })

  it('re-places a Clip onto another Layer or Zone with the manual owner\'s exact result', () => {
    const record = commandFixtureV2()
    // Same Zone, another Layer: command and owner agree on record and affected set.
    const viaCommand = changed(applyShowCommandV2(record, 'update_clips', {
      updates: [{ clip_id: 'clip-b', layer_id: 'over' }],
    }, context))
    const viaOwner = editShowClipTemporalV2(record, { kind: 'replace-placement', clipId: 'clip-b', zoneId: 'left', layerId: 'over' })
    expect(viaOwner.status).toBe('changed')
    if (viaOwner.status !== 'changed') return
    expect(viaCommand.record.composition).toEqual(viaOwner.record.composition)
    expect(viaCommand.changes[0].details.clips).toEqual(viaOwner.affectedClipIds)
    expect(viaCommand.record.composition.patternInstances).toEqual(record.composition.patternInstances)

    // Another Zone, with a start in the same patch: one atomic candidate.
    const withLayer = changed(applyShowCommandV2(record, 'create_layers', {
      layers: [{ zone_id: 'right', name: 'Right base' }],
    }, context))
    const rightLayerId = withLayer.record.composition.layers.find(layer => layer.zoneId === 'right')!.id
    const crossed = changed(applyShowCommandV2(withLayer.record, 'update_clips', {
      updates: [{ clip_id: 'clip-b', zone_id: 'right', layer_id: rightLayerId, start_ms: 6_000 }],
    }, context))
    const moved = crossed.record.composition.clips.find(clip => clip.id === 'clip-b')!
    expect([moved.zoneId, moved.layerId, moved.startMs, moved.durationMs]).toEqual(['right', rightLayerId, 6_000, 4_000])
    expect(crossed.record.composition.clips.find(clip => clip.id === 'clip-a')).toEqual(record.composition.clips[0])
  })

  it('refuses a re-placement through update_clips with the owner\'s typed code', () => {
    const record = commandFixtureV2()
    const inserted = changed(applyShowCommandV2(record, 'insert_transition', {
      from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 500, kind: 'crossfade',
    }))
    for (const [input, code] of [
      [{ clip_id: 'clip-b', layer_id: 'over' }, 'invalid-topology'],
      [{ clip_id: 'clip-c', layer_id: 'absent' }, 'missing-target'],
      [{ clip_id: 'clip-c', zone_id: 'right', layer_id: 'over' }, 'missing-target'],
      [{ clip_id: 'clip-c', layer_id: 'base' }, 'invalid-result'],
    ] as const) {
      const outcome = applyShowCommandV2(inserted.record, 'update_clips', { updates: [input] }, context)
      expect(outcome.status, JSON.stringify(input)).toBe('refused')
      if (outcome.status !== 'refused') continue
      expect(outcome.issues[0].code, JSON.stringify(input)).toBe(code)
      const owner = editShowClipTemporalV2(inserted.record, {
        kind: 'replace-placement', clipId: input.clip_id,
        ...('zone_id' in input ? { zoneId: input.zone_id } : {}),
        layerId: input.layer_id,
      })
      expect(owner.status).toBe('refused')
      if (owner.status !== 'refused') continue
      expect(outcome.issues[0].code).toBe(owner.code)
      expect(outcome.issues[0].message).toContain(owner.message)
      expect(outcome.record).toBe(inserted.record)
    }
  })

  it('duplicates sharing the runtime by default and mints one only for explicit independence', () => {
    const record = commandFixtureV2()
    const shared = changed(applyShowCommandV2(record, 'duplicate_clip', { clip_id: 'clip-c', start_ms: 5_000 }))
    expect(shared.record.composition.patternInstances).toEqual(record.composition.patternInstances)
    const copy = shared.changes[0].details.clips.find(id => id !== 'clip-c')!
    expect(shared.record.composition.clips.find(clip => clip.id === copy)!.instanceId).toBe('inst-b')

    const independent = changed(applyShowCommandV2(record, 'duplicate_clip', { clip_id: 'clip-c', start_ms: 5_000, independent: true }))
    expect(independent.record.composition.patternInstances).toHaveLength(3)
    const independentCopy = independent.record.composition.clips.find(clip => clip.startMs === 5_000)!
    expect(independentCopy.instanceId).not.toBe('inst-b')
  })

  it('replaces one Clip Pattern, forking the shared runtime and naming dropped controls', () => {
    const record = commandFixtureV2()
    record.composition.patternInstances[0].controlTargets = { speed: 0.5, depth: 0.25 }
    const replaced = changed(applyShowCommandV2(record, 'replace_clip_pattern', {
      clip_id: 'clip-a', pattern: { kind: 'stock', id: 'TestPattern2D' },
    }, context))
    const clipA = replaced.record.composition.clips.find(clip => clip.id === 'clip-a')!
    const clipB = replaced.record.composition.clips.find(clip => clip.id === 'clip-b')!
    expect(clipA.instanceId).not.toBe('inst-a')
    // The other user keeps its runtime, controls and compiled identity.
    expect(clipB.instanceId).toBe('inst-a')
    expect(replaced.record.composition.patternInstances.find(instance => instance.id === 'inst-a'))
      .toEqual(record.composition.patternInstances[0])
    const forked = replaced.record.composition.patternInstances.find(instance => instance.id === clipA.instanceId)!
    expect(forked.pattern).toEqual({ kind: 'stock', id: 'TestPattern2D' })
    expect(forked.controlTargets).toEqual({ speed: 0.5, depth: 0.25 })

    // An unresolvable source refuses without touching the record.
    const missing = applyShowCommandV2(record, 'replace_clip_pattern', {
      clip_id: 'clip-a', pattern: { kind: 'user', id: 'absent' },
    }, context)
    expect(missing.status).toBe('refused')
    if (missing.status !== 'refused') return
    expect(missing.issues[0].code).toBe('missing-dependency')
    expect(missing.record).toBe(record)

    // Without a trusted resolver the command refuses rather than guessing.
    const noResolver = applyShowCommandV2(record, 'replace_clip_pattern', {
      clip_id: 'clip-a', pattern: { kind: 'stock', id: 'TestPattern2D' },
    })
    expect(noResolver.status).toBe('refused')
    if (noResolver.status !== 'refused') return
    expect(noResolver.issues[0].code).toBe('missing-dependency')
  })

  it('removes Clips with their tracks and Transitions and admits the empty Show', () => {
    const record = commandFixtureV2()
    const inserted = changed(applyShowCommandV2(record, 'insert_transition', {
      from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 500, kind: 'crossfade',
    }))
    const removed = changed(applyShowCommandV2(inserted.record, 'remove_clips', { clip_ids: ['clip-a'] }))
    expect(removed.record.composition.clips.map(clip => clip.id).sort()).toEqual(['clip-b', 'clip-c'])
    expect(removed.record.composition.transitions).toEqual([])
    expect(removed.record.composition.propertyTracks).toEqual([])
    // Surviving positions and Show End stay fixed; the vacated window is blank.
    expect(removed.record.composition.clips.find(clip => clip.id === 'clip-b')!.startMs).toBe(4_500)
    expect(removed.record.composition.showEndMs).toBe(10_000)

    const empty = changed(applyShowCommandV2(removed.record, 'remove_clips', { clip_ids: ['clip-b', 'clip-c'] }))
    expect(empty.record.composition.clips).toEqual([])
    expect(validateShowRecordV2(empty.record)).toEqual([])
  })

  it('splits a Clip, leaving the left identity and a continuing right piece', () => {
    const record = commandFixtureV2()
    const split = changed(applyShowCommandV2(record, 'split_clip', { clip_id: 'clip-a', at_ms: 1_500 }))
    const left = split.record.composition.clips.find(clip => clip.id === 'clip-a')!
    const right = split.record.composition.clips.find(clip => clip.startMs === 1_500 && clip.layerId === 'base')!
    expect([left.startMs, left.durationMs]).toEqual([0, 1_500])
    expect([right.startMs, right.durationMs]).toEqual([1_500, 2_500])
    expect(right.instanceId).toBe('inst-a')
    expect(right.entryPolicy).toBe('continue')
  })

  it('separates and rejoins a shared Pattern runtime by explicit identity', () => {
    const record = commandFixtureV2()
    const independent = changed(applyShowCommandV2(record, 'make_clip_pattern_independent', { clip_id: 'clip-b' }))
    const forkedId = independent.record.composition.clips.find(clip => clip.id === 'clip-b')!.instanceId
    expect(forkedId).not.toBe('inst-a')

    const rejoined = changed(applyShowCommandV2(independent.record, 'rejoin_clip_pattern_instance', { clip_id: 'clip-b', instance_id: 'inst-a' }))
    expect(rejoined.record.composition.clips.find(clip => clip.id === 'clip-b')!.instanceId).toBe('inst-a')
    expect(rejoined.record.composition.patternInstances.map(instance => instance.id).sort()).toEqual(['inst-a', 'inst-b'])
    expect(rejoined.changes[0].details.removed).toContain(forkedId)

    // A sole user is already independent: an already-satisfied request is a no-op.
    expect(applyShowCommandV2(record, 'make_clip_pattern_independent', { clip_id: 'clip-c' }).status).toBe('unchanged')
  })
})

describe('v2 Transition commands', () => {
  it('inserts at a junction, updates, resizes and removes back to a Cut', () => {
    const record = commandFixtureV2()
    const inserted = changed(applyShowCommandV2(record, 'insert_transition', {
      from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 500, kind: 'crossfade', easing: 'ease-in-out',
    }))
    const transitionId = inserted.changes[0].targetId!
    expect(inserted.record.composition.showEndMs).toBe(10_000)
    expect(inserted.record.composition.clips.find(clip => clip.id === 'clip-b')!.startMs).toBe(4_500)

    const updated = changed(applyShowCommandV2(inserted.record, 'update_transition', { transition_id: transitionId, kind: 'dither' }))
    const updatedTransition = updated.record.composition.transitions[0]
    expect(updatedTransition.id).toBe(transitionId)
    expect(updatedTransition.kind).toBe('dither')
    expect(updatedTransition.durationMs).toBe(500)
    expect(updated.record.composition.clips.find(clip => clip.id === 'clip-b')!.startMs).toBe(4_500)

    const resized = changed(applyShowCommandV2(updated.record, 'resize_transition', { transition_id: transitionId, duration_ms: 1_200 }))
    expect(resized.record.composition.clips.find(clip => clip.id === 'clip-b')!.startMs).toBe(5_200)
    expect(resized.record.composition.clips.find(clip => clip.id === 'clip-a')!.startMs).toBe(0)

    const removedTransition = changed(applyShowCommandV2(resized.record, 'remove_transition', { transition_id: transitionId }))
    expect(removedTransition.record.composition.transitions).toEqual([])
    expect(removedTransition.record.composition.clips.find(clip => clip.id === 'clip-b')!.startMs).toBe(4_000)
    // Delete and re-add leaves no dormant effect to resurrect.
    const reinserted = changed(applyShowCommandV2(removedTransition.record, 'insert_transition', {
      from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 300, kind: 'wipe',
    }))
    expect(reinserted.record.composition.transitions).toHaveLength(1)
    expect(reinserted.record.composition.transitions[0].kind).toBe('wipe')
  })

  it('refuses a non-junction pair with the exact-adjacency remedy', () => {
    const record = commandFixtureV2()
    const gapped = changed(applyShowCommandV2(record, 'resize_clip', { clip_id: 'clip-a', end_ms: 3_999 }))
    const refused = applyShowCommandV2(gapped.record, 'insert_transition', {
      from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 100, kind: 'crossfade',
    })
    expect(refused.status).toBe('refused')
    if (refused.status !== 'refused') return
    expect(refused.issues[0].code).toBe('not-a-junction')
    expect(refused.record).toBe(gapped.record)
  })
})

describe('v2 Layout interval commands', () => {
  it('inserts, appends, selects, transfers, duplicates and removes intervals', () => {
    const record = commandFixtureV2()
    const inserted = changed(applyShowCommandV2(record, 'add_layout_interval', { layout_id: 'both', at_ms: 2_000 }))
    expect(inserted.record.composition.layoutOccurrences.map(occurrence => [occurrence.startMs, occurrence.durationMs]))
      .toEqual([[0, 2_000], [2_000, 3_000], [5_000, 5_000]])

    const appended = changed(applyShowCommandV2(record, 'add_layout_interval', { layout_id: 'both', duration_ms: 1_000 }))
    expect(appended.record.composition.showEndMs).toBe(11_000)

    const selected = changed(applyShowCommandV2(record, 'select_layout', { interval_id: 'interval-2', layout_id: 'left-only' }))
    expect(selected.record.composition.layoutOccurrences[1].layoutId).toBe('left-only')

    const transferred = changed(applyShowCommandV2(record, 'set_layout_transfer', {
      interval_id: 'interval-2', transfer: { duration_ms: 1_000, direction: 'forward' },
    }))
    expect(transferred.record.composition.layoutOccurrences[1].incomingTransfer).toMatchObject({
      durationMs: 1_000, direction: 'forward', fromOccurrenceId: 'interval-1',
    })
    const cleared = changed(applyShowCommandV2(transferred.record, 'set_layout_transfer', { interval_id: 'interval-2', transfer: null }))
    expect(cleared.record.composition.layoutOccurrences[1].incomingTransfer).toBeUndefined()

    const moved = changed(applyShowCommandV2(record, 'move_layout_switch', { interval_id: 'interval-2', start_ms: 6_000 }))
    expect(moved.record.composition.layoutOccurrences.map(occurrence => [occurrence.startMs, occurrence.durationMs]))
      .toEqual([[0, 6_000], [6_000, 4_000]])
    // Unrelated content stays exactly where it was.
    expect(moved.record.composition.clips).toEqual(record.composition.clips)
    expect(moved.record.composition.markers).toEqual(record.composition.markers)

    const removedInterval = changed(applyShowCommandV2(record, 'remove_layout_interval', { interval_id: 'interval-2' }))
    expect(removedInterval.record.composition.layoutOccurrences).toEqual([
      { id: 'interval-1', layoutId: 'both', startMs: 0, durationMs: 10_000, parameters: {} },
    ])

    // A Layout interval owning a split-position track refuses removal.
    const owned = structuredClone(record)
    owned.composition.propertyTracks.push({
      id: 'split-track',
      target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: 'interval-2' },
      activeStartMs: 5_000,
      activeDurationMs: 1_000,
      keyframes: [
        { id: 'split-start', timeMs: 5_000, value: 0.2, easing: { curve: 'linear' } },
        { id: 'split-end', timeMs: 6_000, value: 0.8, easing: { curve: 'linear' } },
      ],
    })
    const blocked = applyShowCommandV2(owned, 'remove_layout_interval', { interval_id: 'interval-2' })
    expect(blocked.status).toBe('refused')
    if (blocked.status !== 'refused') return
    expect(blocked.issues[0].code).toBe('meaningful-occurrence-data')
  })

  it('duplicates an interval with and without its content through the D7 owner', () => {
    const record = commandFixtureV2()
    const empty = changed(applyShowCommandV2(record, 'duplicate_layout_interval', { interval_id: 'interval-2' }))
    expect(empty.record.composition.showEndMs).toBe(15_000)
    expect(empty.record.composition.layoutOccurrences.map(occurrence => occurrence.startMs)).toEqual([0, 5_000, 10_000])
    expect(empty.record.composition.clips).toEqual(record.composition.clips)

    // Content crossing the duplicated boundary refuses rather than being split.
    const crossing = applyShowCommandV2(record, 'duplicate_layout_interval', { interval_id: 'interval-1' })
    expect(crossing.status).toBe('refused')
    if (crossing.status !== 'refused') return
    expect(crossing.issues[0].code).toBe('boundary-crossing-content')
    expect(crossing.issues[0].message).toContain('clip-b')

    // With the switch on a Clip boundary, the interval's content copies once.
    const aligned = changed(applyShowCommandV2(record, 'move_layout_switch', { interval_id: 'interval-2', start_ms: 4_000 }))
    const withContent = changed(applyShowCommandV2(aligned.record, 'duplicate_layout_interval', { interval_id: 'interval-1', with_content: true }))
    expect(withContent.record.composition.showEndMs).toBe(14_000)
    const copiedClipC = withContent.record.composition.clips.find(clip => clip.startMs === 5_000 && clip.layerId === 'over')
    expect(copiedClipC).toBeDefined()
    expect(copiedClipC!.instanceId).toBe('inst-b')
    expect(withContent.record.composition.clips.find(clip => clip.id === 'clip-b')!.startMs).toBe(8_000)
    expect(withContent.record.composition.patternInstances).toEqual(record.composition.patternInstances)
  })

  it('makes a repeated Layout definition unique without cloning Zones', () => {
    const record = commandFixtureV2()
    const unique = changed(applyShowCommandV2(record, 'make_layout_interval_unique', { interval_id: 'interval-2' }))
    expect(unique.record.zoneLayouts).toHaveLength(3)
    expect(unique.record.zones).toEqual(record.zones)
    expect(unique.record.composition.layoutOccurrences[1].layoutId).not.toBe('both')

    // A definition already used once is a no-op.
    expect(applyShowCommandV2(unique.record, 'make_layout_interval_unique', { interval_id: 'interval-2' }).status).toBe('unchanged')
  })
})

describe('v2 Marker, Effect and animation commands', () => {
  it('adds, updates and removes Markers, and carries the chapter role to the owner', () => {
    const record = commandFixtureV2()
    const added = changed(applyShowCommandV2(record, 'add_marker', { at_ms: 6_000, name: 'Drop' }))
    const markerId = added.changes[0].targetId!
    expect(added.record.composition.markers.map(marker => marker.timeMs)).toEqual([2_000, 6_000])
    expect(added.record.composition.markers.find(marker => marker.id === markerId)!.role).toBeUndefined()

    const updated = changed(applyShowCommandV2(added.record, 'update_marker', { marker_id: markerId, at_ms: 7_000, color: '#ff0000' }))
    expect(updated.record.composition.markers.find(marker => marker.id === markerId))
      .toMatchObject({ timeMs: 7_000, color: '#ff0000' })

    // The role reaches the record, projects as a chapter, and null clears it.
    const chapter = changed(applyShowCommandV2(updated.record, 'add_marker', { at_ms: 100, name: 'Intro', role: 'chapter' }))
    const chapterId = chapter.changes[0].targetId!
    expect(showChaptersV2(reopen(chapter.record)).map(entry => entry.id)).toEqual([chapterId])
    const promoted = changed(applyShowCommandV2(chapter.record, 'update_marker', { marker_id: markerId, role: 'chapter' }))
    expect(showChaptersV2(promoted.record).map(entry => entry.id)).toEqual([chapterId, markerId])
    const cleared = changed(applyShowCommandV2(promoted.record, 'update_marker', { marker_id: markerId, role: null }))
    expect(cleared.record.composition.markers.find(marker => marker.id === markerId)!.role).toBeUndefined()
    expect(showChaptersV2(cleared.record).map(entry => entry.id)).toEqual([chapterId])
    // An already-cleared role is an ordinary no-op, not a refusal.
    expect(applyShowCommandV2(cleared.record, 'update_marker', { marker_id: markerId, role: null }).status).toBe('unchanged')

    const removed = changed(applyShowCommandV2(updated.record, 'remove_marker', { marker_id: markerId }))
    expect(removed.record.composition.markers).toEqual(record.composition.markers)
  })

  it('adds, updates, reorders, duplicates and removes Clip Effects through the apply selector', () => {
    const record = commandFixtureV2()
    const added = changed(applyShowCommandV2(record, 'add_clip_effect', {
      clip_id: 'clip-a', kind: 'hue', parameters: { turns: 0.25 }, apply: { scope: 'whole-clip' },
    }))
    const effectId = added.record.composition.clips[0].appearance.keys[0].value.effects![0].id
    expect(added.record.composition.clips[0].appearance.keys[0].value.effects).toMatchObject([{ kind: 'hue', turns: 0.25 }])

    const updated = changed(applyShowCommandV2(added.record, 'update_clip_effect', {
      clip_id: 'clip-a', effect_id: effectId, parameters: { turns: 0.75 }, apply: { scope: 'whole-clip' },
    }))
    expect(updated.record.composition.clips[0].appearance.keys[0].value.effects![0]).toMatchObject({ turns: 0.75 })

    const duplicated = changed(applyShowCommandV2(updated.record, 'duplicate_clip_effect', {
      clip_id: 'clip-a', effect_id: effectId, apply: { scope: 'whole-clip' },
    }))
    expect(duplicated.record.composition.clips[0].appearance.keys[0].value.effects).toHaveLength(2)

    const second = duplicated.record.composition.clips[0].appearance.keys[0].value.effects![1].id
    const reordered = changed(applyShowCommandV2(duplicated.record, 'move_clip_effect', {
      clip_id: 'clip-a', effect_id: second, target_effect_id: effectId, edge: 'before', apply: { scope: 'whole-clip' },
    }))
    expect(reordered.record.composition.clips[0].appearance.keys[0].value.effects!.map(effect => effect.id)).toEqual([second, effectId])

    const removedEffect = changed(applyShowCommandV2(reordered.record, 'remove_clip_effect', {
      clip_id: 'clip-a', effect_id: second, apply: { scope: 'whole-clip' },
    }))
    expect(removedEffect.record.composition.clips[0].appearance.keys[0].value.effects!.map(effect => effect.id)).toEqual([effectId])
  })

  it('adds Property tracks for each target kind, edits keyframes and removes by identity', () => {
    const record = commandFixtureV2()
    const added = changed(applyShowCommandV2(record, 'add_property_tracks', {
      tracks: [
        { target: { kind: 'view-brightness', clip_id: 'clip-c' }, keyframes: [{ at_ms: 1_000, value: 0 }, { at_ms: 3_000, value: 1 }] },
        { target: { kind: 'time-scale', instance_id: 'inst-b' }, initial_value: 0.5 },
        { target: { kind: 'layout-split-position', interval_id: 'interval-2' }, initial_value: 0.4 },
        { target: { kind: 'show-repeat-scale' }, initial_value: 2 },
      ],
    }))
    const tracks = added.record.composition.propertyTracks
    expect(tracks).toHaveLength(5)
    // Default activation is the Clip span, the union of user spans, the interval, or the Show.
    expect(tracks.find(track => track.target.kind === 'clip-view')).toMatchObject({ activeStartMs: 1_000, activeDurationMs: 2_000 })
    expect(tracks.find(track => track.target.kind === 'instance-time-scale')).toMatchObject({ activeStartMs: 1_000, activeDurationMs: 2_000 })
    expect(tracks.find(track => track.target.kind === 'layout-occurrence-split-position')).toMatchObject({ activeStartMs: 5_000, activeDurationMs: 5_000 })
    expect(tracks.find(track => track.target.kind === 'show-repeat-scale')).toMatchObject({ activeStartMs: 0, activeDurationMs: 10_000 })

    // A second owner of the same instance target over an overlapping window refuses.
    const conflict = applyShowCommandV2(added.record, 'add_property_tracks', {
      tracks: [{ target: { kind: 'time-scale', instance_id: 'inst-b' }, initial_value: 1 }],
    })
    expect(conflict.status).toBe('refused')
    if (conflict.status !== 'refused') return
    expect(conflict.record).toBe(added.record)

    const edited = changed(applyShowCommandV2(added.record, 'edit_property_keyframes', {
      track_id: 'track-a',
      edits: {
        add: [{ at_ms: 2_000, value: 0.5, easing: 'ease-in' }],
        update: [{ keyframe_id: 'track-a-end', value: 0.9 }],
      },
    }))
    const trackA = edited.record.composition.propertyTracks.find(track => track.id === 'track-a')!
    expect(trackA.keyframes.map(key => [key.timeMs, key.value])).toEqual([[0, 0], [2_000, 0.5], [4_000, 0.9]])

    const widened = changed(applyShowCommandV2(edited.record, 'update_property_track', { track_id: 'track-a', active_duration_ms: 5_000 }))
    expect(widened.record.composition.propertyTracks.find(track => track.id === 'track-a')!.activeDurationMs).toBe(5_000)

    const removed = changed(applyShowCommandV2(widened.record, 'remove_property_tracks', { track_ids: ['track-a'] }))
    expect(removed.record.composition.propertyTracks.some(track => track.id === 'track-a')).toBe(false)
    expect(removed.changes[0].details.removed).toEqual(expect.arrayContaining(['track-a', 'track-a-start']))
  })
})

describe('v2 command addressing, no-op policy and parity', () => {
  it('refuses an unknown identity with candidate identities and leaves the record untouched', () => {
    const record = commandFixtureV2()
    const inserted = changed(applyShowCommandV2(record, 'insert_transition', {
      from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 500, kind: 'crossfade',
    }))
    for (const [name, input, label, expected] of [
      ['update_clips', { updates: [{ clip_id: 'absent', start_ms: 0 }] }, 'Clip', 'clip-a'],
      ['remove_transition', { transition_id: 'absent' }, 'Transition', inserted.record.composition.transitions[0].id],
      ['select_layout', { interval_id: 'absent', layout_id: 'both' }, 'Layout interval', 'interval-1'],
      ['remove_marker', { marker_id: 'absent' }, 'Marker', 'marker-1'],
      ['remove_property_tracks', { track_ids: ['absent'] }, 'Property track', 'track-a'],
      ['rename_layer', { layer_id: 'absent', name: 'x' }, 'Layer', 'base'],
      ['select_layout', { interval_id: 'interval-1', layout_id: 'absent' }, 'Zone Layout', 'both'],
    ] as const) {
      const outcome = applyShowCommandV2(inserted.record, name, input as Record<string, unknown>)
      expect(outcome.status, name).toBe('refused')
      if (outcome.status !== 'refused') continue
      expect(outcome.issues[0].code, name).toBe('unknown-id')
      expect(outcome.issues[0].message, name).toContain(label)
      // Candidates must name the identities that actually exist.
      expect(outcome.issues[0].candidates, name).toContain(expected)
      expect(outcome.record).toBe(inserted.record)
    }
    // An empty collection still answers with candidates rather than nothing.
    const noGroups = applyShowCommandV2(record, 'ungroup', { group_occurrence_id: 'absent' })
    expect(noGroups.status).toBe('refused')
    if (noGroups.status !== 'refused') return
    expect(noGroups.issues[0].code).toBe('unknown-id')
    expect(noGroups.issues[0].message).toContain('Group occurrence')
    expect(noGroups.issues[0].candidates).toEqual([])
  })

  it('resolves identities across a Layout switch and a Layer reorder', () => {
    const record = commandFixtureV2()
    const restacked = changed(applyShowCommandV2(record, 'reorder_layer', { layer_id: 'over', rank: 0 }))
    const switched = changed(applyShowCommandV2(restacked.record, 'move_layout_switch', { interval_id: 'interval-2', start_ms: 3_000 }))
    const edited = changed(applyShowCommandV2(switched.record, 'update_clips', {
      updates: [{ clip_id: 'clip-c', appearance: { apply: { scope: 'whole-clip' }, opacity: 0.5 } }],
    }, context))
    expect(edited.record.composition.clips.find(clip => clip.id === 'clip-c')!.appearance.keys[0].value.opacity).toBe(0.5)
  })

  it('returns unchanged for an already-satisfied request to every command without aborting a batch', () => {
    // One already-satisfied request per command, on a record that satisfies it.
    const record = commandFixtureV2()
    const preparedOutcome = runShowCommandV2Transaction(record, [
      { name: 'insert_transition', input: { from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 500, kind: 'crossfade' } },
      { name: 'add_marker', input: { at_ms: 6_000, name: 'Drop' } },
      { name: 'add_clip_effect', input: { clip_id: 'clip-a', kind: 'hue', parameters: { turns: 0.25 }, apply: { scope: 'whole-clip' } } },
      { name: 'update_layout_interval', input: { interval_id: 'interval-2', split_position: 0.5 } },
      { name: 'set_output_contract', input: { kind: 'portable-2d', pixel_count: 16, map_id: 'plane' } },
      { name: 'make_layout_interval_unique', input: { interval_id: 'interval-1' } },
    ])
    if (preparedOutcome.status !== 'changed') throw new Error(JSON.stringify(preparedOutcome))
    const base = preparedOutcome.record
    expect(validateShowRecordV2(reopen(base))).toEqual([])
    const transitionId = base.composition.transitions[0].id
    const markerId = base.composition.markers.find(marker => marker.name === 'Drop')!.id
    const effectId = base.composition.clips.find(clip => clip.id === 'clip-a')!.appearance.keys[0].value.effects![0].id

    const satisfied: Array<{ name: string; input: Record<string, unknown> }> = [
      { name: 'rename_show', input: { name: base.name } },
      { name: 'set_stage_map', input: { stage_map_id: base.stageMapId ?? null } },
      { name: 'update_zone', input: { zone_id: 'left', name: 'Left' } },
      { name: 'set_target_controller_profile', input: { profile_id: null } },
      { name: 'set_output_contract', input: { kind: 'portable-2d', pixel_count: 16, map_id: 'plane' } },
      { name: 'set_output_trails', input: { enabled: false } },
      { name: 'set_show_end', input: { end_ms: base.composition.showEndMs } },
      { name: 'rename_layer', input: { layer_id: 'base', name: 'Base' } },
      { name: 'reorder_layer', input: { layer_id: 'base', rank: 0 } },
      { name: 'update_clips', input: { updates: [{ clip_id: 'clip-c', zone_id: 'left', layer_id: 'over', start_ms: 1_000, duration_ms: 2_000, entry_policy: 'continue', zone_sample_mode: 'span' }] } },
      { name: 'resize_clip', input: { clip_id: 'clip-c', duration_ms: 2_000 } },
      { name: 'make_clip_pattern_independent', input: { clip_id: 'clip-c' } },
      { name: 'rejoin_clip_pattern_instance', input: { clip_id: 'clip-c', instance_id: 'inst-b' } },
      { name: 'update_transition', input: { transition_id: transitionId, kind: 'crossfade' } },
      { name: 'resize_transition', input: { transition_id: transitionId, duration_ms: 500 } },
      { name: 'select_layout', input: { interval_id: 'interval-2', layout_id: 'both' } },
      { name: 'update_layout_interval', input: { interval_id: 'interval-2', split_position: 0.5 } },
      { name: 'set_layout_transfer', input: { interval_id: 'interval-2', transfer: null } },
      { name: 'make_layout_interval_unique', input: { interval_id: 'interval-1' } },
      { name: 'update_marker', input: { marker_id: markerId, name: 'Drop', role: null } },
      { name: 'update_clip_effect', input: { clip_id: 'clip-a', effect_id: effectId, parameters: { turns: 0.25 }, apply: { scope: 'whole-clip' } } },
      { name: 'move_clip_effect', input: { clip_id: 'clip-a', effect_id: effectId, direction: 'earlier', apply: { scope: 'whole-clip' } } },
      { name: 'update_property_track', input: { track_id: 'track-a', active_start_ms: 0, active_duration_ms: 4_000 } },
      { name: 'edit_property_keyframes', input: { track_id: 'track-a', edits: { update: [{ keyframe_id: 'track-a-start', value: 0 }] } } },
    ]
    for (const command of satisfied) {
      const outcome = applyShowCommandV2(base, command.name, command.input, context)
      expect(outcome.status, `${command.name} must be a no-op`).toBe('unchanged')
      if (outcome.status !== 'unchanged') continue
      expect(outcome.changes, command.name).toEqual([])
      expect(outcome.record, command.name).toBe(base)
    }

    // Inside a batch a no-op never aborts: the other change still applies.
    const batch = runShowCommandV2Transaction(base, [
      { name: 'rename_show', input: { name: base.name } },
      { name: 'add_marker', input: { at_ms: 100, name: 'Intro' } },
      { name: 'set_show_end', input: { end_ms: base.composition.showEndMs } },
    ], context)
    expect(batch.status).toBe('changed')
    if (batch.status !== 'changed') return
    expect(batch.changes).toHaveLength(1)
    expect(batch.record.composition.markers.some(marker => marker.name === 'Intro')).toBe(true)
  })

  it('reaches the same accepted, refused and affected outcome as the manual owner', () => {
    const record = commandFixtureV2()
    // Appearance: command versus editShowClipAppearanceV2.
    const viaCommand = changed(applyShowCommandV2(record, 'update_clips', {
      updates: [{ clip_id: 'clip-a', appearance: { apply: { scope: 'whole-clip' }, opacity: 0.5 } }],
    }, context))
    const viaOwner = editShowClipAppearanceV2(record, { clipId: 'clip-a', scope: 'whole-clip', kind: 'appearance', patch: { opacity: 0.5 } })
    expect(viaOwner.status).toBe('changed')
    if (viaOwner.status !== 'changed') return
    expect(viaCommand.record.composition).toEqual(viaOwner.record.composition)
    expect(viaCommand.changes[0].details.clips).toEqual(viaOwner.affectedClipIds)
    expect(viaCommand.changes[0].details.appearanceKeys).toEqual([...viaOwner.affectedAppearanceKeyIds].sort())

    // Clip removal: command versus editShowTransitionV2 delete-clip.
    const removedCommand = changed(applyShowCommandV2(record, 'remove_clips', { clip_ids: ['clip-c'] }))
    const removedOwner = editShowTransitionV2(record, { kind: 'delete-clip', clipId: 'clip-c' })
    expect(removedOwner.status).toBe('changed')
    if (removedOwner.status !== 'changed') return
    expect(removedCommand.record.composition).toEqual(removedOwner.record.composition)
    expect(removedCommand.changes[0].details.removed).toEqual([...removedOwner.removedIds].sort())

    // Refusal parity: the command carries the owner's typed code through.
    const commandRefusal = applyShowCommandV2(record, 'set_show_end', { end_ms: 5_000 })
    const ownerRefusal = editShowLayoutIntervalsV2(record, { kind: 'set-show-end', showEndMs: 5_000 })
    expect(ownerRefusal.status).toBe('refused')
    if (ownerRefusal.status !== 'refused' || commandRefusal.status !== 'refused') return
    expect(commandRefusal.issues[0].code).toBe(ownerRefusal.code)
    expect(commandRefusal.issues[0].message).toContain(ownerRefusal.message)
  })

  it('validates descriptor shape before any owner runs', () => {
    const record = commandFixtureV2()
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['create_clips', { clips: [] }, 'empty-collection'],
      ['create_clips', { clips: Array.from({ length: 129 }, () => ({})) }, 'batch-too-large'],
      ['update_clips', { updates: [{ clip_id: 'clip-a', start_ms: -1 }] }, 'invalid-argument'],
      ['update_clips', { updates: [{ clip_id: 'clip-a', nope: 1 }] }, 'unknown-field'],
      ['add_marker', { at_ms: 1.5 }, 'invalid-argument'],
      ['add_marker', { at_ms: 0, role: 'verse' }, 'invalid-argument'],
      ['resize_clip', { clip_id: 'clip-a' }, 'invalid-argument'],
      ['resize_clip', { clip_id: 'clip-a', end_ms: 10, duration_ms: 10 }, 'invalid-argument'],
      ['insert_transition', { from_clip_id: 'clip-a', to_clip_id: 'clip-b', duration_ms: 500, kind: 'cut' }, 'invalid-argument'],
    ]
    for (const [name, input, code] of cases) {
      const outcome = applyShowCommandV2(record, name, input, context)
      expect(outcome.status, `${name} ${code}`).toBe('refused')
      if (outcome.status !== 'refused') continue
      expect(outcome.issues.map(issue => issue.code), `${name} ${code}`).toContain(code)
      expect(outcome.record).toBe(record)
    }
  })

  it('exposes one descriptor per catalogue row with an owner-backed apply', () => {
    expect(SHOW_COMMANDS_V2).toHaveLength(49)
    for (const descriptor of SHOW_COMMANDS_V2) {
      expect(typeof descriptor.apply, descriptor.name).toBe('function')
    }
  })
})
