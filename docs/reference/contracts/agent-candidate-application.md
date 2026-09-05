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

The service returns a reply, change indication, and an exported Show when
applicable. The browser submits a changed candidate to `applyShow`. The editor
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

## Present limits

The browser's busy flag serializes its own submissions while manual editing
continues. Neither the request nor editor application carries an expected
Show revision. A returned full record can therefore overwrite edits made during
inference even when the Show id still matches. Reproduced on the live editor
by the #945 browser baseline (sequence A: a brightness edit saved during
inference is gone after the reply; sequence B: a Clip deleted during
inference comes back, and a later visible drag of that target from 0 s to 15 s
is replaced back to 0 s; sequence C: time inserted before the target is undone).

Composition edits also retain the captured `updatedAt`; application does not
restamp it. After an intervening manual save, this older timestamp can prevent
the durable baseline from advancing even if the candidate saves successfully.
A later failure can then restore a baseline that no longer matches storage.
This violation of the store's timestamp-ordering assumption is reproduced by
baseline sequence E: the candidate's PATCH carried the older stamp, a later
failed save restored the manual record, and storage still held the candidate
until reload. It remains unfixed.

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
The turn runner also uses question-mark detection in both explicit-finish and
text-close paths to choose between asking and committing; conversational wording is not a typed
live-application result.

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
- Composition replacement ([`grammar/support.ts`](../../../src/agent-harness/grammar/support.ts)) preserves the captured
  timestamp; this is source evidence for the ordering gap above.
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
  away and back (D), the baseline mismatch after a later failed save (E),
  one history entry and one save for a multi-operation reply (F), an
  in-memory stock draft with no personal write (G), and a personal Pattern
  on a personal Library (H). It is an explicit diagnostic command, never a
  push gate.
- Request ids and phase timing: the overlay mints a request id per
  submission; the service echoes it on every event and log line and reports
  the bridge phase clock on `done`
  ([`test/bridgeRequestIds.test.ts`](../../../src/agent-harness/test/bridgeRequestIds.test.ts)).
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
remain roadmap work. This baseline does not claim those guarantees or select a
merge policy. The shared-agentic Show editing roadmap now lives at
[`docs/plans/shared-agentic-show-editing-roadmap-prd.md`](../../plans/shared-agentic-show-editing-roadmap-prd.md)
with its V3 provenance. Migration into V2 does not itself implement the
proposed guarantees.
