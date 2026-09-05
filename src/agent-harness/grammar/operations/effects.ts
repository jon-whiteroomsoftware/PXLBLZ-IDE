// Provenance: pxlblz-v3 src/grammar/operations/effects.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Effect-stack operation family. Effects live on a clip's placement as an
// ordered stack partitioned into pipeline stages (address, transform,
// distort, color-output); parameter names come from the vendored visual
// toolkit and updates are validated against the Effect kind's parameter set.
// The Trails output Effect is inline-only in the v2 editor (no engine
// function) and stays out of this family; see the registry reference.
import { z } from 'zod'
import type { ShowClipEffect } from '@/engine/personalContentRecords'
import {
  duplicateShowClipEffect,
  moveShowClipEffectToStagePosition,
  moveShowClipEffectWithinStage,
  nextShowEffectId,
  showClipEffectParameters,
  showClipEffectStage,
  updateShowClipEffectParameter,
} from '@/engine/showEffectAuthoring'
import { normalizeShowClipEffects } from '@/engine/showEffects'
import { updateShowClipInspector } from '@/engine/showClipInspectorModel'
import type { ShowUnifiedTimelineClipProjection } from '@/engine/showUnifiedTimelineProjection'
import type { GrammarOperationResult, ShowGrammarOperation } from '../registry.js'
import type { ShowGrammarDocument } from '../types.js'
import {
  compositionOf,
  refuse,
  replacedShow,
  resolveClip,
  type GrammarRefusal,
} from '../support.js'

export const SHOW_CLIP_EFFECT_KINDS = [
  'opacity', 'brightness', 'hue', 'saturation', 'contrast', 'invert', 'threshold',
  'luma-key', 'chroma-key', 'posterize', 'vignette', 'color-map',
  'translate', 'rotate', 'scale', 'shear',
  'ripple', 'swirl', 'bulge', 'pixelate', 'kaleidoscope', 'wrap',
] as const

interface EffectSite {
  clip: ShowUnifiedTimelineClipProjection
  effects: ShowClipEffect[]
}

function resolveEffectSite(
  document: ShowGrammarDocument,
  clipId: string,
): { ok: true; site: EffectSite } | GrammarRefusal {
  const resolved = resolveClip(document, clipId)
  if (!resolved.ok) return resolved
  const { clip } = resolved.context
  if (clip.startSceneId !== clip.endSceneId) {
    return refuse({
      code: 'multi-segment-clip',
      message:
        `Clip ${clip.id} spans Scenes ${clip.startSceneId}–${clip.endSceneId}; Effect stacks are ` +
        'placement-owned and this operation edits one placement.',
      remedy: 'Target a clip that lies inside one Scene.',
    })
  }
  const scene = compositionOf(document).scenes.find((candidate) => candidate.sceneId === clip.sceneId)
  const zone = scene?.zones.find((candidate) => candidate.zoneId === clip.zoneId)
  const placement = clip.kind === 'main'
    ? zone?.main.find((candidate) => candidate.id === clip.startPlacementId)
    : zone?.overlays.find((layer) => layer.id === clip.layerId)?.placements
        .find((candidate) => candidate.id === clip.startPlacementId)
  return { ok: true, site: { clip, effects: normalizeShowClipEffects(placement?.effects ?? []) } }
}

function findEffect(
  site: EffectSite,
  effectId: string,
): { ok: true; effect: ShowClipEffect } | GrammarRefusal {
  const effect = site.effects.find((candidate) => candidate.id === effectId)
  if (!effect) {
    return refuse({
      code: 'unknown-effect',
      message:
        site.effects.length === 0
          ? `Clip ${site.clip.id} has no Effects yet; add one with add_clip_effect.`
          : `Clip ${site.clip.id} has no Effect "${effectId}". Its stack: ${
              site.effects
                .map((candidate) => `${candidate.id} (${candidate.kind}, ${showClipEffectStage(candidate)} stage)`)
                .join('; ')}.`,
      candidates: site.effects.map((candidate) => candidate.id),
    })
  }
  return { ok: true, effect }
}

/** Write the new stack back through the vendored clip-inspector patch. */
function commitEffects(
  operationName: string,
  document: ShowGrammarDocument,
  site: EffectSite,
  effects: ShowClipEffect[],
  targetId: string,
  description: string,
  details?: Record<string, unknown>,
): GrammarOperationResult {
  const { clip } = site
  const owner = clip.kind === 'main'
    ? { kind: 'scene-main' as const, sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.startPlacementId }
    : {
        kind: 'scene-overlay' as const,
        sceneId: clip.sceneId,
        zoneId: clip.zoneId,
        layerId: clip.layerId ?? '',
        placementId: clip.startPlacementId,
      }
  const result = updateShowClipInspector(document.show, owner, { effects })
  if (result === document.show) {
    return refuse({
      code: 'engine-refused',
      message: `The engine declined to update the Effect stack of clip ${clip.id}.`,
    })
  }
  return {
    ok: true,
    document: replacedShow(document, result),
    changes: [{ op: operationName, targetId, description, ...(details ? { details } : {}) }],
  }
}

/** Apply agent-supplied parameter values, validating each name and value. */
function applyParameters(
  effect: ShowClipEffect,
  parameters: Record<string, unknown> | undefined,
): { ok: true; effect: ShowClipEffect } | GrammarRefusal {
  let current = effect
  for (const [parameterId, value] of Object.entries(parameters ?? {})) {
    const descriptors = showClipEffectParameters(current)
    if (!descriptors.some((candidate) => candidate.id === parameterId)) {
      return refuse({
        code: 'unknown-parameter',
        message:
          `The ${current.kind} Effect has no parameter "${parameterId}". Valid parameters: ${
            descriptors.map((candidate) => candidate.id).join(', ') || 'none'}.`,
        candidates: descriptors.map((candidate) => candidate.id),
      })
    }
    const next = updateShowClipEffectParameter(current, parameterId, value as number | string | boolean)
    if (next === current) {
      return refuse({
        code: 'invalid-argument',
        message: `${JSON.stringify(value)} is not a valid value for ${current.kind}.${parameterId}.`,
      })
    }
    current = next
  }
  return { ok: true, effect: current }
}

const addClipEffect: ShowGrammarOperation = {
  name: 'add_clip_effect',
  description:
    'Add an Effect to a clip’s ordered stack. The kind places it in its pipeline stage (affine transforms, ' +
    'distortions, color/output); parameters default to the catalogue values and can be set inline via the ' +
    'parameters object (unknown names are refused listing the valid ones). The mirror toggle is not a ' +
    'stack Effect — use set_clip_view.',
  mutates: [
    '/composition/scenes/*/zones/*/main/*/effects',
    '/composition/scenes/*/zones/*/overlays/*/placements/*/effects',
    '/updatedAt',
  ],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    kind: z.enum(SHOW_CLIP_EFFECT_KINDS),
    parameters: z.record(z.union([z.number(), z.boolean(), z.string()])).optional()
      .describe('Initial parameter values by parameter id (defaults from the catalogue)'),
  },
  apply(document, args) {
    const resolved = resolveEffectSite(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const site = resolved.site
    const kind = args.kind as ShowClipEffect['kind']
    const initial = normalizeShowClipEffects([
      { id: nextShowEffectId(site.effects, kind), kind } as ShowClipEffect,
    ])[0]
    if (!initial) {
      return refuse({ code: 'invalid-argument', message: `Unsupported Effect kind "${kind}".` })
    }
    const parameterized = applyParameters(initial, args.parameters as Record<string, unknown> | undefined)
    if (!parameterized.ok) return parameterized
    const effect = parameterized.effect
    return commitEffects(
      'add_clip_effect',
      document,
      site,
      [...site.effects, effect],
      effect.id,
      `${kind} Effect ${effect.id} added to clip ${site.clip.id} (${showClipEffectStage(effect)} stage).`,
      { stage: showClipEffectStage(effect) },
    )
  },
}

const updateClipEffect: ShowGrammarOperation = {
  name: 'update_clip_effect',
  description:
    'Update one parameter of an Effect on a clip’s stack. Unknown parameters are refused naming the valid ' +
    'ones for the Effect’s kind.',
  mutates: [
    '/composition/scenes/*/zones/*/main/*/effects/*',
    '/composition/scenes/*/zones/*/overlays/*/placements/*/effects/*',
    '/updatedAt',
  ],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    effect_id: z.string().describe('Effect id from the clip’s stack'),
    parameter: z.string().describe('Parameter id from the Effect kind’s parameter set'),
    value: z.union([z.number(), z.boolean(), z.string()]),
  },
  apply(document, args) {
    const resolved = resolveEffectSite(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const site = resolved.site
    const found = findEffect(site, args.effect_id as string)
    if (!found.ok) return found
    const parameterized = applyParameters(found.effect, { [args.parameter as string]: args.value })
    if (!parameterized.ok) return parameterized
    return commitEffects(
      'update_clip_effect',
      document,
      site,
      site.effects.map((candidate) => (candidate.id === found.effect.id ? parameterized.effect : candidate)),
      found.effect.id,
      `Effect ${found.effect.id} (${found.effect.kind}) on clip ${site.clip.id}: ` +
        `${args.parameter} set to ${JSON.stringify(args.value)}.`,
    )
  },
}

const duplicateClipEffect: ShowGrammarOperation = {
  name: 'duplicate_clip_effect',
  description:
    'Duplicate an Effect immediately after itself in its stage of the clip’s stack, copying its parameters.',
  mutates: [
    '/composition/scenes/*/zones/*/main/*/effects',
    '/composition/scenes/*/zones/*/overlays/*/placements/*/effects',
    '/updatedAt',
  ],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    effect_id: z.string().describe('Effect id from the clip’s stack'),
  },
  apply(document, args) {
    const resolved = resolveEffectSite(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const site = resolved.site
    const found = findEffect(site, args.effect_id as string)
    if (!found.ok) return found
    const next = duplicateShowClipEffect(site.effects, found.effect.id)
    const copy = next.find((candidate) => !site.effects.some((existing) => existing.id === candidate.id))
    if (!copy) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to duplicate Effect ${found.effect.id}.`,
      })
    }
    return commitEffects(
      'duplicate_clip_effect',
      document,
      site,
      next,
      copy.id,
      `Effect ${found.effect.id} (${found.effect.kind}) duplicated as ${copy.id} on clip ${site.clip.id}.`,
    )
  },
}

const moveClipEffect: ShowGrammarOperation = {
  name: 'move_clip_effect',
  description:
    'Reorder an Effect within its pipeline stage: one step with direction ("earlier"/"later"), or next to ' +
    'another Effect of the same stage with target_effect_id and edge. Order matters — affine and ' +
    'distortion Effects compose in stack order. Effects cannot leave their stage.',
  mutates: [
    '/composition/scenes/*/zones/*/main/*/effects',
    '/composition/scenes/*/zones/*/overlays/*/placements/*/effects',
    '/updatedAt',
  ],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    effect_id: z.string().describe('Effect id from the clip’s stack'),
    direction: z.enum(['earlier', 'later']).optional()
      .describe('Move one step within the stage (alternative to target_effect_id)'),
    target_effect_id: z.string().optional()
      .describe('Place next to this same-stage Effect (alternative to direction)'),
    edge: z.enum(['before', 'after']).optional().describe('Which side of target_effect_id (default after)'),
  },
  apply(document, args) {
    const resolved = resolveEffectSite(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const site = resolved.site
    const found = findEffect(site, args.effect_id as string)
    if (!found.ok) return found
    const direction = args.direction as 'earlier' | 'later' | undefined
    const targetEffectId = args.target_effect_id as string | undefined
    if ((direction === undefined) === (targetEffectId === undefined)) {
      return refuse({
        code: 'invalid-argument',
        message: 'Give exactly one of direction or target_effect_id.',
      })
    }
    let next: ShowClipEffect[]
    if (direction !== undefined) {
      next = moveShowClipEffectWithinStage(site.effects, found.effect.id, direction === 'earlier' ? -1 : 1)
    } else {
      const target = findEffect(site, targetEffectId!)
      if (!target.ok) return target
      if (showClipEffectStage(target.effect) !== showClipEffectStage(found.effect)) {
        return refuse({
          code: 'invalid-argument',
          message:
            `Effect ${found.effect.id} is in the ${showClipEffectStage(found.effect)} stage and ` +
            `${target.effect.id} is in the ${showClipEffectStage(target.effect)} stage; Effects cannot ` +
            'leave their stage.',
        })
      }
      next = moveShowClipEffectToStagePosition(
        site.effects,
        found.effect.id,
        targetEffectId!,
        (args.edge as 'before' | 'after' | undefined) ?? 'after',
      )
    }
    if (next.every((candidate, index) => candidate.id === site.effects[index]?.id)) {
      return refuse({
        code: 'no-change',
        message:
          `Effect ${found.effect.id} is already at that position in its ` +
          `${showClipEffectStage(found.effect)} stage.`,
      })
    }
    return commitEffects(
      'move_clip_effect',
      document,
      site,
      next,
      found.effect.id,
      `Effect ${found.effect.id} (${found.effect.kind}) reordered within the ` +
        `${showClipEffectStage(found.effect)} stage of clip ${site.clip.id}.`,
    )
  },
}

const removeClipEffect: ShowGrammarOperation = {
  name: 'remove_clip_effect',
  description: 'Remove one Effect from a clip’s stack; the rest of the stack keeps its order.',
  mutates: [
    '/composition/scenes/*/zones/*/main/*/effects',
    '/composition/scenes/*/zones/*/overlays/*/placements/*/effects',
    '/updatedAt',
  ],
  inputShape: {
    clip_id: z.string().describe('Clip id from the open_show listing'),
    effect_id: z.string().describe('Effect id from the clip’s stack'),
  },
  apply(document, args) {
    const resolved = resolveEffectSite(document, args.clip_id as string)
    if (!resolved.ok) return resolved
    const site = resolved.site
    const found = findEffect(site, args.effect_id as string)
    if (!found.ok) return found
    return commitEffects(
      'remove_clip_effect',
      document,
      site,
      site.effects.filter((candidate) => candidate.id !== found.effect.id),
      found.effect.id,
      `Effect ${found.effect.id} (${found.effect.kind}) removed from clip ${site.clip.id}.`,
    )
  },
}

export const EFFECT_OPERATIONS: ShowGrammarOperation[] = [
  addClipEffect,
  updateClipEffect,
  duplicateClipEffect,
  moveClipEffect,
  removeClipEffect,
]
