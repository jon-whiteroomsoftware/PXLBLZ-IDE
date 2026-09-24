import type { ShowCompositionV2ValidationCode } from './showCompositionV2'
import type { ShowV2ClipAddRefusalCode } from './showV2ClipAddPlacement'
import type { ShowV2ClipTemporalRefusal } from './showV2ClipTemporalPlanning'

/**
 * User copy for a refused v2 timeline edit (#1098). `label` is the short red
 * label painted on the affected Clip; `status` is the timeline's
 * screen-reader line. A refusal with no Clip to anchor carries no label.
 */
export interface ShowV2RefusalCopy { label: string | null; status: string }

/** Each timeline refusal a user can reach, plus one input for every race. */
export type ShowV2EditRefusalInput =
  | { kind: 'overlap' }
  | { kind: 'boundary-extend-unsupported' }
  | { kind: 'boundary-repair-blocked' }
  | { kind: 'split-outside-clip' }
  | { kind: 'add'; code: Exclude<ShowV2ClipAddRefusalCode, 'invalid-time'> }
  | { kind: 'transition-blocks' }
  | { kind: 'zone-unavailable' }
  | { kind: 'undeliverable' }
  | { kind: 'refused' }
  | { kind: 'stale' }

const SPACE_TAKEN: ShowV2RefusalCopy = { label: 'Space taken', status: 'Clips on one Layer cannot overlap.' }
const REFUSED: ShowV2RefusalCopy = { label: 'Edit refused', status: "This edit isn't possible here." }
const STALE: ShowV2RefusalCopy = { label: 'Show changed', status: 'The Show changed; try again.' }

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
    case 'boundary-extend-unsupported': return { label: 'Joined to a Transition', status: 'Resize the Transition to change this edge.' }
    case 'boundary-repair-blocked': return { label: 'Transition blocks this', status: "This trim would break the joined Transition's animation." }
    case 'split-outside-clip': return { label: 'Playhead at the edge', status: 'Move the playhead inside the Clip to split it.' }
    case 'add': return { label: null, status: ADD_STATUS[refusal.code] }
    case 'transition-blocks': return { label: 'Transition blocks this', status: 'A joined Transition blocks this edit.' }
    case 'zone-unavailable': return { label: 'No Zone Layout', status: 'No Zone Layout covers this time.' }
    case 'undeliverable': return { label: "Can't deliver this", status: 'This edit would make the Show undeliverable.' }
    case 'stale': return STALE
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

/** The input for a refused double-click add, which has no Clip to label. */
export function showV2AddRefusalInput(code: ShowV2ClipAddRefusalCode): ShowV2EditRefusalInput {
  return code === 'invalid-time' ? { kind: 'refused' } : { kind: 'add', code }
}
