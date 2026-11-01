// #1204 AC1-AC2: the compiled stock Show clock under Fast and Precise replay.
import { describe, expect, it } from 'vitest'
import { LIBRARIES } from '@/pixelblaze/libs'
import { compactGeneratedShowSymbols, compileShow } from '@/engine/showCompiler'
import { prepareShowV2ForCompile } from '@/engine/showCompositionLoweringV2'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { nativeStockSourceLookupV2 } from '@/pixelblaze/stock/showsV2Compile'
import { createFastReplayRuntime } from '@/engine/fastReplay'
import { nativeDimension } from '@/engine/loadPattern'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import { resolveShowV2StageMap } from '@/store/showV2StageMap'

const ID = 'stock-show-reference-property-animation'
const LOOP_MS = 48_600
const LSB = 1 / 65536
/** Distance on the loop circle: a read a few ulps either side of the loop point is one instant. */
const circular = (a: number, b: number) => { const d = Math.abs(a - b) % (LOOP_MS / 1000); return Math.min(d, LOOP_MS / 1000 - d) }

function compiled() {
  const record = stockShowV2ById(ID)!
  const prepared = prepareShowV2ForCompile(record, nativeStockSourceLookupV2(record), { libraries: LIBRARIES })
  if (prepared.status !== 'ready') throw new Error(`${ID} failed preparation`)
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const capture = captureShowStageEditV2(record, {
    patterns: [], libraries: [], maps: [], profiles: [],
    stageMap: resolveShowV2StageMap(record.stageMapId, []),
  })
  if (capture.prepared.status !== 'ready') throw new Error(`${ID} failed stage capture`)
  const clock = compactGeneratedShowSymbols(artifact.expandedCode).names.get('__pxlblz_show_elapsed_s')
  if (!clock) throw new Error('Show clock not found')
  return { artifact, mapPoints: capture.prepared.bundle.presentation.layout.mapPoints, clock }
}

const show = compiled()

function replay(fidelity: 'fast' | 'fidelity') {
  const { artifact, mapPoints, clock } = show
  const runtime = createFastReplayRuntime({
    code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints, randomSeed: 7, fidelity })
  const read = () => {
    const value = runtime.snapshot().runtimeState[clock] as number
    return fidelity === 'fidelity' ? value / 65536 : value
  }
  return { runtime, read }
}

describe('compiled Show clock (#1204)', () => {
  it('AC1: Precise reads below the 48.6 s loop point at the 48,599 ms sample', () => {
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const { runtime, read } = replay(fidelity)
      runtime.advanceTo(48_599, { stepMs: 50 })
      expect(read(), fidelity).toBeLessThan(48.6)
      expect(Math.abs(read() - 48.599), fidelity).toBeLessThanOrEqual(1.5 * LSB)
    }
  }, 120_000)

  // Oracle: the exact sum of the deltas Precise was delivered (16.16 raw ms),
  // modulo the loop. Fast is reported beside it: the gap between them is delta
  // encoding (1000/60 ms rounds by +1/3 raw), not the clock, and is measured.
  it.each([60, 30])('AC2: Precise tracks the delivered delta sum across ten loops at %d fps', (fps) => {
    const delta = 1000 / fps
    const fast = replay('fast')
    const precise = replay('fidelity')
    const loopRaw = BigInt(LOOP_MS) * 65536n
    const deltaRaw = BigInt(Math.round(delta * 65536))
    const framesPerLoop = LOOP_MS / delta
    let maxError = 0
    let maxFastGap = 0
    let frames = 0
    for (let loop = 0; loop < 10; loop++) {
      for (const fraction of [0.25, 0.5, 0.75]) samples(Math.round((loop + fraction) * framesPerLoop))
      // The last frame before the loop point and the first after it.
      samples(Math.ceil((loop + 1) * framesPerLoop) - 1)
      samples(Math.ceil((loop + 1) * framesPerLoop))
    }
    function samples(frame: number) {
      frames = frame
      // Every step is one whole frame of `delta`, so Precise was delivered frame * deltaRaw.
      fast.runtime.advanceTo(frame * delta, { stepMs: delta })
      precise.runtime.advanceTo(frame * delta, { stepMs: delta })
      const exact = Number((BigInt(frame) * deltaRaw) % loopRaw) / 65536 / 1000
      maxError = Math.max(maxError, circular(precise.read(), exact))
      maxFastGap = Math.max(maxFastGap, circular(precise.read(), fast.read()))
      expect(circular(fast.read(), (frame * delta % LOOP_MS) / 1000), `Fast frame ${frame}`).toBeLessThan(1e-9)
    }
    console.info('#1204 AC2', fps, JSON.stringify({ frames, maxErrorLsb: maxError / LSB, maxFastGapLsb: maxFastGap / LSB }))
    expect(maxError / LSB).toBeLessThanOrEqual(1.5)
  }, 600_000)
})
