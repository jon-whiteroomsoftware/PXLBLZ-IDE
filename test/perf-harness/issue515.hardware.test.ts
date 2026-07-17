import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerArtifact,
  sleep,
} from './controllerHardware'

const runHardware = process.env.ISSUE515_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const pixelCounts = (process.env.ISSUE515_PIXEL_COUNTS ?? '256,1000,2000')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0 && value <= 2_000)

describe('Redline physical render-target Controller matrix (#515)', () => {
  it.skipIf(!runHardware)('benchmarks 256, 1,000, and 2,000 pixels and restores Controller state', async () => {
    const { selectedArtifact, counterfactualArtifact } = await import('./issue515')
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
      const measurements = []
      for (const pixelCount of pixelCounts) {
        if (original.pixelCount !== pixelCount) {
          connection.setPixelCount(pixelCount, false)
          await sleep(1_000)
        }
        const counterfactual = await pushAndMeasureControllerArtifact(connection, counterfactualArtifact, compile)
        const selected = await pushAndMeasureControllerArtifact(connection, selectedArtifact, compile)
        measurements.push({
          pixelCount,
          counterfactual,
          selected,
          fpsChangePercent: (selected.fps.mean / counterfactual.fps.mean - 1) * 100,
        })
      }
      report = {
        controller: {
          ip,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          originalPixelCount: original.pixelCount,
        },
        measurements,
      }
      console.log(JSON.stringify(report, null, 2))
    } catch (error) {
      runError = error
    } finally {
      try {
        connection.setActiveProgram(original.activeProgramId)
        if (original.pixelCount) connection.setPixelCount(original.pixelCount, false)
        await sleep(1_000)
        const restored = await connection.getConfig()
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
