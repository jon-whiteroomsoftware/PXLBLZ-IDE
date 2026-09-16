# Show checkpoint binding contract

`compileShow` reconciles browser replay metadata against the final compacted
source once, using `inspectPatternMetadata`. This changes checkpoint capture
and restoration, without changing generated Pixelblaze source, Precise emission
or EPE bytes. Native and legacy Shows share this compiler seam.

## Binding authority

- `patternVars` retains the existing semantic watcher names, including compiler
  slots unavailable in a particular artifact. An unavailable slot has no
  declared runtime binding and reads as `undefined` under the existing loader
  policy.
- `patternVarBindings` maps a semantic watcher name only when its compacted
  target is an actual final-source global declaration. A compaction-map entry
  alone is insufficient: references to an undeclared compiler slot can also
  receive compacted names.
- `runtimeVars` contains every actual final-source global, including generated
  scheduler, render-cache and arena state, and declared-but-uninitialized
  variables. Animation visibility does not determine this declaration set.
- `patternFunctions` comes from the same inspection. Mutable function-valued
  state can therefore restore to the matching function in another evaluated
  copy of the artifact.

Exported variables, controls, semantic names, renderer dimensions and existing
deterministic-replay analysis retain their authority. State-pure replay remains
eligible only when its required normalized semantic bindings are available.
The loader and replay engine keep strict errors for externally supplied aliases
that claim nonexistent declared storage; this contract does not catch or
silently discard invalid state.

## Capture and restore

A real imported EPE executed with the freshly compiled metadata must capture
before first execution and after execution. Snapshot → advance across a Show
loop → restore → replay must deliver the same frames, exported state and
subsequent private/cache/scheduler state as cold replay of the same artifact
with the same map, seed, fidelity and contribution schedule. Fast and Precise
are separate comparisons, not interchangeable numerical oracles.

Semantic aliases and compacted runtime keys can refer to the same array/object.
The existing snapshot clone context preserves those aliases and cycles across
both key sets. Function-binding tokens preserve mutable function values;
declared-but-undefined globals restore to `undefined` after later initialization.
Unavailable semantic watch entries remain unavailable and do not manufacture
runtime storage.

## Compatibility and evidence

EPE persistence stores source rather than this browser metadata. The existing
`prepareFastReplay(importedSource, libraries)` rebundle path already inspects
actual declarations. Persisted EPEs need no migration. Recompiling replaces old
in-memory metadata; checkpoint cache keys use artifact object identity, so the
new artifact retires old-schema checkpoints even when source bytes are equal.

`showCheckpointBindingsV2.test.ts` exercises actual native Show reopen,
preparation, compile, EPE export/import and Fast/Precise snapshot restoration.
It covers no-Transition Live/Freeze/Strobe, positive live/snapshot Crossfade,
true Restart, cyclic aliases, function-valued private state, uninitialized
globals, strict stale metadata and compiler-proven skipped traversal. Literal
pre-repair Live/Freeze source, Precise and EPE digests protect delivered bytes.
The evidence packet is `docs/reference/evidence/issue-1038-checkpoint-bindings/`.

This slice does not claim new compiler eligibility, a browser UI proof, hardware
checkpoint support or completion of all native authoring work in #1038.
