import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import { WAVE2_PIXEL_COUNTS, wave2Fixtures, wave2ResourceRow } from './issue555'

const runHardware = process.env.ISSUE555_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
// A later "after" pass on an optimized build sets WAVE2_LABEL to keep paired
// reports side by side (wave2-baselines.<label>.json).
const label = process.env.WAVE2_LABEL ?? 'baseline'
const measurementOptions = { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: 4_000 }

interface Wave2MeasurementRow {
  fixture: string
  pixelCount: number
  sourceBytes: number
  expandedSourceBytes: number
  bytecodeBytes: number
  vmWords: number
  persistentGlobals: number
  activationMs: number
  fps: { mean: number; median: number; min: number; max: number; samples: number }
}

describe('wave-2 Controller baseline measurements (#555)', () => {
  it.skipIf(!runHardware)('measures all five fixtures at three sizes and restores Controller state', async () => {
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
    const rows: Wave2MeasurementRow[] = []
    try {
      for (const pixelCount of WAVE2_PIXEL_COUNTS) {
        connection.setPixelCount(pixelCount, false)
        await sleep(1_000)
        for (const fixture of wave2Fixtures) {
          process.stdout.write(`  ${fixture.id} @ ${pixelCount} px ... `)
          const measured = await pushAndMeasureControllerSource(
            connection,
            fixture.artifact.code,
            compile,
            fixture.artifact.summary.resources.totalWords,
            measurementOptions,
          )
          const resources = wave2ResourceRow(fixture)
          rows.push({
            fixture: fixture.id,
            pixelCount,
            ...resources,
            bytecodeBytes: measured.bytecodeBytes,
            activationMs: measured.activationMs,
            fps: measured.fps,
          })
          console.log(`${measured.fps.median.toFixed(3)} median FPS (${measured.fps.samples} samples)`)
        }
      }

      const report = {
        generatedAt: new Date().toISOString(),
        label,
        controller: {
          ip,
          name: original.name,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          originalPixelCount: original.pixelCount,
          originalActiveProgramId: original.activeProgramId,
          outputProfile: 'native-serial (assumed); getConfig does not expose output topology',
          settleMs: measurementOptions.settleMs,
          sampleMs: measurementOptions.sampleMs,
        },
        fixtures: wave2Fixtures.map((fixture) => ({ id: fixture.id, notes: fixture.notes })),
        rows,
      }
      const outputPath = join(process.cwd(), `test/perf-harness/wave2-baselines.${label}.json`)
      writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
      console.log(`\nWrote ${outputPath}\n`)
      console.log(markdownTable(rows))
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
          const restoreError = new Error(
            `Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount}).`,
          )
          runError = runError == null
            ? restoreError
            : new AggregateError([runError, restoreError], 'Probe and restoration both failed.')
        }
      } finally {
        connection.close()
      }
    }
    if (runError != null) throw runError
    expect(rows.length).toBe(WAVE2_PIXEL_COUNTS.length * wave2Fixtures.length)
  }, 900_000)
})

function markdownTable(rows: Wave2MeasurementRow[]): string {
  const header = '| fixture | px | source B | expanded B | bytecode B | VM words | globals | median FPS | mean FPS | frame ms (median) |'
  const rule = '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
  const body = rows.map((row) => [
    `| ${row.fixture}`,
    row.pixelCount,
    row.sourceBytes,
    row.expandedSourceBytes,
    row.bytecodeBytes,
    row.vmWords,
    row.persistentGlobals,
    row.fps.median.toFixed(3),
    row.fps.mean.toFixed(3),
    `${(1_000 / row.fps.median).toFixed(3)} |`,
  ].join(' | '))
  return [header, rule, ...body].join('\n')
}
