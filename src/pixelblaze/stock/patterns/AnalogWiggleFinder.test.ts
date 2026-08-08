import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundle } from '@/engine/bundle'
import { loadPattern } from '@/engine/loadPattern'
import { createFxShim, createShim } from '@/engine/shim'
import { LIBRARIES } from '@/pixelblaze/libs'

const sourcePath = join(
  process.cwd(),
  'src/pixelblaze/stock/patterns/AnalogWiggleFinder.js',
)

describe('Analog Wiggle Finder', () => {
  it.each(['fast', 'precise'] as const)(
    'distinguishes a deliberate sweep from quiet jitter in %s mode',
    (mode) => {
      const source = readFileSync(sourcePath, 'utf8')
      const bundled = bundle(source, LIBRARIES)
      const shimConfig = {
        mapPoints: [],
        pixelCount: 100,
        dimensions: 1 as const,
        getVirtualTime: () => 0,
      }
      const shim = mode === 'precise' ? createFxShim(shimConfig) : createShim(shimConfig)
      const values: Record<number, number> = {
        33: 0.2,
        34: 0.35,
        35: 0.5,
        36: 0.7,
        39: 0.9,
      }
      const configured: Array<[number, number]> = []
      shim.builtins.pinMode = (encodedPin: number, encodedMode: number) => {
        configured.push([
          shim.decodeScalar(encodedPin),
          shim.decodeScalar(encodedMode),
        ])
      }
      shim.builtins.analogRead = (encodedPin: number) => {
        const pin = Math.round(shim.decodeScalar(encodedPin))
        return shim.encodeScalar(values[pin] ?? 0)
      }
      const handle = loadPattern(
        mode === 'precise' ? bundled.fxCode : bundled.code,
        bundled.metadata,
        shim.builtins,
      )
      const enc = shim.encodeScalar
      let frameNumber = 0
      const frame = (value35: number) => {
        values[34] = 0.35 + [0, 0.001, 0, -0.001][frameNumber++ % 4]
        values[35] = value35
        handle.beforeRender(enc(16))
      }
      const hold = (value: number, count: number) => {
        for (let i = 0; i < count; i++) frame(value)
      }
      const sweep = (from: number, to: number, count: number) => {
        for (let i = 1; i <= count; i++) {
          frame(from + (to - from) * i / count)
        }
      }
      const exports = () => Object.fromEntries(
        Object.entries(handle.getExports()).map(([name, value]) => [
          name,
          typeof value === 'number' ? shim.decodeScalar(value) : value,
        ]),
      ) as Record<string, number>

      expect(bundled.metadata.renderFns).toMatchObject({
        hasRender: true,
        hasRender2D: true,
        hasRender3D: true,
      })
      expect(bundled.metadata.controls.map((control) => control.label)).toEqual(['Reset'])

      hold(0.5, 12)
      expect(configured).toEqual([
        [33, 5],
        [34, 5],
        [35, 5],
        [36, 5],
        [39, 5],
      ])
      expect(exports()).toMatchObject({ activePin: 0, motion34: 0, motion35: 0 })

      sweep(0.5, 0.1, 40)
      sweep(0.1, 0.9, 70)
      sweep(0.9, 0.1, 70)
      sweep(0.1, 0.9, 70)

      expect(configured).toHaveLength(5)
      expect(exports().activePin).toBe(35)
      expect(exports().motion35).toBeGreaterThanOrEqual(0.85)
      expect(exports().motion34).toBeLessThanOrEqual(0.01)

      const bandEnergy = (firstIndex: number) => {
        let total = 0
        for (let index = firstIndex; index < firstIndex + 20; index++) {
          handle.render(enc(index))
          total += shim.capturedPixel().reduce((sum, channel) => sum + channel, 0)
        }
        return total
      }
      expect(bandEnergy(40)).toBeGreaterThan(bandEnergy(20) * 1.5)

      handle.controls.toggleReset?.(enc(1))
      expect(exports()).toMatchObject({ activePin: 0, confidence: 0, motion35: 0 })
    },
  )

  it.each([1, 100, 2048])('renders finite wiring-order meters at %i pixels', (pixelCount) => {
    const bundled = bundle(readFileSync(sourcePath, 'utf8'), LIBRARIES)
    const shim = createShim({
      mapPoints: [],
      pixelCount,
      dimensions: 1,
      getVirtualTime: () => 0,
    })
    const handle = loadPattern(bundled.code, bundled.metadata, shim.builtins)

    handle.beforeRender(16)
    for (let index = 0; index < pixelCount; index++) {
      handle.render(index)
      expect(shim.capturedPixel().every(Number.isFinite)).toBe(true)
    }
  })
})
