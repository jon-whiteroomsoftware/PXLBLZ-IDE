// #715 offline invariants: the guarded packed-15 encoding survives the
// measured device-parser error class (-1 ulp, never +1) exactly, and the
// fixtures the hardware run prices are deterministic.
import { describe, expect, it } from 'vitest'
import {
  buildChecksumFixture,
  buildPricingFixtures,
  buildUnpackFixtures,
  decodePacked15,
  expectedChecksum,
  literalFillerSource,
  packed15Literal,
  packed15Word,
  seededValues,
} from './issue715'

describe('packed15 encoding (#715)', () => {
  it('round-trips every boundary and seeded pair exactly, with and without the -1 ulp parse error', () => {
    const boundary = [0, 1, 2, 16383, 16384, 32766, 32767]
    const pairs: Array<[number, number]> = boundary.flatMap((hi) => boundary.map((lo) => [hi, lo] as [number, number]))
    const hiStream = seededValues(500, 15, 0x1234567)
    const loStream = seededValues(500, 15, 0x7654321)
    for (let i = 0; i < 500; i += 1) pairs.push([hiStream[i], loStream[i]])
    for (const [hi, lo] of pairs) {
      const word = packed15Word(hi, lo)
      expect(decodePacked15(word, 0)).toEqual({ hi, lo })
      expect(decodePacked15(word, -1)).toEqual({ hi, lo })
    }
  })

  it('emits a decimal literal that reparses to the exact word in float64', () => {
    const hiStream = seededValues(200, 15, 0xabcdef)
    const loStream = seededValues(200, 15, 0xfedcba)
    for (let i = 0; i < 200; i += 1) {
      const literal = packed15Literal(hiStream[i], loStream[i])
      expect(Number(literal) * 65536).toBe(packed15Word(hiStream[i], loStream[i]))
    }
  })

  it('rejects halves outside 15 bits', () => {
    expect(() => packed15Word(32768, 0)).toThrow()
    expect(() => packed15Word(0, 32768)).toThrow()
    expect(() => packed15Word(-1, 0)).toThrow()
    expect(() => packed15Word(0, 1.5)).toThrow()
  })
})

describe('#715 fixtures', () => {
  it('keeps the checksum expectations pinned to the measured report values', () => {
    const fixture = buildChecksumFixture(1024)
    // The 2026-08-05 pb32 run read back litsum 475 (n=1024, 11-bit stream)
    // and packsum 475 (n=1024, 15-bit stream); coincidental equality.
    expect(fixture.expectedLiteral).toBe(expectedChecksum(seededValues(1024, 11)))
    expect(fixture.expectedPacked).toBe(475)
    expect(fixture.expectedLiteral).toBe(475)
    expect(fixture.source).toContain('export var litsum')
    expect(fixture.source).toContain('floor(((w - hi) * 256) * 128)')
  })

  it('builds deterministic pricing fixtures with stable per-encoding shapes', () => {
    const fixtures = buildPricingFixtures(256)
    expect(fixtures.map((fixture) => fixture.label)).toEqual([
      'baseline',
      'assign-11bit',
      'array-literal-11bit',
      'packed2x15-literal+unpack',
    ])
    expect(buildPricingFixtures(256)).toEqual(fixtures)
    const packedFixture = fixtures.find((fixture) => fixture.label === 'packed2x15-literal+unpack')!
    expect(packedFixture.values).toBe(256)
    expect((packedFixture.source.match(/\./g) ?? []).length).toBeGreaterThanOrEqual(128)
  })

  it('sizes the literal activation filler linearly', () => {
    const small = literalFillerSource(100).split('\n')[0]
    const large = literalFillerSource(200).split('\n')[0]
    expect((small.match(/,/g) ?? []).length).toBe(99)
    expect((large.match(/,/g) ?? []).length).toBe(199)
  })

  it('pairs unpack fixtures that differ only in the beforeRender body', () => {
    const { base, everyFrame } = buildUnpackFixtures(1024)
    expect(base).toContain('export function beforeRender(delta) {}')
    expect(everyFrame).toContain('floor(((w - hi) * 256) * 128)')
    expect(base.split('\n')[0]).toBe(everyFrame.split('\n')[0])
  })
})
