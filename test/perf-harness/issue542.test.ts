import { describe, expect, it } from 'vitest'
import { issue542Census } from './issue542'

describe('issue #542 baseline census', () => {
  it('pins the three target references and the motion control before score compaction', () => {
    // Re-measured 2026-08-02 against the repartitioned references (the
    // original wipe-mix and motion fixtures retired with the showcase
    // rebuild). The baseline column is the per-scene unshared counterfactual;
    // production keeps three shared instances. Easing is the one reference
    // where the table-driven score also engages (its uniform cadence is the
    // control variable); the paced references stay unrolled by design, and
    // Zoom and Spin stands in as the all-motion control with shared kernels.
    expect(issue542Census.map((entry) => entry.baseline)).toMatchObject([
      {
        authoredJsonBytes: 13_760,
        generatedSourceBytes: 96_227,
        patternInstanceCount: 12,
        persistentGlobals: 331,
      },
      {
        // 10_870 -> 10_872 corrects a pin left stale on main by #690's
        // late per-variant aspect defaults (constraintsByVariant): the
        // palette-materialized ellipse boundary now persists aspect 1.5,
        // growing this reference's authored JSON by two bytes. Verified by
        // running this census on the pre-#691 main tip, which fails there.
        authoredJsonBytes: 10_872,
        generatedSourceBytes: 73_445,
        patternInstanceCount: 9,
        persistentGlobals: 248,
      },
      {
        authoredJsonBytes: 25_650,
        generatedSourceBytes: 177_864,
        patternInstanceCount: 22,
        persistentGlobals: 601,
      },
      {
        authoredJsonBytes: 9_963,
        generatedSourceBytes: 28_208,
        patternInstanceCount: 3,
        persistentGlobals: 99,
        motionTransitions: {
          representation: 'exact-family-kernels',
          stackPlanCount: 2,
          kernelCount: 5,
        },
      },
    ])
    expect(issue542Census.map((entry) => ({
      patternInstanceCount: entry.production.patternInstanceCount,
      generatedSourceBytes: entry.production.generatedSourceBytes,
      persistentGlobals: entry.production.persistentGlobals,
    }))).toEqual([
      // #717 stack-wrapper interning: shared wrappers cut both generated
      // bytes and wrapper globals on the transition references.
      { patternInstanceCount: 3, generatedSourceBytes: 33_035, persistentGlobals: 92 },
      { patternInstanceCount: 3, generatedSourceBytes: 32_337, persistentGlobals: 92 },
      { patternInstanceCount: 3, generatedSourceBytes: 21_406, persistentGlobals: 96 },
      { patternInstanceCount: 3, generatedSourceBytes: 28_208, persistentGlobals: 99 },
    ])
  })
})
