# Show command semantics

The Show command registry in
[`src/engine/showCommandsV2/`](../../../src/engine/showCommandsV2/registry.ts)
defines edits over `ShowRecordV2` for callers of `applyShowCommandV2` and
`runShowCommandV2Transaction`. A command returns a candidate Show or a typed
refusal; the caller owns adoption, history, and persistence. This agreement
covers the registry, not every direct engine mutation or editor gesture.

MCP applies commands through `applyPrivateCommand` in
[the private executor](../../../src/engine/agentPrivateExecutor.ts), which
refuses any record that is not v2 with `unsupported-schema-version`. The v1
registry is retired; see
[differences from the retired v1 registry](#differences-from-the-retired-v1-registry).

Command evaluation has no live preview or Controller publication side effects.
Only the adopted final candidate enters the editor's [preview and delivery
publication policy](show-state-history-persistence.md#preview-and-delivery-publication).

## Agreement

- Commands preserve their input record on acceptance and refusal. Callers use
  the returned record rather than expecting an in-place edit.
- Registry names and each descriptor's fields define the invocation interface.
  Unknown commands and missing, mistyped, or unknown arguments produce typed
  issues. Domain refusal carries a reason; optional remedies and candidates
  help the caller recover. Descriptor schemas own invocation shape; the
  [generated coverage report](../show-command-coverage.md) owns the inventory.
- A valid, already-satisfied request is a no-op: it returns the original record
  with zero changes and no timestamp. A no-op step contributes no change and
  does not abort its containing batch
  ([`registry.ts:366-371`](../../../src/engine/showCommandsV2/registry.ts));
  only a refusal aborts a transaction.
- Stable identities from `read_show` address existing targets, Layers
  included (`layer_id`). Moving or resizing a Clip retains its identity;
  creation and removal follow their command's semantics. Names, selection,
  timeline positions and stacking indices do not replace those identities
  ([`census.test.ts`](../../../src/engine/showCommandsV2/census.test.ts)
  rule 1).
- A transaction evaluates commands in order against successive candidate
  records. The first refusal returns its zero-based step and issues, without
  returning a partially accepted record. Earlier successful steps do not
  mutate the caller's original record
  ([`registry.ts:373-389`](../../../src/engine/showCommandsV2/registry.ts)).
- A successful transaction returns one candidate and its accumulated changes.
  Persisting that candidate once is the caller's responsibility and is what
  gives the batch one editor history entry. Evaluation itself writes no store
  or durable state. An empty transaction returns the original record.

## Limits callers must preserve

The registry validates invocation shape and delegates domain acceptance to the
command ([`registry.ts:349-366`](../../../src/engine/showCommandsV2/registry.ts)).
It does not establish a universal final-document validation pass or
hardware delivery readiness. Each command still applies its own preconditions
inside a transaction; a batch cannot assume every temporarily invalid
intermediate state is permitted.

The descriptor's `touches` paths
([`registry.ts:164-165`](../../../src/engine/showCommandsV2/registry.ts))
describe possible writes. They are not a read
set or a proof that two commands commute. This interface supplies no document
revision comparison, concurrent merge, cancellation, or persistence guarantee.
See [Show state, history, and persistence](show-state-history-persistence.md)
for adoption and save behavior.

### Bulk commands

`create_clips`, `create_layers`, and `update_clips` apply their items in
payload order as one atomic candidate, and each item's owner validates its step
against the candidate so far
([`support.ts:99-125`](../../../src/engine/showCommandsV2/support.ts)). Items
take the shape published by the
[versioned authoring reference](../../../src/engine/showCommandsV2/authoringReference.ts)
and [`clipSpec.ts`](../../../src/engine/showCommandsV2/clipSpec.ts); there is
no final-state exception. A swap
or rotation whose intermediate arrangement collides therefore refuses; order
the items so every step is valid. `update_clips` checks every Clip identity
against the original record, refuses a Clip patched twice, and fills omitted
placement fields from the original Clip
([`clips.ts:100-120`](../../../src/engine/showCommandsV2/clips.ts)).

The operation remains all-or-nothing through caller adoption. `create_clips`
timing is exact: nothing clamps and Show End never grows
([`clips.ts:42`](../../../src/engine/showCommandsV2/clips.ts)). `update_clips`
moves a Transition-connected Clip's whole connected component rigidly; a Zone
or Layer change refuses for a Transition participant, an occupied destination
Layer, or a destination Zone missing from the active Layout
([`clips.ts:89`](../../../src/engine/showCommandsV2/clips.ts),
[`showClipTemporalV2.ts:99-121`](../../../src/engine/showClipTemporalV2.ts)).
Instance values affect every Clip sharing that runtime and are reported in the
affected set. The 128-item bound is part of the schema and refuses with
`batch-too-large` rather than truncating
([`registry.ts:252-253`](../../../src/engine/showCommandsV2/registry.ts)).

One successful bulk command returns one aggregate change whose details merge
every item's affected collections
([`support.ts:122-124`](../../../src/engine/showCommandsV2/support.ts)).
`create_layers` with Clips is the exception: it returns exactly two changes, one
aggregate for all Layers followed by one aggregate for all Clips, both tagged
`create_layers`
([`layers.ts:145-153`](../../../src/engine/showCommandsV2/layers.ts),
[`clipSpec.ts:293`](../../../src/engine/showCommandsV2/clipSpec.ts)). A
valid full no-op returns the original record and no change, so callers create
no activity, timestamp, history, adoption, or save entry.

## Exact timeline markers

`add_marker`, `update_marker` and `remove_marker`
([`markers.ts`](../../../src/engine/showCommandsV2/markers.ts)) share
[one Marker owner](../../../src/engine/showMarkersV2.ts) with the editor's
prepared-edit admission
([`showV2PreparedEditAdmission.ts:154-155`](../../../src/store/showV2PreparedEditAdmission.ts)).
There is no separate move command: `update_marker` moves a Marker through its
`at_ms` field. `at_ms` is a schema-bounded nonnegative safe integer
([`support.ts:175-177`](../../../src/engine/showCommandsV2/support.ts));
fractional, nonfinite, negative and unsafe values refuse before the owner runs,
and nothing rounds or clamps. Times beyond Show End remain supported; such a
Marker stays dormant. Marker edits preserve every unrelated authored record and
reference, including composition ordering and the edited Marker's conversion
provenance. Only the Marker collection is sorted by time then id; removing its
final member leaves an empty collection
([`showMarkersV2.ts:64-74`](../../../src/engine/showMarkersV2.ts)).

A missing target refuses with `unknown-id` and the current Marker identities
([`markers.ts:69-71`](../../../src/engine/showCommandsV2/markers.ts)); the owner
refuses a duplicate Marker identity, and an `update_marker` naming none of
`name`, `color`, `at_ms` and `role` refuses by schema. A valid same-value update
returns the original record and zero changes, without a timestamp, adoption,
history entry or save. Input and Marker identity validation precede that result.
Name and color are optional strings of at most 200 and 64 characters. `role` is
the one nullable input: it accepts `chapter`, and `null` clears the chapter
role.

Marker edits do not normalize the whole composition: that would change
unrelated authored ordering. The owner validates both the input record and the
candidate ([`showMarkersV2.ts:39-40, 75-76`](../../../src/engine/showMarkersV2.ts));
markers acquire no narrow concurrency authority.
[Owner tests](../../../src/engine/showMarkersV2.test.ts) and the Marker case in
[`commands.test.ts:630`](../../../src/engine/showCommandsV2/commands.test.ts)
record preservation, ordering, clearing and the chapter role.

## Internal exact Clip resize

`resize_clip` takes `clip_id` and exactly one of `end_ms`, `duration_ms` and
`start_ms` ([`clips.ts:257-281`](../../../src/engine/showCommandsV2/clips.ts)).
`end_ms` or `duration_ms` is a trailing resize that keeps the start fixed;
`start_ms` is a leading resize that keeps the end fixed. The command sends the
new range to the temporal owner `editShowClipTemporalV2` as a trim when it lies
inside the current Clip and as an extension otherwise
([`clips.ts:63-68`](../../../src/engine/showCommandsV2/clips.ts)). The owner
returns a changed record, a valid already-satisfied no-op, or a typed refusal;
all outcomes preserve the supplied record. It validates the input record and its
Layout availability before judging the range, which must be positive, in safe
integer milliseconds, and inside Show End
([`showClipTemporalV2.ts:64-87`](../../../src/engine/showClipTemporalV2.ts)).

A trailing resize ripples the successors of the Clip's one outgoing Transition
by the end delta and preserves Transition durations. A leading resize changes
the one incoming Transition's duration by the same delta and retimes its
Property ramps. When `start_ms` reaches or passes that Transition's window
start, the Clip extends to `start_ms` and the Transition is removed in place;
nothing ripples and Show End stays fixed. Removing a Transition that carries
Property ramps other than Clip value ramps needs a projection plan that
`resize_clip` never supplies, so it refuses `unsupported-property-carrier`. A
Clip with more than one incoming or outgoing Transition, or one sharing a common
Transition window, refuses `invalid-topology`. A Transition converted from a
retired v1 Scene boundary (history) cannot be extended into; shrinking away from
it commits that boundary's cut-and-reclaim repair
([`showClipTemporalV2.ts:182-245`](../../../src/engine/showClipTemporalV2.ts)).

Unrelated Clips remain fixed and Transitions retain their identities and
visual settings. Held appearance keys are retained inside the new range and
Clip-owned tracks are remapped from the preimage. The candidate is validated
whole, then for Layout availability and Transition placement restrictions; an
occupied range refuses
([`showClipTemporalV2.ts:231-255`](../../../src/engine/showClipTemporalV2.ts)).
The change details report affected Clips, Transitions and tracks through the
shared affected-entity vocabulary.

The operation requires a valid input record. A registry transaction accepts a
no-op before or after a changed step; arbitrary temporarily invalid
intermediates remain outside the contract.
[`commands.test.ts:470-540`](../../../src/engine/showCommandsV2/commands.test.ts)
covers trailing, leading and Transition-closing resize and the occupied-range
refusal.

## Logical Clip splitting (#951)

`split_clip(clip_id, at_ms)`
([`clips.ts:283-300`](../../../src/engine/showCommandsV2/clips.ts)) and the
manual split
([`showV2ClipTemporalPlanning.ts:396-406`](../../../src/engine/showV2ClipTemporalPlanning.ts))
send the same `split` intent to the temporal owner. `at_ms` is a safe-integer
global millisecond strictly inside the Clip; nothing rounds. Exact Clip edges,
an invalid input record and fresh-identity collisions refuse without changing
the input ([`showClipTemporalV2.ts:63-85`](../../../src/engine/showClipTemporalV2.ts)).
A Group child is not an authored Clip, so the command refuses it as an unknown
identity and the manual split refuses it before the owner. This operation does
not split Groups.

The left Clip keeps its identity and its incoming Transition endpoints; the
command mints the right Clip's identity
([`clips.ts:295`](../../../src/engine/showCommandsV2/clips.ts)). The right Clip
shares the same Pattern instance, takes entry policy `continue`, and does not
inherit conversion provenance. Held appearance keys divide at the split time,
with derived identities on the right. Clip-owned tracks split through the
Property owner. Outgoing participant endpoints, whole-output sources and
outgoing Clip-value ramps retarget to the right Clip; Transition identities,
durations and parameters remain unchanged
([`showClipTemporalV2.ts:160-180`](../../../src/engine/showClipTemporalV2.ts)).

The split changes only the target Clip, its tracks and attached Transition
endpoint references. Unrelated Layer ordering, Groups, Markers and other
authored values survive without whole-composition normalization, and the
candidate is validated whole
([`showClipTemporalV2.ts:249-255`](../../../src/engine/showClipTemporalV2.ts)).
The store and file importer retain their separate normalization boundaries.

[`commands.test.ts:326`](../../../src/engine/showCommandsV2/commands.test.ts),
[owner tests](../../../src/engine/showClipsV2.test.ts) and the `SC951` rows in
[the agent baseline](../../../e2e/agent-baseline.auth.spec.ts) exercise complete
records, refusal and split-then-edit.


## Logical Clip duplication (#951)

`duplicate_clip(clip_id, start_ms, zone_id?, layer_id?, independent?)`
([`clips.ts:302-364`](../../../src/engine/showCommandsV2/clips.ts)) and
manual **Clone**
([`ShowEditor.tsx:1441-1464`](../../../src/components/ShowEditor.tsx)) share
the duplication owner in
[`showClipsV2.ts`](../../../src/engine/showClipsV2.ts). Manual Clone places the
copy immediately after the source Clip, on its Zone and Layer, with the same
duration; the command places it at `start_ms`, defaulting Zone and Layer to the
source's. The copy shares the source Pattern instance, minting no runtime of its
own, and carries the source's entry policy. Manual Clone always shares; the
command shares unless `independent: true` is supplied, which then gives the copy
a fresh Pattern instance with copied controls and eligible instance tracks
([`clips.ts:351-397`](../../../src/engine/showCommandsV2/clips.ts)). Clip-owned
property tracks and appearance keys are copied in either mode, with fresh
identities and times shifted by the copy's offset. Original curves remain
unchanged.

The copy must lie in safe-integer milliseconds inside Show End. It may land in
another Layout occurrence; a destination Zone unavailable in a Layout occurrence
the copy covers refuses, as do an occupied destination, a Transition placement
restriction, and an incomplete or colliding identity plan. Conversion provenance
is not copied. Every accepted result validates without normalizing unrelated
authored records; existing Transitions, Groups, ordering and shared users remain
unchanged, and no attached Transition is copied
([`showClipsV2.ts:126-239`](../../../src/engine/showClipsV2.ts)).

The command mints every fresh identity the owner requires
([`clips.ts:318-340`](../../../src/engine/showCommandsV2/clips.ts)). Store/file
normalization and whole-Show admission retain their existing ownership.
[`commands.test.ts:239`](../../../src/engine/showCommandsV2/commands.test.ts)
and [`showClipsV2.test.ts`](../../../src/engine/showClipsV2.test.ts) (including
the cross-Layout case at line 691 and the attached-Transition case at line 660)
cover full records, linkage and refusal; the `DC951` row in
[the agent baseline](../../../e2e/agent-baseline.auth.spec.ts) exercises
independent duplication through the bridge.

## Descriptor adapters and parity

Each descriptor owns its name, description, typed fields, `exactlyOne`,
`atLeastOne` and `atMostOne` groups, touch paths and `apply`
([`registry.ts:157-170`](../../../src/engine/showCommandsV2/registry.ts)). The
MCP catalogue
([`agentMcpRouting.ts:57-58`](../../../src/worker/agent/agentMcpRouting.ts))
and the harness grammar
([`catalogue.ts:1-49`](../../../src/agent-harness/grammar/operations/catalogue.ts))
derive their schemas from `SHOW_COMMANDS_V2` and convert only transport shape:
neither allocates identity nor restates a domain rule. Commands mint the
identities their owners require and pass owner refusal codes through
([`support.ts:79-125`](../../../src/engine/showCommandsV2/support.ts)).

Normalization belongs at the store/file boundary. Command owners edit a copy of
the record, preserve unrelated authored fields and order, and validate the
candidate rather than normalizing the whole composition.
[`commands.test.ts:185`](../../../src/engine/showCommandsV2/commands.test.ts)
compares a command's record and affected set with the manual owner's result for
the same intent, and
[`census.test.ts`](../../../src/engine/showCommandsV2/census.test.ts) enforces
the catalogue rules.

`create_clips`, `make_clip_pattern_independent` and
`rejoin_clip_pattern_instance` delegate to the Clip creation and identity
owners. Independence mints the fresh instance and copied track identities in
the command
([`clips.ts:367-397`](../../../src/engine/showCommandsV2/clips.ts)). Rejoin
collects the vacated runtime and its tracks only when nothing references them
([`clips.ts:461`](../../../src/engine/showCommandsV2/clips.ts)).

`insert_time(at_ms, duration_ms)` delegates to `insertShowTimeV2`. Content at
or after the point moves later, a Clip strictly spanning it extends with a fresh
held appearance key, a spanning Property track gains a hold key, a crossed Group
occurrence gains a Group-local hold, Layout coverage extends and Show End grows
by the duration. Insertion strictly inside a visual Transition or a timed Layout
transfer refuses ([`show.ts:214-229`](../../../src/engine/showCommandsV2/show.ts)).

`set_show_end(end_ms)` delegates to the Layout interval owner
([`show.ts:198-212`](../../../src/engine/showCommandsV2/show.ts)). Extending
stretches the final Layout occurrence and leaves authored content unchanged.
Shortening refuses `protected-content`, naming the protecting entity, when a Clip
contribution, Group contribution, Property activation or timed Layout transfer
would be cut; it never clamps. Otherwise it removes the Layout occurrences that
start at or after the new end and truncates the one containing it. Setting the
current Show End is a no-op
([`showLayoutIntervalsV2.ts:278-308`](../../../src/engine/showLayoutIntervalsV2.ts)).
Change targets are `insert-time` and `show-end`. The `AC951`, `IC951`, `RJ951`,
`IT951` and `SE951` rows in
[the agent baseline](../../../e2e/agent-baseline.auth.spec.ts) exercise these
commands through the bridge.

## Property tracks and keyframes

`add_property_tracks`, `update_property_track`, `edit_property_keyframes` and
`remove_property_tracks`
([`animation.ts`](../../../src/engine/showCommandsV2/animation.ts)) are Show
property tracks keyed by v2 target identity. They share the Property owner
`editShowPropertyV2` with the editor's prepared-edit admission
([`showV2PreparedEditAdmission.ts:171`](../../../src/store/showV2PreparedEditAdmission.ts)).
Tracks use global time with an explicit activation window
`[active_start_ms, active_start_ms + active_duration_ms)`. A valid
already-satisfied edit returns no changes after owner validation
([`showPropertyEditsV2.ts:91-93`](../../../src/engine/showPropertyEditsV2.ts)).

A command target names one of the short kinds `opacity`, `view-brightness`,
`view-phase`, each `transform-*` and `aperture-*` scalar, `effect`, `control`,
`time-scale`, `layout-split-position` and `show-repeat-scale`, and resolves it
into the persisted target union: Clip opacity, view, Transform, Aperture and
Effect parameter; instance control and time scale; Layout occurrence split
position; and Show repeat scale. Clip kinds need `clip_id`; `control` and
`time-scale` need `instance_id`; `effect` also needs an `effect_id` present on
the Clip and a `parameter`; `layout-split-position` needs `interval_id`. A
missing or unknown identity refuses with the track index
([`animation.ts:74-129`](../../../src/engine/showCommandsV2/animation.ts)).

`add_property_tracks` takes 1 to 128 tracks. Each gives exactly one of
`keyframes` (2 to 128 `{ at_ms, value, easing? }` entries) or a constant
`initial_value`, which seeds keys at both ends of the activation. Activation
defaults to the Clip span for a Clip target, the union of user spans for an
instance target, the interval for a split position, and the whole Show for
repeat scale; an instance with no Clip users needs explicit activation
([`animation.ts:131-220`](../../../src/engine/showCommandsV2/animation.ts)).
Easing normalizes once; values are not clamped. Two tracks that would own the
same instance target over overlapping activation refuse atomically.
`update_property_track` changes only the activation window: keyframes keep their
global times and must stay inside it
([`animation.ts:222-248`](../../../src/engine/showCommandsV2/animation.ts)).

`edit_property_keyframes(track_id, edits)` takes at least one of `add`,
`update` and `remove`, each 1 to 128 entries. Adds need a global time and value
and may name easing; updates name a `keyframe_id` and at least one of `at_ms`,
`value` and `easing`; removes name keyframe identities. Every update and remove
identity must exist on the track before any step runs. The command applies all
removals, then updates, then additions, each through the Property owner, which
validates the whole candidate after every step
([`animation.ts:290-341`](../../../src/engine/showCommandsV2/animation.ts),
[`showPropertyEditsV2.ts:47-93`](../../../src/engine/showPropertyEditsV2.ts)).
A time swap whose intermediate step is invalid therefore refuses; the whole
request is still atomic. Editing an endpoint or its easing reauthors the
adjacent segment and replaces any retained restriction descriptor.
`remove_property_tracks` removes tracks and their keyframes by identity and
refuses duplicate identities; Clips, appearance, Transitions and Show End stay
fixed.

Animation edits preserve unrelated track order; a new track is appended, and
only the edited track's keyframes are sorted
([`showPropertyEditsV2.ts:74-89`](../../../src/engine/showPropertyEditsV2.ts)).
[`commands.test.ts:737`](../../../src/engine/showCommandsV2/commands.test.ts)
adds tracks for each target kind, edits keyframes and removes by identity. The
`AK953`, `UK953`, `DK953` and `DPT953` rows in
[the agent baseline](../../../e2e/agent-baseline.auth.spec.ts) exercise the
keyframe and removal commands through the bridge. `APT953` (`add_property_tracks`)
is registered `pendingV2` as a `test.fixme` for the #1103 delivery-validation
defect, so no bridge row proves track creation.

## Clip Effect commands (#953)

`add_clip_effect`, `update_clip_effect`, `move_clip_effect`,
`duplicate_clip_effect` and `remove_clip_effect`
([`effects.ts`](../../../src/engine/showCommandsV2/effects.ts)) go through the
appearance owner `editShowClipAppearanceV2`, which the editor's prepared-edit
admission also calls
([`showV2PreparedEditAdmission.ts:169`](../../../src/store/showV2PreparedEditAdmission.ts)).
Each takes an `apply` selector: the whole Clip, or the held key at one global
time. The finite 22-kind enum is authoritative
([`support.ts:197-201`](../../../src/engine/showCommandsV2/support.ts)).
Parameters are a record of numbers or color strings named as in the
[versioned authoring reference](../../../src/engine/showCommandsV2/authoringReference.ts);
an unknown parameter name, or an `id` or `kind` patch, refuses
([`clipSpec.ts:185-196`](../../../src/engine/showCommandsV2/clipSpec.ts)). The
owner validates each value; `update_clip_effect` sends each parameter as its own
owner step and names the refused parameter
([`effects.ts:127-156`](../../../src/engine/showCommandsV2/effects.ts)). This is
a finite mapping, not arbitrary patching.

Update preserves Effect identity and stack order; the exact Effect must exist in
every selected held stack. Duplicate inserts a fresh identity immediately after
its source with the same parameter values. Move accepts exactly one of a step
`direction` or a same-stage `target_effect_id` with an optional `before`/`after`
edge; a cross-stage target refuses. Satisfied updates and stage-edge moves
return the unchanged record with no changes. When a move leaves duplicate Effect
identities on the Clip, the change description names the re-identified Effects.
Adding refuses when an active Property track targeting that Effect would find a
gap. Removal removes a Clip-owned Property track naming the Effect when an
appearance span its activation intersects no longer carries it; a surviving
Transition ramp refuses instead
([`effects.ts:95-244`](../../../src/engine/showCommandsV2/effects.ts)).
[`commands.test.ts:657-735`](../../../src/engine/showCommandsV2/commands.test.ts)
covers the stack operations, ordering and owner refusal codes; the `AE953`,
`UE953`, `DE953`, `ME953` and `RE953` rows in
[the agent baseline](../../../e2e/agent-baseline.auth.spec.ts) exercise them
through the bridge.

## Show metadata, output requirements and Layout occurrences

The metadata commands in
[`show.ts`](../../../src/engine/showCommandsV2/show.ts) own their record fields
and validate one complete candidate before returning
([`show.ts:28-43`](../../../src/engine/showCommandsV2/show.ts)).
`rename_show` trims a nonempty name. `update_zone` permits only the existing
Zone id plus at least one of name, nominal pixel count and color; names trim and
remain distinct (a collision refuses `duplicate-name`), counts are integers from
1 to 100000 by schema, and routing and Clips remain unchanged
([`show.ts:82-120`](../../../src/engine/showCommandsV2/show.ts)). Valid
already-satisfied metadata, Stage map, profile, output-contract and Trails
requests return the original record with zero changes and no timestamp.

`set_stage_map(stage_map_id)` sets or clears (`null`) the Stage map without
changing the output contract or Controller profile.
`set_target_controller_profile(profile_id)` is a distinct profile-only command;
`null` returns it to automatic selection. A blank identity refuses in both
([`show.ts:62-144`](../../../src/engine/showCommandsV2/show.ts)). No command
sets both at once. `set_output_contract` replaces the contract with
`portable-2d` or `installation` and aligns the Stage map with the contract map.
Missing or null `map_id` clears the contract map; pixel counts are integers from
1 to 100000 by schema
([`show.ts:146-171`](../../../src/engine/showCommandsV2/show.ts)).

`set_output_trails` requires at least one of `enabled` and `retention`. Omitted
`enabled` preserves the current enabled state, so retention-only while disabled
is a successful no-op. Enabling retains the current retention or uses the
existing default; `retention` outside [0, 1] refuses by schema rather than
clamping ([`show.ts:173-196`](../../../src/engine/showCommandsV2/show.ts),
[`support.ts:183-185`](../../../src/engine/showCommandsV2/support.ts)). These
commands edit Show requirements only and never request a Controller provider or
send to hardware. File dependency and delivery checks remain separate.

The Layout commands in
[`layouts.ts`](../../../src/engine/showCommandsV2/layouts.ts) delegate to the
Layout interval owner. `add_layout_interval` takes exactly one of `at_ms`, which
inserts a switch at a strict interior time without moving content, and
`duration_ms`, which appends after Show End and extends it; coverage stays
exactly one interval deep. `duplicate_layout_interval` places the copy
immediately after its source, empty by default or with its content when
`with_content` is true; later content moves once by the source duration, Show
End grows by it, copies share their Pattern runtimes, and content crossing the
interval end refuses. `make_layout_interval_unique` gives one occurrence its own
copy of the Zone Layout definition; Zone identities, Clips and Pattern runtimes
stay shared, and an occurrence whose definition is used once is unchanged
([`layouts.ts:31-125`](../../../src/engine/showCommandsV2/layouts.ts)). Show End
trims or extends Layout occurrences as described for `set_show_end` above.

[`commands.test.ts:33`](../../../src/engine/showCommandsV2/commands.test.ts),
the Layout interval cases at
[`commands.test.ts:540-627`](../../../src/engine/showCommandsV2/commands.test.ts),
and the `RN954`, `SM954`, `CP954`, `UZ954`, `OC954`, `OT954`, `AI954`, `DI954`
and `UI954` rows in [the agent baseline](../../../e2e/agent-baseline.auth.spec.ts)
exercise the finite surface.

## Differences from the retired v1 registry

The [coverage report](../show-command-coverage.md) carries the complete v2
catalogue, the v1 to v2 name map, the retired addressing table and the
refusal-code map.

Every MCP connection, bound or not, exposes the v2 catalogue (#1042). The
registered mutation tools, the server instructions, the schema and reference
resources, and the `list_commands` reply all describe that same vocabulary, so
a name a caller discovers is always a name it can call. `list_commands` reports
each descriptor's own `description`, `fields` and `exactlyOne`/`atLeastOne`/
`atMostOne` groups, including their typed nested field kinds.

A command sequence over a v2 record adopts through the store's v2
candidate-delivery admission, not through a second writer; see
[agent candidate application](agent-candidate-application.md#version-2-records-1039)
for the admission order and what a refusal leaves behind.

The agreement differs from v1 in five ways, and a descriptor census in
[`census.test.ts`](../../../src/engine/showCommandsV2/census.test.ts) enforces
each of them.

**Identity addressing only.** Every command takes stable identities from
`read_show`: `clip_id`, `layer_id`, `instance_id`, `transition_id`,
`interval_id`, `track_id`, `keyframe_id`, `marker_id`, `effect_id`,
`group_occurrence_id`. A derived Cut junction is addressed by its
`(from_clip_id, to_clip_id)` pair. `scene_id`, `layer: "main" | index`,
`overlay_layer_index`, the `at_ms` / `after_clip_id` Boundary lookup and
`target_clip_id` on rejoin all retire with no runtime alias. Layer stacking is
authored by `rank`, `above_layer_id` or `below_layer_id`; index words retire.

**A uniform no-op.** v1 validated some already-satisfied requests and refused
others. For every v2 command, an already-satisfied valid request
returns `unchanged` with zero changes, creates no history, timestamp or save,
and does not abort its containing batch. No v2 command refuses because the
desired state already exists; setting the current Show End is a no-op, not a
refusal. Only a genuinely invalid or refused request aborts a transaction.

**Fully typed inputs.** There is no `json` field kind. Closed sets are enums,
numeric ranges carry schema bounds rather than only descriptions, `null` is
accepted only where the field documents clearing, and bulk arrays carry 1 to
128 items. The Effect and Aperture shape parameters are compact records
validated by the appearance owner, with their names and ranges published in the
[versioned authoring reference](../../../src/engine/showCommandsV2/authoringReference.ts).

**One affected-entity vocabulary.** A changed command reports the same fourteen
collections in `changes[].details` — `clips`, `instances`, `transitions`,
`tracks`, `layoutDefinitions`, `layoutIntervals`, `groupDefinitions`,
`groupOccurrences`, `layers`, `markers`, `appearanceKeys`, `propertyKeys`,
`removed` and `discardedControlTargets` — translated from the owner's own
result without invention, widening or loss. Requested scope is the command
input; affected scope is this.

**Owner-backed refusals.** A command never restates a domain rule. It resolves
identities, mints the fresh identities its owner requires (a pure owner never
allocates identity), and passes the owner's typed refusal code through. Every
catalogue row now reaches a landed owner capability, so the catalogue
emits no `unsupported` code and the refusal-code map no longer publishes one.
The two rows that previously refused that way are landed: the Marker
`role: chapter` argument goes to the Marker owner, which authors and clears the
role, and a `update_clips` Zone or Layer change goes to the Clip temporal owner's
re-placement intent, whose routing, occupancy, contribution-availability and
participant-Transition refusals pass through with their own codes
(`missing-target`, `invalid-result`, `zone-unavailable`, `invalid-topology`).
