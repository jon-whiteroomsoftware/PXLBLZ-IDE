import { bundle } from '../../src/engine/bundle'
import {
  PROFILE2_FN_OPS,
  PROFILE2_OPS,
  buildFunctionValueProbeSource,
  buildProfiler2Source,
  roundTwoSection,
} from './issue556'

function opByFn(ops: typeof PROFILE2_OPS, fn: number) {
  const op = ops.find((candidate) => candidate.fn === fn)
  if (!op) throw new Error(`missing fn=${fn}`)
  return op
}

describe('op-cost profiler round two probes (#556)', () => {
  it('gives every probe a paired baseline that differs only by the exchanged operation', () => {
    for (const ops of [PROFILE2_OPS, PROFILE2_FN_OPS]) {
      for (const op of ops) {
        if (op.baseline) {
          expect(op.baselineFn).toBe(op.fn)
          continue
        }
        expect(op.exchange).toBeDefined()
        const baseline = opByFn(ops, op.baselineFn)
        expect(op.body).toContain(op.exchange!.probe)
        expect(op.body.replace(op.exchange!.probe, op.exchange!.baseline)).toBe(baseline.body)
      }
    }
  })

  it('covers every operation the issue names', () => {
    const names = PROFILE2_OPS.map((op) => op.name)
    for (const required of [
      'div by constant', 'div by variable', 'mod by constant', 'mod by variable',
      'less-than', 'range check (&&)', 'ternary select',
      'floor', 'frac', 'abs', 'clamp', 'min', 'max',
      'wave', 'triangle', 'square', 'sin', 'cos',
      'sqrt', 'pow', 'hypot', 'atan2', 'time', 'random',
      'native rgb sink', 'native hsv sink',
    ]) {
      expect(names).toContain(required)
    }
    const fnNames = PROFILE2_FN_OPS.map((op) => op.name)
    for (const required of [
      'call via function-valued var (0 args)',
      'call via function-valued var (1 arg)',
      'call via function-valued array element (0 args)',
      'call via function-valued array element (1 arg)',
    ]) {
      expect(fnNames).toContain(required)
    }
  })

  it('pairs the native hsv sink against the native rgb sink', () => {
    const hsv = PROFILE2_OPS.find((op) => op.name === 'native hsv sink')!
    const rgb = PROFILE2_OPS.find((op) => op.name === 'native rgb sink')!
    expect(hsv.baselineFn).toBe(rgb.fn)
    expect(hsv.kind).toBe('render-sink')
    expect(rgb.kind).toBe('render-sink')
  })

  it('generates parseable probe patterns', () => {
    const main = bundle(buildProfiler2Source(), {})
    expect(main.code.length).toBeGreaterThan(0)
    const fnProbe = bundle(buildFunctionValueProbeSource(), {})
    expect(fnProbe.code.length).toBeGreaterThan(0)
    // Every declared fn code must appear in its generated dispatch chain.
    const mainSource = buildProfiler2Source()
    for (const op of PROFILE2_OPS) {
      expect(mainSource).toContain(`f == ${op.fn}`)
    }
    const fnSource = buildFunctionValueProbeSource()
    for (const op of PROFILE2_FN_OPS) {
      expect(fnSource).toContain(`f == ${op.fn}`)
    }
  })

  it('renders a round-two section with sink rows and findings', () => {
    const section = roundTwoSection({
      generatedAt: '2026-07-19',
      device: 'Burner bag',
      boardType: 'pb32',
      firmwareVersion: '3.67',
      outputProfile: 'native-serial (assumed)',
      pixelCount: 256,
      iterations: 2_593,
      repetitions: 5,
      sinkReps: 16,
      rows: [{
        name: 'div by constant',
        group: 'arithmetic',
        baselineName: 'constant-multiply baseline',
        netUs: { mean: 0.5, median: 0.51, min: 0.4, max: 0.6 },
        relativeToMultiply: 0.6,
        perCall: false,
      }, {
        name: 'native hsv sink',
        group: 'color',
        baselineName: 'native rgb sink',
        netUs: { mean: 4, median: 4.1, min: 3.9, max: 4.2 },
        relativeToMultiply: 5.1,
        perCall: true,
      }],
      findings: ['Function values can be stored and called.'],
    })
    expect(section).toContain('## Round two')
    expect(section).toContain('2026-07-19')
    expect(section).toContain('`div by constant`')
    expect(section).toContain('`native hsv sink`')
    expect(section).toContain('per call')
    expect(section).toContain('Function values can be stored and called.')
  })
})
