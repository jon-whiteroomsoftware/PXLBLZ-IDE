import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import { makeProgramId } from '../../src/engine/bytecodePush'
import {
  CONTROLLER_DRAIN_PATTERN_SOURCE,
  pushPattern,
  type PushPatternDeps,
} from '../../src/engine/pushPattern'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import { issue546Artifacts } from './issue546'

const runHardware = process.env.ISSUE547_HARDWARE === '1'
const reproduceDirectFailure = process.env.ISSUE547_DIRECT_REPRODUCTION === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const pixelCounts = (process.env.ISSUE547_PIXEL_COUNTS ?? '256,1000,2000')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0 && value <= 2_000)

describe('Controller replacement drain regression (#547)', () => {
  it.skipIf(!runHardware)(
    'routes large replacements through an activated drain and restores Controller state',
    async () => {
      const compile = await fetchControllerCompiler(ip)
      const artifacts = issue546Artifacts['fixture-property-slot-qualification']
      const baselineBytecode = compile(artifacts.baseline.code)
      const selectedBytecode = compile(artifacts.selected.code)
      const drainBytecode = compile(CONTROLLER_DRAIN_PATTERN_SOURCE)
      const connection = new PixelblazeConnection({
        host: ip,
        webSocketFactory: nodeWebSocketFactory,
        requestTimeoutMs: 15_000,
        activationTimeoutMs: 15_000,
        connectTimeoutMs: 10_000,
        pingIntervalMs: 2_000,
      })
      await connection.connect()
      const original = await connection.getConfig()
      if (!original.activeProgramId) {
        connection.close()
        throw new Error('Controller did not report an active program; refusing a non-reversible probe')
      }

      let knownActiveBytecodeBytes: number | null = null
      const activations: Array<{ programId: string; bytecodeBytes: number }> = []
      const provider: PushPatternDeps['provider'] = {
        compile: async (source) => compile(source),
        getActiveProgramBytecodeSize: async () => knownActiveBytecodeBytes,
        pushBytecode: async (bytecode, opts) => {
          await connection.pushByteCodeAndWait(bytecode, opts)
          knownActiveBytecodeBytes = bytecode.length
          activations.push({ programId: opts.id, bytecodeBytes: bytecode.length })
        },
        listPrograms: async () => [],
        saveProgram: async () => {
          throw new Error('issue #547 hardware regression uses run-only pushes')
        },
      }
      const push = async (patternId: string, source: string) => pushPattern({
        provider,
        controllerId: ip,
        patternId,
        source,
        mintId: makeProgramId,
        mintDrainId: makeProgramId,
        loadBindings: async () => ({}),
        saveBindings: async () => undefined,
        loadPushRecords: async () => ({}),
        savePushRecords: async () => undefined,
      })
      const ensureConnected = async () => {
        try {
          await connection.getConfig()
        } catch {
          await sleep(2_000)
          await connection.connect()
        }
      }

      const report: Array<Record<string, unknown>> = []
      let runError: unknown
      try {
        expect(drainBytecode).toHaveLength(153)
        for (const [index, pixelCount] of pixelCounts.entries()) {
          await ensureConnected()
          connection.setPixelCount(pixelCount, false)
          await sleep(1_000)

          knownActiveBytecodeBytes = null
          activations.length = 0
          await push('issue547-baseline', artifacts.baseline.code)
          expect(activations.map((activation) => activation.bytecodeBytes)).toEqual([
            drainBytecode.length,
            baselineBytecode.length,
          ])

          let directFailure: string | null = null
          if (reproduceDirectFailure && index === 0) {
            try {
              await connection.pushByteCodeAndWait(selectedBytecode, {
                id: makeProgramId(),
                name: '',
              })
            } catch (error) {
              directFailure = error instanceof Error ? error.message : String(error)
            }
            expect(directFailure).not.toBeNull()
            await ensureConnected()
            knownActiveBytecodeBytes = null
            await push('issue547-baseline-recovery', artifacts.baseline.code)
          }

          activations.length = 0
          await push('issue547-selected', artifacts.selected.code)
          expect(activations.map((activation) => activation.bytecodeBytes)).toEqual([
            drainBytecode.length,
            selectedBytecode.length,
          ])
          report.push({
            pixelCount,
            baselineBytecodeBytes: baselineBytecode.length,
            selectedBytecodeBytes: selectedBytecode.length,
            drainBytecodeBytes: drainBytecode.length,
            directFailure,
            safeSelectedProgramId: activations.at(-1)?.programId,
          })
        }
      } catch (error) {
        runError = error
      } finally {
        try {
          await ensureConnected()
          connection.setActiveProgram(original.activeProgramId)
          if (original.pixelCount) connection.setPixelCount(original.pixelCount, false)
          const restored = await waitForControllerConfig(
            () => connection.getConfig(),
            { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount },
            15_000,
          )
          if (
            restored.activeProgramId !== original.activeProgramId
            || restored.pixelCount !== original.pixelCount
          ) {
            const restoreError = new Error(
              `Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount})`,
            )
            runError = runError == null
              ? restoreError
              : new AggregateError([runError, restoreError], 'probe and restoration both failed')
          }
        } finally {
          connection.close()
        }
      }

      console.log(JSON.stringify({
        controller: {
          ip,
          boardType: original.boardType,
          firmwareVersion: original.firmwareVersion,
          originalPixelCount: original.pixelCount,
          originalActiveProgramId: original.activeProgramId,
        },
        destructiveDirectReproduction: reproduceDirectFailure,
        report,
      }, null, 2))
      if (runError != null) throw runError
      expect(report).toHaveLength(pixelCounts.length)
    },
    240_000,
  )
})
