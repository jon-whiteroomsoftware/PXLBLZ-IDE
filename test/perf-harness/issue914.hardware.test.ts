// #914 paired hardware measurement: the three hand-generated pass outputs
// against their shipped bases, on the bench pb32 at the panel's native
// pixel count (these are 2D map-dependent patterns; resizing the count
// without a matching map would measure a different picture).
//
// Run: ISSUE914_HARDWARE=1 npx vitest run test/perf-harness/issue914.hardware.test.ts

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import { bundle } from '../../src/engine/bundle'
import {
  declaredOutputProfileStamp,
  fetchControllerCompiler,
  nodeWebSocketFactory,
  pushAndMeasureControllerSource,
  sleep,
} from './controllerHardware'

const runHardware = process.env.ISSUE914_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const measurementOptions = { activationTimeoutMs: 20_000, settleMs: 2_000, sampleMs: 6_000 }
// Probe ids are recorded via onPushed at push time, before activation or
// sampling can throw, so cleanup covers failed measurements too.

const HERE = dirname(fileURLToPath(import.meta.url))
const PATTERNS_DIR = join(HERE, '../../src/pixelblaze/stock/patterns')
const LIB_DIR = join(HERE, '../../src/pixelblaze/lib')
const FIXTURES_DIR = join(HERE, 'fixtures/issue914')

const CASES = [
  { name: 'CoronalMassEjection', rule: 'B below-breakeven (lazy atan2 memo)', transformed: 'CoronalMassEjection.memoized.js' },
  { name: 'TunnelOfSquares2D', rule: 'B below-breakeven (lazy atan2 memo)', transformed: 'TunnelOfSquares2D.memoized.js' },
  { name: 'IridescentFibers', rule: 'A (beforeRender table)', transformed: 'IridescentFibers.tabled.js' },
  { name: 'ClockworkIris', rule: 'B exact-class (lazy op-chain memo)', transformed: 'ClockworkIris.memoized.js' },
] as const

function loadLibraries(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of readdirSync(LIB_DIR)) {
    if (file.endsWith('.js')) out[file.replace(/\.js$/, '')] = readFileSync(join(LIB_DIR, file), 'utf8')
  }
  return out
}

describe('generated member-pass transforms on hardware (#914 spike)', () => {
  it.skipIf(!runHardware)('measures each base/transformed pair and restores Controller state', async () => {
    const libraries = loadLibraries()
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
      pattern: string
      rule: string
      variant: 'base' | 'transformed'
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
      // Live control tuning cannot be restored: getConfig's activeControls are
      // the controls' BOUND VARIABLE values, not their 0..1 UI inputs (see
      // docs/reference/Pixelblaze device behaviour notes.md on drifted live
      // control values), so replaying them through setControls could feed a
      // nonlinear handler the wrong input and alter state instead of
      // restoring it. Reactivation below reloads the Pattern's stored values;
      // warn when live tuning exists so its loss is visible, not silent.
      if (original.activeControls && Object.keys(original.activeControls).length > 0) {
        console.warn(
          'Active Pattern has live control values; restoration reloads stored values (live tuning is not recoverable via the WS API).',
        )
      }

      for (const testCase of CASES) {
        const variants = [
          { variant: 'base' as const, source: readFileSync(join(PATTERNS_DIR, `${testCase.name}.js`), 'utf8') },
          { variant: 'transformed' as const, source: readFileSync(join(FIXTURES_DIR, testCase.transformed), 'utf8') },
        ]
        for (const { variant, source } of variants) {
          process.stdout.write(`  ${testCase.name} ${variant} ... `)
          const bundled = bundle(source, libraries).code
          const measured = await pushAndMeasureControllerSource(
            connection,
            bundled,
            compile,
            0,
            { ...measurementOptions, onPushed: (id) => pushedProgramIds.push(id) },
          )
          rows.push({
            pattern: testCase.name,
            rule: testCase.rule,
            variant,
            bytecodeBytes: measured.bytecodeBytes,
            fps: measured.fps,
          })
          console.log(`${measured.fps.median.toFixed(3)} median FPS`)
        }
      }

      const report = {
        device: original.name ?? ip,
        boardType: original.boardType,
        firmwareVersion: original.firmwareVersion ?? 'unknown',
        pixelCount: original.pixelCount,
        outputProfile: declaredOutputProfileStamp(),
        rows,
      }
      writeFileSync(join(process.cwd(), 'test/perf-harness/issue914-transform-pairs.json'), `${JSON.stringify(report, null, 2)}\n`)
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
          const deadline = Date.now() + 15_000
          let restored = await restore.getConfig()
          while (Date.now() < deadline && restored.activeProgramId !== original.activeProgramId) {
            await sleep(250)
            restored = await restore.getConfig()
          }
          // Delete ONLY inventory entries this probe minted itself — never an
          // inventory diff, which would destroy a Pattern saved by another
          // client mid-run. Empirically (fw 3.67, Burner bag) the setCode +
          // putByteCode push creates no inventory entries at all — dozens of
          // probe pushes left the 16-entry inventory unchanged — so this is
          // defensive for firmware where it might.
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
          if (restored.activeProgramId !== original.activeProgramId) {
            const restoreError = new Error(
              `Controller state did not restore (program=${restored.activeProgramId}).`,
            )
            runError = runError == null ? restoreError : new AggregateError([runError, restoreError], 'Probe and restoration both failed.')
          }
        }
      } finally {
        if (restore !== connection) restore.close()
        connection.close()
      }
    }
    if (runError != null) throw runError
    expect(rows.length).toBe(CASES.length * 2)
  }, 600_000)
})
