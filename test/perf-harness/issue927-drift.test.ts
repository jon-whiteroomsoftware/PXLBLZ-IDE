// Emulator drift table for the #927 spike: baseline vs 1D lerp vs 2D block
// hold per member and K, written beside the ladder so the results doc can
// cite it. Fast mode, 12 frames, the fixture's full 2,000 px index domain.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundle } from '../../src/engine/bundle'
import { loadPattern } from '../../src/engine/loadPattern'
import { createShim } from '../../src/engine/shim'
import { compareVisualDrift } from './benchCore'
import { applyBlockHold, buildBaseArtifact, ISSUE927_HEIGHT, ISSUE927_PIXEL_COUNT, ISSUE927_WIDTH, issue927Candidates } from './issue927'

/** Member evaluations per pixel for one full frame, measured by running the
 *  artifact (the 2D wrapper exports its fill counter; the 1D lerp evaluates
 *  one lookahead per anchor plus the bootstrap, i.e. N / K + 1). */
function measuredEvaluationsPerPixel(member: 'ZippyZaps' | 'Caustics', variant: string, k: number): number {
  const N = ISSUE927_PIXEL_COUNT
  if (variant === 'lerp-1d') return (Math.ceil(N / k) + 1) / N
  // The measured candidates carry no counter; an instrumented twin of the
  // same wrapper (identical output, one global write per evaluation) counts.
  const code = applyBlockHold(buildBaseArtifact(member).code, k, ISSUE927_WIDTH, ISSUE927_HEIGHT, { countEvaluations: true }).code
  const mapPoints = Array.from({ length: N }, (_, i) => ({ sample: [(i % 50) / 49, Math.floor(i / 50) / 39] as [number, number], pos: [0, 0] as [number, number] }))
  const shim = createShim({ pixelCount: N, dimensions: 2, mapPoints, getVirtualTime: () => 250, randomSeed: 927 })
  const bundled = bundle(code, {})
  const handle = loadPattern(bundled.code, bundled.metadata, shim.builtins)
  handle.beforeRender(250)
  for (let index = 0; index < N; index += 1) handle.render2D(index, 0, 0)
  return (handle.getExports() as { __pxlblz_bh_evals: number }).__pxlblz_bh_evals / N
}

const GRID = { rows: 40, cols: 50 }
const OPTIONS = { frames: 12, warmup: 1, frameDeltaMs: 250, grid: GRID }

describe('2D block hold drift (#927 spike)', () => {
  it.skipIf(process.env.ISSUE927_DRIFT !== '1')('writes the drift table', () => {
    const candidates = issue927Candidates()
    const rows = []
    for (const candidate of candidates) {
      if (candidate.variant === 'baseline') continue
      const base = candidates.find((other) => other.member === candidate.member && other.variant === 'baseline')!
      const drift = compareVisualDrift(base.code, candidate.code, {}, 'fast', OPTIONS)
      rows.push({
        member: candidate.member, variant: candidate.variant, k: candidate.k,
        evaluationsPerPixel: +measuredEvaluationsPerPixel(candidate.member, candidate.variant, candidate.k).toFixed(4),
        meanAbs: +drift.meanAbs.toFixed(3), rmse: +drift.rmse.toFixed(3), p95: drift.p95, max: drift.max, changedPct: +(drift.changedPct * 100).toFixed(2),
      })
      console.log(`${candidate.member} ${candidate.variant} x${candidate.k}: mean ${drift.meanAbs.toFixed(2)} rmse ${drift.rmse.toFixed(2)} p95 ${drift.p95} max ${drift.max} changed ${(drift.changedPct * 100).toFixed(1)}%`)
    }
    const outputPath = join(process.cwd(), 'test/perf-harness/issue927-drift.json')
    writeFileSync(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), options: OPTIONS, rows }, null, 2)}\n`)
    expect(rows.length).toBe(12)
  }, 600_000)
})
