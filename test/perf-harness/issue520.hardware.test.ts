import { describe, expect, it } from 'vitest'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerArtifact,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE520_HARDWARE === '1'
const preflightOnly = process.env.ISSUE520_PREFLIGHT_ONLY === '1'
const snapshotProbe = process.env.ISSUE520_SNAPSHOT_PROBE
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const measurementOptions = { activationTimeoutMs: 20_000 }

describe('five-Pattern acceptance Show Controller qualification (#520)', () => {
  it.skipIf(!runHardware)('measures cumulative layers, crossfade policies, and Redline stress, restoring Controller state', async () => {
    const { acceptanceArtifacts, ISSUE520_PIXEL_COUNT } = await import('./issue520')
    const { selectedArtifact: redlineProductionArtifact } = await import('./issue512')
    const compile = await fetchControllerCompiler(ip)
    const bytecodePreflight = {
      layers: acceptanceArtifacts.layers.map((layer) => ({
        id: layer.id,
        sourceBytes: layer.artifact.summary.artifactBytes,
        bytecodeBytes: compile(layer.artifact.code).length,
      })),
      snapshot: {
        sourceBytes: acceptanceArtifacts.selected.summary.artifactBytes,
        bytecodeBytes: compile(acceptanceArtifacts.selected.code).length,
      },
      snapshotWithoutScalar: {
        sourceBytes: acceptanceArtifacts.snapshotWithoutScalar.summary.artifactBytes,
        bytecodeBytes: compile(acceptanceArtifacts.snapshotWithoutScalar.code).length,
      },
      delayedSnapshot: {
        sourceBytes: acceptanceArtifacts.delayedSnapshot.summary.artifactBytes,
        bytecodeBytes: compile(acceptanceArtifacts.delayedSnapshot.code).length,
      },
      redlineProduction: {
        sourceBytes: redlineProductionArtifact.summary.artifactBytes,
        bytecodeBytes: compile(redlineProductionArtifact.code).length,
      },
      redlineStress: {
        sourceBytes: new TextEncoder().encode(DEMOS.RedlineMachine).length,
        bytecodeBytes: compile(DEMOS.RedlineMachine).length,
      },
    }
    if (preflightOnly) {
      console.log(JSON.stringify(bytecodePreflight, null, 2))
      expect(bytecodePreflight.snapshot.bytecodeBytes).toBeGreaterThan(0)
      return
    }
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

    let runError: unknown = null
    let report: unknown = null
    try {
      if (original.pixelCount !== ISSUE520_PIXEL_COUNT) {
        connection.setPixelCount(ISSUE520_PIXEL_COUNT, false)
        await sleep(1_000)
      }

      if (snapshotProbe) {
        const probeArtifact = snapshotProbe === 'delayed'
          ? acceptanceArtifacts.delayedSnapshot
          : snapshotProbe === 'selected'
            ? acceptanceArtifacts.selected
            : acceptanceArtifacts.snapshotWithoutScalar
        report = {
          probe: snapshotProbe === 'delayed'
            ? 'delayed-snapshot-with-scalar'
            : snapshotProbe === 'selected'
              ? 'selected-snapshot-with-scalar'
              : 'snapshot-without-scalar',
          measurement: await pushAndMeasureControllerArtifact(
            connection,
            probeArtifact,
            compile,
            measurementOptions,
          ),
        }
      } else {
        const layers = []
        for (const layer of acceptanceArtifacts.layers) {
          const measurement = await pushAndMeasureControllerArtifact(connection, layer.artifact, compile, measurementOptions)
          layers.push({ id: layer.id, ...measurement })
          console.log(JSON.stringify({ probe: layer.id, ...measurement }))
        }
        const snapshot = await pushAndMeasureControllerArtifact(connection, acceptanceArtifacts.selected, compile, measurementOptions)
        const redlineProduction = await pushAndMeasureControllerArtifact(connection, redlineProductionArtifact, compile, measurementOptions)

        connection.setPixelCount(4_000, false)
        await sleep(1_000)
        const redlineStress = await pushAndMeasureControllerSource(
          connection,
          DEMOS.RedlineMachine,
          compile,
          88,
          measurementOptions,
        )

        const baseline = layers[0]
        const liveSelected = layers[layers.length - 1]
        report = {
          controller: {
            ip,
            boardType: original.boardType,
            firmwareVersion: original.firmwareVersion,
            originalPixelCount: original.pixelCount,
            originalActiveProgramId: original.activeProgramId,
            outputTransport: 'Controller-native LED output; expander/parallel topology is not exposed by getConfig',
          },
          acceptance: {
            pixelCount: ISSUE520_PIXEL_COUNT,
            layers,
            liveSelected,
            snapshot,
            exactCumulativeMedianChangePercent: (liveSelected.fps.median / baseline.fps.median - 1) * 100,
            snapshotVsLiveMedianChangePercent: (snapshot.fps.median / liveSelected.fps.median - 1) * 100,
          },
          redline: {
            production: { pixelCount: 2_000, ...redlineProduction },
            stress: { pixelCount: 4_000, support: 'unsupported-stress-only', ...redlineStress },
          },
        }
      }
      console.log(JSON.stringify(report, null, 2))
    } catch (error) {
      runError = error
    } finally {
      try {
        if (!connection.isConnected) {
          await connection.connect()
          await connection.getConfig()
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

    if (runError) throw runError
    expect(report).toBeTruthy()
  }, 180_000)
})
