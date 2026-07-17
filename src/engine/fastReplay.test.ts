import { advanceFastReplayCooperatively, createFastReplayRuntime, prepareFastReplay } from './fastReplay'

const RANDOM_PATTERN = `
var t = 0
var jitter = 0
export function beforeRender(delta) {
  t = t + delta
  jitter = random(1)
}
export function render(index) {
  rgb(jitter, (t % 1000) / 1000, index / pixelCount)
}
`

const RENDER_MUTATING_PATTERN = `
export var renderCalls = 0
export function render(index) {
  renderCalls = renderCalls + 1
  rgb(renderCalls / 100, index / pixelCount, 0)
}
`

function lineMap(pixelCount: number) {
  return Array.from({ length: pixelCount }, () => ({ sample: [] as number[] }))
}

describe('Fast replay reconstruction', () => {
  it('rebuilds the same final frame from the same source, target, and random seed', () => {
    const prepared = prepareFastReplay(RANDOM_PATTERN, {})
    const replay = () => createFastReplayRuntime(prepared, {
      mapPoints: lineMap(16),
      randomSeed: 412,
    }).advanceTo(250, { stepMs: 10 })

    expect(replay().checksum).toBe(replay().checksum)
  })

  it('renders the Show start frame without advancing virtual time (#414)', () => {
    const prepared = prepareFastReplay(RANDOM_PATTERN, {})
    const runtime = createFastReplayRuntime(prepared, {
      mapPoints: lineMap(4),
      randomSeed: 412,
    })

    const result = runtime.renderCurrentFrame()

    expect(result.elapsedMs).toBe(0)
    expect(result.pixels).toHaveLength(4)
  })

  it('runs the generated fixed-point artifact when Precise fidelity is selected (#484)', () => {
    const prepared = prepareFastReplay('export function render(index) { rgb(0.1 + 0.2, 0, 0) }', {})
    const options = { mapPoints: lineMap(1), randomSeed: 412 }

    const fast = createFastReplayRuntime(prepared, options).renderCurrentFrame()
    const precise = createFastReplayRuntime(prepared, { ...options, fidelity: 'fidelity' }).renderCurrentFrame()

    expect(fast.pixels[0][0]).not.toBe(precise.pixels[0][0])
    expect(precise.pixels[0][0]).toBeCloseTo(0.3, 4)
  })

  it('executes every intermediate per-pixel render call while rebuilding', () => {
    const prepared = prepareFastReplay(RENDER_MUTATING_PATTERN, {})
    const result = createFastReplayRuntime(prepared, {
      mapPoints: lineMap(4),
      randomSeed: 412,
    }).advanceTo(50, { stepMs: 10 })

    expect(result.simulatedFrames).toBe(5)
    expect(result.outerRendererCalls).toBe(20)
    expect(result.exports.renderCalls).toBe(20)
  })

  it('evaluates one stateful frame per live presentation while deterministic seek remains fixed-step (#508)', () => {
    const prepared = prepareFastReplay(RENDER_MUTATING_PATTERN, {})
    const options = { mapPoints: lineMap(4), randomSeed: 412 }

    const live = createFastReplayRuntime(prepared, options).advanceLive(250)
    const seek = createFastReplayRuntime(prepared, options).advanceTo(250, { stepMs: 10 })

    expect(live.elapsedMs).toBe(250)
    expect(live.simulatedFrames).toBe(1)
    expect(live.outerRendererCalls).toBe(4)
    expect(live.exports.renderCalls).toBe(4)
    expect(seek.simulatedFrames).toBe(25)
    expect(seek.outerRendererCalls).toBe(100)
  })

  it('reuses one packed RGB frame buffer across ordinary live frames (#508)', () => {
    const runtime = createFastReplayRuntime(prepareFastReplay(RENDER_MUTATING_PATTERN, {}), {
      mapPoints: lineMap(4),
      randomSeed: 412,
    })

    const first = runtime.advanceLive(16)
    const second = runtime.advanceLive(16)

    expect(first.frame).toBeInstanceOf(Float64Array)
    expect(first.frame).toHaveLength(12)
    expect(second.frame).toBe(first.frame)
  })

  it('keeps deterministic reconstruction results durable across later seeks (#508)', () => {
    const prepared = prepareFastReplay(RENDER_MUTATING_PATTERN, {})
    const runtime = createFastReplayRuntime(prepared, {
      mapPoints: [{ sample: [0] }],
      randomSeed: 508,
    })

    const first = runtime.advanceTo(10, { stepMs: 10 })
    const firstPixels = first.pixels
    const second = runtime.advanceTo(20, { stepMs: 10 })

    expect(first.frame).not.toBe(second.frame)
    expect(first.pixels).toEqual(firstPixels)
  })

  it('does not add a near-zero frame when the target is an exact fixed-step boundary', () => {
    const prepared = prepareFastReplay(RENDER_MUTATING_PATTERN, {})
    const result = createFastReplayRuntime(prepared, {
      mapPoints: lineMap(4),
      randomSeed: 412,
    }).advanceTo(15_000, { stepMs: 1000 / 60 })

    expect(result.simulatedFrames).toBe(900)
    expect(result.outerRendererCalls).toBe(3600)
  })

  it('matches uninterrupted playback when the same runtime advances in segments', () => {
    const prepared = prepareFastReplay(RANDOM_PATTERN, {})
    const options = { mapPoints: lineMap(16), randomSeed: 412 }
    const uninterrupted = createFastReplayRuntime(prepared, options).advanceTo(250, { stepMs: 10 })
    const segmentedRuntime = createFastReplayRuntime(prepared, options)
    segmentedRuntime.advanceTo(100, { stepMs: 10 })
    const segmented = segmentedRuntime.advanceTo(250, { stepMs: 10 })

    expect(segmented.checksum).toBe(uninterrupted.checksum)
    expect(segmented.exports).toEqual(uninterrupted.exports)
  })

  it('yields between replay chunks and discards work superseded by a newer seek (#414)', async () => {
    const prepared = prepareFastReplay(RENDER_MUTATING_PATTERN, {})
    const runtime = createFastReplayRuntime(prepared, {
      mapPoints: lineMap(4),
      randomSeed: 412,
    })
    let current = true
    let yields = 0

    const result = await advanceFastReplayCooperatively(runtime, 100, {
      stepMs: 10,
      chunkMs: 30,
      isCurrent: () => current,
      yieldControl: async () => {
        yields += 1
        current = false
      },
    })

    expect(result).toBeNull()
    expect(yields).toBe(1)
    expect(runtime.getElapsedMs()).toBe(30)
  })
})
