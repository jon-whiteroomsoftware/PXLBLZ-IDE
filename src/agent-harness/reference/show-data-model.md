# Show data model (authoring reference)

This document names every concept an agent must use to author a valid
ShowRecord JSON document against
[`schemas/show-record.schema.json`](../../schemas/show-record.schema.json).
The schema is the structural authority; this document supplies the semantics
the schema cannot express. Vocabulary is canonical PXLBLZ language.

A **Show** is saved choreography that compiles into one ordinary,
self-contained Pixelblaze Pattern. The ShowRecord an agent authors is the
**compiler substrate**: Scenes, Zones, Cells, Zone Layouts (persisted as
`routingLayouts`), boundary Transitions, and an output contract. A separate
optional `composition` object carries editor-level entities (Layers, Groups,
Markers, Property animation); a Show authored without `composition` is fully
valid — the substrate alone compiles.

## Top-level ShowRecord

| Field | Meaning |
| --- | --- |
| `id`, `name` | Stable identity and display name. |
| `scenes` | Ordered compiler intervals; each owns its `durationMs`. |
| `zones` | Named semantic subsets of the output. |
| `cells` | One Pattern placement per (Scene × Zone) that should render. |
| `routingLayouts` | Zone Layouts: how zones own pixels (physical ranges or normalized operators). |
| `transitions` | Boundary events between adjacent Scenes. |
| `outputContract` | The versioned output promise (immutable kind). |
| `composition` | Optional editor-level representation; omit when authoring the substrate directly. |
| `outputEffects` | Optional ordered full-Show output Effects. |
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
`id`, `name`, `nominalPixelCount`. Patterns stay zone-ignorant — routing and
clipping happen in the Show layer.

A **Zone Layout** (`routingLayouts[]`) partitions the complete output among
zones: `id`, `name`, `zones` (per-zone `ranges` of inclusive pixel index
pairs, Installation form), and/or `logical` (Portable form). A Portable
layout's `logical` object names a **Stage-space routing operator** over
`zoneIds`: `single` (Full Stage, exactly one zone), `grid`
(columns × rows), `stripes`, `checker`, `rings`, `pinwheel`, `wave`,
`split`, or `soft-split`. Hard operators give every Stage position exactly
one zone; Soft Split blends exactly two zones inside its feather. For a
portable-2d Show every layout must be logical: physical ranges there are a
validation failure.

`Full Stage` — a `single` layout over one zone — is the ordinary layout when
one Pattern should cover the whole output.

The `zones` array is schema-required on every layout: Installation layouts
fill it with per-zone ranges; a Portable layout sets `"zones": []` and puts
everything in `logical`.

## Scenes

A **Scene** (`scenes[]`) is a compiler interval spanning the complete Show:
`id`, `name`, `durationMs`. The Scene owns duration; total Show length is
the sum of Scene durations. Each Scene selects its Zone Layout implicitly
through the Cells placed in it and the layout referenced at its boundaries
(`transitions[].layoutId` when the layout changes). Scenes do not nest, and
a Scene is not "one zone's clip" — it spans all Zones at once.

## Cells (Clips)

A **Cell** (`cells[]`) places one Pattern on one Zone for one or more
Scenes — the substrate form of a Clip. Required fields:

- `id`; `zoneId` and `sceneId` (the *first* Scene it plays in); `sceneSpan`
  (how many consecutive Scenes it covers, ≥ 1).
- `pattern`: a **Pattern reference** — `{"kind":"stock","id":"<catalogue
  id>"}` for the built-in catalogue (see `list_stock_patterns`), or
  `{"kind":"user","id":"..."}` for a personal pattern, which this local
  toolchain resolves only from inline sources supplied at call time.
- `patternName`: display name for the reference.
- `adaptations`: how the Pattern is conformed to the Zone — required keys
  `mirror` (boolean), `phase`, `brightness`, `timeScale` (numbers; neutral
  values `false`, `0`, `1`, `1`).

Optional: `zoneSpan`/`zoneMode` (`span` stretches one Pattern domain across
adjacent zones, `repeat` repeats it per zone), `restartOnEntry`,
`evaluationPolicy` (`live`, `freeze-at-entry`, `rolling-refresh`),
`presentation`, `blink`, `controlTargets` (exported slider functions only),
`transform`, `viewport`, `effects` (the Clip's Effect stack). A (Scene ×
Zone) pair with no Cell is intentional blank time — legal.

## Transitions

A **Transition** (`transitions[]`) is a stable first-class boundary entity
*after* a named Scene: `id`, `afterSceneId`, `kind`, `durationMs`, `easing`.
A zero-duration `cut` is the neutral form and still a real entity. `kind` is
exactly one of `cut`, `crossfade`, `fade-color`, `wipe`, `dither`, `portal`,
or `motion`; the richer families (dissolves, shape reveals, slides,
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
`{"curve":"back",...}`. A Transition may also carry
`layoutId` (Zone Layout change at that boundary) and `propertyTransitions`.
The incoming boundary owns start, duration, and easing of any animated
value; the destination owns the value itself.

## Budgets and resource limits

Compilation is the authority; these are the ceilings agents design against:

- **Output pixels:** at most 2,000 (contract counts and Portable targets).
- **Artifact bytes:** the compile summary reports `artifactBytes` against
  `measuredDeviceBudgetBytes` as `artifactBudgetRatio`; keep Shows well
  under 1.0. Every additional distinct Pattern source, Zone, and non-Cut
  Transition costs bytes; sequential reprises of the same Pattern are cheap
  (~1 KB), simultaneous Zones are not.
- **VM resources:** persistent globals and VM words are hard device limits;
  exceeding them surfaces as `resources.blockers` in the compile summary and
  blocks artifact output.

## Validation and evaluation tiers

- `validate_show` — structure (this schema), pattern-reference resolution,
  Installation coverage, Portable compatibility. No code emission.
- `compile_show` — the real compiler; returns generated source plus the full
  summary (bytes, budget ratio, warnings, blockers).
- Telemetry and the photosensitive flicker gate run downstream of compile;
  the flicker verdict is terminal, never advisory.

## Minimal valid portable Show (checklist)

1. `outputContract`: `portable-2d`, `referenceMapId: "plane"`, a reference
   count ≤ 2,000, and a `compatibility` object.
2. One Zone; one `routingLayouts` entry whose `logical` is
   `{"kind":"single","zoneIds":["<that zone id>"]}`.
3. At least one Scene with a positive `durationMs`.
4. One Cell per Scene you want lit: stock pattern reference with
   `render2D` capability (check `dimensions` in `list_stock_patterns`),
   neutral `adaptations`.
5. A Transition after each Scene that has a successor (a
   `{"kind":"cut","durationMs":0,"easing":{"curve":"linear"}}` is enough);
   none after the last Scene.
6. `updatedAt`: any number (e.g. `0`).
