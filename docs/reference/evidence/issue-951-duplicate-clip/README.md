# Duplicate Clip convergence (#951)

The canonical descriptor, diagnostic adapter and manual Clone share one bounded
duplication owner. It retains the full logical duration and preserves unrelated
authored records without whole-composition normalization. Independent copies own
fresh Pattern settings and supported instance curves and clear the cast-bound
proof; linked copies retain shared ownership and proof. Full Transition gaps
refuse instead of shortening a copy.

## Evidence at source commit

All browser evidence below uses `9addd4d4f3f3ecaaced6985442e47c067c93b88a`.
The coordinator inspected the in-app browser first; DC951 then ran against the
same committed source. [Provenance](provenance.json) records routes and identities.

- **Main Clone:** historical [result](main-result.jpg), [Undo](main-undo.jpg)
  and [provenance](provenance.json). In the 62-second Show, the selected
  12–20 second Clip cloned independently at 20–28 seconds with placement/instance
  animation. The incoming Transition and unrelated geometry remained; one Undo
  restored the preimage and disabled Undo. No committed regression case covers
  this exact manual specimen; DC951 exercises the overlay specimen below.
- **Overlay Clone:** [DC951 browser case](../../../../e2e/agent-baseline.auth.spec.ts),
  [result](overlay-result.jpg), [Undo](overlay-undo.jpg). The 2–8 second Clip
  clones independently at 8–14 seconds in the 60-second Show. One Undo restores
  it with the other Clips and Groups unchanged. Neither manual pass downloaded
  an export. Both imported their fixture, showed no save failure, and had empty
  browser warning/error logs.
- **DC951:** [result](DC951-result.png), [DC951 browser case](../../../../e2e/agent-baseline.auth.spec.ts). The scripted bridge calls the real
  diagnostic command without paid inference. Full visible/durable records match
  the expected copy. The actual download reopens through the Show importer;
  one Undo restores the preimage. A manual Layer edit makes a pending request
  stale. Delivering a fresh response twice adopts/saves once; one Undo restores
  that preimage. Five successful PATCHes cover those five accepted edits.

The first uncommitted DC951 run was a focused check only. The attached run is
`2026-09-09T12-56-11-693Z`: **1 passed (10.7 seconds)**.

## Focused qualification

| Check | Result |
| --- | --- |
| `test:show-command-convergence` | 20 files, 298 tests passed; includes `canonicalDuplicateClip.test.ts` |
| Direct owner and existing timeline-owner tests | 61 passed |
| TypeScript project check and lint | Passed |
| Normal source commit hooks | 5 files, 93 staged tests plus type/lint/e2e metadata passed |
| Existing mutation catalog | 79/79 killed; zero survivors, timeouts or errors |
| Supplemental duplicate faults | Eight killed by behavioral assertions; source restored |

[The test model](test-design.json) names the partitions and sequences.
[Fault results](faults.json) retain the targeted qualification outcomes.
The historical mutation run included both owner and adapter test files.
Initial preservation and direct manual cast-proof
checks failed before the repairs. Full Transition-gap refusal and accepted Cut
crossing are separate cases.

Historical artifact byte counts and SHA256 hashes remain in provenance.json.
The generated dumps and mutation reports were pruned in #994; the committed
browser case and retained fault summary are the repeatable evidence.

## Boundaries and documentation

The command-semantics contract was updated. CONTEXT.md, the Feature Guide and
Technical Reference were checked and left unchanged: domain language, Clone
controls and architecture descriptions already apply. Store/file normalization
remains a separate boundary. Manual destination drag retains its explicit
copy-and-move semantics rather than immediate-tail equivalence.

No paid inference, Controller, hosted service, new UI, animation expansion or
global mover migration is qualified. The existing no-selection legacy Split
rollback is outside duplication. Final committed-tip suites, native review and
landing remain coordinator-owned; this packet does not claim they have run.

## Durable evidence after #994

Generated record dumps, exported fixtures and mutation reports have been pruned.
The committed [browser test](../../../../e2e/agent-baseline.auth.spec.ts),
case `DC951: command admission saves once, reopens, undoes, refuses stale and deduplicates`,
owns the current complete-record, export and Undo regression assertions.
Retained captures and provenance describe the historical inspected runs.
