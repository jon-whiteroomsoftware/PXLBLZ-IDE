import { fx } from './fixedpoint'

const SCALE = 65536
const TOLERANCE = 1 / SCALE

// Helper: convert float → raw → op → raw → float and check float result
function fxRoundtrip(raw: number): number {
  return fx.toFloat(raw)
}

// ── fromFloat / toFloat ───────────────────────────────────────────────────────

describe('fx.fromFloat', () => {
  it('converts 0', () => expect(fx.fromFloat(0)).toBe(0))
  it('converts 1.0', () => expect(fx.fromFloat(1)).toBe(65536))
  it('converts 0.5', () => expect(fx.fromFloat(0.5)).toBe(32768))
  it('converts -1.5', () => expect(fx.fromFloat(-1.5)).toBe(-98304))
  it('converts a sub-LSB value (rounds)', () => {
    // 0.00001 * 65536 ≈ 0.655 → rounds to 1
    expect(fx.fromFloat(0.00001)).toBe(1)
  })
  it('produces int32 output (no fractional bits)', () => {
    expect(Number.isInteger(fx.fromFloat(Math.PI))).toBe(true)
  })
})

describe('fx.toFloat', () => {
  it('converts 0', () => expect(fx.toFloat(0)).toBe(0))
  it('converts 65536 → 1.0', () => expect(fx.toFloat(65536)).toBe(1))
  it('converts 32768 → 0.5', () => expect(fx.toFloat(32768)).toBe(0.5))
  it('converts -98304 → -1.5', () => expect(fx.toFloat(-98304)).toBe(-1.5))
})

describe('fromFloat/toFloat roundtrip', () => {
  it('recovers values within 1/65536', () => {
    for (const v of [-3.14, -1.5, -0.5, 0, 0.5, 1.0, 1.5, Math.PI]) {
      expect(Math.abs(fx.toFloat(fx.fromFloat(v)) - v)).toBeLessThanOrEqual(TOLERANCE)
    }
  })
})

// ── add / sub ─────────────────────────────────────────────────────────────────

describe('fx.add', () => {
  it('1.0 + 0.5 = 1.5', () => expect(fx.add(65536, 32768)).toBe(98304))
  it('0 + 0 = 0', () => expect(fx.add(0, 0)).toBe(0))
  it('-1.0 + 0.5 = -0.5', () => expect(fx.add(-65536, 32768)).toBe(-32768))
  it('wraps on overflow (MAX_INT32 + 1)', () => {
    expect(fx.add(0x7FFFFFFF, 1)).toBe(-2147483648)
  })
  it('wraps on underflow (MIN_INT32 - 1)', () => {
    expect(fx.add(-2147483648, -1)).toBe(0x7FFFFFFF)
  })
})

describe('fx.sub', () => {
  it('1.5 - 1.0 = 0.5', () => expect(fx.sub(98304, 65536)).toBe(32768))
  it('0 - 0 = 0', () => expect(fx.sub(0, 0)).toBe(0))
  it('wraps on underflow (MIN_INT32 - 1)', () => {
    expect(fx.sub(-2147483648, 1)).toBe(0x7FFFFFFF)
  })
})

// ── mul ───────────────────────────────────────────────────────────────────────

describe('fx.mul', () => {
  it('1.0 × 1.0 = 1.0', () => expect(fx.mul(65536, 65536)).toBe(65536))
  it('1.0 × 0.5 = 0.5', () => expect(fx.mul(65536, 32768)).toBe(32768))
  it('0.5 × 0.5 = 0.25', () => expect(fx.mul(32768, 32768)).toBe(16384))
  it('-1.0 × 1.0 = -1.0', () => expect(fx.mul(-65536, 65536)).toBe(-65536))
  it('-1.0 × -1.0 = 1.0', () => expect(fx.mul(-65536, -65536)).toBe(65536))
  it('-0.5 × 0.5 = -0.25', () => expect(fx.mul(-32768, 32768)).toBe(-16384))
  it('0 × anything = 0', () => expect(fx.mul(0, 98304)).toBe(0))

  it('rounding: 1+ε squared rounds correctly', () => {
    // 65537 = 1.0000152587...; squared = 1.0000305175...
    // raw product >> 16: (65537 × 65537) >> 16 = 65538
    expect(fx.mul(65537, 65537)).toBe(65538)
  })

  it('handles near-max values without silent NaN', () => {
    // ~32768 × 2.0 overflows int32 — wraps to a defined int32 value
    const result = fx.mul(0x7FFFFFFF, 131072)
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBe(-2)
  })

  it('wraps on overflow: 2^31-1 × 2.0', () => {
    // (0x7FFFFFFF × 0x20000) >> 16 = 0xFFFFFFFE = -2
    expect(fx.mul(0x7FFFFFFF, 0x00020000)).toBe(-2)
  })

  it('symmetric: fx.mul(a, b) === fx.mul(b, a)', () => {
    expect(fx.mul(98304, 32768)).toBe(fx.mul(32768, 98304))
    expect(fx.mul(-65537, 131073)).toBe(fx.mul(131073, -65537))
  })
})

// ── div ───────────────────────────────────────────────────────────────────────

describe('fx.div', () => {
  it('1.5 / 1.0 = 1.5', () => expect(fx.div(98304, 65536)).toBe(98304))
  it('1.0 / 2.0 = 0.5', () => expect(fx.div(65536, 131072)).toBe(32768))
  it('1.0 / 3.0 ≈ 0.333...', () => {
    const result = fx.toFloat(fx.div(65536, 196608))
    expect(Math.abs(result - 1 / 3)).toBeLessThanOrEqual(TOLERANCE)
  })
  it('-1.0 / 2.0 = -0.5', () => expect(fx.div(-65536, 131072)).toBe(-32768))
})

// ── mod ───────────────────────────────────────────────────────────────────────

describe('fx.mod', () => {
  it('1.5 mod 1.0 = 0.5', () => expect(fx.mod(98304, 65536)).toBe(32768))
  it('mod(b, 0) = 0 (guard)', () => expect(fx.mod(65536, 0)).toBe(0))

  it('floored: mod(-1.5, 1.0) = 0.5 (sign follows b)', () => {
    expect(fx.mod(-98304, 65536)).toBe(32768)
  })
  it('floored: mod(1.5, -1.0) = -0.5 (sign follows b)', () => {
    expect(fx.mod(98304, -65536)).toBe(-32768)
  })
  it('floored: mod(-1.5, -1.0) = -0.5', () => {
    expect(fx.mod(-98304, -65536)).toBe(-32768)
  })

  it('exact: 2.0 mod 1.0 = 0', () => expect(fx.mod(131072, 65536)).toBe(0))
  it('exact: -2.0 mod 1.0 = 0', () => expect(fx.mod(-131072, 65536)).toBe(0))
})

// ── frac ──────────────────────────────────────────────────────────────────────

describe('fx.frac', () => {
  it('frac(0.5) = 0.5', () => expect(fx.frac(32768)).toBe(32768))
  it('frac(1.0) = 0', () => expect(fx.frac(65536)).toBe(0))
  it('frac(1.5) = 0.5', () => expect(fx.frac(98304)).toBe(32768))
  it('frac(2.5) = 0.5', () => expect(fx.frac(163840)).toBe(32768))
  it('frac(0) = 0', () => expect(fx.frac(0)).toBe(0))

  it('truncate-based: frac(-0.5) = -0.5 (not 0.5)', () => {
    expect(fx.frac(-32768)).toBe(-32768)
  })
  it('truncate-based: frac(-1.0) = 0', () => {
    expect(fx.frac(-65536)).toBe(0)
  })
  it('truncate-based: frac(-1.5) = -0.5', () => {
    expect(fx.frac(-98304)).toBe(-32768)
  })
  it('truncate-based: frac(-2.5) = -0.5', () => {
    expect(fx.frac(-163840)).toBe(-32768)
  })

  it('distinguishes from floor-based fract: frac(-0.5) ≠ 0.5', () => {
    expect(fx.frac(-32768)).not.toBe(32768)
  })
})

// ── bitwise ───────────────────────────────────────────────────────────────────

describe('fx.and', () => {
  it('65536 & 65536 = 65536', () => expect(fx.and(65536, 65536)).toBe(65536))
  it('0xFFFF0000 & 0x0000FFFF = 0', () => expect(fx.and(0xFFFF0000 | 0, 0x0000FFFF)).toBe(0))
})

describe('fx.or', () => {
  it('65536 | 32768 = 98304', () => expect(fx.or(65536, 32768)).toBe(98304))
  it('0 | 0 = 0', () => expect(fx.or(0, 0)).toBe(0))
})

describe('fx.xor', () => {
  it('65536 ^ 65536 = 0', () => expect(fx.xor(65536, 65536)).toBe(0))
  it('65536 ^ 32768 = 98304', () => expect(fx.xor(65536, 32768)).toBe(98304))
})

describe('fx.not', () => {
  // ~x zeros the low 16 bits (fractional component), matches firmware behavior
  it('~1.0 = -2.0 (integer ~1 = -2)', () => {
    expect(fx.not(65536)).toBe(-131072)
  })
  it('~0 = -1.0 (integer ~0 = -1)', () => {
    expect(fx.not(0)).toBe(-65536)
  })
  it('~(-1.0) = 0 (integer ~-1 = 0)', () => {
    expect(fx.not(-65536)).toBe(0)
  })
  it('zeros the fractional bits of the result', () => {
    // not(0.5) — fractional input: result should have zero fractional bits
    const result = fx.not(32768)
    expect(result & 0xFFFF).toBe(0)
  })
})

describe('fx.shl / fx.shr', () => {
  it('shl(1, 16) = 65536 (1.0)', () => expect(fx.shl(1, 16)).toBe(65536))
  it('shr(65536, 1) = 32768 (0.5)', () => expect(fx.shr(65536, 1)).toBe(32768))
  it('shr is arithmetic (sign-extends)', () => expect(fx.shr(-65536, 1)).toBe(-32768))
})

// ── comparisons ───────────────────────────────────────────────────────────────

describe('comparisons return 0 or 65536 (false / true in 16.16)', () => {
  it('lt: 0.5 < 1.0 = true', () => expect(fx.lt(32768, 65536)).toBe(65536))
  it('lt: 1.0 < 0.5 = false', () => expect(fx.lt(65536, 32768)).toBe(0))
  it('gt: 1.0 > 0.5 = true', () => expect(fx.gt(65536, 32768)).toBe(65536))
  it('lte: 1.0 <= 1.0 = true', () => expect(fx.lte(65536, 65536)).toBe(65536))
  it('lte: 1.0 <= 0.5 = false', () => expect(fx.lte(65536, 32768)).toBe(0))
  it('gte: 1.0 >= 0.5 = true', () => expect(fx.gte(65536, 32768)).toBe(65536))
  it('eq: 1.0 == 1.0 = true', () => expect(fx.eq(65536, 65536)).toBe(65536))
  it('eq: 1.0 == 0.5 = false', () => expect(fx.eq(65536, 32768)).toBe(0))
  it('neq: 1.0 != 0.5 = true', () => expect(fx.neq(65536, 32768)).toBe(65536))
  it('neq: 1.0 != 1.0 = false', () => expect(fx.neq(65536, 65536)).toBe(0))
  it('lt compares raw ints (order-preserving)', () => {
    expect(fx.lt(-65536, 0)).toBe(65536)   // -1.0 < 0
    expect(fx.lt(0, -65536)).toBe(0)        // 0 < -1.0 = false
  })
})

// ── property tests ────────────────────────────────────────────────────────────

describe('property: fx arithmetic on [0,1] values stays within 1/65536 of float64', () => {
  // Seeded, deterministic "random" sample — no library needed
  function lcg(seed: number) {
    let s = seed
    return () => {
      s = (Math.imul(1664525, s) + 1013904223) | 0
      return (s >>> 0) / 0x100000000
    }
  }

  const rand = lcg(0xdeadbeef)
  const pairs: [number, number][] = Array.from({ length: 500 }, () => [rand(), rand()])

  it('fx.add stays within 1/65536 of float64 for a,b in [0,1]', () => {
    for (const [a, b] of pairs) {
      const ra = fx.fromFloat(a), rb = fx.fromFloat(b)
      const got = fxRoundtrip(fx.add(ra, rb))
      // Both inputs quantize to nearest 1/65536, so error ≤ 1/65536
      expect(Math.abs(got - (fx.toFloat(ra) + fx.toFloat(rb)))).toBeLessThanOrEqual(TOLERANCE)
    }
  })

  it('fx.mul stays within 1/65536 of float64 for a,b in [0,1]', () => {
    for (const [a, b] of pairs) {
      const ra = fx.fromFloat(a), rb = fx.fromFloat(b)
      const got = fxRoundtrip(fx.mul(ra, rb))
      const expected = fx.toFloat(ra) * fx.toFloat(rb)
      expect(Math.abs(got - expected)).toBeLessThanOrEqual(TOLERANCE)
    }
  })

  it('fx.sub stays within 1/65536 of float64 for a,b in [0,1]', () => {
    for (const [a, b] of pairs) {
      const ra = fx.fromFloat(a), rb = fx.fromFloat(b)
      const got = fxRoundtrip(fx.sub(ra, rb))
      expect(Math.abs(got - (fx.toFloat(ra) - fx.toFloat(rb)))).toBeLessThanOrEqual(TOLERANCE)
    }
  })

  it('fx.frac stays within 1/65536 of float64 frac for a in [0,1]', () => {
    for (const [a] of pairs) {
      const ra = fx.fromFloat(a)
      const got = fxRoundtrip(fx.frac(ra))
      // For a in [0,1], trunc-based and floor-based frac agree
      const af = fx.toFloat(ra)
      const expected = af - Math.trunc(af)
      expect(Math.abs(got - expected)).toBeLessThanOrEqual(TOLERANCE)
    }
  })
})
