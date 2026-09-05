// Provenance: pxlblz-v3 test/grammarBreadth.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { showLoopDurationMs } from '@/engine/showModel'
import { SHOW_GRAMMAR_OPERATIONS } from '../grammar/registry.js'
import { openGrammarFixture } from './support/grammarFixture.js'
import { GOLDEN_RUNS } from './support/grammarGoldens.js'
import {
  applyOk,
  applyRefused,
  clipAt,
  clips,
  fixture,
  withBrightnessTrack,
} from './support/grammarHarness.js'

// Test model (issues #18/#19). Boundary: applyShowGrammarOperation over every
// operation family. The shared harness asserts on every case: the input
// document is never mutated; success never returns a document identical to
// its input; every accepted result passes the vendored composition and
// property-track validators; a refusal is typed and leaves the document
// unchanged. Golden cases live in test/support/grammarGoldens.ts; the
// structural families' refusal partitions live in grammarStructure.test.ts.

describe('grammar registry breadth (#18)', () => {
  it('has a golden accepted case for every registry operation', () => {
    const missing = SHOW_GRAMMAR_OPERATIONS
      .map((operation) => operation.name)
      .filter((name) => !(name in GOLDEN_RUNS))
    expect(missing).toEqual([])
  })

  for (const [name, run] of Object.entries(GOLDEN_RUNS)) {
    it(`${name}: golden accepted case`, run)
  }

  describe('planner-backed refusals carry the plan reason', () => {
    it('add_clip refuses an occupied layer, an invalid time, and a missing layer', () => {
      const base = { pattern_kind: 'stock', pattern_id: 'CometLoom' }
      applyRefused(fixture(), 'add_clip', { ...base, zone_id: 'z1', start_ms: 10_000 }, 'occupied')
      applyRefused(fixture(), 'add_clip', { ...base, zone_id: 'z1', start_ms: 70_000 }, 'invalid-time')
      applyRefused(fixture(), 'add_clip', { ...base, zone_id: 'zz' , start_ms: 1_000 }, 'unknown-zone')
      applyRefused(
        fixture(),
        'add_clip',
        { ...base, zone_id: 'z1', start_ms: 1_000, overlay_layer_index: 0 },
        'missing-owner',
      )
    })

    it('split_clip refuses a point outside the clip', () => {
      const document = fixture()
      const clip = clipAt(document, 0)
      const issues = applyRefused(document, 'split_clip', { clip_id: clip.clipId, at_ms: 0 }, 'outside-clip')
      expect(issues[0].message).toContain(clip.clipId)
    })

    it('duplicate_clip refuses an occupied tail and a duplicate past Show End', () => {
      const document = fixture()
      applyRefused(document, 'duplicate_clip', { clip_id: clipAt(document, 0).clipId }, 'occupied')
      applyRefused(document, 'duplicate_clip', { clip_id: clipAt(document, 30_000).clipId }, 'scene-boundary')
    })

    it('rejoin refuses incompatible and already-shared targets', () => {
      const document = fixture()
      const first = clipAt(document, 0)
      const second = clipAt(document, 30_000)
      const issues = applyRefused(
        document,
        'rejoin_clip_pattern_instance',
        { clip_id: first.clipId, target_clip_id: second.clipId },
        'incompatible-target',
      )
      expect(issues[0].message).toContain(first.clipId)

      const shared = applyOk(
        fixture({ emptySecondScene: true }),
        'duplicate_clip',
        { clip_id: clipAt(fixture({ emptySecondScene: true }), 0).clipId, linked: true },
      )
      const copy = clipAt(shared.document, 30_000)
      applyRefused(
        shared.document,
        'rejoin_clip_pattern_instance',
        { clip_id: copy.clipId, target_clip_id: clipAt(shared.document, 0).clipId },
        'already-shared',
      )
    })

    it('insert_time refuses inside a multi-part clip and a non-positive duration', () => {
      const document = fixture({ emptySecondScene: true })
      const clip = clipAt(document, 0)
      applyRefused(document, 'insert_time', { at_ms: 1_000, duration_ms: 0 }, 'invalid-duration')
      const { document: grown } = applyOk(document, 'resize_clip', { clip_id: clip.clipId, duration_ms: 45_000 })
      applyRefused(grown, 'insert_time', { at_ms: 30_000, duration_ms: 5_000 }, 'logical-clip')
    })
  })

  describe('pre-checks convert silent identity refusals into typed issues', () => {
    it('move_clip refuses overlap and outside-timeline with the conflicting element', () => {
      const document = fixture()
      const first = clipAt(document, 0)
      const second = clipAt(document, 30_000)
      const issues = applyRefused(
        document,
        'move_clip',
        { clip_id: first.clipId, start_ms: 25_000 },
        'occupied',
      )
      expect(issues[0].message).toContain(second.clipId)
      expect(issues[0].remedy).toBeTruthy()
      applyRefused(document, 'move_clip', { clip_id: first.clipId, start_ms: 50_000 }, 'outside-timeline')
      applyRefused(
        document,
        'move_clip',
        { clip_id: first.clipId, start_ms: 1_000, layer: 0 },
        'missing-owner',
      )
    })

    it('remove_clip keeps the last clip', () => {
      const document = fixture({ emptySecondScene: true })
      const issues = applyRefused(
        document,
        'remove_clip',
        { clip_id: clipAt(document, 0).clipId },
        'last-clip',
      )
      expect(issues[0].remedy).toBeTruthy()
    })

    it('make_clip_pattern_independent refuses an already-sole instance', () => {
      const document = fixture()
      applyRefused(
        document,
        'make_clip_pattern_independent',
        { clip_id: clipAt(document, 0).clipId },
        'already-independent',
      )
    })

    it('restart_clip refuses overlay clips', () => {
      const { document } = openGrammarFixture({ overlay: true })
      const overlay = clips(document).find((candidate) => candidate.layer.kind === 'overlay')!
      applyRefused(document, 'restart_clip', { clip_id: overlay.clipId }, 'invalid-argument')
    })

    it('set_show_end refuses a no-change request, naming the content clamp', () => {
      const document = fixture()
      const issues = applyRefused(document, 'set_show_end', { end_ms: 10_000 }, 'no-change')
      expect(issues[0].message).toContain('60000')
    })

    it('marker operations refuse unknown ids with candidates', () => {
      const document = fixture()
      applyRefused(document, 'move_marker', { marker_id: 'nope', at_ms: 1_000 }, 'unknown-marker')
      const { document: withMarker, changes } = applyOk(document, 'add_marker', { at_ms: 3_000 })
      const issues = applyRefused(
        withMarker,
        'remove_marker',
        { marker_id: 'nope' },
        'unknown-marker',
      )
      expect(issues[0].candidates).toContain(changes[0].targetId)
    })

    it('move_keyframe refuses landing on a sibling keyframe', () => {
      const { document, trackId, keyframeIds } = withBrightnessTrack()
      applyRefused(
        document,
        'move_keyframe',
        { track_id: trackId, keyframe_id: keyframeIds[0], time_ms: 10_000 },
        'duplicate-keyframe-time',
      )
    })

    it('empty patch operations refuse with invalid-argument', () => {
      const document = fixture()
      const clip = clipAt(document, 0)
      applyRefused(document, 'set_clip_view', { clip_id: clip.clipId }, 'invalid-argument')
      applyRefused(document, 'set_clip_time', { clip_id: clip.clipId }, 'invalid-argument')
      applyRefused(
        document,
        'set_clip_control_target',
        { clip_id: clip.clipId, export_name: 'speed', value: null },
        'no-change',
      )
    })
  })

  it('drives a full authoring sequence and stays valid throughout', () => {
    let document = fixture({ emptySecondScene: true })
    const first = clipAt(document, 0)

    document = applyOk(document, 'add_overlay_layer', { zone_id: 'z1' }).document
    document = applyOk(document, 'add_clip', {
      zone_id: 'z1',
      start_ms: 5_000,
      duration_ms: 10_000,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
      overlay_layer_index: 0,
    }).document
    const overlay = clips(document).find((candidate) => candidate.layer.kind === 'overlay')!
    document = applyOk(document, 'set_clip_view', { clip_id: first.clipId, brightness: 0.7 }).document
    document = applyOk(document, 'set_clip_time', { clip_id: overlay.clipId, time_scale: 0.5 }).document
    document = applyOk(document, 'add_marker', { at_ms: 5_000, name: 'Overlay in' }).document
    document = applyOk(document, 'insert_time', { at_ms: 25_000, duration_ms: 5_000 }).document
    document = applyOk(document, 'set_show_end', { end_ms: 80_000 }).document

    expect(showLoopDurationMs(document.show)).toBe(80_000)
    expect(clips(document).length).toBeGreaterThanOrEqual(2)
  })
})
