# Exact Clip move proof

Source: `696929711fb2fc491dbae230a285a97b93645d5a`. The committed-source browser
run `2026-09-09T04-23-59-049Z` passed all three selected sequences with:

```bash
npm run test:e2e:agent-baseline -- --grep 'M951:|MR:|PP:'
```

The repository Chromium runner used a synthetic authenticated user, isolated
local D1, real editor route and scripted HTTP/NDJSON/MCP bridge. No paid model
call was made. M951 passed in 9.9 seconds, MR in 24.5 seconds and PP in 11.4
seconds; the complete run took 49.5 seconds. The coordinator's in-app browser
connection is available for interactive verification. This worker's separate
browser discovery could not select that backend; that is not a task-wide
unavailability claim.

M951 starts A at 0–2000 ms and B at 3000–5000 ms, connected by the retained
1000 ms crossfade. The two canonical `move_clip` calls put B at 8000 ms and
then 6000 ms, carrying A to 3000 ms. Both durations, shared Pattern instance
and Transition settings remain unchanged. The resulting capture was opened
and inspected: the timeline shows the connected pair at three and six seconds,
and the diagnostic conversation reports saved application followed by no change.

| Case | Consumer result | Evidence |
| --- | --- | --- |
| Connected move | Exactly one PATCH; complete visible and durable records match; one Undo restores the complete input | [record](M951.json), [capture](M951-result.png) |
| Export | The actual downloaded Show file reopens through the Show importer and equals the visible record | [reopened export](M951-export.json) |
| Already satisfied | The retained valid target returns no candidate, no save and no extra Undo entry | [outcome](M951-noop.json) |
| Incompatible destination | Moving connected B to overlay zero refuses; the complete visible/durable state and write count remain unchanged | [outcome](M951-refusal.json) |

The refreshed MR regression also covers accepted move-then-resize, refusal,
incomplete completion, active-input cancellation, manual commit and pending
conflict. PP covers accepted private overlap swap, incomplete discard and stale
delivery. Their complete record/export/Undo assertions passed unchanged at this
source; raw run artifacts remain under the run directory above.

Focused verification passed 179 tests across ten owner, registry, grammar,
private-pair, resize, bridge and MCP suites. Normal source hooks passed lint,
typecheck and 117 staged checks. All seven historical exported fixture hashes
remain unchanged; no baseline was regenerated. The existing Show-authoring
qualification killed all 57 mutants without survivors, timeouts or errors.
[Four targeted owner faults](faults.json) also failed behavioral assertions;
source restoration was verified. The transaction-priority regression was first
red against private-pair preselection and then green with canonical success
chosen before optional private-pair qualification.

The [test model](test-design.json) gives the finite partitions and residuals.
This slice does not migrate manual-only detachment/boundary behavior, add narrow
current-state move admission or finish the other #951 families. `CONTEXT.md`
needs no terminology change. The technical overview still delegates command
obligations to the updated contract; the generated command coverage inventory
was refreshed with zero unreachable paths. Full committed-tip suites, native
review, interactive verification and landing belong to the coordinator.
