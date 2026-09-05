# Shared agentic Show editing: roadmap and product requirements

Status: accepted roadmap for the public V2 v1.9 release, adapted for V2 on 2026-09-04. Epic #943
sequences it, and its child issues carry implementation state and authorize the work each of them
names. This document holds the product and architectural rationale those issues share. It decides
nothing that an issue lists as a decision for Jon, and it does not approve any downstream issue
ahead of the gate that owns it.

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
it does not cover this adapted text. The adaptation changes the following facts and nothing else
of substance. Requirements, evidence rules, and sequencing from the reviewed original are kept
where they still apply.

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
- A shared UX design gate (#959) covering manual editing, the built-in chat agent and external
  agents connected through MCP now precedes the admission, command and service decisions.
- Model and worker policy is stated as it stands on 2026-09-04.

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
- Jon's suggested UI-visible pairing secret is a candidate to evaluate, not an accepted
  credential design. A provider API key is never the pairing credential.

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

Epic #943 sequences the waypoints below into child issues. The order matters more than the
waypoint names, because several decisions are deliberate stop points where Jon decides.

1. Process readiness: #942, completed by #940. Done.
2. Baseline: #945. The first diagnostic slice exists; the live baseline is incomplete.
3. Shared UX design gate: #959. Fable designs, Astra reviews in the coordinating session, Jon
   approves. Blocked by #945's baseline evidence. Blocks #946, #947 and #956, and is a release
   gate for #958 until the approved external-MCP delivery and qualification work is linked into
   the dependency graph.
4. Decisions after baseline and UX approval: #946 (admission, final validation, gesture wait,
   thresholds, V2 source ownership), #947 (canonical command census and resize), #956
   (production surface, provider, credentials, limits, retention, rollout).
5. State safety: #948 may start after the baseline without deciding the new UX. #949 follows
   #946 and #948.
6. First shared operation: #950 follows #949 and #947. Capability families #951 to #954 follow
   resize; #955 follows admission.
7. Production integration: #957 follows admission, resize and the approved shipping design.
8. Release evidence and Jon's acceptance: #958.

Nothing in this document advances an issue past its gate. In particular, the first #945 slice
does not satisfy #959's dependency on baseline evidence, and no downstream decision is approved
until its owning issue records Jon's answer.

## Waypoint 1: establish the real baseline (#945, in progress)

The first slice captures what already works before changing the authoring seam. It identifies
the current code and configuration, runs the existing semantic corpus, and measures the complete
live path from request submission to visible application and persistence outcome. Model latency,
tool execution, validation, waiting for a gesture to finish, persistence, compilation, and
preview publication should be distinguishable so a faster provider is not credited for an
unrelated UI change.

The first diagnostic slice (commit `3feb9710`, landed) delivered the source
integration this measurement needs. The V3 bridge, Show grammar, MCP server, dictation corpus,
scripted fake agent and evaluation tooling now execute against the live V2 engine from
`src/agent-harness/`, with per-file provenance in
[`PROVENANCE.md`](../../src/agent-harness/PROVENANCE.md). The bridge request path gained a
scripted mode that runs the corpus's fake agent through the same HTTP, NDJSON, MCP, session and
turn path a live model uses, with deterministic completion delay. The transferred suites pass
against V2, the fake corpus passes in full, and a scripted bridge smoke test judges its returned
candidate after `.pxlshow` and `.epe` export and reopen through the V2 importers. Two drifted V3
oracles are recorded as diagnostics rather than repaired. The Technical Reference (section 27)
describes the area's place in the codebase.

The browser-baseline slice added the real-editor half without a paid call:
`npm run test:e2e:agent-baseline` drives the actual Show editor route in Chromium through the
bridge's own chat overlay and a real scripted bridge process, and reproduces the stale
whole-record overwrite (a manual edit, a Clip delete, and inserted time during inference are
all undone by the reply), application after navigating away and back, and the durable-baseline
mismatch after a later failed save; it also covers a multi-operation reply, a built-in draft
with no personal write, and a personal Pattern on a personal Library. Request ids correlate the
overlay, the bridge phase clock, a dev-only read-only editor/preview observation seam, and the
network writes. A finite fixture set with committed record and artifact hashes
(`npm run agent:baseline:fixtures`) preserves before/after exports for later compiler
comparisons and records three grammar refusals verbatim. The report is
[`docs/reference/agent-editing-baseline.md`](../reference/agent-editing-baseline.md); its
timing table is scripted-bridge timing, not a model measurement.

Still open in #945: the sealed held-out utterances, the bounded paid corpus run with its
distributions and cache conditions, and the proposed median, tail and responsiveness thresholds
for Jon to accept in #946. No paid model call has been made.

Use a real-browser harness against the editor route and bridge, with the scripted agent response
source delayed deterministically. Reproduce the overwrite before fixing it and retain that case
as the regression oracle. Model calls measure interpretation separately; they are not needed to
force concurrency timing.

The existing corpus remains a regression asset. A small live-editor campaign adds the
integration cases it cannot prove: a delayed response while the author edits, navigation away
and back, cancellation, undo, and failed persistence. Representative small and complex Shows are
chosen and recorded at this waypoint. They should include personal dependencies, Groups,
animation, routing, and longer timelines where relevant to supported commands. Held-out
utterances and their expected outcomes are sealed before any paid run or tuning and are scored
only at #958.

The measured model configuration is the existing experimental GPT-5.6 Luna at high reasoning
effort, under Jon's authorization of his OpenAI credentials with a $20 aggregate maximum for this
baseline (2026-09-04). This is a measurement pin, not a production-provider decision; #956 owns
that. #945 records the per-run call, token and spend ceilings and any cases they prevent
measuring. Credentials and private transcripts never enter committed evidence. Hardware is not
needed at this waypoint: Controller probes are reserved for #958 claims that require real
firmware execution, and Jon has deferred Controller work until after 2026-09-04.

The waypoint is reached when there is a reproducible baseline with pinned code, model/effort,
fixtures, and measurement boundaries, plus a demonstrated stale-snapshot failure or an
identified newer implementation that already prevents it. The benchmark should report
distributions and ordinary single-turn edits separately from clarification conversations.
Median and upper-percentile targets are agreed from this evidence in #946; the aim is to reduce
delay as far as possible without weakening correctness.

## Waypoint 2: protect commits and report explicit outcomes (#946, #948, #949)

This is the first implementation destination after the baseline. It does not depend on broad
command migration: the existing Show store can own commit admission while adapters are migrated
incrementally. Every authoritative write path, including undo, redo, reload, and draft reset,
must preserve the revision/session contract. A timestamp is not a document revision.

The initial proposed policy is optimistic concurrency with a conservative stale-base refusal. A
request captures a monotonic document revision. The editor accepts its completed candidate only
if that base remains valid and the intended document/session is still eligible. The comparison
and commit occur inside the same serialized operation; checking earlier and writing later would
preserve the race. Within one browser session, a synchronous comparison and state update without
an intervening await can provide this boundary; no general lock service is required. #946
decides this policy with Jon after #959; #949 implements the accepted decision.

Jon's "clear air" suggestion fits at this seam. If a pointer gesture or field commit is active,
the candidate can wait briefly for it to settle. Expose explicit gesture state at the commit
boundary; do not infer safety from elapsed time alone. Any wait is bounded and cancellable, and
revision validity is checked again after waiting. The delay improves interaction timing; it is
not a substitute for conflict detection. Continuous manual activity must not leave an invisible
candidate waiting indefinitely. The timeout and user-visible result are to be selected from the
live interaction evidence (#946).

After the conservative baseline is proven, narrowly scoped revalidation may allow an agent edit
to survive unrelated intervening changes. An operation could record that it intends to resize a
particular Clip whose start, ownership, and neighbors were known when planning began. If those
assumptions still hold, it may be possible to apply that intent to the current Show. If the
author has moved or removed the Clip, changed its relevant neighbors, or altered the timeline's
meaning, refuse instead.

Declared mutation paths alone do not prove independence. Inserting time can invalidate a later
operation's timestamp even when the two operations write different fields. Read dependencies and
domain preconditions matter. This roadmap does not require a general merge engine;
whole-document revision refusal is an acceptable first shipping policy, and selective
revalidation is optional until it earns its complexity.

Persistence correctness has its own slice. #948 makes the existing protection against
superseded save failures apply consistently to undo, redo and recovery paths, establishes a
single-client ordering rule for replacements (including agent records that retain a captured
`updatedAt`), and enumerates every write, reload and reset path for the later revision owner. It
fixes existing behavior through manual editing and the diagnostic bridge and can proceed once
the baseline exists, independently of the UX gate.

The same increment replaces punctuation-based transaction classification with explicit finish
outcomes and carries request/session identity through application. It captures editor focus
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

## Waypoint 3: converge the command contract through one vertical slice (#947, #950 to #954)

Begin with a common operation such as resizing a Clip, after deciding its semantic differences
with Jon in #947. Today the mouse supports transition-connected resizing, the V2 registry clamps
some oversized requests, and the transferred grammar's plain resize refuses overlaps and
connected cases. Record the chosen behavior for each divergence before implementing
equivalence. A proposed policy is exact semantic requests with typed refusal, while drag preview
computes a bounded value; transition-aware behavior remains a named decision. The same semantic
operation must work from the manual editor and from the agent tool, return equivalent refusals,
and produce the same projected Show. This proves the seam (#950) without migrating the entire
grammar at once.

Extend that path across the supported operation families in small increments (#951 to #954).
Preserve stable identities, global-time meaning, Group ownership, control validation, and the
existing distinction between authoring validity and artifact eligibility. A Show may remain
editable and previewable when a hardware resource limit blocks delivery. Introducing agent
editing must not accidentally turn every delivery blocker into a prohibition on saving
choreography. Classify each existing validation rule before adopting it as a shared commit gate
(#946). The transferred grammar elevates installation coverage and portable compatibility into
transaction failures; V2 saving has a different boundary. Missing-reference and dependency cases
also need explicit policy, not a blanket classification inferred from the validator name.

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
the approved surface and service and initially exposes only qualified operations. The external
MCP delivery and its qualification are linked as concrete work before #959 closes, so no
external-agent requirement disappears between design and implementation. Native speech capture
remains separate from the current typed and OS-dictated input path.

#958 runs the agreed capability and real-editor campaign on the release candidate, scores the
sealed held-out utterances, verifies that manual authoring and generated artifacts remain
correct, and records Jon's release acceptance or the concrete remaining blockers. Hardware
probes are used only for claims that require real Controller execution; browser Fast and Precise
preview and artifact checks do not establish those claims.

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

Worker and model policy on 2026-09-04: Astra is the manually selected planning model and
coordinates and reviews this work in the coordinating session; it is never launched
automatically or as a subagent. Ordinary implementation workers are GPT-5.6 Sol at high effort.
Jon authorized a task-specific override for this roadmap of Fable 5.1 at high effort, at most two
concurrently, for 48 hours from 2026-09-04. Haiku is retired. The cross-family candidate-review
route is unchanged by this document. Measurement uses the experimental Luna/high configuration
under the bounded authorization described in Waypoint 1; the production provider is #956's
decision.

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

| Decision                                                                                                                                   | Owner                                        | Gate                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------- |
| Baseline-derived median, tail and responsiveness thresholds                                                                                | proposed in #945, accepted in #946           | after the live baseline                  |
| Request identity and lifetime, stale-base refusal, duplicate and cancellation policy                                                       | #946                                         | after #959 approval                      |
| Bounded gesture and field wait, timeout and its visible result                                                                             | #946                                         | after #959 approval                      |
| Whether any selective revalidation enters the first release                                                                                | #946                                         | after #959 approval                      |
| Validation classes: invocation precondition, final authoring gate, delivery gate                                                           | #946                                         | after #959 approval                      |
| Shared module and package boundary; V2 source ownership                                                                                    | #946                                         | after #959 approval                      |
| Persistence visibility and recovery where existing behavior is ambiguous                                                                   | #948, with #946 for the agent-facing classes | after the baseline                       |
| Canonical command names, resize and connected-Clip behavior, no-change semantics, finite v1.9 census and fixture set                       | #947                                         | after #959 approval                      |
| Shared UX: connection and pairing, target and permission visibility, cancellation and revocation, cost ownership, concurrent-edit outcomes | #959                                         | Fable design, Astra review, Jon approval |
| Production surface, provider and effort, credentials, limits, retention, rollout and disable path                                          | #956                                         | after #959 approval                      |
| Release acceptance                                                                                                                         | #958                                         | after every shipping capability          |

The desired final result is concrete: the author points, asks, and keeps working. A fast agent
operation uses the same rules as a gesture, applies once against valid current state, reports
the actual outcome, and is easy to reverse. The UI stays usable, the compiler keeps its
established behavior, and the new platform gains a proven authoring seam without inheriting a
premature runtime rewrite.

## Source and evidence map

Current implementation context in this repository, inspected at `3feb9710`:

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
