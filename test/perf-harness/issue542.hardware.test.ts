import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import type { GeneratedShowArtifact } from '../../src/engine/showCompiler'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerArtifact,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import { issue542Artifact, type Issue542ReferenceId } from './issue542'

const runHardware = process.env.ISSUE542_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const referenceIds: Issue542ReferenceId[] = [
  'stock-show-reference-wipe-mix-transitions',
  'stock-show-reference-shape-reveal-transitions',
  'stock-show-reference-easing',
]

describe('table-driven Show score Controller matrix (#542)', () => {
  it.skipIf(!runHardware)('benchmarks paired artifacts at 256, 1,000, and 2,000 pixels and restores Controller state', async () => {
    const artifactPairs = referenceIds.map((id) => ({
      id,
      baselineArtifact: issue542Artifact(id, 'none'),
      selectedArtifact: issue542Artifact(id, 'force'),
    }))
    const compile = await fetchControllerCompiler(ip)
    const connection = new PixelblazeConnection({
      host: ip,
      webSocketFactory: nodeWebSocketFactory,
      requestTimeoutMs: 15_000,
      pingIntervalMs: 2_000,
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
      const ensureConnected = async () => {
        try {
          await connection.getConfig()
        } catch {
          await sleep(2_000)
          await connection.connect()
        }
      }
      const probe = async (artifact: GeneratedShowArtifact) => {
        let bytecodeBytes: number | null = null
        try {
          await ensureConnected()
          bytecodeBytes = compile(artifact.code).length
          const measurement = await pushAndMeasureControllerArtifact(connection, artifact, compile, {
            settleMs: 750,
            sampleMs: 3_000,
            activationTimeoutMs: 15_000,
          })
          return { activated: true as const, measurement }
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
      for (const { id, baselineArtifact, selectedArtifact } of artifactPairs) {
        for (const pixelCount of [256, 1_000, 2_000]) {
          await ensureConnected()
          connection.setPixelCount(pixelCount, false)
          await sleep(1_000)
          const baseline = await probe(baselineArtifact)
          const selected = await probe(selectedArtifact)
          const baselineFps = baseline.activated ? baseline.measurement.fps : null
          const selectedFps = selected.activated ? selected.measurement.fps : null
          const baselineBytecodeBytes = baseline.activated ? baseline.measurement.bytecodeBytes : baseline.bytecodeBytes
          const selectedBytecodeBytes = selected.activated ? selected.measurement.bytecodeBytes : selected.bytecodeBytes
          measurements.push({
            id,
            pixelCount,
            baseline,
            selected,
            sourceChangePercent: (selectedArtifact.summary.artifactBytes / baselineArtifact.summary.artifactBytes - 1) * 100,
            bytecodeChangePercent: baselineBytecodeBytes && selectedBytecodeBytes
              ? (selectedBytecodeBytes / baselineBytecodeBytes - 1) * 100
              : null,
            meanFpsChangePercent: baselineFps && selectedFps
              ? (selectedFps.mean / baselineFps.mean - 1) * 100
              : null,
            medianFpsChangePercent: baselineFps && selectedFps
              ? (selectedFps.median / baselineFps.median - 1) * 100
              : null,
          })
        }
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
  }, 240_000)
})
