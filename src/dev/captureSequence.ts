// Dev-only deterministic frame-sequence capture (#576).
//
// Steps the preview render loop one fixed timestep at a time, saving each
// painted frame through the `?capture` sink (previewCapture + /__capture).
// Frame K sits at exactly K * (1000/fps) virtual milliseconds, independent of
// wall-clock time and machine load — the sequence renders correctly even far
// slower than real time. Pairs with scripts/render-pattern.ts, which drives it
// headlessly and assembles the saved frames into a video.

export interface CaptureSequenceDeps {
  /** Register a capture; resolves once the next painted frame has been saved. */
  requestCapture(name: string): Promise<unknown>
  /** Advance the pattern by deltaMs and paint undimmed (RenderLoop.tickFrame). */
  tickFrame(deltaMs: number): void
  /** Optional per-frame hook before capture (e.g. deterministic camera orbit). */
  onBeforeFrame?(deltaMs: number): void
}

export interface CaptureSequenceOptions {
  frames: number
  fps: number
  /** Frame-file prefix; frames save as `<prefix>-00000.png`. Default "frame". */
  prefix?: string
  onProgress?(saved: number, total: number): void
}

export interface CaptureSequenceResult {
  frames: number
  deltaMs: number
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
  const { frames, fps, prefix = 'frame', onProgress } = options
  if (!Number.isInteger(frames) || frames <= 0) {
    throw new Error('Capture sequence frame count must be a positive integer.')
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('Capture sequence fps must be a positive finite number.')
  }
  const deltaMs = 1000 / fps
  const names: string[] = []
  const failures: CaptureSequenceResult['failures'] = []
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
  return { frames, deltaMs, names, failures }
}
