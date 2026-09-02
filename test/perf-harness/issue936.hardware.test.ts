import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { declaredOutputProfileStamp } from './controllerHardware'
import { runPairedLadder } from './controllerPairing'
import { ISSUE936_PIXEL_COUNTS, issue936Candidates } from './issue936'

// ISSUE936_HARDWARE=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue936.hardware.test.ts
const runHardware = process.env.ISSUE936_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const measurementOptions = { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: 6_000, passes: 2 }

describe('boundary-latched Redline on hardware (#936 spike)', () => {
  it.skipIf(!runHardware)('pairs exact, latched, and latched-with-counters at 256 and 500 px and restores Controller state', async () => {
    const c = issue936Candidates()
    const result = await runPairedLadder(ip, ISSUE936_PIXEL_COUNTS, [
      { id: 'exact', code: c.exact },
      { id: 'latched', code: c.latched },
      { id: 'latched-counters', code: c.latchedCounters },
      { id: 'latched-chain', code: c.latchedChain },
    ], measurementOptions)
    const report = {
      generatedAt: new Date().toISOString(),
      controller: { ...result.controller, outputProfile: declaredOutputProfileStamp(undefined), ...measurementOptions },
      fixture: { show: 'stock-show-showcase-redline-installation', routing: 'index', arms: c.arms, bodyGroups: c.bodyGroups },
      rows: result.rows,
      partial: result.runError != null,
    }
    const outputPath = join(process.cwd(), `test/perf-harness/issue936-latch-ladder${report.partial ? `.partial-${report.generatedAt.replace(/[:.]/g, '-')}` : ''}.json`)
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Wrote ${outputPath}`)
    if (result.runError != null) throw result.runError
    expect(result.rows.length).toBe(16)
  }, 1_200_000)
})
