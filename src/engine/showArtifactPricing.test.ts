import { describe, expect, it } from 'vitest'
import {
  HISTORICAL_FIRMWARE_367_OBSERVATION_BYTES,
  PROVISIONAL_SHOW_MARGIN_BYTES,
  PROVISIONAL_SHOW_OPERATING_BUDGET_BYTES,
  priceShowArtifact,
  sha256CompleteCompileInput,
} from './showArtifactPricing'

const context = { controllerId: 'controller-A', liveEpoch: 3 }
const sourceSha256 = 'a'.repeat(64)
const measurement = { ...context, sourceSha256, byteLength: 16 }
const input = { estimatedBytes: 123.5, sourceSha256, context, measurement }

describe('Show artifact pricing', () => {
  it('uses exact serialized bytes only for the complete current compiler identity', () => {
    expect(priceShowArtifact(input)).toEqual({
      kind: 'exact', bytes: 16, rawHeadroomBytes: 68_368,
      usableHeadroomBytes: 54_691, operatingBudgetBytes: 54_707,
      budgetRatio: 16 / 54_707,
    })
    expect(HISTORICAL_FIRMWARE_367_OBSERVATION_BYTES).toBe(68_384)
    expect(PROVISIONAL_SHOW_OPERATING_BUDGET_BYTES).toBe(54_707)
    expect(PROVISIONAL_SHOW_MARGIN_BYTES).toBe(13_677)
  })

  it.each([
    { context: null }, { measurement: null }, { sourceSha256: null },
    { context: { ...context, controllerId: 'controller-B' } },
    { context: { ...context, liveEpoch: 4 } },
    { sourceSha256: 'b'.repeat(64) },
    ...['', 'a'.repeat(63), 'g'.repeat(64), 'A'.repeat(64), `${sourceSha256}\n`].map((hash) => ({
      sourceSha256: hash, measurement: { ...measurement, sourceSha256: hash },
    })),
    ...[undefined, null, -1, 0, 7, 8.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]
      .map((byteLength) => ({ measurement: { ...measurement, byteLength: byteLength as number } })),
  ])('falls back without a usable current measurement: %j', (override) => {
    expect(priceShowArtifact({ ...input, ...override })).toMatchObject({
      kind: 'estimate', bytes: 123.5,
    })
  })

  it.each([8, 54_706, 54_707, 54_708, 68_383, 68_384, 68_385, 100_000])(
    'retains signed headroom and unclamped ratios at %i bytes', (bytes) => {
      for (const exact of [true, false]) {
        expect(priceShowArtifact({
          ...input, estimatedBytes: bytes,
          measurement: exact ? { ...measurement, byteLength: bytes } : null,
        })).toEqual({
          kind: exact ? 'exact' : 'estimate', bytes,
          rawHeadroomBytes: 68_384 - bytes, usableHeadroomBytes: 54_707 - bytes,
          operatingBudgetBytes: 54_707, budgetRatio: bytes / 54_707,
        })
      }
    },
  )

  it('hashes the complete UTF-8 compile input, including banner-only edits', async () => {
    expect(await sha256CompleteCompileInput('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    const source = '// banner α\nexport function render(i) {}'
    const hash = await sha256CompleteCompileInput(source)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(await sha256CompleteCompileInput(source.replace('α', 'β'))).not.toBe(hash)
    expect(await sha256CompleteCompileInput(`${source}\n// edit`)).not.toBe(hash)
  })
})
