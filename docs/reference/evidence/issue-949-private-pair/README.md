# Private two-Clip rearrangement proof

[Review test model](test-design.json) records invariants, partitions, sequences,
oracles and residual gaps for the exact candidate review.

Source: `fe58934b289da2c92f0a6b2c65597e89174575da`. Browser run:
`2026-09-09T03-44-17-699Z`, Chromium, synthetic authenticated local user,
real scripted HTTP/NDJSON/MCP bridge, no paid inference. Command:
`npm run test:e2e:agent-baseline -- --grep 'PP:'` passed in 16.4 seconds.
The refreshed run exercised committed tip
`f0c7b76aaaca7b1cf6a51123b55bfec7e4ff25db` after rebasing over the
process-only #991 change; product code is unchanged. The in-app browser had
connected to managed runtime 5178 for the original proof, but was disconnected
at refresh: both the existing binding and explicit `iab` lookup failed, and
discovery listed only Chrome. The repository's authenticated Chromium runner
provided the fresh complete acceptance flow on its isolated candidate runtime.

The input has A at 0–4000 ms and B at 8000–14000 ms. The private first move
puts A at 8000–12000 ms; the second moves B to 0–6000 ms. Both IDs, durations
and shared Pattern instance remain unchanged. The screenshots were opened and
inspected: applied/save confirmation, incomplete discard, and stale refusal
match the expected timeline records.

| Case | Consumer result | Evidence |
| --- | --- | --- |
| Apply | One complete PATCH, identical visible/durable record, real Show-file download reopened identically, one Undo restores the complete input | [record](PP-apply.json), [reopened export](PP-export.json), [capture](PP-apply.png) |
| Incomplete | The accepted private overlapping step is discarded; no candidate, PATCH or Undo entry | [record](PP-incomplete.json), [capture](PP-incomplete.png) |
| Stale | Manual A duration 7000 ms survives the old swap response; only the manual PATCH exists, one Undo restores its input | [record](PP-stale.json), [capture](PP-stale.png) |

The browser assertion observes no live change while the response is pending and
checks every complete write. The session tests directly inspect committed
exports/history immediately after the first overlapping step; the browser does
not pause between the two internal move calls.

Focused verification passed 125 cases across the private-pair, existing session,
typed-service, timeline authoring and composition suites. The private-pair suite
has 28 cases covering Main/overlay, both session validation policies, exact
bounds, nested third collisions, retained pair-only mode after resolution,
malformed ownership, connected Transition refusal, unrelated Group preservation,
affected Scene/Zone Group refusal, reordered equivalent owners, shared versus
sole-use animation, rollback and abnormal completion. Complete input/output
records and history are the oracles. Typecheck, lint and normal source commit
hooks passed; the staged hook ran 121 tests. The post-commit issue-comment hook
exited 141 after the successful commit.

The [four omission faults](faults.json) were killed by behavioral assertions:
early adoption (9 failures), unrestricted overlap (2), omitted raw final check
(2), and omitted pair lock (2). Source was restored and the focused pair plus
mutation-runner tests passed 42 cases. The existing Show-authoring mutation
qualification killed all 57 mutants, with no survivors, timeouts, errors or
exclusions. Its existing move fragment was relocated to the extracted function;
the mutation scope was not reduced. Historical fixture verification reported
all seven committed hashes unchanged; no baseline was regenerated.

This qualifies only the retained plain pair and whole-Show admission described
in the [command contract](../../contracts/show-command-semantics.md#private-two-clip-rearrangement).
General move parity, Scene/destination changes, connected rearrangements,
Group-bearing participant ownership and arbitrary temporary invalidity remain
outside this slice. No hosted Agent UI, hardware, paid-model or visual-preview
quality claim follows from these checks.

Documentation sweep updated the command/candidate contracts, Technical Reference,
roadmap and diagnostic provenance. CONTEXT and the Feature Guide were assessed
unchanged: no domain term or public UI flow was added. State/history/persistence
keeps its existing one-candidate adoption agreement.
