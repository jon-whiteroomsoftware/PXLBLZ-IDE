# Canonical resize adapter evidence (#950 slice B)

The registry and diagnostic grammar now share exact resize semantics. This
packet qualifies that bounded integration; #950 remains incomplete until its
manual adapters and remaining admission/batch cases are qualified.

The real editor route ran on 2026-09-08 with the repository Playwright runner and
actual loopback scripted service. In-app browser discovery exposed only Chrome;
two `iab` probes returned `Browser is not available: iab`. The isolated repository
browser exercised the real overlay, MCP/session, live admission, history and D1.
The source was frozen during the successful run; earlier diagnostic captures
were interrupted or refused during concurrent development and are not proof.

`npm run test:e2e:agent-baseline -- --grep 'R: canonical'` passed (11.0 seconds
for the case). Fixture R accepted 8000 ms exactly, repeated resize returned
nothing-applied, and 12000 ms returned the actual 0–8000 ms tool capacity with an
explicit scripted refusal. Complete visible/durable records remained identical
across no-op/refusal, including timestamp; only one PATCH occurred before
undo/redo. [Route records](route.json), [accepted capture](exact-boundary.png),
and [no-op/refusal capture](noop-refused.png) retain the measured result.
The scripted prose is fixed test input, not evidence of model reasoning.

Focused verification passed 725 cases across the exact owner, registry and
harness before the final fixture-prose addition. `agent:smoke` reopened both
`.pxlshow` and `.epe`; the 43-case fake corpus passed. The new scripted service
cases compare complete reopened `.pxlshow` records for boundaries and mixed
no-op sequences. One private move-B-to-16000 then resize-A-to-12000 transaction
has exact export/undo/redo proof; its live multi-operation adoption is residual.

[Five omission faults](omissions.json) each failed the intended behavioral
assertion; all source was restored. [Native test-design context](test-design.json)
names the invariants, partitions, sequences, oracles and remaining gaps. Final
committed-tip suites and native review are coordinator-owned.
