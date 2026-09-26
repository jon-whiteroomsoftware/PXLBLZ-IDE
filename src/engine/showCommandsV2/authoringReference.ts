// The versioned v2 authoring resources. The compact Effect and Aperture
// parameter records (catalogue rule 8) keep the tool schema small, so the
// per-kind parameter names and ranges live here, generated from the same
// catalogue the appearance owner validates against.
import { normalizeShowClipEffects } from '../showEffects'
import { showClipEffectParameters, showClipEffectPersistedField } from '../showEffectAuthoring'
import type { ShowClipEffect } from '../personalContentRecords'
import { PROPERTY_TARGET_KINDS } from './animation'
import {
  APERTURE_PATCH_FIELD,
  APERTURE_SHAPE_VALUES,
  APPEARANCE_PATCH_FIELD,
  EFFECT_KIND_VALUES,
  ENTRY_POLICY_VALUES,
  EVALUATION_POLICY_VALUES,
  INSTANCE_PROPERTIES_FIELD,
  INSTANCE_PROPERTIES_UPDATE_FIELD,
  TRANSITION_KIND_VALUES,
  ZONE_SAMPLE_MODE_VALUES,
} from './support'
import { CLIP_PATCH_FIELD, CLIP_SPEC_FIELD } from './clipSpec'
import type { ShowCommandV2Field } from './registry'

export const SHOW_AUTHORING_V2_SCHEMA_VERSION = 2
export const SHOW_AUTHORING_V2_MAX_BATCH_ITEMS = 128
export const SHOW_AUTHORING_V2_SCHEMA_URI = 'pxlblz://schemas/clip-layer-authoring/v2'
export const SHOW_AUTHORING_V2_REFERENCE_URI = 'pxlblz://docs/clip-layer-authoring/v2'

export const SHOW_AUTHORING_V2_SERVER_INTRO =
  `Show authoring uses schema version ${SHOW_AUTHORING_V2_SCHEMA_VERSION}. `
  + 'Every command addresses entities by stable identity from read_show; there are no index or time lookups. '
  + 'Times are exact global milliseconds and intervals are half-open; nothing is clamped and Show End never grows on its own. '
  + 'An already-satisfied request returns unchanged with no changes and does not abort the batch. '
  + `Each bulk array carries 1 to ${SHOW_AUTHORING_V2_MAX_BATCH_ITEMS} items and applies as one atomic candidate. `
  + `Read ${SHOW_AUTHORING_V2_REFERENCE_URI} and ${SHOW_AUTHORING_V2_SCHEMA_URI} for Effect and Aperture parameter names, the animation target union, and executable examples.`

export const SHOW_AUTHORING_V2_EXAMPLES = {
  create_clips: {
    clips: [{
      zone_id: 'zone-1', layer_id: 'layer-1', start_ms: 0, duration_ms: 4_000,
      pattern: { kind: 'stock', id: 'LineDancer2D' },
      instance: 'sole',
      appearance: { opacity: 0.8, effects: [{ kind: 'hue', parameters: { turns: 0.25 } }] },
    }],
  },
  update_clips: {
    updates: [
      { clip_id: 'clip-1', appearance: { apply: { scope: 'at-time', at_ms: 2_000 }, opacity: 0.4 } },
      { clip_id: 'clip-2', start_ms: 12_000, duration_ms: 4_000 },
      { clip_id: 'clip-4', zone_id: 'zone-2', layer_id: 'layer-3' },
      { clip_id: 'clip-3', instance_properties: { controls: { sliderSpeed: 0.4 }, time_scale: 0.5 } },
    ],
  },
  add_property_tracks: {
    tracks: [
      { target: { kind: 'opacity', clip_id: 'clip-1' }, keyframes: [{ at_ms: 0, value: 0 }, { at_ms: 4_000, value: 1, easing: 'ease-in-out' }] },
      { target: { kind: 'control', instance_id: 'instance-1', control: 'sliderSpeed' }, initial_value: 0.5 },
    ],
  },
} as const

function fieldSchema(field: ShowCommandV2Field): Record<string, unknown> {
  let schema: Record<string, unknown>
  switch (field.kind) {
    case 'string':
      schema = { type: 'string', ...(field.enum ? { enum: field.enum } : {}), ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}) }
      break
    case 'number':
      schema = { type: 'number', ...(field.minimum !== undefined ? { minimum: field.minimum } : {}), ...(field.maximum !== undefined ? { maximum: field.maximum } : {}) }
      break
    case 'integer':
      schema = { type: 'integer', ...(field.minimum !== undefined ? { minimum: field.minimum } : {}), ...(field.maximum !== undefined ? { maximum: field.maximum } : {}) }
      break
    case 'boolean':
      schema = { type: 'boolean' }
      break
    case 'easing':
      schema = { oneOf: [{ enum: ['linear', 'ease-in', 'ease-out', 'ease-in-out'] }, { type: 'object', required: ['curve'] }] }
      break
    case 'array':
      schema = { type: 'array', items: fieldSchema(field.items), minItems: field.minItems, maxItems: field.maxItems }
      break
    case 'record':
      schema = { type: 'object', additionalProperties: fieldSchema(field.values) }
      break
    case 'union':
      schema = { oneOf: field.variants.map(fieldSchema) }
      break
    case 'object':
      schema = {
        type: 'object',
        properties: Object.fromEntries(Object.entries(field.properties).map(([name, property]) => [name, fieldSchema(property)])),
        required: Object.entries(field.properties).filter(([, property]) => !property.optional).map(([name]) => name),
        additionalProperties: false,
        ...(field.atLeastOne ? { minProperties: 1 } : {}),
      }
      break
  }
  if (field.nullable) schema = { oneOf: [schema, { type: 'null' }] }
  return { ...schema, description: field.description }
}

/** Every Effect kind with its authored parameter names, ranges and defaults. */
export function showEffectParameterReferenceV2(): Array<{ kind: string; parameters: Array<{ name: string; range: string }> }> {
  return EFFECT_KIND_VALUES.map(kind => {
    const template = normalizeShowClipEffects([{ id: 'reference', kind } as ShowClipEffect])[0]
    const descriptors = showClipEffectParameters(template)
    const parameters = descriptors.map(descriptor => ({
      name: showClipEffectPersistedField(kind, descriptor.id) || descriptor.id,
      range: descriptor.kind === 'color'
        ? 'CSS color string'
        : `${descriptor.min ?? 0} to ${descriptor.max ?? 1}`,
    }))
    // A kind with no toolkit descriptors still carries its persisted fields.
    const persisted = Object.keys(template).filter(name => name !== 'id' && name !== 'kind')
    for (const name of persisted) {
      if (!parameters.some(parameter => parameter.name === name)) parameters.push({ name, range: '0 to 1' })
    }
    return { kind, parameters: parameters.sort((left, right) => left.name.localeCompare(right.name)) }
  })
}

const APERTURE_SHAPE_PARAMETER_OWNERS: Record<string, readonly string[]> = {
  ring: ['ringWidth'],
  'rounded-box': ['cornerRadius'],
  cross: ['crossWidth'],
  star: ['starPoints', 'starInner'],
  crescent: ['crescentOffset'],
  polygon: ['polygonSides'],
}

/** Generated JSON Schema for the shared v2 authoring vocabulary. */
export const SHOW_AUTHORING_V2_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: SHOW_AUTHORING_V2_SCHEMA_URI,
  title: 'PXLBLZ Show Authoring Vocabulary v2',
  version: SHOW_AUTHORING_V2_SCHEMA_VERSION,
  maxBatchItems: SHOW_AUTHORING_V2_MAX_BATCH_ITEMS,
  $defs: {
    ClipSpec: fieldSchema(CLIP_SPEC_FIELD),
    ClipPatch: fieldSchema(CLIP_PATCH_FIELD),
    AppearancePatch: fieldSchema(APPEARANCE_PATCH_FIELD),
    AperturePatch: fieldSchema(APERTURE_PATCH_FIELD),
    InstanceProperties: fieldSchema(INSTANCE_PROPERTIES_FIELD),
    InstanceUpdateProperties: fieldSchema(INSTANCE_PROPERTIES_UPDATE_FIELD),
  },
  enums: {
    entryPolicy: ENTRY_POLICY_VALUES,
    zoneSampleMode: ZONE_SAMPLE_MODE_VALUES,
    evaluationPolicy: EVALUATION_POLICY_VALUES,
    transitionKind: TRANSITION_KIND_VALUES,
    effectKind: EFFECT_KIND_VALUES,
    apertureShape: APERTURE_SHAPE_VALUES,
    propertyTargetKind: PROPERTY_TARGET_KINDS,
  },
  effectParameters: showEffectParameterReferenceV2(),
  apertureShapeParameters: APERTURE_SHAPE_PARAMETER_OWNERS,
  examples: Object.values(SHOW_AUTHORING_V2_EXAMPLES),
} as const

function effectTable(): string {
  return showEffectParameterReferenceV2()
    .map(entry => `| \`${entry.kind}\` | ${entry.parameters.map(parameter => `\`${parameter.name}\` (${parameter.range})`).join(', ') || '(none)'} |`)
    .join('\n')
}

export const SHOW_AUTHORING_V2_REFERENCE_MARKDOWN = `# Show authoring reference v${SHOW_AUTHORING_V2_SCHEMA_VERSION}

Every command addresses entities by stable identity from \`read_show\`: \`clip_id\`, \`layer_id\`, \`instance_id\`, \`transition_id\`, \`interval_id\`, \`track_id\`, \`keyframe_id\`, \`marker_id\`, \`effect_id\`, \`group_occurrence_id\`. A derived Cut junction is addressed by its \`(from_clip_id, to_clip_id)\` pair. There are no index or time lookups.

Times are nonnegative safe-integer global milliseconds, durations are positive, and intervals are half-open. Timing is exact: nothing is clamped, and Show End grows only through \`set_show_end\`, \`insert_time\` and an appended or duplicated Layout interval. An already-satisfied valid request returns \`unchanged\` with no changes, creates no history, timestamp or save, and never aborts the batch it is in.

Every changed command reports the same fourteen affected collections in \`changes[].details\`: \`clips\`, \`instances\`, \`transitions\`, \`tracks\`, \`layoutDefinitions\`, \`layoutIntervals\`, \`groupDefinitions\`, \`groupOccurrences\`, \`layers\`, \`markers\`, \`appearanceKeys\`, \`propertyKeys\`, \`removed\` and \`discardedControlTargets\`. Requested scope is what you asked for; affected scope is what changed.

## ClipSpec and ClipPatch

\`ClipSpec\` places one Clip at an exact interval: \`zone_id\`, \`layer_id\`, \`start_ms\`, \`duration_ms\` and a structured \`pattern\` reference. \`instance\` decides the runtime: \`"sole"\` (default) reuses the one existing runtime for that Pattern source, creates the first when none exists, and refuses with candidate identities when several exist; \`"new"\` creates the first runtime; any other value is an explicit existing \`instance_id\`. \`entry_policy\` is \`continue\` or \`restart\`; \`restart\` resets the whole Pattern instance at that Clip's first contribution, which every Clip sharing the runtime observes.

\`ClipPatch\` updates one Clip by \`clip_id\`. \`start_ms\` and \`duration_ms\` go through the Clip temporal owner, so a Transition-connected Clip translates its whole connected component rigidly and a resized edge ripples connected successors while Transition identity and settings stay fixed. \`zone_id\` and \`layer_id\` re-place the Clip: its held appearance keys and Clip-owned tracks travel with it, shared Pattern-instance tracks stay where they are, and no runtime is created. A re-placement refuses when the Clip is a participant endpoint of a Transition or a contributor to a converted boundary Transition (reset that Transition first rather than detaching it), when the destination Layer is already occupied at that interval, and when the destination Zone is missing from the active Layout for any part of the Clip's post-detach contribution interval. \`instance_properties\` writes Pattern-instance values, which affect every Clip sharing the runtime and appear in \`instances\` and \`clips\`.

## Markers

\`add_marker\` and \`update_marker\` carry an optional \`role\`. The one enumerated value is \`"chapter"\`, which lists the Marker in the Gallery and Live chapter projections; \`update_marker\` accepts \`null\` to clear it. A role owns no time partition and never triggers playback, and a Marker beyond Show End stays dormant.

## Appearance and the apply selector

Appearance is a keyed timeline. \`update_clips.appearance.apply\` selects where the edit lands: \`{ "scope": "whole-clip" }\` writes every held key, and \`{ "scope": "at-time", "at_ms": N }\` writes the held key covering that global time, inserting one when the time has no key. Later keys keep their own values. The selected time must lie inside the Clip's nominal bar; its exclusive end and outside-bar Transition contribution times refuse.

The Effect stack commands take the same \`apply\` selector. Effect ordering and identity are per-Effect, so \`add_clip_effect\`, \`update_clip_effect\`, \`move_clip_effect\`, \`duplicate_clip_effect\` and \`remove_clip_effect\` stay singular.

## Effect parameters

An Effect is authored as \`{ kind, parameters }\`; omitted parameters keep the catalogue default. Colors are CSS color strings.

| Effect kind | Parameters |
| --- | --- |
${effectTable()}

## Aperture shape parameters

The Aperture patch carries \`enabled\`, \`aperture\`, \`edge\`, \`invert\`, \`x\`, \`y\`, \`width\` and \`height\` directly, plus \`shape_parameters\` by name. \`feather\` (0.001 to 1) and \`rotation\` (-1 to 1) apply to any shape. The shape-specific parameters are:

${Object.entries(APERTURE_SHAPE_PARAMETER_OWNERS).map(([shape, names]) => `- \`${shape}\`: ${names.map(name => `\`${name}\``).join(', ')}`).join('\n')}

Passing \`null\` for a shape parameter returns it to its automatic default.

## Animation targets

\`add_property_tracks\` takes a typed target with a \`kind\` from the nine target forms, using short Clip-scoped names:

${PROPERTY_TARGET_KINDS.map(kind => `- \`${kind}\``).join('\n')}

Clip kinds need \`clip_id\`; \`control\` and \`time-scale\` need \`instance_id\` (and \`control\` also the export name); \`effect\` needs \`clip_id\`, \`effect_id\` and \`parameter\`; \`layout-split-position\` needs \`interval_id\`; \`show-repeat-scale\` needs nothing else. Activation defaults to the Clip span for Clip targets, the union of user spans for Pattern-instance targets, the interval for a Layout split position, and the whole Show for repeat scale. A track has effect only inside its half-open activation window; retained curve descriptors are engine-owned and no command authors them.

## Examples

\`create_clips\`

\`\`\`json
${JSON.stringify(SHOW_AUTHORING_V2_EXAMPLES.create_clips, null, 2)}
\`\`\`

\`update_clips\`

\`\`\`json
${JSON.stringify(SHOW_AUTHORING_V2_EXAMPLES.update_clips, null, 2)}
\`\`\`

\`add_property_tracks\`

\`\`\`json
${JSON.stringify(SHOW_AUTHORING_V2_EXAMPLES.add_property_tracks, null, 2)}
\`\`\`
`
