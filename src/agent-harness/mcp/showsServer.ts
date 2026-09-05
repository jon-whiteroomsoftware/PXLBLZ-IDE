// Provenance: pxlblz-v3 src/mcp/showsServer.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Thin MCP wrapper over the pure modules in src/shows/. Tool handlers only
// shape arguments and serialize results; all Show logic stays there.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  compileShowDocument,
  prepareShowDocument,
  validateShowDocument,
  type InlinePattern,
  type ShowEvaluationOptions,
} from '../shows/evaluate.js'
import { critiqueShow } from '../shows/critique.js'
import { getStockPattern, listStockPatterns } from '../shows/stockCatalogue.js'
import { measureShowDocument } from '../telemetry/measure.js'
import { OPERATING_RULES, type EditorContext, type ReferenceQuery } from '../grammar/read.js'
import { SHOW_GRAMMAR_OPERATIONS } from '../grammar/registry.js'
import { createSessionStore, type GrammarSessionStore } from '../grammar/session.js'

const showRecordSchemaPath = fileURLToPath(new URL('../../../schemas/show-record.schema.json', import.meta.url))
const showDataModelPath = fileURLToPath(new URL('../reference/show-data-model.md', import.meta.url))

const showArgument = z.union([z.record(z.unknown()), z.string()]).describe(
  'The ShowRecord document to evaluate, as a JSON object (preferred) or a JSON string. ' +
    'Author against schemas/show-record.schema.json.',
)

const inlinePatternsArgument = z
  .array(
    z.object({
      id: z.string().describe('Pattern id matching a {"kind":"user","id":...} reference in the document'),
      name: z.string().optional(),
      source: z.string().describe('Complete Pattern source code'),
    }),
  )
  .optional()
  .describe('Inline sources for user-pattern references; without one, a user reference is rejected.')

const stageDimensionArgument = z
  .union([z.literal(1), z.literal(2), z.literal(3)])
  .optional()
  .describe('Reference output dimension (default 2)')

const targetPixelCountArgument = z
  .number()
  .int()
  .positive()
  .optional()
  .describe('Reported pixel count of the target Controller (portable Shows only)')

interface ToolArguments {
  show: Record<string, unknown> | string
  inline_patterns?: InlinePattern[]
  stage_dimension?: 1 | 2 | 3
  target_pixel_count?: number
}

function evaluationOptions(args: ToolArguments): ShowEvaluationOptions {
  return { stageDimension: args.stage_dimension, targetPixelCount: args.target_pixel_count }
}

function jsonResult(payload: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  }
}

export interface ShowsServerOptions {
  /** Inject a session store (the dictation runner shares one with the harness). */
  sessions?: GrammarSessionStore
}

export function createShowsServer(options: ShowsServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: 'pxlblz-shows', version: '0.1.0' },
    { instructions: OPERATING_RULES },
  )

  server.registerTool(
    'validate_show',
    {
      title: 'Validate a Show document',
      description:
        'Tier-0 validation of a ShowRecord JSON document: JSON well-formedness, structural schema conformance, ' +
        'pattern-reference resolution, and the semantic gates the compiler enforces (installation coverage, ' +
        'portable compatibility). Returns typed errors and warnings. Emits no code — use compile_show for that.',
      inputSchema: {
        show: showArgument,
        inline_patterns: inlinePatternsArgument,
        stage_dimension: stageDimensionArgument,
        target_pixel_count: targetPixelCountArgument,
      },
    },
    (args: ToolArguments) =>
      jsonResult(validateShowDocument(args.show, args.inline_patterns ?? [], evaluationOptions(args))),
  )

  server.registerTool(
    'compile_show',
    {
      title: 'Compile a Show document',
      description:
        'Compiles a valid ShowRecord JSON document through the pinned v2 Show compiler and returns the portable ' +
        'generated Pattern source plus the full compile summary (artifact bytes, device-budget ratio, clip count, ' +
        'resource warnings and blockers). Invalid documents return the same typed errors as validate_show.',
      inputSchema: {
        show: showArgument,
        inline_patterns: inlinePatternsArgument,
        stage_dimension: stageDimensionArgument,
        target_pixel_count: targetPixelCountArgument,
      },
    },
    (args: ToolArguments) => {
      const result = compileShowDocument(args.show, args.inline_patterns ?? [], evaluationOptions(args))
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'measure_show',
    {
      title: 'Measure a Show with the tier-1 telemetry harness',
      description:
        'Compiles a valid ShowRecord and renders it headlessly at low pixel count with deterministic ' +
        'virtual time, returning the structured telemetry report (luminance, temporal energy, coverage, ' +
        'palette, dark/static events), the language summary, and the photosensitive flicker-gate verdict. ' +
        'A failing gate is terminal — the Show must not run on hardware until fixed. Local-only: this tool ' +
        'executes generated Pattern code. Defaults: the Show’s own timeline length, 64 pixels, 60 fps ' +
        '(full 3–30 Hz flicker band).',
      inputSchema: {
        show: showArgument,
        inline_patterns: inlinePatternsArgument,
        stage_dimension: stageDimensionArgument,
        target_pixel_count: targetPixelCountArgument,
        duration_seconds: z.number().positive().optional()
          .describe('Measurement window; defaults to the Show’s timeline length (clamped 1–600 s)'),
        pixel_count: z.number().int().min(4).max(4096).optional().describe('Modeled pixel count (default 64)'),
        fps: z.number().int().min(1).max(240).optional()
          .describe('Virtual frames/second (default 60; below 60 narrows the analyzed flicker band)'),
        random_seed: z.number().int().optional().describe('Shim seed (default 207); same inputs → identical report'),
      },
    },
    (args: ToolArguments & {
      duration_seconds?: number
      pixel_count?: number
      fps?: number
      random_seed?: number
    }) => {
      const result = measureShowDocument(args.show, args.inline_patterns ?? [], {
        ...evaluationOptions(args),
        durationSeconds: args.duration_seconds,
        pixelCount: args.pixel_count,
        fps: args.fps,
        randomSeed: args.random_seed,
      })
      if (!result.ok) return jsonResult(result, true)
      // A failed gate is a successful measurement with a terminal verdict:
      // hand back the full report (the agent needs it to fix the Show) but
      // mark the call as an error so the failure cannot be skimmed past.
      return jsonResult(result, !result.flickerGatePassed)
    },
  )

  server.registerTool(
    'critique_show',
    {
      title: 'Structural critique of a Show document',
      description:
        'Advisory heuristics over a valid ShowRecord: pacing monotony, adjacent pattern repetition, ' +
        'transition variety, dimensional fit, and unused byte-budget headroom. Every finding is a ' +
        '"suggestion" — this tool never blocks; legality is validate_show, measurement is telemetry. ' +
        'Zero findings means structurally unremarkable, not good.',
      inputSchema: {
        show: showArgument,
        inline_patterns: inlinePatternsArgument,
        stage_dimension: stageDimensionArgument,
      },
    },
    (args: ToolArguments) => {
      const prepared = prepareShowDocument(args.show, args.inline_patterns ?? [])
      if ('errors' in prepared) {
        return jsonResult(
          {
            error: 'The document is not a valid ShowRecord; run validate_show for the full report.',
            errors: prepared.errors,
          },
          true,
        )
      }
      // The budget-headroom rule wants the real ratio; a tier-0 compile is
      // cheap (tens of ms) and its failure only mutes that one rule.
      const compiled = compileShowDocument(args.show, args.inline_patterns ?? [], evaluationOptions(args))
      const findings = critiqueShow(prepared.prepared.show, {
        userPatterns: prepared.prepared.userPatterns,
        budgetRatio: compiled.ok ? compiled.summary.artifactBudgetRatio : undefined,
      })
      return jsonResult({ findings })
    },
  )

  server.registerTool(
    'list_stock_patterns',
    {
      title: 'List the stock pattern catalogue',
      description:
        'Every stock pattern available to {"kind":"stock"} references: id, native dimensionality ' +
        '(a portable-2d Show needs 2D, or 1D via adaptation — never 3D-only), authors, and a brief ' +
        'character description from the pattern’s own header.',
      inputSchema: {},
    },
    () => jsonResult(listStockPatterns()),
  )

  server.registerTool(
    'get_stock_pattern',
    {
      title: 'Fetch one stock pattern',
      description: 'Full source and metadata (render entry points, authors, size) for one catalogue id.',
      inputSchema: { id: z.string().describe('Catalogue id from list_stock_patterns') },
    },
    ({ id }: { id: string }) => {
      try {
        return jsonResult(getStockPattern(id))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  )

  // Editing sessions and the generated grammar tools (#17). The session store
  // is per server instance; sessions live in memory until closed.
  const sessions = options.sessions ?? createSessionStore()
  const sessionIdArgument = z.string().describe('Session id returned by open_show')

  server.registerTool(
    'open_show',
    {
      title: 'Open a Show for grammar editing',
      description:
        'Open an in-memory editing session over a ShowRecord JSON document. The document is tier-0 ' +
        'validated and normalized to the composition shape, and the result carries a session id plus a ' +
        'compact clip listing (clip ids, Zones, layers, global time ranges) for addressing clips in the ' +
        'grammar operations. Several sessions may coexist; each operation applies immediately and refuses ' +
        'with typed issues rather than committing an invalid document.',
      inputSchema: {
        show: showArgument,
        inline_patterns: inlinePatternsArgument,
        stage_dimension: stageDimensionArgument,
        target_pixel_count: targetPixelCountArgument,
      },
    },
    (args: ToolArguments) => {
      const result = sessions.open(args.show, args.inline_patterns ?? [], evaluationOptions(args))
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'export_show',
    {
      title: 'Export the session document',
      description:
        'Return the session’s current ShowRecord document, reflecting every accepted operation. The ' +
        'session stays open.',
      inputSchema: { session_id: sessionIdArgument },
    },
    ({ session_id }: { session_id: string }) => {
      const result = sessions.export(session_id)
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'close_session',
    {
      title: 'Close an editing session',
      description: 'Drop an editing session and its in-memory document. Export first to keep the result.',
      inputSchema: { session_id: sessionIdArgument },
    },
    ({ session_id }: { session_id: string }) => {
      const result = sessions.close(session_id)
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'begin_edit',
    {
      title: 'Begin a transaction',
      description:
        'Open a transaction on an editing session: subsequent operations apply to a working copy with ' +
        'tier-0 validation deferred to commit_edit, and the whole transaction becomes one history entry ' +
        '(one undo step). Transactions do not nest. An operation called outside a transaction is ' +
        'auto-wrapped and committed as its own single-operation entry.',
      inputSchema: {
        session_id: sessionIdArgument,
        label: z.string().optional().describe('History label for the transaction (default "edit")'),
      },
    },
    ({ session_id, label }: { session_id: string; label?: string }) => {
      const result = sessions.begin(session_id, label)
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'commit_edit',
    {
      title: 'Commit the open transaction',
      description:
        'Validate the transaction’s working copy through tier-0 and, if it passes, commit it as one ' +
        'history entry, returning the structured change list and a one-line summary. A failing commit is ' +
        'refused with the typed issues and the transaction stays open for correction (fix and commit ' +
        'again, or rollback_edit).',
      inputSchema: { session_id: sessionIdArgument },
    },
    ({ session_id }: { session_id: string }) => {
      const result = sessions.commit(session_id)
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'rollback_edit',
    {
      title: 'Discard the open transaction',
      description: 'Discard every operation applied since begin_edit; the document and history are untouched.',
      inputSchema: { session_id: sessionIdArgument },
    },
    ({ session_id }: { session_id: string }) => {
      const result = sessions.rollback(session_id)
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'undo',
    {
      title: 'Undo the last committed entry',
      description:
        'Restore the document to before the most recent history entry (one transaction or one ' +
        'auto-wrapped operation). Refused while a transaction is open.',
      inputSchema: { session_id: sessionIdArgument },
    },
    ({ session_id }: { session_id: string }) => {
      const result = sessions.undo(session_id)
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'redo',
    {
      title: 'Redo the last undone entry',
      description:
        'Reapply the most recently undone history entry. A new commit after undo clears the redo stack.',
      inputSchema: { session_id: sessionIdArgument },
    },
    ({ session_id }: { session_id: string }) => {
      const result = sessions.redo(session_id)
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'describe_changes',
    {
      title: 'Describe committed changes',
      description:
        'List the session’s history entries — label, one-line summary, and structured change list per ' +
        'entry — or one entry by index. When the session has used the generic set_field/apply_patch ' +
        'backstops, the log of those uses rides along as genericUse.',
      inputSchema: {
        session_id: sessionIdArgument,
        entry_index: z.number().int().min(0).optional().describe('One entry (0 is the oldest); omit for all'),
      },
    },
    ({ session_id, entry_index }: { session_id: string; entry_index?: number }) => {
      const result = sessions.describeChanges(session_id, entry_index)
      if (!result.ok) return jsonResult(result, true)
      const genericUse = sessions.genericUse(session_id)
      return jsonResult({
        ...result,
        ...(genericUse.ok && genericUse.uses.length > 0 ? { genericUse: genericUse.uses } : {}),
      })
    },
  )

  const refusal = (code: 'invalid-argument', message: string) => ({ ok: false, issues: [{ code, message }] })

  const RESOLVE_RULE =
    ' Ids must come from the open_show listing, describe_show, or resolve_reference — resolve before ' +
    'acting; on ambiguity ask, never guess.'
  const CLIP_REFERENT_RULE =
    ' Instead of clip_id you may give clip, a referent the operation resolves itself: { hovered: true } ' +
    'for "that clip", { selected: true }, { at_playhead: true }, { at_ms }, { pattern_name }, or ' +
    '{ ordinal, zone }. An ambiguous referent is refused with the candidates — ask the user which; ' +
    'a referent matching nothing is refused with the nearest clips.'
  const clipReferentArgument = z.object({
    hovered: z.boolean().optional().describe('"That clip": the clip under the cursor'),
    selected: z.boolean().optional().describe('"This clip": the selection'),
    at_ms: z.number().optional().describe('The clip playing at a global time'),
    at_playhead: z.boolean().optional().describe('The clip under the playhead'),
    pattern_name: z.string().optional().describe('Pattern name, spacing and case ignored'),
    ordinal: z.number().int().min(1).optional().describe('1-based position by start time (within zone if given)'),
    zone: z.string().optional().describe('Zone id or name'),
  }).describe('A clip referent, resolved by the operation (alternative to clip_id)')
  for (const operation of SHOW_GRAMMAR_OPERATIONS) {
    const takesIds = Object.keys(operation.inputShape).some((name) => name.endsWith('_id'))
    const takesClip = 'clip_id' in operation.inputShape
    const inputSchema = takesClip
      ? {
          session_id: sessionIdArgument,
          ...operation.inputShape,
          clip_id: (operation.inputShape.clip_id as z.ZodString).optional(),
          clip: clipReferentArgument.optional(),
        }
      : { session_id: sessionIdArgument, ...operation.inputShape }
    server.registerTool(
      operation.name,
      {
        title: `Grammar operation: ${operation.name}`,
        description: operation.description + (takesIds ? RESOLVE_RULE : '') + (takesClip ? CLIP_REFERENT_RULE : ''),
        inputSchema,
      },
      (args: { session_id: string } & Record<string, unknown>) => {
        const { session_id, clip, ...rest } = args
        if (takesClip) {
          const referent = clip as ReferenceQuery | undefined
          if (referent !== undefined && rest.clip_id !== undefined) {
            return jsonResult(refusal('invalid-argument', 'Give clip_id or clip, not both.'), true)
          }
          if (referent === undefined && rest.clip_id === undefined) {
            return jsonResult(refusal('invalid-argument', 'Give clip_id (from the projection) or clip (a referent the operation resolves).'), true)
          }
          if (referent !== undefined) {
            const resolved = sessions.resolve(session_id, { ...referent, kind: 'clip' })
            if (!resolved.ok) return jsonResult(resolved, true)
            if (resolved.resolution === 'ambiguous') {
              return jsonResult({
                ok: false,
                issues: [{
                  code: 'ambiguous-referent',
                  message: resolved.message,
                  remedy: 'Ask the user which one they mean, then call again with its clip_id.',
                  candidates: resolved.candidates.map((candidate) => candidate.id),
                }],
                candidates: resolved.candidates,
              }, true)
            }
            if (resolved.resolution === 'none') {
              return jsonResult({
                ok: false,
                issues: [{
                  code: 'unknown-clip',
                  message: resolved.message,
                  remedy: 'Tell the user nothing matched; do not guess.',
                }],
              }, true)
            }
            rest.clip_id = resolved.candidates[0].id
          }
        }
        const result = sessions.apply(session_id, operation.name, rest)
        return jsonResult(result, !result.ok)
      },
    )
  }

  const editorContextShape = {
    selected_clip_ids: z.array(z.string()).optional(),
    hovered_clip_id: z.string().optional(),
    playhead_ms: z.number().optional(),
    visible_range: z.object({ start_ms: z.number(), end_ms: z.number() }).optional(),
    active_zone_id: z.string().optional(),
    inspector_tab: z.string().optional(),
  }

  function toEditorContext(args: Record<string, unknown>): EditorContext {
    const context: EditorContext = {}
    if (args.selected_clip_ids !== undefined) context.selectedClipIds = args.selected_clip_ids as string[]
    if (args.hovered_clip_id !== undefined) context.hoveredClipId = args.hovered_clip_id as string
    if (args.playhead_ms !== undefined) context.playheadMs = args.playhead_ms as number
    if (args.visible_range !== undefined) {
      const range = args.visible_range as { start_ms: number; end_ms: number }
      context.visibleRange = { startMs: range.start_ms, endMs: range.end_ms }
    }
    if (args.active_zone_id !== undefined) context.activeZoneId = args.active_zone_id as string
    if (args.inspector_tab !== undefined) context.inspectorTab = args.inspector_tab as string
    return context
  }

  server.registerTool(
    'set_editor_context',
    {
      title: 'Set the editor context',
      description:
        'Replace the session’s editor context — what the user is looking at: selected clip ids, hovered ' +
        'clip, playhead position, visible time range, active Zone, inspector tab. Omitted fields become ' +
        'unset. The harness (later the IDE) writes this; the agent reads it and resolve_reference uses it ' +
        'for "that clip" and "under the playhead".',
      inputSchema: { session_id: sessionIdArgument, ...editorContextShape },
    },
    (args: { session_id: string } & Record<string, unknown>) => {
      const { session_id, ...rest } = args
      const result = sessions.setContext(session_id, toEditorContext(rest))
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'get_editor_context',
    {
      title: 'Read the editor context',
      description:
        'Return the session’s editor context: what is selected, hovered, and at the playhead. Unset ' +
        'fields are absent.',
      inputSchema: { session_id: sessionIdArgument },
    },
    ({ session_id }: { session_id: string }) => {
      const result = sessions.getContext(session_id)
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'resolve_reference',
    {
      title: 'Resolve a described element to ids',
      description:
        'Turn a described element into candidate ids with human descriptions, before acting on it. ' +
        'Sources: hovered ("that clip"), selected ("this clip"), a global time (at_ms) or the playhead ' +
        '(at_playhead), a pattern name, a 1-based ordinal within a Zone, and a Zone constraint; kind ' +
        '"junction" resolves junctions by time. The result is unique, ambiguous (ask the user which one — ' +
        'never guess), or none (say so; nearest matches are listed).',
      inputSchema: {
        session_id: sessionIdArgument,
        kind: z.enum(['clip', 'junction']).optional(),
        hovered: z.boolean().optional(),
        selected: z.boolean().optional(),
        at_ms: z.number().optional(),
        at_playhead: z.boolean().optional(),
        pattern_name: z.string().optional(),
        ordinal: z.number().int().min(1).optional(),
        zone: z.string().optional().describe('Zone id or name'),
      },
    },
    (args: { session_id: string } & ReferenceQuery) => {
      const { session_id, ...query } = args
      const result = sessions.resolve(session_id, query)
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'describe_show',
    {
      title: 'Describe the Show compactly',
      description:
        'The Show as the user sees it, with stable ids the operations accept: Scenes, Zones and layers, ' +
        'clips with time ranges, pattern names, instances, tracks (with keyframe counts) and Effects, ' +
        'junctions with kinds and durations, and markers. Reads the open transaction’s working copy when ' +
        'one is open. Operation results already describe the state after an edit; use this to orient, ' +
        'not to confirm.',
      inputSchema: { session_id: sessionIdArgument },
    },
    ({ session_id }: { session_id: string }) => {
      const result = sessions.describe(session_id)
      return jsonResult(result, !result.ok)
    },
  )

  server.registerTool(
    'evaluate_property_at',
    {
      title: 'Evaluate a property track at a time',
      description:
        'Return a property track’s animated value at a global time, using the engine’s own evaluator ' +
        '("opacity at 5 s is 0.6") — the way to confirm keyframe edits without rendering. Outside the ' +
        'track’s keyframe span the edge value holds.',
      inputSchema: {
        session_id: sessionIdArgument,
        track_id: z.string().describe('Property track id'),
        at_ms: z.number().describe('Global timeline milliseconds'),
      },
    },
    ({ session_id, track_id, at_ms }: { session_id: string; track_id: string; at_ms: number }) => {
      const result = sessions.evaluate(session_id, track_id, at_ms)
      return jsonResult(result, !result.ok)
    },
  )

  server.registerResource(
    'show-record-schema',
    'pxlblz://schemas/show-record',
    {
      title: 'ShowRecord JSON Schema',
      description:
        'Generated draft-07 schema for the ShowRecord authoring document — the structural contract ' +
        'validate_show and compile_show enforce.',
      mimeType: 'application/schema+json',
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'application/schema+json', text: readFileSync(showRecordSchemaPath, 'utf8') }],
    }),
  )

  server.registerResource(
    'show-data-model',
    'pxlblz://docs/show-data-model',
    {
      title: 'Show data model (authoring reference)',
      description:
        'Semantics the schema cannot express: Scenes, Zones, Zone Layouts, Cells, Transitions, output ' +
        'contracts, budgets, and a minimal-valid-Show checklist.',
      mimeType: 'text/markdown',
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: readFileSync(showDataModelPath, 'utf8') }],
    }),
  )

  return server
}
