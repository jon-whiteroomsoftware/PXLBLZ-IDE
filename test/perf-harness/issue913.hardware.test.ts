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
import { HOLD_FACTORS, applySpatialHold, buildHoldBaseArtifact } from './issue913'

const runHardware = process.env.ISSUE913_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const measurementOptions = { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: 6_000 }

describe('spatial sample-and-hold ladder on hardware (#913 spike)', () => {
  it.skipIf(!runHardware)('measures baseline and K=2/4/8 holds at three sizes and restores Controller state', async () => {
    const artifact = buildHoldBaseArtifact()
    const variants: Array<{ name: string; code: string }> = [
      { name: 'baseline', code: artifact.code },
      ...HOLD_FACTORS.map((k) => ({ name: `hold-k${k}`, code: applySpatialHold(artifact.code, k).code })),
    ]

    const compile = await fetchControllerCompiler(ip)
    const connection = new PixelblazeConnection({
      host: ip,
      webSocketFactory: nodeWebSocketFactory,
      requestTimeoutMs: 15_000,
      pingIntervalMs: 0,
    })
    connection.on('error', (error) => console.error('controller socket:', error))
    await connection.connect()
    let runError: unknown
    let original: Awaited<ReturnType<typeof connection.getConfig>> | undefined
    const pushedProgramIds: string[] = []
    const rows: Array<{
      pixelCount: number
      variant: string
      bytecodeBytes: number
      fps: { mean: number; median: number; min: number; max: number; samples: number }
    }> = []
    try {
      original = await connection.getConfig()
      if (!original.activeProgramId) {
        throw new Error('Controller did not report an active Pattern; refusing a non-reversible probe.')
      }
      const savedPrograms = await connection.listPrograms()
      if (!savedPrograms.some((program) => program.id === original.activeProgramId)) {
        throw new Error(
          `Active Pattern ${original.activeProgramId} is not in the saved inventory; refusing a non-restorable probe.`,
        )
      }
      // Live control tuning cannot be restored via the WS API (bound variable
      // values, not UI inputs — see issue914.hardware.test.ts); warn so any
      // loss is visible rather than silent.
      if (original.activeControls && Object.keys(original.activeControls).length > 0) {
        console.warn(
          'Active Pattern has live control values; restoration reloads stored values (live tuning is not recoverable via the WS API).',
        )
      }

      for (const pixelCount of WAVE2_PIXEL_COUNTS) {
        connection.setPixelCount(pixelCount, false)
        // setPixelCount is fire-and-forget: read the applied count back before
        // recording rows under it, so a delayed or rejected write cannot label
        // measurements with a pixel count the device never adopted.
        const applyDeadline = Date.now() + 10_000
        let applied = await connection.getConfig()
        while (Date.now() < applyDeadline && applied.pixelCount !== pixelCount) {
          await sleep(250)
          applied = await connection.getConfig()
        }
        if (applied.pixelCount !== pixelCount) {
          throw new Error(
            `Controller did not apply pixelCount ${pixelCount} (reports ${applied.pixelCount}).`,
          )
        }
        for (const variant of variants) {
          process.stdout.write(`  ${variant.name} @ ${pixelCount} px ... `)
          const measured = await pushAndMeasureControllerSource(
            connection,
            variant.code,
            compile,
            artifact.summary.resources.totalWords,
            measurementOptions,
          )
          pushedProgramIds.push(measured.programId)
          rows.push({
            pixelCount,
            variant: variant.name,
            bytecodeBytes: measured.bytecodeBytes,
            fps: measured.fps,
          })
          console.log(`${measured.fps.median.toFixed(3)} median FPS`)
        }
      }

      const report = {
        generatedAt: new Date().toISOString().slice(0, 10),
        device: original.name ?? ip,
        boardType: original.boardType,
        firmwareVersion: original.firmwareVersion ?? 'unknown',
        outputProfile: declaredOutputProfileStamp(),
        fixture: 'hsv-steady-state (directColorSinks: false)',
        rows,
      }
      writeFileSync(join(process.cwd(), 'test/perf-harness/issue913-hold-ladder.json'), `${JSON.stringify(report, null, 2)}\n`)
    } catch (error) {
      runError = error
    } finally {
      // A dropped PixelblazeConnection is never reused (#906 pattern).
      let restore = connection
      try {
        if (original?.activeProgramId) {
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
          // Delete ONLY inventory entries this probe minted itself — never an
          // inventory diff (see issue914.hardware.test.ts).
          if (pushedProgramIds.length > 0) {
            try {
              const afterPrograms = await restore.listPrograms()
              const persisted = new Set(afterPrograms.map((program) => program.id))
              for (const id of pushedProgramIds) {
                if (persisted.has(id)) restore.deleteProgram(id)
              }
            } catch (cleanupError) {
              console.error('probe-program cleanup failed:', cleanupError)
            }
          }
          if (
            restored.activeProgramId !== original.activeProgramId
            || restored.pixelCount !== original.pixelCount
          ) {
            const restoreError = new Error(
              `Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount}).`,
            )
            runError = runError == null ? restoreError : new AggregateError([runError, restoreError], 'Ladder and restoration both failed.')
          }
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
