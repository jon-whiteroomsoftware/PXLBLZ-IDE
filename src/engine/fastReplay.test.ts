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
