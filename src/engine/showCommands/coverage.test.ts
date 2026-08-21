import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  COVERAGE_ALLOWLIST,
  computeShowCommandCoverage,
  coverageMatches,
  enumerateSchemaLeafPaths,
  isAllowlisted,
  loadShowRecordSchema,
  renderShowCommandCoverageReport,
  coverageSnapshot,
  type SchemaDocument,
} from './coverage'

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)))

describe('schema walker units (#887)', () => {
  const document: SchemaDocument = { definitions: {} }

  it('enumerates object properties as leaf paths', () => {
    const paths = enumerateSchemaLeafPaths({
      type: 'object',
      properties: {
        name: { type: 'string' },
        nested: { type: 'object', properties: { level: { type: 'number' } } },
      },
    }, document)
    expect(paths.sort()).toEqual(['/name', '/nested/level'])
  })

  it('wildcards array items and free-form record keys', () => {
    const paths = enumerateSchemaLeafPaths({
      type: 'object',
      properties: {
        list: { type: 'array', items: { type: 'object', properties: { value: { type: 'number' } } } },
        map: { type: 'object', additionalProperties: { type: 'number' } },
      },
    }, document)
    expect(paths.sort()).toEqual(['/list/*/value', '/map/*'])
  })

  it('unions contribute the union of member paths', () => {
    const paths = enumerateSchemaLeafPaths({
      anyOf: [
        { type: 'object', properties: { a: { type: 'number' } } },
        { type: 'object', properties: { b: { type: 'number' } } },
      ],
    }, document)
    expect(paths.sort()).toEqual(['/a', '/b'])
  })

  it('terminates ref cycles as a leaf at the repeated ref', () => {
    const cyclic: SchemaDocument = {
      definitions: {
        Node: {
          type: 'object',
          properties: {
            value: { type: 'number' },
            next: { $ref: '#/definitions/Node' },
          },
        },
      },
    }
    const paths = enumerateSchemaLeafPaths({ $ref: '#/definitions/Node' }, cyclic)
    expect(paths.sort()).toEqual(['/next', '/value'])
  })

  it('covers only when the declaration generalizes the path', () => {
    expect(coverageMatches('/a/0/b', '/a/*/b')).toBe(true)
    expect(coverageMatches('/a/*/b', '/a')).toBe(true)
    expect(coverageMatches('/a/*/b', '/a/*/c')).toBe(false)
    expect(coverageMatches('/transitions/*/kind', '/transitions/*')).toBe(true)
    // A narrower or element-specific declaration covers nothing broader.
    expect(coverageMatches('/name', '/name/value')).toBe(false)
    expect(coverageMatches('/transitions/*/kind', '/transitions/0/kind')).toBe(false)
  })

  it('allowlists element ids anywhere and exact prefixes with reasons', () => {
    expect(isAllowlisted('/composition/scenes/*/propertyTracks/*/id')).toBe(true)
    expect(isAllowlisted('/updatedAt')).toBe(true)
    expect(isAllowlisted('/importMetadata/appVersion')).toBe(true)
    expect(isAllowlisted('/name')).toBe(false)
    // Pattern references are authored content, not minted identity.
    expect(isAllowlisted('/cells/*/pattern/id')).toBe(false)
    expect(isAllowlisted('/composition/patternInstances/*/pattern/id')).toBe(false)
    for (const entry of COVERAGE_ALLOWLIST) {
      expect(entry.reason.length).toBeGreaterThan(10)
    }
  })
})

describe('schema coverage gate (#887)', () => {
  it('the schema artifact matches the ShowRecord types (drift gate)', () => {
    const regenerated = execFileSync(
      process.execPath,
      ['--input-type=module', '-e',
        'import { renderShowRecordSchema } from "./scripts/show-record-schema.mjs"; process.stdout.write(renderShowRecordSchema())'],
      { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
    const committed = readFileSync(join(repoRoot, 'schemas', 'show-record.schema.json'), 'utf8')
    expect(regenerated).toBe(committed)
  })

  it('the complete classification matches the reviewed snapshot; none are unreachable', () => {
    const coverage = computeShowCommandCoverage(repoRoot)
    const snapshot = JSON.parse(readFileSync(
      join(repoRoot, 'src', 'test', 'showCommandCoverage.snapshot.json'),
      'utf8',
    )) as { specific: string[]; structuralOnly: string[]; unreachable: string[]; allowlisted: string[] }

    // The snapshot pins every path's tier: a new schema node fails here by
    // name whatever tier it would land in - a broad subtree pattern
    // reaching it does not exempt it from review, and a genuinely
    // unreachable path stands in the snapshot as a reviewed gap until a
    // command covers it. Regenerate deliberately with npm run
    // coverage:show-commands and review the diff.
    const current = coverageSnapshot(coverage)
    for (const tier of ['specific', 'structuralOnly', 'unreachable', 'allowlisted'] as const) {
      const pinned = new Set(snapshot[tier])
      const arrived = current[tier].filter((path) => !pinned.has(path))
      expect(arrived, `new ${tier} paths; regenerate and review the snapshot`).toEqual([])
      const live = new Set(current[tier])
      const stale = snapshot[tier].filter((path) => !live.has(path))
      expect(stale, `stale ${tier} snapshot entries; regenerate the snapshot`).toEqual([])
    }
  })

  it('the checked-in coverage report is reproducible', () => {
    const coverage = computeShowCommandCoverage(repoRoot)
    const committed = readFileSync(
      join(repoRoot, 'docs', 'reference', 'show-command-coverage.md'),
      'utf8',
    )
    expect(renderShowCommandCoverageReport(coverage)).toBe(committed)
  })

  it('walks the real schema to a stable shape', () => {
    const { root, document } = loadShowRecordSchema(repoRoot)
    const paths = enumerateSchemaLeafPaths(root, document)
    expect(paths.length).toBeGreaterThan(500)
    expect(paths).toContain('/name')
    expect(paths.some((path) => path.startsWith('/composition/scenes/*/zones'))).toBe(true)
    const snapshot = coverageSnapshot(computeShowCommandCoverage(repoRoot))
    expect(snapshot.specific.length).toBeGreaterThan(200)
    // Transition easing and propertyTransitions have no deliberate command
    // today; structural rewrites still reach them, so they sit in the
    // structural-only tier rather than unreachable.
    expect(snapshot.structuralOnly.some((path) => path.startsWith('/transitions/*/easing'))).toBe(true)
  })
})
