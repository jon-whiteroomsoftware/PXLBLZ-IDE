# Existing Show editor: v2 tracer (#1065)

Jon accepted seam B on 2026-09-17: migrate the existing v1 editor in place.
[Decision](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1065#issuecomment-5721218679).
The [seam recommendation](show-editor-v2-seam-recommendation.md) owns the tradeoffs.
This plan records execution boundaries, not another decision gate.

The governing [Scene retirement specification](scene-retirement-specification.md)
last changed at `51a5c2acf2e1732610e1ee4c2e3d4e29f934511e`. The tracer starts
from local main `e6abc082878f9711af6d4149067a5e2742976bbc` and must incorporate
the separately reviewed oracle corrections before final proof and review.

## Consumer contract

The same Show stored as v1 or v2 must render through the existing component tree,
with the same markup, styling, labels, controls, focus behavior and layout.
The entire oracle read matrix must pass, not only the fresh Show. Only an ordinary
same-lane Clip drag, its history, save, reload and Undo are behaviorally qualified
by this tracer. #1066 and #1067 remain out of scope. Do not push.

The v1 editor is the sole UX reference. The rejected v2 route, forms, UI hooks,
adapters and projections are not implementation sources or guidance. In
particular, `showTimelineViewModelV2.ts` and `showTimelineGesturesV2.ts` remain
excluded even though they live under `src/engine/`. Existing v2-only branches
inside shared UI files do not become reusable merely because the file also
contains the v1 presentation. Engine domain, preparation, admission, store and
agent record-binding contracts are the backend being connected.

## Data and command boundaries

- Route both stored versions through the existing `ShowEditor` and `ShowWorkspace`.
  Preserve the workspace's presentational `timeline` and `stage` slots. Header
  summary and portal targets read the active backing instead of assuming a v1 row.
- Use a discriminated backing with surface-specific display data and explicit
  commands. Keep the v1 record, whole-record update wrappers and legacy pure
  mutation owners private to the v1 branch. Do not create a whole legacy-shaped
  Show as a v2 compatibility model or pass a v2 row to a v1 normalizer.
- Derive v2 reads directly from authored identities and time ownership. Timeline,
  Group isolation, inspector and animation selections must retain those identities
  through edits and history. Compiler segments and generated materialization IDs
  cannot become write targets. No display model is persisted, compiled or exported.
- Supply authored display values to the current timeline, detail panels,
  Transition palette, animation provider, Zones rail/map, Layout and Show properties.
  Lift legacy record-dependent calculations out of rendering while retaining JSX.
  Timeline and inspector reads must remain available for empty or refused preparation.
- Preserve the existing Stage presentation and diagnostics. Derive its authoritative
  inputs from `captureShowStageEditV2` / `prepareShowStageV2` and their documented
  ready/empty/refused results, independently of the rejected UI implementation.
- Centralize commands before callback wiring. The v2 tracer connects ordinary Clip
  move, Undo and Redo. Every unconnected write must return an internal no-change
  result before invoking a legacy owner. Do not change enabled styling, set global
  read-only mode, introduce new UX text, or silently send a v2 edit to a legacy save.
  The proof must enumerate the bounded behavior actually implemented.

## One real gesture

Keep the v1 pointer/native drag hit targets, quantization, snapping, collision
feedback and preview. At settlement, translate the ordinary same-lane move to
`ShowClipTemporalIntentV2 { kind: 'move', clipId, startMs }` and call
`admitShowV2PilotClipTemporal`. Both ordinary pointer settlement and the
collapsed-Zone native drop must use that same command boundary. Refuse unsupported
owners before adoption; do not guess a Group child or compiler-generated target.

Capture the immutable record, dependencies, revision and route lifetime at gesture
start. Closed prepared-edit admission rechecks eligibility and owns adoption;
the existing store owns one history entry, one queued save and failure recovery.
One settlement guard prevents duplicate pointer/native submissions. Toolbar and
keyboard history dispatch by backing version.

The existing agent lifecycle must receive an explicit `AgentEditorRecordBinding`.
For v2, use `recordVersion: 2`, the same prepared capture as manual admission,
and a current route/dependency identity check. Missing current capability refuses;
it never defaults to v1. This preserves the existing catalogue selection contract
without changing the MCP catalogue.

## Proof and delivery

Focused tests cover authored identity/time mapping, ordinary move/no-op/refusal,
stale gesture rejection, duplicate settlement, v1 behavior preservation and
representative unconnected v2 writes producing zero mutation/history/save.
Browser proof covers every named oracle surface across all four cases at 1440
and 390 pixels, with stable repeated captures, exact geometry and exact pixels.
Behavior proof covers real pointer movement, persisted converter equality, exact
history shape, measured save count, fresh hydration and exact Undo restoration.

The coordinator personally opens and compares the v1 and v2 rows before accepting
any slice. No capture mask, tolerance, changed v1 baseline or reduced corpus can
hide a mismatch. An unavoidable conflict with a model contract returns to Jon
with the smallest concrete pair instead of weakening either requirement.

One coordinator submits the four authoritative suites at the final rebased tip.
All code reviews use native WRSP Opus 5 Extra High (`claude-opus-5` / `xhigh`).
Land only under matching review and proof, then clean up the worktree. P3 findings
go to #1064 and are not repaired here. The oracle's known save-settlement
observation and empty-string-filter P3 limitations are recorded there; do not claim
those limitations have been repaired by this tracer.

## Early artifact-metric check

A coordinator probe on 2026-09-17 compared `compileShowForArtifact` with
`prepareShowStageV2` over the committed four-case oracle manifest, with stock
Libraries, no personal assets or profiles, no explicit Stage map, and identical
Stage dimension and pixel count. Source bytes, VM words and maximum Pattern
copies matched for every pair: fresh 5,834 / 6,012 / 2; Installation 14,501 /
220 / 2; Groups 32,227 / 6,056 / 2; lesson 19,819 / 6,012 / 2. This rules out
an intrinsic metric mismatch for that input partition. Actual editor preparation
options and displayed diagnostics still require browser proof.
