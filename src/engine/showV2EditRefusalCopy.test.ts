import { describe, expect, it } from 'vitest'
import {
  SHOW_V2_RESTART_UNAVAILABLE_REASON,
  showV2AddRefusalInput,
  showV2BoundaryRefusalInput,
  showV2CommitRefusalInput,
  showV2DuplicateRefusalInput,
  showV2EditRefusalCopy,
  showV2GroupRefusalInput,
  showV2InspectorRefusalInput,
  showV2PlannerRefusalInput,
  showV2TransitionRetimeRefusalInput,
  type ShowV2EditRefusalInput,
} from './showV2EditRefusalCopy'

// Every union member, with the copy Jon approved on #1098.
const TABLE: Array<[ShowV2EditRefusalInput, string | null, string]> = [
  [{ kind: 'overlap' }, 'Space taken', 'Clips on one Layer cannot overlap.'],
  [{ kind: 'past-show-end' }, 'Past Show End', 'The copy would run past Show End.'],
  [{ kind: 'boundary-extend-unsupported' }, 'Joined to a Transition', 'Resize the Transition to change this edge.'],
  [{ kind: 'boundary-repair-blocked' }, 'Transition blocks this', "This trim would break the joined Transition's animation."],
  [{ kind: 'split-outside-clip' }, 'Playhead at the edge', 'Move the playhead inside the Clip to split it.'],
  [{ kind: 'add', code: 'inside-transition' }, null, 'A Clip cannot start inside a Transition.'],
  [{ kind: 'add', code: 'occupied' }, null, 'Clips on one Layer cannot overlap.'],
  [{ kind: 'add', code: 'no-layout' }, null, 'No Zone Layout covers this time.'],
  [{ kind: 'add', code: 'no-room' }, null, 'There is no free time here for a Clip.'],
  [{ kind: 'transition-blocks' }, 'Transition blocks this', 'A joined Transition blocks this edit.'],
  [{ kind: 'zone-unavailable' }, 'No Zone Layout', 'No Zone Layout covers this time.'],
  [{ kind: 'undeliverable' }, "Can't deliver this", 'This edit would make the Show undeliverable.'],
  [{ kind: 'refused' }, 'Edit refused', "This edit isn't possible here."],
  [{ kind: 'stale' }, 'Show changed', 'The Show changed; try again.'],
  [{ kind: 'multi-key-clip' }, null, "This Clip's Effects differ between its held segments; edit each segment instead."],
  [{ kind: 'group-no-layout' }, null, 'No Zone Layout covers this start.'],
  [{ kind: 'group-no-layer-at-rank' }, null, 'No Layer at that rank in this Group.'],
  [{ kind: 'group-ends-in-hold' }, null, 'This Duration would end inside a hold.'],
  [{ kind: 'group-restart-unsupported' }, null, "This Pattern's state can't be reset."],
  [{ kind: 'transition-past-show-end' }, null, 'This Transition would run past Show End.'],
  [{ kind: 'split-end-no-layout' }, null, "No Zone Layout covers this Transition's end."],
]

describe('showV2EditRefusalCopy', () => {
  it.each(TABLE)('%j maps to its approved copy', (input, label, status) => {
    expect(showV2EditRefusalCopy(input)).toEqual({ label, status })
  })

  it.each(TABLE)('%j copy is short, plain and free of identifiers', (input) => {
    const copy = showV2EditRefusalCopy(input)
    if (copy.label !== null) {
      expect(copy.label.split(/\s+/).length).toBeLessThanOrEqual(4)
      expect(copy.label).not.toMatch(/\.$/)
    }
    // One sentence: a capital start, one closing period and none before it.
    expect(copy.status).toMatch(/^[A-Z][^.]*\.$/)
    // No command names, ids or JSON paths.
    for (const text of [copy.label ?? '', copy.status]) {
      expect(text).not.toMatch(/[_{}[\]"/]|\b[a-z]+-[a-z]+\b|composition\.|\bclips\[/)
    }
  })
})

describe('refusal inputs', () => {
  it('maps admission refusals to the race copy, except a capability refusal', () => {
    for (const code of ['stale-edit', 'missing-show', 'unsupported-provider']) {
      expect(showV2CommitRefusalInput({ source: 'admission', code })).toEqual({ kind: 'stale' })
    }
    expect(showV2CommitRefusalInput({ source: 'admission', code: 'unsupported-pilot-record' })).toEqual({ kind: 'undeliverable' })
  })

  it('maps owner refusals by validator issue first, then by code, with a fallback', () => {
    expect(showV2CommitRefusalInput({ source: 'owner', code: 'invalid-result', issueCode: 'overlap' })).toEqual({ kind: 'overlap' })
    expect(showV2CommitRefusalInput({ source: 'owner', code: 'invalid-result', issueCode: 'out-of-bounds' })).toEqual({ kind: 'refused' })
    expect(showV2CommitRefusalInput({ source: 'owner', code: 'invalid-result' })).toEqual({ kind: 'refused' })
    expect(showV2CommitRefusalInput({ source: 'owner', code: 'missing-clip' })).toEqual({ kind: 'stale' })
    expect(showV2CommitRefusalInput({ source: 'transition', code: 'invalid-topology' })).toEqual({ kind: 'transition-blocks' })
    expect(showV2CommitRefusalInput({ source: 'owner', code: 'unsupported-property-carrier' })).toEqual({ kind: 'transition-blocks' })
    expect(showV2CommitRefusalInput({ source: 'owner', code: 'zone-unavailable' })).toEqual({ kind: 'zone-unavailable' })
    expect(showV2CommitRefusalInput({ source: 'owner', code: 'compiler-ineligible' })).toEqual({ kind: 'undeliverable' })
  })

  it('keeps no-change silent and names each reachable planner refusal', () => {
    expect(showV2PlannerRefusalInput('move', 'no-change')).toBeNull()
    expect(showV2PlannerRefusalInput('resize', 'no-change')).toBeNull()
    expect(showV2PlannerRefusalInput('move', 'missing-clip')).toEqual({ kind: 'stale' })
    expect(showV2PlannerRefusalInput('resize', 'boundary-extend-unsupported')).toEqual({ kind: 'boundary-extend-unsupported' })
    expect(showV2PlannerRefusalInput('resize', 'boundary-repair-blocked')).toEqual({ kind: 'boundary-repair-blocked' })
    expect(showV2PlannerRefusalInput('split', 'outside-clip')).toEqual({ kind: 'split-outside-clip' })
    expect(showV2AddRefusalInput('inside-transition')).toEqual({ kind: 'add', code: 'inside-transition' })
  })

  it('maps a duplicate refusal by its owner issue or draft code', () => {
    expect(showV2DuplicateRefusalInput({ code: 'owner-refused', ownerRefusal: { code: 'invalid-result', issueCode: 'overlap' } })).toEqual({ kind: 'overlap' })
    expect(showV2DuplicateRefusalInput({ code: 'past-show-end' })).toEqual({ kind: 'past-show-end' })
    expect(showV2DuplicateRefusalInput({ code: 'invalid-destination' })).toEqual({ kind: 'refused' })
    expect(showV2DuplicateRefusalInput({ code: 'missing-clip' })).toEqual({ kind: 'refused' })
    expect(showV2DuplicateRefusalInput(undefined)).toEqual({ kind: 'refused' })
  })

  it('names each reachable panel refusal, treats a vanished entity as a race and keeps no-change silent', () => {
    expect(showV2InspectorRefusalInput('multi-key-clip')).toEqual({ kind: 'multi-key-clip' })
    expect(showV2InspectorRefusalInput('missing-clip')).toEqual({ kind: 'stale' })
    expect(showV2InspectorRefusalInput('ambiguous-effects')).toEqual({ kind: 'refused' })
    expect(showV2GroupRefusalInput('no-change')).toBeNull()
    expect(showV2GroupRefusalInput('missing-entity')).toEqual({ kind: 'stale' })
    expect(showV2GroupRefusalInput('no-layout')).toEqual({ kind: 'group-no-layout' })
    expect(showV2GroupRefusalInput('ends-in-hold')).toEqual({ kind: 'group-ends-in-hold' })
    expect(showV2GroupRefusalInput('entry-policy-unsupported')).toEqual({ kind: 'group-restart-unsupported' })
    expect(showV2GroupRefusalInput('multi-key-clip')).toEqual({ kind: 'multi-key-clip' })
    expect(showV2GroupRefusalInput(undefined)).toEqual({ kind: 'refused' })
    expect(showV2BoundaryRefusalInput('no-layout')).toEqual({ kind: 'split-end-no-layout' })
    expect(showV2BoundaryRefusalInput('missing-transition')).toEqual({ kind: 'stale' })
    expect(showV2BoundaryRefusalInput('missing-clip')).toEqual({ kind: 'stale' })
    expect(showV2BoundaryRefusalInput('unsupported-field')).toEqual({ kind: 'refused' })
    expect(showV2TransitionRetimeRefusalInput({ source: 'transition', code: 'invalid-result', issueCode: 'out-of-bounds' })).toEqual({ kind: 'transition-past-show-end' })
    expect(showV2TransitionRetimeRefusalInput({ source: 'admission', code: 'stale-edit' })).toEqual({ kind: 'stale' })
  })

  it('gives a Group Clip Restart the ordinary Clip Restart reason', () => {
    expect(showV2EditRefusalCopy({ kind: 'group-restart-unsupported' }).status).toBe(SHOW_V2_RESTART_UNAVAILABLE_REASON)
  })
})
