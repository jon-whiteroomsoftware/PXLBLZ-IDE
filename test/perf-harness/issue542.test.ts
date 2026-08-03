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
        generatedSourceBytes: 96_208,
        patternInstanceCount: 12,
        persistentGlobals: 325,
      },
      {
        authoredJsonBytes: 10_870,
        generatedSourceBytes: 73_346,
        patternInstanceCount: 9,
        persistentGlobals: 248,
      },
      {
        authoredJsonBytes: 25_650,
        generatedSourceBytes: 178_412,
        patternInstanceCount: 22,
        persistentGlobals: 595,
      },
      {
        authoredJsonBytes: 9_963,
        generatedSourceBytes: 37_624,
        patternInstanceCount: 3,
        persistentGlobals: 93,
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
      { patternInstanceCount: 3, generatedSourceBytes: 59_154, persistentGlobals: 122 },
      { patternInstanceCount: 3, generatedSourceBytes: 49_367, persistentGlobals: 110 },
      { patternInstanceCount: 3, generatedSourceBytes: 21_406, persistentGlobals: 96 },
      { patternInstanceCount: 3, generatedSourceBytes: 37_624, persistentGlobals: 93 },
    ])
  })
})
