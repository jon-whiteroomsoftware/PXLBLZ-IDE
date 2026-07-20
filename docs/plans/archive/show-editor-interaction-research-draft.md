# Show editor interaction research (draft)

Status: exploratory research, updated 2026-07-14. This note is deliberately not an
implementation plan, specification, or issue-ready design. It identifies a
promising interaction direction and the decisions that still need prototypes
and task evidence. Its scope now includes timeline manipulation and the
effects, transitions, and property-animation authoring surface.

Disposition: the completed headless contract was reconciled against this
research in [`show-visual-toolkit-ui-design.md`](show-visual-toolkit-ui-design.md).
That document owns current product decisions and implementation sequencing.
Open questions below remain research history unless the focused design carries
them forward explicitly.

## Conclusion

PXLBLZ should borrow the interaction grammar of professional editors without
copying their track model. The Show is a structural scene-by-zone grid: scene
boundaries are shared by every zone, transitions are first-class boundary
entities, and clips occupy rectangular scene/zone footprints. A conventional
editor can insert one video clip into one track; the apparently equivalent
PXLBLZ operation may change time, transitions, and occupancy across the entire
Show.

The strongest direction is therefore a **magnetic structural timeline**:

- scene columns or contiguous scene ranges move by insertion, with every lane
  visibly making room before the drop;
- clips support set-valued selection and batch operations, but move only to a
  structurally valid scene/zone footprint;
- insert, overwrite, and replace are distinct consequences, not ambiguous
  outcomes of the same invisible drop rule;
- copy, duplicate, keyboard movement, and drag all invoke the same pure model
  operations; and
- undo/redo lands before high-blast-radius multi-item edits.

The immediate opportunity is not a large toolbox. It is a small, consistent
loop: select several things, see exactly what a command will affect, move or
copy them, and recover instantly if the result was wrong. CapCut's speed, Final
Cut Pro's magnetic movement, Resolve's visible edit choices, and Premiere's
selection vocabulary each contribute part of that loop.

The visual toolkit needs a parallel but distinct interaction grammar. PXLBLZ
should expose a searchable visual catalogue for choosing an Effect, then an
ordered inspector stack for understanding and editing the Effects already on a
clip. Property animation should stay attached to the property it animates,
with timeline lanes revealed on demand. A Transition should remain one object
on a scene boundary. A future overlay should be called a layer because it
introduces another rendered source; an Effect should not be called a layer
merely because effects form an ordered stack.

This leads to a **signal-chain plus inspector-rail** direction for the active
visual-toolkit UI work. The catalogue answers “what could I add?” The selected
clip's stack answers “what happens, and in what order?” The timeline answers
“when does it happen?” The Stage answers “what does it look like?” Keeping
those questions separate contains complexity without hiding the underlying
render model.

## The current PXLBLZ baseline

The current editor has already established the parts that make a timeline feel
direct: proportional scene widths, a shared ruler and playhead, play/pause,
deterministic seeking, split at the playhead, Fit and playhead-centered zoom,
navigator-thumb pan and resize, structural snapping, and keyboard transport.
Single selection opens a contextual inspector. A selected clip, scene,
transition, or zone can be deleted, and a deleted clip leaves an explicit empty
slot where a new Pattern can be placed.

Editing remains singular and inspector-led:

- `ShowSelection` holds one entity, not a set;
- scene duplication is the only substantial built-in reuse operation;
- a clip relocates through delete followed by placement in an empty slot;
- the model exposes no general move, clipboard, group, or history operation;
- spans can remove intersecting clips, so one innocent-looking mutation can
  already have a wider effect than its target; and
- selection is component-local while durable mutations pass through
  `showStore` into pure `showModel` operations.

That architecture is a good base. Multi-item behavior belongs in pure model
operations with thin timeline gestures above it. The main design work is to
define selection and mutation semantics that preserve the Show's structural
invariants.

Repository evidence:

- [`src/components/ShowEditor.tsx`](../../../src/components/ShowEditor.tsx) owns
  selection, timeline gestures, transport, and contextual inspectors.
- [`src/engine/showModel.ts`](../../../src/engine/showModel.ts) owns occupancy,
  scene duplication, split, spanning, and structural normalization.
- [`src/engine/showTimelineViewport.ts`](../../../src/engine/showTimelineViewport.ts)
  owns Fit, zoom, pan, navigator geometry, and snapping.
- [`docs/reference/PXLBLZ Feature Guide.md`](../../reference/PXLBLZ%20Feature%20Guide.md)
  currently documents delete-and-place as clip relocation and explicitly says
  the grid does not use freeform drag ordering.
- [`docs/plans/archive/issue-430-show-timeline-lifecycle.md`](issue-430-show-timeline-lifecycle.md)
  records that boundary as an intentional completion decision for the current
  lifecycle, not proof that richer structural movement is undesirable.

## What the established editors converged on

The major editors disagree about tracks, tools, and terminology, but they
converge on a handful of interaction contracts.

### Selection scales from one item to a meaningful set

Premiere and Final Cut Pro both support modifier-click selection and a dragged
selection rectangle. Premiere adds Track Select, which selects downstream clips
on one or every track. Final Cut Pro distinguishes whole-clip selection from a
time-range selection that may cross clips. CapCut Desktop exposes select mode,
selection by clip, leftward/rightward selection, grouping, and compound clips.

The important idea is not the marquee itself. A selection has a named scope.
Users can predict whether they selected discrete clips, a time range, a
downstream suffix, or a persistent group. Commands then operate on that visible
scope.

PXLBLZ needs at least two scopes, even if they initially share one visual
surface:

1. **Structural selection**: one or more complete scene columns. This is the
   unit for reordering or duplicating a passage of choreography.
2. **Clip selection**: one or more clip entities. This is the unit for deletion,
   duplication, compatible batch properties, or movement to another valid
   footprint.

A freeform time range is less urgent. In PXLBLZ it would imply partial scenes or
automatic splitting, which is a materially different operation.

Sources: [Premiere clip selection](https://helpx.adobe.com/uk/premiere/desktop/edit-projects/change-clip-sequence/select-clips.html),
[Premiere Track Select](https://helpx.adobe.com/premiere/desktop/get-started/tour-the-workspace/tools-panel-and-options-panel.html),
[Final Cut Pro clip selection](https://support.apple.com/en-my/guide/final-cut-pro/ver28912fd/mac),
[Final Cut Pro range selection](https://support.apple.com/en-mide/guide/final-cut-pro/ver28cca92/mac),
and a [CapCut Desktop shortcut reference](https://litcommerce.com/wp-content/uploads/2026/03/CapCut-ToolCheat-Sheet.pdf).

### Movement has a default consequence and an explicit alternative

Final Cut Pro makes insertion the ordinary move: surrounding clips ripple to
make room and the vacated location closes. Its Position tool explicitly
suspends magnetic behavior, overwrites the destination, and leaves a gap at the
source. Premiere exposes normal movement plus a modifier-driven rearrange edit.
Resolve goes further by showing a drop overlay for insert, overwrite, replace,
fit-to-fill, place-on-top, append, and ripple-overwrite.

These systems are fast because they do not make every edit modal. They are
trustworthy because the exceptional consequence has a visible name, cursor,
drop target, or tool state.

PXLBLZ's safest default is scene insertion. Dragging selected scene headers
should show one full-height insertion seam between scene columns and a ghost of
the complete moving block. Every zone, property lane, and boundary lane should
preview the same displacement. The operation should close the source gap and
insert the block at the destination as one transaction.

Clip movement is different. A selected clip block should preview its proposed
scene/zone footprint and report collisions. It should not silently create time
or shift just one row, because all zone rows share scene boundaries. If making
room requires a new scene column, that should be a scene insertion command.

Sources: [Final Cut Pro Magnetic Timeline](https://support.apple.com/en-sg/guide/final-cut-pro/verb8fcfc133/mac),
[arranging and nudging clips in Final Cut Pro](https://support.apple.com/guide/final-cut-pro/arrange-clips-in-the-timeline-verc147f195/mac),
[Premiere rearrange edit](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/rearrange-clips-on-the-timeline.html),
and [Resolve's edit overlay and trim behavior](https://www.blackmagicdesign.com/products/davinciresolve/edit).

### Copying uses an anchor; grouping preserves relationships

Premiere pastes copied clips at the playhead and uses track targeting to choose
the destination. Final Cut Pro moves selected clips together and offers
storylines for a related sequence. Premiere groups clips so movement, copy, and
deletion treat them as one unit. CapCut distinguishes a lightweight group from
a compound clip and provides copy, cut, paste, group, and ungroup shortcuts.

PXLBLZ should not import track targeting. The selected scene boundary or empty
slot can provide a more legible destination:

- paste a copied scene range **before** a selected scene boundary;
- paste copied clips with their relative scene/zone offsets anchored at a
  selected empty slot; and
- require an explicit split before pasting at a playhead position inside a
  scene. Paste should not silently invent a global boundary.

Transient multi-selection and scene-range duplication should come before saved
groups. A persistent group adds identity, serialization, inspector behavior,
nested selection, and split/span rules. It earns that complexity only if users
repeatedly need the same collection to remain linked after the immediate edit.
A reusable named fragment or motif may eventually be more valuable than a
generic group because reuse across Shows is closer to the stated need.

Sources: [Premiere copy and paste](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/copy-and-paste-clips.html),
[Premiere groups](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/group-clips.html),
[Premiere track targeting](https://helpx.adobe.com/premiere/desktop/edit-projects/intro-to-editing/work-with-clips-on-the-timeline-using-track-targeting.html),
and [Final Cut Pro storylines](https://support.apple.com/en-me/guide/final-cut-pro/ver8e3f1748/mac).

### Precision commands share the same underlying edits

Final Cut Pro lets a selected set move by drag, direction commands, frame
nudge, or numeric time entry. Resolve puts common edit types in an overlay,
then also exposes toolbar buttons and shortcuts. CapCut includes J/K/L shuttle,
jumps to adjacent cuts, trim-to-playhead commands, and zoom-to-fit. Premiere's
History panel records each trim regardless of whether it came from a tool,
button, or shortcut.

The transferable rule is that keyboard commands are alternate entrances to
the same operations, not a separate expert implementation. For PXLBLZ, a scene
block reorder should be one pure operation invoked by drag insertion, a Move
Left/Right command, and eventual shortcuts. Copy, cut, paste, duplicate, and
delete should likewise share model transactions.

Sources: [Final Cut Pro arrange and nudge commands](https://support.apple.com/guide/final-cut-pro/arrange-clips-in-the-timeline-verc147f195/mac),
[Resolve Edit page](https://www.blackmagicdesign.com/products/davinciresolve/edit),
and [Premiere trim history](https://helpx.adobe.com/premiere/desktop/edit-projects/trim-clips/trimming-actions-captured-in-history-panel.html).

## CapCut: what appears to make it feel fast

Direct app inspection was attempted but could not be completed. CapCut was not
present in the Mac application registry, Spotlight's application index,
`/Applications`, `~/Applications`, or the system application inventory on
2026-07-13. No install or machine change was made. This section therefore uses
current documentation, shortcut references, and user reports rather than
firsthand interaction evidence.

CapCut's manual editing surface appears to keep the default loop shallow:
selection and split modes are immediately available; main-track magnet,
snapping, and linkage are toolbar toggles; common structural commands have
shortcuts; and group versus compound clip gives two levels of treating several
items as one. J/K/L, adjacent-cut navigation, trim-left/right to the playhead,
and zoom-to-fit support long editing sessions without making the beginner learn
them on day one.

The usability reports also expose the cost of hidden relationships. One review
found that a crowded timeline required extra clicks to select the intended
layer. User questions repeatedly confuse insert versus new-track drops, magnet
scope, grouping, and linkage. Those are not arguments against magnetic editing;
they show why selection scope and drop consequence must remain visible.

Sources: [CapCut's desktop introduction](https://www.capcut.com/resource/how-to-use-capcut-on-pc),
[CapCut shortcut reference](https://litcommerce.com/wp-content/uploads/2026/03/CapCut-ToolCheat-Sheet.pdf),
[a 2026 workflow review](https://www.onethreadapp.com/blog/capcut-review/), and
[a current insert-versus-track user question](https://www.reddit.com/r/CapCut/comments/1ugbgly/why_cant_i_drag_a_clip_into_my_timeline/).

## Candidate PXLBLZ interaction grammar

This is a research hypothesis to prototype, not settled behavior.

### Selection

- Plain click selects one entity and clears the previous selection.
- Command-click toggles individual clips in the set.
- Shift-click on scene headers selects a contiguous scene range from an anchor.
- Dragging empty timeline space draws a marquee over clips. Starting on the
  ruler continues to scrub; starting on a scene header continues to select
  scenes. These initiation regions must not be ambiguous.
- Escape cancels an active gesture first, then clears selection.
- Select All is scoped by focus: clips in the timeline, scenes in the header,
  or the current property's key targets. It should never unexpectedly select
  every kind of Show entity.
- A multi-selection receives one strong outline plus a visible count and type,
  such as “4 clips” or “3 scenes / 18.0 s.”

An arbitrary mixed set of scenes, transitions, zones, and clips should not be
the initial model. Its delete, move, inspector, and clipboard semantics are not
coherent enough yet.

### Drag and drop

- Drag selected scene headers to reorder a contiguous scene block. The default
  is magnetic insertion.
- Show a full-height insertion seam, displaced destination preview, source gap
  closure, duration change if any, and a compact label before commit.
- Keep the selected block selected after the move. Return keyboard focus to it.
- Auto-scroll near viewport edges. Preserve the drag anchor when zoomed.
- Option-drag duplicates instead of moves, with the cursor and ghost visibly
  changing before the drop.
- Drag selected clips only onto valid grid footprints. Show occupied cells and
  the clips that would be replaced or removed. Start with reject-on-collision;
  add explicit replace only after its semantics are designed.
- A drop outside a valid target changes nothing. Escape cancels without a
  durable mutation.

### Clipboard and reuse

- Command-C copies the current structural selection into a versioned internal
  Show fragment.
- Command-X performs copy plus one atomic removal only when the selection has a
  well-defined removal rule.
- Command-V pastes at a selected scene seam or empty slot. With no valid anchor,
  the command should explain what to select instead of guessing.
- Command-D duplicates in place, then selects the duplicate. Scene ranges can
  insert after themselves; clips need a valid empty destination or a separate
  duplicate-to-next-slot command.
- A future “Paste attributes” can copy adaptations and compatible Pattern
  controls without copying Pattern identity or timeline position. This is
  likely more useful for non-contiguous clips than a generic persistent group.
- Cross-Show paste needs explicit compatibility checks for output contract,
  zones, Patterns, routing layouts, and public Pattern controls. It should not
  be implied by the first same-Show clipboard slice.

### Recovery and feedback

- Undo/redo must treat each drag, paste, delete, or batch property edit as one
  semantic transaction.
- The inspector should name the pending consequence before destructive bulk
  actions: “Delete 4 clips, leaving 4 empty slots,” or “Insert 3 scenes before
  Blackout.”
- A lightweight post-action status can report what moved and offer Undo without
  requiring confirmation for ordinary reversible edits.
- Bulk operations should never persist intermediate invalid states. Preview
  may be optimistic, but the saved Show changes once.

## Ideas to take, adapt, defer, or reject

| Pattern | Source | PXLBLZ treatment | Reason |
| --- | --- | --- | --- |
| Marquee and modifier selection | Premiere, Final Cut Pro, CapCut | Take | It removes repeated clicks and creates the basis for every batch command. |
| Magnetic insertion | Final Cut Pro | Adapt to complete scene columns | Scene boundaries, not freeform clip time, are the shared structural axis. |
| Visible edit-type drop targets | Resolve | Take selectively | Insert versus replace is easier to learn when the destination advertises the consequence. |
| Rearrange modifier | Premiere | Adapt as Option-drag duplicate or explicit alternate consequence | A modifier is fast after the default is trustworthy, but should not be the only discoverable path. |
| Group | Premiere, CapCut | Defer | Transient selection covers immediate movement; durable group semantics are expensive. |
| Compound clip/storyline | CapCut, Final Cut Pro | Reframe as a future reusable Show fragment or motif | The likely PXLBLZ value is repeating choreography, not hiding timeline complexity. |
| Track targeting and sync locks | Premiere, Resolve | Reject for the current model | Zones are semantic output regions, not independent media tracks, and all scenes share time. |
| Freeform range selection | Final Cut Pro | Defer | Partial-scene operations would need explicit split semantics. |
| Many persistent tool modes | Premiere | Reject initially | Selection plus contextual handles and a few temporary modifiers cover the known operations. |
| J/K/L and edit-point navigation | CapCut, Resolve | Defer but preserve shortcut space | Useful for all-day operation, but selection, movement, clipboard, and undo have higher leverage now. |
| History/undo transactions | Premiere and every mature editor | Take before bulk mutation | Multi-item editing without cheap recovery turns speed into risk. |

## Containing effects, transitions, and animation

The active visual-toolkit epic is farther along than the current Show UI makes
visible. The headless contract is frozen around a registry-driven catalogue,
ordinary editable parameters, shared easing and spatial policies, deterministic
fixtures, compiler and preview parity, compatibility metadata, and factual
cost. Its 59 variants cover single-source Effects and two-source boundary
Transitions without requiring the production UI to invent their semantics.

That is the right architectural order. The remaining risk is presenting this
capability as either one enormous inspector or one enormous asset browser. Both
would expose the size of the catalogue while obscuring the much smaller set of
things the author has actually chosen.

Relevant epic decisions and remaining work:

- [#442, Show visual toolkit epic](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/442)
  defines Property animation, Effect, and Transition as related but distinct
  product concepts.
- [#443, headless contract and evidence harness](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/443)
  keeps family rules, applicability, compatibility, presets, and cost out of
  React.
- [#444, animated opacity and affine/wrap Effects](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/444)
  establishes an ordered Effect configuration owned by a source.
- [#449, transformed-content Transitions](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/449)
  reuses coordinate machinery while keeping boundary composition semantically
  distinct.
- [#454, color/output Effects](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/454)
  folds legacy brightness into the shared Effect/property model.
- [#455, easing](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/455)
  gives properties, Effect parameters, and Transitions one easing vocabulary.
- [#456, distortion Effects](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/456)
  adds the family most likely to need visual previews and compatibility
  explanations.
- [#457, evolved visual-toolkit UI](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/457)
  intentionally leaves the production direction to human selection among the
  Signal chain, Inspector rail, and Canvas desk prototypes.
- [#458, deferred overlay lanes](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/458)
  reserves a later multi-source composition concept.
- [#459, frozen headless contract](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/459)
  records the stabilized registry, persistence, compiler, preview, migration,
  and cost evidence that the UI should consume rather than reinterpret.

### How established tools divide the problem

The strongest products separate discovery from applied state.

After Effects has an Effects & Presets panel for browsing and search, while
Effect Controls shows the ordered effects applied to the selected layer. An
effect can be collapsed, reordered, duplicated, reset, or removed. Animation
presets apply ordinary effects and property keyframes rather than becoming a
second opaque mechanism. The timeline can isolate animated or modified
properties, which becomes essential once almost every visible value can own a
temporal state.

Premiere follows the same split. The Effects panel discovers presets and
effects; Effect Controls exposes the selected clip's built-in and added
effects, parameter values, and keyframes. Its filters can show all properties,
only keyframed properties, or only edited properties. A collapsed effect still
summarizes its keyframes. Presets append normal effects to the selected clips,
which makes batch application useful without erasing subsequent editability.

Final Cut Pro makes discovery more visual. Its Effects browser supports
categories and search, and skimming a thumbnail previews the effect against the
actual selected clip in the viewer. Applied effects then form an ordered list
in the inspector; authors can reorder, bypass without losing settings, remove,
animate, and save combinations as presets. This is a particularly good model
for PXLBLZ because a representative Pattern preview communicates more than a
textual effect name.

Resolve also separates an Effects Library from the inspector. Effects drag
onto clips and Transitions drag onto edit boundaries. Parameter diamonds reveal
animation, while a curve editor opens beneath the clip only when needed.
Resolve makes a useful exception for common spatial work: Dynamic Zoom uses
direct start and end rectangles in the viewer. This suggests that PXLBLZ should
offer Stage handles for high-frequency spatial transformations without turning
the Stage into the primary organizer of every Effect.

CapCut uses the same broad regions -- a visual category browser, central
preview, selected-object controls on the right, and effect or overlay objects
on the timeline -- but its reported friction is instructive. A large catalogue
becomes hard to reuse without search, favorites, and recents. A crowded
timeline makes the intended layer hard to select. Keyframe state can become
confusing when diamonds appear only for the current selection or animation is
created as a side effect of changing a value. PXLBLZ should take CapCut's fast
visual discovery, not its dependence on hidden selection and automatic state.
These points are qualitative signals rather than product-contract evidence;
they recur in a [workflow review](https://www.onethreadapp.com/blog/capcut-review/)
and current user discussions about [effect-library organization](https://www.reddit.com/r/CapCut/comments/1tlom7i/rant_about_capcut_pc/)
and [automatic keyframes](https://www.reddit.com/r/CapCut/comments/1umc6wl/how_to_stop_having_keyframes_be_automatically/).

Photoshop provides a smaller caution. Smart Filters are non-destructive,
ordered, reorderable, and bypassable, but they live inside an already deep
Layers tree. PXLBLZ should take the ordered and reversible filter behavior,
not reproduce a nested tree of scenes, zones, clips, overlays, effects, masks,
and animation under one disclosure hierarchy.

Sources: [After Effects effects and presets](https://helpx.adobe.com/ph_en/after-effects/using/effects-animation-presets-overview.html),
[After Effects layer properties](https://helpx.adobe.com/ca/after-effects/using/layer-properties.html),
[Premiere Effect Controls](https://helpx.adobe.com/ca/premiere/desktop/add-video-effects/apply-video-effects/about-effect-controls-panel.html),
[Premiere property filters](https://helpx.adobe.com/premiere/desktop/add-video-effects/control-effects-and-transitions-using-keyframes/filter-properties-in-the-effect-controls-panel.html),
[Premiere effect presets](https://helpx.adobe.com/uk/premiere/desktop/add-video-effects/apply-video-effects/apply-effect-presets.html),
[Final Cut Pro Effects browser](https://support.apple.com/en-ae/guide/final-cut-pro/ver4e33bc9/mac),
[Final Cut Pro effect order](https://support.apple.com/en-gb/guide/final-cut-pro/ver761c7810/mac),
[Final Cut Pro effect bypass](https://support.apple.com/guide/final-cut-pro/remove-or-turn-off-effects-ver4e321d5/mac),
[Resolve Edit page](https://www.blackmagicdesign.com/products/davinciresolve/edit),
[CapCut desktop keyframes](https://www.capcut.com/help/keyframes-in-capcut-pc),
[CapCut effect troubleshooting](https://www.capcut.com/help/effectss-not-applying-in-capcut),
and [Photoshop Smart Filters](https://helpx.adobe.com/photoshop/using/applying-smart-filters.html).

### Recommended production direction

Use a Signal chain and Inspector rail hybrid. The inspector rail is the
persistent selected-object surface. Inside it, ordered Effect cards make the
signal chain explicit. The Stage remains a preview and direct-manipulation
surface for spatial Effects. A temporary catalogue drawer or panel opens when
the author adds or replaces something.

Do not make the Canvas desk the primary organizer. PXLBLZ's Stage is valuable
preview space, while an ordered stack and precise parameters need persistent,
scan-friendly structure. Canvas manipulation is still the right secondary
interaction for translate, rotate, scale, anchors, and a few distortion centers.

The conceptual flow should remain visible:

`Pattern source -> ordered Effects -> opacity/output -> zone composition`

At a boundary, the Transition consumes the outgoing and incoming composited
sources. A future overlay lane contributes another source before that boundary
composition. The UI need not expose compiler internals, but it must not imply
that reordering arbitrary cards across these semantic boundaries is harmless.

#### The catalogue: everything available

The catalogue should organize the 59 variants in three levels rather than one
flat list:

1. **Family** communicates purpose: Transform, Color, Distort, Dissolve, Wipe,
   Motion, or Shape.
2. **Variant** selects the actual behavior: Ripple, Swirl, Push, Cat, and so on.
3. **Preset** supplies an editable starting parameter set. It is not a new
   effect type and should never trap the author in an opaque preset enum.

Search, categories, favorites, and recent items have higher leverage than a
clever global taxonomy. A catalogue tile should show a representative
thumbnail or short preview, name, one-line semantic description, compatibility
or dimensionality when relevant, and a simple cost signal. Hover or scrub
preview should use the selected clip or boundary when practical, following
Final Cut Pro's useful “preview it on my material” behavior.

Incompatible items should usually remain visible but disabled with a concise
reason. Hiding them makes the catalogue look unreliable; allowing them to fail
after application is worse. A compatibility filter can remove that noise once
the author understands the constraint.

The catalogue needs descriptor-backed search keywords, category path,
thumbnail fixture or preview recipe, compact description, compatibility
explanation, primary preview parameter, and possibly direct-manipulation
capability. Those are presentation facts about the registered behavior, not
family rules that React should rediscover.

#### The Effect stack: what is applied

Each applied Effect should be one collapsible card in evaluation order. Its
collapsed state should still communicate:

- enable/bypass state without destroying settings;
- family and variant name;
- a compact summary of non-default values;
- whether any parameter is animated;
- simple cost and compatibility warnings; and
- drag handle or other explicit reorder affordance.

Expanded cards expose ordinary parameters, presets as starting points, reset,
duplicate, copy, remove, and parameter animation controls. Reordering should
preview the insertion point and resulting image before commit when feasible.
If some ordering is invalid, the drop target should explain that constraint
rather than silently normalize the order.

The inspector should support All, Edited, and Animated filters, borrowing the
best part of Premiere and After Effects. This is more important than it first
appears: the catalogue may have 59 variants, but the true UI multiplication
comes from every parameter potentially acquiring keyframes, easing, and mixed
values across a selection. Filtering authored state from available state is the
main complexity-control mechanism.

#### Property animation: attached, explicit, and revealed on demand

Every animatable parameter should show the same diamond control, current value,
and previous/next keyframe navigation. The diamond should create or remove an
explicit keyframe at the playhead. Changing a value must not silently turn on
animation or leave the author uncertain whether a static value or keyed value
was edited.

The timeline should not show every possible parameter lane. A selected
parameter can reveal one nested lane beneath its owning clip; an Effect card or
clip can summarize hidden keyframes with ticks or an animated-state badge.
“Show animated” and “show edited” can reveal the small authored subset. A curve
editor is an advanced, on-demand view, not permanent timeline chrome.

Properties, Effect parameters, and Transitions should share the curve picker
and easing names established by the headless contract. Steps, Hold, Back, and
cubic curves should preview their shape. Sharing the primitive should not erase
the owning concept: “animate Swirl Amount” is still different from “change the
Transition duration.”

#### Transitions: boundary objects, not Effect cards

A Transition should continue to live on the scene boundary. Selecting its
boundary chip opens a visual family/variant chooser and a focused inspector for
duration, direction or anchor, easing, edge policy, compatibility, and cost.
The preview should render outgoing and incoming Patterns around that boundary,
because a Transition cannot be judged from either source alone.

Direct duration handles on the timeline can serve the common case. The
inspector handles exact values and less common parameters. The initial product
should keep one visual Transition per boundary rather than invent Transition
stacking before a real use case requires it. Routing behavior and a visual
Transition may coexist, but they should remain named, separate layers of the
boundary model.

#### Overlays: reserve “layer” for another source

The deferred overlay proposal adds genuine compositing: another Pattern source
with its own timing, position, opacity, Effects, and z-order. That deserves a
compact nested lane under its host zone or clip, as #458 proposes. It should
not be implemented as another Effect card, and current Effects should not be
renamed layers in anticipation of it.

This vocabulary keeps future complexity legible:

- an **Effect stack** changes one source in order;
- an **animation lane** changes one property over time;
- a **Transition** combines two sources at one boundary; and
- an **overlay layer** introduces and composites another source.

### How the visual toolkit changes timeline editing priorities

Multi-selection and clipboard behavior should anticipate the visual toolkit
rather than copy only clip identity and placement.

- Applying an Effect or preset to several selected compatible clips should be
  one command and one undo transaction. Incompatible clips stay selected and
  receive an explicit skipped-item report.
- A multi-clip inspector should show shared values and mixed values without
  pretending heterogeneous Effect stacks are identical.
- Paste Attributes should let the author choose the entire Effect stack,
  selected Effects, property animations, or compatible scalar adaptations.
- Scene duplication and scene-range movement must carry clip Effects,
  animations, and a deliberately defined set of boundary Transitions.
- The internal clipboard fragment needs versioned Effect and animation data,
  not an afterthought bolted onto position-only copy.
- Batch apply, reorder, delete, and paste all strengthen the case that semantic
  undo is enabling infrastructure rather than final polish.

Cost should be visible before and after application without turning the editor
into a profiler. The catalogue and collapsed card can use plain labels such as
“one Pattern render,” “extra edge samples,” or “two renders during the
Transition.” An advanced disclosure can show the registry's factual N, N+E, or
2N math, current pixel count, code size, memory, and compatibility details. The
selected clip should also summarize aggregate stack cost, because five cheap
Effects can be the expensive choice.

### Suggested additions to the production-UI acceptance criteria

Issue #457 already covers the essential registry-driven production surface.
The research suggests making these behaviors explicit before implementation:

- search, favorites, and recents in visual discovery;
- bypass, reset, duplicate, copy, and reorder for applied Effects;
- All, Edited, and Animated inspector filters;
- explicit keyframe state rather than implicit auto-keyframing;
- application to a compatible multi-selection with mixed/skipped feedback;
- compact summaries for collapsed non-default and animated Effects;
- cost before addition and aggregate cost after stacking;
- a visible invalid-drop explanation for constrained ordering; and
- Stage direct manipulation only for descriptors that declare a spatial
  affordance.

These additions may require descriptor metadata, but they should not change the
frozen visual behavior. The registry remains the source of truth; the UI adds
ways to find, summarize, and manipulate registered behavior.

Before adding any such fields, #457 should decide whether presentation metadata
is deliberately outside the #459 compatibility fingerprint or requires a
versioned extension to it. Quietly reopening a frozen semantic contract for
thumbnail and search concerns would weaken the evidence boundary; duplicating
family logic in a React-only catalogue would be worse. A small, explicit
presentation-descriptor layer derived from stable registry identities may be
the clean seam.

## The biggest blind spot

The research assumes that reuse means making an independent copy. That is true
for many editing tasks, but the stated need to build a complicated treatment,
reuse it, and continue refining the Show may instead require **linked reuse**:
change the source treatment once and intentionally update every use.

This distinction is load-bearing. Scene duplication, copy/paste, Paste
Attributes, and editable presets all create snapshots. They make the first
reuse fast but allow repeated treatments to drift silently. If authors expect
later propagation, the better eventual concept may be a named look, linked
Effect preset, or reusable choreography motif with explicit detach/update
behavior. That would affect identity, persistence, inspector language, undo,
and cross-Show compatibility; it cannot be simulated faithfully by a smarter
clipboard.

Nothing observed yet establishes that linked reuse is necessary. The point is
to test the expectation before treating copied fragments as the complete reuse
model. The first implementation can still be independent copy, provided the
serialized fragment and UI language do not foreclose named reusable objects.

Recovery remains the immediate enabling dependency. Current mutations persist
through the store as they happen. Multi-item and Effect-stack edits increase
the blast radius enough that undo is not polish. A disposable prototype can
fake history locally, but shippable batch apply, reorder, delete, or paste
should not precede a semantic transaction decision.

## What this research is least confident about

The least-supported conclusion is that a Signal chain and Inspector rail
hybrid will remain comfortable in the busiest real Show. It follows established
editor patterns and matches the frozen headless model, but it has not been
tested against an actual PXLBLZ workflow containing several zones, five or more
Effects on a clip, animated parameters, a boundary Transition, and a
multi-selection. Current evidence comes from product documentation, reviews,
screenshots, the local architecture, and the epic's headless contract rather
than observation of several authors building complex Shows.

The recommendation should therefore guide the next prototype, not settle the
production layout. Evidence that authors spend most of their time comparing
Effects visually might justify a larger persistent catalogue. Evidence that
they spend most time tuning spatial transforms might justify more Canvas desk
behavior. Evidence that they mostly apply a few known looks would make search,
recents, and Paste Attributes more important than either.

## Open decisions before implementation planning

1. What are three real complex Shows users expect to build, and which repeated
   action dominates each: reordering passages, cloning passages, moving clip
   footprints, or repeating adaptations?
2. Does selecting a scene include its outgoing transition, its incoming
   transition, or neither? What happens at the edges of a moved range?
3. What happens when a clip span crosses into or out of a selected scene range?
   Does the selection expand, split the clip, reject the move, or carry a
   partial dependency?
4. Does a clip block have to form one rectangle, or can a sparse set preserve
   relative offsets? What is the anchor for a sparse paste?
5. Is the first clipboard same-Show only, same-output-contract, or cross-Show?
   Does it use the operating-system clipboard or an in-app fragment store?
6. Which bulk inspector fields can apply safely to heterogeneous Patterns and
   clips? How are mixed values represented?
7. What is one undo transaction, how long does history live, and how does
   history interact with asynchronous D1 persistence failures?
8. Should structural drag remain available on narrow/touch layouts, or should
   those layouts expose explicit Move Before/After commands instead?
9. How do keyboard-only users create, extend, move, and inspect the same
   selection without a marquee?
10. When an Effect or preset is applied to several clips, is that an independent
    snapshot or a linked treatment? What later change, if any, should propagate?
11. Which Effect parameters benefit from Stage handles, and which become less
    predictable when the Stage and inspector can both edit them?
12. Does Effect order remain freely editable across every family, or does the
    renderer have semantic stages that need visible separators and constrained
    drop targets?
13. What summary lets an author distinguish two collapsed stacks without
    reopening every Effect card?
14. On a narrow layout, does the catalogue replace the inspector, open as a
    bottom sheet, or temporarily replace the Stage? Which context must remain
    visible during selection?
15. Should incompatible Effects remain visible with explanations by default,
    or appear only when a compatibility filter is disabled?

## Best next research move

Build one disposable interaction prototype around a seeded, deliberately busy
Show and test three workflows, without persistence or compiler changes:

1. Select and move a three-scene passage containing transitions, multi-zone
   clips, clip spans, and property lanes.
2. On one clip, find and apply an Effect, reorder and bypass it in a five-Effect
   stack, animate one parameter, and inspect aggregate cost.
3. Apply that treatment to three non-contiguous clips, then change the original
   and ask what the author expects the copies to do.

Compare magnetic header drag with explicit Move Before/After commands, and
compare the three #457 directions with the recommended Signal chain and
Inspector rail hybrid. Record clicks, pointer travel, mistaken selections,
invalid drops, use of Undo, ability to locate an authored animation, and whether
the user can predict scene displacement, Effect order, Transition ownership,
and copy-versus-link behavior before committing.

The stress case should deliberately include similarly named variants such as
Content Shrink and a Shape-based Shrink, one incompatible Effect, mixed values
across the selected clips, and at least one Effect whose best control is a
Stage handle. A design that is clear only with one Effect on one clip has not
tested the actual complexity this research is meant to contain.

Only after that evidence should this draft become a product decision, PRD, or
set of implementation issues.
