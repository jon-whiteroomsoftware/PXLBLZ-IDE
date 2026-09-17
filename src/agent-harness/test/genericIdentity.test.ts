// V2-authored for #945, re-authored on the version-2 record for #1039: the
// generic operations preserve engine-minted element identity. Boundary:
// set_field and apply_patch through the registry (and once through a session
// transaction), judged on the complete before and after records. Domain: the
// `id` of every array-member object in the Show record (Zones, Layouts,
// Transitions, instances, Layers, Clips, appearance keys, Effects, tracks,
// keyframes, Markers, output Effects) - what the coverage allowlist excludes
// as "*/id". Invariants: a refused write leaves the record unchanged and
// names the identity; an accepted write yields exactly the expected record,
// every identity present before still present. Partitions: direct id
// writes; element and ancestor subtree replacement; array reorder, append
// and removal; copy that would duplicate an identity; reference fields that
// merely name a Pattern, which stay editable.
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../grammar/session.js'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { applyOk, applyRefused, clipOnLayer, fixture, withLayerTransition } from './support/grammarHarness.js'

/** The overlay fixture plus two Markers, a Clip Effect, and an opacity track. */
export function richDocument(): ShowGrammarDocument {
  let document = fixture({ overlay: true })
  document = applyOk(document, 'add_marker', { at_ms: 12_000, name: 'Drop' }).document
  document = applyOk(document, 'add_marker', { at_ms: 20_000, name: 'Lift' }).document
  document = applyOk(document, 'add_clip_effect', {
    clip_id: clipOnLayer(document, 'Main').clipId,
    kind: 'brightness',
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
/** The index of the Clip that carries the fixture's one Effect. */
const effectClipIndex = (document: ShowGrammarDocument) => composition(document).clips
  .findIndex((candidate) => (candidate.appearance.keys[0].value.effects ?? []).length > 0)

/** Every element id anywhere in the record, with the collection it sits in. */
function identities(value: unknown, pointer = '', out: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
        out.push(`${pointer}:${(item as { id: string }).id}`)
      }
      identities(item, `${pointer}/${index}`, out)
    })
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) identities(child, `${pointer}/${key}`, out)
  }
  return out
}

function refusedIdentity(document: ShowGrammarDocument, operation: string, args: Record<string, unknown>, id: string) {
  const issues = applyRefused(document, operation, args, 'invalid-argument')
  expect(issues[0].message).toContain(id)
  expect(issues[0].message).toMatch(/identity/i)
  return issues
}

describe('direct identity writes are refused (#945)', () => {
  it('for every kind of element the record carries', () => {
    const document = richDocument()
    const comp = composition(document)
    const clip = comp.clips[0]
    const track = comp.propertyTracks[0]
    const effectIndex = effectClipIndex(document)
    const effect = comp.clips[effectIndex].appearance.keys[0].value.effects![0]
    const targets: Array<[string, string]> = [
      ['/zones/0/id', document.show.zones[0].id],
      ['/zoneLayouts/0/id', document.show.zoneLayouts[0].id],
      ['/composition/patternInstances/0/id', comp.patternInstances[0].id],
      ['/composition/layers/0/id', comp.layers[0].id],
      ['/composition/clips/0/id', clip.id],
      ['/composition/clips/0/appearance/keys/0/id', clip.appearance.keys[0].id],
      [`/composition/clips/${effectIndex}/appearance/keys/0/value/effects/0/id`, effect.id],
      ['/composition/layoutOccurrences/0/id', comp.layoutOccurrences[0].id],
      ['/composition/propertyTracks/0/id', track.id],
      ['/composition/propertyTracks/0/keyframes/0/id', track.keyframes[0].id],
      ['/composition/markers/0/id', comp.markers[0].id],
    ]
    for (const [pointer, id] of targets) {
      refusedIdentity(document, 'set_field', { pointer, value: 'renamed' }, id)
      refusedIdentity(document, 'apply_patch', { patch: [{ op: 'replace', path: pointer, value: 'renamed' }] }, id)
    }
    // Deleting the identity is refused ahead of the schema.
    refusedIdentity(document, 'set_field', { pointer: '/composition/markers/0/id', delete: true }, comp.markers[0].id)
    // Root identity and bookkeeping stay protected as before.
    applyRefused(document, 'set_field', { pointer: '/id', value: 'other' }, 'invalid-argument')
    applyRefused(document, 'set_field', { pointer: '/updatedAt', value: 1 }, 'invalid-argument')
  })

  it('covers the Transition family and its participants too', () => {
    const { document, transitionId } = withLayerTransition()
    refusedIdentity(document, 'set_field', { pointer: '/composition/transitions/0/id', value: 'renamed' }, transitionId)
    const participantId = document.show.composition.transitions[0].participants[0].id
    refusedIdentity(document, 'set_field', { pointer: '/composition/transitions/0/participants/0/id', value: 'renamed' }, participantId)
  })
})

describe('subtree replacement cannot smuggle an identity change (#945)', () => {
  it('refuses a replaced element, ancestor, or whole composition carrying a renamed id', () => {
    const document = richDocument()
    const comp = composition(document)
    const marker = comp.markers[0]
    refusedIdentity(document, 'apply_patch', {
      patch: [{ op: 'replace', path: '/composition/markers/0', value: { ...marker, id: 'renamed' } }],
    }, marker.id)
    refusedIdentity(document, 'set_field', {
      pointer: '/composition/markers',
      value: [{ ...marker, id: 'renamed' }, comp.markers[1]],
    }, marker.id)

    const effectIndex = effectClipIndex(document)
    const effectClip = comp.clips[effectIndex]
    const effectId = effectClip.appearance.keys[0].value.effects![0].id
    const renamedKeys = structuredClone(effectClip.appearance.keys)
    renamedKeys[0].value.effects![0].id = 'renamed'
    refusedIdentity(document, 'apply_patch', {
      patch: [{
        op: 'replace',
        path: `/composition/clips/${effectIndex}`,
        value: { ...effectClip, appearance: { keys: renamedKeys } },
      }],
    }, effectId)

    const overlayClipId = clipOnLayer(document, 'Over').clipId
    const renamedDeep = structuredClone(comp)
    renamedDeep.clips.find((candidate) => candidate.id === overlayClipId)!.id = 'renamed'
    refusedIdentity(document, 'set_field', { pointer: '/composition', value: renamedDeep }, overlayClipId)
  })

  it('refuses a copy that would duplicate an identity', () => {
    const document = richDocument()
    refusedIdentity(document, 'apply_patch', {
      patch: [{ op: 'copy', from: '/composition/markers/0', path: '/composition/markers/-' }],
    }, composition(document).markers[0].id)
  })

  it('refuses inside a transaction without touching the working copy', () => {
    const store = createSessionStore()
    const opened = store.open(richDocument().show)
    if (!opened.ok) throw new Error('open failed')
    const sessionId = opened.sessionId
    expect(store.begin(sessionId, 'identity txn').ok).toBe(true)
    const refused = store.apply(sessionId, 'set_field', { pointer: '/composition/markers/0/id', value: 'renamed' })
    expect(refused.ok).toBe(false)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: { label: 'identity txn', changes: 0 } })
    expect(store.rollback(sessionId).ok).toBe(true)
  })
})

describe('structural edits that keep every identity are accepted (#945)', () => {
  it('edits fields beside an id and replaces an element under its own id', () => {
    const document = richDocument()
    const before = identities(document.show)

    const renamedMarker = applyOk(document, 'set_field', { pointer: '/composition/markers/0/name', value: 'Bass' })
    const expectedName = structuredClone(document.show)
    expectedName.composition.markers[0].name = 'Bass'
    expect(renamedMarker.document.show).toEqual(expectedName)
    expect(identities(renamedMarker.document.show)).toEqual(before)

    const marker = composition(document).markers[0]
    const moved = applyOk(document, 'apply_patch', {
      patch: [{ op: 'replace', path: '/composition/markers/0', value: { ...marker, timeMs: 13_000 } }],
    })
    const expectedTime = structuredClone(document.show)
    expectedTime.composition.markers[0].timeMs = 13_000
    expect(moved.document.show).toEqual(expectedTime)
    expect(identities(moved.document.show)).toEqual(before)
  })

  it('reorders, appends with a fresh id, and removes elements', () => {
    const document = richDocument()
    const [first, second] = composition(document).markers

    const reordered = applyOk(document, 'apply_patch', {
      patch: [{ op: 'move', from: '/composition/markers/0', path: '/composition/markers/1' }],
    })
    const expectedOrder = structuredClone(document.show)
    expectedOrder.composition.markers = [second, first]
    expect(reordered.document.show).toEqual(expectedOrder)

    const appended = applyOk(document, 'apply_patch', {
      patch: [{ op: 'add', path: '/composition/markers/-', value: { id: 'marker-fresh', timeMs: 25_000, name: 'Tail' } }],
    })
    const expectedAppend = structuredClone(document.show)
    expectedAppend.composition.markers = [first, second, { id: 'marker-fresh', timeMs: 25_000, name: 'Tail' }]
    expect(appended.document.show).toEqual(expectedAppend)
    expect(identities(appended.document.show).sort()).toEqual([...identities(document.show), '/composition/markers:marker-fresh'].sort())

    const removed = applyOk(document, 'apply_patch', { patch: [{ op: 'remove', path: '/composition/markers/1' }] })
    const expectedRemove = structuredClone(document.show)
    expectedRemove.composition.markers = [first]
    expect(removed.document.show).toEqual(expectedRemove)

    // The output-Effect backstop the generics were written for (#22) still works.
    const trails = applyOk(document, 'apply_patch', {
      patch: [{ op: 'add', path: '/outputEffects', value: [{ id: 'trails-1', kind: 'trails', retention: 0.5 }] }],
    })
    expect(trails.document.show.outputEffects).toEqual([{ id: 'trails-1', kind: 'trails', retention: 0.5 }])
  })

  it('leaves Pattern reference ids editable: they name a Pattern, not an element', () => {
    const document = richDocument()
    const instanceIndex = composition(document).patternInstances.findIndex((instance) => instance.pattern.id === 'TestPattern1D')
    expect(instanceIndex).toBeGreaterThanOrEqual(0)
    const swapped = applyOk(document, 'apply_patch', {
      patch: [{ op: 'replace', path: `/composition/patternInstances/${instanceIndex}/pattern/id`, value: 'CometLoom' }],
    })
    const expected = structuredClone(document.show)
    expected.composition.patternInstances[instanceIndex].pattern.id = 'CometLoom'
    expect(swapped.document.show).toEqual(expected)
    expect(identities(swapped.document.show)).toEqual(identities(document.show))
  })
})

describe('identity domains stay independent across owners (#945 review P1)', () => {
  // The v1 suite proved this through an overwrite-by-move: one Clip's whole
  // Effect collection moved onto another's existing collection, so the move
  // admission had to tombstone what it displaced before admitting what it
  // carried. That sequence is not constructible on a v2 record — the schema
  // requires every held appearance key to keep an `effects` array, so detaching
  // one leaves the source structurally invalid and the patch is refused at that
  // member instead. `genericIdentityPlacementOrder.test.ts` retired with it; the
  // tracker rule it pinned is unchanged and its still-constructible half is here.
  it('lets a Marker and an Effect carry the same id string without colliding', () => {
    const document = richDocument()
    const effectIndex = effectClipIndex(document)
    const effectId = composition(document).clips[effectIndex].appearance.keys[0].value.effects![0].id
    const renamed = applyOk(document, 'apply_patch', {
      patch: [{ op: 'add', path: '/composition/markers/-', value: { id: effectId, timeMs: 25_000, name: 'Shared' } }],
    })
    expect(renamed.document.show.composition.markers.map((marker) => marker.id)).toContain(effectId)
    expect(composition(renamed.document).clips[effectIndex].appearance.keys[0].value.effects![0].id).toBe(effectId)
  })

  it('refuses reusing an id inside the one domain it was removed from', () => {
    const document = richDocument()
    const [marker] = composition(document).markers
    const issues = applyRefused(document, 'apply_patch', {
      patch: [
        { op: 'remove', path: '/composition/markers/0' },
        { op: 'add', path: '/composition/markers/-', value: { ...marker, timeMs: 25_000 } },
      ],
    }, 'invalid-argument')
    expect(issues[0].message).toContain(marker.id)
  })
})
