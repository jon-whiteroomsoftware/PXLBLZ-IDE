import { vi } from 'vitest'
import { bundle } from './bundle'
import { bundleWithPasses } from './passEngine'
import { loadPattern } from './loadPattern'
import { createFxShim, createShim } from './shim'
import { emitSlowMoWrapper, type SlowMoSettings } from './slowMo'

type Mode = 'fast' | 'fidelity'
const settings: SlowMoSettings = { position: 0.5, dreamy: 0 }
const redBlue = [0, 1, 0, 0, 1, 0, 0, 1]
const points = [0, 0.5, 1].map(x => ({ sample: [x] }))

// Exercise the emitted artifact, including Precise re-emission and native sinks.
function runtime(source: string, mode: Mode, input = settings, wrapped = true) {
  const wrappedArtifact = wrapped
    ? bundleWithPasses(source, {}, [{ kind: 'slowmo', settings: input, pixelCount: points.length }])
    : null
  const artifact = wrappedArtifact ?? bundle(source, {})
  if (wrappedArtifact) expect(wrappedArtifact.summary.passes[0].declined).toBeUndefined()
  const shim = (mode === 'fast' ? createShim : createFxShim)({
    pixelCount: points.length, mapPoints: points, dimensions: 1, getVirtualTime: () => 0,
  })
  const nativePaint = vi.fn(shim.builtins.paint as (...args: number[]) => void)
  shim.builtins.paint = nativePaint
  const handle = loadPattern(mode === 'fast' ? artifact.code : artifact.fxCode, artifact.metadata, shim.builtins)
  return {
    nativePaint,
    frame(delta: number) {
      handle.beforeRender(shim.encodeScalar(delta))
      return points.map((_, i) => {
        handle.render(shim.encodeScalar(i))
        // The renderer clamps channels at its output boundary.
        return shim.capturedPixel().map(v => Math.max(0, Math.min(1, v)))
      })
    },
    set(name: string, value: number) {
      expect(handle.setRuntimeVar(name, shim.encodeScalar(value))).toBe(true)
    },
  }
}

function close(actual: number[][], expected: number[][]) {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((pixel, i) => {
    expect(pixel).toHaveLength(3)
    pixel.forEach((value, c) => {
      expect(Number.isFinite(value) && value >= 0 && value <= 1).toBe(true)
      expect(Math.abs(value - expected[i][c]), `pixel ${i}, channel ${c}`).toBeLessThanOrEqual(1 / 255)
    })
  })
}

const cases: Array<{ name: string; palette?: number[]; value: number; brightness?: number; rgb: number[] }> = [
  { name: 'two stops, omitted brightness', palette: redBlue, value: 0.25, rgb: [0.75, 0, 0.25] },
  { name: 'many stops', palette: [0, 1, 0, 0, 0.5, 0, 1, 0, 1, 0, 0, 1], value: 0.625, rgb: [0, 0.75, 0.25] },
  { name: 'on a stop', palette: [0, 1, 0, 0, 0.5, 0, 1, 0, 1, 0, 0, 1], value: 0.5, rgb: [0, 1, 0] },
  { name: 'negative wrap', palette: redBlue, value: -0.25, rgb: [0.25, 0, 0.75] },
  { name: 'positive wrap', palette: redBlue, value: 1.25, rgb: [0.75, 0, 0.25] },
  { name: 'endpoint wraps to zero', palette: redBlue, value: 1, rgb: [1, 0, 0] },
  { name: 'unsorted stops', palette: [0, 1, 0, 0, 0.75, 0, 1, 0, 0.25, 0, 0, 1, 1, 1, 1, 1], value: 0.5, rgb: [1 / 3, 1 / 3, 1] },
  { name: 'negative span', palette: [0.8, 1, 0, 0, 0.2, 0, 0, 1], value: 0.5, rgb: [1, 0, 0] },
  { name: 'zero span', palette: [0, 1, 0, 0, 0, 0, 0, 1], value: 0.5, rgb: [1, 0, 0] },
  { name: 'unset palette', value: 0.5, rgb: [0, 0, 0] },
  { name: 'empty palette', palette: [], value: 0.5, rgb: [0, 0, 0] },
  { name: 'one stop', palette: [0, 1, 0, 0], value: 0.5, rgb: [0, 0, 0] },
  { name: 'incomplete second stop', palette: [0, 1, 0, 0, 1, 0, 0], value: 0.5, rgb: [0, 0, 0] },
  { name: 'zero brightness', palette: redBlue, value: 0.25, brightness: 0, rgb: [0, 0, 0] },
  { name: 'above-one brightness clamps captured channels', palette: redBlue, value: 0.25, brightness: 2, rgb: [1, 0, 0.5] },
]

for (const mode of ['fast', 'fidelity'] as const) {
  describe(`palette capture ${mode}`, () => {
    it.each(cases)('$name agrees with native paint and an independent color table', ({ palette, value, brightness, rgb }) => {
      const source = `${palette ? `setPalette(${JSON.stringify(palette)})` : ''}
export function render(i) { paint(${value}${brightness === undefined ? '' : `, ${brightness}`}) }`
      const expected = points.map(() => rgb)
      close(runtime(source, mode).frame(0), expected)
      const base = runtime(source, mode, settings, false)
      close(base.frame(0), expected)
      const bypass = runtime(source, mode, { position: 1, dreamy: 0 })
      close(bypass.frame(0), expected)
      expect(bypass.nativePaint).toHaveBeenCalledTimes(points.length)
    })

    it('uses the current palette for every call, including mid-frame and per-pixel switches', () => {
      const source = `var red=[0,1,0,0,1,1,0,0], blue=[0,0,0,1,1,0,0,1]
export function beforeRender() { setPalette(blue); setPalette(red) }
function draw(v) { paint(v) }
export function render(i) {
  setPalette(red); draw(0)
  if (i == 1) setPalette(blue)
  draw(0)
}`
      close(runtime(source, mode).frame(0), [[1, 0, 0], [0, 0, 1], [1, 0, 0]])
    })

    it('retains the active palette reference in the unwrapped shim and wrapper', () => {
      const source = `var pal=[0,1,0,0,1,1,0,0]
setPalette(pal)
export function render(i) { pal[1]=i/2; pal[5]=i/2; paint(0.25) }`
      const expected = [[0, 0, 0], [0.5, 0, 0], [1, 0, 0]]
      close(runtime(source, mode, settings, false).frame(0), expected)
      close(runtime(source, mode).frame(0), expected)
      close(runtime(source, mode, { position: 1, dreamy: 0 }).frame(0), expected)
    })

    it.each([0, 0.5, 1])('shares RGB blend and decay through speed changes, dreamy %s', dreamy => {
      const source = `export var level=1
var pal=[0,1,0.5,0.25,1,1,0.5,0.25]
setPalette(pal)
export function render(i) { paint(0.25,level) }`
      const rgb = 'export var level=1; export function render(i) { rgb(level,level*0.5,level*0.25) }'
      const a = runtime(source, mode, { ...settings, dreamy })
      const b = runtime(rgb, mode, { ...settings, dreamy })
      close(a.frame(0), b.frame(0))
      for (const position of [0.5, 1, 0.75]) {
        a.set('__pxlblz_slowmo_position', position); b.set('__pxlblz_slowmo_position', position)
        for (const level of [0.25, 0.75, 0]) {
          a.set('level', level); b.set('level', level)
          for (const delta of [16, 33, 0, 64, 100]) close(a.frame(delta), b.frame(delta))
        }
      }
      expect(a.nativePaint.mock.calls.length > 0).toBe(dreamy === 0)
    })

    it('preserves authored top-level and lexical paint/setPalette/palette meanings', () => {
      const source = `var palette=0.25
function setPalette(v) { palette=v }
function paint(v) { rgb(v,palette,0.5) }
function local(paint,setPalette,palette) { setPalette(palette); paint(palette) }
export function render(i) { local(paint,setPalette,0.75) }`
      close(runtime(source, mode).frame(0), runtime(source, mode, settings, false).frame(0))
      expect(runtime(source, mode).nativePaint).not.toHaveBeenCalled()
    })
  })
}

it('emits explicit brightness, native bypass, reference retention and the RGB capture sink', () => {
  const source = 'setPalette([0,1,0,0,1,0,0,1]); export function render(i) { paint((i / pixelCount) /* pos */) }'
  const wrapped = emitSlowMoWrapper(source, settings, points.length)
  expect(wrapped.plan.declined).toBeUndefined()
  expect(wrapped.code).toContain('__pxlblz_slowmo_setPalette([0,1,0,0,1,0,0,1])')
  expect(wrapped.code).toContain('__pxlblz_slowmo_paint((i / pixelCount) /* pos */, 1)')
  expect(wrapped.code).toContain('__pxlblz_slowmo_palette = pal')
  expect(wrapped.code).toContain('paint(pos,v)')
  expect(wrapped.code).toContain('__pxlblz_slowmo_captureRgb(')
  expect(wrapped.plan.arrayWords).toBe(9 * (points.length + 4))
  const flagOff = bundleWithPasses(source, {}, [])
  const plain = bundle(source, {})
  expect(flagOff.code).toBe(plain.code)
  expect(flagOff.fxCode).toBe(plain.fxCode)
  expect(flagOff.metadata).toEqual(plain.metadata)
})

it.each(['paint((0.25))', 'paint(0.25, /* trailing */)', 'paint(0.25 /* close ) */)'])(
  'supplies omitted brightness outside argument syntax: %s', call => {
    const source = `setPalette(${JSON.stringify(redBlue)}); export function render(i) { ${call} }`
    for (const mode of ['fast', 'fidelity'] as const) {
      close(runtime(source, mode).frame(0), points.map(() => [0.75, 0, 0.25]))
    }
  })
