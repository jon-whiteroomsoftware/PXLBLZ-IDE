// Dev-only deterministic frame-sequence capture for the Show stage preview
// (#879). Mirrors src/dev/captureSequence.ts for Patterns: the stage's
// fast-replay runtime is rebuilt at t=0 through the transport, pre-rolled
// headless to startMs, then stepped one fixed 1000/fps timestep per saved
// frame. Frame K therefore sits at exactly startMs + K * (1000/fps) virtual
// ms of Show time — the same frames a t=0 recording would have produced there.
//
// Recorded frames advance with `advanceLive`, the editor's own post-seek
// playback path; the pre-roll advances with `advanceTo` and no presented
// target frame, so nothing paints or touches the capture sink until frame 0.

import {
  runCaptureSequence,
  type CaptureSequenceOptions,
  type CaptureSequenceResult,
} from './captureSequence'

/** The slice of FastReplayRuntime and FastReplayResult the capture needs. */
export interface ShowStageCaptureRuntime<Frame = unknown> {
  getElapsedMs(): number
  renderCurrentFrame(): Frame
  advanceLive(deltaMs: number): Frame
  advanceTo(targetMs: number, advance: { stepMs: number; presentTargetFrame?: boolean }): Frame
}

export interface ShowStageCaptureDeps<Frame = unknown> {
  /** Stop transport-driven live playback before the runtime is rebuilt. */
  pause(): void
  /** Rebuild the replay runtime at Show time 0 (a transport seek) and resolve
   * with it once the rebuild has completed and painted. */
  resetToStart(): Promise<ShowStageCaptureRuntime<Frame>>
  /** Paint a replay result onto the stage canvas; the paint fulfils a pending
   * capture request from inside the renderer. */
  paint(frame: Frame): void
  /** Register a capture; resolves once the next painted frame has been saved. */
  requestCapture(name: string): Promise<unknown>
}

export async function runShowStageCaptureSequence<Frame>(
  deps: ShowStageCaptureDeps<Frame>,
  options: CaptureSequenceOptions,
): Promise<CaptureSequenceResult> {
  deps.pause()
  const runtime = await deps.resetToStart()
  if (runtime.getElapsedMs() !== 0) {
    throw new Error(`Show stage capture expected a runtime at t=0 after reset, got ${runtime.getElapsedMs()} ms.`)
  }
  return runCaptureSequence({
    requestCapture: (name) => deps.requestCapture(name),
    // Frame 0 presents the current state unadvanced; later frames advance one
    // timestep exactly as live playback does after a seek.
    tickFrame: (deltaMs) => deps.paint(deltaMs === 0 ? runtime.renderCurrentFrame() : runtime.advanceLive(deltaMs)),
    advanceHeadless: (deltaMs) => {
      runtime.advanceTo(runtime.getElapsedMs() + deltaMs, { stepMs: deltaMs, presentTargetFrame: false })
    },
  }, options)
}
