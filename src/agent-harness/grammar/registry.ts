// Provenance: pxlblz-v3 src/grammar/registry.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// The Show grammar operation registry. Each entry is data: a stable name, an
// agent-facing description, a zod input shape, the ShowRecord JSON-pointer
// patterns it may mutate, and an apply function that calls the vendored v2
// authoring functions. The MCP tool list is generated from this table; adding
// an operation is one entry in one family module.
//
// Contract: operations take global times and clip/Zone/layer ids (the layer
// the v2 editor's mouse calls), never Scene-relative coordinates. Every apply
// works on a copy, runs tier-0 validation on the result, and refuses with
// typed issues; an engine refusal (input returned by identity) is surfaced as
// a typed refusal, never as success. Planner-backed operations run the
// vendored plan* function first and pass its user-legible reason through.
import { z, type ZodRawShape } from 'zod'
import { validateShowDocument } from '../shows/evaluate.js'
import type { GrammarChange, GrammarIssue, ShowGrammarDocument } from './types.js'

export type GrammarOperationResult =
  | { ok: true; document: ShowGrammarDocument; changes: GrammarChange[] }
  | { ok: false; issues: GrammarIssue[] }

export interface ShowGrammarOperation {
  name: string
  /** One paragraph written for an agent; becomes the MCP tool description. */
  description: string
  /** ShowRecord JSON-pointer patterns this operation may mutate. */
  mutates: string[]
  /** Zod shape for the operation's own arguments (session_id is added by the server). */
  inputShape: ZodRawShape
  apply: (document: ShowGrammarDocument, args: Record<string, unknown>) => GrammarOperationResult
}

export type { ShowGrammarDocument } from './types.js'

// The family modules import only types from this module, so these imports are
// not circular at runtime.
import { ANIMATION_OPERATIONS } from './operations/animation.js'
import { CLIP_OPERATIONS } from './operations/clips.js'
import { EFFECT_OPERATIONS } from './operations/effects.js'
import { GENERIC_OPERATIONS } from './operations/generic.js'
import { JUNCTION_OPERATIONS } from './operations/junctions.js'
import { LAYER_TRANSITION_OPERATIONS } from './operations/layerTransitions.js'
import { RECORD_OPERATIONS } from './operations/record.js'
import { STRUCTURE_OPERATIONS } from './operations/structure.js'
import { TIMELINE_OPERATIONS } from './operations/timeline.js'

export const SHOW_GRAMMAR_OPERATIONS: ShowGrammarOperation[] = [
  ...CLIP_OPERATIONS,
  ...TIMELINE_OPERATIONS,
  ...JUNCTION_OPERATIONS,
  ...LAYER_TRANSITION_OPERATIONS,
  ...EFFECT_OPERATIONS,
  ...STRUCTURE_OPERATIONS,
  ...RECORD_OPERATIONS,
  ...ANIMATION_OPERATIONS,
  ...GENERIC_OPERATIONS,
]

/**
 * Apply one registry operation to a document copy. Accepted results are
 * re-validated through tier-0 before they are returned; an invalid result is
 * refused and the input document is untouched.
 */
export function applyShowGrammarOperation(
  document: ShowGrammarDocument,
  name: string,
  rawArgs: Record<string, unknown>,
  options: { validateResult?: boolean } = {},
): GrammarOperationResult {
  const operation = SHOW_GRAMMAR_OPERATIONS.find((candidate) => candidate.name === name)
  if (!operation) {
    return {
      ok: false,
      issues: [{
        code: 'unknown-operation',
        message: `No grammar operation is named "${name}".`,
        candidates: SHOW_GRAMMAR_OPERATIONS.map((candidate) => candidate.name),
      }],
    }
  }
  const parsed = z.object(operation.inputShape).safeParse(rawArgs ?? {})
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'invalid-argument' as const,
        message: `${issue.path.join('.') || 'arguments'}: ${issue.message}`,
      })),
    }
  }
  const outcome = operation.apply(document, parsed.data as Record<string, unknown>)
  if (!outcome.ok) return outcome
  // Inside a transaction the session defers tier-0 to commit_edit, so a
  // working copy may pass through resolvable-invalid states.
  if (options.validateResult === false) return outcome

  const validation = validateShowDocument(
    outcome.document.show,
    outcome.document.inlinePatterns,
    outcome.document.options,
  )
  if (!validation.valid) {
    return {
      ok: false,
      issues: validation.errors.map((issue) => ({
        code: 'result-invalid' as const,
        message: `[${issue.code}] ${issue.message}`,
        ...(issue.path ? { path: issue.path } : {}),
      })),
    }
  }
  return outcome
}
