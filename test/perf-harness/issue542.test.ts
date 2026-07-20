import { describe, expect, it } from 'vitest'
import { issue542Census } from './issue542'

describe('issue #542 baseline census', () => {
  it('pins the three target references and the Motion control before score compaction', () => {
    expect(issue542Census.map((entry) => entry.baseline)).toMatchObject([
      {
        authoredJsonBytes: 33_023,
        generatedSourceBytes: 177_411,
        patternInstanceCount: 28,
        persistentGlobals: 543,
      },
      {
        authoredJsonBytes: 21_407,
        generatedSourceBytes: 114_452,
        patternInstanceCount: 17,
        persistentGlobals: 334,
      },
      {
        authoredJsonBytes: 25_656,
        generatedSourceBytes: 135_908,
        patternInstanceCount: 22,
        persistentGlobals: 429,
      },
      {
        authoredJsonBytes: 24_906,
        generatedSourceBytes: 67_694,
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
      { patternInstanceCount: 3, generatedSourceBytes: 26_174, persistentGlobals: 80 },
      { patternInstanceCount: 3, generatedSourceBytes: 29_059, persistentGlobals: 78 },
      { patternInstanceCount: 3, generatedSourceBytes: 18_689, persistentGlobals: 78 },
      { patternInstanceCount: 3, generatedSourceBytes: 67_694, persistentGlobals: 75 },
    ])
  })
})
