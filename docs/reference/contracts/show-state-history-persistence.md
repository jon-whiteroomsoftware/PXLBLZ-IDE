# Show state, history, and persistence

The Show store owns the editable Show record and its session undo/redo history.
Personal Shows save through the personal-content provider; stock Show edits
remain in in-memory drafts. A visible edit and a durable save are distinct
states, and callers must handle that distinction when reporting success.

## Adoption and history

`updateShow(id, next)` adopts a normalized replacement, assigns it the next
single-client `updatedAt` ordering stamp, and records the preceding Show in
history before awaiting personal persistence. The store assigns that stamp as
`max(Date.now(), current.updatedAt + 1)`; a captured manual or agent timestamp
never controls adoption order. The stamp is not a document revision. A new edit
clears redo and retires an older failure notice for that Show. An absent target,
an identical record object, or a Show being deleted is a no-op. Callers must
supply an unaliased replacement for the intended Show and preserve its id; this
primitive is not a general validation or identity-admission boundary.

One adopted replacement produces one history entry, regardless of how many
private operations produced it. Update, undo, and redo use the same personal
replacement settlement policy. Undo and redo restore normalized snapshots
while moving through the same store history. History is session state, not a
second durable workspace. Hydration reconciles it with the loaded record;
callers cannot assume history survives a reload or an externally changed Show.

Stock drafts and their history stay in memory until an explicit save-as or
other persistence operation creates personal content. Editing a draft therefore
does not prove that a durable personal Show exists.

## Internal request admission

The internal admission API binds each request to an explicit editor session,
Show id, store revision and immutable operation identity. Starting another
session or explicitly retiring the current one makes its requests ineligible,
even when the next editor opens the same Show. Adapters must retain the session
token across ordinary component effect recreation and retire it on editor
departure. Store navigation away and Show creation retire the current session;
the diagnostic editor bridge has not yet adopted this API.

Document revisions advance independently of persistence timestamps. Personal
and stock updates, undo/redo, recovery rollback, creation, deletion start and
stock draft reset invalidate earlier requests. Successful hydration conservatively
advances known Show revisions even when it retains an equal or queued record.
Revisions survive identity removal, so delete/recreate and edit/undo cannot
restore old eligibility. Same-reference updates, exhausted history, unchanged
rename, absent draft reset and notice dismissal do not advance revisions.
Equal-content replacement objects retain the existing manual update behavior.

Admission checks the whole Show revision, evaluates a private clone through
trusted synchronous engine callbacks, normalizes the candidate, requires a
synchronous final-validation success, and checks eligibility again before
adoption. The operation receipt is registered before the one history entry is
published; no persistence await separates those steps. Invalid identity,
validation failure, cancellation, retirement, stale revision and duplicate
delivery cannot replace the document or add history/provider writes. A callback
returning no candidate or its original input identity produces a no-candidate
refusal. Command-specific no-change semantics remain in the command registry.

The operation table retains immutable pending, refused, cancelled and applied
receipts for the live session. Duplicate delivery reads the existing outcome;
a changed envelope under the same id refuses without replacing that identity.
Explicit retry requires a new id and retains the original payload identity,
reference context and target identities. Target qualification remains the
engine adapter's responsibility. The configurable default is 256 entries per
session, a conservative memory bound. A full table refuses new registrations
instead of evicting ids. Retirement clears historical lookup; unknown or old
requests never register themselves during delivery.

Applied receipts distinguish saving from settlement. The existing personal
write queue reports saved when that adoption is still current at successful
settlement, superseded when a later state owns the outcome, and rolled-back
when current-write failure restores its durable record/history pair. Stock
admission reports draft immediately. Receipt lookup is session-only; an adopted
save still settles normally after retirement without recreating lost receipts.
These outcomes use the existing recovery policy, not a second persistence queue.

## Personal saves and recovery

Full-record saves are queued per Show within this client. A later save starts
after the preceding save settles, including failure. This preserves submission
order at the provider boundary without blocking optimistic editing.

For every personal replacement, the current optimistic ordering stamp
determines recovery. If a newer accepted record superseded the failed write,
the failed call resolves without restoring its predecessor or publishing a
failure notice. If the failed record is still current, the store restores the
last known durable record together with its matching history, records the
failed candidate for recovery, and rejects the replacement settlement. With no
durable baseline it restores the preceding record and history. Convenience
mutation actions may consume that rejection; the store's failure state remains
the UI's recovery surface. Undo and redo return `false` only when their current
replacement rolls back, also used for exhausted history. A superseded undo or
redo failure returns `true` because the later accepted edit owns the visible and
durable outcome.

A retry resubmits the captured failed candidate as another update; dismissing
removes the failure notice. Accepting a later edit retires the older retry before
that edit's save settles. Retry is not a merge or an operation-id-based
exactly-once protocol. Callers must not interpret a resolved update promise as
proof that that specific candidate is the current durable record: superseded
failures also resolve, and stock edits have no personal save.

Hydration preserves a queued local replacement when its ordering stamp is at
least the provider snapshot's stamp. A provider record with a newer stamp wins
and clears incompatible session history. When hydration observes the exact
record being saved, the store retains that record's matching history. Personal
deletion is queued behind prior writes for the same Show, then removes the
record, history, durable baseline, active selection, and failure notice; a late
write cannot recreate the deleted provider record.

## Write, reload, and reset inventory

This is the complete V2 ownership inventory. The internal request API checks
store revisions; existing manual replacement callers retain their original API.

- Personal creation: `createNewShow`, `createShowFromController`,
  `addImportedShow`, and `duplicateShow` converge on `addShow` and provider
  `createShow`. Creation waits for an in-flight hydration before writing.
- Personal replacement: `updateShow` and every convenience editor action,
  `undoShow`, `redoShow`, and `retryShowSaveFailure` converge on the store's one
  adoption/settlement policy and the per-Show provider `updateShow` queue.
- Personal deletion: `removeShow` adds provider `deleteShow` to that same
  per-Show queue before clearing all local state for the identity.
- Reload: `loadShows` obtains provider `listShows`, normalizes each record,
  reconciles queued local replacements by ordering stamp, resets incompatible
  histories, and replaces the durable-baseline inventory.
- Stock draft write/reset: `updateShow`, `undoShow`, and `redoShow` change only
  the in-memory draft/history pair; `resetStockShowDraft` removes both and
  exposes the pristine stock fixture again. Provider methods are never called.
- Notice reset: `dismissShowSaveFailure` removes only the recovery notice. It
  changes no record, history, queued operation, or durable baseline.

## Known limits and discrepancies

- Durable-baseline ordering uses store-assigned `updatedAt` ordering stamps.
  They are not server revisions or a cross-client conflict protocol; clock skew
  can still misorder records from different clients. #802 owns that boundary.
- The manual `updateShow` API, still used by the diagnostic bridge, accepts
  complete records without comparing an expected base revision. Save serialization alone does not prevent a stale replacement
  from overwriting a newer edit; baseline sequences A, B, and C reproduce
  that overwrite on the live editor.

These limits describe present behavior. They do not authorize weakening the
ordinary-update recovery guarantee or claim that shared editing is safe.

## Ownership and evidence

[Show store](../../../src/store/showStore.ts) owns adoption, history, hydration,
write ordering, failure notices, and retry.
[Personal-content provider](../../../src/engine/personalContentProvider.ts)
owns the storage seam.
[Store tests](../../../src/store/showStore.test.ts) cover grouped history,
stable composition ids through undo/redo, queued writes, superseded ordinary,
undo, and redo failures, stale candidate stamps, consecutive failures,
hydration races, retry supersession, in-flight deletion, and complete in-memory
stock history/reset behavior. The browser baseline's green sequence E proves
the delayed agent-save failure and reopen surface from an unsandboxed host run.
Together those cases establish bounded single-client recovery; they do not
prove general collaborative editing or clock-skew safety.

[Admission tests](../../../src/store/showEditAdmission.test.ts) cover the internal
request seam with complete record/history and provider oracles, including
stale revisions, hydration/reset/deletion, session retirement, duplicates,
capacity, rollback/supersession and stock drafts. These tests do not prove
live editor integration or qualified Layer independence.
