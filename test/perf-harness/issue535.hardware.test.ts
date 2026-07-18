import { makeProgramId } from '../../src/engine/bytecodePush'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import type { GeneratedShowArtifact } from '../../src/engine/showCompiler'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerArtifact,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE535_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

describe('whole-frame Refresh Controller probe (#535)', () => {
  it.skipIf(!runHardware)('measures Live, Freeze, and authored Refresh cadences with restoration', async () => {
    const {
      buildIssue535Artifacts,
      ISSUE535_PIXEL_COUNTS,
      ISSUE535_REFRESH_CADENCES_MS,
      ISSUE535_ROLLING_SLICES,
    } = await import('./issue535')
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
    const measurements: unknown[] = []
    try {
      for (const pixelCount of ISSUE535_PIXEL_COUNTS) {
        await ensureConnected(connection)
        if ((await connection.getConfig()).pixelCount !== pixelCount) {
          connection.setPixelCount(pixelCount, false)
          await sleep(2_000)
          await ensureConnected(connection)
        }
        const artifacts = buildIssue535Artifacts(pixelCount)
        const variants: Array<{ policy: string; artifact: GeneratedShowArtifact }> = [
          { policy: 'live', artifact: artifacts.live },
          { policy: 'freeze-at-entry', artifact: artifacts.freeze },
          ...ISSUE535_REFRESH_CADENCES_MS.map((cadenceMs) => ({
            policy: `refresh-${cadenceMs}ms`,
            artifact: artifacts.refresh.get(cadenceMs)!,
          })),
          ...ISSUE535_ROLLING_SLICES.map((slices) => ({
            policy: `rolling-${slices}-slices`,
            artifact: artifacts.rollingRefresh.get(slices)!,
          })),
        ]
        const measured = []
        for (const variant of variants) {
          process.stdout.write(`  ${pixelCount} pixels ${variant.policy} ... `)
          const measurement = await measureWithReconnect(connection, variant.artifact, compile)
          console.log(`${measurement.fps.median.toFixed(3)} median FPS`)
          measured.push({
            policy: variant.policy,
            measurement,
          })
        }
        const live = measured.find((entry) => entry.policy === 'live')!.measurement
        measurements.push({
          pixelCount,
          variants: measured.map((entry) => ({
            ...entry,
            meanChangePercent: (entry.measurement.fps.mean / live.fps.mean - 1) * 100,
            medianChangePercent: (entry.measurement.fps.median / live.fps.median - 1) * 100,
            frameTimeSpreadMs: 1_000 / entry.measurement.fps.min - 1_000 / entry.measurement.fps.max,
          })),
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
    expect(measurements).toHaveLength(ISSUE535_PIXEL_COUNTS.length)
  }, 300_000)
})

async function activateDrain(
  connection: PixelblazeConnection,
  compile: (source: string) => Uint8Array,
): Promise<void> {
  const programId = makeProgramId()
  connection.pushByteCode(
    compile('export function render(index) { rgb(0, 0, 0) }'),
    { id: programId, name: '' },
  )
  const active = await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: programId }, 15_000)
  if (active.activeProgramId !== programId) throw new Error('Drain Pattern did not activate before the large replacement.')
}

async function measureWithReconnect(
  connection: PixelblazeConnection,
  artifact: GeneratedShowArtifact,
  compile: (source: string) => Uint8Array,
) {
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await ensureConnected(connection)
      await activateDrain(connection, compile)
      return await pushAndMeasureControllerArtifact(connection, artifact, compile, {
        activationTimeoutMs: 20_000,
        settleMs: 2_000,
        sampleMs: 8_000,
      })
    } catch (error) {
      lastError = error
      if (attempt < 2) await sleep(2_000)
    }
  }
  throw lastError
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
