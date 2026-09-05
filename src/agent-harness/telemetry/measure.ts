// Provenance: pxlblz-v3 src/telemetry/measure.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Tier-1 measurement of a ShowRecord document: compile through the pinned
// engine, then run the telemetry harness (including the flicker gate) on the
// generated artifact. Pure logic — the MCP tool is a thin wrapper.
//
// Runtime boundary: this path EXECUTES generated Pattern code. It exists only
// on the local server and must never join a stateless-hosted tier-0 surface.
import type { ShowRecord } from '@/engine/personalContentRecords'
import {
  compileShowDocument,
  prepareShowDocument,
  type InlinePattern,
  type ShowEvaluationOptions,
  type ShowIssue,
} from '../shows/evaluate.js'
import { runTelemetry, type TelemetryReport } from './harness.js'

export interface MeasureShowOptions extends ShowEvaluationOptions {
  /** Measurement window in seconds; defaults to the Show's own timeline
   * length (sum of Scene durations), clamped to [1s, 600s]. */
  durationSeconds?: number
  /** Modeled pixel count (default 64). */
  pixelCount?: number
  /** Frames per second of virtual time. Default 60 so the flicker gate
   * covers its full 3–30 Hz band (Nyquist). */
  fps?: number
  randomSeed?: number
}

export type MeasureShowResult =
  | { ok: false; reason: 'invalid-show'; errors: ShowIssue[] }
  | { ok: false; reason: 'execution-failed'; error: string }
  | {
      ok: true
      /** Terminal safety verdict, duplicated from report.flicker.pass for
       * fast checking. false means the Show must not run on hardware. */
      flickerGatePassed: boolean
      report: TelemetryReport
      compile: { artifactBytes: number; artifactBudgetRatio: number; clipCount: number; artifactBlocker?: string }
    }

export function showTimelineDurationMs(show: ShowRecord): number {
  return show.scenes.reduce((sum, scene) => sum + Math.max(0, scene.durationMs), 0)
}

export function measureShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: MeasureShowOptions = {},
): MeasureShowResult {
  const compiled = compileShowDocument(input, inlinePatterns, {
    stageDimension: options.stageDimension,
    targetPixelCount: options.targetPixelCount,
  })
  if (!compiled.ok) return { ok: false, reason: 'invalid-show', errors: compiled.errors }

  let durationMs: number
  if (options.durationSeconds !== undefined) {
    durationMs = Math.max(1, options.durationSeconds) * 1000
  } else {
    // prepareShowDocument already succeeded inside compileShowDocument, so
    // this re-parse cannot fail; it only recovers the typed record.
    const prepared = prepareShowDocument(input, inlinePatterns)
    const timelineMs = 'prepared' in prepared ? showTimelineDurationMs(prepared.prepared.show) : 0
    durationMs = Math.min(600_000, Math.max(1_000, timelineMs))
  }

  try {
    const report = runTelemetry(compiled.code, compiled.metadata, {
      durationMs,
      pixelCount: options.pixelCount,
      fps: options.fps ?? 60,
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
