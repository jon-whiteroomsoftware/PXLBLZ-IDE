import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect } from 'vitest'
import { bundle } from '@/engine/bundle'
import { createFastReplayRuntime } from '@/engine/fastReplay'
import { fx } from '@/engine/fixedpoint'
import { loadPattern, nativeDimension } from '@/engine/loadPattern'
import { createShim } from '@/engine/shim'
import { compileShow } from '@/engine/showCompiler'
import { prepareShowV2ForCompile } from '@/engine/showCompositionLoweringV2'
import { validateShowRecordV2, type ShowRecordV2 } from '@/engine/showCompositionV2'
import { applyShowOutputEffects, type ShowRgb } from '@/engine/showEffects'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { evaluateShowPropertyTrackV2 } from '@/engine/showPropertyAnimationV2'
import { LIBRARIES } from '@/pixelblaze/libs'
import { SOURCE_STOCK_MAPS } from './maps/stockCatalogue'
import { stockShowV2ById } from './showsV2'
import { nativeStockSourceLookupV2 } from './showsV2Compile'

export const STEPS = [1000 / 60, 1000 / 30, 125, 1000 / 7, 1000 / 6, 200]
export const SEEDS = Array.from({ length: 16 }, (_, i) => 1205 + i)
const DRIFT_ENDS = [4, 6, 8, 10, 12, 14, 16, 18].map(bar => bar * 2400)
const SNAP_ENDS = [20, 22, 24, 25, 25.5, 26, 26.5, 27].map(bar => bar * 2400)
export const HOLDS = [...new Set([
  ...[0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 19, 27, 28, 29].map(bar => (bar + 0.5) * 2400),
  ...[[48000, 52200], [52800, 57000], [57600, 59400], [60000, 60600],
    [61200, 61800], [62400, 63000], [63600, 64200]].map(([a, b]) => (a + b) / 2),
])].sort((a, b) => a - b)
export const proof: Record<string, unknown> = {
  steps: STEPS, seeds: SEEDS, holds: HOLDS, driftEnds: DRIFT_ENDS, snapEnds: SNAP_ENDS,
}

export const mod1 = (value: number) => ((value % 1) + 1) % 1
export const circularError = (actual: number, expected: number) => mod1(actual - expected + 0.5) - 0.5
export function plan(atMs: number) {
  const time = atMs % 72000
  const drifts = DRIFT_ENDS.filter(end => end <= time).length
  const snaps = SNAP_ENDS.filter(end => end <= time).length
  return { drifts, snaps, quarter: mod1((drifts + snaps) / 4), budget: Math.min(0.005 * drifts + 0.035 * snaps, 0.125) || 1e-9 }
}

export function compilePhase(record: ShowRecordV2) {
  expect(validateShowRecordV2(record)).toEqual([])
  const prepared = prepareShowV2ForCompile(record, nativeStockSourceLookupV2(record), { libraries: LIBRARIES })
  if (prepared.status !== 'ready') throw new Error(`Phase preparation refused: ${JSON.stringify(prepared.issues)}`)
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  expect(artifact.summary.resources.blockers).toEqual([])
  return artifact
}
export type PhaseArtifact = ReturnType<typeof compilePhase>
let cachedArtifact: Promise<{ artifact: PhaseArtifact; record: ShowRecordV2 }> | undefined
export function phaseArtifact() {
  return cachedArtifact ??= (async () => {
    const source = stockShowV2ById('stock-show-phase')!
    const unchanged = structuredClone(source)
    const { bundle: file } = buildShowFileBundle(source, { patterns: [], maps: [], libraries: [] }, {
      appVersion: '1205-phase', exportedAt: '2026-10-22T00:00:00.000Z',
    })
    const bytes = await serializeShowFileBundle(file)
    const reopened = await parseShowFileBundle(bytes, { acceptV2: true })
    if (reopened.version !== 2) throw new Error('Expected v2 Show export')
    const record = reopened.show
    expect(record.composition.patternInstances.map(instance => instance.id)).toEqual(['anchor', 'phaser'])
    const artifact = compilePhase(record)
    for (const name of ['__pxlblz_show_c0_phase', '__pxlblz_show_c1_phase']) {
      expect(artifact.metadata.patternVars).toContain(name)
    }
    // advanceTo itself retains intermediate rendering when the compiler has
    // not proven it state-pure. Never synthesize that capability here.
    proof.deterministicReplay = artifact.metadata.deterministicReplay ?? null
    expect(source).toEqual(unchanged)
    proof.resources = artifact.summary.resources
    if (process.env.PHASE_PROOF_OUTPUT === '1') {
      mkdirSync('.wrsp/phase', { recursive: true })
      writeFileSync('.wrsp/phase/Phase.pxlshow', bytes)
      writeFileSync('.wrsp/phase/Phase.js', artifact.code)
    }
    return { artifact, record }
  })()
}

export const plane = (count = 1936) => SOURCE_STOCK_MAPS.find(map => map.id === 'plane')!.resolve(count)
export function observe(artifact: PhaseArtifact, atMs: number, stepMs: number, fidelity: 'fast' | 'fidelity' = 'fast', count = 1936, jitterSeed?: number) {
  // A fresh runtime owns each observation. No trimmed step becomes a prefix.
  const runtime = createFastReplayRuntime({ ...artifact, dimension: nativeDimension(artifact.metadata.renderFns) }, {
    mapPoints: plane(count), randomSeed: 823, fidelity,
  })
  if (jitterSeed === undefined) runtime.advanceTo(atMs, { stepMs, presentTargetFrame: false })
  else {
    let state = jitterSeed >>> 0
    while (atMs - runtime.getElapsedMs() > 1e-8) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      const delta = 125 + state / 4294967296 * 75
      runtime.advanceTo(Math.min(atMs, runtime.getElapsedMs() + delta), { stepMs: delta, presentTargetFrame: false })
    }
  }
  const result = runtime.renderCurrentFrame()
  // Read watchers immediately; exports are a live runtime view.
  const decode = fidelity === 'fidelity' ? fx.toFloat : (value: number) => value
  const anchor = decode(Number(result.exports.__pxlblz_show_c0_phase))
  const phaser = decode(Number(result.exports.__pxlblz_show_c1_phase))
  expect(Number.isFinite(anchor) && Number.isFinite(phaser)).toBe(true)
  return { frame: result.frame, pixels: result.pixels, anchor, phaser, difference: mod1(phaser - anchor) }
}
export type Observation = ReturnType<typeof observe>
export function assertQuarter(observation: Observation, atMs: number, budget: number) {
  const error = Math.abs(circularError(observation.difference, plan(atMs).quarter))
  expect(error, JSON.stringify({ atMs, difference: observation.difference, planned: plan(atMs), error, budget })).toBeLessThanOrEqual(budget)
  return error
}

const rawSource = readFileSync(new URL('./patterns/LumaStripes.js', import.meta.url), 'utf8')
const rawArtifact = bundle(rawSource, LIBRARIES)
function rawFrame(phase: number, width: number, count: number): ShowRgb[] {
  const mapPoints = plane(count)
  const shim = createShim({ mapPoints, pixelCount: count, dimensions: 2, getVirtualTime: () => 0 })
  const handle = loadPattern(rawArtifact.code, rawArtifact.metadata, shim.builtins)
  const controls = { sliderLoopInterval: 0.24, sliderDirection: 1, sliderSpacing: 0.3333,
    sliderWidth: width, sliderFeather: 0.12, sliderLean: 0.5, sliderAngle: 0.25 }
  for (const [name, value] of Object.entries(controls)) handle.controls[name](shim.encodeScalar(value))
  handle.beforeRender(shim.encodeScalar(mod1(phase) * 2400))
  return mapPoints.map(({ sample: [x, y] }, index) => {
    handle.render2D(shim.encodeScalar(index), shim.encodeScalar(x), shim.encodeScalar(y))
    return shim.capturedPixel()
  })
}
function track(record: ShowRecordV2, id: string, atMs: number) {
  const value = evaluateShowPropertyTrackV2(record.composition.propertyTracks.find(item => item.id === id)!, atMs % 72000)
  expect(value).toBeDefined()
  return value!
}
export function reference(record: ShowRecordV2, observation: Observation, atMs: number, planned: boolean): ShowRgb[] {
  const width = track(record, 'width-anchor', atMs)
  const anchor = rawFrame(observation.anchor, width, observation.pixels.length)
  const phaser = rawFrame(observation.anchor + (planned ? plan(atMs).quarter : observation.difference), width, observation.pixels.length)
  const amount = track(record, 'phaser-white', atMs)
  const visible = atMs % 72000 >= 4800 && atMs % 72000 < 69600
  const tint = (highlightR: number, highlightG: number, highlightB: number, amount = 1) => ({
    id: 'tint', kind: 'color-map' as const, amount, shadowR: 0, shadowG: 0, shadowB: 0, highlightR, highlightG, highlightB,
  })
  return anchor.map((raw, index) => {
    const a = applyShowOutputEffects([tint(0.09, 0.25, 1)], raw).color
    if (!visible) return a
    const p = applyShowOutputEffects([tint(1, 0.54, 0, amount), { id: 'key', kind: 'luma-key', target: 0, tolerance: 0.05, softness: 0.1 }], phaser[index])
    return a.map((channel, c) => channel * (1 - p.opacity) + p.color[c] * p.opacity) as ShowRgb
  })
}
export const cobaltCount = (pixels: readonly ShowRgb[]) => pixels.filter(([r, g, b]) => Math.max(r, g, b) >= 0.15 && b > r).length
export const cobaltShare = (pixels: readonly ShowRgb[]) => cobaltCount(pixels) / pixels.length
export function assertCoverage(record: ShowRecordV2, observation: Observation, atMs: number, planned: boolean) {
  const expected = reference(record, observation, atMs, planned)
  // Compare integer pixel counts: subtracting two shares can put an exact
  // one-column difference a floating-point ulp above the same column budget.
  const pixelDifference = Math.abs(cobaltCount(observation.pixels) - cobaltCount(expected))
  const residual = pixelDifference / expected.length
  expect(pixelDifference, JSON.stringify({ atMs, residual, actual: cobaltShare(observation.pixels), reference: cobaltShare(expected) })).toBeLessThanOrEqual(Math.sqrt(expected.length))
  // Cuts must leave the anchor itself, including its black field, intact.
  if (atMs % 72000 < 4800 || atMs % 72000 >= 69600) {
    expect(Math.max(...observation.frame.map((channel, index) => Math.abs(channel - expected[Math.floor(index / 3)][index % 3])))).toBeLessThanOrEqual(0.002)
  }
  return residual
}
export function saveProof() {
  if (process.env.PHASE_PROOF_OUTPUT === '1') {
    mkdirSync('.wrsp/phase', { recursive: true })
    writeFileSync('.wrsp/phase/phase-proof.json', `${JSON.stringify(proof, null, 2)}\n`)
  }
}
