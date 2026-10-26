# Controller Pattern import foundation

The [#1221 I3 contract](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1221#issuecomment-6406968606)
defines selected-slot import into a fresh personal Pattern. Dispatch A implements
lossless reading, pure assessment/planning/retry decisions and durable ledger
ownership. Selected-slot execution and UI remain pending B/C; the existing
as-built guides still describe the current Import UI. A does not complete #1221.

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

Authored recovery requires an integrity-valid Pattern banner, no declared
transforms, and an independently supplied stock/current-account canonical source
with the same origin ID that is not itself stored-artifact source. Its no-pass
bundle must equal the downloaded banner-stripped body exactly. A failed candidate
bundle makes authored recovery unavailable. The caller must never supply the
downloaded text relabelled as a canonical candidate or query another account.

Every other accepted assessment retains the exact stored source and PBP. It does
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

`complete` is terminal historical completion regardless of later account or PBP
digests. Ordinary source, name, control, settings and timestamp edits preserve the
Pattern ID and separate ledger policy. Completed stored-artifact policy continues
to suppress profile application and reconciliation after edits/reload; it is
independent of hashes and stage. Later Run/Save must compile the current edited
source using that policy and its own freshness checks, without invoking
incomplete-import retry. Completion must not delete policy. Ordinary PATCH/update
must not use create-intent recovery.

## Evidence boundary

The focused decoder, pure-model, remote-adapter and resource-guard tests prove
source/PBP fidelity, decision boundaries, durable round trips, client-wide
serialization, sibling/binding preservation, ambiguous-response recovery and
stale-session rejection. They do not prove device writes, account-copy creation,
D1 end-to-end account isolation, browser behavior or completion of #1221. B/C
must supply those consumer checks, including later manual Save of edited source.
