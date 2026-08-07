import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundle } from '@/engine/bundle'
import { loadPattern } from '@/engine/loadPattern'
import { createFxShim, createShim } from '@/engine/shim'
import { LIBRARIES } from '@/pixelblaze/libs'

const sourcePath = join(
  process.cwd(),
  'src/pixelblaze/stock/patterns/MapAlignmentDiagnostic.js',
)

describe('Map Alignment Diagnostic', () => {
  it.each(['fast', 'precise'] as const)(
    'bundles all map dimensions and preserves axis colors in %s mode',
    (mode) => {
      const source = readFileSync(sourcePath, 'utf8')
      const bundled = bundle(source, LIBRARIES)

      expect(bundled.metadata.renderFns).toMatchObject({
        hasRender: true,
        hasRender2D: true,
        hasRender3D: true,
      })
      expect(bundled.metadata.controls.map((control) => control.label)).toEqual([
        'Mode',
        'Speed',
        'Width',
        'Motion',
      ])
      expect(source).not.toMatch(/\b(?:sin|cos|tan|atan2|hypot|sqrt|perlin\w*|noise)\s*\(/)

      const mapPoints: Array<{
        sample: number[]
        pos: [number, number, number]
      }> = [
        { sample: [0, 0, 0], pos: [0, 0, 0] },
        { sample: [0.5, 0.5, 0.5], pos: [0.5, 0.5, 0.5] },
      ]
      const shimConfig = {
        mapPoints,
        pixelCount: mapPoints.length,
        dimensions: 3 as const,
        getVirtualTime: () => 0,
      }
      const shim = mode === 'precise' ? createFxShim(shimConfig) : createShim(shimConfig)
      const handle = loadPattern(
        mode === 'precise' ? bundled.fxCode : bundled.code,
        bundled.metadata,
        shim.builtins,
      )
      const enc = shim.encodeScalar

      handle.beforeRender(enc(0))

      handle.render(enc(0), enc(0))
      expect(shim.capturedPixel()).toEqual([1, 0, 0])

      handle.render(enc(0), enc(0.99))
      expect(shim.capturedPixel()[0]).toBeGreaterThan(0.5)

      handle.render2D(enc(0), enc(0.5), enc(0))
      expect(shim.capturedPixel()).toEqual([0, 1, 0])

      handle.render3D(enc(0), enc(0.5), enc(0.5), enc(0))
      expect(shim.capturedPixel()).toEqual([0, 0, 1])

      handle.render3D(enc(1), enc(0.5), enc(0.5), enc(0.5))
      expect(shim.capturedPixel()).toEqual([0, 0, 0])

      handle.controls.sliderMode?.(enc(0.4))
      handle.render2D(enc(1), enc(0.5), enc(0.25))
      expect(shim.capturedPixel()).toEqual([1, 0, 0])

      handle.controls.sliderMode?.(enc(0.9))
      handle.render2D(enc(1), enc(0.25), enc(0.125))
      expect(shim.capturedPixel()).toEqual([1, 0, 0])

      handle.controls.sliderMode?.(enc(0))
      handle.controls.toggleMotion?.(enc(0))
      handle.beforeRender(enc(1000))
      handle.render(enc(0), enc(0))
      expect(shim.capturedPixel()).toEqual([1, 0, 0])

      handle.controls.toggleMotion?.(enc(1))
      handle.beforeRender(enc(1000))
      handle.render(enc(0), enc(0))
      expect(shim.capturedPixel()).toEqual([0, 0, 0])
    },
  )

  it.each([1, 52, 2048])('renders finite colors at %i pixels', (pixelCount) => {
    const bundled = bundle(readFileSync(sourcePath, 'utf8'), LIBRARIES)
    const mapPoints = Array.from({ length: pixelCount }, (_, index) => {
      const coordinate = index / Math.max(1, pixelCount - 1)
      return {
        sample: [coordinate, coordinate, coordinate],
        pos: [coordinate, coordinate, coordinate] as [number, number, number],
      }
    })
    const shim = createShim({
      mapPoints,
      pixelCount,
      dimensions: 3,
      getVirtualTime: () => 0,
    })
    const handle = loadPattern(bundled.code, bundled.metadata, shim.builtins)

    handle.beforeRender(16)
    mapPoints.forEach((point, index) => {
      handle.render3D(index, point.sample[0], point.sample[1], point.sample[2])
      expect(shim.capturedPixel().every(Number.isFinite)).toBe(true)
    })
  })
})
