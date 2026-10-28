// #1242: raw production-loop RGB oracle; no byte quantization or warmup.
import { createHash } from 'node:crypto'
import { parse } from 'acorn'
import { bundle } from '../../src/engine/bundle'
import { loadPattern } from '../../src/engine/loadPattern'
import { createShim, createFxShim } from '../../src/engine/shim'
import { createVirtualClock } from '../../src/engine/virtualClock'
import { createRenderLoop } from '../../src/engine/renderLoop'
import { createPlaneMap } from '../../src/engine/maps/plane'
import type { MapPoint } from '../../src/engine/maps/types'
import { SOURCE_STOCK_MAPS } from '../../src/pixelblaze/stock/maps/stockCatalogue'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { buildShowVmResourceLedger, countShowPersistentGlobals } from '../../src/engine/showVmResourceLedger'

export type Mode = 'fast' | 'precise'
type Controls = { zoom: number; thickness: number }
export const LIMIT = 2 / 255
export const MAPS = [
  { name: 'plane16x16', points: createPlaneMap({ rows: 16, cols: 16 }).resolve(256) },
  { name: 'stockPlane1024', points: SOURCE_STOCK_MAPS.find((map) => map.id === 'plane')!.resolve(1024) },
]
export interface FrameRun {
  rgb: Float64Array
  decodedT: number[]
  frameTrig: number[]
  pixelTrig: number[]
  pixelCount: number
}

export function renderFrames(
  source: string, mode: Mode, points: MapPoint[], controls: Controls | undefined,
  startT: number, frames: number,
): FrameRun {
  const { code, fxCode, metadata } = bundle(source, LIBRARIES)
  const clock = createVirtualClock()
  const config = { mapPoints: points, pixelCount: points.length, dimensions: 2 as const,
    getVirtualTime: () => clock.getTime(), randomSeed: 1242 }
  const shim = mode === 'fast' ? createShim(config) : createFxShim(config)
  let frameWork = false
  let frameCalls = 0
  let pixelCalls = 0
  for (const name of ['sin', 'cos']) {
    const original = shim.builtins[name] as (n: number) => number
    shim.builtins[name] = (n: number) => {
      if (frameWork) frameCalls++
      else pixelCalls++
      return original(n)
    }
  }
  const handle = loadPattern(mode === 'fast' ? code : fxCode, metadata, shim.builtins)
  if (!handle.setPatternVar('t', shim.encodeScalar(startT))) throw new Error('t setter unavailable')
  if (controls) {
    for (const [name, value] of [['sliderZoom', controls.zoom], ['sliderThickness', controls.thickness]] as const) {
      if (typeof handle.controls[name] !== 'function') throw new Error(`${name} unavailable`)
      handle.controls[name](shim.encodeScalar(value))
    }
  }
  const result: FrameRun = { rgb: new Float64Array(frames * points.length * 3),
    decodedT: [], frameTrig: [], pixelTrig: [], pixelCount: points.length }
  const originalBeforeRender = handle.beforeRender
  handle.beforeRender = (delta) => {
    frameWork = true
    try { originalBeforeRender(delta) } finally { frameWork = false }
    result.decodedT.push(shim.decodeScalar(handle.getExports().t as number))
  }
  let offset = 0
  const loop = createRenderLoop({ handle, shim, clock, mapPoints: points, pixelCount: points.length,
    getSpeed: () => 1, getBrightness: () => 1, isDimmed: () => false,
    onError: (error) => { throw error },
    paint(pixels) {
      for (const pixel of pixels) for (const channel of pixel) result.rgb[offset++] = channel
    },
  })
  for (let frame = 0; frame < frames; frame++) {
    frameCalls = 0
    pixelCalls = 0
    loop.tick(1000 / 60)
    result.frameTrig.push(frameCalls)
    result.pixelTrig.push(pixelCalls)
  }
  if (offset !== result.rgb.length) throw new Error('Incomplete frame output')
  return result
}

interface Witness {
  initialT: number
  frame: number
  decodedT: { before: number; after: number }
  pixel: number
  coordinate: number[]
  channel: string
  before: number[]
  after: number[]
}
export interface CaseReport {
  id: string
  group: 'default' | 'controls' | 'large-t' | 'early-out'
  mode: Mode
  map: string
  controls?: Controls
  max: number
  p99: number
  sampleCount: number
  blackPixelCount: { before: number; after: number }
  invalidChannels: number
  maxWitness: Witness | null
  outerRowWitnessCount: number
  outerRowNonblackCount: number
  trig: { before: { frame: number[]; pixel: number[] }; after: { frame: number[]; pixel: number[] }; pixelCount: number; totalPixelCount: number }
}
export interface EquivalenceReport {
  provenance: { baselineSha256: string; candidateSha256: string; baseline: string; candidate: string }
  limit: number
  cases: CaseReport[]
  costs: { before: PatternCost; after: PatternCost }
}

export function compareIridescentSources(base: string, candidate: string): EquivalenceReport {
  const cases: CaseReport[] = []
  function compare(group: CaseReport['group'], mode: Mode, map: typeof MAPS[number],
    controls: Controls | undefined, starts: number[]) {
    const row: CaseReport = { id: `${group}/${mode}/${map.name}/${controls ? `${controls.zoom},${controls.thickness}` : 'default'}`,
      group, mode, map: map.name, controls, max: 0, p99: 0, sampleCount: 0,
      blackPixelCount: { before: 0, after: 0 }, invalidChannels: 0, maxWitness: null,
      outerRowWitnessCount: 0, outerRowNonblackCount: 0,
      trig: { before: { frame: [], pixel: [] }, after: { frame: [], pixel: [] },
        pixelCount: map.points.length, totalPixelCount: starts.length * 60 * map.points.length } }
    const errors: number[] = []
    for (const initialT of starts) {
      const before = renderFrames(base, mode, map.points, controls, initialT, 60)
      const after = renderFrames(candidate, mode, map.points, controls, initialT, 60)
      for (const [key, run] of [['before', before], ['after', after]] as const) {
        row.trig[key].frame.push(...run.frameTrig)
        row.trig[key].pixel.push(...run.pixelTrig)
      }
      for (let offset = 0; offset < before.rgb.length; offset += 3) {
        const a = Array.from(before.rgb.subarray(offset, offset + 3))
        const b = Array.from(after.rgb.subarray(offset, offset + 3))
        if (a.every((v) => v === 0)) row.blackPixelCount.before++
        if (b.every((v) => v === 0)) row.blackPixelCount.after++
        const pixel = (offset / 3) % map.points.length
        const frame = Math.floor(offset / (map.points.length * 3))
        if (group === 'early-out' && [0, 1].includes(map.points[pixel].sample[1])) {
          row.outerRowWitnessCount++
          if (![...a, ...b].every((v) => v === 0)) row.outerRowNonblackCount++
        }
        for (let channel = 0; channel < 3; channel++) {
          for (const v of [a[channel], b[channel]]) {
            if (!Number.isFinite(v) || v < 0 || v > 1) row.invalidChannels++
          }
          const error = Math.abs(a[channel] - b[channel])
          errors.push(error)
          if (!row.maxWitness || error > row.max) {
            row.max = error
            row.maxWitness = { initialT, frame, decodedT: { before: before.decodedT[frame], after: after.decodedT[frame] },
              pixel, coordinate: map.points[pixel].sample, channel: ['r', 'g', 'b'][channel], before: a, after: b }
          }
        }
      }
    }
    errors.sort((a, b) => a - b)
    row.sampleCount = errors.length
    row.p99 = errors[Math.ceil(errors.length * 0.99) - 1]
    cases.push(row)
  }
  for (const mode of ['fast', 'precise'] as const) for (const map of MAPS) {
    compare('default', mode, map, undefined, [0, 7, 19])
    for (const zoom of [0, 1]) for (const thickness of [0, 1]) {
      compare('controls', mode, map, { zoom, thickness }, [0, 7, 19])
    }
  }
  for (const map of MAPS) compare('large-t', 'precise', map, undefined, [1600])
  for (const mode of ['fast', 'precise'] as const) for (const map of MAPS) {
    compare('early-out', mode, map, { zoom: 1, thickness: 0.44 }, [0])
  }
  const hash = (source: string) => createHash('sha256').update(source).digest('hex')
  return { provenance: { baselineSha256: hash(base), candidateSha256: hash(candidate),
    baseline: 'test/perf-harness/fixtures/issue1242/IridescentFibers.preedit.js',
    candidate: 'src/pixelblaze/stock/patterns/IridescentFibers.js' }, limit: LIMIT, cases,
  costs: { before: measurePatternCost(base), after: measurePatternCost(candidate) } }
}

type Ast = { type: string; [key: string]: unknown }
function nodeName(node: unknown): string | undefined {
  return node && typeof node === 'object' && 'name' in node ? String(node.name) : undefined
}
export interface PatternCost {
  sourceBytes: number
  compiledBytes: number
  persistentGlobals: number
  arrayCount: number
  elementWords: number
  arrayVmWords: number
  totalVmWords: number
  pixelDivisions: number
  pixelLoopTrigSites: number
}
export function measurePatternCost(source: string): PatternCost {
  const code = bundle(source, LIBRARIES).code
  const compiledBytes = new TextEncoder().encode(code).length
  const persistentGlobals = countShowPersistentGlobals(code)
  const ledger = buildShowVmResourceLedger({ pixelCount: 2000,
    members: [{ owner: 'IridescentFibers', source: code }], persistentGlobals, artifactBytes: compiledBytes })
  const allocations = ledger.allocations.filter((a) => a.category === 'member-pattern')
  let pixelDivisions = 0
  let pixelLoopTrigSites = 0
  function walk(value: unknown, ancestors: Ast[] = []) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { for (const child of value) walk(child, ancestors); return }
    const node = value as Ast
    const fn = ancestors.findLast((a) => a.type === 'FunctionDeclaration')
    if (fn && ['render2D', 'smooth01'].includes(nodeName(fn.id) ?? '')) {
      if ((node.type === 'BinaryExpression' || node.type === 'AssignmentExpression')
        && ['/', '/='].includes(String(node.operator))) pixelDivisions++
      if (node.type === 'CallExpression' && ['sin', 'cos'].includes(nodeName(node.callee) ?? '')
        && ancestors.some((a) => ['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForInStatement', 'ForOfStatement'].includes(a.type))) pixelLoopTrigSites++
    }
    for (const [key, child] of Object.entries(node)) if (key !== 'type') walk(child, [...ancestors, node])
  }
  walk(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }))
  return { sourceBytes: new TextEncoder().encode(source).length, compiledBytes, persistentGlobals,
    arrayCount: allocations.length, elementWords: allocations.reduce((s, a) => s + a.elementCount, 0),
    arrayVmWords: ledger.memberPatternWords, totalVmWords: ledger.totalWords, pixelDivisions, pixelLoopTrigSites }
}
