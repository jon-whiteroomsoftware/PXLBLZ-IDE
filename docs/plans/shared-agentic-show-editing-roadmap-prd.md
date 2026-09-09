# Shared agentic Show editing: roadmap and product requirements

Status: accepted roadmap for the public V2 v1.9 release; reconciled with landed evidence and
Jon's decisions on 2026-09-08. Epic #943 and its children carry implementation state.
#945's diagnostic baseline and #948's single-client persistence recovery are implemented,
reviewed and landed on main; both issues are closed.
The #949 diagnostic path now includes typed private-turn completion, conservative
live editor admission, bounded active-input waiting, and authoring validation that
permits delivery-incomplete drafts. Flat Show requests use exact loaded Pattern
metadata for private projection; accepted edits retain the original Show as their
Undo base. The [candidate application contract](../reference/contracts/agent-candidate-application.md)
records the qualified boundaries and consumer evidence. The canonical resize owner,
manual resize path, and qualified resize admission are implemented. The explicit
typed fixed-duration diagnostic qualifies its finite model context; unrestricted
text, model-selected timing, automatic routing and broader final-valid batching
remain open.

#946 and #947 product decisions are complete. The
[finite command census](agent-show-command-census.md) maps 54 existing names into
45 canonical operations. The #956 service package is approved; hosted service
implementation and the final #959 Agent surface remain unfinished. Epic #943 and
its children carry the remaining implementation and design decisions. This roadmap
does not claim production readiness for the diagnostic route.

## Provenance and adaptation

This document is adapted from the roadmap drafted and reviewed in the private pxlblz-v3
repository. The original records Jon’s architectural review and prioritization with GPT-6
Astra; Fable 5.1 reviewed it, and the review's sequencing and evidence corrections were
incorporated before migration. The first #945 slice (V2 commit `3feb9710`) carried the reviewed text into this repository unchanged apart from the V3
locators in its final section, under a preface listing the decisions that superseded it. This
revision folds those decisions into the body so a reader no longer reconciles a preface against
obsolete statements. The reviewed text as migrated remains readable with
`git show 3feb9710:docs/plans/shared-agentic-show-editing-roadmap-prd.md`.

| Field                 | Value                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Source path           | `docs/plans/shared-agentic-show-editing-roadmap-prd.md` in `pxlblz-v3` (local, unpublished)     |
| Source HEAD           | `9ecd481fd6facc0f7c68c1f99cd6c0d6c1405654`                                                      |
| Source status         | staged in the V3 index, **not committed**; the bytes are the working-tree file, not a V3 commit |
| Acquired              | 2026-09-04                                                                                      |
| Original content hash | SHA-256 `a7eb951b05ba2fc6555215343439c6ed6d7c674628fa005bd15c3e7b66e4d66d`, 29704 bytes         |
| Adapted               | 2026-09-04 in V2, after the first #945 slice                                                    |

The hash covers the original V3 bytes, verified against the local V3 working tree at acquisition;
it does not cover this adapted text. The adaptation and current reconciliation change the facts below and incorporate the dated
connection and URL opt-in decisions. Requirements, evidence rules and sequencing from the
reviewed original are retained where later accepted decisions have not superseded them.

- Release placement is decided: v1.9 of the public V2 product. The original's private-preview
  question and its "agent work remains private" wording are gone.
- The process-readiness milestone the original waited on has been reached (#940), and the three
  engineering contracts it anticipated exist.
- Implementation is authorized through the epic's child issues rather than withheld by this
  document. The original's "authorizes no implementation" statement described its own status as
  a proposal and is replaced by the issue-owned authorization described below.
- The agent harness now lives in this repository as a diagnostic area; the original's V3
  implementation references are replaced with V2 locations, and V3-only evidence is marked
  historical.
- A shared UX design gate (#959) covers manual editing, the built-in agent and external MCP
  agents. Its behaviour decisions D1–D10 are accepted; its remaining placement gate no longer
  blocks discussion of admission, command or service policy.
- The original worker-policy snapshot is historical. Current execution follows the installed
  execution policy and Jon's 2026-09-07 selection of Astra Low implementation with Astra
  orchestration.

## The destination

Show authoring should feel like working with an assistant who understands the document on
screen. The author can point at a Clip, ask for a change, continue using the timeline, and see
the result arrive quickly as one understandable, reversible edit. Mouse, keyboard, and agent
operations share the same meaning. A delayed agent response cannot overwrite intervening work,
and an operation is never announced as successfully applied merely because the model finished
speaking.

Three participants share that experience: the person editing directly, the built-in agent
opened from an IDE chat button, and an external agent the author already has, connected through
the Model Context Protocol (MCP). Jon wants both agent paths supported. The built-in path may
consume a Jon-funded service; the external path lets an author bring their own agent without
Jon funding that agent's inference indefinitely. Both agent paths are interfaces to the same
supported semantic commands and the same editor admission owner, not independent editing
implementations.

Agentic editing is the flagship of this roadmap. The supporting architecture should make it
dependable without putting a general application rewrite in front of it. UI responsiveness and
stability matter because the author stays in the editor while the agent works. Compiler
correctness matters because the Show must continue to render and reach hardware as intended.
Improving compiler speed, expanding optimization sophistication, and making generated artifacts
faster are not current priorities.

The destination ships in the public V2 product as v1.9. The independent V3 platform stays
separate: its language, appliance runtime, audio and hardware exploration are not part of this
work, and this roadmap does not carry a private split of the agentic path. A semantic editing
and evaluation seam proven here may later be reused there, but conversational Show editing does
not wait for a new language, appliance runtime, or hardware target.

## Why this is the next investment

The existing system has already demonstrated the hardest prerequisite: meaningful Show
operations can be exposed independently of the timeline UI. The Show grammar transferred into
[`src/agent-harness/`](../../src/agent-harness/README.md) shares V2's pure engine layer, supplies
typed refusals, resolves references against editor context, and groups a request into a
transaction. The local bridge and dictation experiment share one turn runner. This is working
evidence that the domain model can support another authoring interface. Shared engine code does
not yet guarantee identical behavior: manual resizing, the V2 command registry and the grammar
registry differ in clamping and transition-connected Clip support, and the
[Show command semantics contract](../reference/contracts/show-command-semantics.md) covers the
V2 registry only.

The V3 latency work established the right direction. Moving transaction bookkeeping into the
harness removed model round trips. Supplying useful document and catalogue context reduced
discovery calls. Allowing the operation that finishes a request to end the turn removed a final
acknowledgement round trip. The September 1 experiment reports, which remain in V3 and are not
transferred (see the evidence map), recorded the corpus run falling from 5.30 model calls and
14.9 seconds per case to 1.28 calls and 6.5 seconds, with the later run meeting 43 of 43 corpus
expectations and a 73.8-second maximum. Those figures are historical: they measured a bounded
experiment against V3's vendored copy of V2 with the experimental provider configuration, not
the live editor, and they are not the current baseline. Their shape still matters. Tail latency
and cancellation are important even when ordinary edits feel fast, which is why the baseline
reports distributions and outliers rather than a headline figure, and why no earlier headline
figure is a target.

The product goal is to make agentic editing as fast as possible while preserving correctness.
The baseline in #945 establishes current measured behavior on the live V2 editor rather than
adopting an unverified latency target.

The present integration has a correctness gap independent of model quality. The bridge reads a
Show, edits a private snapshot, then returns a replacement record. The editor checks Show
identity, but the apply operation does not compare the document revision on which the request
was based. If the author moves Clip B while the agent edits Clip A, the returned record can
restore B's old position. Serializing bridge requests only prevents bridge requests from racing
each other; it does not protect mouse edits. The
[agent candidate application contract](../reference/contracts/agent-candidate-application.md)
records this and the other present limits as the current experimental boundary.

This is why shared transaction ownership comes before cosmetic decomposition of the Show
editor. Extracting React components would reduce file size without establishing who may commit
a change. A document owner with an explicit commit contract improves every interface at once.

## Product requirements

The author should be able to say "make that Clip twelve seconds," "split here," or "fade its
brightness across the next eight seconds," with the referent and time grounded in the editor
context captured for that request. Moving the pointer afterward must not silently change which
Clip the request addresses. Ambiguous references produce a useful question and no committed
mutation.

A request containing several operations should appear as one edit. Intermediate working states
remain private, even when completing the request requires passing through a temporarily invalid
composition. The complete candidate must satisfy the applicable authoring validation before it
enters the live document. The author can undo an accepted agent request using the same history
as manual edits; the private agent session does not become a second authoritative undo history.

The author may continue navigating and editing while the model works. A response based on stale
information must either be safely revalidated against the current document or refused with a
concise explanation. Protecting the author takes precedence over completing every request
automatically. "That Clip moved while I was working; I haven't applied this change" is an
acceptable result.

The UI must distinguish model progress, a candidate waiting to apply, an applied change, and a
persistence failure. It should acknowledge a submitted request promptly and offer cancellation
while work is pending. Cancellation prevents a late response from applying; it cannot promise
that a remote provider instantly stops computation or billing. Once a change has committed,
reversal uses undo rather than pretending the completed transaction was cancelled.

Agentic authoring changes the Show, not physical hardware. Existing explicit Run/Save intent
and delivery checks remain intact. A model's successful edit is not permission to send an
artifact, change a Controller map, or alter a device setting.

### Shared experience across manual, built-in and external agents

The same requirements apply whichever participant makes an edit, and the following are specific
to supporting more than one agent path. #959 owns their concrete design and is the source of
truth for the UX requirements that #946, #947 and #956 consume.

- Commands from the built-in and external agents share semantics and admission behavior.
  Channel-specific context and authentication are explicit; transport does not become a second
  semantic owner.
- The author can see which agents are connected, which live session and Show they target, what
  scope they were granted, and how to disconnect or revoke them. Wrong-account or wrong-session
  targeting must not silently succeed. A browser reload, a Show change, a second tab, or a
  second agent connecting has defined behavior; an in-flight edit is never silently retargeted.
- Connection authorization is separate from inference billing, and the author can tell which
  service or account pays. Built-in inference is not assumed free or unlimited. When the built-in
  allowance is exhausted or the external agent is unavailable, the author makes an explicit
  choice; nothing falls back to a potentially charged service on its own.
- Pending and completed edits are attributed to their author, the interface stays quiet during
  normal editing, and it becomes explicit when the author must decide. Keyboard-only and
  narrow-window use keep focus return, readable progress and refusal, accessible announcements,
  and no chat or connection overlay that traps the author away from the Show.
- No arbitrary-code, raw-document-patch, device Run/Save or hardware-control escape hatch exists
  on either agent path. The finite command census and the three contracts remain the boundary.
- Identity and target authorization are separate: OAuth identifies account and client; Connect
  from the intended Show arms the target window. The accepted design has no pairing code, and
  provider credentials never serve as connection credentials.

### Accepted connection behaviour and remaining UX work

Jon accepted #959's D1–D10 behaviour decisions on 2026-09-06. Manual editing continues while
one agent connection, built-in or external, is bound to one window and Show. A second agent
is refused; built-in and external agents are not simultaneously active. Leaving the Show,
reload, tab closure, release, revocation or stale expiry ends the binding and retires unapplied
requests. Release or revoke is available from another signed-in window. An HTTP stream ending
alone is not cancellation or release. Reconnect requires an explicit Connect from the intended
Show and never replays prior work.

Identity grants, credentials, logical connections, editor bindings and edit requests have
separate lifetimes. A stable operation id supports deduplication and outcome lookup; an unknown
outcome never licenses automatic resubmission. Each external edit has an explicit begin,
commands and commit boundary, with captured editor context and one history entry if accepted.
Conversation stays in the external client; only the built-in assistant's conversation appears
inside the IDE. Opening the panel authorizes neither a connection nor inference spending.

The behaviour proposal and detailed scenario design are attached from
[#959](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/959), with a
[durable artifact bundle](https://gist.github.com/jon-whiteroomsoftware/27fd62952969c2fa9973b469c05e8074).
Their original right-column placement was rejected. Layout prerequisites
#965/#966/#967/#968/#976/#977 are now closed, with the panel overhaul on local main.
Final placement can proceed against that layout: a Show-header agent pill and pinned popover
following the Controller precedent, with the existing HelpHint treatment. Detailed visual and
interaction approval remains Jon's gate. Desktop is the product; narrow layouts need reachable
controls and no focus trap, rather than a separate phone authoring experience.

#946 owns admission and outcome-lifetime details; #947 owns the finite command census;
#956 owns service, transport, grant/credential lifetimes and supported clients. Their discussions
can proceed now without waiting for final surface placement. Accepted behaviour is a requirement,
not proof that OAuth, the tab channel or agent admission is implemented.

### Default-off URL opt-in

Jon requires every new user-visible, user-exposed or usable agent-editing capability to remain
disabled unless the author explicitly enables it with a URL flag. The first slice that exposes
such capability implements the gate; internal engine and persistence work need not implement it
early. It cannot wait until release qualification.

The gate covers the agent entry point and panel, built-in requests, external connection/arming
and live editing, and any earlier usable diagnostic surface promoted into the product.
#956 specifies the parameter and enabled value, navigation/reload behaviour, and interaction
with service disable and in-flight work. The URL flag does not replace account ownership,
connection grants or the production disable control. Opening an enabled panel still authorizes
neither inference nor connection by itself.

The first exposing slice (#949 if it exposes usable product capability, otherwise #957 or #963)
implements the gate and later slices reuse it. Real-route proof covers absent and non-enabling
values, explicit opt-in, reopening without opt-in, and ordinary manual edit/undo/save while off.
Both agent channels acquire this proof as they become available; #958 retains it as a release
requirement. Release qualification does not authorize removing the default-off requirement.

## Architectural direction

One shared Show command contract should define the meaning of an edit. V2's command registry is
described by the [Show command semantics contract](../reference/contracts/show-command-semantics.md)
and inventoried by the [generated coverage report](../reference/show-command-coverage.md). The
transferred grammar registry
([`grammar/registry.ts`](../../src/agent-harness/grammar/registry.ts)) wraps many of the same
engine functions separately. Their argument checks, refusal behavior, and descriptions can
diverge despite sharing the underlying mutation. The roadmap converges semantic ownership while
preserving thin adapters for each caller.

The shared contract owns stable identities, domain arguments, accepted outcomes, and typed
refusals. An agent adapter adds language-facing tool descriptions, reference resolution, and
conversational context; the built-in chat and an external MCP client are two such adapters over
the same contract. The UI adapter translates gestures and field commits into the same
operations. No adapter reproduces overlap rules, time conversion, or Pattern-instance semantics
independently. Existing gesture previews may remain ephemeral; their committed result must use
the authoritative editing path.

A separate Show editing module owns the committed record, revision, transaction acceptance,
history, and persistence coordination. A model turn operates on a private working copy derived
from a captured revision. Its completed candidate arrives with the originating Show/session
identity and enough intent to explain or revalidate the change. Committing is short and
serialized. Model inference never holds the document lock, and the author is not blocked for the
duration of an API request.

The model's conversational outcome should be structured. The transferred turn runner still uses
a question mark in the reply to classify an ask and discard edits. That is useful experimental
scaffolding, but punctuation should not determine whether a production transaction commits.
Apply, ask, refuse, and cancel need explicit meanings below the prose reply. The harness
continues to own transaction mechanics and preserve the successful same-response completion
path.

Show compilation and delivery consume committed state and explicitly identified preview
overrides. They do not observe half-finished agent transactions. A compilation result must
identify the document and dependencies it describes; superseded results cannot replace a newer
preview or make stale delivery controls ready. The Show delivery module should own that
readiness and invalidation contract, while React presents it.

This separation deliberately permits multiple authors without introducing distributed
collaborative editing. The controlled domain is one live application session with one
authoritative Show owner and manual, built-in-agent and external-agent callers. Supporting an
external connection is not a commitment to cross-device collaborative merging, CRDTs, or
server-side revision work (#802). Cross-tab, cross-device, and multiple-human collaboration
remain outside this release unless explicitly added later.

## Execution order and gates

The following is the planning state on 2026-09-08; issue bodies and their attached evidence own
subsequent progress. An open issue is not necessarily unfinished implementation.

1. Process readiness: #942, completed by #940.
2. Baseline: #945 implemented, reviewed and landed through `acd8ea81`; closed. Browser races, the paid semantic baseline, sealed held-out metadata and
   historical measurements are recorded. Jon rejected numerical latency targets in #946.
3. Persistence: #948 implemented, reviewed and landed at `de0e09c2`; closed. This fixes single-client recovery, not stale-candidate admission.
4. #946 decisions are resolved below and in its canonical issue body. #947 command decisions and the source-verified census are complete. Remaining decision work is
   #956 production service.
   Final surface placement and Jon's UX approval remain separate; the layout prerequisites
   are complete, so that design work can resume.
5. Admission: #949's internal session/revision/store slice is reviewed and landed at
   `1a6cfc07`. Bounded B1 typed private-turn completion is implemented in the
   diagnostic harness; its service outcome does not imply live application or saving.
   D1 provides an explicit internal authoring-validation session/import policy with
   dependency, numeric-domain and artifact proof; default bridge/MCP callers retain
   delivery-oriented admission. Live integration and full #949 scope remain pending.
   Broader Layer/command qualification still coordinates with #947/#950; no full
   implementation or production capability is claimed.
6. Shared resize: #950 pure semantic-owner slice A is reviewed and landed at
   `513d13ca` under the completed #947 census; paired integration remains pending
   on #949. Command families #951–#954 follow resize.
   #955 preview/delivery invalidation can proceed after #949 alongside command migration.
7. Production: #957 implements built-in access; #963 implements external MCP access. Both
   consume the implemented shared admission/command seam and approved service/UX design,
   initially exposing only qualified operations. A missing native dependency is not permission
   to build a second semantic owner.
8. External qualification: #964 follows delivered #963/#957 paths and supplies evidence to
   #958. #958 combines all approved families, #955, production and external evidence, then
   requires Jon's release acceptance.

#949 now has a written internal foundation, and #947 has a complete command census. The coordinator owns PRD and issue updates; the worker owns only its isolated first
slice. Final #959 placement and #956 service design remain independent decision work. Subsequent
Layer qualification and private intermediate-state command fixtures use the #947 census, never
worker-selected semantic changes. Production integration can start with qualified resize after
its design gates are approved; it need not wait for every command family.

The completed baseline supplies the decision evidence. No downstream decision is approved
until its owning issue records Jon's answer; completed prerequisites do not waive that gate.

## Waypoint 1: establish the real baseline (#945, implemented)

The baseline is complete at its declared measurement boundaries. It combines deterministic
real-editor observations with a separate paid semantic corpus run; it is not a direct
live-model browser latency trace. The completion candidate was reviewed and landed through
`acd8ea81`. The pinned
[baseline report](../reference/agent-editing-baseline.md) owns raw evidence, versions,
measurement boundaries and residual gaps.

The diagnostic harness lives under `src/agent-harness/` with
[per-file provenance](../../src/agent-harness/PROVENANCE.md). The actual browser route exercises
the bridge's overlay, HTTP/NDJSON, MCP, private grammar session, turn runner, editor adoption,
personal persistence and preview observation. Scripted delays reproduce stale manual-edit
replacement, target deletion/movement, inserted-time loss and navigation away/back. The
eight-sequence campaign also covers recovery, multi-operation history, stock drafts and personal
Library dependencies. #948 subsequently turned recovery sequence E into a passing regression.

Seven fixture outcomes are hash-pinned for later artifact-preservation checks. The paid
Luna/high corpus measured all 43 ordinary cases: 42 passed, and the vignette-parameter case asked
instead of applying the expected edit. That retained failure is evidence, not missing baseline
work or permission to weaken release criteria. The run made 58 calls and settled $0.049526.
The 16-case held-out set was sealed before paid runs and remains unexecuted and unused for tuning
until #958.

Total model-call time per case had a 3,958 ms median, 7,885 ms p90 and 12,977 ms maximum.
Browser adoption, save and matching-preview timings were measured separately with the scripted
agent. Additive timing proposals in that historical report are not observed live-model route
distributions. Jon has explicitly declined to adopt them as targets or limits for either agent path.

The existing corpus remains a regression asset. Preserve the failure reproductions as each
owning slice introduces the corresponding prevention oracle. The personal-Library preview gap,
the ordinary semantic failure and historical timing proposals remain visible in the report.
Held-out scoring belongs to #958. The experiment's Luna/high configuration and historical
$20 baseline authorization do not select the production provider or authorize service rollout.

## Waypoint 2: protect commits and report explicit outcomes (#946, #948, #949)

This is the first implementation destination after the baseline. It does not depend on broad
command migration: the existing Show store can own commit admission while adapters are migrated
incrementally. Every authoritative write path, including undo, redo, reload, and draft reset,
must preserve the revision/session contract. A timestamp is not a document revision.

The accepted first version uses conservative Layer-level independence checks, detailed below. A
request captures a monotonic document revision and its required authored dependencies. An unchanged
revision is the simple path; a changed revision requires successful qualified dependency checks,
otherwise refusal. The intended document/session must remain eligible in either case. The comparison
and commit occur inside the same serialized operation; checking earlier and writing later would
preserve the race. Within one browser session, a synchronous comparison and state update without
an intervening await can provide this boundary; no general lock service is required. #946
decides the remaining details with Jon under #959's accepted behaviour; #949 implements them.

Jon's "clear air" suggestion fits at this seam. If a pointer gesture or field commit is active,
the candidate can wait briefly for it to settle. Expose explicit gesture state at the commit
boundary; do not infer safety from elapsed time alone. Any wait is bounded and cancellable, and
revision validity is checked again after waiting. The delay improves interaction timing; it is
not a substitute for conflict detection. Continuous manual activity must not leave an invisible
candidate waiting indefinitely. The timeout and user-visible result are to be selected from the
live interaction evidence (#946).

The accepted Layer-level check allows qualified edits to survive unrelated changes. A later,
separately qualified refinement could allow independent changes within the same Layer. An operation could record that it intends to resize a
particular Clip whose start, ownership, and neighbors were known when planning began. If those
assumptions still hold, it may be possible to apply that intent to the current Show. If the
author has moved or removed the Clip, changed its relevant neighbors, or altered the timeline's
meaning, refuse instead.

Declared mutation paths alone do not prove independence. Inserting time can invalidate a later
operation's timestamp even when the two operations write different fields. Read dependencies and
domain preconditions matter. This roadmap does not require a general merge engine;
whole-document revision refusal remains the fallback for unqualified cases. Jon has now accepted
bounded Layer-level independence for qualified local edits; finer same-Layer revalidation is deferred.

Persistence correctness has its own completed slice. #948 made protection against superseded
save failures consistent across update, undo, redo and recovery. The store stamps accepted
replacements at adoption, preserves durable record/history pairing and enumerates write,
reload and reset paths for the revision owner. It landed at `de0e09c2` with store,
mutation and real-editor failure/reopen evidence. Its `updatedAt` ordering stamp is not a
document revision, and the repair does not prevent stale whole-record replacement.

The bounded B1 diagnostic slice of #949 implements explicit private finish outcomes.
Live request/session identity through application remains pending. The complete admission
increment captures editor focus
once at submission so later pointer movement cannot retarget the request. Dialogue history
records whether the candidate actually applied; a successful-sounding model reply cannot become
false context for the next request. Distinguish a refused candidate, a retired request, and a
save failure from a transport error. Preserve the existing durable-baseline recovery policy
described in the
[Show state, history and persistence contract](../reference/contracts/show-state-history-persistence.md).

The waypoint is reached when delayed agent work cannot overwrite a committed manual edit within
the supported session model, cancellation and navigation retire stale requests, retries cannot
duplicate a committed transaction, and one accepted request becomes one history entry. Operation
identity and revision must survive the apply boundary; a fresh model reply is not enough
evidence of a fresh document.

### Accepted Layer-level independence policy — 2026-09-07

Jon approved starting with Layer-level independence and assessing how it feels in real use.
Qualified local commands may proceed alongside manual edits on other Layers within the same
Zone or in other Zones, provided their guarded shared dependencies remain unchanged. Any authored
change on an affected Layer is conservatively conflicting in the first version, even on a
nonoverlapping Clip. Same-Layer interval independence is deferred.

The classifier must establish safety for every admitted case; it need not recognize every
independent case. Shared timing, structural changes and uncertain dependencies refuse
conservatively. Broad or unqualified requests may require an unchanged whole Show. Layer
identity spans internal Scenes; Scene-local overlay ids and projected indices alone must not
retarget an operation after Layer insertion or reordering. Cross-Layer moves check both sides.
Referenced shared instances and other required authored dependencies participate in admission.
Sharing alone does not block an edit, but an intervening change to that shared dependency does.

A legitimate shared edit may affect multiple Clips and be artistically surprising. Report its
scope truthfully and keep it undoable as one edit; perfect artistic-intent inference is not a
requirement. A collision discards the entire private candidate before application, preserving
the complete current manual state/history and producing no candidate persistence write.
Accepted commands run against current state and adopt as one history entry; they never restore
the old whole-record snapshot. Undo therefore preserves intervening manual work.

Finite engine-owned dependency rules and base/current authored snapshot comparisons are the
proposed mechanism, with exact projections still to verify in #946/#947/#949. Required checks
include owned animation/Transitions, referenced instances and relevant Pattern/Library/Group
context, shared timing and Layer membership/order. A local-looking command derived from broad
context is not proof of local intent. No general dirty-bit propagation system, arbitrary patch
merge or model-selected independence guarantee is required.

Required proof distinguishes independent same-Zone Layers, independent Zones, same-Layer
refusals, shared-instance changes, Layer topology/timing changes and unknown cases. Accepted
batches preserve both edits through save/reopen; Undo preserves the preceding manual edit.
Refusals preserve the complete current document/history with no candidate write. One unsafe
member refuses the entire batch. Cancellation, retirement, deduplication, final validity and
save recovery remain independent obligations.

The remaining #946 interview decisions are recorded below. Exact command qualification and
fixtures belong to #947/#949, under this accepted policy. Real authoring evidence will determine
whether later refinement is needed; no numerical performance target governs acceptance.

### Accepted visible waiting interaction — 2026-09-07

Jon accepts a bounded wait for active manual gestures or field edits to settle before an
otherwise eligible candidate applies. A subtle animated dot should signal that an edit is
waiting to land. The final #959 agent activity surface supplies that status for both built-in
and external agents, behind the URL flag. A gentle pulse, static reduced-motion equivalent and
readable status are the coordinator's proposed treatment; detailed visual approval remains #959.

The waiting candidate stays private and cancellable; manual input remains enabled. Once the
interaction settles, recheck session eligibility, cancellation, deduplication and Layer/shared
dependencies before final validation and atomic adoption. Timeout must report non-application.
Jon explicitly approved that focus alone does not delay application. An active drag or an
uncommitted field change does; application preserves focus and pending drafts. On field commit
or cancellation, recheck eligibility and dependencies. Jon approved a five-second maximum from completed candidate arrival. New activity does not
restart the deadline. Keep the subtle cue and Cancel available while manual editing continues.
If interaction settles, recheck immediately; if it remains active at the deadline, discard the
candidate and report non-application. Agent generation and MCP work are expensive, so the wait
gives completed work a reasonable chance to apply. This is an approved interaction bound, not a
measured model-latency target or permission for automatic paid retries.

### Accepted validation class: Controller capacity — 2026-09-07

Jon explicitly permits exceeding the Controller's capacity during editing. Capacity/resource-fit
limits belong to artifact delivery, not agent authoring admission. Otherwise valid manual and
agent edits remain editable and saveable; explicit Controller delivery enforces capacity on the
current artifact. Agent editing never implicitly sends to hardware. Required proof pairs a saved,
reopened oversized authored Show with a clear delivery blocker and no oversized send.

This settles capacity only. The missing-reference policy is recorded below; Portable compatibility is settled below. Supported private intermediate validity
and incomplete installation coverage are recorded below.

### Accepted validation class: existing missing dependencies — 2026-09-07

Jon permits otherwise valid unrelated edits when a Show already references a missing Pattern
or Library. Keep the existing problem visible; do not require dependency completeness before
all authoring. The operation and its captured semantic context must not require unavailable
information, and the edit must not introduce a new broken reference. An operation needing
unavailable control/export metadata refuses rather than guessing or substituting stock metadata.
Repairing an existing missing reference with a known valid one remains possible.

Identify unresolved dependencies by owner/reference identity, not error counts: removing one
old error and introducing another is not preservation. Verify unrelated accepted edits through
save/reopen, metadata-dependent refusal, successful repair and newly introduced missing-reference
refusal. This does not relax structural validity or other admission checks.

### Accepted private intermediate validity — 2026-09-07

Jon permits explicitly supported private command sequences to pass through temporarily invalid
composition, provided the complete batch passes accepted final-authoring validation before live
adoption. The motivating overlap is forbidden same-Layer overlap; Clips on different Layers
may overlap in time. Existing supported Transition overlap rules remain authoritative.

Invalid invocation arguments, unknown targets and identity/reference corruption are not waived.
Only named composition constraints may be deferred for qualified commands, with finite fixtures
in #947. A failed, incomplete or final-invalid batch discards all private work; no intermediate
state enters live history, persistence or preview. Final authoring validity uses the accepted
missing-dependency and delivery-capacity policies, not a universal hardware-readiness gate.
This adds no unrestricted patch tool or arbitrary scratch-container capability.

### Accepted validation class: physical installation coverage — 2026-09-08

Jon permits editing and saving an Installation Show with missing, overlapping or
out-of-output-range physical assignments. Known first-match routing remains unchanged; keep
coverage diagnostics visible and block delivery wherever the selected output contract requires
exactly-once coverage. This includes negative and above-output integer assignments. Structural
Zone/Layout identities and valid finite integer endpoints remain required. Verify each coverage
class through edit/reopen and required-delivery refusal without a send, plus malformed numeric
and unknown-owner refusal. Portable compatibility is settled below.

### Accepted validation class: Portable compatibility — 2026-09-07

Jon permits editing and saving a Portable Show with output-compatibility mismatches, such as a
Portable 2D Show using a Pattern with only a 3D renderer. Keep the diagnostic visible; Portable
export and delivery remain blocked until repaired. The agent can perform otherwise valid edits
and help repair compatibility.

The current Portable validator also reports missing logical Zone references and malformed
routing. Those are not exempted merely because the same validator emits them: preserve the
accepted reference and structural rules, and classify by meaning. Verify incompatible
edit/save/reopen, repair restoring artifact eligibility, blocked incompatible export/delivery,
and continued refusal of newly broken references or malformed routing.

### Explicit retry without a timeout — 2026-09-07

Jon agrees to explicit retry after refusal or wait expiry rather than automatic service
replanning. An explicit new attempt starts from current state while preserving original resolved target
identities; it never applies the old candidate or silently spends on another turn. Jon withdrew the proposed post-failure countdown:
Retry remains until retry or dismissal. Dismissal removes the action, not the historical failure
outcome. The only five-second deadline is the pre-application wait for active manual editing.

Jon approved explicit dismissal: composer focus and draft typing leave Retry available.
Retry/Dismiss must preserve unrelated composer drafts; Dismiss retains the historical failure.
Active-request eligibility still applies if another request is underway. #959 owns presentation
and client-specific retry affordances; the IDE cannot assume it can restart external inference.

Jon explicitly approved stable Retry targets. Changed selection, hover, playhead or list order
cannot retarget the failed request. Refresh current state and dependency guards for the original
resolved ids; if a required target is gone, refuse instead of selecting a replacement. A new
user instruction may use current selection. Retry creates a new operation id linked to the
failed attempt; redelivery of the old id still returns its original outcome without applying
again. Verify selection/reorder/deletion and multi-target cases through the actual retry flow.
This refines earlier “fresh context” wording: refreshed state does not mean new referents.

### Accepted outcome lifetime: live editor session only — 2026-09-07

Jon approves session-only in-memory agent outcome and duplicate protection. No durable receipt
database, 24-hour edit history or rotating log is required. A repeated operation id returns its
known result without a second application/history entry/save. A temporary transport interruption
can recover the result while the same live editor session and table remain available.

Reload, close or session retirement ends old application eligibility. Reopening the same Show
never revives it; missing historical outcomes may be unknown, and old work cannot automatically
replay. Persisted Show content remains durable independently of these volatile receipts. Never
infer a receipt from the current document. #956/#963/#964 implement and qualify this bounded
recovery guarantee; authentication grant and binding coordination storage remain separate.

Specify bounded table capacity without allowing forgotten operation ids to become eligible
again. Historical unknown, retired session and live duplicate are distinct outcomes. A new
explicit Retry gets a new operation id but preserves the original resolved targets.

### Accepted speed policy and source ownership — 2026-09-07

Jon explicitly rejects numerical latency targets or limits. Try to make the built-in assistant
quick; externally supplied MCP agents involve different providers and network paths. Measure
model/tool/network/application/save/preview phases separately for diagnosis and retain outliers,
without converting #945's historical figures into deadlines or pass/fail thresholds. The
five-second active-input wait is the separate approved interaction bound. #956 owns necessary
service/resource lifecycle limits; historical model latency does not set them.

#946's implementation handoff keeps V2 as sole source owner. Pure admission/dependency/validation
policy belongs in the engine; the existing Show store owns authoritative revisions, adoption,
history and settlement. React and agent channels are thin adapters. Local bridge processes,
provider SDKs, credentials and diagnostic/corpus tools stay outside product bundles. Extract only
needed shared code with provenance; do not move the entire harness or introduce a new framework.

The canonical #949 spec splits work into internal session/revision/store ownership; real
diagnostic bridge/typed outcomes/waiting; qualified Layer command replay; and final validation
and consumer proof. The first Astra Low worker completed the internal foundation as commit
`1a6cfc07`; all 97 focused tests and four committed-tip suites passed, Fable High found no
defects, and the exact candidate landed on local main.
#947 still owns command semantics and the finite census. No final product panel, production
endpoint, durable receipt store or paid model call is part of that first slice.

## Waypoint 3: converge the command contract through one vertical slice (#947, #950 to #954)

Begin with resizing a Clip under the accepted #947 semantics and the
[finite command census](agent-show-command-census.md). The current mouse supports
transition-connected resizing, the V2 registry clamps some oversized requests, and the
transferred grammar's plain resize refuses overlaps and connected cases. Jon approved exact
semantic requests with typed refusal on 2026-09-07, while drag preview computes a bounded value.
An agent resize request never silently clamps or moves an unrelated neighbor; an explicitly
requested batch may rearrange and resize when its final state is valid.
Jon also approved automatic connected resize when Transitions are attached: preserve the exact
requested duration and attached Transitions, move connected Clips according to existing supported
engine semantics, and report those movements. If it cannot fit, refuse atomically without
shortening or removing Transitions. This intrinsic connected movement is the exception to the
rule against silently moving unrelated neighbors. Guard the full affected arrangement; preserve
unsupported-topology refusals. Canonical naming and prototype-name retirement are specified in
#947's census. The same semantic
operation must work from the manual editor and from the agent tool, return equivalent refusals,
and produce the same projected Show. This proves the seam (#950) without migrating the entire
grammar at once.

Jon also approved successful no-ops: an already-satisfied valid request reports that fact,
creates no history/save/revision change, and does not abort other batch steps. A wholly no-op
batch does not adopt; a mixed valid batch adopts actual changes once. Same-object engine returns
can also mean invalid or unsupported requests, so classify the supported postcondition explicitly
rather than treating every identity return as success. True refusals remain atomic batch failures;
duplicate delivery returns its original outcome rather than executing and becoming a no-op.

Jon approved the corresponding connected-move rule: an ordinary move places the named Clip at
the exact requested time and moves its Transition-connected chain by the corresponding offset,
preserving relative timing and Transitions. If the supported chain cannot fit, refuse atomically;
never detach, remove Transitions, clamp the target time or move unrelated content silently.
Independent movement requires explicit disconnection intent through an approved command sequence;
this adds no new detach command. Guard the full affected chain and source/destination scopes.

Jon accepts individually approved agent-only operations where no manual surface exists. They
use the same command/admission/validation/history/persistence rules; do not build manual UI solely
for parity. #947 must still disposition each experimental operation explicitly. Where a manual
surface exists, require paired evidence; otherwise require pure-command and real-agent evidence
with truthful tool descriptions. No blanket experimental-registry or generic-patch approval.

The production operation is **Make Pattern Independent** (`make_clip_pattern_independent`).
Jon approved retiring the experimental `restart_clip` tool name. The agent translates clear
requests for fresh independent Clip state into the canonical operation and describes the resulting
independence accurately. Preserve settings, instance-targeted animation, Main/overlay support,
and whole logical Clips spanning Scenes. Playback restart remains a separate intent. The old
Main-only helper is not the production semantic owner; no production alias is promised. #951
qualifies the existing independence owner under the shared command/admission contract.

Explicit “only this Clip” intent authorizes necessary Pattern independence followed by the
requested speed change as one atomic, undoable edit. The agent handles ownership mechanics
and briefly explains any separation; no additional ownership confirmation is required. An
already-independent Clip needs no new instance. Explicit all-linked intent keeps the shared
instance. Jon considers deliberate sharing an advanced edge use case: support it correctly
without making it a routine conversational hurdle. This accepts the explicit Clip-local speed
case, not automatic detachment for every ambiguous instruction or broader Group cloning.
#951/#953 qualify this sequence with unchanged other users, preserved settings/animation,
failed-batch rollback, dependency checks, one Undo, and save/reopen evidence.

Jon approved the remaining command scope as a package: retain existing specific Clip/Layer,
Transition, control/keyframe, effect, marker/timing, Zone-metadata, Layout and output-setting
operations. Consolidate duplicate experimental tools without carrying prototype names into the
production API. Arbitrary document patches and device actions remain excluded. Workers may
complete naming, schema and fixture mappings within this existing capability set; only changes
to behavior or scope require another product decision. Preserve distinct Boundary/Layer
Transition semantics. The [source-verified finite census](agent-show-command-census.md) completes the #947 mapping
deliverable. Its 45 canonical operations are planned migration scope, not shipped support.

Extend that path across the supported operation families in small increments (#951 to #954).
Preserve stable identities, global-time meaning, Group ownership, control validation, and the
existing distinction between authoring validity and artifact eligibility. A Show may remain
editable and previewable when a hardware resource limit blocks delivery. Introducing agent
editing must not accidentally turn every delivery blocker into a prohibition on saving
choreography. Classify each existing validation rule before adopting it as a shared commit gate
(#946). Default diagnostic sessions still elevate installation coverage and Portable compatibility into
transaction failures; the explicit internal D1 authoring policy qualifies their accepted
diagnostic classes without broadening bridge/MCP exposure. V2 saving has a separate boundary. Missing-reference and dependency cases
also need explicit policy, not a blanket classification inferred from the validator name.

The private transaction now supports a finite two-plain-Clip rearrangement on the same
Scene, Zone and Layer, retaining one pair through temporary mutual overlap and requiring
strict raw final validation. The [command contract](../reference/contracts/show-command-semantics.md#private-two-clip-rearrangement)
records its boundaries. Broader temporary-invalid composition remains unqualified.
#945 deliberately requires each generic patch member to leave declared Show structure
valid, and ordinary registry commands retain individual preconditions. This does not
reopen arbitrary scratch containers or add generic patch tools to the production allowlist.

Source ownership is single-repository. The agentic path now lives in V2, and subsequent slices
must not require unreviewed V3 companion commits or an unpublished V3 checkout at runtime. #946
records the exact shared module and package boundary; #949 brings the bridge, turn runner and
grammar adapter from the diagnostic area into owned engine code under that decision. The
independent V3 platform may later consume the shared contract through a deliberate dependency
pin or extraction rather than a second implementation; that is a V3 concern and not part of this
release.

The first slice records a finite supported command set and a resolved divergence table, then
proves one operation through both adapters. #947's census records, for every operation in the
union of V2 registry commands, grammar tools and manual handlers, its canonical name, manual
surface or none, and migrate, agent-only or deferred disposition, with no silent capability
removal. Extend that set only through separately reviewable slices. Commit authority remains
single throughout; direct engine calls may coexist with shared commands during migration. The
waypoint is reached when the chosen supported command set has one semantic owner, both adapters
cross it, and its chosen behavior has observable evidence. Gaps are named explicitly. No claim
of complete arbitrary Show construction follows from completing a finite registry.

## Waypoint 4: make the experience responsive and truthful (#955)

Once commit ownership is established, UI work should remove measured delays and unstable
lifecycle coupling. This work may proceed alongside incremental command convergence; it does not
wait for the entire grammar migration. The Show editor currently participates in compilation
snapshots, delivery preparation, asynchronous preview-image generation, and stale-result
rejection. Extract these responsibilities when they have a clear owner and observable contract,
rather than breaking up a large file simply to reduce line counts.

A gesture can provide immediate temporary feedback while its final semantic edit remains one
commit. An agent transaction should trigger work for its accepted final state rather than
repeatedly compiling private intermediate operations. Obsolete compilation and preview requests
should be superseded, and caching must include every dependency that can affect the result.
Personal Pattern or Library changes cannot leave an apparently current artifact behind.

Persistence failure needs equally explicit behavior. The system must say whether an edit is
visible but not durable, rolled back, or waiting for retry. The initial implementation should
preserve and clarify the existing recovery policy rather than inventing a second policy for
agents. A delayed failure must not roll back a newer accepted edit. Successful local mutation and
successful durable save are distinct outcomes even if the common path presents them together.

The waypoint is reached when an author can perform the representative live tasks without losing
input, being surprised by stale previews, or seeing success for an unapplied edit. Record browser
responsiveness, request latency, and preview latency separately. Broad worker migration, a new
rendering architecture, or multi-document editing is not a prerequisite; those require their own
evidence and design.

## Waypoint 5: ship and qualify for v1.9 (#956, #957, #958)

The release candidate combines semantic corpus results with real-editor evidence. The author
should be able to dictate a batch change, continue interacting, see it apply or be explicitly
refused, inspect the result, undo it, and reopen the Show with the expected durable state.
Existing manual flows remain supported. Failures should explain the current state and a useful
next action without exposing internal transaction machinery in normal product language.

The model remains an interpreter of intent, not the authority on document validity or
completion. Unknown controls, missing Pattern references, unsupported commands, and ambiguous
selections must be handled by the grammar and harness. Expensive evaluation should remain
explicit and proportionate; ordinary edits should not acquire extra model calls or full-Show
rendering merely because a more elaborate harness is available.

Conversational editing ships with the current Pixelblaze product in v1.9; that placement is
decided and is not reopened unless Jon asks. What remains to decide is the production service:
#956 owns the authenticated surface, provider and effort, credential ownership, billing and
limits, cancellation semantics, retention, privacy, rate limits, operational metrics and a
feature-disable path, taking its user-facing requirements from the approved #959 design. The
loopback development bridge is experimental evidence, not the deployment design. #957 implements
the approved surface and service and initially exposes only qualified operations. External delivery and qualification have their own tickets, #963 and #964, described below.

Initial access should keep development and testing painless for the small current audience.
Jon describes the URL opt-in as obscurity/discoverability, not authorization, and wants simple
protection from griefing and nuisance use. Jon approved a server-configured allowlist of authenticated
canonical app account IDs for both built-in and external agent access, reusing the existing linked
OAuth identity model, plus simple request throttling against nuisance traffic and accidental
loops. No invitation system or admin UI is required initially. Server checks retain independent
Show ownership and connection/target grants; the URL flag cannot authorize access. The external
MCP authorization flow still needs implementation; the protocol does not make payloads
authenticated automatically. Exact limits, revocation/in-flight behavior and funded-inference
policy remain to specify; this is not approval to provision a paid endpoint.

Jon approved reusing his existing OpenAI credential, already used for Luna experiments,
for initial allowlisted built-in development/testing. External agents fund their own inference.
No payments or user-key-entry UI is required. Local credential loading already supports an
external protected env file; hosted operation requires server-side secret configuration and
must never expose the key to the browser. Spending bounds and deployment
remain to specify; local credential availability does not establish hosted configuration.

Jon selects a $10 daily inference allowance shared across the entire built-in testing service.
Retries count; external agents' inference and unrelated API-key use are outside this feature's
accounting. Reserve bounded cost before dispatch with a shared atomic owner, then settle known
usage conservatively. Burst throttling alone is not spending accounting. UTC day boundaries
and bounded aggregate reservations are the proposed simple implementation; edit receipts and
conversation retention remain separate. No payments UI is required.

The built-in assistant uses OpenAI `gpt-5.6-luna` with reasoning effort `high`, selected by
Jon for the demonstrated quality/cost balance in the existing experiments. No model or effort
picker is in scope; this is the product model choice. The server owns configuration and does
not silently substitute models on provider failure. External MCP users choose their own agent
outside the app. The Astra Low implementation-worker policy is separate from this product
choice. This decision adds no numerical latency target or new benchmark claim.

The [service decision packet](agent-show-service-decisions.md) separates these accepted choices
including the URL lifecycle, session-only transcript, minimal redacted operational records
and existing Cloudflare deployment direction approved on 2026-09-08. B2 implements
the URL/session/admission boundary in the existing diagnostic overlay only; hosted
service, final panel placement, active-input wait and full command migration remain.

#958 runs the agreed capability and real-editor campaign on the release candidate, scores the
sealed held-out utterances, verifies that manual authoring and generated artifacts remain
correct, and records Jon's release acceptance or the concrete remaining blockers. Hardware
probes are used only for claims that require real Controller execution; browser Fast and Precise
preview and artifact checks do not establish those claims.

The external path has explicit owners: #963 delivers it and #964 qualifies it per supported
client through the real editor and selected infrastructure. #958 consumes their evidence.
Neither the diagnostic MCP server nor built-in-only integration satisfies this requirement.
Native speech capture remains separate from the current typed and OS-dictated input path.

## Compiler correctness during the roadmap

Compiler restructuring is a supporting lane with a strict preservation objective. The
architecture review found repeated reasoning about scope, bindings, writes, purity, and numeric
bounds across optimization passes. Consolidating that reasoning could improve maintainability,
but it should not become a prerequisite for shipping the editing module or an excuse to alter
optimization selection.

If this lane proceeds, select a bounded analysis surface and preserve generated artifacts and
decisions for the named corpus. Analysis belongs to a particular source revision; facts must be
recomputed or invalidated after transformations that affect them. Existing conservative refusals
remain conservative until a separate change demonstrates that broader qualification is sound.

Artifact comparison is the primary preservation oracle when output is meant to remain unchanged.
Execute representative generated artifacts to verify frame output and state progression,
including Fast and Precise modes and known transition/seek cases. Normalize only identified
nondeterministic metadata when comparing; do not hide semantic differences behind broad snapshot
filtering. Any unexpected emitted-code or runtime difference stops the preservation claim and
becomes an explicit decision, not a silently accepted optimization.

There is no target for faster compilation or faster Controller execution in this roadmap. If
measured compiler cost becomes the dominant obstacle to responsive authoring, return with
evidence and scope a targeted change. Otherwise preserve the established compiler and focus
effort on the flagship interaction.

## Validation and evidence

Verification crosses the interfaces consumers actually use. Pure command tests establish
accepted results, unchanged inputs, stable identities, and typed refusal without partial
mutation. Transaction tests establish revision checks, history, retries, and failure ordering.
Live-editor checks establish that the user sees the promised outcome. Model experiments measure
interpretation reliability and round-trip cost. Generated-artifact execution and hardware
qualification answer different questions and must not be substituted for one another.

The required shared-editing sequences include: an agent edits A while the author edits B; both
edit A; a target is deleted or moved; the author inserts time before an agent's target; a drag
is active when the candidate arrives; continuous interaction reaches the bounded wait limit; the
author navigates away and back to the same Show; a response arrives after cancellation; a
delayed or duplicate result arrives after the overlay retires its request; and a persistence
failure arrives after another edit. For every refusal, assert the complete committed document is
preserved and no partial history or persistence side effect escaped.

Accepted sequences include a multi-operation request followed by undo and redo, a manual edit
followed by an agent edit, and reopening a persisted result. Referent checks include hover,
selection, explicit identity, time, ordinal, ambiguous reference, and stale context. Commands
involving personal Patterns and Libraries use real dependency metadata rather than guessing
exports from a stock substitute. The finite supported set is recorded before implementation;
evidence should not claim universal concurrency or language understanding.

The external-agent path adds sequences at the MCP client surface: pair and verify the target,
discover the supported command set, request an edit and receive an applied or saved outcome,
disconnect and reconnect; wrong, expired or revoked pairing; wrong account or session; two tabs;
reload; two agent candidates on the same base; save failure after visible application; and
disconnect after application but before acknowledgement. #959 states these as a design-time
scenario matrix with the intended document, history and persistence outcome beside the visible
feedback; prototype walkthroughs prove design clarity, not live security or MCP
interoperability, so the design handoff names the browser, client and authorization tests
implementation must run.

Performance evidence records code and dependency versions, model/effort, cache conditions,
fixture complexity, and latency boundaries. Separate model-call time from complete
user-perceived time and include outliers. Record per-call latency and cache conditions alongside
call count so fewer calls do not conceal slower calls. A regression corpus repeatedly tuned
during development should be supplemented with held-out utterances and owner use before treating
its score as release confidence.

## Documentation and process

The engineering-contract direction this roadmap consumes was tracked in
[White Room Software Process #16](https://github.com/jon-whiteroomsoftware/whiteroom-software-process/issues/16),
now closed, and adopted in this repository by #940 (WRSP 0.5.0), which is qualified, approved,
landed, pushed and deployed at `ad8ad651`; its issue stays open only for Jon's closure. The
three contracts the original anticipated exist under `docs/reference/contracts/`:
[Show command semantics](../reference/contracts/show-command-semantics.md),
[Show state, history and persistence](../reference/contracts/show-state-history-persistence.md)
and [agent candidate application](../reference/contracts/agent-candidate-application.md). An
artifact identity and invalidation contract is extracted only if the changed seam requires it.

Contracts capture the agreement callers must share, with the essential model first and detailed
obligations later. They link to owning code and executable evidence. They do not narrate call
stacks or duplicate generated command inventories. Plans retain proposed behavior; reference
describes implemented behavior; issues carry implementation status and proof. Accepted behavior,
its contract and its evidence change in the same slice; contracts are never rewritten to claim
unimplemented behavior. V2 is the authoritative home for the migrated work, and Jon has asked
that its issues, this roadmap, the technical references and the affected contracts stay current
with each landed slice rather than at the end of the epic.

Current implementation selection is `gpt-6-astra` at `low`, with Astra orchestrating
(Jon, 2026-09-07). The installed `~/.agents/execution-policy.md` owns exact launch pairs,
availability handling and escalation; repository instructions own serialized review/landing
and publication gates. Historical Fable/Sol capacity authorizations are not the current default.
No implementation launch follows merely from this roadmap. The experimental Luna/high baseline
is separate from implementation model choice. Jon has now selected that same
`gpt-5.6-luna` / `high` pair for the built-in product assistant in #956.

The current layout coordination instruction holds publication for Jon's UX go-ahead; local
landing and production release are distinct. Verify the current issue-owned publication decision
before pushing rather than inferring rollout permission from a completed implementation.

## Relationship to the independent V3 platform

The reusable result is a semantic editing and evaluation seam. It should help a later runtime
accept authoring intent without depending on React or a specific model provider. It does not
make the current ShowRecord or Pixelblaze execution behavior the permanent V3 language contract.

The agentic editing path has moved to V2 and is developed, reviewed and released here; V3 keeps
no parallel copy to maintain. ADRs 0001 to 0003 still govern the independent platform: separate
exploration, appliance-first execution, and deliberate Pixelblaze porting without a
compatibility runtime. A future typed visual representation can explicitly separate frame state,
simulations, pixel kernels, composition, mapping, and output. That platform will need reference
semantics, target capability profiles, conformance fixtures, and measured performance evidence
of its own.

The deterministic telemetry and model-evaluation apparatus, now transferred, are useful
foundations. Low-resolution renders screen candidates cheaply; full installation geometry and
target execution supply stronger evidence where required. Visual quality, semantic correctness,
and target performance remain separate judgments. Building a new compiler, GPU backend,
appliance runtime, audio-directed composition system, or hardware integration is outside this
roadmap's completion criteria.

The earlier agent-first product-shape note explored removing rich manual editing. This roadmap
makes a different choice: manual and agent authoring coexist, and both benefit from the same
domain operations. That choice does not silently rewrite the broader platform plan; the
long-term interface investment there remains a product decision.

## Open decisions and their owners

The review established that commit ownership can become authoritative before command migration
completes. The issue specifications preserve that ordering, resolve per-operation semantic
differences, classify validation rules, and name evidence through the live integration. The
failing browser reproduction remains required despite the reviewer's suggestion to skip it; it
supplies the fix's observable regression oracle.

Each open decision is settled with Jon in its owning issue before dependent implementation
expands. An unanswered decision is not approval.

| Decision | Owner | Current state |
| --- | --- | --- |
| Layer-level independence; shared/uncertain refusal | #946 policy, #947/#949 qualification | accepted; finite command cases still to implement |
| Five-second active-input wait, focus/draft distinction, subtle cue | #946, #959 presentation | accepted; visual treatment remains design work |
| Authoring/delivery classes and supported private intermediate validity | #946, #947 command fixtures | accepted policy; implementation and proof pending |
| Explicit untimed Retry/Dismiss and original stable targets | #946, #959 presentation | accepted |
| Session-only outcome lookup, dedup and retirement | #946, #956/#963 integration | accepted; no durable receipts |
| Source ownership | #946/#949 | V2 engine policy, store owner, thin adapters; bounded extraction |
| Numerical speed targets | #946 | rejected by Jon; optimize and observe both paths without latency limits |
| Canonical commands, resize, no-change semantics and finite census | #947 | product decisions accepted; source-verified census complete; documentation review pending |
| Final agent surface placement and interaction approval | #959 | layout prerequisites complete; final design/approval remains |
| Service/provider, grants, transport, allowance, retention and disable | #956 | policy package accepted; hosted implementation/qualification remains |
| URL flag spelling, navigation and in-flight disable semantics | #956 | exact agent=1 accepted; B2 diagnostic lifecycle implemented |
| Release acceptance | #958, including #964 external proof | after approved capability and operational evidence |

The desired final result is concrete: the author points, asks, and keeps working. A fast agent
operation uses the same rules as a gesture, applies once against valid current state, reports
the actual outcome, and is easy to reverse. The UI stays usable, the compiler keeps its
established behavior, and the new platform gains a proven authoring seam without inheriting a
premature runtime rewrite.

## Source and evidence map

Current implementation context: the original diagnostic transfer was inspected at `3feb9710`;
the baseline completed through `acd8ea81`, and persistence recovery landed at `de0e09c2`.
These pins remain ancestors of the 2026-09-07 reviewed main used for this reconciliation.

- Diagnostic harness: [`src/agent-harness/README.md`](../../src/agent-harness/README.md) and
  [`PROVENANCE.md`](../../src/agent-harness/PROVENANCE.md); browser bridge
  [`bridge/chat.js`](../../src/agent-harness/bridge/chat.js); request path
  [`bridge/service.ts`](../../src/agent-harness/bridge/service.ts) with process entry
  [`bridge/server.ts`](../../src/agent-harness/bridge/server.ts); turn runner
  [`experiment/turn.ts`](../../src/agent-harness/experiment/turn.ts); grammar session
  [`grammar/session.ts`](../../src/agent-harness/grammar/session.ts) and registry
  [`grammar/registry.ts`](../../src/agent-harness/grammar/registry.ts); MCP server
  [`mcp/showsServer.ts`](../../src/agent-harness/mcp/showsServer.ts), which is evidence that the
  grammar can be exposed over MCP and not the production external-agent path.
- Transferred references: [Show data model](../../src/agent-harness/reference/show-data-model.md)
  and [Show grammar coverage](../../src/agent-harness/reference/show-grammar-coverage.md),
  regenerated against V2's live schema.
- Editor boundary: [`ShowEditor.tsx`](../../src/components/ShowEditor.tsx) (`__pxlblzEditor`,
  `getEditorFocus`, `applyShow`) and the [Show store](../../src/store/showStore.ts).
- Contracts and inventories: the three contracts linked above and the
  [Show command coverage report](../reference/show-command-coverage.md).
- Commands: `npm run agent:corpus -- --fake`, `npm run agent:smoke`, `npm run agent:bridge`,
  `npm run agent:coverage`, `npm run agent:diagnostics`.

Historical V3-only material, as locators at V3 `9ecd481f` (local, unpublished, not transferred).
These describe the harness before it moved and contain wording that predates the V2 decisions
above; the transferred implementation and the contracts, not these documents, describe current
behavior.

- Reference: local bridge (`docs/reference/dictation-bridge.md`), dictation experiment
  (`docs/reference/dictation-experiment.md`), Show grammar registry
  (`docs/reference/show-grammar-registry.md`), and the vendored V2 dependency
  (`docs/reference/vendored-v2.md`).
- Latency evidence, private because it includes model transcripts: baseline run
  (`experiments/dictation/2026-09-01-r5-baseline/report.md`) and finish-argument run
  (`experiments/dictation/2026-09-01-r10-finish-argument/report.md`). These are the source of
  the historical figures quoted above and are not the current baseline.
- Planning: original grammar spike PRD (`docs/plans/show-grammar-agent-prd.md`), agent-first
  product shape (`docs/plans/agent-first-product-shape.md`), and system architecture draft
  (`docs/plans/system-architecture-draft.md`).
- Accepted platform decisions: separation (`docs/adr/0001-separate-next-generation-platform.md`),
  appliance priority (`docs/adr/0002-appliance-first-target-priority.md`), and portability
  (`docs/adr/0003-pixelblaze-portability-not-compatibility.md`).
