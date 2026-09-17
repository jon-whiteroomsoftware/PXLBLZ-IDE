// Provenance: pxlblz-v3 test/grammarCoverage.test.ts at 9ecd481f, re-authored
// onto the version-2 record and catalogue for #1039 (see PROVENANCE.md).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  coverageMatches,
  STRUCTURAL_DECLARATIONS,
  enumerateSchemaLeafPaths,
  generateCoverageReport,
  renderCoverageReport,
} from '../grammar/coverage.js'
import { SHOW_COMMANDS_V2 } from '@/engine/showCommandsV2/registry'
import { createSessionStore } from '../grammar/session.js'
import { grammarFixtureShow } from './support/grammarFixture.js'
import { applyRefused, fixture } from './support/grammarHarness.js'
import genericOnlySnapshot from './fixtures/grammar-generic-only.json'

// Test model (issue #22, re-authored for #1039). Boundaries: the schema walker
// on hand-written schemas; the coverage report over the real v2 record schema
// and the catalogue's declared touch paths (no unreachable declared path; the
// generic-only list is a reviewed snapshot); the generic operations' validation
// and refusal behavior; and the session's generic-use log. Arbitrary paths are
// outside this report. The committed report artifact must reproduce exactly
// from the schema and registry.

describe('schema walker (#22)', () => {
  const document = { $defs: {} as Record<string, Record<string, unknown>> }

  it('enumerates nested objects, arrays, and record keys with wildcards', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { value: { type: 'number' } },
          },
        },
        lookup: { type: 'object', additionalProperties: { type: 'number' } },
      },
    }
    expect(enumerateSchemaLeafPaths(schema, document).sort()).toEqual([
      '/items/*/value',
      '/lookup/*',
      '/name',
    ])
  })

  it('unions anyOf members and resolves refs with cycle termination', () => {
    const cyclic = {
      $defs: {
        Node: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            child: { $ref: '#/$defs/Node' },
          },
        },
        Union: {
          anyOf: [
            { type: 'object', properties: { kind: { const: 'a' }, a: { type: 'number' } } },
            { type: 'object', properties: { kind: { const: 'b' }, b: { type: 'number' } } },
          ],
        },
      },
    }
    const union = enumerateSchemaLeafPaths({ $ref: '#/$defs/Union' }, cyclic).sort()
    expect(union).toEqual(['/a', '/b', '/kind'])
    const node = enumerateSchemaLeafPaths({ $ref: '#/$defs/Node' }, cyclic).sort()
    // The cycle terminates as a leaf at the repeated ref.
    expect(node).toEqual(['/child', '/label'])
  })

  it('matches paths and patterns with wildcards on either side, prefix in either direction', () => {
    expect(coverageMatches('/composition/clips/*/appearance/keys/*/value/opacity',
      '/composition/clips/*/appearance/keys/*')).toBe(true)
    expect(coverageMatches('/composition/clips/*/durationMs', '/composition/clips/*/durationMs')).toBe(true)
    expect(coverageMatches('/composition/clips/*/startMs', '/composition/clips/*/durationMs')).toBe(false)
    expect(coverageMatches('/composition/transitions/*', '/composition/transitions/*/durationMs')).toBe(true)
  })
})

describe('coverage over the real schema and registry (#22)', () => {
  const report = generateCoverageReport()

  it('leaves no path unreachable, naming offenders if any appear', () => {
    expect(report.unreachable).toEqual([])
  })

  it('keeps every structural cascade declaration anchored to a command that declares that touch', () => {
    // A structural declaration suppresses a blanket touch so a family with no
    // authoring command of its own cannot read as complete. It rots silently in
    // exactly one way: the named command loses that touch (or the command goes
    // away) and the declaration stops suppressing anything, so a stale entry is
    // a defect even though the report still renders.
    for (const declaration of STRUCTURAL_DECLARATIONS) {
      const command = SHOW_COMMANDS_V2.find((candidate) => candidate.name === declaration.operation)
      expect(command, `structural declaration names unknown command ${declaration.operation}`).toBeDefined()
      expect(command!.touches, `${declaration.operation} no longer touches ${declaration.pattern}`)
        .toContain(declaration.pattern)
    }
  })

  it('keeps the generic-only list as a reviewed snapshot', () => {
    // A schema node gaining no covering operation lands here first: update
    // test/fixtures/grammar-generic-only.json deliberately via
    // `npm run -s agent:coverage` after reviewing the gap.
    expect(report.genericOnly).toEqual(genericOnlySnapshot)
  })

  it('records the known v2 gap: Group definition internals, plus two whole-composition fields', () => {
    const families = Object.fromEntries(report.families.map((family) => [family.family, family]))
    // Decision D2: the catalogue authors Group *occurrences*; a definition's
    // internals are edited by materializing an occurrence, so the definition
    // subtree is the one genuine authoring gap.
    expect(families['groups'].specific).toBe(12)
    expect(families['groups'].specific).toBeLessThan(families['groups'].total)
    for (const path of report.genericOnly) {
      expect(
        path.startsWith('/composition/groupDefinitions/')
          || path === '/composition/executionModel'
          || path === '/composition/sampleRemap/repeatScale',
        `unreviewed generic-only path ${path}`,
      ).toBe(true)
    }
    for (const family of ['animation', 'clips', 'effects', 'layers', 'layouts', 'markers', 'transitions']) {
      expect(families[family].percent, `${family} is no longer completely covered`).toBe(100)
    }
  })

  it('reports no retired version-1 shape: no Scene, cell, routing-layout or flat-model path survives', () => {
    for (const row of report.rows) {
      for (const retired of ['/scenes/', '/cells/', '/routingLayouts/', '/flat']) {
        expect(row.path.startsWith(retired), `retired v1 path ${row.path} still in the report`).toBe(false)
      }
    }
    expect(report.families.map((family) => family.family)).not.toContain('flat model (legacy)')
  })

  it('reproduces the committed report artifact from schema and registry alone', () => {
    const committed = readFileSync(
      fileURLToPath(new URL('../reference/show-grammar-coverage.md', import.meta.url)),
      'utf8',
    )
    expect(committed).toBe(renderCoverageReport(report))
  })
})

describe('generic operations (#22)', () => {
  it('set_field refuses schema-invalid and protected results, leaving the document unchanged', () => {
    const document = fixture()
    const issues = applyRefused(
      document,
      'set_field',
      { pointer: '/composition/clips/0/durationMs', value: 'not a number' },
      'result-invalid',
    )
    expect(issues[0].message).toContain('schema')
    applyRefused(document, 'set_field', { pointer: '/updatedAt', value: 1 }, 'invalid-argument')
    applyRefused(document, 'set_field', { pointer: '/composition/clips/9/durationMs', value: 1 }, 'invalid-argument')
    applyRefused(document, 'set_field', { pointer: 'no-slash', value: 1 }, 'invalid-argument')
  })

  it('apply_patch refuses tier-0-invalid results atomically', () => {
    const document = fixture()
    const issues = applyRefused(
      document,
      'apply_patch',
      {
        patch: [
          { op: 'replace', path: '/composition/patternInstances/0/pattern/id', value: 'NoSuchStockPattern' },
        ],
      },
      'result-invalid',
    )
    expect(issues[0].message).toContain('unknown-stock-pattern')

    const failedTest = applyRefused(
      document,
      'apply_patch',
      {
        patch: [
          { op: 'test', path: '/name', value: 'Wrong name' },
          { op: 'replace', path: '/name', value: 'Never applied' },
        ],
      },
      'invalid-argument',
    )
    expect(failedTest[0].message).toContain('test failed')
  })

  it('logs generic use on the session with pointers and transaction labels', () => {
    const store = createSessionStore()
    const opened = store.open(grammarFixtureShow())
    if (!opened.ok) throw new Error('open failed')
    const sessionId = opened.sessionId

    expect(store.apply(sessionId, 'set_field', { pointer: '/name', value: 'Logged' }).ok).toBe(true)
    expect(store.begin(sessionId, 'trails txn').ok).toBe(true)
    expect(store.apply(sessionId, 'apply_patch', {
      patch: [{ op: 'add', path: '/outputEffects', value: [{ id: 'trails-1', kind: 'trails', retention: 0.5 }] }],
    }).ok).toBe(true)
    expect(store.commit(sessionId).ok).toBe(true)

    const log = store.genericUse(sessionId)
    if (!log.ok) throw new Error('genericUse failed')
    expect(log.uses).toEqual([
      { operation: 'set_field', pointers: ['/name'], transaction: null },
      { operation: 'apply_patch', pointers: ['/outputEffects'], transaction: 'trails txn' },
    ])

    // Specific operations do not log.
    const clipId = opened.listing.clips[0].clipId
    expect(store.apply(sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 12_000 }).ok).toBe(true)
    const after = store.genericUse(sessionId)
    if (!after.ok) throw new Error('genericUse failed')
    expect(after.uses).toHaveLength(2)
  })
})
