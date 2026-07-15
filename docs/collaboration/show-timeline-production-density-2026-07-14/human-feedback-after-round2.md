# Human feedback after Round 2

This checkpoint records requirements raised after both Round 2 model revisions
were complete and before their revised visual prototypes were built. It does not
retroactively alter either independent revision.

## Integrate the visual-toolkit selection workflow

The Timeline proposals show applied Transitions and Effect lanes but do not show
how an author chooses among the complete headless catalogue. The next visual
round must connect these surfaces:

1. select a boundary or placement;
2. invoke `Replace Transition` or `Add Effect` from the anchored Entity Detail
   Panel;
3. browse the registry as kind, family, variant, and preset rather than a long
   flat select element;
4. preview a candidate on the existing Stage without mutating the saved Show;
5. apply or cancel explicitly; and
6. return focus to the applied Transition or Effect in the same panel.

The existing registry-backed visual-toolkit prototype is design evidence, not a
final surface. Its family model, compatibility filtering, search, temporary
preview, and editable presets should survive. Its integration, typography, and
property surface must adopt the revised Timeline and Entity Detail Panel grammar.

## Legibility is part of expert density

The current application and prototypes overuse very small, very dark gray text
on black. This is difficult to read even on a large nearby monitor. The design
should remain compact, but it must not obtain density by making required text
tiny or faint.

Use these working constraints in the next visual round:

- persistent information-bearing microcopy normally uses 10-11-pixel type;
- 9-pixel type is secondary and needs clear contrast;
- 8-pixel type is limited to nonessential ornament or transient diagram labels;
- the darkest gray text tokens are decorative or disabled, not required
  information; and
- recover space through line-height, padding, abbreviation, and disclosure
  before shrinking type.

Apply this baseline to the Timeline, Scene band, lane gutter, Entity Detail
Panel, Stage labels, catalogue tiles, candidate preview, and cost/compatibility
summaries. A separate GitHub follow-up should audit the rest of the application
after GitHub CLI authentication is restored. That follow-up is now #465.

## Compress automation with sparklines

Sparklines are unusually valuable in this editor because a four-to-ten-pixel
visual can communicate approximate value, shape, and change timing. Several
property curves should therefore be able to stack much more tightly than
ordinary 22-pixel authored lanes.

Separate recognition from manipulation:

- the compact summary draws a thin curve and roughly four-pixel round authored-
  time dots whose visual weight matches their read-only role;
- clicking the property selects it and exposes exact time, value, and easing in
  the Entity Detail Panel;
- the selected property may expand to a focused lane; and
- a focused lane may use small selectable diamonds; and
- direct point dragging and larger handles belong in an explicit expanded curve
  editor rather than every summary.

Exact numeric time editing remains available even with snapping because the
desired time may not coincide with a snap target. Global Show summaries must
represent placement targets and boundary-owned ramps without implying freeform
keys. Scene-local summaries may represent actual placement-owned keyframes.

## Use one shared collapsible library

Library collapse should be an application-shell capability rather than a
Show-specific panel. The same appearance, collapse control, restoration tab,
and session behavior should remain available in other entity editors even when
Shows create the strongest need for horizontal space. Entering a Show should
not automatically hide the library.

## Replace the large catalogue with a compact palette

The Round 2 visual-toolkit catalogue is too large for a repeated expert
workflow. It is helpful during discovery but would become expensive once an
author knows the catalogue. The next design should behave more like a toolbar
or professional application palette:

- dense named rows or small cells instead of large descriptive cards;
- no repeated family label when family navigation already establishes context;
- description and motion mnemonic revealed on hover or keyboard focus;
- the existing Stage, not a second internal candidate viewport, provides the
  literal temporary preview;
- compact preset disclosure previews directional or stylistic starting states;
- a click applies the starting configuration and returns to the anchored Entity
  Detail Panel for exact tuning; and
- Escape restores the saved treatment.

The selection palette chooses a treatment and starting preset. The Entity
Detail Panel owns exact parameters. This boundary removes the internal candidate
preview without removing experimentation.

## Prefer legible shape over absolute sparkline scale

Compact sparklines should preserve timing, ordering, extrema, and waveform
shape but may apply adaptive linear amplitude gain when the visible property
range is too small to read. A sine wave between 0.80 and 0.85 should remain
recognizably sinusoidal rather than appearing flat. Exact values remain in the
Entity Detail Panel, and an amplified summary needs a quiet expanded-scale cue.

## Use the Codex structure as the Round 3 baseline

The explicit Codex Scene X-ray, separate boundary context, and direct hierarchy
are easier to understand than the Fable revision as a whole. Fable's semantic
micro-summaries remain valuable when their ownership and legend are clear:
Effect activity uses teal, automation activity uses violet, and position carries
time. The repeated violet Strobe Break pattern in the Round 2 mock is too
ambiguous and should not survive unchanged. Multi-zone placements such as
`CometLoom` must render as one linked placement spanning zones rather than two
unexplained duplicates.

Only one Scene X-ray opens at a time. Its disclosure should use the same clear
chevron grammar as owner-nested Effect and automation lanes while remaining a
read-only global-time overview.

## Prototype semantic zoom before adjudication

Semantic zoom may reduce the gap between the Scene X-ray and Scene-local
authoring, but it may also be too clever. Do not adopt it from prose alone. Test
three interactive variants against the same dense Atrium and twelve-zone
Cathedral fixtures:

1. explicit X-ray control: zoom changes geometry but not information hierarchy;
2. progressive X-ray: zoom reveals additional beats, labels, and snap references
   while retaining Global Show scope; and
3. focus bridge: once one Scene dominates the viewport, its interval approaches
   a local-time workspace while preserving a visible global breadcrumb.

The experiment must use a functional zoom control and preserve the fixed Stage,
collapsible library, semantic colors, and one-at-a-time Entity Detail Panel.
Judge orientation, crowding, snap usefulness, and accidental scope ambiguity.
The explicit X-ray remains the safe baseline until the experiment demonstrates
a better behavior.

## Keep Zone selection separate from disclosure

A Zone remains an ordinary selectable entity with its own Entity Detail Panel.
The Zone panel should expose identity, nominal pixels, current routing or map
assignment, Stage highlighting, and relevant management actions. The Zone's
owned Effect, automation, and activity lanes use a separate disclosure chevron.
Clicking the Zone label selects it; clicking the chevron expands or collapses
its lanes. Clicking one Zone after another swaps the panel owner, while clicking
the already-selected Zone closes the panel.

The semantic-zoom prototype initially anchored its selected Scene with queued
smooth scroll animations and an approximate percentage calculation. This made
slider dragging jump and left the Scene visibly off center. The corrected study
uses actual rendered bounds in a pre-paint layout update, with no animation, so
the Scene expands symmetrically under continuous zoom input.
