// V2-authored for #945 (candidate review of a4e11cc0, P1): element identity
// is enforced at each generic mutation, not inferred from the final record.
// The slot heuristic compared before/after array positions, so a patch that
// removed marker A and then renamed the surviving B to A read as "A kept, B
// removed" and was accepted. Boundary: set_field and apply_patch through the
// registry and once through a session transaction. Invariants: no generic
// operation writes, removes, moves or copies an element's id; a write over an
// existing subtree keeps every element under its own id and introduces none;
// an id removed earlier in the same patch is never reintroduced; insertion
// (add at an array position) and move carry identity legitimately; a refused
// patch leaves the record untouched. Oracles: full record equality for
// accepted edits, applyRefused's unchanged-record check and the named id for
// refusals, the session's pending count and export inside a transaction.
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../grammar/session.js'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { applyOk, applyRefused, clipOnLayer, fixture } from './support/grammarHarness.js'

/** The overlay fixture plus two Markers, two Clip Effects, and an opacity track. */
function richDocument(): ShowGrammarDocument {
  let document = fixture({ overlay: true })
  document = applyOk(document, 'add_marker', { at_ms: 12_000, name: 'Drop' }).document
  document = applyOk(document, 'add_marker', { at_ms: 20_000, name: 'Lift' }).document
  const mainClipId = clipOnLayer(document, 'Main').clipId
  for (const kind of ['brightness', 'hue']) {
    document = applyOk(document, 'add_clip_effect', {
      clip_id: mainClipId,
      kind,
      apply: { scope: 'whole-clip' },
    }).document
  }
  document = applyOk(document, 'add_clip_effect', {
    clip_id: clipOnLayer(document, 'Over').clipId,
    kind: 'vignette',
    apply: { scope: 'whole-clip' },
  }).document
  document = applyOk(document, 'add_property_tracks', {
    tracks: [{
      target: { kind: 'opacity', clip_id: clipOnLayer(document, 'Over').clipId },
      keyframes: [{ at_ms: 3_000, value: 0.8 }, { at_ms: 8_000, value: 0.4 }],
    }],
  }).document
  return document
}

const composition = (document: ShowGrammarDocument) => document.show.composition
const markersOf = (document: ShowGrammarDocument) => composition(document).markers
const clipIndex = (document: ShowGrammarDocument, layerName: string) =>
  composition(document).clips.findIndex((clip) => clip.id === clipOnLayer(document, layerName).clipId)
const effectsOf = (document: ShowGrammarDocument, layerName: string) =>
  composition(document).clips[clipIndex(document, layerName)].appearance.keys[0].value.effects!

const MARKERS = '/composition/markers'
const mainKey = (document: ShowGrammarDocument) => `/composition/clips/${clipIndex(document, 'Main')}/appearance/keys/0/value`
const overlayEffects = (document: ShowGrammarDocument) => `/composition/clips/${clipIndex(document, 'Over')}/appearance/keys/0/value/effects`

function refusedIdentity(document: ShowGrammarDocument, operation: string, args: Record<string, unknown>, id: string) {
  const issues = applyRefused(document, operation, args, 'invalid-argument')
  expect(issues[0].message).toContain(id)
  expect(issues[0].message).toMatch(/identity/i)
  return issues
}

describe('identity takeover inside one patch is refused (#945 repair)', () => {
  it('refuses removing one marker and then renaming the survivor to the removed id', () => {
    const document = richDocument()
    const [a, b] = markersOf(document)
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/0` },
        { op: 'replace', path: `${MARKERS}/0/id`, value: a.id },
      ],
    }, b.id)
  })

  it('refuses the same takeover through element replacement', () => {
    const document = richDocument()
    const [a, b] = markersOf(document)
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/0` },
        { op: 'replace', path: `${MARKERS}/0`, value: { ...b, id: a.id } },
      ],
    }, b.id)
  })

  it('never reintroduces an id removed earlier in the patch', () => {
    const document = richDocument()
    const [a, b] = markersOf(document)
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/0` },
        { op: 'add', path: `${MARKERS}/-`, value: { id: a.id, timeMs: 25_000, name: 'Tail' } },
      ],
    }, a.id)
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: `${MARKERS}/0` },
        { op: 'replace', path: MARKERS, value: [{ ...b, id: a.id }] },
      ],
    }, a.id)
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'replace', path: MARKERS, value: [b] },
        { op: 'add', path: `${MARKERS}/0`, value: { ...a } },
      ],
    }, a.id)
  })

  it('refuses a rename at the end of an otherwise legal patch and leaves the record untouched', () => {
    const document = richDocument()
    const [a] = markersOf(document)
    const fresh = { id: 'marker-fresh', timeMs: 1_000, name: 'Intro' }
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'add', path: `${MARKERS}/0`, value: fresh },
        { op: 'move', from: `${MARKERS}/1`, path: `${MARKERS}/0` },
        { op: 'replace', path: `${MARKERS}/0/id`, value: 'renamed' },
      ],
    }, a.id)

    // The same patch inside a transaction leaves the working copy untouched.
    const store = createSessionStore()
    const opened = store.open(document.show)
    if (!opened.ok) throw new Error('open failed')
    const sessionId = opened.sessionId
    expect(store.begin(sessionId, 'identity txn').ok).toBe(true)
    const refused = store.apply(sessionId, 'apply_patch', {
      patch: [
        { op: 'add', path: `${MARKERS}/0`, value: fresh },
        { op: 'replace', path: `${MARKERS}/1/id`, value: 'renamed' },
      ],
    })
    expect(refused.ok).toBe(false)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: { label: 'identity txn', changes: 0 } })
    const described = store.describe(sessionId)
    expect(described.ok && described.description.markers.map((marker) => marker.markerId)).toEqual(markersOf(document).map((marker) => marker.id))
    expect(store.rollback(sessionId).ok).toBe(true)
    const exported = store.export(sessionId)
    expect(exported.ok && exported.show).toEqual(document.show)
  })
})

describe('legitimate structural operations keep working (#945 repair)', () => {
  it('accepts insertion, removal and reorder in one patch, judged on the exact record', () => {
    const document = richDocument()
    const [a, b] = markersOf(document)
    const fresh = { id: 'marker-fresh', timeMs: 1_000, name: 'Intro' }
    const result = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'add', path: `${MARKERS}/0`, value: fresh },   // [fresh, a, b]
        { op: 'remove', path: `${MARKERS}/2` },              // [fresh, a]
        { op: 'move', from: `${MARKERS}/1`, path: `${MARKERS}/0` }, // [a, fresh]
      ],
    })
    const expected = structuredClone(document.show)
    expected.composition.markers = [a, fresh]
    expect(result.document.show).toEqual(expected)
    expect(b.id).not.toBe(fresh.id)
  })

  it('accepts an ancestor replacement that removes or reorders nested elements under their own ids', () => {
    const document = richDocument()
    const index = clipIndex(document, 'Main')
    const value = composition(document).clips[index].appearance.keys[0].value
    const [brightness, hue] = effectsOf(document, 'Main')

    const emptied = applyOk(document, 'apply_patch', {
      patch: [{ op: 'replace', path: mainKey(document), value: { ...value, effects: [] } }],
    })
    const expectedEmpty = structuredClone(document.show)
    expectedEmpty.composition.clips[index].appearance.keys[0].value.effects = []
    expect(emptied.document.show).toEqual(expectedEmpty)

    const reordered = applyOk(document, 'apply_patch', {
      patch: [{ op: 'replace', path: mainKey(document), value: { ...value, effects: [hue, brightness] } }],
    })
    const expectedOrder = structuredClone(document.show)
    expectedOrder.composition.clips[index].appearance.keys[0].value.effects = [hue, brightness]
    expect(reordered.document.show).toEqual(expectedOrder)

    // set_field over the collection itself is the same write.
    const viaSetField = applyOk(document, 'set_field', { pointer: `${mainKey(document)}/effects`, value: [hue, brightness] })
    expect(viaSetField.document.show).toEqual(expectedOrder)
  })

  it('refuses an ancestor replacement that introduces a nested id; insertion is an add at an array position', () => {
    const document = richDocument()
    const index = clipIndex(document, 'Main')
    const value = composition(document).clips[index].appearance.keys[0].value
    const opacity = { id: 'fx-opacity', kind: 'opacity', opacity: 0.5 }
    const issues = refusedIdentity(document, 'apply_patch', {
      patch: [{ op: 'replace', path: mainKey(document), value: { ...value, effects: [...value.effects!, opacity] } }],
    }, opacity.id)
    expect(`${issues[0].message} ${issues[0].remedy ?? ''}`).toMatch(/\badd\b/)

    const inserted = applyOk(document, 'apply_patch', {
      patch: [{ op: 'add', path: `${mainKey(document)}/effects/-`, value: opacity }],
    })
    const expected = structuredClone(document.show)
    expected.composition.clips[index].appearance.keys[0].value.effects!.push(opacity as never)
    expect(inserted.document.show).toEqual(expected)
  })

  it('moves an element between collections with its identity, and refuses copying one', () => {
    const document = richDocument()
    const mainIndex = clipIndex(document, 'Main')
    const overlayIndex = clipIndex(document, 'Over')
    const [brightness, hue] = effectsOf(document, 'Main')
    const [vignette] = effectsOf(document, 'Over')
    const moved = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'move', from: `${mainKey(document)}/effects/0`, path: `${overlayEffects(document)}/0` },
      ],
    })
    const expected = structuredClone(document.show)
    expected.composition.clips[mainIndex].appearance.keys[0].value.effects = [hue]
    expected.composition.clips[overlayIndex].appearance.keys[0].value.effects = [brightness, vignette]
    expect(moved.document.show).toEqual(expected)

    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'copy', from: `${mainKey(document)}/effects/0`, path: `${overlayEffects(document)}/0` },
      ],
    }, brightness.id)
  })
})
