# Show data model (authoring reference)

This document names every concept an agent must use to author a valid
version-2 Show record against
[`schemas/show-record-v2.provisional.schema.json`](../../../schemas/show-record-v2.provisional.schema.json).
The schema is the structural authority; this document supplies the semantics
the schema cannot express. Vocabulary is canonical PXLBLZ language.

A **Show** is saved choreography that compiles into one ordinary,
self-contained Pixelblaze Pattern. The record has exactly one representation:
a **composition** in global Show time. There are no Scenes, no Cells, and no
flat projection — a Clip owns its own start and duration on a Layer, and the
Show ends at `composition.showEndMs`.

For the *command* vocabulary that edits an open Show — identity addressing,
the appearance apply selector, Effect and Aperture parameter names, the
animation target union, the uniform no-op and the affected-entity result —
read `pxlblz://docs/clip-layer-authoring/v2` and its schema at
`pxlblz://schemas/clip-layer-authoring/v2`. This document is about the record
those commands read and write.

## Top-level record

| Field | Meaning |
| --- | --- |
| `version` | Always `2`. The discriminator readers switch on. |
| `id`, `name` | Stable identity and display name. |
| `zones` | Named semantic subsets of the output. |
| `zoneLayouts` | Zone Layouts: how Zones own pixels (physical ranges or normalized operators). |
| `outputContract` | The versioned output promise (immutable kind). |
| `composition` | The one representation: everything that happens in Show time. |
| `stageMapId` | Optional Stage map the preview and Layout operators are evaluated against. |
| `targetControllerProfileId` | Optional Controller profile the artifact is budgeted against. |
| `outputEffects` | Optional ordered full-Show output Effects. |
| `importMetadata` | Import provenance; recorded once, never edited. |
| `updatedAt` | Timestamp (number). |

## Output contract

Chosen before anything else; its `kind` is immutable and decides which
routing form is legal. Compiled Show output supports at most **2,000
pixels**.

- **`portable-2d`** — resolution-independent choreography for compatible 2D
  mapped surfaces. Requires `version`, `kind`, `referenceMapId` (e.g.
  `"plane"`), `referencePixelCount`, and a `compatibility` object. Zones own
  pixels through **normalized Stage-space routing operators**, never physical
  ranges. Member Patterns must expose `render2D`, or `render` (1D) which is
  admitted through explicit adaptation; 3D-only members block artifact
  output.
- **`installation`** — one fixed pixel count and output map for a known
  physical build. Requires `version`, `kind`, `pixelCount`, `outputMapId`,
  `resolution`. Zone Layouts assign inclusive physical index ranges, and
  every output index must be assigned **exactly once** (missing, overlapping,
  and out-of-range indices are distinct validation failures).

## Zones and Zone Layouts

A **Zone** (`zones[]`) is a named semantic subset of the Show's output:
`id`, `name`, `nominalPixelCount`. Patterns stay Zone-ignorant — routing and
clipping happen in the Show layer.

A **Zone Layout** (`zoneLayouts[]`) partitions the complete output among
Zones: `id`, `name`, `zones` (per-Zone `ranges` of inclusive pixel index
pairs, Installation form), and/or `logical` (Portable form). A Portable
layout's `logical` object names a **Stage-space routing operator** over
`zoneIds`: `single` (Full Stage, exactly one Zone), `grid`
(columns × rows), `stripes`, `checker`, `rings`, `pinwheel`, `wave`,
`split`, or `soft-split`. Hard operators give every Stage position exactly
one Zone; Soft Split blends exactly two Zones inside its feather. For a
portable-2d Show every layout must be logical: physical ranges there are a
validation failure.

`Full Stage` — a `single` layout over one Zone — is the ordinary layout when
one Pattern should cover the whole output.

The `zones` array is schema-required on every layout: Installation layouts
fill it with per-Zone ranges; a Portable layout sets `"zones": []` and puts
everything in `logical`.

## Composition

`composition` is the whole Show in global milliseconds. Required fields:
`version` (always `2`), `executionModel`, `showEndMs`, `sampleRemap`,
`patternInstances`, `layers`, `clips`, `transitions`, `layoutOccurrences`,
`propertyTracks`, `markers`, `groupDefinitions`, `groupOccurrences`. Every
array is required and may be empty; an empty Show is a valid, editable,
saveable record whose preview and export are unavailable.

- `executionModel` is `continuous` or `deterministic-loop`. Clip entry policy
  is a separate, per-Clip concern.
- `showEndMs` is **Show End**: the authored end of the timeline. Content may
  not extend past it.
- `sampleRemap.repeatScale` scales repeated Zone sampling.

## Layers

A **Layer** (`composition.layers[]`) is a named stacking lane inside one
Zone: `id`, `zoneId`, `name`, `rank`. Higher `rank` composites above lower.
Clips on the same Layer may not overlap in time; Clips on different Layers
of the same Zone may. A Layer may be empty.

## Pattern instances

A **Pattern instance** (`composition.patternInstances[]`) is one Pattern
runtime: `id`, `pattern` (the Pattern reference), `patternName`, `time`
(`timeScale`, `timeOffsetMs`), optional `controls` and `evaluation`.

A **Pattern reference** is `{"kind":"stock","id":"<catalogue id>"}` for the
built-in catalogue (see `list_stock_patterns`), or
`{"kind":"user","id":"..."}` for a personal Pattern, which this local
toolchain resolves only from inline sources supplied at call time.

Several Clips may name the same `instanceId`: that is one runtime shared
between them, advancing once per frame, with one set of control values.
`make_clip_pattern_independent` splits one Clip off onto its own instance;
`rejoin_clip_pattern_instance` puts it back.

## Clips

A **Clip** (`composition.clips[]`) places one Pattern instance on one Layer
of one Zone for one interval of global time. Required fields:

- `id`; `instanceId` (the Pattern instance it renders); `zoneId` and
  `layerId`; `startMs` (global, ≥ 0) and `durationMs` (> 0).
- `entryPolicy`: `continue` (the shared runtime keeps running) or `restart`
  (the runtime's clock and Pattern-owned state reset at this contribution).
- `zoneSampleMode`: `independent` or `span` — routed-coordinate
  behavior, not source provenance.
- `appearance`: a **key timeline**, `{"keys":[…]}`, each key `{id, timeMs,
  value}` with `value` carrying `opacity`, `view` (`mirror`, `phase`,
  `brightness`), and `effects` (the Clip's ordered Effect stack), plus
  optional `transform`, `aperture`, `presentation` and `blink`. A key holds
  until the next key. A Clip always has at least one key, at its start.

Blank time on a Layer is intentional and legal.

## Transitions

A **Transition** (`composition.transitions[]`) is a first-class entity with
its own identity, kind, duration, easing and **participants**: `id`, `kind`,
`durationMs`, `easing`, `participants`, `propertyRamps`, plus the kind's own
parameters. It is not attached to a Scene boundary — each participant
(`{id, zoneId, layerId, fromClipId, toClipId}`) names exactly which outgoing
Clip hands over to which incoming Clip on which Layer, so one Transition can
cover several Layers or Zones at once (`wholeOutput` marks that intent).

A positive duration fills the interval from the outgoing Clip's end to the
incoming Clip's nominal start, so inserting one either shortens the outgoing
Clip or ripples the incoming Clip later — it does not overlap them.

`kind` is exactly one of `cut`, `crossfade`, `fade-color`, `wipe`, `dither`,
`portal`, or `motion`; the richer families (dissolves, shape reveals, slides,
zoom/spin) are variants of `wipe`/`dither`/`motion` selected through the
optional parameters (`wipeVariant`, `dissolveVariant`, `shape`,
`motionVariant`, direction, feather, seed, …). A `crossfade` may set
`crossfadePolicy`: `snapshot-live` (default: the outgoing side fades as a
captured frame while the incoming Pattern runs live — cheaper) or
`live-live` (both Patterns run through the fade). `easing` uses the
structured form keyed by `curve`: `{"curve":"linear"}`,
`{"curve":"quadratic"|"cubic"|"sine","direction":...}`,
`{"curve":"cubic-bezier","x1":...,"y1":...,"x2":...,"y2":...}`,
`{"curve":"steps",...}`, `{"curve":"hold","at":...}`, or
`{"curve":"back",...}`.

A **Cut** between exactly adjacent Clips is *derived*, not stored: two Clips
whose times touch read as a Cut junction with no Transition entity. Removing
a Transition leaves that derived Cut behind.

## Layout occurrences

A **Layout occurrence** (`composition.layoutOccurrences[]`) is one interval
during which one Zone Layout is in force: `id`, `layoutId`, `startMs`,
`durationMs`, `parameters`, and an optional `incomingTransfer` describing how
the switch into it is animated. Occurrences tile the Show from 0 to Show End
without gaps; `move_layout_switch` moves the boundary between two of them.

## Property tracks

A **Property track** (`composition.propertyTracks[]`) animates one target
over one active window: `id`, `target`, `activeStartMs`, `activeDurationMs`,
`keyframes`. The target union names what is animated — a Clip's view
brightness or opacity, a Pattern-instance control, an Effect parameter, an
Aperture parameter, a Layout parameter — and the authoring reference lists
the exact shapes. Each keyframe carries `timeMs`, `value`, `easing`, and an
optional `curveSegment` for curve-preserving edits.

A track's active window is section-scoped: an authored activation cannot be
split across a section boundary a participant Transition introduces, and the
compiler refuses that combination rather than silently truncating it.

## Markers

A **Marker** (`composition.markers[]`) is a labelled point in global time:
`id`, `timeMs`, optional `name`, `color` and `role`. A Marker carries no
playback behavior; chapter projections read them.

## Groups

A **Group definition** (`composition.groupDefinitions[]`) is reusable
choreography — its own `patternInstances`, `layers`, `clips`, `transitions`
and `propertyTracks` in definition-local time. A **Group occurrence**
(`composition.groupOccurrences[]`) places one definition at a global
`startMs` in one Zone, binding its Layers (`layerBindings`) and optionally
its instances, with `holds` that stretch definition-local time.

The command catalogue authors *occurrences*: move, duplicate, Make Unique
(clone the definition for this occurrence alone) and Ungroup (materialize the
occurrence's content into the composition). Editing a definition's internals
directly is not in the specific vocabulary — materialize an occurrence, or
use the generic backstop.

## Budgets and resource limits

Compilation is the authority; these are the ceilings agents design against:

- **Output pixels:** at most 2,000 (contract counts and Portable targets).
- **Artifact bytes:** the compile summary reports `artifactBytes` against
  `measuredDeviceBudgetBytes` as `artifactBudgetRatio`; keep Shows well
  under 1.0. Every additional distinct Pattern source, Zone, and non-Cut
  Transition costs bytes; sequential reprises of the same Pattern instance
  are cheap (~1 KB), simultaneous Zones are not.
- **VM resources:** persistent globals and VM words are hard device limits;
  exceeding them surfaces as `resources.blockers` in the compile summary and
  blocks artifact output.

## Validation and evaluation tiers

- `validate_show` — structure (this schema), then domain, then Pattern
  reference resolution and authoring dependencies, then compiler
  eligibility. The same checks in the same order the product route runs. No
  code emission.
- `compile_show` — the real compiler; returns generated source plus the full
  summary (bytes, budget ratio, warnings, blockers).
- Telemetry and the photosensitive flicker gate run downstream of compile;
  the flicker verdict is terminal, never advisory.

## Minimal valid portable Show (checklist)

1. `version: 2` and `outputContract`: `portable-2d`, `referenceMapId:
   "plane"`, a reference count ≤ 2,000, and a `compatibility` object.
2. One Zone; one `zoneLayouts` entry whose `logical` is
   `{"kind":"single","zoneIds":["<that zone id>"]}`.
3. `composition` with `version: 2`, an `executionModel`, a positive
   `showEndMs`, `sampleRemap`, and every collection present (empty is fine).
4. One Layer in that Zone, one Pattern instance on a stock Pattern with
   `render2D` capability (check `dimensions` in `list_stock_patterns`), and
   one Clip naming both, with `startMs`/`durationMs` inside Show End and one
   appearance key at its start.
5. One Layout occurrence covering 0 → `showEndMs`.
6. `updatedAt`: any number (e.g. `0`).
