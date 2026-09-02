// Emulator drift table for the #927 spike: baseline vs 1D lerp vs 2D block
// hold per member and K, written beside the ladder so the results doc can
// cite it. Fast mode, 12 frames, the fixture's full 2,000 px index domain.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareVisualDrift } from './benchCore'
import { issue927Candidates } from './issue927'

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
        evaluationsPerPixel: candidate.variant === 'lerp-1d' ? 1 / candidate.k : 1 / (candidate.k * candidate.k),
        meanAbs: +drift.meanAbs.toFixed(3), rmse: +drift.rmse.toFixed(3), p95: drift.p95, max: drift.max, changedPct: +(drift.changedPct * 100).toFixed(2),
      })
      console.log(`${candidate.member} ${candidate.variant} x${candidate.k}: mean ${drift.meanAbs.toFixed(2)} rmse ${drift.rmse.toFixed(2)} p95 ${drift.p95} max ${drift.max} changed ${(drift.changedPct * 100).toFixed(1)}%`)
    }
    const outputPath = join(process.cwd(), 'test/perf-harness/issue927-drift.json')
    writeFileSync(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), options: OPTIONS, rows }, null, 2)}\n`)
    expect(rows.length).toBe(8)
  }, 600_000)
})
