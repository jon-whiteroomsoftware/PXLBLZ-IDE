// Provenance: pxlblz-v3 src/grammar/coverage.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Schema coverage (#22): prove the tool surface is complete over the
// ShowRecord grammar, and keep completeness a property that cannot rot. The
// walker enumerates every editable leaf path of the generated JSON schema
// (array wildcards as '*'), excludes identity and derived fields through the
// documented allowlist below, and classifies each path against the
// registry's declared touch paths. The generic operations (set_field /
// apply_patch) cover everything else by construction; a path is unreachable
// only if the generics are barred from it too, and the coverage test asserts
// there are none.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SHOW_GRAMMAR_OPERATIONS } from './registry.js'
import { GENERIC_OPERATION_NAMES, PROTECTED_POINTER_PATTERNS } from './operations/generic.js'

const schemaPath = fileURLToPath(new URL('../../../schemas/show-record.schema.json', import.meta.url))

/**
 * Identity and derived fields the coverage walk excludes, with reasons.
 * These are not editable grammar: element identity is minted by operations,
 * bookkeeping is engine-owned, and derived subtrees are rebuilt by builders.
 */
export const COVERAGE_ALLOWLIST: Array<{ pattern: string; reason: string }> = [
  { pattern: '/id', reason: 'Record identity; minted at creation, never edited.' },
  { pattern: '/updatedAt', reason: 'Engine bookkeeping stamp.' },
  { pattern: '*/id', reason: 'Element identity (clips, tracks, keyframes, Effects, markers, …); minted by the operations.' },
  { pattern: '/composition/version', reason: 'Composition schema constant.' },
  { pattern: '/outputContract/version', reason: 'Contract schema constant.' },
  { pattern: '/outputContract/compatibility', reason: 'Derived by the contract builders.' },
  { pattern: '/importMetadata', reason: 'Import provenance; recorded once, never edited.' },
  { pattern: '/composition/scenes/*/sceneId', reason: 'Scene ownership key of a composition row.' },
  { pattern: '/composition/scenes/*/zones/*/zoneId', reason: 'Zone ownership key of a composition row.' },
]

type JsonSchema = Record<string, unknown>

interface SchemaDocument {
  definitions: Record<string, JsonSchema>
}

function loadSchema(): { root: JsonSchema; document: SchemaDocument } {
  const document = JSON.parse(readFileSync(schemaPath, 'utf8')) as SchemaDocument & { $ref: string }
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
 * array items and free-form record keys. Union members (anyOf) contribute
 * the union of their paths. Cycles terminate as a leaf at the repeated ref.
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
    const paths = new Set<string>()
    for (const member of anyOf) {
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

/** Segment-wise match where '*' on either side matches, prefix in either direction. */
export function coverageMatches(schemaPath: string, declaredPattern: string): boolean {
  const pathSegments = schemaPath.split('/').slice(1)
  const patternSegments = declaredPattern.split('/').slice(1)
  const shared = Math.min(pathSegments.length, patternSegments.length)
  for (let index = 0; index < shared; index += 1) {
    const a = pathSegments[index]
    const b = patternSegments[index]
    if (a !== '*' && b !== '*' && a !== b) return false
  }
  return true
}

export function isAllowlisted(path: string): boolean {
  return COVERAGE_ALLOWLIST.some(({ pattern }) =>
    pattern.startsWith('*/')
      ? path.endsWith(pattern.slice(1))
      : coverageMatches(path, pattern) && path.split('/').length >= pattern.split('/').length,
  )
}

/**
 * Declarations that mark a structural rewrite rather than purposeful
 * editability: insert_time shifts everything after a point and the layout
 * interval operations manufacture internal Scenes, so their blanket touch
 * paths are true for the faithfulness test but must not classify every path
 * beneath them as specifically covered — the group family, for one, has no
 * operations and must read as a gap.
 */
export const STRUCTURAL_DECLARATIONS: Array<{ operation: string; pattern: string }> = [
  { operation: 'insert_time', pattern: '/composition' },
  { operation: 'add_layout_interval', pattern: '/composition' },
  { operation: 'add_layout_interval', pattern: '/scenes' },
  { operation: 'add_layout_interval', pattern: '/transitions' },
  { operation: 'duplicate_layout_interval', pattern: '/composition' },
  { operation: 'duplicate_layout_interval', pattern: '/scenes' },
  { operation: 'duplicate_layout_interval', pattern: '/transitions' },
]

function isStructuralDeclaration(operation: string, pattern: string): boolean {
  return STRUCTURAL_DECLARATIONS.some(
    (entry) => entry.operation === operation && entry.pattern === pattern,
  )
}

export type CoverageClassification = 'specific' | 'generic-only' | 'unreachable'

export interface CoverageRow {
  path: string
  classification: CoverageClassification
  /** Specific operations whose declared touch paths cover it. */
  operations: string[]
}

export interface CoverageReport {
  rows: CoverageRow[]
  genericOnly: string[]
  unreachable: string[]
  families: Array<{ family: string; total: number; specific: number; percent: number }>
}

const FAMILY_OF_PREFIX: Array<{ prefix: string; family: string }> = [
  { prefix: '/composition/scenes/*/propertyTracks', family: 'property animation' },
  { prefix: '/composition/scenes/*/zones/*/main/*/effects', family: 'effects' },
  { prefix: '/composition/scenes/*/zones/*/overlays/*/placements/*/effects', family: 'effects' },
  { prefix: '/composition/transitions', family: 'layer transitions' },
  { prefix: '/composition/markers', family: 'timeline' },
  { prefix: '/composition/durationMs', family: 'timeline' },
  { prefix: '/composition/groupDefinitions', family: 'groups' },
  { prefix: '/composition/groupOccurrences', family: 'groups' },
  { prefix: '/composition', family: 'clips' },
  { prefix: '/transitions', family: 'junctions' },
  { prefix: '/outputContract', family: 'structure' },
  { prefix: '/routingLayouts', family: 'structure' },
  { prefix: '/scenes', family: 'timeline' },
  { prefix: '/zones', family: 'structure' },
  { prefix: '/cells', family: 'flat model (legacy)' },
  { prefix: '/outputEffects', family: 'output effects' },
  { prefix: '', family: 'record' },
]

function familyOf(path: string): string {
  return FAMILY_OF_PREFIX.find(({ prefix }) => path.startsWith(prefix))!.family
}

/** Classify every editable leaf path against the registry's declared paths. */
export function generateCoverageReport(): CoverageReport {
  const { root, document } = loadSchema()
  const paths = enumerateSchemaLeafPaths(root, document)
    .filter((path) => !isAllowlisted(path))
    .sort()

  const specificOperations = SHOW_GRAMMAR_OPERATIONS.filter(
    (operation) => !GENERIC_OPERATION_NAMES.includes(operation.name),
  )
  const rows: CoverageRow[] = paths.map((path) => {
    const operations = specificOperations
      .filter((operation) =>
        operation.mutates.some((pattern) =>
          !isStructuralDeclaration(operation.name, pattern) && coverageMatches(path, pattern)))
      .map((operation) => operation.name)
    if (operations.length > 0) return { path, classification: 'specific', operations }
    const genericBarred = PROTECTED_POINTER_PATTERNS.some((pattern) => coverageMatches(path, pattern))
    return {
      path,
      classification: genericBarred ? 'unreachable' : 'generic-only',
      operations: [],
    }
  })

  const familyTotals = new Map<string, { total: number; specific: number }>()
  for (const row of rows) {
    const family = familyOf(row.path)
    const entry = familyTotals.get(family) ?? { total: 0, specific: 0 }
    entry.total += 1
    if (row.classification === 'specific') entry.specific += 1
    familyTotals.set(family, entry)
  }

  return {
    rows,
    genericOnly: rows.filter((row) => row.classification === 'generic-only').map((row) => row.path),
    unreachable: rows.filter((row) => row.classification === 'unreachable').map((row) => row.path),
    families: [...familyTotals.entries()]
      .map(([family, { total, specific }]) => ({
        family,
        total,
        specific,
        percent: Math.round((specific / total) * 1000) / 10,
      }))
      .sort((left, right) => left.family.localeCompare(right.family)),
  }
}

/** The committed report artifact, reproducible from schema and registry alone. */
export function renderCoverageReport(report: CoverageReport): string {
  const lines: string[] = []
  lines.push('# Show grammar schema coverage')
  lines.push('')
  lines.push('Generated by `npm run -s coverage:grammar` from')
  lines.push('`schemas/show-record.schema.json` and the registry\'s declared touch paths')
  lines.push('(`src/grammar/coverage.ts`). Do not edit by hand; the suite fails when this')
  lines.push('file drifts from the generator.')
  lines.push('')
  lines.push('## Per-family coverage')
  lines.push('')
  lines.push('| Family | Leaf paths | Specific | Coverage |')
  lines.push('| --- | --- | --- | --- |')
  for (const family of report.families) {
    lines.push(`| ${family.family} | ${family.total} | ${family.specific} | ${family.percent}% |`)
  }
  lines.push('')
  lines.push(`Unreachable paths: ${report.unreachable.length === 0 ? 'none' : report.unreachable.join(', ')}.`)
  lines.push('')
  lines.push('## Excluded identity and derived fields')
  lines.push('')
  for (const entry of COVERAGE_ALLOWLIST) {
    lines.push(`- \`${entry.pattern}\` — ${entry.reason}`)
  }
  lines.push('')
  lines.push('## Generic-only paths (the gap list)')
  lines.push('')
  lines.push('Reachable through `set_field` / `apply_patch` only. Generic-operation use is')
  lines.push('logged per session; frequent use of a path here is the signal to add a')
  lines.push('specific operation for it.')
  lines.push('')
  for (const path of report.genericOnly) {
    lines.push(`- \`${path}\``)
  }
  lines.push('')
  return lines.join('\n')
}
