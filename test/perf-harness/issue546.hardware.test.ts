import { PixelblazeConnection, type PixelblazeVmError } from '../../src/engine/PixelblazeConnection'
import type { GeneratedShowArtifact } from '../../src/engine/showCompiler'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerArtifact,
  pushAndMeasureControllerSource,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import { issue546Artifacts, type Issue546FixtureId } from './issue546'

const runHardware = process.env.ISSUE546_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const pixelCounts = (process.env.ISSUE546_PIXEL_COUNTS ?? '256,1000,2000')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0 && value <= 2_000)
const activationFixtureId: Issue546FixtureId = 'stock-show-reference-property-animation'
const reproduceDirectPredecessorFailure = process.env.ISSUE546_DIRECT_PREDECESSOR === '1'
const drainSource = `export function beforeRender(delta) {}
export function render(index) { rgb(0, 0, 0) }
export function render2D(index, x, y) { rgb(0, 0, 0) }`

describe('Restart Pattern machine-slot Controller matrix (#546)', () => {
  it.skipIf(!runHardware)('censuses both fixtures, benchmarks Property Animation, and restores Controller state', async () => {
    const compile = await fetchControllerCompiler(ip)
    const bytecodeCensus = Object.entries(issue546Artifacts).map(([id, artifacts]) => {
      const bytecode = (artifact: GeneratedShowArtifact) => {
        try {
          return { bytes: compile(artifact.code).length, error: null }
        } catch (error) {
          return { bytes: null, error: error instanceof Error ? error.message : String(error) }
        }
      }
      const baseline = bytecode(artifacts.baseline)
      const selected = bytecode(artifacts.selected)
      return {
        id,
        baseline,
        selected,
        changePercent: baseline.bytes && selected.bytes ? (selected.bytes / baseline.bytes - 1) * 100 : null,
      }
    })
    const connection = new PixelblazeConnection({
      host: ip,
      webSocketFactory: nodeWebSocketFactory,
      requestTimeoutMs: 15_000,
      connectTimeoutMs: 10_000,
      pingIntervalMs: 2_000,
    })
    connection.on('error', (error) => console.error('controller socket:', error))
    const vmErrors: PixelblazeVmError[] = []
    connection.on('vm-error', (detail) => {
      const error = detail as PixelblazeVmError
      vmErrors.push(error)
      console.error('controller VM:', error)
    })
    await connection.connect()
    const original = await connection.getConfig()
    if (!original.activeProgramId) {
      connection.close()
      throw new Error('Controller did not report an active program; refusing a non-reversible probe')
    }

    let runError: unknown
    let report: unknown
    try {
      const ensureConnected = async () => {
        try {
          await connection.getConfig()
        } catch {
          await sleep(2_000)
          await connection.connect()
        }
      }
      const probe = async (artifact: GeneratedShowArtifact) => {
        const vmErrorStart = vmErrors.length
        try {
          await ensureConnected()
          const result = {
            activated: true as const,
            measurement: await pushAndMeasureControllerArtifact(connection, artifact, compile, {
              settleMs: 1_000,
              sampleMs: 4_000,
              activationTimeoutMs: 15_000,
            }),
          }
          return { ...result, vmErrors: vmErrors.slice(vmErrorStart) }
        } catch (error) {
          return {
            activated: false as const,
            sourceBytes: artifact.summary.artifactBytes,
            bytecodeBytes: (() => {
              try { return compile(artifact.code).length } catch { return null }
            })(),
            vmErrors: vmErrors.slice(vmErrorStart),
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }
      const probeSource = async (source: string) => {
        const vmErrorStart = vmErrors.length
        try {
          await ensureConnected()
          const result = {
            activated: true as const,
            measurement: await pushAndMeasureControllerSource(connection, source, compile, 0, {
              settleMs: 250,
              sampleMs: 500,
              activationTimeoutMs: 15_000,
            }),
          }
          return { ...result, vmErrors: vmErrors.slice(vmErrorStart) }
        } catch (error) {
          return {
            activated: false as const,
            sourceBytes: new TextEncoder().encode(source).length,
            bytecodeBytes: (() => {
              try { return compile(source).length } catch { return null }
            })(),
            vmErrors: vmErrors.slice(vmErrorStart),
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }
      const artifacts = issue546Artifacts[activationFixtureId]
      const measurements = []
      for (const [pixelCountIndex, pixelCount] of pixelCounts.entries()) {
        await ensureConnected()
        connection.setPixelCount(pixelCount, false)
        await sleep(1_000)
        const preBaselineDrain = await probeSource(drainSource)
        const baseline = preBaselineDrain.activated
          ? await probe(artifacts.baseline)
          : { activated: false as const, error: 'pre-baseline drain Pattern did not activate', vmErrors: [] }
        const selectedDirect = reproduceDirectPredecessorFailure && pixelCountIndex === 0
          ? await probe(artifacts.selected)
          : { activated: false as const, skipped: true, reason: 'direct predecessor failure is opt-in' }
        const drain = await probeSource(drainSource)
        const selected = drain.activated
          ? await probe(artifacts.selected)
          : { activated: false as const, error: 'drain Pattern did not activate', vmErrors: [] }
        const baselineFps = baseline.activated ? baseline.measurement.fps : null
        const selectedFps = selected.activated ? selected.measurement.fps : null
        measurements.push({
          pixelCount,
          preBaselineDrain,
          baseline,
          selectedDirect,
          drain,
          selected,
          meanFpsChangePercent: baselineFps && selectedFps
            ? (selectedFps.mean / baselineFps.mean - 1) * 100
            : null,
          medianFpsChangePercent: baselineFps && selectedFps
            ? (selectedFps.median / baselineFps.median - 1) * 100
            : null,
        })
      }
      report = {
        controller: {
          ip,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          originalPixelCount: original.pixelCount,
          originalActiveProgramId: original.activeProgramId,
        },
        bytecodeCensus,
        activationFixtureId,
        measurements,
      }
      console.log(JSON.stringify(report, null, 2))
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
    expect(report).toBeTruthy()
  }, 240_000)
})
