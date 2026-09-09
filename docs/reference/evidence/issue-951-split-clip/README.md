# Logical Clip splitting

Source commit `543605e779256f07201d94cc2c3678731b09e1e8` shares the existing
manual split owner with canonical and descriptor-derived diagnostic commands.
The [SC951 browser case](../../../../e2e/agent-baseline.auth.spec.ts) contains Main `clip-b`
from 12–36 seconds across a Cut at 30 seconds, incoming/outgoing Transitions,
placement and shared instance animation, ordinary overlay `clip-ov` from 2–8
seconds, and an unrelated mixed Group at 42 seconds.

The contract preserves `Math.round` execution and exact internal-boundary/gap
refusal. Placement curves copy to applicable halves with derived IDs rather
than being cropped or resampled. The left identity survives; the fresh right
Clip shares the Pattern instance and receives the outgoing endpoint reference,
with Transition IDs and parameters unchanged. Store/file normalization remains
a separate boundary.

Complete literal owner records exposed and now cover unrelated marker/track
normalization, malformed multi-Scene owner acceptance, and deletion of explicitly
empty track collections. The focused owner, registry/goldens/touches, adapter,
coverage, authoring, MCP and mutation-configuration selection passed 252 tests;
the subsequently added explicit split MCP schema/export/Undo/Redo case and
mutation inclusion assertion passed their 27-test selection. Source typecheck,
lint and normal commit hooks passed (187 focused hook tests).

The mutation qualification run killed all 79 catalogued
faults with the new owner suite explicitly included: no survivors, exclusions,
errors or timeouts. [Four targeted faults](faults.json) were also killed:
whole-composition normalization, lost outgoing endpoint, lost fractional rounding
and lost placement tracks. The first rounding fault survived the initial owner
suite because the multi-Scene append helper also rounds. Changing the existing
literal overlay case to fractional input made that fault observable; the rerun
killed all four. No fault was classified away.

The adapter cases compare manual/canonical/diagnostic complete records with
injected deterministic IDs, reopen the actual exported Show file, and edit/move
the right overlay Clip. The importer canonically orders tracks; the test compares
all record fields while explicitly canonicalizing only track order. MCP discovers
numeric split time, refuses the internal Cut, splits a fractional request and
restores exact exported records through Undo/Redo. The central golden changes
an actual outgoing Transition endpoint, qualifying its declared touch path.

The committed-source `SC951` browser sequence passed on the first run at the
source commit above (6.8 seconds; 12.4 seconds including isolated harness setup).
The scripted no-paid bridge split produced one save. The full visible record
matched the literal expected result and the durable Show. The actual downloaded
`.pxlshow` reopened identically, and one Undo restored the entire preimage.
A captured split then refused with `revision-conflict` after a manual Layer
addition, preserving that complete visible/durable edit. Delivering one fresh
split twice made one save; one Undo restored the full manual preimage. The five
PATCHes correspond exactly to split, Undo, manual Layer, fresh split and Undo.
[SC951 browser case](../../../../e2e/agent-baseline.auth.spec.ts) and the
[inspected route](SC951-result.png) preserve these observations.

Coordinator in-app proof used the shared issue runtime at 5178 and a separate
synthetic `local-agent-08` session on source commit `543605e7`. Ordinary fixture
import compiled without error (25.2 KB source). Selecting Main `clip-b`, then
seeking with real transport keys to 20 seconds enabled the selected-Clip Split;
the fresh right Clip was selected, and one Undo restored the preimage.
[Split](951-split-main.jpg) and [Undo](951-split-undo.jpg) were inspected. At the
exact internal Cut at 30 seconds Split refused with unchanged content.

On a fresh imported record, selecting `clip-ov` at zero and then seeking to five
seconds retained `aria-pressed=true` and the selected-Clip Split title. Split
retained the left 2–5 second half, selected the fresh right 5–8 second half,
and saved without a banner. One Undo restored the 2–8 second Clip and all other
content, disabled Undo, and showed no failure banner. The coordinator inspected
[overlay result](951-split-overlay-selected.jpg) and
[overlay Undo](951-split-overlay-undo.jpg) while worker file edits were paused.

The additional `SC951-overlay` actual-UI test passed (2.9 seconds; 6.7 seconds
with setup) on the same frozen product source. It performs Main split/Undo,
selects overlay at zero before seeking to five, asserts the selected Clip and
owner-specific toolbar title, then checks the literal full visible/durable
record and one Undo. All four PATCH responses were 200; the
[SC951-overlay browser case](../../../../e2e/agent-baseline.auth.spec.ts)
asserts the preimage and result.
Its first setup probe left keyboard focus on a control; the second tried the
Clip center beneath the playhead hit-target. The final probe selects before
seeking, matching the inspected manual interaction; no force click or product
repair was used.

The initial attempted overlay proof pressed Escape after selection, clearing it
and exposing the existing legacy **Split at the playhead** action. That
unselected legacy action produced a save rollback ([observed failure](951-split-save-failure.jpg));
it did not invoke the selected overlay owner. This is retained as a separate
legacy-path residual, not an overlay split failure or an implicit scope expansion.
Concurrent test-file edits triggered a dev-server reload and retired history
on an earlier successful attempt; this was verification interference, not a
product Undo failure. The fresh paused-write proof above is the authoritative manual Undo.

The command contract and Technical Reference describe shared split ownership;
the candidate-application overview names the converged families. Inventories
were regenerated and unchanged. CONTEXT and Feature Guide were checked and need
no edits: domain terms and the existing Split control are unchanged. The census
remains forward-looking until coordinator landing. The [test model](test-design.json)
records the bounded partitions. The coordinator owns final committed-tip suites
and native review; no paid inference, Controller or hosted service is used.

## Cross-catalog correction

Final-suite collection at `767414372842bbaff76248c85dd68270023ae3f2`
found two diagnostic catalog omissions: outside-Clip refusal lost its Clip ID,
and declared Transition touches lacked an outgoing-Transition diagnostic golden.
Repair `71a7001a` restores the Clip ID in shared plan/engine refusals and adds a
golden asserting the complete preserved Transition and its endpoint receipt.
The split algorithm and accepted results are unchanged.

`npm run test:show-command-convergence` passed **18 files / 278 tests** before
repair freeze. Its explicit selection is the seven `src/engine/showCommands`
suites; diagnostic `grammarBreadth`, `grammarStructure`, `grammarRegistry`,
`grammarMcp.e2e`; and `canonicalMarkers`, `canonicalRemoveClip`,
`canonicalSplitClip`, `canonicalResizeBridge`, `canonicalMove`,
`canonicalOverlayLayer`, `canonicalResize`. This includes both catalogs'
registry/golden/touch checks and the adapters; it is now documented in the
verification guide as a pre-freeze check.

Original browser proof remains tied to `543605e779256f07201d94cc2c3678731b09e1e8`.
It is reused for the unchanged accepted/save/export/Undo/stale/duplicate flow;
no browser capture is claimed at the repair hash. Existing mutation evidence
also remains tied to its original source. The coordinator owns replacement
committed-tip final suites and review; no review preceded this correction.

## Durable evidence after #994

Generated record dumps, exported fixtures and mutation reports have been pruned.
The committed [browser test](../../../../e2e/agent-baseline.auth.spec.ts),
case `SC951: command admission saves once, reopens, undoes, refuses stale and deduplicates`,
owns the current complete-record, export and Undo regression assertions.
Retained captures and provenance describe the historical inspected runs.
