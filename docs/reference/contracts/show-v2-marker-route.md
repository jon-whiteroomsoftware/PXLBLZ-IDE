# Show v2 Marker route admission

The gated v2 editor route's Show inspector exposes general Marker
add/select/name/time/color/remove (`ShowEditor.tsx`, through
`admitShowV2PilotMarkerEdit`).
The route neither authors nor clears the [chapter role](show-v2-markers.md); it
edits a chaptered Marker's time, name and color and preserves its role exactly.
Production v1 routing is unchanged. The pure
[Marker owner](show-v2-markers.md) remains authoritative for exact fields and
nonnegative safe-integer milliseconds, including dormant and equal-time guides.
The adapter supplies deterministic collision-safe add IDs, clears optional fields
explicitly and restores refused drafts to the current record.

`admitShowV2PilotMarkerEdit` captures the v2 document, revision and provider, checks
route lifetime and trusted dependency identity, reuses the parent’s exact prepared ready/empty capture, runs the pure owner and
prepares the changed candidate once with the same trusted map/profile/assets
context, then rechecks immediately before one existing store adoption. Current
Stage is not recompiled by admission, and no direct lowerer is used.
The [history/save contract](show-state-history-persistence.md) owns all settlement,
Undo/Redo and rollback; there is no v1 cast or second persistence queue. No-op or
refusal writes nothing. A superseded save does not claim current settlement.

A complete structurally validated empty record with zero effective materialized
Clips is an explicit admission partition. Marker edits still save and reopen;
preview and export are unavailable until content is added. No generic compiler
failure bypass or placeholder runtime exists. Prepared-ready native held animation, Group, Layout and full Restart records
now use that same checked admission. Unsupported nonempty captures remain
refused; readiness is not a generic compiler failure bypass. Marker edits do not change choreography or playback source.

[Admission tests](../../../src/store/showV2MarkerAdmission.test.ts) prove stale
revision/route/dependency/provider refusal, no-op, one history/save, Undo/Redo,
current save rollback, valid-empty save/reopen and invalid-empty refusal.
[Route flow](../../../e2e/show-v2-markers.auth.spec.ts) drives real durable edits,
refused draft restoration, history, reload, artifact reopening and narrow layout.
[Test design](../evidence/issue-1038-marker-route/test-design.json) records the
bounded oracle matrix. Browser captures must match committed UI source.

After synchronous adoption, a trusted local notification captures the exact
stamped adopted record, store revision and provider. It only records identity
and cannot interrupt the already-started persistence promise. Completion permits
that own adopted identity on the same mounted route and dependency context, even
though adoption replaces the parent capture. External replacement, revision,
provider/dependency changes and departure suppress obsolete status and selection.
Current rollback still restores durable state through the existing store; draft
recovery requires the failure notice to name that own rejected record.

Parent supplies a stable resolved-map context and exact profile inputs. Marker
controls do not independently choose dimensionality or sources. Store stamping
creates a new record identity; the parent normally captures that new identity
for Stage. No artifact caching/rebinding or second history/save owner is added.


The compatibility module now delegates to the private closed prepared-admission
core shared with [typed Transition resize](show-v2-transition-route.md). General
Marker requests, outcome vocabulary, visible controls and receipt settlement are
unchanged; callers cannot submit arbitrary replacement candidates or transforms.
