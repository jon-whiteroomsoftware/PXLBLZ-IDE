import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  declaredOutputProfileStamp,
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import { ISSUE931_PIXEL_COUNT, issue931Fixtures } from './issue931'

// ISSUE931_HARDWARE=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue931.hardware.test.ts
const runHardware = process.env.ISSUE931_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const activationTimeoutMs = 20_000
const settleMs = 2_000

describe('member loop rewrite paired ladder (#931)', () => {
  it.skipIf(!runHardware)('measures pass-off against pass-on at 256 px and restores Controller state', async () => {
    const compile = await fetchControllerCompiler(ip)
    const connection = new PixelblazeConnection({
      host: ip,
      webSocketFactory: nodeWebSocketFactory,
      requestTimeoutMs: 15_000,
      pingIntervalMs: 0,
    })
    connection.on('error', (error) => console.error('controller socket:', error))
    await connection.connect()
    const original = await connection.getConfig()
    if (!original.activeProgramId) {
      connection.close()
      throw new Error('Controller did not report an active Pattern; refusing a non-reversible probe.')
    }
    const savedPrograms = await connection.listPrograms().catch((error) => {
      connection.close()
      throw error
    })
    if (!savedPrograms.some((program) => program.id === original.activeProgramId)) {
      connection.close()
      throw new Error(`Active Pattern ${original.activeProgramId} is not in the saved inventory; refusing a non-restorable probe.`)
    }

    let runError: unknown
    const rows: unknown[] = []
    try {
      connection.setPixelCount(ISSUE931_PIXEL_COUNT, false)
      await sleep(1_000)
      for (const fixture of issue931Fixtures()) {
        if (fixture.byteIdentical) {
          rows.push({ fixture: fixture.id, pixelCount: ISSUE931_PIXEL_COUNT, byteIdentical: true })
          continue
        }
        const measured: Record<string, unknown[]> = { off: [], on: [] }
        for (const variant of ['off', 'on', 'off', 'on'] as const) {
          const artifact = fixture[variant]
          process.stdout.write(`  ${fixture.id}:${variant} ... `)
          const result = await pushAndMeasureControllerSource(
            connection,
            artifact.code,
            compile,
            artifact.summary.resources.totalWords,
            { activationTimeoutMs, settleMs, sampleMs: fixture.sampleMs },
          )
          console.log(`${result.fps.median.toFixed(3)} median FPS (${result.fps.samples} samples)`)
          measured[variant].push({
            bytecodeBytes: result.bytecodeBytes,
            sourceBytes: artifact.summary.artifactBytes,
            fps: result.fps,
          })
        }
        rows.push({ fixture: fixture.id, pixelCount: ISSUE931_PIXEL_COUNT, byteIdentical: false, ...measured })
      }
    } catch (error) {
      runError = error
    } finally {
      // #906/#915: never reuse a failed probe connection for restoration.
      let restore = connection
      try {
        try {
          await connection.getConfig()
        } catch {
          connection.close()
          await sleep(2_000)
          restore = new PixelblazeConnection({ host: ip, webSocketFactory: nodeWebSocketFactory, requestTimeoutMs: 15_000, pingIntervalMs: 0 })
          restore.on('error', (error) => console.error('restore socket:', error))
          await restore.connect()
        }
        restore.setActiveProgram(original.activeProgramId)
        if (original.pixelCount != null) restore.setPixelCount(original.pixelCount, false)
        const restored = await waitForControllerConfig(
          () => restore.getConfig(),
          { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount },
        )
        if (restored.activeProgramId !== original.activeProgramId || restored.pixelCount !== original.pixelCount) {
          const restoreError = new Error(`Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount}).`)
          runError = runError == null ? restoreError : new AggregateError([runError, restoreError], 'Probe and restoration both failed.')
        }
      } finally {
        restore.close()
        if (restore !== connection) connection.close()
      }
    }
    const report = {
      generatedAt: new Date().toISOString(),
      controller: {
        ip,
        name: original.name,
        boardType: original.boardType,
        firmwareVersion: original.firmwareVersion,
        outputProfile: declaredOutputProfileStamp(undefined),
        settleMs,
        activationTimeoutMs,
      },
      rows,
      partial: runError != null,
    }
    const outputPath = join(process.cwd(), 'test/perf-harness/issue931-unroll-ladder.json')
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Wrote ${outputPath}`)
    if (runError != null) throw runError
    expect(rows.length).toBeGreaterThan(0)
  }, 1_800_000)
})
