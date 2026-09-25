// Repeatable engine-side frame-budget harness for issue #508.
// Run with: npm run issue508
//
// This measures the real compiled 2,000-pixel Redline Show and its Stage mask.
// Browser presentation, WebGL upload, and React publication are measured by the
// companion Chrome pass because Node timings cannot represent those phases.

import { performance } from 'node:perf_hooks'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { nativeDimension } from '../../src/engine/loadPattern'
import { buildShowStageOccurrenceProjectionV2 } from '../../src/engine/showStagePresentationV2'
import {
  applyShowStageMaskPacked,
  createShowStageMaskPlan,
} from '../../src/engine/zonePreview'
import { SOURCE_STOCK_MAPS } from '../../src/pixelblaze/stock/maps/stockCatalogue'
import { stockShowV2ById } from '../../src/pixelblaze/stock/showsV2'
import { compileStockShowV2 } from './showV2Fixture'

interface Summary {
  mean: number
  median: number
  p95: number
  min: number
  max: number
}

function summarize(samples: number[]): Summary {
  const sorted = [...samples].sort((left, right) => left - right)
  const percentile = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
  return {
    mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    median: percentile(0.5),
    p95: percentile(0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  }
}

const frames = 180
const warmupFrames = 30
const deltaMs = 1000 / 60
const redline = stockShowV2ById('stock-show-showcase-redline-installation')
if (!redline) throw new Error('Redline Installation fixture is missing.')
const map = SOURCE_STOCK_MAPS.find((candidate) => candidate.id === 'redline-stage-2d')
if (!map) throw new Error('Redline Stage map is missing.')

const mapPoints = map.resolve(2_000)
const compileStarted = performance.now()
const artifact = compileStockShowV2(redline.id, {})
const compileMs = performance.now() - compileStarted

const runtimeStarted = performance.now()
const runtime = createFastReplayRuntime({
  code: artifact.code,
  fxCode: artifact.fxCode,
  metadata: artifact.metadata,
  dimension: nativeDimension(artifact.metadata.renderFns),
}, {
  mapPoints,
  randomSeed: 508,
  fidelity: 'fast',
})
const runtimeInitializationMs = performance.now() - runtimeStarted
// The Stage mask follows the Layout occurrence active at zero, as the v2 Stage picks it.
const initialOccurrence = redline.composition.layoutOccurrences.find((occurrence) => occurrence.startMs === 0)
if (!initialOccurrence) throw new Error('Redline has no Layout occurrence at zero.')
const projection = buildShowStageOccurrenceProjectionV2(redline, initialOccurrence.layoutId, {
  mapPoints,
  splitPosition: 0,
})
const maskPlan = createShowStageMaskPlan(projection, mapPoints.length)

let result = runtime.renderCurrentFrame()
for (let index = 0; index < warmupFrames; index += 1) result = runtime.advanceLive(deltaMs)
const frameIdentity = result.frame
const startingTicks = result.simulatedFrames

const patternMs: number[] = []
const maskMs: number[] = []
const publicationMs: number[] = []
const totalMs: number[] = []
let publishedPositionMs = result.elapsedMs
let stageMaskIdentity = true
let frameBufferStable = true

for (let index = 0; index < frames; index += 1) {
  const frameStarted = performance.now()
  result = runtime.advanceLive(deltaMs)
  const patternEnded = performance.now()
  const masked = applyShowStageMaskPacked(result.frame, maskPlan, null)
  const maskEnded = performance.now()
  publishedPositionMs = result.elapsedMs
  const publicationEnded = performance.now()

  frameBufferStable &&= result.frame === frameIdentity
  stageMaskIdentity &&= masked === result.frame
  patternMs.push(patternEnded - frameStarted)
  maskMs.push(maskEnded - patternEnded)
  publicationMs.push(publicationEnded - maskEnded)
  totalMs.push(publicationEnded - frameStarted)
}

export const report = {
  fixture: redline.id,
  pixelCount: mapPoints.length,
  frames,
  warmupFrames,
  compileMs,
  runtimeInitializationMs,
  runtimeInitializations: 1,
  simulatedTicksPerPresentedFrame: (result.simulatedFrames - startingTicks) / frames,
  frameBufferStable,
  stageMaskIdentity,
  finalPositionMs: publishedPositionMs,
  phasesMs: {
    patternEvaluation: summarize(patternMs),
    stageMask: summarize(maskMs),
    uiPublicationSeam: summarize(publicationMs),
    engineFrameTotal: summarize(totalMs),
    frameConversionAndWebglUpload: 'Chrome-only companion measurement',
  },
}

console.log(JSON.stringify(report, null, 2))
