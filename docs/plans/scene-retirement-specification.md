# Scene-free Show implementation specification

This specification governs epic #1032 and its implementation children. It replaces
persisted Scenes with explicit Clip, Layer, Transition, Layout, animation and Group
ownership while preserving supported Show output and ordinary authoring behavior.
The coordinator owns this design; workers implement its contracts and report
counterexamples rather than choosing different product semantics independently.

Status: implementation specification for review, 2026-09-15. Product decisions
below are Jon-accepted; the field extensions and algorithms are the coordinator's
engineering design for those decisions. They require implementation and consumer
proof. This document does not declare production v2 adoption complete.

## 1. Worker entry and authority

Every worker on #1033–#1045 reads this entire specification before editing, then
reads its issue and the applicable current engineering contracts. In its issue
claim, record the specification commit, assigned section/proof rows, and interfaces
consumed from other owners. Every dispatch includes this path and that commit.
The coordinator checks this acknowledgement before accepting a worker candidate.

This is the single current design source. The older
[tracer design](scene-retirement-design.md),
[accepted-decision diary](show-v2-accepted-authoring.md) and
[design assessment](scene-retirement-design-assessment.md) are historical evidence,
not competing instructions. Their provisional rows and blanket gates do not govern
new work. Issues carry progress, assigned scope and proof links; a newly accepted
behavior changes this specification and the receiving issue together.

Current production behavior remains documented in
[command semantics](../reference/contracts/show-command-semantics.md),
[state/history/persistence](../reference/contracts/show-state-history-persistence.md)
and [candidate admission](../reference/contracts/agent-candidate-application.md).
Implementing slices update the relevant as-built contract when the behavior becomes
available. A plan amendment alone never changes those production claims.

### Outcome and limits

- Hardware output remains one portable Pixelblaze Pattern. Compiler sections are
  transient implementation details; authored Scenes, flat cells, Scene-local
  ownership and hidden logical-Clip segments leave normal v2 persistence.
- Preserve existing supported timing, appearance, sampling, runtime identity,
  property activation and Transition variants. Explicit accepted behavior changes
  are Cut-as-absence, removal of Scene-only edit exceptions, Clip-scoped Replace,
  shared-by-default duplication, shared full Pattern Restart, retirement of wholly
  unrouted v1 Pattern placements and the edit policies below.
- Keep independent simultaneous positive Transitions and RL08–RL10 compiler-domain
  expansion deferred to #1045. A required compiler change beyond the accepted
  scope returns to Jon with a minimal counterexample before implementation.
- Preserve v1 file import through an isolated adapter. Activate editor, commands,
  providers and exports together. No automatic migration on read.
- Build no new stock choreography, generic mutation language, one-sided Transition
  stubs, automatic reattachment, or new cross-client conflict protocol.
- Routine edge cases use the explicit refusal rules below. Escalate material
  product/scope conflicts, not every implementation detail.

## 2. Evidence baseline and decision closure

The completed #1034 tracer baseline is local main `3ee10d7cb653e5281ed9d29d66d302b8811cfe63`.
The [measured tracer evidence](show-v2-tracer-evidence.md) and
[47-record report](show-v2-parity-report.json) establish conversion/lowering for
40 stock Shows and seven agent fixtures. All convert, validate and compile. The
bounded Fast/Precise output/state comparison remains exact for 44 records. Three
stock Layout showcases explicitly retire v1 placements whose Zone is absent for
their whole authored interval; the report measures the resulting state/resource
difference from time zero and first visible output difference near 4,000 ms in
both modes. Recipes match for 30 records, generated source for 43, and summaries
for 41; the report explains each difference. Personal authored exports are unavailable.
The bounded [Clip owner](../reference/contracts/show-v2-clip-edits.md) is also landed.
Neither experiment proves complete authoring or production save/import adoption.

`npm run show:v2-parity` reproduces that report on each engine candidate. Changed
schema/report hashes require deliberate regeneration and explanation; a new
refusal or changed source requires classification and semantic evidence. The
census must not shrink to make the comparison pass. At #1040, retain the pinned
legacy inputs independently of the new native stock builder; comparing two
outputs of the rewritten builder is not preservation evidence.

Jon accepted one narrow conversion exception on 2026-09-15: v2 does not preserve
legacy Pattern execution for a placement wholly inside an interval where its Zone
is absent from the active Layout. Conversion records the source placement,
instance, Zone and exact interval as `retired-silent-runtime-use`. Lowering starts
the v2 instance at its first retained contribution and never infers activation
from a future Clip ID, a Layout gap or hidden Clip history. No persisted silent-use
entity or compiler-only runtime carrier is introduced. Later state and output may
differ; the parity report must measure them rather than treating them as exact.

| Former gate | Current policy / remaining implementation |
| --- | --- |
| G0 / P1, P10–P13 | Measured v2 envelope, global milliseconds, sample-remap ownership, lifecycle and sampling accepted. Extensions in §3 are explicit engineering deltas; each lands with schema and owner proof. |
| G1 / P4–P5 | Current supported Transition scope and incoming contribution accepted; Cut is absence; Reset cascade is §5. RL08–RL10 widening is deferred. |
| G2 / P2 | Stable Zone-owned Layers accepted. Reconcile legacy identity/order deterministically; ambiguous conversion refuses without loss. |
| G3 / P3 | One Clip with held appearance keys accepted, including trim/split/extend policies in §6. |
| G4 / P6, P10, P14 | Global storage, ownership-based moves, exact curve restriction and Insert Time accepted; source activation stays explicit. §6–§7 specify the mechanisms. |
| G5 / P7, P11 | Sharing and Restart are separate. New Restart resets the existing shared Pattern instance's clock and Pattern-owned variable/private state at first contribution without creating another runtime; legacy lifecycle conversion stays preserved. |
| G6 / P8, P12 | Groups share runtimes by default; explicit Layer bindings and Zone-valid crossing accepted. Occurrence-local holds are §7. |
| G7 / P9 | Scene names become Markers; equal name/time pairs deduplicate; Markers are optional narrative guides, not playback owners. |

The former gates are no longer unanswered product questions blocking all workers.
Their implementation proof is assigned below. A new counterexample can expose a
bounded feasibility question; a green conversion report cannot waive it.

## 3. Record and identity contract

The source-pinned starting interfaces are
[`showCompositionV2.ts`](../../src/engine/showCompositionV2.ts) and the
[provisional schema](../../schemas/show-record-v2.provisional.schema.json).
Retain their accepted field names unless an extension is enumerated here.
Top-level record/composition versions are 2; output-contract versions are separate.
Times and durations use safe integer milliseconds, with checked addition.
Intervals are half-open. Ordinary intervals have positive duration and fit within
Show End; dormant Markers may exceed it. Identity, not equal text or array position,
defines sharing. Decode rejects unknown fields; edits do not repair malformed input.

| Entity | Authority and references |
| --- | --- |
| Show | `composition.showEndMs` owns loop length; record owns Zones, Layout definitions, Stage Map, output contract, Controller binding, output Effects and import provenance. |
| Layer | Stable `id`, one `zoneId`, name and rank for the entire Show, including empty stretches. Rank zero is bottom. |
| Clip | Stable `id`, `instanceId`, Zone/Layer, global start/duration, sampling, held appearance and entry policy. One Clip remains one authored record across Layout switches. |
| Transition | Positive duration, stable identity, explicit Layer participant pairs or explicit whole-output contributor sets. No persisted Cut. |
| Layout occurrence | Stable occurrence identity, definition reference, global interval, routing parameters and optional incoming transfer. Coverage is exactly `[0, showEndMs)`. |
| Property track | Stable ID, explicit target, activation interval and curve; top-level time is global, definition time is local. |
| Group | Reusable local choreography and Layer slots; occurrence binds runtime/Layer identity, global start, Zone, translation and local holds. |
| Marker | Name/time/color/ID; optional chapter role; never a time partition or execution trigger. |

### Required representation deltas and owners

These deltas are specified now; the provisional executable schema stays unchanged
in this documentation candidate. Implementers update TypeScript, schema, codec and
all affected validators together, then qualify the complete record.

1. **#1035:** exclude `cut` from authored v2 Transition kinds, including Group-local
   Transitions. Keep legacy Cut decoding in conversion. V2 decode rejects a stored
   Cut instead of silently stripping an invalid authored object.
2. **#1037:** retain `entryPolicy: continue | restart` on the Clip, with the new
   full Pattern-reset meaning of restart. No second persisted global event list.
   Derive events from Clip identity and first contribution (§4); legacy conversion
   uses its proved private runtime identities, not newly authored restart flags.
3. **#1037:** property keyframes may carry an outgoing `curveSegment` descriptor:
   `{ baseValue, deltaValue, easing, sourceDurationMs, elapsedOffsetMs }`. Times
   and offsets are integer, source duration positive; values/easing retain existing
   validation. The descriptor describes only the retained interval to the next
   key; its evaluation is §6. It is not hidden key history. The last key has none.
4. **#1038:** Group occurrences gain `holds: { id, localTimeMs, durationMs }[]`,
   default empty. Local positions lie strictly inside definition duration, durations
   are positive, positions unique and ordered; repeated insertion at the same
   local time extends the existing hold. Occurrence duration is derived from
   definition duration plus holds, not independently writable.
5. **#1038:** `layoutOccurrenceId` on a Group is a derived start-time association,
   not an enclosing owner. Explicit edit owners recompute it from global start.
   Decode/validation checks it; validation never repairs it. Spanning checks cover
   every intersected occurrence, not just this association.
6. **#1038:** resolve and preserve effective runtime bindings before cloning a
   Group definition. The existing `instanceBindings` map must keep the same runtime
   IDs after Make Unique. Definition-ID-derived default runtime IDs must not cause
   new runtimes on definition duplication. See §4 for authoritative payload rules.
7. **#1040:** add optional Marker `role: chapter`; conversion marks former Scene
   labels as chapters. When an existing same-name/time Marker absorbs a chapter,
   preserve its ID/color and promote its role. Other Markers remain general-purpose.

No new universal normalizer supplies these changes. Version-aware explicit
conversion and the named edit owner produce valid records; validators observe.

## 4. Pattern runtime and sharing

A Pattern instance owns source reference, controls, private state, clock,
evaluation policy and instance-target animation. Multiple Clips consume it.
The effective instance-use index includes ordinary Clips and all materialized
Group Clip uses, even those currently invisible. A sole user means one Clip use
across the whole Show, not one visible rectangle or one Group definition slot.

Adding a Pattern reuses its sole existing instance by source identity. If several
independent instances exist, the UI requires a selection and commands require an
explicit instance ID. If none exists, creating the first instance is explicit
placement setup. Equal source text is not source identity.

Duplication, Group repetition and Make Group Unique never implicitly create
another runtime. They preserve effective instance IDs and authored Restart flags.
Explicit Make Pattern Independent creates a runtime; Clip-scoped Replace is the
accepted operation that performs independence first when needed (§6). Migration
preserves already-distinct legacy runtimes instead of collapsing them.

Creating a Group from ordinary same-Zone Clips supports only selections that the
existing Group format represents losslessly. Unrepresentable animation activation,
partial Transition chains, whole-output or multi-participant Transitions and
Transition Property ramps refuse atomically: the entire Show stays unchanged,
with no history or save. Group creation never crops animation, approximates a
Transition, manufactures a runtime or widens the format to accept a selection.
The initial occurrence binds one local slot per distinct selected runtime to that
same authoritative runtime ID; instance-, Layout- and Show-owned animation stays
global exactly once. Selected Clip-owned choreography localizes by subtracting
the explicit first-selected-start origin, with no resampling or reauthoring.

Group definitions may retain their local instance slots in the measured envelope.
`instanceBindings` maps slots to effective runtime IDs. When a binding names an
ordinary `composition.patternInstances` entry, that entry is the authoritative
payload; definition-slot source/control copies are not a second writer. For an
unbound definition slot, the existing stable definition-qualified default owns
the payload. Before Make Unique, hoist any such default payload to an explicit
Show instance under the **same effective runtime ID** and bind the new definition
occurrence to it. Existing unbound occurrences resolving that ID consume the same
authoritative payload. Hoisting creates a record, not a new runtime identity.
Reject genuine same-ID incompatible payload claims at import; do not silently
choose whichever occurrence materializes first. #1038 updates `groupRuntimeBindings`
and materialization to enforce this authority; dependency remapping visits both
slot references and explicit Show instances.

### Restart

Restart is an authored Clip-entry instruction. It triggers at first contribution:
nominal Clip start without an incoming Transition, the incoming contribution
window start otherwise. Moving/deleting the Clip moves/removes its instruction;
attaching/resizing a Transition can move the trigger. All sharing users observe
the reset. The existing shared Pattern instance's elapsed clocks and admitted
Pattern-owned scalar state return to values captured once after member declarations
initialize and before any callback executes. The baseline belongs to the effective
instance, uses collision-safe private names and is never recaptured. Authored
instance controls and adaptations remain external bindings and are reapplied; no
new runtime is created and no private-state schema is persisted. Continue/private
legacy Restart conversion remains a separate axis.

Derive each event by `(effective instance ID, materialized Clip ID, entry time)`.
For one instance, coalesce simultaneous resets into one reset; this changes no
state beyond the same full reset. At each event boundary: advance the preceding
interval under the existing policy, apply the reset, then evaluate the following
interval. A reset at zero executes once on entry, not on every frame or held
Group-local time. Positive frame deltas crossing an event must honor its boundary.
Split retains the original instruction on the left and sets the new right to
Continue. Duplicate copies it. Loop crossing triggers the next loop's entries;
respect existing Show `continuous`/`deterministic-loop` semantics independently.
A Restart-enabled member uses the captured baseline at deterministic loop reset,
so loop start and later authored Restart share one cold baseline. A member with no
Restart keeps legacy initializer replay and emitted output.
Cold seek replays from the appropriate existing baseline through the same events.
Reopening does not promise saved private memory or persistent Undo history.

#1037 owns event derivation, replay and the emitted full-reset seam. The lowerer
derives transient compiler events from authored Clips; no independent event list
is persisted. Qualify a stateful shared-instance fixture through generated `.epe`
output. A dedicated fail-closed Restart planner covers the bundled source,
including Libraries, and the final transformed member. It captures admitted
mutable scalar bindings and combines them with explicit elapsed-clock,
stepped-clock and coordinate-transform reset actions. Ordinary placement setup
then reapplies current authored controls and adaptations.

The initial source domain refuses implicit persistent bindings, array/object or
closure state, writes to resolved top-level function bindings, async/generator
functions, first-class functions, dynamic calls, unsupported syntax and unknown
runtime facilities. Lexically resolved parameter, block or local shadows do not
disqualify an otherwise resettable Pattern; ordinary unreassigned functions remain
accepted. Persistent palette, member-owned freeze/refresh and unsupported capture
facilities refuse. Runtime `random()` retains the shared environmental generator;
Restart does not rewind it.

Output reuse recomputes after scheduler execution. A Transition snapshot belongs
to that Transition and intentionally retains its captured image while the live
member restarts. Baseline variables count against the existing 256-persistent-
global limit and never bypass the resource ledger. Public preparation compiles the
same bundled/transformed path used by final emission and returns a typed
`unsupported-restart` refusal when any obligation is incomplete.

### Shared animation

One active authored animation owner per effective instance target. Several Clips
may consume one track; distinct tracks cannot have overlapping activation on the
same instance control or time-scale target, even if instantaneous values match.
Half-open adjacency is permitted. Materialize Group targets before checking.
Refuse conflicting edits atomically, identify target/track IDs, and retain the
preimage. No last-writer rule or implicit independence resolves a collision.
Clip-owned appearance tracks remain independent.

## 5. Transition edit contract

Layer participant pairs join outgoing/incoming Clips on one Zone and Layer. Their
positive duration fills the interval from outgoing end to incoming nominal start.
Whole-output scope retains explicit unequal contributor sets and a global window;
never invent pairwise equivalence for a converted whole-output boundary.
Contribution bounds come from preparation semantics, not Clip rectangles alone.

A Cut is the absence of a Transition at **exact** adjacency of two Clips on one
Zone/Layer: `outgoing.endMs === incoming.startMs`. A 1 ms gap is blank time.
The projection offers a selectable derived Cut junction; pointer hit-testing may
use pixels, but storage/domain equality has no tolerance. Removing a Transition
leaves no dormant effect object that can resurrect on re-add.

### Affected-set algorithms

Build the connected graph from explicit participant endpoints/contributor sets.
For rigid move, traverse the whole connected component. For downstream ripple,
traverse outgoing directed connections from the selected incoming contributors.
At a whole-output hyperedge, include all contributors needed to retain its common
window; conflicting movement demands refuse rather than splitting that owner.
Use ID sets so a converging chain moves each Clip once. Compute every delta from
the preimage, then validate one complete candidate. Cycles/inconsistent endpoint
constraints refuse as invalid topology.

| Operation | Exact behavior |
| --- | --- |
| Insert | At an eligible exact junction, create positive Transition identity and ripple incoming connected content later by duration. Preserve outgoing timing. Collision, Show End, Zone and compiler eligibility must hold; do not silently extend Show End. |
| Change kind/parameters | Keep ID, endpoints, duration and times; validate configuration/source/capability requirements. |
| Change duration | Apply new-minus-old duration once to the incoming/downstream affected set. Preserve outgoing timing and unrelated content. |
| Connected move | Translate the full connected component rigidly to the requested Clip position; preserve relative offsets and Transition identity/settings. Refuse incompatible Zone/Layer destinations. |
| Trailing resize | Change the selected outgoing end and ripple connected successors by the end delta while preserving Transition duration. Apply the Clip appearance/curve retention rules to the resized interval. |
| Leading resize | Keep the selected Clip's end fixed. At an incoming Transition, changing its start changes incoming duration by the same delta while the outgoing end stays fixed. A zero result delegates to Reset; negative duration refuses. Update whole-output contributor consistency atomically or refuse. |
| Reset to Cut | Delete the Transition and move all incoming contributors and connected successors earlier by its duration. Outgoing and unrelated Clips stay fixed; Show End, Markers, Layout and Show-wide animation stay fixed. |
| Delete Clip | Remove its tracks and affected Transition records; remove an entire whole-output record if a named contributor is deleted. Keep surviving Clip positions and Show End fixed. The vacated window is visible blank time. |

Animation movement follows §6, including shared-instance tracks remaining fixed.
Reset near a Layout switch refuses if the moved content's Zone is unavailable;
it never moves routing implicitly. A zero-duration manual resize uses the same
Reset owner. Delete/re-add yields a plain Cut only when the resulting Clips are
exactly adjacent; adding elsewhere leaves a gap.

Retire Scene-only manual drag boundary-removal and leading-resize break-to-Cut
exceptions. Manual and canonical adapters consume this policy; no branch refers
to `afterSceneId`, segmented logical IDs or Scene-local offsets. v1 owners remain
available for production until coordinated cutover, then leave normal authoring.

### Compiler restrictions versus adapter gaps

The measured ledger in the tracer evidence distinguishes domain integrity from
scheduler restrictions. RL08 (Fade/Motion unrelated contribution), RL09 (window
edge scheduling), RL10 (independent overlapping positive windows) remain bounded
compiler refusals. RL11 mixed scope, multi-key appearance plus Transitions, and
Layout/Layer combinations in the v2 adapter require owner proof; an adapter guard
alone does not establish a compiler limit. Previously supported legacy edits
remain an obligation. If one cannot be preserved, report the smallest source,
edit and generated-output counterexample before narrowing scope.

## 6. Clip appearance, animation and replacement

Held appearance keys own complete values without owning time partitions or
instances. Selected-time edits hold until the next key; whole-Clip application is
explicit. Selected-time appearance edits require a time in the Clip's nominal
`[startMs, startMs + durationMs)` interval; exact end and outside-bar Transition
contribution times refuse atomically. They never map to another key time or expand
the key interval. Whole-Clip application remains available. Legal first/last keys
still own their inherited incoming/outgoing contribution. Jon accepted this
boundary on 2026-09-16. Move translates Clip and held keys. Trim drops excluded
keys and seeds
the new start from its retained held value. Extend holds the nearest remaining
value; it never restores discarded keys. Split creates a right Clip with retained
appearance and the same instance, retaining left identity and incoming endpoints;
outgoing endpoints retarget to the right. Neither piece silently restarts.

### Animation time and exact restriction

Top-level activation/keyframes use global time. Group definitions use local time.
A track has effect only in `[activeStartMs, activeStartMs + activeDurationMs)`;
key extrema do not define activation. Within activation, first/last values hold
outside the key range. Effect identity/kind/parameter must exist in every
appearance span intersecting activation. Independent source intervals stay
separate rather than accidentally interpolating across an inactive gap.

| Edit | Clip targets | Instance targets | Layout/Show targets |
| --- | --- | --- | --- |
| Move Clip/component | Shift each moved Clip's keys and activation once | Shift only when the instance has one Clip user in the preimage and that Clip moves; otherwise fixed | Fixed |
| Trim/extend | Restrict exactly / hold retained boundary | Restrict/extend only for sole user; shared tracks remain unchanged | Fixed |
| Split | Partition exact curve and activation; retarget right portion | Preserve the same instance track and global timing; splitting creates two users, not two tracks | Fixed |
| Duplicate | Copy/retarget Clip tracks by placement delta | Reuse shared tracks; explicit independence copies them according to requested placement | Fixed |
| Insert Time | Apply §7 once | Apply global time mapping once per track, regardless of user count | Apply §7 once to affected global animation |

The nine target forms remain instance time-scale/control, Clip opacity/view/
Transform/Aperture/Effect, Layout split-position and Show repeat-scale. Discrete
presentation/Aperture-shape fields remain held appearance, not new numeric targets.

An edit requiring a hold, restriction or projection of animated Show repeat-scale
refuses atomically when its complete original source curve is outside the existing
1–8 range. This includes retained descriptor source endpoints/coefficients and
easing extrema, even when retained sampled values are inside. Exact boundary
values 1 and 8 are admitted. Existing decode/playback and unrelated, dormant or
whole-source-shift edits retain their existing semantics; this is an edit-local
refusal, not broader persisted admission. Jon accepted this bounded range policy
on 2026-09-16.

A boundary-only sampled value cannot preserve a nonlinear curve. For each
retained interval between keys, `curveSegment` in §3 evaluates:

```text
u = (elapsedOffsetMs + (t - leftKey.timeMs)) / sourceDurationMs
value = baseValue + deltaValue * easing(u)
```

For an uncut source segment, base is left value, delta is right-minus-left,
sourceDuration is the original key distance and offset is zero. Restriction
increments the offset by removed time and limits the retained interval; repeated
restriction composes the offset instead of wrapping descriptors recursively.
Keep the source kernel for quadratic/cubic/sine/Bezier/back/steps/hold alike.
No normalization by endpoint-value difference is allowed: equal endpoint values
can enclose a nonconstant curve. The right key owns the exact boundary value;
the outgoing descriptor owns only the half-open interior. Discontinuities retain
the existing evaluator's right-boundary choice.

Discard excluded keys/intervals. The descriptor retains mathematical coefficients
needed to evaluate the surviving curve, not removed key IDs or recoverable time
ranges. Extension adds a constant segment; Undo restores removed authored data.
Editing an endpoint/curve explicitly reauthors the adjacent segment and replaces
its restriction descriptor with the newly requested ordinary curve. Validate
finite coefficients, positive source duration, and the retained source range.
The evaluator and emitter must share this contract; precise-mode rounding/order
must be measured, not replaced with an unexplained tolerance or sample fit.

Property-only boundary carriers become independently activated tracks. Explicit
Transition `propertyRamps` that remain in converted v2 records must be projected
into tracks before deleting/resetting their carrier; retain values, easing,
activation and accepted time mapping. They must not disappear with the visual
record. #1037 supplies this projection for #1035; derived compiler ramps may remain.

### Replace Pattern and independence

`replaceClipPattern(record, clipId, patternReference, metadata)` changes the selected
Clip only. Resolve authoritative incoming Pattern exports before proposing an edit.
If its instance has other users, first create an independent instance for that
Clip, copy instance values/tracks, then replace its Pattern. Keep compatible public
slider controls and instance-control tracks; report/drop incompatible controls.
Keep instance time-scale tracks and unrelated Clip appearance tracks. Preserve
Clip/Transition IDs and Transition settings. A source change invalidates
`executionModel` under the current source-change policy; v2 preparation must map
that invalidation to the explicit continuous lifecycle rather than omit a required
field. Preview/admission metadata also invalidates through the existing boundary.

For an ordinary Clip, refuse Replace if dropping an incompatible effective
instance-control track would alter Group-owned choreography outside that Clip's
edit scope. This includes a sole ordinary Clip animated by an unused Group slot
whose shared definition also animates another runtime. Return the original record
and identify the conflicting control and Group owner. Do not create a runtime
silently, mutate the shared Group, or disable its animation to accept replacement.

Other users retain their instance ID, controls, tracks and compiled logical member.
Inside a Group definition, replacement affects linked occurrences; Make Group
Unique first to select one occurrence. Then Clip replacement still applies the
sharing test across effective uses and performs its explicit independence step.

For definition-local Replace, preserve the equivalence of selected linked uses:
one destination per distinct source runtime. A sole effective use retains that
runtime; a shared source requires one explicit fresh destination shared by its
selected uses, even if all its uses are selected. Different source runtimes never
coalesce. Split the local slot explicitly only when another local Clip uses it or
preserving original Group-owned animation requires a separate slot. Refuse mixed
or foreign incompatible Group animation that cannot be pruned without changing
unrelated users; do not mutate those owners or fork silently.

With no linked occurrences, edit the selected local template and eligible local
tracks without creating or modifying top-level runtimes. A shared local slot needs
an explicit fresh slot and complete fresh local track/key identities. Split also
when its derived default runtime already has top-level authority: preserve that
payload, require the new slot's derived default runtime to be globally unused,
and let a later default-bound occurrence resolve the new template. No implicit
runtime allocation or Group duplication occurs in dormant replacement.

Try with Pattern and lesson slot pickers retain their instance-level swaps.
Required animation-loss confirmation remains at the adapter; cancellation adopts
nothing. The pure owner reports loss rather than opening UI.

`replace_clip_pattern` in #1041 takes explicit `clipId` and the existing structured
Pattern reference; dependency metadata comes from the trusted source resolver,
not command arguments. Group-definition editing uses the existing explicit
Group-edit target context, never a guessed occurrence from selection. Return the
same affected-entity result as the manual owner and register actual touch paths.
Make Independent copies controls and eligible tracks to a fresh instance; Rejoin
requires an explicit existing target instance and uses that instance's state and
tracks, with no implicit animation merge. Collect orphan instances only after
all ordinary/Group/track references are removed.

## 7. Insert Time and Group-local holds

For insertion at `p` of positive duration `d`, define global authored-time mapping
`F(t) = t` for `t < p`, otherwise `t + d`. Show End increases by `d`. Positions
at `p` shift right; content ending at `p` stays left; content strictly spanning
`p` extends. Check integer overflow before forming a candidate.

- Shift later Clips, Group starts, Markers (including dormant ones), Layout
  switches and derived entry events. Extend a crossing Clip, keeping one identity.
- For a track active strictly across `p`, evaluate its original value at `p`
  using the existing right-boundary rule. Keep the preceding curve unchanged up
  to `p`, create a fresh hold key at `p`, and move the original key at `p` (or
  create the split resume key) to `p + d`. The hold key owns a constant segment
  over `[p, p + d)`; the resume key owns the original outgoing curve/retained
  descriptor. Thus an exact-boundary key, including a discontinuity or the last
  key of a still-active track, holds its right-boundary value without stretching
  the preceding easing or evaluating a descriptor beyond its retained domain.
  Shift later keys and activation bounds. If a track starts at `p`, shift it
  without adding a hold; if it ends at `p`, retain its exclusive end. Transform
  shared-instance tracks once, not per Clip.
- For held appearance on a Clip strictly spanning `p`, likewise seed a fresh key
  at `p` with the original value at `p`, and move an original key at `p` to
  `p + d`; later keys shift. The original authored key keeps its ID on the right.
  This matches Group-local holds at an exact key boundary; Group materialization
  derives hold/resume keys without changing the shared definition. A Clip starting
  at `p` only shifts, and a Clip ending at `p` only retains its original end.
- Preserve Layout coverage: extend the occurrence immediately before a switch at
  `p`, shift that switch right, and leave explicit definition identity intact.
  At `p = 0`, retain first occurrence start zero and extend it. Parameter-only
  edits do not manufacture occurrences. Shift source contribution overrides with
  their explicit global owners; they are not fixed legacy Scene offsets.
- Refuse insertion strictly inside a visual Transition or timed Layout transfer,
  including a Group-local Transition after materialization. At a window endpoint,
  apply the mapping and validate the complete unchanged-duration window; refuse
  if participant/routing attachment cannot remain valid. Do not guess a new effect.
- Pattern execution policy/state is untouched. During added playback it evolves
  normally; time-scale zero or explicit Freeze retains its existing behavior.
  Later private state/output need not equal the unextended Show.

### Occurrence hold mapping

A Group's definition-local duration is `D`. Ordered holds `(h_i, d_i)` define local
time advancing at unit rate with a pause at each `h_i`. The occurrence duration
is `D + sum(d_i)`. For a local boundary `x`:

```text
before(x) = occurrence.startMs + x + sum(d_i where h_i < x)
after(x)  = occurrence.startMs + x + sum(d_i where h_i <= x)
```

A hold at `h` occupies `[before(h), after(h))`. During that interval, local time is
`h`; outside holds the inverse mapping advances one local millisecond per global
millisecond. A child ending at `h` ends at `before(h)`; a child starting at `h`
starts at `after(h)`; a child strictly spanning `h` continues through the hold.
Use the same side convention for half-open track activation. The held appearance
of a spanning child uses the value at `h`; later events at that boundary resume
on the right. A Restart tied to a shifted child entry fires once at actual first
contribution; a hold never retriggers it each frame.

Insert inside an existing hold extends its duration; insert elsewhere in a
crossing occurrence maps the global insertion time to a local position and adds
or extends that hold. Multiple occurrences crossing the global insertion each
receive their own hold. Later occurrences only move. Internal Transition windows
still refuse; ordinary gaps may lengthen without inventing content. Shared
instance-target conflicts refuse under §4.

Example: Group occurrences `[0,10000)` and `[20000,30000)`, insert 2000 at 5000.
The first becomes `[0,12000)` with a local 5000 hold during global `[5000,7000)`;
the second moves to `[22000,32000)`. Definition and runtime IDs remain unchanged.
Move/duplicate of an occurrence preserves its local hold list. Make Unique
preserves the list and runtime bindings. Ungroup materializes the mapped Clip,
track, Transition and Restart ownership into ordinary v2 content without cloning
runtimes. Definition edits recompute every occurrence duration/collision/Zone
constraint atomically; invalidating one linked occurrence refuses the edit.

Insert Time holds obey the animated repeat-scale source-range refusal in §6.
Refusal returns the original record with empty affected collections before adoption;
whole-source shifts do not inspect unrelated dormant animation.

## 8. Layers, Layout occurrences, Show End and Markers

Every Layer belongs to one Zone and retains stable name/rank through empty time.
Layer reorder changes stacking, not Clip IDs or Group bindings. Remove only an
empty, unreferenced Layer or through an explicit complete reassignment intent.
Group bindings name destination Layer IDs, never numeric offsets. Ambiguous
placement requires an explicit destination choice. Materialize Group content for
collision checks; ordinary and Group Clips share the same Layer occupancy rules.

Layout occurrences cover the Show once with ordered starts, first at zero.
A switch edit changes the boundary and neighboring durations, not unrelated
Clips, Markers, Transitions or Show-wide tracks. Repeated occurrences can share
one Layout definition. Make Layout Unique clones only that definition identity.
Occurrence-owned split-position tracks retain global times when a switch moves;
if their activation leaves the owning interval, refuse rather than crop them
silently. Removing an occurrence with meaningful tracks/transfer requires explicit
resolution; plain removal extends its predecessor (or promotes the next to zero).

An incoming transfer belongs to its destination occurrence, references its source
occurrence and begins at the destination start for its positive duration. Preserve
measured zero/timed transfer semantics, direction and easing; zero duration is a
switch without a timed transfer object. A transfer must fit the participating
occurrences' valid routing domain and Show End; overlap or unattached boundaries
refuse. Rebind source IDs explicitly after an accepted neighboring occurrence edit.

A Clip or Group may span Layout switches only if its Zone exists throughout its
complete contribution interval, including Transition pre-roll/outgoing contribution.
No implicit reroute or Restart occurs. Disappear/reappear requires distinct Clips
sharing the instance; a continuously authored Clip cannot hide an unavailable Zone.
Lowering may slice transiently and must preserve runtime/sampling identity.

During v1 conversion, a placement whose Zone is unavailable for its complete
authored interval is retired and reported. It does not create a Clip, extend a
neighbor, or keep its Pattern instance running. A later visible Clip may retain
the same effective instance identity, but its runtime begins at that first retained
contribution. Layout switch, Show End, Clip delete/move/duplicate and Replace edits
therefore operate only on explicit retained v2 entities.

Set Show End is exact: an invalid shortening refuses, with no silent content cut
or clamp in the command owner. Protect Clip/Group contribution ends, meaningful
track activation, positive visual/transfer windows and routed content. Remove
empty Layout occurrences starting at/after an accepted new end and truncate the
last coverage interval. A removed occurrence with meaningful tracks/transfer
makes shortening invalid until explicitly resolved. Markers remain dormant beyond
Show End. Extending stretches final Layout coverage and leaves authored content
unchanged. Undo restores the complete prior record.

Former Scene labels become chapter Markers at original global starts; identical
name/time pairs deduplicate without losing a pre-existing Marker ID. Conversion
records `origin: 'converted-scene-label'` only on newly created Scene-label
Markers; an absorbed existing authored Marker does not acquire that origin.
The existing editor timeline omits those conversion-origin Markers, preserving
its v1 visible guides; chapter consumers still include them by role. Missing
origin remains visible and is never guessed from names or IDs. This explicit
provenance extension was approved for #1065 to preserve exact editor UX. General
Markers do not accidentally become Gallery/Live chapters. Chapter projection uses
`role: chapter`, then deterministic `(timeMs, id)` ordering; equal-time chapters
remain individually selectable. No chapter at a time means no synthetic Scene
label. Authors can hide Markers together; playback remains unchanged.

Jon also approved two conversion-provenance additions for #1065 on 2026-09-17:
Transition family (`converted-boundary-transition` or
`converted-layer-transition`) and `incomingSwitch` identity/settings for a
converted zero-duration routing cut. They let the existing editor retain its
original inspectors without restoring Scenes. A cut still has no timed transfer;
compilation and playback ignore the metadata. Existing Layout edit outcomes must
remain unchanged: discard provenance when its boundary disappears rather than
refusing an otherwise valid edit or inventing a new source relationship. The
[conversion-provenance contract](../reference/contracts/show-v2-conversion-provenance.md)
owns the exact shapes, persistence rules and command restrictions.

For #1065 editor equivalence, Jon approved separately proving truthful exported
source-size values and independently demonstrated browser raster noise on
2026-09-17. These are proof-method exceptions, not permission to change UX.
Retain raw captures and differences, require matching geometry/styles, and
require unchanged control evidence for any raster classification. Arbitrary
small-pixel tolerances and masks are not allowed. The
[tracer plan](show-editor-v2-tracer-plan.md#proof-and-delivery) owns the proof
procedure; unsupported differences remain failures.

## 9. Pure edit and adoption boundary

Owners receive immutable preimage, explicit intent, and trusted dependency metadata
when needed. Return a complete unaliased candidate on change, original identity
on no-op/refusal, and affected IDs. No owner writes a store, file, clock or provider.

Use the existing `ShowClipEditResultV2` shape for current callers; extend affected
results to cover instances, Transitions, tracks, Layouts, Groups, Layers, Markers,
removed IDs and discarded control targets. Callers must distinguish requested
scope from affected scope; a result does not imply successful persistence.
Validate intent, build the explicit cascade on a private candidate, validate
structure/references/time/ownership, resolve dependencies and compile eligibility,
then return changed/no-op/refused. Never make validator calls move or remove data.
Qualified existing admission semantics remain separate from this pure pipeline.

At adoption, recheck revision/session/dependency eligibility and atomically publish
one candidate and one history entry; the ordinary save queue then settles it.
Refusal/no-op creates no timestamp/history/save. Source replacement invalidates
metadata as before. Preserve rollback/supersession, stale/duplicate request rules,
missing-source baseline, private-candidate isolation and cancellation. Schema,
domain, dependencies, compiler eligibility and revision admission are distinct
checks, not one permissive normalize-and-accept function.

Final-content deletion may leave an empty Show. It remains editable and saveable;
preview and export are unavailable until content is added. Admission explicitly
validates the complete empty-content record and effective Clip count; it never
bypasses arbitrary compiler refusals or creates a placeholder runtime.

## 10. Conversion, pilot and cutover

Conversion inventories source leaves and preserves payload or reports explicit
retirement/refusal. Flat sampling (`independent | span | repeat`), divergent
appearance, private legacy instances, property activation, Layout scalar carriers,
Groups and execution lifecycle follow the measured converter. Preserve identity
mappings for source/render comparison. Unknown fields, dependencies or unsupported
valid forms remain recoverable; no silent best-effort flattening.

The explicit exception is a v1 placement fully unrouted because its Zone is absent
for the entire placement interval. Account every such source leaf as
`retired-silent-runtime-use`; include its placement/instance/Zone/interval provenance;
emit no hidden activation record or inferred lowering carrier. Partial routed
intervals still become visible Clip runs with their original effective instance
identity and timing. The parity harness accepts a resulting mismatch only when the
conversion report supplies that provenance, the first mismatch is at or after the
first retired interval, and the first differing exported state belongs to a retired
instance or the compiler's empty routed member. Every other record remains exact.

#1044 builds one opt-in real-route qualification path through shared production
adapters. It reads v1, explicitly converts, invokes #1035, previews, saves a
version-discriminated v2 record, undoes/redoes, reloads and reopens `.pxlshow` and
`.epe`. It is not a second store/history/save implementation. Start after #1035;
Layout/animation route extensions follow their owner availability. Production
remains v1 until #1039. Use an isolated issue runtime for API/schema changes.

Version-aware writers never send v2 to a v1 normalizer. Readers decode v1 or v2
without rewriting rows. File import resolves dependencies before writes: include
ordinary instances, Group slots/explicit runtime bindings, Libraries and Maps;
reuse matching identities and remap conflicts consistently. Export v2 after
activation, retain ordinary v1 import. Existing imported provenance stays private
where source data is private.

The migration runbook inventories actual D1 rows, snapshots originals, records
per-row source hash/version and outcome, converts/validates in memory, writes
explicit v2, then reads back/reopens/compiles. Already-v2 rows are idempotent
no-ops. An interrupted pass resumes from per-row outcomes; changed originals are
rechecked before write. Failed rows remain recoverable and reported. Rehearse
rollback on a disposable database. Personal exported files are unavailable;
synthetic fixtures cannot be labeled personal compatibility evidence.

#1040 prepares native v2 stock and chapter projections; #1041 prepares commands,
grammar, resources/admission and MCP. #1039 activates these together with the
editor/providers, then performs the rehearsed row conversion and readback.
No production window may accept v2 in the editor while commands assume v1.
Default fresh Shows retain current two-Clip/two-sided Crossfade behavior.

#1042 first removes normal-authoring legacy owners, keeping compiler sections and
v1 import adapters. Separately verify every migrated row and restore rehearsal,
then retire legacy columns with a numbered migration chosen against current main.
#1043 finishes the reference and bounded product-string sweep. #1045 is Jon's
post-migration interaction decision, not authorization for a redesign now.

## 11. Work allocation and integration order

One coordinator owns interface changes and serialized landing. Parallel workers
use the same specification revision; shared-file edits are assigned before launch.
The first worker needing a §3 schema extension lands that bounded schema/owner
candidate; the other rebases before integrating it. Cross-owner integration tests
can land later in the named integration issue; they do not block independent starts.
No worker changes a neighbor's contract silently to make its own tests pass.

| Issue | Main files / responsibility | Depends on / completion boundary |
| --- | --- | --- |
| #1033 | This specification, historical pointers, issue handoffs, AGENTS entry | Step zero; Fable review, then readiness record |
| #1035 | New `src/engine/showTransitionsV2.ts`; `showCompositionV2.ts`, v2 schema, `showCompositionLoweringV2.ts`; §5 | Starts independently; §6 carrier projection consumes #1037 when needed |
| #1036 | New `src/engine/showLayoutIntervalsV2.ts`; lowering and Group availability; §8 | Starts independently; supplies interval owner to #1037 |
| #1037 | New `src/engine/showPropertyAnimationV2.ts`, Restart-event helper; `showEasing.ts`, lowering, schema and transient compiler event seam; §4/§6 | Starts non-Layout targets independently; Layout binding follows #1036; generated shared-runtime reset proof required |
| #1044 | `src/cloudflare/shows.ts`, providers, `showFileBundle.ts`, `showImportPlan.ts`, store/editor opt-in adapters; §9–§10 | First route after #1035; expand with #1036/#1037; no default switch |
| #1038 | `showClipsV2.ts`, new `showTimelineV2.ts`, `showGroupsV2.ts`, Layer/inspector/timeline adapters; §4/§6–§8 | Full integration after #1035–#1037 and #1044; appearance foundation already landed |
| #1040 | `src/pixelblaze/stock/shows.ts`, chapter projections, pinned stock parity inputs | After #1038; native v2 prepared without activation |
| #1041 | `src/engine/showCommands/`, `src/agent-harness/`, schemas, MCP/admission resources | After #1038; `replace_clip_pattern` plus accepted Restart action; real pilot MCP proof |
| #1039 | Show store/editor, providers/fresh/native stock, production MCP, migration procedure | After #1044/#1038/#1040/#1041; deployed route/MCP and per-row evidence |
| #1042 | Legacy authoring imports/modules, then storage migration | After #1039; separate code/storage milestones |
| #1043 | CONTEXT, Feature/Technical references, contracts, diagram and string guard | After #1042; current public vocabulary and behavior |
| #1045 | Running editor comparison, restriction ledger, Jon's decision | After #1043; no automatic implementation |

At most two implementation workers may run under Jon's Astralite authorization;
read the execution policy and name exact model/effort at launch. This specification
candidate uses Jon-requested `claude-fable-5-1` / `high` review without fallback.
That request does not replace the Astra Medium review direction for later engine
candidates. No product worker starts merely because this draft exists.

## 12. Required proof by behavior

Each row specifies an oracle, not just a test-file count. Pure-owner tests assert
immutable input, complete valid output, correct references/affected set, and
accepted/refused classification. Public-boundary fixtures compile and reopen
artifacts; route cases additionally assert history/save/admission behavior.
Use source-pinned legacy comparisons where preservation is promised and an
independently authored expected result for intentional new behavior.

| ID | Required sequence / partitions | Owner and consumer evidence |
| --- | --- | --- |
| MODEL | Decode valid v2 / stored Cut / duplicate IDs / unsafe time / unknown field; exact adjacency vs 1 ms gap | #1035/#1041; codec, schema, derived junction and immutable refusal |
| TRANSITION | Insert → move → resize → Reset across Main/overlay, one/multiple Zones, all supported kinds, live/live and snapshot/live | #1035; exact affected timing/settings, reopened artifact and Fast/Precise |
| DELETE-READD | Fresh two-Clip Show → delete second → add replacement at boundary | #1035/#1039; no resurrected effect, first Clip/Show End unchanged; visible gap/Cut according to exact placement |
| V2-EDIT-WHOLE-OUTPUT | Convert unequal contributor sets → duration edit → connected move → Reset; converging chains; coincident Layout switch | #1035; each moved once, unrelated owners fixed, Zone/collision refusal atomic |
| V2-EDIT-DIVERGENT-TRANSITION | Convert multi-key Clip → insert/edit Transition; key interior/boundary and pre-roll | #1035 with #1037; post-edit artifact/output and retained appearance |
| V2-EDIT-LAYOUT-TRANSITION | Convert → insert/move switch with Layer Transition elsewhere, then at start/interior/end | #1036; exact routing/state, available/disappearing Zone, classify adapter versus compiler gap |
| CURVE | Move → trim → extend → split → reopen; each easing family, equal endpoint/nonconstant interior, steps/hold discontinuities | #1037; evaluator and emitted Fast/Precise values at boundaries ±1 ms/interiors; no discarded-key restoration |
| ACTIVATION | Incoming/outgoing contribution; inactive gap; Effect absent at exclusive end then re-added; property-only carrier Reset | #1037; target activation and values retained without a visual carrier |
| SHARING | Plain duplicate, Group repeat, Make Group Unique, explicit independence and Rejoin | #1038; effective runtime IDs/count and controls/tracks; shared instance advances once per frame |
| RESTART | Shared visible users → entry reset → incoming Transition attach/resize → move/split/delete → duplicate → loop/seek; ordinary function, reassigned function binding and shadowed-local partitions | #1037/#1038; same runtime, full clock and Pattern-owned state reset at contribution, authored controls reapplied, no right-split or held-time retrigger; exact refusal when function state cannot be restored; generated `.epe` replay |
| REPLACE | Shared/unshared Clip and Group definition/unique occurrence → replace → Undo/Redo → reopen | #1038/#1041; other users' instance/control/track/logical compiled member unchanged, selected Transition identity stable; eligible metadata pruning |
| INSERT | Insert through static/animated Clip, exact property/appearance key (including discontinuity/last active key), shared track, zero scale/Freeze, gap, Layout boundary, visual/transfer interior | #1037/#1038; exact authored hold/resume, normal runtime evolution; no implicit clone/reset; typed refusal |
| GROUP-HOLD | Two occurrences example in §7; repeat insertion inside hold; move/duplicate/unique/ungroup; internal Transition and shared-animation conflict | #1038; mapped choreography, unchanged definition/runtime identities, reopened artifact and immutable refusal |
| LAYOUT-END | Repeated Layout definition → Make Unique → switch move/remove → shorten/extend Show End → Undo | #1036/#1038; coverage, transfer/track protection, Clip/Group continuity, dormant Markers |
| LAYERS | Empty named Layer → reorder → Group bind → remove/reassign | #1038; stable IDs/stacking, explicit ambiguity and materialized collision refusal |
| CHAPTERS | No chapter / converted Scene label / same-name-time Marker / general Marker / equal-time chapters | #1040; Gallery/Live and timeline projection, unchanged playback |
| PARITY | All 47 legacy records and later native stock counterparts; initial true gap → wholly unrouted use → retained visible use → disconnected gap in both lowering routes | Every engine owner; all 47 convert/compile with complete accounting; exact Fast/Precise output/state for unaffected records; source-accounted retired intervals plus first state/output mismatch and maximum sampled frame delta for accepted differences; no inferred carrier before authored use |
| ROUTE | v1 flat/composition or v2 → edit → Undo/Redo → save → reload → export/import | #1044/#1039; committed browser proof, provider readback, ordinary `.pxlshow` v1/v2 and `.epe` reopen |
| FAILURE | Missing dependency, invalid/stale/duplicate candidate; failed/superseded save; interrupted conversion/retry | #1044/#1041/#1039; original recoverable, no partial adoption, existing rollback and idempotency |
| MCP | #1029 sequence: Layers/Clips → remove content → exact 30000 ms end → tracks → commit → outcome → reopen | #1041 pilot, #1039 deployed actual tip; manual/command parity, descriptors/grammar/touches/resources |
| RETIRE | Post-cutover legacy import plus native save/export; per-row restore rehearsal; bounded Scene-string inventory | #1042/#1043; retained behavioral tests, verified row/column retirement, product diagnostics mapped |

Fault sensitivity targets the changed high-risk seams: wrong ripple set/double
shift, Restart failing to clear private state, preserving a reassigned function binding or clearing authored controls, duplicate runtime minting, curve
boundary-only approximation, activation leakage, hold retrigger and source-lookup
remap loss. Use focused mutation qualification where repository policy calls for
it. Do not expand a costly suite merely to increase counts.

The existing parity harness's limits remain explicit: eight map points, deterministic
16 ms stepping split at probes, exported scalar state rather than arbitrary hidden
arrays, bounded seek and two-loop comparisons. These are not universal timestep,
map or hardware-performance claims. New Restart/curve/hold proof includes dedicated
stateful fixtures and both runtime modes; measure arithmetic differences explicitly.
The silent-runtime fixture additionally covers continuous-flat and global-section
lowering, an initial gap, a later retired interval, visible reuse of the same
instance and a disconnected gap. It asserts that no generated recipe Clip uses a
runtime-carrier identity and that state stops advancing in the disconnected gap.

## 13. Delivery and completion

A worker's handoff links its issue, this specification revision, changed contract,
focused results, and outstanding proof. The coordinator verifies that no accepted
behavior was silently narrowed and integrates combined-owner rows before cutover.
Engine readiness is not production adoption; review approval is not deployment.

Follow the repository's [verification guide](../agents/verification.md): focused
checks during development, authoritative committed-tip suites before landing,
exact-range native review, and immediate fast-forward of the approved tip. UI
candidates require committed browser proof. Carry repairable findings to resolution
within scope; feasibility or security denials return to Jon under existing policy.

Step zero completes when this specification has substantive review, conflicting
historical documents point here, every child has its reading/section/proof handoff,
and the reviewed candidate is on local main. Product work remains a separate
launch. Epic completion additionally requires coordinated cutover, migration,
legacy retirement, reference proof and Jon's #1045 decision.
