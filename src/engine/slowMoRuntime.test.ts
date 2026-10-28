import { bundle } from './bundle'
import { bundleWithPasses } from './passEngine'
import { createFastReplayRuntime } from './fastReplay'
import { loadPattern } from './loadPattern'
import { createFxShim, createShim } from './shim'
import { emitSlowMoWrapper, planSlowMo, type SlowMoSettings } from './slowMo'

const settings: SlowMoSettings = {
  rate: 0.25, stepMs: 16, inBetween: 'hold',
  stagger: { shape: 'sweep', width: 0 }, persistence: null,
}
const modes = ['fast', 'fidelity'] as const
const points = Array.from({ length: 3 }, (_, i) => ({ sample: [i / 4, 0.5, 0.75] }))
const prefix = '__pxlblz_slowmo_'
function artifact(source: string, input = settings, libraries: Record<string, string> = {}) {
  return bundleWithPasses(source, libraries, [{ kind: 'slowmo', settings: input, pixelCount: points.length }])
}
function runtime(source: string, fidelity: typeof modes[number], dimension: 1 | 2 | 3 = 1, wrapped = true) {
  const prepared = wrapped ? artifact(source) : bundle(source, {})
  return createFastReplayRuntime({ ...prepared, dimension }, { mapPoints: points, randomSeed: 7, fidelity })
}
function close(actual: number[][], expected: number[][], tolerance: number) {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((pixel, i) => pixel.forEach((v, c) => {
    expect(Number.isFinite(v)).toBe(true)
    expect(Math.abs(v - expected[i][c])).toBeLessThanOrEqual(tolerance)
  }))
}
function direct(source: string, mode: typeof modes[number], input = settings) {
  const a = artifact(source, input)
  const config = { mapPoints: points, pixelCount: points.length, dimensions: 1 as const, getVirtualTime: () => 0 }
  const shim = mode === 'fast' ? createShim(config) : createFxShim(config)
  const handle = loadPattern(mode === 'fast' ? a.code : a.fxCode, a.metadata, shim.builtins)
  const enc = shim.encodeScalar
  return {
    handle, shim,
    count() { return shim.decodeScalar(handle.getExports().count as number) },
    frame(delta: number) {
      handle.beforeRender(enc(delta))
      return points.map((_, i) => { handle.render(enc(i)); return [...shim.capturedPixel()] })
    },
    set(name: string, value: number) { handle.setRuntimeVar(prefix + name, enc(value)) },
  }
}

for (const mode of modes) {
  const tolerance = mode === 'fast' ? 2 ** -10 : 2 ** -8
  describe(`slow-mo emitted artifact (${mode})`, () => {
    for (const [entry, args, dimension] of [
      ['render', 'index', 1], ['render2D', 'index,x,y', 2], ['render3D', 'index,x,y,z', 3],
    ] as const) {
      it.each(['rgb', 'hsv', 'hsv24', 'none'])(`I2 ${entry} preserves previous real frames after single-real-step advances with %s`, sink => {
        const call = sink === 'none' ? '' : `${sink}(count/16, index/4, 0.5)`
        const source = `export var count=0; export function beforeRender(d){count+=1}
export function ${entry}(${args}) {${call}}`
        const base = runtime(source, mode, dimension, false)
        const wrapped = runtime(source, mode, dimension)
        let previous = base.advanceLive(0).pixels
        close(wrapped.advanceLive(0).pixels, previous, tolerance)
        // At rate 1/4, each 64 ms display advance runs exactly one 16 ms real step.
        for (let i = 0; i < 5; i++) {
          const next = base.advanceLive(16).pixels
          close(wrapped.advanceLive(64).pixels, previous, sink === 'rgb' && mode === 'fast' ? 0 : tolerance)
          previous = next
        }
      })

      it.each(['hold', 'blend', 'eased'] as const)(`I2 catch-up ${entry} preserves histories and latest captures with %s`, inBetween => {
        const source = `export var calls=0, renders=0
export var deltas=array(16), ticks=array(16)
export function beforeRender(delta) {
  deltas[calls]=delta
  ticks[calls]=time(0.015625)
  calls+=1
}
export function ${entry}(${args}) {
  renders+=1
  rgb((calls-1)/16,ticks[calls-1],index/4)
}`
        const base = runtime(source, mode, dimension, false)
        const captures = [base.advanceLive(0).pixels.map(pixel => [...pixel])]
        for (let i = 0; i < 6; i++) captures.push(base.advanceLive(16).pixels.map(pixel => [...pixel]))
        const prepared = artifact(source, { ...settings, rate: 1, inBetween })
        const wrapped = createFastReplayRuntime({ ...prepared, dimension }, {
          mapPoints: points, randomSeed: 7, fidelity: mode,
        })
        const c = inBetween === 'hold' ? 0 : inBetween === 'blend' ? 0.25 : 0.15625
        const interpolate = (a: number, b: number) => captures[a].map((pixel, i) =>
          pixel.map((value, channel) => value + (captures[b][i][channel] - value) * c))
        // A capture traverses the inner renderer once, even when several clock steps run.
        const rows = [
          { delta: 0, calls: 1, renders: 3, pixels: captures[0] },
          { delta: 48, calls: 4, renders: 6, pixels: captures[0] },
          { delta: 4, calls: 4, renders: 6, pixels: interpolate(0, 3) },
          { delta: 12, calls: 5, renders: 9, pixels: captures[3] },
          { delta: 32, calls: 7, renders: 12, pixels: captures[4] },
          { delta: 4, calls: 7, renders: 12, pixels: interpolate(4, 6) },
        ]
        for (const row of rows) {
          const result = wrapped.advanceLive(row.delta)
          // Replay getters expose mutable state: snapshot pixels and exports before advancing.
          const pixels = result.pixels.map(pixel => [...pixel])
          const exports = result.exports
          const decode = (value: unknown) => Number(value) / (mode === 'fast' ? 1 : 65536)
          const calls = decode(exports.calls)
          const renders = decode(exports.renders)
          const deltas = Array.from(exports.deltas as ArrayLike<number>).slice(0, row.calls).map(decode)
          const ticks = Array.from(exports.ticks as ArrayLike<number>).slice(0, row.calls).map(decode)
          expect.soft(calls).toBe(row.calls)
          expect.soft(deltas).toEqual(Array.from({ length: row.calls }, (_, i) => i === 0 ? 0 : 16))
          expect.soft(ticks).toEqual(Array.from({ length: row.calls }, (_, i) => i / 64))
          expect(renders).toBe(row.renders)
          close(pixels, row.pixels, mode === 'fast' ? 0 : 2 ** -8)
        }
      })
    }

    it('I2 clock and top-level time preserve previous frames after single-real-step advances', () => {
      const source = `var initial=time(0.25); var t=0;
export function beforeRender(d){t=time(0.25)}
export function render(i){rgb(initial+t, time(1), 0)}`
      const base = runtime(source, mode, 1, false)
      const wrapped = runtime(source, mode)
      let previous = base.advanceLive(0).pixels
      close(wrapped.advanceLive(0).pixels, previous, tolerance)
      // Each 64 ms display advance at rate 1/4 runs exactly one real step.
      for (let i = 0; i < 8; i++) {
        const next = base.advanceLive(16).pixels
        close(wrapped.advanceLive(64).pixels, previous, tolerance)
        previous = next
      }
      expect(previous[0][0]).toBeGreaterThan(0)
    })

    for (const sink of ['rgb', 'hsv']) {
      it.each(['hold', 'blend', 'eased'] as const)(`I6 ${sink} interpolates channels with %s`, inBetween => {
        const source = `var count=0; export function beforeRender(d){count+=1}
export function render(i){${sink === 'rgb' ? 'rgb(count%2,0,1-count%2)' : 'hsv(count%2 == 1 ? 0 : 2/3,1,1)'}}`
        const a = artifact(source, { ...settings, inBetween })
        const r = createFastReplayRuntime({ ...a, dimension: 1 }, { mapPoints: points, randomSeed: 1, fidelity: mode })
        r.advanceLive(0)
        for (const f of [0, 0.25, 0.5, 0.75]) {
          const result = r.advanceLive(f === 0 ? 64 : 16)
          const c = inBetween === 'hold' ? 0 : inBetween === 'blend' ? f : f*f*(3-2*f)
          close(result.pixels, points.map(() => [1-c, 0, c]), tolerance)
          result.pixels.flat().forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1) })
        }
      })
    }

    it('I11 slider changes captured output on the existing handle', () => {
      const r = direct(`var gain=0.25; export function sliderGain(v){gain=v}
export function render(i){rgb(gain,0,0)}`, mode)
      r.frame(0)
      r.handle.controls.sliderGain(r.shim.encodeScalar(0.75))
      r.frame(64)
      close(r.frame(64), points.map(() => [0.75,0,0]), tolerance)
    })

    it.each(['rate', 'step', 'curve'])('I11 live %s changes later output without resetting authored state', name => {
      const r = direct(`export var count=0; export function beforeRender(d){count+=1}
export function render(i){rgb(count/16,0,0)}`, mode)
      r.frame(0)
      r.frame(64)
      const before = r.count()
      expect(before).toBe(2)
      if (name === 'curve') {
        r.set(name, 1)
        close(r.frame(32), points.map(() => [1.5/16,0,0]), tolerance)
        expect(r.count()).toBe(before)
      } else {
        r.set(name, name === 'rate' ? 0.5 : 8)
        r.frame(32)
        close(r.frame(32), points.map(() => [3/16,0,0]), tolerance)
        expect(r.count()).toBe(before + 2)
      }
    })

    it('I13 beforeRender sinks cannot leak into a no-sink renderer', () => {
      const r = runtime('export function beforeRender(d){rgb(1,1,1)} export function render(i){}', mode)
      close(r.advanceLive(0).pixels, points.map(() => [0,0,0]), 0)
      close(r.advanceLive(64).pixels, points.map(() => [0,0,0]), 0)
    })

    it.each([
      'function sample(hsv,time){return hsv(time())}',
      'function sample(){var hsv=identity;var time=quarter;return hsv(time())}',
      // Default parameters are rewrite diagnostics below: emitFixedPoint only
      // emits Identifier parameters. Exercise their execution in Fast only.
      ...(mode === 'fast' ? ['function sample(hsv=identity,time=quarter,v=hsv(time())){return v}'] : []),
    ])('I13 executes local builtin bindings alongside captured direct calls: %s', helper => {
      const source = `${helper}
function identity(v){return v} function quarter(){return 0.25}
export function render(i){var v=sample(identity,quarter);rgb(v,0,0);hsv(time(1),0,v)}`
      const r = runtime(source, mode)
      close(r.advanceLive(0).pixels, points.map(() => [0.25,0.25,0.25]), 0)
      close(r.advanceLive(64).pixels, points.map(() => [0.25,0.25,0.25]), 0)
    })

    it.each([
      'function custom(i){return 0.25}\nfunction local(){if(1){var time=custom} return time(1)}\nexport function render(i){rgb(local(),0,0)}',
      'function custom(v){return v}\nfunction local(){for(var j=0;j<1;j++){if(1){var hsv=custom}} return hsv(0.25)}\nexport function render(i){rgb(local(),0,0)}',
    ])('I13 preserves block-nested local var calls in complete pixels: %s', source => {
      const r = runtime(source, mode)
      const unwrapped = runtime(source, mode, 1, false)
      const expected = points.map(() => [0.25,0,0])
      close(unwrapped.advanceLive(0).pixels, expected, 0)
      for (const delta of [0,16,16,32,16,48]) close(r.advanceLive(delta).pixels, expected, 0)
    })

    it('I13 keeps nested function vars local while advancing the parent builtin clock', () => {
      const source = `function custom(v){return 0.25}
function parent(){function nested(){if(1){var time=custom;var hsv=custom}return hsv(time(1))}return nested()+time(0.0009765625)}
export function render(i){rgb(parent(),0,0)}`
      const code = artifact(source).code
      expect(code).toContain('return hsv(time(1))')
      expect(code).toContain('return nested()+__pxlblz_slowmo_time(0.0009765625)')
      const r = runtime(source, mode)
      close(r.advanceLive(0).pixels, points.map(() => [0.25,0,0]), 0)
      close(r.advanceLive(64).pixels, points.map(() => [0.25,0,0]), 0)
      close(r.advanceLive(64).pixels, points.map(() => [0.5,0,0]), tolerance)
    })

    it('I13 isolates block-nested local entry vars from top-level entry references', () => {
      const source = `var calls=0;
function helper(){if(1){var render2D=identity}return render2D(0.5)}
function identity(v){return v}
export function render2D(i,x,y){calls+=1;rgb(calls/16,helper(),0)}
export function render3D(i,x,y,z){render2D(i,x,y)}`
      const code = artifact(source).code
      expect(code).toContain('var render2D=identity}return render2D(0.5)')
      expect(code).toContain('in_render3D(i,x,y,z){__pxlblz_slowmo_in_render2D(i,x,y)}')
      const r = runtime(source, mode, 3)
      close(r.advanceLive(0).pixels, [[1/16,0.5,0],[2/16,0.5,0],[3/16,0.5,0]], 0)
      r.advanceLive(64)
      close(r.advanceLive(64).pixels, [[4/16,0.5,0],[5/16,0.5,0],[6/16,0.5,0]], 0)
    })

    if (mode === 'fast') {
      it('I13 executes captured calls in default initializers (Fast)', () => {
        const r = runtime(`function sample(v=hsv(time(1),1,0.5)){return v}
export function render(i){sample()}`, mode)
        close(r.advanceLive(0).pixels, points.map(() => [0.5,0,0]), tolerance)
      })
    }

    it('I13 entry references use inner functions once and respect local entry parameters', () => {
      const source = `var calls=0;
function helper(render2D){return render2D(0.5)}
function identity(v){return v}
export function render2D(i,x,y){calls+=1;rgb(calls/16,helper(identity),0)}
export function render3D(i,x,y,z){render2D(i,x,y)}`
      const r = runtime(source, mode, 3)
      close(r.advanceLive(0).pixels, [[1/16,0.5,0],[2/16,0.5,0],[3/16,0.5,0]], 0)
      r.advanceLive(64)
      close(r.advanceLive(64).pixels, [[4/16,0.5,0],[5/16,0.5,0],[6/16,0.5,0]], 0)
    })

    it('I13 captures inlined library time and colour calls', () => {
      const a = artifact(`export function render(i){Lamp.emit()}`, settings, {
        Lamp: 'function emit(){hsv24(time(0.25),1,0.5)}',
      })
      const r = createFastReplayRuntime({ ...a, dimension: 1 }, { mapPoints: points, randomSeed: 1, fidelity: mode })
      close(r.advanceLive(0).pixels, points.map(() => [0.5,0,0]), tolerance)
      close(r.advanceLive(64).pixels, points.map(() => [0.5,0,0]), tolerance)
      expect(r.advanceLive(64).pixels[0][1]).toBeGreaterThan(0)
    })

    it('I14 caps catch-up at four and drops the excess backlog', () => {
      const r = direct(`export var count=0; export function beforeRender(d){count+=1}
export function render(i){rgb(count/16,0,0)}`, mode, { ...settings, rate: 1 })
      r.frame(0)
      r.frame(100)
      expect(r.count()).toBe(5)
      r.frame(11)
      expect(r.count()).toBe(5)
      r.frame(1)
      expect(r.count()).toBe(6)
      close(r.frame(16), points.map(() => [6/16,0,0]), tolerance)
    })

    it('I15 matches clamped shim HSV across normalized hue and out-of-range s/v', () => {
      for (const h of [-1.25, -0.125, 0, 0.25, 0.5, 0.75, 1.25]) {
        for (const s of [-0.25, 0, 0.5, 1, 1.25]) {
          for (const v of [-0.25, 0, 0.5, 1, 1.25]) {
            const source = `export function render(i){hsv(${h},${s},${v})}`
            const expected = runtime(source, mode, 1, false).advanceLive(0).pixels
              .map(pixel => pixel.map(c => Math.min(1, Math.max(0, c))))
            close(runtime(source, mode).advanceLive(0).pixels, expected, tolerance)
          }
        }
      }
    })
  })
}

describe('slow-mo pass integration and scope diagnostics', () => {
  it('I11 preserves authored metadata and exposes exactly the five runtime tunables', () => {
    const source = 'export var gain=0.5; export function sliderGain(v){gain=v} export function render(i){rgb(gain,0,0)}'
    const base = bundle(source, {})
    const result = artifact(source)
    for (const key of ['renderFns','controls','exportedVars','patternVars'] as const) expect(result.metadata[key]).toEqual(base.metadata[key])
    expect(result.metadata.runtimeVars).toEqual([...(base.metadata.runtimeVars ?? base.metadata.patternVars), prefix+'rate', prefix+'step', prefix+'curve', prefix+'shape', prefix+'width'])
    expect(new Set(result.metadata.runtimeVars).size).toBe(result.metadata.runtimeVars!.length)
    expect(result.summary.passes[0]).toMatchObject({ beforeRender: 'synthesized', exportsAdded: ['beforeRender'], estimatedPixelCost: 0, slowMo: { arrayWords: 42, tunables: [prefix+'rate',prefix+'step',prefix+'curve',prefix+'shape',prefix+'width'] } })
    expect(result.summary.globalsAdded).toContain(prefix+'ar')
  })

  it('preserves existing library runtime vars and reports an authored beforeRender as wrapped', () => {
    const source = 'export function beforeRender(d){Lamp.tick()} export function render(i){rgb(Lamp.value(),0,0)}'
    const libraries = { Lamp: 'var count=0; function tick(){count+=1} function value(){return count/16}' }
    const base = bundle(source, libraries)
    const result = artifact(source, settings, libraries)
    expect(result.metadata.runtimeVars).toEqual([...base.metadata.runtimeVars!, prefix+'rate',prefix+'step',prefix+'curve',prefix+'shape',prefix+'width'])
    expect(result.summary.passes[0]).toMatchObject({ beforeRender:'wrapped', exportsAdded:[] })
  })

  it('imports and executes the reciprocal pass-engine/slow-mo function boundary', async () => {
    const { bundleWithPasses: apply } = await import('./passEngine')
    const { DEFAULT_SLOW_MO_STEP_MS: stepMs } = await import('./slowMo')
    const prepared = apply('export function render(i){rgb(0.5,0,0)}', {}, [{ kind:'slowmo', settings:{ ...settings, stepMs }, pixelCount:3 }])
    const r = createFastReplayRuntime({ ...prepared, dimension:1 }, { mapPoints:points, randomSeed:1 })
    close(r.advanceLive(0).pixels, points.map(() => [0.5,0,0]), 0)
  })

  it.each([
    ['palette-output','export function render(i){paint(0)}',3],
    ['no-renderer','export var x=1',3],
    ['shadowed-builtin','var time=0; export function render(i){}',3],
    ['reserved-prefix','var __pxlblz_slowmo_x=0; export function render(i){}',3],
    ['array-budget','export function render(i){}',1703],
  ] as const)('I12 retains %s summary with exact unchanged artifacts', (reason, source, pixelCount) => {
    const base = bundle(source, {})
    const expected = planSlowMo(base.code, settings, pixelCount)
    const result = bundleWithPasses(source, {}, [{ kind: 'slowmo', settings, pixelCount }])
    expect(result.code).toBe(base.code)
    expect(result.fxCode).toBe(base.fxCode)
    expect(result.metadata).toEqual(base.metadata)
    expect(result.summary.passes[0]).toEqual({ id:'slowmo-1',kind:'slowmo',declined:expected.declined,slowMo:{arrayWords:expected.arrayWords,tunables:[]},estimatedPixelCost:0 })
    expect(result.summary.passes[0].declined?.reason).toBe(reason)
  })

  it('I12 accepts blend budget edge and preserves clock identity without a summary', () => {
    const source = 'export function render(i){rgb(1,0,0)}'
    expect(bundleWithPasses(source, {}, [{ kind:'slowmo', settings, pixelCount:1702 }]).summary.passes[0].declined).toBeUndefined()
    const base = bundle(source, {})
    const clock = artifact(source, { ...settings, inBetween:'clock' })
    expect(clock).toMatchObject({ ...base, summary: { passes: [] } })
    const persistence = { ...settings, persistence:{ attackMs:0, decayMs:100 } }
    const declined = bundleWithPasses(source, {}, [{ kind:'slowmo',settings:persistence,pixelCount:1134 }])
    expect(declined).toMatchObject({ ...base, summary:{ passes:[{
      declined:{ reason:'array-budget',message:'Slow-mo needs 10242 array words; the VM budget is 10240.' },
    }] } })
    expect(() => bundleWithPasses(source, {}, [{ kind:'slowmo',settings:persistence,pixelCount:1133 }])).toThrow(RangeError)
  })

  it.each([
    'function sample(hsv,time){return hsv(time())}',
    'function sample(){var hsv=custom; var time=custom; return hsv(time())}',
    'function sample(hsv=custom,time=custom,v=hsv(time())){return v}',
    'var sample=function(hsv=custom,time=custom,v=hsv(time())){return v}',
    'var sample=(hsv=custom,time=custom,v=hsv(time()))=>v',
    'function sample({hsv,time}){return hsv(time())}',
    'function sample([hsv,time]){return hsv(time())}',
  ])('I13 preserves shadowed direct calls: %s', local => {
    const result = emitSlowMoWrapper(`${local}\nexport function render(i){hsv(time(1),1,1)}`, settings, 3)
    expect(result.code).toContain(local)
    expect(result.code).toContain('__pxlblz_slowmo_hsv(__pxlblz_slowmo_time(1),1,1)')
  })
  it.each([
    'function sample(v=hsv(time(1),1,1)){return v}',
    'var sample=function(v=hsv(time(1),1,1)){return v}',
    'var sample=(v=hsv(time(1),1,1))=>v',
  ])('I13 rewrites unbound default-parameter calls: %s', local => {
    const result = emitSlowMoWrapper(`${local}\nexport function render(i){sample()}`, settings, 3)
    expect(result.code).toContain('v=__pxlblz_slowmo_hsv(__pxlblz_slowmo_time(1),1,1)')
  })
  it('excludes noncomputed properties, member names and labels from entry renames', () => {
    const source = `var obj={render2D:1}; function helper(){render2D: while(0){break render2D} return obj.render2D}
export function render2D(i,x,y){rgb(1,0,0)} export function render3D(i,x,y,z){render2D(i,x,y)}`
    const code = emitSlowMoWrapper(source, settings, 3).code
    expect(code).toContain('{render2D:1}')
    expect(code).toContain('break render2D')
    expect(code).toContain('obj.render2D')
    expect(code).toContain('__pxlblz_slowmo_in_render2D(i,x,y)')
  })

  it('removes only the entry export keyword and preserves shorthand property keys', () => {
    const source = 'export /* authored comment */ function render(i){rgb(1,0,0)}\nvar obj={render}'
    const code = emitSlowMoWrapper(source, settings, 3).code
    expect(code).toContain(' /* authored comment */ function __pxlblz_slowmo_in_render(i)')
    expect(code).toContain('var obj={render: __pxlblz_slowmo_in_render}')
  })
})
