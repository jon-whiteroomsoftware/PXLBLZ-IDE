// Provenance: pxlblz-v3 src/grammar/types.ts at 9ecd481f, re-authored onto the
// version-2 vocabulary for #1039 (see src/agent-harness/PROVENANCE.md).
// Shared types for the Show grammar operation registry. Pure data — no MCP or
// transport imports.
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import type { InlinePattern, ShowEvaluationOptions } from '../shows/evaluate.js'

/**
 * Refusal codes this harness owns: session, transaction, referent and transport
 * concerns the v2 catalogue knows nothing about.
 *
 * Domain refusals are not re-declared here. A catalogue refusal passes through
 * carrying its own code from `SHOW_COMMAND_V2_REFUSAL_CODES`, which is the one
 * place those codes and their meanings live. Retired v1 codes
 * (`RETIRED_V1_REFUSAL_CODES`) must not reappear on this surface.
 */
export type GrammarHarnessIssueCode =
  | 'unknown-operation'
  | 'unknown-session'
  | 'ambiguous-referent'
  | 'transaction-open'
  | 'no-transaction'
  | 'history-exhausted'
  | 'invalid-argument'
  | 'result-invalid'
  | 'open-failed'
  | 'unknown-id'
  | 'unknown-track'

/** A typed reason an operation was refused. A refusal is never silent. */
export interface GrammarIssue {
  /** A harness code above, or a v2 catalogue refusal code passed through. */
  code: GrammarHarnessIssueCode | (string & {})
  message: string
  /** What the agent can do instead, where one exists. */
  remedy?: string
  /** JSON pointer or JSONPath into the document or the input, where one applies. */
  path?: string
  /** Nearest known identities when an id failed to resolve. */
  candidates?: string[]
}

/** One entry of the structured change list an accepted operation returns. */
export interface GrammarChange {
  op: string
  /** The identity the change created or edited, when it names one. */
  targetId?: string
  /** One line of prose an agent can echo to the user. */
  description: string
  /**
   * The command's own affected-entity collections, unchanged, or the generic
   * backstop's touched pointers. Never re-shaped on the way through.
   */
  details?: object
}

/**
 * The document a grammar operation edits.
 *
 * v2 has one record representation, so there is no projection step and no
 * second shape: this is the record the commands read, the validators observe
 * and the exporters write.
 */
export interface ShowGrammarDocument {
  /** Internal qualification path only; no bridge or MCP caller enables it. */
  authoringValidation?: true
  show: ShowRecordV2
  inlinePatterns: InlinePattern[]
  options: ShowEvaluationOptions
}

/** Compact Clip listing so an agent can address a Clip without the raw document. */
export interface ClipListingEntry {
  clipId: string
  /** Pattern instance the Clip renders; Clips sharing an instance share state. */
  instanceId: string
  patternName: string
  zoneId: string
  zoneName: string
  /** Stable Zone-owned Layer identity for the whole Show. */
  layerId: string
  layerName: string
  /** Zero is the bottom Layer. */
  layerRank: number
  startMs: number
  endMs: number
  durationMs: number
  entryPolicy: 'continue' | 'restart'
  /** Present for a materialized Group Clip use. */
  groupOccurrenceId?: string
}

export interface ShowLayerListingEntry {
  layerId: string
  zoneId: string
  zoneName: string
  name: string
  rank: number
}

export interface ShowClipListing {
  /** Show End owns the loop length. */
  showEndMs: number
  layers: ShowLayerListingEntry[]
  clips: ClipListingEntry[]
}
