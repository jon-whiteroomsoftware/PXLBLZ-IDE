// #928: the generated frame-constant hoist is exact and reaches the routing
// arms wave 4 left alone. Oracle: the compiled artifact's Fast and Precise
// replay checksums with the pass on versus off, over the whole stock
// catalogue, plus the per-pixel site census as a living falsifier.
import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import type { MapPoint } from './maps/types'
import { GENERATED_FRAME_CONSTANT_PREFIX } from './showGeneratedFrameConstantHoisting'
import { compileShowForArtifact } from './showPreviewArtifact'
import { PIXELBLAZE_MAX_PERSISTENT_GLOBALS } from './showVmResourceLedger'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'

const MAP_SIDE = 16
const MAP_POINTS: MapPoint[] = Array.from({ length: MAP_SIDE * MAP_SIDE }, (_, index) => ({
  sample: [(index % MAP_SIDE) / (MAP_SIDE - 1), Math.floor(index / MAP_SIDE) / (MAP_SIDE - 1)],
}))
const CHECKSUM_TIMES_MS = [0, 2_500, 9_000, 17_500]

function compileStock(id: string, hoist: boolean) {
  const item = STOCK_SHOWS.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`missing stock Show ${id}`)
  const compiled = compileShowForArtifact(item.show, [], undefined, {}, {
    stageDimension: 2,
    generatedFrameConstantHoisting: hoist,
  })
  if (!compiled.artifact) throw new Error(`${id}: ${compiled.error}`)
  return compiled.artifact
}

function renderBody(code: string): string {
  const start = code.indexOf('export function render')
  return start >= 0 ? code.slice(start) : ''
}

function perPixelSiteCount(expandedCode: string): number {
  const body = renderBody(expandedCode)
  return (body.match(/ceil\(sqrt\(/g) ?? []).length + (body.match(/floor\(pixelCount \*/g) ?? []).length
}

function checksums(artifact: ReturnType<typeof compileStock>, fidelity: 'fast' | 'fidelity'): string[] {
  const replay = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 2,
  }, { mapPoints: MAP_POINTS, randomSeed: 928, fidelity })
  return CHECKSUM_TIMES_MS.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 250 }).checksum)
}

describe('generated frame-constant hoisting in compiled Shows (#928)', () => {
  it('moves the Portable zones route constants out of the per-pixel path and keeps both checksums', () => {
    const off = compileStock('stock-show-105-portable-zones', false)
    const on = compileStock('stock-show-105-portable-zones', true)
    expect(perPixelSiteCount(off.expandedCode)).toBeGreaterThan(0)
    expect(perPixelSiteCount(on.expandedCode)).toBe(0)
    const beforeRender = on.expandedCode.slice(
      on.expandedCode.indexOf('export function beforeRender'),
      on.expandedCode.indexOf('export function render'),
    )
    expect(beforeRender).toContain(`${GENERATED_FRAME_CONSTANT_PREFIX}0 = `)
    expect(on.code).not.toBe(off.code)
    expect(checksums(on, 'fast')).toEqual(checksums(off, 'fast'))
    expect(checksums(on, 'fidelity')).toEqual(checksums(off, 'fidelity'))
  })

  it('is exact across the stock catalogue in both preview modes and removes the census sites', () => {
    let before = 0
    let after = 0
    const residual: string[] = []
    for (const item of STOCK_SHOWS) {
      const off = compileStock(item.id, false)
      const on = compileStock(item.id, true)
      const offSites = perPixelSiteCount(off.expandedCode)
      const onSites = perPixelSiteCount(on.expandedCode)
      before += offSites
      // A Show already at the 256 persistent-global limit gets no hoists:
      // the cap keeps it artifact-clean and its sites stay per pixel.
      if (onSites > 0) {
        expect(on.summary.resources.persistentGlobals, item.id).toBe(PIXELBLAZE_MAX_PERSISTENT_GLOBALS)
        expect(on.code, item.id).toBe(off.code)
        residual.push(`${item.id}: ${onSites}/${offSites}`)
      } else {
        after += onSites
      }
      expect(checksums(on, 'fast'), item.id).toEqual(checksums(off, 'fast'))
      expect(checksums(on, 'fidelity'), item.id).toEqual(checksums(off, 'fidelity'))
    }
    // Census pinned on 2026-09-01: 286 sites by this count (189 ceil(sqrt(...))
    // plus the `floor(pixelCount *` forms) across the 40 stock Shows' render
    // bodies. Any residual is a per-pixel-written dependency or a frame-side
    // helper and is listed.
    expect(before).toBeGreaterThan(250)
    expect(after).toBe(0)
    // Pinned 2026-09-01: the Luma sources showcase sits exactly at the limit.
    expect(residual).toEqual(['stock-show-showcase-luma-sources: 8/8'])
  }, 300_000)
})
