// Provenance: pxlblz-v3 src/shows/evaluate.ts at 9ecd481f, re-authored onto the
// version-2 record for #1039 (see src/agent-harness/PROVENANCE.md).
//
// Tier 0 of the evaluation cascade over a `ShowRecordV2`: structure, domain,
// Pattern-reference resolution, authoring dependencies and compiler
// preparation. Pure logic — no MCP or transport imports; the MCP server and
// the bridge are thin wrappers over these functions.
//
// The checks and their order are the production route's own
// (`src/store/showV2CandidateAdmission.ts`): structure, then domain, then
// dependencies, then compiler eligibility. The harness runs the same owners
// against the same assets rather than keeping a second opinion about what a
// valid Show is.
import type { LibraryRecord, MapRecord, PatternRecord, ShowPatternRef } from '@/engine/personalContentRecords'
import { compileShow, type GeneratedShowArtifact, type ShowCompileSummary } from '@/engine/showCompiler'
import {
  validateShowRecordV2Domain,
  validateShowRecordV2Structure,
  type ShowRecordV2,
} from '@/engine/showCompositionV2'
import {
  captureShowAuthoringBaselineV2,
  validateShowAuthoringV2,
  type ShowAuthoringContextV2,
} from '@/engine/showAuthoringValidationV2'
import type { ShowAuthoringBaseline } from '@/engine/showAuthoringValidation'
import { showPatternSitesV2 } from '@/engine/showAuthoringValidationV2'
import {
  captureShowStageEditV2,
  type ShowPreparedStageDependenciesV2,
  type ShowPreparedStageEditCaptureV2,
} from '@/engine/showPreparedStageV2'
import { bundle } from '@/engine/bundle'
import type { ShowCommandV2Context } from '@/engine/showCommandsV2/registry'
import { createCustomMap, type PixelMap } from '@/engine/maps'
import { SOURCE_STOCK_MAPS } from '@/pixelblaze/stock/maps/stockCatalogue'
import { LIBRARIES } from '@/pixelblaze/libs'
import { stockPatternSource } from './stockCatalogue.js'

export interface ShowIssue {
  /** Machine-checkable issue family. */
  code:
    | 'malformed-json'
    | 'schema'
    | 'unknown-stock-pattern'
    | 'user-library-pattern'
    | 'compile-error'
    | 'structure'
    | 'composition'
    | 'missing-reference'
    | 'metadata'
    | 'delivery'
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
  /**
   * Editing-session mode: an unresolvable user-library Pattern reference that
   * was already unresolvable is tolerated with a warning instead of refused.
   * Editing needs the reference's identity, not its source; compilation
   * ignores this flag — an artifact never silently substitutes.
   */
  allowUnresolvedUserPatterns?: boolean
  /** Exact personal Library metadata (namespace → source) for authoring inspection. */
  authoringLibraries?: Record<string, string>
  /**
   * Personal Maps a record's `stageMapId` may name. The harness has no personal
   * Map library of its own, so a named Map must arrive here or resolve as stock.
   */
  maps?: readonly MapRecord[]
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
    }

/** Structural v2 Show-record issues only, without domain or dependency checks. */
export function validateShowStructure(input: unknown): ShowIssue[] {
  const shape = validateShowRecordV2Structure(input)
  if (shape.valid) return []
  return shape.errors.map((error) => ({
    code: 'schema' as const,
    path: error.instancePath || '/',
    message: `${error.instancePath || 'document'} ${error.message ?? 'is invalid'}`.trim(),
  }))
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

/**
 * Resolve every Pattern reference up front. The engine substitutes a test
 * Pattern for anything it cannot resolve; an agent-facing tool turns that
 * silence into typed errors instead. Stock ids go through the retired-id table
 * the same way the engine resolves them.
 */
export function resolveShowPatterns(
  show: ShowRecordV2,
  inlinePatterns: InlinePattern[] = [],
  options: { allowUnresolvedUserPatterns?: boolean } = {},
): { userPatterns: PatternRecord[]; errors: ShowIssue[]; unresolved: ShowIssue[] } {
  const inlineById = new Map(inlinePatterns.map((pattern) => [pattern.id, pattern]))
  const userPatterns = new Map<string, PatternRecord>()
  const errors: ShowIssue[] = []
  const unresolved: ShowIssue[] = []
  const reported = new Set<string>()

  for (const site of showPatternSitesV2(show)) {
    const key = `${site.ref.kind}:${site.ref.id}`
    if (site.ref.kind === 'stock') {
      if (stockPatternSource(site.ref.id) === undefined && !reported.has(key)) {
        reported.add(key)
        errors.push({
          code: 'unknown-stock-pattern',
          message: `${site.owner} references stock pattern "${site.ref.id}", which does not exist in the stock catalogue of the pinned engine version.`,
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
          `${site.owner} references user-library pattern "${site.ref.id}", which is not resolvable without ` +
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
  show: ShowRecordV2
  userPatterns: PatternRecord[]
  /** Tolerated unresolved user-library references (editing-session mode). */
  unresolved: ShowIssue[]
}

/** Parse + structural validation + Pattern resolution, shared by every tier. */
export function prepareShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: { allowUnresolvedUserPatterns?: boolean } = {},
): { prepared: EvaluableShow } | { errors: ShowIssue[] } {
  const parsed = parseShowDocument(input)
  if ('error' in parsed) return { errors: [parsed.error] }

  const structuralIssues = validateShowStructure(parsed.document)
  if (structuralIssues.length > 0) return { errors: structuralIssues }

  const show = parsed.document as ShowRecordV2
  const { userPatterns, errors, unresolved } = resolveShowPatterns(show, inlinePatterns, options)
  if (errors.length > 0) return { errors }
  return { prepared: { show, userPatterns, unresolved } }
}

/** Personal Libraries as records, from the harness's `name → source` option. */
export function harnessLibraryRecords(options: ShowEvaluationOptions): LibraryRecord[] {
  return Object.entries(options.authoringLibraries ?? {}).map(([name, src]) => ({
    id: `harness-library-${name}`,
    name,
    src,
    updatedAt: 0,
  }))
}

/**
 * The Stage map a record names.
 *
 * The built-in catalogue first, then a baked custom Map the caller supplied.
 * A generator-backed personal Map is not resolvable here — rebuilding one needs
 * the Map store the harness deliberately does not import — and an unknown or
 * unsupported Map resolves to `null`, which previews as generic Zone strips
 * rather than substituting another Map's geometry, the route's own rule.
 */
export function harnessStageMap(
  stageMapId: string | null | undefined,
  maps: readonly MapRecord[] = [],
): PixelMap | null {
  if (!stageMapId) return null
  const stock = SOURCE_STOCK_MAPS.find((map) => map.id === stageMapId)
  if (stock) return stock.dim === 2 || stock.dim === 3 ? stock : null
  const owned = maps.find((map) => map.id === stageMapId)
  if (!owned || (owned.dim !== 2 && owned.dim !== 3) || owned.generator !== 'custom') return null
  return createCustomMap(owned.points ?? [], { id: owned.id, name: owned.name, gridDims: owned.gridDims })
}

/** The dependency set every v2 owner in this harness is evaluated against. */
export function harnessStageDependencies(
  show: ShowRecordV2,
  inlinePatterns: InlinePattern[],
  options: ShowEvaluationOptions,
): ShowPreparedStageDependenciesV2 {
  const { userPatterns } = resolveShowPatterns(show, inlinePatterns, { allowUnresolvedUserPatterns: true })
  return {
    patterns: userPatterns,
    libraries: harnessLibraryRecords(options),
    maps: options.maps ?? [],
    profiles: [],
    stageMap: harnessStageMap(show.stageMapId, options.maps ?? []),
  }
}

/** One prepared capture: the production route's own compiler-eligibility context. */
export function captureShowDocument(
  show: ShowRecordV2,
  inlinePatterns: InlinePattern[] = [],
  options: ShowEvaluationOptions = {},
): ShowPreparedStageEditCaptureV2 {
  return captureShowStageEditV2(show, harnessStageDependencies(show, inlinePatterns, options))
}

/** Exact Pattern source lookup: stock catalogue, then the caller's inline sources. */
export function harnessPatternSource(
  inlinePatterns: InlinePattern[],
): (ref: ShowPatternRef) => string | undefined {
  return (ref) => ref.kind === 'stock'
    ? stockPatternSource(ref.id)
    : inlinePatterns.find((pattern) => pattern.id === ref.id)?.source
}

/** The authoring-validation context: exact sources and the fixed Library snapshot. */
export function capturedShowAuthoringContext(
  inlinePatterns: InlinePattern[],
  options: ShowEvaluationOptions,
): Pick<ShowAuthoringContextV2, 'source' | 'libraries'> {
  return {
    source: harnessPatternSource(inlinePatterns),
    libraries: { ...LIBRARIES, ...options.authoringLibraries },
  }
}

/**
 * The trusted dependency metadata the v2 catalogue's commands read.
 *
 * Specification section 6: resolved Pattern exports come from the caller's
 * captured bundle boundary, never from command arguments. The harness's
 * boundary is the exact sources and Libraries a session was opened with, so
 * this resolves the same way the route's capture does — bundling the source
 * against the session's Library snapshot and reporting its declared sliders —
 * without building a prepared Stage for every command.
 */
export function capturedShowCommandContext(
  inlinePatterns: InlinePattern[],
  options: ShowEvaluationOptions,
): ShowCommandV2Context {
  const source = harnessPatternSource(inlinePatterns)
  const libraries = { ...LIBRARIES, ...options.authoringLibraries }
  return {
    resolvePattern: (reference) => {
      if (!reference || !['stock', 'user'].includes(reference.kind) || typeof reference.id !== 'string' || !reference.id.trim()) {
        return { status: 'refused', message: 'Choose an available Pattern source.' }
      }
      const text = source(reference)
      if (text === undefined) return { status: 'refused', message: `The Pattern source "${reference.id}" is unavailable.` }
      const patternName = reference.kind === 'user'
        ? inlinePatterns.find((pattern) => pattern.id === reference.id)?.name ?? reference.id
        : reference.id
      try {
        const metadata = bundle(text, libraries).metadata
        return {
          status: 'ready',
          replacement: {
            patternReference: { ...reference },
            patternName,
            exportedSliders: metadata.controls
              .filter((control): control is typeof control & { kind: 'slider' } => control.kind === 'slider')
              .map((control) => ({ ...structuredClone(control), kind: 'slider' as const })),
          },
        }
      } catch (error) {
        return {
          status: 'refused',
          message: error instanceof Error
            ? `The Pattern "${reference.id}" cannot be resolved: ${error.message}`
            : `The Pattern "${reference.id}" cannot be resolved.`,
        }
      }
    },
  }
}

export function captureShowAuthoringBaseline(
  show: ShowRecordV2,
  inlinePatterns: InlinePattern[] = [],
  options: ShowEvaluationOptions = {},
): ShowAuthoringBaseline {
  return captureShowAuthoringBaselineV2(show, capturedShowAuthoringContext(inlinePatterns, options))
}

/**
 * Tier-0 validation: structure, domain, authoring dependencies, then the same
 * compiler preparation the route runs. No code is emitted — use
 * `compileShowDocument` for that.
 */
export function validateShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: ShowEvaluationOptions = {},
  baseline?: { show: ShowRecordV2; inlinePatterns: InlinePattern[]; options: ShowEvaluationOptions },
): ValidateShowResult {
  const parsed = parseShowDocument(input)
  if ('error' in parsed) return { valid: false, errors: [parsed.error], warnings: [] }
  const structural = validateShowStructure(parsed.document)
  if (structural.length > 0) return { valid: false, errors: structural, warnings: [] }

  const show = parsed.document as ShowRecordV2
  // A stock id the catalogue does not know is an error in every mode: the
  // editing-session tolerance is for a *personal* Pattern whose source this
  // local server cannot reach, never for a reference the engine would silently
  // substitute a test Pattern for.
  const stockIssues = resolveShowPatterns(show, inlinePatterns, { allowUnresolvedUserPatterns: true })
    .errors.filter((issue) => issue.code === 'unknown-stock-pattern')
  if (stockIssues.length > 0) return { valid: false, errors: stockIssues, warnings: [] }

  const domain = validateShowRecordV2Domain(show).map((issue): ShowIssue => ({
    code: 'composition',
    path: issue.path,
    message: `[${issue.code}] ${issue.message}`,
  }))
  if (domain.length > 0) return { valid: false, errors: domain, warnings: [] }

  const authoring = validateShowAuthoringV2(show, {
    ...capturedShowAuthoringContext(inlinePatterns, options),
    ...(baseline
      ? { baseline: captureShowAuthoringBaseline(baseline.show, baseline.inlinePatterns, baseline.options) }
      : {}),
    allowExistingMissing: options.allowUnresolvedUserPatterns,
  })
  // The authoring validator reports an unresolvable Pattern as
  // `missing-reference`, which is right for the editor: the user's own Library
  // is simply not loaded yet. An agent calling this local server has no Library
  // at all, so the remedy is different and specific — send the source in
  // `inline_patterns` — and that is what this harness's tool descriptions
  // promise. The unresolvable *personal* references carry that message here;
  // every other missing reference passes through unchanged.
  const personalRemedies = resolveShowPatterns(show, inlinePatterns, { allowUnresolvedUserPatterns: true })
    .unresolved.map((issue) => ({ patternId: issue.message.match(/user-library pattern "([^"]+)"/)?.[1] ?? '', issue }))
  const explain = (issue: { code: string; path?: string; message: string }): ShowIssue => {
    if (issue.code === 'missing-reference') {
      const remedy = personalRemedies.find((candidate) => issue.message.includes(`user:${candidate.patternId}`))
      if (remedy) return { ...remedy.issue, ...(issue.path ? { path: issue.path } : {}) }
    }
    return {
      code: issue.code === 'composition' ? 'composition' : (issue.code as ShowIssue['code']),
      ...(issue.path ? { path: issue.path } : {}),
      message: issue.message,
    }
  }
  const errors: ShowIssue[] = authoring.errors.map(explain)
  const warnings: ShowIssue[] = authoring.warnings.map(explain)
  if (errors.length > 0) return { valid: false, errors, warnings }

  // Compiler eligibility. Preparation needs every Pattern source, so an editing
  // session that has deliberately tolerated an unresolvable reference cannot run
  // it: editing needs the reference's identity, not its source, and refusing
  // here would make a Show unopenable because one personal Pattern is absent.
  // Compilation and export still refuse — `compileShowDocument` never sets this
  // option.
  if (warnings.some((issue) => issue.code === 'missing-reference' || issue.code === 'user-library-pattern')) {
    return { valid: true, errors: [], warnings }
  }
  // An empty Show is a valid, editable, saveable record whose preview and export
  // are unavailable (specification section 9), so it is not an error here.
  const prepared = captureShowDocument(show, inlinePatterns, options).prepared
  if (prepared.status === 'refused') {
    return { valid: false, errors: [{ code: 'delivery', message: prepared.message }], warnings }
  }
  return { valid: true, errors: [], warnings }
}

/**
 * The authoring validator the editing session runs.
 *
 * v2 has one record representation and one validation stack, so this is
 * `validateShowDocument` with the session's dependency baseline: a reference
 * that was already unresolvable before the edit stays a warning.
 */
export function validateAuthoringShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: ShowEvaluationOptions = {},
  baseline?: { show: ShowRecordV2; inlinePatterns: InlinePattern[]; options: ShowEvaluationOptions },
): ValidateShowResult {
  return validateShowDocument(input, inlinePatterns, { ...options, allowUnresolvedUserPatterns: true }, baseline)
}

export function compileShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: ShowEvaluationOptions = {},
): CompileShowResult {
  // Deliberately no allowUnresolvedUserPatterns here: a compiled artifact never
  // silently substitutes a missing Pattern source.
  const prepared = prepareShowDocument(input, inlinePatterns)
  if ('errors' in prepared) return { ok: false, errors: prepared.errors }

  const { show } = prepared.prepared
  const capture = captureShowDocument(show, inlinePatterns, options)
  if (capture.prepared.status === 'refused') {
    return { ok: false, errors: [{ code: 'compile-error', message: capture.prepared.message }] }
  }
  if (capture.prepared.status === 'empty') {
    return {
      ok: false,
      errors: [{ code: 'compile-error', message: 'This Show has no Clips; add content before exporting.' }],
    }
  }
  const { bundle } = capture.prepared
  try {
    const artifact = compileShow(bundle.recipe, bundle.libraries)
    return { ok: true, code: artifact.code, metadata: artifact.metadata, summary: artifact.summary }
  } catch (error) {
    return {
      ok: false,
      errors: [{ code: 'compile-error', message: error instanceof Error ? error.message : String(error) }],
    }
  }
}
