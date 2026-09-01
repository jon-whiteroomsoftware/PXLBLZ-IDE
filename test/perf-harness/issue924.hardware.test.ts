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
import {
  ISSUE924_DISPATCH_PIXEL_COUNTS,
  ISSUE924_DISPATCH_PROBES,
  ISSUE924_PIXEL_COUNTS,
  dispatchProbeCode,
  issue924Fixtures,
} from './issue924'
import { attributeShowFrameTime, type ShowAttributionArtifact } from './showAttribution'

// ISSUE924_HARDWARE=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue924.hardware.test.ts
// ISSUE924_ONLY=<fixture-id,...> limits the attribution ladder; ISSUE924_SKIP_DISPATCH=1 skips the dispatch probes.
const runHardware = process.env.ISSUE924_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const only = process.env.ISSUE924_ONLY?.split(',').map((id) => id.trim()).filter(Boolean)
const skipDispatch = process.env.ISSUE924_SKIP_DISPATCH === '1'
const label = process.env.ISSUE924_LABEL ?? 'baseline'
const activationTimeoutMs = 20_000
const settleMs = 2_000

interface MeasuredArtifact {
  id: string
  sourceBytes: number
  bytecodeBytes: number
  vmWords: number
  persistentGlobals: number
  activationMs: number
  fps: { mean: number; median: number; min: number; max: number; samples: number }
  frameMs: { mean: number; median: number }
}

describe('wave-5 Controller attribution at 256/500 px (#924)', () => {
  it.skipIf(!runHardware)('measures the ladder on heavy fixtures, the dispatch probes, and restores Controller state', async () => {
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
    const fixtureReports: unknown[] = []
    const dispatchRows: unknown[] = []
    try {
      async function measure(id: string, code: string, vmWords: number, persistentGlobals: number, sampleMs: number): Promise<MeasuredArtifact> {
        process.stdout.write(`  ${id} ... `)
        const measured = await pushAndMeasureControllerSource(connection, code, compile, vmWords, {
          activationTimeoutMs,
          settleMs,
          sampleMs,
        })
        console.log(`${measured.fps.median.toFixed(3)} median FPS (${measured.fps.samples} samples)`)
        return {
          id,
          sourceBytes: measured.sourceBytes,
          bytecodeBytes: measured.bytecodeBytes,
          vmWords,
          persistentGlobals,
          activationMs: measured.activationMs,
          fps: measured.fps,
          frameMs: { mean: 1_000 / measured.fps.mean, median: 1_000 / measured.fps.median },
        }
      }
      const rung = (fixtureId: string, kind: string, artifact: ShowAttributionArtifact, sampleMs: number) => (
        measure(`${fixtureId}:${kind}`, artifact.code, artifact.vmWords, artifact.persistentGlobals, sampleMs)
      )

      const fixtures = issue924Fixtures().filter((fixture) => !only || only.includes(fixture.id))
      for (const pixelCount of ISSUE924_PIXEL_COUNTS) {
        connection.setPixelCount(pixelCount, false)
        await sleep(1_000)
        console.log(`-- ${pixelCount} px`)
        for (const fixture of fixtures) {
          const trivialOutput = await rung(fixture.id, 'trivial-output', fixture.artifacts.trivialOutput, 4_000)
          const constantMembers = await rung(fixture.id, 'constant-members', fixture.artifacts.constantMembers, 4_000)
          const full = await rung(fixture.id, 'full', fixture.artifacts.full, fixture.sampleMs)
          const attribution = attributeShowFrameTime({
            trivialOutput: { meanFps: trivialOutput.fps.mean, medianFps: trivialOutput.fps.median },
            constantMembers: { meanFps: constantMembers.fps.mean, medianFps: constantMembers.fps.median },
            full: { meanFps: full.fps.mean, medianFps: full.fps.median },
          })
          fixtureReports.push({
            id: fixture.id,
            routing: fixture.routing,
            pixelCount,
            masterPixelCount: fixture.masterPixelCount,
            notes: fixture.notes,
            artifacts: { trivialOutput, constantMembers, full },
            attribution,
          })
        }
      }

      if (!skipDispatch) {
        console.log('-- dispatch probes')
        for (const pixelCount of ISSUE924_DISPATCH_PIXEL_COUNTS) {
          connection.setPixelCount(pixelCount, false)
          await sleep(1_000)
          for (const probe of ISSUE924_DISPATCH_PROBES) {
            const measured = await measure(`${probe.id}@${pixelCount}`, dispatchProbeCode(probe.source), 0, 0, 4_000)
            dispatchRows.push({ probe: probe.id, pixelCount, ...measured })
          }
        }
      }
    } catch (error) {
      runError = error
    } finally {
      // #906/#915: a dropped socket's delayed close handler can clear a
      // reconnected socket's pending requests, so restoration never reuses
      // the probe connection object once it has failed.
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
        if (restored.activeProgramId !== original.activeProgramId || restored.pixelCount !== original.pixelCount) {
          const restoreError = new Error(
            `Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount}).`,
          )
          runError = runError == null ? restoreError : new AggregateError([runError, restoreError], 'Probe and restoration both failed.')
        }
      } finally {
        restore.close()
        if (restore !== connection) connection.close()
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
        outputProfile: declaredOutputProfileStamp(undefined),
        settleMs,
        activationTimeoutMs,
      },
      fixtures: fixtureReports,
      dispatch: dispatchRows,
      filter: { only: only ?? null, skipDispatch },
      // A filtered run is partial evidence by construction, not just on error.
      partial: runError != null || Boolean(only) || skipDispatch,
    }
    // The unlabelled baseline file only ever holds a complete run; filtered
    // or failed runs go to a labelled sibling.
    const suffix = label !== 'baseline'
      ? `.${label}`
      : report.partial ? `.partial-${report.generatedAt.replace(/[:.]/g, '-')}` : ''
    const outputPath = join(process.cwd(), `test/perf-harness/issue924-attribution${suffix}.json`)
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Wrote ${outputPath}`)
    if (runError != null) throw runError
    expect(fixtureReports.length).toBeGreaterThan(0)
  }, 1_800_000)
})
