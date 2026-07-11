# Issue #421 - Show seek replay optimization decision

Date: 2026-07-11  
Machine/runtime: Apple Silicon macOS (`darwin/arm64`), Node 24.14.0  
Runner: `npm run issue412`  
Implementation under test: commits #414-#420 through `64e32d7`

## Decision

Keep the first Show seek implementation exactly as shipped in #414: rebuild a
fresh deterministic Fast runtime and replay every 60 Hz frame at the selected
Stage Map's full pixel count. Do not add checkpoints, cached frames or runtime
state, downsampling, representative pixels, alternate timesteps, or a worker.

The direct path is simple, exact for deterministic Pattern state, carries no
cache invalidation or memory-retention problem, and is fast enough for the
ordinary authoring envelope. Slow tail cases already have the correct product
behavior: a visible rebuilding state, periodic main-thread yields, and
last-seek-wins cancellation. Revisit optimization only after real authored Show
telemetry demonstrates a repeated usability problem.

## Go/no-go threshold

Use interaction behavior, not a single synthetic number, as the v1 gate:

- under 100 ms: feels immediate and should not flash progress UI;
- 100-1,000 ms: acceptable with the existing rebuilding state;
- over 1,000 ms: acceptable only when cooperative cancellation remains prompt;
  record real frequency before adding architecture.

The 2,048-pixel matrix is a deliberate outside-edge stress ceiling, not a target
for the median installation. A rare synthetic result above one second is
optimization evidence to retain, not by itself a reason to optimize v1.

## Completed-stack measurements

The complete #412 matrix was rerun after #414-#420. It executes the real Fast
shim and render loop, including every state-mutating renderer call, and discards
only intermediate RGB allocations. The four direct-versus-segmented checksum
pairs still match:

| Fixture | Checksum | Match |
|---|---:|:---:|
| cheap | `d9be6083` | yes |
| stateful render mutation | `0b898dc7` | yes |
| route wipe | `9225b113` | yes |
| crossfade | `e244a1fc` | yes |

Selected wall-clock results:

| Installation / execution shape | 15 s seek | 60 s seek | 180 s seek |
|---|---:|---:|---:|
| 256 px, cheap | 63 ms | 232 ms | 644 ms |
| 256 px, stateful mutation | 97 ms | 354 ms | 1,149 ms |
| 256 px, heavy route wipe | 133 ms | 576 ms | 1,639 ms |
| 256 px, heavy crossfade | 186 ms | 749 ms | 2,834 ms |
| 1,024 px, cheap | 198 ms | 888 ms | 2,619 ms |
| 2,048 px, cheap stress | 429 ms | 1,640 ms | 5,043 ms |
| 2,048 px, heavy route stress | 1,183 ms | 5,003 ms | 15,354 ms |
| 2,048 px, heavy crossfade stress | 1,942 ms | 6,467 ms | 21,111 ms |

The synthetic heavy Patterns each evaluate eight trigonometric layers. The
crossfade additionally calls two member renderers during its blend windows, so
the last row is intentionally much more expensive than an ordinary Show.

## Cancellation responsiveness

Production replay advances 250 ms of simulated Show time per chunk, yields to
the browser, then checks the monotonic seek request id. The engine regression
test changes that identity at the first yield and proves that replay returns
`null` after one chunk without installing obsolete work.

Using the measured replay multiples, the approximate CPU work between
cancellation opportunities is:

- 256-pixel ordinary/heavy cases: about 1-4 ms per chunk;
- 1,024-pixel heavy cases: about 10-14 ms per chunk; and
- the slowest 2,048-pixel stress case: about 29-32 ms per chunk.

Those figures exclude the browser's own scheduling delay after a yield, but the
implementation does not begin another replay chunk until control returns. A
newer request therefore prevents any additional obsolete chunk from starting.

## Memory and regression coverage

The replay runtime retains only current Pattern state and the target pixel
buffer. It does not retain intermediate frames, checkpoints, or a runtime
history. Per-case `heapUsed` deltas in the rerun ranged from roughly -13.6 MB to
+15.0 MB because garbage collection may occur between samples; they do not show
monotonic growth or a retained cache. Peak working-set telemetry would be needed
before assigning a memory budget to a future optimization.

Coverage protecting the decision:

- `src/engine/fastReplay.test.ts` verifies deterministic reconstruction,
  render-side mutations, exact fixed-step frame count, segmented equivalence,
  cooperative yielding, and stale-seek cancellation;
- `src/store/showTransportStore.test.ts` verifies last-seek-wins request state;
- `src/components/ShowStagePreview.test.tsx` verifies accurate Fast rebuild and
  handoff to the live preview; and
- `test/perf-harness/issue412.ts` remains the reproducible full matrix.

## Revisit trigger

Open a new optimization issue only when instrumented real Shows demonstrate a
repeated authoring problem. Capture Show duration, pixel count, transition kind,
Pattern cost shape, replay wall time, cancellation delay, and device class.
Choose the smallest exact mechanism that fixes the observed distribution. Keep
an explicit direct-replay fallback, and do not make approximation the default.

