import type { Page } from '@playwright/test'

export interface FakeControllerHelperOptions {
  address?: string
  programs: Array<{ id: string; name: string }>
  activeProgramId: string
  deviceName: string
  boardType: string
  mac: string
  pixelCount: number
  controls?: Record<string, number>
  /** Initial saved Control values by program, with controls as the fallback. */
  programControls?: Record<string, Record<string, number>>
  vars?: Record<string, number>
  sequencerMode?: number
  runSequencer?: boolean
  /** Encoded PBP fixtures, read through the production recovery decoder. */
  savedProgramData?: Record<string, string>
  /** Persist confirmed Saves and expose transport controls for reconciliation tests. */
  trackSavedPrograms?: boolean
  /** Hold the first permission grant beyond the ordinary socket deadline. */
  permissionDelayMs?: number
  /** Saved Pattern ids whose delete command is recorded but not applied. */
  ignoredDeleteIds?: string[]
  /** After this many delete commands, hold program-list replies until
   * `__fakeControllerReleaseProgramLists()` runs. */
  holdProgramListsAfterDeletes?: number
}

/** Installs a browser-side stand-in for the extension relay and a small slice of
 * Pixelblaze firmware. It exercises the production transport and protocol stack;
 * only the helper/device on the far side of window.postMessage are synthetic. */
export async function installFakeControllerHelper(
  page: Page,
  options: FakeControllerHelperOptions,
  replyToGlobalRequests = true,
): Promise<void> {
  await page.addInitScript(({ fixture, replyToGlobalRequests }) => {
    const connections = new Set<string>()
    const RELAY_SOURCE = 'pblz-relay'
    let activeProgramId = fixture.activeProgramId
    let pixelCount = fixture.pixelCount
    // Firmware keeps saved values by program ID even while a rewrite omits
    // the corresponding export. Save confirmation updates program bytes only.
    const savedControls = new Map(Object.entries(fixture.programControls ?? {}))
    const liveControls = new Map<string, Record<string, number>>()
    const controlWrites: Array<{ programId: string; values: object; save: boolean }> = []
    const controlsFor = (id: string) => savedControls.get(id) ?? fixture.controls ?? {}
    let pendingProgramId: string | null = null
    let programs = fixture.programs.map((program) => ({ ...program }))
    const deviceNameStorageKey = `__pxlblzFakeControllerName:${fixture.mac}`
    let deviceName = fixture.deviceName
    try {
      deviceName = window.sessionStorage.getItem(deviceNameStorageKey) ?? fixture.deviceName
    } catch {
      // Opaque bootstrap origins can deny storage; the in-page fake still works.
    }
    const writes: Array<Record<string, unknown>> = []
    Object.defineProperty(window, '__fakeControllerWrites', {
      configurable: true,
      value: writes,
    })
    let deleteCommands = 0
    let releasedProgramLists = false
    const heldProgramLists: string[] = []
    const savedPrograms = { ...fixture.savedProgramData }
    const saveFrames = new Map<string, string>()
    const heldSaves: Array<{ connId: string; programId: string; encoded: string }> = []
    const heldConnections: Array<() => void> = []
    let holdSaves = false
    let online = true
    let dropProgramLists = false
    let rejectCompiles = false
    const confirmSave = ({ connId, programId, encoded }: typeof heldSaves[number]) => {
      savedPrograms[programId] = encoded
      reply(connId, { saveProgramSourceFile: true })
    }
    if (fixture.trackSavedPrograms) {
      Object.defineProperty(window, '__fakeControllerReconciliation', {
        value: {
          holdSaves: () => { holdSaves = true },
          acknowledgeSave: () => {
            const save = heldSaves.shift()
            if (!save) throw new Error('No Save is waiting for an acknowledgement')
            confirmSave(save)
          },
          releaseSaves: () => {
            holdSaves = false
            for (const save of heldSaves.splice(0)) confirmSave(save)
          },
          waitingSaveIds: () => heldSaves.map(({ programId }) => programId),
          savedBytes: () => ({ ...savedPrograms }),
          savedControls: () => Object.fromEntries(savedControls),
          controlWrites: () => [...controlWrites],
          disconnect: () => {
            online = false
            heldSaves.length = 0
            saveFrames.clear()
            for (const connId of connections) emit({ type: 'close', connId, code: 1006 })
            connections.clear()
          },
          reconnect: () => {
            online = true
            for (const open of heldConnections.splice(0)) open()
          },
          dropProgramLists: () => { dropProgramLists = true },
          rejectCompiles: () => { rejectCompiles = true },
        },
      })
    }
    Object.defineProperty(window, '__fakeControllerReleaseProgramLists', {
      configurable: true,
      value: () => {
        releasedProgramLists = true
        for (const connId of heldProgramLists.splice(0)) replyPrograms(connId)
      },
    })

    const bytesToBase64 = (bytes: Uint8Array) => {
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      return btoa(binary)
    }
    const emit = (message: Record<string, unknown>) => {
      queueMicrotask(() => window.postMessage({
        source: RELAY_SOURCE,
        dir: 'from-helper',
        ...message,
      }, window.location.origin))
    }
    const reply = (connId: string, body: Record<string, unknown>) => emit({
      type: 'message',
      connId,
      payload: { text: JSON.stringify(body) },
    })
    const replyPrograms = (connId: string) => {
      const body = new TextEncoder().encode(
        programs.map((program) => `${program.id}\t${program.name}`).join('\n'),
      )
      const frame = new Uint8Array(body.length + 2)
      frame[0] = 7
      frame[1] = 5
      frame.set(body, 2)
      emit({
        type: 'message',
        connId,
        payload: { binary: bytesToBase64(frame) },
      })
    }

    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      const message = event.data as Record<string, unknown> | undefined
      if (
        !message
        || message.source !== RELAY_SOURCE
        || message.dir !== 'to-helper'
        || typeof message.type !== 'string'
      ) return

      if (message.type === 'detect') {
        if (replyToGlobalRequests) emit({ type: 'detect-ack' })
        return
      }
      if (message.type === 'discover') {
        if (replyToGlobalRequests) emit({ type: 'discover-result', reqId: message.reqId, ok: true, controllers: [] })
        return
      }
      if (message.type === 'connect') {
        if (fixture.address && new URL(String(message.url)).hostname !== fixture.address) return
        const connId = String(message.connId)
        connections.add(connId)
        const open = () => {
          if (!connections.has(connId)) return
          emit({ type: 'socket-connecting', connId })
          emit({ type: 'open', connId })
        }
        if (fixture.permissionDelayMs) {
          emit({ type: 'permission-needed', address: new URL(String(message.url)).hostname, connId })
          setTimeout(open, fixture.permissionDelayMs)
        } else if (online) open()
        else heldConnections.push(open)
        return
      }
      if (message.type === 'close') {
        connections.delete(String(message.connId))
        return
      }
      if (message.type === 'get-wifi-status') {
        if (fixture.address && message.address !== fixture.address) return
        emit({
          type: 'wifi-status',
          reqId: message.reqId,
          ok: true,
          status: { status: 1, ip: '192.168.8.224', mac: fixture.mac },
        })
        return
      }
      if (message.type === 'get-map') {
        if (fixture.address && message.address !== fixture.address) return
        emit({ type: 'map-data', reqId: message.reqId, ok: true })
        return
      }
      if (message.type === 'get-program') {
        if (fixture.address && message.address !== fixture.address) return
        emit({ type: 'program-data', reqId: message.reqId, ok: true,
          programData: savedPrograms[String(message.programId)] ?? null })
        return
      }
      if (message.type === 'compile') {
        if (fixture.address && message.address !== fixture.address) return
        writes.push({ compileSource: message.patternSrc })
        emit({
          type: 'compile-result',
          reqId: message.reqId,
          ...(rejectCompiles
            ? { ok: false, error: 'Fixture compile rejected' }
            : { ok: true, bytecode: bytesToBase64(new Uint8Array(8)) }),
        })
        return
      }
      if (message.type !== 'send') return
      const payload = message.payload as { text?: string; binary?: string } | undefined
      if (payload?.binary && typeof message.connId === 'string') {
        const frame = atob(payload.binary)
        // Type 1 carries the saved PBP. Firmware confirms on the last frame (flag 4).
        if (frame.charCodeAt(0) === 1) {
          writes.push({ save: true })
          const last = (frame.charCodeAt(1) & 4) !== 0
          if (fixture.trackSavedPrograms) {
            const connId = message.connId
            const payload = (saveFrames.get(connId) ?? '') + frame.slice(2)
            if (last) {
              saveFrames.delete(connId)
              const programId = payload.slice(0, 17)
              const save = { connId, programId, encoded: btoa(payload.slice(17)) }
              writes.push({ savedProgramId: programId })
              if (holdSaves) heldSaves.push(save)
              else confirmSave(save)
            } else {
              saveFrames.set(connId, payload)
            }
          } else if (last) reply(message.connId, { saveProgramSourceFile: true })
        }
        return
      }
      if (!payload?.text || typeof message.connId !== 'string') return
      if (fixture.address && !connections.has(message.connId)) return
      const command = JSON.parse(payload.text) as Record<string, unknown>
      writes.push(command)
      if (command.getVars) reply(message.connId, { vars: fixture.vars ?? {} })
      if (command.getConfig) {
        reply(message.connId, {
          brightness: 0.5,
          boardType: fixture.boardType,
          chipId: 777,
          name: deviceName,
          pixelCount,
          ver: '3.67',
          sequencerMode: fixture.sequencerMode,
          runSequencer: fixture.runSequencer,
        })
        reply(message.connId, {
          activeProgram: { activeProgramId, controls: liveControls.get(activeProgramId) ?? controlsFor(activeProgramId) },
          sequencerMode: fixture.sequencerMode,
          runSequencer: fixture.runSequencer,
        })
      }
      if (typeof command.pixelCount === 'number') pixelCount = command.pixelCount
      if (fixture.trackSavedPrograms && command.setControls && typeof command.setControls === 'object') {
        const values = command.setControls
        controlWrites.push({ programId: activeProgramId, values, save: command.save === true })
        liveControls.set(activeProgramId, { ...(liveControls.get(activeProgramId) ?? controlsFor(activeProgramId)), ...values })
        if (command.save === true) {
          savedControls.set(activeProgramId, { ...controlsFor(activeProgramId), ...values })
        }
      }
      if (command.ping) reply(message.connId, { ack: 1 })
      if (typeof command.name === 'string') {
        deviceName = command.name
        try {
          window.sessionStorage.setItem(deviceNameStorageKey, deviceName)
        } catch {
          // Keep the current document's device state even if storage is denied.
        }
      }
      if (command.listPrograms) {
        const hold = !releasedProgramLists && fixture.holdProgramListsAfterDeletes !== undefined
          && deleteCommands >= fixture.holdProgramListsAfterDeletes
        if (dropProgramLists) return
        if (hold) heldProgramLists.push(message.connId)
        else replyPrograms(message.connId)
      }
      if (typeof command.deleteProgram === 'string') deleteCommands += 1
      if (typeof command.deleteProgram === 'string' && !fixture.ignoredDeleteIds?.includes(command.deleteProgram)) {
        programs = programs.filter((program) => program.id !== command.deleteProgram)
      }
      if (command.getControls !== undefined) {
        reply(message.connId, { controls: controlsFor(String(command.getControls) || activeProgramId) })
      }
      if (typeof command.activeProgramId === 'string') {
        activeProgramId = command.activeProgramId
      }
      if (command.setCode && typeof command.setCode === 'object') {
        const id = (command.setCode as { id?: unknown }).id
        pendingProgramId = typeof id === 'string' ? id : null
      }
      if (command.pause === false && pendingProgramId) {
        activeProgramId = pendingProgramId
        pendingProgramId = null
      }
      if ('pause' in command && !('setCode' in command)) reply(message.connId, { ack: 1 })
    })
  }, { fixture: options, replyToGlobalRequests })
}

/** Distinct synthetic devices keyed by their real transport address and firmware MAC. */
export async function installFakeControllers(
  page: Page,
  fixtures: Array<FakeControllerHelperOptions & { address: string }>,
): Promise<void> {
  for (const field of ['address', 'mac'] as const) {
    const values = fixtures.map((fixture) => fixture[field].toLowerCase())
    if (values.some((value) => !value) || new Set(values).size !== values.length) {
      throw new Error(`Synthetic Controllers require distinct ${field} values`)
    }
  }
  for (const [index, fixture] of fixtures.entries()) {
    await installFakeControllerHelper(page, fixture, index === 0)
  }
}
