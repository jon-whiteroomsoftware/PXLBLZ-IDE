import { getShowToolkitFamily, type ShowToolkitParameterValue } from '../showVisualToolkit'
import type { ShowToolkitPresentationItem } from '../showVisualToolkitPresentation'
import { showBoundaryTransitionPresentationKey, showBoundaryTransitionParameters, showBoundaryTransitionParameterChanges, showTransitionChangesForPresentation } from '../showTransitionAuthoring'
// Junction command family: the visual Transitions on Scene boundaries,
// addressed by their stable boundary-transition ids (the ids the timeline
// and summary projections report). Edits go through the pure showModel
// mutations; a Cut is the neutral form a junction returns to.
import type { ShowBoundaryTransition, ShowRecord } from '../personalContentRecords'
import {
  removeShowBoundaryTransition,
  updateShowBoundaryTransition,
  updateShowRoutingSwitch,
} from '../showModel'
import {
  refuseShowCommand,
  type ShowCommandDescriptor,
  type ShowCommandRefusal,
} from './registry'
import { VISUAL_TRANSITION_PARAMETER_TOUCHES, monotonicRecord } from './support'
import { normalizeShowTransitionState } from '../showModel'
import { projectShowUnifiedTimeline } from '../showUnifiedTimelineProjection'
import { normalizeShowEasing } from '../showEasing'
import type { ShowTransitionEasing } from '../personalContentRecords'

const BOUNDARY_KINDS = ['cut', 'crossfade', 'fade-color', 'wipe', 'dither', 'portal', 'motion'] as const

/** Parameter fields a boundary transition may carry, with their value types. */
type ParameterSpec =
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'string' }
  | { kind: 'enum'; values: readonly string[] }
const PARAMETER_FIELDS: Record<string, ParameterSpec> = {
  direction: { kind: 'number' },
  wipeVariant: { kind: 'enum', values: ['linear', 'split', 'barn-doors', 'blinds', 'clock', 'checker', 'grid'] },
  wipeMode: { kind: 'enum', values: ['center-out', 'center-in'] },
  orientation: { kind: 'enum', values: ['horizontal', 'vertical'] },
  count: { kind: 'number' },
  phase: { kind: 'number' },
  clockwise: { kind: 'boolean' },
  edgePolicy: { kind: 'enum', values: ['hard', 'dither', 'blend'] },
  dissolveVariant: { kind: 'enum', values: ['pixel', 'block', 'coherent-noise', 'soft-threshold'] },
  seed: { kind: 'number' },
  blockSize: { kind: 'number' },
  softness: { kind: 'number' },
  feather: { kind: 'number' },
  shape: {
    kind: 'enum',
    values: [
      'circle', 'ellipse', 'box', 'rounded-box', 'diamond', 'cross', 'ring',
      'heart', 'star', 'crescent', 'polygon', 'cloud',
      'cat-head', 'cat-side-profile', 'bastet',
    ],
  },
  motionVariant: {
    kind: 'enum',
    values: ['cover', 'reveal', 'push', 'content-grow', 'content-shrink', 'zoom-in', 'zoom-out'],
  },
  color: { kind: 'string' },
  crossfadePolicy: { kind: 'enum', values: ['snapshot-live', 'live-live'] },
  featherPolicy: { kind: 'enum', values: ['dither', 'blend'] },
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
): { ok: true; item: ShowToolkitPresentationItem } | { ok: false; issue: { code: 'invalid-argument'; message: string } } {
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


const BOUNDARY_REFERENCE_FIELDS = {
  transition_id: { kind: 'string' as const, optional: true, description: 'Stable Scene Boundary transition id' },
  at_ms: { kind: 'number' as const, optional: true, description: 'Global time on the Boundary; refuses ambiguous matches across Zones or Layers' },
  after_clip_id: { kind: 'string' as const, optional: true, description: 'Clip immediately before the Boundary' },
}
const BOUNDARY_SELECTORS = ['transition_id', 'at_ms', 'after_clip_id'] as const

function resolveBoundaryTransition(
  record: ShowRecord,
  input: Record<string, unknown>,
): { ok: true; transition: ShowBoundaryTransition } | ShowCommandRefusal {
  const visual = normalizeShowTransitionState(record).transitions.filter(candidate => candidate.kind !== 'routing')
  if (input.transition_id !== undefined) {
    const matches = visual.filter(candidate => candidate.id === input.transition_id)
    if (matches.length === 1) return { ok: true, transition: matches[0] }
    return refuseShowCommand({ code: 'unknown-transition', message: `No unique Boundary transition has id "${input.transition_id}".`, candidates: visual.map(candidate => candidate.id) })
  }
  if (!record.composition) return refuseShowCommand({ code: 'missing-composition', message: 'Boundary Clip/time addressing requires a composition.' })
  const sites = projectShowUnifiedTimeline(record, record.composition).zones.flatMap(zone => zone.layers.flatMap(layer => layer.junctions.map(junction => ({ junction }))))
  const matches = sites.filter(({ junction }) => input.after_clip_id !== undefined
    ? junction.leftClipId === input.after_clip_id
    : (input.at_ms as number) >= junction.startMs && (input.at_ms as number) <= junction.endMs)
  if (matches.length > 1) return refuseShowCommand({ code: 'ambiguous-junction', message: 'The reference matches multiple Zone or Layer junctions. Use a stable transition_id or an unambiguous after_clip_id.', candidates: matches.map(({ junction }) => junction.id) })
  if (!matches.length) return refuseShowCommand({ code: 'unknown-junction', message: `No junction matches the reference. Nearest junctions: ${sites.slice(0, 5).map(({ junction }) => `${junction.id} after ${junction.leftClipId} at ${junction.startMs} ms`).join('; ')}.`, candidates: sites.slice(0, 5).map(({ junction }) => junction.id) })
  const boundary = matches[0].junction.boundaryTransition
  if (!boundary) return refuseShowCommand({ code: 'missing-target', message: 'This is a within-Scene Layer junction, not a Scene Boundary.', remedy: 'Use insert_layer_transition / resize_layer_transition for within-Scene junctions.' })
  const transition = visual.find(candidate => candidate.id === boundary.id)
  return transition ? { ok: true, transition } : refuseShowCommand({ code: 'unknown-transition', message: 'The projected Boundary no longer has an authored owner.' })
}

const setBoundaryTransition: ShowCommandDescriptor = {
  name: 'set_boundary_transition',
  description: 'Set a Boundary kind and optional duration. Same-kind requests preserve custom settings; an explicit variant selects its presentation defaults. Cut resets visual parameters. Select exactly one stable Boundary id, time, or preceding Clip.',
  touches: [...VISUAL_TRANSITION_PARAMETER_TOUCHES, '/transitions/*/easing', '/updatedAt'],
  exactlyOne: BOUNDARY_SELECTORS,
  fields: {
    ...BOUNDARY_REFERENCE_FIELDS,
    kind: { kind: 'string', enum: BOUNDARY_KINDS, description: 'The new transition kind' },
    variant: { kind: 'string', optional: true, description: 'Explicit toolkit variant; selects its defaults even for the current kind' },
    duration_ms: { kind: 'number', optional: true, description: 'Duration in milliseconds, rounded with Math.round' },
  },
  apply(record, input) {
    const resolved = resolveBoundaryTransition(record, input)
    if (!resolved.ok) return resolved
    const current = resolved.transition
    const kind = input.kind as ShowBoundaryTransition['kind']
    const variant = input.variant as string | undefined
    const item = toolkitTransitionItem(kind, variant)
    if (!item.ok) return refuseShowCommand(item.issue)
    const requestedDuration = input.duration_ms === undefined ? undefined : Math.round(input.duration_ms as number)
    if (requestedDuration !== undefined && (requestedDuration < 0 || (kind !== 'cut' && requestedDuration === 0))) return refuseShowCommand({ code: 'invalid-duration', message: 'Visual Boundary duration must round to positive milliseconds; Cut duration cannot be negative.' })
    if (kind === 'cut') {
      if (current.kind === 'cut') return { ok: true, record, changes: [] }
      const result = removeShowBoundaryTransition(record, current.id)
      if (result === record) return refuseShowCommand({ code: 'engine-refused', message: 'The Boundary owner declined the Cut reset.' })
      return { ok: true, record: monotonicRecord(record, result), changes: [{ command: 'set_boundary_transition', targetId: current.id, description: `Boundary after ${current.afterSceneId} is now a cut.` }] }
    }
    const defaults = variant === undefined ? {} : showTransitionChangesForPresentation(item.item)
    const durationMs = requestedDuration ?? defaults.durationMs ?? current.durationMs
    if (durationMs <= 0) return refuseShowCommand({ code: 'invalid-duration', message: `This Boundary is a Cut; give duration_ms or an explicit variant to make it a ${kind}.` })
    if (variant === undefined && current.kind === kind && current.durationMs === durationMs) return { ok: true, record, changes: [] }
    const result = updateShowBoundaryTransition(record, current.id, {
      ...defaults,
      kind,
      durationMs,
      ...(kind === 'crossfade' && current.crossfadePolicy === undefined && variant === undefined ? { crossfadePolicy: 'snapshot-live' as const } : {}),
    })
    const stored = result.transitions.find(candidate => candidate.id === current.id)
    if (result === record || stored?.kind !== kind || stored.durationMs !== durationMs) return refuseShowCommand({ code: 'engine-refused', message: `The Boundary owner declined the requested ${kind} over ${durationMs} ms.` })
    if (JSON.stringify(stored) === JSON.stringify(current)) return { ok: true, record, changes: [] }
    return { ok: true, record: monotonicRecord(record, result), changes: [{ command: 'set_boundary_transition', targetId: current.id, description: `Boundary after ${current.afterSceneId} is now a ${kind} over ${stored.durationMs} ms.` }] }
  },
}

const setBoundaryTransitionTiming: ShowCommandDescriptor = {
  name: 'set_boundary_transition_timing',
  description: 'Set Boundary duration and/or easing, preserving kind and visual parameters. Duration rounds to positive milliseconds; use set_boundary_transition with kind cut for a reset.',
  touches: ['/transitions/*/durationMs', '/transitions/*/easing', '/transitions/*/propertyTransitions', '/updatedAt'],
  exactlyOne: BOUNDARY_SELECTORS,
  fields: {
    ...BOUNDARY_REFERENCE_FIELDS,
    duration_ms: { kind: 'number', optional: true, description: 'Positive duration in milliseconds, rounded with Math.round' },
    easing: { kind: 'easing', optional: true, description: 'Preset or structured easing curve' },
  },
  apply(record, input) {
    const resolved = resolveBoundaryTransition(record, input)
    if (!resolved.ok) return resolved
    if (input.duration_ms === undefined && input.easing === undefined) return refuseShowCommand({ code: 'invalid-argument', message: 'Give duration_ms and/or easing.' })
    const durationMs = input.duration_ms === undefined ? undefined : Math.round(input.duration_ms as number)
    if (durationMs !== undefined && durationMs <= 0) return refuseShowCommand({ code: 'invalid-duration', message: 'Boundary duration must round to positive milliseconds.', remedy: 'Use set_boundary_transition with kind cut to reset.' })
    if (durationMs !== undefined && resolved.transition.durationMs === 0) return refuseShowCommand({ code: 'invalid-argument', message: 'Give the Cut a visual kind before setting its duration.' })
    const easing = input.easing === undefined ? undefined : normalizeShowEasing(input.easing as ShowTransitionEasing)
    if ((durationMs === undefined || durationMs === resolved.transition.durationMs)
      && (easing === undefined || JSON.stringify(easing) === JSON.stringify(resolved.transition.easing))) return { ok: true, record, changes: [] }
    const result = updateShowBoundaryTransition(record, resolved.transition.id, {
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(easing === undefined ? {} : { easing }),
    })
    const stored = result.transitions?.find(candidate => candidate.id === resolved.transition.id)
    if (result === record || (durationMs !== undefined && stored?.durationMs !== durationMs)) return refuseShowCommand({ code: 'engine-refused', message: 'The engine declined the requested Boundary timing.' })
    return { ok: true, record: monotonicRecord(record, result), changes: [{ command: 'set_boundary_transition_timing', targetId: resolved.transition.id, description: `Boundary ${resolved.transition.id} now runs ${stored!.durationMs} ms with ${JSON.stringify(stored!.easing)}.` }] }
  },
}

const updateBoundaryTransitionParameter: ShowCommandDescriptor = {
  name: 'update_boundary_transition_parameter',
  description: 'Set a typed Boundary presentation or persisted variant parameter. Unknown or wrong-kind parameters refuse; normalized values are reported and an already-satisfied valid value is a no-op.',
  touches: [...VISUAL_TRANSITION_PARAMETER_TOUCHES, '/transitions/*/easing', '/updatedAt'],
  exactlyOne: BOUNDARY_SELECTORS,
  fields: {
    ...BOUNDARY_REFERENCE_FIELDS,
    parameter: { kind: 'string', description: 'Finite Transition parameter id, including presentation easing' },
    value: { kind: 'json', description: 'Number, boolean or option/color string according to the parameter' },
  },
  apply(record, input) {
    const resolved = resolveBoundaryTransition(record, input)
    if (!resolved.ok) return resolved
    const transition = resolved.transition
    const parameter = input.parameter as string
    const key = showBoundaryTransitionPresentationKey(transition)
    const [, familyId, variantId] = key.split(':')
    const item = { kind: 'transition' as const, key, familyId, variantId } as ShowToolkitPresentationItem
    const descriptor = showBoundaryTransitionParameters(item, transition).find(candidate => candidate.id === parameter)
    const expected = PARAMETER_FIELDS[parameter]
    if (!descriptor && !expected) return refuseShowCommand({ code: 'unknown-parameter', message: `"${parameter}" is not a parameter of this Boundary.`, candidates: showBoundaryTransitionParameters(item, transition).map(candidate => candidate.id) })
    const value = input.value
    const validType = descriptor
      ? descriptor.kind === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : descriptor.kind === 'boolean' ? typeof value === 'boolean'
          : descriptor.kind === 'color' ? typeof value === 'string'
            : typeof value === 'string' && (descriptor.kind === 'easing' ? descriptor.easingOptions?.some(option => option.id === value) : descriptor.options?.some(option => option.value === value))
      : expected.kind === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : expected.kind === 'boolean' ? typeof value === 'boolean'
          : expected.kind === 'string' ? typeof value === 'string'
            : typeof value === 'string' && expected.values.includes(value)
    if (!validType) return refuseShowCommand({ code: 'invalid-argument', message: `Invalid type or option for Boundary parameter "${parameter}".` })
    const changes = descriptor
      ? showBoundaryTransitionParameterChanges(transition, item, parameter, value as ShowToolkitParameterValue)!
      : { [parameter]: value }
    const result = updateShowBoundaryTransition(record, transition.id, changes as Partial<ShowBoundaryTransition>)
    const stored = result.transitions?.find(candidate => candidate.id === transition.id) as unknown as Record<string, unknown> | undefined
    if (result === record || stored?.[parameter] === undefined) return refuseShowCommand({ code: 'unknown-parameter', message: `"${parameter}" does not apply to a ${transition.kind} transition.`, remedy: 'Switch the kind first with set_boundary_transition.' })
    if (JSON.stringify(stored[parameter]) === JSON.stringify((transition as unknown as Record<string, unknown>)[parameter])) return { ok: true, record, changes: [] }
    return { ok: true, record: monotonicRecord(record, result), changes: [{ command: 'update_boundary_transition_parameter', targetId: transition.id, description: `Boundary ${transition.id}: ${parameter} is now ${JSON.stringify(stored[parameter])}.` }] }
  },
}

const setBoundaryLayout: ShowCommandDescriptor = {
  name: 'set_boundary_layout',
  description: 'Agent-only exact setter: set or clear the Layout switch at a Scene Boundary without editing the Layout definition or visual Transition.',
  touches: ['/transitions', '/updatedAt'],
  exactlyOne: BOUNDARY_SELECTORS,
  fields: { ...BOUNDARY_REFERENCE_FIELDS, layout_id: { kind: 'string', nullable: true, description: 'Existing Layout id, or null to clear the switch' } },
  apply(record, input) {
    const resolved = resolveBoundaryTransition(record, input)
    if (!resolved.ok) return resolved
    const layoutId = input.layout_id as string | null
    if (layoutId !== null && !record.routingLayouts.some(layout => layout.id === layoutId)) return refuseShowCommand({ code: 'unknown-layout', message: `No Layout has id "${layoutId}".`, candidates: record.routingLayouts.map(layout => layout.id) })
    const current = record.transitions.filter(transition => transition.kind === 'routing' && transition.afterSceneId === resolved.transition.afterSceneId)
    if (current.length > 1) return refuseShowCommand({ code: 'ambiguous-junction', message: 'Multiple routing switches occupy this Boundary.' })
    if ((current[0]?.layoutId ?? null) === layoutId) return { ok: true, record, changes: [] }
    const result = updateShowRoutingSwitch(record, resolved.transition.afterSceneId, layoutId)
    if (result === record) return refuseShowCommand({ code: 'engine-refused', message: 'The routing owner declined the Boundary Layout change.' })
    return { ok: true, record: monotonicRecord(record, result), changes: [{ command: 'set_boundary_layout', targetId: resolved.transition.id, description: layoutId === null ? 'Cleared the Boundary Layout switch.' : `Boundary now switches to Layout ${layoutId}.`, details: { afterSceneId: resolved.transition.afterSceneId, routingTransitionId: current[0]?.id ?? `routing-${resolved.transition.afterSceneId}` } }] }
  },
}

export const SHOW_JUNCTION_COMMANDS: ShowCommandDescriptor[] = [
  setBoundaryTransition,
  setBoundaryTransitionTiming,
  updateBoundaryTransitionParameter,
  setBoundaryLayout,
]
