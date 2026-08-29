// Static idiom pricing for issue #907 (epic #903), on the #906 oracle.
//
// Each family pairs the emitter's current spelling with a candidate
// spelling of the same semantics; the oracle prices the pair in bytecode
// words (~0.35 us/word on the pb32). A static win nominates the family for
// one hardware probe; a static loss or an exactness failure is recorded
// and the family is dropped.
//
// Exactness note recorded up front: `frac(v)` truncates toward zero on
// firmware 3.67 (#691) while `v - floor(v)` floors, so they DIVERGE for
// negative inputs (frac(-0.25) = -0.25, but -0.25 - floor(-0.25) = 0.75).
// The hue-wrap sites cannot prove non-negative hue (member hue plus phase
// adds), so the frac substitution is exact only under a provable h >= 0
// gate — priced here for the record, gated in the verdict.

export interface IdiomFamily {
  id: string
  description: string
  /** beforeRender body lines for the current emitter spelling. */
  before: string
  /** Candidate spelling of the same semantics. */
  after: string
  /** Exactness status the verdict must carry. */
  exactness: 'exact' | 'exact-given-nonnegative-input' | 'exact-per-frame-flag'
}

export const IDIOM_FAMILIES: IdiomFamily[] = [
  {
    id: 'statement-fusion',
    description: 'dead zero-initializer ahead of an unconditional overwrite',
    before: '  a = 0\n  a = b * 0.5',
    after: '  a = b * 0.5',
    exactness: 'exact',
  },
  {
    id: 'frac-hue-wrap',
    description: 'hue wrap `h - floor(h)` vs `frac(h)` (NOT exact for negative h)',
    before: '  a = b - floor(b)',
    after: '  a = frac(b)',
    exactness: 'exact-given-nonnegative-input',
  },
  {
    id: 'effect-endpoint-branch',
    description: 'posterize blend through identity coefficients vs a per-frame flag branch (k carries the q==1 fact)',
    before: '  a = b * c + floor(b * n + 0.5) / n * d',
    after: '  a = k ? b : b * c + floor(b * n + 0.5) / n * d',
    exactness: 'exact-per-frame-flag',
  },
  {
    id: 'hsv-dead-lane',
    description: 'shared HSV chain computes q and t eagerly when each sector consumes one',
    before: '  a = c * (1 - b * d)\n  i = c * (1 - (1 - b) * d)\n  a = k ? a : i',
    after: '  a = k ? c * (1 - b * d) : c * (1 - (1 - b) * d)',
    exactness: 'exact',
  },
  {
    id: 'literal-vs-global',
    description: 'inline literal vs a module global holding the same constant',
    before: '  a = b * n',
    after: '  a = b * 0.25',
    exactness: 'exact',
  },
]

export interface IdiomVerdict {
  id: string
  description: string
  exactness: IdiomFamily['exactness']
  beforeWords: number
  afterWords: number
  wordDelta: number
  estimatedUsDelta: number
  staticWinner: 'after' | 'before' | 'tie'
}

export function verdictTable(verdicts: IdiomVerdict[]): string {
  return [
    '# Emission idiom static verdicts (#907)',
    '',
    'Whole-pattern word counts from the device compiler via the #906 oracle;',
    'deltas are candidate-minus-current (~0.35 us/word). Static verdicts',
    'nominate hardware probes; they do not replace them.',
    '',
    '| family | exactness | before | after | delta words | est us | static winner |',
    '|---|---|---:|---:|---:|---:|---|',
    ...verdicts.map((verdict) => (
      `| \`${verdict.id}\` | ${verdict.exactness} | ${verdict.beforeWords} | ${verdict.afterWords} | `
      + `${verdict.wordDelta} | ${verdict.estimatedUsDelta.toFixed(2)} | ${verdict.staticWinner} |`
    )),
    '',
  ].join('\n')
}
