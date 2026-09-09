# Exact Clip move proof

Source: `421ec5eed6307862cfca40a42d3b7854dc2c7b56`. The committed-source browser
run `2026-09-09T04-45-49-123Z` passed all three selected sequences with:

```bash
npm run test:e2e:agent-baseline -- --grep 'M951:|MR:|PP:'
```

The repository Chromium runner used a synthetic authenticated user, isolated
local D1, real editor route and scripted HTTP/NDJSON/MCP bridge. No paid model
call was made. M951 passed in 10.0 seconds, MR in 25.0 seconds and PP in 11.6
seconds; the complete run took 50.4 seconds. The coordinator also completed
the in-app browser check below. This worker's separate browser discovery could
not select that backend; that was not task-wide unavailability.

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

The repair reproduced both original grammar failures, then passed 196 tests
across seven owner, registry, grammar, private-pair and MCP suites. Normal repair
hooks passed lint, typecheck and 69 staged checks. Shared owner refusal facts
restore occupied Clip identity/remedy and outside-timeline diagnosis, retaining
a finite domain-refusal fallback. The diagnostic golden now proves a positive
Scene crossing with retained Transition settings and retargeted endpoint. The
fresh browser run above qualifies this repaired source; the supplementary IAB
check below remains pinned to its original source.

At original source `696929711fb2fc491dbae230a285a97b93645d5a`,
focused verification passed 179 tests across ten owner, registry, grammar,
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
review and landing belong to the coordinator.

## Coordinator in-app browser check

At commit `6128f08d2f8fff63b65e91b77e3e35aae86d33f3`, the coordinator imported
the JSON form of the committed `M951-export.json`, saved as
`/tmp/951-reopened-output.pxlshow`, through **Add show → Import Show file**,
the actual file chooser and import confirmation. These were reserialized
recorded export data, not the original browser download bytes. The import
created Show `aa214ed9-922e-422c-aae8-60ea749a3a6e` under synthetic
`local-agent-08` at runtime `5178`.

The 20-second timeline placed A at 15% with 10% width and B at 30% with 10%
width: 3–5 seconds and 6–8 seconds, joined by one crossfade. Dragging B two
seconds later moved both Clips to 25% and 40%. One Undo restored 15% and 30%,
retained the crossfade and disabled Undo. Console errors were empty. The
coordinator opened and inspected the [restored capture](IAB-restored.jpg).

This verifies the actual import and manual drag/Undo path independently of the
canonical scripted-command proof above. The imported fixture retains its existing
Portable 2D compatibility warning with the 1D reference map; this check makes no
Controller or device-export claim. [Capture provenance](IAB-provenance.json)
records the inspected source and route.
