// Provenance: pxlblz-v3 test/support/grammarHarness.ts at 9ecd481f, re-authored
// onto the version-2 catalogue for #1039 (see src/agent-harness/PROVENANCE.md).
// Shared harness for the grammar registry tests: the accepted/refused invariants
// asserted on every case, plus a recorder the touch-path faithfulness test
// replays golden runs through.
import { expect } from 'vitest'
import { validateShowRecordV2 } from '@/engine/showCompositionV2'
import type { ShowPropertyTrackV2 } from '@/engine/showCompositionV2'
import {
  applyShowGrammarOperation,
  type ShowGrammarDocument,
} from '../../grammar/registry.js'
import { projectClipListing } from '../../grammar/openShow.js'
import { trackSites } from '../../grammar/support.js'
import { openGrammarFixture, type GrammarFixtureOptions } from './grammarFixture.js'

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

export function fixture(options: GrammarFixtureOptions = {}): ShowGrammarDocument {
  return openGrammarFixture(options).document
}

export function applyOk(document: ShowGrammarDocument, name: string, args: Record<string, unknown>) {
  const before = structuredClone(document.show)
  const outcome = applyShowGrammarOperation(document, name, args)
  if (!outcome.ok) throw new Error(`${name} refused: ${JSON.stringify(outcome.issues)}`)
  expect(document.show).toEqual(before)
  expect(outcome.document.show).not.toEqual(before)
  expect(validateShowRecordV2(outcome.document.show)).toEqual([])
  expect(outcome.changes.length).toBeGreaterThan(0)
  for (const change of outcome.changes) {
    expect(change.op).toBe(name)
    expect(change.description.length).toBeGreaterThan(0)
  }
  if (recording) APPLIED_RECORDS.push({ op: name, before, after: structuredClone(outcome.document.show) })
  return outcome
}

/**
 * A valid request that changes nothing: catalogue rule 4 answers `unchanged`,
 * which reaches this surface as an accepted result with no changes and the
 * original document identity.
 */
export function applyNoop(document: ShowGrammarDocument, name: string, args: Record<string, unknown>) {
  const outcome = applyShowGrammarOperation(document, name, args)
  if (!outcome.ok) throw new Error(`${name} refused: ${JSON.stringify(outcome.issues)}`)
  expect(outcome.changes).toEqual([])
  expect(outcome.document.show).toEqual(document.show)
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

/**
 * One affected collection of a change record.
 *
 * A bulk command names no single target; it reports what it touched, and that
 * report is where a caller finds the identities it created.
 */
export function affectedIds(change: { details?: object }, collection: string): string[] {
  return ((change.details as Record<string, string[]> | undefined)?.[collection]) ?? []
}

export function clips(document: ShowGrammarDocument) {
  return projectClipListing(document).clips
}

export function layers(document: ShowGrammarDocument) {
  return projectClipListing(document).layers
}

export function layerNamed(document: ShowGrammarDocument, name: string) {
  const layer = layers(document).find((candidate) => candidate.name === name)
  if (!layer) throw new Error(`no Layer named ${name}`)
  return layer
}

export function clipAt(document: ShowGrammarDocument, startMs: number) {
  const clip = clips(document).find((candidate) => candidate.startMs === startMs)
  if (!clip) throw new Error(`no Clip starting at ${startMs} ms`)
  return clip
}

export function clipOnLayer(document: ShowGrammarDocument, layerName: string) {
  const clip = clips(document).find((candidate) => candidate.layerName === layerName)
  if (!clip) throw new Error(`no Clip on Layer ${layerName}`)
  return clip
}

export function instanceOf(document: ShowGrammarDocument, clipId: string) {
  const clip = clips(document).find((candidate) => candidate.clipId === clipId)
  if (!clip) throw new Error(`Clip ${clipId} not found`)
  const instance = document.show.composition.patternInstances.find((candidate) => candidate.id === clip.instanceId)
  if (!instance) throw new Error(`instance for Clip ${clipId} not found`)
  return instance
}

export function findTrackById(document: ShowGrammarDocument, trackId: string): ShowPropertyTrackV2 {
  const site = trackSites(document).find((candidate) => candidate.track.id === trackId)
  if (!site) throw new Error(`track ${trackId} not found`)
  return site.track
}

export function trackTimes(document: ShowGrammarDocument, trackId: string) {
  return findTrackById(document, trackId).keyframes.map((keyframe) => keyframe.timeMs)
}

/** The first Clip carrying a two- or three-key view-brightness track. */
export function withBrightnessTrack(keyframeCount: 2 | 3 = 2) {
  const document = fixture()
  const clip = clipAt(document, 0)
  const keyframes = [
    { at_ms: 0, value: 1 },
    ...(keyframeCount === 3 ? [{ at_ms: 5_000, value: 0.6 }] : []),
    { at_ms: 10_000, value: 0.2 },
  ]
  const { document: next, changes } = applyOk(document, 'add_property_tracks', {
    tracks: [{ target: { kind: 'view-brightness', clip_id: clip.clipId }, keyframes }],
  })
  const trackId = affectedIds(changes[0], 'tracks')[0]
  return {
    document: next,
    clipId: clip.clipId,
    trackId,
    keyframeIds: findTrackById(next, trackId).keyframes.map((keyframe) => keyframe.id),
  }
}

/** Two exactly adjacent Clips on the Main Layer with a derived Cut between them. */
export function withConsecutiveClips() {
  const document = fixture({ emptyTail: true })
  const first = clipAt(document, 0)
  const { document: shortened } = applyOk(document, 'resize_clip', {
    clip_id: first.clipId,
    duration_ms: 10_000,
  })
  const { document: withSecond, changes } = applyOk(shortened, 'create_clips', {
    clips: [{
      zone_id: 'z1',
      layer_id: layerNamed(shortened, 'Main').layerId,
      start_ms: 10_000,
      duration_ms: 10_000,
      pattern: { kind: 'stock', id: 'TestPattern2D' },
    }],
  })
  // A bulk command reports its affected collections rather than one target, so
  // the new Clip's identity comes from the affected set.
  const created = (changes[0].details as { clips: string[] }).clips
    .find((id) => id !== first.clipId)
  if (!created) throw new Error('create_clips reported no new Clip identity')
  return { document: withSecond, firstClipId: first.clipId, secondClipId: created }
}

/**
 * Consecutive Clips joined by a 2 s Crossfade.
 *
 * Inserting at the exact Cut ripples the incoming Clip later by the Transition's
 * duration, so the second Clip ends up at 12 000 ms.
 *
 * The v1 helper also gave the incoming Clip a view-brightness track so connected
 * moves exercised track relocation. The v2 compiler refuses that combination:
 * a participant Transition cannot be split across the derived section boundary
 * an authored Property activation needs, and it says so
 * (`section-scoped property activation ... inside Transition ... window`). The
 * bounded restriction is real, so this helper no longer authors one.
 */
export function withLayerTransition() {
  const base = withConsecutiveClips()
  const { document, changes } = applyOk(base.document, 'insert_transition', {
    from_clip_id: base.firstClipId,
    to_clip_id: base.secondClipId,
    duration_ms: 2_000,
    kind: 'crossfade',
  })
  return { ...base, document, transitionId: changes[0].targetId! }
}
