import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { declaredOutputProfileStamp } from './controllerHardware'
import { runPairedLadder, type PairedRow } from './controllerPairing'
import { ISSUE934_PIXEL_COUNT, issue934Fixtures } from './issue934'

// ISSUE934_HARDWARE=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue934.hardware.test.ts
const runHardware = process.env.ISSUE934_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

describe('approximate transcendentals on hardware (#934)', () => {
  it.skipIf(!runHardware)('pairs exact and approximated stock Patterns at 256 px', async () => {
    const rows: PairedRow[] = []
    let runError: unknown
    const fixtures = issue934Fixtures()
    for (const fixture of fixtures) {
      const result = await runPairedLadder(ip, [ISSUE934_PIXEL_COUNT], [
        { id: `${fixture.pattern}:exact`, code: fixture.exact },
        { id: `${fixture.pattern}:approximated`, code: fixture.approximated },
      ], { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: fixture.sampleMs, passes: 1 })
      rows.push(...result.rows)
      if (result.runError) { runError = result.runError; break }
    }
    const report = {
      generatedAt: new Date().toISOString(),
      controller: { ip, outputProfile: declaredOutputProfileStamp(undefined) },
      pixelCount: ISSUE934_PIXEL_COUNT,
      fixtures: fixtures.map((fixture) => ({ pattern: fixture.pattern, sampleMs: fixture.sampleMs, rewritten: fixture.rewritten, skipped: fixture.skipped })),
      rows,
      partial: runError != null,
    }
    const outputPath = join(process.cwd(), `test/perf-harness/issue934-approx-ladder${report.partial ? `.partial-${report.generatedAt.replace(/[:.]/g, '-')}` : ''}.json`)
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Wrote ${outputPath}`)
    if (runError != null) throw runError
    expect(rows.length).toBe(fixtures.length * 2)
  }, 1_800_000)
})
