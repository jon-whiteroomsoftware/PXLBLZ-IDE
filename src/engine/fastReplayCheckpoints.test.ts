import {
  advanceFastReplayCooperatively,
  createFastReplayRuntime,
  prepareFastReplay,
  type FastReplayRuntime,
} from './fastReplay'
import {
  createFastReplayCheckpointKey,
  FastReplayCheckpointStore,
  prewarmFastReplayCheckpoints,
  reconstructFastReplayWithCheckpoints,
} from './fastReplayCheckpoints'

const STATEFUL_PATTERN = `
var phase = 0
var sample = 0
export function beforeRender(delta) {
  phase = phase + delta / 1000
  sample = random(1)
}
export function render(index) {
  rgb(sample, phase % 1, index / pixelCount)
}
`

function lineMap(pixelCount: number) {
  return Array.from({ length: pixelCount }, (_, index) => ({
    sample: [pixelCount === 1 ? 0 : index / (pixelCount - 1)],
  }))
}

function replayFixture() {
  const prepared = prepareFastReplay(STATEFUL_PATTERN, {})
  const runtimeOptions = { mapPoints: lineMap(4), randomSeed: 842 }
  const createRuntime = () => createFastReplayRuntime(prepared, runtimeOptions)
  const coldSeek = (targetMs: number, advance: { stepMs: number; temporalFeedbackSeek?: 'exact' | 'clear-at-target' }) => {
    const runtime = createRuntime()
    runtime.renderCurrentFrame()
    return runtime.advanceTo(targetMs, advance)
  }
  return { prepared, runtimeOptions, createRuntime, coldSeek }
}

describe('Fast replay checkpoint policy (#842)', () => {
  it('keys checkpoints by every deterministic trajectory input', () => {
    const artifact = {}
    const mapPoints = {}
    const baseline = {
      artifactIdentity: artifact,
      mapPointsIdentity: mapPoints,
      randomSeed: 842,
      fidelity: 'fast' as const,
      stepMs: 1000 / 60,
      temporalFeedbackSeek: 'clear-at-target' as const,
    }

    expect(createFastReplayCheckpointKey(baseline)).toBe(createFastReplayCheckpointKey({ ...baseline }))
    expect(new Set([
      createFastReplayCheckpointKey(baseline),
      createFastReplayCheckpointKey({ ...baseline, artifactIdentity: {} }),
      createFastReplayCheckpointKey({ ...baseline, mapPointsIdentity: {} }),
      createFastReplayCheckpointKey({ ...baseline, randomSeed: 843 }),
      createFastReplayCheckpointKey({ ...baseline, fidelity: 'fidelity' }),
      createFastReplayCheckpointKey({ ...baseline, stepMs: 20 }),
      createFastReplayCheckpointKey({ ...baseline, temporalFeedbackSeek: 'exact' }),
    ])).toHaveLength(7)
  })

  it('misses the cache when a Show edit produces a different artifact identity', () => {
    const { createRuntime } = replayFixture()
    const mapPointsIdentity = {}
    const keyParts = {
      artifactIdentity: {},
      mapPointsIdentity,
      randomSeed: 842,
      fidelity: 'fast' as const,
      stepMs: 1000 / 60,
      temporalFeedbackSeek: 'clear-at-target' as const,
    }
    const beforeEdit = createFastReplayCheckpointKey(keyParts)
    const afterEdit = createFastReplayCheckpointKey({ ...keyParts, artifactIdentity: {} })
    const runtime = createRuntime()
    runtime.advanceTo(2_000, { stepMs: 100 })
    const store = new FastReplayCheckpointStore<string>()
    store.capture(beforeEdit, runtime.snapshot())

    expect(store.nearestAtOrBefore(beforeEdit, 2_000)?.elapsedMs).toBe(2_000)
    expect(store.nearestAtOrBefore(afterEdit, 2_000)).toBeNull()
  })

  it('captures crossed replay time every two seconds without checkpointing the final target', async () => {
    const { createRuntime } = replayFixture()
    const store = new FastReplayCheckpointStore<string>()
    const runtime = createRuntime()
    runtime.renderCurrentFrame()

    const result = await advanceFastReplayCooperatively(runtime, 6_500, {
      stepMs: 100,
      chunkMs: 750,
      isCurrent: () => true,
      yieldControl: async () => undefined,
      checkpointing: store.cooperativeHooks('trajectory'),
    })

    expect(result?.elapsedMs).toBe(6_500)
    expect(store.checkpointTimes('trajectory')).toEqual([2_000, 4_000, 6_000])
  })

  it('widens future capture spacing when a snapshot is unusually large', () => {
    const { createRuntime } = replayFixture()
    const runtime = createRuntime()
    runtime.advanceTo(2_000, { stepMs: 100 })
    const snapshot = runtime.snapshot()
    snapshot.runtimeState.large = Array.from({ length: 1_000 }, (_, index) => index)
    const store = new FastReplayCheckpointStore<string>({ targetSnapshotBytes: 1_024 })

    store.capture('large', snapshot)

    expect(store.nextCaptureAt('large', 2_000)).toBeGreaterThan(4_000)
  })

  it('selects the nearest checkpoint at or before the target and evicts globally oldest entries', () => {
    const { createRuntime } = replayFixture()
    const runtime = createRuntime()
    const store = new FastReplayCheckpointStore<string>({ maxCheckpoints: 3 })
    for (const [key, elapsedMs] of [
      ['edited-artifact', 2_000],
      ['current-artifact', 2_000],
      ['current-artifact', 4_000],
      ['current-artifact', 6_000],
    ] as const) {
      runtime.advanceTo(elapsedMs, { stepMs: 100 })
      store.capture(key, runtime.snapshot())
    }

    expect(store.nearestAtOrBefore('edited-artifact', 8_000)).toBeNull()
    expect(store.nearestAtOrBefore('current-artifact', 5_500)?.elapsedMs).toBe(4_000)
    expect(store.nearestAtOrBefore('current-artifact', 1_999)).toBeNull()
    expect(store.size).toBe(3)
  })
})

describe('Fast replay checkpoint reconstruction (#842)', () => {
  const advance = {
    stepMs: 100,
    chunkMs: 750,
    temporalFeedbackSeek: 'clear-at-target' as const,
  }

  it('is checksum-identical for cold, warm-forward, and warm-backward seeks', async () => {
    const { createRuntime, coldSeek } = replayFixture()
    const store = new FastReplayCheckpointStore<string>()
    const cold = await reconstructFastReplayWithCheckpoints({
      key: 'trajectory', store, createRuntime, targetMs: 6_500, advance,
      isCurrent: () => true, yieldControl: async () => undefined,
    })
    const warmBackward = await reconstructFastReplayWithCheckpoints({
      key: 'trajectory', store, createRuntime, existingRuntime: cold!.runtime,
      targetMs: 3_500, advance, isCurrent: () => true, yieldControl: async () => undefined,
    })
    const warmForward = await reconstructFastReplayWithCheckpoints({
      key: 'trajectory', store, createRuntime, existingRuntime: warmBackward!.runtime,
      targetMs: 5_500, advance, isCurrent: () => true, yieldControl: async () => undefined,
    })
    const expectedBackward = coldSeek(3_500, advance)
    const expectedForward = coldSeek(5_500, advance)

    expect(cold?.restoredFromMs).toBeNull()
    expect(warmBackward?.restoredFromMs).toBe(2_000)
    expect(warmForward?.restoredFromMs).toBe(4_000)
    expect(warmBackward?.result.checksum).toBe(expectedBackward.checksum)
    expect(warmForward?.result.checksum).toBe(expectedForward.checksum)
  })

  it.each(['fast', 'fidelity'] as const)(
    'preserves complete %s state across state-pure cold, warm-forward, and warm-backward seeks (#847)',
    async (fidelity) => {
      const bundled = prepareFastReplay(STATEFUL_PATTERN, {})
      const prepared = {
        ...bundled,
        metadata: {
          ...bundled.metadata,
          deterministicReplay: { intermediateRender: 'state-pure' as const, normalizedBindings: [] },
        },
      }
      const runtimeOptions = { mapPoints: lineMap(4), randomSeed: 847, fidelity }
      const createRuntime = () => createFastReplayRuntime(prepared, runtimeOptions)
      const fullRenderAt = (targetMs: number) => {
        const runtime = createFastReplayRuntime(prepared, runtimeOptions)
        runtime.renderCurrentFrame()
        runtime.advanceTo(targetMs, { ...advance, forceFullIntermediateRender: true })
        return runtime
      }
      const store = new FastReplayCheckpointStore<string>()

      const cold = await reconstructFastReplayWithCheckpoints({
        key: 'state-pure', store, createRuntime, targetMs: 6_500, advance,
        isCurrent: () => true, yieldControl: async () => undefined,
      })
      const coldSnapshot = cold!.runtime.snapshot()
      const warmBackward = await reconstructFastReplayWithCheckpoints({
        key: 'state-pure', store, createRuntime, existingRuntime: cold!.runtime,
        targetMs: 3_500, advance, isCurrent: () => true, yieldControl: async () => undefined,
      })
      const warmBackwardSnapshot = warmBackward!.runtime.snapshot()
      const warmForward = await reconstructFastReplayWithCheckpoints({
        key: 'state-pure', store, createRuntime, existingRuntime: warmBackward!.runtime,
        targetMs: 5_500, advance, isCurrent: () => true, yieldControl: async () => undefined,
      })
      const warmForwardSnapshot = warmForward!.runtime.snapshot()

      expect(coldSnapshot).toEqual(fullRenderAt(6_500).snapshot())
      expect(warmBackwardSnapshot).toEqual(fullRenderAt(3_500).snapshot())
      expect(warmForwardSnapshot).toEqual(fullRenderAt(5_500).snapshot())
      expect(cold?.result.outerRendererCalls).toBe(8)
      expect(warmBackward?.result.outerRendererCalls).toBe(4)
      expect(warmForward?.result.outerRendererCalls).toBe(4)
    },
  )

  it('remains checksum-identical after the trajectory checkpoints are evicted', async () => {
    const { createRuntime } = replayFixture()
    const store = new FastReplayCheckpointStore<string>({ maxCheckpoints: 2 })
    const initial = await reconstructFastReplayWithCheckpoints({
      key: 'trajectory', store, createRuntime, targetMs: 5_500, advance,
      isCurrent: () => true, yieldControl: async () => undefined,
    })
    const otherRuntime = createRuntime()
    otherRuntime.advanceTo(2_000, advance)
    store.capture('other-a', otherRuntime.snapshot())
    otherRuntime.advanceTo(4_000, advance)
    store.capture('other-b', otherRuntime.snapshot())

    expect(store.nearestAtOrBefore('trajectory', 5_500)).toBeNull()
    const afterEviction = await reconstructFastReplayWithCheckpoints({
      key: 'trajectory', store, createRuntime, targetMs: 5_500, advance,
      isCurrent: () => true, yieldControl: async () => undefined,
    })
    expect(afterEviction?.restoredFromMs).toBeNull()
    expect(afterEviction?.result.checksum).toBe(initial?.result.checksum)
  })

  it('keeps checkpoints reached before cancellation coherent', async () => {
    const { createRuntime, coldSeek } = replayFixture()
    const store = new FastReplayCheckpointStore<string>()
    let current = true
    let runtime: FastReplayRuntime | undefined

    const cancelled = await reconstructFastReplayWithCheckpoints({
      key: 'trajectory', store,
      createRuntime: () => {
        runtime = createRuntime()
        return runtime
      },
      targetMs: 6_500,
      advance: { ...advance, chunkMs: 2_000 },
      isCurrent: () => current,
      yieldControl: async () => { current = false },
    })

    expect(cancelled).toBeNull()
    expect(runtime!.getElapsedMs()).toBe(2_000)
    expect(store.checkpointTimes('trajectory')).toEqual([2_000])
    const resumed = await reconstructFastReplayWithCheckpoints({
      key: 'trajectory', store, createRuntime, targetMs: 3_500, advance,
      isCurrent: () => true, yieldControl: async () => undefined,
    })
    expect(resumed?.restoredFromMs).toBe(2_000)
    expect(resumed?.result.checksum).toBe(coldSeek(3_500, advance).checksum)
  })

  it('falls back to a cold replay when snapshot capture or restore fails', async () => {
    const { createRuntime, coldSeek } = replayFixture()
    const captureStore = new FastReplayCheckpointStore<string>()
    let creations = 0
    const captureFailure = await reconstructFastReplayWithCheckpoints({
      key: 'capture-failure',
      store: captureStore,
      createRuntime: () => {
        creations += 1
        const runtime = createRuntime()
        if (creations === 1) runtime.snapshot = () => { throw new Error('snapshot failed') }
        return runtime
      },
      targetMs: 3_500,
      advance,
      isCurrent: () => true,
      yieldControl: async () => undefined,
    })

    const restoreStore = new FastReplayCheckpointStore<string>()
    const source = createRuntime()
    source.advanceTo(2_000, advance)
    restoreStore.capture('restore-failure', source.snapshot())
    const poisoned = createRuntime()
    poisoned.restore = () => { throw new Error('restore failed') }
    const restoreFailure = await reconstructFastReplayWithCheckpoints({
      key: 'restore-failure', store: restoreStore, createRuntime, existingRuntime: poisoned,
      targetMs: 3_500, advance, isCurrent: () => true, yieldControl: async () => undefined,
    })
    const expected = coldSeek(3_500, advance)

    expect(creations).toBe(2)
    expect(captureFailure?.restoredFromMs).toBeNull()
    expect(captureFailure?.result.checksum).toBe(expected.checksum)
    expect(restoreFailure?.restoredFromMs).toBeNull()
    expect(restoreFailure?.result.checksum).toBe(expected.checksum)
    expect(restoreStore.nearestAtOrBefore('restore-failure', 3_500)).toBeNull()
  })
})

describe('Fast replay checkpoint pre-warm (#843)', () => {
  const advance = {
    stepMs: 100,
    chunkMs: 750,
    temporalFeedbackSeek: 'clear-at-target' as const,
  }

  it('populates the complete loop headlessly and skips work once coverage is complete', async () => {
    const { createRuntime: createFixtureRuntime } = replayFixture()
    const store = new FastReplayCheckpointStore<string>()
    const presentedTargets: boolean[] = []
    let creations = 0
    const createRuntime = () => {
      creations += 1
      const runtime = createFixtureRuntime()
      const advanceTo = runtime.advanceTo.bind(runtime)
      runtime.advanceTo = (targetMs, options) => {
        presentedTargets.push(options.presentTargetFrame !== false)
        return advanceTo(targetMs, options)
      }
      return runtime
    }

    const populated = await prewarmFastReplayCheckpoints({
      key: 'trajectory',
      store,
      createRuntime,
      durationMs: 6_000,
      advance,
      isCurrent: () => true,
      yieldControl: async () => undefined,
    })
    const covered = await prewarmFastReplayCheckpoints({
      key: 'trajectory',
      store,
      createRuntime,
      durationMs: 6_000,
      advance,
      isCurrent: () => true,
      yieldControl: async () => undefined,
    })

    expect(populated).toEqual({ status: 'populated', resumedFromMs: null })
    expect(covered).toEqual({ status: 'covered', resumedFromMs: 6_000 })
    expect(store.checkpointTimes('trajectory')).toEqual([2_000, 4_000, 6_000])
    expect(creations).toBe(1)
    expect(presentedTargets.length).toBeGreaterThan(0)
    expect(presentedTargets).toEqual(presentedTargets.map(() => false))
  })

  it('resumes at the latest checkpoint before the first uncovered interval', async () => {
    const { createRuntime } = replayFixture()
    const store = new FastReplayCheckpointStore<string>()
    const source = createRuntime()
    source.advanceTo(2_000, advance)
    store.capture('trajectory', source.snapshot())
    source.advanceTo(4_000, advance)
    store.capture('trajectory', source.snapshot())
    let resumedRuntime: FastReplayRuntime | null = null

    const result = await prewarmFastReplayCheckpoints({
      key: 'trajectory',
      store,
      createRuntime: () => {
        resumedRuntime = createRuntime()
        return resumedRuntime
      },
      durationMs: 6_500,
      advance,
      isCurrent: () => true,
      yieldControl: async () => undefined,
    })

    expect(result).toEqual({ status: 'populated', resumedFromMs: 4_000 })
    expect(store.checkpointTimes('trajectory')).toEqual([2_000, 4_000, 6_000])
    expect(resumedRuntime!.getElapsedMs()).toBe(6_500)
  })

  it('keeps completed checkpoints coherent when a new artifact supersedes the pass', async () => {
    const { createRuntime, coldSeek } = replayFixture()
    const store = new FastReplayCheckpointStore<string>()
    let current = true

    const result = await prewarmFastReplayCheckpoints({
      key: 'old-artifact',
      store,
      createRuntime,
      durationMs: 6_500,
      advance: { ...advance, chunkMs: 2_000 },
      isCurrent: () => current,
      yieldControl: async () => { current = false },
    })

    expect(result).toBeNull()
    expect(store.checkpointTimes('old-artifact')).toEqual([2_000])
    const resumed = await reconstructFastReplayWithCheckpoints({
      key: 'old-artifact', store, createRuntime, targetMs: 3_500, advance,
      isCurrent: () => true, yieldControl: async () => undefined,
    })
    expect(resumed?.restoredFromMs).toBe(2_000)
    expect(resumed?.result.checksum).toBe(coldSeek(3_500, advance).checksum)
  })

  it('does no work after the preview closes', async () => {
    const { createRuntime: createFixtureRuntime } = replayFixture()
    const store = new FastReplayCheckpointStore<string>()
    let creations = 0

    const result = await prewarmFastReplayCheckpoints({
      key: 'closed-preview',
      store,
      createRuntime: () => {
        creations += 1
        return createFixtureRuntime()
      },
      durationMs: 6_500,
      advance,
      isCurrent: () => false,
      yieldControl: async () => undefined,
    })

    expect(result).toBeNull()
    expect(creations).toBe(0)
    expect(store.checkpointTimes('closed-preview')).toEqual([])
  })

  it('yields priority to a concurrent seek without sharing its private runtime', async () => {
    const { createRuntime, coldSeek } = replayFixture()
    const store = new FastReplayCheckpointStore<string>()
    let prewarmCurrent = true
    let releasePrewarm!: () => void
    let reportYield!: () => void
    const yielded = new Promise<void>((resolve) => { reportYield = resolve })
    const released = new Promise<void>((resolve) => { releasePrewarm = resolve })

    const prewarm = prewarmFastReplayCheckpoints({
      key: 'trajectory',
      store,
      createRuntime,
      durationMs: 6_500,
      advance: { ...advance, chunkMs: 2_000 },
      isCurrent: () => prewarmCurrent,
      yieldControl: async () => {
        reportYield()
        await released
      },
    })
    await yielded
    prewarmCurrent = false

    const seek = await reconstructFastReplayWithCheckpoints({
      key: 'trajectory', store, createRuntime, targetMs: 3_500, advance,
      isCurrent: () => true, yieldControl: async () => undefined,
    })
    releasePrewarm()

    expect(await prewarm).toBeNull()
    expect(seek?.runtime).toBeDefined()
    expect(seek?.restoredFromMs).toBe(2_000)
    expect(seek?.result.checksum).toBe(coldSeek(3_500, advance).checksum)
  })
})
