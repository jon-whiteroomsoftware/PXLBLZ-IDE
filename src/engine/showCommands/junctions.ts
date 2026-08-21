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
import { monotonicRecord } from './support'

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
  holdMs: { kind: 'number' },
}

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
    const alreadyKind = resolved.transition.kind === kind
      || (kind === 'cut' && resolved.transition.durationMs === 0)
    if (alreadyKind && (
      kind === 'cut'
      || input.duration_ms === undefined
      || input.duration_ms === resolved.transition.durationMs
    )) {
      return refuseShowCommand({
        code: 'no-change',
        message: `Boundary transition ${resolved.transition.id} is already ${kind === 'cut' ? 'a cut' : `a ${kind}${input.duration_ms !== undefined ? ` over ${input.duration_ms} ms` : ''}`}.`,
      })
    }
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
        record: monotonicRecord(record, result),
        changes: [{
          command: 'set_boundary_transition',
          targetId: resolved.transition.id,
          description: `Boundary after ${resolved.transition.afterSceneId} is now a cut.`,
        }],
      }
    }
    // Normalization treats a zero duration as a Cut, so switching away from
    // a Cut needs an explicit positive duration.
    const durationMs = (input.duration_ms as number | undefined) ?? resolved.transition.durationMs
    if (durationMs <= 0) {
      return refuseShowCommand({
        code: 'invalid-duration',
        message:
          `set_boundary_transition: this boundary is a cut (0 ms); give duration_ms to make it a ${kind}.`,
      })
    }
    const result = updateShowBoundaryTransition(record, resolved.transition.id, {
      kind,
      durationMs,
      // The authored crossfade default; the low-level normalizer would fall
      // back to the legacy live-live policy when the field is absent.
      ...(kind === 'crossfade' && resolved.transition.crossfadePolicy === undefined
        ? { crossfadePolicy: 'snapshot-live' as const }
        : {}),
    })
    const stored = result.transitions?.find((candidate) => candidate.id === resolved.transition.id)
    if (result === record || stored?.kind !== kind) {
      return refuseShowCommand({
        code: 'engine-refused',
        message:
          `set_boundary_transition: the engine stored ${stored?.kind ?? 'nothing'} instead of ${kind} ` +
          `for ${resolved.transition.id}.`,
      })
    }
    return {
      ok: true,
      record: monotonicRecord(record, result),
      changes: [{
        command: 'set_boundary_transition',
        targetId: resolved.transition.id,
        description:
          `Boundary after ${resolved.transition.afterSceneId} is now a ${kind} over ${stored.durationMs} ms.`,
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
    if (resolved.transition.durationMs === 0) {
      return refuseShowCommand({
        code: 'invalid-argument',
        message:
          `set_boundary_transition_timing: ${resolved.transition.id} is a cut; a cut has no duration.`,
        remedy: 'Give the boundary a kind first with set_boundary_transition.',
      })
    }
    const result = updateShowBoundaryTransition(record, resolved.transition.id, { durationMs })
    const stored = result.transitions?.find((candidate) => candidate.id === resolved.transition.id)
    if (result === record || stored?.durationMs !== durationMs) {
      return refuseShowCommand({
        code: 'engine-refused',
        message: `set_boundary_transition_timing: the engine declined to retime ${resolved.transition.id}.`,
      })
    }
    return {
      ok: true,
      record: monotonicRecord(record, result),
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
    const expected = PARAMETER_FIELDS[parameter]
    if (!expected) {
      return refuseShowCommand({
        code: 'unknown-parameter',
        message: `"${parameter}" is not a boundary transition parameter.`,
        candidates: Object.keys(PARAMETER_FIELDS),
      })
    }
    const value = input.value
    const validType = expected.kind === 'number'
      ? typeof value === 'number' && Number.isFinite(value)
      : expected.kind === 'boolean'
        ? typeof value === 'boolean'
        : expected.kind === 'string'
          ? typeof value === 'string'
          : typeof value === 'string' && expected.values.includes(value)
    if (!validType) {
      return refuseShowCommand({
        code: 'invalid-argument',
        message:
          `update_boundary_transition_parameter: "${parameter}" takes ${
            expected.kind === 'enum' ? `one of ${expected.values.join(', ')}` : `a ${expected.kind}`}.`,
      })
    }
    const previous = (resolved.transition as unknown as Record<string, unknown>)[parameter]
    if (JSON.stringify(previous) === JSON.stringify(value)) {
      return refuseShowCommand({
        code: 'no-change',
        message:
          `Boundary transition ${resolved.transition.id} already has ${parameter} = ${JSON.stringify(value)}.`,
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
    if (stored === undefined) {
      return refuseShowCommand({
        code: 'unknown-parameter',
        message:
          `"${parameter}" does not apply to a ${resolved.transition.kind} transition ` +
          '(normalization dropped the value).',
        remedy: 'Switch the kind first with set_boundary_transition, or choose a parameter of this kind.',
      })
    }
    if (JSON.stringify(stored) === JSON.stringify(previous)) {
      // The parameter applies, but normalization clamped the request back to
      // the current value - a no-change, not an inapplicable parameter.
      return refuseShowCommand({
        code: 'no-change',
        message:
          `Boundary transition ${resolved.transition.id}: ${parameter} stays ${JSON.stringify(previous)} ` +
          `(the request normalized to the current value).`,
      })
    }
    return {
      ok: true,
      record: monotonicRecord(record, result),
      changes: [{
        command: 'update_boundary_transition_parameter',
        targetId: resolved.transition.id,
        // Report what normalization stored, which may differ from the input.
        description: `Boundary transition ${resolved.transition.id}: ${parameter} is now ${JSON.stringify(stored)}.`,
      }],
    }
  },
}

export const SHOW_JUNCTION_COMMANDS: ShowCommandDescriptor[] = [
  setBoundaryTransition,
  setBoundaryTransitionTiming,
  updateBoundaryTransitionParameter,
]
