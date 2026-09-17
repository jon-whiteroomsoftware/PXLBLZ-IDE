// Provenance: pxlblz-v3 src/grammar/registry.ts at 9ecd481f, re-authored onto the
// version-2 catalogue for #1039 (see src/agent-harness/PROVENANCE.md).
// The Show grammar operation registry. Every authored operation is one entry of
// the production v2 catalogue (`src/engine/showCommandsV2/registry.ts`) exposed
// through a transport adapter, plus the two bounded generic backstops this
// harness owns. The MCP tool list is generated from this table.
//
// There is no translation layer. The harness does not rename, widen, narrow or
// re-shape a catalogue command: a caller sends the v2 command's own arguments,
// the v2 owner runs, and its affected-entity result is reported unchanged. A v1
// name is not registered here and has no alias — `SHOW_COMMAND_V2_NAME_MAP` is
// where a retired name's replacement is recorded.
import { z, type ZodRawShape } from 'zod'
import { validateAuthoringShowDocument, validateShowDocument } from '../shows/evaluate.js'
import type { GrammarChange, GrammarIssue, ShowGrammarDocument } from './types.js'

export type GrammarOperationResult =
  | { ok: true; document: ShowGrammarDocument; changes: GrammarChange[] }
  | { ok: false; issues: GrammarIssue[] }

export interface ShowGrammarOperation {
  name: string
  /** The catalogue family this operation belongs to, or `generic`. */
  family: string
  /** One paragraph written for an agent; becomes the MCP tool description. */
  description: string
  /** ShowRecordV2 JSON-pointer patterns this operation may write. */
  mutates: string[]
  /** Zod shape for the operation's own arguments (session_id is added by the server). */
  inputShape: ZodRawShape
  validateInput?: (args: Record<string, unknown>) => GrammarIssue[]
  apply: (document: ShowGrammarDocument, args: Record<string, unknown>) => GrammarOperationResult
}

export type { ShowGrammarDocument } from './types.js'

// The family modules import only types from this module, so these imports are
// not circular at runtime.
import { CATALOGUE_OPERATIONS } from './operations/catalogue.js'
import { GENERIC_OPERATIONS } from './operations/generic.js'

export const SHOW_GRAMMAR_OPERATIONS: ShowGrammarOperation[] = [
  ...CATALOGUE_OPERATIONS,
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
  const inputIssues = operation.validateInput?.(rawArgs ?? {})
  if (inputIssues?.length) return { ok: false, issues: inputIssues }
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
  // Inside a transaction the session defers tier-0 to commit_edit, so a working
  // copy may pass through resolvable-invalid states.
  if (options.validateResult === false) return outcome

  const validate = document.authoringValidation ? validateAuthoringShowDocument : validateShowDocument
  const validation = validate(
    outcome.document.show,
    outcome.document.inlinePatterns,
    outcome.document.options,
    document,
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
