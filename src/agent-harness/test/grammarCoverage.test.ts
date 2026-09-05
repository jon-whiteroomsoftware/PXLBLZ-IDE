// Provenance: pxlblz-v3 test/grammarCoverage.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  coverageMatches,
  enumerateSchemaLeafPaths,
  generateCoverageReport,
  renderCoverageReport,
} from '../grammar/coverage.js'
import { createSessionStore } from '../grammar/session.js'
import { grammarFixtureShow } from './support/grammarFixture.js'
import { applyRefused, fixture } from './support/grammarHarness.js'
import genericOnlySnapshot from './fixtures/grammar-generic-only.json'

// Test model (issue #22). Boundaries: the schema walker on hand-written
// schemas; the coverage report over the real schema and registry (no
// unreachable path; the generic-only list is a reviewed snapshot); the
// generic operations' validation and refusal behavior; and the session's
// generic-use log. The committed report artifact must reproduce exactly from
// the schema and registry.

describe('schema walker (#22)', () => {
  const document = { definitions: {} as Record<string, Record<string, unknown>> }

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
      definitions: {
        Node: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            child: { $ref: '#/definitions/Node' },
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
    const union = enumerateSchemaLeafPaths({ $ref: '#/definitions/Union' }, cyclic).sort()
    expect(union).toEqual(['/a', '/b', '/kind'])
    const node = enumerateSchemaLeafPaths({ $ref: '#/definitions/Node' }, cyclic).sort()
    // The cycle terminates as a leaf at the repeated ref.
    expect(node).toEqual(['/child', '/label'])
  })

  it('matches paths and patterns with wildcards on either side, prefix in either direction', () => {
    expect(coverageMatches('/composition/scenes/*/zones/*/main/*/durationMs',
      '/composition/scenes/*/zones/*/main/*')).toBe(true)
    expect(coverageMatches('/scenes/*/durationMs', '/scenes/*/durationMs')).toBe(true)
    expect(coverageMatches('/scenes/*/name', '/scenes/*/durationMs')).toBe(false)
    expect(coverageMatches('/transitions/*', '/transitions/*/durationMs')).toBe(true)
  })
})

describe('coverage over the real schema and registry (#22)', () => {
  const report = generateCoverageReport()

  it('leaves no path unreachable, naming offenders if any appear', () => {
    expect(report.unreachable).toEqual([])
  })

  it('keeps the generic-only list as a reviewed snapshot', () => {
    // A schema node gaining no covering operation lands here first: update
    // test/fixtures/grammar-generic-only.json deliberately via
    // `npm run -s coverage:grammar` after reviewing the gap.
    expect(report.genericOnly).toEqual(genericOnlySnapshot)
  })

  it('records the known gaps: groups and the flat model; Trails is covered (#27)', () => {
    const families = Object.fromEntries(report.families.map((family) => [family.family, family]))
    expect(families['groups'].specific).toBe(0)
    expect(families['output effects'].percent).toBe(100)
    expect(report.genericOnly).not.toContain('/outputEffects/*/retention')
    expect(families['junctions'].percent).toBe(100)
    expect(families['property animation'].percent).toBe(100)
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
      { pointer: '/scenes/0/durationMs', value: 'not a number' },
      'result-invalid',
    )
    expect(issues[0].message).toContain('schema')
    applyRefused(document, 'set_field', { pointer: '/updatedAt', value: 1 }, 'invalid-argument')
    applyRefused(document, 'set_field', { pointer: '/scenes/9/durationMs', value: 1 }, 'invalid-argument')
    applyRefused(document, 'set_field', { pointer: 'no-slash', value: 1 }, 'invalid-argument')
  })

  it('apply_patch refuses tier-0-invalid results atomically', () => {
    const document = fixture()
    const issues = applyRefused(
      document,
      'apply_patch',
      {
        patch: [
          { op: 'replace', path: '/cells/0/pattern/id', value: 'NoSuchStockPattern' },
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
