# Show Scene composition design

Status: global and local interaction directions approved; additive normalization
spike complete. Human review selected #458's explicit Layer Rail on 2026-07-15.
A semantic Scene still spans zones, but local authoring targets one Scene x Zone
composition at a time. The former all-zones Scene-detail direction and its
candidate persisted shape are superseded; do not implement them. Durable schema
and production work now proceed as end-to-end vertical slices through storage,
editing, preview, compilation, and migration.
The #462 proof established a safe projection seam and identified two compiler
gaps. The #478 lowering closes the top-level routed-Scene gap; explicit durable
instance automation for local composition remains. This document does not freeze
or ship a production composition schema.

The implementation stack is tracked by epic #486. Slice #487 integrates the
production Scene x Zone shell over the lossless version-0 projection and current
flat authority. It intentionally ships no invented local entities. #488 adds
Main clips and intra-Scene Cuts; #489 adds ordered overlay layers and compositor
lowering; #490 adds typed Property animation; #491 completes advanced Layer Rail
interaction and density; #492 freezes migration, parity, and hardware budgets.

## Conclusion

A Scene remains the cross-zone semantic unit of a Show. Each Scene-zone cell may
gain one optional local composition containing rapid Pattern changes, additional
Pattern sources, Effect automation, and keyframes. The global timeline answers
which Scenes happen, where zones route, and how one Scene transitions to the
next. Local authoring fixes the selected Scene and zone, then edits only time and
layers. The Stage continues to render the final composite across every zone.

The hierarchy exists for authors, not for the Pixelblaze runtime. Compilation
flattens each Scene composition into the same kind of timed schedule the Show
compiler already emits. Every Scene produces one composited output per zone;
the Scene's outgoing Transition consumes that flattened output and the next
Scene's flattened output.

```text
Show
  Scene
    Zone composition
      Main sources + overlay layers + Property animation
      -> flattened zone output
    Zone composition
      -> flattened zone output
    -> composited Scene output
  boundary Transition
  Scene
    ...
```

V2 should support exactly one detail level. A zone composition cannot contain
another composition. Later reuse may package or clone a composition, but it
must not introduce recursive timelines. Cross-zone local overlays and linked
zone compositions remain later evidence work.

## Why this belongs before the current UI commitment

The existing flat model is already approaching two different limits.

First, automation-only Splits turn one authored idea into many top-level Scenes.
Four rapid cuts and three Effect changes can be expressed today, but the global
timeline must carry every breakpoint beside routing, zone placement, and
Scene-to-Scene Transitions. Zoom changes the number of visible pixels; it does
not reduce the number of concepts the author must consider at once.

Second, Property animation, overlays, rapid cuts, and reusable treatments are
currently separate future problems. They share one missing abstraction: a
bounded time-and-source composition owned by a semantic Scene. Designing that
container now avoids building four incompatible partial solutions.

This does not make Scene composition a dependency of the first static Effect
and Transition UI. It changes what that UI must avoid hard-coding. In
particular, Effect commands need stable entity identities and semantic undo;
the global timeline must not claim that every timing event is a top-level Scene;
and the compiler-facing model must leave room to distinguish source placement
from Pattern-state identity.

## Current model and the required separation

The shipped Show record has four relevant owners:

- a **Scene** owns one top-level duration and Show-wide targets;
- a **clip** (`ShowCell`) occupies one or more Scene columns and zone rows and
  owns a Pattern reference, adaptations, control targets, Effects, and
  Continue/Restart entry behavior;
- a **Transition** belongs to a top-level Scene boundary; and
- a **Property animation** uses destination targets plus an incoming boundary
  ramp.

`ShowCell` currently serves two roles at once. It is the visible placement in
the Scene/zone matrix, while the compiler infers private Pattern-instance reuse
from Pattern and adaptation signatures, with additional adjacency rules for
Property ramps. Scene-local editing needs those roles to separate:

- **placement identity** answers where and when authored content appears;
- **Pattern-instance identity** answers which private Pattern state, controls,
  and clock the compiler advances; and
- stable Effect identity answers which Effect parameter a keyframe targets.

This is the most important model change in the proposal. A source may appear in
several placements while deliberately continuing one Pattern instance, or the
same Pattern may appear twice as independent restarted instances. Inferring
that distinction from content signatures becomes fragile once placements can
overlap and must become authored identity during migration.

Identity separation also changes property ownership. Simulation properties
such as time scale, time offset, stepped-clock behavior, freeze-on-shutter
behavior, and exported Pattern controls belong to the Pattern instance.
Render-view properties such as mirror, hue phase, brightness, spatial
transforms, opacity, and Effects belong to a placement. One continuing instance
may therefore appear through several differently transformed placements while
retaining one clock and control state.

## Product concepts

### Scene

A Scene remains one named passage of choreography on the global timeline. It
owns its duration, zone-level composition, Show-wide property targets, and
outgoing Transition. Moving, duplicating, or deleting a Scene treats its entire
internal composition as one structural object.

### Zone-composition detail view

Local detail edits one Scene x Zone composition. It reuses the Stage, transport,
playhead, catalogue, and Inspector but changes the Timeline's scope from the
complete Show to one zone in local Scene time. A breadcrumb such as `Orchard
Wake / Canopy` makes both fixed dimensions explicit. Escape or Back returns to
the same global playhead and selection.

The Stage continues to render the final output of every zone while diagnostics
identify the focused zone. Other-zone events may appear as optional read-only
guides and snap targets; their editable lanes remain outside this view. Authors
clone a zone composition when the same treatment should begin in another zone.
Linked reuse remains later work.

### Source placement

A source placement puts one Pattern instance into the selected zone for a local
time range. Placements own render-view adaptations and an ordered Effect stack.
A placement is the unit selected, moved, trimmed, duplicated, or removed in
Scene detail.

V2 needs two placement roles:

- a **base placement** contributes the ordinary mutually exclusive source for
  its zone and time range; and
- an **overlay placement** contributes another rendered source with opacity,
  Effects, and layer order. Direct spatial editing on the Stage is deferred.

Base placements in one zone cannot overlap. Their Cuts divide local Scene time.
An explicit Empty placement represents a gap. Overlay placements may overlap
base and other overlay placements, subject to compiled cost and device budget.

### Pattern instance

A Pattern instance owns one private runtime state, virtual clock, time policy,
and set of exported Pattern-control targets. Several placements may reference
it to Continue state. Creating a new instance means Restart. The editor exposes
this as the existing Continue/Restart choice; persisted identity makes the
result explicit instead of reconstructing it from content signatures.

### Property animation track

A Property animation track owns a typed target and a time-ordered set of local
keyframes. Targets are structured identities, not display labels or arbitrary
string paths. Initial target families are:

```text
instance time:         Pattern instance + Animation speed
Pattern control:       Pattern instance + exported slider name
placement adaptation: placement + Brightness, phase, or mirror
Effect parameter:      placement + stable Effect id + parameter
overlay property:      placement + transform, opacity, or z-order parameter
```

Keyframe time is relative to the Scene. Each keyframe stores a target value and
the interpolation leaving that point. A property with no track remains one
static saved value. The UI reveals only authored tracks; it does not allocate or
show lanes for every possible parameter.

### Transition

A Transition remains owned by the boundary between top-level Scenes. It
combines two flattened Scene outputs. V2 Scene detail uses Cuts between base
placements and does not place full visual Transitions inside a Scene. This
preserves a strong distinction between local source scheduling and semantic
Scene changes. Internal visual Transitions remain beyond-V2 evidence work.

## Candidate persisted shape

The exact TypeScript schema remains a prototype question, but the semantic
shape should be explicit enough to test editing rules:

```ts
interface ShowRecord {
  patternInstances?: ShowPatternInstance[]
  // existing Show fields remain
}

interface ShowSceneComposition {
  version: 1
  placements: ShowSourcePlacement[]
  animations: ShowPropertyAnimationTrack[]
}

interface ShowPatternInstance {
  id: string
  pattern: ShowPatternRef
  patternName: string
  time: ShowPatternTimePolicy
  controlTargets?: Record<string, number>
}

interface ShowSourcePlacement {
  id: string
  instanceId: string
  role: 'base' | 'overlay'
  zoneIds: string[]
  startMs: number
  durationMs: number
  view: ShowPlacementView
  effects?: ShowClipEffect[]
  zIndex?: number
}
```

`ShowRecord` owns the Pattern-instance registry because a continuing instance
may cross Scene boundaries. `ShowScene` owns its optional composition because
the Scene is the unit the design intends to contain and reuse. A cell-owned
nested composition would preserve more of the current schema but would make
aligned multi-zone editing, Scene copying, and Scene-level keyframes depend on
several independent containers.

The state-model exercise validated this hybrid ownership against multi-zone
placements, cross-Scene Continue, split, duplicate, extend, trim, and local
keyframe rebasing. Issue #478 subsequently unified top-level multi-Zone Scene
selection in production compilation. Scene-local overlays, Cuts, and keyframes
remain unimplemented, so the durable nested schema is still not frozen.

Existing flat Shows need one canonical projection into the new model. Each
Scene/zone slot becomes one full-duration base placement. A clip spanning
several Scenes becomes placements that reference one Pattern instance when its
current compiled behavior is Continue, or distinct instances where it restarts.
Effects remain placement values with stable ids. Pattern controls and time
policy move onto the explicit instance. The migration must round-trip current
Shows through every compile-recipe path without visual, clock, or state drift.

## Persistence shape and complexity budget

The current database already stores one Show as one row in `personal_shows`.
Scenes, zones, cells, routing, and Transitions are serialized into JSON text
columns; none of those nested entities creates another database row. Scene
composition should preserve that invariant. One saved Show remains one database
object even when its JSON document contains many placements or keyframes.

The next schema should prefer one versioned Show document rather than continue
adding a top-level JSON column for every feature family. Queryable envelope
fields remain ordinary columns:

```text
personal_shows row
  user_id, id, name, document_version, updated_at
  show_document_json
    zones, Scenes, Pattern instances, placements, keyframes, routing,
    Transitions, output contract
```

This is a direction, not an approved migration. Existing JSON columns can be
projected into the document without creating relational tables for Scene-local
content. The migration must preserve atomic save, user ownership, and current
record compatibility.

JSON reliability is not permission for unbounded structure. V2 applies these
budgets:

- exactly one Scene-detail level and no recursive compositions;
- stable ids only for values that are referenced, selected, animated, or need
  durable undo identity; ordinary parameters remain inline values;
- one Show-owned Pattern-instance registry; no database table or user-facing
  library of incidental instances;
- strict versioned validation and normalization on load and save;
- list queries eventually return Show summaries, while opening a Show fetches
  its full document, so a library of complex Shows does not eagerly transfer
  every keyframe; and
- compiler-reported size and active-source cost become authoring feedback before
  storage size itself becomes dangerous.

The current protected-write boundary rejects request bodies above 1,900,000
bytes. A Show should remain comfortably below that ceiling by referencing
Pattern records rather than embedding Pattern source, previews, captures, or
generated artifacts. The editor should measure the serialized Show document and
warn before the transport limit; the exact product threshold requires fixture
measurement rather than guesswork.

The interaction model has a smaller visible-object budget than the JSON model.
The global timeline exposes Scenes, zones, and top-level Transitions. A Scene
shows only a compact complexity summary until opened. Scene detail exposes its
placements. A property's keyframes appear only while that property is selected
or its authored lane is deliberately revealed. Pattern-instance ids remain an
implementation mechanism behind the user-facing Continue/Restart choice.

## Timing and edit algebra

Scene duration is the authoritative local time domain: `0 <= local time <=
durationMs`. Editing duration and editing the timing of all content are
different commands.

| Operation | Required V2 consequence |
| --- | --- |
| Extend Scene | Ask for **Hold tail** or **Leave empty**. Hold extends the final base placement in each zone; overlays and keyframes retain their times. |
| Trim Scene end | Truncate placements at the new end and remove later keyframes after an explicit destructive preview. |
| Scale Scene timing | Explicit command that proportionally retimes placements and keyframes. Ordinary resize does not secretly retime. |
| Split top-level Scene | Partition placements and keyframes at the playhead, rebase the right side to zero, move the original outgoing Transition to the right Scene, and insert a Cut between the results. |
| Split placement | Divide one placement at local time while preserving its Pattern instance by default. |
| Duplicate Scene | Deep-copy placements, Effects, and keyframes with new authored ids. Default Restart creates fresh Pattern instances; explicit Continue preserves selected instance references. |
| Move Scene | Move the complete composition and outgoing-boundary policy as one magnetic structural operation. |
| Copy/Paste placement | Create an independent snapshot with new placement and Effect ids; linked reuse is later work. |
| Delete placement | Leave an explicit Empty interval on a base lane or reveal the lower composition when removing an overlay. |

Every operation is one semantic undo transaction. Dragging may preview
continuously, but persistence records one result. Invalid overlap, time range,
zone coverage, or keyframe target produces a model error the UI can explain; it
is not silently normalized into a different edit.

## Compilation and runtime

The current compiler already lowers a Scene sequence into flat hold and
Transition segments selected by elapsed Show time. Scene composition extends
that normalization rather than creating a nested runtime:

1. Resolve global Show time to a top-level Scene and local Scene time.
2. Resolve active base and overlay placements per zone.
3. Resolve Pattern instances whose private clocks advance for that frame.
4. Evaluate active Property animation segments once per frame.
5. Apply each placement's single-source Effect pipeline.
6. Composite active placements into one Scene output.
7. Apply the top-level boundary Transition when the global schedule enters its
   Transition window.

Pattern instances advance once per frame even if several active placements
render different views of them. A placement cannot assign a conflicting clock
or Pattern-control value; choosing a different simulation policy creates a new
Pattern instance. This invariant keeps Continue literal and makes simultaneous
reuse compilable.

The generated Pixelblaze artifact remains one Pattern. Fast preview continues
to reconstruct deterministic state from Show start. More placements and
keyframe segments increase generated branches, private member code, and active
renderer work, but they do not introduce an unknown execution mechanism.

The load-bearing technical limits are measurable:

- generated source and bytecode budget per unique Pattern instance;
- worst-instant active Pattern evaluations per output pixel;
- scalar and array storage used by keyframe schedules;
- replay time for dense stateful compositions; and
- exported-control limits when authors promote Show-level controls.

V2 should let the compiler report those costs rather than impose an arbitrary
UI layer count. The editor may still need a conservative active-source warning
or block when measured hardware shows that a formally valid composition cannot
run usefully.

## UI review history and second-round directions

The first prototype round compared an Inline lens, Dedicated Scene room, and
Split desk. It established that local time needs an explicit scope boundary,
but human review rejected assumptions shared by all three treatments:

- moving or enlarging the Stage made Scene detail feel like a different product;
- a spacious, full-height Inspector spent specialist-workspace area like a
  settings page;
- nested scrolling made the Timeline feel secondary; and
- preserving context with a second full Timeline duplicated navigation and
  left two editing scopes apparently active.

The second round holds the important workspace geometry constant. Opening a
Scene keeps the IDE frame, library rail, right-hand Stage, transport, and
keyboard grammar. The center Timeline changes from global Scene scope to local
placement and Property-animation scope. A breadcrumb, zero-based local ruler,
lane vocabulary, restrained amber accent, and compact global navigator state
the scope without inventing a second application. The three variants now test
only where selected-entity properties belong.

All variants are available at
`?prototype=scene-composition&variant=A|B|C` in development.

### A. Property shelf

A compact horizontal shelf occupies the bottom of the Timeline workspace. It
preserves Timeline width, keeps the Stage unchanged, and makes several related
values visible in one scan. The review must test whether the shelf remains
legible with longer Effect stacks, whether horizontal overflow is predictable,
and whether narrow-window keyboard order stays coherent.

### B. Docked Inspector

A narrow Inspector dock sits beside the local Timeline while the existing Stage
remains at the far right. Persistent vertical properties are familiar and scale
well to structured controls, but the dock reduces the width available for dense
timing work. The review must determine whether 220 pixels is enough and whether
frequent pointer travel between lanes and properties remains acceptable.

### C. Inline command strip

The most frequently changed values appear in one dense row directly above the
selected lane; deeper controls open through `More...`. This gives the shortest
pointer path and spends the least persistent area. It may displace lane content,
hide less-common properties, or make the details surface harder to discover.

No variant is recommended before hands-on review. The comparison must use the
same Scene, Stage size, lane set, and tasks so that property placement - not a
more dramatic workspace relayout - determines the result. Review must test
selection scope, playhead mapping, drag targets, keyboard focus, switching
between different entity types, entering and exiting without losing context,
and whether the author predicts which level owns an edit.

### Review checkpoint after Property shelf

The Property shelf is no longer a leading direction. Although it preserves
Timeline width, it puts frequently read values at the far edge of a tall display
and spends eye and pointer travel every time the selection changes. Its
horizontal property grouping also scales poorly when an Effect or Transition
has many parameters.

The review produced a stronger candidate: one compact Quick Inspector anchored
above or below the selected Timeline entity. Only one Inspector may be open.
Selecting another entity transfers it; selecting the same entity toggles it;
`Escape` closes it without discarding selection; and a keyboard command toggles
it for the current focus or selection. The entity and Inspector share an icon,
type accent, and selection highlight. A complex entity may pin or expand into a
narrow persistent Inspector without taking over the Stage.

The existing Docked Inspector and Inline command strip remain useful
conversation starters. Their review should extract general interaction rules,
not select a Scene-specific workspace. The next prototype round then returns to
the production global Show Timeline, tests the anchored and docked inspection
models against its real density and operations, and lets Scene detail inherit
the result.

The completed review sharpened those roles. The Docked Inspector is usable,
stable, and well suited to long parameter lists, but a permanent 220-pixel dock
beside the unchanged Stage leaves too little Timeline width. It remains a useful
optional pinned state rather than the default. The Inline command strip gives
excellent proximity and density, but opening it shifts every lower lane and
confuses interface controls with authored Timeline rows. Its contextual-control
idea survives inside the anchored Quick Inspector; the inserted row does not.

The selected production direction therefore has one modeless Entity Detail
Panel and one
selection. It opens near the selected entity, transfers when selection changes,
and flips above or below without reflowing the Timeline. A complex editing
session may later pin that same panel into a narrow dock. A user-positioned
floating palette is recorded separately in #464 as a possible later placement,
not a prerequisite.

The actual-density study is complete. The approved design keeps the same Stage,
transport, selection grammar, entity icons, property rubric, and viewport
navigation in both scopes. Ordinary zoom changes only geometry. A 36-pixel
read-only Scene X-ray preserves internal beats and snap references; its explicit
magnify action opens a read-only Super Detail inspector, whose `Open Scene`
command enters the local editor. The governing dimensions, responsive behavior,
stress route, and rejected alternatives live in
[`final-production-design.md`](../collaboration/show-timeline-production-density-2026-07-14/final-production-design.md).

The same review separated three Timeline drags that must never be ambiguous:
playhead scrubbing changes preview time, entity dragging changes authored
content, and a temporary Hand tool pans viewport state only. Space-drag,
middle-button drag, trackpad navigation, and the exact playback shortcut remain
candidates rather than frozen bindings.

## Approved Zone-composition interaction

The local editor uses the explicit Layer Rail from #458. The breadcrumb separates
a visible Back-to-Show command from `Scene -> Zone Layout -> Zone` context. The
Timeline keeps every overlay layer visible above one structural Main clips lane;
the top visible layer renders in front. It does not number layers, annotate
Front/Back, or compress inactive layers. A future high/low-resolution treatment
may compress very large stacks, but it is not part of the first implementation.

Each overlay layer accepts several non-overlapping clips. Horizontal dragging
stays lane-locked through ordinary pointer drift. Deliberate vertical movement
crosses drag hysteresis and reassigns the clip only on a legal drop. An invalid
overlapping drop snaps to the nearest legal before/after position when one fits;
otherwise it returns to its origin. Layer reordering uses a hover/focus drag
handle without spending persistent label width on arrow controls or counts.

The Stage continues to show final all-zone output and remains read-only. Compact
independent switches reveal Zone outlines, active-clip outlines, and other-zone
timing guides. Zone and clip diagnostics use distinct restrained hairline
treatments so selection remains legible without implying direct Stage editing.

One modeless Entity Detail Panel opens near the selected clip. Plain readouts are
unboxed, immutable Pattern and Zone identity use a small lock, and boxed controls
communicate editability without repeating `editable` or `read-only` in every
label. Entry behavior exposes the user-facing Continue/Restart choice while
Pattern-instance ids remain hidden. Incoming and outgoing top-level Transitions
share one compact locked context row.

## Stress scenario

`Neon orchard` remains one 2-second top-level Scene containing:

- four rapid base cuts within the first 250 ms;
- one continuing Pattern instance and one explicit restarted instance;
- a second positioned Pattern overlay from 180-1,400 ms;
- two Effects on the base placement and two on the overlay;
- three keyframes on one Effect parameter;
- one animated overlay transform and opacity;
- three zones with one aligned event across all zones; and
- an outgoing Motion Transition to `Afterglow`.

The review tasks are:

1. Enter the Scene and predict the local time origin.
2. Select and move the four-cut treatment without moving the overlay.
3. Add one keyframe at the playhead and find the previous/next authored point.
4. Decide whether a Pattern continues or restarts after one cut.
5. Copy the complete Scene and predict whether later edits propagate.
6. Return globally and identify the Scene's internal complexity without opening
   it.
7. Change the outgoing Transition without accidentally selecting an internal
   cut.
8. Explain the worst-instant renderer cost.

## Release horizons

### Complete main Show-editor release

The main Show editor is a complete independently releasable unit. Authors can
build, preview, compile, export, and send Shows with the updated global Timeline,
static Effects and Transitions, magnetic movement and insertion, efficient
selection and reuse, semantic undo, keyboard operation, and production polish.
It does not depend on Scene composition, persist local placements, or create
arbitrary keyframes. It should:

- ship semantic Show transactions and session undo before structural batch
  edits;
- use stable Effect ids and registry-driven presentation;
- keep Effect commands independent of React and one selected clip;
- keep top-level Scene and Transition ownership explicit;
- avoid claiming that every timing event must be a Scene boundary;
- preserve existing boundary-ramp data without expanding its authoring UI; and
- reserve global Scene summaries and an Open Scene affordance in the visual
  hierarchy without shipping an empty drill-down shell.

### Additive local-composition dot release

The later increment adds one-level Scene x Zone composition with local time,
Main clips, manually ordered overlay layers, structured Property-animation
keyframes, explicit Pattern-instance identity, global summaries, and a reviewed
zone-composition detail view. It is an optional drill-down that reuses the
shipped Show workspace; flat Shows and all global editing semantics remain
valid. Compilation flattens each zone composition, combines the Scene output,
then applies top-level Transitions.

The V2 schema should be committed only after a migration spike proves that
existing one-zone, multi-zone, routing, two-Scene, and general scene-sequence
compiler paths preserve their current clock and output behavior.

### Beyond V2

Later evidence may justify internal visual Transitions, named reusable Scene
treatments, linked instances, beat/audio/modulation sources, curve and graph
editors, time remapping, macros, or multiple reusable compositions. These are
extensions of Scene composition, not commitments in its first schema.

Recursive nested compositions are outside the direction. If reuse requires
nesting to remain understandable, the product should first prove that a named
immutable or snapshot treatment cannot solve the need more safely.

## Decisions already captured

- A top-level Scene remains the semantic global unit.
- Local detail edits one Scene x Zone composition; the Stage still shows the
  final all-zone output.
- Other-zone events may be projected as read-only guides and snap targets
  without adding editable zone lanes.
- A full-Stage Pattern interval inside an otherwise zoned Show switches to a
  one-zone Full Stage layout for that Scene, then may switch back. It does not
  become a local clip that silently escapes its zone. Simultaneous global
  content over active zones remains later cross-zone compositor evidence.
- Zone layouts are reusable named definitions selected by each Scene. Local
  detail exposes layout then zone as navigation context; changing a Scene's
  layout is a structural Scene-details operation with explicit remapping, not
  an incidental per-clip edit. A mid-Scene layout change requires a Scene split.
- The compiler flattens Scene composition; the Controller does not execute a
  nested editor model.
- Placement identity, Pattern-instance identity, and Effect identity are
  distinct.
- Pattern instances belong to the Show; placements and local keyframes belong
  to a Scene x Zone composition.
- Simulation time and Pattern controls belong to instances; render-view
  adaptations and Effects belong to placements.
- Base sources are mutually exclusive; overlays are composited sources.
- Overlay layers are manually ordered, accept multiple non-overlapping clips,
  and use drag hysteresis before a horizontal move changes layers.
- The approved local UI is an explicit uncompressed Layer Rail with no layer
  numbers, clip counts, or Front/Back ornaments. Top-to-bottom position carries
  compositing order.
- Zone, active-clip, and other-zone-guide diagnostics are independently
  switchable on the read-only all-zone Stage and local Timeline.
- Continue/Restart is editable Entry behavior in the selected clip's Entity
  Detail Panel; persisted Pattern-instance identity remains hidden.
- Top-level Transitions consume flattened Scene outputs.
- V2 starts with internal Cuts rather than full internal Transitions.
- Property animation uses typed targets and authored lanes only.
- V2 reuse is an independent snapshot; linked reuse remains later work.
- Duplicate Scene restarts Pattern instances by default; Continue is explicit.
- Scene extension chooses Hold tail or Leave empty rather than silently
  retiming existing content.
- Existing Shows must migrate without visual, time-base, or output drift.

## Open decisions and required evidence

1. Can all current compile-recipe paths migrate to explicit Pattern-instance
   identity without changing clock, state, Transition, or output behavior?
   **Spike answer:** a lossless additive sidecar can preserve every current path,
   but the routed path and instance automation must be normalized before the
   explicit representation can replace the flat record.
2. Which Pattern-instance values may change over time while that instance is
   visible through more than one placement?
3. How many simultaneous overlay sources remain useful on representative
   hardware before warning or blocking?
4. When a Zone Layout removes a zone for one or more Scenes and later restores
   it, how should the editor present Continue versus Restart for Pattern
   instances that were not visible during the intervening Scenes?

The first two questions belong in a compiler/migration spike. The last two
belong in interactive prototype review. Hardware evidence answers the active-
source question after the compiler can emit a representative composition.

## State-model evidence

The throwaway terminal prototype at
`scripts/prototypes/show-scene-composition.ts` exercises the ownership model
against the `Neon orchard` stress Scene. It demonstrates valid local-time and
keyframe partitioning on Split, Show-owned instance continuity across Scenes,
fresh-instance duplication by default, explicit continuation, and both Scene-
extension policies. Run `npm run prototype:scene-composition` from a configured
repository checkout.

The exercise answered the editing-shape question but deliberately does not
claim production readiness. Its most important negative result is that moving
all current `ShowCell` values onto placements would be wrong: clock and Pattern-
control state must follow the shared instance. The smallest next technical
experiment is a round-trip compiler migration fixture covering the specialized
recipe paths, not more schema elaboration.

## Additive normalization spike evidence (#462)

The spike is implemented in
`src/engine/showCompositionProjection.ts` with deterministic coverage in
`src/engine/showCompositionProjection.test.ts`. It projects a normalized flat
Show into explicit Show-owned Pattern-instance summaries and Scene-owned base
placements while retaining the normalized flat record as the persistence and
compiler authority. Version `0` is intentionally a sidecar, not a proposed
saved schema.

The fixture matrix covers every current recipe branch:

| Fixture | Existing compiler path | Result |
| --- | --- | --- |
| One-zone held Clip | steady hold | One compiled instance; one Scene-owned placement per covered Scene |
| Ordinary two-Scene Show | two-Scene boundary | Two instances and the unchanged top-level boundary |
| Three-Scene sequence | scene sequence | Runtime Clip ids preserve inferred Continue/Restart identity |
| Multi-Zone Show | routed Scene sequence | Every persisted Scene/Zone cell selects a runtime Pattern instance |
| Fixed Installation | Installation single-zone wrapper | Output contract, physical routing, count, and generated artifact remain unchanged |
| Time-scale Property ramp | adaptation ramp | One runtime instance plus an explicit ownership-conflict diagnostic for the changing instance target |

Every fixture survives JSON serialization, restores the normalized flat Show,
produces a byte-for-byte equal compile recipe, and emits identical generated
code. Continue across a hold and after Split maps several Scene placements to
one runtime instance. Restart creates another instance. Current Scene Clone
continues the copied Pattern by default, matching shipped behavior. Top-level
visual and routing Transitions remain Scene-boundary objects and never become
placement properties.

The #478 lowering closes the compiler-path inconsistency found by the spike.
`showRecordToRoutedSceneSequenceRecipe()` now lowers every top-level Scene/Zone
slot, maps Continue to one runtime Pattern instance, gives Restart a fresh
instance, and combines each outgoing and incoming Zone set through the existing
boundary Transition families. The projection no longer marks supported later
Scene cells `compiler-omits-cell`.

The second gap is explicit instance automation. The adaptation-ramp compiler can
keep one runtime member while flat destination cells carry different time-scale
or Pattern-control targets. Version 1 therefore needs typed instance tracks (or
equivalent normalized segments); copying one static value from either cell onto
the instance would lose behavior.

### Smallest production seam

The safe next seam is the version-0 sidecar projection:

1. Normalize a flat Show through the existing entry, Transition, and routing
   normalizers.
2. Build the current compile recipe without changing it.
3. Use the recipe's actual runtime Clip ids to project explicit Pattern-instance
   ownership.
4. Expand each flat cell into one full-duration Scene-owned base placement per
   covered Scene and carry render-view adaptations and Effects on that
   placement.
5. Report unsupported composition facts and shared-instance values that still
   require explicit durable automation.
6. Continue saving and compiling the flat record until those diagnostics are
   eliminated by a unified lowering path.

This seam is useful immediately for read-only Scene summaries and migration
instrumentation because it cannot change output. It is not sufficient for
Scene-local editing: overlays, local Cuts, and keyframes still have no production
lowering, and the explicit fields cannot yet replace the flat compatibility
record.

The first production consumer now uses this seam. The global Timeline can
disclose one fixed-height Scene X-ray and magnify it into one modeless Super
Detail overlay. Both surfaces remain read-only and surface compiler diagnostics
for genuinely unsupported facts. Super Detail now exposes `Open Scene`, which
enters the production one-Scene x one-Zone shell. That shell selects and edits
only real Main placements backed by current flat cells, preserves the global
Timeline state while it is open, and keeps the shared Stage on final all-zone
output. It is an additive integration seam, not evidence that overlays, local
Cuts, keyframes, or a version-1 schema have shipped.

### Dense fixture measurement

`scripts/prototypes/show-scene-composition-measure.ts` measures the reviewed
`Neon orchard` candidate rather than guessing from JSON depth. The current
fixture contains three top-level Scenes, four Pattern instances, eight
placements, and three keyframes. Its serialized candidate document is **2,534
bytes**, or **0.133%** of the 1,900,000-byte protected-write ceiling.

The exact candidate cannot yet compile because the current flat compiler has no
overlay compositor or intra-Scene Cut schedule. The script therefore labels its
generated cost honestly as a two-active-source lower bound: **10,976 artifact
bytes**, **246 source bytes before merge**, **16.05%** of the measured device
artifact budget, two compiled Clips, and a renderer-window policy. These numbers
do not include the four local Cuts, overlay compositing branches, or keyframe
schedules. Hardware budgeting must wait for that lowering instead of treating
the lower bound as a forecast.

### Ownership decisions after the spike

- Pattern reference, private state, virtual time policy, and exported controls
  remain Show-owned Pattern-instance concerns.
- Brightness, phase, mirror, spatial transforms, opacity, and the ordered stable-
  id Effect stack remain placement concerns inside one zone composition.
- A changing instance-owned value requires an explicit instance animation track;
  it must not be duplicated onto placements.
- Top-level Transition and routing ownership remains unchanged.
- The flat record remains accepted, saved, and compiled without destructive
  migration through the additive release.
- Version 1 schema work waits on #458's revised zone-focused interaction and a
  real overlay/local-schedule compiler path. The earlier all-zones candidate and
  version-0 sidecar must not leak into durable storage as accidental schemas.

## Relationship to current plans

- [`show-visual-toolkit-ui-design.md`](show-visual-toolkit-ui-design.md) owns the
  initial static Effect and top-level Transition authoring direction.
- [`show-editor-interaction-research-draft.md`](show-editor-interaction-research-draft.md)
  provides selection, magnetic movement, compound-clip, Effect, and overlay
  research evidence.
- [`pxlblz-v2-prd.md`](pxlblz-v2-prd.md) owns release sequencing and the broader
  Show product contract.
- GitHub #458 records the approved zone-focused Layer Rail interaction. Its first
  all-zones prototype and compact B/C variants remain evidence, not production
  contracts.
- GitHub #457 remains the current human-review umbrella until this direction and
  the visual-toolkit prototype are reviewed together.
