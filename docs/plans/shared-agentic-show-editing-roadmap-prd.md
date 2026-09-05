# Shared agentic Show editing: roadmap and product requirements

## Provenance and current placement (V2, 2026-09-04)

This document was drafted and reviewed in the private pxlblz-v3 repository and migrated here
in the first #945 source-transfer slice. Provenance of the migrated bytes:

| Field | Value |
| --- | --- |
| Source path | `docs/plans/shared-agentic-show-editing-roadmap-prd.md` in `pxlblz-v3` (local, unpublished) |
| Source HEAD | `9ecd481fd6facc0f7c68c1f99cd6c0d6c1405654` |
| Source status | staged in the V3 index, **not committed**; the bytes are the working-tree file, not a V3 commit |
| Acquired | 2026-09-04 |
| Content hash | SHA-256 `a7eb951b05ba2fc6555215343439c6ed6d7c674628fa005bd15c3e7b66e4d66d`, 29704 bytes |

The body below is that reviewed text unchanged, except that links into V3-only documents in the
final section are written as V3 locators. The following decisions, recorded in epic #943,
supersede the body where they differ:

- **Release placement is decided.** V1.9 of the public V2 product is the intended release. Jon
  permits relevant agentic editing code, docs and issues to move from V3 into V2 and public
  discussion of the work; the broader V3 platform stays separate. The body's "private preview
  or follow-on" question in Waypoint 5 is therefore closed; production service design remains a
  decision (#956), not an assumed localhost deployment.
- **Execution order.** Baseline #945 first (this slice: diagnostic source integration under
  `src/agent-harness/`, executable against the live V2 engine). Then the shared-UX design gate
  #959, which covers direct human editing, built-in chat and externally supplied MCP agents, and
  blocks the decisions #946 (admission, final validation, wait, targets, V2 ownership), #947
  (canonical command census and resize) and #956 (production surface, provider, credentials,
  limits, retention, rollout). #948 (persistence correctness) can proceed after the baseline.
  Later waves: #949, #950, #951-#954, #955, #957, #958.
- **Engineering contracts exist now.** Read `docs/reference/contracts/show-command-semantics.md`,
  `show-state-history-persistence.md` and `agent-candidate-application.md`; the body's "process
  guards still need adoption" wording predates #940.
- **Model policy.** The baseline measures the existing experimental GPT-5.6 Luna/high
  configuration under Jon's $20 aggregate authorization; this is not a production-provider
  decision. Implementation workers for this roadmap are Fable 5.1/high under a task-specific
  override, coordinated and reviewed by Astra.

---

Status: proposed roadmap for review, 2026-09-04. Written from Jon's architectural review and subsequent prioritization with GPT-6 Astra. The priorities and product direction below reflect that discussion; detailed transaction policy, quantitative acceptance thresholds, packaging, and release placement remain proposals where identified. This document authorizes no implementation, publication, new runtime, or change to existing ADRs. Fable 5.1 reviewed the roadmap; this revision incorporates the accepted sequencing and evidence corrections. Product implementation waits for the accepted process-readiness milestone.

## The destination

Show authoring should feel like working with an assistant who understands the document on screen. The author can point at a Clip, ask for a change, continue using the timeline, and see the result arrive quickly as one understandable, reversible edit. Mouse, keyboard, and agent operations share the same meaning. A delayed agent response cannot overwrite intervening work, and an operation is never announced as successfully applied merely because the model finished speaking.

Agentic editing is the flagship of this roadmap. The supporting architecture should make it dependable without putting a general application rewrite in front of it. UI responsiveness and stability matter because the author stays in the editor while the agent works. Compiler correctness matters because the Show must continue to render and reach hardware as intended. Improving compiler speed, expanding optimization sophistication, and making generated artifacts faster are not current priorities.

The near-term destination is a trustworthy shared editing experience over the existing V2 Show engine. The longer-term destination is an authoring and evaluation architecture reusable in the independent V3 platform. These destinations are related but separately deliverable: conversational Show editing need not wait for a new language, appliance runtime, or hardware target.

## Why this is the next investment

The existing system has already demonstrated the hardest prerequisite: meaningful Show operations can be exposed independently of the timeline UI. V3's grammar shares V2's pure engine layer, supplies typed refusals, resolves references against editor context, and groups a request into a transaction. The live bridge and dictation experiment share turn orchestration. This is working evidence that the domain model can support another authoring interface. Shared engine code does not yet guarantee identical behavior: manual resizing and the two command registries differ in clamping and transition-connected Clip support.

Recent latency work also established the right direction. Moving transaction bookkeeping into the harness removed model round trips. Supplying useful document and catalogue context reduced discovery calls. Allowing the operation that finishes a request to end the turn removed a final acknowledgement round trip. The checked-in September 1 reports show the baseline falling from 5.30 model calls and 14.9 seconds per case to 1.28 calls and 6.5 seconds, with the latter run meeting 43 of 43 corpus expectations. Those reports measure a bounded experiment, not arbitrary live editing reliability.

The product goal is to make agentic editing as fast as possible while preserving correctness. The first waypoint establishes current measured behavior rather than adopting an unverified latency target. The latest inspected run has a 73.8-second maximum, making tail latency and cancellation important even when ordinary edits feel fast.

The present integration has a correctness gap independent of model quality. The bridge reads a Show, edits a private snapshot, then returns a replacement record. The editor checks Show identity, but the apply operation does not compare the document revision on which the request was based. If the author moves Clip B while the agent edits Clip A, the returned record can restore B's old position. Serializing bridge requests only prevents bridge requests from racing each other; it does not protect mouse edits.

This is why shared transaction ownership comes before cosmetic decomposition of the Show editor. Extracting React components would reduce file size without establishing who may commit a change. A document owner with an explicit commit contract improves both interfaces at once.

## Product requirements

The author should be able to say “make that Clip twelve seconds,” “split here,” or “fade its brightness across the next eight seconds,” with the referent and time grounded in the editor context captured for that request. Moving the pointer afterward must not silently change which Clip the request addresses. Ambiguous references produce a useful question and no committed mutation.

A request containing several operations should appear as one edit. Intermediate working states remain private, even when completing the request requires passing through a temporarily invalid composition. The complete candidate must satisfy the applicable authoring validation before it enters the live document. The author can undo an accepted agent request using the same history as manual edits; the private agent session does not become a second authoritative undo history.

The author may continue navigating and editing while the model works. A response based on stale information must either be safely revalidated against the current document or refused with a concise explanation. Protecting the author takes precedence over completing every request automatically. “That Clip moved while I was working; I haven't applied this change” is an acceptable result.

The UI must distinguish model progress, a candidate waiting to apply, an applied change, and a persistence failure. It should acknowledge a submitted request promptly and offer cancellation while work is pending. Cancellation prevents a late response from applying; it cannot promise that a remote provider instantly stops computation or billing. Once a change has committed, reversal uses undo rather than pretending the completed transaction was cancelled.

Agentic authoring changes the Show, not physical hardware. Existing explicit Run/Save intent and delivery checks remain intact. A model's successful edit is not permission to send an artifact, change a Controller map, or alter a device setting.

## Architectural direction

One shared Show command contract should define the meaning of an edit. V2 currently has a command registry and V3 has a separate grammar registry wrapping many of the same engine functions. Their argument checks, refusal behavior, and descriptions can diverge despite sharing the underlying mutation. The roadmap converges semantic ownership while preserving thin adapters for each caller.

The shared contract owns stable identities, domain arguments, accepted outcomes, and typed refusals. The agent adapter adds language-facing tool descriptions, reference resolution, and conversational context. The UI adapter translates gestures and field commits into the same operations. Neither adapter should reproduce overlap rules, time conversion, or Pattern-instance semantics independently. Existing gesture previews may remain ephemeral; their committed result must use the authoritative editing path.

A separate Show editing module owns the committed record, revision, transaction acceptance, history, and persistence coordination. A model turn operates on a private working copy derived from a captured revision. Its completed candidate arrives with the originating Show/session identity and enough intent to explain or revalidate the change. Committing is short and serialized. Model inference never holds the document lock, and the author is not blocked for the duration of an API request.

The model's conversational outcome should be structured. The experiment currently uses a question mark in the reply to classify an ask and discard edits. That is useful experimental scaffolding, but punctuation should not determine whether a production transaction commits. Apply, ask, refuse, and cancel need explicit meanings below the prose reply. The harness continues to own transaction mechanics and preserve the successful same-response completion path.

Show compilation and delivery consume committed state and explicitly identified preview overrides. They do not observe half-finished agent transactions. A compilation result must identify the document and dependencies it describes; superseded results cannot replace a newer preview or make stale delivery controls ready. The Show delivery module should own that readiness and invalidation contract, while React presents it.

This separation deliberately permits multiple authors without introducing distributed collaborative editing. The first controlled domain is one live application session with one authoritative Show owner and both manual and agent callers. Cross-tab, cross-device, and multiple-human collaboration remain outside this release unless explicitly added later.

## Waypoint 1: establish the real baseline

The first slice captures what already works before changing the authoring seam. It identifies the current code and configuration, runs the existing semantic corpus, and measures the complete live path from request submission to visible application and persistence outcome. Model latency, tool execution, validation, waiting for a gesture to finish, persistence, compilation, and preview publication should be distinguishable so a faster provider is not credited for an unrelated UI change.

Use a real-browser harness against the editor route and bridge, with a scripted fake agent response source whose completion can be delayed deterministically. Reproduce the overwrite before fixing it and retain that case as the regression oracle. Model calls measure interpretation separately; they are not needed to force concurrency timing.

The existing corpus remains a regression asset. A small live-editor campaign adds the integration cases it cannot prove: a delayed response while the author edits, navigation away and back, cancellation, undo, and failed persistence. Representative small and complex Shows are chosen and recorded at this waypoint. They should include personal dependencies, Groups, animation, routing, and longer timelines where relevant to supported commands.

The waypoint is reached when there is a reproducible baseline with pinned code, model/effort, fixtures, and measurement boundaries, plus a demonstrated stale-snapshot failure or an identified newer implementation that already prevents it. The benchmark should report distributions and ordinary single-turn edits separately from clarification conversations. Median and upper-percentile targets are agreed from this evidence; the aim is to reduce delay as far as possible without weakening correctness.

## Waypoint 2: protect commits and report explicit outcomes

This is the first implementation destination after the baseline. It does not depend on broad command migration: the existing Show store can own commit admission while adapters are migrated incrementally. Every authoritative write path, including undo, redo, reload, and draft reset, must preserve the revision/session contract. A timestamp is not a document revision.

The initial proposed policy is optimistic concurrency with a conservative stale-base refusal. A request captures a monotonic document revision. The editor accepts its completed candidate only if that base remains valid and the intended document/session is still eligible. The comparison and commit occur inside the same serialized operation; checking earlier and writing later would preserve the race. Within one browser session, a synchronous comparison and state update without an intervening await can provide this boundary; no general lock service is required.

Jon's “clear air” suggestion fits at this seam. If a pointer gesture or field commit is active, the candidate can wait briefly for it to settle. Expose explicit gesture state at the commit boundary; do not infer safety from elapsed time alone. Any wait is bounded and cancellable, and revision validity is checked again after waiting. The delay improves interaction timing; it is not a substitute for conflict detection. Continuous manual activity must not leave an invisible candidate waiting indefinitely. The timeout and user-visible result are to be selected from the live interaction evidence.

After the conservative baseline is proven, narrowly scoped revalidation may allow an agent edit to survive unrelated intervening changes. An operation could record that it intends to resize a particular Clip whose start, ownership, and neighbors were known when planning began. If those assumptions still hold, it may be possible to apply that intent to the current Show. If the author has moved or removed the Clip, changed its relevant neighbors, or altered the timeline's meaning, refuse instead.

Declared mutation paths alone do not prove independence. Inserting time can invalidate a later operation's timestamp even when the two operations write different fields. Read dependencies and domain preconditions matter. This roadmap does not require a general merge engine; whole-document revision refusal is an acceptable first shipping policy, and selective revalidation is optional until it earns its complexity.

The same increment replaces punctuation-based transaction classification with explicit finish outcomes and carries request/session identity through application. Dialogue history records whether the candidate actually applied; a successful-sounding model reply cannot become false context for the next request. Distinguish a refused candidate, a retired request, and a save failure from a transport error. Preserve the existing durable-baseline recovery policy.

The waypoint is reached when delayed agent work cannot overwrite a committed manual edit within the supported session model, cancellation and navigation retire stale requests, retries cannot duplicate a committed transaction, and one accepted request becomes one history entry. Operation identity and revision must survive the apply boundary; a fresh model reply is not enough evidence of a fresh document.

## Waypoint 3: converge the command contract through one vertical slice

Begin with a common operation such as resizing a Clip, after deciding its semantic differences with Jon. Today the mouse supports transition-connected resizing, the V2 registry clamps some oversized requests, and the V3 plain resize refuses overlaps and connected cases. Record the chosen behavior for each divergence before implementing equivalence. A proposed policy is exact semantic requests with typed refusal, while drag preview computes a bounded value; transition-aware behavior remains a named decision. The same semantic operation must work from the manual editor and from the agent tool, return equivalent refusals, and produce the same projected Show. This proves the seam without migrating the entire grammar at once.

Extend that path across the supported operation families in small increments. Preserve stable identities, global-time meaning, Group ownership, control validation, and the existing distinction between authoring validity and artifact eligibility. A Show may remain editable and previewable when a hardware resource limit blocks delivery. Introducing agent editing must not accidentally turn every delivery blocker into a prohibition on saving choreography. Classify each existing validation rule before adopting it as a shared commit gate. V3 currently elevates installation coverage and portable compatibility into transaction failures; V2 saving has a different boundary. Missing-reference and dependency cases also need explicit policy, not a blanket classification inferred from the validator name.

The V3 adapter should consume the shared contract through a deliberate dependency pin or extraction rather than maintaining a second implementation. The exact package boundary remains an implementation decision. V2 remains public and the agent work remains private until Jon chooses publication; generic shared capabilities can be proposed upstream without copying private product plans.

The first slice records a finite supported command set and a resolved divergence table, then proves one operation through both adapters. Extend that set only through separately reviewable slices. Commit authority remains single throughout; direct engine calls may coexist with shared commands during migration. The waypoint is reached when the chosen supported command set has one semantic owner, both adapters cross it, and its chosen behavior has observable evidence. Gaps are named explicitly. No claim of complete arbitrary Show construction follows from completing a finite registry.

## Waypoint 4: make the experience responsive and truthful

Once commit ownership is established, UI work should remove measured delays and unstable lifecycle coupling. This work may proceed alongside incremental command convergence; it does not wait for the entire grammar migration. The Show editor currently participates in compilation snapshots, delivery preparation, asynchronous preview-image generation, and stale-result rejection. Extract these responsibilities when they have a clear owner and observable contract, rather than breaking up a large file simply to reduce line counts.

A gesture can provide immediate temporary feedback while its final semantic edit remains one commit. An agent transaction should trigger work for its accepted final state rather than repeatedly compiling private intermediate operations. Obsolete compilation and preview requests should be superseded, and caching must include every dependency that can affect the result. Personal Pattern or Library changes cannot leave an apparently current artifact behind.

Persistence failure needs equally explicit behavior. The system must say whether an edit is visible but not durable, rolled back, or waiting for retry. The initial implementation should preserve and clarify the existing recovery policy rather than inventing a second policy for agents. A delayed failure must not roll back a newer accepted edit. Successful local mutation and successful durable save are distinct outcomes even if the common path presents them together.

The waypoint is reached when an author can perform the representative live tasks without losing input, being surprised by stale previews, or seeing success for an unapplied edit. Record browser responsiveness, request latency, and preview latency separately. Broad worker migration, a new rendering architecture, or multi-document editing is not a prerequisite; those require their own evidence and design.

## Waypoint 5: qualify the product and choose release placement

The release candidate combines semantic corpus results with real-editor evidence. The author should be able to dictate a batch change, continue interacting, see it apply or be explicitly refused, inspect the result, undo it, and reopen the Show with the expected durable state. Existing manual flows remain supported. Failures should explain the current state and a useful next action without exposing internal transaction machinery in normal product language.

The model remains an interpreter of intent, not the authority on document validity or completion. Unknown controls, missing Pattern references, unsupported commands, and ambiguous selections must be handled by the grammar and harness. Expensive evaluation should remain explicit and proportionate; ordinary edits should not acquire extra model calls or full-Show rendering merely because a more elaborate harness is available.

At this waypoint Jon decides whether conversational editing ships with the current Pixelblaze product, remains a private preview, or arrives as a follow-on. The architectural work should keep those options open. Production authentication, model credentials, provider costs, limits, packaging, and support are release decisions still to be specified; the loopback development bridge is not itself a production deployment design. Native speech capture is also separate from the current typed/OS-dictated input path.

## Compiler correctness during the roadmap

Compiler restructuring is a supporting lane with a strict preservation objective. The architecture review found repeated reasoning about scope, bindings, writes, purity, and numeric bounds across optimization passes. Consolidating that reasoning could improve maintainability, but it should not become a prerequisite for shipping the editing module or an excuse to alter optimization selection.

If this lane proceeds, select a bounded analysis surface and preserve generated artifacts and decisions for the named corpus. Analysis belongs to a particular source revision; facts must be recomputed or invalidated after transformations that affect them. Existing conservative refusals remain conservative until a separate change demonstrates that broader qualification is sound.

Artifact comparison is the primary preservation oracle when output is meant to remain unchanged. Execute representative generated artifacts to verify frame output and state progression, including Fast and Precise modes and known transition/seek cases. Normalize only identified nondeterministic metadata when comparing; do not hide semantic differences behind broad snapshot filtering. Any unexpected emitted-code or runtime difference stops the preservation claim and becomes an explicit decision, not a silently accepted optimization.

There is no target for faster compilation or faster Controller execution in this roadmap. If measured compiler cost becomes the dominant obstacle to responsive authoring, return with evidence and scope a targeted change. Otherwise preserve the established compiler and focus effort on the flagship interaction.

## Validation and evidence

Verification crosses the interfaces consumers actually use. Pure command tests establish accepted results, unchanged inputs, stable identities, and typed refusal without partial mutation. Transaction tests establish revision checks, history, retries, and failure ordering. Live-editor checks establish that the user sees the promised outcome. Model experiments measure interpretation reliability and round-trip cost. Generated-artifact execution and hardware qualification answer different questions and must not be substituted for one another.

The required shared-editing sequences include: an agent edits A while the author edits B; both edit A; a target is deleted or moved; the author inserts time before an agent's target; a drag is active when the candidate arrives; continuous interaction reaches the bounded wait limit; the author navigates away and back to the same Show; a response arrives after cancellation; a delayed or duplicate result arrives after the overlay retires its request; and a persistence failure arrives after another edit. For every refusal, assert the complete committed document is preserved and no partial history or persistence side effect escaped.

Accepted sequences include a multi-operation request followed by undo and redo, a manual edit followed by an agent edit, and reopening a persisted result. Referent checks include hover, selection, explicit identity, time, ordinal, ambiguous reference, and stale context. Commands involving personal Patterns and Libraries use real dependency metadata rather than guessing exports from a stock substitute. The finite supported set is recorded before implementation; evidence should not claim universal concurrency or language understanding.

Performance evidence records code and dependency versions, model/effort, cache conditions, fixture complexity, and latency boundaries. Separate model-call time from complete user-perceived time and include outliers. Record per-call latency and cache conditions alongside call count so fewer calls do not conceal slower calls. A regression corpus repeatedly tuned during development should be supplemented with held-out utterances and owner use before treating its score as release confidence.

## Documentation and process

The engineering-contract documentation work is tracked separately in [White Room Software Process #16](https://github.com/jon-whiteroomsoftware/whiteroom-software-process/issues/16). This roadmap consumes that direction but does not absorb its implementation. Applicable contracts should cover Show command semantics, transaction acceptance and revision ownership, persistence/history behavior, and artifact identity/invalidation.

Contracts capture the agreement callers must share, with the essential model first and detailed obligations later. They link to owning code and executable evidence. They do not narrate call stacks or duplicate generated command inventories. Plans retain proposed behavior; reference describes implemented behavior; issues carry implementation status and proof. The work should reduce conflicting descriptions rather than adding another complete explanation of the system.

Jon has also selected Astra as the manually chosen planning model and Sol/high as the ordinary Codex implementation worker. The accepted Fable review informed this revision. Engineering contracts are now available through WRSP #16; the remaining process guards still need the accepted qualification and adoption milestone. No change to candidate-review model policy is implied by this document.

## Relationship to the independent V3 platform

The reusable result is a semantic editing and evaluation seam. It should help a later runtime accept authoring intent without depending on React or a specific model provider. It does not make the current ShowRecord or Pixelblaze execution behavior the permanent V3 language contract.

ADRs 0001–0003 still govern the independent platform: separate exploration, appliance-first execution, and deliberate Pixelblaze porting without a compatibility runtime. A future typed visual representation can explicitly separate frame state, simulations, pixel kernels, composition, mapping, and output. That platform will need reference semantics, target capability profiles, conformance fixtures, and measured performance evidence of its own.

The current deterministic telemetry and model-evaluation apparatus are useful foundations. Low-resolution renders screen candidates cheaply; full installation geometry and target execution supply stronger evidence where required. Visual quality, semantic correctness, and target performance remain separate judgments. Building a new compiler, GPU backend, appliance runtime, audio-directed composition system, or hardware integration is outside this roadmap's near-term completion criteria.

The earlier agent-first product-shape note explored removing rich manual editing. This roadmap proposes a different near-term choice: manual and agent authoring coexist, and both benefit from the same domain operations. That proposal does not silently rewrite the broader platform plan; the long-term interface investment remains a product decision.

## Decisions for review

The review established that commit ownership can become authoritative before command migration completes. The next issue specifications must preserve that ordering, resolve per-operation semantic differences, classify validation rules, and name evidence through the live integration. The failing browser reproduction remains required despite the reviewer’s suggestion to skip it; it supplies the fix’s observable regression oracle.

Open decisions are the exact shared-module/package boundary; the baseline and release latency thresholds; bounded gesture-wait behavior; whether any selective revalidation earns inclusion in the first release; the persistence visibility/recovery contract where existing behavior is ambiguous; the supported command and fixture census; and production packaging and release placement. These should be settled with Jon at their waypoint before dependent implementation expands.

The desired final result is concrete: the author points, asks, and keeps working. A fast agent operation uses the same rules as a gesture, applies once against valid current state, reports the actual outcome, and is easy to reverse. The UI stays usable, the compiler keeps its established behavior, and the new platform gains a proven authoring seam without inheriting a premature runtime rewrite.

## Source and evidence map

Current implementation context, as V3 locators at `9ecd481f` (the code itself now lives in V2 under `src/agent-harness/`, see its `PROVENANCE.md`): local bridge (`docs/reference/dictation-bridge.md`), dictation experiment (`docs/reference/dictation-experiment.md`), Show grammar registry (`docs/reference/show-grammar-registry.md`), and vendored V2 dependency (`docs/reference/vendored-v2.md`). These references contain some historical wording; the implementation and pinned reports were used to distinguish current behavior from proposals.

Recorded latency evidence, in V3 only (model transcripts are not committed to V2): baseline run (`experiments/dictation/2026-09-01-r5-baseline/report.md`) and finish-argument run (`experiments/dictation/2026-09-01-r10-finish-argument/report.md`). Waypoint 1 establishes the current baseline; no unverified latency figure is adopted as a target.

Related planning, in V3: original grammar spike PRD (`docs/plans/show-grammar-agent-prd.md`), agent-first product shape (`docs/plans/agent-first-product-shape.md`), and system architecture draft (`docs/plans/system-architecture-draft.md`). Accepted platform decisions: separation (`docs/adr/0001-separate-next-generation-platform.md`), appliance priority (`docs/adr/0002-appliance-first-target-priority.md`), and portability (`docs/adr/0003-pixelblaze-portability-not-compatibility.md`).
