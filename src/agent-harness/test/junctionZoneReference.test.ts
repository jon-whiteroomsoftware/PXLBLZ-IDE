// V2-authored for #945 (integration review correction 3), re-authored onto the
// version-2 record and catalogue for #1039: a junction
// referent honours the requested Zone the way a clip referent does.
// Boundary: resolveReference as a pure function over a two-Zone Show whose
// junctions are per-Zone derived Cuts (a whole-output Transition is one
// shared element across Zones, so it cannot show which Zone resolved). Invariant: with a zone constraint, only that Zone's junctions
// are candidates; without one, every Zone's are. Partitions: the requested
// Zone has no junction at the time while another Zone does; both Zones have
// one at the same time; the Zone is named by id, by name, or in another
// case; the Zone does not exist. Ids returned are the ones describe_show
// reports.
import { describe, expect, it } from 'vitest'
import { openShowDocument } from '../grammar/openShow.js'
import { describeShow, resolveReference } from '../grammar/read.js'
import { applyShowGrammarOperation } from '../grammar/registry.js'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { LEFT_LAYER_ID, RIGHT_LAYER_ID, twoZoneShowV2 } from './support/twoZoneFixture.js'

/** Split Scene 1 of the named Zones at 15 s, so each gains a cut junction of its own. */
function open(zonesWithCut: string[]) {
  const opened = openShowDocument(twoZoneShowV2())
  if (!opened.ok) throw new Error(`fixture failed to open: ${JSON.stringify(opened.issues)}`)
  let document: ShowGrammarDocument = opened.document
  for (const zoneId of zonesWithCut) {
    const firstClip = opened.listing.clips.find((clip) => clip.zoneId === zoneId && clip.startMs === 0)
    if (!firstClip) throw new Error(`no opening clip on ${zoneId}`)
    const resized = applyShowGrammarOperation(document, 'resize_clip', { clip_id: firstClip.clipId, duration_ms: 15_000 })
    if (!resized.ok) throw new Error(JSON.stringify(resized.issues))
    const added = applyShowGrammarOperation(resized.document, 'create_clips', {
      clips: [{
        zone_id: zoneId,
        layer_id: zoneId === 'z1' ? LEFT_LAYER_ID : RIGHT_LAYER_ID,
        start_ms: 15_000,
        duration_ms: 15_000,
        pattern: { kind: 'stock', id: 'TestPattern1D' },
        instance: zoneId === 'z1' ? 'inst-left-2' : 'inst-right-2',
      }],
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
