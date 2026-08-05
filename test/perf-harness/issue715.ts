// #715: device pricing of packed-data Show artifacts. Shared fixtures and
// encoders for the offline unit test and the hardware measurement run.
//
// Measured context (pb32, fw 3.67, 2026-08-05): the device compiler emits
// array-literal elements as ~4.25 bytecode bytes per element (raw data plus
// ~6% framing), versus 20 bytes per element for the per-element assignment
// emission priced by #573. Packing two guarded 15-bit values per 16.16 word
// inside an array literal reaches ~2.2 bytecode bytes per value after the
// unpack loop. See docs/plans/issue-715-packed-data-pricing-results.md.

/** Deterministic pseudo-random values; the same stream the report was
 * generated with, so re-runs reproduce byte-identical fixtures. */
export function seededValues(count: number, bits: number, seed = 0x2f6e2b1): number[] {
  let state = seed
  const max = 2 ** bits
  return Array.from({ length: count }, () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state % max
  })
}

/**
 * One 16.16 word carrying two 15-bit values. The low lane is stored odd
 * ((lo << 1) | 1) because the device compiler's decimal parser emits a word
 * one ulp low for ~0.5% of fractions (measured 2/400, always -1, never +1):
 * a -1 ulp turns the odd lane even without changing floor(lane / 2) and,
 * because the lane is never zero, can never borrow into the high lane.
 */
export function packed15Word(hi: number, lo: number): number {
  if (!Number.isInteger(hi) || !Number.isInteger(lo) || hi < 0 || lo < 0 || hi > 32767 || lo > 32767) {
    throw new Error(`packed15Word requires 15-bit non-negative halves; got ${hi}, ${lo}`)
  }
  return hi * 65536 + lo * 2 + 1
}

/** Exact decimal text for word / 65536; lo/65536 terminates within 16
 * fractional decimal digits, so toFixed(16) is exact in float64. */
export function packed15Literal(hi: number, lo: number): string {
  return (packed15Word(hi, lo) / 65536).toFixed(16).replace(/0+$/, '').replace(/\.$/, '')
}

/** The float64 side of the on-device decode, including a parse error in
 * ulps: hi = floor(w), lo = floor(lane / 2). Exact for error in {-1, 0}. */
export function decodePacked15(word: number, parseErrorUlps = 0): { hi: number; lo: number } {
  const parsed = word + parseErrorUlps
  const hi = Math.floor(parsed / 65536)
  return { hi, lo: Math.floor((parsed - hi * 65536) / 2) }
}

/** Order-sensitive checksum kept inside safe 16.16 integer range on device:
 * every intermediate stays below 3 * 1023 + 255 < 32768. */
export function expectedChecksum(values: number[]): number {
  let checksum = 0
  for (const value of values) checksum = (checksum * 3 + (value % 256)) % 1024
  return checksum
}

const RENDER_TAIL = '\nexport function render(index) { rgb(0, 0, 0) }\n'

/**
 * The overflow-safe unpack loop. 65536 and 32768 are not representable in
 * 16.16 (the Phase B1 checksum failure), so the lane is materialized as
 * ((w - hi) * 256) * 128 = lane / 2, whose maximum 32767.5 still fits, and
 * floor() completes the guarded decode in the same step.
 */
function unpackLoopLines(packedName: string, targetName: string, pairCount: number): string[] {
  return [
    `  var i = 0`,
    `  for (i = 0; i < ${pairCount}; i++) {`,
    `    var w = ${packedName}[i]`,
    `    var hi = floor(w)`,
    `    ${targetName}[i * 2] = hi`,
    `    ${targetName}[i * 2 + 1] = floor(((w - hi) * 256) * 128)`,
    `  }`,
  ]
}

export interface PricingFixture {
  label: string
  values: number
  source: string
}

/** The encoding candidates priced against the device compiler. */
export function buildPricingFixtures(n: number): PricingFixture[] {
  if (n % 2 !== 0) throw new Error('pricing fixtures require an even element count')
  const v11 = seededValues(n, 11)
  const v15 = seededValues(n, 15)
  const packed = Array.from({ length: n / 2 }, (_, i) => packed15Literal(v15[2 * i], v15[2 * i + 1]))
  const unpack = [
    `var t = array(${n})`,
    'var __once = 0',
    'export function beforeRender(delta) {',
    '  if (__once == 1) return',
    '  __once = 1',
    ...unpackLoopLines('p', 't', n / 2),
    '}',
  ]
  return [
    { label: 'baseline', values: 0, source: `var t = array(${n})${RENDER_TAIL}` },
    {
      label: 'assign-11bit',
      values: n,
      source: `var t = array(${n})\n${v11.map((value, i) => `t[${i}] = ${value}`).join('\n')}${RENDER_TAIL}`,
    },
    {
      label: 'array-literal-11bit',
      values: n,
      source: `var t = [${v11.join(', ')}]${RENDER_TAIL}`,
    },
    {
      label: 'packed2x15-literal+unpack',
      values: n,
      source: `var p = [${packed.join(', ')}]\n${unpack.join('\n')}${RENDER_TAIL}`,
    },
  ]
}

export interface ChecksumFixture {
  source: string
  expectedLiteral: number
  expectedPacked: number
}

/** One pattern proving both encodings on device: a plain literal array and a
 * guarded packed array, each checksummed into an exported variable. */
export function buildChecksumFixture(n: number): ChecksumFixture {
  if (n % 2 !== 0) throw new Error('checksum fixture requires an even element count')
  const v11 = seededValues(n, 11)
  const v15 = seededValues(n, 15)
  const packed = Array.from({ length: n / 2 }, (_, i) => packed15Literal(v15[2 * i], v15[2 * i + 1]))
  const source = [
    `var lit = [${v11.join(',')}]`,
    `var p = [${packed.join(',')}]`,
    `var t = array(${n})`,
    'export var litsum = -1',
    'export var packsum = -1',
    'var done = 0',
    'export function beforeRender(delta) {',
    '  if (done == 1) return',
    '  done = 1',
    '  var i = 0',
    '  var cs = 0',
    `  for (i = 0; i < ${n}; i++) cs = (cs * 3 + lit[i] % 256) % 1024`,
    '  litsum = cs',
    ...unpackLoopLines('p', 't', n / 2),
    '  cs = 0',
    `  for (i = 0; i < ${n}; i++) cs = (cs * 3 + t[i] % 256) % 1024`,
    '  packsum = cs',
    '}',
    'export function render(index) { rgb(0, 0, 0) }',
  ].join('\n')
  return { source, expectedLiteral: expectedChecksum(v11), expectedPacked: expectedChecksum(v15) }
}

/** Literal-heavy activation filler: ~60 + 4.25 * elements bytecode bytes. */
export function literalFillerSource(elements: number): string {
  return `var t = [${seededValues(elements, 11).join(',')}]${RENDER_TAIL}`
}

/** Paired fixtures isolating the unpack loop's per-frame cost. */
export function buildUnpackFixtures(n: number): { base: string; everyFrame: string } {
  const v15 = seededValues(n, 15)
  const packed = Array.from({ length: n / 2 }, (_, i) => packed15Literal(v15[2 * i], v15[2 * i + 1]))
  const declaration = `var p = [${packed.join(',')}]\nvar t = array(${n})`
  return {
    base: `${declaration}\nexport function beforeRender(delta) {}${RENDER_TAIL}`,
    everyFrame: [
      declaration,
      'export function beforeRender(delta) {',
      ...unpackLoopLines('p', 't', n / 2),
      '}',
    ].join('\n') + RENDER_TAIL,
  }
}
