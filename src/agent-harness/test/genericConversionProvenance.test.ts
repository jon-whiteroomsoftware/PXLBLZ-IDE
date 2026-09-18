// #1065: the generic backstop cannot author v1 conversion provenance.
//
// Boundary: `set_field` and `apply_patch` through the registry, judged on the
// complete before and after records. Domain: the three converter-only fields -
// `/composition/markers/*/origin`, `/composition/transitions/*/origin` and
// `/composition/layoutOccurrences/*/incomingSwitch` with its leaves - which
// `docs/reference/contracts/show-v2-conversion-provenance.md` says are "written
// by `convertShowRecordV1ToV2` and nothing else".
//
// Invariants: a write that would create, change or clear provenance refuses and
// leaves the record identical; an ordinary generic edit on a record that
// already carries provenance still works and carries it through unchanged.
// Partitions: the direct pointer (named field), the ancestor write (whole
// element replaced or appended), the otherwise-valid switch, and the ordinary
// edit. The fault-sensitive oracle is the record itself, not the refusal text.
import { describe, expect, it } from 'vitest'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { validateShowRecordV2 } from '@/engine/showCompositionV2'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { applyOk, applyRefused, fixture } from './support/grammarHarness.js'

/** The fixture with a boundary Crossfade and one Marker, over one Layout interval. */
function baseDocument(): ShowGrammarDocument {
  const document = fixture({ boundaryCrossfade: true })
  return applyOk(document, 'add_marker', { at_ms: 12_000, name: 'Drop' }).document
}

/**
 * Two Layout intervals over a Cut. Independent Clip sampling refuses Layer
 * Transitions across several occurrences, so the switch partition keeps its own
 * fixture rather than weakening delivery validation.
 */
function routedDocument(): ShowGrammarDocument {
  const document = fixture()
  const routed = applyOk(document, 'add_layout_interval', {
    layout_id: document.show.zoneLayouts[0].id,
    at_ms: 30_000,
  }).document
  expect(routed.show.composition.layoutOccurrences).toHaveLength(2)
  return routed
}

/** The Marker and Transition forms as a conversion writes them. */
function convertedDocument(): ShowGrammarDocument {
  const document = baseDocument()
  const show = structuredClone(document.show)
  show.composition.markers[0].role = 'chapter'
  show.composition.markers[0].origin = 'converted-scene-label'
  show.composition.transitions[0].origin = 'converted-boundary-transition'
  expect(validateShowRecordV2(show)).toEqual([])
  return { ...document, show }
}

/** The switch form as a conversion writes it. */
function convertedRoutedDocument(): ShowGrammarDocument {
  const document = routedDocument()
  const show = structuredClone(document.show)
  const [first, second] = show.composition.layoutOccurrences
  second.incomingSwitch = { origin: 'converted-routing-cut', id: 'routing-cut-1', fromOccurrenceId: first.id }
  expect(validateShowRecordV2(show)).toEqual([])
  return { ...document, show }
}

const provenance = (record: ShowRecordV2) => ({
  marker: record.composition.markers.map(marker => marker.origin),
  transition: record.composition.transitions.map(transition => transition.origin),
  layout: record.composition.layoutOccurrences.map(occurrence => occurrence.incomingSwitch),
})

describe('generic operations and v1 conversion provenance (#1065)', () => {
  it('refuses a set_field that forges a Transition origin on a native Show', () => {
    const document = baseDocument()
    expect(document.show.composition.transitions[0].origin).toBeUndefined()
    applyRefused(document, 'set_field', {
      pointer: '/composition/transitions/0/origin',
      value: 'converted-layer-transition',
    }, 'invalid-argument')
  })

  it('refuses a set_field that forges a Marker origin on a native Show', () => {
    const document = baseDocument()
    expect(document.show.composition.markers[0].origin).toBeUndefined()
    applyRefused(document, 'set_field', {
      pointer: '/composition/markers/0/origin',
      value: 'converted-scene-label',
    }, 'invalid-argument')
  })

  it('refuses an apply_patch that adds an otherwise valid incomingSwitch', () => {
    const document = routedDocument()
    const [first, second] = document.show.composition.layoutOccurrences
    expect(second.incomingSwitch).toBeUndefined()
    // This switch names the immediately preceding occurrence and carries a
    // nonblank unshadowed identity, so only the provenance rule refuses it.
    applyRefused(document, 'apply_patch', {
      patch: [{
        op: 'add',
        path: '/composition/layoutOccurrences/1/incomingSwitch',
        value: { origin: 'converted-routing-cut', id: 'routing-cut-1', fromOccurrenceId: first.id },
      }],
    }, 'invalid-argument')
    expect(document.show.composition.layoutOccurrences[1].incomingSwitch).toBeUndefined()
  })

  it('refuses forging through an ancestor write the pointer guard does not name', () => {
    const document = baseDocument()
    const marker = document.show.composition.markers[0]
    applyRefused(document, 'set_field', {
      pointer: '/composition/markers/0',
      value: { ...structuredClone(marker), role: 'chapter', origin: 'converted-scene-label' },
    }, 'invalid-argument')
    applyRefused(document, 'apply_patch', {
      patch: [{
        op: 'add',
        path: '/composition/markers/-',
        value: { id: 'forged-marker', timeMs: 20_000, name: 'Lift', role: 'chapter', origin: 'converted-scene-label' },
      }],
    }, 'invalid-argument')
  })

  it('refuses changing or clearing provenance a converted Show already carries', () => {
    const document = convertedDocument()
    applyRefused(document, 'set_field', {
      pointer: '/composition/transitions/0/origin',
      value: 'converted-layer-transition',
    }, 'invalid-argument')
    applyRefused(document, 'set_field', {
      pointer: '/composition/markers/0/origin',
      delete: true,
    }, 'invalid-argument')
    applyRefused(convertedRoutedDocument(), 'set_field', {
      pointer: '/composition/layoutOccurrences/1/incomingSwitch/id',
      value: 'renamed-cut',
    }, 'invalid-argument')
    const cleared = structuredClone(document.show.composition.markers[0])
    delete cleared.origin
    applyRefused(document, 'set_field', { pointer: '/composition/markers/0', value: cleared }, 'invalid-argument')
  })

  it('carries provenance through an ordinary generic edit unchanged', () => {
    const document = convertedDocument()
    const before = provenance(document.show)

    const renamed = applyOk(document, 'set_field', { pointer: '/composition/markers/0/name', value: 'Chorus' })
    expect(renamed.document.show.composition.markers[0].name).toBe('Chorus')
    expect(provenance(renamed.document.show)).toEqual(before)

    const patched = applyOk(renamed.document, 'apply_patch', {
      patch: [
        { op: 'replace', path: '/composition/transitions/0/kind', value: 'dither' },
        { op: 'replace', path: '/composition/markers/0/timeMs', value: 14_000 },
      ],
    })
    expect(patched.document.show.composition.transitions[0].kind).toBe('dither')
    expect(provenance(patched.document.show)).toEqual(before)
    expect(validateShowRecordV2(patched.document.show)).toEqual([])
  })

  it('lets a generic edit remove an element carrying provenance', () => {
    // A removed element takes its own provenance with it: the same rule the
    // Layout owner applies to a stale switch. Only authoring is barred.
    const document = convertedDocument()
    const removed = applyOk(document, 'set_field', { pointer: '/composition/markers/0', delete: true })
    expect(removed.document.show.composition.markers).toEqual([])
  })
})
