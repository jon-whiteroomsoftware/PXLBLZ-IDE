# Agent candidate application

The local dictation experiment edits a private Show snapshot and returns a
candidate to the live V2 editor. A grammar-session commit accepts private work;
only editor application can change the author's open Show. This contract
records the current experimental boundary. Agentic editing is intended to ship
in V2; its relevant code and documentation may move here from V3. The broader
V3 platform remains separate.

## Ownership and acceptance

The current `__pxlblzEditor` bridge is installed only in development builds
and editable Show editors. Production builds and read-only editors do not
expose this application path; shipping agent editing requires an explicit
production integration.

The browser bridge captures a Show through the editor's cloning `getShow`
interface. The service opens a separate grammar session for the request.
Operations inside a transaction update private working state; commit validates
the complete candidate with that session's evaluation options. A validation
refusal leaves the transaction open for repair or rollback. Successful commit
adds one private history entry and clears private redo. None of these events
persists the live editor's Show.

The service returns a reply, a typed `privateOutcome`, change indication, and
an exported Show only for a validated private commit. `committed` at this
boundary is private-session success, never live application or durable saving.
Ask, refusal, incompletion and successful no-change completion expose no candidate.
The browser submits a changed candidate to `applyShow`. The editor
rejects an obsolete retained bridge object or a mismatched Show id, clones an
accepted input, and awaits its ordinary store update. The replacement enters
editor history as one update; the private session's history does not replace
editor history.

The editor's boolean result is an admission signal, not a durable-save receipt.
A rejected store update throws; a superseded failed update can resolve, and a
stock draft update remains in memory. The store owns those semantics in
[Show state, history, and persistence](show-state-history-persistence.md).
[Show command semantics](show-command-semantics.md) covers the V2 registry only;
the V3 grammar is a separate adapter and is not yet equivalent to that registry.

## Internal admission foundation

The Show store now exposes an internal session/request admission API, independent
of component effects. It registers immutable operation identity before private
work, checks a monotonic whole-Show revision, evaluates and validates through
synchronous engine callbacks, and adopts once into ordinary store history.
Session retirement, cancellation, duplicate delivery and altered envelopes
produce typed non-application outcomes. Its session-only receipt lookup separates
applied/saving from saved, rolled-back, superseded and stock draft settlement.

[Show state, history, and persistence](show-state-history-persistence.md#internal-request-admission)
defines lifetime, revision inventory, retry identity and the configurable entry
cap. [Pure policy tests](../../../src/engine/showEditAdmission.test.ts) and
[store admission tests](../../../src/store/showEditAdmission.test.ts) exercise
full records/history, provider writes, revision ABA, retirement, deduplication
and delayed persistence outcomes.

This foundation is not wired into `__pxlblzEditor`, the diagnostic overlay,
grammar or turn runner. The live boundary and baseline failures described below
remain current. Layer dependency qualification, active-input waiting, canonical
command replay and the accepted final authoring validation policy remain later
#949 slices. Trusted callbacks at this internal seam are not a production
command or validation escape hatch.

## Present limits

The browser's busy flag serializes its own submissions while manual editing
continues. Neither the request nor editor application carries an expected
Show revision. A returned full record can therefore overwrite edits made during
inference even when the Show id still matches. Reproduced on the live editor
by the #945 browser baseline (sequence A: a brightness edit saved during
inference is gone after the reply; sequence B: a Clip deleted during
inference comes back, and a later visible drag of that target from 0 s to 15 s
is replaced back to 0 s; sequence C: time inserted before the target is undone).

Composition edits still retain the captured `updatedAt`, but the live V2 store
now assigns every accepted replacement a new single-client ordering stamp at
adoption. The candidate's captured timestamp therefore cannot leave the
durable baseline behind a successful save. Baseline sequence E is the browser
regression: after an intervening manual save and an accepted agent replacement,
a later failed save restores that saved replacement and reopening shows the
same record. The stamp is not a document revision and does not repair the stale
whole-record overwrite described above.

The service separately permits one request at a time across clients. A busy
service returns HTTP 429 as JSON, while the overlay expects a streamed terminal
result and reports a missing-result error. Its per-tab busy flag therefore does
not provide a coherent cross-tab waiting or retry protocol.

The browser looks up the current window bridge when applying the response.
Consequently, the obsolete-object check does not bind the request to its
originating editor installation: navigating away and back to the same Show
leaves an old response eligible for application, reproduced by baseline
sequence D. There is no request cancellation or operation-id deduplication
contract at this boundary; the request id the overlay now sends is a
diagnostic correlation key, not an admission token.

Conversation history records the reply before editor application succeeds.
A model reply or private commit is therefore not evidence that the edit landed.

The diagnostic turn requires an explicit completion object:
`{ intent: 'apply' | 'ask' | 'refuse' | 'incomplete', reply?: string }`.
Both `finish_turn` and the final operation's `finish_turn_reply` accept that
object. Reply punctuation has no effect on mutation. Provider-neutral adapters
may return the same typed completion; plain text alone fails closed as
`missing-finish`. Unknown intent, invalid reply type, extra keys or a
contradictory returned intent cannot authorize a candidate. Fake corpus scripts
record explicit intent; historical paid transcripts retain their original format.

Apply validates the private working copy and stages completion. Ask, refuse and
incomplete discard pending work. Apply with no changes yields `nothing-applied`
and preserves history. No finish commits while the agent is running. Abnormal
return (including exhaustion after a staged finish) or an exception rolls back
the complete transaction. Within a tool round, operations execute in order,
inline completions take precedence in operation order, then explicit finishes
are attempted in listed order. Any refused operation blocks all finishes in that
round; the first successful finish stands and later finishes are refused.
A validation refusal can produce one bounded repair run; repair must itself
finish explicitly and return normally. The service observes pending validation
and commit validation separately in its existing validation event stream.

[Typed private-turn tests](../../../src/agent-harness/test/dictationTypedOutcome.test.ts)
traverse existing past/future records through public undo/redo after rejected
turns. [Typed service tests](../../../src/agent-harness/test/bridgeTypedOutcome.test.ts)
prove same-response explicit/inline completion, no candidate for non-application,
and a committed candidate after `.pxlshow` export/reopen. These tests do not
qualify live editor admission, active-input waiting, Layer independence or the
accepted broader authoring validation policy.

Session validation and editor admission are different checks. The service opens
with unresolved personal Patterns allowed, while other document validation
rules still apply. Passing that validation neither proves hardware delivery
readiness nor establishes that every manually editable draft is accepted by the
grammar. The live editor bridge itself checks identity, not full authoring
validity.

## Ownership and evidence

The agent sources and tests moved from the V3 repository into this one in the
first #945 slice, under [`src/agent-harness/`](../../../src/agent-harness/README.md)
as a diagnostic area whose provenance (V3 commit
`9ecd481fd6facc0f7c68c1f99cd6c0d6c1405654`, original paths, hashes, and the
mechanical adaptations) is recorded in
[`PROVENANCE.md`](../../../src/agent-harness/PROVENANCE.md). Ownership stays
diagnostic until #946, #947 and #959 decide what becomes engine code (#949).

- Grammar sessions ([`grammar/session.ts`](../../../src/agent-harness/grammar/session.ts)) and
  transaction tests ([`test/grammarTransactions.test.ts`](../../../src/agent-harness/test/grammarTransactions.test.ts)) own private
  working state, final validation, rollback, and private history.
- Session tests ([`test/grammarSession.test.ts`](../../../src/agent-harness/test/grammarSession.test.ts)) and
  turn tests ([`test/dictationTurn.test.ts`](../../../src/agent-harness/test/dictationTurn.test.ts)) exercise session and
  completion behavior. They do not prove live mouse/agent concurrency.
  Abnormal completion (round-limit exhaustion through the OpenAI adapter over
  its injected fetch transport and a temporary paid-call guard, exhaustion
  during the repair turn, an agent exception)
  is proved by [`test/dictationTurnAbnormal.test.ts`](../../../src/agent-harness/test/dictationTurnAbnormal.test.ts);
  the staged `finish_turn` (nothing committed until a normal return, a
  duplicate finish refused) by
  [`test/dictationTurnStagedFinish.test.ts`](../../../src/agent-harness/test/dictationTurnStagedFinish.test.ts);
  the order of a round's finishes, through the adapter over that guarded
  injected transport, by
  [`test/dictationTurnFinishOrder.test.ts`](../../../src/agent-harness/test/dictationTurnFinishOrder.test.ts).
- The generic operations ([`grammar/operations/generic.ts`](../../../src/agent-harness/grammar/operations/generic.ts))
  are a bounded fallback over declared `ShowRecord` structure. `set_field`
  validates its complete result. `apply_patch` requires every member, not only
  the final result, to leave a structurally valid Show. Arbitrary scratch
  fields, temporary wrapper/container parking, and remove-then-restore
  sequences whose intermediate state is structurally invalid are refused.
  The whole operation still applies to one private clone and remains atomic.
  The ordinary 43-case corpus and scripted browser baseline use no scratch
  transit and no generic-operation script, so this restriction removes no
  corpus dependency.

  Within that supported domain, the generics preserve every element identity
  that editor focus and agent references point at. Identity is provenance
  carried by objects in the private working copy
  ([`grammar/identity.ts`](../../../src/agent-harness/grammar/identity.ts)):
  every array-member object with an `id` is tagged with its id and identity
  domain; a write cannot rename it or introduce an element through an ancestor
  replacement; removals tombstone ids per domain for the whole patch;
  insertions admit and tag fresh ids; direct moves transport the same tagged
  objects; and copies of tagged objects are refused. A move resolves and checks
  its destination after source detachment, immediately before the write, so an
  earlier source index cannot shift an unchecked identity field under the
  destination pointer. A move onto an existing key tombstones the replaced
  subtree before incoming admission. Nested elements are re-derived when a
  declared destination changes their domain, such as an Effect stack moving
  between placements. Pattern-reference `pattern.id` remains an editable
  reference rather than an element identity
  ([`test/genericIdentity.test.ts`](../../../src/agent-harness/test/genericIdentity.test.ts),
  [`test/genericIdentityBoundary.test.ts`](../../../src/agent-harness/test/genericIdentityBoundary.test.ts),
  [`test/genericIdentityLedger.test.ts`](../../../src/agent-harness/test/genericIdentityLedger.test.ts),
  [`test/genericIdentityTransit.test.ts`](../../../src/agent-harness/test/genericIdentityTransit.test.ts),
  [`test/genericIdentityPlacementOrder.test.ts`](../../../src/agent-harness/test/genericIdentityPlacementOrder.test.ts),
  [`test/genericDeclaredStructure.test.ts`](../../../src/agent-harness/test/genericDeclaredStructure.test.ts)).
  Provenance lives for one operation's working copy, as the ledger does;
  across separate operations of a transaction the contract accepts remove
  followed by add.
  A whole-collection write that keeps id A with B's former content while
  dropping B is accepted: that record is reachable by editing A and removing
  B, and no operation names an id. The generic conclude path and the session
  commit validate through the tier-0 document validator only; the engine's
  composition duplicate checks are not part of that path. Each patch member
  passes the structural schema; the conclude path and session commit then pass
  the complete result through tier 0.
- Composition replacement ([`grammar/support.ts`](../../../src/agent-harness/grammar/support.ts)) preserves the captured
  timestamp. The live V2 store, rather than this diagnostic caller, owns the
  replacement's accepted ordering stamp.
- Service ([`bridge/service.ts`](../../../src/agent-harness/bridge/service.ts), the request path
  extracted from V3's `server.ts`; [`bridge/server.ts`](../../../src/agent-harness/bridge/server.ts) is the process entry),
  browser bridge ([`bridge/chat.js`](../../../src/agent-harness/bridge/chat.js)), and
  turn runner ([`experiment/turn.ts`](../../../src/agent-harness/experiment/turn.ts)) own the request path.
- The bridge smoke ([`test/bridgeSmoke.test.ts`](../../../src/agent-harness/test/bridgeSmoke.test.ts),
  `npm run agent:smoke`) proves one scripted turn through the real service,
  MCP, session and turn path, with the returned candidate judged after
  `.pxlshow` and `.epe` export and reopen through the V2 importers. It drives
  the bridge, not the editor route: it establishes nothing about `applyShow`,
  the store, or the concurrency gaps above.
- The browser baseline (`e2e/agent-baseline.auth.spec.ts`,
  `npm run test:e2e:agent-baseline`, report in
  [`agent-editing-baseline.md`](../agent-editing-baseline.md)) drives the
  actual editor route in Chromium through the real overlay and a real scripted
  bridge process, and asserts the observed bad outcomes as reproductions:
  stale whole-record replacement (A, B, C), application after navigation
  away and back (D), recovery to the durable candidate after a later failed
  save and reopen (green regression E), one history entry and one save for a multi-operation reply (F), an
  in-memory stock draft with no personal write (G), and a personal Pattern
  on a personal Library (H). It is an explicit diagnostic command, never a
  push gate.
- Request ids and phase timing: the overlay mints a request id per
  submission; the service echoes it on every event and log line and reports
  the bridge phase clock on `done`. Its agent phase starts with the first
  inference after the one scripted delay and ends with the final inference,
  including a validation-repair pass, as covered by
  [`test/bridgeRequestIds.test.ts`](../../../src/agent-harness/test/bridgeRequestIds.test.ts).
  The editor's `applyShow` accepts an optional request id and records
  admission, adoption, settlement, rejection, and failure through the
  dev-only, read-only observation seam in
  [`src/dev/agentObservation.ts`](../../../src/dev/agentObservation.ts); the
  stage preview records publication of a rebuilt runtime's first frame with
  the digest of the record it compiled from. Production builds and read-only
  editors record nothing.
- The editor interface is [ShowEditor](../../../src/components/ShowEditor.tsx)
  and the [Show store](../../../src/store/showStore.ts) in this repository.
  The application claims above are now live-interaction evidence at the
  baseline's pinned commit; recheck this boundary when changing the editor
  integration.

Revision admission, request retirement, and explicit applied/durable outcomes
exist at the internal store seam only. Their live request integration remains
roadmap work. The baseline does not claim those guarantees or select a
merge policy. The shared-agentic Show editing roadmap now lives at
[`docs/plans/shared-agentic-show-editing-roadmap-prd.md`](../../plans/shared-agentic-show-editing-roadmap-prd.md)
with its V3 provenance. Migration into V2 does not itself implement the
proposed guarantees.
