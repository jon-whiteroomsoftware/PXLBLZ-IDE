# Native ordinary Clip appearance adoption

Canonical vocabulary and semantics live in the Scene-retirement specification
§§6/9 and [Clip edit contract](show-v2-clip-edits.md). This slice adopts the five
existing appearance bodies without changing that pure owner.

`ShowV2AppearanceEditor` (removed by #1067 Stage 1) targeted the route's explicit ordinary Clip selection.
Its key combines Show and Clip, retiring callbacks/drafts on selection changes.
Scope starts unselected; selected-time requires explicit global milliseconds
inside `[Clip start, Clip end)`. Whole-Clip values are uniform or mixed across
every authored span. Only independently dirty opacity/brightness/phase/mirror
fields enter a patch; unedited mixed values stay exact. Numeric controls retain
local string drafts, including incomplete values, without clamping. Raw finite
and descriptor validation remains in the pure owner before normalization.

The read-only model exposes the intersection of exact Effect IDs/kinds across
the selected stacks. Add uses registry defaults and an explicit fresh ID.
Update uses the registry's numeric/color descriptors and each span's own values.
Duplicate copies each selected span's source and leaves animation attached to
the original. Reorder supplies an explicit same-stage target and before/after;
it never infers adjacency from the first span. Remove takes the same exact
source identity and applies the cascade below.
Each required fresh ID is allocated once at submission, never per span or with
retry: interior add/duplicate uses one key ID and one Effect ID. Start/existing
key operations retain the exact key with no key allocation.

## Optional held components

`SHOW_V2_APPEARANCE_COMPONENT_FIELDS` enumerates every Transform, Aperture,
Presentation and Blink field the pure owner patches, including Aperture shape,
edge and each shape-owned parameter. The editor renders them in the same patch
form as opacity/brightness/phase/mirror and keeps the same discipline: only
independently dirty fields enter one patch, drafts are not clamped or
normalized, an absent component reads as an empty draft and differing spans read
as Mixed. Nothing substitutes a default for an absent component.

`presentation` and `blink` are closed discriminated values, so the owner needs
them complete. An undirtied member falls back to its uniform authored value; a
mixed or absent one leaves the request incomplete and the owner refuses it. The
editor never invents the missing member.

Removal is explicit and separate from the dirty patch: one Clear component
choice submits exactly one owner-accepted null — a whole Transform, Aperture,
Presentation or Blink, or one of the twelve nullable Aperture fields.
`appearanceRemovalPatch` refuses any other target.

## Effect removal

`remove-effect` is the v2 expression of legacy `remove_clip_effect`. Legacy
filtered the placement's Effect stack and then pruned, through
`pruneRemovedEffectPropertyTracks`, every Scene Property track whose
`placement-effect` target named a placement of the same logical Clip and no
longer resolved; other Effects, tracks and their order survived. The audited
legacy behaviour and its source references are recorded in the
[surface audit](../evidence/issue-1038-appearance-surface/surface-audit.md).

The v2 owner removes the Effect from the selected held stacks, whole-Clip or
selected-time, and removes a Clip-owned `clip-effect` track naming that exact
Effect ID and kind on that Clip when a held span intersecting the track's
activation no longer carries the Effect. Removed track IDs are reported in
`affectedTrackIds` and `removedIds`, and their keyframes in
`affectedPropertyKeyIds`. Animation whose activation stays inside spans that
keep the Effect is retained with its exact retained curve descriptors. Tracks on
other Clips, instance-target tracks, Group definitions and every other held
component are untouched. A Transition property ramp still targeting the removed
Effect is never silently deleted: the existing reference check refuses the whole
edit, names the Transition and returns the original record. Removal requires the
exact Effect in every selected stack; a partial or missing stack refuses.

Emptying a Clip's whole Effect stack removes the Effect stage's incidental
clamp, so the compiler's existing Precise divergence for a Pattern whose
arithmetic already exceeds 16.16 becomes visible on other users of the shared
runtime. An independently authored no-Effect record reproduces it identically,
so it is measured, not introduced:
[removal-precise-residual.json](../evidence/issue-1038-appearance-surface/removal-precise-residual.json).
Fast output and every elapsed clock stay exact.

Unsupported timed Effect reordering still refuses unchanged, and no compiler
work was added for it. Whether that refusal becomes the accepted product
behaviour awaits Jon's decision; it is recorded here as pending, not accepted.

`admitShowV2PilotAppearanceEdit` accepts a closed typed appearance intent plus
the existing prepared capture/context. Runtime ingress checks exact operation,
scope and identity shapes; the existing owner checks values and the complete
candidate. All fourteen timeline affected collections are returned, including
actually changed appearance keys, and the track, property-key and removal
collections that only Effect removal populates.
Owner no-op/refusal preserves current identity and skips candidate preparation,
history and save. Prepared refusal can inspect the candidate but never adopts it.
Changed candidates must still prepare/compile ready with captured dependencies
before one existing `updateShowV2Pilot` replacement/history/queued provider save.

The shared parent capture binds provider, record and dependency identity before
retained callback invocation. Completion receipts bind provider/record/revision;
retired child lifetimes and superseded completions cannot publish feedback into
new selection/workspace state. Pending operations block duplicate submission.
Owned save failure restores current authored fields/history through the existing
rollback owner; no new save, queue or history implementation is introduced.

Structural success is distinct from final prepared admission. Opposite held
Effect order/runtime-sharing, participant property and static cache restrictions
remain named unresolved integration cases and refuse atomically before adoption.
The exact native EPE Fast/Precise oracle compares candidate to independently
authored complete keys. Measured neutral saturation/contrast Fast arithmetic
and landed unsplit Precise one-LSB sectioning evidence remain explicit:
[integration cases](../evidence/issue-1038-appearance-adoption/integration-cases.md).
No compiler, lowering, runtime identity or format repair occurs here.

Proof: focused public model/admission/component/parent tests and imported native
EPE consumers; authenticated thirty-second UI fixture covers explicit mixed
patches, held insertion, Effect operations, history, reload/cold reopen and
keyboard/desktop/narrow views. Fresh final-base browser capture and coordinator
review/final suites are recorded separately in the evidence packet.

## Exact color drafts

Shadow/highlight Color-map mixed detection compares the persisted RGB channel
tuples before converting a uniform value to its 8-bit display color. Distinct
authored channels remain mixed even when their rounded hex strings match. A color
parameter requires an explicit dirty draft before submission: merely opening or
applying its lossy display cannot replace exact authored channels. Direct form
submission has the same guard. Changing Clip, scope/time, Effect/parameter or the
current record clears that draft; a deliberate color edit still delegates to the
unchanged numeric/Effect owner and prepared adoption. Numeric untouched no-op
behavior stays unchanged. The [corrective packet](../evidence/issue-1038-appearance-color/test-design.json)
records all six channel partitions and actual zero-write versus explicit-save proof.
