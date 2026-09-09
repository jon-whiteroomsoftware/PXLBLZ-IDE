import { expect, it } from 'vitest'
import { showSplitClipFixture } from '@/test/showSplitClipFixture'
import { duplicateClipCommandOutcome } from '@/engine/showCommands/duplicateClip'
import { applyShowCommand } from '@/engine/showCommands/registry'
import { duplicateShowClipAfter, duplicateLinkedShowClipAfter } from '@/engine/showTimelineClipAuthoring'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { validateShowComposition, normalizeShowComposition } from '@/engine/showCompositionModel'
import { applyShowGrammarOperation } from '../grammar/registry'
import { openShowDocument } from '../grammar/openShow'

it.each([undefined, false, true])('pairs full manual/canonical/diagnostic records and export with linked %s', async linked => {
  const fixture = showSplitClipFixture()
  fixture.composition!.executionModel = 'deterministic-loop'
  const opened = openShowDocument(fixture)
  if (!opened.ok) throw new Error('open')
  const document = opened.document
  const before = structuredClone(document)
  const args = { clip_id: 'clip-ov', ...(linked === undefined ? {} : { linked }) }
  const canonical = duplicateClipCommandOutcome(document.show, args, kind => `${kind}-1`)
  const diagnostic = applyShowGrammarOperation(document, 'duplicate_clip', args)
  expect(canonical.ok).toBe(true)
  expect(diagnostic.ok, JSON.stringify(diagnostic)).toBe(true)
  if (!canonical.ok || !diagnostic.ok) throw new Error('duplicate')
  const owner = { kind: 'overlay' as const, sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'overlay-1', placementId: 'clip-ov' }
  const manual = linked ? duplicateLinkedShowClipAfter(document.show, document.show.composition!, { owner, newPlacementId: 'clip-1' }) : duplicateShowClipAfter(document.show, document.show.composition!, { owner, newPlacementId: 'clip-1', newInstanceId: 'instance-1' })
  const expected = structuredClone(before.show)
  if (!linked) delete expected.composition!.executionModel
  if (!linked) expected.composition!.patternInstances.push({ ...structuredClone(before.show.composition!.patternInstances.find(instance => instance.id === 'instance-ov')!), id: 'instance-1' })
  expected.composition!.scenes[0].zones[0].overlays[0].placements.push({ id: 'clip-1', instanceId: linked ? 'instance-ov' : 'instance-1', startMs: 8000, durationMs: 6000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } })
  expect(manual).toStrictEqual(expected.composition)
  expect(canonical.record).toStrictEqual({ ...expected, updatedAt: canonical.record.updatedAt })
  expect(diagnostic.document.show).toStrictEqual({ ...expected, updatedAt: diagnostic.document.show.updatedAt })
  expect(diagnostic.changes).toEqual(canonical.changes.map(({ command, ...change }) => ({ op: command, ...change })))
  expect(diagnostic.changes[0]).toMatchObject({ targetId: 'clip-1', details: { sourceClipId: 'clip-ov', linked: Boolean(linked) } })
  const { bundle } = buildShowFileBundle(diagnostic.document.show, { patterns: [], maps: [] }, { appVersion: '951-duplicate', exportedAt: '2026-09-09T00:00:00Z' })
  const reopened = (await parseShowFileBundle(await serializeShowFileBundle(bundle))).show
  expect(reopened).toEqual({ ...diagnostic.document.show, composition: normalizeShowComposition(expected, expected.composition!) })
  expect(validateShowComposition(reopened, reopened.composition!)).toEqual([])
  expect(document).toStrictEqual(before)
  const edited = applyShowGrammarOperation(diagnostic.document, 'set_clip_view', { clip_id: 'clip-1', brightness: 0.4 })
  if (!edited.ok) throw new Error(JSON.stringify(edited))
  const moved = applyShowGrammarOperation(edited.document, 'move_clip', { clip_id: 'clip-1', start_ms: 16000 })
  expect(moved.ok, JSON.stringify(moved)).toBe(true)
  if (!moved.ok) throw new Error('move')
  const expectedMoved = structuredClone(expected)
  expectedMoved.composition!.scenes[0].zones[0].overlays[0].placements[1].startMs = 16000
  expectedMoved.composition!.scenes[0].zones[0].overlays[0].placements[1].view!.brightness = 0.4
  expect(moved.document.show).toEqual({ ...expectedMoved, composition: normalizeShowComposition(expectedMoved, expectedMoved.composition!), updatedAt: moved.document.show.updatedAt })
})

it('both registries reject invalid input, protected/full/animated tails and Group children immutably', () => {
  const opened = openShowDocument(showSplitClipFixture())
  if (!opened.ok) throw new Error('open')
  const before = structuredClone(opened.document)
  for (const args of [{ clip_id: 'absent' }, { clip_id: 'group-use:group-main' }, { clip_id: 'clip-b' }, { clip_id: 'clip-ov', linked: 1 }, { clip_id: 'clip-ov', linked: null }, { clip_id: 'clip-ov', extra: true }, {}]) {
    expect(applyShowCommand(opened.document.show, 'duplicate_clip', args).ok).toBe(false)
    expect(applyShowGrammarOperation(opened.document, 'duplicate_clip', args).ok).toBe(false)
    expect(opened.document).toStrictEqual(before)
  }
})
