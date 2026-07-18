import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildProfileReport,
  isStableProfileWindow,
  PROFILE_OPS,
  summarizeProfileMeasurements,
  type ProfileOp,
} from './profilerModel'

describe('native Pixelblaze profile measurements', () => {
  it('subtracts each operation from its paired baseline and normalizes dispersion to multiply cost', () => {
    const operations: ProfileOp[] = [
      { fn: 0, name: 'identity baseline', group: 'baseline', baselineFn: 0, baseline: true },
      { fn: 1, name: 'mul', group: 'arithmetic', baselineFn: 0 },
      { fn: 31, name: 'memory baseline', group: 'baseline', baselineFn: 31, baseline: true },
      { fn: 32, name: 'array read', group: 'memory', baselineFn: 31 },
    ]

    const results = summarizeProfileMeasurements({
      operations,
      frameMsByFn: new Map([
        [0, [10, 11, 9]],
        [1, [13, 14, 12]],
        [31, [20, 21, 19]],
        [32, [26, 27, 25]],
      ]),
      iterations: 10,
      multiplyFn: 1,
    })

    expect(results.map((result) => result.op.name)).toEqual(['mul', 'array read'])
    expect(results[0]).toMatchObject({
      sampleCount: 3,
      frameMs: { mean: 13, median: 13, min: 12, max: 14 },
      baselineMs: { mean: 10, median: 10, min: 9, max: 11 },
      netPerIterationUs: { mean: 300, median: 300, min: 300, max: 300 },
      relativeToMultiply: 1,
    })
    expect(results[1]).toMatchObject({
      sampleCount: 3,
      netPerIterationUs: { mean: 600, median: 600, min: 600, max: 600 },
      relativeToMultiply: 2,
    })
  })

  it('serializes Controller, output, repetition, dispersion, and paired-baseline metadata', () => {
    const operations: ProfileOp[] = [
      { fn: 0, name: 'identity baseline', group: 'baseline', baselineFn: 0, baseline: true },
      { fn: 1, name: 'mul', group: 'arithmetic', baselineFn: 0 },
    ]
    const results = summarizeProfileMeasurements({
      operations,
      frameMsByFn: new Map([
        [0, [10, 11, 9]],
        [1, [13, 15, 12]],
      ]),
      iterations: 10,
      multiplyFn: 1,
    })

    const report = buildProfileReport(results, {
      generatedAt: '2026-07-17',
      device: 'pb32 test controller',
      boardType: 'picoW',
      firmwareVersion: '3.67',
      outputProfile: 'Controller-native serial output',
      pixelCount: 2_000,
      iterations: 10,
      repetitions: 3,
    })

    expect(report).toContain('**Device:** pb32 test controller (`picoW`)')
    expect(report).toContain('**Firmware:** 3.67')
    expect(report).toContain('**Output profile:** Controller-native serial output')
    expect(report).toContain('**Pixel count:** 2,000')
    expect(report).toContain('**Samples per operation:** 3')
    expect(report).toContain('| mean net us/iteration | median net | min-max net |')
    expect(report).toContain('| `mul` | arithmetic | `identity baseline` | 333.333 | 300.000 | 300.000-400.000 | 1.0× |')
    expect(report).toContain('Each operation is subtracted sample-by-sample from its declared paired baseline')
  })

  it('defines paired probes for every cache and dispatch exchange in #532', () => {
    const names = PROFILE_OPS.map((op) => op.name)
    expect(names).toEqual(expect.arrayContaining([
      'local read',
      'local write',
      'persistent global read',
      'persistent global write',
      'array read',
      'array write',
      'user function call (0 args)',
      'user function call (1 arg)',
      'user function call (2 args)',
      'user function call (3 args)',
      'global flag branch',
      'generated HSV conversion',
      'bit shift',
      'bit mask',
    ]))
    expect(new Set(PROFILE_OPS.map((op) => op.fn)).size).toBe(PROFILE_OPS.length)
    for (const op of PROFILE_OPS) {
      const baseline = PROFILE_OPS.find((candidate) => candidate.fn === op.baselineFn)
      expect(baseline, `${op.name} baseline`).toMatchObject({ baseline: true })
    }
  })

  it('keeps every public probe code executable by the hand-inspectable Pixelblaze pattern', () => {
    const source = readFileSync(join(process.cwd(), 'test/perf-harness/profiler.js'), 'utf8')
    for (const op of PROFILE_OPS) {
      expect(source, op.name).toMatch(new RegExp(`\\bf == ${op.fn}\\b`))
    }
    expect(source).toMatch(/f == 32[^\n]+local \+ 0\.123/)
    expect(source).toMatch(/f == 38[^\n]+local \* 0\.0001/)
    expect(source).toMatch(/f == 40[^\n]+probeArray\[arrayIndex\] = x; x = frac\(x \+ local \* 0\.0001/)
  })

  it('requires a tight trailing window before sampling a newly selected probe', () => {
    expect(isStableProfileWindow([100, 100.08, 99.96], 0.15)).toBe(true)
    expect(isStableProfileWindow([100, 100.08], 0.15)).toBe(false)
    expect(isStableProfileWindow([100, 100.4, 100.1], 0.15)).toBe(false)
  })
})
