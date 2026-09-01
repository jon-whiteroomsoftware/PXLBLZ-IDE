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
import { ISSUE933_PIXEL_COUNT, issue933Candidates } from './issue933'

// ISSUE933_HARDWARE=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue933.hardware.test.ts
const runHardware = process.env.ISSUE933_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const measurementOptions = { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: 6_000 }

describe('integer-pow lowering on hardware (#933)', () => {
  it.skipIf(!runHardware)('pairs the exact and lowered fixture (A/B/A/B) at 256 px and restores Controller state', async () => {
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
    if (original.pixelCount == null) { connection.close(); throw new Error('Controller did not report a pixel count; refusing a probe whose count cannot be restored.') }
    // Precondition the protocol cannot check: the active Pattern's controls
    // must be saved; activating probes discards live-tuned values.
    const savedIds = new Set(savedPrograms.map((program) => program.id))
    const pushedIds: string[] = []
    const candidates = issue933Candidates()
    let runError: unknown
    const rows: unknown[] = []
    try {
      connection.setPixelCount(ISSUE933_PIXEL_COUNT, false)
      const applied = await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: original.activeProgramId, pixelCount: ISSUE933_PIXEL_COUNT })
      if (applied.pixelCount !== ISSUE933_PIXEL_COUNT) throw new Error(`Controller reports ${applied.pixelCount} pixels after requesting ${ISSUE933_PIXEL_COUNT}.`)
      for (const [variant, code] of [['exact', candidates.exact], ['lowered', candidates.lowered], ['exact', candidates.exact], ['lowered', candidates.lowered]] as const) {
        process.stdout.write(`  ${variant} ... `)
        const measured = await pushAndMeasureControllerSource(connection, code, compile, 0, { ...measurementOptions, onPushed: (programId) => pushedIds.push(programId) })
        console.log(`${measured.fps.median.toFixed(3)} median FPS (${measured.fps.samples} samples)`)
        rows.push({ variant, bytecodeBytes: measured.bytecodeBytes, fps: measured.fps })
      }
    } catch (error) {
      runError = error
    } finally {
      let restore = connection
      try {
        try {
          try { await connection.getConfig() } catch {
            connection.close()
            await sleep(2_000)
            restore = new PixelblazeConnection({ host: ip, webSocketFactory: nodeWebSocketFactory, requestTimeoutMs: 15_000, pingIntervalMs: 0 })
            restore.on('error', (error) => console.error('restore socket:', error))
            await restore.connect()
          }
          restore.setActiveProgram(original.activeProgramId)
          restore.setPixelCount(original.pixelCount, false)
          const restored = await waitForControllerConfig(() => restore.getConfig(), { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount })
          const inventory = await restore.listPrograms()
          const probeLeftovers = inventory.filter((program) => pushedIds.includes(program.id))
          for (const program of probeLeftovers) restore.deleteProgram(program.id)
          const finalInventory = probeLeftovers.length > 0 ? await sleep(1_000).then(() => restore.listPrograms()) : inventory
          const unremoved = finalInventory.filter((program) => pushedIds.includes(program.id)).map((program) => program.id)
          const foreign = finalInventory.filter((program) => !savedIds.has(program.id) && !pushedIds.includes(program.id)).map((program) => program.id)
          const missing = [...savedIds].filter((id) => !finalInventory.some((program) => program.id === id))
          if (foreign.length > 0) console.warn(`Saved inventory gained programs this run did not push (left untouched): ${foreign.join(', ')}`)
          if (restored.activeProgramId !== original.activeProgramId || restored.pixelCount !== original.pixelCount || unremoved.length > 0 || missing.length > 0) {
            const restoreError = new Error(`Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount}, leftover probe programs=[${unremoved.join(', ')}], missing programs=[${missing.join(', ')}]).`)
            runError = runError == null ? restoreError : new AggregateError([runError, restoreError], 'Probe and restoration both failed.')
          }
        } catch (restoreFailure) {
          const restoreError = restoreFailure instanceof Error ? restoreFailure : new Error(String(restoreFailure))
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
      pixelCount: ISSUE933_PIXEL_COUNT,
      fixture: { rewrittenSites: candidates.rewrittenSites, hoistedTemps: candidates.hoistedTemps, skipped: candidates.skipped },
      rows,
      partial: runError != null,
    }
    const outputPath = join(process.cwd(), `test/perf-harness/issue933-pow-ladder${report.partial ? `.partial-${report.generatedAt.replace(/[:.]/g, '-')}` : ''}.json`)
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Wrote ${outputPath}`)
    if (runError != null) throw runError
    expect(rows.length).toBe(4)
  }, 600_000)
})
