import type { ShowCommandField } from './registry'
import {
  SHOW_AUTHORING_MAX_BATCH_ITEMS,
  SHOW_AUTHORING_SCHEMA_VERSION,
  SHOW_CLIP_PATCH_FIELD,
  SHOW_CLIP_PROPERTIES_FIELD,
  SHOW_CLIP_SPEC_FIELD,
  SHOW_LAYER_SPEC_FIELD,
} from './bulkAuthoring'

export const SHOW_AUTHORING_SCHEMA_URI = 'pxlblz://schemas/clip-layer-authoring/v1'
export const SHOW_AUTHORING_REFERENCE_URI = 'pxlblz://docs/clip-layer-authoring/v1'

export const SHOW_AUTHORING_SERVER_INTRO =
  `Clip/Layer bulk authoring uses schema version ${SHOW_AUTHORING_SCHEMA_VERSION}: ` +
  'create_clips and create_layers create fresh Pattern instances; update_clips preserves shared instances. ' +
  'Times are exact global milliseconds. Nested objects patch supplied leaves, Effects arrays replace, and controls null clears one export. ' +
  `Each call is atomic and bounded to ${SHOW_AUTHORING_MAX_BATCH_ITEMS} entries. ` +
  `Read ${SHOW_AUTHORING_REFERENCE_URI} and ${SHOW_AUTHORING_SCHEMA_URI} for the complete reference and examples.`

export const SHOW_AUTHORING_EXAMPLES = {
  create_clips: {
    schema_version: 1,
    clips: [{
      zone_id: 'zone-1', layer: 'main', start_ms: 0, duration_ms: 4_000,
      pattern: { kind: 'stock', id: 'LineDancer2D' },
      properties: { view: { brightness: 0.7 }, controls: { sliderSpeed: 0.4 } },
    }],
  },
  create_layers: {
    schema_version: 1,
    layers: [
      { zone_id: 'zone-1', clips: [{ start_ms: 0, duration_ms: 4_000, pattern: { kind: 'stock', id: 'LineDancer2D' }, properties: { controls: { sliderSpeed: 0.4 } } }] },
      { zone_id: 'zone-1', clips: [] },
    ],
  },
  update_clips: {
    schema_version: 1,
    updates: [
      { clip_id: 'existing-logical-clip-id', properties: { view: { brightness: 0.5 }, controls: { sliderSpeed: null }, effects: [] } },
      { clip_id: 'another-logical-clip-id', start_ms: 12_000, duration_ms: 4_000 },
    ],
  },
} as const

function fieldSchema(field: ShowCommandField): Record<string, unknown> {
  let schema: Record<string, unknown>
  switch (field.kind) {
    case 'string': schema = { type: 'string', ...(field.enum ? { enum: field.enum } : {}) }; break
    case 'number': schema = { type: 'number', ...(field.minimum !== undefined ? { minimum: field.minimum } : {}), ...(field.maximum !== undefined ? { maximum: field.maximum } : {}) }; break
    case 'integer': schema = {
      type: 'integer',
      ...(field.minimum !== undefined ? { minimum: field.minimum } : field.safeInteger ? { minimum: Number.MIN_SAFE_INTEGER } : {}),
      ...(field.maximum !== undefined ? { maximum: field.maximum } : field.safeInteger ? { maximum: Number.MAX_SAFE_INTEGER } : {}),
    }; break
    case 'boolean': schema = { type: 'boolean' }; break
    case 'layer': schema = { oneOf: [{ const: 'main' }, { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }] }; break
    case 'easing': schema = { description: 'A supported preset or structured easing object' }; break
    case 'json': schema = {}; break
    case 'array': schema = { type: 'array', items: fieldSchema(field.items), ...(field.minItems !== undefined ? { minItems: field.minItems } : {}), ...(field.maxItems !== undefined ? { maxItems: field.maxItems } : {}) }; break
    case 'record': schema = { type: 'object', additionalProperties: fieldSchema(field.values) }; break
    case 'union': schema = { oneOf: field.variants.map(fieldSchema) }; break
    case 'object': {
      schema = {
        type: 'object',
        properties: Object.fromEntries(Object.entries(field.properties).map(([name, property]) => [name, fieldSchema(property)])),
        required: Object.entries(field.properties).filter(([, property]) => !property.optional).map(([name]) => name),
        additionalProperties: false,
        ...(!field.allowEmpty ? { minProperties: 1 } : {}),
      }
      break
    }
  }
  if (field.nullable) schema = { oneOf: [schema, { type: 'null' }] }
  return { ...schema, description: field.description }
}

const versionSchema = { type: 'integer', const: SHOW_AUTHORING_SCHEMA_VERSION }
const envelope = (collection: string, item: ShowCommandField) => ({
  type: 'object',
  properties: {
    schema_version: versionSchema,
    [collection]: { type: 'array', minItems: 1, maxItems: SHOW_AUTHORING_MAX_BATCH_ITEMS, items: fieldSchema(item) },
  },
  required: ['schema_version', collection],
  additionalProperties: false,
})

/** JSON Schema generated directly from the same recursive fields used at runtime and by tool discovery. */
export const SHOW_AUTHORING_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: SHOW_AUTHORING_SCHEMA_URI,
  title: 'PXLBLZ Clip and Layer Authoring Vocabulary',
  version: SHOW_AUTHORING_SCHEMA_VERSION,
  maxBatchItems: SHOW_AUTHORING_MAX_BATCH_ITEMS,
  $defs: {
    ClipProperties: fieldSchema(SHOW_CLIP_PROPERTIES_FIELD),
    ClipSpec: fieldSchema(SHOW_CLIP_SPEC_FIELD),
    LayerSpec: fieldSchema(SHOW_LAYER_SPEC_FIELD),
    ClipPatch: fieldSchema(SHOW_CLIP_PATCH_FIELD),
    create_clips: envelope('clips', SHOW_CLIP_SPEC_FIELD),
    create_layers: envelope('layers', SHOW_LAYER_SPEC_FIELD),
    update_clips: envelope('updates', SHOW_CLIP_PATCH_FIELD),
  },
  examples: Object.values(SHOW_AUTHORING_EXAMPLES),
} as const

export const SHOW_AUTHORING_REFERENCE_MARKDOWN = `# Clip and Layer authoring schema v${SHOW_AUTHORING_SCHEMA_VERSION}

Use \`create_clips\`, \`create_layers\`, and \`update_clips\` to author collections in one private atomic operation. The tool input schema is authoritative for types, enums, ranges, required fields, and all ${SHOW_AUTHORING_MAX_BATCH_ITEMS}-item limits. Read \`${SHOW_AUTHORING_SCHEMA_URI}\` for the generated JSON Schema and executable examples.

Times are nonnegative safe-integer global milliseconds. Duration is a positive safe integer. Timing is exact: no clamp, ripple, Show extension, or placement in a Transition window. \`layer\` is \`"main"\` or a zero-based overlay index; overlay index 0 is topmost.

\`ClipSpec\` requires Zone, Layer, Start, Duration, and an exact stock/personal Pattern reference. A nested Layer Clip inherits Zone and its new overlay Layer. Creation gives every Clip a fresh Pattern instance. Neutral defaults are opacity 1; view mirror false, phase 0, brightness 1; Content Transform position 0/0, rotation 0, scale 1/1; live presentation; no blink, Aperture, Effects, shutter, stepped clock, controls, or special evaluation policy; time scale 1 and offset 0.

\`ClipProperties\` covers opacity; view mirror/phase/brightness; Content Transform position_x/position_y/rotation/scale_x/scale_y; the full Aperture frame, shape, edge, and shape-specific parameters; all ordered Effect kinds and their public parameter fields; presentation mode/cadence; blink rate/duty/phase; shared time scale/offset/light shutter/stepped clock; shared evaluation policy; and slider control targets. Nested objects patch their supplied leaves. Effects replace the whole ordered stack, so \`[]\` clears an unanimated stack. Controls patch by export name and \`null\` clears one target. Aperture edge, feather, and shape-specific optional overrides accept \`null\` to return to automatic defaults. Blink, light shutter, and stepped clock accept \`null\` to disable them. No other field accepts null.

Instance time, evaluation, and controls affect every Clip linked to that Pattern instance. Equal requests coalesce, disjoint leaf requests combine, and conflicting requests refuse with every conflicting input path. Placement fields apply to every physical segment of a logical Clip while preserving omitted segment-local values.

Final arrangement validation supports ordinary Clip swaps, rotations, combined move/resize, and cross-Layer moves independent of array order. A connected Transition, Group-owned Clip, or animation topology that cannot preserve ownership refuses by name. Success returns one aggregate change with input-index-to-ID mappings, direct and linked Clip IDs, actual destinations/timing, and distinct changed paths. A valid full no-op returns no change, timestamp, history, or save mutation.

## Examples

\`create_clips\`

\`\`\`json
${JSON.stringify(SHOW_AUTHORING_EXAMPLES.create_clips, null, 2)}
\`\`\`

\`create_layers\`

\`\`\`json
${JSON.stringify(SHOW_AUTHORING_EXAMPLES.create_layers, null, 2)}
\`\`\`

\`update_clips\`

\`\`\`json
${JSON.stringify(SHOW_AUTHORING_EXAMPLES.update_clips, null, 2)}
\`\`\`
`
