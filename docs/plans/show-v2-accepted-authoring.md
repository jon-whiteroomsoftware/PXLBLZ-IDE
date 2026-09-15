# Accepted Show v2 authoring decisions

> Historical planning record. The current design and worker contract is the
> [Scene-free Show implementation specification](scene-retirement-specification.md).
> Read that document for implementation; superseded proposals and provisional gates
> below are retained solely as provenance.

Jon accepted these decisions in the #1033 design discussion on 2026-09-15.
They supersede conflicting proposals in the frozen
[Scene-retirement tracer plan](scene-retirement-design.md) and the historical
[design assessment](scene-retirement-design-assessment.md). The frozen plan and
provisional schema remain baseline artifacts for the existing parity report;
accepting product behavior does not silently change those artifacts or claim
that the full migration is implemented.

## Clip appearance and editing

One Clip owns held appearance changes. Editing at the selected time applies
until the next change; applying a value to the whole Clip is explicit.

Move translates the Clip and its owned appearance times together. Trim removes
excluded changes and retains the appearance at the new start. Extending an edge
holds the nearest retained appearance into the added interval. Persisted Clips
contain no trimmed-away appearance history. Extending after reopening behaves
like extending before saving. The existing session Undo owner restores the
pre-edit record; this decision does not make Undo durable across reloads.

Split preserves appearance on both sides and keeps the existing Pattern
instance. Splitting by itself neither restarts the clock nor creates a runtime.

Animated curves must retain their exact shape and timing on the retained
interval after trim or split. Sampling just the boundary value is insufficient
for nonlinear curves. Extension holds the boundary value rather than reconstructing
removed animation. Exact restriction of supported curves needs separate proof.

## Runtime ownership and clock

Pattern instances are shared by default. Repeated Group occurrences and ordinary
duplication reuse their instances unless the author explicitly chooses otherwise.
Adding a Pattern reuses its sole existing instance; when multiple independent
instances exist, the author chooses one. Equal source text alone does not
establish identity. Migration must preserve explicitly distinct existing runtimes.

**Restart clock** resets time on the existing instance. It affects all Clips
sharing that instance, including currently visible Clips. It does not imply
resetting arbitrary Pattern variables or returning every Pattern to its opening
appearance. **Make independent** is a separate explicit operation creating an
instance. This supersedes the earlier proposal that Restart creates an instance.
The tracer's existing `entryPolicy` is not proof of this newly accepted behavior;
clock-event representation and deterministic replay remain implementation work.

Clip-owned animation follows a moved Clip. Instance-owned animation follows it
only if it is the instance's sole Clip user; shared-instance animation stays at
its authored Show times. Show-wide and Layout animation stays fixed. This does
not authorize trimming another user's shared animation when one Clip is trimmed.

## Layers, Groups and Layouts

Each Layer belongs to one Zone throughout the Show. Its identity, name and
stacking order persist through empty stretches. Moving a Clip across a former
Scene edge creates no new Layer. Migration must reconcile legacy local identities
without silently merging conflicts.

Each Group occurrence explicitly maps its internal Layers to destination Show
Layers. Existing mappings persist; ambiguous destinations require author choice.
Groups share Pattern instances by default, including across occurrences.

Clips and Groups continue through Layout changes without Restart. Their Zones
must exist throughout their intervals. An edit violating that requirement refuses
explicitly. Availability, Group materialization and collision proof are still
required before those edits enter the supported domain.

## Transitions, Insert Time and Markers

Scene removal preserves existing supported Transition behavior and visual output.
Current tracer refusals are evidence gaps, not acceptable permanent restrictions
on previously supported Shows. Multiple independent simultaneous Transitions
remain deferred. Exact participant/scheduling representation still needs proof.

Insert Time shifts later content, extends a crossing Clip, holds the boundary
appearance and animated values during the inserted interval, then resumes the
remaining animation. Insertion inside a Transition refuses until preservation
is proved. The detailed handling of crossing Group occurrences and other global
intervals must follow their ownership and receive evidence before admission.

Existing Scene names become timeline Markers at their original times; identical
name/time pairs deduplicate. Markers do not change playback and can be hidden
together. Structural Scene duration and identity retire after semantic projection.

## Authorized implementation batch

This batch reconciles #1033 and starts an independent #1038 engine foundation.
The coordinator owns implementation and proof. A separate `gpt-6-astra` reviewer
at `medium` reviews exact candidates with Jon's explicit same-family override.
Verified increments land locally. The full Transition owner, editor pilot,
shared-clock-reset implementation and broader migration remain separate slices.

The first owner supports held-appearance Move, Trim, Extend and Split, and
animation movement according to the accepted ownership rule. It returns complete
immutable replacements, unchanged inputs for refusal/no-op, and affected IDs.
The [bounded engine contract](../reference/contracts/show-v2-clip-edits.md)
names its current supported domain. It does not replace the production v1
editor, command, history, or persistence owners.

Animated trimming/splitting, connected Transitions, Group materialization,
Layout crossing, new clock-reset semantics, instance selection, Insert Time and
Marker UI remain explicitly unimplemented here. Full #1038 still depends on
#1035, #1036, #1037 and #1044. These dependencies do not block this independently
qualified foundation, as authorized by Jon.
