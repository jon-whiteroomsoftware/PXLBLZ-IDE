import { advanceFastReplayCooperatively, createFastReplayRuntime, prepareFastReplay } from './fastReplay'
import { fx } from './fixedpoint'
import { compileShow } from './showCompiler'

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

const TEMPORAL_FEEDBACK_PATTERN = `
var __feedback_seek = 0
var live = 0
var ready = 0
var previous = array(pixelCount)
export function beforeRender(delta) {
  live = live ? 0 : 1
  if (__feedback_seek) ready = 0
}
export function render(index) {
  var output = __feedback_seek || !ready ? live : max(live, previous[index] * 0.5)
  if (!__feedback_seek) previous[index] = output
  if (index == pixelCount - 1 && !__feedback_seek) ready = 1
  rgb(output, 0, 0)
}
`

const SNAPSHOT_STATE_PATTERN = `
var frameNumber = 0
var seeded = 0
var samples = array(3)
var nested = [[0, 0], [0, 0]]
function firstChannel() { return samples[0] }
function secondChannel() { return samples[1] }
var channels = [firstChannel, secondChannel]
export function beforeRender(delta) {
  if (!seeded) {
    prngSeed(841)
    seeded = 1
  }
  frameNumber = frameNumber + 1
  samples[0] = random(1)
  samples[1] = prng(1)
  samples[2] = samples[0] + samples[1]
  nested[frameNumber % 2][0] = samples[0]
  nested[frameNumber % 2][1] = samples[1]
  var swap = channels[0]
  channels[0] = channels[1]
  channels[1] = swap
}
export function render(index) {
  rgb(channels[0](), channels[1](), samples[2] / 2)
}
`

const SNAPSHOT_SHIM_PATTERN = `
var initialized = 0
var phase = 0
var palette = [0, 1, 0, 0, 1, 0, 0, 1]
export function beforeRender(delta) {
  if (!initialized) {
    prngSeed(404)
    setPerlinWrap(5, 7, 9)
    setPalette(palette)
    translate(0.1, 0.2)
    initialized = 1
  }
  phase = phase + random(0.1) + prng(0.1)
  rotate(0.01)
}
export function render2D(index, x, y) {
  paint(perlin(x + phase, y, 0, 3))
}
`

const SNAPSHOT_FUNCTION_PATTERN = `
var frameNumber = 0
function red() { return 1 }
function green() { return 0.25 }
var selected = red
export function beforeRender(delta) {
  frameNumber = frameNumber + 1
  if (frameNumber == 2) selected = green
}
export function render(index) { rgb(selected(), frameNumber / 10, 0) }
`

function lineMap(pixelCount: number) {
  return Array.from({ length: pixelCount }, () => ({ sample: [] as number[] }))
}

describe('Fast replay reconstruction', () => {
  it.each(['fast', 'fidelity'] as const)(
    'restores mutable library globals into a fresh %s runtime without exposing them as Pattern watcher vars',
    (fidelity) => {
      const prepared = prepareFastReplay(`
var value = 0
export function beforeRender(delta) { value = Counter.next() }
export function render(index) { rgb(value / 4, 0, 0) }
`, {
        Counter: `
var count
function next() {
  if (!count) count = 0
  count = count + 1
  return count
}
`,
      })
      const options = { mapPoints: lineMap(1), randomSeed: 841, fidelity }
      const source = createFastReplayRuntime(prepared, options)
      source.advanceTo(10, { stepMs: 10 })
      const snapshot = source.snapshot()
      const uninterrupted = source.advanceTo(20, { stepMs: 10 })

      const restoredRuntime = createFastReplayRuntime(prepared, options)
      restoredRuntime.restore(snapshot)
      const restored = restoredRuntime.advanceTo(20, { stepMs: 10 })

      expect(prepared.metadata.patternVars).toEqual(['value'])
      expect(prepared.metadata.runtimeVars).toEqual(['count', 'value'])
      expect(restored.checksum).toBe(uninterrupted.checksum)
      expect(restored.exports).toEqual(uninterrupted.exports)
      expect('count' in restored.exports).toBe(false)
    },
  )

  it('preserves array aliases between Pattern globals in a fresh runtime', () => {
    const prepared = prepareFastReplay(`
var initialized = 0
var a = array(1)
var b = array(1)
export function beforeRender(delta) {
  if (!initialized) {
    b = a
    initialized = 1
  }
  a[0] = a[0] + 1
}
export function render(index) { rgb(b[0] / 10, 0, 0) }
`, {})
    const options = { mapPoints: lineMap(1), randomSeed: 841 }
    const source = createFastReplayRuntime(prepared, options)
    source.advanceTo(10, { stepMs: 10 })
    const snapshot = source.snapshot()
    const uninterrupted = source.advanceTo(30, { stepMs: 10 })

    const restoredRuntime = createFastReplayRuntime(prepared, options)
    restoredRuntime.restore(snapshot)
    const restored = restoredRuntime.advanceTo(30, { stepMs: 10 })

    expect(restored.exports.a).toBe(restored.exports.b)
    expect(restored.checksum).toBe(uninterrupted.checksum)
  })

  it('preserves distinct Pattern arrays when a fresh runtime initializes them as aliases', () => {
    const prepared = prepareFastReplay(`
var initialized = 0
var a = array(1)
var b = a
export function beforeRender(delta) {
  if (!initialized) {
    b = array(1)
    initialized = 1
  }
  a[0] = a[0] + 1
  b[0] = b[0] + 2
}
export function render(index) { rgb(a[0] / 10, b[0] / 10, 0) }
`, {})
    const options = { mapPoints: lineMap(1), randomSeed: 841 }
    const source = createFastReplayRuntime(prepared, options)
    source.advanceTo(10, { stepMs: 10 })
    const snapshot = source.snapshot()
    const uninterrupted = source.advanceTo(20, { stepMs: 10 })

    const restoredRuntime = createFastReplayRuntime(prepared, options)
    restoredRuntime.restore(snapshot)
    const restored = restoredRuntime.advanceTo(20, { stepMs: 10 })

    expect(restored.exports.a).not.toBe(restored.exports.b)
    expect(restored.checksum).toBe(uninterrupted.checksum)
  })

  it('preserves a plain array kind when aliased-at-init globals are distinct at snapshot', () => {
    const prepared = prepareFastReplay(`
var initialized = 0
var a = array(1)
var b = a
export var base = 0
export var fractional = 0
export function beforeRender(delta) {
  if (!initialized) {
    b = [0]
    initialized = 1
  } else {
    b[0.9] = 0.8
    base = b[0]
    fractional = b[0.9]
  }
}
export function render(index) { rgb(base, fractional, 0) }
`, {})
    const options = { mapPoints: lineMap(1), randomSeed: 841 }
    const source = createFastReplayRuntime(prepared, options)
    source.advanceTo(10, { stepMs: 10 })
    const snapshot = source.snapshot()
    const uninterrupted = source.advanceTo(20, { stepMs: 10 })

    const restoredRuntime = createFastReplayRuntime(prepared, options)
    restoredRuntime.restore(snapshot)
    const restored = restoredRuntime.advanceTo(20, { stepMs: 10 })

    expect(restored.exports.a).not.toBe(restored.exports.b)
    expect(restored.exports.base).toBe(0)
    expect(restored.exports.fractional).toBeCloseTo(0.8)
    expect(restored.checksum).toBe(uninterrupted.checksum)
  })

  it.each(['fast', 'fidelity'] as const)(
    'pins the frequencyData array captured by the Pattern factory in %s mode',
    (fidelity) => {
      const prepared = prepareFastReplay(`
var initialized = 0
var sensorView = frequencyData
var independent = frequencyData
var observed = 0
export function beforeRender(delta) {
  if (!initialized) {
    independent = [0.2]
    initialized = 1
  } else {
    observed = frequencyData[0] + independent[0]
    independent[0] = independent[0] + 0.1
  }
}
export function render(index) { rgb(observed, independent[0], 0) }
`, {})
      const options = { mapPoints: lineMap(1), randomSeed: 841, fidelity }
      const source = createFastReplayRuntime(prepared, options)
      const sourceAtSnapshot = source.advanceTo(10, { stepMs: 10 })
      const snapshot = source.snapshot()
      ;(sourceAtSnapshot.exports.sensorView as number[])[0] = fidelity === 'fidelity' ? fx.fromFloat(0.6) : 0.6
      const uninterrupted = source.advanceTo(20, { stepMs: 10 })

      const restoredRuntime = createFastReplayRuntime(prepared, options)
      restoredRuntime.restore(snapshot)
      const restoredAtSnapshot = restoredRuntime.advanceTo(10, { stepMs: 10 })
      expect(restoredAtSnapshot.exports.sensorView).not.toBe(restoredAtSnapshot.exports.independent)
      ;(restoredAtSnapshot.exports.sensorView as number[])[0] = fidelity === 'fidelity' ? fx.fromFloat(0.6) : 0.6
      const restored = restoredRuntime.advanceTo(20, { stepMs: 10 })

      expect(restored.checksum).toBe(uninterrupted.checksum)
      expect(restored.exports).toEqual(uninterrupted.exports)
    },
  )

  it.each(['fast', 'fidelity'] as const)(
    'materializes restored nested arrays with Pixelblaze semantics in %s mode',
    (fidelity) => {
      const prepared = prepareFastReplay(`
var initialized = 0
var outer = array(1)
var total = 0
export function beforeRender(delta) {
  if (!initialized) {
    outer[0] = array(2)
    outer[0][0] = 0.2
    outer[0][1] = 0.3
    initialized = 1
  } else {
    outer[0][1.9] = outer[0][1.9] + 0.1
    total = outer[0].sum()
  }
}
export function render(index) { rgb(total, 0, 0) }
`, {})
      const options = { mapPoints: lineMap(1), randomSeed: 841, fidelity }
      const source = createFastReplayRuntime(prepared, options)
      source.advanceTo(10, { stepMs: 10 })
      const snapshot = source.snapshot()
      const uninterrupted = source.advanceTo(20, { stepMs: 10 })

      const restoredRuntime = createFastReplayRuntime(prepared, options)
      restoredRuntime.restore(snapshot)
      const restored = restoredRuntime.advanceTo(20, { stepMs: 10 })

      expect(restored.exports.total).toBe(uninterrupted.exports.total)
      expect(restored.checksum).toBe(uninterrupted.checksum)
    },
  )

  it('restores a reassigned Pattern function used through its declaration binding', () => {
    const prepared = prepareFastReplay(`
var frameNumber = 0
function red() { return 1 }
function green() { return 0.25 }
export function beforeRender(delta) {
  frameNumber = frameNumber + 1
  if (frameNumber == 1) red = green
}
export function render(index) { rgb(red(), frameNumber / 10, 0) }
`, {})
    const options = { mapPoints: lineMap(1), randomSeed: 841 }
    const source = createFastReplayRuntime(prepared, options)
    source.advanceTo(10, { stepMs: 10 })
    const snapshot = source.snapshot()
    const uninterrupted = source.advanceTo(20, { stepMs: 10 })

    const restoredRuntime = createFastReplayRuntime(prepared, options)
    restoredRuntime.restore(snapshot)
    const restored = restoredRuntime.advanceTo(20, { stepMs: 10 })

    expect(restored.checksum).toBe(uninterrupted.checksum)
  })

  it('restores an original Pattern function binding after both runtimes reassign it', () => {
    const prepared = prepareFastReplay(`
var frameNumber = 0
function red() { return 1 }
function green() { return 0.25 }
export function beforeRender(delta) {
  frameNumber = frameNumber + 1
  if (frameNumber == 3) red = green
}
export function render(index) { rgb(red(), frameNumber / 10, 0) }
`, {})
    const options = { mapPoints: lineMap(1), randomSeed: 841 }
    const source = createFastReplayRuntime(prepared, options)
    source.advanceTo(10, { stepMs: 10 })
    const snapshot = source.snapshot()
    const uninterrupted = source.advanceTo(20, { stepMs: 10 })
    source.advanceTo(40, { stepMs: 10 })

    const restoredRuntime = createFastReplayRuntime(prepared, options)
    restoredRuntime.advanceTo(40, { stepMs: 10 })
    restoredRuntime.restore(snapshot)
    const restored = restoredRuntime.advanceTo(20, { stepMs: 10 })

    expect(restored.checksum).toBe(uninterrupted.checksum)
  })

  it.each(['fast', 'fidelity'] as const)(
    'restores a declaration binding reassigned to a fallback arrow in the same and fresh %s runtimes',
    (fidelity) => {
      const prepared = prepareFastReplay(`
var frameNumber = 0
function selected(value) { return value }
export function beforeRender(delta) {
  frameNumber = frameNumber + 1
  if (frameNumber == 1) selected = (value) => value + 0.5
}
export function render(index) { rgb(selected(frameNumber / 10), 0, 0) }
`, {})
      const options = { mapPoints: lineMap(1), randomSeed: 841, fidelity }
      const source = createFastReplayRuntime(prepared, options)
      source.advanceTo(10, { stepMs: 10 })
      const snapshot = source.snapshot()
      const uninterrupted = source.advanceTo(20, { stepMs: 10 })

      source.restore(snapshot)
      const sameRuntime = source.advanceTo(20, { stepMs: 10 })

      const freshRuntime = createFastReplayRuntime(prepared, options)
      freshRuntime.advanceTo(10, { stepMs: 10 })
      freshRuntime.restore(snapshot)
      const freshRestored = freshRuntime.advanceTo(20, { stepMs: 10 })

      expect(sameRuntime.checksum).toBe(uninterrupted.checksum)
      expect(freshRestored.checksum).toBe(uninterrupted.checksum)
    },
  )

  it('restores distinct Precise-mode builtin functions by registry name', () => {
    const prepared = prepareFastReplay(`
var functions = [sin, cos]
var value = 0
export function beforeRender(delta) {
  value = functions[0](0) + functions[1](0)
}
export function render(index) { rgb(value, 0, 0) }
`, {})
    const options = { mapPoints: lineMap(1), randomSeed: 841, fidelity: 'fidelity' as const }
    const source = createFastReplayRuntime(prepared, options)
    source.advanceTo(10, { stepMs: 10 })
    const snapshot = source.snapshot()
    const uninterrupted = source.advanceTo(20, { stepMs: 10 })

    const restoredRuntime = createFastReplayRuntime(prepared, options)
    restoredRuntime.restore(snapshot)
    const restored = restoredRuntime.advanceTo(20, { stepMs: 10 })

    expect(restored.exports.value).toBe(uninterrupted.exports.value)
    expect(restored.checksum).toBe(uninterrupted.checksum)
  })

  it('rejects ambiguous fallback function identities instead of silently remapping them', () => {
    const runtime = createFastReplayRuntime(prepareFastReplay(`
var functions = [(value) => value + 1, (value) => value + 1]
export function render(index) { rgb(functions[index](0), 0, 0) }
`, {}), { mapPoints: lineMap(1), randomSeed: 841 })

    expect(() => runtime.snapshot()).toThrow(/ambiguous fallback function/i)
  })

  it('restores fallback functions stored on non-index array properties', () => {
    const prepared = prepareFastReplay(`
var functions = [0]
functions[0.9] = (input) => input + 0.5
functions.label = (input) => input + 0.125
var value = 0
export function beforeRender(delta) {
  value = functions[0.9](0.25) + functions.label(0.25)
}
export function render(index) { rgb(value, 0, 0) }
`, {})
    const options = { mapPoints: lineMap(1), randomSeed: 841 }
    const source = createFastReplayRuntime(prepared, options)
    source.advanceTo(10, { stepMs: 10 })
    const snapshot = source.snapshot()
    const uninterrupted = source.advanceTo(20, { stepMs: 10 })

    const restoredRuntime = createFastReplayRuntime(prepared, options)
    restoredRuntime.restore(snapshot)
    const restored = restoredRuntime.advanceTo(20, { stepMs: 10 })

    expect(restored.exports.value).toBe(uninterrupted.exports.value)
    expect(restored.checksum).toBe(uninterrupted.checksum)
  })

  it('restores a re-created source-identical non-capturing arrow', () => {
    const prepared = prepareFastReplay(`
var frameNumber = 0
var selected = (value) => value + 0.25
var value = 0
export function beforeRender(delta) {
  frameNumber = frameNumber + 1
  if (frameNumber == 1) selected = (value) => value + 0.25
  value = selected(frameNumber / 10)
}
export function render(index) { rgb(value, 0, 0) }
`, {})
    const options = { mapPoints: lineMap(1), randomSeed: 841 }
    const source = createFastReplayRuntime(prepared, options)
    source.advanceTo(10, { stepMs: 10 })
    const snapshot = source.snapshot()
    const uninterrupted = source.advanceTo(20, { stepMs: 10 })

    const restoredRuntime = createFastReplayRuntime(prepared, options)
    restoredRuntime.restore(snapshot)
    const restored = restoredRuntime.advanceTo(20, { stepMs: 10 })

    expect(restored.exports.value).toBe(uninterrupted.exports.value)
    expect(restored.checksum).toBe(uninterrupted.checksum)
  })

  it('restores the retained setPalette reference across the Pattern and shim boundary', () => {
    const prepared = prepareFastReplay(`
var initialized = 0
var palette = [0, 1, 0, 0, 1, 0, 0, 1]
export function beforeRender(delta) {
  if (!initialized) {
    setPalette(palette)
    initialized = 1
  } else {
    palette[1] = 0
    palette[2] = 1
  }
}
export function render(index) { paint(0) }
`, {})
    const options = { mapPoints: lineMap(1), randomSeed: 841 }
    const source = createFastReplayRuntime(prepared, options)
    source.advanceTo(10, { stepMs: 10 })
    const snapshot = source.snapshot()
    const uninterrupted = source.advanceTo(20, { stepMs: 10 })

    const restoredRuntime = createFastReplayRuntime(prepared, options)
    restoredRuntime.restore(snapshot)
    const restored = restoredRuntime.advanceTo(20, { stepMs: 10 })

    expect(restored.exports.palette).toEqual(uninterrupted.exports.palette)
    expect(restored.checksum).toBe(uninterrupted.checksum)
  })

  it('restores complete replay state into the originating runtime', () => {
    const prepared = prepareFastReplay(SNAPSHOT_STATE_PATTERN, {})
    const runtime = createFastReplayRuntime(prepared, {
      mapPoints: lineMap(4),
      randomSeed: 841,
    })
    const atSnapshot = runtime.advanceTo(40, { stepMs: 10 })
    const samplesAtSnapshot = [...atSnapshot.exports.samples as number[]]
    const nestedAtSnapshot = (atSnapshot.exports.nested as number[][]).map(row => [...row])
    const snapshot = runtime.snapshot()
    const uninterrupted = runtime.advanceTo(100, { stepMs: 10 })

    runtime.advanceTo(140, { stepMs: 10 })
    runtime.restore(snapshot)
    const restored = runtime.advanceTo(40, { stepMs: 10 })
    const restoredSamples = [...restored.exports.samples as number[]]
    const restoredNested = (restored.exports.nested as number[][]).map(row => [...row])
    const replayed = runtime.advanceTo(100, { stepMs: 10 })

    expect(restored.elapsedMs).toBe(atSnapshot.elapsedMs)
    expect(restored.simulatedFrames).toBe(atSnapshot.simulatedFrames)
    expect(restored.checksum).toBe(atSnapshot.checksum)
    expect(restoredSamples).toEqual(samplesAtSnapshot)
    expect(restoredNested).toEqual(nestedAtSnapshot)
    expect(replayed.checksum).toBe(uninterrupted.checksum)
    expect(replayed.exports).toEqual(uninterrupted.exports)
    expect(replayed.simulatedFrames).toBe(uninterrupted.simulatedFrames)
  })

  it.each(['fast', 'fidelity'] as const)(
    'restores function-valued arrays into a fresh %s runtime without retaining the source runtime',
    (fidelity) => {
      const prepared = prepareFastReplay(SNAPSHOT_STATE_PATTERN, {})
      const options = {
        mapPoints: lineMap(4),
        randomSeed: 841,
        fidelity,
      }
      const source = createFastReplayRuntime(prepared, options)
      source.advanceTo(40, { stepMs: 10 })
      const snapshot = source.snapshot()
      source.advanceTo(140, { stepMs: 10 })

      const restoredRuntime = createFastReplayRuntime(prepared, options)
      restoredRuntime.restore(snapshot)
      const restored = restoredRuntime.advanceTo(100, { stepMs: 10 })
      const uninterrupted = createFastReplayRuntime(prepared, options).advanceTo(100, { stepMs: 10 })

      expect(restored.checksum).toBe(uninterrupted.checksum)
      expect(restored.exports.frameNumber).toBe(uninterrupted.exports.frameNumber)
      expect(restored.exports.samples).toEqual(uninterrupted.exports.samples)
      expect(restored.simulatedFrames).toBe(uninterrupted.simulatedFrames)
    },
  )

  it('maps a function-valued variable to an otherwise unreachable helper in a fresh runtime', () => {
    const prepared = prepareFastReplay(SNAPSHOT_FUNCTION_PATTERN, {})
    const options = { mapPoints: lineMap(1), randomSeed: 841 }
    const source = createFastReplayRuntime(prepared, options)
    source.advanceTo(20, { stepMs: 10 })
    const snapshot = source.snapshot()
    source.advanceTo(50, { stepMs: 10 })

    const restoredRuntime = createFastReplayRuntime(prepared, options)
    restoredRuntime.restore(snapshot)
    const restored = restoredRuntime.advanceTo(40, { stepMs: 10 })
    const uninterrupted = createFastReplayRuntime(prepared, options).advanceTo(40, { stepMs: 10 })

    expect(restored.checksum).toBe(uninterrupted.checksum)
    expect(restored.exports.frameNumber).toBe(uninterrupted.exports.frameNumber)
  })

  it.each(['fast', 'fidelity'] as const)(
    'restores shim state into a fresh %s runtime',
    (fidelity) => {
      const prepared = prepareFastReplay(SNAPSHOT_SHIM_PATTERN, {})
      const options = {
        mapPoints: Array.from({ length: 9 }, (_, index) => ({
          sample: [(index % 3) / 2, Math.floor(index / 3) / 2],
        })),
        randomSeed: 404,
        fidelity,
      }
      const source = createFastReplayRuntime(prepared, options)
      source.advanceTo(30, { stepMs: 10 })
      const snapshot = source.snapshot()
      source.advanceTo(120, { stepMs: 10 })

      const restoredRuntime = createFastReplayRuntime(prepared, options)
      restoredRuntime.restore(snapshot)
      const restored = restoredRuntime.advanceTo(90, { stepMs: 10 })
      const uninterrupted = createFastReplayRuntime(prepared, options).advanceTo(90, { stepMs: 10 })

      expect(restored.checksum).toBe(uninterrupted.checksum)
      expect(restored.exports).toEqual(uninterrupted.exports)
    },
  )

  it('keeps a held snapshot immutable while replay continues', () => {
    const runtime = createFastReplayRuntime(prepareFastReplay(SNAPSHOT_STATE_PATTERN, {}), {
      mapPoints: lineMap(4),
      randomSeed: 841,
    })
    runtime.advanceTo(40, { stepMs: 10 })
    const snapshot = runtime.snapshot()
    const heldFrame = Array.from(snapshot.frame)
    const heldSamples = [...snapshot.runtimeState.samples as number[]]
    const heldNested = (snapshot.runtimeState.nested as number[][]).map(row => [...row])
    const heldTransform = [...snapshot.shim.transform]
    const heldPalette = [...snapshot.shim.palette]

    runtime.advanceTo(140, { stepMs: 10 })
    const laterSnapshot = runtime.snapshot()

    expect(Array.from(snapshot.frame)).toEqual(heldFrame)
    expect(snapshot.runtimeState.samples).toEqual(heldSamples)
    expect(snapshot.runtimeState.nested).toEqual(heldNested)
    expect(snapshot.shim.transform).toEqual(heldTransform)
    expect(snapshot.shim.palette).toEqual(heldPalette)
    expect(snapshot.frame).not.toBe(laterSnapshot.frame)
    expect(snapshot.runtimeState.samples).not.toBe(laterSnapshot.runtimeState.samples)
    expect((snapshot.runtimeState.nested as number[][])[0]).not.toBe(
      (laterSnapshot.runtimeState.nested as number[][])[0],
    )
    expect(snapshot.shim.transform).not.toBe(laterSnapshot.shim.transform)
  })

  it('does not retain snapshot arrays after restore', () => {
    const prepared = prepareFastReplay(SNAPSHOT_STATE_PATTERN, {})
    const options = { mapPoints: lineMap(4), randomSeed: 841 }
    const source = createFastReplayRuntime(prepared, options)
    source.advanceTo(40, { stepMs: 10 })
    const snapshot = source.snapshot()
    const restoredRuntime = createFastReplayRuntime(prepared, options)
    restoredRuntime.restore(snapshot)
    const restoredBeforeMutation = restoredRuntime.snapshot()

    snapshot.frame.fill(1)
    ;(snapshot.runtimeState.samples as number[]).fill(1)
    ;(snapshot.runtimeState.nested as number[][])[0].fill(1)
    snapshot.shim.transform.fill(1)
    snapshot.shim.palette.push(1)

    const restoredAfterMutation = restoredRuntime.snapshot()
    expect(restoredAfterMutation.frame).toEqual(restoredBeforeMutation.frame)
    expect(restoredAfterMutation.runtimeState.samples).toEqual(restoredBeforeMutation.runtimeState.samples)
    expect(restoredAfterMutation.runtimeState.nested).toEqual(restoredBeforeMutation.runtimeState.nested)
    expect(restoredAfterMutation.shim.transform).toEqual(restoredBeforeMutation.shim.transform)
    expect(restoredAfterMutation.shim.palette).toEqual(restoredBeforeMutation.shim.palette)
  })

  it.each(['fast', 'fidelity'] as const)(
    'restores a %s clear-at-target temporal feedback trajectory',
    (fidelity) => {
      const bundled = prepareFastReplay(TEMPORAL_FEEDBACK_PATTERN, {})
      const prepared = {
        ...bundled,
        metadata: {
          ...bundled.metadata,
          temporalFeedback: { previewSeekModeVar: '__feedback_seek' },
        },
      }
      const options = { mapPoints: lineMap(1), randomSeed: 537, fidelity }
      const advanceHeadless = { stepMs: 10, temporalFeedbackSeek: 'clear-at-target' as const, presentTargetFrame: false }
      const advancePresented = { stepMs: 10, temporalFeedbackSeek: 'clear-at-target' as const }
      const uninterruptedRuntime = createFastReplayRuntime(prepared, options)
      uninterruptedRuntime.advanceTo(20, advanceHeadless)
      const uninterrupted = uninterruptedRuntime.advanceTo(50, advancePresented)

      const source = createFastReplayRuntime(prepared, options)
      source.advanceTo(20, advanceHeadless)
      const snapshot = source.snapshot()
      source.advanceTo(80, advancePresented)
      const restoredRuntime = createFastReplayRuntime(prepared, options)
      restoredRuntime.restore(snapshot)
      const restored = restoredRuntime.advanceTo(50, advancePresented)

      expect(restored.checksum).toBe(uninterrupted.checksum)
      expect(restored.exports).toEqual(uninterrupted.exports)
      expect(restored.simulatedFrames).toBe(uninterrupted.simulatedFrames)
    },
  )

  it('restores an array-heavy Show across a shared Pattern-slot owner boundary', () => {
    const memberSource = `
var initialPixels = pixelCount
var phase = 0
export function beforeRender(delta) { phase = phase + delta / 1000 }
export function render(index) { hsv(phase + index / pixelCount, 1, initialPixels / pixelCount) }
`
    const zones = [{ id: 'all', name: 'All', ranges: [{ start: 0, end: 7 }] }]
    const artifact = compileShow({
      masterPixelCount: 8,
      loopDurationMs: 1_200,
      clips: [{ id: 'first', source: memberSource }, { id: 'second', source: memberSource }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 600,
            placements: [{ placementId: 'first-placement', zoneName: 'All', clipId: 'first' }],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 600,
            placements: [{ placementId: 'second-placement', zoneName: 'All', clipId: 'second' }],
          },
        ],
      },
    }, {}, { patternSlotSharing: 'force' })
    expect(artifact.summary.specializations.patternSlots?.selected).toBe(true)
    const prepared = {
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 1 as const,
    }
    const options = { mapPoints: lineMap(8), randomSeed: 841 }
    const source = createFastReplayRuntime(prepared, options)
    source.advanceTo(400, { stepMs: 100 })
    const snapshot = source.snapshot()
    source.advanceTo(1_200, { stepMs: 100 })

    const restoredRuntime = createFastReplayRuntime(prepared, options)
    restoredRuntime.restore(snapshot)
    const restored = restoredRuntime.advanceTo(1_000, { stepMs: 100 })
    const uninterrupted = createFastReplayRuntime(prepared, options).advanceTo(1_000, { stepMs: 100 })

    expect(restored.checksum).toBe(uninterrupted.checksum)
    expect(restored.exports).toEqual(uninterrupted.exports)
    expect(restored.simulatedFrames).toBe(uninterrupted.simulatedFrames)
  })

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

  it('agrees between Fast and Precise across a soft aperture band (#591)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 24 }] }]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 1_000,
          placements: [
            { zoneName: 'main', clipId: 'red', stackOrder: 0 },
            {
              placementId: 'blue-placement',
              zoneName: 'main',
              clipId: 'blue',
              stackOrder: 1,
              viewport: { enabled: true, x: 0, y: 0, width: 0.5, height: 1, aperture: 'ellipse', feather: 0.1 },
            },
          ],
          transitionOut: { kind: 'cut' as const, durationMs: 0 },
        }, {
          holdMs: 1_000,
          placements: [{ zoneName: 'main', clipId: 'red' }],
        }],
      },
      loopDurationMs: 2_000,
    }, {})
    const prepared = prepareFastReplay(artifact.code, {})
    const mapPoints = Array.from({ length: 25 }, (_, index) => ({
      sample: [(index % 5) / 4, Math.floor(index / 5) / 4],
    }))
    const options = { mapPoints, randomSeed: 412 }

    const fast = createFastReplayRuntime(prepared, options).renderCurrentFrame()
    const precise = createFastReplayRuntime(prepared, { ...options, fidelity: 'fidelity' }).renderCurrentFrame()

    // The frame crosses fully-inside, band-interior, and fully-outside pixels;
    // the 16.16 emulation must land within fixed-point resolution everywhere,
    // including the fractional band values.
    expect(fast.pixels).toHaveLength(25)
    const bandPixels = fast.pixels.filter(([r]) => r > 0.05 && r < 0.95)
    expect(bandPixels.length).toBeGreaterThan(0)
    fast.pixels.forEach((pixel, index) => {
      pixel.forEach((channel, plane) => {
        expect(precise.pixels[index][plane]).toBeCloseTo(channel, 2)
      })
    })
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

  it.each(['fast', 'fidelity'] as const)(
    'skips only intermediate renderer traversals for a compiler-proven %s Show (#847)',
    (fidelity) => {
      const artifact = compileShow({
        masterPixelCount: 4,
        clips: [{
          id: 'safe',
          source: `
var phase = 0
export function beforeRender(delta) { phase = phase + delta / 1000 }
export function render(index) { rgb(phase, index / pixelCount, 0) }
`,
        }],
      }, {})
      expect(artifact.metadata.deterministicReplay).toEqual({ intermediateRender: 'state-pure' })
      const fullRenderMetadata = structuredClone(artifact.metadata)
      delete fullRenderMetadata.deterministicReplay
      const options = { mapPoints: lineMap(4), randomSeed: 847, fidelity }
      const optimizedRuntime = createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: 1,
      }, options)
      const fullRenderRuntime = createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: fullRenderMetadata,
        dimension: 1,
      }, options)

      const optimized = optimizedRuntime.advanceTo(50, { stepMs: 10 })
      const fullRender = fullRenderRuntime.advanceTo(50, { stepMs: 10 })

      expect(optimized.simulatedFrames).toBe(5)
      expect(optimized.outerRendererCalls).toBe(4)
      expect(fullRender.outerRendererCalls).toBe(20)
      expect(optimized.checksum).toBe(fullRender.checksum)
      expect(optimizedRuntime.snapshot()).toEqual(fullRenderRuntime.snapshot())
    },
  )

  it.each([
    {
      label: '2D',
      dimension: 2 as const,
      source: 'export function render2D(index, x, y) { rgb(x, y, index / pixelCount) }',
      mapPoints: [
        { sample: [0, 0] }, { sample: [1, 0] },
        { sample: [0, 1] }, { sample: [1, 1] },
      ],
    },
    {
      label: '3D-adapted',
      dimension: 3 as const,
      source: `
rotateY(PI / 4)
export function render2D(index, x, y) { rgb(x, y, index / pixelCount) }
`,
      mapPoints: [
        { sample: [0, 0, 0] }, { sample: [1, 0, 0] },
        { sample: [0, 1, 1] }, { sample: [1, 1, 1] },
      ],
    },
  ])('preserves complete $label target state while skipping intermediate traversals (#847)', ({
    dimension,
    source,
    mapPoints,
  }) => {
    const artifact = compileShow({ masterPixelCount: 4, clips: [{ id: 'safe', source }] }, {})
    expect(artifact.metadata.deterministicReplay).toEqual({ intermediateRender: 'state-pure' })
    const fullRenderMetadata = structuredClone(artifact.metadata)
    delete fullRenderMetadata.deterministicReplay
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const options = { mapPoints, randomSeed: 847, fidelity }
      const optimizedRuntime = createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension,
      }, options)
      const fullRenderRuntime = createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: fullRenderMetadata,
        dimension,
      }, options)

      const optimized = optimizedRuntime.advanceTo(50, { stepMs: 10 })
      const fullRender = fullRenderRuntime.advanceTo(50, { stepMs: 10 })

      expect(optimized.outerRendererCalls).toBe(4)
      expect(fullRender.outerRendererCalls).toBe(20)
      expect(optimized.checksum).toBe(fullRender.checksum)
      expect(optimizedRuntime.snapshot()).toEqual(fullRenderRuntime.snapshot())
    }
  })

  it.each([
    ['scalar mutation', 'var calls = 0\nexport function render(index) { calls += 1; rgb(calls, 0, 0) }'],
    ['array mutation', 'var values = [0]\nexport function render(index) { values[0] += 1; rgb(values[0], 0, 0) }'],
    ['aliased array mutation', 'var values = [0]\nvar alias = values\nexport function render(index) { alias[0] += 1; rgb(alias[0], 0, 0) }'],
    ['dynamic call', 'var emitters = [rgb]\nexport function render(index) { emitters[0](index, 0, 0) }'],
  ])('keeps full deterministic replay for unproved %s (#847)', (_label, source) => {
    const artifact = compileShow({ masterPixelCount: 4, clips: [{ id: 'unsafe', source }] }, {})

    expect(artifact.metadata.deterministicReplay).toBeUndefined()
    const result = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 1,
    }, { mapPoints: lineMap(4), randomSeed: 847 }).advanceTo(50, { stepMs: 10 })
    expect(result.outerRendererCalls).toBe(20)
  })

  it('always traverses pixels during live playback for a replay-safe artifact (#847)', () => {
    const artifact = compileShow({
      masterPixelCount: 4,
      clips: [{ id: 'safe', source: 'export function render(index) { rgb(index / pixelCount, 0, 0) }' }],
    }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 1,
    }, { mapPoints: lineMap(4), randomSeed: 847 })

    expect(runtime.advanceLive(16).outerRendererCalls).toBe(4)
    expect(runtime.advanceLive(16).outerRendererCalls).toBe(8)
  })

  it('clears temporal feedback at a seek target, then resumes continuous live history (#537)', () => {
    const bundled = prepareFastReplay(TEMPORAL_FEEDBACK_PATTERN, {})
    const prepared = {
      ...bundled,
      metadata: {
        ...bundled.metadata,
        temporalFeedback: { previewSeekModeVar: '__feedback_seek' },
      },
    }
    const options = { mapPoints: lineMap(1), randomSeed: 537 }

    const exact = createFastReplayRuntime(prepared, options).advanceTo(20, { stepMs: 10 })
    const clearedRuntime = createFastReplayRuntime(prepared, options)
    const cleared = clearedRuntime.advanceTo(20, {
      stepMs: 10,
      temporalFeedbackSeek: 'clear-at-target',
    })

    expect(exact.pixels[0][0]).toBe(0.5)
    expect(cleared.pixels[0][0]).toBe(0)
    expect(clearedRuntime.advanceLive(10).pixels[0][0]).toBe(1)
    expect(clearedRuntime.advanceLive(10).pixels[0][0]).toBe(0.5)
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

  it('finishes cooperative replay at an exact fixed-step boundary (#681)', async () => {
    const prepared = prepareFastReplay(RENDER_MUTATING_PATTERN, {})
    const options = { mapPoints: lineMap(1), randomSeed: 681 }
    const targetMs = 10_000
    const stepMs = 1000 / 60
    const expected = createFastReplayRuntime(prepared, options).advanceTo(targetMs, { stepMs })
    const runtime = createFastReplayRuntime(prepared, options)
    let yields = 0

    const result = await advanceFastReplayCooperatively(runtime, targetMs, {
      stepMs,
      chunkMs: 250,
      isCurrent: () => yields < 50,
      yieldControl: async () => { yields += 1 },
    })

    expect(result).not.toBeNull()
    expect(targetMs - runtime.getElapsedMs()).toBeLessThanOrEqual(stepMs * 1e-9)
    expect(result?.checksum).toBe(expected.checksum)
    expect(result?.exports).toEqual(expected.exports)
    expect(yields).toBeLessThan(50)
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

  it('reconstructs snapshot/live cache state deterministically across segmented seeks (#516)', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'outgoing',
          source: 'export var renders = 0\nexport function render(index) { renders = renders + 1; rgb(index / pixelCount, 0, 0) }',
        },
        {
          id: 'incoming',
          source: 'export var renders = 0\nexport function render(index) { renders = renders + 1; rgb(0, 0, index / pixelCount) }',
        },
      ],
      sceneSequence: {
        scenes: [
          {
            clipId: 'outgoing',
            holdMs: 1000,
            transitionOut: {
              kind: 'crossfade',
              durationMs: 1000,
              crossfadePolicy: 'snapshot-live',
            },
          },
          { clipId: 'incoming', holdMs: 1000 },
        ],
      },
      masterPixelCount: 4,
    }, {})
    const prepared = {
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 1 as const,
    }
    const options = { mapPoints: lineMap(4), randomSeed: 516 }
    const uninterrupted = createFastReplayRuntime(prepared, options).advanceTo(1700, { stepMs: 100 })
    const segmentedRuntime = createFastReplayRuntime(prepared, options)
    segmentedRuntime.advanceTo(1200, { stepMs: 100 })
    const segmented = segmentedRuntime.advanceTo(1700, { stepMs: 100 })

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

  it('keeps state-pure replay cooperative while omitting intermediate traversals (#847)', async () => {
    const artifact = compileShow({
      masterPixelCount: 4,
      clips: [{
        id: 'safe',
        source: `
var phase = 0
export function beforeRender(delta) { phase += delta / 1000 }
export function render(index) { rgb(phase, index / pixelCount, 0) }
`,
      }],
    }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 1,
    }, { mapPoints: lineMap(4), randomSeed: 847 })
    let yields = 0

    const result = await advanceFastReplayCooperatively(runtime, 50, {
      stepMs: 10,
      chunkMs: 20,
      isCurrent: () => true,
      yieldControl: async () => { yields += 1 },
    })

    expect(yields).toBe(2)
    expect(result?.simulatedFrames).toBe(5)
    expect(result?.outerRendererCalls).toBe(4)
  })

  it('keeps temporal feedback suppressed across cooperative chunk boundaries (#537)', async () => {
    const bundled = prepareFastReplay(TEMPORAL_FEEDBACK_PATTERN, {})
    const runtime = createFastReplayRuntime({
      ...bundled,
      metadata: {
        ...bundled.metadata,
        temporalFeedback: { previewSeekModeVar: '__feedback_seek' },
      },
    }, {
      mapPoints: lineMap(1),
      randomSeed: 537,
    })

    const result = await advanceFastReplayCooperatively(runtime, 20, {
      stepMs: 10,
      chunkMs: 10,
      temporalFeedbackSeek: 'clear-at-target',
      isCurrent: () => true,
      yieldControl: async () => undefined,
    })

    expect(result?.pixels[0][0]).toBe(0)
    expect(runtime.advanceLive(10).pixels[0][0]).toBe(1)
  })
})
