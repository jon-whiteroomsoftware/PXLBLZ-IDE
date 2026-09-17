// V2-authored for #945 (candidate review of a4e11cc0, P2), re-authored onto the
// version-2 record and catalogue for #1039: argument
// validation precedes the Zone filter in resolve_reference. The junction
// branch returned "none" for a Zone without junctions before checking that a
// time was given, so a malformed request read as a clean miss. Boundary:
// resolveReference as a pure function. Invariants: a junction query without
// at_ms or at_playhead (or at_playhead without a playhead) is an
// invalid-argument issue whatever the Zone holds; the same holds for the
// clip branch's hovered/selected/playhead pointers; a well-formed query for
// a Zone with no match still resolves to none with the nearest candidates.
import { describe, expect, it } from 'vitest'
import { openShowDocument } from '../grammar/openShow.js'
import { resolveReference, type ReferenceQuery } from '../grammar/read.js'
import { applyShowGrammarOperation } from '../grammar/registry.js'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { grammarFixtureShow } from './support/grammarFixture.js'
import { LEFT_LAYER_ID, twoZoneShowV2 } from './support/twoZoneFixture.js'

/** Cut the Left Zone's opening Clip at 15 s so only it carries an extra Cut. */
function leftCutOnly(): ShowGrammarDocument {
  const opened = openShowDocument(twoZoneShowV2())
  if (!opened.ok) throw new Error(`fixture failed to open: ${JSON.stringify(opened.issues)}`)
  const firstClip = opened.listing.clips.find((clip) => clip.zoneId === 'z1' && clip.startMs === 0)!
  const resized = applyShowGrammarOperation(opened.document, 'resize_clip', { clip_id: firstClip.clipId, duration_ms: 15_000 })
  if (!resized.ok) throw new Error(JSON.stringify(resized.issues))
  const added = applyShowGrammarOperation(resized.document, 'create_clips', {
    clips: [{
      zone_id: 'z1',
      layer_id: LEFT_LAYER_ID,
      start_ms: 15_000,
      duration_ms: 15_000,
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      instance: 'inst-left-2',
    }],
  })
  if (!added.ok) throw new Error(JSON.stringify(added.issues))
  return added.document
}

/** One clip, no junction anywhere. */
function noJunctions(): ShowGrammarDocument {
  const opened = openShowDocument(grammarFixtureShow({ emptyTail: true }))
  if (!opened.ok) throw new Error(`fixture failed to open: ${JSON.stringify(opened.issues)}`)
  return opened.document
}

const issueOf = (document: ShowGrammarDocument, query: ReferenceQuery, context = {}) => {
  const result = resolveReference(document, context, query)
  if (!('issue' in result)) throw new Error(`expected an issue, got ${result.resolution}: ${result.message}`)
  return result.issue
}

const resolved = (document: ShowGrammarDocument, query: ReferenceQuery, context = {}) => {
  const result = resolveReference(document, context, query)
  if ('issue' in result) throw new Error(result.issue.message)
  return result
}

describe('junction references validate their time before the Zone filter (#945 repair)', () => {
  it('rejects a missing time for a Zone that has no junction while another Zone does', () => {
    const document = leftCutOnly()
    const issue = issueOf(document, { kind: 'junction', zone: 'Right' })
    expect(issue.code).toBe('invalid-argument')
    expect(issue.message).toMatch(/at_ms or at_playhead/)
  })

  it('rejects at_playhead without a playhead, Zone or not', () => {
    const document = leftCutOnly()
    for (const zone of ['Right', 'Ceiling', undefined]) {
      const issue = issueOf(document, { kind: 'junction', at_playhead: true, ...(zone ? { zone } : {}) })
      expect(issue.code, String(zone)).toBe('invalid-argument')
      expect(issue.message, String(zone)).toMatch(/playhead/)
    }
  })

  it('rejects a missing time in a Show with no junctions at all', () => {
    const document = noJunctions()
    expect(issueOf(document, { kind: 'junction', zone: 'Main' }).code).toBe('invalid-argument')
    expect(issueOf(document, { kind: 'junction' }).code).toBe('invalid-argument')
    const none = resolved(document, { kind: 'junction', zone: 'Main', at_ms: 5_000 })
    expect(none.resolution).toBe('none')
    expect(none.message).toContain('no elements of that kind')
  })

  it('still resolves a well-formed miss to none with the nearest junctions', () => {
    const document = leftCutOnly()
    const miss = resolved(document, { kind: 'junction', zone: 'Right', at_ms: 15_000 })
    expect(miss.resolution).toBe('none')
    expect(miss.candidates).toEqual([])
    expect(miss.message).toContain('Nearest')
    expect(resolved(document, { kind: 'junction', zone: 'Left', at_ms: 15_000 }).resolution).toBe('unique')
  })
})

describe('clip references validate their pointers before the Zone filter (#945 repair)', () => {
  it('rejects hovered, selected and playhead pointers the context lacks, whatever the Zone', () => {
    const document = leftCutOnly()
    const queries: Array<[ReferenceQuery, RegExp]> = [
      [{ zone: 'Ceiling', hovered: true }, /hovered/],
      [{ zone: 'Ceiling', selected: true }, /selected/],
      [{ zone: 'Ceiling', at_playhead: true }, /playhead/],
    ]
    for (const [query, expected] of queries) {
      const issue = issueOf(document, query)
      expect(issue.code, JSON.stringify(query)).toBe('invalid-argument')
      expect(issue.message, JSON.stringify(query)).toMatch(expected)
    }
    // A well-formed query for a Zone that does not exist is a clean miss.
    const miss = resolved(document, { zone: 'Ceiling', at_ms: 5_000 })
    expect(miss.resolution).toBe('none')
    expect(miss.message).toContain('Nearest')
  })
})
