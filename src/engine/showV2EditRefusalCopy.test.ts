import { describe, expect, it } from 'vitest'
import {
  showV2AddRefusalInput,
  showV2CommitRefusalInput,
  showV2EditRefusalCopy,
  showV2PlannerRefusalInput,
  type ShowV2EditRefusalInput,
} from './showV2EditRefusalCopy'

// Every union member, with the copy Jon approved on #1098.
const TABLE: Array<[ShowV2EditRefusalInput, string | null, string]> = [
  [{ kind: 'overlap' }, 'Space taken', 'Clips on one Layer cannot overlap.'],
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
})
