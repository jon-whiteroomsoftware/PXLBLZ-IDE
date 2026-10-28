import type { Page } from '@playwright/test'
import { decodePbp } from '../../src/engine/pbpEncode'

let savedProgramsBindingSequence = 0
export type SharedFakeControllerPrograms = Map<string, { name: string; pbpBase64: string }>

export interface FakeControllerHelperOptions {
  address?: string
  programs: Array<{ id: string; name: string }>
  activeProgramId: string
  deviceName: string
  boardType: string
  mac: string
  pixelCount: number
  controls?: Record<string, number>
  vars?: Record<string, number>
  sequencerMode?: number
  runSequencer?: boolean
  /** Encoded PBP fixtures, read through the production recovery decoder. */
  savedProgramData?: Record<string, string>
  /** Hold the first permission grant beyond the ordinary socket deadline. */
  permissionDelayMs?: number
}

/** Installs a browser-side stand-in for the extension relay and a small slice of
 * Pixelblaze firmware. It exercises the production transport and protocol stack;
 * only the helper/device on the far side of window.postMessage are synthetic. */
export async function installFakeControllerHelper(
  page: Page,
  options: FakeControllerHelperOptions,
  sharedPrograms?: SharedFakeControllerPrograms,
): Promise<void> {
  const sharedProgramBinding = sharedPrograms ? `__pxlblzSavedPrograms${++savedProgramsBindingSequence}` : null
  if (sharedPrograms && sharedProgramBinding) {
    await page.exposeBinding(sharedProgramBinding, (_source, request: { operation: 'list' | 'read' | 'save' | 'delete'; id?: string; pbpBase64?: string }) => {
      if (request.operation === 'list') return [...sharedPrograms].map(([id, program]) => ({ id, name: program.name }))
      if (!request.id) throw new Error('Synthetic saved program needs an exact slot id')
      if (request.operation === 'read') return sharedPrograms.get(request.id)?.pbpBase64 ?? null
      if (request.operation === 'delete') { sharedPrograms.delete(request.id); return null }
      if (!request.pbpBase64) throw new Error('Synthetic save needs PBP bytes')
      const decoded = decodePbp(new Uint8Array(Buffer.from(request.pbpBase64, 'base64')))
      if (!decoded) throw new Error('Synthetic save received invalid PBP bytes')
      sharedPrograms.set(request.id, { name: decoded.name, pbpBase64: request.pbpBase64 })
      return null
    })
  }
  await page.addInitScript((fixture) => {
    const connections = new Set<string>()
    const RELAY_SOURCE = 'pblz-relay'
    let activeProgramId = fixture.activeProgramId
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
    const chunks = new Map<string, Uint8Array[]>()
    let sharedWrites: Promise<unknown> = Promise.resolve()
    let readCount = 0
    const shared = (request: { operation: 'list' | 'read' | 'save' | 'delete'; id?: string; pbpBase64?: string }): Promise<unknown> => {
      const binding = (window as unknown as Record<string, (request: unknown) => Promise<unknown>>)[fixture.sharedProgramBinding!]
      return binding(request)
    }
    Object.defineProperty(window, '__fakeControllerWrites', {
      configurable: true,
      value: writes,
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
    const replyPrograms = async (connId: string) => {
      if (fixture.sharedProgramBinding) {
        await sharedWrites
        programs = await shared({ operation: 'list' }) as typeof programs
      }
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

    window.addEventListener('message', async (event) => {
      if (event.source !== window) return
      const message = event.data as Record<string, unknown> | undefined
      if (
        !message
        || message.source !== RELAY_SOURCE
        || message.dir !== 'to-helper'
        || typeof message.type !== 'string'
      ) return

      if (message.type === 'detect') {
        emit({ type: 'detect-ack' })
        return
      }
      if (message.type === 'discover') {
        emit({ type: 'discover-result', reqId: message.reqId, ok: true, controllers: [] })
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
        } else open()
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
        let programData = fixture.savedProgramData?.[String(message.programId)] ?? null
        if (fixture.sharedProgramBinding) {
          await sharedWrites
          writes.push({ readProgram: String(message.programId), readCount: ++readCount })
          programData = await shared({ operation: 'read', id: String(message.programId) }) as string | null
        }
        emit({ type: 'program-data', reqId: message.reqId, ok: true,
          programData })
        return
      }
      if (message.type === 'compile') {
        if (fixture.address && message.address !== fixture.address) return
        writes.push({ compileSource: message.patternSrc })
        emit({
          type: 'compile-result',
          reqId: message.reqId,
          ok: true,
          bytecode: bytesToBase64(new Uint8Array(8)),
        })
        return
      }
      if (message.type !== 'send') return
      const payload = message.payload as { text?: string; binary?: string } | undefined
      if (payload?.binary && typeof message.connId === 'string') {
        // Multiple fixtures listen on the page; only the owning connection may acknowledge.
        if (fixture.address && !connections.has(message.connId)) return
        // Type 1 is putSourceCode: the saved PBP carrying the source.
        const frame = Uint8Array.from(atob(payload.binary), (character) => character.charCodeAt(0))
        if (frame[0] === 1) {
          if (!fixture.sharedProgramBinding) {
            if (frame[1] & 4) writes.push({ save: true })
          } else {
            const connId = message.connId
            if (frame[1] & 1) chunks.set(connId, [])
            const parts = chunks.get(connId)
            if (!parts) throw new Error('Synthetic save received continuation without first frame')
            parts.push(frame.slice(2))
            if (frame[1] & 4) {
              chunks.delete(connId)
              const bytes = new Uint8Array(parts.reduce((count, part) => count + part.length, 0))
              let offset = 0
              for (const part of parts) { bytes.set(part, offset); offset += part.length }
              const id = new TextDecoder().decode(bytes.slice(0, 17))
              writes.push({ save: true, programId: id })
              sharedWrites = sharedWrites.then(() => shared({ operation: 'save', id, pbpBase64: bytesToBase64(bytes.slice(17)) }))
            }
          }
          if (frame[1] & 4) {
            // Completion confirms persistence, not merely receipt of the final frame.
            if (fixture.sharedProgramBinding) await sharedWrites
            reply(message.connId, { saveProgramSourceFile: 1 })
          }
        }
        reply(message.connId, { ack: 1 })
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
          pixelCount: fixture.pixelCount,
          ver: '3.67',
          sequencerMode: fixture.sequencerMode,
          runSequencer: fixture.runSequencer,
        })
        reply(message.connId, {
          activeProgram: { activeProgramId, controls: fixture.controls ?? {} },
          sequencerMode: fixture.sequencerMode,
          runSequencer: fixture.runSequencer,
        })
      }
      if (typeof command.name === 'string') {
        deviceName = command.name
        try {
          window.sessionStorage.setItem(deviceNameStorageKey, deviceName)
        } catch {
          // Keep the current document's device state even if storage is denied.
        }
      }
      if (command.listPrograms) await replyPrograms(message.connId)
      if (typeof command.deleteProgram === 'string') {
        programs = programs.filter((program) => program.id !== command.deleteProgram)
        if (fixture.sharedProgramBinding) await shared({ operation: 'delete', id: command.deleteProgram })
      }
      if (command.getControls !== undefined) {
        reply(message.connId, { controls: fixture.controls ?? {} })
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
      if (['ping', 'pause', 'setCode', 'setControls'].some((key) => key in command)) {
        reply(message.connId, { ack: 1 })
      }
    })
  }, { ...options, sharedProgramBinding })
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
  for (const fixture of fixtures) await installFakeControllerHelper(page, fixture)
}
