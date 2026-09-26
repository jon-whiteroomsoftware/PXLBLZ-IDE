# Show state, history, and persistence

The Show store owns the editable version-2 Show record (`showV2Pilots`) and its
session undo/redo history (`showV2Histories`). Personal Shows save through the
personal-content provider's version-2 boundary; built-in lesson edits remain in
in-memory drafts. A visible edit and a durable save are distinct states, and
callers must handle that distinction when reporting success. The version-1
editing chain (`updateShow`, its convenience mutators, `undoShow`/`redoShow`,
stock drafts and the version-1 save failure) was deleted in #1042 S2a.

## Adoption and history

`updateShowV2Pilot(id, next)` validates a complete replacement, assigns it the
next single-client `updatedAt` ordering stamp, and records the preceding Show in
history before awaiting personal persistence. The store assigns that stamp as
`max(Date.now(), current.updatedAt + 1)`; a captured manual or agent timestamp
never controls adoption order. The stamp is not a document revision. A new edit
clears redo and retires an older failure notice for that Show. An absent working
copy, an identical record object, or a replacement with another id is a no-op.
Callers must supply an unaliased replacement for the intended Show; this
primitive is not an identity-admission boundary.

One adopted replacement produces one history entry, regardless of how many
private operations produced it. Update, undo, and redo use the same personal
replacement settlement policy. Undo and redo restore validated snapshots
while moving through the same store history. History is session state, not a
second durable workspace. Workspace reload retires personal working copies with
their history; callers cannot assume history survives a reload or an externally
changed Show.

Lesson drafts and their history stay in memory until an explicit copy
(`duplicateShowV2Row`) creates personal content. Editing a draft therefore
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
publication exposes one volatile capability to the Controller popover, the sole
Run/Save surface. The popover invokes the prepared, warning-dependent delivery
path and requires a matching Show route identity. Publication cleanup is
editor-instance-scoped, so an old editor cannot retire a newer owner. Closing
the popover cancels pending confirmation. Its failure feedback consumes the
artifact-scoped result and persists across reopening until dismissal or a later
outcome. Personal Show-save failures remain in the editor. Run/Save
checks that snapshot and the Controller session before delivery, including after asynchronous Save
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
and lesson-draft updates, undo/redo, recovery rollback, creation, deletion start
and lesson draft reset invalidate earlier whole-Show requests. Successful hydration
conservatively advances known Show revisions even when it retains an equal or
queued record. Revisions survive identity removal, so delete/recreate and
edit/undo cannot restore old eligibility. Same-reference updates, exhausted
history, unchanged rename, absent draft reset and notice dismissal do not
advance revisions. Equal-content replacement objects retain the existing manual
update behavior.

Whole-Show candidate admission (`deliverShowV2EditCandidate`) checks the whole
Show revision and that the delivery's prepared capture is still the open record,
validates a private clone's structure, domain and authoring rules, prepares its
Stage, and checks eligibility again before adoption. The operation receipt is
registered before the one history entry is published; no persistence await
separates those steps. Invalid identity, validation failure, cancellation,
retirement, stale revision and duplicate delivery cannot replace the document or
add history/provider writes. A candidate that authors no change produces a
no-candidate refusal. Command-specific no-change semantics remain in the command
registry.

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
sequence without an await. Whole-Show work uses revision equality. Timeout, cancellation and lifecycle invalidation discard pending
resources without taking over history or persistence. The [bounded wait contract](agent-candidate-application.md#internal-bounded-active-input-wait)
defines ownership, timing and its internal-only limits.

The operation table retains immutable pending, refused, cancelled, completed, no-op and
applied receipts for the live session. Duplicate delivery reads the existing
outcome; a changed envelope under the same id refuses without replacing that
identity. Target qualification remains
the engine adapter's responsibility. The configurable default is 256 entries
per session, a conservative memory bound. A full table refuses new registrations
instead of evicting ids. Retirement clears historical lookup; unknown or old
requests never register themselves during delivery.

An `invalid-candidate` refusal may retain one bounded, deeply frozen validation
diagnostic in that same receipt. No other status or refusal reason owns the
field. Duplicate delivery and outcome recovery read the stored value; they do
not regenerate it. Diagnostic retention adds no candidate, transcript, history,
adoption, save or replay owner, and retirement clears it with the operation.

Noncandidate completion checks the live session, Show, operation and exact captured
envelope, including its original base revision, but does not compare that revision
with the current document. Manual edits, Undo and hydration cannot turn an answer
or service disposition into a revision-conflict refusal. Completion changes no
document, history or provider state. Candidate admission retains both
current-revision checks.

Applied receipts distinguish saving from settlement. The existing personal
write queue reports saved when that adoption is still current at successful
settlement, superseded when a later state owns the outcome, and rolled-back
when current-write failure restores its durable record/history pair. Lesson-draft
admission reports draft immediately. Receipt lookup is session-only; an adopted
save still settles normally after retirement without recreating lost receipts.
These outcomes use the existing recovery policy, not a second persistence queue.

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
durable baseline it restores the preceding record and history. Callers may
consume that rejection; the store's failure state (`showV2SaveFailure`) remains
the UI's recovery surface. Undo and redo return `false` only when their current
replacement rolls back, also used for exhausted history. A superseded undo or
redo failure returns `true` because the later accepted edit owns the visible and
durable outcome.

A retry resubmits the captured failed candidate as another update; dismissing
removes the failure notice. Accepting a later edit retires the older retry before
that edit's save settles. Retry is not a merge or an operation-id-based
exactly-once protocol. Callers must not interpret a resolved update promise as
proof that that specific candidate is the current durable record: superseded
failures also resolve, and lesson-draft edits have no personal save.

Workspace reload retires every personal version-2 working copy, its history,
durable baseline and failure notice; the Show reopens from its stored bytes with
an empty history. Personal deletion is queued behind prior writes for the same
Show, then removes the record, history, durable baseline, active selection, and
failure notice; a late write cannot recreate the deleted provider record.

## Write, reload, and reset inventory

This is the complete V2 ownership inventory. The internal request API checks
store revisions; existing manual replacement callers retain their original API.

- Personal creation: `createNewShowV2`, `createShowFromController`, `.pxlshow`
  import of either version, and `duplicateShowV2Row` converge on
  `addImportedShowV2` and provider `createShowV2`. Creation waits for an
  in-flight hydration before writing. The store's version-1 creators were
  deleted in #1042 S2a; the remote provider's `createShow` throws
  `show-v1-retired`.
- Personal replacement: `updateShowV2Pilot`, `renameShowV2Pilot`,
  `undoShowV2Pilot`, `redoShowV2Pilot`, `retryShowV2SaveFailure` and
  `deliverShowV2EditCandidate` converge on the store's one adoption/settlement
  policy and the per-Show provider `replaceShowV2` queue. `renameShow` renames a
  listed row that is not open by replacing its stored bytes on the same queue;
  any other id is a no-op. The version-1 replacement actions were deleted in
  #1042 S2a.
- Personal deletion: `removeShow` adds provider `deleteShow` to that same
  per-Show queue before clearing all local state for the identity.
- Reload: `loadShows` retires personal version-2 working copies and history,
  obtains provider `listShowDocumentsV2`, and populates `showV2Rows`. A listing
  whose provider or workspace changed while it was read is discarded.
- Lesson draft write/reset (v2): a built-in lesson opens from its native v2 copy
  (`stockShowV2ById`) as a session-only in-memory draft. Lesson-draft
  membership is explicit store state, never inferred from the id, so a personal
  v2 pilot placed directly under a built-in id still saves. Opening makes no
  provider call and records no durable baseline; a second open keeps the
  session draft. `updateShowV2Pilot`, Undo, Redo, and the agent candidate path
  adopt through the same synchronous state update as personal replacements but
  skip the provider check, queue no persistence, enter no rollback path, and
  settle as `draft`. A lesson pilot never appears in `showV2Rows` and never
  routes rename, delete, or duplicate as a personal v2 row.
  Workspace reload retains the lesson pilot and its history while retiring
  provider-owned v2 pilots; later lesson edits and Undo remain available.
  `resetShowV2LessonDraft` re-seeds the pilot from the lesson copy with an
  empty history and an advanced revision. Built-in Shows still open on the
  version-1 editor until the slice 11c routing switch, so this capability has
  no user-visible surface yet.
- Notice reset: `dismissShowV2SaveFailure` removes only the recovery notice. It
  changes no record, history, queued operation, or durable baseline.

## The version-2 route and storage

Since #1039, v2 is the production Show path: fresh-Show creation, the Show
list, the store's version-2 listing and `.pxlshow` import use it. A stored
version-2 document or native v2 built-in opens on the v2 backing in the one
editor. Personal Show rows store a version-2 document in `record_json`;
migration 0029 removed the twelve version-1 columns. The Worker answers the
version-1 list and writes with 410 `show-v1-retired`. A row whose
`record_json` is NULL is never listed or opened. No stored row converts on read.

An id with no stored v2 row and no native v2 built-in is not opened. There is
no preview parameter.

The store lists stored Shows as `showV2Rows` - identity, name and stamp only -
which `loadShows` fills from `listShowDocumentsV2`, discarding a listing whose
workspace or provider changed while it was read, and answering a failed
listing with no rows rather than a failed workspace load.
`listShowDocumentsV2` reads `/api/shows?show-version=2`, which answers with
stored version-2 records only; a row without `record_json` is never listed.
The provider still filters the answer to actual version-2 records. The Show
list renames, duplicates and trashes those rows.

`createNewShowV2(input)` authors a fresh Show natively as version 2 through
[`createShowV2WithOutputContract`](../../../src/engine/showCreationV2.ts) -
the same two 30-second Clips over one two-sided Crossfade the version-1 builder
places, compiling to the same artifact - and `addImportedShowV2(record)`
persists an imported one. Both validate the complete record before the provider
sees it, write through the provider's explicit `createShowV2` boundary, refuse
when the workspace has none, and add the row to `showV2Rows` with its own
in-memory record and empty history, so the route can edit it at once.

`updateShowV2Pilot(id, next)` adopts one complete changed candidate. It reuses
the same per-Show persistence queue and generic history transitions as ordinary
Show updates. Undo and redo therefore each replace one whole record and perform
one durable write. A current write failure restores the last durable
record/history pair; every successful queued write advances that pair even while
a newer optimistic candidate owns the visible record. A superseded failure cannot
replace a newer accepted candidate. Providers without the version-2 replacement
capability refuse before optimistic adoption. Reload obtains and validates stored
version-2 bytes and starts a fresh session history. Pilot open and reload join the
per-Show persistence queue, wait for current workspace hydration, and adopt only
while their captured provider, workspace generation and document revision remain
current. Workspace reload retires outstanding pilot reads and write settlements;
an authorized old-provider write may finish, but cannot republish its record,
history, durable baseline or failure into the new workspace.

Open adopts the record and history without selecting a route. While the gated
URL names a Show, that explicit route is authoritative over an ordinary
active-Show selection, including a late open for a route the user has left.
Ordinary Show-list selection remains one explicit open plus route navigation.
The header reads and renames the version-2 record through
the store-owned `renameShowV2Pilot(id, name)` action. That action resolves the
current version-2 record at submission, applies the `rename_show` registry
owner, and delegates the one name-only replacement to `updateShowV2Pilot`. A title field may retain
its submit callback while another edit, Undo, or failed-save rollback replaces
the visible record; submitting the name therefore cannot restore the record
snapshot from edit start. Missing and same-name requests remain no-ops, and the
route never sends a rename through the version-1 sparse patch path.

The general Marker controls call `admitShowV2PilotMarkerEdit` with the
captured document revision, route lifetime and the parent’s exact prepared
ready/empty context, including Pattern/Map/Library/profile and resolved-map
identity. The seam validates the pure Marker candidate and prepares that candidate
once with the captured trusted context, then rechecks eligibility before invoking
the ordinary v2 update once. Current preview is reused without direct lowering
or another current compile. A local adoption receipt permits normal saved status
on the own stamped record; external replacements retire obsolete feedback. The
route's own commands follow the same rule: `Reopen artifacts` and both exports
publish their outcome only while the capture they read is still the route's,
and `Reload saved v2`, which replaces the record itself, only while it is still
the newest such command. No-op/refusal creates no history or save. Superseded
settlement never reports a current durable save.

A structurally validated Show with zero effective Clips remains editable/saveable.
Marker admission explicitly recognizes that empty-content partition; preview and
export are unavailable until content is added, and the route says so where the
Stage and the artifacts would be. Other nonempty compiler or pilot
preview refusals remain refusals, and no placeholder runtime is created.

The remote provider addresses the explicit v2 collection with
`show-version=2`; D1 stores the complete closed record in `record_json`. The
version-1 reads and writes (`GET` and `POST /api/shows` without the parameter,
and every `PATCH`) answer 410 `show-v1-retired` since #1042 Phase 1b. Worker
admission uses the same domain validator after a Cloudflare-compatible
structural-schema interpreter, because Workers prohibit AJV's runtime code
generation.

A version-1 `.pxlshow` import resolves dependencies and calls
`convertAppliedShowImportV1` before any write. The converter resolves Pattern
sources and the Stage map exactly against imported and workspace records; it
refuses an unresolved source instead of guessing. The #1039 rehearsal and
#1105 local conversion used the since-retired D1 tool; see the
[cutover rehearsal](../evidence/issue-1039-cutover/rehearsal.md) for the
recorded conversion and recovery evidence.

Version-2 bundle import reserves destination and bundled Library namespaces
before allocating conflict copies. A matching Library is reusable only when its
complete dependency graph remains unchanged after remapping; dependency remaps
propagate through every owner to a fixed point before the plan can be applied.

The pilot's compilation seam resolves one Library map and passes that identical
map through version-2 preparation and final Show compilation. A Restart whose
bundled Pattern and Library state is restorable scalar state compiles; unsupported
persistent Library state refuses at preparation before an artifact can escape.
Native prepared Stage and artifact qualification now consume one captured
ready bundle, preserving transient Restart and exact animation without a legacy
record or direct lowering. Marker admission reuses that current capability and
validates its own changed candidate with the same trusted inputs. They do not switch the production editor or compiler default.
The [route-pilot test design](../evidence/issue-1044-route-pilot/test-design.json)
defines its conversion, history, persistence, artifact, and migration oracles.

## Known limits and discrepancies

- Durable-baseline ordering uses store-assigned `updatedAt` ordering stamps.
  They are not server revisions or a cross-client conflict protocol; clock skew
  can still misorder records from different clients. #802 owns that boundary.
- The manual `updateShowV2Pilot` API accepts complete records without comparing an
  expected base revision. It remains an internal manual-owner primitive; the
  diagnostic bridge uses checked admission instead.

These limits describe present behavior. They do not authorize weakening the
ordinary-update recovery guarantee or claim that shared editing is safe.

## Ownership and evidence

[Show store](../../../src/store/showStore.ts) owns adoption, history, hydration,
write ordering, failure notices, and retry.
[Personal-content provider](../../../src/engine/personalContentProvider.ts)
owns the storage seam.
[Store tests](../../../src/store/showStore.test.ts) and
[v2 pilot tests](../../../src/store/showV2PilotStore.test.ts) cover grouped
history, stable composition ids through undo/redo, queued writes, superseded
ordinary, undo, and redo failures, stale candidate stamps, consecutive failures,
hydration races, retry supersession, in-flight deletion, and complete in-memory
lesson history/reset behavior. The browser baseline's green sequence E proves
the delayed agent-save failure and reopen surface from an unsandboxed host run.
Together those cases establish bounded single-client recovery; they do not
prove general collaborative editing or clock-skew safety.

[Admission tests](../../../src/store/showV2CandidateAdmission.test.ts) cover the internal
request seam with complete record/history and provider oracles, including
stale revisions, deletion, session retirement and departure, duplicates,
capacity, rollback/supersession and lesson drafts. These tests qualify the internal owner. The diagnostic browser baseline covers
live whole-Show admission; qualified Layer independence has separate C1 evidence.
