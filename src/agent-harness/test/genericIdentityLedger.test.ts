// V2-authored for #945 (second candidate review of the corrections, P1),
// re-authored on the version-2 record for #1039: the removed-id ledger is owned
// per identity domain and a move never touches it.
//
// Before, the ledger was one set of id strings and a move was implemented as
// remove + add, deleting every carried id from the ledger afterwards: a Marker
// and an Effect legitimately sharing an id string let "remove the Marker, move
// the Effect, add the Marker back" through, and a move into an owner whose
// Effect of that id had just been removed redirected the reference.
//
// Boundary: set_field and apply_patch through the registry and a session
// transaction, over a record where one id string names a Marker, an Effect on
// one Clip and an Effect on another, and where an Effect carries a Clip's own
// id. Invariants: a tombstone survives every later operation of the patch; an
// insertion or move never brings an id back into the domain it was removed
// from; independent domains (Marker versus Effect; Effects of different
// appearance keys) never block each other; Clips across Layers are one domain,
// while keyframes are scoped to their own track, as the engine's duplicate
// checks say; a refused patch leaves the record and a transaction's working copy
// untouched.
// Oracles: exact record equality for accepted edits; applyRefused's
// unchanged-record check and the named id for refusals; `validateShowRecordV2`,
// called directly on an edited record, for the declared record-wide domains.
//
// The v2 domains differ from v1 in one way this file records: an Effect stack
// belongs to a held appearance key, not to a Clip, so an Effect id is scoped to
// its key.
import { describe, expect, it } from 'vitest'
import { validateShowRecordV2, type ShowCompositionV2 } from '@/engine/showCompositionV2'
import { createSessionStore } from '../grammar/session.js'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { applyOk, applyRefused, clipOnLayer, fixture } from './support/grammarHarness.js'

const MARKERS = '/composition/markers'
const TRACKS = '/composition/propertyTracks'
const CLIPS = '/composition/clips'

const composition = (document: ShowGrammarDocument) => document.show.composition
const markersOf = (document: ShowGrammarDocument) => composition(document).markers
const clipIndex = (document: ShowGrammarDocument, layerName: string) =>
  composition(document).clips.findIndex((clip) => clip.id === clipOnLayer(document, layerName).clipId)
const effectsPointer = (index: number) => `${CLIPS}/${index}/appearance/keys/0/value/effects`
const effectsOf = (document: ShowGrammarDocument, index: number) =>
  composition(document).clips[index].appearance.keys[0].value.effects!

/**
 * The overlay fixture with two Markers, brightness and hue Effects on the Main
 * Clip and an opacity track on the overlay Clip, plus the shared id strings this
 * suite is about: a third Marker carrying the hue Effect's id, and an overlay
 * Effect stack holding the brightness Effect's id and the overlay Clip's own id.
 * The engine accepts all of it.
 */
function sharedIdDocument() {
  let document = fixture({ overlay: true })
  document = applyOk(document, 'add_marker', { at_ms: 12_000, name: 'Drop' }).document
  document = applyOk(document, 'add_marker', { at_ms: 20_000, name: 'Lift' }).document
  const mainClipId = clipOnLayer(document, 'Main').clipId
  const overlayClipId = clipOnLayer(document, 'Over').clipId
  for (const kind of ['brightness', 'hue']) {
    document = applyOk(document, 'add_clip_effect', { clip_id: mainClipId, kind, apply: { scope: 'whole-clip' } }).document
  }
  document = applyOk(document, 'add_property_tracks', {
    tracks: [{
      target: { kind: 'opacity', clip_id: overlayClipId },
      keyframes: [{ at_ms: 3_000, value: 0.8 }, { at_ms: 8_000, value: 0.4 }],
    }],
  }).document
  const main = clipIndex(document, 'Main')
  const over = clipIndex(document, 'Over')
  const [brightness, hue] = effectsOf(document, main)
  document = applyOk(document, 'apply_patch', {
    patch: [
      { op: 'add', path: `${MARKERS}/-`, value: { id: hue.id, timeMs: 25_000, name: 'Shared' } },
      // Each Effect enters the overlay key's own domain by insertion; replacing
      // the collection would be a write over elements it does not hold.
      { op: 'add', path: `${effectsPointer(over)}/-`, value: { ...brightness } },
      { op: 'add', path: `${effectsPointer(over)}/-`, value: { ...hue, id: overlayClipId } },
    ],
  }).document
  return { document, main, over, overlayClipId, brightness, hue }
}

function refusedIdentity(document: ShowGrammarDocument, operation: string, args: Record<string, unknown>, id: string) {
  const issues = applyRefused(document, operation, args, 'invalid-argument')
  expect(issues[0].message).toContain(id)
  expect(issues[0].message).toMatch(/identity/i)
  return issues
}

function expectedFrom(document: ShowGrammarDocument, edit: (composition: ShowCompositionV2) => void) {
  const expected = structuredClone(document.show)
  edit(expected.composition)
  return expected
}

describe('the fixture itself: one id string across independent domains is a valid Show', () => {
  it('shares the hue id between a Marker and an Effect, and the brightness id between two Clips', () => {
    const { document, over, overlayClipId, brightness, hue } = sharedIdDocument()
    expect(markersOf(document).map((marker) => marker.id)).toContain(hue.id)
    expect(effectsOf(document, over).map((effect) => effect.id)).toEqual([brightness.id, overlayClipId])
    expect(validateShowRecordV2(document.show)).toEqual([])
  })
})

describe('a move never erases a tombstone (#945 second review, P1)', () => {
  it('refuses the recycled Marker after a distinct Effect of the same id moved between Clips', () => {
    const { document, main, over, hue } = sharedIdDocument()
    const sharedMarker = markersOf(document).findIndex((marker) => marker.id === hue.id)
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/${sharedMarker}` },
        { op: 'move', from: `${effectsPointer(main)}/1`, path: `${effectsPointer(over)}/-` },
        { op: 'add', path: `${MARKERS}/-`, value: { id: hue.id, timeMs: 26_000, name: 'Recycled' } },
      ],
    }, hue.id)
  })

  it('refuses a move that would bring an id back into the key it was removed from', () => {
    const { document, main, over, brightness } = sharedIdDocument()
    // The overlay Clip's first Effect carries the Main Clip's brightness id:
    // moving it in after removing the Main Clip's own would redirect the
    // reference (that appearance key, brightness id) to another element.
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${effectsPointer(main)}/0` },
        { op: 'move', from: `${effectsPointer(over)}/0`, path: `${effectsPointer(main)}/0` },
      ],
    }, brightness.id)
  })

  it('keeps a legal move and the tombstones of other elements side by side', () => {
    const { document, main, over, hue } = sharedIdDocument()
    const [a] = markersOf(document)
    const moved = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/0` },
        { op: 'move', from: `${effectsPointer(main)}/1`, path: `${effectsPointer(over)}/-` },
      ],
    })
    expect(moved.document.show).toEqual(expectedFrom(document, (comp) => {
      comp.markers = comp.markers.slice(1)
      const mainEffects = comp.clips[main].appearance.keys[0].value.effects!
      comp.clips[main].appearance.keys[0].value.effects = mainEffects.slice(0, 1)
      comp.clips[over].appearance.keys[0].value.effects!.push(hue)
    }))
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/0` },
        { op: 'move', from: `${effectsPointer(main)}/1`, path: `${effectsPointer(over)}/-` },
        { op: 'add', path: `${MARKERS}/-`, value: { id: a.id, timeMs: 27_000, name: 'Back' } },
      ],
    }, a.id)
    // A same-collection move (reorder) is no different.
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/0` },
        { op: 'move', from: `${MARKERS}/1`, path: `${MARKERS}/0` },
        { op: 'add', path: `${MARKERS}/-`, value: { id: a.id, timeMs: 27_000, name: 'Back' } },
      ],
    }, a.id)
  })
})

describe('tombstones are owned by identity domains (#945 second review, P1)', () => {
  it('lets independent domains carry the same id string: a removed Marker does not block an Effect', () => {
    const { document, over, hue } = sharedIdDocument()
    const sharedMarker = markersOf(document).findIndex((marker) => marker.id === hue.id)
    const result = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/${sharedMarker}` },
        { op: 'add', path: `${effectsPointer(over)}/-`, value: { ...hue } },
      ],
    })
    expect(result.document.show).toEqual(expectedFrom(document, (comp) => {
      comp.markers = comp.markers.filter((marker) => marker.id !== hue.id)
      comp.clips[over].appearance.keys[0].value.effects!.push({ ...hue })
    }))
  })

  it('scopes an Effect id to its appearance key: removed from one, it is fresh on another', () => {
    const { document, main, over, hue } = sharedIdDocument()
    const result = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${effectsPointer(main)}/1` },
        { op: 'add', path: `${effectsPointer(over)}/-`, value: { ...hue } },
      ],
    })
    expect(result.document.show).toEqual(expectedFrom(document, (comp) => {
      const mainEffects = comp.clips[main].appearance.keys[0].value.effects!
      comp.clips[main].appearance.keys[0].value.effects = mainEffects.slice(0, 1)
      comp.clips[over].appearance.keys[0].value.effects!.push({ ...hue })
    }))
    // Back onto the same key it is a recycle.
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${effectsPointer(main)}/1` },
        { op: 'add', path: `${effectsPointer(main)}/-`, value: { ...hue, turns: 0.25 } },
      ],
    }, hue.id)
  })

  it('treats Clips on different Layers as one domain', () => {
    const { document, main, over } = sharedIdDocument()
    const mainClip = composition(document).clips[main]
    const overlayClip = composition(document).clips[over]
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${CLIPS}/${main}` },
        { op: 'add', path: `${CLIPS}/-`, value: { ...structuredClone(overlayClip), id: mainClip.id } },
      ],
    }, mainClip.id)
  })

  it('refuses the recycle atomically where nested owners share the id string, in and out of a transaction', () => {
    const { document, over, overlayClipId, hue } = sharedIdDocument()
    const patch = [
      { op: 'replace', path: `${MARKERS}/0/name`, value: 'Bass' },
      { op: 'remove', path: `${effectsPointer(over)}/1` },
      { op: 'add', path: `${effectsPointer(over)}/-`, value: { ...hue, id: overlayClipId } },
    ]
    refusedIdentity(document, 'apply_patch', { patch }, overlayClipId)

    const store = createSessionStore()
    const opened = store.open(document.show)
    if (!opened.ok) throw new Error('open failed')
    const sessionId = opened.sessionId
    expect(store.begin(sessionId, 'ledger txn').ok).toBe(true)
    const refused = store.apply(sessionId, 'apply_patch', { patch })
    expect(refused.ok).toBe(false)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: { label: 'ledger txn', changes: 0 } })
    const described = store.describe(sessionId)
    expect(described.ok && described.description.markers[0].name).toBe(markersOf(document)[0].name)
    expect(store.rollback(sessionId).ok).toBe(true)
    const exported = store.export(sessionId)
    expect(exported.ok && exported.show).toEqual(document.show)
  })
})

describe('the declared record-wide domains agree with the engine', () => {
  // The generic surface validates through tier-0 only, so the engine's own
  // duplicate checks are the oracle here: they define the domains the ledger
  // declares (Clips across Layers; keyframes across tracks), and their silence
  // on a Marker/Effect pair and on the Effects of two appearance keys is what
  // makes those domains independent.
  it('a Clip id duplicated across Layers is a duplicate to the engine', () => {
    const { document, main, over } = sharedIdDocument()
    const mainClip = composition(document).clips[main]
    const record = expectedFrom(document, (comp) => {
      comp.clips.push({ ...structuredClone(comp.clips[over]), id: mainClip.id, startMs: 40_000, durationMs: 1_000 })
    })
    const issues = validateShowRecordV2(record)
    expect(issues.some((issue) => issue.code === 'duplicate-id' && issue.message.includes(mainClip.id))).toBe(true)
    expect(validateShowRecordV2(document.show)).toEqual([])
  })

  it('a keyframe id is scoped to its track: duplicated inside one, the engine refuses; across two, it does not', () => {
    const { document: base, main } = sharedIdDocument()
    const document = applyOk(base, 'add_property_tracks', {
      tracks: [{
        target: { kind: 'view-brightness', clip_id: composition(base).clips[main].id },
        keyframes: [{ at_ms: 0, value: 1 }, { at_ms: 10_000, value: 0.5 }],
      }],
    }).document
    const [overlayTrack, mainTrack] = composition(document).propertyTracks
    const borrowed = mainTrack.keyframes[0].id

    // Across two tracks the same id string is legal.
    const shared = expectedFrom(document, (comp) => {
      comp.propertyTracks[0].keyframes[0].id = borrowed
    })
    expect(validateShowRecordV2(shared)).toEqual([])

    // Inside one track it is a duplicate.
    const duplicated = expectedFrom(document, (comp) => {
      comp.propertyTracks[0].keyframes.push({
        ...structuredClone(overlayTrack.keyframes[1]),
        id: overlayTrack.keyframes[0].id,
        timeMs: 7_000,
      })
    })
    const issues = validateShowRecordV2(duplicated)
    expect(issues.some((issue) => issue.code === 'duplicate-id' && issue.message.includes(overlayTrack.keyframes[0].id))).toBe(true)
    expect(validateShowRecordV2(document.show)).toEqual([])
  })

  it(`${TRACKS} removal keeps the rest of the record valid`, () => {
    const { document } = sharedIdDocument()
    const cleared = applyOk(document, 'set_field', { pointer: TRACKS, value: [] })
    expect(validateShowRecordV2(cleared.document.show)).toEqual([])
  })
})
