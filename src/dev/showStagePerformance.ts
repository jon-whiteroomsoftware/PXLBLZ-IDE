export interface ShowStagePerformanceSummary {
  pixelCount: number
  presentedFrames: number
  runtimeInitializations: number
  resizeEvents: number
  checkpointPrewarm: {
    starts: number
    completions: number
    cancellations: number
    failures: number
    status: 'idle' | 'running' | 'complete' | 'cancelled' | 'failed'
  }
  simulatedTicksPerPresentedFrame: number
  frameIntervalMs: SampleSummary
  patternEvaluationMs: SampleSummary
  stageMaskMs: SampleSummary
  webglPaintMs: SampleSummary
  frameWorkMs: SampleSummary
}

export interface SampleSummary {
  samples: number
  mean: number
  median: number
  p95: number
  max: number
}

export interface ShowStagePerformanceProbe {
  beginPresentedFrame: (timestampMs: number) => void
  recordFrameWork: (sample: {
    patternEvaluationMs: number
    stageMaskMs: number
    webglPaintMs: number
    frameWorkMs: number
    simulatedTicks: number
  }) => void
  recordRuntimeInitialization: () => void
  recordResize: () => void
  recordCheckpointPrewarmStart: () => void
  recordCheckpointPrewarmComplete: () => void
  recordCheckpointPrewarmCancellation: () => void
  recordCheckpointPrewarmFailure: () => void
  snapshot: () => ShowStagePerformanceSummary
}

const MAX_SAMPLES = 600

function pushBounded(samples: number[], value: number) {
  if (!Number.isFinite(value) || value < 0) return
  if (samples.length === MAX_SAMPLES) samples.shift()
  samples.push(value)
}

function summarize(samples: number[]): SampleSummary {
  if (samples.length === 0) return { samples: 0, mean: 0, median: 0, p95: 0, max: 0 }
  const sorted = [...samples].sort((left, right) => left - right)
  const percentile = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
  return {
    samples: samples.length,
    mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    median: percentile(0.5),
    p95: percentile(0.95),
    max: sorted[sorted.length - 1],
  }
}

export function createShowStagePerformanceProbe(pixelCount: number): ShowStagePerformanceProbe {
  const frameIntervals: number[] = []
  const patternEvaluations: number[] = []
  const stageMasks: number[] = []
  const webglPaints: number[] = []
  const frameWork: number[] = []
  let lastPresentedAt: number | null = null
  let presentedFrames = 0
  let simulatedTicks = 0
  let runtimeInitializations = 0
  let resizeEvents = 0
  let checkpointPrewarmStarts = 0
  let checkpointPrewarmCompletions = 0
  let checkpointPrewarmCancellations = 0
  let checkpointPrewarmFailures = 0
  let checkpointPrewarmStatus: ShowStagePerformanceSummary['checkpointPrewarm']['status'] = 'idle'

  return {
    beginPresentedFrame(timestampMs) {
      if (lastPresentedAt !== null) pushBounded(frameIntervals, timestampMs - lastPresentedAt)
      lastPresentedAt = timestampMs
    },
    recordFrameWork(sample) {
      presentedFrames += 1
      simulatedTicks += sample.simulatedTicks
      pushBounded(patternEvaluations, sample.patternEvaluationMs)
      pushBounded(stageMasks, sample.stageMaskMs)
      pushBounded(webglPaints, sample.webglPaintMs)
      pushBounded(frameWork, sample.frameWorkMs)
    },
    recordRuntimeInitialization() {
      runtimeInitializations += 1
    },
    recordResize() {
      resizeEvents += 1
    },
    recordCheckpointPrewarmStart() {
      checkpointPrewarmStarts += 1
      checkpointPrewarmStatus = 'running'
    },
    recordCheckpointPrewarmComplete() {
      checkpointPrewarmCompletions += 1
      checkpointPrewarmStatus = 'complete'
    },
    recordCheckpointPrewarmCancellation() {
      checkpointPrewarmCancellations += 1
      checkpointPrewarmStatus = 'cancelled'
    },
    recordCheckpointPrewarmFailure() {
      checkpointPrewarmFailures += 1
      checkpointPrewarmStatus = 'failed'
    },
    snapshot() {
      return {
        pixelCount,
        presentedFrames,
        runtimeInitializations,
        resizeEvents,
        checkpointPrewarm: {
          starts: checkpointPrewarmStarts,
          completions: checkpointPrewarmCompletions,
          cancellations: checkpointPrewarmCancellations,
          failures: checkpointPrewarmFailures,
          status: checkpointPrewarmStatus,
        },
        simulatedTicksPerPresentedFrame: presentedFrames > 0 ? simulatedTicks / presentedFrames : 0,
        frameIntervalMs: summarize(frameIntervals),
        patternEvaluationMs: summarize(patternEvaluations),
        stageMaskMs: summarize(stageMasks),
        webglPaintMs: summarize(webglPaints),
        frameWorkMs: summarize(frameWork),
      }
    },
  }
}
