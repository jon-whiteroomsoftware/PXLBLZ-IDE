// #867: safe, reversible provider protocol probe on the pb32 bench.
// Creates one namespaced fixture, proves activation and restoration, deletes
// the fixture only while inactive, and preserves the complete prior inventory.
// Delete-active and reboot behavior require a controlled bench session.
import { describe, expect, it } from 'vitest'
import { makeProgramId } from '../../src/engine/bytecodePush'
import {
  PixelblazeConnection,
  type ProgramListEntry,
} from '../../src/engine/PixelblazeConnection'
import { encodePbp } from '../../src/engine/pbpEncode'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE867_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const source = 'export function render(index) { rgb(0, 0, 0) }\n'

function sortedInventory(programs: ProgramListEntry[]) {
  return programs
    .map(({ id, name }) => ({ id, name }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

async function waitForInventory(
  connection: PixelblazeConnection,
  predicate: (programs: ProgramListEntry[]) => boolean,
  timeoutMs = 10_000,
) {
  const deadline = Date.now() + timeoutMs
  let programs = await connection.listPrograms()
  while (!predicate(programs) && Date.now() < deadline) {
    await sleep(250)
    programs = await connection.listPrograms()
  }
  return programs
}

async function connect() {
  const connection = new PixelblazeConnection({
    host: ip,
    webSocketFactory: nodeWebSocketFactory,
    requestTimeoutMs: 10_000,
    pingIntervalMs: 0,
  })
  connection.on('error', () => {})
  await connection.connect()
  return connection
}

describe('Controller program switching and deletion (#867)', () => {
  it.skipIf(!runHardware)(
    'activates, restores, and deletes one reserved fixture without changing boot selection',
    async () => {
      const compile = await fetchControllerCompiler(ip)
      const bytecode = compile(source)
      let connection = await connect()
      const beforeConfig = await connection.getConfig()
      const beforePrograms = await connection.listPrograms()
      const originalActive = beforeConfig.activeProgramId
      if (!originalActive || !beforePrograms.some((program) => program.id === originalActive)) {
        connection.close()
        throw new Error('Active Pattern is not saved; refusing a probe that cannot restore it.')
      }

      const fixtureId = makeProgramId()
      const fixtureName = '__pxlblz_867_switch_delete__'
      let runError: unknown
      try {
        connection.saveProgram(
          fixtureId,
          encodePbp({ id: fixtureId, name: fixtureName, sourceCode: source, byteCode: bytecode }),
        )
        const afterSave = await waitForInventory(
          connection,
          (items) => items.some((item) => item.id === fixtureId),
        )
        expect(
          afterSave.some((program) => program.id === fixtureId && program.name === fixtureName),
        ).toBe(true)

        connection.setActiveProgram(fixtureId, false)
        const fixtureActive = await waitForControllerConfig(
          () => connection.getConfig(),
          { activeProgramId: fixtureId },
        )
        expect(fixtureActive.activeProgramId).toBe(fixtureId)

        connection.setActiveProgram(originalActive, false)
        const originalRestored = await waitForControllerConfig(
          () => connection.getConfig(),
          { activeProgramId: originalActive },
        )
        expect(originalRestored.activeProgramId).toBe(originalActive)

        connection.deleteProgram(fixtureId)
        const afterDelete = await waitForInventory(
          connection,
          (items) => !items.some((item) => item.id === fixtureId),
        )
        expect(afterDelete.some((program) => program.id === fixtureId)).toBe(false)
        expect(sortedInventory(afterDelete)).toEqual(sortedInventory(beforePrograms))

        console.log(
          `ISSUE867_EVIDENCE ${JSON.stringify({
            firmwareVersion: beforeConfig.firmwareVersion ?? null,
            originalActive,
            fixtureId,
            activationConfirmed: fixtureActive.activeProgramId,
            restorationConfirmed: originalRestored.activeProgramId,
            inventoryPreserved: true,
          })}`,
        )
      } catch (error) {
        runError = error
      } finally {
        try {
          try {
            await connection.getConfig()
          } catch {
            connection.close()
            connection = await connect()
          }

          connection.setActiveProgram(originalActive, false)
          const restored = await waitForControllerConfig(
            () => connection.getConfig(),
            { activeProgramId: originalActive },
          )
          expect(restored.activeProgramId).toBe(originalActive)

          const remaining = await connection.listPrograms()
          if (remaining.some((program) => program.id === fixtureId)) {
            connection.deleteProgram(fixtureId)
          }
          const cleaned = await waitForInventory(
            connection,
            (items) => !items.some((item) => item.id === fixtureId),
          )
          expect(sortedInventory(cleaned)).toEqual(sortedInventory(beforePrograms))
        } catch (cleanupError) {
          runError = runError == null
            ? cleanupError
            : new AggregateError([runError as Error, cleanupError as Error])
        } finally {
          connection.close()
        }
      }

      if (runError != null) throw runError
    },
    120_000,
  )
})
