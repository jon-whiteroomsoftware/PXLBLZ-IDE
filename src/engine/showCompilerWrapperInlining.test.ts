// #929: generated wrapper inlining is exact across the stock catalogue.
// Oracle: compiled-artifact Fast and Precise replay checksums with the pass
// on versus off, plus the device compiler's acceptance (offline cache).
import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import type { MapPoint } from './maps/types'
import type { GeneratedShowArtifact } from './showCompiler'
import { compileShowForArtifact } from './showPreviewArtifact'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'

const MAP_SIDE = 16
const MAP_POINTS: MapPoint[] = Array.from({ length: MAP_SIDE * MAP_SIDE }, (_, index) => ({
  sample: [(index % MAP_SIDE) / (MAP_SIDE - 1), Math.floor(index / MAP_SIDE) / (MAP_SIDE - 1)],
}))
const CHECKSUM_TIMES_MS = [0, 2_500, 9_000, 17_500]

function compileStock(id: string, inline: boolean): GeneratedShowArtifact {
  const item = STOCK_SHOWS.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`missing stock Show ${id}`)
  const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2, generatedWrapperInlining: inline })
  if (!compiled.artifact) throw new Error(`${id}: ${compiled.error}`)
  return compiled.artifact
}

function checksums(artifact: Pick<GeneratedShowArtifact, 'code' | 'fxCode' | 'metadata'>, fidelity: 'fast' | 'fidelity'): string[] {
  const replay = createFastReplayRuntime({ code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata, dimension: 2 }, { mapPoints: MAP_POINTS, randomSeed: 929, fidelity })
  return CHECKSUM_TIMES_MS.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 250 }).checksum)
}

function wrapperCalls(expandedCode: string): number {
  return (expandedCode.match(/_emit\(\)/g) ?? []).length + (expandedCode.match(/_clear\(\)/g) ?? []).length
}

describe('generated wrapper inlining in compiled Shows (#929)', () => {
  it('folds emit and clear wrappers into the Redline steady path and keeps both checksums', () => {
    const off = compileStock('stock-show-showcase-redline-installation', false)
    const on = compileStock('stock-show-showcase-redline-installation', true)
    expect(wrapperCalls(on.expandedCode)).toBeLessThan(wrapperCalls(off.expandedCode))
    expect(on.summary.resources.persistentGlobals).toBe(off.summary.resources.persistentGlobals)
    expect(checksums(on, 'fast')).toEqual(checksums(off, 'fast'))
    expect(checksums(on, 'fidelity')).toEqual(checksums(off, 'fidelity'))
  })

  it('is exact across the stock catalogue in both preview modes', () => {
    let changed = 0
    let before = 0
    let after = 0
    for (const item of STOCK_SHOWS) {
      const off = compileStock(item.id, false)
      const on = compileStock(item.id, true)
      before += wrapperCalls(off.expandedCode)
      after += wrapperCalls(on.expandedCode)
      if (on.code !== off.code) changed += 1
      expect(on.summary.resources.blockers, item.id).toEqual([])
      expect(checksums(on, 'fast'), item.id).toEqual(checksums(off, 'fast'))
      expect(checksums(on, 'fidelity'), item.id).toEqual(checksums(off, 'fidelity'))
    }
    expect(changed).toBeGreaterThan(30)
    // Pinned 2026-09-01: 425 -> 224 emit/clear call sites across the catalogue.
    expect(after).toBeLessThan(before * 0.6)
  }, 300_000)
})
