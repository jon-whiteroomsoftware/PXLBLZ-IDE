# Clip detail dialog: competitive analysis (#640)

Analysis only. This document surveys how peer tools partition a dense
per-entity property surface, names the option space, and records which
mechanisms look transferable to the Clip Entity Detail Panel. It deliberately
proposes no layout; that is the next step.

## What the dialog is actually up against

The measurements that make peer comparison meaningful:

- The panel is **340px wide, 560px max height** (`ShowEntityDetailPanel.tsx:74`)
  and floats over the timeline, anchored to the Clip it belongs to.
- It currently holds **five disclosure sections plus a persistent primary
  block**: Source pattern / Speed / Bright / Start / Duration, then Placement,
  Effects, Pattern controls, Advanced clip controls, Property animation.
- The **widest single thing** it must hold is a Vignette Effect at **six
  numeric parameters** (amount, softness, radius, center X, center Y, aspect).
  Ripple and Kaleidoscope have five. Most Effects have one or two. Threshold,
  the one in the screenshots, has two.
- The **placement pad is a fixed 384px SVG** (`ShowClipPlacementPad.tsx:33`)
  plus a toolbar, a zoom row, a corner-anchor grid, and two lines of helper
  prose, which is why it needs its own ~500px popover beside the panel.

So the problem is not "too many controls" in the abstract. It is that one
340px column is being asked to serve six unrelated jobs at once, and the
sections that lose the space fight are the ones an author is most likely to be
in the middle of.

## The peer set, and why each one earned its place

Chosen for reputation at *taming* density rather than for having a lot of it.
Grouped by what they are evidence of.

| Tool | Why it is in the set |
|---|---|
| **Final Cut Pro** | The canonical tabbed inspector. Video / Color / Audio / Info as a tab strip over one panel, and the tab set itself changes with what is selected. |
| **Filmora** | The direct commercial answer to "video app that is praised for not overwhelming people": a Property Panel with Video / Audio / Color / Motion tabs and nothing else. |
| **CapCut** | Currently the strongest example of a complex editor that a beginner opens without a tutorial. Right-side panel, tabs named Basic / Transform / Adjust. |
| **iMovie** | The extreme reduction case. An icon strip that swaps in exactly one small control cluster at a time, and never scrolls. |
| **DaVinci Resolve** | Tabbed inspector *plus* the best per-parameter row treatment in the industry. |
| **TouchDesigner** | The closest structural analogue to our problem: an operator with dozens of parameters, split into named pages, in a small dockable dialog. |
| **Lightroom Classic** | Solo Mode, the only well-known middle ground between free accordions and hard tabs. |
| **Ableton Live** | Device chain: reorder by dragging the title bar, collapse a device to a single title row. |
| **Unreal Engine** | Search-as-navigation across an arbitrarily large property tree, plus an explicit "advanced" tier. |
| **After Effects** | Included as the cautionary case, not the model. |

Deliberately excluded: Blender (vertical icon tabs are the right idea but the
Properties editor is a full editor area, not a 340px floating panel) and Figma
(its right panel is shallow, so it never has to solve this).

## The option space

Five mechanisms account for nearly everything the peer set does about
*sections*. They are not mutually exclusive, and the good tools stack two or
three.

### A. Hard tabs over a persistent header

Final Cut Pro, Filmora, CapCut, Resolve, and TouchDesigner all converge on
this, independently, across a 15-year span. The shape is consistent:

- A small always-visible identity/header zone that never tabs away.
- A single-row tab strip, four to six items, short one-word labels.
- Exactly one tab body visible, sized so the common case does not scroll.
- The tab set is **contextual**: Final Cut swaps the whole strip depending on
  whether a clip, transition, title, or generator is selected. Filmora's Video
  tab relabels to "Multiple" on a multi-selection.

Cost: you cannot see two facets at once, and every tab is a thing a user has
to *know* exists. Both are real, and both have known mitigations (D and E
below).

Transfer verdict: **strong**. This is what Jon proposed, and the reason to
believe in it is that the entire video-editing category arrived at it
separately from the parametric-tool category (TouchDesigner). Five tabs is
comfortably inside every peer's range. The contextual part matters as much as
the tabs: Placement is meaningless on a non-2D stage, and Pattern controls is
empty for a Pattern that exports none.

### B. Solo Mode accordion

Lightroom Classic: opening one panel automatically collapses the previous one,
so the column never grows past one section. Shift-click opens an extra one.
Toggled per panel group, off by default.

This is the honest answer to the thing Jon named: "we give you the turndowns
to let you collapse individual places, but then you just have to manage it
yourself." Solo Mode is that management, automated, and it has been shipping
since 2007 with a reputation as the tip you wish you had known earlier.

Transfer verdict: **useful as a fallback, not as the plan.** It preserves
today's markup and fixes the runaway-height problem for one line of code. But
it keeps the scroll model, keeps section discovery hard, and gives no place to
put a wider inline pad. If tabs are rejected, this is the cheap consolation
prize.

### C. One cluster at a time, chosen by an icon strip

iMovie: a row of icon buttons above the viewer, each swapping in one small
cluster (color balance, color correction, crop, stabilization, speed, volume,
noise reduction, info). The clusters are deliberately tiny. Nothing scrolls,
ever. CapCut is the same idea with words instead of icons.

The interesting property is not the icons, it is the **budget discipline**: a
cluster that does not fit the fixed height is a design failure to be fixed by
cutting, not by adding a scrollbar.

Transfer verdict: **adopt the discipline, not the icons.** Icon-only tabs
would be a mistake here (nobody has a learned glyph for "Property animation"),
but the rule that each tab body must fit without scrolling in the common case
is exactly the constraint that would force Effects to get compact, which is
what Jon actually wants. It is a stronger forcing function than "make Effects
denser" as a wish.

### D. Search as navigation

Unreal's Details panel: a search box at the top filters every property across
every category as you type. It is what makes an arbitrarily deep property
tree survivable, because you never need to know which category a thing is in.
Unreal pairs it with an explicit **advanced tier**: properties marked advanced
are hidden behind a per-category expander by default.

Transfer verdict: **the advanced tier, yes; the search box, not yet.** We
already have the advanced tier concept and it is already the right instinct
(Advanced clip controls, Advanced compiled cost). Search is the standard
mitigation for the "which tab is it in" cost of mechanism A, but at five tabs
and roughly forty fields it is over-engineering. It is the thing to hold in
reserve if the tab count ever grows past six.

### E. Sticky page memory across selection

TouchDesigner is explicit about this and treats it as a feature: select the
Color page on one operator, then click through other operators of that type,
and each one opens already on Color. The rationale is that scanning the same
facet across several objects is a real and frequent task.

This is directly the question Jon asked, so it is worth stating what we do
today, which I checked rather than guessed:

**We have no semantic at all.** Every disclosure is component-local
`useState` in `ShowClipEntityDetail`, with heuristic initializers that only
run on mount: Placement always opens, Pattern controls opens if the Clip has
authored control targets, Advanced opens if the Clip has any non-default
advanced value. The transient panel is keyed `'transient'`
(`ShowEditor.tsx:2185`), not by Clip, so selecting a second Clip does **not**
remount it. The consequences:

- Clicking Clip to Clip, you inherit whatever you left open on the previous
  Clip, and **the heuristics silently stop firing** after the first one. The
  "open the interesting sections" intent works exactly once per panel session.
- The Effects accordion holds an effect *id*, so moving to another Clip
  collapses everything with no visible cause.
- Closing the panel and reopening re-runs the heuristics, so the same Clip
  presents differently depending on how you arrived at it.
- Nothing persists per Clip, per Show, or per session.

So today's behavior is accidentally the "whatever you last left it in" option,
minus the consistency that would make that a feature. Peer evidence says
sticky-across-selection is the *right* answer, but it has to be deliberate and
it has to survive a close/reopen, and it needs the contextual fallback from A
(land on the first applicable tab when the sticky one is empty for this Clip,
without overwriting the preference).

## Two mechanisms about rows, not sections

These matter more than the section question for the specific ugliness Jon
called out in Effects.

### F. The per-parameter gutter

Resolve puts three controls in a fixed gutter on **every** parameter row:
bypass, a keyframe rhombus, and reset-this-property. After Effects has the
same idea as the stopwatch. CapCut, praised specifically for approachable
keyframing, works the same way: find the property in the Basic or Transform
tab, set a keyframe on it there.

The consequence is structural, and it is the most valuable finding in this
pass. **In every one of these tools, "animate this" is an affordance on the
parameter itself. None of them has a separate animation section that asks you
to pick a property from a dropdown.** Ours does, which is a plausible reason
Jon has not yet seen Property animation working well enough to understand it:
the feature is discoverable only from a panel that is separate from every
control it can animate, and it currently spends two permanent lines of prose
explaining that limitation.

Transfer verdict: **strong, and it changes the tab list.** If the animate
affordance moves onto the parameter row, Property animation stops needing to
be a peer tab and becomes at most a compact list of existing tracks. That is
one fewer tab and a genuinely better feature, and it fits how Property
animation already works in the model (the destination entity owns the value,
the incoming boundary owns the timing).

Caveat worth flagging before we design on it: our parameter rows are already
narrow, and a three-icon gutter is not free at 340px. Resolve's inspector is
roughly twice our width.

### G. Drag the title bar to reorder, collapse to one row

Ableton reorders devices by dragging the device title bar, not by buttons. The
four icon buttons currently on every Effect row (up, down, duplicate, delete)
cost about 96px of a 340px row, which is why "Threshold" renders as
"Thres...". Jon's instinct to replace up/down with a hover-revealed drag
handle matches the peer consensus and buys back roughly half that.

Two related observations from the same comparison, both worth carrying into
design:

- The `single-source / parameter` text on each Effect row is the compiler's
  cost class. It is honest, but it is the third place cost appears in one
  dialog, after `Cost: 1 Pattern render` in the Effects header and the
  Advanced compiled cost tray, and it is winning a space fight against the
  Effect's own name. No peer puts cost class on every row; Resolve and Ableton
  put it nowhere, TouchDesigner puts it in a separate cook-time view. Ours
  already appears in the Add Effect palette footer, which is where a choice is
  actually being made.
- **Mirror exists in two places** and is the clearest "incongruous" item in
  the current dialog: a checkbox in Advanced clip controls
  (`ShowClipEntityDetail.tsx:504`) and a pseudo-Effect row in the Effects
  Transform stage (`ShowEffectsAuthoring.tsx:238`), both bound to the same
  `view.mirror` boolean. No peer would ship that.

## Spatial editing: the pad question

Every video peer edits transform **on the canvas**, with the inspector holding
the numbers. Final Cut, Resolve, Filmora, CapCut, and iMovie all give you
on-screen handles in the viewer; none opens a separate spatial editing window
beside the inspector. Ours is the outlier, and the reason is our own
architecture: the Stage is deliberately a read-only preview pane
(`CONTEXT.md`, "Stage").

That leaves three honest options, which I am recording rather than choosing:

1. **Shrink the pad and inline it.** The pad is a fixed 384px constant; the
   toolbar, zoom row, anchor grid, and helper prose are what actually make the
   popover 500px wide. At a 20% wider panel there is roughly 388px of inner
   width, so a responsive pad plus a compressed toolbar fits. This kills the
   second floating layer, which is exactly what Jon asked for, and it is the
   lowest-risk option.
2. **Direct manipulation on the Stage.** What every peer does, best result,
   but it contradicts a documented invariant and is a much larger slice.
3. **Keep the big pad as an opt-in "expand" from the inline pad.** Precision
   work keeps the surface it has today without it being the only way in.

TouchDesigner is the useful precedent for option 1: its Parameter COMP has an
explicit **Compress** parameter plus controls for hiding labels and separator
lines, so the same parameter set can render into a small panel. Sizing is
treated as a property of the display, not baked into the widget.

## What I would take, ranked

1. **Per-parameter animate affordance** (F). Biggest feature win, and it
   removes a tab before we design the tab strip.
2. **Tabs over a persistent identity/time header** (A), contextual, five or
   fewer, word labels.
3. **The iMovie budget rule** (C): a tab body that does not fit without
   scrolling in the common case is a design bug. This is what forces the
   Effects row work to actually happen.
4. **Drag handle plus a stripped row** (G): drop up/down, drop the cost class,
   let the Effect name have the space.
5. **Deliberate sticky tab across selection** (E), with a contextual fallback
   when the sticky tab is empty for the newly selected Clip.
6. **Inline, compressible placement pad** (option 1 above), big pad demoted to
   an opt-in expansion.

## What I would leave

- **Icon-only tabs** (iMovie). Our facets have no learned glyphs.
- **A search box** (Unreal). Correct mitigation, wrong scale, hold in reserve.
- **Solo Mode** (Lightroom) as the primary plan. It is the fallback if tabs
  are rejected, not a co-proposal.
- **After Effects' Effect Controls** as a model. It is the closest structural
  match to what we have today, deep nested twirls in a narrow column, and its
  reputation for scroll pain is the argument against staying put.

## Open questions for the design round

1. Does Property animation become a per-parameter affordance, a reduced
   "existing tracks" list, or both? This decides whether we have four tabs or
   five.
2. Do Speed and Bright stay in the persistent header with Start and Duration,
   or move into a tab? They are high-frequency, which argues for persistent,
   but four persistent fields plus identity plus the summary is already about
   135px of chrome before any tab content.
3. Does the header summary survive? It restates the Clip's timeline row
   verbatim, and in the screenshots both are visible at once, a few pixels
   apart.
4. How wide, exactly? 20% takes 340px to 408px. Five word-labelled tabs at
   408px is about 80px each, which is comfortable. Six is not.
5. Is Mirror's home the Effects stack (where its order matters) with the
   Advanced checkbox deleted?
