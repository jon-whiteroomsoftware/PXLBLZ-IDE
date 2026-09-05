// Provenance: pxlblz-v3 src/grammar/operations/junctions.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Junction (boundary Transition) operation family. A junction is the meeting
// point of two consecutive clips on a layer; junctions at Scene boundaries
// carry the Show's boundary Transitions (show.transitions), which these
// operations edit through the vendored transition-authoring layer and its
// visual-toolkit parameter catalogue. Junctions are addressed by a global
// time or by the clip they follow.
import { z } from 'zod'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { updateShowRoutingSwitch } from '@/engine/showModel'
import { updateShowBoundaryTransition } from '@/engine/showModel'
import {
  showBoundaryTransitionParameters,
  showTransitionChangesForPresentation,
  updateShowBoundaryTransitionParameter,
} from '@/engine/showTransitionAuthoring'
import { getShowToolkitFamily } from '@/engine/showVisualToolkit'
import type { ShowToolkitPresentationItem } from '@/engine/showVisualToolkitPresentation'
import {
  projectShowUnifiedTimeline,
  type ShowUnifiedTimelineJunctionProjection,
} from '@/engine/showUnifiedTimelineProjection'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue, ShowGrammarDocument } from '../types.js'
import { compositionOf, refuse, replacedShow, toEasing, type GrammarRefusal } from '../support.js'

interface JunctionSite {
  junction: ShowUnifiedTimelineJunctionProjection
  zoneName: string
}

function allJunctions(document: ShowGrammarDocument): JunctionSite[] {
  const timeline = projectShowUnifiedTimeline(document.show, compositionOf(document))
  const sites: JunctionSite[] = []
  for (const zone of timeline.zones) {
    for (const layer of zone.layers) {
      for (const junction of layer.junctions) sites.push({ junction, zoneName: zone.name })
    }
  }
  return sites
}

function describeJunction(site: JunctionSite): string {
  const { junction } = site
  return `${junction.id} (${junction.kind} after clip ${junction.leftClipId} at ${junction.startMs} ms on ${site.zoneName})`
}

export const junctionReferenceShape = {
  at_ms: z.number().optional()
    .describe('Global time on or inside the junction (alternative to after_clip_id)'),
  after_clip_id: z.string().optional()
    .describe('The clip the junction follows (alternative to at_ms)'),
}

/** Resolve one junction from a global time or the clip it follows. */
export function resolveJunction(
  document: ShowGrammarDocument,
  args: Record<string, unknown>,
): { ok: true; site: JunctionSite } | GrammarRefusal {
  const atMs = args.at_ms as number | undefined
  const afterClipId = args.after_clip_id as string | undefined
  if (atMs === undefined && afterClipId === undefined) {
    return refuse({
      code: 'invalid-argument',
      message: 'Address the junction with at_ms (a global time) or after_clip_id (the clip it follows).',
    })
  }
  const sites = allJunctions(document)
  const match = sites.find(({ junction }) =>
    afterClipId !== undefined
      ? junction.leftClipId === afterClipId
      : atMs! >= junction.startMs && atMs! <= junction.endMs,
  )
  if (match) return { ok: true, site: match }

  const nearest = [...sites]
    .sort((left, right) =>
      atMs !== undefined
        ? Math.abs(left.junction.startMs - atMs) - Math.abs(right.junction.startMs - atMs)
        : left.junction.startMs - right.junction.startMs,
    )
    .slice(0, 5)
  return refuse({
    code: 'unknown-junction',
    message:
      (afterClipId !== undefined
        ? `No junction follows clip "${afterClipId}".`
        : `No junction covers ${atMs} ms.`) +
      (nearest.length > 0
        ? ` Nearest junctions: ${nearest.map(describeJunction).join('; ')}.`
        : ' The Show has no junctions.'),
    candidates: nearest.map((site) => site.junction.id),
  })
}

/** Boundary-transition junctions only (Scene boundaries). */
function resolveBoundaryJunction(
  document: ShowGrammarDocument,
  args: Record<string, unknown>,
): { ok: true; site: JunctionSite; transitionId: string } | GrammarRefusal {
  const resolved = resolveJunction(document, args)
  if (!resolved.ok) return resolved
  const boundary = resolved.site.junction.boundaryTransition
  if (!boundary) {
    return refuse({
      code: 'missing-target',
      message:
        `Junction ${resolved.site.junction.id} is a within-Scene junction between clips; it carries no ` +
        'boundary Transition.',
      remedy: 'Use insert_layer_transition / resize_layer_transition for within-Scene junctions.',
    })
  }
  return { ok: true, site: resolved.site, transitionId: boundary.id }
}

/** kind (+ optional variant) to visual-toolkit family/variant. */
const KIND_TO_FAMILY: Record<string, { familyId: string; defaultVariant: string }> = {
  cut: { familyId: 'blend', defaultVariant: 'cut' },
  crossfade: { familyId: 'blend', defaultVariant: 'crossfade' },
  'fade-color': { familyId: 'fade', defaultVariant: 'through-color' },
  wipe: { familyId: 'wipe', defaultVariant: 'linear' },
  dither: { familyId: 'dissolve', defaultVariant: 'pixel' },
  portal: { familyId: 'shape-reveal', defaultVariant: 'circle' },
  motion: { familyId: 'motion', defaultVariant: 'cover' },
}

export function toolkitTransitionItem(
  kind: string,
  variant: string | undefined,
): { ok: true; item: ShowToolkitPresentationItem } | { ok: false; issue: GrammarIssue } {
  const mapping = KIND_TO_FAMILY[kind]
  if (!mapping) {
    return {
      ok: false,
      issue: {
        code: 'invalid-argument',
        message: `Unknown Transition kind "${kind}". Kinds: ${Object.keys(KIND_TO_FAMILY).join(', ')}.`,
      },
    }
  }
  const family = getShowToolkitFamily('transition', mapping.familyId)
  const variantId = variant ?? mapping.defaultVariant
  if (!family?.variants.some((candidate) => candidate.id === variantId)) {
    return {
      ok: false,
      issue: {
        code: 'invalid-argument',
        message:
          `"${variantId}" is not a variant of the ${kind} Transition. Variants: ${
            family?.variants.map((candidate) => candidate.id).join(', ') ?? 'none'}.`,
      },
    }
  }
  return {
    ok: true,
    item: {
      kind: 'transition',
      familyId: mapping.familyId,
      variantId,
      key: `transition:${mapping.familyId}:${variantId}`,
    } as unknown as ShowToolkitPresentationItem,
  }
}

function boundaryTransitionOf(show: ShowRecord, transitionId: string) {
  return show.transitions?.find((candidate) => candidate.id === transitionId)
}

const setJunctionTransition: ShowGrammarOperation = {
  name: 'set_junction_transition',
  description:
    'Replace the boundary Transition at a Scene-boundary junction: kind (cut, crossfade, fade-color, ' +
    'wipe, dither, portal, motion), optional variant (wipe direction, dissolve style, portal shape, ' +
    'motion move), and optional duration_ms. Family parameters reset to catalogue defaults; adjust them ' +
    'afterwards with update_junction_parameter. Address the junction by at_ms or after_clip_id.',
  mutates: ['/transitions/*', '/updatedAt'],
  inputShape: {
    ...junctionReferenceShape,
    kind: z.enum(['cut', 'crossfade', 'fade-color', 'wipe', 'dither', 'portal', 'motion']),
    variant: z.string().optional().describe('Family variant id (defaults per kind)'),
    duration_ms: z.number().optional().describe('Transition duration in milliseconds (cut is always 0)'),
  },
  apply(document, args) {
    const resolved = resolveBoundaryJunction(document, args)
    if (!resolved.ok) return resolved
    const item = toolkitTransitionItem(args.kind as string, args.variant as string | undefined)
    if (!item.ok) return refuse(item.issue)
    const changes = {
      ...showTransitionChangesForPresentation(item.item),
      ...(args.duration_ms !== undefined ? { durationMs: Math.round(args.duration_ms as number) } : {}),
    }
    const result = updateShowBoundaryTransition(document.show, resolved.transitionId, changes)
    if (result === document.show) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to change Transition ${resolved.transitionId}.`,
      })
    }
    const applied = boundaryTransitionOf(result, resolved.transitionId)
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'set_junction_transition',
        targetId: resolved.transitionId,
        description:
          `Junction ${resolved.site.junction.id} is now a ${args.kind}` +
          `${args.variant ? ` (${args.variant})` : ''} Transition of ${applied?.durationMs ?? 0} ms.`,
        details: { junctionId: resolved.site.junction.id },
      }],
    }
  },
}

const setJunctionTiming: ShowGrammarOperation = {
  name: 'set_junction_timing',
  description:
    'Set the duration and/or easing of the boundary Transition at a Scene-boundary junction, keeping its ' +
    'kind and parameters. Give at least one of duration_ms or easing. Address the junction by at_ms or ' +
    'after_clip_id.',
  mutates: ['/transitions/*/durationMs', '/transitions/*/easing', '/updatedAt'],
  inputShape: {
    ...junctionReferenceShape,
    duration_ms: z.number().optional().describe('Transition duration in milliseconds'),
    easing: z.union([
      z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']),
      z.record(z.unknown()),
    ]).optional(),
  },
  apply(document, args) {
    if (args.duration_ms === undefined && args.easing === undefined) {
      return refuse({ code: 'invalid-argument', message: 'Give at least one of duration_ms or easing.' })
    }
    const resolved = resolveBoundaryJunction(document, args)
    if (!resolved.ok) return resolved
    const changes = {
      ...(args.duration_ms !== undefined ? { durationMs: Math.round(args.duration_ms as number) } : {}),
      ...(args.easing !== undefined ? { easing: toEasing(args.easing) } : {}),
    }
    const result = updateShowBoundaryTransition(document.show, resolved.transitionId, changes)
    if (result === document.show) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to retime Transition ${resolved.transitionId}.`,
      })
    }
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'set_junction_timing',
        targetId: resolved.transitionId,
        description:
          `Transition at junction ${resolved.site.junction.id} retimed: ${
            Object.entries(changes).map(([key, value]) => `${key} ${JSON.stringify(value)}`).join(', ')}.`,
      }],
    }
  },
}

const updateJunctionParameter: ShowGrammarOperation = {
  name: 'update_junction_parameter',
  description:
    'Update one parameter of the boundary Transition at a Scene-boundary junction (for example a wipe’s ' +
    'feather, a portal’s shape scale, a fade’s color). Unknown parameters are refused naming the valid ' +
    'ones for the Transition’s kind. Address the junction by at_ms or after_clip_id.',
  mutates: ['/transitions/*', '/updatedAt'],
  inputShape: {
    ...junctionReferenceShape,
    parameter: z.string().describe('Parameter id from the Transition kind’s parameter set'),
    value: z.union([z.number(), z.boolean(), z.string()]),
  },
  apply(document, args) {
    const resolved = resolveBoundaryJunction(document, args)
    if (!resolved.ok) return resolved
    const transition = boundaryTransitionOf(document.show, resolved.transitionId)
    if (!transition) {
      return refuse({ code: 'engine-refused', message: `Transition ${resolved.transitionId} no longer exists.` })
    }
    const kindEntry = Object.entries(KIND_TO_FAMILY).find(([kind]) => kind === transition.kind)
    if (!kindEntry) {
      return refuse({
        code: 'missing-target',
        message: `Transition ${resolved.transitionId} is a ${transition.kind} marker; it has no parameters.`,
      })
    }
    const variantFromKey = ((): string => {
      if (transition.kind === 'wipe') return transition.wipeVariant ?? 'linear'
      if (transition.kind === 'dither') return transition.dissolveVariant ?? 'pixel'
      if (transition.kind === 'portal') return transition.shape ?? 'circle'
      if (transition.kind === 'motion') return transition.motionVariant ?? 'cover'
      if (transition.kind === 'fade-color') return 'through-color'
      return transition.kind
    })()
    const item = toolkitTransitionItem(transition.kind, variantFromKey)
    if (!item.ok) return refuse(item.issue)
    const parameterId = args.parameter as string
    const descriptors = showBoundaryTransitionParameters(item.item, transition)
    if (!descriptors.some((candidate) => candidate.id === parameterId)) {
      return refuse({
        code: 'unknown-parameter',
        message:
          `The ${transition.kind} Transition has no parameter "${parameterId}". Valid parameters: ${
            descriptors.map((candidate) => candidate.id).join(', ') || 'none'}.`,
        candidates: descriptors.map((candidate) => candidate.id),
      })
    }
    const result = updateShowBoundaryTransitionParameter(
      document.show,
      resolved.transitionId,
      item.item,
      parameterId,
      args.value as number | boolean | string,
    )
    if (result === document.show) {
      return refuse({
        code: 'engine-refused',
        message:
          `The engine declined to set ${parameterId} to ${JSON.stringify(args.value)} on Transition ` +
          `${resolved.transitionId}.`,
      })
    }
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'update_junction_parameter',
        targetId: resolved.transitionId,
        description:
          `Transition at junction ${resolved.site.junction.id}: ${parameterId} set to ` +
          `${JSON.stringify(args.value)}.`,
      }],
    }
  },
}

const setJunctionLayout: ShowGrammarOperation = {
  name: 'set_junction_layout',
  description:
    'Set or clear the Zone Layout change at a Scene-boundary junction: from that point on, the Show routes ' +
    'through the named Zone Layout (layout_id null removes the change). Address the junction by at_ms or ' +
    'after_clip_id.',
  mutates: ['/transitions', '/updatedAt'],
  inputShape: {
    ...junctionReferenceShape,
    layout_id: z.string().nullable().describe('Zone Layout id, or null to remove the layout change'),
  },
  apply(document, args) {
    const resolved = resolveBoundaryJunction(document, args)
    if (!resolved.ok) return resolved
    const transition = boundaryTransitionOf(document.show, resolved.transitionId)
    if (!transition) {
      return refuse({ code: 'engine-refused', message: `Transition ${resolved.transitionId} no longer exists.` })
    }
    const layoutId = args.layout_id as string | null
    if (layoutId !== null && !document.show.routingLayouts.some((layout) => layout.id === layoutId)) {
      return refuse({
        code: 'unknown-layout',
        message:
          `No Zone Layout has id "${layoutId}". Known layouts: ${
            document.show.routingLayouts.map((layout) => `${layout.id} (${layout.name})`).join('; ')}.`,
        candidates: document.show.routingLayouts.map((layout) => layout.id),
      })
    }
    const result = updateShowRoutingSwitch(document.show, transition.afterSceneId, layoutId)
    if (result === document.show) {
      return refuse({
        code: 'engine-refused',
        message: `The engine declined to change the layout at junction ${resolved.site.junction.id}.`,
      })
    }
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'set_junction_layout',
        targetId: resolved.site.junction.id,
        description:
          layoutId === null
            ? `Layout change at junction ${resolved.site.junction.id} removed.`
            : `Junction ${resolved.site.junction.id} now switches to Zone Layout ${layoutId}.`,
      }],
    }
  },
}

export const JUNCTION_OPERATIONS: ShowGrammarOperation[] = [
  setJunctionTransition,
  setJunctionTiming,
  updateJunctionParameter,
  setJunctionLayout,
]
