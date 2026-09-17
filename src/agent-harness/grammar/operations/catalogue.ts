// The production v2 command catalogue, exposed as grammar operations (#1039).
//
// One adapter, no per-family modules: every authored operation this harness
// offers is an entry of `SHOW_COMMANDS_V2`, with that entry's own name,
// description, typed input schema, touch paths and owner. The adapter converts
// exactly two things and nothing else — the transport shape of the input schema
// (a zod shape for the MCP tool list) and the transport shape of the outcome
// (the catalogue's `changed | unchanged | refused` onto this surface's
// accepted/refused pair, where `unchanged` is an accepted no-op with no
// changes, catalogue rule 4).
//
// Identity is never allocated here: every v2 owner takes the identities its
// caller supplies, so the harness mints none on the command path.
import { showCommandV2InputShape } from '@/engine/showCommandsV2/descriptorSchema'
import {
  SHOW_COMMANDS_V2,
  validateShowCommandV2Input,
  type ShowCommandV2Descriptor,
} from '@/engine/showCommandsV2/registry'
import { capturedShowCommandContext } from '../../shows/evaluate.js'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue } from '../types.js'

/** One schema/result bridge over a v2 catalogue descriptor. */
export function catalogueOperation(descriptor: ShowCommandV2Descriptor): ShowGrammarOperation {
  return {
    name: descriptor.name,
    family: descriptor.family,
    description: descriptor.description,
    mutates: [...descriptor.touches],
    inputShape: showCommandV2InputShape(descriptor),
    validateInput: (args) => validateShowCommandV2Input(descriptor, args) as GrammarIssue[],
    apply(document, args) {
      const outcome = descriptor.apply(
        document.show,
        args,
        capturedShowCommandContext(document.inlinePatterns, document.options),
      )
      if (outcome.status === 'refused') return { ok: false, issues: outcome.issues as GrammarIssue[] }
      return {
        ok: true,
        document: outcome.record === document.show ? document : { ...document, show: outcome.record },
        changes: outcome.changes.map(({ command: _command, ...change }) => ({ ...change, op: descriptor.name })),
      }
    },
  }
}

export const CATALOGUE_OPERATIONS: ShowGrammarOperation[] = SHOW_COMMANDS_V2.map(catalogueOperation)
