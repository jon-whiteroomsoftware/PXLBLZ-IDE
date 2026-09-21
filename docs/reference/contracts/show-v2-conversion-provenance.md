# v2 conversion provenance

Canonical authority is [the Scene-retirement specification](../../plans/scene-retirement-specification.md)
§§5, 8 and 10, and the [editor tracer plan](../../plans/show-editor-v2-tracer-plan.md).

v1 and v2 describe the same choreography with different objects. In three cases
the v2 object is strictly less specific than the v1 object the editor drew, so
the original editor cannot reproduce its own surface from the converted record
alone. Jon approved three narrow, explicit provenance fields for #1065 so the
existing editor stays unchanged for a converted Show. Each one is written by
`convertShowRecordV1ToV2` and nothing else, and each is inert: it carries no
timing, ownership, compilation or playback meaning.

| Field | Owner | Records |
| --- | --- | --- |
| `ShowMarkerV2.origin` | `composition.markers` | A chapter Marker this conversion created from a former Scene label. See [Markers](show-v2-markers.md). |
| `ShowTransitionV2.origin` | `composition.transitions` | Which of v1's two Transition families this Transition came from. |
| `ShowLayoutOccurrenceV2.incomingSwitch` | `composition.layoutOccurrences` | The identity and authored settings of a v1 zero-duration routing switch. See [Layout edits](show-v2-layout-edits.md). |

## Transition family

`origin` is `converted-boundary-transition` for a leaf of v1's `show.transitions`
and `converted-layer-transition` for a leaf of `show.composition.transitions`.

The distinction is not recoverable from structure. v1 routes the two families to
two different surfaces - a boundary Transition becomes a `transition` selection
and draws the boundary inspector, while a Layer junction opens the Layer
Transition popover - but a converted boundary Transition reaches ordinary Layer
participant scope whenever it does not need whole-output ownership, which is
exactly what the fresh two-Clip Show does. Scope, kind, identity and window are
therefore all insufficient, and none of them is ever used to guess the family.

## Zero-duration routing switch

Section 8 keeps the execution invariant that a zero-duration switch owns no
timed transfer object, so a v1 zero-duration routing Transition does not become
a `durationMs: 0` transfer. It becomes the separate record `incomingSwitch`:

```
{ origin: 'converted-routing-cut', id, fromOccurrenceId, direction?, easing? }
```

`id` is the authored v1 routing Transition identity. `direction` and `easing`
are present only when v1 authored them - an absent `routingDirection` stays
absent and is never defaulted to `forward`, because the editor's routing panel
reports whether the direction was authored. `incomingSwitch` and
`incomingTransfer` are mutually exclusive, and the two share one routing
identity space so the timeline can select either by the same identity.

## Inertness

Lowering strips `ShowTransitionV2.origin` in `stripV2TransitionFields` before
any Transition reaches a lowered v1 record, and derives a routing switch from
the Layout change itself without reading `incomingSwitch`. Preparation, the
compiled program and the `.epe` header are unchanged. The Installation oracle
case compiles to a byte-identical program on both record versions, and every
oracle case compiles identically with and without the metadata.

## Persistence and fail-closed decoding

All three fields live in the v2 record schema, so one definition serves the
client decoder, `.pxlshow` import and Worker admission. `origin` values are
enumerated and every v2 object keeps `additionalProperties: false`, so an
unknown origin value, an unknown switch field, a timed `durationMs` on a switch,
or a switch beside a transfer is refused rather than silently stripped. Domain
validation additionally requires a switch to name the immediately preceding
occurrence, to carry a nonblank identity, and not to shadow another routing
identity.

## Commands cannot author provenance

`ShowAuthoredMarkerV2` omits `origin` from every Marker intent.
`editShowTransitionV2` refuses an `insert` whose Transition carries `origin`,
and includes `origin` in the ownership comparison a `update-transition` settings
edit must leave untouched, so a settings edit can neither change nor clear it
while an ordinary edit preserves it. `editShowLayoutIntervalsV2` accepts no
switch intent and discards stale switch provenance rather than refusing or
rebinding; [Layout edits](show-v2-layout-edits.md) records the exact rules.

`planShowV2TransitionEdit` carries `origin` through a settings plan unchanged. A
kind, policy, easing or parameter change alters none of identity, timing,
endpoints or the v1 collection the Transition converted from, and the owner
compares `origin` as ownership, so a plan that rebuilt the Transition without it
would refuse rather than edit. A kind-changed converted Transition keeps exactly
the origin it had.

The agent harness's bounded generic backstop is barred as well. All three paths
are in `COVERAGE_ALLOWLIST`, so the grammar coverage report counts them as
converter-only rather than editable grammar, and in `PROTECTED_POINTERS`, so
`set_field` and `apply_patch` refuse a pointer that names or descends into one.
Because a pointer guard cannot see an ancestor write, the generics additionally
compare provenance by element identity before and after the patch: an element
that gains, changes or clears provenance refuses. An element removed by a
generic edit takes its own provenance with it, and an ordinary generic edit on a
record that already carries provenance preserves it.

`createShowGroupFromSelectionV2` drops it. Localization mints a fresh
definition-local Transition under `ShowGroupDefinitionV2.transitions`, which is
the v1-shaped `ShowLayerTransition` the schema closes and is not one of the
three provenance owners above. Copying the value would describe a v1 leaf that
this new object is not, and the materialized projection would then carry
conversion provenance on a synthesized identity. The localized Transition and
its projection therefore carry none, and behave structurally like any Transition
without provenance. The selected top-level Transition leaves the record with its
own provenance in the same edit.

## Records without provenance

A v2 record that carries no provenance is never classified retroactively. Its
behavior is defined structurally, and that is a statement about behavior, not a
claim about how the record was produced:

- A Transition with no `origin` follows its own scope: whole-output scope is a
  boundary, participant scope is a Layer junction.

## No new provenance for #1068

#1068 admits two previously refused shapes without adding a provenance field,
and that omission is deliberate under this contract: each field above exists so
the existing editor can reproduce a surface it already draws.

- An empty whole-output contributor side is structure, not provenance.
  Validation exact-matches each side against the Clips abutting its window
  edge, so the empty array proves nothing abuts rather than asserting an
  uncheckable origin. The Transition keeps its `converted-boundary-transition`
  family origin; no second origin value is minted.
- A superseded Scene-local overlay name retires with the per-scene structure.
  The name carried by retained content survives: a placement that becomes a v2
  Clip, or a Group-occurrence child bound to the Scene-local layer (which
  materializes as a v2 Clip drawn under that lane header). Where several names
  survive, the first Scene's name wins in Scene order, and superseded names —
  content-free or tiebreak losers — retire exactly as before. Two Layers in a
  Zone may share the resolved name, as they may in v1 (which has no
  uniqueLayerName) and in v2 (whose layer identity is keyed by id, not name),
  so a resolved name is never refused for colliding with another Layer's
  displayed name. A name mismatch with no surviving content stays unaccounted
  and refuses rather than retiring.
- An occurrence with no `incomingSwitch` behaves exactly as before: a Layout
  change with no selectable switch identity.
- A Marker with no `origin` stays plainly authored and visible.

Reconversion from an available v1 source supplies the distinction reliably. No
naming, identity or timing heuristic may substitute for it.
