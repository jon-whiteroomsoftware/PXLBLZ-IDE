// Provenance: pxlblz-v3 src/telemetry/measure.ts at 9ecd481f, re-authored onto the
// version-2 record for #1039 (see src/agent-harness/PROVENANCE.md).
// Tier-1 measurement of a Show document: compile through the pinned
// engine, then run the telemetry harness (including the flicker gate) on the
// generated artifact. Pure logic — the MCP tool is a thin wrapper.
//
// Runtime boundary: this path EXECUTES generated Pattern code. It exists only
// on the local server and must never join a stateless-hosted tier-0 surface.
//
// #945 corrections (integration review): every window and frame rate is bounded
// before execution - an explicit window used to have only a lower bound, so a
// large request could run the synchronous frame loop without end. The default
// window is the Show's own loop length, which in v2 is `composition.showEndMs`:
// Show End owns the loop, so a final Transition tail is measured without summing
// Scene holds.
//
// #945 repair (candidate review of a4e11cc0): the envelope is
// resolveTelemetryBounds in harness.ts, shared with the raw entry, so the
// direct API cannot bypass it. A non-positive explicit window is refused
// (it used to clamp up to 1 s); finite positive windows still clamp.
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import {
  compileShowDocument,
  prepareShowDocument,
  type InlinePattern,
  type ShowEvaluationOptions,
  type ShowIssue,
} from '../shows/evaluate.js'
import {
  resolveTelemetryBounds,
  runTelemetry,
  TELEMETRY_FPS,
  TELEMETRY_WINDOW_SECONDS,
  type TelemetryReport,
} from './harness.js'

/** The advertised measurement envelope: every entry clamps into it or refuses. */
export const MEASURE_WINDOW_SECONDS = TELEMETRY_WINDOW_SECONDS
export const MEASURE_FPS = TELEMETRY_FPS

export interface MeasureShowOptions extends ShowEvaluationOptions {
  /** Measurement window in seconds; defaults to the Show's own loop length
   * (`composition.showEndMs`). Finite positive values clamp to [1s, 600s];
   * non-finite or non-positive values are refused. */
  durationSeconds?: number
  /** Modeled pixel count (default 64). */
  pixelCount?: number
  /** Frames per second of virtual time, an integer in [1, 240]. Default 60
   * so the flicker gate covers its full 3–30 Hz band (Nyquist). */
  fps?: number
  randomSeed?: number
}

export type MeasureShowResult =
  | { ok: false; reason: 'invalid-show'; errors: ShowIssue[] }
  | { ok: false; reason: 'invalid-options'; error: string }
  | { ok: false; reason: 'execution-failed'; error: string }
  | {
      ok: true
      /** Terminal safety verdict, duplicated from report.flicker.pass for
       * fast checking. false means the Show must not run on hardware. */
      flickerGatePassed: boolean
      report: TelemetryReport
      compile: { artifactBytes: number; artifactBudgetRatio: number; clipCount: number }
    }

/** The Show's loop length. Show End owns it in v2 (specification section 3). */
export function showTimelineDurationMs(show: Pick<ShowRecordV2, 'composition'>): number {
  return show.composition.showEndMs
}

/** Bound the requested frame rate and (explicit) window before anything runs. */
function resolveOptions(options: MeasureShowOptions): { ok: true; fps: number; durationMs?: number } | { ok: false; error: string } {
  const fps = options.fps ?? 60
  if (options.durationSeconds === undefined) {
    // Bound the fps alone; the window is the Show's own once it has compiled.
    const bounds = resolveTelemetryBounds(1000, fps)
    return bounds.ok ? { ok: true, fps: bounds.fps } : bounds
  }
  if (typeof options.durationSeconds !== 'number' || !Number.isFinite(options.durationSeconds) || options.durationSeconds <= 0) {
    return { ok: false, error: `durationSeconds must be a finite positive number of seconds, got ${String(options.durationSeconds)}.` }
  }
  const bounds = resolveTelemetryBounds(options.durationSeconds * 1000, fps)
  return bounds.ok ? { ok: true, fps: bounds.fps, durationMs: bounds.durationMs } : bounds
}

export function measureShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: MeasureShowOptions = {},
): MeasureShowResult {
  const resolved = resolveOptions(options)
  if (!resolved.ok) return { ok: false, reason: 'invalid-options', error: resolved.error }

  const compiled = compileShowDocument(input, inlinePatterns, options)
  if (!compiled.ok) return { ok: false, reason: 'invalid-show', errors: compiled.errors }

  let durationMs: number
  if (resolved.durationMs !== undefined) {
    durationMs = resolved.durationMs
  } else {
    // prepareShowDocument already succeeded inside compileShowDocument, so
    // this re-parse cannot fail; it only recovers the typed record.
    const prepared = prepareShowDocument(input, inlinePatterns)
    const timelineMs = 'prepared' in prepared ? showTimelineDurationMs(prepared.prepared.show) : 0
    // A Show with no timeline still measures its first second.
    const bounds = resolveTelemetryBounds(Math.max(1, timelineMs), resolved.fps)
    if (!bounds.ok) return { ok: false, reason: 'invalid-options', error: bounds.error }
    durationMs = bounds.durationMs
  }

  try {
    const report = runTelemetry(compiled.code, compiled.metadata, {
      durationMs,
      pixelCount: options.pixelCount,
      fps: resolved.fps,
      randomSeed: options.randomSeed,
    })
    return {
      ok: true,
      flickerGatePassed: report.flicker.pass,
      report,
      compile: {
        artifactBytes: compiled.summary.artifactBytes,
        artifactBudgetRatio: compiled.summary.artifactBudgetRatio,
        clipCount: compiled.summary.clipCount,
      },
    }
  } catch (cause) {
    return {
      ok: false,
      reason: 'execution-failed',
      error:
        'The Show compiled but its generated Pattern failed during execution: ' +
        `${cause instanceof Error ? cause.message : String(cause)}. ` +
        'This usually means a member Pattern source has a runtime error; check inline_patterns sources first.',
    }
  }
}
