// V2-authored for #945 (first review of the identity redesign, P1 and P2):
// what happens to a parked element's identity while it is in transit.
// Two holes in the provenance model as first written. P1: an ancestor write
// judged only the objects of the written value that carried an id, so a
// replacement holding an id-less object at a parked element's place read as
// a drop (tombstoned) instead of a rewrite; the replacement object was
// untagged, took a fresh id, and moved back into the collection under it.
// P2: a move re-domained every nested element from the destination shape, so
// parking a placement under /scratch stamped its Effects with the undeclared
// fail-closed domain; dropping the parked placement then tombstoned those
// ids in every domain and refused an independent marker of that string.
// Boundary: set_field and apply_patch through the registry and a session
// transaction. Invariants: an ancestor write keeps an element wherever the
// written value holds an object at its place, and a kept element keeps its
// id exactly (missing is a rewrite); the transported root of a move enters
// the destination collection, while nested elements stay in their own
// collections and keep their domain until the destination shape declares
// one, where they are re-derived and checked like an entry; tombstones name
// the domain the element came from. Oracles: exact record equality for
// accepted edits; applyRefused's unchanged-record check and the named id for
// refusals; the session's pending count, description and export in a
// transaction. Never the tracker's tags or ledger.
import { describe, expect, it } from 'vitest'
import type { ShowCompositionV1, ShowRecord } from '@/engine/personalContentRecords'
import { createSessionStore } from '../grammar/session.js'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { applyOk, applyRefused, clips, fixture } from './support/grammarHarness.js'

const OUTPUT = '/outputEffects'
const MARKERS = '/composition/markers'
const MAIN_PLACEMENT = '/composition/scenes/0/zones/0/main/0'
const OVERLAY_PLACEMENT = '/composition/scenes/0/zones/0/overlays/0/placements/0'
const TRAILS = { id: 'trails-1', kind: 'trails' as const, retention: 0.5 }

const composition = (document: ShowGrammarDocument) => document.show.composition as ShowCompositionV1
const mainPlacement = (document: ShowGrammarDocument) => composition(document).scenes[0].zones[0].main[0]
const overlayPlacement = (document: ShowGrammarDocument) => composition(document).scenes[0].zones[0].overlays[0].placements[0]

/** The overlay fixture plus two markers, brightness and hue Effects on the main clip, and one output Effect. */
function transitDocument(): ShowGrammarDocument {
  let document = fixture({ overlay: true })
  document = applyOk(document, 'add_marker', { at_ms: 12_000, name: 'Drop' }).document
  document = applyOk(document, 'add_marker', { at_ms: 20_000, name: 'Lift' }).document
  const mainClip = clips(document).find((clip) => clip.layer.kind === 'main' && clip.startMs === 0)!
  document = applyOk(document, 'add_clip_effect', { clip_id: mainClip.clipId, kind: 'brightness' }).document
  document = applyOk(document, 'add_clip_effect', { clip_id: mainClip.clipId, kind: 'hue' }).document
  document = applyOk(document, 'apply_patch', { patch: [{ op: 'add', path: OUTPUT, value: [TRAILS] }] }).document
  return document
}

function refusedIdentity(document: ShowGrammarDocument, operation: string, args: Record<string, unknown>, id: string) {
  const issues = applyRefused(document, operation, args, 'invalid-argument')
  expect(issues[0].message).toContain(id)
  expect(issues[0].message).toMatch(/identity/i)
  return issues
}

function expectedFrom(document: ShowGrammarDocument, edit: (show: ShowRecord) => void) {
  const expected = structuredClone(document.show)
  edit(expected)
  return expected
}

const park = (from: string, to = '/scratch') => ({ op: 'move', from, path: to })
const unpark = (to: string, from = '/scratch') => ({ op: 'move', from, path: to })
const wrap = { op: 'add', path: '/scratch', value: {} }
const unwrap = { op: 'remove', path: '/scratch' }

describe('an ancestor write keeps a parked element under its exact id (P1)', () => {
  it("refuses the reviewer's sequence: strip the parked id through the wrapper, add a new one, move back", () => {
    const document = transitDocument()
    const stripped = { kind: TRAILS.kind, retention: TRAILS.retention }
    refusedIdentity(document, 'apply_patch', {
      patch: [
        wrap,
        park(`${OUTPUT}/0`, '/scratch/inner'),
        { op: 'replace', path: '/scratch', value: { inner: stripped } },
        { op: 'add', path: '/scratch/inner/id', value: 'renamed' },
        unpark(`${OUTPUT}/0`, '/scratch/inner'),
        unwrap,
      ],
    }, TRAILS.id)
    // Stripping alone, with the element moved back id-less, is the same rewrite.
    refusedIdentity(document, 'apply_patch', {
      patch: [wrap, park(`${OUTPUT}/0`, '/scratch/inner'), { op: 'replace', path: '/scratch', value: { inner: stripped } }, unpark(`${OUTPUT}/0`, '/scratch/inner'), unwrap],
    }, TRAILS.id)
    // The same through set_field, which writes over the wrapper in one operation of a transaction.
    const store = createSessionStore()
    const opened = store.open(document.show)
    if (!opened.ok) throw new Error('open failed')
    const sessionId = opened.sessionId
    expect(store.begin(sessionId, 'strip txn').ok).toBe(true)
    const refused = store.apply(sessionId, 'apply_patch', {
      patch: [
        { op: 'replace', path: `${MARKERS}/0/name`, value: 'Bass' },
        wrap,
        park(`${OUTPUT}/0`, '/scratch/inner'),
        { op: 'replace', path: '/scratch', value: { inner: stripped } },
        { op: 'add', path: '/scratch/inner/id', value: 'renamed' },
        unpark(`${OUTPUT}/0`, '/scratch/inner'),
        unwrap,
      ],
    })
    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.issues[0].message).toContain(TRAILS.id)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: { label: 'strip txn', changes: 0 } })
    const described = store.describe(sessionId)
    expect(described.ok && described.description.markers[0].name).toBe('Drop')
    expect(store.rollback(sessionId).ok).toBe(true)
    const exported = store.export(sessionId)
    expect(exported.ok && exported.show).toEqual(document.show)
  })

  it('refuses stripping a parked placement id through its wrapper while its Effects are intact', () => {
    const document = transitDocument()
    const { id, ...withoutId } = mainPlacement(document)
    refusedIdentity(document, 'apply_patch', {
      patch: [
        wrap,
        park(MAIN_PLACEMENT, '/scratch/inner'),
        { op: 'replace', path: '/scratch', value: { inner: withoutId } },
        { op: 'add', path: '/scratch/inner/id', value: 'renamed' },
        unpark(MAIN_PLACEMENT, '/scratch/inner'),
        unwrap,
      ],
    }, id)
  })

  it('keeps a parked element an ancestor write holds under its own id, and drops one it holds nothing for', () => {
    const document = transitDocument()
    const kept = applyOk(document, 'apply_patch', {
      patch: [
        wrap,
        park(`${OUTPUT}/0`, '/scratch/inner'),
        { op: 'replace', path: '/scratch', value: { inner: { ...TRAILS, retention: 0.9 }, note: 'edited' } },
        unpark(`${OUTPUT}/0`, '/scratch/inner'),
        unwrap,
      ],
    })
    expect(kept.document.show).toEqual(expectedFrom(document, (show) => {
      show.outputEffects![0] = { ...TRAILS, retention: 0.9 }
    }))
    // A scalar at the element's place holds no element: the parked one is dropped and tombstoned.
    refusedIdentity(document, 'apply_patch', {
      patch: [
        wrap,
        park(`${OUTPUT}/0`, '/scratch/inner'),
        { op: 'replace', path: '/scratch', value: { inner: 5 } },
        unwrap,
        { op: 'add', path: `${OUTPUT}/-`, value: { ...TRAILS } },
      ],
    }, TRAILS.id)
  })
})

describe('a parked subtree keeps the domains of its nested elements (P2)', () => {
  it("refuses nothing independent after a parked placement is dropped: the reviewer's marker of an Effect's id", () => {
    const document = transitDocument()
    const placement = mainPlacement(document)
    const [brightness] = placement.effects!
    const ghost = { id: brightness.id, timeMs: 26_000, name: 'Ghost' }
    const dropped = applyOk(document, 'apply_patch', {
      patch: [park(MAIN_PLACEMENT), unwrap, { op: 'add', path: `${MARKERS}/-`, value: ghost }],
    })
    expect(dropped.document.show).toEqual(expectedFrom(document, (show) => {
      const comp = show.composition as ShowCompositionV1
      comp.scenes[0].zones[0].main = []
      comp.markers!.push(ghost)
    }))
    // Another placement's Effect stack is an independent domain too.
    const elsewhere = applyOk(document, 'apply_patch', {
      patch: [park(MAIN_PLACEMENT), unwrap, { op: 'add', path: `${OVERLAY_PLACEMENT}/effects`, value: [{ ...brightness }] }],
    })
    expect(elsewhere.document.show).toEqual(expectedFrom(document, (show) => {
      const comp = show.composition as ShowCompositionV1
      comp.scenes[0].zones[0].main = []
      comp.scenes[0].zones[0].overlays[0].placements[0].effects = [{ ...brightness }]
    }))
    // The placement's own domain is still tombstoned.
    refusedIdentity(document, 'apply_patch', {
      patch: [park(MAIN_PLACEMENT), unwrap, { op: 'add', path: `${MAIN_PLACEMENT}`, value: { ...placement, effects: [] } }],
    }, placement.id)
  })

  it('does not check a parked placement against tombstones of other domains', () => {
    const document = transitDocument()
    const [brightness] = mainPlacement(document).effects!
    const ghost = { id: brightness.id, timeMs: 26_000, name: 'Ghost' }
    const withGhost = applyOk(document, 'apply_patch', { patch: [{ op: 'add', path: `${MARKERS}/-`, value: ghost }] }).document
    const parked = applyOk(withGhost, 'apply_patch', {
      patch: [{ op: 'remove', path: `${MARKERS}/2` }, park(MAIN_PLACEMENT), { op: 'replace', path: '/scratch/effects/0/brightness', value: 0.3 }, unpark(MAIN_PLACEMENT)],
    })
    expect(parked.document.show).toEqual(expectedFrom(withGhost, (show) => {
      const comp = show.composition as ShowCompositionV1
      comp.markers = comp.markers!.slice(0, 2)
      ;(comp.scenes[0].zones[0].main[0].effects![0] as { brightness: number }).brightness = 0.3
    }))
  })

  it('re-derives nested domains only where the destination declares one: an Effect stack moved between placements', () => {
    const document = transitDocument()
    const [brightness, hue] = mainPlacement(document).effects!
    const moved = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'move', from: `${MAIN_PLACEMENT}/effects`, path: `${OVERLAY_PLACEMENT}/effects` },
        { op: 'remove', path: `${OVERLAY_PLACEMENT}/effects/0` },
        { op: 'add', path: `${MAIN_PLACEMENT}/effects`, value: [{ ...brightness }] },
      ],
    })
    expect(moved.document.show).toEqual(expectedFrom(document, (show) => {
      const comp = show.composition as ShowCompositionV1
      comp.scenes[0].zones[0].main[0].effects = [{ ...brightness }]
      comp.scenes[0].zones[0].overlays[0].placements[0].effects = [hue]
    }))
    expect(overlayPlacement(moved.document).effects!.map((effect) => effect.id)).toEqual([hue.id])
    // Back into the stack it was removed from, the id is recycled.
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'move', from: `${MAIN_PLACEMENT}/effects`, path: `${OVERLAY_PLACEMENT}/effects` },
        { op: 'remove', path: `${OVERLAY_PLACEMENT}/effects/0` },
        { op: 'add', path: `${OVERLAY_PLACEMENT}/effects/-`, value: { ...brightness } },
      ],
    }, brightness.id)
    // And a stack carrying a tombstoned id of the destination placement cannot be moved in.
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'add', path: `${OVERLAY_PLACEMENT}/effects`, value: [{ ...hue, id: 'ov-fx' }] },
        { op: 'remove', path: `${OVERLAY_PLACEMENT}/effects/0` },
        { op: 'add', path: `${MAIN_PLACEMENT}/effects/-`, value: { ...hue, id: 'ov-fx' } },
        { op: 'move', from: `${MAIN_PLACEMENT}/effects`, path: `${OVERLAY_PLACEMENT}/effects` },
      ],
    }, 'ov-fx')
  })

  it('still freezes and tombstones nested elements while their parent is parked', () => {
    const document = transitDocument()
    const [brightness, hue] = mainPlacement(document).effects!
    refusedIdentity(document, 'apply_patch', {
      patch: [park(MAIN_PLACEMENT), { op: 'replace', path: '/scratch/effects/0/id', value: 'renamed' }, unpark(MAIN_PLACEMENT)],
    }, brightness.id)
    // An Effect removed from the parked stack is tombstoned in its placement's domain.
    refusedIdentity(document, 'apply_patch', {
      patch: [
        park(MAIN_PLACEMENT),
        { op: 'remove', path: '/scratch/effects/0' },
        unpark(MAIN_PLACEMENT),
        { op: 'add', path: `${MAIN_PLACEMENT}/effects/-`, value: { ...brightness } },
      ],
    }, brightness.id)
    const trimmed = applyOk(document, 'apply_patch', {
      patch: [park(MAIN_PLACEMENT), { op: 'remove', path: '/scratch/effects/0' }, unpark(MAIN_PLACEMENT)],
    })
    expect(trimmed.document.show).toEqual(expectedFrom(document, (show) => {
      ;(show.composition as ShowCompositionV1).scenes[0].zones[0].main[0].effects = [hue]
    }))
  })
})
