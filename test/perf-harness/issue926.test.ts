import { describe, expect, it } from 'vitest'
import { parse } from 'acorn'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import type { MapPoint } from '../../src/engine/maps/types'
import { bundle } from '../../src/engine/bundle'
import { loadCachedWordCompiler } from './bytecodeOracle'
import {
  ISSUE926_FACTORS,
  applyHold,
  applyLerpHold,
  applyParityHold,
  buildBaseArtifact,
  issue926Candidates,
} from './issue926'

const SIDE = 16
const MAP_POINTS: MapPoint[] = Array.from({ length: SIDE * SIDE }, (_, index) => ({
  sample: [(index % SIDE) / (SIDE - 1), Math.floor(index / SIDE) / (SIDE - 1)],
}))

function frames(code: string, fidelity: 'fast' | 'fidelity', times = [500, 1_500]): Float64Array[] {
  const compiled = bundle(code, {})
  const replay = createFastReplayRuntime({ code: compiled.code, fxCode: compiled.fxCode, metadata: compiled.metadata, dimension: 2 }, { mapPoints: MAP_POINTS, randomSeed: 926, fidelity })
  return times.map((timeMs) => Float64Array.from(replay.advanceTo(timeMs, { stepMs: 250 }).frame))
}

describe('#926 hold variants', () => {
  it('latch every paint site and parse', () => {
    const base = buildBaseArtifact('ZippyZaps').code
    const sites = [...base.matchAll(/\brgb\(/g)].length
    for (const k of ISSUE926_FACTORS) {
      for (const wrapped of [applyHold(base, k), applyParityHold(base, k), applyLerpHold(base, k)]) {
        expect(wrapped.paintSites).toBe(sites)
        expect(() => parse(wrapped.code, { ecmaVersion: 2020, sourceType: 'module' })).not.toThrow()
      }
    }
  })

  it('hold and parity anchors are bit-identical to the baseline; lerp anchors match the baseline sample', () => {
    const base = buildBaseArtifact('Caustics').code
    const reference = frames(base, 'fast')
    const k = 4
    for (const [name, wrapped] of [['hold', applyHold(base, k)], ['parity', applyParityHold(base, k)], ['lerp', applyLerpHold(base, k)]] as const) {
      const held = frames(wrapped.code, 'fast')
      for (let f = 0; f < reference.length; f += 1) {
        expect(held[f].length, name).toBe(reference[f].length)
        for (let pixel = 0; pixel < SIDE * SIDE; pixel += 1) {
          const isAnchor = name === 'parity' ? null : pixel % k === 0
          if (isAnchor === false) continue
          if (isAnchor === null) continue
          for (let channel = 0; channel < 3; channel += 1) {
            expect(held[f][pixel * 3 + channel], `${name} frame ${f} pixel ${pixel}`).toBeCloseTo(reference[f][pixel * 3 + channel], 6)
          }
        }
      }
    }
  })

  it('held output is deterministic and identical in Fast and Precise up to fixed-point quantization of the same source', () => {
    const base = buildBaseArtifact('Caustics').code
    const wrapped = applyLerpHold(base, 2).code
    const a = frames(wrapped, 'fast')
    const b = frames(wrapped, 'fast')
    for (let f = 0; f < a.length; f += 1) expect(Array.from(a[f])).toEqual(Array.from(b[f]))
    expect(() => frames(wrapped, 'fidelity')).not.toThrow()
  })

  it('every candidate compiles with the Controller compiler', () => {
    const compiler = loadCachedWordCompiler()
    if (!compiler) return
    for (const candidate of issue926Candidates()) {
      expect(() => compiler(candidate.code), `${candidate.member} ${candidate.variant} K=${candidate.k}`).not.toThrow()
    }
  })
})
