// V2-authored for #945 (integration review correction 3): a junction
// referent honours the requested Zone the way a clip referent does.
// Boundary: resolveReference as a pure function over a two-Zone Show whose
// junctions are per-Zone cuts inside Scene 1 (a Scene-boundary transition
// is one shared element across Zones, so it cannot show which Zone
// resolved). Invariant: with a zone constraint, only that Zone's junctions
// are candidates; without one, every Zone's are. Partitions: the requested
// Zone has no junction at the time while another Zone does; both Zones have
// one at the same time; the Zone is named by id, by name, or in another
// case; the Zone does not exist. Ids returned are the ones describe_show
// reports.
import { describe, expect, it } from 'vitest'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { openShowDocument } from '../grammar/openShow.js'
import { describeShow, resolveReference } from '../grammar/read.js'
import { applyShowGrammarOperation } from '../grammar/registry.js'
import type { ShowGrammarDocument } from '../grammar/types.js'

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

/** Split Scene 1 of the named Zones at 15 s, so each gains a cut junction of its own. */
function open(zonesWithCut: string[]) {
  const opened = openShowDocument(twoZoneShow())
  if (!opened.ok) throw new Error(`fixture failed to open: ${JSON.stringify(opened.issues)}`)
  let document: ShowGrammarDocument = opened.document
  for (const zoneId of zonesWithCut) {
    const firstClip = opened.listing.clips.find((clip) => clip.zoneId === zoneId && clip.startMs === 0)
    if (!firstClip) throw new Error(`no opening clip on ${zoneId}`)
    const resized = applyShowGrammarOperation(document, 'resize_clip', { clip_id: firstClip.clipId, duration_ms: 15_000 })
    if (!resized.ok) throw new Error(JSON.stringify(resized.issues))
    const added = applyShowGrammarOperation(resized.document, 'add_clip', {
      zone_id: zoneId,
      start_ms: 15_000,
      duration_ms: 15_000,
      pattern_kind: 'stock',
      pattern_id: 'TestPattern1D',
    })
    if (!added.ok) throw new Error(JSON.stringify(added.issues))
    document = added.document
  }
  const description = describeShow(document)
  const cutIds = (zoneId: string) =>
    description.zones.find((zone) => zone.zoneId === zoneId)!.layers
      .flatMap((layer) => layer.junctions)
      .filter((junction) => junction.startMs === 15_000)
      .map((junction) => junction.junctionId)
  return { document, cutIds }
}

const resolve = (document: ShowGrammarDocument, query: Parameters<typeof resolveReference>[2]) => {
  const result = resolveReference(document, {}, { kind: 'junction', ...query })
  if ('issue' in result) throw new Error(result.issue.message)
  return result
}

describe('junction references honour the requested Zone (#945)', () => {
  it('finds nothing in a Zone that has no junction at that time, even when another Zone has one', () => {
    const { document, cutIds } = open(['z1'])
    expect(cutIds('z1')).toHaveLength(1)
    expect(cutIds('z2')).toEqual([])

    const right = resolve(document, { at_ms: 15_000, zone: 'Right' })
    expect(right.resolution).toBe('none')
    expect(right.candidates).toEqual([])
    expect(right.message).toContain('Nearest')

    // The other Zone, and no Zone, still resolve the junction that exists.
    expect(resolve(document, { at_ms: 15_000, zone: 'Left' }).candidates.map((candidate) => candidate.id)).toEqual(cutIds('z1'))
    expect(resolve(document, { at_ms: 15_000 }).candidates.map((candidate) => candidate.id)).toEqual(cutIds('z1'))
  })

  it('resolves uniquely inside the requested Zone when both Zones have a junction at the same time', () => {
    const { document, cutIds } = open(['z1', 'z2'])
    expect(cutIds('z1')).toHaveLength(1)
    expect(cutIds('z2')).toHaveLength(1)
    expect(cutIds('z1')).not.toEqual(cutIds('z2'))

    const left = resolve(document, { at_ms: 15_000, zone: 'Left' })
    expect(left.resolution).toBe('unique')
    expect(left.candidates.map((candidate) => candidate.id)).toEqual(cutIds('z1'))
    expect(left.candidates[0].description).toContain('Left')

    const byId = resolve(document, { at_ms: 15_000, zone: 'z2' })
    expect(byId.resolution).toBe('unique')
    expect(byId.candidates.map((candidate) => candidate.id)).toEqual(cutIds('z2'))

    const cased = resolve(document, { at_ms: 15_000, zone: 'right' })
    expect(cased.candidates.map((candidate) => candidate.id)).toEqual(cutIds('z2'))

    // Without a Zone the same time is genuinely ambiguous.
    const any = resolve(document, { at_ms: 15_000 })
    expect(any.resolution).toBe('ambiguous')
    expect(any.candidates.map((candidate) => candidate.id).sort()).toEqual([...cutIds('z1'), ...cutIds('z2')].sort())
  })

  it('reports none with the nearest junctions for a Zone that does not exist', () => {
    const { document } = open(['z1', 'z2'])
    const result = resolve(document, { at_ms: 15_000, zone: 'Ceiling' })
    expect(result.resolution).toBe('none')
    expect(result.candidates).toEqual([])
    expect(result.message).toContain('Nearest')
  })

  it('still needs a time, Zone or not', () => {
    const { document } = open(['z1'])
    const result = resolveReference(document, {}, { kind: 'junction', zone: 'Left' })
    expect('issue' in result && result.issue.code).toBe('invalid-argument')
  })
})
