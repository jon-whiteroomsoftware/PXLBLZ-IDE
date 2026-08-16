// #867: destructive-but-contained provider protocol probe on the pb32 bench.
// Creates only namespaced fixtures, proves inactive deletion preserves the
// complete prior inventory, records delete-active behavior before/after reboot,
// and restores the original saved Pattern as the running and boot selection.
import { describe, expect, it } from 'vitest'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { PixelblazeConnection, type ProgramListEntry } from '../../src/engine/PixelblazeConnection'
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

async function reconnectAfterReboot() {
  await sleep(2_000)
  const deadline = Date.now() + 30_000
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      return await connect()
    } catch (error) {
      lastError = error
      await sleep(1_000)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Controller did not reconnect after reboot')
}

describe('Controller program switching and deletion (#867)', () => {
  it.skipIf(!runHardware)(
    'preserves unrelated programs and records delete-active behavior across reboot',
    async () => {
      const compile = await fetchControllerCompiler(ip)
      const bytecode = compile(source)
      let connection = await connect()
      const beforeConfig = await connection.getConfig()
      const beforePrograms = await connection.listPrograms()
      const originalActive = beforeConfig.activeProgramId
      if (!originalActive || !beforePrograms.some((program) => program.id === originalActive)) {
        connection.close()
        throw new Error('Active Pattern is not saved; refusing a probe that cannot restore the boot selection.')
      }

      const saveFixture = async (id: string, name: string) => {
        connection.saveProgram(id, encodePbp({ id, name, sourceCode: source, byteCode: bytecode }))
        const programs = await waitForInventory(connection, (items) => items.some((item) => item.id === id))
        expect(programs.some((program) => program.id === id && program.name === name)).toBe(true)
      }
      const deleteAndConfirm = async (id: string) => {
        connection.deleteProgram(id)
        return waitForInventory(connection, (items) => !items.some((item) => item.id === id))
      }

      const inactiveId = makeProgramId()
      const activeId = makeProgramId()
      let evidence: Record<string, unknown> | null = null
      let runError: unknown
      try {
        await saveFixture(inactiveId, '__pxlblz_867_inactive__')
        connection.setActiveProgram(originalActive, true)
        await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: originalActive })
        const afterInactiveDelete = await deleteAndConfirm(inactiveId)
        expect(sortedInventory(afterInactiveDelete)).toEqual(sortedInventory(beforePrograms))

        await saveFixture(activeId, '__pxlblz_867_active__')
        connection.setActiveProgram(activeId, true)
        await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: activeId })
        const afterActiveDelete = await deleteAndConfirm(activeId)
        const immediatelyAfterDelete = await connection.getConfig()
        expect(sortedInventory(afterActiveDelete)).toEqual(sortedInventory(beforePrograms))

        const rebootResponse = await fetch(`http://${ip}/reboot`, { method: 'POST' })
        expect([200, 404]).toContain(rebootResponse.status)
        connection.close()
        connection = await reconnectAfterReboot()
        const afterReboot = await connection.getConfig()
        const afterRebootPrograms = await connection.listPrograms()
        expect(sortedInventory(afterRebootPrograms)).toEqual(sortedInventory(beforePrograms))

        evidence = {
          firmwareVersion: beforeConfig.firmwareVersion ?? null,
          originalActive,
          deletedActive: activeId,
          activeImmediatelyAfterDelete: immediatelyAfterDelete.activeProgramId ?? null,
          activeAfterReboot: afterReboot.activeProgramId ?? null,
          rebootStatus: rebootResponse.status,
          unrelatedProgramsPreserved: true,
        }
        console.log(`ISSUE867_EVIDENCE ${JSON.stringify(evidence)}`)
      } catch (error) {
        runError = error
      } finally {
        try {
          try {
            await connection.getConfig()
          } catch {
            connection.close()
            connection = await reconnectAfterReboot()
          }
          connection.setActiveProgram(originalActive, true)
          const restored = await waitForControllerConfig(
            () => connection.getConfig(),
            { activeProgramId: originalActive },
          )
          if (restored.activeProgramId !== originalActive) {
            throw new Error('Controller active/boot Pattern did not restore.')
          }
          const remaining = await connection.listPrograms()
          for (const id of [inactiveId, activeId]) {
            if (remaining.some((program) => program.id === id)) connection.deleteProgram(id)
          }
          const cleaned = await waitForInventory(
            connection,
            (items) => !items.some((item) => item.id === inactiveId || item.id === activeId),
          )
          expect(sortedInventory(cleaned)).toEqual(sortedInventory(beforePrograms))
        } catch (restoreError) {
          runError = runError == null
            ? restoreError
            : new AggregateError([runError as Error, restoreError as Error])
        } finally {
          connection.close()
        }
      }

      if (runError != null) throw runError
      expect(evidence).not.toBeNull()
    },
    180_000,
  )
})
