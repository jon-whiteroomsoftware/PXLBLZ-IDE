# Agent candidate application

The local diagnostic service edits a private Show snapshot and returns a candidate to the live V2 editor. A private grammar commit is not editor adoption or durable saving.

## Ownership and acceptance

`__pxlblzEditor` exists only in development builds, editable Show editors and a current URL containing exactly one `agent=1` parameter. Absent, empty, other and duplicate values disable access. The flag is not authentication. Ordinary router navigation preserves query parameters and its existing navigation guards. No storage preference enables this bridge.

The finite URL lifecycle covers app navigation, History push/replace, popstate and hashchange, with the current URL also checked at every capability/request use. Query removal or pathname departure retires pending work synchronously; restoring the URL cannot revive it. Unmount and explicit overlay close retire the session and clear transcript/request memory. Ordinary rerenders retain the session. After explicit diagnostic-overlay close,
reopening currently requires URL gate toggle, navigation or reload; reinjection
on the unchanged URL cannot revive the retired bridge. Final panel session renewal
remains outside this diagnostic slice. Already adopted saves follow ordinary store settlement after retirement. This is a local lifecycle contract, not protection against arbitrary third-party JavaScript replacing browser APIs or a claim of instantaneous provider cancellation.

`beginRequest` registers immutable operation/session/Show/revision identity before inference and captures the Show and reference context once. The overlay retains that original bridge for response delivery; it never asks a newly opened editor to authorize old work. Broad full-Show model context always uses whole-Show revision admission. It cannot use the internal C1 narrow resize guard.

The adapter validates incoming structure against the Show schema with browser-safe imports, then validates accepted authoring semantics with exact current Pattern/Library source metadata and the original missing-reference baseline. Pattern, Library and Map array replacements during pending work permanently invalidate that request, including change/restore. A malformed/newly missing reference or stale candidate refuses without history or persistence changes. The browser cannot supply a validator or use a legacy tokenless apply bypass.

An enumerated schema, authoring, normalized-candidate or metadata-invalidation
failure may add `diagnostic` only to the existing terminal `refused` /
`invalid-candidate` receipt. Its stage and issues use a closed code catalogue;
messages are fixed catalogue copy rather than validator prose. Paths may identify
bounded authored owners and validator-owned properties. The formatter does not
select rejected values, arbitrary additional-property keys, candidate source
fields, exception text or stacks. Unexpected validator and broader admission
failures use distinct nonspecific codes. A receipt retains at most eight issues, 64 UTF-8
bytes per code, 256 per message or path, and 4,096 total serialized diagnostic
bytes, with deterministic prefix retention and `truncated: true` when content is
omitted or shortened. The session owner defensively copies and deeply freezes
that bounded value. The 256-operation table therefore adds at most about 1 MiB
of independent diagnostic retention until session retirement.

Paths intentionally retain bounded authored owner IDs. No secret or content
classifier is claimed for those IDs; the formatter never selects rejected
candidate values, source fields, exception fields or arbitrary additional keys
for a path.

`applyShow` returns the store's typed receipt. A duplicate identical response reads its existing result; changed request or candidate identity refuses. One accepted candidate creates one ordinary history entry. `readOutcome` recovers a surviving session's result after acknowledgement loss; retired history is unavailable and never replayed. Applied receipts distinguish saving, saved, rolled-back, superseded and an in-memory stock draft. Private asked/refused/nothing-applied/commit-refused/incomplete/service-refused/service-failed outcomes terminate via a checked `completed` receipt without mutation; this is neither a validated authoring `noop` nor user cancellation. The same bounded operation table retains these terminal identities.

Candidate clone or serialization failure before input-wait identity registration
returns one ephemeral nonspecific refusal and leaves the legitimate pending
operation available for its first valid delivery. It cannot create a terminal
receipt for an unidentifiable foreign envelope. Once registered, validation
refusal, waiting, duplicate delivery and outcome lookup all return the same
terminal diagnostic receipt. Timeout remains authoritative at its existing
deadline, and retirement clears the receipt and diagnostic together.

The overlay displays private prose alongside the actual editor outcome and includes that outcome in subsequent session dialogue. A delivered candidate remains one busy submission while waiting for active input and while saving. Waiting displays a Cancel action; cancellation prevents later adoption. Completion does not move focus away from a manual field. Closing the overlay releases its transport and polling resources while already-adopted saves retain store ownership. The store owns save recovery in [Show state, history, and persistence](show-state-history-persistence.md). [Show command semantics](show-command-semantics.md) governs the shared registry. Migrated diagnostic operations derive their input schema and delegate execution through the shared descriptor adapter; families awaiting migration retain their existing owners. The private pair move path is retired; see below. Canonical move uses whole-Show admission; it has no narrow resize-style dependency admission.

## Bounded mixed batches

A diagnostic turn may move B from 8000 to 16000 ms, then resize A at 0 ms
from 4000 to 12000 ms, with B lasting 4000 ms and Show End at 20000 ms.
Both intermediate records must be valid. The service exposes only the complete
committed candidate; declared refusal, incomplete completion and failed final
validation expose no earlier private operation. An already-satisfied resize
beside the move preserves the move as the single candidate.

This uses whole-Show context and revision admission. One accepted delivery owns
one ordinary save and Undo/Redo group. An actual dirty duration field holds the
complete candidate: draft cancellation permits admission, while manual commit
invalidates it. A manual edit during the pending response also refuses delivery.
These finite cases do not qualify narrow model context or arbitrary operation
combinations.
[Mixed-batch evidence](../evidence/issue-950-resize/mixed-batch.md) distinguishes
private transaction proof from live record, save, history and export proof.

## Private two-Clip rearrangement (retired)

The private executor has no overlap exception. It applies each v2 command
through the registry in order
([`agentPrivateExecutor.ts:45-50`](../../../src/engine/agentPrivateExecutor.ts)),
so a move that would overlap another Clip on its Layer refuses at that step.
The [#949 consumer evidence](../evidence/issue-949-private-pair/README.md) is a
historical record of the retired v1 two-Clip swap.

## Internal admission foundation

The Show store now exposes an internal session/request admission API, independent
of component effects. It registers immutable operation identity before private
work, checks a monotonic whole-Show revision, evaluates and validates through
synchronous engine callbacks, and adopts once into ordinary store history.
Session retirement, cancellation, duplicate delivery and altered envelopes
produce typed non-application outcomes. Its session-only receipt lookup separates
applied/saving from saved, rolled-back, superseded and stock draft settlement.

[Show state, history, and persistence](show-state-history-persistence.md#internal-request-admission)
defines lifetime, revision inventory and the configurable entry
cap. [Pure policy tests](../../../src/engine/showEditAdmission.test.ts) and
[store admission tests](../../../src/store/showV2CandidateAdmission.test.ts) exercise
full records/history, provider writes, revision ABA, retirement, deduplication
and delayed persistence outcomes.

The diagnostic bridge uses this foundation conservatively. Existing shared text/numeric fields, authored timeline gestures, placement-pad gestures, native Effect reorder and retained physical-zone drafts register live ownership under editable ShowEditor. Final panel placement, hosted service/MCP/OAuth and command-catalogue migration remain unqualified. Trusted callbacks at the whole-Show seam stay internal; the exposed adapter supplies its own structural and authoring validation.

## Internal bounded active-input wait

`deliverShowV2EditCandidate` is the internal store path for completed whole-Show
`ShowRecordV2` candidates; the version-1 `deliverShowEditCandidate` was deleted
in #1042 S2a. It snapshots the request and candidate, checks registered identity
and known whole-Show eligibility, then either admits synchronously or waits for
explicit session/Show-bound `drag` and `dirty-field` ownership tokens. Focus alone
is not activity. `readShowEditCandidate` projects a typed `waiting` status over
the existing pending operation; terminal outcomes remain in the session table.
Admission validates the candidate's structure, domain and authoring rules and
prepares its Stage inside the store-owned boundary, then rechecks eligibility
before adoption.
Metadata changes terminate waiting promptly without clearing activity tokens.
`DraftTextField`, `useNumberFieldDraft`/`NumberField`, and `BoundedNumberField`
(including Time, Domain, Percentage and Angle wrappers) register their existing
control-owned drafts and slider gestures through a generic React scope under
editable ShowEditor. Portals inherit that scope. Focus and an idle pinned slider
are not active input. Invalid text and rejected text applies retain ownership
while their drafts remain dirty; successful commit/cancellation releases only
after synchronous manual callbacks. Preview-end alone does not release ownership.
Shared controls outside this scope have no Show-store dependency.

Clip resize, Clip move/duplicate (native drag/drop and shift-pointer), Marker
creation/movement and Show End use the same scope. Each gesture retains ownership
through its authored callback and save settlement or cancellation. Native dragend
cannot release a committed drop still settling. A removed or hidden Marker button
retires its non-settling move, including a
Marker outside the rendered Show duration; a committed move retains ownership
until its existing authoritative callback settles. A Marker source click retains its
primary-pointer ownership between pointerup and the click's authoring callback,
including implicit capture loss. Below-threshold auxiliary releases end at pointerup
because they emit auxclick rather than click; moved auxiliary drags retain their
existing authored behavior. Unrelated pointer identities cannot finish or cancel a
gesture; retired window listeners cannot author or re-register input. Rebinding
uses the surviving gesture state before exposing the replacement session.
Viewport, transport, workspace-divider and marquee gestures remain view state.
Placement content/aperture gestures and native Effect reorder retain their
control-owned lifetime through authored callback settlement. Placement pointercancel
still commits its pending preview; lost capture or removal discards the preview
without authoring. Effect no-op, cross-stage rejection and dragend without drop
release ownership. Removed sources and late local drops cannot revive a retired
gesture; foreign/legacy Effect payload fallback retains its existing policy.
`ShowPropertySparkline` registers its optional `onMoveBeat` gesture, preserving
per-move authoring and releasing on pointer termination or removal of the target
or callback. No current ShowEditor caller supplies that callback; this is component
qualification, not proof of a wired editor movement path.
`ShowZoneSpatialSelector` registers both its live rectangle and retained changed
LED selection, including its early-return editor branch. Pointerup ends only the
rectangle; pointercancel/lost capture preserve any earlier changed selection.
Clear acquires synchronously, while returning to the current authoritative set
becomes clean. Opening/focusing an unchanged selector does not block admission.
A clean selector follows authoritative index changes before a later Save;
a dirty draft survives same-target source changes. Save publishes the manual
store adoption before closing; a failed callback leaves the actual retained state
owned. Cancel and source-identity replacement discard local input. Pointer identity
and session retirement prevent late events from reviving old work. This finite
inventory does not qualify all editor input.

The editor binds surviving dirty controls before exposing each new diagnostic
session. Closing retires the session before releasing fields; old cleanup cannot
unbind a replacement session. Capacity failure retires the diagnostic capability
before manual input continues, so no eligible candidate can bypass untracked input.
Diagnostic Cancel preserves the inspector for pointer dismissal and prevents blur
before cancellation. It does not claim Escape; ordinary editor layers and actual
detail-owned portals retain their existing keyboard ownership.
The FA browser regression drives actual duration drafts and focus; GA drives actual
Clip resize cancellation/manual commit and Show End manual commit. DA drives
placement preview cancellation/manual commit and native Effect dragend/drop;
see [detail gesture evidence](../evidence/issue-949-detail-gesture-activity.md).
SA covers retained physical-zone drafts through the scripted bridge and clean-source
index replacement through the existing diagnostic adapter; see [spatial draft
evidence](../evidence/issue-949-spatial-draft-activity.md). W retains its explicit synthetic-token protocol proof.

When active input requires waiting, the original completed-candidate arrival
establishes one 5,000 ms monotonic deadline, captured before snapshot/serialization
work. Final validation after that wait also checks the deadline before adoption.
A candidate that never waits for active input has no validation deadline; the
five-second policy is not a general computation or model-latency limit. Duplicates, additional activity and partial releases never extend it.
Before the deadline, the final ownership release synchronously rechecks current
eligibility, validates and adopts through the ordinary store owner. At or after
the deadline, including a delayed timer callback or late release, the operation
receives terminal `interaction-timeout` refusal and can never apply later.
Manual owners must publish a committed edit through the store BEFORE releasing
the token: a stale broad candidate then refuses, including edit/Undo ABA. Manual
cancellation without authored change may release the token and permit adoption.

Tokens are idempotent object capabilities; copies and retired-session tokens
cannot release another owner. There are at most 256 active tokens. Exhaustion
throws before issuing a token; the caller must not start an untracked edit.
Wrong session/Show acquisition returns no token. Hydration, reset and removal
invalidate pending candidates and clear their timers/callbacks, while preserving
same-session manual activity. Session replacement/retirement clears activity as
well. Cancellation and noncandidate completion release pending candidate resources;
adopted saves keep ordinary settlement ownership after retirement.

Pending snapshots/callbacks/timers are discarded on terminal action. Dependency or
metadata invalidation releases the wait immediately without retiring active
same-session input tokens. Exact serialized candidate identities remain separately,
bounded by the existing
operation-table capacity until session retirement, so changed payloads cannot
replace an original delivery or make a terminal id new. Wrong envelopes refuse
without poisoning the original. A foreign-Show candidate delivered with the valid
registered envelope receives a stored terminal `invalid-candidate` refusal: reads
agree with delivery, and the diagnostic adapter records rejection once and releases
metadata subscriptions. A changed duplicate cannot replace the original candidate
identity. No automatic retry or provider/model call is introduced. Store consumer tests
cover complete records/history, zero attributable writes while waiting/refused,
monotonic boundaries and a serialized `.pxlshow` reopened through its importer. Actual field
ownership is covered by `src/dev/agentFieldActivity.test.tsx`, shared-control
lifecycle tests, and the FA browser sequence. The registered timeline, detail and
spatial families and their GA/DA/SA evidence are enumerated above; external
Layer-scoped context remains unqualified.

Manual pointer and composition-inspector duration commits also use the exact
resize semantic owner, with two explicitly tagged manual Transition-to-Cut
exceptions.
They retain ordinary editor persistence and conservative captured-source refusal;
sharing semantics does not give them this request lifecycle or narrow context.

## Present limits

The browser serializes its own submissions while manual editing continues. Pending
full-Show requests conservatively refuse any intervening Show or source-context
change. Final activity placement and any input outside the enumerated registered
families remain unqualified; focus alone does not retire a request. This diagnostic
service serializes loopback requests across clients and has no hosted connection,
OAuth or budget owner of its own. Production agent editing gets those from the
Worker: see [rendezvous](agent-rendezvous.md),
[OAuth and MCP discovery](agent-oauth-discovery.md) and the
[built-in service](agent-builtin-service.md). Transport failure terminates private work without
claiming a model success or paying for automatic retry.

The diagnostic turn requires an explicit completion object:
`{ intent: 'apply' | 'ask' | 'refuse' | 'incomplete', reply?: string }`.
Both `finish_turn` and the final operation's `finish_turn_reply` accept that
object. Explicit `finish_turn` also accepts an optional top-level `session_id`
transport field: a supplied value must be a string matching the current session,
or the finish is refused. The round strips only that field before validating the
strict completion object. Inline and provider-returned completion objects still
reject `session_id` and all other extra keys. Reply punctuation has no effect on mutation. Provider-neutral adapters
may return the same typed completion; plain text alone fails closed as
`missing-finish`. Unknown intent, invalid reply type, extra keys or a
contradictory returned intent cannot authorize a candidate. Fake corpus scripts
record explicit intent; historical paid transcripts retain their original format.

The production built-in agent does not use this shape. Its `finish_turn` takes
a strict `{ outcome, message }` object with the same four values and a required
message ([`builtinTools.ts`](../../../src/worker/agent/builtinTools.ts)).

Apply validates the private working copy and stages completion. Ask, refuse and
incomplete discard pending work. Apply with no changes yields `nothing-applied`
and preserves history. A validated already-satisfied resize, Clip move or marker move/update contributes zero
changes, retains the complete grammar document, and does not stamp `updatedAt`.
Auto-wrapped or wholly no-op explicit grammar transactions preserve undo/redo;
a no-op beside a changed operation does not abort the transaction. No finish commits while the agent is running. Abnormal
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

Session validation and editor admission are different checks. The diagnostic
service uses the authoring policy with identical existing missing dependencies
allowed. Passing that validation neither proves hardware delivery readiness nor
establishes that every manually editable draft is accepted by the grammar. The
live editor separately checks identity and authoring validity using current metadata.

## Internal authoring validation

The `createSessionStore({ authoringValidation: true })` policy accepts final
authoring candidates independently of delivery readiness. The diagnostic service
selects it for open, pending validation and commit; standalone/default grammar
and MCP sessions retain their delivery-oriented defaults.

Before inference, browser request capture projects a flat Show through the
existing composition projector with exact loaded Pattern sources and the current
Stage dimension. Missing source or an unsupported projection refuses capture.
Existing compositions are copied unchanged. This is a private transport snapshot:
capture and non-application completions never write or create history. Successful
adoption uses the original authoritative Show as its ordinary Undo base. Repeated
capture of one operation retains its first snapshot; full-Show revision and
Pattern/Library/Map replacement (including ABA) guards still apply. No source
upload or service metadata channel is introduced. The fixture runner uses the
same helper with its actual fixture sources; original artifact baselines remain
unchanged. [Diagnostic authoring evidence](../evidence/issue-949-diagnostic-authoring.md)
records the service and actual browser qualification.

The pure engine seam checks schema-qualified composition v1, authored owner
identities, routing references and logical routing before accepting a candidate.
Same-Layer overlap, missing instances, duplicate identities and unknown owners
refuse; cross-Layer overlap remains valid. Portable renderer/reference capability
mismatches are delivery diagnostics. Missing, overlapping and out-of-output-range
physical assignments also remain authorable with coverage diagnostics and the
existing first-match behavior. Malformed routing and uninspectable required
metadata remain errors. Range endpoints and output counts must be safe integers
(the count must be positive); negative integer endpoints remain coverage
conditions. Coverage evaluation uses range events, so memory does not grow with
the requested output count. Counts of unions wider than JavaScript's exact
integer range may round in diagnostics; nonzero coverage violations still block
delivery. No hardware-capacity limit becomes an authoring limit. Internal open,
pending validation and commit return the authoring warnings. Exported `.pxlshow` records pass through the real
Show-file importer; hardware artifact gates remain unchanged.

Missing dependencies survive only through a captured diagnostic identity:
owner, Pattern reference, Library namespace/function where applicable, and the
Pattern plus traversed Library sources. Capture stores values rather than source
callbacks or mutable metadata maps. A new owner, different missing reference or
changed dependency source cannot inherit an old exception. Import clones the
record and supplied metadata. New control targets and control animation require
actual slider metadata; missing stock or personal source no longer bypasses even the
ordinary diagnostic control command. Existing missing stock and personal Pattern
references may survive on the composition path. Flat projection requiring absent
Pattern source refuses instead of using the preview's stock substitute.

The file importer has a separate explicit internal option,
`parseShowFileBundle(bytes, { preserveAuthoringPhysicalRanges: true })`. It keeps
ordinary Show normalization and then restores only validated physical endpoint
pairs and their original order, keyed by known Layout and Zone identities.
Negative, reversed and above-output integer pairs survive this path. Invalid
endpoints or owner identities refuse. Default product import still normalizes
physical ranges; no product caller enables the new option. Callers must still
run final authoring validation; the file option does not replace that gate.

Library inspection reuses the bundler's AST helpers without changing code
emission. Its finite domain is direct `Namespace.function` and
`Namespace.inline.function` calls. It inspects every function in each referenced
Library, including transitive references; cycles are visited once. This is
conservative compared with the compiler's reachable-function traversal.
Unresolved computed or nested member-call forms and unparseable required source
refuse. It does not claim arbitrary JavaScript dependency analysis, dynamic
execution safety, or Library artifact export support.

Private commit compares against the committed pre-transaction document and its
metadata. A refused candidate preserves committed document and both history
directions; private work stays open for repair or rollback. Generic patches
retain their existing per-member schema and identity restrictions. This seam
does not qualify new intermediate batching, canonical command replay, live
application, persistence, active-input waiting or Layer independence.

Evidence lives in [authoring session tests](../../../src/agent-harness/test/authoringValidation.test.ts)
and [pure validation tests](../../../src/engine/showAuthoringValidation.test.ts).
They include `.pxlshow` reopen, default-policy isolation, complete undo/redo
preservation, exact personal control metadata, and changed-source dependency
refusal. The established Library, Portable and artifact suites guard unchanged emission
and delivery behavior. The coverage suite compares the interval implementation
with an enumerated ownership oracle over small domains, including legacy
fractional endpoint normalization; authoring refuses fractional endpoints earlier.
The resource ledger remains the authoritative full artifact-fit diagnostic; this
authoring seam reports the known output-count ceiling without compiling a
second estimate of generated resource use.

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
  The ordinary 46-case corpus and scripted browser baseline use no scratch
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
  `test/genericIdentityPlacementOrder.test.ts`,
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
  bridge process. Its current assertions prevent stale whole-record replacement
  (A, B, C) and application after navigation away and back (D), and prove recovery to the durable candidate after a later failed
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
  The editor's `applyShow` requires the captured immutable request and records
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

The diagnostic adapter now qualifies whole-Show revision admission, URL/session
retirement and typed outcomes on the local route. The broader
[roadmap](../../plans/shared-agentic-show-editing-roadmap-prd.md) retains active-input
waiting, command migration, final placement and production service qualification.

## Committed artifact publication

Private batch steps never enter the live preview compiler. The accepted final
record alone reaches ordinary history/save and preview publication. The baseline
F sequence uses a plain Main Clip with a Cut boundary: its two private settings
produce one save, one Undo group and one actual final-state compile. Dev compile
spans distinguish cache hits from actual compiler work; native input-event
samples have a 16 ms reporting threshold and missing samples are not zero-time
measurements. Request, input processing, compile and adoption-to-preview times
remain separate observations, not latency acceptance thresholds.

[Preview and delivery publication](show-state-history-persistence.md#preview-and-delivery-publication)
defines stale reconstruction and prepared Controller snapshot ownership.

## Agent drawer

An ordinary editable Show route exposes a right-edge Agent drawer after the
signed-in capability response resolves; an unknown response exposes no built-in
choice. Its session activity and timeline attribution project
the existing admission and save outcomes. The drawer does not own Show edits,
history, rollback, or persistence. The loopback diagnostic bridge attaches to
this surface in development. Production built-in dispatch uses the shared
channel and admission described in the [service contract](agent-builtin-service.md).

The bridge's optional `changes` envelope comes from committed private registry
execution. Each entry names a stable target, a human-readable change, and the
registry's touched paths. Insertion ranges retain the exact successful change
identity and the registry's rounded time coordinates. A turn with exactly one
range may draw a time band. Multiple ranges retain their change descriptions but
draw no band: per-command coordinates are not rebased through later insertions,
and a min/max hull would falsely mark untouched time. This presentation limit
does not restrict multi-command edits. Show End ranges use its
before/after receipt. Private refusal and failed commands export no attribution.
This envelope is presentation metadata, not an admission receipt. The controller
checks stream request identity and joins metadata to that same immutable
request's editor receipt before painting an applied outline or time band. A
late live refusal never paints an applied band.

Those `changes` describe successful commands against the private working copy;
they do not prove editor adoption or saving. A refused receipt can therefore
carry both proposed changes and a validation diagnostic while truthfully stating
that none of the proposal reached the live Show. The activity row uses the first
catalog-controlled diagnostic message in its existing reason line and falls back
to the generic refusal copy for older or malformed receipts.

Activity keeps private completion separate from live application and save.
Tucked unread counts distinct operations whose outcomes change; progress and
read activity do not count. Opening reads the current outcomes, and a later
rollback can become unread again. Manual edits and Undo clear attribution.
Time bands occupy the same grid columns as timeline content; zoom and pan
preserve their time coordinates. The open right drawer overlay and its edge sit above
non-modal Entity Detail panels so recovery remains reachable while a dirty
field retains focus.
Contact recovery queries the same operation without replay; an unknown outcome
keeps admission unavailable until that operation is resolved. A known save
outcome survives missing contact or a missing subsequent lookup.

The built-in composer projects the account's server-owned 30-message UTC-day
allowance as one muted 9px line above the existing input. Personal exhaustion,
shared budget exhaustion and service unavailability keep distinct explanations,
preserve the draft, and disable Send. External MCP remains available when the
personal built-in allowance is exhausted. Setup Back and connected Change agent
return to the chooser while preserving transcript and draft; switching is
disabled through active, saving and unknown outcomes. Neither built-in nor
external activity offers Dismiss. Executed command results retain the darker
muted treatment while agent communication retains the existing lighter gray.

The pure presentation model is `src/engine/agentDrawerModel.ts`; the production
adapter is `src/agent/drawerController.ts`, with an optional development adapter
in `src/dev/agentDrawerController.ts`. Focused tests cover unread
transitions, unknown recovery, ownership checks, insertion metadata, late
refusal, and narrow pin restoration. Browser baseline D957 covers real scripted
adoption/save, the double outline, unread clearing, a conflicting manual edit,
and Undo on the Show route. Production external connections use the shared
browser session and private executor through the authenticated account relay.
The [OAuth/MCP contract](agent-oauth-discovery.md) describes transport identity
and qualification. Cross-window connection management remains outside this
version; the diagnostic adapter does not authorize production attachments.

## Shared production admission owner (#963)

`src/agent/editorAdmission.ts` now owns the existing editor session, immutable
request capture, metadata invalidation, candidate validation, input wait and
save receipts. `src/dev/agentEditorAdmission.ts` is a compatibility wrapper
that injects diagnostic observation; production callers import the owner
directly. Snapshot helpers are pure engine modules.
No second adoption owner or diagnostic grammar is introduced.

`src/engine/agentPrivateExecutor.ts` keeps one private candidate per binding,
serializes relay-assigned canonical command deliveries with session-scoped
immutable identity,
and delegates apply/complete/cancel/outcome to that admission. A domain-command
refusal returns its issues while retaining the private candidate and earlier
accepted changes. Both built-in and external clients may correct the command
within that operation, then commit or cancel. Explicit
whole-turn completion, commit/admission refusal, service/result-size failure,
cancellation and retirement retain their existing terminal ownership.

The activity entry stays working after a command refusal and shows at most three
issue messages, each bounded to 160 characters. It acquires neither a final
outcome nor an unread completion until settlement; settlement clears the interim
issues. These messages report private validation, not editor adoption or saving.

Cached response loss preserves
identity tombstones and uses the surviving admission receipt for outcome
recovery, never automatic application replay. The production browser session
receives commands from the bounded account relay for both transports. Cancel
after commit still reaches the retained admission request during input waiting,
and an already-adopted save remains intact. A pending, waiting or applied/saving
commit result tombstones every unsent ordinary follower as `result_unavailable`;
its keyed retry resolves that tombstone, and relay delivery admits only the
retained terminal cancel. Local end retires synchronously before
network cleanup; remote grant retirement and loss of the relay's volatile
identity ledger are confirmed only after the browser acknowledges retirement.
After account-owner recreation, an exact trusted built-in identity inspection
recreates its volatile relay because the built-in transport retains the immutable
caller-owned delivery envelope and the browser journal independently rejects
replay. External clients instead retire the old binding and obtain a fresh
server-owned identity ledger; their old keys never recreate work.
Unsent ordinary followers after commit never reach this executor, while a sent
unknown head can only be followed by terminal cancel. Capture capacity measures
the complete observable `begun` result, including its status, operation, and
revision wrapper, with the delivery journal's canonical byte oracle before
retaining private or active candidate state. Oversize capture records terminal
`service-refused`, latches capacity for that binding, and requires retirement
plus a fresh executor before another candidate can begin. A known command
refusal is the exception to terminal error handling: the relay caches that
refusal, preserves already-admitted followers, and delivers their correction
in sequence. See the OAuth/MCP and rendezvous contracts for client-key scope,
queue limits, transport identity and revocation acknowledgement.

## Version-2 records (#1039)

The shared admission holds only a version-2 record (#1042). This is the whole
of what keeps specification section 10's forbidden window closed: a command
never reaches a record whose version its catalogue does not address.

`createAgentEditorAdmission` takes the route's own prepared Stage capture. It
resolves the open v2 working copy, so `read_show` answers v2; captures the
complete validated record as the operation snapshot; takes its dependency
baseline from the v2 Pattern sites; and resolves a replacement Pattern through
the same captured bundle the inspector uses. An editor mounted without a v2
working copy admits nothing: `getShow` and `beginRequest` return `undefined`,
with no fallback to another record. The stable diagnostic resize retry and the
typed exact resize diagnostic existed only for version-1 records; #1042 Phase
3a removed both.

`agentPrivateExecutor` applies commands through the v2 catalogue only, and a
captured record that is not version 2 refuses with
`unsupported-schema-version`. The catalogue maps onto the executor's
vocabulary without loss: `changed`, `unchanged` and `refused` become
`changed`, `noop` and `refused` with the issues intact, a refusal's record is
the caller's own unchanged private copy, and a refusal keeps the private
candidate open for correction.

A caller-supplied `ShowRecordV2` adopts through `showV2CandidateAdmission`,
constructed by the Show store with its own session, input wait, revisions and
adoption. The v2 route's own edits adopt through `showV2PreparedEditAdmission`,
which admits typed UI intents; this owner exists because an agent command
sequence produces its candidate outside the store. Everything around that
middle is the same writer: one adoption, one history entry, the ordinary save
queue, and the existing rollback and supersession. The same intent through the
UI admission and through the command path yields deep-equal records and equal
history depth.

Section 9 requires schema, domain, dependencies, compiler eligibility and
revision admission to remain distinct checks rather than one permissive
normalize-and-accept. They are, in this order: the shared session and revision;
the Show still present and not pending deletion; the prepared capture still the
open record, its dependencies, provider and route unchanged; the candidate a
version-2 record for this Show; the provisional v2 JSON Schema; the
`validateShowRecordV2` domain rules; Pattern, Library and control availability
against the operation's captured baseline; a zero-write refusal for a candidate
equal to the current record; and preparation of the candidate against the
captured Stage. A command that moves the Stage map re-resolves the named map
the way the route does and refuses one that is gone or at an unsupported
dimension. Final-content deletion is accepted where it leaves a validated empty
Show. A refusal or no-op at any step returns the original record identity and
creates no history entry, provider save or ordering stamp.

The dependency step also carries the Installation physical-coverage rule.
`validateShowAuthoringV2` classifies it exactly as `validateShowAuthoring`
does: a physical Zone Layout that does not own every output pixel exactly once
is a delivery warning with no diagnostic code, so the Show stays authorable and
the candidate is admitted. Delivery refuses it:
`buildShowV2RouteArtifacts` returns the same
`installationCoverageBlockingMessage` `compileShowForArtifact` produces. The
prepared-edit owners that can introduce the fault - `set_output_contract`, the
Zone Layout definition owner's physical ranges, and Zone add and remove - keep
accepting it, exactly as their v1 counterparts did, and `.pxlshow` import keeps
the authored ranges untouched.

Since #1039's validation audit the schema and domain steps also carry the
structural rules `validateShowAuthoring` has always applied and no v2 path
asked. `validateShowAuthoringV2` reports them as structural errors, before every
dependency and delivery question, exactly as v1 does: the Zone Layout family
through the shared `validateShowZoneLayoutStructure` - a Layout naming an
unknown Zone, a physical range endpoint that is not a safe integer, invalid
routing-operator parameters, and a blank or repeated Zone identity inside one
Layout - and an output pixel count that is not a positive safe integer. An
output count merely past the compiled capacity stays a delivery warning that
leaves the Show authorable. `validateShowRecordV2Domain` additionally carries
v1's composition rules for a Pattern instance's whole-millisecond time offset
and finite time scale, and for a finite, nonnegative whole-millisecond Marker
time. Nothing stricter than v1 came with any of them: a negative integer range
endpoint, a negative instance time offset and a dormant Marker past Show End
stay admitted, and `.pxlshow` import is unchanged because v1 import never ran
the authoring validator. The complete enumeration, including the rows that are
retired by the representation and the five that remain open, is
[`issue-1039-validation-parity/audit.md`](../evidence/issue-1039-validation-parity/audit.md).

The dependency step also carries the Portable 2D capability rule, which
`validateShowAuthoringV2` classifies exactly as `validateShowAuthoring` does:
renderer and reference-map capability mismatches are delivery diagnostics that
leave the Show authorable, and an uninspectable Pattern or a malformed logical
Layout is an error. The admission supplies the dimension of the Stage map the
candidate itself names. Delivery is where a capability mismatch is refused -
`buildShowV2RouteArtifacts` returns the same blocking message
`compileShowForArtifact` produces for a v1 Show, over the materialized runtime
uses the artifact actually compiles, so a Group definition no occurrence
materializes reports in authoring without blocking export or send.

Evidence: [`showV2CandidateAdmission.test.ts`](../../../src/store/showV2CandidateAdmission.test.ts)
for the admission's own partitions,
[`editorAdmissionV2.test.ts`](../../../src/agent/editorAdmissionV2.test.ts) for
the executor, admission and store together, and
[`agentV2Command.runtime.test.ts`](../../../src/worker/agent/agentV2Command.runtime.test.ts)
for the same sequence through a real Worker, OAuth authority, account Durable
Object and browser session. The Portable rule's own partitions are
[`showPortableCompatibilityV2.test.ts`](../../../src/engine/showPortableCompatibilityV2.test.ts)
and [`showV2PortableAdmission.test.ts`](../../../src/store/showV2PortableAdmission.test.ts).
The design records are
[`issue-1039-agent-path`](../evidence/issue-1039-agent-path/test-design.json) and
[`issue-1039-portable-check`](../evidence/issue-1039-portable-check/test-design.json).
