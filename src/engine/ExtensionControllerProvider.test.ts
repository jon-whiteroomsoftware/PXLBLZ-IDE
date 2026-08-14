// H3 (#195): the extension-backed provider, exercised end-to-end against a fake
// relay that emulates a Pixelblaze device. Because the provider drives a real
// PixelblazeConnection over a RelayWebSocket, these tests cover the whole stack
// below the seam — handshake, status machine, JSON round-trips, fire-and-forget
// writes, disconnect, and bounded reconnect — without a DOM or a real extension.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ExtensionControllerProvider,
  pixelblazeDeviceIdFromBoardAndMac,
  reverseMacBytes,
} from './ExtensionControllerProvider'
import {
  RELAY_SOURCE,
  bytesToBase64,
  base64ToBytes,
  type RelayMessage,
  type RelayTransport,
} from './RelayWebSocket'
import { ControllerPermissionDeniedError } from './ControllerProvider'
import { encodeBinaryFrames, MessageType, PixelblazeConnection } from './PixelblazeConnection'
import { encodeMapData } from './mapPush'
import { encodePbp } from './pbpEncode'
import type { ControllerStatus } from './ControllerProvider'

/** A fake relay that plays both the extension and a Pixelblaze device. Replies
 *  are delivered on a microtask so the page-side promise machinery runs first,
 *  mirroring the real async hop. */
function makeDeviceTransport(
  opts: {
    detectAck?: boolean
    failConnect?: boolean
    /** Model a declined per-IP host permission (#229): on connect the helper emits
     *  permission-needed, then permission-denied, then the connId error/close it
     *  always sends on a denied connect. */
    denyPermission?: boolean
    /** Model a grant popup that is open/pending long enough for the page hint to render. */
    pendingPermission?: boolean
    /** Bytecode the fake helper returns from a `compile` request. */
    compileBytecode?: Uint8Array
    /** When set, the fake helper fails compile with this error. */
    compileError?: string
    /** Close the live socket during the first setCode activation. */
    dropOnFirstSetCode?: boolean
    /** Map blob the fake helper returns from a `get-map` request (base64-encoded
     *  internally). Absent → the helper replies ok with no map (device has none). */
    mapData?: Uint8Array
    /** When set, the fake helper fails get-map with this error. */
    mapError?: string
    /** Raw `/p/{id}` PBP blob returned by the fake helper. Absent means 404. */
    programData?: Uint8Array
    /** When set, the fake helper fails saved-program read-back with this error. */
    programError?: string
    /** Program ids the fake device reports from listPrograms. */
    programIds?: string[]
    /** Wire records the fake helper returns from a `discover` request. */
    discovered?: { id: string; localIp: string; name?: string; version?: string; boardType?: string }[]
    /** When set, the fake helper fails discover with this error. */
    discoverError?: string
    /** Whether device-wide renderer commands receive the firmware ack. */
    acknowledgeRendererCommands?: boolean
    /** Fields the fake device reports in the websocket settings packet. */
    settings?: { boardType?: string; chipId?: number; name?: string; pixelCount?: number }
    /** JSON the fake helper returns from `/wifistatus`. Absent means no MAC known. */
    wifiStatus?: { status?: number; ip?: string; ssid?: string; mac?: string }
    /** When set, the fake helper fails `/wifistatus` with this error. */
    wifiStatusError?: string
    /** Hold `/wifistatus` replies so reconnect identity recovery can be completed
     * out of order. */
    deferWifiStatus?: boolean
  } = {},
) {
  const detectAck = opts.detectAck ?? true
  const listeners = new Set<(m: RelayMessage) => void>()
  const writes: Record<string, unknown>[] = []
  const binaryWrites: Uint8Array[] = []
  let lastConnId = ''
  let openSocket = false
  let activeProgramId = 'P1'
  let pendingProgramId: string | null = null
  let droppedSetCode = false
  // When silent, the device stops answering frames and never emits a socket
  // close — modelling an abrupt power-off (no FIN/RST). Only the liveness
  // watchdog can detect this.
  let silent = false
  // When hanging, a `connect` produces neither open nor error — modelling a TCP
  // connect to an unreachable host that stalls for a long time. Only the connect
  // timeout can move past it.
  let hangConnect = false
  const pendingWifiStatusReplies: Array<() => void> = []

  const emit = (m: RelayMessage) => queueMicrotask(() => listeners.forEach((l) => l(m)))
  const reply = (connId: string, obj: object) => {
    if (silent) return
    emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId, payload: { text: JSON.stringify(obj) } })
  }

  const transport: RelayTransport = {
    post(msg) {
      switch (msg.type) {
        case 'detect':
          if (detectAck) emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'detect-ack' })
          return
        case 'connect':
          lastConnId = msg.connId
          if (hangConnect) return // no open, no error — the socket just stalls
          if (opts.denyPermission) {
            const address = new URL(msg.url).hostname
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'permission-needed', address })
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'permission-denied', address })
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: 'access not authorized' })
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: msg.connId })
            return
          }
          if (opts.pendingPermission) {
            const address = new URL(msg.url).hostname
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'permission-needed', address })
            return
          }
          if (opts.failConnect || silent) {
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: 'refused' })
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: msg.connId })
          } else {
            openSocket = true
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'open', connId: msg.connId })
          }
          return
        case 'close':
          openSocket = false
          return
        case 'compile':
          if (opts.compileError) {
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'compile-result', reqId: msg.reqId, ok: false, error: opts.compileError })
          } else {
            const blob = opts.compileBytecode ?? new Uint8Array(8) // header reconciles (0+0+8)
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'compile-result', reqId: msg.reqId, ok: true, bytecode: bytesToBase64(blob) })
          }
          return
        case 'get-map':
          if (opts.mapError) {
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'map-data', reqId: msg.reqId, ok: false, error: opts.mapError })
          } else if (opts.mapData) {
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'map-data', reqId: msg.reqId, ok: true, mapData: bytesToBase64(opts.mapData) })
          } else {
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'map-data', reqId: msg.reqId, ok: true })
          }
          return
        case 'get-program':
          if (opts.programError) {
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'program-data', reqId: msg.reqId, ok: false, error: opts.programError })
          } else if (opts.programData) {
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'program-data', reqId: msg.reqId, ok: true, programData: bytesToBase64(opts.programData) })
          } else {
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'program-data', reqId: msg.reqId, ok: true })
          }
          return
        case 'get-wifi-status':
          {
            const replyWifiStatus = () => {
              if (opts.wifiStatusError) {
                emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'wifi-status', reqId: msg.reqId, ok: false, error: opts.wifiStatusError })
              } else {
                emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'wifi-status', reqId: msg.reqId, ok: true, status: opts.wifiStatus ?? {} })
              }
            }
            if (opts.deferWifiStatus) pendingWifiStatusReplies.push(replyWifiStatus)
            else replyWifiStatus()
          }
          return
        case 'discover':
          if (opts.discoverError) {
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'discover-result', reqId: msg.reqId, ok: false, error: opts.discoverError })
          } else {
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'discover-result', reqId: msg.reqId, ok: true, controllers: opts.discovered ?? [] })
          }
          return
        case 'send': {
          if ('binary' in msg.payload) {
            binaryWrites.push(base64ToBytes(msg.payload.binary))
            return
          }
          const cmd = JSON.parse(msg.payload.text) as Record<string, unknown>
          if (cmd.getVars) reply(msg.connId, { vars: { speed: 0.5 } })
          if (cmd.getConfig) {
            reply(msg.connId, { brightness: 0.4, ...opts.settings })
            reply(msg.connId, { activeProgram: { activeProgramId, controls: { sliderX: 0.7 } } })
          }
          if (cmd.ping) reply(msg.connId, { ack: 1 })
          if (cmd.listPrograms) {
            const text = (opts.programIds ?? []).map((id) => `${id}\t${id}-name`).join('\n')
            const frame = encodeBinaryFrames(MessageType.getProgramList, new TextEncoder().encode(text))[0]
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId: msg.connId, payload: { binary: bytesToBase64(frame) } })
          }
          if ('brightness' in cmd) writes.push(cmd)
          if ('pixelCount' in cmd) writes.push(cmd)
          if ('setVars' in cmd) writes.push(cmd)
          if ('setControls' in cmd) writes.push(cmd)
          if ('pause' in cmd && !('setCode' in cmd)) {
            writes.push(cmd)
            if (opts.acknowledgeRendererCommands ?? true) reply(msg.connId, { ack: 1 })
          }
          if ('setCode' in cmd) {
            writes.push(cmd)
            const setCode = cmd.setCode as { id?: unknown }
            pendingProgramId = typeof setCode.id === 'string' ? setCode.id : null
            if (opts.dropOnFirstSetCode && !droppedSetCode) {
              droppedSetCode = true
              openSocket = false
              emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: msg.connId })
            }
          }
          if (cmd.pause === false && pendingProgramId) {
            activeProgramId = pendingProgramId
            pendingProgramId = null
          }
          if ('savePixelMap' in cmd) writes.push(cmd)
          return
        }
      }
    },
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }

  return {
    transport,
    writes,
    binaryWrites,
    isOpen: () => openSocket,
    pushFrame: (obj: object) => reply(lastConnId, obj),
    setActiveProgramId: (programId: string) => {
      activeProgramId = programId
    },
    dropSocket: () => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: lastConnId }),
    goSilent: () => {
      silent = true
    },
    revive: () => {
      silent = false
    },
    hang: () => {
      hangConnect = true
    },
    unhang: () => {
      hangConnect = false
    },
    flushNextWifiStatus: () => pendingWifiStatusReplies.shift()?.(),
    flushLatestWifiStatus: () => pendingWifiStatusReplies.pop()?.(),
    pendingWifiStatusCount: () => pendingWifiStatusReplies.length,
  }
}

const TARGET = { address: '192.168.8.224' }

describe('ExtensionControllerProvider', () => {
  it('reverses MAC bytes and builds the Pixelblaze cloud id', () => {
    expect(reverseMacBytes('34:94:54:EE:D4:3C')).toBe('3cd4ee549434')
    expect(reverseMacBytes('34-94-54-ee-d4-3c')).toBe('3cd4ee549434')
    expect(reverseMacBytes('not-a-mac')).toBeNull()
    expect(pixelblazeDeviceIdFromBoardAndMac('pb32', '34:94:54:EE:D4:3C')).toBe(
      'pixelblaze_pb32_3cd4ee549434',
    )
    expect(pixelblazeDeviceIdFromBoardAndMac(undefined, '34:94:54:EE:D4:3C')).toBeNull()
  })

  it('starts in no-helper', () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    expect(p.getStatus()).toEqual({ kind: 'no-extension' })
    // Push + compile are GO since the H8 spike (#200).
    expect(p.capabilities).toEqual({ push: true, compile: true })
  })

  it('detectHelper resolves true and moves to helper-present when the relay acks', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    await expect(p.detectHelper()).resolves.toBe(true)
    expect(p.getStatus()).toEqual({ kind: 'extension-present' })
  })

  it('detectHelper resolves false and stays no-helper when there is no ack', async () => {
    const p = new ExtensionControllerProvider({
      transport: makeDeviceTransport({ detectAck: false }).transport,
      detectTimeoutMs: 10,
    })
    await expect(p.detectHelper()).resolves.toBe(false)
    expect(p.getStatus()).toEqual({ kind: 'no-extension' })
  })

  it('connects through the relay and reports connected', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    const seen: ControllerStatus[] = []
    p.subscribe((s) => seen.push(s))
    await p.connect(TARGET)
    expect(p.getStatus()).toEqual({
      kind: 'connected',
      connectionGeneration: 1,
      controller: { id: TARGET.address, address: TARGET.address, deviceId: null },
    })
    expect(seen.map((s) => s.kind)).toContain('connecting')
  })

  it('uses a discovery-picked device id immediately on connect', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    await p.connect({
      address: TARGET.address,
      deviceId: 'pixelblaze_pb32_known',
      name: 'Desk',
    })
    expect(p.getStatus()).toEqual({
      kind: 'connected',
      connectionGeneration: 1,
      controller: {
        id: 'pixelblaze_pb32_known',
        address: TARGET.address,
        deviceId: 'pixelblaze_pb32_known',
        name: 'Desk',
      },
    })
  })

  it('recovers a manual-IP device id from websocket config plus /wifistatus', async () => {
    const d = makeDeviceTransport({
      settings: { boardType: 'pb32', chipId: 3986670 },
      wifiStatus: { mac: '34:94:54:EE:D4:3C' },
    })
    const p = new ExtensionControllerProvider({ transport: d.transport })

    await p.connect(TARGET)

    expect(p.getStatus()).toEqual({
      kind: 'connected',
      connectionGeneration: 1,
      controller: {
        id: 'pixelblaze_pb32_3cd4ee549434',
        address: TARGET.address,
        deviceId: 'pixelblaze_pb32_3cd4ee549434',
      },
    })
  })

  it('falls back to cloud discovery when direct manual-IP id recovery is unavailable', async () => {
    const d = makeDeviceTransport({
      settings: { boardType: 'pb32', chipId: 3986670 },
      wifiStatusError: 'wifi status failed',
      discovered: [{ id: 'pixelblaze_pb32_from_discovery', localIp: TARGET.address }],
    })
    const p = new ExtensionControllerProvider({ transport: d.transport })

    await p.connect(TARGET)

    expect(p.getStatus()).toEqual({
      kind: 'connected',
      connectionGeneration: 1,
      controller: {
        id: 'pixelblaze_pb32_from_discovery',
        address: TARGET.address,
        deviceId: 'pixelblaze_pb32_from_discovery',
      },
    })
  })

  it('keeps a manual-IP connection usable with null deviceId when no id is recoverable', async () => {
    const d = makeDeviceTransport({ discoverError: 'cloud offline' })
    const p = new ExtensionControllerProvider({ transport: d.transport })

    await p.connect(TARGET)

    expect(p.getStatus()).toEqual({
      kind: 'connected',
      connectionGeneration: 1,
      controller: { id: TARGET.address, address: TARGET.address, deviceId: null },
    })
  })

  it('rejects connect when no helper is installed', async () => {
    const p = new ExtensionControllerProvider({
      transport: makeDeviceTransport({ detectAck: false }).transport,
      detectTimeoutMs: 10,
    })
    await expect(p.connect(TARGET)).rejects.toThrow(/helper/i)
    expect(p.getStatus().kind).toBe('error')
  })

  it('goes to error when the socket fails to open', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport({ failConnect: true }).transport })
    await expect(p.connect(TARGET)).rejects.toThrow()
    expect(p.getStatus().kind).toBe('error')
  })

  it('rejects a declined per-IP permission with a typed error and resets to idle (#229)', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport({ denyPermission: true }).transport })
    // The typed error lets the store tell a user decline from a real failure and
    // drop the half-created entry rather than showing an error pill.
    await expect(p.connect(TARGET)).rejects.toBeInstanceOf(ControllerPermissionDeniedError)
    // A decline resets to the pre-connect idle state, not an error.
    expect(p.getStatus()).toEqual({ kind: 'extension-present' })
  })

  it('surfaces a pending per-IP authorization hint while connecting (#235)', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport({ pendingPermission: true }).transport })
    const seen: ControllerStatus[] = []
    p.subscribe((s) => seen.push(s))

    void p.connect(TARGET).catch(() => {})
    await new Promise((r) => setTimeout(r, 0))

    expect(seen).toContainEqual({
      kind: 'connecting',
      target: TARGET,
      authorizationNeededIp: TARGET.address,
    })
  })

  describe('push surface (H10)', () => {
    it('compile round-trips a reqId-keyed request and returns the helper bytecode', async () => {
      const d = makeDeviceTransport({ compileBytecode: new Uint8Array([1, 2, 3, 4]) })
      const p = new ExtensionControllerProvider({ transport: d.transport })
      await p.connect(TARGET)
      await expect(p.compile('export function render(i){}')).resolves.toEqual(
        new Uint8Array([1, 2, 3, 4]),
      )
    })

    it('compile rejects with the helper error message', async () => {
      const d = makeDeviceTransport({ compileError: 'syntax error at line 1' })
      const p = new ExtensionControllerProvider({ transport: d.transport })
      await p.connect(TARGET)
      await expect(p.compile('garbage')).rejects.toThrow(/syntax error/)
    })

    it('compile rejects when not connected (no target to fetch the compiler from)', async () => {
      const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
      await expect(p.compile('x')).rejects.toThrow(/Not connected/)
    })

    it('compile times out when the helper never answers', async () => {
      const d = makeDeviceTransport()
      // Swallow the compile request so no result ever comes back.
      const orig = d.transport.post
      d.transport.post = (m) => {
        if (m.type !== 'compile') orig(m)
      }
      const p = new ExtensionControllerProvider({ transport: d.transport, compileTimeoutMs: 10 })
      await p.connect(TARGET)
      await expect(p.compile('x')).rejects.toThrow(/timed out/)
    })

    it('pushBytecode sends the save-and-run sequence over the live connection', async () => {
      const d = makeDeviceTransport()
      const p = new ExtensionControllerProvider({ transport: d.transport })
      await p.connect(TARGET)
      await p.pushBytecode(new Uint8Array([9, 9, 9]), { id: 'PROG1', name: 'demo' })
      // setCode JSON captured, plus the binary putByteCode frame.
      const setCode = d.writes.find((w) => 'setCode' in w)
      expect(setCode?.setCode).toMatchObject({ size: 3, id: 'PROG1', name: 'demo' })
      expect(d.binaryWrites).toHaveLength(1)
      expect(d.binaryWrites[0][0]).toBe(MessageType.putByteCode)
      expect([...d.binaryWrites[0].subarray(2)]).toEqual([9, 9, 9])
    })

    it('pushBytecode resolves after activation and remembers the active bytecode size', async () => {
      const d = makeDeviceTransport()
      const p = new ExtensionControllerProvider({ transport: d.transport })
      await p.connect(TARGET)

      await p.pushBytecode(new Uint8Array([9, 9, 9]), { id: 'PROG1', name: 'demo' })

      await expect(p.getActiveProgramBytecodeSize()).resolves.toBe(3)
    })

    it('forgets the previous footprint when a later activation fails without disconnecting', async () => {
      const d = makeDeviceTransport()
      const p = new ExtensionControllerProvider({ transport: d.transport })
      await p.connect(TARGET)
      await p.pushBytecode(new Uint8Array([9, 9, 9]), { id: 'PROG1' })
      await expect(p.getActiveProgramBytecodeSize()).resolves.toBe(3)

      vi.spyOn(PixelblazeConnection.prototype, 'pushByteCodeAndWait')
        .mockRejectedValueOnce(new Error('activation timed out'))
      await expect(
        p.pushBytecode(new Uint8Array([4, 5, 6, 7]), { id: 'PROG2' }),
      ).rejects.toThrow('activation timed out')

      await expect(p.getActiveProgramBytecodeSize()).resolves.toBeNull()
    })

    it('invalidates the footprint after an external active-program change', async () => {
      const d = makeDeviceTransport()
      const p = new ExtensionControllerProvider({ transport: d.transport })
      await p.connect(TARGET)
      await p.pushBytecode(new Uint8Array([9, 9, 9]), { id: 'PROG1' })

      d.setActiveProgramId('FOREIGN_PROGRAM')
      await expect(p.getActiveProgramBytecodeSize()).resolves.toBeNull()

      d.setActiveProgramId('PROG1')
      await expect(p.getActiveProgramBytecodeSize()).resolves.toBeNull()
    })

    it('pushBytecode rejects when not connected', async () => {
      const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
      await expect(p.pushBytecode(new Uint8Array([0]), { id: 'X' })).rejects.toThrow(/Not connected/)
    })

    it('setPixelMap encodes the coords and writes a type-8 map frame then persists', async () => {
      const d = makeDeviceTransport()
      const p = new ExtensionControllerProvider({ transport: d.transport })
      await p.connect(TARGET)
      await p.setPixelMap([
        [0, 0],
        [1, 1],
      ])
      // One binary putPixelMap frame carrying the 12-byte header + 4 uint16 coords.
      expect(d.binaryWrites).toHaveLength(1)
      expect(d.binaryWrites[0][0]).toBe(MessageType.putPixelMap)
      expect(d.binaryWrites[0].length).toBe(2 + 12 + 4 * 2)
      // Persisted to flash by default.
      expect(d.writes.some((w) => 'savePixelMap' in w)).toBe(true)
    })

    it('setPixelMap rejects when not connected', async () => {
      const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
      await expect(p.setPixelMap([[0, 0]])).rejects.toThrow(/Not connected/)
    })
  })

  describe('auto-discovery (H14, #206)', () => {
    it('round-trips a reqId-keyed discover and maps localIp → address', async () => {
      const d = makeDeviceTransport({
        discovered: [
          {
            id: 'pixelblaze_pb32_abc',
            localIp: '192.168.8.224',
            name: 'Burner bag',
            version: '3.67',
            boardType: 'pb32',
          },
          { id: 'pixelblaze_pb32_def', localIp: '192.168.8.99' },
        ],
      })
      const p = new ExtensionControllerProvider({ transport: d.transport })
      await expect(p.discover()).resolves.toEqual([
        {
          id: 'pixelblaze_pb32_abc',
          address: '192.168.8.224',
          name: 'Burner bag',
          version: '3.67',
          boardType: 'pb32',
        },
        {
          id: 'pixelblaze_pb32_def',
          address: '192.168.8.99',
          name: undefined,
          version: undefined,
          boardType: undefined,
        },
      ])
    })

    it('rejects when the helper reports a discovery failure', async () => {
      const d = makeDeviceTransport({ discoverError: 'GET /discover -> 503' })
      const p = new ExtensionControllerProvider({ transport: d.transport })
      await expect(p.discover()).rejects.toThrow('GET /discover -> 503')
    })

    it('rejects when the helper never answers (timeout)', async () => {
      const d = makeDeviceTransport()
      const orig = d.transport.post
      d.transport.post = (m) => {
        if (m.type !== 'discover') orig(m)
      }
      const p = new ExtensionControllerProvider({ transport: d.transport, discoverTimeoutMs: 10 })
      await expect(p.discover()).rejects.toThrow('Controller discovery timed out')
    })

    it('discovers without needing a live connection (global lookup, no address)', async () => {
      const d = makeDeviceTransport({ discovered: [{ id: 'x', localIp: '10.0.0.5' }] })
      const p = new ExtensionControllerProvider({ transport: d.transport })
      // No connect() first — discovery is connection-independent.
      await expect(p.discover()).resolves.toEqual([
        { id: 'x', address: '10.0.0.5', name: undefined, version: undefined, boardType: undefined },
      ])
    })
  })

  describe('map read-back (H13)', () => {
    it('round-trips a reqId-keyed get-map and decodes the helper blob to coords', async () => {
      const map = encodeMapData([
        [0, 0],
        [1, 1],
        [0.5, 0.25],
      ])
      const d = makeDeviceTransport({ mapData: map })
      const p = new ExtensionControllerProvider({ transport: d.transport })
      await p.connect(TARGET)
      const read = await p.getPixelMap()
      expect(read).not.toBeNull()
      expect(read!).toHaveLength(3)
      expect(read![0][0]).toBeCloseTo(0, 4)
      expect(read![1][1]).toBeCloseTo(1, 4)
      expect(read![2][0]).toBeCloseTo(0.5, 3)
    })

    it('resolves null when the device has no installed map', async () => {
      const d = makeDeviceTransport() // no mapData
      const p = new ExtensionControllerProvider({ transport: d.transport })
      await p.connect(TARGET)
      await expect(p.getPixelMap()).resolves.toBeNull()
    })

    it('rejects on a helper read error', async () => {
      const d = makeDeviceTransport({ mapError: 'helper authorization failed' })
      const p = new ExtensionControllerProvider({ transport: d.transport })
      await p.connect(TARGET)
      await expect(p.getPixelMapData()).rejects.toThrow('helper authorization failed')
    })

    it('rejects when not connected (no target)', async () => {
      const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
      await expect(p.getPixelMapData()).rejects.toThrow('Not connected to a Controller')
    })

    it('rejects on timeout when the helper never answers', async () => {
      const d = makeDeviceTransport()
      const orig = d.transport.post
      d.transport.post = (m) => {
        if (m.type !== 'get-map') orig(m)
      }
      const p = new ExtensionControllerProvider({ transport: d.transport, getMapTimeoutMs: 10 })
      await p.connect(TARGET)
      await expect(p.getPixelMapData()).rejects.toThrow('Installed map read timed out')
    })
  })

  describe('saved-program read-back', () => {
    it('round-trips a PBP blob through the relay and returns recovered source', async () => {
      const source = 'export function render(index) { hsv(index, 1, 1) }'
      const blob = encodePbp({
        id: 'PROGRAM_01',
        name: 'Aurora Drift',
        sourceCode: source,
        byteCode: Uint8Array.from([1, 2, 3]),
      })
      const p = new ExtensionControllerProvider({
        transport: makeDeviceTransport({ programData: blob }).transport,
      })
      await p.connect(TARGET)

      await expect(p.readSavedProgram('PROGRAM_01')).resolves.toEqual({
        programId: 'PROGRAM_01',
        deviceName: 'Aurora Drift',
        sourceCode: source,
        stamp: null,
      })
    })

    it('resolves null when the program is missing', async () => {
      const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
      await p.connect(TARGET)

      await expect(p.readSavedProgram('MISSING')).resolves.toBeNull()
    })

    it('surfaces helper failures as clean read errors', async () => {
      const p = new ExtensionControllerProvider({
        transport: makeDeviceTransport({ programError: 'GET /p/BROKEN -> 500' }).transport,
      })
      await p.connect(TARGET)

      await expect(p.readSavedProgram('BROKEN')).rejects.toThrow('GET /p/BROKEN -> 500')
    })

    it('surfaces an undecodable PBP as a clean read error', async () => {
      const p = new ExtensionControllerProvider({
        transport: makeDeviceTransport({ programData: Uint8Array.from([1, 2, 3]) }).transport,
      })
      await p.connect(TARGET)

      await expect(p.readSavedProgram('BROKEN')).rejects.toThrow(
        'Saved program BROKEN is not a readable PBP blob.',
      )
    })

    it('rejects when not connected and when the helper times out', async () => {
      const d = makeDeviceTransport()
      const p = new ExtensionControllerProvider({
        transport: d.transport,
        getProgramTimeoutMs: 10,
      })
      await expect(p.readSavedProgram('OFFLINE')).rejects.toThrow(/not connected/i)

      await p.connect(TARGET)
      const originalPost = d.transport.post
      d.transport.post = (message) => {
        if (message.type !== 'get-program') originalPost(message)
      }
      await expect(p.readSavedProgram('SLOW')).rejects.toThrow('Saved program SLOW read timed out.')
    })
  })

  it('reads vars and config across the bridge once connected', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    await p.connect(TARGET)
    await expect(p.getVars()).resolves.toEqual({ speed: 0.5 })
    await expect(p.getConfig()).resolves.toEqual({
      brightness: 0.4,
      activeProgramId: 'P1',
      activeControls: { sliderX: 0.7 },
    })
  })

  it('reports captured fps via getTelemetry', async () => {
    const d = makeDeviceTransport()
    const p = new ExtensionControllerProvider({ transport: d.transport })
    await p.connect(TARGET)
    await expect(p.getTelemetry()).resolves.toEqual({ fps: null })
    d.pushFrame({ fps: 73 })
    await new Promise((r) => queueMicrotask(() => r(null)))
    await expect(p.getTelemetry()).resolves.toEqual({ fps: 73 })
  })

  it('sends brightness, variable, and controls writes to the device', async () => {
    const d = makeDeviceTransport()
    const p = new ExtensionControllerProvider({ transport: d.transport })
    await p.connect(TARGET)
    await p.setBrightness(0.25)
    await p.setVars({ __px_powerLimit: 0.2 })
    await p.setControls({ sliderX: 0.9 }, true)
    expect(d.writes).toEqual([
      { brightness: 0.25, save: false },
      { setVars: { __px_powerLimit: 0.2 } },
      { setControls: { sliderX: 0.9 }, save: true },
    ])
  })

  it('round-trips acknowledged renderer pause and resume through the provider boundary', async () => {
    const d = makeDeviceTransport()
    const p = new ExtensionControllerProvider({ transport: d.transport })
    await p.connect(TARGET)

    await expect(p.setRendererPaused(true)).resolves.toBeUndefined()
    await expect(p.setRendererPaused(false)).resolves.toBeUndefined()

    expect(d.writes.filter((write) => 'pause' in write)).toEqual([
      { pause: true },
      { pause: false },
    ])
  })

  it('rejects an unacknowledged renderer command without poisoning connection status', async () => {
    const d = makeDeviceTransport({ acknowledgeRendererCommands: false })
    const p = new ExtensionControllerProvider({
      transport: d.transport,
      requestTimeoutMs: 10,
      pingIntervalMs: 0,
      livenessTimeoutMs: 0,
    })
    await p.connect(TARGET)

    await expect(p.setRendererPaused(true)).rejects.toThrow('timed out waiting for "ack"')
    expect(p.getStatus().kind).toBe('connected')
  })

  it('sends a saved pixelCount write to the device', async () => {
    const d = makeDeviceTransport()
    const p = new ExtensionControllerProvider({ transport: d.transport })
    await p.connect(TARGET)
    await p.setPixelCount(16)
    expect(d.writes).toEqual([{ pixelCount: 16, save: true }])
  })

  it('resolves getPixelMap as null (H13 unconfirmed)', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    await p.connect(TARGET)
    await expect(p.getPixelMap()).resolves.toBeNull()
  })

  it('rejects reads when not connected', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    await expect(p.getVars()).rejects.toThrow(/not connected/i)
  })

  it('disconnect returns to helper-present and stops reconnecting', async () => {
    const d = makeDeviceTransport()
    const p = new ExtensionControllerProvider({ transport: d.transport })
    await p.connect(TARGET)
    await p.disconnect()
    expect(p.getStatus()).toEqual({ kind: 'extension-present' })
    expect(d.isOpen()).toBe(false)
  })

  describe('reconnect on unexpected drop', () => {
    let timers: Array<() => void>
    let opts: ConstructorParameters<typeof ExtensionControllerProvider>[0]

    beforeEach(() => {
      timers = []
    })
    afterEach(() => vi.restoreAllMocks())

    const flushTimers = () => {
      const pending = timers
      timers = []
      pending.forEach((fn) => fn())
    }

    it('attempts to reconnect and returns to connected', async () => {
      const d = makeDeviceTransport()
      opts = {
        transport: d.transport,
        reconnectDelayMs: 5,
        setTimeout: ((fn: () => void) => {
          timers.push(fn)
          return 0
        }) as unknown as typeof setTimeout,
      }
      const p = new ExtensionControllerProvider(opts)
      await p.connect(TARGET)
      const firstStatus = p.getStatus()
      expect(firstStatus.kind).toBe('connected')
      const firstConnectionGeneration = firstStatus.kind === 'connected'
        ? firstStatus.connectionGeneration
        : undefined
      expect(firstConnectionGeneration).toBe(1)

      d.dropSocket()
      await new Promise((r) => queueMicrotask(() => r(null)))
      expect(p.getStatus().kind).toBe('connecting')

      flushTimers() // fire the scheduled reconnect
      await new Promise((r) => setTimeout(r, 0))
      expect(p.getStatus().kind).toBe('connected')
      expect(p.getStatus()).toMatchObject({
        kind: 'connected',
        connectionGeneration: 2,
      })
    })

    it('does not publish stale identity recovery after its replacement connects (#851)', async () => {
      const d = makeDeviceTransport({
        settings: { boardType: 'pb32' },
        wifiStatus: { mac: '34:94:54:EE:D4:3C' },
        deferWifiStatus: true,
      })
      const p = new ExtensionControllerProvider({
        transport: d.transport,
        reconnectDelayMs: 0,
      })

      const initialConnect = p.connect(TARGET)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(d.pendingWifiStatusCount()).toBe(1)
      d.dropSocket()
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(d.pendingWifiStatusCount()).toBe(2)

      // Finish generation 2 first, then allow the obsolete generation 1
      // recovery to complete. Provider status must never regress to generation 1.
      d.flushLatestWifiStatus()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(p.getStatus()).toMatchObject({ kind: 'connected', connectionGeneration: 2 })
      d.flushNextWifiStatus()
      await initialConnect
      expect(p.getStatus()).toMatchObject({ kind: 'connected', connectionGeneration: 2 })
    })

    it('keeps the original connect pending when stale recovery finishes first (#851)', async () => {
      const d = makeDeviceTransport({
        settings: { boardType: 'pb32' },
        wifiStatus: { mac: '34:94:54:EE:D4:3C' },
        deferWifiStatus: true,
      })
      const p = new ExtensionControllerProvider({
        transport: d.transport,
        reconnectDelayMs: 0,
      })

      let initialSettled = false
      const initialConnect = p.connect(TARGET)
      void initialConnect.then(
        () => { initialSettled = true },
        () => { initialSettled = true },
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
      d.dropSocket()
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(d.pendingWifiStatusCount()).toBe(2)

      // Generation 1 finishes while generation 2 is still recovering. It must
      // neither publish connected nor let the user-facing connect() resolve.
      d.flushNextWifiStatus()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(p.getStatus().kind).toBe('connecting')
      expect(initialSettled).toBe(false)

      d.flushNextWifiStatus()
      await initialConnect
      expect(p.getStatus()).toMatchObject({ kind: 'connected', connectionGeneration: 2 })
    })

    it('forgets the active bytecode footprint after reconnecting', async () => {
      const d = makeDeviceTransport()
      const p = new ExtensionControllerProvider({
        transport: d.transport,
        reconnectDelayMs: 5,
        setTimeout: ((fn: () => void) => {
          timers.push(fn)
          return 0
        }) as unknown as typeof setTimeout,
      })
      await p.connect(TARGET)
      await p.pushBytecode(new Uint8Array([1, 2, 3]), { id: 'KNOWN_PROGRAM' })
      await expect(p.getActiveProgramBytecodeSize()).resolves.toBe(3)

      d.dropSocket()
      await new Promise((resolve) => queueMicrotask(() => resolve(null)))
      flushTimers()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(p.getStatus().kind).toBe('connected')
      await expect(p.getActiveProgramBytecodeSize()).resolves.toBeNull()
    })

    it('reconnects after a push loses the socket during activation and accepts a retry', async () => {
      const d = makeDeviceTransport({ dropOnFirstSetCode: true })
      const p = new ExtensionControllerProvider({
        transport: d.transport,
        reconnectDelayMs: 5,
        setTimeout: ((fn: () => void) => {
          timers.push(fn)
          return 0
        }) as unknown as typeof setTimeout,
      })
      await p.connect(TARGET)

      await expect(
        p.pushBytecode(new Uint8Array([1, 2, 3]), { id: 'FIRST_PROGRAM' }),
      ).rejects.toThrow(/connection closed/i)
      expect(p.getStatus().kind).toBe('connecting')

      flushTimers()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(p.getStatus().kind).toBe('connected')
      await expect(
        p.pushBytecode(new Uint8Array([4, 5, 6]), { id: 'RETRY_PROGRAM' }),
      ).resolves.toBeUndefined()
    })

    it('keeps reconnecting indefinitely by default while the Controller is gone', async () => {
      const d = makeDeviceTransport()
      const p = new ExtensionControllerProvider({
        transport: d.transport,
        reconnectDelayMs: 5,
        setTimeout: ((fn: () => void) => {
          timers.push(fn)
          return 0
        }) as unknown as typeof setTimeout,
      })
      await p.connect(TARGET)
      d.goSilent() // device is now unreachable; reconnect opens will fail
      d.dropSocket()
      await new Promise((r) => queueMicrotask(() => r(null)))

      // Several failed reconnect cycles must not give up — status stays connecting.
      for (let i = 0; i < 5; i++) {
        flushTimers()
        await new Promise((r) => setTimeout(r, 0)) // drain the open→fail→reschedule chain
        expect(p.getStatus().kind).toBe('connecting')
      }

      // When the Controller returns, the next cycle reconnects.
      d.revive()
      flushTimers()
      await new Promise((r) => setTimeout(r, 0))
      expect(p.getStatus().kind).toBe('connected')
    })

    it('reconnects after the watchdog flags a silent (no-close) connection', async () => {
      vi.useFakeTimers()
      try {
        const d = makeDeviceTransport()
        const p = new ExtensionControllerProvider({
          transport: d.transport,
          pingIntervalMs: 1000,
          livenessTimeoutMs: 2500,
          reconnectDelayMs: 5,
        })
        const connectP = p.connect(TARGET)
        await vi.advanceTimersByTimeAsync(0) // flush detect-ack + open microtasks
        await connectP
        expect(p.getStatus().kind).toBe('connected')

        // Power-off: device stops answering pings and never sends a close frame.
        d.goSilent()
        await vi.advanceTimersByTimeAsync(4000) // crosses the 2.5s watchdog window
        expect(p.getStatus().kind).toBe('connecting')

        // Power back on: the scheduled reconnect reopens and returns to connected.
        d.revive()
        await vi.advanceTimersByTimeAsync(10)
        expect(p.getStatus().kind).toBe('connected')
      } finally {
        vi.useRealTimers()
      }
    })

    it('times out a stalled reconnect attempt and keeps polling until the Controller returns', async () => {
      vi.useFakeTimers()
      try {
        const d = makeDeviceTransport()
        const p = new ExtensionControllerProvider({
          transport: d.transport,
          pingIntervalMs: 1000,
          livenessTimeoutMs: 2500,
          connectTimeoutMs: 3000,
          reconnectDelayMs: 5,
        })
        const connectP = p.connect(TARGET)
        await vi.advanceTimersByTimeAsync(0)
        await connectP
        expect(p.getStatus().kind).toBe('connected')

        // Track every status the reconnect loop emits: a failed *attempt* must not
        // flash the error pill — the loop stays connecting until it gives up.
        const kinds: string[] = []
        p.subscribe((s) => kinds.push(s.kind))

        // Power-off where the socket neither closes nor refuses — reopen attempts
        // stall instead of failing fast. Without a connect timeout the loop would
        // hang on the first attempt forever.
        d.goSilent()
        d.hang()
        await vi.advanceTimersByTimeAsync(4000) // watchdog flags it → first reconnect
        expect(p.getStatus().kind).toBe('connecting')

        // Each stalled attempt is abandoned after connectTimeoutMs and a fresh one
        // scheduled; status holds at connecting across several cycles, never error.
        await vi.advanceTimersByTimeAsync(10000)
        expect(p.getStatus().kind).toBe('connecting')
        expect(kinds).not.toContain('error')

        // Power back on: the next attempt opens within the timeout window.
        d.revive()
        d.unhang()
        await vi.advanceTimersByTimeAsync(3010)
        expect(p.getStatus().kind).toBe('connected')
      } finally {
        vi.useRealTimers()
      }
    })

    it('goes to error after exhausting reconnect attempts', async () => {
      const d = makeDeviceTransport()
      const p = new ExtensionControllerProvider({
        transport: d.transport,
        maxReconnectAttempts: 0,
        setTimeout: ((fn: () => void) => {
          timers.push(fn)
          return 0
        }) as unknown as typeof setTimeout,
      })
      await p.connect(TARGET)
      d.dropSocket()
      await new Promise((r) => queueMicrotask(() => r(null)))
      expect(p.getStatus()).toEqual({ kind: 'error', message: 'Controller connection lost' })
    })
  })
})
