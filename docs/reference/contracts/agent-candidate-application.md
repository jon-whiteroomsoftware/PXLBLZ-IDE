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

`applyShow` returns the store's typed receipt. A duplicate identical response reads its existing result; changed request or candidate identity refuses. One accepted candidate creates one ordinary history entry. `readOutcome` recovers a surviving session's result after acknowledgement loss; retired history is unavailable and never replayed. Applied receipts distinguish saving, saved, rolled-back, superseded and an in-memory stock draft. Private asked/refused/nothing-applied/commit-refused/incomplete/service-refused/service-failed outcomes terminate via a checked `completed` receipt without mutation; this is neither a validated authoring `noop` nor user cancellation. The same bounded operation table retains these terminal identities.

The overlay displays private prose alongside the actual editor outcome and includes that outcome in subsequent session dialogue. A delivered candidate remains one busy submission while waiting for active input and while saving. Waiting displays a Cancel action; cancellation prevents later adoption. Completion does not move focus away from a manual field. Closing the overlay releases its transport and polling resources while already-adopted saves retain store ownership. The store owns save recovery in [Show state, history, and persistence](show-state-history-persistence.md). [Show command semantics](show-command-semantics.md) covers the V2 registry; canonical resize now delegates to it, while other diagnostic operations remain independently implemented.

## Stable diagnostic resize retry

An eligible failed activity offers an explicit exact-duration Retry and Dismiss.
The service retains the logical Clip id and positive safe-integer duration from
one successfully executed canonical `resize_clip`, after reference resolution.
Only normal private committed completion qualifies. Additional mutation attempts,
including no-ops, refused or unknown calls, lifecycle calls, malformed tool JSON,
unknown arguments and a validation-repair run make the turn ineligible. Start/end
variants and wholly no-change turns do not acquire a retry binding.

The browser binds that command once alongside the original broad request identity.
Revision conflict, interaction timeout, user cancellation and rolled-back saving
may offer Retry after private completion. Pending, saving, successful, superseded,
noncandidate and unsupported outcomes do not. Dismiss removes actions while
retaining the historical failure. Typing and focusing another field do not dismiss
actions. Pointer activation preserves existing focus; keyboard activation returns
focus from a removed action to the composer without changing its draft or selection.

Retry captures fresh Show state and metadata guards under a new operation id with
`retryOf`, preserving the original payload, reference context and target identities.
The fixed-intent proposal sees only the retained Clip id and duration. A new private
session executes that exact command and validates its complete result. The browser
compares the complete candidate with canonical execution on its captured snapshot,
independent of object-key order; only the command-generated `updatedAt` clock is
excluded because ordinary adoption assigns its own stamp. Valid-envelope malformed
bindings or candidates terminally refuse; foreign envelopes cannot consume the
original operation. Whole-Show revision admission remains conservative throughout.

A moved or renamed Clip retains its identity; a missing Clip refuses without
selecting another ordinal. Retry never replays the prior whole-record candidate,
consumes an unrelated composer draft, or starts automatically. Later dialogue
describes the exact resolved retry separately from the immutable original request.
Linked retries retain that same meaning. Existing cancellation, retirement, save
recovery and one-adoption history ownership remain authoritative.

[Retry evidence](../evidence/issue-949-stable-retry/README.md) records the finite
qualification. General natural-language retries and the final Agent panel are
outside this diagnostic boundary.

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
combinations. The separate private two-Clip qualification below owns its overlap exception.
[Mixed-batch evidence](../evidence/issue-950-resize/mixed-batch.md) distinguishes
private transaction proof from live record, save, history and export proof.

## Private two-Clip rearrangement

The explicit private transaction can retain two plain Clips and rearrange their
starts through one specifically permitted same-Layer overlap. [Show command
semantics](show-command-semantics.md#private-two-clip-rearrangement) defines the
finite ownership and collision checks. Both pending completion and private commit
strictly validate the raw final composition. The complete candidate alone reaches
the existing whole-Show revision admission, one history group and ordinary save.

An overlapping intermediate creates no live adoption, provider write or history.
Rollback, incomplete completion and unresolved final overlap expose no candidate;
a stale delivered candidate preserves intervening manual work. This path retains
whole-Show context and admission. It does not qualify general canonical moves,
Group rearrangement, destination changes or arbitrary temporary invalidity.

[Private-pair tests](../../../src/agent-harness/test/privateClipRearrangement.test.ts)
own full-record and private lifecycle checks. Browser sequence PP in the
[scripted baseline](../../../e2e/agent-baseline.auth.spec.ts) owns durable record,
export/reopen and Undo evidence for the finite two-Clip swap.

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

The diagnostic bridge uses this foundation conservatively. Existing shared text/numeric fields, authored timeline gestures, placement-pad gestures, native Effect reorder and retained physical-zone drafts register live ownership under editable ShowEditor. Final panel placement, hosted service/MCP/OAuth and command-catalogue migration remain unqualified. Trusted callbacks at the whole-Show seam stay internal; the exposed adapter supplies its own structural and authoring validation.

## Internal bounded active-input wait

`deliverShowEditCandidate` is an internal store path for completed whole-Show
candidates. It snapshots the request and candidate, checks registered identity
and known whole-Show eligibility, then either admits synchronously or waits for
explicit session/Show-bound `drag` and `dirty-field` ownership tokens. Focus alone
is not activity. `readShowEditCandidate` projects a typed `waiting` status over
the existing pending operation; terminal outcomes remain in the session table.
The diagnostic bridge uses this path with raw structural and authoring validation
inside the delivery-time boundary, followed by final normalized validation.
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
evidence](../evidence/issue-949-spatial-draft-activity.md). W retains its explicit synthetic-token protocol proof. Internal
`admitResolvedShowResize` consumes the same owner, checks its private dependency
qualification before waiting, and replays the captured operation on current state
at settlement. It returns the same waiting projection; no immediate resize
entrypoint bypasses active ownership.

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

Pending snapshots/callbacks/timers are discarded on terminal action. Qualified
resize observation is discarded with its wait, including timeout; dependency or
metadata invalidation also releases the wait immediately without retiring active
same-session input tokens. Exact serialized candidate identities remain separately,
bounded by the existing
operation-table capacity until session retirement, so changed payloads cannot
replace an original delivery or make a terminal id new. Qualified resize uses its
captured resolved payload identity in that same bound. Wrong envelopes refuse
without poisoning the original. A foreign-Show candidate delivered with the valid
registered envelope receives a stored terminal `invalid-candidate` refusal: reads
agree with delivery, the diagnostic adapter records rejection once and releases
metadata subscriptions, and an explicit new operation may name it as `retryOf`.
A changed duplicate cannot replace the original candidate identity. Broad delivery
never consumes a qualified resize-owned request. No automatic retry or provider/model call is
introduced. [Store consumer tests](../../../src/store/showInputWait.test.ts)
cover complete records/history, zero attributable writes while waiting/refused,
monotonic boundaries and a serialized `.pxlshow` reopened through its importer.
[Qualified resize consumer tests](../../../src/store/showQualifiedResize.test.ts)
also prove independent Layer preservation through waiting and undo, final
qualification crossing the armed deadline, and observation cleanup. Actual field
ownership is covered by `src/dev/agentFieldActivity.test.tsx`, shared-control
lifecycle tests, and the FA browser sequence. The registered timeline, detail and
spatial families and their GA/DA/SA evidence are enumerated above; external
Layer-scoped context remains unqualified.

Manual pointer and composition-inspector duration commits also use the exact
resize semantic owner, with two explicitly tagged manual Transition-to-Cut
exceptions ([command contract](show-command-semantics.md#manual-resize-commits)).
They retain ordinary editor persistence and conservative captured-source refusal;
sharing semantics does not give them this request lifecycle or narrow context.

## Internal qualified exact resize

`beginResolvedShowResize` captures a resolved logical Clip and exact integer
resize request in the current internal store session. `admitResolvedShowResize`
checks identity and observed dependencies, consumes the bounded active-input wait,
then replays that stored operation through `resizeShowClipExactly` on the current
Show, validates the complete candidate with `validateShowAuthoring`, and adopts
once through ordinary store history and persistence. Final dependency qualification
and validation must finish before an armed wait deadline; never-waited admission
has no computation deadline. A validated no-op has a terminal `noop` receipt and creates no history, timestamp or provider write.

The finite reference meaning is the original logical Clip identity. Its private
dependency context protects the complete affected logical Layer across Scenes,
including connected successors. Scene-local Layer identities and array order,
placement membership/instance links, all Pattern instances, tracks, Transitions,
shared timing and other Show fields remain guarded. Only unrelated placement
values are excluded. Thus a manual brightness or duration edit on another Layer
or Zone survives admission; same-Layer edits anywhere conflict. Groups and
missing composition/targets refuse this narrow path. Broad model context and
other operations retain the whole-Show callback guard.

Pending observation makes conflicts permanent even when later edits restore
identical bytes. Authoritative Show replacements, undo/redo and removal are
observed; hydration, stock reset and save recovery invalidate conservatively.
Pattern, Library and Map array replacements also invalidate all pending qualified
requests, including change-and-restore. These external guards deliberately refuse
unrelated metadata edits too. Observation exists only while requests are pending,
shares the existing session operation cap, and ends on completion, cancellation,
refusal or retirement. It is volatile session state, not a manual-edit ledger.

The receipt preserves original reference meaning and exact operation identity;
explicit retry uses a new operation id and fresh current dependencies. A missing
original Clip refuses instead of selecting a replacement. The owner supplies the
dependency context; callers cannot provide narrow guards or run arbitrary
callbacks under a resize receipt. The owner proves only the finite
context it captures. Adapters must qualify all context actually supplied to a
model; the returned operation alone is insufficient. The explicit typed diagnostic
below is the only exposed narrow path.

[Store consumer proof](../../../src/store/showQualifiedResize.test.ts) compares
complete current records/history and attributable writes, including undo/redo,
durable provider records and reopened `.pxlshow` files. It covers Main/Overlay and
Zone independence, multi-Scene connected resize, same-Layer and shared-dependency
conflicts, ABA, external source changes, retry identity, no-op validation,
cancellation/retirement, bounded observation and save rollback/supersession.
This qualifies the internal resize path only; broad diagnostic requests remain conservative.

## Typed exact resize diagnostic

The explicit DEV resize entry accepts only `{clipId, durationMs}`, where duration
is a positive safe integer in milliseconds. It resolves and captures through the
existing qualified owner before inference. The caller retains that request and
its original editor API through response delivery. Ordinary chat still captures
the whole Show and uses conservative revision admission.

The finite model packet enumerates only that Clip id and requested duration,
plus fixed instructions, empty focus/history/listing and the exact resize and
completion schemas. The `/resize` loopback route rejects additional request
keys. Dispatch independently rejects broad reads, other operations, foreign
identity/range and unknown arguments; schema advertisement alone is not the
boundary. Tool and completion feedback is fixed prose/codes, without Show
records, grammar validation issues or prior dialogue. The installed provider
serializer is exercised through an injected transport without a network call.

A proposal requires a matching operation, strict typed apply completion and
normal agent return. Ask, refusal, missing/contradictory completion, abnormal
return and errors produce no proposal. There is no semantic repair or broad
fallback in this finite mode. The existing browser/store owner alone replays the
operation on current state, validates authoring, waits for active input and
adopts through ordinary history and persistence.

A mismatched proposal delivered with the valid pending envelope terminally
refuses that operation and releases its observation. A foreign envelope does not
consume the original; a changed duplicate cannot rewrite an already-terminal
receipt. Broad candidate invalidation remains unable to consume qualified
resize authority. URL/session retirement, cancellation, dependency ABA and
metadata invalidation retain their existing semantics.

This qualifies fixed typed requests only. Unrestricted text such as “like
before,” automatic narrow-mode routing, model-selected duration and generic
private grammar batches remain outside this boundary. The [evidence packet](../evidence/issue-949-targeted-resize/README.md)
records the finite consumer cases and residual gaps.

## Present limits

The browser serializes its own submissions while manual editing continues. Pending
full-Show requests conservatively refuse any intervening Show or source-context
change. Final activity placement and any input outside the enumerated registered
families remain unqualified; focus alone does not retire a request. The service still
serializes loopback requests across clients and supplies no hosted connection,
OAuth, allowlist or budget owner. Transport failure terminates private work without
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

Apply validates the private working copy and stages completion. Ask, refuse and
incomplete discard pending work. Apply with no changes yields `nothing-applied`
and preserves history. A validated already-satisfied resize contributes zero
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
