import { describe, expect, it } from 'vitest'
import { assessVisualPair } from './showEditorEquivalenceOracle'
import {
  classifySurfaceNoisePlan,
  reclassifyVisualPairWithCaptureNoise,
  type PhaseCapture,
  type PlannedClassification,
  type SurfaceNoisePlanInput,
} from './showSurfaceNoisePlan'

/**
 * The plan is what decides which controls a comparison is even allowed to see. These cases pin that
 * a delivered comparison is never offered normalized controls, that a within-version comparison is
 * never offered the other version's, and that a missing piece of the fixed sequence classifies
 * nothing rather than falling back to whatever was collected.
 */

const A = [29, 29, 34, 255] as const
const B = [29, 29, 33, 255] as const
const POSITION = { x: 366, y: 256 }
const DELIVERED_FINGERPRINT = 'sha256:delivered'
const NORMALIZED_FINGERPRINT = 'sha256:normalized'

function capture(
  label: string,
  role: 'control' | 'candidate',
  version: 'v1' | 'v2',
  state: 'delivered' | 'normalized',
  sequence: number,
  group?: string,
  acquisition: 'direct' | 'restored' = 'direct',
): PhaseCapture {
  return {
    label,
    role,
    group,
    version,
    state,
    acquisition,
    sequence,
    path: `/tmp/pxlblz/${label}.png`,
    sha256: 'b'.repeat(64),
    fingerprint: state === 'delivered' ? DELIVERED_FINGERPRINT : NORMALIZED_FINGERPRINT,
    mutationHistory: state === 'delivered' ? 'delivered values on display' : 'normalized to the common value',
  }
}

const CAPTURES: PhaseCapture[] = [
  capture('v1-delivered-control-a', 'control', 'v1', 'delivered', 1, 'v1-delivered'),
  capture('v1-delivered-control-b', 'control', 'v1', 'delivered', 2, 'v1-delivered'),
  capture('v1-normalized-control-a', 'control', 'v1', 'normalized', 3, 'v1-normalized'),
  capture('v1-normalized-control-b', 'control', 'v1', 'normalized', 4, 'v1-normalized'),
  capture('v2-delivered-control-a', 'control', 'v2', 'delivered', 5, 'v2-delivered'),
  capture('v2-delivered-control-b', 'control', 'v2', 'delivered', 6, 'v2-delivered'),
  capture('v2-normalized-control-a', 'control', 'v2', 'normalized', 7, 'v2-normalized'),
  capture('v2-normalized-control-b', 'control', 'v2', 'normalized', 8, 'v2-normalized'),
  // The restoration controls are their own group: they are the same numeric phase reached by a
  // different acquisition, and pooling them with the pristine ones would make any reproducible
  // restoration residual classify by construction.
  capture('v2-restored-control-a', 'control', 'v2', 'delivered', 9, 'v2-delivered-restored', 'restored'),
  capture('v2-restored-control-b', 'control', 'v2', 'delivered', 10, 'v2-delivered-restored', 'restored'),
  capture('v1-delivered-candidate', 'candidate', 'v1', 'delivered', 11),
  capture('v1-normalized-candidate', 'candidate', 'v1', 'normalized', 12),
  capture('v2-delivered-candidate', 'candidate', 'v2', 'delivered', 13),
  capture('v2-normalized-candidate', 'candidate', 'v2', 'normalized', 14),
  capture('v2-restored-candidate', 'candidate', 'v2', 'delivered', 15, undefined, 'restored'),
]

/** Every capture observed A at the position, except the two that this scenario varies. */
function samples(varying: Record<string, typeof A | typeof B> = {}) {
  return Object.fromEntries(CAPTURES.map(entry => [
    entry.label, [{ ...POSITION, rgba: varying[entry.label] ?? A }],
  ]))
}

function input(overrides: Partial<SurfaceNoisePlanInput> = {}): SurfaceNoisePlanInput {
  return {
    surface: 'preview-strip',
    viewport: { width: 1440, height: 1000 },
    showId: 'oracle-fresh-capture',
    authoredState: 'fixedTimeMs=0;prepare=none',
    captureSettings: 'element-clip;deviceScaleFactor=1;animations=disabled',
    fingerprintPolicy: 'surface DOM, geometry and collected styles; fixed gauge values replaced in place',
    captures: CAPTURES,
    comparisons: [],
    samples: samples(),
    domStates: [
      { fingerprint: DELIVERED_FINGERPRINT, points: [{ ...POSITION, canvasBacked: false, chain: [node()] }] },
      { fingerprint: NORMALIZED_FINGERPRINT, points: [{ ...POSITION, canvasBacked: false, chain: [node()] }] },
    ],
    ...overrides,
  }
}

function node() {
  return {
    tag: 'span',
    attributes: {},
    rect: { x: 360, y: 250, width: 40, height: 12 },
    computedStyle: { color: 'rgb(161, 161, 170)' },
    pseudoStyle: {},
  }
}

const changed = [{ ...POSITION, left: A, right: B }]

describe('which controls a comparison is allowed to see', () => {
  it('offers a cross-version delivered comparison both delivered groups and neither normalized one', () => {
    const [planned] = classifySurfaceNoisePlan(input({
      comparisons: [{
        key: 'delivered v1 vs v2', left: 'v1-delivered-candidate', right: 'v2-delivered-candidate',
        changedPixels: changed, reportedChangedPixels: 1,
      }],
      samples: samples({ 'v2-delivered-candidate': B, 'v1-delivered-control-b': B }),
    }))
    expect(planned.plan).toEqual(['v1-delivered', 'v2-delivered'])
    expect(planned.classification?.classified).toBe(true)
    expect(planned.classification?.classifiedPixels[0].qualifyingGroup).toBe('v1-delivered')
  })

  it('offers a within-version restoration comparison only that version, and each acquisition apart', () => {
    const [planned] = classifySurfaceNoisePlan(input({
      comparisons: [{
        key: 'v2 delivered vs restored', left: 'v2-delivered-candidate', right: 'v2-restored-candidate',
        changedPixels: changed, reportedChangedPixels: 1,
      }],
      samples: samples({ 'v2-restored-candidate': B, 'v1-delivered-control-b': B }),
    }))
    expect(planned.plan).toEqual(['v2-delivered', 'v2-delivered-restored'])
    // v1's control observed the other value, but it is not this comparison's version and never counts.
    expect(planned.classification?.classified).toBe(false)
    expect(planned.classification?.residualPixels[0].reason).toBe('variant-not-observed')
  })

  it('offers a normalized comparison the normalized groups, whose fingerprint is the normalized one', () => {
    const [planned] = classifySurfaceNoisePlan(input({
      comparisons: [{
        key: 'normalized v1 vs v2', left: 'v1-normalized-candidate', right: 'v2-normalized-candidate',
        changedPixels: changed, reportedChangedPixels: 1,
      }],
      samples: samples({ 'v2-normalized-candidate': B, 'v2-normalized-control-b': B }),
    }))
    expect(planned.plan).toEqual(['v1-normalized', 'v2-normalized'])
    expect(planned.classification?.classified).toBe(true)
    expect(planned.classification?.classifiedPixels[0].qualifyingGroup).toBe('v2-normalized')
  })

  it('refuses when a comparison mixes numeric states, whose fingerprints differ by the fill geometry', () => {
    const [planned] = classifySurfaceNoisePlan(input({
      comparisons: [{
        key: 'delivered vs normalized', left: 'v2-delivered-candidate', right: 'v2-normalized-candidate',
        changedPixels: changed, reportedChangedPixels: 1,
      }],
    }))
    expect(planned.classification).toBeNull()
    expect(planned.unusable).toContain('different numeric states')
  })

  it('classifies nothing when the fixed sequence is missing a control group or a capture', () => {
    const withoutGroup = classifySurfaceNoisePlan(input({
      captures: CAPTURES.filter(entry => entry.group !== 'v2-delivered'),
      comparisons: [{
        key: 'delivered v1 vs v2', left: 'v1-delivered-candidate', right: 'v2-delivered-candidate',
        changedPixels: changed, reportedChangedPixels: 1,
      }],
    }))
    expect(withoutGroup[0].classification).toBeNull()
    expect(withoutGroup[0].unusable).toContain('v2-delivered')

    const withoutCapture = classifySurfaceNoisePlan(input({
      comparisons: [{
        key: 'delivered v1 vs v2', left: 'v1-delivered-candidate', right: 'never-captured',
        changedPixels: changed, reportedChangedPixels: 1,
      }],
    }))
    expect(withoutCapture[0].classification).toBeNull()
    expect(withoutCapture[0].unusable).toContain('missing')
  })

  it('refuses to compare a control capture as if it were a candidate', () => {
    const [planned] = classifySurfaceNoisePlan(input({
      comparisons: [{
        key: 'control as candidate', left: 'v1-delivered-control-a', right: 'v2-delivered-candidate',
        changedPixels: changed, reportedChangedPixels: 1,
      }],
    }))
    expect(planned.classification).toBeNull()
    expect(planned.unusable).toContain('Only candidate captures')
  })

  it('carries every comparison it was given, in order', () => {
    const planned = classifySurfaceNoisePlan(input({
      comparisons: [
        { key: 'one', left: 'v1-delivered-candidate', right: 'v2-delivered-candidate', changedPixels: [], reportedChangedPixels: 0 },
        { key: 'two', left: 'v1-normalized-candidate', right: 'v2-normalized-candidate', changedPixels: [], reportedChangedPixels: 0 },
      ],
    }))
    expect(planned.map(entry => entry.key)).toEqual(['one', 'two'])
    expect(planned.every(entry => entry.classification?.reason === 'nothing-to-classify')).toBe(true)
  })
})

describe('restoration controls are never pooled with pristine ones (#1065)', () => {
  const restoration = {
    key: 'v2 delivered vs restored', left: 'v2-delivered-candidate', right: 'v2-restored-candidate',
    changedPixels: changed, reportedChangedPixels: 1,
  }

  /**
   * The gate this protects: the restoration comparison exists to prove the counterfactual's mutation
   * left no lasting raster effect. A deterministic one-level re-raster after restore shows the
   * delivered value in every pristine control and the restored value in every restored control, so a
   * pooled group would hold both by construction and forgive precisely what the gate was added to
   * catch. Split, neither group ever sees both, and the pixel stays residual.
   */
  it('leaves a deterministic post-restoration residual unclassified', () => {
    const [planned] = classifySurfaceNoisePlan(input({
      comparisons: [restoration],
      samples: samples({
        'v2-restored-candidate': B,
        'v2-restored-control-a': B,
        'v2-restored-control-b': B,
      }),
    }))

    expect(planned.plan).toEqual(['v2-delivered', 'v2-delivered-restored'])
    expect(planned.classification?.classified).toBe(false)
    expect(planned.classification?.residualPixels[0].reason).toBe('variant-not-observed')
    expect(planned.classification?.classifiedPixels).toEqual([])
  })

  /**
   * The same evidence under the old pooled group. Both values are present across the four captures,
   * and every one of them is a control of the same version and numeric phase, so pooling classifies
   * it. This case exists so the split cannot be quietly undone without a red test.
   */
  it('would classify that same residual if the two acquisitions shared one group', () => {
    // The old model exactly: one group for the version and numeric phase, with no acquisition
    // distinction at all, so the restored captures land beside the pristine ones.
    const pooled = CAPTURES.map(entry => (
      entry.acquisition === 'restored'
        ? { ...entry, acquisition: 'direct' as const, ...(entry.group ? { group: 'v2-delivered' } : {}) }
        : entry
    ))
    const [planned] = classifySurfaceNoisePlan(input({
      captures: pooled,
      comparisons: [restoration],
      samples: samples({
        'v2-restored-candidate': B,
        'v2-restored-control-a': B,
        'v2-restored-control-b': B,
      }),
    }))

    expect(planned.classification?.classified).toBe(true)
    expect(planned.classification?.classifiedPixels[0].qualifyingGroup).toBe('v2-delivered')
  })

  /**
   * What genuine nondeterminism looks like, and the only thing that should still classify here: two
   * independently acquired restorations of the same state disagree with each other at that position.
   */
  it('classifies a residual two independent restorations disagree on', () => {
    const [planned] = classifySurfaceNoisePlan(input({
      comparisons: [restoration],
      samples: samples({ 'v2-restored-candidate': B, 'v2-restored-control-b': B }),
    }))

    expect(planned.classification?.classified).toBe(true)
    expect(planned.classification?.classifiedPixels[0].qualifyingGroup).toBe('v2-delivered-restored')
  })

  it('refuses when the run collected no restoration control group at all', () => {
    const [planned] = classifySurfaceNoisePlan(input({
      captures: CAPTURES.filter(entry => entry.group !== 'v2-delivered-restored'),
      comparisons: [restoration],
    }))

    expect(planned.classification).toBeNull()
    expect(planned.unusable).toContain('v2-delivered-restored')
  })
})

describe('clearing an ordinary surface on demonstrated noise', () => {
  const box = { present: true, x: 0, y: 0, width: 1440, height: 1000 }
  const differing = assessVisualPair({ surface: 'timeline', v1: box, v2: box, changedPixels: 1, maximumChannelDelta: 1 })

  function planned(overrides: Partial<NonNullable<PlannedClassification['classification']>> = {}): PlannedClassification {
    const [entry] = classifySurfaceNoisePlan(input({
      comparisons: [{
        key: 'delivered v1 vs v2', left: 'v1-delivered-candidate', right: 'v2-delivered-candidate',
        changedPixels: changed, reportedChangedPixels: 1,
      }],
      samples: samples({ 'v2-delivered-candidate': B, 'v1-delivered-control-b': B }),
    }))
    return { ...entry, classification: { ...entry.classification!, ...overrides } }
  }

  it('clears a pixels-differ surface whose fresh comparison left no residual', () => {
    expect(planned().classification?.classified).toBe(true)
    expect(reclassifyVisualPairWithCaptureNoise(differing, planned()).equivalent).toBe(true)
  })

  it('never clears on a residual, an unclassified comparison, or a missing one', () => {
    const residual = planned({
      classified: false,
      residualPixels: [{
        x: 1, y: 1, left: A, right: B, canvasBacked: false,
        reason: 'variant-not-observed', qualifyingGroup: null, qualifiedBy: [],
      }],
    })
    expect(reclassifyVisualPairWithCaptureNoise(differing, residual).equivalent).toBe(false)
    expect(reclassifyVisualPairWithCaptureNoise(differing, undefined).equivalent).toBe(false)
    expect(reclassifyVisualPairWithCaptureNoise(differing, { ...planned(), classification: null }).equivalent).toBe(false)
  })

  it('never clears a missing surface, changed dimensions or changed position', () => {
    for (const failing of [
      assessVisualPair({ surface: 'timeline', v1: { present: false }, v2: box, changedPixels: 0, maximumChannelDelta: 0 }),
      assessVisualPair({ surface: 'timeline', v1: box, v2: { ...box, height: 999 }, changedPixels: 0, maximumChannelDelta: 0 }),
      assessVisualPair({ surface: 'timeline', v1: box, v2: { ...box, x: 3 }, changedPixels: 0, maximumChannelDelta: 0 }),
    ]) {
      expect(reclassifyVisualPairWithCaptureNoise(failing, planned()).equivalent).toBe(false)
    }
  })

  it('carries the classification into the report either way', () => {
    expect(reclassifyVisualPairWithCaptureNoise(differing, planned()).captureNoise?.key).toBe('delivered v1 vs v2')
  })
})
