import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import { makeProgramId } from '../../src/engine/bytecodePush'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE540_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const pixelCounts = [256, 1_000, 2_000]
const drainSource = `export function beforeRender(delta) {}
export function render(index) { rgb(0, 0, 0) }
`

describe('Pattern field/shading diagnostic hardware matrix (#540)', () => {
  it.skipIf(!runHardware)('measures two and five consumers and restores Controller state', async () => {
    const { buildIssue540PrototypeSources } = await import('./issue540.prototype')
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
    const drain = async () => {
      const programId = makeProgramId()
      connection.pushByteCode(compile(drainSource), { id: programId, name: '' })
      const activated = await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: programId })
      if (activated.activeProgramId !== programId) throw new Error('Drain Pattern did not activate')
    }
    try {
      for (const pixelCount of pixelCounts) {
        if ((await connection.getConfig()).pixelCount !== pixelCount) {
          connection.setPixelCount(pixelCount, false)
          await sleep(1_000)
        }
        for (const consumerCount of [2, 5]) {
          const sources = buildIssue540PrototypeSources(consumerCount, pixelCount)
          const options = { settleMs: 1_500, sampleMs: 3_000 }
          await drain()
          const direct = await pushAndMeasureControllerSource(connection, sources.direct, compile, 0, options)
          await drain()
          const shared = await pushAndMeasureControllerSource(
            connection,
            sources.shared,
            compile,
            pixelCount + 4,
            options,
          )
          measurements.push({
            pixelCount,
            consumerCount,
            direct,
            shared,
            meanChangePercent: (shared.fps.mean / direct.fps.mean - 1) * 100,
            medianChangePercent: (shared.fps.median / direct.fps.median - 1) * 100,
          })
        }
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
    expect(measurements).toHaveLength(pixelCounts.length * 2)
  }, 240_000)
})
