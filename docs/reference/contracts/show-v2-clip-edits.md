# Additive v2 Clip edit contract

`editShowClipV2(record, intent)` supplies immutable held-appearance, Property
animation and ordinary runtime-identity edits for the provisional v2 engine. It is not connected to production
commands, the editor, history, or persistence. Those callers must not treat its
existence as v2 rollout.
Accepted product behavior is recorded in the
[authoring decisions](../../plans/show-v2-accepted-authoring.md).

## Results and ownership

A changed result contains an unaliased, fully validated replacement plus affected
Clip and animation-track IDs. A refused or unchanged result returns the original
record by reference and empty affected lists. The input never changes. Timestamps,
Show End and unrelated choreography remain unchanged; the adoption owner controls
timestamps, history and saving. Temporal edits and linked duplicate preserve
Pattern instance identity and source. The explicit identity operations below
own their named runtime cascade.

Move translates held keys and Clip-owned animation by the requested delta.
Instance animation translates only for a sole Clip user; shared-instance,
Layout and Show animation remains fixed. Activation intervals and keyframes move
together, preserving easing and values.

Trim accepts a nonempty subinterval. It removes excluded held changes, seeds the
new start from the held value, and retains changes strictly before the new end.
Extend accepts an interval containing the existing Clip and holds its boundary
values. Neither operation stores discarded keys for future restoration.

Split requires a strict interior time and a caller-supplied fresh nonblank Clip
ID. The left Clip retains its identity; the right shares its instance and starts
with the held boundary value. Clip-owned Property tracks partition into left and
right activation intervals and the right target follows the new Clip. Instance
tracks retain one global owner. Held-key IDs are scoped to their owning Clip and
are preserved when their value is reused; splitting does not mint a runtime.
Restart stays on the left Clip and the new right Clip uses Continue.

Linked duplicate requires an explicit destination Zone, Layer and start plus a
complete fresh identity plan for the new Clip, every appearance key, every
top-level Clip-owned Property track and every key on those tracks. It copies the
source duration, sampling, appearance and entry policy; translates the copied
appearance and Clip-track activation/key times by the placement delta; and
retargets every Clip Property form to the new Clip. The duplicate shares the
source Pattern instance. Instance tracks remain global and unchanged, and no
Pattern instance or attached Transition is copied. Duplicate validates ordinary
and materialized-Group occupancy, Layout availability and the complete result;
half-open adjacency is accepted while overlap refuses atomically. A duplicated
Restart entry therefore derives a second event that resets the same shared
runtime. Before exposing the candidate, duplicate also applies the shared
RL08–RL10 Transition-placement check to the complete materialized choreography.
An unrelated duplicate whose start or end is at or inside a positive Transition
window refuses as compiler-ineligible; choreography wholly outside the window
retains ordinary half-open placement behavior.

## Exact Property curves and activation

`showPropertyAnimationV2.ts` owns half-open activation, curve restriction and
Property-track edit translation. A retained nonlinear interval stores an outgoing
`curveSegment` on its left key. The descriptor keeps the original curve base,
delta, easing, duration and elapsed offset. Repeated restriction increments the
offset; it neither samples endpoints nor keeps removed key identities. Extension
adds constant boundary segments. Explicit key reauthoring removes stale retained
descriptors only from the affected adjacent segments. When a trim or split ends
at an existing key, that key is the retained segment endpoint; a later key never
changes the curve that approaches the boundary.

The v2 JSON schema persists `curveSegment`; the v1 persistence schema remains
closed to it. Persisted v1 keyframe types do not expose the descriptor. A separate
transient compiler track type carries it through the internal v1-shaped recipe,
and the existing evaluator and emitter apply the same formula.
Activation remains independent of key extrema and uses
`[activeStartMs, activeStartMs + activeDurationMs)`.

`insertTimeInShowPropertyTracksV2(record, atMs, durationMs)` applies the global
time mapping once per track. A track ending at the insertion stays left; a track
starting there shifts. A crossing track holds its right-boundary value over the
inserted interval and resumes its original outgoing curve on the right. The helper
does not change Pattern state, clocks, instance identity, Show End or other
choreography; the Insert Time orchestrator owns those changes and validates the
combined candidate.

`copyShowInstancePropertyTracksV2` copies time-scale tracks and compatible public
control tracks for Make Independent or Clip-scoped Replace. Its source set is the
complete effective runtime projection: authored top-level tracks plus every
occurrence-qualified Group track after local holds and occurrence time translation.
Copies become authored top-level destination tracks; source tracks, Group
definitions and occurrences remain unchanged. The caller supplies an exact fresh
track and keyframe identity plan keyed by those effective IDs. Missing,
extraneous, blank or colliding identities refuse atomically. The helper preserves
activation, values, easing and retained curve descriptors, applies the placement
delta once and returns the exact copied IDs. Compatibility filtering reports each
discarded effective control target; time-scale tracks always remain eligible.
Overlapping effective instance owners or destination activation conflicts refuse,
while half-open adjacency is accepted. Freshness and conflicts use the full
materialized record, so Group-derived identities cannot be shadowed by an authored
copy.

`projectShowTransitionPropertyRampsV2` converts every explicit ramp on one visual
Transition into an independently activated Property track before a caller resets
or deletes that carrier. The caller supplies fresh identities, the retained end
value and activation end; an incomplete or conflicting projection refuses with
the original record. The Transition reset owner invokes this projection before
removing the carrier, then performs the visual edit without shifting the new
tracks. Connected edge resize delegates nonlinear restriction to the same exact
curve owner.

## Current admission domain

The owner validates the complete preimage and final candidate. Times must be safe
integer milliseconds within Show End. Collisions and invalid references refuse
atomically. A no-op returns the original valid record without running an edit.

Move, Trim, Extend and Split currently require no Transition records, no Group
occurrences and one full-Show Layout occurrence. The Clip's Zone must be present
in that Layout. Linked duplicate instead accepts those topologies when the
complete candidate remains valid: it leaves existing Transitions unchanged,
uses materialized Groups for collision and identity ownership, and checks the
new Clip's full contribution against Layout availability. A Layout without
logical routing or explicit ranges uses the existing nominal-Zone fallback.
General Transition, Group, Layout and Insert Time orchestration remains with
their dedicated owners.

`deriveShowRestartEventsV2` materializes Group Clips, derives one event from
each restarting Clip's effective instance, materialized Clip identity and first
contribution, and coalesces simultaneous events per instance. A contribution map
from the Transition owner overrides nominal Clip starts. Moving a Clip therefore
moves its derived instruction; splitting keeps only the left instruction. Group
internal Transitions are materialized with their Clips, so an incoming child
restarts at its pre-roll contribution rather than its nominal local start.

Lowering maps each derived event to the one compiler member that owns the effective
shared instance. The transient recipe carries `{ atMs, clipId }`; no second event
list is persisted. When one frame crosses an event, the routed scheduler walks
every elapsed hold or Transition slice up to that boundary. Each slice uses the
ordinary placement setup path for controls, effects, adaptations, Transition
ramps and Property tracks before advancing the member; an inactive slice inside
the member's deterministic continuity window uses the existing hidden advance.
It then restores compiler-captured scalar values, coordinate state and private
elapsed/stepped clocks; the ordinary frame scheduler binds and advances the
post-entry portion.
The same member remains shared, simultaneous entries coalesce, time zero fires
once, and loop/cold replay crosses the same events. A Pattern the Restart planner
cannot reconstruct exactly is refused rather than partially reset.

The compiler captures each admitted mutable scalar once after all member
declarations initialize and before any callback. Generated names are collision
safe, private, one per effective instance and never persisted or recaptured. A
Restart-enabled deterministic-loop member restores that same baseline at loop
reset; a member with no Restart retains legacy initializer replay and emitted
output. Current controls, Property tracks, adaptations and placement bindings are
reapplied after the reset. Runtime `random()` keeps the shared environmental
generator's progression.

Eligibility runs on bundled source, including resolved Libraries, and on the
final transformed member. It fails closed for implicit bindings, array/object or
closure state, writes to resolved top-level function bindings, async/generator or
first-class functions, dynamic calls, unknown syntax and unclassified persistent
facilities. Parameter, block and local shadows remain legal when resolution proves
the top-level binding unchanged. Persistent palette and member-owned freeze or
refresh refuse. Output reuse recomputes after scheduling; a Transition-owned
snapshot deliberately holds its captured image while the live member restarts.
Baseline globals participate in the existing 256-persistent-global limit.

`lowerShowCompositionV2ForCompile` refuses effective Restart entries, including
entries inside used Group definitions, and Layout split-position tracks because
that direct adapter cannot return their transient recipe data. Callers with those
features must use `prepareShowV2ForCompile`, which returns the complete recipe or
a typed refusal. Preparation takes the resolved Library source map and invokes the
same compile path as final emission. Restart-bearing flat records use the existing
global-sections lowering; no-Restart flat records retain continuous-flat lowering.
Single-Zone independent sampling is equivalent to span sampling for this route.

## Evidence

[Public edit tests](../../../src/engine/showClipsV2.test.ts) exercise immutable
results, serialized/reopened records, held-change boundaries, Restart ownership,
invalid intents, exact caller identity plans, every Clip Property target,
ordinary/materialized-Group collision refusal, attached Transition preservation,
animation ownership, routed Layout availability, and exact/one-millisecond
Transition-window boundaries against the independent public compile-preparation
oracle.
Reopened records compile through the preparation seam and run in Fast and Precise
modes. Linked duplicate proves its nonlinear copied track and second Restart on
one generated shared runtime. Split preserves frames and private state through
the next loop unless the left Clip's authored Restart fires again on the next
loop.

[Property animation tests](../../../src/engine/showPropertyAnimationV2.test.ts)
exercise move → trim → extend → split → reopen for every supported easing option,
equal stored endpoints with a nonconstant retained interior, steps/hold
discontinuities, generated Fast/Precise source parity at activation boundaries,
Insert Time boundary partitions, Group-aware sharing/Restart, carrier projection,
caller-supplied copy identities, effective Group destination conflicts,
top-level plus occurrence-qualified Group source copies, repeated occurrence
adjacency/gaps, hold-mapped nonlinear descriptors, copy/filter results and atomic
identity/conflict refusal. Fast and Precise reopened artifacts prove a copied
Group-local control still drives an ordinary Clip after it binds the independent
runtime. Group tests reopen translated
Transform and Aperture tracks and evaluate retained nonlinear interiors after
their `curveSegment` bases receive the occurrence offset.
The [Transition owner tests](../../../src/engine/showTransitionsV2.test.ts) prove
projection before carrier reset and exact nonlinear restriction during connected
edge resize.

UI, durable provider writes, actual Undo/Redo integration and full Insert Time
orchestration are not proven here. Generated Restart replay is proved at the
reopened `.epe` consumer in both Fast and Fidelity modes.

## Ordinary Pattern independence and explicit Rejoin

`make-independent` targets one ordinary Clip and receives `independence` with a
fresh `instanceId` and the copy helper's exact `identitiesBySourceTrackId` map.
A sole effective Clip user is unchanged; sharing includes invisible materialized
Group children. The changed operation clones the complete source instance payload,
rebinds only the selected Clip, and copies all effective instance-control and
time-scale tracks at placement delta zero. Group-qualified source track/key IDs
are the caller's map keys. Copies become ordinary destination tracks; source
payload, tracks, Group definitions/bindings/holds, appearance, Clip animation,
entry policy and attached Transitions remain fixed. Adding a runtime sets the
required execution lifecycle to `continuous`.

`rejoin` requires an explicit existing top-level `targetInstanceId` with the same
structured Pattern source identity (`kind` and `id`). Display names do not establish
compatibility. A current-target request is unchanged. The selected Clip uses the
target's state, clock, controls and tracks; source animation is never merged.
If another ordinary or Group Clip, any Group runtime slot (including an unused
explicit or stable-default binding), or a Transition Property ramp references the
source, its payload and tracks stay. Otherwise Rejoin removes source instance
tracks and their keys before collecting the source instance and sets `continuous`.

Identity results add `affectedInstanceIds`, `affectedKeyframeIds` and `removedIds`
to the existing Clip/track result. Independence reports the created instance and
copied tracks/keys. Rejoin reports the source and target runtime identities plus
any collected tracks/keys; `removedIds` contains only collected owners. Identity
no-op/refusal returns original record identity and all five affected lists empty.
Existing temporal and duplicate result objects retain their shape. Complete
preimage/candidate validation and the shared bounded Transition-placement check
apply; there is no blanket one-Layout, no-Group or no-Transition restriction.

[Identity tests](../../../src/engine/showClipIdentityV2.test.ts) reopen the record
and generated `.epe`, prove Group-owned controls and clocks in Fast/Fidelity,
isolate a second user's Restart after independence, and restore target sharing
through Rejoin. Exact held nonlinear projection is checked through the Property
evaluator and reopened Fast/Fidelity output/state. The exact section-restriction
adapter admits both the held preimage and its independent copy; controls, clock
animation and Group owners remain preserved. Both consumer records use explicit
continuous lifecycle to isolate this preservation from cast lifecycle invalidation. UI and
Group-definition identity edits remain separate slices.

## Ordinary Clip-scoped Replace Pattern

`replace-pattern` receives the ordinary `clipId` and trusted `replacement`
metadata: `patternReference`, `patternName`, and resolved public `exportedSliders`
descriptors. The owner does not parse source, infer exports, or fill incoming
control defaults. Pattern references use their structured stock/user identity;
public controls match by exact exported name.

A sole effective Clip user retains its runtime identity, clock configuration and
evaluation policy. Replace keeps compatible static values and instance-control
tracks, always retains time-scale animation, and removes incompatible authored
control tracks with their keys. A shared user, including a materialized Group
child, requires a caller-supplied `independence` plan for a fresh runtime and every
retained effective control/time-scale track/key. Copies use placement delta zero;
only the selected ordinary Clip binds the new runtime. The original payload,
animation, other Clips, Groups and Transition attachments remain unchanged.
Missing, extraneous, blank, malformed or colliding identities refuse atomically.
The plan covers compatible tracks only, including occurrence-qualified Group
tracks; supplying identities for discarded controls also refuses.

Replace refuses when incompatible effective Group-owned control animation cannot
be removed within this ordinary Clip's scope. This includes the admitted sole-use
case where an unused Group slot animates the selected runtime and a repeated
shared definition also animates another runtime. The compiler-ineligible refusal
identifies the conflicting exported control, runtime, Group definition,
occurrence and effective track. It preserves recovery and authorship by returning
the original record; no silent runtime fork or Group-track mutation accepts it.
This narrow rule is the accepted §6 product decision.

Source changes or a fresh runtime set `continuous`; metadata pruning on the same
sole source preserves its current execution lifecycle. An all-compatible request
for the same Pattern reference and name is unchanged. An optional supplied shared
no-op plan still receives complete identity validation without adopting copies.
Sole-use requests must omit the independence plan.

Changed results add `discardedControlTargets` to the identity result vocabulary.
Each incompatible effective animation target is reported, including repeated
targets from distinct occurrence-qualified tracks; static-only losses are added
once if that control has no reported animation loss. `affectedTrackIds` and
`affectedKeyframeIds` identify copied or removed owners, and `removedIds` contains
only removed authored control tracks/keys. Replace no-op/refusal returns original
record identity and all six affected/loss lists empty. Clip appearance, Clip
Property tracks, entry policy, routing and attached Transitions stay fixed; full
candidate validation and the shared bounded placement check still apply.

[Replace tests](../../../src/engine/showClipReplaceV2.test.ts) serialize/reopen
records and exported `.epe` artifacts through public preparation and Fast/Precise
replay. The selected replacement changes red output to blue while retaining its
nonlinear controls and clock; another ordinary user's exported state remains
exact. The Group preservation fixture ends the selected Clip before the Group's
window, isolating exact unchanged Group frames and controls at activation
boundaries and the nonlinear midpoint. Restart events keep the authored Clip
entry policies and isolate the new runtime from another user's later reset.

Adding a compiler member shifts compact generated private symbols. The delivered
source-inventory oracle compares the retained owner's compiled Pattern chunks
under an explicit one-to-one renaming of `__pxlblz_*` private symbols only. That
bijection preserves repeated references, constants, operations, control flow and
ordering. It does not normalize authored names or values. Exact source payload,
controls, authored tracks, Group owners and runtime replay accompany this bounded
generated-source comparison. UI and Group-definition Replace remain separate.
