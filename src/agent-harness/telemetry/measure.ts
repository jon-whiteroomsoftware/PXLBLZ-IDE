// Provenance: pxlblz-v3 src/telemetry/measure.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Tier-1 measurement of a ShowRecord document: compile through the pinned
// engine, then run the telemetry harness (including the flicker gate) on the
// generated artifact. Pure logic — the MCP tool is a thin wrapper.
//
// Runtime boundary: this path EXECUTES generated Pattern code. It exists only
// on the local server and must never join a stateless-hosted tier-0 surface.
//
// #945 corrections (integration review): the default window is V2's canonical
// loop duration (Scene holds plus visual transitions, or a longer explicit
// end) rather than the Scene-hold sum, so a final transition tail is
// measured; and every window and frame rate is bounded before execution -
// an explicit window used to have only a lower bound, so a large request
// could run the synchronous frame loop without end.
import type { ShowRecord } from '@/engine/personalContentRecords'
import { showLoopDurationMs } from '@/engine/showModel'
import {
  compileShowDocument,
  prepareShowDocument,
  type InlinePattern,
  type ShowEvaluationOptions,
  type ShowIssue,
} from '../shows/evaluate.js'
import { runTelemetry, type TelemetryReport } from './harness.js'

/** The advertised measurement envelope: every entry clamps into it or refuses. */
export const MEASURE_WINDOW_SECONDS = { min: 1, max: 600 } as const
export const MEASURE_FPS = { min: 1, max: 240 } as const

export interface MeasureShowOptions extends ShowEvaluationOptions {
  /** Measurement window in seconds; defaults to the Show's canonical loop
   * duration (showLoopDurationMs). Finite values clamp to [1s, 600s];
   * non-finite values are refused. */
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
      compile: { artifactBytes: number; artifactBudgetRatio: number; clipCount: number; artifactBlocker?: string }
    }

/** The Show's canonical loop duration, as V2 computes it (#945 correction:
 * this used to sum Scene holds only, omitting visual transitions and a
 * longer explicit composition end). */
export function showTimelineDurationMs(show: Pick<ShowRecord, 'scenes' | 'transitions' | 'composition'>): number {
  return showLoopDurationMs(show)
}

const clampWindowMs = (seconds: number) =>
  Math.min(MEASURE_WINDOW_SECONDS.max, Math.max(MEASURE_WINDOW_SECONDS.min, seconds)) * 1000

/** Bound the requested frame rate and (explicit) window before anything runs. */
function resolveOptions(options: MeasureShowOptions): { ok: true; fps: number; durationMs?: number } | { ok: false; error: string } {
  const fps = options.fps ?? 60
  if (!Number.isInteger(fps) || fps < MEASURE_FPS.min || fps > MEASURE_FPS.max) {
    return { ok: false, error: `fps must be an integer from ${MEASURE_FPS.min} to ${MEASURE_FPS.max}, got ${fps}.` }
  }
  if (options.durationSeconds === undefined) return { ok: true, fps }
  if (typeof options.durationSeconds !== 'number' || !Number.isFinite(options.durationSeconds)) {
    return { ok: false, error: `durationSeconds must be a finite number of seconds, got ${String(options.durationSeconds)}.` }
  }
  return { ok: true, fps, durationMs: clampWindowMs(options.durationSeconds) }
}

export function measureShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: MeasureShowOptions = {},
): MeasureShowResult {
  const resolved = resolveOptions(options)
  if (!resolved.ok) return { ok: false, reason: 'invalid-options', error: resolved.error }

  const compiled = compileShowDocument(input, inlinePatterns, {
    stageDimension: options.stageDimension,
    targetPixelCount: options.targetPixelCount,
  })
  if (!compiled.ok) return { ok: false, reason: 'invalid-show', errors: compiled.errors }

  let durationMs: number
  if (resolved.durationMs !== undefined) {
    durationMs = resolved.durationMs
  } else {
    // prepareShowDocument already succeeded inside compileShowDocument, so
    // this re-parse cannot fail; it only recovers the typed record.
    const prepared = prepareShowDocument(input, inlinePatterns)
    const timelineMs = 'prepared' in prepared ? showTimelineDurationMs(prepared.prepared.show) : 0
    durationMs = clampWindowMs(timelineMs / 1000)
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
        ...(compiled.artifactBlocker ? { artifactBlocker: compiled.artifactBlocker } : {}),
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
