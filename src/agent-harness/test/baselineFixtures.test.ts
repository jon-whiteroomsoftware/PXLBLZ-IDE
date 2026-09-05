// The baseline fixture set (#945): finite, feature-complete for the issue's
// named coverage, and pinned by record hash in the committed evidence so a
// changed fixture cannot silently invalidate an earlier comparison.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stockShowById } from '@/pixelblaze/stock/shows'
import { showLoopDurationMs } from '@/engine/showModel'
import { BASELINE_FIXTURES, resolveBaselineFixtureRecord, type BaselineFixtureFeature } from '../baseline/fixtures.js'
import { canonicalJson, evidenceDifferences, recordSha256, type BaselineFixtureEvidence } from '../baseline/evidence.js'
import { openShowDocument } from '../grammar/openShow.js'

const here = dirname(fileURLToPath(import.meta.url))
const evidencePath = join(here, '..', 'baseline', 'evidence', 'fixtures.json')

const REQUIRED: BaselineFixtureFeature[] = [
  'personal-show', 'personal-pattern', 'personal-library', 'stock-draft', 'groups', 'animation', 'routing', 'long-timeline',
]

describe('baseline fixtures', () => {
  it('covers every feature the issue names, with unique ids', () => {
    const covered = new Set(BASELINE_FIXTURES.flatMap((fixture) => fixture.features))
    for (const feature of REQUIRED) expect(covered.has(feature), feature).toBe(true)
    expect(new Set(BASELINE_FIXTURES.map((fixture) => fixture.id)).size).toBe(BASELINE_FIXTURES.length)
  })

  it('resolves every record and carries the feature it claims', () => {
    for (const fixture of BASELINE_FIXTURES) {
      const record = resolveBaselineFixtureRecord(fixture, (id) => stockShowById(id)?.show)
      expect(record.id, fixture.id).toBeTruthy()
      const composition = record.composition
      if (fixture.features.includes('groups')) expect(composition?.groupDefinitions?.length ?? 0).toBeGreaterThan(0)
      if (fixture.features.includes('animation')) {
        expect(composition?.scenes.some((scene) => (scene.propertyTracks?.length ?? 0) > 0)).toBe(true)
      }
      if (fixture.features.includes('routing')) expect(record.routingLayouts.length).toBeGreaterThan(1)
      if (fixture.features.includes('long-timeline')) expect(showLoopDurationMs(record)).toBeGreaterThanOrEqual(300_000)
      if (fixture.features.includes('personal-pattern')) {
        const referenced = record.cells.some((cell) => cell.pattern.kind === 'user')
        expect(referenced).toBe(true)
        expect(fixture.patterns?.length ?? 0).toBeGreaterThan(0)
      }
      if (fixture.features.includes('personal-library')) {
        const namespace = fixture.libraries?.[0]?.name
        expect(namespace).toBeTruthy()
        expect(fixture.patterns?.some((pattern) => pattern.src.includes(`${namespace}.`))).toBe(true)
      }
    }
  })

  it('records, in the committed evidence, which fixtures the grammar opens in editing-session mode', () => {
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as BaselineFixtureEvidence
    for (const fixture of BASELINE_FIXTURES) {
      const record = resolveBaselineFixtureRecord(fixture, (id) => stockShowById(id)?.show)
      const opened = openShowDocument(record, [], { allowUnresolvedUserPatterns: true })
      const entry = evidence.fixtures.find((item) => item.id === fixture.id)
      expect(entry, fixture.id).toBeDefined()
      // An open refusal is a baseline finding, recorded verbatim, never repaired here.
      expect(entry!.bridge.opened, `${fixture.id}: opened=${opened.ok}`).toBe(opened.ok)
      // A refused operation on an opened fixture is recorded by name and message, not hidden.
      if (opened.ok && !entry!.bridge.changed) expect(entry!.bridge.refusals.length, fixture.id).toBeGreaterThan(0)
    }
  })

  it('pins each fixture record by hash in the committed evidence', () => {
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as BaselineFixtureEvidence
    const actual = BASELINE_FIXTURES.map((fixture) => ({
      id: fixture.id,
      recordSha256: recordSha256(resolveBaselineFixtureRecord(fixture, (id) => stockShowById(id)?.show)),
    }))
    const expected = evidence.fixtures.map((fixture) => ({ id: fixture.id, recordSha256: fixture.recordSha256 }))
    expect(evidenceDifferences(expected, actual)).toEqual([])
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe('{"a":[{"c":2,"d":1}],"b":1}')
  })
})
