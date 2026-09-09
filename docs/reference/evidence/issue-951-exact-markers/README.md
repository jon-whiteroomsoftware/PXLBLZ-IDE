# Exact marker evidence (#951)

The marker owner serves canonical commands, diagnostic descriptor adapters,
actual manual callbacks and legacy timeline helpers. It preserves unrelated
records rather than normalizing the whole composition.

Focused engine, canonical and grammar breadth/structure suites passed. Initial
canonical and diagnostic regressions failed because a same-time move stamped
updatedAt and emitted a change; both now return the complete original record.
Engine sequences cover times zero, interior, Show End and beyond, earlier/later
moves, name/color/time edits, clearing, duplicate and missing IDs, malformed
numbers, unrelated marker/Clip/track/Layout/Transition preservation, and mixed
no-op/changed transactions with Undo/Redo. MCP checks inspect published schemas
and actual protocol refusals.

The real scripted `MK951` browser sequence passed again at source commit
`d7892eb67031c8336f6933caf581f3451ec5f7bc` (18.0 seconds):
add→move→update produced one PATCH; the downloaded Show reopened through
`parseShowFileBundle` to the complete saved record. A wholly no-op batch and
missing-marker removal produced no writes. Removal preserved other content;
Undo restored removal, then the original batch in one step each. Synthetic
records and observations are asserted by the
[MK951 browser case](../../../../e2e/agent-baseline.auth.spec.ts). The authenticated browser boundary reported no
unexpected console or runtime errors. A first run lost its overlay after export
while generated documentation refreshed; the unchanged-source rerun passed.

Four targeted faults (shift exact time, skip no-op, accept missing removal,
remove unrelated Scenes) were detected by behavioral tests; the source was
restored after each. [Fault records](faults.json) retain the outcomes.
Coordinator manual in-app-browser proof at that same source commit passed:
Add Marker, trimmed name, exact 7.125-second edit, repeated-time no-op followed
by Undo/Redo, explicit name clearing, delete and Undo. Existing Clips and the
crossfade remained unchanged; console errors were empty. Both captures were
opened and inspected. [Provenance](IAB-provenance.json) links the gate captures.
The native color fill probe did not commit a change, so manual color editing is
not claimed; golden and scripted tests cover color. The existing reference-map
compatibility warning remained visible and outside marker scope.

The final test-only correction compares parity modulo independently generated
changed timestamps, avoiding a millisecond-boundary flake. Product/UI source
remains frozen at the captured commit. The coordinator owns final committed-tip
suites, native review and landing.

CONTEXT, Feature Guide and Technical Reference were assessed: this bounded
ownership change adds no domain term or new visible UI. The specialized command
contract and generated inventory carry the exact input and no-op behavior.
Whole-Show admission, paid inference, Controllers, hosted services, Insert Time
and Show End semantics remain outside this slice.

## Durable evidence after #994

Generated record dumps, exported fixtures and mutation reports have been pruned.
The committed [browser test](../../../../e2e/agent-baseline.auth.spec.ts),
case `MK951: command admission saves once, reopens, undoes, refuses stale and deduplicates`,
owns the current complete-record, export and Undo regression assertions.
Retained captures and provenance describe the historical inspected runs.
