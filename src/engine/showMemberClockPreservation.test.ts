import { describe, expect, it } from 'vitest'
import reference from '../test/fixtures/issue1202DissolveBefore.json'
import { LIBRARIES } from '../pixelblaze/libs'
import { stockShowV2ById } from '../pixelblaze/stock/showsV2'
import { nativeStockSourceLookupV2 } from '../pixelblaze/stock/showsV2Compile'
import { resolveShowV2StageMap } from '../store/showV2StageMap'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShow, type GeneratedShowArtifact } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { captureShowStageEditV2 } from './showPreparedStageV2'

const times = [0, 1500, 3000, 4250, 5500, 18500]
const record = stockShowV2ById(reference.provenance.showId)!
const prepared = prepareShowV2ForCompile(record, nativeStockSourceLookupV2(record), { libraries: LIBRARIES })
if (prepared.status !== 'ready') throw new Error('Dissolve Show failed preparation')
const candidate = compileShow(prepared.recipe, LIBRARIES)
const capture = captureShowStageEditV2(record, {
  patterns: [], libraries: [], maps: [], profiles: [],
  stageMap: resolveShowV2StageMap(record.stageMapId, []),
})
if (capture.prepared.status !== 'ready') throw new Error('Dissolve Show failed Stage capture')
const mapPoints = capture.prepared.bundle.presentation.layout.mapPoints

// WavyBands uses implicit globals. Finish and copy a complete run before
// constructing another runtime, whose top-level evaluation resets those names.
function renderSequence(artifact: Pick<GeneratedShowArtifact, 'code' | 'fxCode' | 'metadata'>) {
  const runtime = createFastReplayRuntime({
    code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: structuredClone(mapPoints), randomSeed: 1034, fidelity: 'fast' })
  return times.map(timeMs => (timeMs === 0
    ? runtime.renderCurrentFrame()
    : runtime.advanceTo(timeMs, { stepMs: 16, forceFullIntermediateRender: true })).frame.slice())
}

function expectFramesEqual(left: Float64Array[], right: Float64Array[]) {
  expect(right).toHaveLength(left.length)
  for (let sample = 0; sample < left.length; sample++) {
    expect(right[sample].length).toBe(left[sample].length)
    const mismatch = left[sample].findIndex((value, channel) => !Object.is(value, right[sample][channel]))
    expect(mismatch, `t=${times[sample]} channel=${mismatch}`).toBe(-1)
  }
}

describe('Show member clock preserves complete rendered output', () => {
  it('reference self parity', () => {
    const first = renderSequence(reference)
    expectFramesEqual(first, renderSequence(reference))
  })

  it('candidate self parity', () => {
    const first = renderSequence(candidate)
    expectFramesEqual(first, renderSequence(candidate))
  })

  it('candidate matches pre-change non-stepped reference', () => {
    const before = renderSequence(reference)
    expectFramesEqual(before, renderSequence(candidate))
  })
})
