# Final production design: Show Timeline and Scene-local editing

The final asset combines a stable global Timeline, an explicit read-only Scene
inspector, and an additive Scene-local editor inside the existing library,
authoring, and Stage frame. Ordinary zoom changes geometry without changing
scope. Selection opens one anchored Entity Detail Panel, while dense subordinate
information appears only through explicit disclosure.

Interactive review route:

```text
http://localhost:5175/PXLBLZ-IDE/?prototype=timeline-dual&round=final&scope=show&fixture=cathedral&zoom=3.2
```

The floating prototype switcher changes between Global Show and Scene local and
between the four-zone Atrium and twelve-zone Cathedral fixtures. It is review
chrome and is not part of the production interface.

The presentation-only Super Detail route opens the read-only Scene inspector
over Global Show with several Zone hierarchies summarized at once. `Open Scene`
then enters the full peak-density Scene-local editor with five Zone hierarchies
and representative cuts, Effects, overlays, and automation disclosed:

```text
http://localhost:5175/PXLBLZ-IDE/?prototype=timeline-dual&round=final&scope=show&fixture=cathedral&view=peak&zoom=5.1
```

## Application frame

The library remains at left, the authoring surface remains in the center, and
the Stage remains at right. Library collapse is a shared application-shell
behavior with an explicit restoration control. Shows benefit most from the
space, but entering a Show never collapses the library automatically.

The Stage keeps one physical representation across Pattern, Show, and Scene
work. Its content specializes for Show output, Scene composite, temporary
candidate preview, and explicit Zone visualization. It does not move or become
a second Scene-specific preview.

## Timeline header

The header has three stable regions:

```text
LEFT                          CENTER                    RIGHT
[Play/Pause] [Start] [time]   [- slider +] [5.1x]      [Snap] [Fit] [Split] [Clone]
```

Play/Pause is the primary transport control and appears first. Current time is
brighter than total duration. Zoom controls and the numerical multiplier remain
centered as one readout. Its minus and plus steppers remain semantic buttons but
render as borderless glyphs that gain the transport accent on hover. Fit is a
viewport command and sits with editing actions on the right. Clone occupies the
right edge as the most frequent contextual command, followed by Split, Fit, and
the less frequently toggled Snap state when read right to left.

Responsive behavior follows task priority. The slider shortens first, command
labels disappear second, and time stacks only when the Timeline header becomes
genuinely narrow. The compact time state uses aligned equal-precision values;
it is not natural line wrapping.

Select is the pointer's default behavior and does not consume a toolbar button.
Space-drag is a transient expert panning gesture with hand-cursor feedback, not
persistent chrome. Snap remains visible because it is durable editing state.

## Global Show Timeline

Global scope uses a time ruler, Scene band, optional Scene X-ray, dedicated
Transition track, and compact Zone rows. A Zone's label selects it; its separate
chevron expands owned Effect, automation, and activity lanes. Color identifies
semantic families across surfaces instead of assigning decorative colors to
Zone rows.

One Scene may expose a 36-pixel read-only X-ray with three terse strata: cuts,
Effect activity, and authored property beats. Continuous zoom spreads those
same signals and snap references. The X-ray never changes height or enters
Scene-local scope at a threshold.

The magnify action beside the X-ray opens one temporary read-only Scene
inspector. It retains global bounds while showing a local ruler, named rapid
cuts, boundary context, Effect spans, automation shape, and continuing content.
`Open Scene` enters full Scene-local authoring. Escape, click-away, or selecting
another owner dismisses or transfers the temporary layer.

## Scene-local editing

Scene-local scope reuses the shell, Stage, transport, zoom, playhead, row grammar,
semantic colors, selection behavior, and Entity Detail Panel. The scope bar
shows Scene identity and local/global time context. Returning to Show restores
global orientation.

Incoming and outgoing boundary Transitions appear near the top as read-only
spans using actual local-time geometry. The boundary remains the editable owner
in global scope. Scene placements, rapid cuts, Effects, overlays, and automation
remain active beneath that context.

Effect and automation lanes are children of the placement or Zone that owns
them. Compact sparklines preserve timing, extrema, and waveform shape; small
dots mark authored times without implying direct drag handles. Selection exposes
exact time, value, and easing in the Entity Detail Panel. Only an explicitly
focused property pays for a taller editing lane.

## Selection and Entity Details

The first release uses one selection owner. Clicking an entity selects it and
opens its anchored Entity Detail Panel. Selecting another entity transfers the
panel; clicking the selected entity, clicking empty space, or pressing Escape
closes it. A stem or aligned edge keeps ownership visible, and the panel may
flip or temporarily cross pane boundaries rather than reflowing Timeline rows.

Editable fields, read-only facts, and structural commands have distinct
treatments. Zone details include nominal pixels, current map assignment, and
`Show Zone on Stage`. Boundary references inside Scene-local scope offer
`Edit boundary in Show` rather than implying local ownership.

Split activates when the playhead intersects the selected clip. Clone activates
for one cloneable selection, duplicates it immediately after itself, and ripples
later content forward. Drag selection, multi-select, grouped movement, and
general copy/paste are deferred to the next interaction-efficiency iteration.

## Effect and Transition selection

The registry chooser is a compact modeless palette rather than a full-screen
gallery or long select element. Family navigation and search reduce the set.
Dense named rows carry small motion mnemonics; hover and keyboard focus reveal
description, compatibility, and starting presets.

The existing Stage previews the candidate temporarily. The palette does not
contain a second literal candidate viewport. Choosing a starting treatment or
preset returns to Entity Details, where exact parameters remain editable.
Apply commits; Escape restores the saved treatment.

## Verified behavior

The final prototype was checked at 1440x900, 760x720, and 600x720 using the
dense twelve-zone Cathedral fixture. The selected Scene's center remained
within 0.5 pixels of the Timeline viewport center while zoom changed from 3.2x
to 5.1x. The X-ray remained 36 pixels tall. At 760 pixels the time readout
remained inline; at 600 pixels it used the designed stacked state. The page had
no document-level horizontal overflow or console errors.

The browser flow also verified explicit Scene inspection, `Open Scene`, compact
Transition palette, Escape cancellation, Zone disclosure, Snap state, clip
selection, and Clone enablement/status.

## Deferred work

The following ideas remain compatible with the design but are not part of the
first implementation:

- drag selection, multi-select, grouped movement, and general copy/paste;
- a freely repositionable or pinnable Entity Detail palette;
- automatic zoom-to-Scene scope changes;
- detachable Stage windows;
- direct manipulation of compact sparkline points;
- named Zone groups or previewing inactive Zone sets; and
- a persistent miniature Show navigator in Scene-local scope unless later
  workflow testing proves it earns its height.
