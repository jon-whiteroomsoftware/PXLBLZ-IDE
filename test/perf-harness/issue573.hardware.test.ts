// #573: activation and paired FPS for a Show the re-priced packed-routing
// planner newly admits (2,000 px, two layouts, 4,000 table words - rejected
// by the pre-#573 element cap). The counterfactual build is the same recipe
// compiled with packedRoutingRepricing: false (range-branches).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import { compileShow, type ShowRecipe } from '../../src/engine/showCompiler'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE573_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const measurementOptions = { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: 4_000 }

// 16-pixel strip interleave over two routes with a swapped second layout:
// the deep-chain shape the depth-gated packed selection admits (the shallow
// contiguous shape is the recorded negative in issue573-depth-negative.json).
function largePackedRecipe(pixelCount: number, blockSize = 16): ShowRecipe {
  const blockRanges = (parity: 0 | 1) => {
    const ranges: Array<{ start: number; end: number }> = []
    for (let start = 0; start < pixelCount; start += blockSize) {
      const block = start / blockSize
      const begin = block === 0 ? 0 : block === 1 ? start - 4 : start
      const end = block === 0 ? start + blockSize - 5 : Math.min(pixelCount, start + blockSize) - 1
      if (block % 2 === parity) ranges.push({ start: begin, end })
    }
    return ranges
  }
  const layout = (id: string, redParity: 0 | 1) => ({
    id,
    name: id,
    zones: [
      { id: `${id}-red`, name: 'red', ranges: blockRanges(redParity) },
      { id: `${id}-blue`, name: 'blue', ranges: blockRanges(redParity === 0 ? 1 : 0) },
    ],
  })
  const striped = layout('striped', 0)
  return {
    masterPixelCount: pixelCount,
    clips: [
      { id: 'red', zone: 'red', source: 'export function render(index) { rgb(1, index / pixelCount, 0) }' },
      { id: 'blue', zone: 'blue', source: 'export function render(index) { rgb(0, index / pixelCount, 1) }' },
    ],
    zones: striped.zones,
    routingLayouts: [striped, layout('swapped', 1)],
    routingSwitches: [{ atMs: 1_000, layoutId: 'swapped' }],
    loopDurationMs: 2_000,
  }
}

describe('re-priced packed routing on the Controller (#573)', () => {
  it.skipIf(!runHardware)('activates and measures the newly-qualifying fixture in both representations', async () => {
    const packed = compileShow(largePackedRecipe(2_000), {})
    const branches = compileShow(largePackedRecipe(2_000), {}, { packedRoutingRepricing: false })
    if (packed.summary.routingRepresentation !== 'packed-pixels'
      || branches.summary.routingRepresentation !== 'range-branches') {
      throw new Error('Fixture no longer exercises the intended representations.')
    }
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
    let report: Record<string, unknown> | undefined
    try {
      connection.setPixelCount(2_000, false)
      await sleep(1_000)
      const measure = async (label: string, artifact: typeof packed) => {
        const measured = await pushAndMeasureControllerSource(
          connection,
          artifact.code,
          compile,
          artifact.summary.resources.totalWords,
          measurementOptions,
        )
        return {
          label,
          representation: artifact.summary.routingRepresentation,
          sourceBytes: artifact.code.length,
          bytecodeBytes: measured.bytecodeBytes,
          activationMs: measured.activationMs,
          fps: measured.fps,
        }
      }
      const branchesRow = await measure('range-branches', branches)
      const packedRow = await measure('packed-pixels', packed)
      report = {
        generatedAt: new Date().toISOString(),
        device: { name: original.name, firmwareVersion: original.firmwareVersion },
        fixture: '2,000 px, two layouts, 16-px strip interleave (4,000 table words, ~63 expected comparisons)',
        rows: [branchesRow, packedRow],
      }
      writeFileSync(
        join(process.cwd(), 'test/perf-harness/issue573-repricing-report.json'),
        `${JSON.stringify(report, null, 2)}\n`,
      )
      console.log(JSON.stringify(report))
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
        if (original.pixelCount != null) connection.setPixelCount(original.pixelCount, false)
        const restored = await waitForControllerConfig(
          () => connection.getConfig(),
          { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount },
        )
        if (
          restored.activeProgramId !== original.activeProgramId
          || restored.pixelCount !== original.pixelCount
        ) {
          const restoreError = new Error('Controller state did not restore.')
          runError = runError == null ? restoreError : new AggregateError([runError, restoreError])
        }
      } finally {
        connection.close()
      }
    }
    if (runError != null) throw runError
    expect(report).toBeTruthy()
  }, 300_000)
})
