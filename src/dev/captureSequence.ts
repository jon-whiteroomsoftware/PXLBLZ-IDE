// Dev-only deterministic frame-sequence capture (#576).
//
// Steps the preview render loop one fixed timestep at a time, saving each
// painted frame through the `?capture` sink (previewCapture + /__capture).
// Frame K sits at exactly startMs + K * (1000/fps) virtual milliseconds,
// independent of wall-clock time and machine load — the sequence renders
// correctly even far slower than real time. An optional startMs (#879) is
// reached by a headless pre-roll in the same 1000/fps steps, so a clip cut from
// the middle of a Show or Pattern is exactly the frames a t=0 render would
// have produced there, without paying the sink cost for the discarded frames.
// Pairs with scripts/render-pattern.ts, which drives it headlessly and
// assembles the saved frames into a video.

export interface CaptureSequenceDeps {
  /** Register a capture; resolves once the next painted frame has been saved. */
  requestCapture(name: string): Promise<unknown>
  /** Advance the pattern by deltaMs and paint undimmed (RenderLoop.tickFrame). */
  tickFrame(deltaMs: number): void
  /** Advance the pattern by deltaMs without painting (RenderLoop.tickHeadless).
   * Used for the startMs pre-roll; falls back to tickFrame when absent. */
  advanceHeadless?(deltaMs: number): void
  /** Optional per-frame hook before capture (e.g. deterministic camera orbit). */
  onBeforeFrame?(deltaMs: number): void
}

export interface CaptureSequenceOptions {
  frames: number
  fps: number
  /** Frame-file prefix; frames save as `<prefix>-00000.png`. Default "frame". */
  prefix?: string
  /** Virtual time of frame 0. Reached by an unrecorded pre-roll. Default 0. */
  startMs?: number
  onProgress?(saved: number, total: number): void
}

export interface CaptureSequenceResult {
  frames: number
  deltaMs: number
  startMs: number
  names: string[]
  failures: { name: string; error: string }[]
}

export function sequenceFrameName(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(5, '0')}.png`
}

export async function runCaptureSequence(
  deps: CaptureSequenceDeps,
  options: CaptureSequenceOptions,
): Promise<CaptureSequenceResult> {
  const { frames, fps, prefix = 'frame', startMs = 0, onProgress } = options
  if (!Number.isInteger(frames) || frames <= 0) {
    throw new Error('Capture sequence frame count must be a positive integer.')
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('Capture sequence fps must be a positive finite number.')
  }
  if (!Number.isFinite(startMs) || startMs < 0) {
    throw new Error('Capture sequence startMs must be a non-negative finite number.')
  }
  const deltaMs = 1000 / fps
  const names: string[] = []
  const failures: CaptureSequenceResult['failures'] = []
  // Pre-roll: whole frame steps, then any remainder, summing exactly to
  // startMs. Headless when the runtime offers it — no paint, no sink.
  const advance = deps.advanceHeadless ?? deps.tickFrame
  for (const step of preRollSteps(startMs, deltaMs)) advance(step)
  for (let index = 0; index < frames; index += 1) {
    // The first frame presents t=0 unadvanced; every later frame advances one
    // timestep first, so frame K lands at exactly K * deltaMs virtual ms.
    const delta = index === 0 ? 0 : deltaMs
    const name = sequenceFrameName(prefix, index)
    deps.onBeforeFrame?.(delta)
    // Register before ticking: the tick's paint fulfils the pending request
    // with exactly the frame it just drew.
    const saved = deps.requestCapture(name)
    deps.tickFrame(delta)
    const result = (await saved) as { ok?: boolean; error?: string } | undefined
    if (result && result.ok === false) {
      failures.push({ name, error: result.error ?? 'capture failed' })
    }
    names.push(name)
    onProgress?.(index + 1, frames)
  }
  return { frames, deltaMs, startMs, names, failures }
}

/** Split startMs into whole deltaMs steps plus one shorter remainder, so the
 * pre-roll simulates at the recording's own frame rate. Steps are taken from
 * the remaining distance, never rounded up to a whole step, so they sum to
 * startMs and never overshoot; only sub-nanosecond float dust is dropped. */
export function preRollSteps(startMs: number, deltaMs: number): number[] {
  const steps: number[] = []
  let remaining = startMs
  while (remaining > 1e-9) {
    const step = Math.min(deltaMs, remaining)
    steps.push(step)
    remaining -= step
  }
  return steps
}
