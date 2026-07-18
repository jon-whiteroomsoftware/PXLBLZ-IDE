import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE539_PROTOTYPE_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

describe('Vignette scalar-field cheapest falsifier (#539)', () => {
  it.skipIf(!runHardware)('measures inline versus one-plane replay and restores Controller state', async () => {
    const {
      buildIssue539PrototypeSources,
      ISSUE539_PROTOTYPE_PIXEL_COUNTS,
    } = await import('./issue539.prototype')
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
      for (const pixelCount of ISSUE539_PROTOTYPE_PIXEL_COUNTS) {
        if ((await connection.getConfig()).pixelCount !== pixelCount) {
          connection.setPixelCount(pixelCount, false)
          await sleep(1_000)
        }
        const { inline, cached } = buildIssue539PrototypeSources(pixelCount)
        const ledgerVmWords = 3 * (pixelCount + 4)
        const options = { settleMs: 1_500, sampleMs: 3_000 }
        const inlineMeasurement = await pushAndMeasureControllerSource(
          connection, inline, compile, ledgerVmWords, options,
        )
        const cachedMeasurement = await pushAndMeasureControllerSource(
          connection, cached, compile, ledgerVmWords, options,
        )
        measurements.push({
          pixelCount,
          inline: inlineMeasurement,
          cached: cachedMeasurement,
          meanChangePercent: (cachedMeasurement.fps.mean / inlineMeasurement.fps.mean - 1) * 100,
          medianChangePercent: (cachedMeasurement.fps.median / inlineMeasurement.fps.median - 1) * 100,
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
    expect(measurements).toHaveLength(ISSUE539_PROTOTYPE_PIXEL_COUNTS.length)
  }, 120_000)
})
