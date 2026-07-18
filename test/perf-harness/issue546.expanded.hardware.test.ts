import { PixelblazeConnection, type PixelblazeVmError } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import { issue546Artifacts } from './issue546'

const runHardware = process.env.ISSUE546_EXPANDED_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

describe('expanded owner-runtime activation-history isolation for #546', () => {
  it.skipIf(!runHardware)('pushes identical bytecode twice and restores Controller state', async () => {
    const compile = await fetchControllerCompiler(ip)
    const source = issue546Artifacts['stock-show-reference-property-animation'].selected.expandedCode
    const connection = new PixelblazeConnection({
      host: ip,
      webSocketFactory: nodeWebSocketFactory,
      requestTimeoutMs: 15_000,
      connectTimeoutMs: 10_000,
      pingIntervalMs: 2_000,
    })
    const vmErrors: PixelblazeVmError[] = []
    connection.on('vm-error', (detail) => vmErrors.push(detail as PixelblazeVmError))
    await connection.connect()
    const original = await connection.getConfig()
    if (!original.activeProgramId) {
      connection.close()
      throw new Error('Controller did not report an active program; refusing a non-reversible probe')
    }

    let runError: unknown
    let report: Record<string, unknown> | undefined
    try {
      const measurements = []
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const vmErrorStart = vmErrors.length
        try {
          if (!connection.isConnected) await connection.connect()
          const measurement = await pushAndMeasureControllerSource(connection, source, compile, 0, {
            settleMs: 1_000,
            sampleMs: 2_000,
            activationTimeoutMs: 15_000,
          })
          const result = { attempt, activated: true, measurement, vmErrors: vmErrors.slice(vmErrorStart) }
          measurements.push(result)
          console.log(JSON.stringify({ probe: 'identical-owner-runtime-push', ...result }, null, 2))
        } catch (error) {
          const result = {
            attempt,
            activated: false,
            sourceBytes: new TextEncoder().encode(source).length,
            bytecodeBytes: compile(source).length,
            vmErrors: vmErrors.slice(vmErrorStart),
            error: error instanceof Error ? error.message : String(error),
          }
          measurements.push(result)
          console.log(JSON.stringify({ probe: 'identical-owner-runtime-push', ...result }, null, 2))
          break
        }
        if (attempt === 1) await sleep(5_000)
      }
      report = {
        controller: { boardType: original.boardType, firmwareVersion: original.firmwareVersion },
        probe: 'identical-full-owner-runtime-twice',
        expandedBytecodeBytes: compile(source).length,
        compactedBytecodeBytes: compile(
          issue546Artifacts['stock-show-reference-property-animation'].selected.code,
        ).length,
        measurements,
      }
      console.log(JSON.stringify(report, null, 2))
    } catch (error) {
      runError = error
    } finally {
      try {
        try {
          await connection.getConfig()
        } catch {
          await sleep(2_000)
          await connection.connect()
        }
        connection.setActiveProgram(original.activeProgramId)
        if (original.pixelCount) connection.setPixelCount(original.pixelCount, false)
        const restored = await waitForControllerConfig(
          () => connection.getConfig(),
          { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount },
        )
        if (restored.activeProgramId !== original.activeProgramId || restored.pixelCount !== original.pixelCount) {
          const restoreError = new Error(`Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount})`)
          runError = runError == null
            ? restoreError
            : new AggregateError([runError, restoreError], 'probe and restoration both failed')
        }
      } finally {
        connection.close()
      }
    }
    if (runError != null) throw runError
    expect(report).toBeTruthy()
  }, 180_000)
})
