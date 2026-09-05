# Agent candidate application

The local dictation experiment edits a private Show snapshot and returns a
candidate to the live V2 editor. A grammar-session commit accepts private work;
only editor application can change the author's open Show. This contract
records the current experimental boundary. Agentic editing is intended to ship
in V2; its relevant code and documentation may move here from V3. The broader
V3 platform remains separate.

## Ownership and acceptance

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
inference even when the Show id still matches.

Composition edits also retain the captured `updatedAt`; application does not
restamp it. After an intervening manual save, this older timestamp can prevent
the durable baseline from advancing even if the candidate saves successfully.
A later failure can then restore a baseline that no longer matches storage.
This is an unfixed violation of the store's timestamp-ordering assumption,
identified by source inspection without an overlapping-save regression test.

The service separately permits one request at a time across clients. A busy
service returns HTTP 429 as JSON, while the overlay expects a streamed terminal
result and reports a missing-result error. Its per-tab busy flag therefore does
not provide a coherent cross-tab waiting or retry protocol.

The browser looks up the current window bridge when applying the response.
Consequently, the obsolete-object check does not bind the request to its
originating editor installation: navigating away and back to the same Show can
leave an old response eligible for application. There is no request cancellation
or operation-id deduplication contract at this boundary.

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

The agent sources and tests currently live in the V3 repository; paths below
are relative to that repository at local commit
`9ecd481fd6facc0f7c68c1f99cd6c0d6c1405654`. That commit is not yet published,
so these are source locators rather than GitHub links. Move them with the
integration rather than maintaining a second contract.

- Grammar sessions (`src/grammar/session.ts`) and
  transaction tests (`test/grammarTransactions.test.ts`) own private
  working state, final validation, rollback, and private history.
- Session tests (`test/grammarSession.test.ts`) and
  turn tests (`test/dictationTurn.test.ts`) exercise session and
  completion behavior. They do not prove live mouse/agent concurrency.
- Composition replacement (`src/grammar/support.ts`) preserves the captured
  timestamp; this is source evidence for the ordering gap above.
- Service (`src/bridge/server.ts`),
  browser bridge (`src/bridge/chat.js`), and
  turn runner (`src/experiment/turn.ts`) own the request path.
- The external editor interface was inspected in PXLBLZ-IDE at
  `d934270cf0a06294b2ab66e49eb6172e9ed8b1bd`, in
  [ShowEditor](../../../src/components/ShowEditor.tsx) and
  [Show store](../../../src/store/showStore.ts). No V2 bridge test was found;
  these application claims are source-inspected, not live interaction proof.
  V3's vendored compiler source is a separate dependency and does not identify the live
  editor revision. Recheck this boundary when changing the editor integration.

Revision admission, request retirement, and explicit applied/durable outcomes
remain roadmap work. This baseline does not claim those guarantees or select a
merge policy. The shared-agentic Show editing roadmap currently lives at
`docs/plans/shared-agentic-show-editing-roadmap-prd.md` in the V3 checkout.
Migration into V2 does not itself implement the proposed guarantees.
