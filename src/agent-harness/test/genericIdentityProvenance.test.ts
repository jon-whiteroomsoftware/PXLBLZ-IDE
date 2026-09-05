// V2-authored for #945 (third candidate review of the corrections, P1):
// element identity is provenance carried by the object, not a property of
// the path it currently sits at. Before, every identity rule asked "is this
// an array member with an id?" of the working record as it stood, so a move
// that parked an element under a temporary key (/scratch, or any wrapper)
// made its id writable, and moving it back reinserted it as a fresh element:
// move /outputEffects/0 -> /scratch, replace /scratch/id, move /scratch ->
// /outputEffects/0 renamed the output Effect. Boundary: set_field and
// apply_patch through the registry and a session transaction. Invariants: a
// tagged element's id is never written wherever the element sits; a move
// transports the same obligations to any destination, key or array
// position; an ancestor write may drop a parked element (tombstoned in the
// domain it came from) but never rename it; copy of a parked element is
// refused; an element inserted earlier in the patch is frozen the same way;
// an object with an id that was never a collection member (a Pattern
// reference, a wrapper the agent builds) is not an element until it enters a
// collection; a refused patch leaves the record and a transaction's working
// copy untouched. Oracles: exact record equality for accepted edits;
// applyRefused's unchanged-record check and the named id for refusals; the
// session's pending count, description and export inside a transaction.
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

/** The overlay fixture plus two markers, brightness and hue Effects on the main clip, an opacity track and one output Effect. */
function provenanceDocument(): ShowGrammarDocument {
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

describe('an element keeps its identity while a move parks it outside its collection (#945 third review, P1)', () => {
  it("refuses the reviewer's sequence: park the output Effect under a key, rename it, move it back", () => {
    const document = provenanceDocument()
    refusedIdentity(document, 'apply_patch', {
      patch: [park(`${OUTPUT}/0`), { op: 'replace', path: '/scratch/id', value: 'renamed' }, unpark(`${OUTPUT}/0`)],
    }, TRAILS.id)
    // The same rename through a whole-object replace, an id removal, and an add over the id.
    refusedIdentity(document, 'apply_patch', {
      patch: [park(`${OUTPUT}/0`), { op: 'replace', path: '/scratch', value: { ...TRAILS, id: 'renamed' } }, unpark(`${OUTPUT}/0`)],
    }, TRAILS.id)
    refusedIdentity(document, 'apply_patch', {
      patch: [park(`${OUTPUT}/0`), { op: 'remove', path: '/scratch/id' }, { op: 'add', path: '/scratch/id', value: 'renamed' }, unpark(`${OUTPUT}/0`)],
    }, TRAILS.id)
    refusedIdentity(document, 'apply_patch', {
      patch: [park(`${OUTPUT}/0`), { op: 'add', path: '/scratch/id', value: 'renamed' }, unpark(`${OUTPUT}/0`)],
    }, TRAILS.id)
  })

  it('refuses the rename through a nested wrapper, directly and through an ancestor write of the wrapper', () => {
    const document = provenanceDocument()
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'add', path: '/scratch', value: {} },
        park(`${OUTPUT}/0`, '/scratch/inner'),
        { op: 'replace', path: '/scratch/inner/id', value: 'renamed' },
        unpark(`${OUTPUT}/0`, '/scratch/inner'),
        { op: 'remove', path: '/scratch' },
      ],
    }, TRAILS.id)
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'add', path: '/scratch', value: {} },
        park(`${OUTPUT}/0`, '/scratch/inner'),
        { op: 'replace', path: '/scratch', value: { inner: { ...TRAILS, id: 'renamed' } } },
        unpark(`${OUTPUT}/0`, '/scratch/inner'),
        { op: 'remove', path: '/scratch' },
      ],
    }, TRAILS.id)
  })

  it('accepts a non-identity edit while parked, under a key and at an array position, judged on the exact record', () => {
    const document = provenanceDocument()
    const viaKey = applyOk(document, 'apply_patch', {
      patch: [park(`${OUTPUT}/0`), { op: 'replace', path: '/scratch/retention', value: 0.9 }, unpark(`${OUTPUT}/0`)],
    })
    expect(viaKey.document.show).toEqual(expectedFrom(document, (show) => {
      show.outputEffects![0] = { ...TRAILS, retention: 0.9 }
    }))

    const viaArray = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'add', path: `${OVERLAY_PLACEMENT}/effects`, value: [] },
        { op: 'move', from: `${MAIN_PLACEMENT}/effects/0`, path: `${OVERLAY_PLACEMENT}/effects/0` },
        { op: 'replace', path: `${OVERLAY_PLACEMENT}/effects/0/brightness`, value: 0.3 },
        { op: 'move', from: `${OVERLAY_PLACEMENT}/effects/0`, path: `${MAIN_PLACEMENT}/effects/0` },
        { op: 'remove', path: `${OVERLAY_PLACEMENT}/effects` },
      ],
    })
    expect(viaArray.document.show).toEqual(expectedFrom(document, (show) => {
      const effect = (show.composition as ShowCompositionV1).scenes[0].zones[0].main[0].effects![0] as { brightness: number }
      effect.brightness = 0.3
    }))
  })

  it('refuses the parked rename atomically inside a transaction', () => {
    const document = provenanceDocument()
    const store = createSessionStore()
    const opened = store.open(document.show)
    if (!opened.ok) throw new Error('open failed')
    const sessionId = opened.sessionId
    expect(store.begin(sessionId, 'provenance txn').ok).toBe(true)
    const refused = store.apply(sessionId, 'apply_patch', {
      patch: [
        { op: 'replace', path: `${MARKERS}/0/name`, value: 'Bass' },
        park(`${OUTPUT}/0`),
        { op: 'replace', path: '/scratch/id', value: 'renamed' },
        unpark(`${OUTPUT}/0`),
      ],
    })
    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.issues[0].message).toContain(TRAILS.id)
    expect(store.pending(sessionId)).toEqual({ ok: true, open: { label: 'provenance txn', changes: 0 } })
    const described = store.describe(sessionId)
    expect(described.ok && described.description.markers[0].name).toBe('Drop')
    expect(store.rollback(sessionId).ok).toBe(true)
    const exported = store.export(sessionId)
    expect(exported.ok && exported.show).toEqual(document.show)
  })
})

describe("a moved parent carries its elements' obligations", () => {
  it('refuses a nested id write and an ancestor rename after a placement is parked; accepts a non-id edit and the move back', () => {
    const document = provenanceDocument()
    const placement = mainPlacement(document)
    const [brightness, hue] = placement.effects!
    refusedIdentity(document, 'apply_patch', {
      patch: [park(MAIN_PLACEMENT), { op: 'replace', path: '/scratch/effects/0/id', value: 'renamed' }, unpark(MAIN_PLACEMENT)],
    }, brightness.id)
    refusedIdentity(document, 'apply_patch', {
      patch: [
        park(MAIN_PLACEMENT),
        { op: 'replace', path: '/scratch', value: { ...placement, effects: [{ ...brightness, id: 'renamed' }, hue] } },
        unpark(MAIN_PLACEMENT),
      ],
    }, brightness.id)
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'add', path: '/scratch', value: {} },
        park(MAIN_PLACEMENT, '/scratch/inner'),
        { op: 'replace', path: '/scratch/inner/id', value: 'renamed' },
        unpark(MAIN_PLACEMENT, '/scratch/inner'),
        { op: 'remove', path: '/scratch' },
      ],
    }, placement.id)

    const edited = applyOk(document, 'apply_patch', {
      patch: [park(MAIN_PLACEMENT), { op: 'replace', path: '/scratch/effects/0/brightness', value: 0.3 }, unpark(MAIN_PLACEMENT)],
    })
    expect(edited.document.show).toEqual(expectedFrom(document, (show) => {
      const effect = (show.composition as ShowCompositionV1).scenes[0].zones[0].main[0].effects![0] as { brightness: number }
      effect.brightness = 0.3
    }))
  })
})

describe('replace, copy and removal of a parked element follow the contract', () => {
  it('keeps a parked element replaced under its own id, and refuses copying it anywhere', () => {
    const document = provenanceDocument()
    const replaced = applyOk(document, 'apply_patch', {
      patch: [park(`${OUTPUT}/0`), { op: 'replace', path: '/scratch', value: { ...TRAILS, retention: 0.1 } }, unpark(`${OUTPUT}/0`)],
    })
    expect(replaced.document.show).toEqual(expectedFrom(document, (show) => {
      show.outputEffects![0] = { ...TRAILS, retention: 0.1 }
    }))
    refusedIdentity(document, 'apply_patch', {
      patch: [park(`${OUTPUT}/0`), { op: 'copy', from: '/scratch', path: `${OUTPUT}/-` }, { op: 'remove', path: '/scratch' }],
    }, TRAILS.id)
    refusedIdentity(document, 'apply_patch', {
      patch: [park(`${OUTPUT}/0`), { op: 'copy', from: '/scratch', path: '/scratch2' }, unpark(`${OUTPUT}/0`), { op: 'remove', path: '/scratch2' }],
    }, TRAILS.id)
  })

  it('tombstones a parked element dropped by an ancestor write or removal in the domain it came from', () => {
    const document = provenanceDocument()
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'add', path: '/scratch', value: {} },
        park(`${OUTPUT}/0`, '/scratch/inner'),
        { op: 'replace', path: '/scratch', value: {} },
        { op: 'remove', path: '/scratch' },
        { op: 'add', path: `${OUTPUT}/-`, value: { ...TRAILS } },
      ],
    }, TRAILS.id)
    refusedIdentity(document, 'apply_patch', {
      patch: [park(`${OUTPUT}/0`), { op: 'remove', path: '/scratch' }, { op: 'add', path: `${OUTPUT}/-`, value: { ...TRAILS } }],
    }, TRAILS.id)
    // The domain is the one the element came from: a marker of that string is independent.
    const ghost = { id: TRAILS.id, timeMs: 26_000, name: 'Ghost' }
    const independent = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'add', path: '/scratch', value: {} },
        park(`${OUTPUT}/0`, '/scratch/inner'),
        { op: 'replace', path: '/scratch', value: {} },
        { op: 'remove', path: '/scratch' },
        { op: 'add', path: `${MARKERS}/-`, value: ghost },
      ],
    })
    expect(independent.document.show).toEqual(expectedFrom(document, (show) => {
      show.outputEffects = []
      ;(show.composition as ShowCompositionV1).markers!.push(ghost)
    }))
  })
})

describe('inserted elements and untagged wrappers', () => {
  const second = { id: 'trails-2', kind: 'trails', retention: 0.2 }

  it('freezes the id of an element inserted earlier in the patch, even after it is parked', () => {
    const document = provenanceDocument()
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'add', path: `${OUTPUT}/-`, value: second },
        park(`${OUTPUT}/1`),
        { op: 'replace', path: '/scratch/id', value: 'renamed' },
        unpark(`${OUTPUT}/1`),
      ],
    }, second.id)
  })

  it('lets a wrapper built under a key take any id until it enters a collection, then freezes it', () => {
    const document = provenanceDocument()
    const inserted = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'add', path: '/scratch', value: { ...second, id: 'draft' } },
        { op: 'replace', path: '/scratch/id', value: second.id },
        unpark(`${OUTPUT}/-`),
      ],
    })
    expect(inserted.document.show).toEqual(expectedFrom(document, (show) => {
      show.outputEffects!.push(second as never)
    }))
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'add', path: '/scratch', value: { ...second, id: 'draft' } },
        { op: 'replace', path: '/scratch/id', value: second.id },
        unpark(`${OUTPUT}/-`),
        { op: 'replace', path: `${OUTPUT}/1/id`, value: 'trails-3' },
      ],
    }, second.id)
    // Entering the collection under an id it already holds is a duplicate.
    refusedIdentity(document, 'apply_patch', {
      patch: [{ op: 'add', path: '/scratch', value: { ...second, id: TRAILS.id } }, unpark(`${OUTPUT}/-`)],
    }, TRAILS.id)
  })
})

describe('Pattern references are not elements', () => {
  it('lets a Pattern reference be parked, re-pointed and returned', () => {
    const document = provenanceDocument()
    const index = composition(document).patternInstances.findIndex((instance) => instance.pattern.id === 'TestPattern1D')
    expect(index).toBeGreaterThanOrEqual(0)
    const pointer = `/composition/patternInstances/${index}/pattern`
    const swapped = applyOk(document, 'apply_patch', {
      patch: [park(pointer), { op: 'replace', path: '/scratch/id', value: 'CometLoom' }, unpark(pointer)],
    })
    expect(swapped.document.show).toEqual(expectedFrom(document, (show) => {
      ;(show.composition as ShowCompositionV1).patternInstances[index].pattern.id = 'CometLoom'
    }))
  })
})

describe('a move onto an existing key', () => {
  it('drops the old value and places the moved subtree with its elements intact', () => {
    const document = provenanceDocument()
    const moved = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'add', path: '/scratch', value: { stale: true } },
        park(MAIN_PLACEMENT),
        { op: 'replace', path: '/scratch/effects/1/turns', value: 0.25 },
        unpark(MAIN_PLACEMENT),
      ],
    })
    expect(moved.document.show).toEqual(expectedFrom(document, (show) => {
      const effect = (show.composition as ShowCompositionV1).scenes[0].zones[0].main[0].effects![1] as { turns: number }
      effect.turns = 0.25
    }))
    refusedIdentity(document, 'apply_patch', {
      patch: [
        { op: 'add', path: '/scratch', value: { stale: true } },
        park(MAIN_PLACEMENT),
        { op: 'replace', path: '/scratch/effects/1/id', value: 'renamed' },
        unpark(MAIN_PLACEMENT),
      ],
    }, mainPlacement(document).effects![1].id)
  })
})
