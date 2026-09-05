// V2-authored for #945 (second candidate review of the corrections, P3): a
// resolve_reference miss caused by the Zone filter ranks its "nearest"
// candidates by distance from the queried time before truncating to five.
// Before, the Zone-miss branches of both kinds returned the first five
// elements in start order, so a late query (99 s) against a Show with more
// than five earlier elements never mentioned the element at 99 s. Boundary:
// resolveReference as a pure function over one Zone with ten cut junctions
// (10 s to 90 s and 99 s) beside a Zone with none. Invariants: on a miss with
// a time, the nearest list is the five candidates closest to that time, ties
// in start order; without a time it is the first five by start; the matched
// branch (Zone exists) ranks the same way; argument validation still precedes
// the Zone filter. Oracle: the junction and clip ids describe_show reports for
// the expected start times, in order.
import { describe, expect, it } from 'vitest'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { openShowDocument } from '../grammar/openShow.js'
import { describeShow, resolveReference, type ReferenceQuery } from '../grammar/read.js'
import { applyShowGrammarOperation } from '../grammar/registry.js'
import type { ShowGrammarDocument } from '../grammar/types.js'

const CUTS = [10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 99_000]

function twoZoneShow(): ShowRecord {
  const cell = (id: string, zoneId: string, patternId: string) => ({
    id,
    zoneId,
    sceneId: 's1',
    sceneSpan: 1,
    pattern: { kind: 'stock', id: patternId },
    patternName: patternId,
    adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
  })
  return {
    id: 'late-junction-fixture',
    name: 'Late junction',
    updatedAt: 0,
    scenes: [{ id: 's1', name: 'Long', durationMs: 120_000 }],
    zones: [
      { id: 'z1', name: 'Left', nominalPixelCount: 32 },
      { id: 'z2', name: 'Right', nominalPixelCount: 32 },
    ],
    cells: [cell('c1', 'z1', 'CometLoom'), cell('c2', 'z2', 'TestPattern1D')],
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

/** The Left Zone cut into eleven clips (cuts at CUTS); the Right Zone one uncut clip. */
function lateJunctionShow() {
  const opened = openShowDocument(twoZoneShow())
  if (!opened.ok) throw new Error(`fixture failed to open: ${JSON.stringify(opened.issues)}`)
  const firstClip = opened.listing.clips.find((clip) => clip.zoneId === 'z1' && clip.startMs === 0)!
  let document: ShowGrammarDocument = opened.document
  const step = (name: string, args: Record<string, unknown>) => {
    const result = applyShowGrammarOperation(document, name, args)
    if (!result.ok) throw new Error(`${name} refused: ${JSON.stringify(result.issues)}`)
    document = result.document
  }
  step('resize_clip', { clip_id: firstClip.clipId, duration_ms: CUTS[0] })
  for (const [index, startMs] of CUTS.entries()) {
    const endMs = CUTS[index + 1] ?? 120_000
    step('add_clip', { zone_id: 'z1', start_ms: startMs, duration_ms: endMs - startMs, pattern_kind: 'stock', pattern_id: 'TestPattern1D' })
  }
  const description = describeShow(document)
  const left = description.zones.find((zone) => zone.zoneId === 'z1')!
  const junctionAt = (startMs: number) => {
    const junction = left.layers.flatMap((layer) => layer.junctions).find((candidate) => candidate.startMs === startMs)
    if (!junction) throw new Error(`no junction at ${startMs}`)
    return junction.junctionId
  }
  const clipAt = (zoneId: string, startMs: number) => {
    const zone = description.zones.find((candidate) => candidate.zoneId === zoneId)!
    const clip = zone.layers.flatMap((layer) => layer.clips).find((candidate) => candidate.startMs === startMs)
    if (!clip) throw new Error(`no clip at ${startMs} on ${zoneId}`)
    return clip.clipId
  }
  expect(left.layers.flatMap((layer) => layer.junctions).map((junction) => junction.startMs)).toEqual(CUTS)
  expect(description.zones.find((zone) => zone.zoneId === 'z2')!.layers.flatMap((layer) => layer.junctions)).toEqual([])
  return { document, junctionAt, clipAt }
}

const resolved = (document: ShowGrammarDocument, query: ReferenceQuery, context = {}) => {
  const result = resolveReference(document, context, query)
  if ('issue' in result) throw new Error(result.issue.message)
  return result
}

const nearestIds = (message: string) => [...message.matchAll(/(?:: |; )([^\s(]+) \(/g)].map((match) => match[1])

describe('junction misses rank the nearest by distance (#945 second review, P3)', () => {
  it('a late query against a Zone with no junctions names the 99 s junction first', () => {
    const { document, junctionAt } = lateJunctionShow()
    for (const zone of ['Right', 'z2', 'Ceiling']) {
      const miss = resolved(document, { kind: 'junction', zone, at_ms: 99_000 })
      expect(miss.resolution, zone).toBe('none')
      expect(miss.candidates, zone).toEqual([])
      expect(nearestIds(miss.message), zone).toEqual([99_000, 90_000, 80_000, 70_000, 60_000].map(junctionAt))
    }
  })

  it('breaks distance ties in start order', () => {
    const { document, junctionAt } = lateJunctionShow()
    const miss = resolved(document, { kind: 'junction', zone: 'Right', at_ms: 55_000 })
    expect(nearestIds(miss.message)).toEqual([50_000, 60_000, 40_000, 70_000, 30_000].map(junctionAt))
  })

  it('the matched branch resolves the late junction and ranks its own misses the same way', () => {
    const { document, junctionAt } = lateJunctionShow()
    const hit = resolved(document, { kind: 'junction', zone: 'Left', at_ms: 99_000 })
    expect(hit.resolution).toBe('unique')
    expect(hit.candidates.map((candidate) => candidate.id)).toEqual([junctionAt(99_000)])
    const miss = resolved(document, { kind: 'junction', zone: 'Left', at_ms: 95_000 })
    expect(miss.resolution).toBe('none')
    expect(nearestIds(miss.message)).toEqual([99_000, 90_000, 80_000, 70_000, 60_000].map(junctionAt))
    const unzoned = resolved(document, { kind: 'junction', at_ms: 95_000 })
    expect(nearestIds(unzoned.message)).toEqual([99_000, 90_000, 80_000, 70_000, 60_000].map(junctionAt))
  })

  it('still validates the time before the Zone filter', () => {
    const { document } = lateJunctionShow()
    const missing = resolveReference(document, {}, { kind: 'junction', zone: 'Right' })
    expect('issue' in missing && missing.issue.code).toBe('invalid-argument')
    const noPlayhead = resolveReference(document, {}, { kind: 'junction', zone: 'Ceiling', at_playhead: true })
    expect('issue' in noPlayhead && noPlayhead.issue.message).toMatch(/playhead/)
  })
})

describe('clip misses rank the nearest by distance (#945 second review, P3)', () => {
  it('a late query against an unknown Zone names the clips around 99 s', () => {
    const { document, clipAt } = lateJunctionShow()
    const miss = resolved(document, { zone: 'Ceiling', at_ms: 99_000 })
    expect(miss.resolution).toBe('none')
    expect(nearestIds(miss.message)).toEqual([99_000, 90_000, 80_000, 70_000, 60_000].map((startMs) => clipAt('z1', startMs)))
    const atPlayhead = resolved(document, { zone: 'Ceiling', at_playhead: true }, { playheadMs: 99_000 })
    expect(nearestIds(atPlayhead.message)).toEqual(nearestIds(miss.message))
  })

  it('breaks distance ties in start order, and without a time lists the first five by start', () => {
    const { document, clipAt } = lateJunctionShow()
    const tie = resolved(document, { zone: 'Ceiling', at_ms: 55_000 })
    expect(nearestIds(tie.message)).toEqual([50_000, 60_000, 40_000, 70_000, 30_000].map((startMs) => clipAt('z1', startMs)))
    const untimed = resolved(document, { zone: 'Ceiling', pattern_name: 'sparkle' })
    expect(nearestIds(untimed.message)).toEqual([
      clipAt('z1', 0), clipAt('z2', 0), clipAt('z1', 10_000), clipAt('z1', 20_000), clipAt('z1', 30_000),
    ])
  })

  it('the matched branch resolves the late clip and ranks its own misses the same way', () => {
    const { document, clipAt } = lateJunctionShow()
    const hit = resolved(document, { zone: 'Left', at_ms: 95_000 })
    expect(hit.resolution).toBe('unique')
    expect(hit.candidates.map((candidate) => candidate.id)).toEqual([clipAt('z1', 90_000)])
    const miss = resolved(document, { zone: 'Left', pattern_name: 'sparkle', at_ms: 95_000 })
    expect(miss.resolution).toBe('none')
    expect(nearestIds(miss.message)).toEqual([99_000, 90_000, 80_000, 70_000, 60_000].map((startMs) => clipAt('z1', startMs)))
  })

  it('still validates the context pointers before the Zone filter', () => {
    const { document } = lateJunctionShow()
    const hovered = resolveReference(document, {}, { zone: 'Ceiling', hovered: true, at_ms: 99_000 })
    expect('issue' in hovered && hovered.issue.message).toMatch(/hovered/)
  })
})
