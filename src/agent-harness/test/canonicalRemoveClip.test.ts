import { expect, it } from 'vitest'
import { showRemoveClipFixture } from '@/test/showRemoveClipFixture'
import { applyShowCommand } from '@/engine/showCommands/registry'
import { deleteShowClipWithLayerTransitions } from '@/engine/showLayerTransitionAuthoring'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { validateShowComposition } from '@/engine/showCompositionModel'
import { applyShowGrammarOperation } from '../grammar/registry'
import { openShowDocument } from '../grammar/openShow'

it.each(['clip-a', 'clip-b', 'clip-ov'])('pairs complete manual, canonical, diagnostic and reopened output for %s', async clipId => {
  const opened = openShowDocument(showRemoveClipFixture())
  expect(opened.ok, JSON.stringify(opened)).toBe(true)
  if (!opened.ok) throw new Error('open')
  const document = opened.document
  const before = structuredClone(document)
  const canonical = applyShowCommand(document.show, 'remove_clip', { clip_id: clipId })
  const diagnostic = applyShowGrammarOperation(document, 'remove_clip', { clip_id: clipId })
  expect(canonical.ok).toBe(true)
  expect(diagnostic.ok, JSON.stringify(diagnostic)).toBe(true)
  if (!canonical.ok || !diagnostic.ok) throw new Error('remove')
  const owner = clipId === 'clip-ov'
    ? { kind: 'overlay' as const, sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'overlay-1', placementId: clipId }
    : { kind: 'main' as const, sceneId: 'scene-1', zoneId: 'zone-1', placementId: clipId }
  expect(deleteShowClipWithLayerTransitions(document.show, document.show.composition!, owner)).toEqual(canonical.record.composition)
  expect({ ...diagnostic.document.show, updatedAt: canonical.record.updatedAt }).toEqual(canonical.record)
  const { bundle } = buildShowFileBundle(diagnostic.document.show, { patterns: [], maps: [] }, { appVersion: '951-remove', exportedAt: '2026-09-09T00:00:00Z' })
  const reopened = (await parseShowFileBundle(await serializeShowFileBundle(bundle))).show
  expect(reopened.composition).toEqual(diagnostic.document.show.composition)
  expect(validateShowComposition(reopened, reopened.composition!)).toEqual([])
  expect(document).toEqual(before)
  for (const args of [{ clip_id: 'absent' }, { clip_id: 'group-use:group-main' }, { clip_id: 1 }, { clip_id: clipId, extra: true }, {}]) {
    expect(applyShowGrammarOperation(document, 'remove_clip', args).ok).toBe(false)
    expect(document).toEqual(before)
  }
})
