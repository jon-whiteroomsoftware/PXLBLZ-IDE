# Show v2 checked Transition resize admission

The opt-in `ShowV2RoutePilot` keeps its existing Transition duration control and
minimum1ms. It calls `admitShowV2PilotTransitionResize`, using the same parent
prepared capture, trusted profile/map/assets and current/completion callbacks as
[Marker admission](show-v2-marker-route.md). Production v1 routing is unchanged.

`showV2PreparedEditAdmission.ts` owns a private closed dispatch and exactly two
public typed wrappers: general Marker edits and `resize-transition`. It accepts
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
