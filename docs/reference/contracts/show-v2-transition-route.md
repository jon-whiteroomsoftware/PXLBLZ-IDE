# Show v2 checked Transition admission

The gated v2 editor route keeps a Transition duration control and minimum 1 ms,
now in `ShowEditorV2TransitionLayoutPanel` (the pilot route that first hosted it
retired with #1056 slice 6). It calls `admitShowV2PilotTransitionResize`, using the same parent
prepared capture, trusted profile/map/assets and current/completion callbacks as
[Marker admission](show-v2-marker-route.md). Production v1 routing is unchanged.

`showV2PreparedEditAdmission.ts` owns a private closed dispatch and public typed
wrappers, originally general Marker edits and `resize-transition`. It accepts
no caller candidate or transformation callback. The Marker compatibility module
preserves its existing request types, outcome codes and controls. Resize returns
complete Clip/Transition/track/removed IDs and distinguishes typed pure-owner
refusal from stale/provider/prepared-capability admission refusal.

The [pure Transition owner](../../../src/engine/showTransitionsV2.ts) continues
to own graph cascades, topology, exact animation, Layout/Show End availability
and existing Reset/property-carrier refusals. The wrapper cannot invoke hidden
delete/insert commands. Zero resize retains the pure owner's existing Reset
behavior; the visible control continues to require at least1ms.

Changed admission reuses current ready capability and frozen semantic assets,
prepares the candidate once, then synchronously rechecks exact record/revision,
provider and captured route/dependency eligibility before one existing store
adoption/history/save. Unsupported nonempty preparation is a real refusal.
Explicit structurally validated empty capability is retained for Marker edits;
resize without a Transition refuses, with no runtime or generic compiler bypass.
No-op/refusal yields empty affected sets and no timestamp/history/save/receipt.

The [existing persistence owner](show-state-history-persistence.md) still clones
and stamps adoption, queues one replacement, and owns rollback/supersession.
A trusted local receipt records that exact adopted record/revision/provider;
it cannot interrupt persistence. Own recapture permits normal saved feedback.
External replacement, revision/provider/dependency change or route departure
suppresses obsolete saved/error status and draft reset. Current failure restores
the duration through the existing durable rollback. A local pending guard
prevents repeated resize submissions while that visible operation settles.
No artifact cache/rebinding or second persistence queue is introduced.

[Public admission tests](../../../src/store/showV2TransitionResizeAdmission.test.ts)
prove the complete cascade, stale/invalid/empty/provider partitions, native file
reopen and Fast/Precise output in naturally admitted scopes. Global scalar
animation retains its whole-output preservation requirement; participant proofs
use instance-owned animation. Source/representation refusals are not widened.
[Completion tests](../../../src/components/ShowV2TransitionResizeCompletion.test.tsx)
cover own/external replacement, current rollback and route/dependency retirement.
[Authenticated flow](../../../e2e/show-v2-transition-resize.auth.spec.ts) covers
changed/no-op/refusal, Undo/Redo, save/reload, native reopening and narrow controls.
[Test design](../evidence/issue-1038-transition-admission/test-design.json) owns the
proof packet. Full editor adoption, other commands and production cutover remain
outside this slice. Existing Stage sample-from-position behavior is unchanged.

## Transition Insert, settings and Reset to Cut (#1038)

The pilot mounts `ShowV2TransitionEditor` beside its existing duration control.
The panel selects one derived Cut junction or one existing Transition and calls
`admitShowV2PilotTransitionEdit`, the third public typed wrapper on the same
private closed dispatch. Its `transition-edit` command accepts exactly `insert`,
`update-transition` and `reset-to-cut`; a caller candidate, a `delete-clip`
smuggled through this wrapper, a stored Cut kind, a nonpositive duration or a
caller-authored `propertyRamps` array on an Insert refuses before any owner call,
preparation, history or save.
`update-transition` keeps Clip- and instance-owned ramps owner-protected but
accepts adding, changing or removing the two Show-scalar ramps
(`show-repeat-scale`, `layout-occurrence-split-position`), which no Clip owns;
record validation keeps them whole-output, one per kind, on the incoming Layout
occurrence and in bounds. The boundary panel's Animate repeat scale and Animate
split position sections plan them from v1-shaped `propertyTransitions` exactly
as the converter maps them, so an edit equals v1 then convert (#1066 slice
9c2a). A participant-scope boundary refuses a new scalar ramp at validation
(v1 then convert would make it whole-output), and removing the last scalar ramp
never demotes a whole-output boundary. Unknown Transition fields stay with the record
validator, which the pure owner already runs on its complete candidate.

`showV2TransitionEditorModel.ts` is the pure route model. It projects selectable
junctions from `projectShowTransitionJunctionsV2` — exact integer adjacency only,
so a 1 ms gap offers nothing — and adds a whole-output junction at each boundary
time where every ending and starting Clip meets exactly and none spans it. Kind
options come from the existing visual-toolkit catalogue for the Stage dimension
with the Cut variant excluded, and `showTransitionChangesForPresentation` supplies
each kind's complete authored settings, so a kind change drops the previous kind's
parameters instead of persisting dead fields. `planShowV2TransitionEdit` allocates
fresh Transition and participant identity through a caller-supplied generator and
refuses a conflict; the pure owner allocates nothing. Insert preserves outgoing
timing and ripples the incoming connected closure once; a settings edit keeps
identity, endpoints, duration, whole-output window and ramps; Reset deletes the
Transition and moves incoming contributors and connected successors earlier.
Collision, Show End, Zone availability and compiler eligibility refuse atomically
through the existing owner, with no silent Show End extension.

## Property-ramp projection before carrier removal (#1038)

Specification §6 requires surviving Transition `propertyRamps` to become
independently activated tracks before their visual carrier leaves the record. The
earlier "requires the #1037 projection owner" refusals are retired.
`reset-to-cut` already consumed an explicit projection plan; `delete-clip` now
takes `propertyRampProjections`, one complete plan per removed carrier Transition,
and projects them on the preimage through `projectShowTransitionPropertyRampsV2`
before removing the Clip, its Transitions and its Clip-owned tracks. A projected
track whose target is the deleted Clip is removed with that target and reported in
both `affectedTrackIds` and `removedIds`; every other projected track survives.
A missing, duplicated or foreign plan, and any projection the #1037 owner refuses,
refuses the whole deletion atomically with the original record identity.

`planShowV2TransitionRampProjections` derives plans for the route from the record:
activation is exactly the ramp window, and the destination value is the held
repeat scale at the boundary or the incoming occurrence's split position. Those
are the two global scalar targets conversion produces and lowering accepts on
whole-output Transitions. Conversion also holds a boundary Animation speed or
Brightness ramp on its participant Transition (#1091 B1), and lowering accepts
that Transition-held speed or brightness ramp on the flat route, refusing it off
the flat route; any other ramp target refuses by name rather than inventing a
destination value. The Clip delete panel builds its plan the same way, so deleting
a carrier contributor through the route no longer refuses. Derived compiler ramps
are unchanged.

Guard classification: participant-scope Transition ramps targeting the incoming
Clip's instance time scale or Clip View brightness are Clip value ramps.
Settings edits may add, change, or remove them. Resizing their Transition keeps
each ramp length, caps it to the new window, and uses the previous Transition
duration when the ramp has no duration; the result has a minimum duration of
`min(100, newDurationMs)` and omits `durationMs` when it equals the new window.
Reset to Cut, deletion of either adjacent Clip, and a permitted cross-Zone or
cross-Layer detach remove these ramps with their Transition without a projection plan.
Clip edge resizing follows the same duration rule when it changes the window;
closing the window drops the ramps. Planners skip Clip value ramps rather than
projecting them. Other ramp kinds retain their owner and projection guards:
`unsupported-property-carrier` on resize, Reset without a complete plan, or
Clip delete without a complete plan; a non-scalar target with no projected
destination still refuses. Group creation and Layout duplicate-with-content
keep their carrier refusals.
RL08, RL09 and RL10 remain bounded compiler refusals and are surfaced unchanged;
the authenticated flow exercises RL08 as a real zero-write route refusal.
Continuous-flat participant Transitions with multiple Layouts keep their existing
atomic refusal, unrepaired and unwidened by this slice.

[Public admission tests](../../../src/store/showV2TransitionEditAdmission.test.ts),
[route model tests](../../../src/engine/showV2TransitionEditorModel.test.ts),
[carrier tests](../../../src/engine/showTransitionsV2RampCarrier.test.ts),
[topology partitions](../../../src/engine/showTransitionsV2Completion.test.ts),
[panel tests](../../../src/components/ShowV2TransitionEditor.test.tsx) and the
[authenticated flow](../../../e2e/show-v2-transitions.auth.spec.ts) own this proof;
the packet is [issue-1038-transition-route](../evidence/issue-1038-transition-route/test-design.json).

## Converted-boundary repair on this route (#1068)

`resize-leading`, `resize-trailing` and plan-less `reset-to-cut` consult
`convertedBoundaryRepairSpecV2` and route a ready converted boundary through the
same cut-and-reclaim commit the temporal owner uses: the record leaves, the
downstream side moves earlier by the boundary duration, Show End shrinks by the
same duration, the Layout occurrence that owns the reclaimed window shortens,
every later occurrence moves earlier, converted Scene labels and Group
occurrences at or after the window end move earlier with their track
activations, and Layout-owned tracks of shifted occurrences follow. A Clip or
Group occurrence spanning the reclaimed window end, a window that is not inside
one occurrence, or an owning occurrence that cannot cover the reclaim, refuses
the whole edit atomically. Extension into the boundary
refuses `invalid-topology`; `reset-to-cut` with projections projects first and
refuses a stranded activation exactly like the temporal side. The result names
every occurrence the repair touched (`affectedLayoutOccurrenceIds`,
`affectedMarkerIds`, `affectedGroupOccurrenceIds`), shortened and shifted
alike. `delete-clip`
performs no shift and no Show End move on any boundary: survivor times are
preserved exactly and only attached records leave, with projected-track survival
decided by the projection section above. Full accepted behaviour lives in the
[clip-temporal contract](show-v2-clip-temporal.md).

## Ordinary Clip deletion adoption (#1038)

The pilot's explicit ordinary selection can call `admitShowV2PilotClipDelete` with exactly `{kind:'delete-clip',clipId}`. Materialized Group children are not deletion targets. The wrapper delegates to the existing Transition owner: attached visual Transitions and Clip-owned tracks are removed atomically; Property-ramp carrier refusal is preserved. Dormant instance setup, unrelated Group owners, survivor positions and Show End remain unchanged.

The prepared gate admits ready→empty only when this deletion's complete structurally valid candidate has zero effective Clips. This is the explicit editable/saveable empty Show capability, with preview/export unavailable until Add Clip creates content. No arbitrary preparation failure is bypassed. All fourteen affected collections are returned; removed appearance/property key reports are scoped to captured owners explicitly removed by the pure owner, whose removedIds report stays unchanged.

The Show-lifetime action remains mounted through optimistic removal. It clears only the deleted selected identity after a current saved receipt, preserving newer explicit selection, failed rollback and superseded/stale completion. Persistence and history use the existing single adoption path. Consumer evidence lives in `docs/reference/evidence/issue-1038-clip-delete/test-design.json`.
