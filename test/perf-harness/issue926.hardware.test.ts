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
import { ISSUE926_PIXEL_COUNT, issue926Candidates } from './issue926'

// ISSUE926_HARDWARE=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue926.hardware.test.ts
const runHardware = process.env.ISSUE926_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const measurementOptions = { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: 6_000 }

describe('hold variants ladder on hardware (#926 spike)', () => {
  it.skipIf(!runHardware)('measures baseline, hold, parity, lerp, and refresh variants at 256 px and restores Controller state', async () => {
    const compile = await fetchControllerCompiler(ip)
    const connection = new PixelblazeConnection({ host: ip, webSocketFactory: nodeWebSocketFactory, requestTimeoutMs: 15_000, pingIntervalMs: 0 })
    connection.on('error', (error) => console.error('controller socket:', error))
    await connection.connect()
    const original = await connection.getConfig()
    if (!original.activeProgramId) { connection.close(); throw new Error('Controller did not report an active Pattern; refusing a non-reversible probe.') }
    const savedPrograms = await connection.listPrograms().catch((error) => { connection.close(); throw error })
    if (!savedPrograms.some((program) => program.id === original.activeProgramId)) {
      connection.close()
      throw new Error(`Active Pattern ${original.activeProgramId} is not in the saved inventory; refusing a non-restorable probe.`)
    }
    let runError: unknown
    const rows: unknown[] = []
    try {
      connection.setPixelCount(ISSUE926_PIXEL_COUNT, false)
      await sleep(1_000)
      for (const candidate of issue926Candidates()) {
        const id = `${candidate.member}:${candidate.variant}:k${candidate.k}`
        process.stdout.write(`  ${id} ... `)
        const measured = await pushAndMeasureControllerSource(connection, candidate.code, compile, 0, measurementOptions)
        console.log(`${measured.fps.median.toFixed(3)} median FPS (${measured.fps.samples} samples)`)
        rows.push({ member: candidate.member, variant: candidate.variant, k: candidate.k, bytecodeBytes: measured.bytecodeBytes, fps: measured.fps })
      }
    } catch (error) {
      runError = error
    } finally {
      let restore = connection
      try {
        try { await connection.getConfig() } catch {
          connection.close()
          await sleep(2_000)
          restore = new PixelblazeConnection({ host: ip, webSocketFactory: nodeWebSocketFactory, requestTimeoutMs: 15_000, pingIntervalMs: 0 })
          restore.on('error', (error) => console.error('restore socket:', error))
          await restore.connect()
        }
        restore.setActiveProgram(original.activeProgramId)
        if (original.pixelCount != null) restore.setPixelCount(original.pixelCount, false)
        const restored = await waitForControllerConfig(() => restore.getConfig(), { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount })
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
      controller: { ip, name: original.name, boardType: original.boardType, firmwareVersion: original.firmwareVersion, outputProfile: declaredOutputProfileStamp(undefined), ...measurementOptions },
      pixelCount: ISSUE926_PIXEL_COUNT,
      rows,
      partial: runError != null,
    }
    const outputPath = join(process.cwd(), `test/perf-harness/issue926-variants-ladder${report.partial ? `.partial-${report.generatedAt.replace(/[:.]/g, '-')}` : ''}.json`)
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Wrote ${outputPath}`)
    if (runError != null) throw runError
    expect(rows.length).toBeGreaterThan(0)
  }, 1_800_000)
})
