# Semantic zoom experiment

This throwaway UI study asks whether Timeline zoom should reveal progressively
more Scene detail or approach Scene-local editing when one Scene fills the
viewport. It does not change the product model or establish implementation
requirements.

The study keeps the Round 2 three-pane frame, fixed Stage, collapsible library,
dense synthetic fixtures, semantic color classes, and one-at-a-time Entity
Detail Panel. A real zoom control changes Timeline geometry so each proposal can
be judged at the scale where its behavior matters.

## Variants

### A - Explicit X-ray

Zoom changes horizontal geometry only. The selected Scene exposes one fixed
read-only X-ray through explicit disclosure. This is the safe control and the
current Codex recommendation.

### B - Progressive X-ray

The selected X-ray gains internal strata, labels, beats, and snap references as
the Scene occupies more of the viewport. The application remains in Global Show
scope at every zoom level.

### C - Focus bridge

At high zoom, the selected Scene interval becomes an embedded local-time
workspace with its own ruler and internal tracks. Global Scene geometry and a
clear `Open Scene` action remain visible. This deliberately tests the risk that
semantic zoom creates a hidden editing-mode transition.

## Review questions

- Does each zoom step preserve orientation?
- Does additional information arrive when it becomes legible rather than merely
  because space exists?
- Can an author identify and snap to an internal beat while retaining global
  alignment?
- Does the Focus bridge feel continuous or like an accidental second editor?
- Which behavior remains understandable in both the four-zone Atrium and
  twelve-zone Cathedral fixtures?

Record the human verdict here before Round 3 adjudication. Delete or absorb the
prototype after the final design captures the answer.

## Verdict

Use the explicit X-ray as the production baseline and preserve the study's
continuous anchored zoom. Keep its read-only cuts, Effect activity, automation
shape, and snap references at a stable 32-to-40-pixel height.

Do not adopt Progressive X-ray's height thresholds or Focus Bridge's automatic
scope transition. Instead, expose Focus Bridge's richer read-only content
through an explicit Scene-inspect action on the X-ray. The inspector is a
temporary modeless layer with one owner, a visible global/local relationship,
and an `Open Scene` route to the full Scene-local editor.

## Prototype corrections before review

The first review build could not answer the question because every zoom input
queued a smooth re-centering animation and used an approximate percentage of
the whole scroll width as its anchor. During a measured 5.1x-to-6.5x drag, the
selected Scene drifted from 101 to 212 pixels and continued moving after input
stopped. The corrected build measures the rendered Scene bounds in a pre-paint
layout update. Center drift now remains within half a pixel through the same
gesture and scroll position stops immediately.

Variant A now renders the same explicit three-stratum X-ray at every scale:
cuts, Effect activity, and authored key points. Zoom spreads those existing snap
references without changing the hierarchy. This makes the control's deliberate
limit visible instead of making high zoom appear broken.

Zone labels and disclosures are independent. The chevron expands owned lanes;
the label selects the Zone and opens its Entity Detail Panel. Selection is
identity-aware, so moving from Canopy to Columns replaces the panel rather than
closing it merely because both entities are Zones.
