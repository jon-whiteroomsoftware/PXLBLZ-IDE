// Provenance: pxlblz-v3 test/grammarRegistry.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import type { ShowCompositionV1 } from '@/engine/personalContentRecords'
import {
  expectAcceptedShowAuthoringEdit,
  expectRefusedShowAuthoringEdit,
} from '@/test/showAuthoringContract'
import {
  applyShowGrammarOperation,
  SHOW_GRAMMAR_OPERATIONS,
  type GrammarOperationResult,
  type ShowGrammarDocument,
} from '../grammar/registry.js'
import { projectClipListing } from '../grammar/openShow.js'
import { openGrammarFixture } from './support/grammarFixture.js'

// Test model (issue #17). Boundary: applyShowGrammarOperation over an opened
// (composition-normalized) document. Invariants: no input mutation; accepted
// results pass the vendored composition validator and tier-0; refusals are
// typed issues and leave the document untouched; engine identity refusals
// never surface as success. The vendored authoring-contract helpers own the
// universal engine-level assertions; these tests add the registry semantics.

function openFixture() {
  return openGrammarFixture()
}

/** The overlay clip in Scene 1 — the legal home of an opacity track. */
function overlayClip(document: ShowGrammarDocument) {
  const clip = projectClipListing(document).clips.find((candidate) => candidate.layer.kind === 'overlay')
  if (!clip) throw new Error('fixture has no overlay clip')
  return clip
}

/** First clip on the timeline (the Scene-1 clip, 0–30 s). */
function firstClip(document: ShowGrammarDocument) {
  const listing = projectClipListing(document)
  const clip = listing.clips.find((candidate) => candidate.startMs === 0)
  if (!clip) throw new Error('fixture has no clip at 0 ms')
  return clip
}

function secondClip(document: ShowGrammarDocument) {
  const listing = projectClipListing(document)
  const clip = listing.clips.find((candidate) => candidate.startMs === 30_000)
  if (!clip) throw new Error('fixture has no clip at 30 s')
  return clip
}

/** Run one operation through the vendored accepted-edit contract. */
function expectAccepted(
  document: ShowGrammarDocument,
  name: string,
  args: Record<string, unknown>,
  assertProjection: Parameters<typeof expectAcceptedShowAuthoringEdit>[0]['assertProjection'],
): { document: ShowGrammarDocument; changes: Array<{ op: string; targetId: string; description: string }> } {
  let outcome: GrammarOperationResult | null = null
  expectAcceptedShowAuthoringEdit({
    show: document.show,
    composition: document.show.composition as ShowCompositionV1,
    edit: (composition) => {
      outcome = applyShowGrammarOperation({ ...document, show: { ...document.show, composition } }, name, args)
      if (!outcome.ok) throw new Error(`expected acceptance, got: ${JSON.stringify(outcome.issues)}`)
      return outcome.document.show.composition as ShowCompositionV1
    },
    assertProjection,
    assertReferences: () => {},
  })
  if (!outcome || !(outcome as GrammarOperationResult).ok) throw new Error('operation did not run')
  const accepted = outcome as Extract<GrammarOperationResult, { ok: true }>
  expect(accepted.changes.length).toBeGreaterThan(0)
  for (const change of accepted.changes) {
    expect(change.op).toBe(name)
    expect(change.description.length).toBeGreaterThan(0)
  }
  return { document: accepted.document, changes: accepted.changes }
}

/** Run one refused operation through the vendored refused-edit contract. */
function expectRefused(
  document: ShowGrammarDocument,
  name: string,
  args: Record<string, unknown>,
  code: string,
): Array<{ code: string; message: string; remedy?: string; candidates?: string[] }> {
  let issues: Array<{ code: string; message: string; remedy?: string; candidates?: string[] }> = []
  expectRefusedShowAuthoringEdit({
    show: document.show,
    composition: document.show.composition as ShowCompositionV1,
    edit: (composition) => {
      const outcome = applyShowGrammarOperation({ ...document, show: { ...document.show, composition } }, name, args)
      if (outcome.ok) throw new Error('expected a refusal, operation was accepted')
      issues = outcome.issues
      return composition
    },
  })
  expect(issues.length).toBeGreaterThan(0)
  expect(issues[0].code).toBe(code)
  expect(issues[0].message.length).toBeGreaterThan(0)
  return issues
}

describe('grammar registry (#17)', () => {
  it('declares the clip, timeline, and animation operations with agent-facing metadata', () => {
    const names = SHOW_GRAMMAR_OPERATIONS.map((operation) => operation.name).sort()
    expect(names).toEqual([
      'add_clip',
      'add_clip_effect',
      'add_keyframe',
      'add_layout_interval',
      'add_marker',
      'add_overlay_layer',
      'add_property_track',
      'apply_patch',
      'delete_keyframe',
      'delete_property_track',
      'duplicate_clip',
      'duplicate_clip_effect',
      'duplicate_layout_interval',
      'insert_layer_transition',
      'insert_time',
      'make_clip_pattern_independent',
      'make_layout_interval_unique',
      'move_clip',
      'move_clip_effect',
      'move_connected_clip',
      'move_keyframe',
      'move_marker',
      'rejoin_clip_pattern_instance',
      'remove_clip',
      'remove_clip_effect',
      'remove_marker',
      'rename_show',
      'reset_layer_transition_to_cut',
      'resize_clip',
      'resize_connected_clip',
      'resize_layer_transition',
      'restart_clip',
      'set_clip_control_target',
      'set_clip_evaluation',
      'set_clip_time',
      'set_clip_view',
      'set_field',
      'set_junction_layout',
      'set_junction_timing',
      'set_junction_transition',
      'set_output_contract',
      'set_output_trails',
      'set_show_end',
      'set_stage_map',
      'split_clip',
      'update_clip_effect',
      'update_junction_parameter',
      'update_keyframe',
      'update_marker',
      'update_zone',
    ])
    for (const operation of SHOW_GRAMMAR_OPERATIONS) {
      expect(operation.description.length).toBeGreaterThan(40)
      expect(operation.mutates.length).toBeGreaterThan(0)
      expect(Object.keys(operation.inputShape).length).toBeGreaterThan(0)
    }
  })

  it('refuses an unknown operation name', () => {
    const { document } = openFixture()
    const outcome = applyShowGrammarOperation(document, 'no_such_operation', {})
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.issues[0].code).toBe('unknown-operation')
  })

  describe('resize_clip', () => {
    it('resizes the owner-example clip to 12 s by duration', () => {
      const { document } = openFixture()
      const clip = firstClip(document)
      const { document: next } = expectAccepted(
        document,
        'resize_clip',
        { clip_id: clip.clipId, duration_ms: 12_000 },
        (projection) => {
          const resized = projection.zones
            .flatMap((zone) => zone.layers)
            .flatMap((layer) => layer.clips)
            .find((candidate) => candidate.id === clip.clipId)
          expect(resized?.startMs).toBe(0)
          expect(resized?.durationMs).toBe(12_000)
        },
      )
      const untouched = secondClip(next)
      expect(untouched.startMs).toBe(30_000)
      expect(untouched.durationMs).toBe(30_000)
    })

    it('resizes by absolute end time', () => {
      const { document } = openFixture()
      const clip = firstClip(document)
      const { document: next } = expectAccepted(
        document,
        'resize_clip',
        { clip_id: clip.clipId, end_ms: 12_000 },
        () => {},
      )
      expect(firstClip(next).durationMs).toBe(12_000)
    })

    it('refuses to resize into an overlap, naming the conflicting clip and a remedy', () => {
      const { document } = openFixture()
      const clip = firstClip(document)
      const other = secondClip(document)
      const issues = expectRefused(
        document,
        'resize_clip',
        { clip_id: clip.clipId, duration_ms: 40_000 },
        'overlap',
      )
      expect(issues[0].message).toContain(other.clipId)
      expect(issues[0].remedy).toBeTruthy()
    })

    it('refuses to resize past the end of the timeline', () => {
      const { document } = openFixture()
      const clip = secondClip(document)
      expectRefused(document, 'resize_clip', { clip_id: clip.clipId, duration_ms: 40_000 }, 'outside-timeline')
    })

    it('refuses an unknown clip id and offers the known ids', () => {
      const { document } = openFixture()
      const issues = expectRefused(
        document,
        'resize_clip',
        { clip_id: 'nope', duration_ms: 12_000 },
        'unknown-clip',
      )
      const known = projectClipListing(document).clips.map((candidate) => candidate.clipId)
      for (const id of known) expect(issues[0].candidates).toContain(id)
    })

    it('refuses contradictory or degenerate size arguments', () => {
      const { document } = openFixture()
      const clip = firstClip(document)
      expectRefused(
        document,
        'resize_clip',
        { clip_id: clip.clipId, duration_ms: 12_000, end_ms: 12_000 },
        'invalid-argument',
      )
      expectRefused(document, 'resize_clip', { clip_id: clip.clipId }, 'invalid-argument')
      expectRefused(document, 'resize_clip', { clip_id: clip.clipId, duration_ms: 0 }, 'invalid-argument')
    })
  })

  describe('add_property_track', () => {
    it('adds the owner-example opacity track with explicit eased keyframes', () => {
      const { document } = openGrammarFixture({ overlay: true })
      const clip = overlayClip(document)
      const { document: next, changes } = expectAccepted(
        document,
        'add_property_track',
        {
          clip_id: clip.clipId,
          target: 'opacity',
          keyframes: [
            { time_ms: 3_000, value: 0.8, easing: 'ease-in-out' },
            { time_ms: 5_000, value: 0.6, easing: 'ease-in-out' },
            { time_ms: 8_000, value: 0.4 },
          ],
        },
        () => {},
      )
      const composition = next.show.composition as ShowCompositionV1
      const scene = composition.scenes.find((candidate) => candidate.sceneId === clip.sceneId)
      const track = scene?.propertyTracks?.[0]
      expect(track).toBeDefined()
      expect(track?.target).toEqual({ kind: 'placement-opacity', placementId: clip.startPlacementId })
      expect(track?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([3_000, 5_000, 8_000])
      expect(track?.keyframes.map((keyframe) => keyframe.value)).toEqual([0.8, 0.6, 0.4])
      expect(track?.keyframes[0].easing).toEqual({ curve: 'quadratic', direction: 'in-out' })
      expect(track?.keyframes[2].easing).toEqual({ curve: 'linear' })
      expect(changes[0].targetId).toBe(track?.id)
    })

    it('seeds a two-keyframe track across the Scene from an initial value', () => {
      const { document } = openFixture()
      const clip = firstClip(document)
      const { document: next } = expectAccepted(
        document,
        'add_property_track',
        { clip_id: clip.clipId, target: 'time-scale', initial_value: 0.5 },
        () => {},
      )
      const composition = next.show.composition as ShowCompositionV1
      const scene = composition.scenes.find((candidate) => candidate.sceneId === clip.sceneId)
      const track = scene?.propertyTracks?.[0]
      expect(track?.target.kind).toBe('instance-time-scale')
      expect(track?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([0, 30_000])
      expect(track?.keyframes.map((keyframe) => keyframe.value)).toEqual([0.5, 0.5])
    })

    it('refuses a control target without an export name', () => {
      const { document } = openFixture()
      const clip = firstClip(document)
      expectRefused(
        document,
        'add_property_track',
        { clip_id: clip.clipId, target: 'control', initial_value: 0.3 },
        'invalid-argument',
      )
    })

    it('refuses a second track for the same target, naming the existing track', () => {
      const { document } = openGrammarFixture({ overlay: true })
      const clip = overlayClip(document)
      const { document: next, changes } = expectAccepted(
        document,
        'add_property_track',
        { clip_id: clip.clipId, target: 'opacity', initial_value: 1 },
        () => {},
      )
      const issues = expectRefused(
        next,
        'add_property_track',
        { clip_id: clip.clipId, target: 'opacity', initial_value: 0.5 },
        'duplicate-target',
      )
      expect(issues[0].message).toContain(changes[0].targetId)
    })

    it('refuses keyframes outside the owning Scene, stating the valid range', () => {
      const { document } = openGrammarFixture({ overlay: true })
      const clip = overlayClip(document)
      const issues = expectRefused(
        document,
        'add_property_track',
        {
          clip_id: clip.clipId,
          target: 'opacity',
          keyframes: [
            { time_ms: 3_000, value: 0.8 },
            { time_ms: 31_000, value: 0.4 },
          ],
        },
        'outside-scene',
      )
      expect(issues[0].message).toMatch(/30[\s,_]?000|30 s/)
    })

    it('refuses a single-keyframe track', () => {
      const { document } = openGrammarFixture({ overlay: true })
      const clip = overlayClip(document)
      expectRefused(
        document,
        'add_property_track',
        { clip_id: clip.clipId, target: 'opacity', keyframes: [{ time_ms: 3_000, value: 0.8 }] },
        'invalid-argument',
      )
    })

    it('refuses an unknown clip id with candidates', () => {
      const { document } = openFixture()
      const issues = expectRefused(
        document,
        'add_property_track',
        { clip_id: 'nope', target: 'opacity', initial_value: 1 },
        'unknown-clip',
      )
      expect(issues[0].candidates?.length).toBeGreaterThan(0)
    })
  })

  describe('keyframe operations', () => {
    function withOpacityTrack() {
      const { document } = openGrammarFixture({ overlay: true })
      const clip = overlayClip(document)
      const accepted = expectAccepted(
        document,
        'add_property_track',
        {
          clip_id: clip.clipId,
          target: 'opacity',
          keyframes: [
            { time_ms: 3_000, value: 0.8, easing: 'ease-in-out' },
            { time_ms: 5_000, value: 0.6 },
            { time_ms: 8_000, value: 0.4 },
          ],
        },
        () => {},
      )
      return { document: accepted.document, clip, trackId: accepted.changes[0].targetId }
    }

    function trackKeyframes(document: ShowGrammarDocument, sceneId: string, trackId: string) {
      const composition = document.show.composition as ShowCompositionV1
      const scene = composition.scenes.find((candidate) => candidate.sceneId === sceneId)
      const track = scene?.propertyTracks?.find((candidate) => candidate.id === trackId)
      if (!track) throw new Error(`track ${trackId} not found`)
      return track.keyframes
    }

    it('add_keyframe inserts in time order', () => {
      const { document, clip, trackId } = withOpacityTrack()
      const { document: next } = expectAccepted(
        document,
        'add_keyframe',
        { track_id: trackId, time_ms: 6_500, value: 0.5 },
        () => {},
      )
      expect(trackKeyframes(next, clip.sceneId, trackId).map((keyframe) => keyframe.timeMs))
        .toEqual([3_000, 5_000, 6_500, 8_000])
    })

    it('add_keyframe refuses an unknown track with candidates', () => {
      const { document, trackId } = withOpacityTrack()
      const issues = expectRefused(
        document,
        'add_keyframe',
        { track_id: 'nope', time_ms: 6_500, value: 0.5 },
        'unknown-track',
      )
      expect(issues[0].candidates).toContain(trackId)
    })

    it('add_keyframe refuses a duplicate time, naming the existing keyframe', () => {
      const { document, trackId } = withOpacityTrack()
      expectRefused(
        document,
        'add_keyframe',
        { track_id: trackId, time_ms: 5_000, value: 0.5 },
        'duplicate-keyframe-time',
      )
    })

    it('add_keyframe refuses a time outside the Scene', () => {
      const { document, trackId } = withOpacityTrack()
      expectRefused(
        document,
        'add_keyframe',
        { track_id: trackId, time_ms: 31_000, value: 0.5 },
        'outside-scene',
      )
    })

    it('update_keyframe changes value and easing in place', () => {
      const { document, clip, trackId } = withOpacityTrack()
      const target = trackKeyframes(document, clip.sceneId, trackId)[1]
      const { document: next } = expectAccepted(
        document,
        'update_keyframe',
        { track_id: trackId, keyframe_id: target.id, value: 0.9, easing: 'ease-out' },
        () => {},
      )
      const updated = trackKeyframes(next, clip.sceneId, trackId).find((keyframe) => keyframe.id === target.id)
      expect(updated?.value).toBe(0.9)
      expect(updated?.easing).toEqual({ curve: 'quadratic', direction: 'out' })
      expect(updated?.timeMs).toBe(5_000)
    })

    it('update_keyframe moves a keyframe and keeps time order', () => {
      const { document, clip, trackId } = withOpacityTrack()
      const target = trackKeyframes(document, clip.sceneId, trackId)[0]
      const { document: next } = expectAccepted(
        document,
        'update_keyframe',
        { track_id: trackId, keyframe_id: target.id, time_ms: 6_000 },
        () => {},
      )
      expect(trackKeyframes(next, clip.sceneId, trackId).map((keyframe) => keyframe.timeMs))
        .toEqual([5_000, 6_000, 8_000])
    })

    it('update_keyframe refuses a move onto a sibling keyframe time', () => {
      const { document, clip, trackId } = withOpacityTrack()
      const target = trackKeyframes(document, clip.sceneId, trackId)[0]
      expectRefused(
        document,
        'update_keyframe',
        { track_id: trackId, keyframe_id: target.id, time_ms: 5_000 },
        'duplicate-keyframe-time',
      )
    })

    it('update_keyframe refuses an unknown keyframe id with candidates', () => {
      const { document, trackId } = withOpacityTrack()
      const issues = expectRefused(
        document,
        'update_keyframe',
        { track_id: trackId, keyframe_id: 'nope', value: 0.5 },
        'unknown-keyframe',
      )
      expect(issues[0].candidates?.length).toBe(3)
    })

    it('update_keyframe refuses an empty change set', () => {
      const { document, clip, trackId } = withOpacityTrack()
      const target = trackKeyframes(document, clip.sceneId, trackId)[0]
      expectRefused(
        document,
        'update_keyframe',
        { track_id: trackId, keyframe_id: target.id },
        'invalid-argument',
      )
    })

    it('delete_keyframe removes one keyframe and refuses below the two-keyframe minimum', () => {
      const { document, clip, trackId } = withOpacityTrack()
      const first = trackKeyframes(document, clip.sceneId, trackId)[0]
      const { document: next } = expectAccepted(
        document,
        'delete_keyframe',
        { track_id: trackId, keyframe_id: first.id },
        () => {},
      )
      const remaining = trackKeyframes(next, clip.sceneId, trackId)
      expect(remaining.map((keyframe) => keyframe.timeMs)).toEqual([5_000, 8_000])

      const issues = expectRefused(
        next,
        'delete_keyframe',
        { track_id: trackId, keyframe_id: remaining[0].id },
        'minimum-keyframes',
      )
      expect(issues[0].remedy).toBeTruthy()
    })

    it('delete_keyframe refuses an unknown keyframe id', () => {
      const { document, trackId } = withOpacityTrack()
      expectRefused(document, 'delete_keyframe', { track_id: trackId, keyframe_id: 'nope' }, 'unknown-keyframe')
    })
  })

  it('carries the owner example end to end at the module level', () => {
    const opened = openGrammarFixture({ overlay: true })
    let document = opened.document
    const clip = overlayClip(document)

    const resized = applyShowGrammarOperation(document, 'resize_clip', {
      clip_id: clip.clipId,
      duration_ms: 12_000,
    })
    if (!resized.ok) throw new Error(JSON.stringify(resized.issues))
    document = resized.document

    const tracked = applyShowGrammarOperation(document, 'add_property_track', {
      clip_id: clip.clipId,
      target: 'opacity',
      keyframes: [
        { time_ms: 3_000, value: 0.8, easing: 'ease-in-out' },
        { time_ms: 5_000, value: 0.6, easing: 'ease-in-out' },
        { time_ms: 8_000, value: 0.4, easing: 'ease-in-out' },
      ],
    })
    if (!tracked.ok) throw new Error(JSON.stringify(tracked.issues))
    document = tracked.document

    expect(firstClip(document).durationMs).toBe(12_000)
    const scene = (document.show.composition as ShowCompositionV1).scenes
      .find((candidate) => candidate.sceneId === clip.sceneId)
    expect(scene?.propertyTracks?.[0].keyframes).toHaveLength(3)
  })
})
