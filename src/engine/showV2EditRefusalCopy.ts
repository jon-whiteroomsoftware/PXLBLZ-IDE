import type { ShowCompositionV2ValidationCode } from './showCompositionV2'
import type { ShowV2ClipAddRefusalCode } from './showV2ClipAddPlacement'
import type { ShowV2ClipTemporalRefusal } from './showV2ClipTemporalPlanning'
import type { ShowV2DuplicateRefusalCode } from './showV2ClipSharingEditorModel'
import type { ShowV2ClipInspectorRefusal } from './showV2ClipAppearancePlanning'
import type { ShowV2GroupOccurrenceRefusalCode } from './showV2GroupOccurrenceEditorModel'
import type { ShowV2BoundaryChangesPlan } from './showV2TransitionEditorModel'

/**
 * User copy for a refused v2 timeline edit (#1098). `label` is the short red
 * label painted on the affected Clip; `status` is the timeline's
 * screen-reader line. A refusal with no Clip to anchor carries no label.
 */
export interface ShowV2RefusalCopy { label: string | null; status: string }

/** Each timeline refusal a user can reach, plus one input for every race. */
export type ShowV2EditRefusalInput =
  | { kind: 'overlap' }
  | { kind: 'past-show-end' }
  | { kind: 'boundary-extend-unsupported' }
  | { kind: 'boundary-repair-blocked' }
  | { kind: 'split-outside-clip' }
  | { kind: 'add'; code: Exclude<ShowV2ClipAddRefusalCode, 'invalid-time'> }
  | { kind: 'transition-blocks' }
  | { kind: 'zone-unavailable' }
  | { kind: 'undeliverable' }
  | { kind: 'refused' }
  | { kind: 'stale' }
  // Panel refusals speak through the panel's alert line only.
  | { kind: 'multi-key-clip' }
  | { kind: 'group-no-layout' }
  | { kind: 'group-ends-in-hold' }
  | { kind: 'group-restart-unsupported' }
  | { kind: 'transition-past-show-end' }
  | { kind: 'split-end-no-layout' }

const SPACE_TAKEN: ShowV2RefusalCopy = { label: 'Space taken', status: 'Clips on one Layer cannot overlap.' }
const REFUSED: ShowV2RefusalCopy = { label: 'Edit refused', status: "This edit isn't possible here." }
const STALE: ShowV2RefusalCopy = { label: 'Show changed', status: 'The Show changed; try again.' }

/** The ordinary Clip's Restart reason, which a Group Clip's refused Restart also names. */
export const SHOW_V2_RESTART_UNAVAILABLE_REASON = "This Pattern's state can't be reset."

const ADD_STATUS: Record<Exclude<ShowV2ClipAddRefusalCode, 'invalid-time'>, string> = {
  'inside-transition': 'A Clip cannot start inside a Transition.',
  occupied: 'Clips on one Layer cannot overlap.',
  'no-layout': 'No Zone Layout covers this time.',
  'no-room': 'There is no free time here for a Clip.',
}

/** User copy for one reachable v2 edit refusal, or the stale-capture copy. */
export function showV2EditRefusalCopy(refusal: ShowV2EditRefusalInput): ShowV2RefusalCopy {
  switch (refusal.kind) {
    case 'overlap': return SPACE_TAKEN
    case 'past-show-end': return { label: 'Past Show End', status: 'The copy would run past Show End.' }
    case 'boundary-extend-unsupported': return { label: 'Joined to a Transition', status: 'Resize the Transition to change this edge.' }
    case 'boundary-repair-blocked': return { label: 'Transition blocks this', status: "This trim would break the joined Transition's animation." }
    case 'split-outside-clip': return { label: 'Playhead at the edge', status: 'Move the playhead inside the Clip to split it.' }
    case 'add': return { label: null, status: ADD_STATUS[refusal.code] }
    case 'transition-blocks': return { label: 'Transition blocks this', status: 'A joined Transition blocks this edit.' }
    case 'zone-unavailable': return { label: 'No Zone Layout', status: 'No Zone Layout covers this time.' }
    case 'undeliverable': return { label: "Can't deliver this", status: 'This edit would make the Show undeliverable.' }
    case 'stale': return STALE
    case 'multi-key-clip': return { label: null, status: "This Clip's Effects differ between its held segments; edit each segment instead." }
    case 'group-no-layout': return { label: null, status: 'No Zone Layout covers this start.' }
    case 'group-ends-in-hold': return { label: null, status: 'This Duration would end inside a hold.' }
    case 'group-restart-unsupported': return { label: null, status: SHOW_V2_RESTART_UNAVAILABLE_REASON }
    case 'transition-past-show-end': return { label: null, status: 'This Transition would run past Show End.' }
    case 'split-end-no-layout': return { label: null, status: "No Zone Layout covers this Transition's end." }
    default: return REFUSED
  }
}

/**
 * The input for a refused admission outcome. The prepared admission reports
 * `source: 'admission'` for its own capture checks; the owners report their
 * code, and a validator refusal also names the validator's issue code.
 */
export function showV2CommitRefusalInput(refusal: {
  source: string
  code: string
  issueCode?: ShowCompositionV2ValidationCode
}): ShowV2EditRefusalInput {
  if (refusal.source === 'admission') {
    return refusal.code === 'unsupported-pilot-record' ? { kind: 'undeliverable' } : { kind: 'stale' }
  }
  if (refusal.issueCode === 'overlap') return { kind: 'overlap' }
  switch (refusal.code) {
    case 'missing-clip':
    case 'missing-target':
      return { kind: 'stale' }
    case 'invalid-topology':
    case 'unsupported-property-carrier':
      return { kind: 'transition-blocks' }
    case 'zone-unavailable': return { kind: 'zone-unavailable' }
    case 'compiler-ineligible': return { kind: 'undeliverable' }
    default: return { kind: 'refused' }
  }
}

/**
 * The input for a timeline planner refusal, or `null` when the gesture is
 * silent: a `no-change` release commits nothing and says nothing.
 */
export function showV2PlannerRefusalInput(
  gesture: 'move' | 'resize' | 'split',
  reason: ShowV2ClipTemporalRefusal,
): ShowV2EditRefusalInput | null {
  if (reason === 'no-change') return null
  if (reason === 'missing-clip' || reason === 'missing-target') return { kind: 'stale' }
  if (gesture === 'resize' && (reason === 'boundary-extend-unsupported' || reason === 'boundary-repair-blocked')) return { kind: reason }
  if (gesture === 'split' && reason === 'outside-clip') return { kind: 'split-outside-clip' }
  return { kind: 'refused' }
}

/**
 * The input for a refused duplicate plan (Alt-duplicate or Clone). Only a copy
 * that would run past Show End has its own copy; every other duplicate
 * refusal takes the fallback.
 */
export function showV2DuplicateRefusalInput(code: ShowV2DuplicateRefusalCode | undefined): ShowV2EditRefusalInput {
  return code === 'past-show-end' ? { kind: 'past-show-end' } : { kind: 'refused' }
}

/** The input for a refused double-click add, which has no Clip to label. */
export function showV2AddRefusalInput(code: ShowV2ClipAddRefusalCode): ShowV2EditRefusalInput {
  return code === 'invalid-time' ? { kind: 'refused' } : { kind: 'add', code }
}

/** The input for a refused Clip inspector patch; a Clip gone from under the inspector is a race. */
export function showV2InspectorRefusalInput(reason: ShowV2ClipInspectorRefusal): ShowV2EditRefusalInput {
  if (reason === 'missing-clip') return { kind: 'stale' }
  if (reason === 'multi-key-clip') return { kind: 'multi-key-clip' }
  return { kind: 'refused' }
}

/** The input for a refused Group occurrence plan, or `null` for a silent no-change. */
export function showV2GroupRefusalInput(code: ShowV2GroupOccurrenceRefusalCode | undefined): ShowV2EditRefusalInput | null {
  switch (code) {
    case 'no-change': return null
    case 'missing-entity': return { kind: 'stale' }
    case 'no-layout': return { kind: 'group-no-layout' }
    case 'ends-in-hold': return { kind: 'group-ends-in-hold' }
    case 'entry-policy-unsupported': return { kind: 'group-restart-unsupported' }
    case 'multi-key-clip': return { kind: 'multi-key-clip' }
    default: return { kind: 'refused' }
  }
}

/** The input for a refused boundary Transition settings plan. */
export function showV2BoundaryRefusalInput(code: Extract<ShowV2BoundaryChangesPlan, { status: 'refused' }>['code']): ShowV2EditRefusalInput {
  if (code === 'missing-transition' || code === 'missing-clip') return { kind: 'stale' }
  if (code === 'no-layout') return { kind: 'split-end-no-layout' }
  return { kind: 'refused' }
}

/**
 * The input for a refused Layer Transition retime. A retime only shifts the
 * Clips after it, so the validator's bounds issue is the Show End.
 */
export function showV2TransitionRetimeRefusalInput(refusal: Parameters<typeof showV2CommitRefusalInput>[0]): ShowV2EditRefusalInput {
  if (refusal.source !== 'admission' && refusal.issueCode === 'out-of-bounds') return { kind: 'transition-past-show-end' }
  return showV2CommitRefusalInput(refusal)
}
