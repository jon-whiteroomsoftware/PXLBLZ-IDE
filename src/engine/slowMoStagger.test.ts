import identity from '@/test/fixtures/slowMoStaggerIdentity.js?raw'
import baseline from '@/test/fixtures/slowMoSliceAIdentity.js?raw'
import { bundleWithPasses } from './passEngine'
import { createFastReplayRuntime } from './fastReplay'
import { loadPattern } from './loadPattern'
import { createFxShim, createShim } from './shim'
import { emitSlowMoWrapper, planSlowMo, slowMoTunables, type SlowMoSettings } from './slowMo'

const prefix = '__pxlblz_slowmo_'
const modes = ['fast', 'fidelity'] as const
const shapes = ['sweep', 'radial', 'scatter'] as const
const curves = ['hold', 'blend', 'eased'] as const
type Mode = typeof modes[number]
type Dimension = 1 | 2 | 3
const dimensions = [1, 2, 3] as const
const points = [
  [0, 0, 0], [0.25, 0.5, 0.5], [0.5, 0.5, 0.5], [0.75, 0.25, 1], [1, 1, 1],
].map(sample => ({ sample }))
const clampedPoints = [...points, { sample: [-0.25, -0.25, -0.25] }, { sample: [1.25, 1.25, 1.25] }]
const settings: SlowMoSettings = {
  rate: 0.25, stepMs: 16, inBetween: 'blend', stagger: { shape: 'sweep', width: 0.5 }, persistence: null,
}
const alternating = `export var count=0; export function beforeRender(){count+=1}
export function render(index){rgb(count%2,0,1-count%2)}
export function render2D(index,x,y){render(index)}
export function render3D(index,x,y,z){render(index)}`
function artifact(source: string, input: SlowMoSettings, n = points.length) {
  return bundleWithPasses(source, {}, [{ kind: 'slowmo', settings: input, pixelCount: n }])
}
function replay(source: string, mode: Mode, dimension: Dimension, input = settings, mapPoints = points) {
  return createFastReplayRuntime({ ...artifact(source, input, mapPoints.length), dimension }, {
    mapPoints, randomSeed: 7, fidelity: mode,
  })
}
const clamp = (v: number) => Math.max(0, Math.min(1, v))
function offset(shape: SlowMoSettings['stagger']['shape'], dimension: Dimension, i: number, samples = points) {
  const [x, y, z] = samples[i].sample
  if (shape === 'scatter') return ((i * 40503) % 65536) / 65536
  if (shape === 'sweep') return dimension === 1 ? i / samples.length : clamp(x)
  if (dimension === 1) return Math.abs(2 * i / samples.length - 1)
  return clamp(Math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2 + (dimension === 3 ? (z - 0.5) ** 2 : 0)) / Math.sqrt(dimension === 3 ? 0.75 : 0.5))
}
function progress(f: number, q: number, width: number, curve: typeof curves[number]) {
  const u = clamp((f - width * q) / (1 - width))
  return curve === 'hold' ? Number(u >= 1) : curve === 'blend' ? u : u*u*(3-2*u)
}
function close(actual: number[], expected: number[], tolerance: number) {
  actual.forEach((v, c) => {
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(1)
    expect(Math.abs(v - expected[c])).toBeLessThanOrEqual(tolerance)
  })
}

for (const mode of modes) {
  const tolerance = mode === 'fast' ? 2 ** -10 : 2 ** -8
  describe(`stagger artifact ${mode}`, () => {
    for (const dimension of dimensions) for (const shape of shapes) for (const inBetween of curves) {
      it(`A width0 bit identity d${dimension} ${shape} ${inBetween}`, () => {
        for (const sinkMode of [0, 1, 2, 3]) for (const [rate, stepMs] of [[0.25,16], [1/32,32], [1,16]]) {
          const input: SlowMoSettings = { ...settings, rate, stepMs, inBetween, stagger: { shape, width: 0 } }
          const snapshot = structuredClone(input)
          const source = identity.replace('sinkMode = 0', `sinkMode = ${sinkMode}`)
          let oldSource = baseline.replace('sinkMode = 0', `sinkMode = ${sinkMode}`)
          for (const [name, value] of Object.entries({ rate, step: stepMs, curve: curves.indexOf(inBetween) })) {
            oldSource = oldSource.replace(new RegExp(`var ${prefix}${name} = [0-9.]+`), `var ${prefix}${name} = ${value}`)
          }
          const old = createFastReplayRuntime({ ...bundleWithPasses(oldSource, {}, []), dimension }, {
            mapPoints: points, randomSeed: 7, fidelity: mode,
          })
          const current = replay(source, mode, dimension, input)
          for (const delta of [0,64,4,12,16,32,64,100,0,16,48]) {
            const expected = old.advanceLive(delta).pixels.map(p => [...p])
            expect(current.advanceLive(delta).pixels.map(p => [...p])).toEqual(expected)
          }
          expect(input).toEqual(snapshot)
          expect(source).toBe(identity.replace('sinkMode = 0', `sinkMode = ${sinkMode}`))
        }
      })

      it(`I8 windows d${dimension} ${shape} ${inBetween}`, () => {
        const input = { ...settings, inBetween, stagger: { shape, width: 0.5 } }
        const r = replay(alternating, mode, dimension, input, clampedPoints)
        r.advanceLive(0)
        let frame = r.advanceLive(64)
        const previous = clampedPoints.map(() => 0)
        for (let step = 0; step <= 8; step++) {
          if (step) frame = r.advanceLive(8)
          frame.pixels.forEach((pixel, i) => {
            const q = offset(shape, dimension, i, clampedPoints)
            const f = step / 8
            const c = progress(f, q, 0.5, inBetween)
            close(pixel, [1-c,0,c], tolerance)
            expect(c).toBeGreaterThanOrEqual(previous[i])
            if (f <= 0.5*q) expect(c).toBe(0)
            if (f >= 0.5*q+0.5) expect(c).toBe(1)
            previous[i] = c
          })
          if (step === 4 && shape === 'sweep' && dimension !== 1) {
            for (let i = 1; i < points.length; i++) expect(frame.pixels[i][2]).toBeLessThanOrEqual(frame.pixels[i-1][2] + tolerance)
          }
          if (step === 4 && shape === 'radial' && dimension !== 1) {
            expect(frame.pixels[2][2]).toBeGreaterThan(frame.pixels[0][2])
          }
        }
      })

      if (inBetween !== 'hold') for (const width of [0.5, 0.9]) {
        it(`I7 boundaries d${dimension} ${shape} ${inBetween} w${width}`, () => {
          const r = replay(alternating, mode, dimension, { ...settings, inBetween, stagger: { shape, width } })
          r.advanceLive(0)
          let frame = r.advanceLive(64)
          for (let interval = 0; interval < 4; interval++) {
            let previous = frame.pixels.map(p => [...p])
            for (let step = 0; step <= 8; step++) {
              if (step) frame = r.advanceLive(8)
              frame.pixels.forEach((pixel, i) => {
                const q = offset(shape, dimension, i)
                const c = progress(step/8,q,width,inBetween)
                const oldC = progress(Math.max(0,step-1)/8,q,width,inBetween)
                const red = interval % 2 === 0 ? 1-c : c
                close(pixel,[red,0,1-red],tolerance)
                pixel.forEach((v,ch) => expect(Math.abs(v-previous[i][ch])).toBeLessThanOrEqual(c-oldC+2*tolerance))
              })
              previous = frame.pixels.map(p => [...p])
            }
          }
        })
      }
    }

    it('E changes live width and shape without resetting count or clock', () => {
      const input = { ...settings, stagger: { shape: 'sweep' as const, width: 0 } }
      const a = artifact(alternating, input)
      const shim = (mode === 'fast' ? createShim : createFxShim)({ mapPoints: points, pixelCount: points.length, dimensions: 1, getVirtualTime: () => 0 })
      const metadata = { ...a.metadata, runtimeVars: [...a.metadata.runtimeVars!, prefix+'T',prefix+'acc'] }
      const handle = loadPattern(mode === 'fast' ? a.code : a.fxCode, metadata, shim.builtins)
      const enc = shim.encodeScalar
      function frame(delta: number) {
        handle.beforeRender(enc(delta))
        return points.map((_,i) => { handle.render(enc(i)); return [...shim.capturedPixel()] })
      }
      frame(0); frame(64)
      const original = frame(32)
      const state = () => ['count',prefix+'T',prefix+'acc'].map(name => handle.getExports()[name])
      const before = state()
      handle.setRuntimeVar(prefix+'width', enc(0.5))
      for (const shape of shapes) {
        handle.setRuntimeVar(prefix+'shape', enc(shapes.indexOf(shape)))
        frame(0).forEach((pixel,i) => {
          const c = progress(0.5,offset(shape,1,i),0.5,'blend')
          close(pixel,[1-c,0,c],tolerance)
        })
        expect(state()).toEqual(before)
      }
      handle.setRuntimeVar(prefix+'width', enc(0))
      expect(frame(0)).toEqual(original)
      expect(state()).toEqual(before)
      expect(a.metadata.runtimeVars).toEqual(expect.arrayContaining([prefix+'shape',prefix+'width']))
    })
  })
}

it.each([256,1702])('D scatter exact q, scaled offsets and blended RGB N=%s', n => {
  const samples = Array.from({ length:n }, () => ({ sample:[0,0,0] }))
  const expectedQ = samples.map((_, i) => ((i*40503)%65536)/65536)
  const largestIndex = expectedQ.indexOf(Math.max(...expectedQ))
  for (const width of [0.5,0.9]) {
    const input = { ...settings, stagger:{shape:'scatter' as const,width} }
    const code = artifact('export function render(index){rgb(0,0,0)}',input,n).code
    expect(code).toContain('0.6180267333984375')
    expect(code).not.toMatch(/\/\s*65536/)
    const footer = /export function render\(index\) \{[\s\S]*$/
    expect(code).toMatch(footer)
    const diagnostic = code.replace(footer, `export function render(index) {
  var q=__pxlblz_slowmo_offset1D(index)
  rgb(q,__pxlblz_slowmo_width*q,0)
}`)
    const results = modes.map(mode => {
      const r = createFastReplayRuntime({ ...bundleWithPasses(diagnostic, {}, []), dimension:1 }, {
        mapPoints:samples, randomSeed:7, fidelity:mode,
      })
      return r.advanceLive(0).pixels.map(p => [...p])
    })
    const encodedWidth = Math.round(width*65536)/65536
    results[0].forEach(([q, fastOffset], i) => {
      const [preciseQ, preciseOffset] = results[1][i]
      expect(q).toBe(expectedQ[i])
      expect(preciseQ).toBe(q)
      expect(fastOffset).toBe(width*q)
      expect(fastOffset).toBeGreaterThanOrEqual(0)
      expect(fastOffset).toBeLessThan(width)
      expect(preciseOffset).toBeGreaterThanOrEqual(0)
      expect(preciseOffset).toBeLessThan(encodedWidth)
      if (width === 0.5) expect(preciseOffset).toBeLessThanOrEqual(fastOffset)
      expect(Math.abs(preciseOffset-fastOffset)).toBeLessThanOrEqual(
        2 ** -16 + q*Math.abs(width-encodedWidth) + Number.EPSILON,
      )
    })
    // The largest sequence value exercises the strict upper offset bound.
    expect(results[0][largestIndex][0]).toBe(Math.max(...expectedQ))
    expect(results[1][largestIndex][0]).toBe(results[0][largestIndex][0])
    for (const mode of modes) {
      const r = replay(alternating, mode, 1, input, samples)
      r.advanceLive(0); r.advanceLive(64)
      r.advanceLive(32).pixels.forEach((pixel,i) => {
        const c = clamp((0.5-width*expectedQ[i])/(1-width))
        close([...pixel],[1-c,0,c],mode === 'fast' ? 2 ** -10 : 2 ** -8)
      })
    }
  }
})

it('F preserves six-array memory, budget edges and clock source', () => {
  for (const shape of shapes) for (const width of [0,0.5,0.9]) {
    const input = { ...settings, stagger:{shape,width} }
    expect(planSlowMo(alternating,input,256).arrayWords).toBe(1560)
    expect(emitSlowMoWrapper(alternating,input,256).code.match(/array\(pixelCount\)/g)).toHaveLength(6)
    expect(planSlowMo(alternating,input,1702).declined).toBeUndefined()
    expect(planSlowMo(alternating,input,1703).declined?.reason).toBe('array-budget')
    expect(emitSlowMoWrapper(alternating,{...input,inBetween:'clock'},256).code).toBe(alternating)
  }
})

it('G encodes and validates live shape/width', () => {
  for (const shape of shapes) for (const width of [0,0.5,0.9]) {
    expect(slowMoTunables({...settings,stagger:{shape,width}})).toMatchObject({
      [prefix+'shape']:shapes.indexOf(shape), [prefix+'width']:width,
    })
  }
  for (const width of [-1,0.90001,1,NaN,Infinity,-Infinity]) {
    expect(() => slowMoTunables({...settings,stagger:{shape:'sweep',width}})).toThrow('Slow-mo stagger width must be finite and between 0 and 0.9.')
  }
  const shape = 'invalid' as SlowMoSettings['stagger']['shape']
  expect(() => slowMoTunables({...settings,stagger:{shape,width:0}})).toThrow('Slow-mo stagger shape must be sweep, radial, or scatter.')
})
