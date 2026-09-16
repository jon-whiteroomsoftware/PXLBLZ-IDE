# Show v2 Marker route admission

The opt-in `ShowV2RoutePilot` exposes general Marker add/select/name/time/color/remove.
Chapter roles belong to #1040; production v1 routing is unchanged. The pure
[Marker owner](show-v2-markers.md) remains authoritative for exact fields and
nonnegative safe-integer milliseconds, including dormant and equal-time guides.
The adapter supplies deterministic collision-safe add IDs, clears optional fields
explicitly and restores refused drafts to the current record.

`admitShowV2PilotMarkerEdit` captures the v2 document, revision and provider, checks
route lifetime and trusted dependency identity, runs the pure owner and trusted
preview/artifact path, and rechecks immediately before one existing store adoption.
The [history/save contract](show-state-history-persistence.md) owns all settlement,
Undo/Redo and rollback; there is no v1 cast or second persistence queue. No-op or
refusal writes nothing. A superseded save does not claim current settlement.

A complete structurally validated empty record with zero effective materialized
Clips is an explicit admission partition. Marker edits still save and reopen;
preview and export are unavailable until content is added. No generic compiler
failure bypass or placeholder runtime exists. Other advanced nonempty records
requiring a prepared-recipe preview adapter remain unsupported by this visible
slice. Marker edits do not change choreography or playback source.

[Admission tests](../../../src/store/showV2MarkerAdmission.test.ts) prove stale
revision/route/dependency/provider refusal, no-op, one history/save, Undo/Redo,
current save rollback, valid-empty save/reopen and invalid-empty refusal.
[Route flow](../../../e2e/show-v2-markers.auth.spec.ts) drives real durable edits,
refused draft restoration, history, reload, artifact reopening and narrow layout.
[Test design](../evidence/issue-1038-marker-route/test-design.json) records the
bounded oracle matrix. Browser captures must match committed UI source.
