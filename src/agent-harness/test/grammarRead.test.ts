// Provenance: pxlblz-v3 test/grammarRead.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { createSessionStore, type GrammarSessionStore } from '../grammar/session.js'
import { grammarFixtureShow } from './support/grammarFixture.js'
import { applyOk, clipAt, clips, fixture, withBrightnessTrack } from './support/grammarHarness.js'
import { describeShow, evaluatePropertyAt, resolveReference } from '../grammar/read.js'

// Test model (issue #21). Boundaries: resolveReference / describeShow /
// evaluatePropertyAt as pure functions, and the session store's context
// round trip. Referent partitions: unique, ambiguous, none; by hover,
// selection, ordinal, time, pattern name, Zone; with and without editor
// context. Evaluation: between keyframes with the declared easing, and held
// values outside the span.

function richFixture() {
  // Two zones' worth of structure on one Zone: overlay layer with a clip and
  // an opacity track, a boundary crossfade, and a marker.
  let document = fixture({ overlay: true, boundaryCrossfade: true })
  document = applyOk(document, 'add_marker', { at_ms: 12_000, name: 'Drop' }).document
  const overlay = clips(document).find((candidate) => candidate.layer.kind === 'overlay')!
  const tracked = applyOk(document, 'add_property_track', {
    clip_id: overlay.clipId,
    target: 'opacity',
    keyframes: [
      { time_ms: 3_000, value: 0.8, easing: 'linear' },
      { time_ms: 5_000, value: 0.6, easing: 'ease-in-out' },
      { time_ms: 8_000, value: 0.4 },
    ],
  })
  return { document: tracked.document, overlay, trackId: tracked.changes[0].targetId }
}

describe('resolve_reference (#21)', () => {
  it('resolves hover and selection when the context carries them, and refuses when it does not', () => {
    const { document, overlay } = richFixture()
    const main = clipAt(document, 0)

    const hovered = resolveReference(document, { hoveredClipId: overlay.clipId }, { hovered: true })
    if ('issue' in hovered) throw new Error(hovered.issue.message)
    expect(hovered.resolution).toBe('unique')
    expect(hovered.candidates[0].id).toBe(overlay.clipId)

    const selected = resolveReference(document, { selectedClipIds: [main.clipId] }, { selected: true })
    if ('issue' in selected) throw new Error(selected.issue.message)
    expect(selected.resolution).toBe('unique')
    expect(selected.candidates[0].id).toBe(main.clipId)

    const noHover = resolveReference(document, {}, { hovered: true })
    expect('issue' in noHover && noHover.issue.message).toContain('hover')
    const noSelection = resolveReference(document, {}, { selected: true })
    expect('issue' in noSelection && noSelection.issue.message).toContain('select')
  })

  it('returns many candidates with descriptions for an ambiguous pattern name', () => {
    const { document } = richFixture()
    // CometLoom appears on the main layer (s1) and the overlay layer.
    const result = resolveReference(document, {}, { pattern_name: 'comet' })
    if ('issue' in result) throw new Error(result.issue.message)
    expect(result.resolution).toBe('ambiguous')
    expect(result.candidates.length).toBeGreaterThanOrEqual(2)
    for (const candidate of result.candidates) {
      expect(candidate.description).toContain('CometLoom')
      expect(candidate.description).toMatch(/\d+–\d+ ms/)
    }
    expect(result.message).toContain('ask the user')
  })

  it('matches pattern names ignoring spacing and case (#26)', () => {
    const { document } = richFixture()
    const spaced = resolveReference(document, {}, { pattern_name: 'test pattern' })
    if ('issue' in spaced) throw new Error(spaced.issue.message)
    expect(spaced.resolution).toBe('unique')
    expect(spaced.candidates[0].description).toContain('TestPattern1D')

    const cased = resolveReference(document, {}, { pattern_name: 'Comet Loom' })
    if ('issue' in cased) throw new Error(cased.issue.message)
    expect(cased.resolution).toBe('ambiguous')

    const zoned = resolveReference(document, {}, { zone: 'MAIN', ordinal: 1 })
    if ('issue' in zoned) throw new Error(zoned.issue.message)
    expect(zoned.resolution).toBe('unique')
  })

  it('returns none with nearest matches for an unknown pattern name', () => {
    const { document } = richFixture()
    const result = resolveReference(document, {}, { pattern_name: 'sparkle' })
    if ('issue' in result) throw new Error(result.issue.message)
    expect(result.resolution).toBe('none')
    expect(result.candidates).toEqual([])
    expect(result.message).toContain('Nearest')
  })

  it('resolves by ordinal within a Zone and by time under the playhead', () => {
    const { document } = richFixture()
    const second = resolveReference(document, {}, { ordinal: 2, zone: 'Main' })
    if ('issue' in second) throw new Error(second.issue.message)
    expect(second.resolution).toBe('unique')

    const atPlayhead = resolveReference(
      document,
      { playheadMs: 45_000 },
      { at_playhead: true },
    )
    if ('issue' in atPlayhead) throw new Error(atPlayhead.issue.message)
    expect(atPlayhead.resolution).toBe('unique')
    expect(atPlayhead.candidates[0].description).toContain('TestPattern1D')

    const noPlayhead = resolveReference(document, {}, { at_playhead: true })
    expect('issue' in noPlayhead && noPlayhead.issue.message).toContain('playhead')
  })

  it('resolves a junction from a global time', () => {
    const { document } = richFixture()
    const junction = resolveReference(document, {}, { kind: 'junction', at_ms: 30_000 })
    if ('issue' in junction) throw new Error(junction.issue.message)
    expect(junction.resolution).toBe('unique')
    expect(junction.candidates[0].kind).toBe('junction')

    const missed = resolveReference(document, {}, { kind: 'junction', at_ms: 5_000 })
    if ('issue' in missed) throw new Error(missed.issue.message)
    expect(missed.resolution).toBe('none')
    expect(missed.message).toContain('Nearest')
  })

  it('combines a Zone constraint with a time', () => {
    const { document, overlay } = richFixture()
    const result = resolveReference(document, {}, { zone: 'z1', at_ms: 10_000 })
    if ('issue' in result) throw new Error(result.issue.message)
    // Main clip and overlay clip both cover 10 s on this Zone.
    expect(result.resolution).toBe('ambiguous')
    expect(result.candidates.map((candidate) => candidate.id)).toContain(overlay.clipId)
  })
})

describe('describe_show (#21)', () => {
  it('lists every clip, junction, marker, and track with stable operational ids', () => {
    const { document, overlay, trackId } = richFixture()
    const description = describeShow(document)

    expect(description.name).toBe('Grammar fixture')
    // The 1 s boundary crossfade adds a transition window to the timeline.
    expect(description.durationMs).toBe(61_000)
    expect(description.scenes.map((scene) => scene.sceneId)).toEqual(['s1', 's2'])

    const zone = description.zones.find((candidate) => candidate.zoneId === 'z1')!
    const layerKinds = zone.layers.map((layer) => layer.kind)
    expect(layerKinds).toContain('main')
    expect(layerKinds).toContain('overlay')

    const allClips = zone.layers.flatMap((layer) => layer.clips)
    expect(allClips.length).toBe(3)
    const overlayClip = allClips.find((clip) => clip.clipId === overlay.clipId)!
    expect(overlayClip.tracks).toEqual([
      {
        trackId,
        target: expect.stringContaining('opacity'),
        keyframes: [
          expect.objectContaining({ keyframeId: expect.any(String), timeMs: expect.any(Number), value: expect.any(Number), easing: expect.any(String) }),
          expect.objectContaining({ keyframeId: expect.any(String) }),
          expect.objectContaining({ keyframeId: expect.any(String) }),
        ],
      },
    ])

    const junctions = zone.layers.flatMap((layer) => layer.junctions)
    expect(junctions.some((junction) => junction.boundaryTransition)).toBe(true)

    expect(description.markers).toHaveLength(1)
    expect(description.markers[0].name).toBe('Drop')
    expect(description.otherTracks).toEqual([])

    // The ids the description carries are accepted by the operations.
    const resized = applyOk(document, 'resize_clip', {
      clip_id: overlayClip.clipId,
      duration_ms: 12_000,
    })
    expect(resized.changes[0].targetId).toBe(overlayClip.clipId)
  })
})

describe('evaluate_property_at (#21)', () => {
  it('interpolates between keyframes with the declared easing and holds edge values', () => {
    const { document, trackId } = richFixture()

    const linearMid = evaluatePropertyAt(document, trackId, 4_000)
    if (!linearMid.ok) throw new Error('evaluate failed')
    expect(linearMid.evaluation.value).toBeCloseTo(0.7, 5)

    // Between 5 s (0.6, ease-in-out) and 8 s (0.4): the quadratic in-out
    // midpoint is halfway through the value ramp.
    const easedMid = evaluatePropertyAt(document, trackId, 6_500)
    if (!easedMid.ok) throw new Error('evaluate failed')
    expect(easedMid.evaluation.value).toBeCloseTo(0.5, 5)

    const before = evaluatePropertyAt(document, trackId, 0)
    if (!before.ok) throw new Error('evaluate failed')
    expect(before.evaluation.value).toBe(0.8)

    const after = evaluatePropertyAt(document, trackId, 20_000)
    if (!after.ok) throw new Error('evaluate failed')
    expect(after.evaluation.value).toBe(0.4)

    const unknown = evaluatePropertyAt(document, 'nope', 1_000)
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.issues[0].code).toBe('unknown-track')
  })

  it('evaluates against known keyframes from the brightness helper', () => {
    const { document, trackId } = withBrightnessTrack()
    const mid = evaluatePropertyAt(document, trackId, 5_000)
    if (!mid.ok) throw new Error('evaluate failed')
    expect(mid.evaluation.value).toBeCloseTo(0.6, 5)
  })
})

describe('editor context round trip (#21)', () => {
  function openSession(store: GrammarSessionStore) {
    const opened = store.open(grammarFixtureShow())
    if (!opened.ok) throw new Error('open failed')
    return opened.sessionId
  }

  it('round-trips every field and leaves unset fields absent', () => {
    const store = createSessionStore()
    const sessionId = openSession(store)

    const empty = store.getContext(sessionId)
    if (!empty.ok) throw new Error('getContext failed')
    expect(empty.context).toEqual({})

    const full = {
      selectedClipIds: ['a', 'b'],
      hoveredClipId: 'c',
      playheadMs: 12_000,
      visibleRange: { startMs: 0, endMs: 30_000 },
      activeZoneId: 'z1',
      inspectorTab: 'effects',
    }
    expect(store.setContext(sessionId, full).ok).toBe(true)
    const read = store.getContext(sessionId)
    if (!read.ok) throw new Error('getContext failed')
    expect(read.context).toEqual(full)

    // A replacement with fewer fields unsets the rest.
    expect(store.setContext(sessionId, { playheadMs: 500 }).ok).toBe(true)
    const replaced = store.getContext(sessionId)
    if (!replaced.ok) throw new Error('getContext failed')
    expect(replaced.context).toEqual({ playheadMs: 500 })
    expect('hoveredClipId' in replaced.context).toBe(false)
  })

  it('feeds resolution through the session store, reading the working copy mid-transaction', () => {
    const store = createSessionStore()
    const opened = store.open(grammarFixtureShow({ emptySecondScene: true }))
    if (!opened.ok) throw new Error('open failed')
    const sessionId = opened.sessionId
    const clipId = opened.listing.clips[0].clipId

    expect(store.begin(sessionId, 'read test').ok).toBe(true)
    expect(store.apply(sessionId, 'add_clip', {
      zone_id: 'z1',
      start_ms: 40_000,
      duration_ms: 5_000,
      pattern_kind: 'stock',
      pattern_id: 'CometLoom',
    }).ok).toBe(true)

    // The uncommitted clip is visible to reads.
    const described = store.describe(sessionId)
    if (!described.ok) throw new Error('describe failed')
    expect(described.description.zones[0].layers[0].clips).toHaveLength(2)

    const resolved = store.resolve(sessionId, { at_ms: 42_000 })
    if (!resolved.ok) throw new Error('resolve failed')
    expect(resolved.resolution).toBe('unique')

    expect(store.setContext(sessionId, { hoveredClipId: clipId }).ok).toBe(true)
    const hovered = store.resolve(sessionId, { hovered: true })
    if (!hovered.ok) throw new Error('resolve failed')
    expect(hovered.candidates[0].id).toBe(clipId)

    expect(store.rollback(sessionId).ok).toBe(true)
  })
})
