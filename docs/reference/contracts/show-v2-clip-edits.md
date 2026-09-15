# Additive v2 Clip edit contract

`editShowClipV2(record, intent)` supplies immutable held-appearance edits for the
provisional v2 engine. It is not connected to production commands, the editor,
history, or persistence. Those callers must not treat its existence as v2 rollout.
Accepted product behavior is recorded in the
[authoring decisions](../../plans/show-v2-accepted-authoring.md).

## Results and ownership

A changed result contains an unaliased, fully validated replacement plus affected
Clip and animation-track IDs. A refused or unchanged result returns the original
record by reference and empty affected lists. The input never changes. Timestamps,
Show End, unrelated choreography, Pattern instance identity and source remain
unchanged; the adoption owner controls timestamps, history and saving.

Move translates held keys and Clip-owned animation by the requested delta.
Instance animation translates only for a sole Clip user; shared-instance,
Layout and Show animation remains fixed. Activation intervals and keyframes move
together, preserving easing and values.

Trim accepts a nonempty subinterval. It removes excluded held changes, seeds the
new start from the held value, and retains changes strictly before the new end.
Extend accepts an interval containing the existing Clip and holds its boundary
values. Neither operation stores discarded keys for future restoration.

Split requires a strict interior time and a caller-supplied fresh nonblank Clip
ID. The left Clip retains its identity; the right shares its instance and starts
with the held boundary value. Held-key IDs are scoped to their owning Clip and
are preserved when their value is reused; splitting does not mint a runtime.

## Current admission domain

The owner validates the complete preimage and final candidate. Times must be safe
integer milliseconds within Show End. Collisions and invalid references refuse
atomically. A no-op returns the original valid record without running an edit.

Actual edits currently require a Continue Clip, no Transition records, no Group
occurrences and one full-Show Layout occurrence. The Clip's Zone must be present
in that Layout. A Layout without logical routing or explicit ranges uses the
existing nominal-Zone fallback. General Layout changes and shared clock-reset
semantics need their dedicated owners.

Trim, Extend and Split refuse when the Clip or its instance has animation
tracks: exact curve restriction is not implemented. Move supports those tracks
according to ownership, with complete candidate validation. These temporary
restrictions define this additive foundation; they do not narrow the accepted
completed-product behavior or change production v1 operations.

## Evidence

[Public edit tests](../../../src/engine/showClipsV2.test.ts) exercise immutable
results, serialized/reopened records, held-change boundaries, trim/extend and
split/move sequences, invalid intents, collision refusal, animation ownership,
and Layout availability. Reopened records compile through the preparation seam
and run in Fast and Precise modes. Split preserves frames and private state
through the next loop; trim/extend matches an independently authored dim Show.
Precise-mode timestep rounding near Clip end is compared against that reference,
while interior pixels have explicit expected RGB values.

Three targeted mutations were rejected: missing Move time translation, retaining
the original value after Trim, and restarting on Split. This qualifies those
faults, not the complete future authoring surface. UI, durable provider writes,
actual Undo/Redo integration and nonlinear curve edits are not proven here.
