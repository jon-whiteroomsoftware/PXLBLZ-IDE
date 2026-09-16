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

## Ordinary Clip deletion adoption (#1038)

The pilot's explicit ordinary selection can call `admitShowV2PilotClipDelete` with exactly `{kind:'delete-clip',clipId}`. Materialized Group children are not deletion targets. The wrapper delegates to the existing Transition owner: attached visual Transitions and Clip-owned tracks are removed atomically; Property-ramp carrier refusal is preserved. Dormant instance setup, unrelated Group owners, survivor positions and Show End remain unchanged.

The prepared gate admits ready→empty only when this deletion's complete structurally valid candidate has zero effective Clips. This is the explicit editable/saveable empty Show capability, with preview/export unavailable until Add Clip creates content. No arbitrary preparation failure is bypassed. All fourteen affected collections are returned; removed appearance/property key reports are scoped to captured owners explicitly removed by the pure owner, whose removedIds report stays unchanged.

The Show-lifetime action remains mounted through optimistic removal. It clears only the deleted selected identity after a current saved receipt, preserving newer explicit selection, failed rollback and superseded/stale completion. Persistence and history use the existing single adoption path. Consumer evidence lives in `docs/reference/evidence/issue-1038-clip-delete/test-design.json`.
