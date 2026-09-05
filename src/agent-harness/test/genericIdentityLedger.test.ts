// V2-authored for #945 (second candidate review of the corrections, P1): the
// removed-id ledger is owned per identity domain and a move never touches it.
// Before, the ledger was one set of id strings and a move was implemented as
// remove + add, deleting every carried id from the ledger afterwards: a
// marker and an Effect legitimately sharing an id string let "remove the
// marker, move the Effect, add the marker back" through, and a move into a
// placement whose Effect of that id had just been removed redirected the
// reference. Boundary: set_field and apply_patch through the registry and a
// session transaction, over a record where one id string names a marker, an
// Effect on the main clip and an Effect on the overlay clip, and where an
// overlay Effect carries its own placement's id. Invariants: a tombstone
// survives every later operation of the patch; an insertion or move never
// brings an id back into the domain it was removed from; independent domains
// (marker vs Effect; Effects of different placements) never block each other;
// main and overlay placements, and keyframes across tracks, are one domain
// each, as the engine's duplicate checks say; a refused patch leaves the
// record and a transaction's working copy untouched. Oracles: exact record
// equality for accepted edits; applyRefused's unchanged-record check and the
// named id for refusals; the engine's own duplicate checks, called directly on
// an edited record, for the declared record-wide domains.
import { describe, expect, it } from 'vitest'
import type { ShowCompositionV1 } from '@/engine/personalContentRecords'
import { validateShowComposition } from '@/engine/showCompositionModel'
import { validateShowPropertyTracks } from '@/engine/showPropertyAnimation'
import { createSessionStore } from '../grammar/session.js'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { applyOk, applyRefused, clips, fixture } from './support/grammarHarness.js'

const MARKERS = '/composition/markers'
const MAIN_PLACEMENT = '/composition/scenes/0/zones/0/main/0'
const OVERLAY_LAYER = '/composition/scenes/0/zones/0/overlays/0'
const OVERLAY_PLACEMENT = `${OVERLAY_LAYER}/placements/0`
const TRACKS = '/composition/scenes/0/propertyTracks'

const composition = (document: ShowGrammarDocument) => document.show.composition as ShowCompositionV1
const markersOf = (document: ShowGrammarDocument) => composition(document).markers!
const mainPlacement = (document: ShowGrammarDocument) => composition(document).scenes[0].zones[0].main[0]
const overlayPlacement = (document: ShowGrammarDocument) => composition(document).scenes[0].zones[0].overlays[0].placements[0]

/**
 * The overlay fixture with two markers, brightness and hue Effects on the
 * main clip and an opacity track on the overlay clip, plus the shared id
 * strings this suite is about: a third marker carrying the hue Effect's id,
 * and an overlay Effect stack holding the brightness Effect's id and the
 * overlay placement's own id ("ov-clip-1"). The engine accepts all of it.
 */
function sharedIdDocument(): ShowGrammarDocument {
  let document = fixture({ overlay: true })
  document = applyOk(document, 'add_marker', { at_ms: 12_000, name: 'Drop' }).document
  document = applyOk(document, 'add_marker', { at_ms: 20_000, name: 'Lift' }).document
  const mainClip = clips(document).find((clip) => clip.layer.kind === 'main' && clip.startMs === 0)!
  document = applyOk(document, 'add_clip_effect', { clip_id: mainClip.clipId, kind: 'brightness' }).document
  document = applyOk(document, 'add_clip_effect', { clip_id: mainClip.clipId, kind: 'hue' }).document
  document = applyOk(document, 'add_property_track', {
    clip_id: 'ov-clip-1',
    target: 'opacity',
    keyframes: [{ time_ms: 3_000, value: 0.8 }, { time_ms: 8_000, value: 0.4 }],
  }).document
  const [brightness, hue] = mainPlacement(document).effects!
  document = applyOk(document, 'apply_patch', {
    patch: [
      { op: 'add', path: `${MARKERS}/-`, value: { id: hue.id, timeMs: 25_000, name: 'Shared' } },
      { op: 'add', path: `${OVERLAY_PLACEMENT}/effects`, value: [{ ...brightness }, { ...hue, id: 'ov-clip-1' }] },
    ],
  }).document
  return document
}

function refusedIdentity(document: ShowGrammarDocument, operation: string, args: Record<string, unknown>, id: string) {
  const issues = applyRefused(document, operation, args, 'invalid-argument')
  expect(issues[0].message).toContain(id)
  expect(issues[0].message).toMatch(/identity/i)
  return issues
}

function expectedFrom(document: ShowGrammarDocument, edit: (comp: ShowCompositionV1) => void) {
  const expected = structuredClone(document.show)
  edit(expected.composition as ShowCompositionV1)
  return expected
}

describe('the fixture itself: one id string across independent domains is a valid Show', () => {
  it('shares the hue id between a marker and an Effect, and the brightness id between two placements', () => {
    const document = sharedIdDocument()
    const [brightness, hue] = mainPlacement(document).effects!
    expect(markersOf(document).map((marker) => marker.id)).toContain(hue.id)
    expect(overlayPlacement(document).effects!.map((effect) => effect.id)).toEqual([brightness.id, 'ov-clip-1'])
    expect(overlayPlacement(document).id).toBe('ov-clip-1')
  })
})

describe('a move never erases a tombstone (#945 second review, P1)', () => {
  it('refuses the recycled marker after a distinct Effect of the same id moved between placements', () => {
    const document = sharedIdDocument()
    const hue = mainPlacement(document).effects![1]
    const sharedMarker = markersOf(document).findIndex((marker) => marker.id === hue.id)
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/${sharedMarker}` },
        { op: 'move', from: `${MAIN_PLACEMENT}/effects/1`, path: `${OVERLAY_PLACEMENT}/effects/-` },
        { op: 'add', path: `${MARKERS}/-`, value: { id: hue.id, timeMs: 26_000, name: 'Recycled' } },
      ],
    }, hue.id)
  })

  it('refuses a move that would bring an id back into the placement it was removed from', () => {
    const document = sharedIdDocument()
    const brightness = mainPlacement(document).effects![0]
    // The overlay clip's first Effect carries the main clip's brightness id:
    // moving it in after removing the main clip's own would redirect the
    // reference (main clip, brightness id) to another element.
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MAIN_PLACEMENT}/effects/0` },
        { op: 'move', from: `${OVERLAY_PLACEMENT}/effects/0`, path: `${MAIN_PLACEMENT}/effects/0` },
      ],
    }, brightness.id)
  })

  it('keeps a legal move and the tombstones of other elements side by side', () => {
    const document = sharedIdDocument()
    const [a] = markersOf(document)
    const hue = mainPlacement(document).effects![1]
    const moved = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/0` },
        { op: 'move', from: `${MAIN_PLACEMENT}/effects/1`, path: `${OVERLAY_PLACEMENT}/effects/-` },
      ],
    })
    expect(moved.document.show).toEqual(expectedFrom(document, (comp) => {
      comp.markers = comp.markers!.slice(1)
      comp.scenes[0].zones[0].main[0].effects = comp.scenes[0].zones[0].main[0].effects!.slice(0, 1)
      comp.scenes[0].zones[0].overlays[0].placements[0].effects!.push(hue)
    }))
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/0` },
        { op: 'move', from: `${MAIN_PLACEMENT}/effects/1`, path: `${OVERLAY_PLACEMENT}/effects/-` },
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
  it('lets independent domains carry the same id string: a removed marker does not block an Effect', () => {
    const document = sharedIdDocument()
    const hue = mainPlacement(document).effects![1]
    const sharedMarker = markersOf(document).findIndex((marker) => marker.id === hue.id)
    const result = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/${sharedMarker}` },
        { op: 'add', path: `${OVERLAY_PLACEMENT}/effects/-`, value: { ...hue } },
      ],
    })
    expect(result.document.show).toEqual(expectedFrom(document, (comp) => {
      comp.markers = comp.markers!.filter((marker) => marker.id !== hue.id)
      comp.scenes[0].zones[0].overlays[0].placements[0].effects!.push({ ...hue })
    }))
  })

  it('scopes an Effect id to its placement: removed from one clip, it is fresh on another', () => {
    const document = sharedIdDocument()
    const hue = mainPlacement(document).effects![1]
    const result = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MAIN_PLACEMENT}/effects/1` },
        { op: 'add', path: `${OVERLAY_PLACEMENT}/effects/-`, value: { ...hue } },
      ],
    })
    expect(result.document.show).toEqual(expectedFrom(document, (comp) => {
      comp.scenes[0].zones[0].main[0].effects = comp.scenes[0].zones[0].main[0].effects!.slice(0, 1)
      comp.scenes[0].zones[0].overlays[0].placements[0].effects!.push({ ...hue })
    }))
    // Back onto the same clip it is a recycle.
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MAIN_PLACEMENT}/effects/1` },
        { op: 'add', path: `${MAIN_PLACEMENT}/effects/-`, value: { ...hue, hue: 0.25 } },
      ],
    }, hue.id)
  })

  it('keys an Effect domain by its placement id, so removing the placement tombstones its stack but no other', () => {
    const document = sharedIdDocument()
    const hue = mainPlacement(document).effects![1]
    const placement = overlayPlacement(document)
    // The overlay placement (id ov-clip-1) goes, with its Effect of the same
    // id; a main-clip Effect may then carry "ov-clip-1", a placement may not.
    const result = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${TRACKS}/0` },
        { op: 'remove', path: OVERLAY_PLACEMENT },
        { op: 'add', path: `${MAIN_PLACEMENT}/effects/-`, value: { ...hue, id: 'ov-clip-1' } },
      ],
    })
    expect(result.document.show).toEqual(expectedFrom(document, (comp) => {
      comp.scenes[0].propertyTracks = []
      comp.scenes[0].zones[0].overlays[0].placements = []
      comp.scenes[0].zones[0].main[0].effects!.push({ ...hue, id: 'ov-clip-1' })
    }))
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${TRACKS}/0` },
        { op: 'remove', path: OVERLAY_PLACEMENT },
        { op: 'add', path: `${OVERLAY_LAYER}/placements/-`, value: { ...placement, effects: [] } },
      ],
    }, 'ov-clip-1')
    // A new placement's stack is a new domain: its Effect may carry the string.
    const replaced = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${TRACKS}/0` },
        { op: 'remove', path: OVERLAY_PLACEMENT },
        { op: 'add', path: `${OVERLAY_LAYER}/placements/-`, value: { ...placement, id: 'ov-clip-2', effects: [{ ...hue, id: 'ov-clip-1' }] } },
      ],
    })
    expect(replaced.document.show).toEqual(expectedFrom(document, (comp) => {
      comp.scenes[0].propertyTracks = []
      comp.scenes[0].zones[0].overlays[0].placements = [{ ...placement, id: 'ov-clip-2', effects: [{ ...hue, id: 'ov-clip-1' }] }]
    }))
  })

  it('treats main and overlay placements as one domain', () => {
    const document = sharedIdDocument()
    const placement = mainPlacement(document)
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: MAIN_PLACEMENT },
        { op: 'add', path: `${OVERLAY_LAYER}/placements/-`, value: { ...placement, startMs: 30_000, durationMs: 0, opacity: 1 } },
      ],
    }, placement.id)
  })

  it('refuses the recycle atomically where nested owners share the id string, in and out of a transaction', () => {
    const document = sharedIdDocument()
    const hue = mainPlacement(document).effects![1]
    const patch = [
      { op: 'replace', path: `${MARKERS}/0/name`, value: 'Bass' },
      { op: 'remove', path: `${OVERLAY_PLACEMENT}/effects/1` },
      { op: 'add', path: `${OVERLAY_PLACEMENT}/effects/-`, value: { ...hue, id: 'ov-clip-1' } },
    ]
    refusedIdentity(document, 'apply_patch', { patch }, 'ov-clip-1')

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
  // declares (placements across main and overlay layers; keyframes across
  // tracks), and their silence on a marker/Effect and on the Effects of two
  // placements is what makes those domains independent.
  it('a placement id duplicated across main and overlay layers is a duplicate to the engine', () => {
    const document = sharedIdDocument()
    const placement = mainPlacement(document)
    const record = expectedFrom(document, (comp) => {
      comp.scenes[0].zones[0].overlays[0].placements.push({
        ...overlayPlacement(document), id: placement.id, startMs: 30_000, durationMs: 0, effects: [],
      })
    })
    const issues = validateShowComposition(record, record.composition as ShowCompositionV1)
    expect(issues.some((issue) => issue.code === 'duplicate-id' && issue.message.includes(placement.id))).toBe(true)
    expect(validateShowComposition(document.show, composition(document))).toEqual([])
  })

  it('a keyframe id duplicated across tracks is a duplicate to the engine', () => {
    let document = sharedIdDocument()
    const mainClip = clips(document).find((clip) => clip.layer.kind === 'main' && clip.startMs === 0)!
    document = applyOk(document, 'add_property_track', {
      clip_id: mainClip.clipId,
      target: 'view-brightness',
      keyframes: [{ time_ms: 0, value: 1 }, { time_ms: 10_000, value: 0.5 }],
    }).document
    const [overlayTrack, mainTrack] = composition(document).scenes[0].propertyTracks!
    const borrowed = mainTrack.keyframes[0].id
    const record = expectedFrom(document, (comp) => {
      comp.scenes[0].propertyTracks![0].keyframes.push({ ...overlayTrack.keyframes[1], id: borrowed, timeMs: 9_000 })
    })
    const issues = validateShowPropertyTracks(record, record.composition as ShowCompositionV1)
    expect(issues.some((issue) => issue.code === 'duplicate-keyframe-id' && issue.message.includes(borrowed))).toBe(true)
    expect(validateShowPropertyTracks(document.show, composition(document))).toEqual([])
  })
})
