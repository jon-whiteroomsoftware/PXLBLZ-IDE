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
import { WAVE2_PIXEL_COUNTS, wave2Fixtures } from './issue555'
import { FOLD_FIXTURE_IDS, foldIdentityBlends } from './issue904Fold'

const runHardware = process.env.ISSUE904_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const measurementOptions = { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: 4_000 }

interface FoldLadderRow {
  fixture: string
  pixelCount: number
  variant: 'baseline' | 'folded'
  sourceBytes: number
  bytecodeBytes: number
  activationMs: number
  fps: { mean: number; median: number; min: number; max: number; samples: number }
}

describe('identity-blend fold ladder on hardware (#904 stage 2)', () => {
  it.skipIf(!runHardware)('measures baseline/folded pairs at three sizes and restores Controller state', async () => {
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

    // Historical measurement tool: with the #904 emitter change landed, the
    // compiler emits no identity blends, so this ladder has nothing to pair
    // and skips. The recorded pre-pass run lives in issue904-fold-ladder.json.
    const fixtures = wave2Fixtures
      .filter((fixture) => (FOLD_FIXTURE_IDS as readonly string[]).includes(fixture.id))
      .map((fixture) => ({ fixture, folded: foldIdentityBlends(fixture.artifact.code) }))
      .filter(({ folded }) => folded.blendCount > 0)
    if (fixtures.length === 0) {
      connection.close()
      console.log('No fixture carries identity blends any more (#904 landed); nothing to measure.')
      return
    }

    let runError: unknown
    const rows: FoldLadderRow[] = []
    try {
      for (const pixelCount of WAVE2_PIXEL_COUNTS) {
        connection.setPixelCount(pixelCount, false)
        await sleep(1_000)
        for (const { fixture, folded } of fixtures) {
          for (const [variant, code] of [
            ['baseline', fixture.artifact.code],
            ['folded', folded.code],
          ] as const) {
            process.stdout.write(`  ${fixture.id} ${variant} @ ${pixelCount} px ... `)
            const measured = await pushAndMeasureControllerSource(
              connection,
              code,
              compile,
              fixture.artifact.summary.resources.totalWords,
              measurementOptions,
            )
            rows.push({
              fixture: fixture.id,
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
        folds: fixtures.map(({ fixture, folded }) => ({
          fixture: fixture.id,
          blendCount: folded.blendCount,
          initCount: folded.initCount,
          targets: folded.targets,
        })),
        rows,
      }
      const outputPath = join(process.cwd(), 'test/perf-harness/issue904-fold-ladder.json')
      writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
      console.log(`\nWrote ${outputPath}\n`)
      for (const { fixture } of fixtures) {
        for (const pixelCount of WAVE2_PIXEL_COUNTS) {
          const baseline = rows.find((row) => row.fixture === fixture.id && row.pixelCount === pixelCount && row.variant === 'baseline')
          const foldedRow = rows.find((row) => row.fixture === fixture.id && row.pixelCount === pixelCount && row.variant === 'folded')
          if (!baseline || !foldedRow) continue
          const delta = ((foldedRow.fps.median - baseline.fps.median) / baseline.fps.median) * 100
          console.log(
            `${fixture.id} @ ${pixelCount}: ${baseline.fps.median.toFixed(3)} -> ${foldedRow.fps.median.toFixed(3)} median FPS (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%)`,
          )
        }
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
  }, 1_800_000)
})
