// #557 step-5 kill-test: firmware color-continuity probe.
//
// The direct-sink slice paints steady-state frames through native hsv() and
// capture/transition frames through the generated sextant conversion + native
// rgb(). If those two conversions round differently, phase boundaries would
// show a color step. Pattern code cannot read pixels back, so the probe
// compares the two paths at LED output resolution over the websocket preview
// stream ({"sendUpdates": true}, type-5 frames, one RGB triplet per pixel):
// the same hue ramp is rendered in both modes and compared byte-for-byte over
// a dense (hue-offset x saturation x value) grid. Output equality at 8-bit
// resolution is the strongest empirically observable continuity statement on
// this firmware; sub-8-bit internals are unobservable without pixel readback.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import WebSocket from 'ws'
import { makeProgramId } from '../../src/engine/bytecodePush'
import { PixelblazeConnection } from '../../src/engine/PixelblazeConnection'
import {
  fetchControllerCompiler,
  nodeWebSocketFactory,
  sleep,
  waitForControllerConfig,
} from './controllerHardware'

const runHardware = process.env.ISSUE557_CONTINUITY === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

// The generated conversion below MUST stay byte-identical to the compiler's
// __pxlblz_show_capture_hsv emission (src/engine/showCompiler.ts).
const PROBE_SOURCE = `
export var mode = 0
export var hueBase = 0
export var satVal = 1
export var valVal = 1
var r = 0
var g = 0
var b = 0
function convertHsv(h, s, v) {
  h = h - floor(h)
  var i = floor(h * 6)
  var f = h * 6 - i
  var p = v * (1 - s)
  var q = v * (1 - f * s)
  var t = v * (1 - (1 - f) * s)
  if (i == 0) { r = v; g = t; b = p }
  else if (i == 1) { r = q; g = v; b = p }
  else if (i == 2) { r = p; g = v; b = t }
  else if (i == 3) { r = p; g = q; b = v }
  else if (i == 4) { r = t; g = p; b = v }
  else { r = v; g = p; b = q }
}
export function render(index) {
  var h = hueBase + index / pixelCount
  if (mode < 0.5) {
    hsv(h, satVal, valVal)
  } else {
    convertHsv(h, satVal, valVal)
    rgb(r, g, b)
  }
}
`

const HUE_OFFSETS = Array.from({ length: 8 }, (_, index) => index / 4_096)
const VALUES = [1, 0.85, 0.6, 0.4, 0.2, 0.08]
const SATURATIONS = [1, 0.7, 0.35, 0]

class PreviewStream {
  private socket: WebSocket
  private waiters: Array<(frame: Buffer) => void> = []

  constructor(host: string) {
    this.socket = new WebSocket(`ws://${host}:81`)
    this.socket.binaryType = 'nodebuffer'
    this.socket.on('message', (data: Buffer, isBinary: boolean) => {
      if (!isBinary || data[0] !== 5) return
      const frame = data.subarray(2)
      const waiter = this.waiters.shift()
      if (waiter) waiter(frame)
    })
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once('open', () => resolve())
      this.socket.once('error', reject)
    })
    this.socket.send(JSON.stringify({ sendUpdates: true }))
  }

  /** Resolves with the next preview frame that STARTS after this call. */
  nextFrame(timeoutMs = 5_000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('preview frame timeout')), timeoutMs)
      this.waiters.push((frame) => {
        clearTimeout(timer)
        resolve(Buffer.from(frame))
      })
    })
  }

  close(): void {
    this.socket.close()
  }
}

describe('firmware color-continuity probe (#557 kill-test)', () => {
  it.skipIf(!runHardware)('compares native hsv() with the generated conversion at output resolution', async () => {
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

    let runError: unknown
    let report: Record<string, unknown> | undefined
    const preview = new PreviewStream(ip)
    try {
      const bytecode = compile(PROBE_SOURCE)
      const programId = makeProgramId()
      connection.pushByteCode(bytecode, { id: programId, name: '' })
      const activated = await waitForControllerConfig(
        () => connection.getConfig(),
        { activeProgramId: programId },
      )
      if (activated.activeProgramId !== programId) throw new Error('continuity probe did not activate')

      await preview.open()

      async function capture(vars: Record<string, number>): Promise<Buffer> {
        connection.setVars(vars)
        await sleep(200)
        // Discard one frame that may have been mid-render during the write.
        await preview.nextFrame()
        return preview.nextFrame()
      }

      let comparedPixels = 0
      let maxDelta = 0
      let mismatchedPixels = 0
      const worst: Array<Record<string, number>> = []
      let stabilityFailures = 0

      for (const hueBase of HUE_OFFSETS) {
        for (const valVal of VALUES) {
          for (const satVal of SATURATIONS) {
            const native = await capture({ mode: 0, hueBase, satVal, valVal })
            const nativeRepeat = await preview.nextFrame()
            if (!native.equals(nativeRepeat)) stabilityFailures += 1
            const generated = await capture({ mode: 1, hueBase, satVal, valVal })
            if (native.length !== generated.length) {
              throw new Error(`frame length mismatch ${native.length} vs ${generated.length}`)
            }
            const pixels = Math.floor(native.length / 3)
            comparedPixels += pixels
            for (let index = 0; index < pixels * 3; index += 1) {
              const delta = Math.abs(native[index] - generated[index])
              if (delta > 0) {
                mismatchedPixels += 1
                if (delta > maxDelta) maxDelta = delta
                if (worst.length < 12) {
                  worst.push({
                    pixel: Math.floor(index / 3),
                    channel: index % 3,
                    native: native[index],
                    generated: generated[index],
                    hueBase,
                    satVal,
                    valVal,
                  })
                }
              }
            }
          }
        }
      }

      report = {
        generatedAt: new Date().toISOString(),
        device: { ip, name: original.name, firmwareVersion: original.firmwareVersion, pixelCount: original.pixelCount },
        grid: {
          hueOffsets: HUE_OFFSETS.length,
          values: VALUES.length,
          saturations: SATURATIONS.length,
          comparedPixels,
          comparedChannelSamples: comparedPixels * 3,
        },
        stabilityFailures,
        maxChannelDelta8bit: maxDelta,
        mismatchedChannelSamples: mismatchedPixels,
        worst,
      }
      const outputPath = join(process.cwd(), 'test/perf-harness/issue557-continuity-report.json')
      writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
      console.log(JSON.stringify(report, null, 2))
    } catch (error) {
      runError = error
    } finally {
      preview.close()
      try {
        try {
          await connection.getConfig()
        } catch {
          await sleep(2_000)
          await connection.connect()
        }
        connection.setActiveProgram(original.activeProgramId)
        const restored = await waitForControllerConfig(
          () => connection.getConfig(),
          { activeProgramId: original.activeProgramId },
        )
        if (restored.activeProgramId !== original.activeProgramId) {
          const restoreError = new Error(`Controller did not restore (program=${restored.activeProgramId}).`)
          runError = runError == null
            ? restoreError
            : new AggregateError([runError, restoreError], 'Probe and restoration both failed.')
        }
      } finally {
        connection.close()
      }
    }
    if (runError != null) throw runError
    expect(report).toBeTruthy()
  }, 1_800_000)
})
