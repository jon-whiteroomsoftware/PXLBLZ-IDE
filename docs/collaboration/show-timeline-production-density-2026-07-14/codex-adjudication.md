# Unaffiliated Adjudication: Codex Show Timeline production density

## Final choice

Choose a coherent synthesis built on the Codex revision's compact frame,
anchored Entity Detail Panel, explicit Scene X-ray, and boundary ownership,
with Fable's owner-nested Scene-local hierarchy, value-bearing automation
curves, and dense internal Scene legibility. The human review supplies the
missing navigation decision: ordinary Timeline zoom remains continuous and
geometry-only, while richer Scene inspection opens explicitly rather than at a
zoom threshold.

This result is not an even compromise. It rejects the permanent property dock,
automatic Focus Bridge, global density modes, and multi-selection scope. It
chooses the smallest system that supports the first complete Show editor while
leaving additive seams for Scene-local authoring and later editing-efficiency
work.

## Claim-by-claim evaluation

The stable three-pane shell survives because both revisions and hands-on review
showed that spatial memory matters. The library may collapse through a shared
application-shell behavior, but the Stage remains physically stable and
specializes its content rather than moving.

The Codex Entity Detail Panel is superior to Fable's bottom dock. It keeps
properties near their selected owner, consumes no permanent Timeline height,
and transfers predictably between selections. One panel opens at a time and may
flip or temporarily cross pane boundaries. A visible stem or aligned edge is
required. Editable values, read-only facts, and structural commands must look
different.

Fable's Scene-local nesting is superior to the flat first-round Codex lanes.
Effects, overlays, and property automation are children of the placement or
zone that owns them. Only explicit disclosure spends vertical space. Compact
sparklines retain timing, shape, extrema, and approximate values; selection
moves exact time, value, and easing into the Entity Detail Panel.

The Codex dedicated Transition track and authority model are correct. Global
boundaries own Transitions. Scene-local scope shows incoming and outgoing spans
as read-only temporal context while Scene content remains active beneath them.
Editing routes back to the global boundary rather than creating two owners.

The semantic-zoom experiment resolves the medium-detail question. Stable
anchored zoom is valuable, but zoom must not silently change editing scope or
row height. A 32-to-40-pixel read-only X-ray retains cuts, Effect activity,
automation shape, and snap beats as the Scene widens. A separate inspect action
opens one dense read-only Scene lens with a local ruler and `Open Scene` command.

The original broad interaction scope is too large for the first implementation.
Single selection, Split, Clone, Snap, zoom, scrubbing, and one-owner detail are
sufficient. Drag selection, heterogeneous multi-select, grouped movement, and
general copy/paste remain a later efficiency iteration. Clone is retained as a
bounded convenience: duplicate the selected entity immediately after itself
and ripple later content forward.

The compact visual-toolkit palette is preferred over both a long select and a
large gallery. Family navigation, search, compatibility filtering, names, and
small motion mnemonics support discovery. Hover or keyboard focus reveals a
description and animation. Choosing a treatment applies a starting preset to a
temporary Stage preview; exact parameters remain in the Entity Detail Panel.

## Chosen design

The final global Show frame keeps the shared library at left, Timeline in the
center, and Stage at right. Library collapse is an application-shell capability
with a visible restoration control and no automatic Show-specific hiding. The
Stage renders output normally and offers an explicit zone/routing visualization
when invoked from Zone context.

The Timeline header has three spatial regions. Transport and time align left;
continuous zoom and its numerical multiplier remain centered; editing and
viewport commands align right. The canonical order is:

```text
[Play/Pause] [Go to start] [current / total]
                  [- slider +] [5.1x]
                            [Fit] [Split] [Clone] [Snap]
```

Play/Pause is visually primary. Fit is a command, not part of the numerical
readout. The time display remains a one-line pair until the center pane is
genuinely narrow. Its designed compact form stacks equal-precision tabular
values, with current time bright and total duration subdued. Responsive
pressure first shortens the slider, then reduces command labels, and only then
stacks time.

The global Timeline begins with ruler, Scene band, read-only Scene X-ray when
opened, Transition track, and compact Zone rows. Zone label selection is
separate from lane disclosure. Clicking a Zone opens its panel; clicking its
chevron opens owned activity, Effect, or automation lanes. Color denotes
semantic family across Timeline, panel, palette, and Stage rather than assigning
decorative identities to Zone rows.

One selected Scene may expose a stable-height X-ray aligned to global time. It
contains three terse strata: placement rhythm, Effect activity, and automation
or authored beats. Zoom spreads those same signals and snap references; it does
not add rows or enter local scope. An explicit magnify action opens one modeless
read-only Scene inspector. The inspector keeps global bounds visible, shows a
local ruler and dense named internal content, and offers `Open Scene`. Escape,
click-away, or selecting another owner dismisses or transfers it.

Scene-local scope reuses the frame, transport, Stage, row grammar, semantic
colors, Entity Detail Panel, and selection behavior. It changes the time domain
and adds clear local/global context. The top of its Timeline shows read-only
incoming and outgoing Transition spans. Zone placement rows disclose owned
Effects, overlays, and compact automation summaries. Only an explicitly focused
property expands into a taller curve-editing lane.

The effects and Transitions palette is a compact expert chooser. Repeated family
headings and a second candidate viewport are absent. Small named cells or rows
carry a motion mnemonic; hover and focus expose description and animation.
Selecting a family variant or preset previews it on the existing Stage without
saving. Apply commits; Escape restores the saved treatment and returns focus to
its Timeline owner.

## Lineage and changes

The stable shell, compact primary and subordinate rows, anchored Entity Detail
Panel, dedicated Transition track, explicit Scene X-ray, semantic color, and
read-only boundary authority descend from the Codex revision. The owner-nested
Scene-local hierarchy, Effect activity spans, overlays, and value-bearing
automation summaries descend from Fable and were strengthened through human
review.

The final explicit Scene inspector comes from adapting Fable's high-information
local presentation through the Codex X-ray boundary. The semantic-zoom study
demonstrated that the content is valuable but automatic entry is not. The
three-region toolbar, intentional compact time state, first-release Clone, and
reduced selection scope are human decisions made after both revisions.

The compact effects palette combines the registry and compatibility model from
the existing visual-toolkit work with the user's CapCut/Photoshop density
standard. Sparklines combine Fable's value communication with the human request
for much lower visual weight and adaptive amplitude gain.

## Rejected alternatives

Reject the permanent bottom property dock because it consumes scarce height and
separates values from their owners. Reject automatically entering Focus Bridge
at high zoom because viewport scale must not become a hidden scope control.
Reject progressive X-ray height thresholds because the additional labels do not
earn a sixty-percent height increase.

Reject a large effects gallery with a dedicated candidate viewport. It is useful
for first-run discovery but costly in every repeated edit, and it previews only
defaults rather than the actual parameterized result. Reject hover-only Zone
preview and hover-only Scene inspection because both create accidental state.

Reject first-release marquee selection, multi-selection, grouped movement, and
general copy/paste. The model should not block their later addition, but their
selection compatibility, displacement, and transaction semantics deserve a
separate iteration rather than incomplete controls in this one.

Reject persistent Select and Space-drag toolbar items. Selection is the default
pointer behavior. Space-drag is an expert gesture with transient hand-cursor
feedback and belongs in shortcut help, not permanent chrome.

## Unresolved human gates

The remaining gates are implementation-scale questions rather than competing
designs. A moving prototype must establish the Scene inspector's exact width,
collision behavior, and whether it anchors to the X-ray or centers over the
Timeline when the owner is very narrow. The same pass must establish the
container widths at which command labels compact and the time readout stacks.

Clone's ripple operation must be validated against Show duration and ownership
invariants. If a particular entity cannot be inserted after itself, the command
must explain why rather than silently changing placement rules.

Scene-local's optional miniature Show navigator remains conditional. It should
ship only if a realistic navigation prototype proves that it earns persistent
height beyond the scope bar, keyboard navigation, and explicit Back to Show
control.

## Confidence and disconfirming evidence

Confidence is high in the frame, density, ownership hierarchy, stable X-ray,
explicit inspector, toolbar regions, compact palette, and initial interaction
scope. These decisions survived independent proposals, adversarial revision,
realistic dense fixtures, responsive inspection, and direct human use.

The design should be reconsidered if implementation testing shows that an
anchored Scene inspector routinely occludes the exact global material needed
for alignment, or if a stable-height X-ray cannot expose useful snap references
at realistic Scene densities. It should also be reconsidered if compact palette
preview cannot update the existing Stage with low enough latency to support
rapid trial and reversal.
