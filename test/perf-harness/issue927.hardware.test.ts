import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { declaredOutputProfileStamp } from './controllerHardware'
import { runPairedLadder } from './controllerPairing'
import { ISSUE927_PIXEL_COUNTS, issue927Candidates } from './issue927'

// ISSUE927_HARDWARE=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue927.hardware.test.ts
const runHardware = process.env.ISSUE927_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const measurementOptions = { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: 6_000, passes: 2 }

describe('2D block hold on hardware (#927 spike)', () => {
  it.skipIf(!runHardware)('pairs baseline, 1D lerp, and 2D block hold per member and K at 256 and 500 px', async () => {
    const candidates = issue927Candidates().map((candidate) => ({ id: `${candidate.member}:${candidate.variant}:k${candidate.k}`, code: candidate.code }))
    const result = await runPairedLadder(ip, ISSUE927_PIXEL_COUNTS, candidates, measurementOptions)
    const report = {
      generatedAt: new Date().toISOString(),
      controller: { ...result.controller, outputProfile: declaredOutputProfileStamp(undefined), ...measurementOptions },
      rows: result.rows,
      partial: result.runError != null,
    }
    const outputPath = join(process.cwd(), `test/perf-harness/issue927-block-ladder${report.partial ? `.partial-${report.generatedAt.replace(/[:.]/g, '-')}` : ''}.json`)
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Wrote ${outputPath}`)
    if (result.runError != null) throw result.runError
    expect(result.rows.length).toBe(candidates.length * ISSUE927_PIXEL_COUNTS.length * measurementOptions.passes)
  }, 1_800_000)
})
