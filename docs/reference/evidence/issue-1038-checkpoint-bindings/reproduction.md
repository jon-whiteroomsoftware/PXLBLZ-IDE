# Checkpoint metadata defect and consumer proof

Authority: Scene specification `31d428c9f9cdb8f14db3182cc21c81356996cc7c`,
RESTART/ROUTE/CONTINUITY/PARITY; Show deterministic replay contract in the
Technical Reference §24. This slice changes final compiler metadata only.

## Actual imported artifacts

`live.epe` and `freeze.epe` are complete native exports captured before repair
at `7523b463`. The test imports the generated export through `parseEpe`, compares
it exactly to these original files, and executes the imported source with
fresh compiler metadata and regenerated Precise code.

Both records prepare successfully: a single continuous 0–1000 ms Clip, Continue
entry, one runtime, no positive Transition, static Live or Freeze. Their Pattern
source is:

```js
export var elapsed=0
export function beforeRender(delta){elapsed+=delta}
export function render2D(index,x,y){rgb(x,elapsed/2000,y/2)}
```

The replay map has two samples/positions `[.25,.5]` and `[.75,.5]`, seed1038 and
1 ms steps. Consumer comparisons keep this same first-contribution schedule.

## Original failure and enforcement layer

Initial capture with original compiler metadata throws a compacted-binding
`ReferenceError` in Fast and Precise. The missing binding corresponds to the
semantic `__pxlblz_show_mix`: no positive Transition requires its declaration,
but an unused scheduler assignment references it. Compaction names references
as well as declarations. The compiler previously treated a compaction-map entry
as proof of declared storage, and the strict loader directly read that alias.
Earlier execution can leak that undeclared assignment into the process global
object and mask initial failure. The regression models a fresh page by clearing
only falsely registered undeclared bindings, restoring previous descriptors
after the test.

Removing that false alias alone is insufficient. Original snapshots also omit
real cache/scheduler globals. Advance300 → snapshot → advance1300 across loop →
restore300 → replay900 produces Freeze green0.5 instead of cold0.0005 in Fast,
and0.1504974365234375 instead of0.0005035400390625 in Precise. Cold execution
uses the same source, map, seed, mode and retained Clip contribution schedule.
Existing `prepareFastReplay(imported.src,{})` source rebundling captures actual
globals and passes on the same imported bytes. The compiler's declaration
metadata is therefore the bounded enforcement seam; EPE headers and runtime
error handling are not the cause.

## Corrected proof

`showCheckpointBindingsV2.test.ts` covers both failures and sweeps the class:

- Capture before execution without registering nonexistent storage.
- Live/Freeze/Strobe loop restore, positive live/snapshot Crossfade and real
  Restart; restored frames equal cold compiler and source-rebundle delivery.
- Full runtime snapshots, exported state and later1600 ms frames/state prove
  restoration beyond one coincidentally equal frame.
- Shared cyclic arrays remain shared across semantic and compacted state keys;
  mutable function values restore and execute; actual declared undefined storage
  returns to undefined after initialization.
- Compiler-proven skipped traversal retains exact delivered state relative to
  full traversal. Externally stale declared aliases still throw.
- Original source, Precise re-emission and EPE bytes remain exact. Each mode
  compares only against its corresponding cold execution; no Fast/Precise
  numerical equivalence claim is made.

Four scoped faults were killed by those consumers: reference-only alias
registration, missing runtime declarations, alias-only global capture and an
empty function registry. The first throws during capture; the next two cause
actual Freeze/Crossfade drift; the last breaks mutable callback restoration.

The affected product surface is newly compiled Show checkpoint capture,
prewarm and warm replay, shared by native and legacy Shows. Persisted EPE source
rebundling already has declaration-backed metadata; no data migration or source
rewriting is required. Old in-memory compiler metadata requires recompilation.
Artifact-object checkpoint identity prevents reuse of old snapshots with the
replacement artifact. Browser UI prewarm and hardware behavior are not claimed
by this pure consumer proof.
