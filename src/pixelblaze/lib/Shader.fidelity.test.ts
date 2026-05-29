import { bundle } from '../../engine/bundle'
import { loadPattern } from '../../engine/loadPattern'
import { createFxShim, createShim, type ShimContext } from '../../engine/shim'
import { LIBRARIES } from '../libs'

// Exercises the Shader porting library (#94) through the bundle/inline path
// under the fixed-point fidelity engine: scalar gap-fillers, out-var helpers,
// the IQ palette, and the candidate integer hashes. The hashes are checked for
// the properties we can verify in-preview ([0,1), per-cell stability,
// non-degeneracy); declaring them bit-identical to hardware is deferred to the
// #91 divergence harness (see the validation-pending follow-up issue).

const grid = { rows: 8, cols: 8 }

// Bundle a probe pattern whose render2D body sets the exported `out`, then read
// it back through the shim. `body` is raw pattern source (so out-var helpers can
// be called and their shared globals read).
function makeProbe(body: string, mode: 'fast' | 'fidelity') {
  const src = `export var out\nfunction render2D(index, x, y) { ${body} }`
  const { code, fxCode, metadata } = bundle(src, LIBRARIES)
  const shim: ShimContext =
    mode === 'fidelity'
      ? createFxShim({ grid, getVirtualTime: () => 0 })
      : createShim({ grid, getVirtualTime: () => 0 })
  const handle = loadPattern(mode === 'fidelity' ? fxCode : code, metadata, shim.builtins)
  return (x: number, y: number) => {
    handle.render2D(shim.encodeScalar(0), shim.encodeScalar(x), shim.encodeScalar(y))
    return shim.decodeScalar(handle.getExports().out as number)
  }
}

// Convenience for single-expression scalar helpers.
function makeExpr(expr: string, mode: 'fast' | 'fidelity') {
  return makeProbe(`out = ${expr}`, mode)
}

describe('Shader scalar gap-fillers (#94)', () => {
  it('fract is floor-based (in [0,1) for negative inputs, unlike frac)', () => {
    const probe = makeExpr('Shader.fract(x)', 'fidelity')
    expect(probe(0.25, 0)).toBeCloseTo(0.25, 3)
    // Built-in frac(-0.25) == -0.25; floor-based fract(-0.25) == 0.75.
    expect(probe(-0.25, 0)).toBeCloseTo(0.75, 3)
    expect(probe(2.75, 0)).toBeCloseTo(0.75, 3)
  })

  it('step returns 0 below the edge and 1 at/above it', () => {
    const probe = makeExpr('Shader.step(0.5, x)', 'fidelity')
    expect(probe(0.25, 0)).toBe(0)
    expect(probe(0.75, 0)).toBe(1)
    expect(probe(0.5, 0)).toBe(1)
  })

  it('sign returns -1 / 0 / 1', () => {
    const probe = makeExpr('Shader.sign(x)', 'fidelity')
    expect(probe(-2, 0)).toBe(-1)
    expect(probe(0, 0)).toBe(0)
    expect(probe(2, 0)).toBe(1)
  })

  it('saturate clamps to [0,1]', () => {
    const probe = makeExpr('Shader.saturate(x)', 'fidelity')
    expect(probe(-0.5, 0)).toBe(0)
    expect(probe(0.4, 0)).toBeCloseTo(0.4, 3)
    expect(probe(1.7, 0)).toBe(1)
  })

  it('dot2 / dot3 compute dot products', () => {
    // dot2((x,y),(2,3)) ; at (0.5,1) → 0.5*2 + 1*3 = 4
    const d2 = makeExpr('Shader.dot2(x, y, 2, 3)', 'fidelity')
    expect(d2(0.5, 1)).toBeCloseTo(4, 3)
    // dot3((x,y,1),(2,3,4)) ; at (0.5,1) → 1 + 3 + 4 = 8
    const d3 = makeExpr('Shader.dot3(x, y, 1, 2, 3, 4)', 'fidelity')
    expect(d3(0.5, 1)).toBeCloseTo(8, 3)
  })

  it('distance2 is Euclidean distance', () => {
    // distance from (x,y) to (0,0): hypot(3,4)=5 at (3,4)
    const probe = makeExpr('Shader.distance2(x, y, 0, 0)', 'fidelity')
    expect(probe(3, 4)).toBeCloseTo(5, 3)
  })
})

describe('Shader out-var helpers (#94)', () => {
  it('toUV centres coords with aspect on the long axis, unit on the short axis', () => {
    // aspect = 2 (wide). At (x=1,y=1): ux = (1*2-1)*2 = 2, uy = (1*2-1) = 1.
    const ux = makeProbe('Shader.toUV(x, y, 2); out = ux', 'fidelity')
    const uy = makeProbe('Shader.toUV(x, y, 2); out = uy', 'fidelity')
    expect(ux(1, 1)).toBeCloseTo(2, 3)
    expect(uy(1, 1)).toBeCloseTo(1, 3)
    // Centre maps to origin.
    expect(ux(0.5, 0.5)).toBeCloseTo(0, 3)
    expect(uy(0.5, 0.5)).toBeCloseTo(0, 3)
  })

  it('normalize2 produces a unit vector and exposes len', () => {
    const nx = makeProbe('Shader.normalize2(x, y); out = nx', 'fidelity')
    const ny = makeProbe('Shader.normalize2(x, y); out = ny', 'fidelity')
    const len = makeProbe('Shader.normalize2(x, y); out = len', 'fidelity')
    expect(nx(3, 4)).toBeCloseTo(0.6, 2)
    expect(ny(3, 4)).toBeCloseTo(0.8, 2)
    expect(len(3, 4)).toBeCloseTo(5, 2)
    // Magnitude of the normalized result is ~1.
    const mag = makeProbe('Shader.normalize2(x, y); out = hypot(nx, ny)', 'fidelity')
    expect(mag(3, 4)).toBeCloseTo(1, 2)
  })

  it('normalize2 of the zero vector is safe (no NaN/Inf)', () => {
    const nx = makeProbe('Shader.normalize2(x, y); out = nx', 'fidelity')
    expect(nx(0, 0)).toBe(0)
  })

  it('normalize3 produces a unit vector', () => {
    const mag = makeProbe('Shader.normalize3(x, y, 0); out = hypot3(nx, ny, nz)', 'fidelity')
    expect(mag(3, 4)).toBeCloseTo(1, 2)
  })

  it('rot2 rotates about the origin', () => {
    // Rotate (1,0) by 90° (PI/2) → (0,1).
    const rx = makeProbe('Shader.rot2(x, y, PI/2); out = rx', 'fidelity')
    const ry = makeProbe('Shader.rot2(x, y, PI/2); out = ry', 'fidelity')
    expect(rx(1, 0)).toBeCloseTo(0, 2)
    expect(ry(1, 0)).toBeCloseTo(1, 2)
  })

  it('reflect2 reflects across a normalized normal', () => {
    // Incident (1,-1) off the floor normal (0,1) → (1,1).
    const rx = makeProbe('Shader.reflect2(x, y, 0, 1); out = rx', 'fidelity')
    const ry = makeProbe('Shader.reflect2(x, y, 0, 1); out = ry', 'fidelity')
    expect(rx(1, -1)).toBeCloseTo(1, 2)
    expect(ry(1, -1)).toBeCloseTo(1, 2)
  })

  it('reflect3 reflects across a normalized normal', () => {
    // Incident (1,-1,0) off normal (0,1,0) → (1,1,0).
    const ry = makeProbe('Shader.reflect3(x, y, 0, 0, 1, 0); out = ry', 'fidelity')
    expect(ry(1, -1)).toBeCloseTo(1, 2)
  })
})

describe('Shader IQ palette (#94)', () => {
  it('matches a + b*cos(2π(c*t + d)) per channel', () => {
    // a=0.5, b=0.5, c=1, d=0 → 0.5 + 0.5*cos(2π t). At t=0 → 1.0; at t=0.5 → 0.0.
    const cr0 = makeProbe(
      'Shader.iqPalette(x, 0.5,0.5,0.5, 0.5,0.5,0.5, 1,1,1, 0,0,0); out = cr',
      'fidelity',
    )
    expect(cr0(0, 0)).toBeCloseTo(1, 2)
    expect(cr0(0.5, 0)).toBeCloseTo(0, 2)
  })
})

describe('Shader integer hashes (#94, validation-pending vs hardware)', () => {
  it('hash21 stays in [0,1), is stable per cell, and is non-degenerate (fidelity)', () => {
    const probe = makeProbe('out = Shader.hash21(floor(x), floor(y))', 'fidelity')
    const distinct = new Set<number>()
    for (let yi = 0; yi < 8; yi++) {
      for (let xi = 0; xi < 8; xi++) {
        const v = probe(xi, yi)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
        distinct.add(Math.round(v * 1e6))
      }
    }
    expect(distinct.size).toBeGreaterThan(3)
  })

  it('hash21 is deterministic for the same cell', () => {
    const probe = makeProbe('out = Shader.hash21(floor(x), floor(y))', 'fidelity')
    expect(probe(3, 5)).toBe(probe(3, 5))
  })

  it('hash11 stays in [0,1) and is non-degenerate (fidelity)', () => {
    const probe = makeProbe('out = Shader.hash11(floor(x))', 'fidelity')
    const distinct = new Set<number>()
    for (let i = 0; i < 32; i++) {
      const v = probe(i, 0)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      distinct.add(Math.round(v * 1e6))
    }
    expect(distinct.size).toBeGreaterThan(3)
  })

  it('hashes also run in fast mode (float64 path)', () => {
    const probe = makeProbe('out = Shader.hash21(floor(x), floor(y))', 'fast')
    const v = probe(2, 7)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })
})
