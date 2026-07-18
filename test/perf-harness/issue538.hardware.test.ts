import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import { selectShowGeneratedKernelRepresentation } from '../../src/engine/showGeneratedKernelSharing'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerArtifact,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE538_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const pixelCount = 2_000
const measurementOptions = { activationTimeoutMs: 15_000, settleMs: 1_000, sampleMs: 2_500 }

describe('shared generated Effect-kernel Controller matrix (#538)', () => {
  it.skipIf(!runHardware)('measures 2/5/10-member bytecode and FPS and restores Controller state', async () => {
    const { issue538Cases } = await import('./issue538')
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

    let runError: unknown
    let report: unknown
    try {
      if (original.pixelCount !== pixelCount) {
        connection.setPixelCount(pixelCount, false)
        await sleep(1_000)
      }
      const cases = []
      for (const entry of issue538Cases) {
        const baseline = await pushAndMeasureControllerArtifact(
          connection,
          entry.artifacts.baseline,
          compile,
          measurementOptions,
        )
        const shared = await pushAndMeasureControllerArtifact(
          connection,
          entry.artifacts.shared,
          compile,
          measurementOptions,
        )
        cases.push({
          memberCount: entry.memberCount,
          parity: entry.parity,
          baseline,
          shared,
          selection: selectShowGeneratedKernelRepresentation({
            exactFast: entry.parity.fast,
            exactPrecise: entry.parity.precise,
            baselineControllerBytecode: baseline.bytecodeBytes,
            sharedControllerBytecode: shared.bytecodeBytes,
          }),
          delta: {
            sourceBytes: shared.sourceBytes - baseline.sourceBytes,
            bytecodeBytes: shared.bytecodeBytes - baseline.bytecodeBytes,
            persistentGlobals: entry.delta.persistentGlobals,
            meanFpsPercent: (shared.fps.mean / baseline.fps.mean - 1) * 100,
            medianFpsPercent: (shared.fps.median / baseline.fps.median - 1) * 100,
          },
        })
      }
      report = {
        controller: {
          ip,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          probePixelCount: pixelCount,
          originalPixelCount: original.pixelCount,
          originalActiveProgramId: original.activeProgramId,
        },
        cases,
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
