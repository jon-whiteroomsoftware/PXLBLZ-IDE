import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import type { GeneratedShowArtifact } from '../../src/engine/showCompiler'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerArtifact,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE525_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const pixelCounts = (process.env.ISSUE525_PIXEL_COUNTS ?? '256,1000,2000')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0 && value <= 2_000)
const representationNames = new Set((process.env.ISSUE525_REPRESENTATIONS ?? 'baseline,structural,selected').split(','))

describe('Motion Transitions shared-kernel Controller matrix (#525)', () => {
  it.skipIf(!runHardware)('benchmarks all representations and restores Controller state', async () => {
    const { baselineArtifact, structuralArtifact, selectedArtifact } = await import('./issue525')
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
      const probe = async (artifact: GeneratedShowArtifact) => {
        let bytecodeBytes: number | null = null
        try {
          bytecodeBytes = compile(artifact.code).length
          return {
            activated: true as const,
            measurement: await pushAndMeasureControllerArtifact(connection, artifact, compile),
          }
        } catch (error) {
          return {
            activated: false as const,
            sourceBytes: artifact.summary.artifactBytes,
            bytecodeBytes,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }
      const measurements = []
      for (const pixelCount of pixelCounts) {
        if (original.pixelCount !== pixelCount) {
          connection.setPixelCount(pixelCount, false)
          await sleep(1_000)
        }
        const skipped = { activated: false as const, skipped: true as const }
        const baseline = representationNames.has('baseline') ? await probe(baselineArtifact) : skipped
        const structural = representationNames.has('structural') ? await probe(structuralArtifact) : skipped
        const selected = representationNames.has('selected') ? await probe(selectedArtifact) : skipped
        const baselineFps = baseline.activated ? baseline.measurement.fps : null
        const structuralFps = structural.activated ? structural.measurement.fps : null
        const selectedFps = selected.activated ? selected.measurement.fps : null
        measurements.push({
          pixelCount,
          baseline,
          structural,
          selected,
          structuralMeanChangePercent: baselineFps && structuralFps
            ? (structuralFps.mean / baselineFps.mean - 1) * 100
            : null,
          selectedMeanChangePercent: baselineFps && selectedFps
            ? (selectedFps.mean / baselineFps.mean - 1) * 100
            : null,
          selectedMedianChangePercent: baselineFps && selectedFps
            ? (selectedFps.median / baselineFps.median - 1) * 100
            : null,
          selectedVsStructuralMeanChangePercent: structuralFps && selectedFps
            ? (selectedFps.mean / structuralFps.mean - 1) * 100
            : null,
          selectedVsStructuralMedianChangePercent: structuralFps && selectedFps
            ? (selectedFps.median / structuralFps.median - 1) * 100
            : null,
        })
      }
      report = {
        controller: {
          ip,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          originalPixelCount: original.pixelCount,
          originalActiveProgramId: original.activeProgramId,
        },
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
