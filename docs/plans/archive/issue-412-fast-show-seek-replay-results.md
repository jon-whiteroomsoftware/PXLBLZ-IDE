# Issue #412 - Fast Show seek replay results

Date: 2026-07-11
Machine/runtime: Apple Silicon macOS (`darwin/arm64`), Node 24.14.0
Runner: `npm run issue412`

## Decision

Ship the first Show timeline seek path as an accurate **Fast-mode replay from
time zero** at the Show's full preview pixel count:

- rebuild a fresh Pattern/Show runtime;
- restore the Show-owned random seed and deterministic input schedule;
- advance at a canonical 60 Hz fixed step;
- execute every `beforeRender` and every per-pixel renderer call, including
  render-side mutations;
- discard intermediate RGB frames and retain only the target frame; and
- continue playback from the reconstructed runtime.

Do **not** put checkpointing, cached frames, downsampling, reduced pixel counts,
or a separate low-fidelity seek renderer in the first implementation. Those are
end-of-epic optimization candidates only if telemetry and real authored Shows
demonstrate a need. The 2,048-pixel cases below are an intentional stress ceiling,
not the expected installation.

The first implementation still needs cancellable, periodically yielding replay.
That is transport responsiveness, not a caching strategy: a newer seek replaces
the old one, and the main thread yields often enough for the playhead and status
UI to remain responsive.

## What the spike added

- `src/engine/fastReplay.ts` prepares a Fast artifact, constructs a fresh
  runtime, advances to a target at fixed steps, and reports the target checksum,
  exported state, frame count, and outer renderer calls.
- `ShimConfig.randomSeed` gives `random()` an owned deterministic stream for
  replay while ordinary previews still begin from a fresh random seed.
- `RenderLoop.tickHeadless()` retains all Pattern and render-side state effects
  without allocating or painting an intermediate RGB frame.
- `test/perf-harness/issue412.ts` runs four execution shapes across 256, 1,024,
  and 2,048 pixels and 15, 60, and 180 second seek targets.

The benchmark fixtures are:

1. **cheap** - a simple 2D hue field;
2. **stateful render mutation** - arrays, seeded `random()`, and state mutation
   from `render2D`;
3. **route wipe** - two eight-layer trigonometric Patterns in a repeating
   one-renderer-per-pixel wipe Show; and
4. **crossfade** - the same heavy Patterns in repeating two-renderer crossfade
   windows.

The route/crossfade fixtures are intentionally expensive. They establish the
tail of the envelope rather than predicting the median Show.

## Correctness

Fresh replay and uninterrupted/segmented fixed-step playback produced identical
target-frame checksums for all four fixtures at the verification point:

| Fixture | Checksum | Match |
|---|---:|:---:|
| cheap | `d9be6083` | yes |
| stateful render mutation | `0b898dc7` | yes |
| route wipe | `9225b113` | yes |
| crossfade | `e244a1fc` | yes |

The render-mutating unit fixture also proves that a five-frame replay over four
pixels performs all 20 renderer calls. Intermediate RGB can be discarded, but
intermediate render execution cannot be skipped safely.

An initial run exposed floating-point accumulation adding a 901st near-zero
frame at an exact 15-second/60-Hz boundary. A regression test now requires
exactly 900 frames and 3,600 calls for four pixels; the replay loop uses a
step-relative epsilon only to suppress that numerical residue.

## Measured replay time

Times are wall-clock milliseconds from the final true-headless run. Runtime
construction was generally **0.09-0.53 ms** and is not the material cost.

### Representative 256-pixel installation

| Execution shape | 15 s | 60 s | 180 s | Replay multiple at 15 s |
|---|---:|---:|---:|---:|
| cheap | 65 ms | 244 ms | 845 ms | 232x |
| stateful render mutation | 113 ms | 442 ms | 1,319 ms | 133x |
| heavy route wipe | 335 ms | 1,489 ms | 4,480 ms | 45x |
| heavy repeating crossfade | 249 ms | 1,126 ms | 3,095 ms | 60x |

The 15-second simple case varied from about 55 to 116 ms across three full
matrix runs under changing development-machine load. Product behavior should
therefore use a delayed status indicator rather than promise a hard single-run
threshold.

### Large 1,024-pixel installation

| Execution shape | 15 s | 60 s | 180 s | Replay multiple at 15 s |
|---|---:|---:|---:|---:|
| cheap | 276 ms | 1,172 ms | 4,584 ms | 54x |
| stateful render mutation | 444 ms | 1,771 ms | 5,134 ms | 34x |
| heavy route wipe | 1,352 ms | 5,409 ms | 17,041 ms | 11x |
| heavy repeating crossfade | 1,032 ms | 4,617 ms | 17,804 ms | 15x |

### 2,048-pixel stress ceiling

| Execution shape | 15 s | 60 s | 180 s | Replay multiple at 15 s |
|---|---:|---:|---:|---:|
| cheap | 477 ms | 1,971 ms | 6,132 ms | 31x |
| stateful render mutation | 826 ms | 7,276 ms | 21,409 ms | 18x |
| heavy route wipe | 2,702 ms | 10,827 ms | 28,385 ms | 6x |
| heavy repeating crossfade | 3,652 ms | 10,065 ms | 25,012 ms | 4x |

Two thousand pixels is near the practical outside edge of ordinary Pixelblaze
installations: power, controller load, wiring/network topology, physical cost,
and Pattern choice all become material constraints. These results justify
honest progress/cancellation behavior and future optimization runway, but they
do not justify burdening v1 with checkpoint or downsample architecture.

## Memory observations

Per-case `heapUsed` deltas were noisy and sometimes negative because garbage
collection ran between samples. True headless replay removed the permanent
per-frame RGB accumulation; no case retained a frame history. Observed deltas
were temporary working-set churn rather than evidence for a cache budget.

A production performance monitor should measure replay duration and perhaps
long-task duration. It should not interpret one `heapUsed` delta as peak memory.

## Product and runtime contract

### Seek interaction

1. Dragging the playhead updates position/time without repeatedly rebuilding.
2. Dropping pauses transport and starts replay from zero.
3. Replay runs at full Show preview pixel count in Fast mode.
4. A status such as **Rebuilding preview...** appears only after a short delay,
   avoiding a flash for quick seeks.
5. Replay yields periodically and observes a monotonic seek token or abort
   signal; a newer seek cancels the obsolete replay.
6. The target frame paints once and the reconstructed runtime becomes the live
   runtime from which Space resumes playback.

### Determinism

The Show preview runtime must own:

- its `random()` seed;
- fixed simulation cadence;
- initial control/property values; and
- any scheduled automation/input values applied during replay.

Explicit `prng()` remains governed by the Pattern's `prngSeed` calls and the
fresh shim's default PRNG state. The Fast preview is deterministic with respect
to its own algorithms; it does not claim bit-identical firmware randomness or
fixed-point arithmetic.

Wall-clock and external sensor inputs are a separate honesty boundary. Accurate
replay requires either a frozen wall-clock/input snapshot or a recorded/scheduled
input stream. Live unrecorded sensor history cannot be reconstructed from Show
time alone and must not be described as exactly seekable.

### First-version scope

Include:

- fresh-runtime construction;
- seeded, fixed-step, full-resolution Fast replay;
- true headless intermediate ticks;
- delayed rebuild status;
- yielding and cancellation; and
- target-frame handoff to normal playback.

Defer to the end of the implementation epic:

- scene-boundary runtime checkpoints;
- cached target frames or thumbnails;
- downsampled or reduced-pixel replay;
- alternate seek-only timesteps/fidelity; and
- worker/off-main-thread execution.

Only promote a deferred optimization after instrumented real Shows demonstrate
that replay duration materially harms authoring.

## Implementation seam still needed

The spike's `advanceTo()` is synchronous so benchmark wall time is measurable.
Production should retain the same deterministic runtime but expose bounded
chunks (for example, advance until an 8 ms CPU budget is consumed), yielding
between chunks and checking an abort/seek generation token. This changes wall
time slightly but not simulated steps or the final checksum.

No state serialization is needed for the first timeline implementation.
