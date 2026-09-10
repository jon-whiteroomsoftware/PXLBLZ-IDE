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

## Preview and delivery publication

Preview reconstruction and Controller preparation consume committed snapshots;
they do not create history entries or provider writes. Stage compilation uses
current personal Pattern and Library sources, Stage map/output inputs and the
applicable profile. A temporary gesture override affects Stage preview only.
The existing reconstruction generation retires old results on dependency
replacement, navigation and unmount before they can paint.

ShowEditor retains a prepared delivery snapshot only while that editor is
mounted and its compilation inputs remain current. Its layout-phase delivery
publication exposes one volatile capability to the header and Controller
popover; both invoke the same preparation, warning-dependent confirmation and
delivery path. The popover requires a matching Show route identity. Publication
cleanup is editor-instance-scoped, so an old editor cannot retire a newer
owner. Run/Save checks that snapshot
and the Controller session before delivery, including after asynchronous Save
JPEG preparation. Unmount clears the snapshot, so a late JPEG cannot send.
Generated-code downloads retain their explicitly captured export snapshot;
later edits do not silently replace the requested export.

The delayed consumer partitions live in `ShowStagePreview.test.tsx` and
`ShowEditor.test.tsx`. Mocked sends prove selected inputs, not hardware execution.

## Internal request admission

The internal admission API binds each request to an explicit editor session,
Show id, store revision and immutable operation identity. Starting another
session or explicitly retiring the current one makes its requests ineligible,
even when the next editor opens the same Show. Adapters must retain the session
token across ordinary component effect recreation and retire it on editor
departure. Store navigation away and Show creation retire the current session;
the gated diagnostic editor bridge uses this API.

Document revisions advance independently of persistence timestamps. Personal
and stock updates, undo/redo, recovery rollback, creation, deletion start and
stock draft reset invalidate earlier whole-Show requests. Successful hydration
conservatively advances known Show revisions even when it retains an equal or
queued record. Revisions survive identity removal, so delete/recreate and
edit/undo cannot restore old eligibility. Same-reference updates, exhausted
history, unchanged rename, absent draft reset and notice dismissal do not
advance revisions. Equal-content replacement objects retain the existing manual
update behavior.

The whole-Show callback admission checks the whole Show revision, evaluates a
private clone through trusted synchronous engine callbacks, normalizes the
candidate, requires a synchronous final-validation success, and checks
eligibility again before adoption. The operation receipt is registered before
the one history entry is published; no persistence await separates those steps.
Invalid identity, validation failure, cancellation, retirement, stale revision
and duplicate delivery cannot replace the document or add history/provider
writes. A callback returning no candidate or its original input identity
produces a no-candidate refusal. Command-specific no-change semantics remain in
the command registry.

The internal completed-candidate wait path defers whole-Show admission and
qualified exact resize while explicit drag/dirty owners remain active. Manual
commit publishes its store replacement before releasing activity. Registered
Clip resize/move/duplicate, Marker creation/movement, Show End, placement-pad
and native Effect reorder keep their control-owned lifetime through callback
settlement, including a failed save; cleanup never creates an extra history step
or rollback policy. Placement still commits once on pointerup or pointercancel;
its lost-capture cleanup discards preview without authoring. The optional Property
Beat movement callback still authors each move rather than batching history.
Physical-zone selection retains its local changed indexes through pointerup and
rectangle cancellation, until explicit Save/Cancel or source replacement. Save
adopts before closing and releasing; failure follows the state actually retained.
An unchanged open selector follows authoritative selection updates so a later Save
cannot restore stale indexes. Explicit Save keeps its existing history boundary.
Existing pointer identity and cancellation semantics remain authoritative. Candidate settlement
then performs the applicable current qualification, final validation and adoption
sequence without an await. Whole-Show work uses revision equality; qualified resize
replays on current state under its private Layer dependencies, preserving unrelated
placement edits. Timeout, cancellation and lifecycle invalidation discard pending
resources without taking over history or persistence. The [bounded wait contract](agent-candidate-application.md#internal-bounded-active-input-wait)
defines ownership, timing and its internal-only limits.

The operation table retains immutable pending, refused, cancelled, completed, no-op and
applied receipts for the live session. Duplicate delivery reads the existing
outcome; a changed envelope under the same id refuses without replacing that
identity. Explicit retry requires a new id and retains the original payload
identity, reference context and target identities. Target qualification remains
the engine adapter's responsibility. The configurable default is 256 entries
per session, a conservative memory bound. A full table refuses new registrations
instead of evicting ids. Retirement clears historical lookup; unknown or old
requests never register themselves during delivery.

Noncandidate completion checks the live session, Show, operation and exact captured
envelope, including its original base revision, but does not compare that revision
with the current document. Manual edits, Undo and hydration cannot turn an answer
or service disposition into a revision-conflict refusal. Completion changes no
document, history or provider state; its terminal receipt cannot be an explicit
`retryOf` original. Candidate admission retains both current-revision checks.

Applied receipts distinguish saving from settlement. The existing personal
write queue reports saved when that adoption is still current at successful
settlement, superseded when a later state owns the outcome, and rolled-back
when current-write failure restores its durable record/history pair. Stock
admission reports draft immediately. Receipt lookup is session-only; an adopted
save still settles normally after retirement without recreating lost receipts.
These outcomes use the existing recovery policy, not a second persistence queue.

The internal exact-resize owner can admit across unrelated placement edits by
observing engine-owned Layer dependencies throughout the pending lifetime. Its
receipt binds the original resolved logical target and exact range; retry
retains that meaning while recapturing dependencies from current state. The
owner replays the stored operation on current state and validates the final
authoring candidate synchronously before ordinary adoption. A terminal validated
`noop` adds no history or write and remains deduplicated at the existing session
cap. Qualified receipts cannot be submitted to the arbitrary callback path. The
finite supported scope, conservative lifecycle/source invalidation and evidence
are defined in [Internal qualified exact resize](agent-candidate-application.md#internal-qualified-exact-resize).

## Manual resize source check

The editor's pointer resize callback checks the captured Show/composition against
the latest render and the current personal/stock record identity before resolving
the painted range. A stale drag refuses, including an unrelated metadata change;
it cannot spread an old Show over current state. No persistence occurs during
preview. Accepted pointer and inspector duration edits still pass through the
editor's reference-Pattern-slot restoration wrapper and the ordinary store update,
so one changed commit owns one history/save and the existing failure recovery.
They do not create or retire an agent session, or use narrow Layer admission.

## Personal saves and recovery

Full-record saves are queued per Show within this client. A later save starts
after the preceding save settles, including failure. This preserves submission
order at the provider boundary without blocking optimistic editing.

The remote provider preserves explicit output-Effect clearing: a replacement's
`outputEffects: undefined` becomes `outputEffects: []` on the PATCH wire, while
an absent property in a sparse patch remains absent. Undo can therefore restore
a Show without Trails without leaving the previous Effects in durable storage.
The existing profile-clear encoding remains independent.

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
- The manual `updateShow` API accepts complete records without comparing an
  expected base revision. It remains an internal manual-owner primitive; the
  diagnostic bridge uses checked admission instead.

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
capacity, rollback/supersession and stock drafts. These tests qualify the internal owner. The diagnostic browser baseline covers
live whole-Show admission; qualified Layer independence has separate C1 evidence.
