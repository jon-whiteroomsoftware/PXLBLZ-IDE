// Schema coverage for the Show command registry: prove which editable leaf
// paths of the ShowRecord schema the registry's declared touch paths reach,
// and keep that a property that cannot rot. The walker enumerates every leaf
// path of the generated JSON schema (array wildcards as '*'), excludes
// identity and derived fields through the documented allowlist below, and
// classifies each remaining path against the registry's declared touches.
// Paths no specific command covers live in a reviewed snapshot; the gate
// fails naming the offending path when a new schema node arrives uncovered.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SHOW_COMMANDS } from './registry'

/**
 * Identity and derived fields the coverage walk excludes, with reasons.
 * These are not editable grammar: element identity is minted by commands,
 * bookkeeping is engine-owned, and derived subtrees are rebuilt by builders.
 */
export const COVERAGE_ALLOWLIST: Array<{ pattern: string; reason: string }> = [
  { pattern: '/id', reason: 'Record identity; minted at creation, never edited.' },
  { pattern: '/updatedAt', reason: 'Engine bookkeeping stamp.' },
  { pattern: '*/id', reason: 'Element identity (clips, tracks, keyframes, Effects, markers, …); minted by the commands.' },
  { pattern: '/composition/version', reason: 'Composition schema constant.' },
  { pattern: '/outputContract/version', reason: 'Contract schema constant.' },
  { pattern: '/outputContract/compatibility', reason: 'Derived by the contract builders.' },
  { pattern: '/composition/scenes/*/sceneId', reason: 'Scene ownership key of a composition row.' },
  { pattern: '/composition/scenes/*/zones/*/zoneId', reason: 'Zone ownership key of a composition row.' },
  { pattern: '/importMetadata', reason: 'Import provenance; recorded once, never edited.' },
]

type JsonSchema = Record<string, unknown>

export interface SchemaDocument {
  definitions: Record<string, JsonSchema>
}

export function loadShowRecordSchema(repoRoot: string): { root: JsonSchema; document: SchemaDocument } {
  const raw = readFileSync(join(repoRoot, 'schemas', 'show-record.schema.json'), 'utf8')
  const document = JSON.parse(raw) as SchemaDocument & { $ref: string }
  const rootName = document.$ref.replace('#/definitions/', '')
  return { root: document.definitions[rootName], document }
}

function deref(schema: JsonSchema, document: SchemaDocument): JsonSchema {
  const ref = schema.$ref as string | undefined
  if (!ref) return schema
  return document.definitions[ref.replace('#/definitions/', '')] ?? {}
}

/**
 * Enumerate leaf paths of a JSON schema as pointer patterns with '*' for
 * array items and free-form record keys. Union members (anyOf/oneOf)
 * contribute the union of their paths. Cycles terminate as a leaf at the
 * repeated ref.
 */
export function enumerateSchemaLeafPaths(
  schema: JsonSchema,
  document: SchemaDocument,
  prefix = '',
  seenRefs: readonly string[] = [],
): string[] {
  const ref = schema.$ref as string | undefined
  if (ref) {
    if (seenRefs.includes(ref)) return [prefix || '/']
    return enumerateSchemaLeafPaths(deref(schema, document), document, prefix, [...seenRefs, ref])
  }
  const anyOf = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined
  if (anyOf) {
    // A null member expresses optionality, not an editable leaf: without
    // this, `composition?: ShowCompositionV1 | null` would mint a phantom
    // '/composition' ancestor leaf beside its real children.
    const editable = anyOf.filter((member) => member.type !== 'null')
    if (editable.length === 0) return [prefix || '/']
    const paths = new Set<string>()
    for (const member of editable) {
      for (const path of enumerateSchemaLeafPaths(member, document, prefix, seenRefs)) paths.add(path)
    }
    return [...paths]
  }
  const type = schema.type as string | undefined
  if (type === 'object' || schema.properties || schema.additionalProperties) {
    const paths: string[] = []
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
    for (const [key, child] of Object.entries(properties)) {
      paths.push(...enumerateSchemaLeafPaths(child, document, `${prefix}/${key}`, seenRefs))
    }
    const additional = schema.additionalProperties
    if (additional && typeof additional === 'object') {
      paths.push(...enumerateSchemaLeafPaths(additional as JsonSchema, document, `${prefix}/*`, seenRefs))
    }
    if (paths.length === 0) return [prefix || '/']
    return paths
  }
  if (type === 'array' || schema.items) {
    const items = schema.items
    if (items && typeof items === 'object' && !Array.isArray(items)) {
      return enumerateSchemaLeafPaths(items as JsonSchema, document, `${prefix}/*`, seenRefs)
    }
    return [`${prefix}/*`]
  }
  return [prefix || '/']
}

// A declared pattern covers a schema path only when it generalizes it: the
// pattern may be shallower (it covers the subtree) and its '*' matches any
// path segment, but a literal pattern segment never matches a schema
// wildcard ('/transitions/0/kind' does not cover '/transitions/*/kind'),
// and a pattern deeper than the path covers nothing ('/name/value' does
// not cover '/name').
export function coverageMatches(schemaPath: string, declaredPattern: string): boolean {
  const pathSegments = schemaPath.split('/').slice(1)
  const patternSegments = declaredPattern.split('/').slice(1)
  if (patternSegments.length > pathSegments.length) return false
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index]
    if (patternSegment === '*') continue
    if (patternSegment !== pathSegments[index]) return false
  }
  return true
}

export function isAllowlisted(path: string): boolean {
  // A Pattern reference's id is authored content (it selects the referenced
  // Pattern and changes on replacement), not minted element identity; the
  // blanket id rule must not swallow it.
  if (path.endsWith('/pattern/id')) return false
  return COVERAGE_ALLOWLIST.some(({ pattern }) =>
    pattern.startsWith('*/')
      ? path.endsWith(pattern.slice(1))
      : coverageMatches(path, pattern) && path.split('/').length >= pattern.split('/').length,
  )
}

export interface ShowCommandCoverage {
  /** Every editable leaf path, sorted. */
  paths: string[]
  /** Paths some command declares at leaf depth (pattern as deep as the path), with the commands. */
  covered: Map<string, string[]>
  /** Paths reached only through shallower subtree declarations - rewrites that carry the leaf along. */
  subtreeOnly: string[]
  /** Paths nothing reaches. */
  unreachable: string[]
  /** Allowlisted identity/derived paths, excluded from the walk. */
  allowlisted: string[]
}

export function computeShowCommandCoverage(repoRoot: string): ShowCommandCoverage {
  const { root, document } = loadShowRecordSchema(repoRoot)
  const paths = [...new Set(enumerateSchemaLeafPaths(root, document))].sort()
  const covered = new Map<string, string[]>()
  const subtreeOnly: string[] = []
  const unreachable: string[] = []
  const allowlisted: string[] = []
  const depth = (pointer: string) => pointer.split('/').length
  for (const path of paths) {
    if (isAllowlisted(path)) {
      allowlisted.push(path)
      continue
    }
    // Leaf-declared: a declaration as deep as the path addresses this exact
    // leaf. A shallower declaration only proves a subtree rewrite can carry
    // the leaf along - it must not be credited as deliberate leaf coverage.
    const leafDeclared = SHOW_COMMANDS
      .filter((command) => command.touches.some((pattern) => (
        depth(pattern) === depth(path) && coverageMatches(path, pattern)
      )))
      .map((command) => command.name)
    if (leafDeclared.length > 0) {
      covered.set(path, leafDeclared)
      continue
    }
    const subtree = SHOW_COMMANDS.some((command) =>
      command.touches.some((pattern) => coverageMatches(path, pattern)))
    if (subtree) subtreeOnly.push(path)
    else unreachable.push(path)
  }
  return { paths, covered, subtreeOnly, unreachable, allowlisted }
}

/**
 * The reviewed snapshot pins the complete classification - every editable
 * path with its tier - so a new schema node can never enter any tier
 * without the snapshot diff being reviewed, including a node a broad
 * subtree pattern happens to reach.
 */
export function coverageSnapshot(coverage: ShowCommandCoverage): {
  leafDeclared: string[]
  subtreeOnly: string[]
  unreachable: string[]
  allowlisted: string[]
} {
  return {
    leafDeclared: [...coverage.covered.keys()],
    subtreeOnly: coverage.subtreeOnly,
    unreachable: coverage.unreachable,
    // Pinned too: a new field a blanket allowlist rule swallows must still
    // fail by name until its classification is reviewed.
    allowlisted: coverage.allowlisted,
  }
}

/** The checked-in, human-readable report. Regenerate with npm run coverage:show-commands. */
export function renderShowCommandCoverageReport(coverage: ShowCommandCoverage): string {
  const total = coverage.covered.size + coverage.subtreeOnly.length + coverage.unreachable.length
  const lines: string[] = [
    '# Show command coverage',
    '',
    '<!-- Generated by scripts/show-command-coverage.ts; do not edit by hand. -->',
    '',
    `Editable leaf paths of the ShowRecord schema: **${total}** ` +
      `(${coverage.covered.size} leaf-declared, ${coverage.subtreeOnly.length} reachable only through ` +
      `shallower subtree declarations, ${coverage.unreachable.length} unreachable by any command, ` +
      `${coverage.allowlisted.length} identity/derived paths excluded by the allowlist).`,
    '',
    'A path is **leaf-declared** when a command declares a touch pattern exactly as deep as the path:',
    'the command addresses that leaf deliberately, and the faithfulness test keeps the declaration exact',
    'against real writes. **Subtree-only** paths are reached solely through shallower declarations —',
    'rewrites (structural edits, placement-list or Effect-stack rebuilds) that carry the leaf along',
    'without any command addressing it by name. **Unreachable** paths have no command at all; they stand',
    'in the snapshot as reviewed gaps until a command covers them. The reviewed snapshot',
    '(src/test/showCommandCoverage.snapshot.json) pins the complete classification, so any new schema',
    'node — whatever tier it would land in — fails the suite by name until the snapshot is regenerated',
    'and the diff reviewed.',
    '',
    '## Allowlisted identity and derived fields',
    '',
    '| Pattern | Reason |',
    '| --- | --- |',
    ...COVERAGE_ALLOWLIST.map(({ pattern, reason }) => `| \`${pattern}\` | ${reason} |`),
    '',
    '## Unreachable paths (reviewed gaps)',
    '',
    ...(coverage.unreachable.length > 0
      ? coverage.unreachable.map((path) => `- \`${path}\``)
      : ['(none)']),
    '',
    '## Subtree-only paths (reviewed snapshot)',
    '',
    ...coverage.subtreeOnly.map((path) => `- \`${path}\``),
    '',
    '## Leaf-declared paths',
    '',
    '| Path | Commands |',
    '| --- | --- |',
    ...[...coverage.covered.entries()].map(([path, commands]) => `| \`${path}\` | ${commands.join(', ')} |`),
    '',
  ]
  return lines.join('\n')
}
