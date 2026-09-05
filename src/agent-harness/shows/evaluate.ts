// Provenance: pxlblz-v3 src/shows/evaluate.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Tier 0 of the evaluation cascade: structural validation, pattern-reference
// resolution, semantic validation, and compilation over the vendored v2
// engine. Pure logic — no MCP or transport imports; the MCP server is a thin
// wrapper over these functions.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv, { type ValidateFunction } from 'ajv'
import type { PatternRecord, ShowPatternRef, ShowRecord } from '@/engine/personalContentRecords'
import {
  compileShowForArtifact,
  sourceForShowCell,
  sourceForShowPatternRef,
} from '@/engine/showPreviewArtifact'
import type { GeneratedShowArtifact, ShowCompileSummary } from '@/engine/showCompiler'
import { projectShowGroupRuntimePatternInstances } from '@/engine/showGroupModel'
import {
  installationCoverageBlockingMessage,
  validateInstallationCoverage,
} from '@/engine/showInstallationCoverage'
import { validatePortableShowCompatibility } from '@/engine/showPortableCompatibility'
import { DEMOS } from '@/pixelblaze/stock/patterns'

export interface ShowIssue {
  /** Machine-checkable issue family. */
  code:
    | 'malformed-json'
    | 'schema'
    | 'unknown-stock-pattern'
    | 'user-library-pattern'
    | 'coverage'
    | 'portable-compatibility'
    | 'compile-error'
  /** JSON pointer into the document, where one applies. */
  path?: string
  message: string
}

export interface InlinePattern {
  id: string
  name?: string
  source: string
}

export interface ValidateShowResult {
  valid: boolean
  errors: ShowIssue[]
  warnings: ShowIssue[]
}

export interface ShowEvaluationOptions {
  stageDimension?: 1 | 2 | 3
  /** Reported pixel count of the target Controller (portable Shows only). */
  targetPixelCount?: number
  /**
   * Editing-session mode: an unresolvable user-library pattern reference is
   * tolerated with a warning instead of refused. Editing needs the
   * reference's identity, not its source; portable-compatibility checks run
   * against the engine's substitute source for those sites. Compilation
   * ignores this flag - an artifact never silently substitutes.
   */
  allowUnresolvedUserPatterns?: boolean
}

export type CompileShowResult =
  | { ok: false; errors: ShowIssue[] }
  | {
      ok: true
      /** Portable generated Pattern source. */
      code: string
      /** Bundle metadata for loading the code into a runtime (telemetry, replay). */
      metadata: GeneratedShowArtifact['metadata']
      summary: ShowCompileSummary
      /** Deployment blocker surfaced by the artifact path, if any. */
      artifactBlocker?: string
    }

const schemaPath = fileURLToPath(new URL('../../../schemas/show-record.schema.json', import.meta.url))

let cachedValidator: ValidateFunction | null = null
function structuralValidator(): ValidateFunction {
  if (!cachedValidator) {
    const ajv = new Ajv({ allErrors: true, strict: false })
    cachedValidator = ajv.compile(JSON.parse(readFileSync(schemaPath, 'utf8')))
  }
  return cachedValidator
}

/** Accepts the document as a parsed object or a JSON string. */
export function parseShowDocument(input: unknown): { document: unknown } | { error: ShowIssue } {
  if (typeof input !== 'string') return { document: input }
  try {
    return { document: JSON.parse(input) }
  } catch (cause) {
    return {
      error: {
        code: 'malformed-json',
        message: `The show document is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      },
    }
  }
}

interface PatternRefSite {
  ref: ShowPatternRef
  patternName: string
  where: string
}

function collectPatternRefSites(show: ShowRecord): PatternRefSite[] {
  const sites: PatternRefSite[] = show.cells.map((cell) => ({
    ref: cell.pattern,
    patternName: cell.patternName,
    where: `cell "${cell.id}"`,
  }))
  for (const instance of show.composition?.patternInstances ?? []) {
    sites.push({ ref: instance.pattern, patternName: instance.patternName, where: `pattern instance "${instance.id}"` })
  }
  for (const definition of show.composition?.groupDefinitions ?? []) {
    for (const instance of definition.patternInstances) {
      sites.push({
        ref: instance.pattern,
        patternName: instance.patternName,
        where: `group "${definition.id}" pattern instance "${instance.id}"`,
      })
    }
  }
  return sites
}

/** Resolve every pattern reference up front. The v2 engine quietly substitutes
 * a test pattern for anything it cannot resolve; an agent-facing tool must
 * turn that silence into typed errors instead. */
export function resolveShowPatterns(
  show: ShowRecord,
  inlinePatterns: InlinePattern[] = [],
  options: { allowUnresolvedUserPatterns?: boolean } = {},
): { userPatterns: PatternRecord[]; errors: ShowIssue[]; unresolved: ShowIssue[] } {
  const inlineById = new Map(inlinePatterns.map((pattern) => [pattern.id, pattern]))
  const userPatterns = new Map<string, PatternRecord>()
  const errors: ShowIssue[] = []
  const unresolved: ShowIssue[] = []
  const reported = new Set<string>()

  for (const site of collectPatternRefSites(show)) {
    const key = `${site.ref.kind}:${site.ref.id}`
    if (site.ref.kind === 'stock') {
      if (!(site.ref.id in DEMOS) && !reported.has(key)) {
        reported.add(key)
        errors.push({
          code: 'unknown-stock-pattern',
          message: `${site.where} references stock pattern "${site.ref.id}", which does not exist in the stock catalogue of the pinned engine version.`,
        })
      }
      continue
    }
    const inline = inlineById.get(site.ref.id)
    if (inline) {
      if (!userPatterns.has(site.ref.id)) {
        userPatterns.set(site.ref.id, {
          id: inline.id,
          name: inline.name ?? site.patternName,
          src: inline.source,
          controls: {},
          updatedAt: 0,
        })
      }
      continue
    }
    if (!reported.has(key)) {
      reported.add(key)
      const issue: ShowIssue = {
        code: 'user-library-pattern',
        message:
          `${site.where} references user-library pattern "${site.ref.id}", which is not resolvable without ` +
          'authentication: this local server has no access to a personal PXLBLZ pattern library. Either supply ' +
          'the pattern source in the inline_patterns argument (matching this id), or reference a stock pattern ' +
          '(kind "stock").',
      }
      if (options.allowUnresolvedUserPatterns) unresolved.push(issue)
      else errors.push(issue)
    }
  }
  return { userPatterns: [...userPatterns.values()], errors, unresolved }
}

interface EvaluableShow {
  show: ShowRecord
  userPatterns: PatternRecord[]
  /** Tolerated unresolved user-library references (editing-session mode). */
  unresolved: ShowIssue[]
}

/** Parse + structural validation + pattern resolution, shared by the
 * evaluation tiers (validate, compile, critique). */
export function prepareShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: { allowUnresolvedUserPatterns?: boolean } = {},
): { prepared: EvaluableShow } | { errors: ShowIssue[] } {
  const parsed = parseShowDocument(input)
  if ('error' in parsed) return { errors: [parsed.error] }

  const validate = structuralValidator()
  if (!validate(parsed.document)) {
    return {
      errors: (validate.errors ?? []).map((error) => ({
        code: 'schema' as const,
        path: error.instancePath || '/',
        message: `${error.instancePath || 'document'} ${error.message ?? 'is invalid'}`.trim(),
      })),
    }
  }

  const show = parsed.document as ShowRecord
  const { userPatterns, errors, unresolved } = resolveShowPatterns(show, inlinePatterns, options)
  if (errors.length > 0) return { errors }
  return { prepared: { show, userPatterns, unresolved } }
}

function portablePatternSources(show: ShowRecord, userPatterns: PatternRecord[]) {
  const compositionInstances = show.composition
    ? [...show.composition.patternInstances, ...projectShowGroupRuntimePatternInstances(show.composition)]
    : []
  return [
    ...show.cells.map((cell) => ({
      cellId: cell.id,
      patternName: cell.patternName,
      source: sourceForShowCell(cell, userPatterns),
    })),
    ...compositionInstances.map((instance) => ({
      cellId: instance.id,
      patternName: instance.patternName,
      source: sourceForShowPatternRef(instance.pattern, userPatterns),
    })),
  ]
}

/** Tier 0 validation: structure, pattern resolution, and the same semantic
 * gates the artifact compile path enforces before compiling — with no code
 * emission. */
export function validateShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: ShowEvaluationOptions = {},
): ValidateShowResult {
  const prepared = prepareShowDocument(input, inlinePatterns, options)
  if ('errors' in prepared) return { valid: false, errors: prepared.errors, warnings: [] }

  const { show, userPatterns } = prepared.prepared
  const errors: ShowIssue[] = []
  const warnings: ShowIssue[] = [...prepared.prepared.unresolved]

  const coverageError = installationCoverageBlockingMessage(validateInstallationCoverage(show))
  if (coverageError) errors.push({ code: 'coverage', message: coverageError })

  const portable = validatePortableShowCompatibility(
    show,
    portablePatternSources(show, userPatterns),
    options.stageDimension ?? 2,
  )
  for (const issue of portable?.issues ?? []) {
    errors.push({ code: 'portable-compatibility', message: issue })
  }
  for (const advisory of portable?.advisories ?? []) {
    warnings.push({ code: 'portable-compatibility', message: advisory })
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function compileShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: ShowEvaluationOptions = {},
): CompileShowResult {
  // Deliberately no allowUnresolvedUserPatterns here: a compiled artifact
  // never silently substitutes a missing pattern source.
  const prepared = prepareShowDocument(input, inlinePatterns)
  if ('errors' in prepared) return { ok: false, errors: prepared.errors }

  const { show, userPatterns } = prepared.prepared
  const compiled = compileShowForArtifact(show, userPatterns, undefined, {}, {
    stageDimension: options.stageDimension ?? 2,
    targetPixelCount: options.targetPixelCount,
  })
  if (compiled.error || !compiled.artifact) {
    return {
      ok: false,
      errors: [{ code: 'compile-error', message: compiled.error ?? 'Show compile produced no artifact' }],
    }
  }
  return {
    ok: true,
    code: compiled.artifact.code,
    metadata: compiled.artifact.metadata,
    summary: compiled.artifact.summary,
    ...(compiled.artifactBlocker ? { artifactBlocker: compiled.artifactBlocker } : {}),
  }
}
