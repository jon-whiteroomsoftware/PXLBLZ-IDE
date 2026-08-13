import { describe, expect, it } from 'vitest'
import * as acorn from 'acorn'
import { bundle } from '../../src/engine/bundle'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import { benchOne, type BenchMode } from './benchCore'

const INLINEABLE_SDF_FUNCTIONS = [
  'annular',
  'bands',
  'border',
  'capsule',
  'circle',
  'ellipse',
  'fill',
  'glow',
  'intersect',
  'offset',
  'ring',
  'softFill',
  'square',
  'subtract',
  'triangle',
  'union',
] as const

const inlinedSdfCall = new RegExp(`\\bSDF\\.inline\\.(${INLINEABLE_SDF_FUNCTIONS.join('|')})\\(`, 'g')
const inlineableSdfRuntimeFunctions = new Set(
  INLINEABLE_SDF_FUNCTIONS.map((fnName) => `_SDF_${fnName}`),
)

function ordinarySdfCallSites(source: string): { source: string; callSites: number } {
  let callSites = 0
  return {
    source: source.replace(inlinedSdfCall, (_call, fnName: string) => {
      callSites++
      return `SDF.${fnName}(`
    }),
    callSites,
  }
}

describe('Library call-site inlining measurements (#549)', () => {
  it('compiles every stock SDF inline candidate and reports its artifact trade', () => {
    const candidates = Object.entries(DEMOS).flatMap(([name, source]) => {
      const ordinarySource = ordinarySdfCallSites(source)
      if (ordinarySource.callSites === 0) return []
      const ordinary = bundle(ordinarySource.source, LIBRARIES)
      const inlined = bundle(source, LIBRARIES)
      const {
        patternFunctions: ordinaryRuntimeFunctions = [],
        ...ordinaryNonFunctionMetadata
      } = ordinary.metadata
      const {
        patternFunctions: inlinedRuntimeFunctions = [],
        ...inlinedNonFunctionMetadata
      } = inlined.metadata
      return [{
        name,
        callSites: ordinarySource.callSites,
        ordinaryBytes: ordinary.code.length,
        inlineBytes: inlined.code.length,
        byteDelta: inlined.code.length - ordinary.code.length,
        nonFunctionMetadataMatches:
          JSON.stringify(inlinedNonFunctionMetadata) === JSON.stringify(ordinaryNonFunctionMetadata),
        unexpectedAddedFunctions: inlinedRuntimeFunctions.filter(
          (fnName) => !ordinaryRuntimeFunctions.includes(fnName),
        ),
        unexpectedRemovedFunctions: ordinaryRuntimeFunctions.filter(
          (fnName) => !inlinedRuntimeFunctions.includes(fnName) && !inlineableSdfRuntimeFunctions.has(fnName),
        ),
        ordinarySource: ordinarySource.source,
        inlineSource: source,
      }]
    })

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((measurement) => measurement.nonFunctionMetadataMatches)).toBe(true)
    expect(candidates.every((measurement) => measurement.unexpectedAddedFunctions.length === 0)).toBe(true)
    expect(candidates.every((measurement) => measurement.unexpectedRemovedFunctions.length === 0)).toBe(true)
    expect(candidates.every((measurement) => measurement.callSites > 0)).toBe(true)

    for (const candidate of candidates) {
      for (const mode of ['fast', 'precise'] as const) {
        const options = { frames: 2, warmup: 1, grid: { rows: 40, cols: 50 } }
        const ordinary = benchOne(candidate.ordinarySource, LIBRARIES, mode, options)
        const inlined = benchOne(candidate.inlineSource, LIBRARIES, mode, options)
        expect(inlined.checksum).toBe(ordinary.checksum)
      }
    }

    if (process.env['ISSUE549_REPORT'] === '1') {
      console.table(candidates.map(({ ordinarySource: _ordinary, inlineSource: _inlined, ...measurement }) => measurement))
    }

    if (process.env['ISSUE549_TIMING'] === '1') {
      const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
      const pairedFrameMs = (ordinarySource: string, inlineSource: string, mode: BenchMode) => {
        const ordinary: number[] = []
        const inlined: number[] = []
        const run = (source: string) => benchOne(source, LIBRARIES, mode, {
          frames: 12,
          warmup: 12,
          grid: { rows: 40, cols: 50 },
        }).meanFrameMs
        for (let round = 0; round < 3; round++) {
          if (round % 2 === 0) {
            ordinary.push(run(ordinarySource))
            inlined.push(run(inlineSource))
          } else {
            inlined.push(run(inlineSource))
            ordinary.push(run(ordinarySource))
          }
        }
        return { ordinary: median(ordinary), inlined: median(inlined) }
      }
      console.table(candidates.map(({ ordinarySource, inlineSource, ...measurement }) => {
        const fast = pairedFrameMs(ordinarySource, inlineSource, 'fast')
        const precise = pairedFrameMs(ordinarySource, inlineSource, 'precise')
        return {
          ...measurement,
          fastOrdinaryMs: fast.ordinary.toFixed(3),
          fastInlineMs: fast.inlined.toFixed(3),
          fastDeltaPct: (((fast.inlined / fast.ordinary) - 1) * 100).toFixed(1),
          preciseOrdinaryMs: precise.ordinary.toFixed(3),
          preciseInlineMs: precise.inlined.toFixed(3),
          preciseDeltaPct: (((precise.inlined / precise.ordinary) - 1) * 100).toFixed(1),
        }
      }))
    }
  }, 120_000)

  it('reports Shader scratch globals retained by each stock consumer', () => {
    const shaderGlobals = new Set(['ux', 'uy', 'nx', 'ny', 'nz', 'len', 'rx', 'ry', 'rz', 'cr', 'cg', 'cb'])
    const measurements = Object.entries(DEMOS).flatMap(([name, source]) => {
      if (!/\bShader(?:\.inline)?\./.test(source)) return []
      const { code } = bundle(source, LIBRARIES)
      const program = acorn.parse(code, { ecmaVersion: 2020, sourceType: 'module' })
      const retained = program.body.flatMap((node) => (
        node.type === 'VariableDeclaration'
          ? node.declarations.flatMap((declaration) => (
              declaration.id.type === 'Identifier' && shaderGlobals.has(declaration.id.name)
                ? [declaration.id.name]
                : []
            ))
          : []
      ))
      return [{ name, retained: retained.length, eliminated: shaderGlobals.size - retained.length }]
    })

    expect(measurements.length).toBeGreaterThan(0)
    expect(measurements.every(({ retained }) => retained < shaderGlobals.size)).toBe(true)
    if (process.env['ISSUE549_REPORT'] === '1') console.table(measurements)
  })
})
