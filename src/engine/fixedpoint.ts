// 16.16 fixed-point arithmetic engine.
//
// Every pattern number is its raw int32 = round(value × 65536).
// Values stay in raw form throughout pattern execution so that intermediate
// overflow wraps exactly as it does on Pixelblaze hardware.

const SCALE = 65536;

export const fx = {
  // ── Boundary conversions ──────────────────────────────────────────────────

  fromFloat(v: number): number {
    return Math.round(v * SCALE) | 0;
  },

  toFloat(raw: number): number {
    return raw / SCALE;
  },

  // ── Arithmetic ────────────────────────────────────────────────────────────

  add(a: number, b: number): number {
    return (a + b) | 0;
  },

  sub(a: number, b: number): number {
    return (a - b) | 0;
  },

  // Exact (a·b)>>16 as int32.
  // Direct float64 overflows at ~2^62; split into 16-bit limbs so every
  // partial product stays under 2^47 (well within float64's 2^53 safe integer range).
  mul(a: number, b: number): number {
    const aHi = a >> 16;
    const aLo = a & 0xFFFF;
    const bHi = b >> 16;
    const bLo = b & 0xFFFF;
    return (aHi * bHi * SCALE + aHi * bLo + aLo * bHi + ((aLo * bLo) >>> 16)) | 0;
  },

  div(a: number, b: number): number {
    // a × 65536 ≤ 2^47 so the product stays under 2^53 (float64 exact)
    return Math.round(a * SCALE / b) | 0;
  },

  // Truncated remainder — sign follows a (matches firmware %, identical to JS %)
  mod(a: number, b: number): number {
    if (b === 0) return 0;
    return (a % b) | 0;
  },

  // Truncate-based: a − trunc(a), sign follows a (matches firmware frac, NOT floor-based)
  frac(a: number): number {
    const lo = a & 0xFFFF;
    if (lo === 0 || a >= 0) return lo;
    return (lo - SCALE) | 0;
  },

  // ── Bitwise ───────────────────────────────────────────────────────────────
  //
  // Hardware coerces every operand to its integer part *before* the bitwise op,
  // then returns the integer result (firmware 3.67, confirmed by the divergence
  // harness — e.g. ~2.5 → -3, not the raw-16.16 bit-flip). We mirror that by
  // taking the integer part (`raw >> 16`), operating, then re-scaling (`<< 16`).
  // Shift counts are also coerced, which incidentally cancels the fixed-point
  // shift-count-scaling trap (a literal `2` arrives as raw 131072 → 2).

  and(a: number, b: number): number {
    return ((a >> 16) & (b >> 16)) << 16;
  },

  or(a: number, b: number): number {
    return ((a >> 16) | (b >> 16)) << 16;
  },

  xor(a: number, b: number): number {
    return ((a >> 16) ^ (b >> 16)) << 16;
  },

  not(a: number): number {
    return (~(a >> 16)) << 16;
  },

  shl(a: number, b: number): number {
    return ((a >> 16) << (b >> 16)) << 16;
  },

  shr(a: number, b: number): number {
    return ((a >> 16) >> (b >> 16)) << 16;
  },

  // ── Comparisons (compare raw ints; return 0 or 1.0 in raw = 65536) ────────

  lt(a: number, b: number): number {
    return a < b ? SCALE : 0;
  },

  gt(a: number, b: number): number {
    return a > b ? SCALE : 0;
  },

  lte(a: number, b: number): number {
    return a <= b ? SCALE : 0;
  },

  gte(a: number, b: number): number {
    return a >= b ? SCALE : 0;
  },

  eq(a: number, b: number): number {
    return a === b ? SCALE : 0;
  },

  neq(a: number, b: number): number {
    return a !== b ? SCALE : 0;
  },
}
