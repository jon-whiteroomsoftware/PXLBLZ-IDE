# Agent Clip and Layer authoring

The versioned Clip/Layer authoring vocabulary is generated from
[`bulkAuthoring.ts`](../../src/engine/showCommands/bulkAuthoring.ts). Runtime
validation, production and diagnostic MCP schemas, built-in function schemas,
and reference material therefore share one field definition.

Connected agents can read the complete generated resources at:

- `pxlblz://schemas/clip-layer-authoring/v1` for JSON Schema 2020-12;
- `pxlblz://docs/clip-layer-authoring/v1` for semantics, defaults, clearing
  rules, ownership, result details, and executable examples.

The production server introduction names both resources. Each bulk tool also
publishes its nested input shape independently because an MCP client decides
whether server instructions or resources enter model context. These resources
describe visible authoring inputs; persisted Show records continue to use the
separate Show data model and export schemas.

## Prepared v2 vocabulary

The v2 authoring vocabulary is generated from
[`authoringReference.ts`](../../src/engine/showCommandsV2/authoringReference.ts)
over the same field fragments the v2 descriptors and runtime validation use. It
is prepared, not activated: a connected agent sees the v1 resources above until
the coordinated cutover in #1039, and the v2 pair only under the explicit
`catalogue: 'v2'` option.

- `pxlblz://schemas/clip-layer-authoring/v2` for JSON Schema 2020-12;
- `pxlblz://docs/clip-layer-authoring/v2` for identity addressing, timing,
  the appearance `apply` selector, Effect and Aperture parameter names, the
  animation target union and executable examples.

### ClipSpec and ClipPatch

`ClipSpec` places one Clip at an exact global interval: `zone_id`, `layer_id`,
`start_ms`, `duration_ms` and a structured `pattern` reference. `instance`
carries decision D3: `"sole"` (the default) reuses the one existing runtime for
that Pattern source, creates the first when none exists, and refuses with
candidate identities when several exist; `"new"` creates the first runtime and
refuses when one already exists; any other value is an explicit existing
`instance_id`. `entry_policy` is `continue` or `restart`, where `restart` resets
the whole Pattern instance at that Clip's first contribution and every Clip
sharing the runtime observes it. `zone_sample_mode` is `independent` or `span`.
`appearance` seeds the first held key, including its Effect stack, and
`instance_properties` writes Pattern-instance controls, time and evaluation.

`ClipPatch` updates one Clip by `clip_id`. Placement goes through the Clip
temporal owner, so a Transition-connected Clip translates its whole connected
component rigidly and a resized edge ripples connected successors while
Transition identity and settings stay fixed. Moving a Clip to another Zone or
Layer has no landed v2 owner intent and refuses with a typed `unsupported`
code rather than writing the field behind the owner's back.

### The appearance apply selector

Appearance is a keyed timeline, so an appearance patch says where it lands.
`{ "scope": "whole-clip" }` writes every held key; `{ "scope": "at-time",
"at_ms": N }` writes the held key covering that global time, inserting a fresh
key when the time has no key and leaving later keys with their own values. The
selected time must sit inside the Clip's nominal bar; its exclusive end and
outside-bar Transition contribution times refuse. The five Effect stack
commands take the same selector.

### Effects and Aperture shape parameters

An Effect is authored as `{ kind, parameters }` rather than a per-kind schema
variant, and the Aperture shape parameters travel in `shape_parameters` for the
same reason: the twenty-two-variant Effects union alone was 38 KB of the v1
`tools/list`. Both records are validated by the appearance owner against exactly
the ranges the manual inspector applies, and the v2 reference resource carries
the generated per-kind and per-shape parameter tables.

### Animation targets

`add_property_tracks` takes a typed target whose `kind` names one of the nine
target forms through short Clip-scoped names: `opacity`, `view-brightness`,
`view-phase`, `transform-position-x`, `transform-position-y`,
`transform-rotation`, `transform-scale-x`, `transform-scale-y`, `aperture-x`,
`aperture-y`, `aperture-width`, `aperture-height`, `effect`, `control`,
`time-scale`, `layout-split-position` and `show-repeat-scale`. Activation
defaults to the Clip span for Clip targets, the union of user spans for
Pattern-instance targets, the interval for a Layout split position and the whole
Show for repeat scale. Retained curve descriptors are engine-owned and no
command authors them.
