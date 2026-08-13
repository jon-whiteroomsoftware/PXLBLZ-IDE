import { describe, it, expect } from 'vitest'
import { bundle } from './bundle'
import { loadPattern, nativeDimension } from './loadPattern'
import type { PatternMetadata, RenderFns } from './loadPattern'
import { createPlaneMap } from './maps'
import { createShim } from './shim'

// Minimal built-ins that let patterns run without reference errors
const minimalBuiltins: Record<string, unknown> = {
  hsv: () => undefined,
  rgb: () => undefined,
  time: () => 0,
  wave: (v: number) => v,
  sin: Math.sin,
  cos: Math.cos,
  PI: Math.PI,
  PI2: Math.PI * 2,
}

function meta(patternVars: string[], controls: PatternMetadata['controls'] = []): PatternMetadata {
  return { exportedVars: patternVars, patternVars, controls }
}

// ── handle shape ──────────────────────────────────────────────────────────────

describe('loadPattern handle', () => {
  it('previews a Pattern that reads a V3 analog GPIO pin', () => {
    const source = `
      export var raw = 1

      export function beforeRender(delta) {
        pinMode(33, ANALOG)
        raw = analogRead(33)
      }

      export function render(index) {
        hsv(0, 0, 0)
      }
    `
    const { code, metadata } = bundle(source, {})
    const { builtins } = createShim({
      mapPoints: createPlaneMap({ rows: 1, cols: 1 }).resolve(1),
      pixelCount: 1,
      dimensions: 2,
      getVirtualTime: () => 0,
    })
    const handle = loadPattern(code, metadata, builtins)

    expect(() => handle.beforeRender(16)).not.toThrow()
    expect(handle.getExports().raw).toBe(0)
  })

  it('returns a handle with callable beforeRender and render2D', () => {
    const code = `
      export var x = 0;
      export function beforeRender(delta) { x += delta; }
      export function render2D(index, px, py) {}
    `
    const handle = loadPattern(code, meta(['x']), minimalBuiltins)
    expect(() => handle.beforeRender(16)).not.toThrow()
    expect(() => handle.render2D(0, 0, 0)).not.toThrow()
  })

  it('provides no-op beforeRender when the pattern does not define it', () => {
    const code = `export var x = 0;`
    const handle = loadPattern(code, meta(['x']), minimalBuiltins)
    expect(() => handle.beforeRender(16)).not.toThrow()
  })

  it('keeps the render2D slot exact so compatibility policy owns fallback', () => {
    const calls: number[] = []
    const code = `function render(index) { calls.push(index); }`
    const handle = loadPattern(code, meta([]), { ...minimalBuiltins, calls })
    handle.render2D(3, 0.5, 0.5)
    expect(calls).toEqual([])
  })

  it('provides no-op render2D when the pattern does not define it', () => {
    const code = `export var x = 0;`
    const handle = loadPattern(code, meta(['x']), minimalBuiltins)
    expect(() => handle.render2D(0, 0.5, 0.5)).not.toThrow()
  })

  it('exposes a 1D render slot that dispatches to render(index)', () => {
    const calls: number[] = []
    const code = `function render(index) { calls.push(index); }`
    const handle = loadPattern(code, meta([]), { ...minimalBuiltins, calls })
    handle.render(5)
    expect(calls).toEqual([5])
  })

  it('passes mapped x through render(index, x)', () => {
    const calls: number[][] = []
    const code = `function render(index, x) { calls.push([index, x]); }`
    const handle = loadPattern(code, meta([]), { ...minimalBuiltins, calls })
    handle.render(5, 0.75)
    expect(calls).toEqual([[5, 0.75]])
  })

  it('provides no-op render slot when the pattern does not define render', () => {
    const code = `export var x = 0;`
    const handle = loadPattern(code, meta(['x']), minimalBuiltins)
    expect(() => handle.render(0)).not.toThrow()
  })

  it('dispatches render3D to render3D when defined', () => {
    const calls: number[][] = []
    const code = `function render3D(index, x, y, z) { calls.push([index, x, y, z]); }`
    const handle = loadPattern(code, meta([]), { ...minimalBuiltins, calls })
    handle.render3D(2, 0.1, 0.2, 0.3)
    expect(calls).toEqual([[2, 0.1, 0.2, 0.3]])
  })

  it('does not make render3D secretly fall back to render2D', () => {
    const calls: number[][] = []
    const code = `function render2D(index, x, y) { calls.push([index, x, y]); }`
    const handle = loadPattern(code, meta([]), { ...minimalBuiltins, calls })
    handle.render3D(2, 0.1, 0.2, 0.3)
    expect(calls).toEqual([])
  })

  it('does not make render3D secretly fall back to render', () => {
    const calls: number[] = []
    const code = `function render(index) { calls.push(index); }`
    const handle = loadPattern(code, meta([]), { ...minimalBuiltins, calls })
    handle.render3D(7, 0.1, 0.2, 0.3)
    expect(calls).toEqual([])
  })

  it('provides no-op render3D when no render fn is defined', () => {
    const code = `export var x = 0;`
    const handle = loadPattern(code, meta(['x']), minimalBuiltins)
    expect(() => handle.render3D(0, 0, 0, 0)).not.toThrow()
  })
})

// ── nativeDimension ─────────────────────────────────────────────────────────

describe('nativeDimension', () => {
  function fns(over: Partial<RenderFns>): RenderFns {
    return { hasBeforeRender: false, hasRender2D: false, hasRender: false, hasRender3D: false, ...over }
  }

  it('returns 1 for a render-only pattern', () => {
    expect(nativeDimension(fns({ hasRender: true }))).toBe(1)
  })

  it('returns 2 for a render2D pattern', () => {
    expect(nativeDimension(fns({ hasRender2D: true }))).toBe(2)
  })

  it('returns 3 for a render3D pattern', () => {
    expect(nativeDimension(fns({ hasRender3D: true }))).toBe(3)
  })

  it('picks the highest render fn when several are defined', () => {
    expect(nativeDimension(fns({ hasRender: true, hasRender2D: true, hasRender3D: true }))).toBe(3)
  })

  it('defaults to 2 when no render fn (or no metadata) is present', () => {
    expect(nativeDimension(fns({}))).toBe(2)
    expect(nativeDimension(undefined)).toBe(2)
  })
})

// ── getExports (live closure) ─────────────────────────────────────────────────

describe('getExports', () => {
  it('reads the initial value of an exported var', () => {
    const code = `export var counter = 7;`
    const handle = loadPattern(code, meta(['counter']), minimalBuiltins)
    expect(handle.getExports().counter).toBe(7)
  })

  it('reads the live value after mutation via beforeRender', () => {
    const code = `
      export var counter = 0;
      export function beforeRender(delta) { counter += 1; }
    `
    const handle = loadPattern(code, meta(['counter']), minimalBuiltins)
    handle.beforeRender(16)
    expect(handle.getExports().counter).toBe(1)
    handle.beforeRender(16)
    expect(handle.getExports().counter).toBe(2)
  })

  it('reads non-exported top-level vars listed in patternVars', () => {
    const code = `
      var internal = 42;
      export var exported = 1;
    `
    const handle = loadPattern(code, meta(['internal', 'exported']), minimalBuiltins)
    const exports = handle.getExports()
    expect(exports.internal).toBe(42)
    expect(exports.exported).toBe(1)
  })

  it('does not expose vars absent from patternVars', () => {
    const code = `
      export var exported = 1;
      var hidden = 99;
    `
    const handle = loadPattern(code, meta(['exported']), minimalBuiltins)
    const exports = handle.getExports()
    expect(exports.exported).toBe(1)
    expect('hidden' in exports).toBe(false)
  })

  it('does not expose a private library var that shares a control stem', () => {
    const { code, metadata } = bundle(`
      export var brightness = 0
      export function sliderSpeed(value) { brightness = value }
      export function render(index) { rgb(Meter.current(), 0, 0) }
    `, {
      Meter: `
        var speed = 0.75
        function current() { return speed }
      `,
    })
    const handle = loadPattern(code, metadata, minimalBuiltins)

    expect(handle.getExports()).toEqual({ brightness: 0 })
    expect('speed' in handle.getExports()).toBe(false)
    expect(handle.setPatternVar('speed', 0.25)).toBe(false)
    expect(handle.getRuntimeState()).toEqual({ speed: 0.75, brightness: 0 })
  })

  it('mutates only metadata-listed runtime vars through the preview handle', () => {
    const code = `
      var feedbackSeek = 0;
      var hidden = 7;
    `
    const handle = loadPattern(code, meta(['feedbackSeek']), minimalBuiltins)

    expect(handle.setPatternVar('feedbackSeek', 1)).toBe(true)
    expect(handle.getExports().feedbackSeek).toBe(1)
    expect(handle.setPatternVar('hidden', 9)).toBe(false)
    expect('hidden' in handle.getExports()).toBe(false)
  })

  it('restores runtime vars whose names collide with generated setter parameters', () => {
    const code = `
      var value = 1;
      var name = 2;
    `
    const handle = loadPattern(
      code,
      { ...meta([]), patternVars: [], exportedVars: [], runtimeVars: ['value', 'name'] },
      minimalBuiltins,
    )

    expect(handle.setRuntimeVar('value', 41)).toBe(true)
    expect(handle.setRuntimeVar('name', 42)).toBe(true)
    expect(handle.getRuntimeState().value).toBe(41)
    expect(handle.getRuntimeState().name).toBe(42)
    expect(handle.setPatternFunction('value', (() => 0) as never)).toBe(false)
  })

  it('resolves compacted runtime bindings when mutating a preview var', () => {
    const handle = loadPattern(
      'var a = 0;',
      { ...meta(['feedbackSeek']), patternVarBindings: { feedbackSeek: 'a' } },
      minimalBuiltins,
    )

    expect(handle.setPatternVar('feedbackSeek', 1)).toBe(true)
    expect(handle.getExports().feedbackSeek).toBe(1)
  })

  it('restores a declared compacted runtime binding whose value is undefined (#847)', () => {
    const handle = loadPattern(
      'var a;',
      { ...meta(['scratch']), patternVarBindings: { scratch: 'a' } },
      minimalBuiltins,
    )

    expect(handle.getRuntimeState().scratch).toBeUndefined()
    expect(handle.setRuntimeVar('scratch', 0)).toBe(true)
    expect(handle.getRuntimeState().scratch).toBe(0)
  })
})

// ── controls ──────────────────────────────────────────────────────────────────

describe('controls', () => {
  it('maps a slider control to the exported function', () => {
    const code = `
      export var brightness = 0.5;
      export function sliderBrightness(v) { brightness = v; }
    `
    const handle = loadPattern(
      code,
      {
        exportedVars: ['brightness'],
        patternVars: ['brightness'],
        controls: [{ exportName: 'sliderBrightness', kind: 'slider', label: 'Brightness' }],
      },
      minimalBuiltins,
    )
    expect(typeof handle.controls.sliderBrightness).toBe('function')
    handle.controls.sliderBrightness(0.8)
    expect(handle.getExports().brightness).toBeCloseTo(0.8)
  })

  it('returns an empty controls object when metadata has no controls', () => {
    const code = `export var x = 0;`
    const handle = loadPattern(code, meta(['x']), minimalBuiltins)
    expect(Object.keys(handle.controls)).toHaveLength(0)
  })
})
