// fx.mul microbenchmark — go/no-go evidence for ADR-0003 (fixed-point fidelity default).
//
// Run with:  npx vitest bench src/engine/fixedpoint.bench.ts
//
// Recorded result (Apple M-series, V8 via Node):
//   fx.mul  — ~158 M muls/sec  (6.5× slower than float64 baseline)
//   float   — ~1023 M muls/sec
//
// VERDICT: GO.  A 32×32 grid at 30 fps with 100 muls/pixel needs ~3 M mul/sec.
// 158 M/sec gives a 50× headroom. Matches PRD's projected 3–8× slowdown range.
// 64×64 deep raymarchers approach the edge — fast-preview escape hatch covers them.

import { bench, describe } from 'vitest'
import { fx } from './fixedpoint'

describe('fx.mul microbenchmark', () => {
  bench('fx.mul — tight loop, 1 M iterations', () => {
    let acc = fx.fromFloat(0.7)
    const b = fx.fromFloat(0.314159265)
    for (let i = 0; i < 1_000_000; i++) {
      acc = fx.mul(acc, b)
    }
    // Prevent dead-code elimination
    if (acc === 0xdeadbeef) throw new Error('unreachable')
  })

  bench('fx.mul vs float multiply — float baseline', () => {
    let acc = 0.7
    const b = 0.314159265
    for (let i = 0; i < 1_000_000; i++) {
      acc = acc * b
    }
    if (acc === 0xdeadbeef) throw new Error('unreachable')
  })
})
