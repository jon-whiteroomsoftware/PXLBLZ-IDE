// V2-authored for #945 (second blocking review of the identity provenance
// redesign, P1): replacing an existing collection by move must account for
// the identities it drops before admitting the transported collection.
// Before, placeIssue checked the incoming Effects first, then tombstoned the
// overwritten stack. Two placements may legally each have a distinct Effect
// named "fx", so moving the overlay's complete stack onto the main placement's
// existing `effects` key redirected (main placement, fx) to another object.
// Boundary: apply_patch through the public registry and a session transaction.
// Invariants: an overwrite-by-move is equivalent to remove-destination then
// move for identity admission; a same-domain id cannot replace a tombstoned
// identity; a genuinely fresh incoming id remains accepted; equal strings in
// independent domains remain independent; refusal leaves both public records
// unchanged and a transaction with zero changes.
import { describe, expect, it } from 'vitest'
import type { ShowCompositionV1 } from '@/engine/personalContentRecords'
import { createSessionStore } from '../grammar/session.js'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { applyOk, applyRefused, fixture } from './support/grammarHarness.js'

const MAIN_PLACEMENT = '/composition/scenes/0/zones/0/main/0'
const OVERLAY_PLACEMENT = '/composition/scenes/0/zones/0/overlays/0/placements/0'
const MAIN_EFFECTS = `${MAIN_PLACEMENT}/effects`
const OVERLAY_EFFECTS = `${OVERLAY_PLACEMENT}/effects`
const MARKERS = '/composition/markers'

const composition = (document: ShowGrammarDocument) => document.show.composition as ShowCompositionV1

function effect(kind: 'brightness' | 'hue', id: string) {
  return kind === 'brightness'
    ? { id, kind, brightness: 0.6 }
    : { id, kind, turns: 0.25 }
}

/** A valid Show whose two placements own separate Effect identity domains. */
function effectsDocument(mainId: string, overlayId: string, markerId?: string): ShowGrammarDocument {
  const additions: Array<Record<string, unknown>> = [
    { op: 'add', path: MAIN_EFFECTS, value: [effect('brightness', mainId)] },
    { op: 'add', path: OVERLAY_EFFECTS, value: [effect('hue', overlayId)] },
  ]
  if (markerId) additions.push({ op: 'add', path: MARKERS, value: [{ id: markerId, timeMs: 12_000, name: 'Shared' }] })
  return applyOk(fixture({ overlay: true }), 'apply_patch', { patch: additions }).document
}

function refusedSameIdentity(document: ShowGrammarDocument, patch: Array<Record<string, unknown>>) {
  const issues = applyRefused(document, 'apply_patch', { patch }, 'invalid-argument')
  expect(issues[0].message).toContain('fx')
  expect(issues[0].message).toMatch(/identity/i)
}

const overwriteByMove = [{ op: 'move', from: OVERLAY_EFFECTS, path: MAIN_EFFECTS }]

describe('move admission sees identities removed by the destination overwrite (#945 review P1)', () => {
  it("refuses the reviewer's exact registry case: a distinct overlay Effect named fx cannot replace the main Effect named fx", () => {
    refusedSameIdentity(effectsDocument('fx', 'fx'), overwriteByMove)
  })

  it('refuses the same case atomically through a session transaction', () => {
    const document = effectsDocument('fx', 'fx')
    const store = createSessionStore()
    const opened = store.open(document.show)
    if (!opened.ok) throw new Error(JSON.stringify(opened.issues))
    expect(store.begin(opened.sessionId, 'move overwrite').ok).toBe(true)

    const refused = store.apply(opened.sessionId, 'apply_patch', { patch: overwriteByMove })

    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.issues[0].message).toContain('fx')
    expect(store.pending(opened.sessionId)).toEqual({ ok: true, open: { label: 'move overwrite', changes: 0 } })
    const exported = store.export(opened.sessionId)
    expect(exported.ok && exported.show).toEqual(document.show)
    expect(store.rollback(opened.sessionId).ok).toBe(true)
  })

  it('matches the already-safe explicit remove-destination then move sequence', () => {
    refusedSameIdentity(effectsDocument('fx', 'fx'), [
      { op: 'remove', path: MAIN_EFFECTS },
      { op: 'move', from: OVERLAY_EFFECTS, path: MAIN_EFFECTS },
    ])
  })

  it('accepts the overwrite when every incoming identity is fresh in the destination placement', () => {
    const document = effectsDocument('main-fx', 'incoming-fx')
    const moved = applyOk(document, 'apply_patch', { patch: overwriteByMove })
    const expected = structuredClone(document.show)
    const comp = expected.composition as ShowCompositionV1
    comp.scenes[0].zones[0].main[0].effects = [effect('hue', 'incoming-fx')]
    delete comp.scenes[0].zones[0].overlays[0].placements[0].effects
    expect(moved.document.show).toEqual(expected)
  })

  it('keeps equal id strings independent across the marker and destination Effect domains', () => {
    const document = effectsDocument('main-fx', 'shared-fx', 'shared-fx')
    const moved = applyOk(document, 'apply_patch', { patch: overwriteByMove })
    const comp = composition(moved.document)
    expect(comp.scenes[0].zones[0].main[0].effects).toEqual([effect('hue', 'shared-fx')])
    expect(comp.markers).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'shared-fx', name: 'Shared' })]))
  })
})
