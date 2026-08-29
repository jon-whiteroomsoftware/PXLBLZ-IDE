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
import { WAVE2_PIXEL_COUNTS } from './issue555'
import { buildTransitionHeavyArtifact, dedupTransitionArms } from './issue905'

const runHardware = process.env.ISSUE905_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
// The fixture spends ~84% of its 19 s loop inside live/live crossfades, so
// one full-loop sample window prices the transition arm; the long sample
// keeps scene-mix noise bounded (#720 wipe caveat).
const measurementOptions = { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: 19_000 }

interface DedupLadderRow {
  pixelCount: number
  variant: 'baseline' | 'deduped'
  sourceBytes: number
  bytecodeBytes: number
  activationMs: number
  fps: { mean: number; median: number; min: number; max: number; samples: number }
}

describe('transition-arm dedup ladder on hardware (#905 stage 1)', () => {
  it.skipIf(!runHardware)('measures the baseline/deduped pair at three sizes and restores Controller state', async () => {
    const artifact = buildTransitionHeavyArtifact()
    const deduped = dedupTransitionArms(artifact.code)
    // Historical measurement tool: with the #905 emitter dedupe landed, the
    // compiler emits the deduped form natively, so this ladder has nothing
    // to pair. The recorded pre-pass run lives in issue905-dedup-ladder.json.
    if (deduped.code === artifact.code) {
      console.log('The compiler already emits the deduped form (#905 landed); nothing to measure.')
      return
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
    // Restoration reselects a *saved* Pattern; a transient run-only Pattern
    // would be destroyed by the probe push. Refuse unless the active id is
    // in the device inventory.
    const savedPrograms = await connection.listPrograms()
    if (!savedPrograms.some((program) => program.id === original.activeProgramId)) {
      connection.close()
      throw new Error(
        `Active Pattern ${original.activeProgramId} is not in the saved inventory; refusing a non-restorable probe.`,
      )
    }

    let runError: unknown
    const rows: DedupLadderRow[] = []
    try {
      for (const pixelCount of WAVE2_PIXEL_COUNTS) {
        connection.setPixelCount(pixelCount, false)
        await sleep(1_000)
        for (const [variant, code] of [
          ['baseline', artifact.code],
          ['deduped', deduped.code],
        ] as const) {
          process.stdout.write(`  ${variant} @ ${pixelCount} px ... `)
          const measured = await pushAndMeasureControllerSource(
            connection,
            code,
            compile,
            artifact.summary.resources.totalWords,
            measurementOptions,
          )
          rows.push({
            pixelCount,
            variant,
            sourceBytes: code.length,
            bytecodeBytes: measured.bytecodeBytes,
            activationMs: measured.activationMs,
            fps: measured.fps,
          })
          console.log(`${measured.fps.median.toFixed(3)} median FPS`)
        }
      }

      const report = {
        generatedAt: new Date().toISOString(),
        controller: {
          ip,
          name: original.name,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          outputProfile: declaredOutputProfileStamp(),
          ...measurementOptions,
        },
        transform: {
          dedupedArms: deduped.dedupedArms,
          wrapperCopyChains: deduped.wrapperCopyChains,
        },
        rows,
      }
      const outputPath = join(process.cwd(), 'test/perf-harness/issue905-dedup-ladder.json')
      writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
      console.log(`\nWrote ${outputPath}\n`)
      for (const pixelCount of WAVE2_PIXEL_COUNTS) {
        const baseline = rows.find((row) => row.pixelCount === pixelCount && row.variant === 'baseline')
        const dedupedRow = rows.find((row) => row.pixelCount === pixelCount && row.variant === 'deduped')
        if (!baseline || !dedupedRow) continue
        const delta = ((dedupedRow.fps.median - baseline.fps.median) / baseline.fps.median) * 100
        console.log(
          `@ ${pixelCount}: ${baseline.fps.median.toFixed(3)} -> ${dedupedRow.fps.median.toFixed(3)} median FPS (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%)`,
        )
      }
    } catch (error) {
      runError = error
    } finally {
      // The socket may have dropped during the run. A dropped
      // PixelblazeConnection is never reused: its delayed close handler
      // would race a second socket generation's pending requests, so
      // restoration builds a fresh connection object instead (#906).
      let restore = connection
      try {
        try {
          await connection.getConfig()
        } catch {
          connection.close()
          await sleep(2_000)
          restore = new PixelblazeConnection({
            host: ip,
            webSocketFactory: nodeWebSocketFactory,
            requestTimeoutMs: 15_000,
            pingIntervalMs: 0,
          })
          restore.on('error', (error) => console.error('restore socket:', error))
          await restore.connect()
        }
        restore.setActiveProgram(original.activeProgramId)
        if (original.pixelCount != null) restore.setPixelCount(original.pixelCount, false)
        const restored = await waitForControllerConfig(
          () => restore.getConfig(),
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
            : new AggregateError([runError, restoreError], 'Ladder and restoration both failed.')
        }
      } finally {
        if (restore !== connection) restore.close()
        connection.close()
      }
    }
    if (runError != null) throw runError
    expect(rows.length).toBeGreaterThan(0)
  }, 1_200_000)
})
