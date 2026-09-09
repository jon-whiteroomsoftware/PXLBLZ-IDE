# Bounded live mixed-batch qualification (#950)

The diagnostic whole-Show path accepts one complete move-then-resize candidate:
A starts at 0 for 4000 ms, B starts at 8000 for 4000 ms, and Show End is 20000 ms.
The private transaction moves B to 16000, then resizes A to 12000. Both
intermediate records are valid. The existing seven baseline fixtures are unchanged.

## Consumer evidence

The focused MR browser sequence drives the real overlay, loopback scripted HTTP
service, MCP operations, typed completion, editor admission, ordinary provider
writes and history. Desktop is 1440×900; refusal and dirty-field cancellation
also run at 800×900. The original qualification run passed all six cases in
27.6 seconds on 2026-09-09 UTC. Fresh committed-source captures are recorded
with the proof packet after the source commit.

- Apply: exact full visible/durable record, one complete PATCH, downloaded
  `.pxlshow` reopened through the real importer, one full Undo/Redo group and
  exhausted Undo/Redo controls. Stable Clip, instance, Scene and Zone identities
  are part of complete-record equality.
- Refuse: earlier private move succeeds, exact resize to 17000 refuses, typed
  completion is `refused`; neither operation escapes into history or storage.
- Incomplete: earlier private move succeeds but typed completion is `incomplete`;
  the full visible and durable baselines remain unchanged, with no history/write.
- Actual dirty duration field: a draft of seven seconds remains focused while
  the full candidate waits. Escape discards the draft and admits the batch;
  Enter commits seven seconds manually and the agent candidate refuses. The
  manual record alone owns one write/history group.
- Manual commit while the response is pending refuses the later complete
  candidate and preserves only the manual edit.

Wire assertions account only for the API's path-bound Show id and explicit
`targetControllerProfileId: null`. They compare every other field. Rejected work
compares visible and durable records to their own pre-request baselines because
editor hydration adds legacy `restartOnEntry: false` without authoring a save.
Accepted work compares durable GET directly with the complete visible record.
The fixture remains delivery-incomplete (Portable reference-map warning), which
is accepted authoring state; this evidence makes no delivery or Controller claim.

## Private boundary and fault sensitivity

`canonicalResizeBridge.test.ts`, `grammarTransactions.test.ts`, and
`bridgeTypedOutcome.test.ts` pass 32 focused cases. The bounded additions prove
operation order, no precommit export/history escape, immutable input, no-op
resize beside a move, declared refusal, incomplete completion and exhausted final
validation repair. Service success is judged through a serialized/reopened Show.

Two deliberate faults were detected by the named behavioral assertions:
[private early adoption and ignored final refusal](mixed-batch-faults.json).
Both files were restored; the 32-case focused run passed again. TypeScript
passed, and `agent:baseline:fixtures` reported all seven fixture hashes unchanged.
Final committed-tip suites and native review remain the coordinator's gates.

## Initial qualification gaps and diagnosis

The first scripted service test returned `service-refused` because the bounded
utterance had no script. Adding the finite script made it pass without changing
transaction or production code. The first browser attempt then refused a valid
candidate. Captured raw schema and exact browser authoring validation both
passed; replaying that same candidate through the real admission unit seam also
passed. Startup was still creating workspace starters after `patternsLoaded`,
then replacing the metadata arrays. The existing metadata guard correctly
invalidated the pending request. The test now waits for the final library
organization load, which follows those reloads in `PatternList` startup order.
No sleep or admission relaxation was introduced.

Subsequent test-oracle corrections used the explicit PATCH wire shape, typed
noncandidate `applied: null`, and separate durable/visible pre-request baselines.
They did not change product behavior. Temporary diagnostic instrumentation and
faults were removed before the source freeze.

## Limits

This qualifies the stated finite mixed batch and its representative outcomes.
Narrow model context, arbitrary temporarily invalid batches/swaps, the broader
operation census, paid inference, final Agent surface and production delivery
remain open. #950 is not complete from this slice.
