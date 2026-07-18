import { describe, expect, it } from 'vitest'
import { issue542Census } from './issue542'

describe('issue #542 baseline census', () => {
  it('pins the three target references and the Motion control before score compaction', () => {
    expect(issue542Census.map((entry) => entry.baseline)).toMatchObject([
      {
        authoredJsonBytes: 36_235,
        generatedSourceBytes: 184_903,
        patternInstanceCount: 28,
        persistentGlobals: 543,
      },
      {
        authoredJsonBytes: 25_275,
        generatedSourceBytes: 118_696,
        patternInstanceCount: 17,
        persistentGlobals: 334,
      },
      {
        authoredJsonBytes: 28_057,
        generatedSourceBytes: 141_684,
        patternInstanceCount: 22,
        persistentGlobals: 429,
      },
      {
        authoredJsonBytes: 29_440,
        generatedSourceBytes: 67_934,
        patternInstanceCount: 3,
        persistentGlobals: 75,
        motionTransitions: {
          representation: 'exact-family-kernels',
          stackPlanCount: 2,
          kernelCount: 11,
        },
      },
    ])
    expect(issue542Census.map((entry) => ({
      patternInstanceCount: entry.production.patternInstanceCount,
      generatedSourceBytes: entry.production.generatedSourceBytes,
      persistentGlobals: entry.production.persistentGlobals,
    }))).toEqual([
      { patternInstanceCount: 3, generatedSourceBytes: 26_443, persistentGlobals: 80 },
      { patternInstanceCount: 3, generatedSourceBytes: 29_299, persistentGlobals: 78 },
      { patternInstanceCount: 3, generatedSourceBytes: 18_929, persistentGlobals: 78 },
      { patternInstanceCount: 3, generatedSourceBytes: 67_934, persistentGlobals: 75 },
    ])
  })
})
