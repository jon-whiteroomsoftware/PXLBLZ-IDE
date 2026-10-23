import { parse } from 'acorn'
import { describe, expect, it } from 'vitest'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'

type Artifact = ReturnType<typeof compileShow>
const zones = [{ id: 'all', name: 'All', ranges: [{ start: 0, end: 0 }] }]
const clockSource = 'export function render(index) { rgb(time(1), 0, 0) }'
const deliverySource = `var seconds = 0
var calls = 0
var invalid = 0
export function beforeRender(delta) {
  seconds = seconds + delta / 1000
  calls = calls + 1
  if (delta < 0 || delta > 32000) invalid = 1
}
export function render(index) { rgb(seconds / 256, calls / 16, invalid) }`

function runtime(artifact: Artifact, fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: [{ sample: [0.5, 0.5], pos: [0.5, 0.5] }], randomSeed: 1202, fidelity })
}

function rgbAt(artifact: Artifact, fidelity: 'fast' | 'fidelity', times: number[], maxStep = 500) {
  const replay = runtime(artifact, fidelity)
  let elapsed = 0
  let result = replay.advanceLive(0) // activation is boundary zero, including its zero callback
  return times.map(time => {
    while (elapsed < time) {
      const delta = Math.min(maxStep, time - elapsed)
      result = replay.advanceLive(delta)
      elapsed += delta
    }
    return [...result.pixels[0]]
  })
}

function compare(artifact: Artifact, times: number[], expected: number[][], maxStep = 500) {
  const fast = rgbAt(artifact, 'fast', times, maxStep)
  const precise = rgbAt(artifact, 'fidelity', times, maxStep)
  times.forEach((time, index) => expected[index].forEach((value, channel) => {
    expect(fast[index][channel], `Fast ${time} ms channel ${channel}`).toBeCloseTo(value, 3)
    expect(precise[index][channel], `Precise ${time} ms channel ${channel}`).toBeCloseTo(value, 3)
    expect(precise[index][channel], `parity ${time} ms channel ${channel}`).toBeCloseTo(fast[index][channel], 3)
  }))
}

function stepped(stepMs: number, timeScale = 1, source = deliverySource, deterministicLoopReset = false) {
  return compileShow({
    clips: [{ id: 'instance-a', source, adaptation: { steppedClock: { stepMs }, timeScale } }],
    loopDurationMs: deterministicLoopReset ? 2000 : 150_000, deterministicLoopReset,
    ...(deterministicLoopReset ? { zones, routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: { scenes: [{ holdMs: 2000,
        placements: [{ zoneName: 'All', clipId: 'instance-a' }] }] } } : {}),
  }, {})
}

function slotOffsets() {
  return compileShow({
    masterPixelCount: 1, loopDurationMs: 20_000, zones,
    routingLayouts: [{ id: 'default', name: 'Default', zones }],
    clips: [
      { id: 'first', source: clockSource, adaptation: { timeOffsetMs: 40_000 } },
      { id: 'second', source: clockSource, adaptation: { timeOffsetMs: 30_000 } },
    ],
    routedSceneSequence: { scenes: [
      { holdMs: 5000, placements: [{ placementId: 'first-placement', zoneName: 'All', clipId: 'first' }],
        transitionOut: { kind: 'cut', durationMs: 0 } },
      { holdMs: 15_000, placements: [{ placementId: 'second-placement', zoneName: 'All', clipId: 'second' }] },
    ] },
  }, {}, { patternSlotSharing: 'force' })
}

describe('member clocks and bounded stepped deliveries (#1202)', () => {
  it.each([40_000, 30_000])('keeps offset %i and its advancing private clock in range', offset => {
    const times = offset === 40_000 ? [1000, 20_000, 40_000] : [1000, 3000, 4000]
    const artifact = compileShow({ clips: [{ id: 'instance-a', source: clockSource,
      adaptation: { timeOffsetMs: offset } }], loopDurationMs: 100_000 }, {})
    compare(artifact, times, times.map(t => [((offset + t) / 65_536) % 1, 0, 0]))
  })

  it('initializes differing shared-slot owner offsets in seconds', () => {
    const artifact = slotOffsets()
    expect(artifact.summary.specializations.patternSlots).toMatchObject({ logicalMemberCount: 2, physicalSlotCount: 1 })
    const times = [1000, 4000, 6000, 8000, 9000]
    compare(artifact, times, times.map(t => [(t < 5000 ? 40_000 + t : 30_000 + t - 5000 + 500) / 65_536, 0, 0]))
  })

  it('holds between 40-second ticks and splits each tick into 32+8 seconds', () => {
    compare(stepped(40_000), [0, 39_999, 40_000, 40_001, 79_999, 80_000, 80_001],
      [[0, 1 / 16, 0], [0, 1 / 16, 0], [40 / 256, 3 / 16, 0], [40 / 256, 3 / 16, 0],
        [40 / 256, 3 / 16, 0], [80 / 256, 5 / 16, 0], [80 / 256, 5 / 16, 0]])
  })

  it.each([[31_999, 1], [32_000, 1], [32_001, 2]])('splits at the strict 32-second threshold: %i', (step, count) => {
    compare(stepped(step), [step - 1, step, step + 1, 2 * step - 1, 2 * step, 2 * step + 1],
      [[0, 1 / 16, 0], [step / 1000 / 256, (1 + count) / 16, 0], [step / 1000 / 256, (1 + count) / 16, 0],
        [step / 1000 / 256, (1 + count) / 16, 0], [2 * step / 1000 / 256, (1 + 2 * count) / 16, 0],
        [2 * step / 1000 / 256, (1 + 2 * count) / 16, 0]])
  })

  it('retains both 60-second ticks across bounded 30000 ms halves', () => {
    compare(stepped(60_000), [0, 59_999, 60_000, 60_001, 119_999, 120_000],
      [[0, 1 / 16, 0], [0, 1 / 16, 0], [60 / 256, 3 / 16, 0], [60 / 256, 3 / 16, 0],
        [60 / 256, 3 / 16, 0], [120 / 256, 5 / 16, 0]])
  })

  it.each([[40_000, 4, 5], [32_000, 2, 2], [32_000, 0, 1]])(
    'delivers scaled steps without trailing zero callbacks: %i scale %i', (step, scale, count) => {
      compare(stepped(step, scale), [step - 1, step, step + 1],
        [[0, 1 / 16, 0], [step / 1000 * scale / 256, (1 + count) / 16, 0],
          [step / 1000 * scale / 256, (1 + count) / 16, 0]])
    })

  it('advances private time before each split callback', () => {
    const source = `var sum = 0
var calls = 0
export function beforeRender(delta) { sum = sum + time(1); calls = calls + 1 }
export function render(index) { rgb(sum, calls / 16, time(1)) }`
    compare(stepped(40_000, 1, source), [39_999, 40_000, 40_001],
      [[0, 1 / 16, 0], [72 / 65.536, 3 / 16, 40 / 65.536], [72 / 65.536, 3 / 16, 40 / 65.536]])
  })

  it('advances a stepped private clock without a beforeRender callback', () => {
    compare(stepped(40_000, 1, clockSource), [39_999, 40_000, 40_001],
      [[0, 0, 0], [40 / 65.536, 0, 0], [40 / 65.536, 0, 0]])
  })

  it('preserves the minimum 16 ms cadence and holds', () => {
    compare(stepped(16), [0, 15, 16, 17, 31, 32, 48],
      [[0, 1 / 16, 0], [0, 1 / 16, 0], [0.016 / 256, 2 / 16, 0], [0.016 / 256, 2 / 16, 0],
        [0.016 / 256, 2 / 16, 0], [0.032 / 256, 3 / 16, 0], [0.048 / 256, 4 / 16, 0]], 16)
  })

  it('resets short deliveries and repeats across deterministic loops', () => {
    compare(stepped(1000, 1, deliverySource, true), [1999, 2000, 2001, 2999, 3000, 3999, 4000, 4001],
      [[1 / 256, 2 / 16, 0], [0, 1 / 16, 0], [0, 1 / 16, 0], [0, 1 / 16, 0],
        [1 / 256, 2 / 16, 0], [1 / 256, 2 / 16, 0], [0, 1 / 16, 0], [0, 1 / 16, 0]])
  })

  it.each([{ events: [40_250] }, { events: [40_100, 40_250] }])('resets pending portions for late Restarts $events', ({ events }) => {
    const source = `var seconds = 0
var last = 0
var invalid = 0
export function beforeRender(delta) {
  seconds = seconds + delta / 1000
  last = delta
  if (delta < 0 || delta > 500) invalid = 1
}
export function render(index) { rgb(seconds, last / 1000, invalid) }`
    const artifact = compileShow({
      clips: [{ id: 'instance-a', source }], zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: { scenes: [{ holdMs: 100_000,
        placements: [{ zoneName: 'All', clipId: 'instance-a' }] }] },
      restartEvents: events.map(atMs => ({ atMs, clipId: 'instance-a' })), loopDurationMs: 100_000,
    }, {}, { patternSlotSharing: 'none' })
    compare(artifact, [40_500, 41_000], [[0.25, 0.25, 0], [0.75, 0.5, 0]])
  })

  it('emits only representable numeric literals for offsets and long cadences', () => {
    function visit(value: unknown): void {
      if (!value || typeof value !== 'object') return
      const node = value as Record<string, unknown>
      if (node.type === 'Literal' && typeof node.value === 'number') {
        expect(Math.abs(node.value), String(node.raw)).toBeLessThan(32_768)
      }
      Object.values(node).forEach(visit)
    }
    for (const artifact of [slotOffsets(), stepped(40_000), stepped(60_000)]) {
      const ast = parse(artifact.expandedCode, { ecmaVersion: 'latest', sourceType: 'module' })
      visit(ast)
    }
  })
})
