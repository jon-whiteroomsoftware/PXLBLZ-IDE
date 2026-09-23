// ClipSpec and ClipPatch: the one shared Clip vocabulary create_clips,
// update_clips and create_layers all use (catalogue rule 10). Creation goes
// through the Clip creation owner, then the appearance owner for the initial
// held key, then the instance-property writer. No domain rule is restated here.
import type { ShowClipEffect, ShowPatternInstance, ShowPatternRef } from '../personalContentRecords'
import type { ShowRecordV2 } from '../showCompositionV2'
import { createShowClipV2 } from '../showClipCreationV2'
import { editShowClipAppearanceV2 } from '../showClipAppearanceEditsV2'
import { materializeShowGroupsV2 } from '../showGroupsV2'
import { writeShowInstancePropertiesV2, type ShowInstancePropertiesResultV2 } from '../showInstancePropertiesV2'
import { normalizeShowClipEffects } from '../showEffects'
import {
  refuseShowCommandV2,
  unchangedShowCommandV2,
  type ShowCommandV2Context,
  type ShowCommandV2Descriptor,
  type ShowCommandV2Field,
  type ShowCommandV2Outcome,
} from './registry'
import {
  APPEARANCE_APPLY_FIELD,
  APPEARANCE_PATCH_FIELD,
  appearancePatchFromInput,
  EFFECT_SPEC_FIELD,
  ENTRY_POLICY_VALUES,
  INSTANCE_PROPERTIES_FIELD,
  INSTANCE_PROPERTIES_UPDATE_FIELD,
  PATTERN_REFERENCE_FIELD,
  ZONE_SAMPLE_MODE_VALUES,
  adoptOwnerResults,
  describeIds,
  durationField,
  freshShowIdsV2,
  idField,
  invalidArgument,
  ownedShowIdsV2,
  timeField,
  unknownIdentity,
} from './support'

/** D3: how a new Clip picks its Pattern runtime. */
export const INSTANCE_POLICY_FIELD: ShowCommandV2Field = {
  kind: 'string',
  optional: true,
  maxLength: 200,
  description: 'Runtime: "sole" (default) reuses the one runtime for this source, or creates the first; "new" creates the first runtime; any other value is an existing instance_id.',
}

export const APPEARANCE_SPEC_FIELD: ShowCommandV2Field = {
  ...(APPEARANCE_PATCH_FIELD as Extract<ShowCommandV2Field, { kind: 'object' }>),
  optional: true,
  description: 'Initial held appearance and Effects.',
  properties: {
    ...(APPEARANCE_PATCH_FIELD as Extract<ShowCommandV2Field, { kind: 'object' }>).properties,
    effects: {
      kind: 'array',
      optional: true,
      minItems: 1,
      maxItems: 128,
      description: 'Ordered Effects for the first held key.',
      items: EFFECT_SPEC_FIELD,
    },
  },
  atLeastOne: ['opacity', 'view', 'transform', 'aperture', 'presentation', 'blink', 'effects'],
}

export const CLIP_SPEC_FIELD: ShowCommandV2Field = {
  kind: 'object',
  description: 'One Clip at an exact global interval.',
  properties: {
    zone_id: idField('The Clip Zone.'),
    layer_id: idField('The Clip Layer; omit only inside create_layers.', true),
    start_ms: timeField('Global start ms.'),
    duration_ms: durationField('Positive duration ms.'),
    pattern: PATTERN_REFERENCE_FIELD,
    instance: INSTANCE_POLICY_FIELD,
    entry_policy: { kind: 'string', optional: true, enum: ENTRY_POLICY_VALUES, description: 'continue (default), or restart to reset the whole Pattern instance at this Clip\'s first contribution.' },
    zone_sample_mode: { kind: 'string', optional: true, enum: ZONE_SAMPLE_MODE_VALUES, description: 'Zone sampling; span is the default.' },
    appearance: APPEARANCE_SPEC_FIELD,
    instance_properties: INSTANCE_PROPERTIES_FIELD,
  },
}

export const CLIP_PATCH_FIELD: ShowCommandV2Field = {
  kind: 'object',
  description: 'One Clip update by clip_id.',
  atLeastOne: ['zone_id', 'layer_id', 'start_ms', 'duration_ms', 'entry_policy', 'zone_sample_mode', 'appearance', 'instance_properties'],
  properties: {
    clip_id: idField('The Clip to update.'),
    zone_id: idField('Destination Zone.', true),
    layer_id: idField('Destination Layer.', true),
    start_ms: timeField('New global start ms.', true),
    duration_ms: durationField('New duration ms.', true),
    entry_policy: { kind: 'string', optional: true, enum: ENTRY_POLICY_VALUES, description: 'Clip entry policy.' },
    zone_sample_mode: { kind: 'string', optional: true, enum: ZONE_SAMPLE_MODE_VALUES, description: 'Zone sampling.' },
    appearance: {
      kind: 'object',
      optional: true,
      description: 'Held appearance patch and where it lands.',
      properties: {
        apply: APPEARANCE_APPLY_FIELD,
        ...(APPEARANCE_PATCH_FIELD as Extract<ShowCommandV2Field, { kind: 'object' }>).properties,
      },
      atLeastOne: ['opacity', 'view', 'transform', 'aperture', 'presentation', 'blink'],
    },
    instance_properties: INSTANCE_PROPERTIES_UPDATE_FIELD,
  },
}

export interface ResolvedRuntimeSelection {
  runtime: { kind: 'existing'; instanceId?: string } | { kind: 'first'; instance: ShowPatternInstance }
  patternReference: ShowPatternRef
}

/**
 * Resolve D3's instance policy against the effective runtime index. Equal source
 * text is not source identity: matching is by structured Pattern reference.
 */
function resolveRuntime(
  record: ShowRecordV2,
  reference: ShowPatternRef,
  policy: string | undefined,
  instanceId: string,
  context: ShowCommandV2Context | undefined,
): ResolvedRuntimeSelection | { message: string; code: string; candidates?: string[] } {
  const effective = materializeShowGroupsV2(record)
  const matches = effective.composition.patternInstances.filter(instance => (
    instance.pattern.kind === reference.kind && instance.pattern.id === reference.id
  ))
  const selected = policy ?? 'sole'
  if (selected !== 'sole' && selected !== 'new') {
    if (!matches.some(instance => instance.id === selected)) {
      return {
        code: 'unknown-id',
        message: `instance "${selected}" is not an existing Pattern instance for this source.`,
        candidates: matches.map(instance => instance.id),
      }
    }
    return { runtime: { kind: 'existing', instanceId: selected }, patternReference: reference }
  }
  if (selected === 'sole' && matches.length === 1) {
    return { runtime: { kind: 'existing', instanceId: matches[0].id }, patternReference: reference }
  }
  if (selected === 'sole' && matches.length > 1) {
    return {
      code: 'ambiguous-instance',
      message: 'several Pattern instances exist for this source; name one explicitly in instance.',
      candidates: matches.map(instance => instance.id),
    }
  }
  if (matches.length > 0) {
    return {
      code: 'ambiguous-instance',
      message: 'a runtime already exists for this Pattern source; reuse it, or make a Clip independent afterwards.',
      candidates: matches.map(instance => instance.id),
    }
  }
  const resolver = context?.resolvePattern
  if (!resolver) {
    return { code: 'missing-dependency', message: 'creating the first runtime for a Pattern source needs trusted resolved Pattern metadata.' }
  }
  const resolved = resolver(reference)
  if (resolved.status === 'refused') return { code: 'missing-dependency', message: resolved.message }
  return {
    runtime: {
      kind: 'first',
      instance: {
        id: instanceId,
        pattern: { ...reference },
        patternName: resolved.replacement.patternName,
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
    },
    patternReference: reference,
  }
}

const DEFAULT_APPEARANCE = () => ({
  opacity: 1,
  view: { mirror: false, phase: 0, brightness: 1 },
  effects: [] as ShowClipEffect[],
})

/** Build one complete Effect from the bulk `{ kind, parameters }` vocabulary. */
export function effectFromSpec(spec: Record<string, unknown>, id: string): ShowClipEffect | { message: string } {
  const template = normalizeShowClipEffects([{ id, kind: spec.kind } as ShowClipEffect])[0]
  if (!template) return { message: `Effect kind "${String(spec.kind)}" is not a supported Clip Effect.` }
  const effect = { ...template, id } as unknown as Record<string, unknown>
  for (const [name, value] of Object.entries((spec.parameters as Record<string, unknown> | undefined) ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(effect, name) || name === 'id' || name === 'kind') {
      return { message: `Effect kind "${String(spec.kind)}" has no parameter named "${name}".` }
    }
    effect[name] = value
  }
  return effect as unknown as ShowClipEffect
}

/**
 * Create Clips from a list of ClipSpecs as one atomic candidate. Each Clip is
 * placed by the creation owner, then its initial held key and Effects are
 * authored through the appearance owner and its instance values through the
 * instance-property writer.
 */
export function createClipsFromSpecs(
  command: string,
  record: ShowRecordV2,
  specs: ReadonlyArray<Record<string, unknown>>,
  context?: ShowCommandV2Context,
): ShowCommandV2Outcome {
  const used = ownedShowIdsV2(record)
  const clipIds = freshShowIdsV2(specs.map(spec => `clip-${String(spec.zone_id)}-${String(spec.start_ms)}`), used)
  clipIds.forEach(id => used.add(id))
  const appearanceIds = freshShowIdsV2(clipIds.map(id => `${id}-appearance`), used)
  appearanceIds.forEach(id => used.add(id))
  const instanceIds = freshShowIdsV2(specs.map(spec => {
    const reference = spec.pattern as { kind: string; id: string }
    return `instance-${reference.id}`
  }), used)
  instanceIds.forEach(id => used.add(id))

  const steps: Array<{ run: (value: ShowRecordV2) => { status: 'changed' | 'unchanged' | 'refused'; record: ShowRecordV2; code?: string; message?: string; candidates?: string[] }; targetId: string }> = []
  for (const [index, spec] of specs.entries()) {
    const clipId = clipIds[index]
    const appearanceKeyId = appearanceIds[index]
    const layerId = spec.layer_id as string | undefined
    if (!layerId) return invalidArgument(record, command, 'every Clip needs an explicit layer_id.', `$[${index}].layer_id`)
    const reference = spec.pattern as ShowPatternRef
    steps.push({
      targetId: clipId,
      run: value => {
        const layer = value.composition.layers.find(candidate => candidate.id === layerId)
        if (!layer) {
          return { status: 'refused', record: value, code: 'unknown-id', message: `no Layer has id "${layerId}".` }
        }
        const selection = resolveRuntime(value, reference, spec.instance as string | undefined, instanceIds[index], context)
        if ('message' in selection) {
          return {
            status: 'refused', record: value, code: selection.code, message: selection.message,
            ...(selection.candidates ? { candidates: selection.candidates } : {}),
          }
        }
        const created = createShowClipV2(value, {
          kind: 'create-clip',
          patternReference: { ...reference },
          clip: {
            id: clipId,
            zoneId: spec.zone_id as string,
            layerId,
            startMs: spec.start_ms as number,
            durationMs: spec.duration_ms as number,
            entryPolicy: (spec.entry_policy as 'continue' | 'restart' | undefined) ?? 'continue',
            zoneSampleMode: (spec.zone_sample_mode as 'independent' | 'span' | 'repeat' | undefined) ?? 'span',
            appearance: { keys: [{ id: appearanceKeyId, timeMs: spec.start_ms as number, value: DEFAULT_APPEARANCE() }] },
          },
          runtime: selection.runtime,
        })
        return created
      },
    })
    const appearance = spec.appearance as Record<string, unknown> | undefined
    if (appearance) {
      const { effects, ...patch } = appearance
      if (Object.keys(patch).length > 0) {
        steps.push({
          targetId: clipId,
          run: value => editShowClipAppearanceV2(value, {
            clipId, scope: 'whole-clip', kind: 'appearance',
            patch: appearancePatchFromInput(patch) as never,
          }),
        })
      }
      for (const [effectIndex, rawEffect] of ((effects as Array<Record<string, unknown>> | undefined) ?? []).entries()) {
        steps.push({
          targetId: clipId,
          run: value => {
            const explicit = rawEffect.id as string | undefined
            const effectId = explicit ?? `${clipId}-effect-${effectIndex + 1}`
            const built = effectFromSpec(rawEffect, effectId)
            if ('message' in built) return { status: 'refused', record: value, code: 'invalid-argument', message: built.message }
            return editShowClipAppearanceV2(value, { clipId, scope: 'whole-clip', kind: 'add-effect', effect: built })
          },
        })
      }
    }
    const instanceProperties = spec.instance_properties as Record<string, unknown> | undefined
    if (instanceProperties) {
      steps.push({
        targetId: clipId,
        run: value => writeInstanceProperties(value, clipId, instanceProperties, context),
      })
    }
  }
  return adoptOwnerResults(command, record, steps,
    affected => `Created Clips ${describeIds(affected.clips)}.`)
}

/**
 * The command-layer entry point for the shared Pattern-instance value owner in
 * `showInstancePropertiesV2`. The editor's admission wrapper calls that owner
 * directly, so both callers write a Pattern instance exactly one way.
 */
export function writeInstanceProperties(
  record: ShowRecordV2,
  clipId: string,
  properties: Record<string, unknown>,
  context: ShowCommandV2Context | undefined,
): ShowInstancePropertiesResultV2 {
  return writeShowInstancePropertiesV2(record, clipId, properties, context)
}

export function unknownClip(record: ShowRecordV2, command: string, clipId: string): ShowCommandV2Outcome {
  return unknownIdentity(record, command, 'Clip', clipId, record.composition.clips.map(clip => clip.id))
}

export function noClipChange(record: ShowRecordV2): ShowCommandV2Outcome {
  return unchangedShowCommandV2(record)
}

export function refuseWith(record: ShowRecordV2, code: string, message: string): ShowCommandV2Outcome {
  return refuseShowCommandV2(record, { code, message })
}

export type { ShowCommandV2Descriptor }
