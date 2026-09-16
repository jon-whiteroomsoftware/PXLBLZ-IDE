# Native ordinary Clip appearance adoption

Canonical vocabulary and semantics live in the Scene-retirement specification
§§6/9 and [Clip edit contract](show-v2-clip-edits.md). This slice adopts the five
existing appearance bodies without changing that pure owner.

`ShowV2AppearanceEditor` targets the route's explicit ordinary Clip selection.
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
it never infers adjacency from the first span. No Effect removal is exposed.
Each required fresh ID is allocated once at submission, never per span or with
retry: interior add/duplicate uses one key ID and one Effect ID. Start/existing
key operations retain the exact key with no key allocation.

`admitShowV2PilotAppearanceEdit` accepts a closed typed appearance intent plus
the existing prepared capture/context. Runtime ingress checks exact operation,
scope and identity shapes; the existing owner checks values and the complete
candidate. All fourteen timeline affected collections are returned, including
actually changed appearance keys and empty property/removal/control collections.
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
