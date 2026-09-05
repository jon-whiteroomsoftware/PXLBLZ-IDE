// V2-authored for #945 (candidate review of a4e11cc0, P2): argument
// validation precedes the Zone filter in resolve_reference. The junction
// branch returned "none" for a Zone without junctions before checking that a
// time was given, so a malformed request read as a clean miss. Boundary:
// resolveReference as a pure function. Invariants: a junction query without
// at_ms or at_playhead (or at_playhead without a playhead) is an
// invalid-argument issue whatever the Zone holds; the same holds for the
// clip branch's hovered/selected/playhead pointers; a well-formed query for
// a Zone with no match still resolves to none with the nearest candidates.
import { describe, expect, it } from 'vitest'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { openShowDocument } from '../grammar/openShow.js'
import { resolveReference, type ReferenceQuery } from '../grammar/read.js'
import { applyShowGrammarOperation } from '../grammar/registry.js'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { grammarFixtureShow } from './support/grammarFixture.js'

function twoZoneShow(): ShowRecord {
  const cell = (id: string, zoneId: string, sceneId: string, patternId: string) => ({
    id,
    zoneId,
    sceneId,
    sceneSpan: 1,
    pattern: { kind: 'stock', id: patternId },
    patternName: patternId,
    adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
  })
  return {
    id: 'two-zone-fixture',
    name: 'Two Zones',
    updatedAt: 0,
    scenes: [
      { id: 's1', name: 'Opening', durationMs: 30_000 },
      { id: 's2', name: 'Closing', durationMs: 30_000 },
    ],
    zones: [
      { id: 'z1', name: 'Left', nominalPixelCount: 32 },
      { id: 'z2', name: 'Right', nominalPixelCount: 32 },
    ],
    cells: [
      cell('c1', 'z1', 's1', 'CometLoom'),
      cell('c2', 'z1', 's2', 'TestPattern1D'),
      cell('c3', 'z2', 's1', 'CometLoom'),
      cell('c4', 'z2', 's2', 'TestPattern1D'),
    ],
    routingLayouts: [
      { id: 'l1', name: 'Split', zones: [], logical: { kind: 'split', zoneIds: ['z1', 'z2'], axis: 'x' } },
    ],
    transitions: [],
    outputContract: {
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 256,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    },
  } as unknown as ShowRecord
}

/** Split Scene 1 of the Left Zone at 15 s so only it carries a cut junction. */
function leftCutOnly(): ShowGrammarDocument {
  const opened = openShowDocument(twoZoneShow())
  if (!opened.ok) throw new Error(`fixture failed to open: ${JSON.stringify(opened.issues)}`)
  const firstClip = opened.listing.clips.find((clip) => clip.zoneId === 'z1' && clip.startMs === 0)!
  const resized = applyShowGrammarOperation(opened.document, 'resize_clip', { clip_id: firstClip.clipId, duration_ms: 15_000 })
  if (!resized.ok) throw new Error(JSON.stringify(resized.issues))
  const added = applyShowGrammarOperation(resized.document, 'add_clip', {
    zone_id: 'z1',
    start_ms: 15_000,
    duration_ms: 15_000,
    pattern_kind: 'stock',
    pattern_id: 'TestPattern1D',
  })
  if (!added.ok) throw new Error(JSON.stringify(added.issues))
  return added.document
}

/** One clip, no junction anywhere. */
function noJunctions(): ShowGrammarDocument {
  const opened = openShowDocument(grammarFixtureShow({ emptySecondScene: true }))
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
