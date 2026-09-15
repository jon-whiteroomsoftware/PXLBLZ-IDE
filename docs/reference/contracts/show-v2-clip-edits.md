# Additive v2 Clip edit contract

`editShowClipV2(record, intent)` supplies immutable held-appearance and Property
animation edits for the provisional v2 engine. It is not connected to production
commands, the editor, history, or persistence. Those callers must not treat its
existence as v2 rollout.
Accepted product behavior is recorded in the
[authoring decisions](../../plans/show-v2-accepted-authoring.md).

## Results and ownership

A changed result contains an unaliased, fully validated replacement plus affected
Clip and animation-track IDs. A refused or unchanged result returns the original
record by reference and empty affected lists. The input never changes. Timestamps,
Show End, unrelated choreography, Pattern instance identity and source remain
unchanged; the adoption owner controls timestamps, history and saving.

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
control tracks for Make Independent or Clip-scoped Replace. The caller supplies a
complete fresh track and keyframe identity plan for every copied source track;
the helper validates and returns those exact IDs. It reports discarded control
targets, leaves source tracks unchanged, and refuses an incomplete identity plan
or destination activation conflict atomically. Record validation likewise refuses
overlapping instance-control or instance-time-scale owners while allowing
half-open adjacency. Copy planning materializes Group occurrences before checking
destination ownership and fresh identities, so a Group-bound effective track can
neither be overlapped nor shadowed by an ordinary copied track.

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

Actual Clip edits currently require no Transition records, no Group occurrences
and one full-Show Layout occurrence. The Clip's Zone must be present
in that Layout. A Layout without logical routing or explicit ranges uses the
existing nominal-Zone fallback. General Transition, Group, Layout and Insert Time
orchestration remains with their dedicated owners.

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
It then applies the
compiler's exact Pattern reset assignments, coordinate state and elapsed-clock
reset; the ordinary frame scheduler binds and advances the post-entry portion.
The same member remains shared, simultaneous entries coalesce, time zero fires
once, and loop/cold replay crosses the same events. A Pattern the existing reset
analysis cannot reconstruct exactly is refused rather than partially reset. This
includes a declared function whose resolved top-level binding is reassigned:
function values are not snapshotted or restored. The eligibility analysis resolves
writes through lexical scopes, so parameter and local shadows do not create a
false refusal, and ordinary unreassigned functions remain accepted.

`lowerShowCompositionV2ForCompile` refuses effective Restart entries, including
entries inside used Group definitions, and Layout split-position tracks because
that direct adapter cannot return their transient recipe data. Callers with those
features must use `prepareShowV2ForCompile`, which returns the complete recipe or
a typed refusal.

## Evidence

[Public edit tests](../../../src/engine/showClipsV2.test.ts) exercise immutable
results, serialized/reopened records, held-change boundaries, Restart ownership,
invalid intents, collision refusal, animation ownership, and Layout availability.
Reopened records compile through the preparation seam and run in Fast and Precise
modes. Split preserves frames and private state through the next loop unless the
left Clip's authored Restart fires again on the next loop.

[Property animation tests](../../../src/engine/showPropertyAnimationV2.test.ts)
exercise move → trim → extend → split → reopen for every supported easing option,
equal stored endpoints with a nonconstant retained interior, steps/hold
discontinuities, generated Fast/Precise source parity at activation boundaries,
Insert Time boundary partitions, Group-aware sharing/Restart, carrier projection,
caller-supplied copy identities, effective Group destination conflicts,
copy/filter results and atomic conflict refusal. Group tests reopen translated
Transform and Aperture tracks and evaluate retained nonlinear interiors after
their `curveSegment` bases receive the occurrence offset.
The [Transition owner tests](../../../src/engine/showTransitionsV2.test.ts) prove
projection before carrier reset and exact nonlinear restriction during connected
edge resize.

UI, durable provider writes, actual Undo/Redo integration and full Insert Time
orchestration are not proven here. Generated Restart replay is proved at the
reopened `.epe` consumer in both Fast and Fidelity modes.
