import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerArtifact,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE533_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

describe('Freeze-at-entry Controller probe (#533)', () => {
  it.skipIf(!runHardware)('benchmarks Live and Freeze at 256, 1,000, and 2,000 pixels and restores Controller state', async () => {
    const { buildIssue533Artifacts, ISSUE533_PIXEL_COUNTS } = await import('./issue533')
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
    const measurements: unknown[] = []
    try {
      for (const pixelCount of ISSUE533_PIXEL_COUNTS) {
        if ((await connection.getConfig()).pixelCount !== pixelCount) {
          connection.setPixelCount(pixelCount, false)
          await sleep(1_000)
        }
        const { live, freeze } = buildIssue533Artifacts(pixelCount)
        const options = { settleMs: 2_000, sampleMs: 5_000 }
        const liveMeasurement = await pushAndMeasureControllerArtifact(connection, live, compile, options)
        const freezeMeasurement = await pushAndMeasureControllerArtifact(connection, freeze, compile, options)
        measurements.push({
          pixelCount,
          live: liveMeasurement,
          freeze: freezeMeasurement,
          meanChangePercent: (freezeMeasurement.fps.mean / liveMeasurement.fps.mean - 1) * 100,
          medianChangePercent: (freezeMeasurement.fps.median / liveMeasurement.fps.median - 1) * 100,
        })
      }
      console.log(JSON.stringify({
        controller: {
          ip,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          originalPixelCount: original.pixelCount,
          originalActiveProgramId: original.activeProgramId,
        },
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
    expect(measurements).toHaveLength(ISSUE533_PIXEL_COUNTS.length)
  }, 180_000)
})
