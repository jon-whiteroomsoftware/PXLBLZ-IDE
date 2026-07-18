import { PixelblazeConnection, type PixelblazeVmError } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE546_ARRAY_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

function patternWithAllocations(declarations: string[]): string {
  return `${declarations.join('\n')}
export function beforeRender(delta) {}
export function render(index) { rgb(0, 0, 0) }
export function render2D(index, x, y) { rgb(0, 0, 0) }`
}

const arena = Array.from({ length: 3 }, (_, index) => `var arena${index} = array(2000)`)
const stateElements = 12 * 4 + 12 * 7
const cases = [
  {
    name: 'three-plane-arena',
    accountedWords: 3 * (2_000 + 4),
    source: patternWithAllocations(arena),
  },
  {
    name: 'arena-plus-one-packed-state-bank',
    accountedWords: 3 * (2_000 + 4) + stateElements + 4,
    source: patternWithAllocations([...arena, `var state = array(${stateElements})`]),
  },
  {
    name: 'exact-27-array-show-layout',
    accountedWords: 3 * (2_000 + 4) + 12 * (4 + 4) + 12 * (7 + 4),
    source: patternWithAllocations([
      ...arena,
      ...Array.from({ length: 12 }, (_, index) => `var state4_${index} = array(4)`),
      ...Array.from({ length: 12 }, (_, index) => `var state7_${index} = array(7)`),
    ]),
  },
]

describe('Pixelblaze array allocation isolation for #546', () => {
  it.skipIf(!runHardware)('tests the exact Show array layout and restores Controller state', async () => {
    const compile = await fetchControllerCompiler(ip)
    const connection = new PixelblazeConnection({
      host: ip,
      webSocketFactory: nodeWebSocketFactory,
      requestTimeoutMs: 15_000,
      connectTimeoutMs: 10_000,
      pingIntervalMs: 2_000,
    })
    const vmErrors: PixelblazeVmError[] = []
    connection.on('vm-error', (detail) => vmErrors.push(detail as PixelblazeVmError))
    await connection.connect()
    const original = await connection.getConfig()
    if (!original.activeProgramId) {
      connection.close()
      throw new Error('Controller did not report an active program; refusing a non-reversible probe')
    }

    let runError: unknown
    const measurements = []
    try {
      for (const candidate of cases) {
        const vmErrorStart = vmErrors.length
        try {
          const measurement = await pushAndMeasureControllerSource(connection, candidate.source, compile, 0, {
            settleMs: 500,
            sampleMs: 1_500,
            activationTimeoutMs: 10_000,
          })
          measurements.push({
            name: candidate.name,
            accountedWords: candidate.accountedWords,
            activated: true,
            measurement,
            vmErrors: vmErrors.slice(vmErrorStart),
          })
        } catch (error) {
          measurements.push({
            name: candidate.name,
            accountedWords: candidate.accountedWords,
            activated: false,
            error: error instanceof Error ? error.message : String(error),
            vmErrors: vmErrors.slice(vmErrorStart),
          })
          break
        }
      }
      console.log(JSON.stringify({ controller: { boardType: original.boardType, firmwareVersion: original.firmwareVersion }, measurements }, null, 2))
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
          throw new Error(`Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount})`)
        }
      } catch (error) {
        runError = runError == null ? error : new AggregateError([runError, error], 'probe and restoration both failed')
      } finally {
        connection.close()
      }
    }
    if (runError != null) throw runError
    expect(measurements).toHaveLength(cases.length)
    expect(measurements.every((measurement) => measurement.activated)).toBe(true)
  }, 120_000)
})
