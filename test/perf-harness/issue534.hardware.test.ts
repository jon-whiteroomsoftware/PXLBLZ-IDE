import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerArtifact,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE534_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

describe('multi-layer coverage-directed composition Controller probe (#534)', () => {
  it.skipIf(!runHardware)('benchmarks coverage and depth envelopes and restores Controller state', async () => {
    const {
      buildIssue534Artifacts,
      ISSUE534_COVERAGES,
      ISSUE534_PIXEL_COUNTS,
    } = await import('./issue534')
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
    const options = { settleMs: 1_500, sampleMs: 3_000 }
    const measurePair = async (pixelCount: number, layerCount: 3 | 5, coverage: number) => {
      if ((await connection.getConfig()).pixelCount !== pixelCount) {
        connection.setPixelCount(pixelCount, false)
        await sleep(1_000)
      }
      const { selected, counterfactual } = buildIssue534Artifacts(pixelCount, layerCount, coverage)
      const baseline = await pushAndMeasureControllerArtifact(connection, counterfactual, compile, options)
      const optimized = await pushAndMeasureControllerArtifact(connection, selected, compile, options)
      measurements.push({
        pixelCount,
        layerCount,
        coverage,
        expectedRendererEvaluationsPerPixel: layerCount === 3 ? 3 - 2 * coverage : 5,
        baseline,
        optimized,
        meanChangePercent: (optimized.fps.mean / baseline.fps.mean - 1) * 100,
        medianChangePercent: (optimized.fps.median / baseline.fps.median - 1) * 100,
      })
    }

    try {
      for (const coverage of ISSUE534_COVERAGES) await measurePair(2_000, 3, coverage)
      for (const pixelCount of ISSUE534_PIXEL_COUNTS) {
        if (pixelCount !== 2_000) await measurePair(pixelCount, 3, 0.9)
        await measurePair(pixelCount, 5, 0.9)
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
    expect(measurements).toHaveLength(10)
  }, 240_000)
})
