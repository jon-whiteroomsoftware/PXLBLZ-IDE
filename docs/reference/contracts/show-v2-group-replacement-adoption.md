# Group Clip Pattern replacement adoption

The v2 route pilot exposes definition-local Group Clip Pattern replacement
through `ShowEditor.tsx`, the pure planner in
`showV2GroupReplacementEditorModel.ts` and the closed typed admission wrapper
`admitShowV2PilotGroupReplacementEdit`. The pure owner and its rules are the
[definition-local replacement contract](show-v2-group-replacement.md); this
contract describes only what adoption adds.

## Explicit target context

The panel lists one entry per authored definition-local Clip, never a
materialized occurrence child. Each entry carries its definition, local Clip,
current Pattern name, the actual `linked-occurrences` or `dormant-definition`
context and its distinct source runtimes. The operator selects that entry
explicitly; selection elsewhere in the route never becomes a Group edit target.
A linked entry states how many occurrences the edit changes and that Make Group
Unique comes first to select one occurrence. A dormant entry states that only
the local template changes.

## Trusted metadata and identity

Incoming Pattern reference, name and exported sliders come from the same
captured bundle boundary the ordinary Clip replacement adapter uses
(`resolveCapturedShowPatternReplacementV2`). The submitted intent carries only
the structured `patternReference`; the adapter resolves metadata itself, so a
caller cannot supply guessed controls, a name or source text. An unresolvable,
malformed or unavailable source refuses before any identity is allocated.

`planShowV2GroupReplacementEdit` allocates every required fresh identity exactly
once, at submission, from the caller's allocator: the split slot, one
destination runtime per distinct shared source, and complete track/key
identities over the retained effective (linked) or local (dormant) instance
tracks. Freshness is checked against every authored ID in the record, its
materialized projection and every definition-derived default runtime ID; a
conflicting allocation refuses instead of retrying. Sole sources plan `retain`
and allocate nothing. A split is planned only where the owner requires one.

## Animation-loss confirmation

`previewShowV2GroupReplacement` projects the owner's reported discarded control
targets from the same captured metadata without allocating anything. When the
projection is non-empty the panel presents an explicit confirmation naming the
dropped controls; adoption happens only on confirm. Cancel adopts nothing,
allocates nothing and leaves the record, history and provider untouched. The
owner's result remains authoritative for the reported loss.

## Admission

`admitShowV2PilotGroupReplacementEdit` validates the complete closed intent
shape — exact fields for each context, slot plan and runtime plan, with
non-blank string identities — before the private prepared-edit dispatch runs
the pure owner. It reuses the shared admission path: revision, record, provider,
dependency and route-lifetime eligibility are rechecked before and after owner
work; one candidate is prepared, adopted, saved and recorded in history; a
refusal or no-op performs zero writes and creates no history entry or timestamp;
a failed save rolls back and an explicit retry adopts the rolled-back record.

Outcomes report the Group affected vocabulary: definition, local Clip/slot,
changed occurrence bindings, modified/copied/hoisted runtimes, copied and
removed track and key owners, removed IDs and discarded control targets. An
owner refusal is returned as `source: 'owner'` with the owner's exact code and
message; admission refusals keep their own codes.

## Evidence and limits

[Planner tests](../../../src/engine/showV2GroupReplacementEditorModel.test.ts)
prove target listing, loss projection equal to the owner's reported loss, exact
plans for shared/sole/dormant/hoisted-default partitions, refusal before
allocation, and Fast and Fidelity frame and export equality against an
independently authored replacement through reopened records, with the retained
ordinary user matching its preimage.
[Admission tests](../../../src/store/showV2GroupReplacementAdmission.test.ts)
prove one provider write and history entry, exact affected collections, dormant
and hoisted-default adoption, atomic mixed sole/shared refusal with zero writes,
malformed ingress, stale record/provider and save rollback.
[`e2e/show-v2-group-replace.auth.spec.ts`](../../../e2e/show-v2-group-replace.auth.spec.ts)
drives the real pilot route: dormant replacement, validated no-op, cancelled
confirmation, linked fork, atomic mixed refusal, Undo/Redo, Make Group Unique
followed by unique-occurrence replacement, saved reload, cold page reload,
native artifact reopen, Fast and Precise Stage captures and desktop/390 px
keyboard checks with zero browser errors.

Timeline selection, Group deletion, command and MCP surfaces, and any compiler
or schema widening remain separate owners. The panel offers no implicit
occurrence isolation: Make Group Unique stays an explicit separate edit.
