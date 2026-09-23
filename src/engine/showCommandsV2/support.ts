// Shared helpers for the v2 command family modules: owner-result adoption,
// identity resolution with candidate lists, and the reusable typed field
// fragments the catalogue rules require. Pure logic only.
import type { ShowRecordV2 } from '../showCompositionV2'
import { effectiveShowClipsV2 } from '../showGroupsV2'
import { SHOW_CLIP_APERTURE_SHAPES } from '../showClipViewport'
import { freshShowIdV2, freshShowIdsV2, ownedShowIdsV2 } from '../showIdentityV2'
import {
  changedShowCommandV2,
  emptyShowCommandV2Affected,
  isObject,
  mergeShowCommandV2Affected,
  refuseShowCommandV2,
  unchangedShowCommandV2,
  type ShowCommandV2Affected,
  type ShowCommandV2Field,
  type ShowCommandV2Issue,
  type ShowCommandV2Outcome,
} from './registry'

export { freshShowIdV2, freshShowIdsV2, ownedShowIdsV2 }

/** Every owner affected-collection name mapped onto the one command vocabulary. */
const OWNER_COLLECTION_NAMES: Record<string, keyof ShowCommandV2Affected> = {
  affectedClipIds: 'clips',
  affectedInstanceIds: 'instances',
  hoistedInstanceIds: 'instances',
  affectedTransitionIds: 'transitions',
  affectedTrackIds: 'tracks',
  affectedLayoutDefinitionIds: 'layoutDefinitions',
  affectedLayoutOccurrenceIds: 'layoutIntervals',
  affectedGroupDefinitionIds: 'groupDefinitions',
  affectedGroupOccurrenceIds: 'groupOccurrences',
  affectedLayerIds: 'layers',
  affectedMarkerIds: 'markers',
  affectedAppearanceKeyIds: 'appearanceKeys',
  affectedKeyframeIds: 'propertyKeys',
  affectedPropertyKeyIds: 'propertyKeys',
  removedIds: 'removed',
  removedLayoutOccurrenceIds: 'removed',
}

/**
 * Translate any v2 owner result's affected collections into the single command
 * vocabulary. The command layer reports exactly what the owner reported; it
 * never invents, widens or drops an affected identity.
 */
export function ownerAffected(result: Record<string, unknown>): ShowCommandV2Affected {
  const part: Partial<Record<keyof ShowCommandV2Affected, string[]>> = {}
  for (const [ownerName, collection] of Object.entries(OWNER_COLLECTION_NAMES)) {
    const value = result[ownerName]
    if (!Array.isArray(value)) continue
    part[collection] = [...(part[collection] ?? []), ...value.filter((id): id is string => typeof id === 'string')]
  }
  const targets = result.discardedControlTargets
  const discardedControlTargets = Array.isArray(targets)
    ? targets.filter(isObject)
      .filter(target => typeof target.instanceId === 'string' && typeof target.exportName === 'string')
      .map(target => ({ instanceId: target.instanceId as string, exportName: target.exportName as string }))
    : []
  return mergeShowCommandV2Affected({ ...part, discardedControlTargets })
}

/** Any v2 owner result shape this layer adopts. */
export interface OwnerResultLike {
  status: 'changed' | 'unchanged' | 'refused'
  record: ShowRecordV2
  code?: string
  message?: string
  /** Nearest known identities, when the owner or the command layer resolved some. */
  candidates?: string[]
}

/**
 * Adopt one owner result under the uniform no-op policy (catalogue rule 4).
 * `unchanged` returns the preimage with zero changes so a batch continues; a
 * refusal carries the owner's typed code through unaltered (rule 7).
 */
export function adoptOwnerResult(
  command: string,
  record: ShowRecordV2,
  result: OwnerResultLike,
  describe: (affected: ShowCommandV2Affected) => string,
  targetId?: string,
): ShowCommandV2Outcome {
  if (result.status === 'refused') {
    return refuseShowCommandV2(record, {
      code: result.code ?? 'engine-refused',
      message: `${command}: ${result.message ?? 'the owner declined this edit.'}`,
      ...(result.candidates ? { candidates: result.candidates } : {}),
    })
  }
  if (result.status === 'unchanged') return unchangedShowCommandV2(record)
  const affected = ownerAffected(result as unknown as Record<string, unknown>)
  return changedShowCommandV2(result.record, command, describe(affected), affected, targetId)
}

/** Fold several owner results into one atomic command outcome. */
export function adoptOwnerResults(
  command: string,
  record: ShowRecordV2,
  steps: ReadonlyArray<{ run: (current: ShowRecordV2) => OwnerResultLike; targetId?: string }>,
  describe: (affected: ShowCommandV2Affected, changedTargetIds: string[]) => string,
): ShowCommandV2Outcome {
  let current = record
  const parts: ShowCommandV2Affected[] = []
  const changedTargetIds: string[] = []
  for (const step of steps) {
    const result = step.run(current)
    if (result.status === 'refused') {
      return refuseShowCommandV2(record, {
        code: result.code ?? 'engine-refused',
        message: `${command}: ${result.message ?? 'the owner declined this edit.'}`,
        ...(result.candidates ? { candidates: result.candidates } : {}),
      })
    }
    if (result.status === 'unchanged') continue
    current = result.record
    parts.push(ownerAffected(result as unknown as Record<string, unknown>))
    if (step.targetId) changedTargetIds.push(step.targetId)
  }
  if (parts.length === 0) return unchangedShowCommandV2(record)
  const affected = mergeShowCommandV2Affected(...parts)
  return changedShowCommandV2(current, command, describe(affected, changedTargetIds), affected)
}

export function unknownIdentity(
  record: ShowRecordV2,
  command: string,
  label: string,
  id: string,
  candidates: readonly string[],
): ShowCommandV2Outcome {
  return refuseShowCommandV2(record, {
    code: 'unknown-id',
    message: `${command}: no ${label} has id "${id}".`,
    remedy: 'Call read_show for the current identities.',
    candidates: [...candidates],
  })
}

export function invalidArgument(record: ShowRecordV2, command: string, message: string, path?: string): ShowCommandV2Outcome {
  const issue: ShowCommandV2Issue = { code: 'invalid-argument', message: `${command}: ${message}`, ...(path ? { path } : {}) }
  return refuseShowCommandV2(record, issue)
}

export function clipIds(record: ShowRecordV2): string[] {
  return record.composition.clips.map(clip => clip.id)
}

export function effectiveClipIds(record: ShowRecordV2): string[] {
  return effectiveShowClipsV2(record).map(clip => clip.id)
}

export function describeIds(ids: readonly string[]): string {
  return ids.length ? ids.join(', ') : 'none'
}

export function affectedWith(part: Partial<ShowCommandV2Affected>): ShowCommandV2Affected {
  return mergeShowCommandV2Affected(emptyShowCommandV2Affected(), part)
}

// ---------------------------------------------------------------------------
// Reusable typed field fragments (catalogue rule 5). Every closed set is an
// enum, every numeric range carries schema bounds, and `null` appears only
// where the field documents clearing.
// ---------------------------------------------------------------------------

export const MAX_SAFE_MS = Number.MAX_SAFE_INTEGER

export function idField(description: string, optional = false): ShowCommandV2Field {
  return { kind: 'string', description, maxLength: 200, ...(optional ? { optional: true } : {}) }
}

export function timeField(description: string, optional = false): ShowCommandV2Field {
  return { kind: 'integer', minimum: 0, maximum: MAX_SAFE_MS, description, ...(optional ? { optional: true } : {}) }
}

export function durationField(description: string, optional = false): ShowCommandV2Field {
  return { kind: 'integer', minimum: 1, maximum: MAX_SAFE_MS, description, ...(optional ? { optional: true } : {}) }
}

export function unitField(description: string, optional = false): ShowCommandV2Field {
  return { kind: 'number', minimum: 0, maximum: 1, description, ...(optional ? { optional: true } : {}) }
}

export const EASING_FIELD: ShowCommandV2Field = {
  kind: 'easing',
  optional: true,
  description: 'Easing preset or a structured curve object.',
}

export const ENTRY_POLICY_VALUES = ['continue', 'restart'] as const
export const ZONE_SAMPLE_MODE_VALUES = ['independent', 'span', 'repeat'] as const
export const TRANSITION_KIND_VALUES = ['crossfade', 'fade-color', 'wipe', 'dither', 'portal', 'motion'] as const
export const ROUTING_DIRECTION_VALUES = ['forward', 'reverse'] as const
export const EFFECT_KIND_VALUES = [
  'opacity', 'brightness', 'hue', 'saturation', 'contrast', 'invert', 'threshold',
  'luma-key', 'chroma-key', 'posterize', 'vignette', 'color-map', 'translate', 'rotate',
  'scale', 'shear', 'ripple', 'swirl', 'bulge', 'pixelate', 'kaleidoscope', 'wrap',
] as const
export const APPEARANCE_APPLY_SCOPES = ['whole-clip', 'at-time'] as const
export const EVALUATION_POLICY_VALUES = ['live', 'freeze-at-entry', 'rolling-refresh'] as const

/**
 * The bulk Effect vocabulary (catalogue rule 8). Per-kind parameter names and
 * ranges live in the markdown resource, not in a twenty-two-variant schema
 * union; the appearance owner validates the parameter record.
 */
export const EFFECT_SPEC_FIELD: ShowCommandV2Field = {
  kind: 'object',
  description: 'One Clip Effect. The authoring reference lists each kind\'s parameters and ranges.',
  properties: {
    id: idField('Optional explicit Effect identity; omit to mint one.', true),
    kind: { kind: 'string', enum: EFFECT_KIND_VALUES, description: 'Effect kind.' },
    parameters: {
      kind: 'record',
      optional: true,
      description: 'Parameter values by name; omitted keep the default.',
      values: {
        kind: 'union',
        description: 'A number, or a CSS color string.',
        variants: [
          { kind: 'number', description: 'Numeric parameter value.' },
          { kind: 'string', maxLength: 64, description: 'Color parameter value.' },
        ],
      },
    },
  },
}

export const APPEARANCE_APPLY_FIELD: ShowCommandV2Field = {
  kind: 'object',
  description: 'Where the edit lands.',
  properties: {
    scope: { kind: 'string', enum: APPEARANCE_APPLY_SCOPES, description: 'whole-clip writes every held key; at-time writes the key at at_ms.' },
    at_ms: timeField('Global ms inside the Clip bar; required for at-time.', true),
  },
}

export const VIEW_PATCH_FIELD: ShowCommandV2Field = {
  kind: 'object',
  optional: true,
  description: 'Clip view.',
  properties: {
    mirror: { kind: 'boolean', optional: true, description: 'Mirror the sample.' },
    phase: unitField('View phase, 0-1.', true),
    brightness: unitField('View brightness, 0-1.', true),
  },
}

export const TRANSFORM_PATCH_FIELD: ShowCommandV2Field = {
  kind: 'object',
  optional: true,
  nullable: true,
  description: 'Clip Transform; null clears it.',
  properties: {
    positionX: { kind: 'number', optional: true, minimum: -4, maximum: 4, description: 'Horizontal offset, -4-4.' },
    positionY: { kind: 'number', optional: true, minimum: -4, maximum: 4, description: 'Vertical offset, -4-4.' },
    rotation: { kind: 'number', optional: true, minimum: -8, maximum: 8, description: 'Rotation in turns, -8-8.' },
    scaleX: { kind: 'number', optional: true, minimum: 0.01, maximum: 8, description: 'Horizontal scale, 0.01-8.' },
    scaleY: { kind: 'number', optional: true, minimum: 0.01, maximum: 8, description: 'Vertical scale, 0.01-8.' },
  },
}

export const APERTURE_SHAPE_VALUES = SHOW_CLIP_APERTURE_SHAPES

export const APERTURE_SHAPE_PARAMETERS = [
  'feather', 'rotation', 'ringWidth', 'cornerRadius', 'crossWidth',
  'starPoints', 'starInner', 'crescentOffset', 'polygonSides',
] as const

export const APERTURE_PATCH_FIELD: ShowCommandV2Field = {
  kind: 'object',
  optional: true,
  nullable: true,
  description: 'Clip Aperture; null clears it.',
  properties: {
    enabled: { kind: 'boolean', optional: true, description: 'Whether the Aperture masks the Clip.' },
    aperture: { kind: 'string', optional: true, nullable: true, enum: APERTURE_SHAPE_VALUES, description: 'Aperture shape; null clears it.' },
    edge: { kind: 'string', optional: true, nullable: true, enum: ['hard', 'soft', 'dither'], description: 'Edge treatment; null clears it.' },
    invert: { kind: 'boolean', optional: true, nullable: true, description: 'Invert the mask; null clears it.' },
    x: { kind: 'number', optional: true, minimum: -4, maximum: 4, description: 'Centre X, -4-4.' },
    y: { kind: 'number', optional: true, minimum: -4, maximum: 4, description: 'Centre Y, -4-4.' },
    width: { kind: 'number', optional: true, minimum: 0.01, maximum: 8, description: 'Width, 0.01-8.' },
    height: { kind: 'number', optional: true, minimum: 0.01, maximum: 8, description: 'Height, 0.01-8.' },
    shape_parameters: {
      kind: 'record',
      optional: true,
      description: 'Shape parameters by name (feather, rotation, ringWidth, cornerRadius, crossWidth, starPoints, starInner, crescentOffset, polygonSides); null clears one. The authoring reference lists each shape\'s parameters and ranges, and the appearance owner validates them.',
      values: { kind: 'number', nullable: true, description: 'Parameter value, or null to clear it.' },
    },
  },
}

/**
 * Expand the compact Aperture shape-parameter record back into the owner's
 * appearance patch shape. This is a vocabulary translation, not a domain rule:
 * every range is still validated by the appearance owner.
 */
export function appearancePatchFromInput(values: Record<string, unknown>): Record<string, unknown> {
  const aperture = values.aperture
  if (!aperture || typeof aperture !== 'object' || Array.isArray(aperture)) return values
  const { shape_parameters: shape, ...rest } = aperture as Record<string, unknown>
  if (shape === undefined) return values
  return { ...values, aperture: { ...rest, ...(shape as Record<string, unknown>) } }
}

export const PRESENTATION_PATCH_FIELD: ShowCommandV2Field = {
  kind: 'union',
  optional: true,
  nullable: true,
  description: 'Clip presentation; null clears it.',
  variants: [
    {
      kind: 'object',
      description: 'Live or frozen.',
      properties: { mode: { kind: 'string', enum: ['live', 'freeze'], description: 'Presentation mode.' } },
    },
    {
      kind: 'object',
      description: 'Strobe with a cadence.',
      properties: {
        mode: { kind: 'string', enum: ['strobe'], description: 'Presentation mode.' },
        cadenceMs: { kind: 'integer', minimum: 16, maximum: 60_000, description: 'Strobe cadence ms, 16-60000.' },
      },
    },
  ],
}

export const BLINK_PATCH_FIELD: ShowCommandV2Field = {
  kind: 'object',
  optional: true,
  nullable: true,
  description: 'Clip Blink; null clears it.',
  properties: {
    rateHz: { kind: 'number', minimum: 0.01, maximum: 60, description: 'Blink rate Hz, 0.01-60.' },
    duty: unitField('Blink duty, 0-1.'),
    phase: unitField('Blink phase, 0-1.'),
  },
}

/** The held appearance patch shared by create_clips, update_clips and the Effect commands. */
export const APPEARANCE_PATCH_FIELD: ShowCommandV2Field = {
  kind: 'object',
  optional: true,
  description: 'Held appearance values.',
  atLeastOne: ['opacity', 'view', 'transform', 'aperture', 'presentation', 'blink'],
  properties: {
    opacity: unitField('Clip opacity, 0-1.', true),
    view: VIEW_PATCH_FIELD,
    transform: TRANSFORM_PATCH_FIELD,
    aperture: APERTURE_PATCH_FIELD,
    presentation: PRESENTATION_PATCH_FIELD,
    blink: BLINK_PATCH_FIELD,
  },
}

export const PATTERN_REFERENCE_FIELD: ShowCommandV2Field = {
  kind: 'object',
  description: 'Pattern source identity from list_patterns.',
  properties: {
    kind: { kind: 'string', enum: ['stock', 'user'], description: 'Pattern source kind.' },
    id: idField('Pattern identity.'),
  },
}

export const INSTANCE_PROPERTIES_FIELD: ShowCommandV2Field = {
  kind: 'object',
  optional: true,
  description: 'Pattern-instance values; every Clip sharing the runtime is affected.',
  atLeastOne: ['controls', 'time_scale', 'time_offset_ms', 'evaluation'],
  properties: {
    controls: {
      kind: 'record',
      optional: true,
      description: 'Slider values by export name, 0-1.',
      values: unitField('Control value, 0-1.'),
    },
    time_scale: { kind: 'number', optional: true, minimum: 0, maximum: 8, description: 'Time scale, 0-8; zero freezes the clock.' },
    time_offset_ms: { kind: 'integer', optional: true, minimum: -MAX_SAFE_MS, maximum: MAX_SAFE_MS, description: 'Clock offset ms.' },
    evaluation: { kind: 'string', optional: true, enum: EVALUATION_POLICY_VALUES, description: 'Instance evaluation policy: live, one frozen entry frame, or a rolling quarter refresh.' },
  },
}

/** Update-only instance properties: the shared shape plus remove_controls, which un-targets a control on an existing Clip. */
export const INSTANCE_PROPERTIES_UPDATE_FIELD: ShowCommandV2Field = {
  ...(INSTANCE_PROPERTIES_FIELD as Extract<ShowCommandV2Field, { kind: 'object' }>),
  atLeastOne: [...(INSTANCE_PROPERTIES_FIELD as Extract<ShowCommandV2Field, { kind: 'object' }>).atLeastOne ?? [], 'remove_controls'],
  properties: {
    ...(INSTANCE_PROPERTIES_FIELD as Extract<ShowCommandV2Field, { kind: 'object' }>).properties,
    remove_controls: {
      kind: 'array',
      optional: true,
      minItems: 1,
      maxItems: 128,
      description: 'Control export names to un-target, pruning their animation lanes.',
      items: { kind: 'string', description: 'Control export name.' },
    },
  },
}
