import { describe, expect, it } from 'vitest'
import { createShowStagePerformanceProbe } from './showStagePerformance'

describe('show Stage performance probe', () => {
  it('reports frame cadence, phase percentiles, and runtime lifecycle counts', () => {
    const probe = createShowStagePerformanceProbe(4_000)
    probe.recordRuntimeInitialization()
    probe.recordResize()
    probe.recordCheckpointPrewarmStart()
    probe.recordCheckpointPrewarmComplete()
    probe.recordCheckpointPrewarmStart()
    probe.recordCheckpointPrewarmCancellation()
    probe.beginPresentedFrame(100)
    probe.beginPresentedFrame(116)
    probe.beginPresentedFrame(136)
    probe.recordFrameWork({
      patternEvaluationMs: 2,
      stageMaskMs: 0.1,
      webglPaintMs: 0.4,
      frameWorkMs: 3,
      simulatedTicks: 1,
    })
    probe.recordFrameWork({
      patternEvaluationMs: 4,
      stageMaskMs: 0.2,
      webglPaintMs: 0.8,
      frameWorkMs: 6,
      simulatedTicks: 1,
    })

    expect(probe.snapshot()).toMatchObject({
      pixelCount: 4_000,
      presentedFrames: 2,
      runtimeInitializations: 1,
      resizeEvents: 1,
      checkpointPrewarm: {
        starts: 2,
        completions: 1,
        cancellations: 1,
        failures: 0,
        status: 'cancelled',
      },
      simulatedTicksPerPresentedFrame: 1,
      frameIntervalMs: { samples: 2, median: 20, p95: 20, max: 20 },
      patternEvaluationMs: { samples: 2, median: 4, p95: 4, max: 4 },
      stageMaskMs: { samples: 2, median: 0.2, p95: 0.2, max: 0.2 },
      webglPaintMs: { samples: 2, median: 0.8, p95: 0.8, max: 0.8 },
      frameWorkMs: { samples: 2, median: 6, p95: 6, max: 6 },
    })
  })
})
