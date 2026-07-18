import { PixelblazeConnection, type PixelblazeVmError } from '../../src/engine/PixelblazeConnection'
import { compactGeneratedShowSymbols } from '../../src/engine/showCompiler'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import { issue546Artifacts, stripPatternSlotRuntimeForDiagnostic } from './issue546'

const runHardware = process.env.ISSUE546_REMAP_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

describe('physical Pattern remap isolation for #546', () => {
  it.skipIf(!runHardware)('activates the remapped machines without owner runtime and restores Controller state', async () => {
    const compile = await fetchControllerCompiler(ip)
    const selected = issue546Artifacts['stock-show-reference-property-animation'].selected
    const candidates = [
      {
        name: 'expanded-physical-remap-without-slot-runtime',
        source: stripPatternSlotRuntimeForDiagnostic(selected.expandedCode),
      },
      {
        name: 'compacted-physical-remap-without-slot-runtime',
        source: compactGeneratedShowSymbols(
          stripPatternSlotRuntimeForDiagnostic(selected.expandedCode),
        ).code,
      },
    ]
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
    const measurements = []
    try {
      for (const candidate of candidates) {
        const vmErrorStart = vmErrors.length
        try {
          const measurement = await pushAndMeasureControllerSource(connection, candidate.source, compile, 0, {
            settleMs: 500,
            sampleMs: 1_500,
            activationTimeoutMs: 15_000,
          })
          measurements.push({ name: candidate.name, activated: true, measurement, vmErrors: vmErrors.slice(vmErrorStart) })
        } catch (error) {
          measurements.push({
            name: candidate.name,
            activated: false,
            sourceBytes: new TextEncoder().encode(candidate.source).length,
            bytecodeBytes: compile(candidate.source).length,
            vmErrors: vmErrors.slice(vmErrorStart),
            error: error instanceof Error ? error.message : String(error),
          })
          break
        }
      }
      console.log(JSON.stringify({
        controller: { boardType: original.boardType, firmwareVersion: original.firmwareVersion },
        measurements,
      }, null, 2))
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
    expect(measurements.length).toBeGreaterThan(0)
  }, 120_000)
})
