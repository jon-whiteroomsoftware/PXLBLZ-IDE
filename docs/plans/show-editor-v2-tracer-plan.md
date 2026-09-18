# Existing Show editor: v2 tracer (#1065)

Jon accepted seam B on 2026-09-17: migrate the existing v1 editor in place.
[Decision](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1065#issuecomment-5721218679).
The [seam recommendation](show-editor-v2-seam-recommendation.md) owns the tradeoffs.
This plan records execution boundaries, not another decision gate.

**No route gate (Jon, 2026-09-18).** There is no gate and no opt-in. A Show
stored as version 2 opens in the existing editor on main, ungated, as each slice
lands; the rejected `ShowEditorV2Route` is no longer mounted, and the browser
specs that drove it are retired. Until #1066 connects the remaining edits, a v2
Show in the existing editor has only the ordinary Clip move connected and every
other command is fenced to an internal no-change result. Pushing needs Jon's
explicit word for that push. Any instruction below or elsewhere that reads "the
gate remains on", "the gate remains unchanged", "opt-in", or "new Shows open in
the rejected v2 route until #1067" is obsolete.

The governing [Scene retirement specification](scene-retirement-specification.md)
last changed at `51a5c2acf2e1732610e1ee4c2e3d4e29f934511e`. The tracer starts
from local main `e6abc082878f9711af6d4149067a5e2742976bbc` and must incorporate
the separately reviewed oracle corrections before final proof and review.

## Consumer contract

The same Show stored as v1 or v2 must render through the existing component tree,
with the same markup, styling, labels, controls, focus behavior and layout.
The source-size gauge has one approved data-value exception: it reports the true
delivered source bytes for each record version, including that exporter's header.
The gauge's layout, styling, units and behavior stay unchanged; no other value or
surface is exempted. Jon approved this after fixed-option exports measured the
fresh pair at 7,200 bytes (v1) and 7,408 bytes (v2), while the generated program
itself was 5,834 bytes in both. The accepted native v2 export metadata remains.

The entire oracle read matrix must pass, not only the fresh Show. Only an ordinary
same-lane Clip drag, its history, save, reload and Undo are behaviorally qualified
by this tracer; every other v2 command stays fenced until #1066. #1066 and #1067
remain out of scope. Do not push without Jon's explicit word for that push.

The v1 editor is the sole UX reference. The rejected v2 route, forms, UI hooks,
adapters and projections are not implementation sources or guidance. In
particular, `showTimelineViewModelV2.ts` and `showTimelineGesturesV2.ts` remain
excluded even though they live under `src/engine/`. Existing v2-only branches
inside shared UI files do not become reusable merely because the file also
contains the v1 presentation. Engine domain, preparation, admission, store and
agent record-binding contracts are the backend being connected.

Jon approved the three explicit metadata forms in the
[conversion-provenance contract](../reference/contracts/show-v2-conversion-provenance.md):
converted Scene-label Markers, boundary-versus-Layer Transition origin, and
zero-duration routing-cut identity/settings. These preserve the original read
surfaces; they add no Scene entity or playback behavior. The approval covers
these forms only, not arbitrary legacy-record retention.

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
and 390 pixels, with stable repeated captures and exact geometry. The visual
comparison must hold Show identity constant: the original renderer seeds randomness
from the Show ID, so distinct paired row IDs are not equivalent rendering inputs.
A same-ID persisted v1-to-v2 migration produced exact Installation Stage pixels
where different IDs did not; the renderer and its seed policy stay unchanged.

Pixel comparisons retain their exact raw verdict. Jon approved two separately
qualified exceptions on 2026-09-17: the truthful source-size value and independently
demonstrated browser raster noise. Keep the raw captures and differences, prove each
gauge value against its delivered artifact, and verify the unchanged gauge
presentation. Do not omit the gauge from proof or turn the exception into a
general mask, tolerance, or exemption for other differences.
The artifact check reopens a real `.epe` produced by the native export owner and
measures its full source; connecting the header's Download command remains
#1066 work. Do not claim this artifact check proves that UI command is connected.
For the numeric exception, retain raw captures and compare an additional
counterfactual with only independently verified byte-value text and fill-width
slots equalized. Raw presentation must match, and restoring those slots must
reproduce the raw capture, subject only to independently demonstrated raster
noise. The report retains every raw image and difference. A noise classification
requires unchanged control captures under matching state and capture settings,
matching geometry/styles, and evidence for the particular raster differences.
An arbitrary pixel-count threshold, color tolerance, or glyph-region exclusion
cannot qualify a difference; unsupported differences remain failures.

The counterfactual is symmetric, and its captures are taken from an already
warmed page. The equalized value has to be one of the two verified byte values,
so writing it straight into the row that already displays it changes nothing
while the other row genuinely re-rasters; at 390 that one-sided re-raster landed
the preview help icon one level different and the proof was refused for a
difference neither version owns. Both rows therefore pass through one sentinel
value neither of them holds, with a presented frame, before the equalized value,
so each normalized capture is reached by the same two real writes. Separately,
Playwright's screenshot leaves an empty `style` attribute on the elements it
freezes, so the first reading of an open described a page that had never been
screenshotted while every later reading described one that had; the fingerprints
then split on capture order rather than on surface state, and the classifier
refused to compare them. One discarded screenshot per open removes that. Neither
change relaxes anything: the counterfactual must still be exactly zero, the raw
captures and their strict verdict are retained unchanged, and a restoration
residual still qualifies only through controls: as demonstrated raster noise, or,
under the 2026-09-18 decision below, as a demonstrated side effect of the proof's
own mutation.

Jon extended the gauge exception on 2026-09-18 to a gauge that lies behind the
captured surface rather than inside it. The entity detail panels and the Zone
Map draw over the editor at 1.5% transparency with a backdrop blur, so at 390
the gauge under them reaches their captures attenuated to a channel delta of one
and spread by the blur, without appearing in their DOM at all. The proof
standard is unchanged and the placement is recorded in the verdict: the
counterfactual must still be exactly zero, restoration must still meet the
standard below, the raw captures and their strict verdict are retained, and the
same delivered `.epe` evidence is required. A behind-surface gauge additionally has to lie over
the captured surface, because a gauge that cannot paint into a capture cannot
explain a pixel in it. This is not a region or a tolerance, and it qualifies
nothing on its own: the narrow Transition palette is behind the same gauge and
stays red, because normalizing the gauge leaves its difference untouched.

Jon decided on 2026-09-18 that restoration qualifies when it is byte-exact, or
when its residual is independently demonstrated to be a systematic side effect
of the proof's own mutation. The demonstration is fixed and narrow: the restored
controls for that version, taken from independent opens, must be byte-identical
to each other, and the candidate's raw-versus-restored changed pixels must equal
the pristine-control-versus-restored-control difference position for position and
value for value. One residual pixel the controls did not reproduce identically
refuses, and restored controls that disagree with each other refuse this path
entirely - that case remains the raster-noise classifier's. The path is open only
while the counterfactual and both repeat captures are exactly zero, and it
forgives nothing else: every artifact, byte-truth, fill, raw DOM, style,
non-comparable-capture and gauge-placement refusal is untouched. It is not a
tolerance, mask, threshold or pixel-count cap. The verdict reports it distinctly
as `qualified-with-demonstrated-restoration-side-effect`, carrying the residual
count, maximum channel delta and positions, and the raw strict refusal is
retained beside it. At 390 the demonstrated path covers only the `fresh` narrow
`whole-editor` and `preview-strip` rows: each reports 8 raw pixels at channel
delta 212, and restoring the v2 gauge slots deterministically re-rasters six
preview help-icon pixels by one channel level at (181, 256), (183, 256),
(185, 256), (181, 257), (182, 257), (186, 257) on `whole-editor` and (181, 8),
(183, 8), (185, 8), (181, 9), (182, 9), (186, 9) on `preview-strip`, reproduced
position for position and value for value by the independent control pair;
`stock-lesson` narrow `whole-editor` is exactly zero in the `tip-b8da932e` run
and carries no gauge qualification. Since `b8da932e` the oracle refuses a raw
difference its independent control pair does not reproduce, reason
`raw-difference-not-reproduced`.

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
