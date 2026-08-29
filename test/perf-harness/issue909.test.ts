import { ARRAY_PROBE_MODES, buildArrayProbeSource, summarizeArrayProbe } from './issue909'
import { loadCachedWordCompiler } from './bytecodeOracle'

describe('array-helper probe (#909)', () => {
  it('pairs every helper mode against a for-loop counterpart', () => {
    for (const mode of ARRAY_PROBE_MODES) {
      if (mode.pairsWith == null) continue
      const pair = ARRAY_PROBE_MODES.find((candidate) => candidate.fn === mode.pairsWith)
      expect(pair, mode.name).toBeDefined()
      expect(pair!.name).toContain('for-loop')
    }
    const source = buildArrayProbeSource()
    for (const mode of ARRAY_PROBE_MODES) expect(source).toContain(`f == ${mode.fn}`.replace('f == 0', 'fn = 0'))
  })

  it('compiles under the device compiler when the oracle cache exists', () => {
    const compile = loadCachedWordCompiler()
    if (!compile) return
    expect(compile(buildArrayProbeSource()).words.length).toBeGreaterThan(0)
  })

  it('summarizes per-element cost against the idle baseline and the paired loop', () => {
    const frames = new Map<number, number[]>([
      [0, [10, 10, 10, 10, 10]],
      [1, [20.24, 20.24, 20.24, 20.24, 20.24]],
      [2, [14.096, 14.096, 14.096, 14.096, 14.096]],
      [3, [18.192, 18.192, 18.192, 18.192, 18.192]],
      [4, [16.144, 16.144, 16.144, 16.144, 16.144]],
      [5, [11.024, 11.024, 11.024, 11.024, 11.024]],
    ])
    const rows = summarizeArrayProbe(frames, 4)
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]))
    expect(byName['for-loop write fill'].perElementUs).toBeCloseTo(5, 3)
    expect(byName['mutate write fill'].perElementUs).toBeCloseTo(2, 3)
    expect(byName['mutate write fill'].vsForLoop).toBeCloseTo(0.4, 3)
    expect(byName['native sum'].vsForLoop).toBeCloseTo(0.125, 3)
  })
})
