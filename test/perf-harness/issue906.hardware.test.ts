// Dynamic short-circuit probe for issue #906: the one codegen fact the
// static oracle cannot settle. A side-effecting helper is placed on the
// right-hand side of `1 || bump()` and `0 && bump()`; the exported counter
// says whether the firmware evaluated it.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE906_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

const PROBE_SOURCE = `
export var orBump = 0
export var andBump = 0
export var done = 0
var orResult = 0
var andResult = 0
export var orValue = 0
export var andValue = 0

function bumpOr() { orBump = orBump + 1; return 2 }
function bumpAnd() { andBump = andBump + 1; return 2 }

export function beforeRender(delta) {
  if (done == 0) {
    orResult = 1 || bumpOr()
    andResult = 0 && bumpAnd()
    orValue = orResult
    andValue = andResult
    done = 1
  }
}

export function render(index) { hsv(0, 0, 0.02) }
`

describe('short-circuit probe on hardware (#906)', () => {
  it.skipIf(!runHardware)('reports whether && and || short-circuit on the firmware VM', async () => {
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
    try {
      const bytecode = compile(PROBE_SOURCE)
      const programId = makeProgramId()
      connection.pushByteCode(bytecode, { id: programId, name: '' })
      const activated = await waitForControllerConfig(
        () => connection.getConfig(),
        { activeProgramId: programId },
      )
      if (activated.activeProgramId !== programId) throw new Error(`Probe ${programId} did not activate.`)
      await sleep(2_000)
      const variables = await connection.getVars()
      const report = {
        generatedAt: new Date().toISOString(),
        firmwareVersion: original.firmwareVersion ?? 'unknown',
        orBump: variables.orBump,
        andBump: variables.andBump,
        orValue: variables.orValue,
        andValue: variables.andValue,
        done: variables.done,
        verdict: {
          orShortCircuits: variables.orBump === 0,
          andShortCircuits: variables.andBump === 0,
        },
      }
      writeFileSync(join(process.cwd(), 'test/perf-harness/issue906-shortcircuit.json'), `${JSON.stringify(report, null, 2)}\n`)
      console.log(JSON.stringify(report, null, 2))
      expect(variables.done).toBe(1)
    } catch (error) {
      runError = error
    } finally {
      try {
        connection.setActiveProgram(original.activeProgramId)
        const restored = await waitForControllerConfig(
          () => connection.getConfig(),
          { activeProgramId: original.activeProgramId },
        )
        if (restored.activeProgramId !== original.activeProgramId) {
          const restoreError = new Error(`Controller state did not restore (program=${restored.activeProgramId}).`)
          runError = runError == null ? restoreError : new AggregateError([runError, restoreError], 'Probe and restore failed.')
        }
      } finally {
        connection.close()
      }
    }
    if (runError != null) throw runError
  }, 120_000)
})
