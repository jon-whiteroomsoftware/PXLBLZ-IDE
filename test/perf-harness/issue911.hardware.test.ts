// Preview-stream tax measurement for issue #911 (epic #903).
//
// `sendUpdates` is per-connection since firmware 3.16 and the once-per-
// second stats packet reaches every client regardless, so a client can
// decline preview frames without losing FPS telemetry. Nothing measures
// what the stream costs; Ben's only word is "slightly". This probe holds a
// fast Pattern on the Controller and samples firmware-reported FPS across
// four states of a second observer socket: closed, connected-with-no-
// request, explicit sendUpdates:false, and explicit sendUpdates:true —
// counting the type-5 preview frames the observer actually receives so
// each state's behavior is established, not assumed.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import WebSocket from 'ws'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  declaredOutputProfileStamp,
  fetchControllerCompiler,
  nodeWebSocketFactory,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { bundle } from '../../src/engine/bundle'

const runHardware = process.env.ISSUE911_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'
const SAMPLE_MS = 8_000
const SETTLE_MS = 2_000
const PIXEL_COUNTS = [256, 2_000] as const
const OBSERVER_STATES = ['closed', 'idle-default', 'updates-off', 'updates-on'] as const

class ObserverSocket {
  private socket: WebSocket | null = null
  previewFrames = 0

  async open(): Promise<void> {
    this.previewFrames = 0
    const socket = new WebSocket(`ws://${ip}:81`)
    socket.binaryType = 'arraybuffer'
    socket.on('message', (data) => {
      if (data instanceof ArrayBuffer && new Uint8Array(data)[0] === 5) this.previewFrames += 1
      else if (Buffer.isBuffer(data) && data[0] === 5) this.previewFrames += 1
    })
    // The firmware's connection pool is small; a refused handshake can stall
    // silently, so the open is bounded and reported instead of hanging.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.terminate()
        reject(new Error('Observer socket did not open within 5 s (device connection pool exhausted?).'))
      }, 5_000)
      socket.once('open', () => { clearTimeout(timer); resolve() })
      socket.once('error', (error) => { clearTimeout(timer); reject(error) })
    })
    this.socket = socket
  }

  send(payload: object): void {
    this.socket?.send(JSON.stringify(payload))
  }

  close(): void {
    this.socket?.close()
    this.socket = null
  }
}

async function sampleFps(connection: PixelblazeConnection): Promise<{ median: number; min: number; max: number; samples: number }> {
  const values: number[] = []
  const end = Date.now() + SAMPLE_MS
  while (Date.now() < end) {
    if (connection.fps && connection.fps > 0) values.push(connection.fps)
    await sleep(250)
  }
  if (values.length === 0) throw new Error('Controller did not report FPS during the sample window.')
  const sorted = [...values].sort((a, b) => a - b)
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
    samples: values.length,
  }
}

describe('preview-stream tax on hardware (#911)', () => {
  it.skipIf(!runHardware)('measures FPS across observer-socket states and restores Controller state', async () => {
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
    const observer = new ObserverSocket()
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

      const bytecode = compile(bundle(DEMOS.Caustics, LIBRARIES).code)
      const programId = makeProgramId()
      connection.pushByteCode(bytecode, { id: programId, name: '' })
      const activated = await waitForControllerConfig(() => connection.getConfig(), { activeProgramId: programId })
      if (activated.activeProgramId !== programId) throw new Error(`Probe ${programId} did not activate.`)

      const rows: Array<{
        pixelCount: number
        state: (typeof OBSERVER_STATES)[number]
        fps: { median: number; min: number; max: number; samples: number }
        observerPreviewFrames: number
      }> = []
      for (const pixelCount of PIXEL_COUNTS) {
        connection.setPixelCount(pixelCount, false)
        await sleep(1_000)
        for (const state of OBSERVER_STATES) {
          process.stdout.write(`  ${state} @ ${pixelCount} px ... `)
          if (state !== 'closed') {
            await observer.open()
            if (state === 'updates-off') observer.send({ sendUpdates: false })
            if (state === 'updates-on') observer.send({ sendUpdates: true })
          }
          await sleep(SETTLE_MS)
          observer.previewFrames = 0
          const fps = await sampleFps(connection)
          const observerPreviewFrames = observer.previewFrames
          if (state !== 'closed') observer.close()
          rows.push({ pixelCount, state, fps, observerPreviewFrames })
          // Durable progress: a partial report survives any later hang.
          writeFileSync(join(process.cwd(), 'test/perf-harness/issue911-preview-tax.partial.json'), `${JSON.stringify(rows, null, 2)}\n`)
          console.log(`${fps.median.toFixed(2)} median FPS, ${observerPreviewFrames} preview frames observed`)
        }
      }

      const report = {
        generatedAt: new Date().toISOString().slice(0, 10),
        device: original.name ?? ip,
        boardType: original.boardType,
        firmwareVersion: original.firmwareVersion ?? 'unknown',
        outputProfile: declaredOutputProfileStamp(),
        pattern: 'Caustics',
        sampleMs: SAMPLE_MS,
        rows,
      }
      writeFileSync(join(process.cwd(), 'test/perf-harness/issue911-preview-tax.json'), `${JSON.stringify(report, null, 2)}\n`)
      for (const pixelCount of PIXEL_COUNTS) {
        const byState = Object.fromEntries(
          rows.filter((row) => row.pixelCount === pixelCount).map((row) => [row.state, row]),
        )
        const off = byState['updates-off'].fps.median
        const on = byState['updates-on'].fps.median
        console.log(
          `@ ${pixelCount}px: closed ${byState['closed'].fps.median.toFixed(2)} | idle ${byState['idle-default'].fps.median.toFixed(2)}`
          + ` | off ${off.toFixed(2)} | on ${on.toFixed(2)} (${(((on - off) / off) * 100).toFixed(2)}% stream delta,`
          + ` ${byState['updates-on'].observerPreviewFrames} frames)`,
        )
      }
    } catch (error) {
      runError = error
    } finally {
      observer.close()
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
          if (original.pixelCount != null) restore.setPixelCount(original.pixelCount, false)
          const restored = await waitForControllerConfig(
            () => restore.getConfig(),
            { activeProgramId: original.activeProgramId, pixelCount: original.pixelCount },
          )
          if (
            restored.activeProgramId !== original.activeProgramId
            || restored.pixelCount !== original.pixelCount
          ) {
            const restoreError = new Error(
              `Controller state did not restore (program=${restored.activeProgramId}, pixels=${restored.pixelCount}).`,
            )
            runError = runError == null ? restoreError : new AggregateError([runError, restoreError], 'Probe and restore failed.')
          }
        }
      } finally {
        if (restore !== connection) restore.close()
        connection.close()
      }
    }
    if (runError != null) throw runError
  }, 600_000)
})
