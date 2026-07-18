import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import type { GeneratedShowArtifact } from '../../src/engine/showCompiler'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import { issue531Fixtures } from './issue531'
import {
  attributeShowFrameTime,
  type ShowAttributionArtifact,
} from './showAttribution'

const runHardware = process.env.ISSUE531_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const pixelCount = 2_000
const measurementOptions = { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: 4_000 }

interface HardwareArtifactDescriptor {
  id: string
  code: string
  sourceBytes: number
  expandedSourceBytes: number
  vmWords: number
  persistentGlobals: number
}

describe('Show frame-time Controller attribution (#531)', () => {
  it.skipIf(!runHardware)('measures controlled artifact ladders and restores Controller state', async () => {
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
    let report: unknown
    try {
      if (original.pixelCount !== pixelCount) {
        connection.setPixelCount(pixelCount, false)
        await sleep(1_000)
      }

      const cache = new Map<string, Awaited<ReturnType<typeof measure>>>()
      async function measure(descriptor: HardwareArtifactDescriptor) {
        const cached = cache.get(descriptor.code)
        if (cached) return cached
        process.stdout.write(`  profiling ${descriptor.id} ... `)
        const measured = await pushAndMeasureControllerSource(
          connection,
          descriptor.code,
          compile,
          descriptor.vmWords,
          measurementOptions,
        )
        const result = {
          id: descriptor.id,
          sourceBytes: descriptor.sourceBytes,
          expandedSourceBytes: descriptor.expandedSourceBytes,
          bytecodeBytes: measured.bytecodeBytes,
          vmWords: descriptor.vmWords,
          persistentGlobals: descriptor.persistentGlobals,
          fps: measured.fps,
          frameMs: {
            mean: 1_000 / measured.fps.mean,
            median: 1_000 / measured.fps.median,
            min: 1_000 / measured.fps.max,
            max: 1_000 / measured.fps.min,
          },
        }
        cache.set(descriptor.code, result)
        console.log(`${measured.fps.median.toFixed(3)} median FPS`)
        return result
      }

      const fixtureReports = []
      for (const fixture of issue531Fixtures) {
        const trivialOutput = await measure(descriptor(
          `${fixture.id}:trivial-output`,
          fixture.artifacts.trivialOutput,
        ))
        const constantMembers = await measure(descriptor(
          `${fixture.id}:constant-members`,
          fixture.artifacts.constantMembers,
        ))
        const captureElided = fixture.artifacts.captureElided
          ? await measure(descriptor(
              `${fixture.id}:capture-elided`,
              fixture.artifacts.captureElided,
            ))
          : null
        const full = await measure(descriptor(`${fixture.id}:full`, fixture.artifacts.full))
        const attribution = attributeShowFrameTime({
          trivialOutput: { meanFps: trivialOutput.fps.mean, medianFps: trivialOutput.fps.median },
          constantMembers: { meanFps: constantMembers.fps.mean, medianFps: constantMembers.fps.median },
          ...(captureElided
            ? { captureElided: { meanFps: captureElided.fps.mean, medianFps: captureElided.fps.median } }
            : {}),
          full: { meanFps: full.fps.mean, medianFps: full.fps.median },
        })
        const optimization = fixture.optimization
          ? await measure(generatedDescriptor(
              `${fixture.id}:selected-issue-${fixture.optimization.issue}`,
              fixture.optimization.selected,
            )).then((selected) => ({
              issue: fixture.optimization!.issue,
              component: fixture.optimization!.component,
              selected,
              counterfactualArtifact: 'full',
              meanFrameDeltaMs: selected.frameMs.mean - full.frameMs.mean,
              medianFrameDeltaMs: selected.frameMs.median - full.frameMs.median,
            }))
          : null
        fixtureReports.push({
          id: fixture.id,
          pixelCount: fixture.pixelCount,
          captureElisionReason: fixture.artifacts.captureElisionReason,
          artifacts: { trivialOutput, constantMembers, captureElided, full },
          attribution,
          optimization,
        })
      }

      report = {
        generatedAt: new Date().toISOString(),
        controller: {
          ip,
          name: original.name,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          originalPixelCount: original.pixelCount,
          measuredPixelCount: pixelCount,
          originalActiveProgramId: original.activeProgramId,
          outputProfile: 'Controller-native output; expander/parallel topology is not exposed by getConfig',
          sampleMs: measurementOptions.sampleMs,
          settleMs: measurementOptions.settleMs,
        },
        fixtures: fixtureReports,
      }
      const outputPath = join(process.cwd(), 'docs/plans/archive/issue-531-controller-attribution-report.json')
      writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
      console.log(JSON.stringify(report, null, 2))
      console.log(`Wrote ${outputPath}`)
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
    expect(report).toBeTruthy()
  }, 300_000)
})

function descriptor(
  id: string,
  artifact: ShowAttributionArtifact,
): HardwareArtifactDescriptor {
  return {
    id,
    code: artifact.code,
    sourceBytes: artifact.sourceBytes,
    expandedSourceBytes: artifact.expandedSourceBytes,
    vmWords: artifact.vmWords,
    persistentGlobals: artifact.persistentGlobals,
  }
}

function generatedDescriptor(
  id: string,
  artifact: GeneratedShowArtifact,
): HardwareArtifactDescriptor {
  return {
    id,
    code: artifact.code,
    sourceBytes: artifact.summary.artifactBytes,
    expandedSourceBytes: artifact.summary.expandedArtifactBytes,
    vmWords: artifact.summary.resources.totalWords,
    persistentGlobals: artifact.summary.resources.persistentGlobals,
  }
}
