# Shows campaign goal catalog (#788)

This is the 111-goal input used by the Shows manual test campaign on
2026-08-10. Preserve goal IDs when adapting it so raw verdicts and evidence
remain traceable.

Columns: ID | Goal (what the tester must achieve, in user language) | Doc
section in the Feature Guide | Expected per docs | Flags.

Flags: D=destructive (serialize in one batch), HW=bench hardware, N=narrow
viewport, S=special driver setup, X=expected-WALLED probe.

"Setup via API allowed" means prerequisites, such as a Controller profile, may
be created through the personal-content API before UI work starts. The goal
itself must be reached through the UI.

## A. Lifecycle and rail

| ID | Goal | Section | Expected | Flags |
|----|------|---------|----------|-------|
| A1 | Create a Portable Show with a 2D reference map; it appears in the rail and opens in the editor | 12 | Two-step wizard; contract pill shows "Portable - N px" | control |
| A2 | Create an Installation Show on a map with a fixed pixel count; the pixel field locks | 12 | Field disabled, "Measured by the fixed map." | |
| A3 | Start creating a Show, then abandon with Escape and again with Cancel; no record is created either time | 12 | Prior view restored, rail unchanged, no POST | |
| A4 | Rename a personal Show from the rail row menu; new name survives reload | 2 | | |
| A5 | Rename the same Show from the editor's inline title | 13 | | |
| A6 | Create a folder, move a Show into it with Move to..., reorder with Move up/down | 2 | | |
| A7 | Move a Show to Trash, then Empty Trash; it is gone after reload | 2 | Only deletion path | D |
| A8 | Signed out: confirm you cannot create Shows but can browse and open built-ins | 2,18 | "Sign in to save shows" link; no Add menu | S(no-session driver) |
| A9 | Open lesson "101", edit a clip, confirm the edit sticks while browsing away and back, then Reset restores the shipped version | 18 | Session draft + Reset | |
| A10 | Edit a built-in, reload; shipped definition is restored | 18 | Session-only draft | |
| A11 | Create a Show seeded from a Controller profile with zones ("New show from <profile>") | - | Menu item exists only with a zoned profile (setup via API allowed). Feature Guide does not mention this: candidate DRIFT | |
| A12 | Duplicate one of your Shows | - | Expect WALLED: no duplicate affordance anywhere | X |
| A13 | Turn a built-in lesson into a personal Show you can keep | 18 | Expect WALLED: no fork path; note data-loss UX (authoring on a built-in is lost on reload) | X |
| A14 | On a reference Showcase, use Try with Pattern to run your own Pattern through the choreography | 18 | Reference swap works; session-only | |
| A15 | Open a Show, reload the app root (keep `?showtime`); the same Show restores as active | 2 | Last-active restore | |
| A16 | Open Redline Installation; compile bar reports it inside the support envelope | 17,18 | 2,000 px flagship loads | |
| A17 | Filter the rail by name; both personal and built-in trees filter | 2 | | |
| A18 | Open a lesson's guide note from the header trigger | 18 | Note discloses | |

## B. Timeline authoring

| ID | Goal | Section | Expected | Flags |
|----|------|---------|----------|-------|
| B1 | Add a Clip at the playhead via Add to Show -> Clip | 13 | Pattern chooser at playhead | |
| B2 | Add a Clip by double-clicking empty Layer time | 13 | Chooser opens at that spot | |
| B3 | Drag a Clip later on its Layer; drops land on the tick grid with a live time readout | 13 | Snap + readout | |
| B4 | Option-drag a Clip to duplicate it | 13 | Independent duplicate | |
| B5 | Drag a Clip onto a different Layer | 13 | Move without overwriting | |
| B6 | Resize a Clip from both edges | 13 | Edge handles | |
| B7 | During a drag, hold Shift for tenth-second placement, then Alt to suspend snapping | 13 | Modifier contract | |
| B8 | Split a Clip at the playhead | 13 | Two clips, motion preserved through cut | |
| B9 | Try to Split with the playhead outside any clip, and again right at a clip edge; the button explains each refusal | 13 | Distinct surfaced reasons | |
| B10 | Clone a selected Clip | 13 | Duplicate placed after itself | |
| B11 | Delete a Clip with the keyboard, undo restores it, redo removes it again | 13 | Cmd+Z single-step | |
| B12 | Try to delete the last remaining Clip | 13 | Refused: "Keep one Clip" | |
| B13 | Marquee-select two Clips and make a Group | 13 | One selectable occurrence | |
| B14 | Duplicate a Group occurrence; edit inside one; the edit appears in the other | 13 | Linked definition | |
| B15 | Make Unique on one occurrence breaks the link | 13 | | |
| B16 | Ungroup dissolves the container, Clips remain | 13 | | |
| B17 | Double-click a Group to edit in place (rest dims); Escape exits isolation | 13 | | |
| B18 | Create a Marker at the playhead; rename it, recolor it, delete it | 13 | Marker dialog | |
| B19 | Create a Marker by dragging from the toolbar onto the ruler | 13 | Drag-create | |
| B20 | Hide Markers; markers vanish and no longer snap | 13 | One preference drives both | |
| B21 | Change Show length by dragging the Show End diamond, then by exact field | 13 | | |
| B22 | Insert 5 seconds of time at the playhead; downstream Clips shift | 13 | Add -> Time | |
| B23 | Add a Layer and place a Clip on it | 13 | | |
| B24 | Make five distinct edits, undo all five, redo all five | 13 | Each commit one undo step | |
| B25 | Pan and resize the visible range with the Navigator; Fit restores | 13 | | |
| B26 | Horizontal trackpad / Shift-wheel pans the timeline while vertical wheel scrolls the page | 13 | Distinct axes | |
| B27 | Traverse Clips with Tab/Shift-Tab in timeline order | 13 | Keyboard traversal | |
| B28 | Toggle Snap off; the preference survives reload | 13 | Session pref | |

## C. Clip inspector

| ID | Goal | Section | Expected | Flags |
|----|------|---------|----------|-------|
| C1 | Select a Clip to open its detail panel; click the Clip again to close; Escape also closes and returns focus | 13 | Panel toggling | |
| C2 | Pin one Clip's panel, open a second Clip's panel beside it | 13 | One pinned for comparison | |
| C3 | Swap a Clip's source Pattern | 14 | Combobox | |
| C4 | Change Animation speed; the change survives reload | 14 | Instance-owned | |
| C5 | Two Clips sharing a Pattern instance: change speed (affects both), Make Pattern Independent (isolates one), Rejoin Shared Pattern | 14 | Instance lifecycle | |
| C6 | Move a Clip's content with the Place pad; exact X/Y fields agree with the pad | 14 | Pad to fields | |
| C7 | Rotate content, use the anchor grid, zoom the pad | 14 | | |
| C8 | Give a Clip a star-shaped Aperture with a soft edge; shape-specific fields appear | 14 | Silhouette catalogue | |
| C9 | Add one Effect from each stage (transform, distortion, address, color) via the registry | 14 | Staged registry, search | |
| C10 | Duplicate an Effect, remove one, reorder the stack | 14 | Overflow menu | |
| C11 | Add Mirror; confirm it lives in its fixed Transform row and can be removed there | 14 | Special-cased row | |
| C12 | Set presentation to Freeze, then Strobe with a cadence, then Blink with rate/duty/phase, then Stutter | 14 | Presentation modes | |
| C13 | Set Clip evaluation to Freeze at entry, then Refresh | 14 | Cost policies | |
| C14 | Set Clip Brightness and Opacity from the header fields | 14 | | |
| C15 | Click a fact in the Clip's summary row; the owning tab opens with the field focused | 13 | Summary shortcuts | |

## D. Transitions and property animation

| ID | Goal | Section | Expected | Flags |
|----|------|---------|----------|-------|
| D1 | Open the Transition palette from a Cut chip; browse families; leave without committing - junction unchanged | 15 | Browse is not commit | |
| D2 | Apply a Fade with a custom duration and easing | 15 | | |
| D3 | Change the family to Wipe; fields swap to the wipe's legal set | 15 | Per-variant fields | |
| D4 | Hover transition variants; the Stage previews without saving | 15 | Hover preview | |
| D5 | Reset to cut returns the junction to zero duration | 15 | | |
| D6 | Animate a parameter via its hollow diamond -> two-point ramp | 15 | | |
| D7 | Reopen the ramp via the filled violet diamond; change an endpoint | 15 | | |
| D8 | Open Animations - N overview; jump to a track's field; remove one track | 15 | Single removal home | |
| D9 | Confirm a >=3-keyframe track is read-only in the overview | 15 | Never rewritten | |
| D10 | Animate Clip X; a named sparkline appears beneath the Zone | 15 | Sparkline lanes | |

## E. Zones and routing

| ID | Goal | Section | Expected | Flags |
|----|------|---------|----------|-------|
| E1 | Reveal the Zone rail with Zones; close it again | 16 | Progressive disclosure | |
| E2 | In the Zone Map: add a zone, rename it, recolor it | 16 | Single home for zones | |
| E3 | Delete a zone: first press arms, second confirms; waiting about 3s disarms | 16 | Two-step delete | D |
| E4 | Observe what happens to a zone's Clips when the zone is deleted | 16 | Clips deleted with it | D |
| E5 | Try to remove the only remaining zone | 16 | Refused | |
| E6 | Append a Zone Layout interval; select it on the Layouts lane; change its routing mode | 16 | | |
| E7 | Insert a Layout boundary at the playhead ("Insert here") | 16 | | |
| E8 | Duplicate a Layout interval (stays linked), then Make unique | 16 | Linked like Groups | |
| E9 | Duplicate + Clips copies the interval's Clips too | 16 | | |
| E10 | On a 2-zone Portable Show, confirm grid-2x2 is unavailable; add zones to 4; it unlocks. Try checker, rings, pinwheel, wave and their parameters | 16 | Gated modes | |
| E11 | Author an animated Soft Split: axis, feather, and the boundary routing switch (destination, duration, easing, direction) | 16 | Split animates while clocks continue | |
| E12 | Installation: select LEDs for a zone on the map with replace/add/subtract, clear, commit | 16 | Spatial selection | |
| E13 | Author overlapping/incomplete Installation coverage; artifact output blocks with an actionable explanation; repair unblocks | 16,17 | Exact coverage validation | |
| E14 | Enter physical ranges as text ("0-63, 128-191"); then try invalid text | 16 | Parse + error handling | |

## F. Compile and outbound

| ID | Goal | Section | Expected | Flags |
|----|------|---------|----------|-------|
| F1 | Read the compile bar; open the source inventory popover; find VM words | 17 | Byte-level inventory | |
| F2 | On Overture, hover the source meter and move into the inventory, then pin it; distinguish configured uses, copies in delivered code, timeline placements, generated placement source, Pattern copies running, and Busiest LED calculations | 17 | Hover remains open across the pointer crossing; Pattern and shared rows add to the artifact total | |
| F3 | View code opens the generated Pattern source read-only | 17 | | |
| F4 | Export .epe; the file downloads with provenance; re-import recovers it | 17 | Compatibility contract | |
| F5 | Push a Show over 2,000 px; outbound actions block with a named cause while editing continues | 12,17 | Support envelope | |
| F6 | Connect the bench pb32 and Run a small Show on it; LEDs play the Show | 17 | | HW |
| F7 | Save the Show to the Controller; it appears in Saved Patterns with a source link | 17 | | HW |
| F8 | Trigger the preflight dialog (a Show with warnings); Cancel aborts, confirm sends | 17 | Warning-gated | HW |
| F9 | Run the Redline Installation on the bench Controller (#745 evidence) | 17,18 | | HW |
| F10 | Set the Target Controller in Show properties and confirm it affects where Run sends | 16 | Installation targeting | HW |

## G. Stage and preview

| ID | Goal | Section | Expected | Flags |
|----|------|---------|----------|-------|
| G1 | Drive transport by keyboard only: Space, A, 1/2/3, arrow seeks | 13 | Full keyboard map | |
| G2 | Seek to a time, screenshot; seek away and back; the frame is identical | 13,20 | Deterministic seek | |
| G3 | Solo one zone on the Stage; unsolo; Show all zones | 16 | | |
| G4 | Toggle Stage diagnostics: zone outlines and clip outline | 16 | | |
| G5 | At <=980 px width: Preview Stage button appears; overlay opens, closes, returns focus | 13 | Narrow layout | N |
| G6 | Move content off-stage; a warning about off-stage pixels appears | 16 | | |
| G7 | Pan the viewport so the playhead leaves it; the playhead marker hides rather than pinning | 13 | | |
| G8 | Stage identity line matches the output contract pill | 12 | | |

## H. Persistence and resilience

| ID | Goal | Section | Expected | Flags |
|----|------|---------|----------|-------|
| H1 | Author a Show touching every entity kind (clip edit, effect, transition, zone, marker); everything survives reload | 2,12 | Durable D1 persistence | |
| H2 | After reload, undo is empty (history is session-only) - observe and record; Feature Guide makes no claim | 13 | Candidate doc gap | |
| H3 | Snap, marker visibility, and zone-rail state survive reload | 13 | Session prefs | |
| H4 | Go offline (driver command), make an edit, come back online: does the UI ever tell you the save failed? | - | Store rolls back silently - expected UX finding | S(offline) |
| H5 | Open the same Show in two tabs; edit in one; describe what the other shows and whether either clobbers | - | Observe, document | S(two pages) |
| H6 | Edit a built-in and prove via the request log that no `/api/shows` write ever fires | 18 | Draft isolation | S(apilog) |
| H7 | Make ten rapid consecutive edits; all ten persist after reload | - | Serialized persistence queue | |
| H8 | Confirm personal Show content is not mirrored into localStorage | - | Privacy invariant | S(eval) |

Total: 111 goals. Pilot: A1 (control), A3, A7 (D), A9, B1, B8, B12,
E2, G1, H1.
