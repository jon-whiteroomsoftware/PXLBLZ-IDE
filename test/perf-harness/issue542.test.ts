import { describe, expect, it } from 'vitest'
import { issue542Census } from './issue542'

describe('issue #542 baseline census', () => {
  it('pins the three target references and the motion control before score compaction', () => {
    // Re-measured 2026-08-02 against the repartitioned references (the
    // original wipe-mix and motion fixtures retired with the showcase
    // rebuild), and 2026-08-22 when every reference dropped its shared
    // backdrop and the pair recast (#63). The baseline column is the
    // per-scene unshared counterfactual; production keeps two shared
    // instances. Easing is the one reference where the table-driven score
    // also engages (its uniform cadence is the control variable); the paced
    // references stay unrolled by design, and Zoom and Spin stands in as
    // the all-motion control with shared kernels. IridescentFibers #916 adds
    // one table global per instance to the Shape Reveals reference; its
    // unrolled verdict is unchanged.
    expect(issue542Census.map((entry) => entry.baseline)).toMatchObject([
      {
        authoredJsonBytes: 10_919,
        generatedSourceBytes: 90_457,
        patternInstanceCount: 11,
        persistentGlobals: 368,
      },
      {
        authoredJsonBytes: 8_806,
        generatedSourceBytes: 56_165,
        patternInstanceCount: 8,
        persistentGlobals: 211,
      },
      {
        authoredJsonBytes: 20_075,
        generatedSourceBytes: 152_924,
        patternInstanceCount: 21,
        persistentGlobals: 578,
      },
      {
        authoredJsonBytes: 7_683,
        generatedSourceBytes: 22_716,
        patternInstanceCount: 2,
        persistentGlobals: 73,
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
      { patternInstanceCount: 2, generatedSourceBytes: 27_254, persistentGlobals: 79 },
      { patternInstanceCount: 2, generatedSourceBytes: 23_882, persistentGlobals: 64 },
      { patternInstanceCount: 2, generatedSourceBytes: 15_465, persistentGlobals: 73 },
      { patternInstanceCount: 2, generatedSourceBytes: 22_716, persistentGlobals: 73 },
    ])
  })
})
