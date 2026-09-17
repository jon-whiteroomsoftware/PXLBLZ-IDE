// Transition commands over the v2 Transition owner. A Cut is the absence of a
// Transition at exact adjacency, so a derived Cut junction is addressed by its
// (from_clip_id, to_clip_id) pair and removal is `remove_transition`.
import type { ShowStructuredEasing, ShowTransitionKind } from '../personalContentRecords'
import type { ShowRecordV2, ShowTransitionV2 } from '../showCompositionV2'
import { editShowTransitionV2, projectShowTransitionJunctionsV2 } from '../showTransitionsV2'
import { normalizeShowEasing } from '../showEasing'
import {
  refuseShowCommandV2,
  type ShowCommandV2Descriptor,
  type ShowCommandV2Field,
} from './registry'
import {
  EASING_FIELD,
  TRANSITION_KIND_VALUES,
  adoptOwnerResult,
  describeIds,
  durationField,
  idField,
  invalidArgument,
  unknownIdentity,
} from './support'

const PARAMETERS_FIELD: ShowCommandV2Field = {
  kind: 'record',
  optional: true,
  description: 'Kind-specific parameters; see the authoring reference.',
  values: {
    kind: 'union',
    description: 'A number, a boolean, or a CSS color string.',
    variants: [
      { kind: 'number', description: 'Numeric parameter value.' },
      { kind: 'boolean', description: 'Flag parameter value.' },
      { kind: 'string', maxLength: 64, description: 'Named or color parameter value.' },
    ],
  },
}

function transitionIds(record: ShowRecordV2): string[] {
  return record.composition.transitions.map(transition => transition.id)
}

const insertTransition: ShowCommandV2Descriptor = {
  name: 'insert_transition',
  family: 'transitions',
  description: 'Insert a Transition at an exact Cut junction, addressed by the outgoing and incoming Clip identities. The incoming Clip and every connected successor ripple later by the new duration; the outgoing Clip keeps its timing and Show End never grows silently. A non-junction pair, a collision, a Zone gap or a compiler restriction refuses.',
  touches: ['/composition/transitions', '/composition/clips'],
  fields: {
    from_clip_id: idField('Outgoing Clip of the junction.'),
    to_clip_id: idField('Incoming Clip of the junction.'),
    duration_ms: durationField('Positive duration ms.'),
    kind: { kind: 'string', enum: TRANSITION_KIND_VALUES, description: 'Transition kind; Cut is absence and is never created.' },
    easing: EASING_FIELD,
    parameters: PARAMETERS_FIELD,
  },
  apply(record, input) {
    const fromClipId = input.from_clip_id as string
    const toClipId = input.to_clip_id as string
    const junction = projectShowTransitionJunctionsV2(record)
      .find(candidate => candidate.fromClipId === fromClipId && candidate.toClipId === toClipId)
    if (!junction) {
      return refuseShowCommandV2(record, {
        code: 'not-a-junction',
        message: `insert_transition: Clips "${fromClipId}" and "${toClipId}" are not exactly adjacent on one Zone and Layer.`,
        remedy: 'A Cut junction requires outgoing end to equal incoming start exactly; a gap is blank time.',
        candidates: projectShowTransitionJunctionsV2(record).map(candidate => `${candidate.fromClipId}->${candidate.toClipId}`),
      })
    }
    const transitionId = `transition-${fromClipId}-${toClipId}`
    if (record.composition.transitions.some(transition => transition.id === transitionId)) {
      return invalidArgument(record, 'insert_transition', `Transition identity "${transitionId}" is already used.`)
    }
    const transition = {
      id: transitionId,
      kind: input.kind as Exclude<ShowTransitionKind, 'cut'>,
      durationMs: input.duration_ms as number,
      easing: normalizeShowEasing(input.easing as ShowStructuredEasing | undefined),
      ...((input.parameters as Record<string, unknown> | undefined) ?? {}),
      participants: [{
        id: `${transitionId}-pair`,
        zoneId: junction.zoneId,
        layerId: junction.layerId,
        fromClipId,
        toClipId,
      }],
      propertyRamps: [],
    } as unknown as ShowTransitionV2
    return adoptOwnerResult('insert_transition', record,
      editShowTransitionV2(record, { kind: 'insert', transition }),
      affected => `Inserted ${input.kind as string} Transition ${transitionId}; Clips ${describeIds(affected.clips)}.`,
      transitionId)
  },
}

const updateTransition: ShowCommandV2Descriptor = {
  name: 'update_transition',
  family: 'transitions',
  description: 'Change one Transition\'s kind, easing or kind-specific parameters. Its identity, endpoints, duration and every authored time stay fixed. Whole-output Transitions from conversion are accepted by identity.',
  touches: ['/composition/transitions'],
  atLeastOne: ['kind', 'easing', 'parameters'],
  fields: {
    transition_id: idField('The Transition to change.'),
    kind: { kind: 'string', optional: true, enum: TRANSITION_KIND_VALUES, description: 'New Transition kind.' },
    easing: EASING_FIELD,
    parameters: PARAMETERS_FIELD,
  },
  apply(record, input) {
    const transitionId = input.transition_id as string
    const source = record.composition.transitions.find(transition => transition.id === transitionId)
    if (!source) return unknownIdentity(record, 'update_transition', 'Transition', transitionId, transitionIds(record))
    const parameters = (input.parameters as Record<string, unknown> | undefined) ?? {}
    const transition = {
      ...structuredClone(source),
      ...(input.kind !== undefined ? { kind: input.kind as Exclude<ShowTransitionKind, 'cut'> } : {}),
      ...(input.easing !== undefined ? { easing: normalizeShowEasing(input.easing as ShowStructuredEasing) } : {}),
      ...parameters,
    } as ShowTransitionV2
    return adoptOwnerResult('update_transition', record,
      editShowTransitionV2(record, { kind: 'update-transition', transition }),
      () => `Transition ${transitionId} updated.`, transitionId)
  },
}

const resizeTransition: ShowCommandV2Descriptor = {
  name: 'resize_transition',
  family: 'transitions',
  description: 'Change one Transition\'s duration. The new-minus-old delta is applied once to the incoming and downstream affected set; the outgoing Clip and unrelated content stay fixed. A zero duration is not authored; remove the Transition instead.',
  touches: ['/composition/transitions', '/composition/clips'],
  fields: {
    transition_id: idField('The Transition to resize.'),
    duration_ms: durationField('New positive duration ms.'),
  },
  apply(record, input) {
    const transitionId = input.transition_id as string
    if (!record.composition.transitions.some(transition => transition.id === transitionId)) {
      return unknownIdentity(record, 'resize_transition', 'Transition', transitionId, transitionIds(record))
    }
    return adoptOwnerResult('resize_transition', record,
      editShowTransitionV2(record, { kind: 'resize-transition', transitionId, durationMs: input.duration_ms as number }),
      affected => `Transition ${transitionId} is ${input.duration_ms as number} ms; Clips ${describeIds(affected.clips)}.`,
      transitionId)
  },
}

const removeTransition: ShowCommandV2Descriptor = {
  name: 'remove_transition',
  family: 'transitions',
  description: 'Remove one Transition. Every incoming contributor and connected successor moves earlier by its duration, leaving the Clips exactly adjacent, which is a Cut. Outgoing Clips, unrelated Clips, Show End, Markers, Layout intervals and Show-wide animation stay fixed, and no dormant effect survives to resurrect on re-add.',
  touches: ['/composition/transitions', '/composition/clips', '/composition/propertyTracks'],
  fields: {
    transition_id: idField('The Transition to remove.'),
  },
  apply(record, input) {
    const transitionId = input.transition_id as string
    if (!record.composition.transitions.some(transition => transition.id === transitionId)) {
      return unknownIdentity(record, 'remove_transition', 'Transition', transitionId, transitionIds(record))
    }
    return adoptOwnerResult('remove_transition', record,
      editShowTransitionV2(record, { kind: 'reset-to-cut', transitionId }),
      affected => `Transition ${transitionId} removed; Clips ${describeIds(affected.clips)} now cut.`, transitionId)
  },
}

export const SHOW_V2_TRANSITION_COMMANDS: ShowCommandV2Descriptor[] = [
  insertTransition,
  updateTransition,
  resizeTransition,
  removeTransition,
]
