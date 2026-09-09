import { expect, it } from 'vitest'
import { showSplitClipFixture } from '@/test/showSplitClipFixture'
import { splitClipCommandOutcome } from '@/engine/showCommands/splitClip'
import { splitShowClipAtGlobalTime } from '@/engine/showTimelineClipAuthoring'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { validateShowComposition } from '@/engine/showCompositionModel'
import { applyShowGrammarOperation } from '../grammar/registry'
import { openShowDocument } from '../grammar/openShow'

it.each([['clip-b', 16000.4], ['clip-b', 33000.4], ['clip-ov', 4000.4]] as const)('pairs complete manual, canonical, diagnostic and importer output for %s at %s', async (clipId, atMs) => {
  const opened = openShowDocument(showSplitClipFixture())
  expect(opened.ok, JSON.stringify(opened)).toBe(true)
  if (!opened.ok) throw new Error('open')
  const document = opened.document
  const before = structuredClone(document)
  const args = { clip_id: clipId, at_ms: atMs }
  const canonical = splitClipCommandOutcome(document.show, args, () => 'clip-1')
  const diagnostic = applyShowGrammarOperation(document, 'split_clip', args)
  expect(canonical.ok).toBe(true)
  expect(diagnostic.ok, JSON.stringify(diagnostic)).toBe(true)
  if (!canonical.ok || !diagnostic.ok) throw new Error('split')
  const owner = clipId === 'clip-ov'
    ? { kind: 'overlay' as const, sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'overlay-1', placementId: clipId }
    : { kind: 'main' as const, sceneId: 'scene-1', zoneId: 'zone-1', placementId: clipId }
  expect(splitShowClipAtGlobalTime(document.show, document.show.composition!, { owner, globalTimeMs: atMs, newPlacementId: 'clip-1' })).toEqual(canonical.record.composition)
  expect({ ...diagnostic.document.show, updatedAt: canonical.record.updatedAt }).toEqual(canonical.record)
  expect(diagnostic.changes).toEqual(canonical.changes.map(({ command, ...change }) => ({ op: command, ...change })))
  const { bundle } = buildShowFileBundle(diagnostic.document.show, { patterns: [], maps: [] }, { appVersion: '951-split', exportedAt: '2026-09-09T00:00:00Z' })
  const reopened = (await parseShowFileBundle(await serializeShowFileBundle(bundle))).show
  // The file importer canonically orders tracks; compare all record values after
  // the same documented import boundary for the literal input and candidate.
  expect(validateShowComposition(reopened, reopened.composition!)).toEqual([])
  const trackOrder = (record: typeof reopened) => {
    const copy = structuredClone(record)
    for (const scene of copy.composition!.scenes) scene.propertyTracks?.sort((a, b) => a.id.localeCompare(b.id))
    return copy
  }
  expect(trackOrder(reopened)).toEqual(trackOrder(diagnostic.document.show))
  expect(document).toEqual(before)
  if (clipId === 'clip-ov') {
    const edited = applyShowGrammarOperation(diagnostic.document, 'set_clip_view', { clip_id: 'clip-1', brightness: 0.4 })
    expect(edited.ok).toBe(true)
    if (!edited.ok) throw new Error('edit')
    const moved = applyShowGrammarOperation(edited.document, 'move_clip', { clip_id: 'clip-1', start_ms: 9000 })
    expect(moved.ok, JSON.stringify(moved)).toBe(true)
    if (moved.ok) {
      expect(moved.document.show.composition!.scenes[0].zones[0].overlays[0].placements).toEqual([
        { ...before.show.composition!.scenes[0].zones[0].overlays[0].placements[0], durationMs: 2000 },
        { id: 'clip-1', instanceId: 'instance-ov', startMs: 9000, durationMs: 4000, opacity: 1, view: { mirror: false, phase: 0, brightness: 0.4 } },
      ])
    }
  }
})

it('shares canonical input and domain refusals without mutation', () => {
  const opened = openShowDocument(showSplitClipFixture())
  if (!opened.ok) throw new Error('open')
  const before = structuredClone(opened.document)
  for (const args of [{ clip_id: 'absent', at_ms: 16000 }, { clip_id: 'group-use:group-main', at_ms: 42500 }, { clip_id: 'clip-b', at_ms: 30000 }, { clip_id: 'clip-b', at_ms: 12000.1 }, { clip_id: 'clip-b', at_ms: NaN }, { clip_id: 'clip-b', at_ms: 16000, extra: true }, {}]) {
    expect(applyShowGrammarOperation(opened.document, 'split_clip', args).ok).toBe(false)
    expect(opened.document).toEqual(before)
  }
})
