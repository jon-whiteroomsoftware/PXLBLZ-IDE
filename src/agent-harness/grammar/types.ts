// Provenance: pxlblz-v3 src/grammar/types.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Shared types for the Show grammar operation registry (#17). Pure data — no
// MCP or transport imports.
import type { ShowRecord } from '@/engine/personalContentRecords'
import type { InlinePattern, ShowEvaluationOptions } from '../shows/evaluate.js'

/** A typed reason an operation was refused. A refusal is never silent. */
export interface GrammarIssue {
  code:
    | 'unknown-operation'
    | 'unknown-session'
    | 'unknown-clip'
    | 'ambiguous-referent'
    | 'unknown-track'
    | 'unknown-keyframe'
    | 'unknown-marker'
    | 'unknown-zone'
    | 'unknown-junction'
    | 'unknown-transition'
    | 'unknown-effect'
    | 'unknown-parameter'
    | 'unknown-control'
    | 'unknown-layout'
    | 'unknown-interval'
    | 'transition-conflict'
    | 'transaction-open'
    | 'no-transaction'
    | 'history-exhausted'
    | 'invalid-argument'
    | 'overlap'
    | 'outside-timeline'
    | 'outside-scene'
    | 'duplicate-target'
    | 'duplicate-name'
    | 'duplicate-keyframe-time'
    | 'minimum-keyframes'
    | 'multi-segment-clip'
    | 'last-clip'
    | 'already-independent'
    | 'no-change'
    | 'engine-refused'
    | 'result-invalid'
    | 'open-failed'
    // Planner codes, passed through from the vendored plan* functions with
    // their user-legible reasons:
    | 'invalid-time'
    | 'invalid-duration'
    | 'transition'
    | 'missing-owner'
    | 'occupied'
    | 'no-space'
    | 'outside-clip'
    | 'transition-gap'
    | 'scene-boundary'
    | 'transition-boundary'
    | 'unsupported-animation'
    | 'already-shared'
    | 'missing-target'
    | 'incompatible-target'
    | 'group'
    | 'logical-clip'
    | 'nonlinear-property-animation'
    | 'missing-composition'
  message: string
  /** What the agent can do instead, where one exists. */
  remedy?: string
  /** JSON pointer into the document, where one applies. */
  path?: string
  /** Nearest known ids when an id failed to resolve. */
  candidates?: string[]
}

/** One entry of the structured change list an accepted operation returns. */
export interface GrammarChange {
  op: string
  /** The id of the element the change created or edited. */
  targetId: string
  /** One line of prose an agent can echo to the user. */
  description: string
  before?: unknown
  after?: unknown
  /** Ids an agent needs for follow-up calls (keyframe ids, etc.). */
  details?: Record<string, unknown>
}

/**
 * The document a grammar operation edits: a ShowRecord normalized to the
 * composition shape, plus everything tier-0 validation needs to re-run.
 */
export interface ShowGrammarDocument {
  show: ShowRecord
  inlinePatterns: InlinePattern[]
  options: ShowEvaluationOptions
}

/** Compact clip listing so an agent can address a clip without the raw document. */
export interface ClipListingEntry {
  clipId: string
  /** Placement id of the clip's first segment; property-track targets use it. */
  startPlacementId: string
  /** Pattern instance the clip renders; clips sharing an instance share state. */
  instanceId: string
  patternName: string
  zoneId: string
  zoneName: string
  layer: { kind: 'main' | 'overlay'; index: number }
  sceneId: string
  startMs: number
  endMs: number
  durationMs: number
}

export interface ShowClipListing {
  durationMs: number
  scenes: Array<{ sceneId: string; name: string; startMs: number; endMs: number }>
  clips: ClipListingEntry[]
}
