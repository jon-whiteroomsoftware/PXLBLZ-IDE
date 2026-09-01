import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  declaredOutputProfileStamp,
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import { ISSUE929_PIXEL_COUNTS, issue929Fixtures } from './issue929'

// ISSUE929_HARDWARE=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue929.hardware.test.ts
const runHardware = process.env.ISSUE929_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const measurementOptions = { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: 4_000 }

describe('generated wrapper inlining paired ladder (#929)', () => {
  it.skipIf(!runHardware)('measures pass-off against pass-on at 256/500 px and restores Controller state', async () => {
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
    const savedPrograms = await connection.listPrograms().catch((error) => {
      connection.close()
      throw error
    })
    if (!savedPrograms.some((program) => program.id === original.activeProgramId)) {
      connection.close()
      throw new Error(`Active Pattern ${original.activeProgramId} is not in the saved inventory; refusing a non-restorable probe.`)
    }

    let runError: unknown
    const rows: unknown[] = []
    try {
      for (const pixelCount of ISSUE929_PIXEL_COUNTS) {
        connection.setPixelCount(pixelCount, false)
        await sleep(1_000)
        for (const fixture of issue929Fixtures()) {
          if (fixture.byteIdentical) {
            rows.push({ fixture: fixture.id, pixelCount, byteIdentical: true })
            continue
          }
          const measured: Record<string, unknown> = {}
          // off, on, off, on: two pairs so drift between pushes averages out.
          for (const variant of ['off', 'on', 'off', 'on'] as const) {
            const artifact = fixture[variant]
            process.stdout.write(`  ${fixture.id}:${variant} @ ${pixelCount} ... `)
            const result = await pushAndMeasureControllerSource(
              connection,
              artifact.code,
              compile,
              artifact.summary.resources.totalWords,
              measurementOptions,
            )
            console.log(`${result.fps.median.toFixed(3)} median FPS`)
            const list = (measured[variant] as unknown[] | undefined) ?? []
            list.push({
              bytecodeBytes: result.bytecodeBytes,
              sourceBytes: artifact.summary.artifactBytes,
              persistentGlobals: artifact.summary.resources.persistentGlobals,
              fps: result.fps,
            })
            measured[variant] = list
          }
          rows.push({ fixture: fixture.id, pixelCount, byteIdentical: false, ...measured })
        }
      }
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
        if (restored.activeProgramId !== original.activeProgramId || restored.pixelCount !== original.pixelCount) {
          const restoreError = new Error(`Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount}).`)
          runError = runError == null ? restoreError : new AggregateError([runError, restoreError], 'Probe and restoration both failed.')
        }
      } finally {
        connection.close()
      }
    }
    const report = {
      generatedAt: new Date().toISOString(),
      controller: {
        ip,
        name: original.name,
        boardType: original.boardType,
        firmwareVersion: original.firmwareVersion,
        outputProfile: declaredOutputProfileStamp(undefined),
        ...measurementOptions,
      },
      rows,
      partial: runError != null,
    }
    const outputPath = join(process.cwd(), 'test/perf-harness/issue929-inline-ladder.json')
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Wrote ${outputPath}`)
    if (runError != null) throw runError
    expect(rows.length).toBeGreaterThan(0)
  }, 1_800_000)
})
