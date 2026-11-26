// Node stand-in for the Controller Helper's service worker (extension/background.js),
// shared by the IDE-path hardware probes (#1268, #1273). It opens the
// ws://<ip>:81 socket and, like the helper, re-downloads the Controller's
// compiler for every compile.

import WebSocket from 'ws'
import { RELAY_SOURCE, base64ToBytes, bytesToBase64, type RelayMessage, type RelayTransport } from '../../src/engine/RelayWebSocket'
import { fetchControllerCompiler } from './controllerHardware'
import { isFinalSaveFrame, readSaveAcknowledgement } from './controllerSaveProbeCore'

/** The caller's clock and log, so relay events share its trace timeline. */
export interface RelayTrace {
  traceAt: () => number
  at: () => number
  log: (message: string) => void
}

export type SaveWireEvent =
  | { kind: 'frames-sent' }
  | { kind: 'frame-send-error'; error: string }
  | { kind: 'save-ack'; acknowledged: boolean }

/** Node stand-in for the helper's service worker (extension/background.js). */
export function nodeRelay(ip: string, trace: RelayTrace, compileAttempts?: number) {
  const { traceAt, at, log } = trace
  const listeners = new Set<(message: RelayMessage) => void>()
  const sockets = new Map<string, WebSocket>()
  const counters = { compiles: 0, compileMs: [] as number[], closesByDevice: [] as Array<{ at: number; code: number }> }
  const saveWire: Array<SaveWireEvent & { at: number; connId: string }> = []
  const noteSaveWire = (connId: string, event: SaveWireEvent) => {
    const entry = { at: traceAt(), connId, ...event }
    saveWire.push(entry)
    log(`save wire: ${JSON.stringify(entry)}`)
  }
  const emit = (message: RelayMessage) => listeners.forEach((listener) => listener(message))
  const transport: RelayTransport = {
    post(msg) {
      if (msg.type === 'detect') return void queueMicrotask(() => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'detect-ack' }))
      if (msg.type === 'connect') {
        if (sockets.size > 0) {
          const message = 'Previous probe socket has not closed; refusing another connection'
          log(message)
          emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message })
          return
        }
        const ws = new WebSocket(msg.url)
        ws.binaryType = 'arraybuffer'
        sockets.set(msg.connId, ws)
        ws.on('open', () => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'open', connId: msg.connId }))
        ws.on('message', (data, isBinary) => {
          const payload = isBinary
            ? { binary: bytesToBase64(new Uint8Array(data as ArrayBuffer)) }
            : { text: data.toString() }
          if (payload.text !== undefined) {
            const acknowledged = readSaveAcknowledgement(payload.text)
            if (acknowledged !== undefined) noteSaveWire(msg.connId, { kind: 'save-ack', acknowledged })
          }
          emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId: msg.connId, payload })
        })
        ws.on('close', (code) => {
          sockets.delete(msg.connId)
          counters.closesByDevice.push({ at: at(), code })
          log(`socket ${msg.connId} closed with code ${code}`)
          emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: msg.connId, code })
        })
        ws.on('error', (error) => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: error.message }))
        return
      }
      if (msg.type === 'send') {
        const ws = sockets.get(msg.connId)
        if (ws?.readyState !== WebSocket.OPEN) return
        const payload = 'binary' in msg.payload ? base64ToBytes(msg.payload.binary) : msg.payload.text
        if (typeof payload === 'string' || !isFinalSaveFrame(payload)) {
          ws.send(payload)
          return
        }
        ws.send(payload, (error) => {
          noteSaveWire(msg.connId, error ? { kind: 'frame-send-error', error: error.message } : { kind: 'frames-sent' })
        })
        return
      }
      if (msg.type === 'close') {
        log(`page closed socket ${msg.connId}`)
        sockets.get(msg.connId)?.close(1000)
        return
      }
      if (msg.type === 'compile') {
        const started = performance.now()
        counters.compiles += 1
        void fetchControllerCompiler(ip, compileAttempts).then(
          (compile) => {
            counters.compileMs.push(Math.round(performance.now() - started))
            let bytecode: string
            try {
              bytecode = bytesToBase64(compile(msg.patternSrc))
            } catch (error) {
              return emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'compile-result', reqId: msg.reqId, ok: false, error: (error as Error).message })
            }
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'compile-result', reqId: msg.reqId, ok: true, bytecode })
          },
          (error: Error) => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'compile-result', reqId: msg.reqId, ok: false, error: error.message }),
        )
        return
      }
      if (msg.type === 'get-wifi-status') {
        return void queueMicrotask(() => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'wifi-status', reqId: msg.reqId, ok: true, status: {} }))
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const closeAll = async () => {
    await Promise.all([...sockets.values()].map(async (ws) => {
      if (ws.readyState === WebSocket.CLOSED) return
      const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()))
      ws.close(1000)
      await closed
    }))
  }
  return { transport, counters, saveWire, closeAll }
}
