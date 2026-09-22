import { describe, expect, it } from 'vitest'
import { classify, compareValues } from './show-v2-native-parity'

// The native/converted harness is only as honest as this classifier: anything it
// admits stops failing the report, so each accepted shape is pinned exactly.
// Four conversion-metadata kinds (#1065, #1066) are admitted and nothing else. Each is
// admitted only as a native *absence* against a recognized converted value, at
// its own exact path; every other difference stays unclassified and fails.
const markerOrigin = { path: '/composition/markers/3/origin', native: undefined, converted: 'converted-scene-label' }
const boundaryOrigin = { path: '/composition/transitions/0/origin', native: undefined, converted: 'converted-boundary-transition' }
const layerOrigin = { path: '/composition/transitions/2/origin', native: undefined, converted: 'converted-layer-transition' }
const routingCut = {
  path: '/composition/layoutOccurrences/2/incomingSwitch',
  native: undefined,
  converted: { origin: 'converted-routing-cut', id: 'routing-split-rings', fromOccurrenceId: 'layout-occurrence:2', easing: { curve: 'linear' } },
}

const classifications = (differences: Array<{ path: string; native: unknown; converted: unknown }>) =>
  classify(differences).map(difference => difference.classification)

describe('admitted conversion provenance', () => {
  it('admits the Marker, Transition and routing-switch forms and nothing else on those objects', () => {
    expect(classifications([markerOrigin, boundaryOrigin, layerOrigin, routingCut]))
      .toEqual(['conversion-provenance', 'conversion-provenance', 'conversion-provenance', 'conversion-provenance'])
  })

  it('admits a routing switch that authored only what v1 authored', () => {
    // `routing-split-rings` authors an easing and no `routingDirection`; an
    // absent direction is not 'forward', so the minimal record is complete.
    const minimal = { ...routingCut, converted: { origin: 'converted-routing-cut', id: 'routing-cut', fromOccurrenceId: 'layout-occurrence:1' } }
    const directed = { ...routingCut, converted: { ...routingCut.converted, direction: 'reverse' } }
    expect(classifications([minimal, directed])).toEqual(['conversion-provenance', 'conversion-provenance'])
  })

  it('reports the recorded switch identity and settings verbatim rather than redacting them', () => {
    const [classified] = classify([routingCut])
    expect(classified.classification).toBe('conversion-provenance')
    expect(classified.converted).toEqual(routingCut.converted)
    expect(classified.native).toBeUndefined()
  })

  it('gives each metadata kind its own rationale instead of calling them all Markers', () => {
    const [marker, transition, cut] = classify([markerOrigin, boundaryOrigin, routingCut])
    expect(new Set([marker.rationale, transition.rationale, cut.rationale]).size).toBe(3)
    expect(marker.rationale).toMatch(/Marker/)
    expect(transition.rationale).toMatch(/Transition/)
    expect(transition.rationale).not.toMatch(/Marker/)
    expect(cut.rationale).toMatch(/zero-duration/)
    expect(cut.rationale).not.toMatch(/Marker/)
  })
})

describe('rejected differences', () => {
  it('refuses a provenance the native builder actually authored, in either direction', () => {
    const differences = [
      { path: '/composition/markers/0/origin', native: 'converted-scene-label', converted: undefined },
      { path: '/composition/transitions/0/origin', native: 'converted-boundary-transition', converted: undefined },
      { path: '/composition/transitions/0/origin', native: 'converted-boundary-transition', converted: 'converted-layer-transition' },
      { path: '/composition/layoutOccurrences/2/incomingSwitch', native: routingCut.converted, converted: undefined },
      // Native authors its own switch; only the leaf differs. The whole-object
      // absence is what is admitted, never a field inside an authored record.
      { path: '/composition/layoutOccurrences/2/incomingSwitch/id', native: 'authored', converted: 'routing-split-rings' },
      { path: '/composition/layoutOccurrences/2/incomingSwitch/easing/curve', native: 'linear', converted: 'sine' },
    ]
    expect(classifications(differences)).toEqual(differences.map(() => 'unclassified'))
  })

  it('refuses an unrecognized enum value and a value carried to the wrong kind', () => {
    const differences = [
      { path: '/composition/markers/0/origin', native: undefined, converted: 'converted-clip' },
      { path: '/composition/transitions/0/origin', native: undefined, converted: 'converted-routing-cut' },
      // Each enum belongs to exactly one kind.
      { path: '/composition/transitions/0/origin', native: undefined, converted: 'converted-scene-label' },
      { path: '/composition/markers/0/origin', native: undefined, converted: 'converted-layer-transition' },
      { path: '/composition/transitions/0/origin', native: undefined, converted: true },
    ]
    expect(classifications(differences)).toEqual(differences.map(() => 'unclassified'))
  })

  it('refuses provenance at any path but its own', () => {
    const differences = [
      { path: '/composition/clips/0/origin', native: undefined, converted: 'converted-scene-label' },
      { path: '/composition/origin', native: undefined, converted: 'converted-scene-label' },
      { path: '/composition/groupDefinitions/0/transitions/0/origin', native: undefined, converted: 'converted-layer-transition' },
      { path: '/composition/transitions/0/participants/0/origin', native: undefined, converted: 'converted-layer-transition' },
      { path: '/composition/groupOccurrences/0/incomingSwitch', native: undefined, converted: routingCut.converted },
      { path: '/composition/transitions/0/incomingSwitch', native: undefined, converted: routingCut.converted },
      { path: '/composition/layoutOccurrences/2/incomingTransfer', native: undefined, converted: { id: 'routing-full-split', fromOccurrenceId: 'layout-occurrence:1', durationMs: 1500, direction: 'forward' } },
    ]
    expect(classifications(differences)).toEqual(differences.map(() => 'unclassified'))
  })

  it('refuses a path that merely starts or ends like an admitted one', () => {
    // Each admitted path is anchored at both ends: a neighbouring field whose
    // name extends an admitted one, a value nested inside an admitted field,
    // and a non-numeric collection index are all different things.
    const differences = [
      { path: '/composition/markers/0/originLabel', native: undefined, converted: 'converted-scene-label' },
      { path: '/composition/markers/0/origin/0', native: undefined, converted: 'converted-scene-label' },
      { path: '/composition/transitions/0/originKind', native: undefined, converted: 'converted-layer-transition' },
      { path: '/composition/layoutOccurrences/2/incomingSwitchProvenance', native: undefined, converted: routingCut.converted },
      { path: '/composition/layoutOccurrences/2/incomingSwitch/nested', native: undefined, converted: routingCut.converted },
      { path: '/composition/layoutOccurrences/x/incomingSwitch', native: undefined, converted: routingCut.converted },
      { path: '/composition/markers/first/origin', native: undefined, converted: 'converted-scene-label' },
      { path: '/patternInstances/composition/transitions/0/origin', native: undefined, converted: 'converted-boundary-transition' },
    ]
    expect(classifications(differences)).toEqual(differences.map(() => 'unclassified'))
  })

  it('refuses the property a native-authored switch merely omits', () => {
    // The admitted asymmetry is the whole switch record being absent. Once the
    // native builder authors one, the comparator descends into it and every
    // leaf below - including one the native record simply does not set - is a
    // genuine disagreement about authored settings.
    const differences = [
      { path: '/composition/layoutOccurrences/2/incomingSwitch/easing', native: undefined, converted: { curve: 'linear' } },
      { path: '/composition/layoutOccurrences/2/incomingSwitch/direction', native: undefined, converted: 'reverse' },
    ]
    expect(classifications(differences)).toEqual(differences.map(() => 'unclassified'))
  })

  it('refuses a routing switch that is not the complete closed shape', () => {
    const complete = routingCut.converted
    const at = (converted: unknown) => ({ ...routingCut, converted })
    const differences = [
      at({ ...complete, origin: undefined }),
      at({ id: complete.id, fromOccurrenceId: complete.fromOccurrenceId }),
      at({ ...complete, origin: 'converted-routing-transfer' }),
      at({ origin: complete.origin, fromOccurrenceId: complete.fromOccurrenceId }),
      at({ origin: complete.origin, id: complete.id }),
      // A timed transfer smuggled into the inert record is not inert.
      at({ ...complete, durationMs: 250 }),
      at({ ...complete, note: 'extra' }),
      at({ ...complete, id: 7 }),
      at({ ...complete, id: '   ' }),
      at({ ...complete, fromOccurrenceId: '' }),
      at({ ...complete, direction: 'sideways' }),
      at({ ...complete, direction: null }),
      at({ ...complete, easing: 'linear' }),
      at({ ...complete, easing: { curve: 'bogus' } }),
      at({ ...complete, easing: { curve: 'linear', durationMs: 250 } }),
      at({ ...complete, easing: { curve: 'quadratic' } }),
      at({ ...complete, easing: { curve: 'quadratic', direction: 'sideways' } }),
      at({ ...complete, easing: { curve: 'steps', steps: 4 } }),
      at({ ...complete, easing: { curve: 'cubic-bezier', x1: 0, y1: 0, x2: 1, y2: Number.NaN } }),
      at([complete]),
      at(null),
      at('converted-routing-cut'),
    ]
    expect(classifications(differences)).toEqual(differences.map(() => 'unclassified'))
  })

  it('refuses a whole added or removed Transition, Marker or Layout occurrence', () => {
    const differences = [
      { path: '/composition/transitions/3', native: undefined, converted: { id: 'transition-scene-1', origin: 'converted-boundary-transition' } },
      { path: '/composition/markers/4', native: undefined, converted: { id: 'scene-marker:a', timeMs: 0, origin: 'converted-scene-label' } },
      { path: '/composition/layoutOccurrences/3', native: undefined, converted: { id: 'layout-occurrence:4', incomingSwitch: routingCut.converted } },
      { path: '/composition/transitions/1', native: { id: 'transition-iris-horizon' }, converted: undefined },
      { path: '/composition/transitions', native: [], converted: [{ id: 'transition-scene-1' }] },
    ]
    expect(classifications(differences)).toEqual(differences.map(() => 'unclassified'))
  })

  it('refuses ordinary authored content beside admitted provenance', () => {
    const differences = [
      { path: '/composition/markers/1/name', native: 'Opening', converted: 'Scene 1' },
      { path: '/composition/transitions/0/durationMs', native: 2000, converted: 1500 },
      { path: '/composition/transitions/0/kind', native: 'crossfade', converted: 'wipe' },
      { path: '/composition/layoutOccurrences/2/layoutId', native: 'routing-layout:rings', converted: 'routing-layout:split' },
      { path: '/composition/layoutOccurrences/2/durationMs', native: 4000, converted: 3500 },
    ]
    expect(classifications(differences)).toEqual(differences.map(() => 'unclassified'))
  })
})

describe('the volatile record stamp', () => {
  it('keeps its classification and its redaction intact', () => {
    const classified = classify([{ path: '/updatedAt', native: 1, converted: 1_700_000_000_000 }])
    expect(classified.map(difference => difference.classification)).toEqual(['volatile-record-stamp'])
    expect(classified[0].converted).toBe('<volatile wall-clock stamp>')
  })

  it('redacts nothing else', () => {
    expect(classify([{ path: '/composition/updatedAt', native: 1, converted: 2 }])[0].classification).toBe('unclassified')
    expect(classify([{ path: '/name', native: 'Aurora', converted: 'Aurora Drift' }])[0].classification).toBe('unclassified')
  })
})

// Path constants are only trustworthy against paths the comparator really
// produces, so these drive the whole seam: two records in, classifications out.
describe('paths the comparator actually produces', () => {
  const native = {
    composition: {
      markers: [{ id: 'chapter:1', timeMs: 0, role: 'chapter' }],
      transitions: [{ id: 'transition-scene-1', durationMs: 2000 }],
      layoutOccurrences: [
        { id: 'layout-occurrence:1', layoutId: 'full', startMs: 0, durationMs: 1000 },
        { id: 'layout-occurrence:2', layoutId: 'split', startMs: 1000, durationMs: 1000 },
      ],
    },
  }
  const converted = {
    composition: {
      markers: [{ id: 'chapter:1', timeMs: 0, role: 'chapter', origin: 'converted-scene-label' }],
      transitions: [{ id: 'transition-scene-1', durationMs: 2000, origin: 'converted-boundary-transition' }],
      layoutOccurrences: [
        native.composition.layoutOccurrences[0],
        {
          ...native.composition.layoutOccurrences[1],
          incomingSwitch: { origin: 'converted-routing-cut', id: 'routing-split-rings', fromOccurrenceId: 'layout-occurrence:1', easing: { curve: 'linear' } },
        },
      ],
    },
  }

  it('classifies all three kinds and leaves an identical record with no differences', () => {
    expect(classify(compareValues(native, converted)).map(difference => [difference.path, difference.classification])).toEqual([
      ['/composition/layoutOccurrences/1/incomingSwitch', 'conversion-provenance'],
      ['/composition/markers/0/origin', 'conversion-provenance'],
      ['/composition/transitions/0/origin', 'conversion-provenance'],
    ])
    expect(compareValues(native, native)).toEqual([])
  })

  it('still fails when a neighbouring authored field drifts under the same objects', () => {
    const drifted = structuredClone(converted)
    drifted.composition.transitions[0].durationMs = 1500
    expect(classify(compareValues(native, drifted)).filter(difference => difference.classification === 'unclassified')
      .map(difference => difference.path)).toEqual(['/composition/transitions/0/durationMs'])
  })

  it('still fails when the converted record gains a Layout occurrence carrying a switch', () => {
    const added = structuredClone(converted)
    added.composition.layoutOccurrences.push({
      id: 'layout-occurrence:3', layoutId: 'rings', startMs: 2000, durationMs: 1000,
      incomingSwitch: { origin: 'converted-routing-cut', id: 'routing-rings', fromOccurrenceId: 'layout-occurrence:2' },
    } as (typeof added)['composition']['layoutOccurrences'][number])
    expect(classify(compareValues(native, added)).some(difference => difference.classification === 'unclassified')).toBe(true)
  })

  it('still fails when the native record is the one carrying the metadata', () => {
    expect(classify(compareValues(converted, native)).filter(difference => difference.classification === 'unclassified')
      .map(difference => difference.path)).toEqual([
      '/composition/layoutOccurrences/1/incomingSwitch',
      '/composition/markers/0/origin',
      '/composition/transitions/0/origin',
    ])
  })
})

describe('the authored repeat-scale provenance (#1066)', () => {
  const sampleRemapOrigin = { path: '/composition/sampleRemap/origin', native: undefined, converted: 'converted-authored-repeat-scale' }

  it('admits exactly a native absence against the one converted value at the one path, with its own rationale', () => {
    const [classified] = classify([sampleRemapOrigin])
    expect(classified.classification).toBe('conversion-provenance')
    expect(classified.rationale).toMatch(/repeat scale/)
    expect(classified.rationale).not.toMatch(/Marker/)
    const [marker] = classify([markerOrigin])
    expect(classified.rationale).not.toBe(marker.rationale)
  })

  it('refuses every neighbouring form', () => {
    const differences = [
      { ...sampleRemapOrigin, native: 'converted-authored-repeat-scale', converted: undefined },
      { ...sampleRemapOrigin, native: 'converted-authored-repeat-scale' },
      { ...sampleRemapOrigin, converted: 'converted-scene-label' },
      { ...sampleRemapOrigin, converted: true },
      { ...sampleRemapOrigin, path: '/composition/sampleRemap/origin/0' },
      { ...sampleRemapOrigin, path: '/composition/sampleRemap/originLabel' },
      { ...sampleRemapOrigin, path: '/composition/sampleRemap' },
      { ...sampleRemapOrigin, path: '/composition/groupDefinitions/0/sampleRemap/origin' },
      { path: '/composition/sampleRemap/repeatScale', native: 1, converted: 4 },
      { path: '/composition/markers/0/origin', native: undefined, converted: 'converted-authored-repeat-scale' },
    ]
    expect(classifications(differences)).toEqual(differences.map(() => 'unclassified'))
  })
})
