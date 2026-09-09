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

The real scripted `MK951` browser sequence passed on the issue worktree:
add→move→update produced one PATCH; the downloaded Show reopened through
`parseShowFileBundle` to the complete saved record. A wholly no-op batch and
missing-marker removal produced no writes. Removal preserved other content;
Undo restored removal, then the original batch in one step each. Synthetic
records and observations are attached in [MK951.json](MK951.json),
[export](MK951-export.json), [no-op](MK951-noop.json), and
[refusal](MK951-refusal.json). The authenticated browser boundary reported no
unexpected console or runtime errors. A first run lost its overlay after export
while generated documentation refreshed; the unchanged-source rerun passed.

Four targeted faults (shift exact time, skip no-op, accept missing removal,
remove unrelated Scenes) were detected by behavioral tests; the source was
restored after each. [Fault records](faults.json) retain the outcomes.
Coordinator manual IAB proof is pending at the source commit. The coordinator
owns final committed-tip suites, native review and landing.

CONTEXT, Feature Guide and Technical Reference were assessed: this bounded
ownership change adds no domain term or new visible UI. The specialized command
contract and generated inventory carry the exact input and no-op behavior.
Whole-Show admission, paid inference, Controllers, hosted services, Insert Time
and Show End semantics remain outside this slice.
