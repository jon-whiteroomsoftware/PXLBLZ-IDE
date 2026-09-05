// Provenance: pxlblz-v3 test/support/grammarHarness.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Shared harness for the grammar registry tests: the accepted/refused
// invariants from issue #18 asserted on every case, plus a recorder the
// touch-path faithfulness test (#19) replays golden runs through.
import { expect } from 'vitest'
import type { ShowCompositionV1 } from '@/engine/personalContentRecords'
import { validateShowComposition } from '@/engine/showCompositionModel'
import { validateShowPropertyTracks } from '@/engine/showPropertyAnimation'
import {
  applyShowGrammarOperation,
  type ShowGrammarDocument,
} from '../../grammar/registry.js'
import { projectClipListing } from '../../grammar/openShow.js'
import { openGrammarFixture } from './grammarFixture.js'

export interface AppliedRecord {
  op: string
  before: unknown
  after: unknown
}

/** Populated by applyOk while recording is on (the faithfulness test). */
export const APPLIED_RECORDS: AppliedRecord[] = []
let recording = false

export function withRecording<T>(run: () => T): T {
  APPLIED_RECORDS.length = 0
  recording = true
  try {
    return run()
  } finally {
    recording = false
  }
}

export function fixture(options: Parameters<typeof openGrammarFixture>[0] = {}): ShowGrammarDocument {
  return openGrammarFixture(options).document
}

export function applyOk(document: ShowGrammarDocument, name: string, args: Record<string, unknown>) {
  const before = structuredClone(document.show)
  const outcome = applyShowGrammarOperation(document, name, args)
  if (!outcome.ok) throw new Error(`${name} refused: ${JSON.stringify(outcome.issues)}`)
  expect(document.show).toEqual(before)
  expect(outcome.document.show).not.toEqual(before)
  const composition = outcome.document.show.composition as ShowCompositionV1
  expect(validateShowComposition(outcome.document.show, composition)).toEqual([])
  expect(validateShowPropertyTracks(outcome.document.show, composition)).toEqual([])
  expect(outcome.changes.length).toBeGreaterThan(0)
  for (const change of outcome.changes) {
    expect(change.op).toBe(name)
    expect(change.description.length).toBeGreaterThan(0)
  }
  if (recording) APPLIED_RECORDS.push({ op: name, before, after: structuredClone(outcome.document.show) })
  return outcome
}

export function applyRefused(
  document: ShowGrammarDocument,
  name: string,
  args: Record<string, unknown>,
  code: string,
) {
  const before = structuredClone(document.show)
  const outcome = applyShowGrammarOperation(document, name, args)
  if (outcome.ok) throw new Error(`${name} unexpectedly accepted: ${JSON.stringify(outcome.changes)}`)
  expect(document.show).toEqual(before)
  expect(outcome.issues[0].code).toBe(code)
  expect(outcome.issues[0].message.length).toBeGreaterThan(0)
  return outcome.issues
}

export function clips(document: ShowGrammarDocument) {
  return projectClipListing(document).clips
}

export function clipAt(document: ShowGrammarDocument, startMs: number) {
  const clip = clips(document).find((candidate) => candidate.startMs === startMs)
  if (!clip) throw new Error(`no clip starting at ${startMs} ms`)
  return clip
}

export function instanceOf(document: ShowGrammarDocument, clipId: string) {
  const clip = clips(document).find((candidate) => candidate.clipId === clipId)
  if (!clip) throw new Error(`clip ${clipId} not found`)
  const composition = document.show.composition as ShowCompositionV1
  const instance = composition.patternInstances.find((candidate) => candidate.id === clip.instanceId)
  if (!instance) throw new Error(`instance for clip ${clipId} not found`)
  return instance
}

export function withBrightnessTrack(keyframeCount: 2 | 3 = 2) {
  const document = fixture()
  const clip = clipAt(document, 0)
  const keyframes = [
    { time_ms: 0, value: 1 },
    ...(keyframeCount === 3 ? [{ time_ms: 5_000, value: 0.6 }] : []),
    { time_ms: 10_000, value: 0.2 },
  ]
  const { document: next, changes } = applyOk(document, 'add_property_track', {
    clip_id: clip.clipId,
    target: 'view-brightness',
    keyframes,
  })
  return {
    document: next,
    trackId: changes[0].targetId,
    keyframeIds: (changes[0].details?.keyframeIds ?? []) as string[],
  }
}

export function findTrackById(document: ShowGrammarDocument, trackId: string) {
  for (const scene of (document.show.composition as ShowCompositionV1).scenes) {
    const track = scene.propertyTracks?.find((candidate) => candidate.id === trackId)
    if (track) return track
  }
  throw new Error(`track ${trackId} not found`)
}

export function trackTimes(document: ShowGrammarDocument, trackId: string) {
  return findTrackById(document, trackId).keyframes.map((keyframe) => keyframe.timeMs)
}

/** Two consecutive clips on the Scene-1 main layer with a cut between them. */
export function withConsecutiveClips() {
  const document = fixture({ emptySecondScene: true })
  const first = clipAt(document, 0)
  const { document: shortened } = applyOk(document, 'resize_clip', {
    clip_id: first.clipId,
    duration_ms: 10_000,
  })
  const { document: withSecond, changes } = applyOk(shortened, 'add_clip', {
    zone_id: 'z1',
    start_ms: 10_000,
    duration_ms: 10_000,
    pattern_kind: 'stock',
    pattern_id: 'CometLoom',
  })
  return { document: withSecond, firstClipId: first.clipId, secondClipId: changes[0].targetId }
}

/** Consecutive clips joined by a 2 s crossfade layer Transition; the second
 * clip carries a brightness track so chain moves exercise track relocation. */
export function withLayerTransition() {
  const base = withConsecutiveClips()
  const { document: tracked } = applyOk(base.document, 'add_property_track', {
    clip_id: base.secondClipId,
    target: 'view-brightness',
    keyframes: [
      { time_ms: 11_000, value: 1 },
      { time_ms: 18_000, value: 0.4 },
    ],
  })
  const { document, changes } = applyOk(tracked, 'insert_layer_transition', {
    from_clip_id: base.firstClipId,
    to_clip_id: base.secondClipId,
    duration_ms: 2_000,
  })
  return { ...base, document, transitionId: changes[0].targetId }
}
