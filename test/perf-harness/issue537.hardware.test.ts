import { describe, expect, it } from 'vitest'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  fetchControllerCompilerInspector,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import { buildIssue537DiagnosticSources, ISSUE537_PIXEL_COUNTS } from './issue537'

const runHardware = process.env.ISSUE537_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.1.224'

describe.runIf(runHardware)('issue #537 previous-RGB Controller qualification', () => {
  it('measures linear-RGB feedback against an arena-matched live counterfactual and restores the Controller', async () => {
    const compile = await fetchControllerCompiler(ip)
    const inspect = await fetchControllerCompilerInspector(ip)
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
    const measurements: unknown[] = []
    try {
      for (const pixelCount of ISSUE537_PIXEL_COUNTS) {
        await ensureConnected(connection)
        if ((await connection.getConfig()).pixelCount !== pixelCount) {
          connection.setPixelCount(pixelCount, false)
          await sleep(2_000)
        }
        const sources = buildIssue537DiagnosticSources(pixelCount)
        const liveInspection = inspect(sources.live)
        const trailsInspection = inspect(sources.trails)
        const live = await measureWithDrain(connection, sources.live, compile)
        const trails = await measureWithDrain(connection, sources.trails, compile)
        measurements.push({
          pixelCount,
          retention: sources.retention,
          arenaWords: sources.arenaWords,
          additionalArrayWords: 0,
          live: { measurement: live, compiler: liveInspection },
          trails: { measurement: trails, compiler: trailsInspection },
          meanChangePercent: (trails.fps.mean / live.fps.mean - 1) * 100,
          medianChangePercent: (trails.fps.median / live.fps.median - 1) * 100,
          frameTimeSpreadMs: 1_000 / trails.fps.min - 1_000 / trails.fps.max,
        })
      }
      console.log(JSON.stringify({
        controller: {
          ip,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          originalPixelCount: original.pixelCount,
          originalActiveProgramId: original.activeProgramId,
          measuredOutputProfile: 'Controller-native serial output',
          fastestOutputProfile: process.env.ISSUE537_FAST_PROFILE_IP
            ? `separate Controller requested at ${process.env.ISSUE537_FAST_PROFILE_IP}`
            : 'not available through getConfig or mutation protocol; no expander/parallel profile was claimed',
        },
        measurements,
      }, null, 2))
    } catch (error) {
      runError = error
    } finally {
      try {
        await ensureConnected(connection)
        connection.setActiveProgram(original.activeProgramId)
        if (original.pixelCount) connection.setPixelCount(original.pixelCount, false)
        const restored = await waitForControllerConfig(
          () => connection.getConfig(),
          { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount },
          20_000,
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
    expect(measurements).toHaveLength(ISSUE537_PIXEL_COUNTS.length)
  }, 300_000)
})

async function measureWithDrain(
  connection: PixelblazeConnection,
  source: string,
  compile: (source: string) => Uint8Array,
) {
  await ensureConnected(connection)
  const drainId = makeProgramId()
  connection.pushByteCode(compile('export function render(index) { rgb(0, 0, 0) }'), { id: drainId, name: '' })
  const active = await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: drainId }, 15_000)
  if (active.activeProgramId !== drainId) throw new Error('Drain Pattern did not activate before the feedback artifact.')
  return pushAndMeasureControllerSource(connection, source, compile, 0, {
    activationTimeoutMs: 20_000,
    settleMs: 2_000,
    sampleMs: 8_000,
  })
}

async function ensureConnected(connection: PixelblazeConnection): Promise<void> {
  try {
    await connection.getConfig()
  } catch {
    await sleep(1_000)
    await connection.connect()
    await connection.getConfig()
  }
}
