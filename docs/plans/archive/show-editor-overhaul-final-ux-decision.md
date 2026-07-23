# Decision: Final UX treatment for the Show editor

Status: implemented and archived. The production editor integrated this
treatment in #592, and #589 then retired the superseded Scene-centric surfaces.
This file records the selection and its evidence rather than current product
behavior.

## Decision

Select a coherent synthesis: **Candidate A's field-and-ribbon interaction system with Candidate B's bounded light-budget hierarchy**.

Confidence: **high (0.87)**. Candidate A provides the stronger structural, responsive, accessibility, and validation backbone. Candidate B supplies the clearest mechanism for eliminating equal-weight chrome. The synthesis resolves their contradictions rather than averaging them.

## Locked criteria

The decision applies these criteria in priority order:

1. Mental-model fidelity and progressive disclosure.
2. Legibility and information hierarchy.
3. Efficient density without constant compression.
4. Coherent composition across widths.
5. Implementation feasibility and reuse.
6. State clarity and accessibility.

## Selected design

The editor remains one continuous near-black field. Time-bearing Show construction receives first attention: Clips, Transition duration, the amber playhead, and selection. Layout and Zone structure, ruler context, Navigator range, and Stage result form the second tier. Effects, properties, relationships, and Entity Details form the third tier.

Three surface levels and two separator strengths replace nested boxes. Clips, Transitions, floating tools, and overlays retain enclosure because they are objects. Toolbar actions, Layers, Zones, property rails, and Layout intervals use spacing, tinted bands, single-edge rules, and typography instead of four-sided containers.

Clips use a stable neutral body with a restrained Pattern thumbnail or 3 px identity key. Pattern luminance must not determine whether a Clip is visible. A full-height gradient name scrim guarantees at least 4.5:1 contrast, targeting 7:1, while the name and badges remain transparent so the Clip reads as one lit object. Stage imagery remains vivid but is bounded so it cannot outrank the timeline.

Use these starting dimensions:

- Show title: 16-18 px.
- Layout, Zone, and Clip names: 13-14 px; never metadata size.
- Controls: 12-13 px.
- Metadata and ruler labels: 10-11 px, used sparsely.
- Layer rows: 36 px in the approved prototype.
- Clip bodies: 30 px with a 3 px vertical inset.
- Comfortable detail rails: 22-26 px; compress to 18-20 px only beyond two rails.
- More than four visible rails: a `+N properties` disclosure into a bounded, internally scrolling well.
- Collapsed Zones: 28-32 px, retaining the readable Zone name and time-accurate miniature.
- All narrow entities: at least a 24 px effective target, with candidate cycling and announcement where targets overlap.

Layout labels remain sticky within their own intervals. Short intervals ellipsize without crossing interval boundaries; focus, tooltip, and accessible text expose the complete name. A one-Zone interval reads `Layout name · Zone name` and has no redundant Zone header or collapse control.

Multi-Zone stacks use a 2 px low-chroma identity spine and slight alternating band luminance. Collapsed miniatures preserve Clip spans, Transition wedges, Cut ticks, Effects, keyframes, Markers, playhead passage, and snap targets. They must not use disabled-state dimming or lock hatching.

Relationship grammar remains redundant and monochrome-safe:

- Transition connection: interlocking duration geometry.
- Shared Pattern instance: chain glyph, repeated key, and dotted edge.
- Group-definition reuse: stacked-bracket glyph and definition label.
- Group selection: external selection bracket.
- Isolation: unrelated content dims and shows a lock cue upon interaction.

Current time uses amber. Selection, snapping, and active manipulation use cyan with distinct geometry. Authored modulation uses violet. Keyboard focus uses a high-contrast offset ring visible over selection. Green and red remain semantic and always receive a shape or label cue.

Show End appears exclusively in the ruler.

### Responsive composition

Desktop retains a 320-400 px Stage column separated from the timeline by one divider.

At mid-width, Stage narrows to 260-320 px and remains a column. It does not become a floating card. This avoids adding an occluding surface alongside Entity Details, the Zone Map, menus, and drag feedback.

At narrow widths, Stage is removed before time or readable rows are compressed. A modeless Preview action opens an edge pane or overlay without changing preview time. Entity Details retain the same source-attached model and clamp inside the available viewport. The design does not introduce a bottom sheet or a second inspector mode.

The toolbar never wraps. Its fixed order is transport/time, Navigator with adjacent Fit, authoring commands, and Preview when Stage is absent. Reduction proceeds as follows:

1. Remove optional control labels.
2. Shrink Navigator from approximately 220 to 160, then 120 px.
3. Move Effect and property commands into More.
4. Move Group commands into More.
5. Move Cut and Transition commands into More while retaining contextual edge affordances.
6. Narrow Stage.
7. Compact the time readout and secondary zoom display.
8. Remove Stage and add Preview.

Play/Pause, compact time, a directly manipulable Navigator, Fit, selection, insertion, Zone Map, More, and conditional Preview remain available. At the supported floor, the toolbar may scroll horizontally rather than replace the Navigator with a popover.

### Floating tools and transient detail

Entity Details use Candidate A's source-relative placement and collision sequence: prefer adjacent free space, flip before covering the source, pack panels into non-overlapping slots, then stagger if necessary. Panels retain source association when the entity scrolls offscreen.

One unpinned Detail is transient. Pointer-down anywhere outside Entity Details closes all transient Details while retaining selection; clicking the selected Clip again is therefore a toggle. A pin preserves a Detail for comparison. Clip Details keep a compact applied-Effects stack, while Add Effect opens the large modeless catalogue temporarily and returns focus to the new Effect card after application.

Drag start hides all Details panels. Successful drag completion recalculates anchors; cancelled drag restores original placements. Escape closes all Details and restores focus but does not clear selection.

Temporary rail expansion is anchored within an overlay well so adjacent rows and the active pointer or keyboard target do not move. Explicit disclosure may expand the bounded rail well with internal scrolling.

Layering is deterministic: timeline content; playhead and snap feedback; drag or insertion previews; Entity Details; Zone Map; menus and tooltips. Details hide during dragging, and the Zone Map temporarily sits above them without reflow.

The Zone Map defaults to Candidate A's chronological Layout-and-Zone list because it requires no unconfirmed spatial data and supports navigation across the Show. A spatial view of the playhead's Layout may be added later if that data exists and testing demonstrates value.

## Why it won

Against mental-model fidelity, Candidate A is decisively stronger. Its treatments explicitly preserve authoring invariants, including Fit never seeking, Collapse never erasing time, authored-only rails, ordinary geometry before Viewport detail, and distinct reuse relationships. Candidate B loses fidelity in its one-Zone naming, Group-reuse ambiguity, and playhead-scoped spatial Zone Map assumption.

Against hierarchy, Candidate B contributes the decisive mechanism: content receives the light budget while structure recedes into bands and single edges. Candidate A states the right attention order but does not guarantee that retained Clip imagery can produce it. The synthesis removes Candidate B's fragile dependency on thumbnail brightness by giving Clips a stable minimum-luminance body and contrast-controlled name treatment.

Against density, Candidate A's readable rows, manual Zone collapse, authored-only detail, and bounded rail overflow better match the contract than Candidate B's 12 px rails and internally contradictory 8-12 px hit regions. Density is paid through disclosure and collapse, not permanent compression.

Against responsive composition, Candidate A's persistent mid-width Stage is more coherent and feasible than Candidate B's floating Stage card. Candidate B's directly manipulable 120 px Navigator and narrow bottom-sheet Details treatment are retained because they better protect horizontal time.

Against feasibility, Candidate A reuses more of the established editor and adds fewer surface modes. The synthesis introduces only the useful parts of Candidate B's visual system: light budgeting, name scrims, identity spines, band alternation, and sticky interval labels.

Against accessibility, Candidate A's effective-target floor, overlap cycling, cancelled-drag restoration, state redundancy, and broader validation plan outweigh Candidate B's richer but potentially conflicting shortcut map. Candidate B's exact shortcuts remain proposals subject to reconciliation with established bindings.

## Lineage

**Candidate A supplies:**

- The field-and-ribbon structural treatment.
- The mental-model trace and interaction invariants.
- Readable typography and row geometry.
- Toolbar grouping and most of the reduction order.
- Persistent mid-width Stage and narrow Preview behavior.
- Source-relative Entity Details lifecycle.
- Authored-only rails and bounded property overflow.
- Amber current time and cyan interaction roles.
- Twenty-four-pixel effective targets and overlap cycling.
- Relationship grammar and quantified disconfirmation thresholds.

**Candidate B supplies:**

- The light-budget hierarchy.
- Three surfaces, two separator strengths, and object-only enclosure.
- Guaranteed Clip-name scrims.
- Zone identity spines and subtle band alternation.
- Sticky-within-interval Layout labels.
- Direct 120 px Navigator with adjacent Fit.
- Narrow bottom-sheet Details with open-panel tabs.
- The rule that collapsed miniatures never resemble disabled content.

**The judge's necessary synthesis supplies:**

- Stable neutral Clip underfills instead of thumbnail-dependent dominance.
- Ruler-only Show End.
- A non-floating mid-width Stage.
- A directly manipulable narrow Navigator instead of a popover.
- Deterministic overlay layering and collision behavior.
- Target-stable rail expansion.
- Short-interval label handling.
- The chronological Zone Map as the default, with spatial presentation deferred.
- Removal of Candidate B's `Esc`-clears-selection behavior and sub-24 px targets.

## Strongest rejected alternative

The strongest rejected alternative is **Candidate A alone, with only its direct contract errors corrected**.

It is conservative, highly buildable, and strongest across four of the six criteria. It loses because its claimed first-attention hierarchy depends on retained Clip imagery without guaranteeing either Clip dominance or name contrast. A de-boxed interface can still remain visually flat if the primary objects are not assigned a controlled luminance role.

Candidate A alone would become preferable if rendered tests show that existing Clip styling already produces reliable first-glance dominance across bright, dark, and low-variance Patterns; Clip and Zone names maintain the required contrast without scrims or neutral underfills; and Zone attribution remains reliable without spines or band alternation. That evidence would make Candidate B's added hierarchy machinery unnecessary.

## Material dissent and human gates

The design direction is resolved. Remaining gates require rendered or product evidence rather than further opinion:

- Final font family and exact pixel values within the selected ranges.
- The exact width where Stage removal becomes necessary. The rule is fixed: keep the narrow column until it causes the 120 px Navigator, readable names, minimum targets, or usable time width to fail.
- The number of simultaneous Details panels before the narrow tabbed treatment or another overflow strategy becomes necessary. Start with three.
- The worst credible animated-property count. Stress-test eight until telemetry or representative projects establish a different fixture.
- Existing keyboard bindings, which must be reconciled before Candidate B's proposed traversal shortcuts are adopted.

The larger load-bearing assumption is that Show construction matters more often than sustained multi-entity numeric comparison. Reconsider a docked inspector if representative sessions commonly sustain three or more Details panels, floating panels obscure required targets in more than 25% of dense tasks, or docking improves repeated property work by at least 20% without materially reducing timeline comprehension.

## Validation and next step

Build one interactive visual-prototype slice using a dense fixture: three or more Layout intervals including short and one-Zone intervals, four Zones, three Layers per expanded Zone, mixed Cuts and Transitions, shared instances, Group reuse, several Markers, one Clip with eight animated properties, mixed collapse states, and a pinned-plus-transient Details comparison.

Render it continuously from 1440 px to the supported narrow floor and test:

- Five-second attention order.
- Clip-name contrast across bright and near-black Patterns.
- Layout and Zone attribution mid-scroll.
- Transition, shared-instance, Group-selection, and Group-reuse discrimination.
- Collapsed-miniature target acquisition and snap accuracy.
- Fit versus seek comprehension.
- Panel occlusion, drag restoration, and narrow bottom-sheet use.
- Keyboard completion, 200% zoom, reduced motion, grayscale, and screen-reader naming.
- Pan, zoom, drag, collapse, and focus performance.

Reverse or materially revise the decision if Clips fail to receive first attention despite the neutral underfill, Zone attribution errors persist, collapsed content is mistaken for disabled content, relationship discrimination falls below 80%, missed miniature targets exceed 10%, or the docked-inspector thresholds above are met.

## Process metadata

- Weight: `deliberative`
- Workers: `Claude Fable xhigh; Codex gpt-5.6-sol xhigh`
- Blindness: `candidate mapping hidden; Candidate B presented before Candidate A`
- Exposure: `solution-exposed`
- Judge agreement: `independent agreement`
