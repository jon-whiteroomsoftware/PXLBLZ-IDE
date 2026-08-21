// Junction command family: the visual Transitions on Scene boundaries,
// addressed by their stable boundary-transition ids (the ids the timeline
// and summary projections report). Edits go through the pure showModel
// mutations; a Cut is the neutral form a junction returns to.
import type { ShowBoundaryTransition, ShowRecord } from '../personalContentRecords'
import {
  removeShowBoundaryTransition,
  updateShowBoundaryTransition,
} from '../showModel'
import {
  refuseShowCommand,
  type ShowCommandDescriptor,
  type ShowCommandRefusal,
} from './registry'

const BOUNDARY_KINDS = ['cut', 'crossfade', 'fade-color', 'wipe', 'dither', 'portal', 'motion'] as const

/** Numeric and boolean parameter fields a boundary transition may carry. */
const PARAMETER_FIELDS = new Set([
  'direction', 'wipeVariant', 'wipeMode', 'orientation', 'count', 'phase', 'clockwise',
  'edgePolicy', 'dissolveVariant', 'seed', 'blockSize', 'softness', 'feather',
  'shape', 'motionVariant', 'color', 'crossfadePolicy', 'featherPolicy', 'holdMs',
])

function resolveBoundaryTransition(
  record: ShowRecord,
  transitionId: string,
): { ok: true; transition: ShowBoundaryTransition } | ShowCommandRefusal {
  const visual = (record.transitions ?? []).filter((candidate) => candidate.kind !== 'routing')
  const transition = visual.find((candidate) => candidate.id === transitionId)
  if (!transition) {
    return refuseShowCommand({
      code: 'unknown-transition',
      message:
        visual.length === 0
          ? `No boundary transition has id "${transitionId}"; this Show's Scene boundaries are all cuts.`
          : `No boundary transition has id "${transitionId}". Boundary transitions: ${
              visual.map((candidate) => `${candidate.id} (${candidate.kind} after ${candidate.afterSceneId})`).join('; ')}.`,
      candidates: visual.map((candidate) => candidate.id),
    })
  }
  return { ok: true, transition }
}

const setBoundaryTransition: ShowCommandDescriptor = {
  name: 'set_boundary_transition',
  description:
    'Change a Scene-boundary transition\'s kind (crossfade, fade-color, wipe, dither, portal, motion, ' +
    'or cut) and optionally its duration. Switching kinds fills that kind\'s parameter defaults; ' +
    'setting cut removes the visual transition. Addressed by the boundary transition id the timeline ' +
    'reports.',
  touches: ['/transitions', '/updatedAt'],
  fields: {
    transition_id: { kind: 'string', description: 'The boundary transition id' },
    kind: { kind: 'string', enum: BOUNDARY_KINDS, description: 'The new transition kind' },
    duration_ms: { kind: 'integer', optional: true, description: 'Transition duration in milliseconds' },
  },
  apply(record, input) {
    const resolved = resolveBoundaryTransition(record, input.transition_id as string)
    if (!resolved.ok) return resolved
    const kind = input.kind as ShowBoundaryTransition['kind']
    if (kind === 'cut') {
      const result = removeShowBoundaryTransition(record, resolved.transition.id)
      if (result === record) {
        return refuseShowCommand({
          code: 'no-change',
          message: `Boundary transition ${resolved.transition.id} could not return to a cut.`,
        })
      }
      return {
        ok: true,
        record: result,
        changes: [{
          command: 'set_boundary_transition',
          targetId: resolved.transition.id,
          description: `Boundary after ${resolved.transition.afterSceneId} is now a cut.`,
        }],
      }
    }
    const result = updateShowBoundaryTransition(record, resolved.transition.id, {
      kind,
      ...(input.duration_ms !== undefined ? { durationMs: input.duration_ms as number } : {}),
    })
    if (result === record) {
      return refuseShowCommand({
        code: 'engine-refused',
        message: `set_boundary_transition: the engine declined to change ${resolved.transition.id}.`,
      })
    }
    return {
      ok: true,
      record: result,
      changes: [{
        command: 'set_boundary_transition',
        targetId: resolved.transition.id,
        description:
          `Boundary after ${resolved.transition.afterSceneId} is now a ${kind}` +
          `${input.duration_ms !== undefined ? ` over ${input.duration_ms} ms` : ''}.`,
      }],
    }
  },
}

const setBoundaryTransitionTiming: ShowCommandDescriptor = {
  name: 'set_boundary_transition_timing',
  description:
    'Set a Scene-boundary transition\'s duration without changing its kind or parameters. The engine ' +
    'normalizes the surrounding Scene timing; a zero or negative duration refuses (use ' +
    'set_boundary_transition with kind cut to remove one).',
  touches: ['/transitions', '/updatedAt'],
  fields: {
    transition_id: { kind: 'string', description: 'The boundary transition id' },
    duration_ms: { kind: 'integer', description: 'New duration in milliseconds (positive)' },
  },
  apply(record, input) {
    const resolved = resolveBoundaryTransition(record, input.transition_id as string)
    if (!resolved.ok) return resolved
    const durationMs = input.duration_ms as number
    if (durationMs <= 0) {
      return refuseShowCommand({
        code: 'invalid-duration',
        message: 'set_boundary_transition_timing: the duration must be positive.',
        remedy: 'Use set_boundary_transition with kind "cut" to remove the transition.',
      })
    }
    if (durationMs === resolved.transition.durationMs) {
      return refuseShowCommand({
        code: 'no-change',
        message: `Boundary transition ${resolved.transition.id} already runs ${durationMs} ms.`,
      })
    }
    const result = updateShowBoundaryTransition(record, resolved.transition.id, { durationMs })
    if (result === record) {
      return refuseShowCommand({
        code: 'engine-refused',
        message: `set_boundary_transition_timing: the engine declined to retime ${resolved.transition.id}.`,
      })
    }
    return {
      ok: true,
      record: result,
      changes: [{
        command: 'set_boundary_transition_timing',
        targetId: resolved.transition.id,
        description: `Boundary transition ${resolved.transition.id} now runs ${durationMs} ms.`,
      }],
    }
  },
}

const updateBoundaryTransitionParameter: ShowCommandDescriptor = {
  name: 'update_boundary_transition_parameter',
  description:
    'Set one parameter field on a Scene-boundary transition (for example feather, softness, direction, ' +
    'count, seed, or wipeVariant). The engine normalizes the result; parameters outside the ' +
    'transition\'s kind are dropped by normalization rather than stored.',
  touches: ['/transitions', '/updatedAt'],
  fields: {
    transition_id: { kind: 'string', description: 'The boundary transition id' },
    parameter: { kind: 'string', description: 'The parameter field name (for example feather)' },
    value: { kind: 'json', description: 'The new value; number, boolean, or variant string by parameter' },
  },
  apply(record, input) {
    const resolved = resolveBoundaryTransition(record, input.transition_id as string)
    if (!resolved.ok) return resolved
    const parameter = input.parameter as string
    if (!PARAMETER_FIELDS.has(parameter)) {
      return refuseShowCommand({
        code: 'unknown-parameter',
        message: `"${parameter}" is not a boundary transition parameter.`,
        candidates: [...PARAMETER_FIELDS],
      })
    }
    const result = updateShowBoundaryTransition(record, resolved.transition.id, {
      [parameter]: input.value,
    } as Partial<ShowBoundaryTransition>)
    if (result === record) {
      return refuseShowCommand({
        code: 'engine-refused',
        message: `update_boundary_transition_parameter: the engine declined the change to ${resolved.transition.id}.`,
      })
    }
    const stored = (result.transitions?.find((candidate) => candidate.id === resolved.transition.id) as
      | Record<string, unknown>
      | undefined)?.[parameter]
    if (stored === undefined || JSON.stringify(stored) === JSON.stringify(
      (resolved.transition as unknown as Record<string, unknown>)[parameter],
    )) {
      return refuseShowCommand({
        code: 'unknown-parameter',
        message:
          `"${parameter}" does not apply to a ${resolved.transition.kind} transition ` +
          '(normalization dropped or kept the previous value).',
        remedy: 'Switch the kind first with set_boundary_transition, or choose a parameter of this kind.',
      })
    }
    return {
      ok: true,
      record: result,
      changes: [{
        command: 'update_boundary_transition_parameter',
        targetId: resolved.transition.id,
        description: `Boundary transition ${resolved.transition.id}: ${parameter} is now ${JSON.stringify(input.value)}.`,
      }],
    }
  },
}

export const SHOW_JUNCTION_COMMANDS: ShowCommandDescriptor[] = [
  setBoundaryTransition,
  setBoundaryTransitionTiming,
  updateBoundaryTransitionParameter,
]
