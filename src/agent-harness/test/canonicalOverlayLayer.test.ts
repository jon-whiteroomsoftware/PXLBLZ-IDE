import { expect, it } from 'vitest'
import { showOverlayLayerFixture } from '@/test/showOverlayLayerFixture'
import { overlayLayerCommandOutcome, createOverlayLayerCommand } from '@/engine/showCommands/overlayLayer'
import { addShowOverlayLayerAcrossTimeline } from '@/engine/showTimelineClipAuthoring'
import { applyShowGrammarOperation } from '../grammar/registry'
import { openShowDocument } from '../grammar/openShow'
import { validateShowComposition } from '@/engine/showCompositionModel'

it('pairs complete canonical, diagnostic and manual results with caller-local IDs, then adds at overlay zero', () => {
  const opened = openShowDocument(showOverlayLayerFixture())
  expect(opened.ok, JSON.stringify(opened)).toBe(true)
  if (!opened.ok) throw new Error('open failed')
  const document = opened.document
  const before = structuredClone(document)
  let index = 0
  const canonical = overlayLayerCommandOutcome(document.show, { zone_id: 'zone-1' }, () => `layer-${++index}`)
  const diagnostic = applyShowGrammarOperation(document, 'add_overlay_layer', { zone_id: 'zone-1' })
  expect(canonical.ok).toBe(true)
  expect(diagnostic.ok).toBe(true)
  if (!canonical.ok || !diagnostic.ok) throw new Error('refused')
  const manual = addShowOverlayLayerAcrossTimeline(document.show, document.show.composition!, { zoneId: 'zone-1', layers: [
    { sceneId: 'scene-1', layerId: 'layer-1' }, { sceneId: 'scene-2', layerId: 'layer-2' },
  ] })
  expect(manual).toEqual(canonical.record.composition)
  expect({ ...diagnostic.document.show, updatedAt: canonical.record.updatedAt }).toEqual(canonical.record)
  expect(document).toEqual(before)
  expect(diagnostic.changes[0].details).toEqual({ layerIdsBySceneId: { 'scene-1': 'layer-1', 'scene-2': 'layer-2' } })
  expect(createOverlayLayerCommand().touches).toEqual(['/composition/scenes/*/zones/*/overlays', '/updatedAt'])
  const clipped = applyShowGrammarOperation(diagnostic.document, 'add_clip', { zone_id: 'zone-1', overlay_layer_index: 0, start_ms: 0, duration_ms: 1000, pattern_kind: 'stock', pattern_id: 'CometLoom' })
  expect(clipped.ok).toBe(true)
  if (clipped.ok) {
    expect(clipped.document.show.composition!.scenes[0].zones[0].overlays[0].placements).toHaveLength(1)
    expect(validateShowComposition(clipped.document.show, clipped.document.show.composition!)).toEqual([])
  }
})
