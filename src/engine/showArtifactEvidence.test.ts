import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  HISTORICAL_FIRMWARE_367_OBSERVATION_BYTES,
  PROVISIONAL_SHOW_MARGIN_BYTES,
  PROVISIONAL_SHOW_OPERATING_BUDGET_BYTES,
  priceShowArtifact,
  sha256CompleteCompileInput,
} from './showArtifactPricing'

const evidence = JSON.parse(readFileSync(
  new URL('../../docs/reference/evidence/issue-1215-bytecode-measurement.json', import.meta.url),
  'utf8',
)) as {
  count: number
  gate1: { compiler: { sha256: string } }
  refresh: { compilerSha256: string }
  rows: Array<{ id: string; name: string; sourceSha256: string; blobBytes: number; headroomBytes: number }>
}

// This context exercises pricing only; it is not evidence of a live Controller epoch.
const context = { controllerId: 'committed-issue-1215', liveEpoch: 0 }
function priceRecorded(row: typeof evidence.rows[number]) {
  return priceShowArtifact({
    estimatedBytes: 1,
    sourceSha256: row.sourceSha256,
    context,
    measurement: { ...context, sourceSha256: row.sourceSha256, byteLength: row.blobBytes },
  })
}

describe('Show artifact evidence', () => {
  it('qualifies all 45 committed bytecode blobs against the provisional operating budget', () => {
    expect(evidence.count).toBe(45)
    expect(evidence.rows).toHaveLength(45)
    expect(new Set(evidence.rows.map((row) => row.id)).size).toBe(45)
    expect(evidence.gate1.compiler.sha256).toBe('73a3718052127814302cd14ad3af73217b0dea0bc150da7ae85eaad550261d9b')
    expect(evidence.refresh.compilerSha256).toBe(evidence.gate1.compiler.sha256)
    expect(HISTORICAL_FIRMWARE_367_OBSERVATION_BYTES).toBe(68_384)
    expect(PROVISIONAL_SHOW_OPERATING_BUDGET_BYTES).toBe(54_707)
    expect(PROVISIONAL_SHOW_MARGIN_BYTES).toBe(13_677)
    for (const row of evidence.rows) {
      expect(row.sourceSha256).toMatch(/^[a-f0-9]{64}$/)
      expect(Number.isFinite(row.blobBytes)).toBe(true)
      expect(Number.isInteger(row.blobBytes)).toBe(true)
      expect(row.blobBytes).toBeGreaterThan(0)
      expect(row.blobBytes).toBeLessThanOrEqual(54_707)
      const price = priceRecorded(row)
      expect(price.kind).toBe('exact')
      expect(price.bytes).toBe(row.blobBytes)
      expect(price.usableHeadroomBytes).toBeGreaterThanOrEqual(0)
      expect(price.rawHeadroomBytes).toBe(row.headroomBytes)
    }
  })

  it('preserves the four named measured headrooms', () => {
    const expected = [
      ['stock-show-remix-quadrille', 38_122, 30_262, 16_585],
      ['stock-show-installation-cloudburst', 38_331, 30_053, 16_376],
      ['stock-show-reference-property-animation', 34_682, 33_702, 20_025],
      ['stock-show-showcase-luma-sources', 31_178, 37_206, 23_529],
    ] as const
    for (const [id, bytes, rawHeadroomBytes, usableHeadroomBytes] of expected) {
      const row = evidence.rows.find((candidate) => candidate.id === id)
      expect(row, id).toBeDefined()
      expect(priceRecorded(row!)).toMatchObject({ bytes, rawHeadroomBytes, usableHeadroomBytes })
    }
  })

  it('reports changed complete-source hashes without rejecting current stock', async () => {
    const { reportShowArtifactSourceStaleness } = await import('./showArtifactEvidence')
    const source = '// banner α\nexport function render(i) {}'
    const originalHash = await sha256CompleteCompileInput(source)
    const bannerHash = await sha256CompleteCompileInput(source.replace('α', 'β'))
    expect(bannerHash).not.toBe(originalHash)
    const recorded = Object.freeze([
      Object.freeze({ id: 'matching', name: 'Old matching', sourceSha256: 'a'.repeat(64) }),
      Object.freeze({ id: 'drift', name: 'Old drift', sourceSha256: 'b'.repeat(64) }),
      Object.freeze({ id: 'banner', name: 'Old banner', sourceSha256: originalHash }),
    ])
    const current = Object.freeze([
      Object.freeze({ id: 'banner', name: 'Current banner', sourceSha256: bannerHash }),
      Object.freeze({ id: 'matching', name: 'Current matching', sourceSha256: 'a'.repeat(64) }),
      Object.freeze({ id: 'drift', name: 'Current drift', sourceSha256: 'c'.repeat(64) }),
    ])
    const before = JSON.stringify({ recorded, current })
    expect(reportShowArtifactSourceStaleness(recorded, current)).toEqual({
      recordedCount: 3, currentCount: 3, matchingCount: 1,
      stale: [
        { id: 'banner', name: 'Current banner', evidenceSourceSha256: originalHash, currentSourceSha256: bannerHash },
        { id: 'drift', name: 'Current drift', evidenceSourceSha256: 'b'.repeat(64), currentSourceSha256: 'c'.repeat(64) },
      ],
      unmeasured: [],
    })
    expect(JSON.stringify({ recorded, current })).toBe(before)
  })

  it('reports unmeasured current Shows and ignores retired evidence', async () => {
    const { reportShowArtifactSourceStaleness } = await import('./showArtifactEvidence')
    const matching = Object.freeze({ id: 'matching', name: 'Matching', sourceSha256: 'a'.repeat(64) })
    const retired = Object.freeze({ id: 'retired', name: 'Retired', sourceSha256: 'b'.repeat(64) })
    const added = Object.freeze({ id: 'added', name: 'Added', sourceSha256: 'c'.repeat(64) })
    const recorded = Object.freeze([retired, matching])
    const current = Object.freeze([matching, added])
    expect(reportShowArtifactSourceStaleness(recorded, current)).toEqual({
      recordedCount: 2, currentCount: 2, matchingCount: 1, stale: [], unmeasured: [added],
    })
    expect(recorded).toEqual([retired, matching])
    expect(current).toEqual([matching, added])
  })
})
