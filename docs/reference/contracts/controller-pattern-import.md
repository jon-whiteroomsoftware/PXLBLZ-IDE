# Controller Pattern import

The [#1221 I3 contract](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1221#issuecomment-6406968606)
defines selected-slot import into a fresh personal Pattern. Dispatch A implements
lossless reading, pure assessment/planning/retry decisions and durable ledger
ownership. Dispatch B adds the injected selected-slot command and permanent
source-policy consumers. Slice C exposes confirmed single-item Import, durable
Resume import and the editor policy notice through a captured host adapter.
Slice D adds group-local confirmed bulk import through the same command, retained
per-item outcomes and failed-only retry without navigation. Final committed
browser/native-firmware proof remains pending; these slices do not establish
completion of #1221.

## Controller Save transport

The helper serializes Controller HTTP by normalized host across all page ports
and connection ids. A FIFO turn owns fetch, the complete response body and its
decode/decompression, or awaited error-body cancellation. Provider reply
timeouts remove only the page waiter; the underlying action must settle before
the next turn starts. Other Controllers and cloud discovery remain independent.

Before forwarding a first type-1 binary frame, the helper records the actual
WebSocket as an in-memory Save owner. Queued HTTP rechecks all owners at
admission; no new Controller HTTP starts until every owner receives a defined
`saveProgramSourceFile` completion (positive or negative) or actually closes.
Generic ack, undefined completion, send failure, Save deadline, local close
request and another socket's completion cannot release an owner. HTTP already
admitted before Save may finish. No timer release or automatic retry occurs.

Actual close and helper restart bound this in-memory agreement. Reconnecting
after close or restarting the helper can admit HTTP while firmware still writes;
this reconnect/write-overlap residual is accepted, not proof of firmware
quiescence. Reload the unpacked helper in `chrome://extensions` to adopt these
changes; updating the app alone does not update the helper. Helper publication
remains held. The direct probe awaits protocol Save completion and applies the
same socket-owned HTTP admission hold in both scheduling modes. Its default
overlap mode still permits HTTP/HTTP overlap outside Save; the production helper
serializes all Controller HTTP. Probe liveness excludes held time while retaining
the prior unhealthy budget. Physical latency/overlap proof remains pending;
offline tests establish only the software agreement.

`saveProgram` resolves only after a truthy `saveProgramSourceFile` completion
arrives on the owning current socket after submission of the final type-1 frame.
Local transmission and generic `ack` do not confirm Save. A defined falsey
completion rejects with `Controller Save unconfirmed: device reported failure`;
undefined completion is ignored. The operation-wide deadline includes waiting
for prior acknowledgements and rejects with
`Controller Save unconfirmed: completion timed out`. Connection loss,
replacement, and send failure also reject with `Controller Save unconfirmed:`.

Save reserves the socket before sending, drains prior wire acknowledgements,
and sends each 1280-byte-body chunk only after the preceding chunk's truthy ack.
Positive completion releases the Save reservation immediately, allowing ordinary
activation and controls. The final ack may follow completion and remains FIFO
wire debt; a new Save may reserve immediately but waits for all prior debt,
including intervening activation/control frames, before submitting its first frame.
Acknowledgement expectations stay in FIFO wire order even after a request's
promise times out, so late replies cannot settle newer requests or advance Save.
While reserved, automatic keepalive is suppressed and explicit ack-bearing
commands and binary mutations reject with `Controller Save is pending`.
Unrelated reads remain available. Ordinary transmission pacing is unchanged.

A failed or timed-out Save makes production Save unavailable on that socket:
`Controller Save unavailable on this socket; reconnect before saving again`.
Experimental `putSourceCode` also makes the socket unavailable, because it uses
the same uncorrelated completion field. Late completion cannot clear this state.
Replacement clears socket-scoped state and ignores old callbacks; no automatic
Save retry occurs. The separate `saveTimeoutMs` defaults to a final 20,000ms
operation-wide deadline, including prior FIFO acknowledgement debt and awaited
completion; explicit overrides remain available. The deadline was selected from
24 clean-close Saves with a measured maximum of 2615.987ms. Probe reports include
only successfully awaited Save completion latencies by ordinal, phase and slot;
this transport agreement supplies no timer-based HTTP release signal.

## Source fidelity and identity

`recoverSavedProgram` retains its existing stripped source and parsed stamp and
adds a defensive copy of the downloaded PBP plus the exact decoded source,
including comments and banners. Older synthetic providers may omit that field;
new import execution must refuse providers without lossless data.

`assessControllerPatternImport` requires a PXLBLZ program ID, a readable supported
PBP, a Pattern rather than a parsed Show, nonempty source that compiles through
`bundleWithPasses(source, {}, [])`, and a reconciling bytecode header. Shows are
refused even when their source hash has drifted. Optional banner map or Show
metadata damage does not defeat an otherwise parseable Pattern identity.

PBP identity is SHA-256 over the exact downloaded bytes. CRC32 remains the banner
body-integrity comparison. Missing, malformed and hash-mismatched provenance is
recorded without granting trustworthy origin identity. Only an integrity-valid
Pattern banner is retained in the receipt.

Authored recovery requires an integrity-valid Pattern banner with no declared
transforms. It recovers the exact banner-stripped downloaded body even without a
stock/current-account canonical candidate. An independently supplied canonical
source with the same origin ID is preferred when its no-pass bundle equals that
body exactly. A stored-artifact candidate is excluded from canonical matching;
an absent, mismatched, excluded or unbuildable candidate leaves valid-stamp body
recovery intact. The caller must never supply downloaded text relabelled as a
canonical candidate or query another account. Authored imports apply the
destination account's current Controller profile.

Every other accepted assessment, including any nonempty transform list or
`stored-artifact` token, retains the exact stored source and initial PBP. It does
not unwrap generated code, infer an inverse, or layer a profile or adapter pass.
The settled fallback is “Write unchanged; warn old behavior remains”. Its policy
notice is:

> Imported wrapped source. Its old Controller profile behavior remains; this Controller profile is not applied.

Plans use the supplied fresh destination Pattern ID, a unique name from valid
banner/PBP/fallback naming, empty controls and extracted authors. The receipt
stores the SHA-256 of the complete initial account record in fixed property
order: ID, name, src, controls, authors, params, settings, updatedAt; absent
optionals are omitted. This digest witnesses initial creation/recovery. It is
not a permanent content lock. The receipt stores no second source/PBP copy and
no sender account identity.

## Durable ledger ownership

The account-scoped `controller-pattern-imports` metadata row contains version 1
receipts keyed by destination Pattern ID. Only an absent value means an empty
ledger. Corrupt data, unknown versions, mismatched keys and duplicate physical
Controller/program pairs fail closed with:

> Controller import metadata is unreadable. No Pattern was sent.

Origin, destination, physical Controller/slot, source mode, initial account
digest and creation time are immutable. Progress, baseline/delivery digests and
profile signature may change through `mutateControllerPatternImport`.

One private client-wide Promise tail owns every ledger mutation, across
Controllers and adapter instances. Each turn uses its captured storage/session,
asserts that session around awaited operations, GETs and validates fresh state,
calls a synchronous single-receipt updater, preserves siblings, PUTs and reads
back the complete ledger, then confirms receipt and sibling equality. A failed
turn rejects its caller; the next turn starts with a fresh GET. Raw adapter
`setPatternImports` is a wire port for this owner and storage tests, not another
product mutation route. There is no exported application whole-map setter.

The owner never calls a device queue or another service from its callback. It
holds only the short metadata turn. Bindings, labels and push records retain
their separate metadata rows and can proceed while a ledger turn is pending.
This provides no server transaction, CAS, multi-key atomicity or cross-tab
guarantee. Network and HTTP errors retain existing request errors; an ambiguous
write remains incomplete and is recovered from fresh durable state.

Demo and unsupported storage reject policy operations. No localStorage cache,
settings field, extra artifact persistence, migration or endpoint is added.
Policy-read errors must block sending in the later consumers.

## Retry and later edits

Stages are `planned`, `account-saved`, `write-pending`, `saved-verified`,
`activated`, `metadata-pending`, and `complete`. `write-pending` is the sole
persisted delivery intent before transmission. A successful save response alone
does not establish `saved-verified`: readback equality and a successful ledger
mutation are required.

Incomplete recovery requires the unchanged initial account digest and a slot
matching origin, baseline or delivery evidence. A missing slot conflicts. A
missing account record can be created only from `planned` with an untouched
origin. Verified stages require delivery equality to activate or finish
metadata. For earlier stages, delivery distinct from origin permits activation;
origin or baseline requires writing. Retry never mints an identity.

For wrapped fallback, origin and delivery may be identical. A persisted
`write-pending` then conservatively resends identical PBP to the same ID and reads
back. A fresh GET finding durable `saved-verified` can avoid that resend after a
lost progress response. This promises stable identity and truthful completion,
not exactly-once flash transmission.

## Selected-slot execution

`importControllerPattern` captures its authenticated adapters, physical identity,
provider and live epoch through a required host guard. The command runs in the
existing Controller write queue, finds historical completion before assessing
replacement source, and prepares delivery before publishing the account record.
Every intent/progress mutation uses the shared ledger owner. Account POSTs are
confirmed by reopening the fixed destination through `listPatterns`; a rejected
POST that persisted the exact record is adopted. A retry never allocates another
destination or saved slot.

Stored-artifact imports write a defensive copy of the exact downloaded PBP,
preserving its source, name, JPEG and bytecode. They inspect no-pass renderer
metadata for firmware eligibility and never load an importing profile. Authored
imports load and guard the current profile, apply its recipe and renderer
adapter, compile and validate bytecode, then stamp the destination Pattern with
the intent's fixed creation time. Profile changes invalidate asynchronous work.

The command persists write intent before draining or saving, reads the selected
slot back by SHA-256, and records saved verification before activation. Shared
normal-push activation helpers retain their existing replacement policy. A
verified unchanged-profile copy resumes activation or metadata without compiling
or re-saving. A changed authored profile first requires valid old retry evidence,
then uses the observed verified digest as its next write baseline.

Read failures describe the observed response bytes. Decoder failures report
`Saved program {programId} response could not be decoded as PBP. Retry reading this saved program.`
They diagnose neither saved-slot corruption nor the cause or completeness of a
partial response. An unavailable or undecodable retry response preserves durable
progress and its diagnostic cause; it is not evidence of a changed slot digest.
An unreadable retry with a planned or account-saved receipt uses the prefix
`Import already started; saved program could not be read. Retry checks the same slot.`
and preserves its diagnostic cause, making no negative claim about whether an
account copy exists.
Saved verification proves bytes, so an incomplete activation reports
`Controller copy verified; activation is unconfirmed. Retry resumes this import.`
Missing execution evidence uses the neutral progress-read error and retains its
cause. Actual digest and binding conflicts retain their existing refusals.

Before a required drain, the command captures the running Pattern's saved copy:
two guarded config reads must report the same nonblank active ID around a
lossless PBP read, decode and bytecode-header validation. It refuses without
sending a drain when there is no active ID, the running Pattern cannot be read,
its saved copy cannot be read or validated, or the active ID changes during
capture. The visible reason ends `No drain was sent.` An account copy and write
intent may already exist. A replacement that needs no drain needs no capture.

Once imported target activation confirms, a later progress or metadata failure
reports `Imported Pattern is running.` without further Controller reads, drain
compilation, drain or target pushes, or Save during error handling. Confirmation
is terminal for Controller writes in that invocation; the command still fails
with its original durable stage, identities and cause, leaving progress intact.

After drain dispatch and before imported activation confirms, including an
ambiguous rejected activation, a failed command retains the Controller queue for
one bounded recovery attempt. It
prefers the imported copy once selected-slot readback equals delivery and its
bytecode header validates, even if the saved-verification ledger mutation
rejects; otherwise it restores the captured previous saved copy. Recovery uses
the shared replacement-safety and confirmed-activation helpers, preserving all
session, profile and view guards. It never saves, changes ledger progress,
publishes a binding or push record, allocates a destination, or completes the
failed import. The original error retains its durable stage and identities.
Confirmed recovery appends `Imported Pattern is running.` or `Previous Pattern
restored from its saved copy.` to that error; the command still fails.

The previous snapshot is a saved copy: restoring it does not restore unsaved
live code. A guard or transport failure can leave recovery unconfirmed; the
error explicitly says `Recovery is unconfirmed; the Controller may still show
the drain.` Recovery neither reconnects nor bypasses a guard.

Bindings and authored push records are merged from fresh reads and confirmed by
readback. Short metadata turns serialize concurrent import commands so sibling
keys survive; this is client-local coordination, separate from the ledger owner.
Completion is written last. Binding success survives a later bookkeeping failure;
Retry finishes the remaining work and retains the durable source policy.

Command completion and current running status are distinct observations.
Historical completion returns without rereading the slot. After a completed
single import, inventory refresh and profile sync are observational: their
failure cannot relabel completion, keep the confirmation open, or prevent
navigation to the completed destination while the captured view is current.

An unavailable or malformed progress ledger leaves the receipt unknown. The
visible error neutrally asks Retry to check the same saved program again; it
claims no destination or durable stage and preserves the diagnostic cause
without appending its text to the message.

## Bulk import agreement

Saved, Unimported and Other share one active selection section; entering a
section starts empty and select-all receives every stable ID in that group's
current membership. Running and pending activation do not uncheck selected rows.
Missing members are pruned permanently; returning IDs do not resurrect checks.
Section, session and account changes retain their selection resets, and completed
imports exit selection.

Delete alone excludes running and pending slots, and blocks all targets while
Controller-scoped active evidence is unknown or blank. Selection mode shows
`Cannot delete: {reason}` below each excluded row's name and on its selectable
checkbox. Confirmation lists only currently eligible selected names; no eligible
selection opens no dialog and sends no mutation. Bulk Delete retains the existing
queued safety path and fresh-config checks. Other Import remains account-only
and permits active/pending targets while preserving session checks around reads.

Unimported bulk Import snapshots names and selected slots, confirms once before
source reads or mutations, and calls the unchanged durable single-item command
sequentially, including selected active/pending slots. Initial dispatch rechecks
captured view, current slot/name and config-source ownership; one failure does
not cancel later items. The command's own activation cannot prune selection or
suppress a later target. Results preserve exact named errors and count only
command completion; refresh failure cannot relabel a verified write. Failed-only
retry retains the captured destinations even after binding moves an incomplete
row to Saved, merges prior successes, and never resubmits them. Recovery uses the
command's existing conflict checks rather than new-selection eligibility. Closing
clears local outcomes; durable Resume remains available after remount. Busy work
locks dismissal and conflicting writes. View/account changes retire pending
dialogs and stale outcomes. Bulk import never navigates or changes the open
Studio subject.

Each successful bulk row displays exactly `{name}: Import completed.` alongside
the completion count and exact named failures. Later rows may activate other
slots, so a completed row makes no claim that its Pattern remains running.
Failed-only retry shows each prior and newly completed name once, removes
resolved failures, and never resubmits completed rows. Observational refresh or
sync failure cannot relabel a completed bulk command.

## Later delivery and reconciliation

`complete` is terminal historical completion regardless of later account or PBP
digests. Ordinary source, name, control, settings and timestamp edits preserve the
Pattern ID and separate ledger policy. Completed stored-artifact policy continues
to suppress profile application and reconciliation after edits/reload; it is
independent of hashes and stage. Later Run/Save must compile the current edited
source using that policy and its own freshness checks, without invoking
incomplete-import retry. Completion must not delete policy. Ordinary PATCH/update
must not use create-intent recovery.

The active-Pattern and generated-Pattern send paths load policy before preparing
passes and recheck it inside the queued write. Stored-artifact Patterns compile
their current edited source with no profile or adapter passes, skip unused
profile reads/waits, retain firmware checks, and omit profile freshness from Save
metadata. Authored preparation requires a successful profile load and guards
profile/session state through device mutations. Adapter replacement invalidates
the captured operation. Show delivery keeps its existing source semantics.

Later wrapped Pattern sends include exactly one `stored-artifact` transform in
their stamp, preserving caller and delivery IDs. Save embeds that token so a
subsequent cross-account assessment retains wrapped policy; Run sends bytecode
without a source banner. Initial wrapped import still preserves the original
PBP byte for byte.

Successful push-record persistence invalidates Saved Patterns freshness even when
program IDs and the list are unchanged; this publication retains the captured
storage destination.

Successful stored-artifact sends memoize local cleanliness independently of
unused profile and map settings. Exact source, separate Run/Save records and
Run active-program identity still gate cleanliness. The local marker is never
written as durable profile freshness; stored-artifact push metadata omits it.

Every code-changing profile pass contributes its logical transform ID. Terminal
`-sample` and `-drive` helper suffixes both normalize to their parent ID, with
first-seen ordering and pair deduplication. Software evidence compares successive
real recipe prefix bundles for both global transform types, RGB/HSV brightness,
and all binding target kinds, including synthesized `beforeRender`. Import
execution and host-action checks prove no-candidate stripped-body recovery and
current-profile application; active/generated Run/Save checks reopen wrapped
Saves through assessment and preserve their policy. These checks do not establish
S4 native-firmware or hardware qualification.

Reconciliation reads policy with its other planning metadata and fails closed
on read errors. Bound stored-artifact Patterns are unmanaged with reason
`stored-artifact`, before push-record or source checks. Each queued Pattern
overwrite rechecks exclusion and session state, so a later manual Save cannot
make wrapped source eligible for automatic profile application.

Reconciliation checks the captured session before and after each continuation
profile read. A stale session or failed continuation read stops with phase
`pending`, leaving later jobs queued. An unavailable initial profile list reaches
the existing `idle` branch, with captured adapter checks still enforced.

## Evidence boundary

The focused decoder, pure-model, remote-adapter and resource-guard tests prove
source/PBP fidelity, decision boundaries, durable round trips, client-wide
serialization, sibling/binding preservation, ambiguous-response recovery and
stale-session rejection. `controllerPatternImportExecution.test.ts` exercises
creation, same-slot writes, exact readback/activation, persistent-response
failures, stable retries, profile changes and concurrent Controller intents
through reopening fakes and the real ledger owner/device queues.
Stateful running-Pattern regressions cover every pre-drain capture refusal,
exact previous-byte restoration after Save/readback failure, equality-verified
authored delivery recovery after ledger failure, verified retry preference,
ambiguous drain dispatch with session/transport loss, and queue ownership until
recovery settles. Post-activation partitions cover activated and metadata-pending
ledger failures before and after persistence, binding and record failures, and
completion failure. A large imported target makes repeat activation require
another drain; a hostile follow-up-write fake would leave that drain running.
Assertions preserve exact saved-PBP running bytes, incomplete progress, original
error identity and cause, and one drain, target activation and Save only.
The fakes change running identity and bytes before activation
settles; assertions check that state and the visible error. These are software
proofs; physical Controller recovery remains hardware evidence.

`controllerStore.test.ts` reopens imported records and policy, edits ordinary
Pattern fields, then calls real manual Save and generated-Pattern sends. Decoded
PBP source runs through `loadPattern` and the RGB shim: an old brightness input
on pin 36 at 0.5 remains effective while the importing profile's pin 35 at 0.25
is unused. Authored command evidence renders the new profile behavior. Pure
reconciliation and normal push suites cover exclusion and unchanged activation
policy. Deferred policy/profile/session checks prove refusal before subsequent
device mutation.

Host-action tests exercise the real command with captured account/provider stores,
reopen account records and PBP bytes, verify merge without a second POST, and
retire deferred work when its session changes. Component tests cover three-group
inventory, confirmation before source reads, busy/retry controls, durable Resume
and the wrapped-source notice. Pure batch tests cover immutable three-section
membership selection, Delete-only reasons and ordered cumulative failed-only retry. Real-command component tests
exercise confirmation/cancellation without reads, busy locking, mixed durable
outcomes, activation while all targets remain checked, regrouping, failed-only
recovery and retirement of held stale work. Other-import tests hold source reads
across active/pending changes and assert account-only writes. These synthetic
checks do not establish S4 hardware fidelity, which remains pending.
Retry tests preserve account/device state while
account, binding, source and profile preparation fail at each durable write stage.

`e2e/controller-pattern-import.auth.spec.ts` defines the authenticated two-account
single-item and bulk consumer flows through actual UI Save and the real relay/protocol with one shared
synthetic saved-program map. Its browser execution and committed captures belong
to the developer's committed-tip proof; adding the test is not evidence it ran.
The bulk flow defines D-prefixed desktop/narrow inventory, selection,
confirmation, mixed-result and completed-retry captures. Native firmware and
final committed whole-account/browser proof remain outside the focused
fake/component evidence.
