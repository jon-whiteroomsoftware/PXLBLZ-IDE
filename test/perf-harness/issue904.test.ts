import { bundle } from '../../src/engine/bundle'
import { PROFILE904_OPS, blendProbeSection, buildBlendProbeSource, projectBlendSavings } from './issue904'

describe('identity-blend fold probe (#904)', () => {
  it('gives every probe a paired baseline that differs only by the exchanged block', () => {
    for (const op of PROFILE904_OPS) {
      if (op.baseline) {
        expect(op.baselineFn).toBe(op.fn)
        continue
      }
      expect(op.exchange).toBeDefined()
      const baseline = PROFILE904_OPS.find((candidate) => candidate.fn === op.baselineFn)
      expect(baseline?.baseline).toBe(true)
      expect(op.body).toContain(op.exchange!.probe)
      expect(op.body.replace(op.exchange!.probe, op.exchange!.baseline)).toBe(baseline!.body)
    }
  })

  it('spells the probe block exactly as the stack-blend emitter does', () => {
    const emitted = PROFILE904_OPS.find((op) => op.fn === 5)!
    // The production shape under test: dead local inits plus per-channel
    // `value * (1) + accumulator * (1 - (1))` (showCompiler stack blend).
    expect(emitted.body).toContain('m = 0')
    expect(emitted.body).toContain('* (1) + m * (1 - (1))')
    expect(emitted.body).toContain('* (1) + l * (1 - (1))')
    expect(emitted.body).toContain('* (1) + w * (1 - (1))')
  })

  it('generates a parseable probe pattern with every fn dispatch', () => {
    const source = buildBlendProbeSource()
    expect(bundle(source, {}).code.length).toBeGreaterThan(0)
    for (const op of PROFILE904_OPS) {
      expect(source).toContain(`f == ${op.fn}`)
    }
  })

  it('projects per-line, per-block, and per-frame savings from the measured rows', () => {
    const rows = [
      { name: 'mul', baselineName: 'identity baseline', medianNetUs: 0.8, meanNetUs: 0.8, minNetUs: 0.7, maxNetUs: 0.9, relativeToMultiply: 1 },
      { name: 'identity blend (1 channel)', baselineName: 'direct assignment (1 channel)', medianNetUs: 3.2, meanNetUs: 3.3, minNetUs: 3, maxNetUs: 3.5, relativeToMultiply: 4 },
      { name: 'emitted three-channel blend (dead inits + identity blends)', baselineName: 'folded three-channel sink', medianNetUs: 13.5, meanNetUs: 13.6, minNetUs: 13, maxNetUs: 14, relativeToMultiply: 17 },
    ]
    const projections = projectBlendSavings(rows)
    expect(projections.perLineUs).toBe(3.2)
    expect(projections.perPlacementBlockUs).toBe(13.5)
    expect(projections.msPerFrameAt2000px).toBeCloseTo(27, 0)
    const section = blendProbeSection({
      generatedAt: '2026-08-28',
      device: 'Burner bag',
      boardType: 'pb32',
      firmwareVersion: '3.67',
      outputProfile: 'native-serial (assumed)',
      pixelCount: 256,
      iterations: 2_593,
      repetitions: 5,
      rows,
      rawSamplesByFn: {},
      projections,
    })
    expect(section).toContain('## Identity-blend fold probe')
    expect(section).toContain('ms/frame at 2,000 px')
  })
})
