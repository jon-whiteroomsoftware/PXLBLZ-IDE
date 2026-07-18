import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerArtifact,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE519_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

describe('scalar-field cache Controller probe (#519)', () => {
  it.skipIf(!runHardware)('benchmarks paired 2,000-pixel artifacts and restores Controller state', async () => {
    const { counterfactualArtifact, ISSUE519_PIXEL_COUNT, selectedArtifact } = await import('./issue519')
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
      throw new Error('Controller did not report an active program; refusing a non-reversible probe')
    }

    let runError: unknown
    let report: unknown
    try {
      if (original.pixelCount !== ISSUE519_PIXEL_COUNT) {
        connection.setPixelCount(ISSUE519_PIXEL_COUNT, false)
        await sleep(1_000)
      }
      const counterfactual = await pushAndMeasureControllerArtifact(connection, counterfactualArtifact, compile)
      const selected = await pushAndMeasureControllerArtifact(connection, selectedArtifact, compile)
      report = {
        controller: {
          ip,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          originalPixelCount: original.pixelCount,
          originalActiveProgramId: original.activeProgramId,
        },
        measurement: {
          pixelCount: ISSUE519_PIXEL_COUNT,
          counterfactual,
          selected,
          meanChangePercent: (selected.fps.mean / counterfactual.fps.mean - 1) * 100,
          medianChangePercent: (selected.fps.median / counterfactual.fps.median - 1) * 100,
        },
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
  }, 120_000)
})
