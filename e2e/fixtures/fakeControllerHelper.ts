import type { Page } from '@playwright/test'

export interface FakeControllerHelperOptions {
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
}

/** Installs a browser-side stand-in for the extension relay and a small slice of
 * Pixelblaze firmware. It exercises the production transport and protocol stack;
 * only the helper/device on the far side of window.postMessage are synthetic. */
export async function installFakeControllerHelper(
  page: Page,
  options: FakeControllerHelperOptions,
): Promise<void> {
  await page.addInitScript((fixture) => {
    const RELAY_SOURCE = 'pblz-relay'
    let activeProgramId = fixture.activeProgramId
    let pendingProgramId: string | null = null

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
        fixture.programs.map((program) => `${program.id}\t${program.name}`).join('\n'),
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
        emit({ type: 'detect-ack' })
        return
      }
      if (message.type === 'discover') {
        emit({ type: 'discover-result', reqId: message.reqId, ok: true, controllers: [] })
        return
      }
      if (message.type === 'connect') {
        emit({ type: 'open', connId: message.connId })
        return
      }
      if (message.type === 'get-wifi-status') {
        emit({
          type: 'wifi-status',
          reqId: message.reqId,
          ok: true,
          status: { status: 1, ip: '192.168.8.224', mac: fixture.mac },
        })
        return
      }
      if (message.type === 'get-map') {
        emit({ type: 'map-data', reqId: message.reqId, ok: true })
        return
      }
      if (message.type === 'compile') {
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
      if (!payload?.text || typeof message.connId !== 'string') return
      const command = JSON.parse(payload.text) as Record<string, unknown>
      if (command.getVars) reply(message.connId, { vars: fixture.vars ?? {} })
      if (command.getConfig) {
        reply(message.connId, {
          brightness: 0.5,
          boardType: fixture.boardType,
          chipId: 777,
          name: fixture.deviceName,
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
      if (command.ping) reply(message.connId, { ack: 1 })
      if (command.listPrograms) replyPrograms(message.connId)
      if (command.getControls !== undefined) {
        reply(message.connId, { controls: fixture.controls ?? {} })
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
  }, options)
}
