import { describe, expect, it } from 'vitest'
import { resizeBoundaryShow } from '../agent-harness/baseline/fixtures'
import { validateShowComposition } from './showCompositionModel'
import { updateShowClipInspector, type ShowClipInspectorOwner } from './showClipInspectorModel'
import { resizeShowClipExactly } from './showExactClipResize'
import { previewShowClipResize, resizeShowClipManually } from './showManualClipResize'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import { applyShowCommand } from './showCommands/registry'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from './showFileBundle'
import type { ShowRecord } from './personalContentRecords'

function owner(show: ShowRecord, clipId: string): ShowClipInspectorOwner {
  const clip = projectShowUnifiedTimeline(show, show.composition!).zones.flatMap(zone => zone.layers.flatMap(layer => layer.clips)).find(clip => clip.id === clipId)!
  return clip.kind === 'main'
    ? { kind: 'scene-main', sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clipId }
    : { kind: 'scene-overlay', sceneId: clip.sceneId, zoneId: clip.zoneId, layerId: clip.layerId!, placementId: clipId }
}
function withoutStamp(show: ShowRecord) { return { ...show, updatedAt: 0 } }

describe('manual resize consumer convergence (#950)', () => {
  it.each([false, true])('pairs fixture R exact inspector and canonical command including full preservation (overlay=%s)', async overlay => {
    const show = resizeBoundaryShow()
    show.cells[0].restartOnEntry = false
    const zone = show.composition!.scenes[0].zones[0]
    if (overlay) {
      zone.overlays = [{ id: 'overlay', name: 'Overlay', placements: zone.main.map(placement => ({ ...placement, opacity: 0.7 })) }]
      zone.main = []
    }
    show.composition!.scenes[0].propertyTracks = [{ id: 'track', target: { kind: 'instance-time-scale', instanceId: 'resize-instance' }, keyframes: [{ id: 'k1', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'k2', timeMs: 20_000, value: 2, easing: { curve: 'linear' } }] }]
    const before = structuredClone(show)
    for (const durationMs of [7999, 8000, 8001, 12000, 4000, 0, -1, 4000.4]) {
      const manual = updateShowClipInspector(show, owner(show, 'resize-a'), { local: { durationMs } })
      const command = applyShowCommand(show, 'resize_clip', { clip_id: 'resize-a', duration_ms: durationMs })
      if (durationMs === 7999 || durationMs === 8000) {
        expect(command.ok).toBe(true)
        if (!command.ok) throw new Error('expected exact command')
        const expected = structuredClone(before)
        ;(overlay ? expected.composition!.scenes[0].zones[0].overlays[0].placements : expected.composition!.scenes[0].zones[0].main)[0].durationMs = durationMs
        expect(withoutStamp(manual)).toEqual(withoutStamp(expected))
        expect(withoutStamp(command.record)).toEqual(withoutStamp(manual))
        expect(validateShowComposition(manual, manual.composition!)).toEqual([])
        const { bundle } = buildShowFileBundle(manual, { patterns: [], maps: [] }, { appVersion: 'test', exportedAt: '2026-09-08T00:00:00Z' })
        expect((await parseShowFileBundle(await serializeShowFileBundle(bundle))).show).toEqual(bundle.show)
      } else {
        expect(manual).toBe(show)
        expect(command.ok).toBe(durationMs === 4000)
      }
      expect(show).toEqual(before)
    }
    const preview = previewShowClipResize(show, show.composition!, { clipId: 'resize-a', durationMs: 12000 })
    const previewClip = projectShowUnifiedTimeline(show, preview).zones.flatMap(zone => zone.layers.flatMap(layer => layer.clips)).find(clip => clip.id === 'resize-a')!
    expect([previewClip.startMs, previewClip.durationMs]).toEqual([0, 8000])
    const committed = resizeShowClipManually(show, show.composition!, { clipId: 'resize-a', globalStartMs: previewClip.startMs, durationMs: previewClip.durationMs })
    expect(committed.composition).toEqual(preview)
    expect(resizeShowClipManually(committed, committed.composition!, { clipId: 'resize-a', durationMs: 8000 })).toBe(committed)
    expect(resizeShowClipManually(show, show.composition!, { clipId: 'missing', durationMs: 4000 })).toBe(show)
  })

  it('retargets a valid multi-Scene connected Clip through the inspector with complete record parity', () => {
    const show = resizeBoundaryShow()
    show.cells[0].restartOnEntry = false
    const composition = show.composition!
    show.scenes = [show.scenes[0], { id: 'second', name: 'Second', durationMs: 10000 }, { id: 'third', name: 'Third', durationMs: 10000 }]
    show.scenes[0].durationMs = 10000
    const a = composition.scenes[0].zones[0].main[0]
    composition.scenes = show.scenes.map((scene, index) => ({ sceneId: scene.id, zones: [{ zoneId: 'z1', main: index === 0 ? [{ ...a, startMs: 9000, durationMs: 1000 }] : index === 1 ? [{ ...a, id: 'resize-a--span-second', logicalClipId: 'resize-a', durationMs: 3000 }, { ...a, id: 'resize-b', startMs: 4000, durationMs: 2000 }] : [], overlays: [] }] }))
    composition.transitions = [{ id: 'ab', fromPlacementId: 'resize-a--span-second', toPlacementId: 'resize-b', durationMs: 1000, kind: 'crossfade', crossfadePolicy: 'live-live', easing: { curve: 'linear' } }]
    expect(validateShowComposition(show, composition)).toEqual([])
    const before = structuredClone(show)
    const manual = updateShowClipInspector(show, owner(show, 'resize-a'), { local: { durationMs: 12000 } })
    const canonical = applyShowCommand(show, 'resize_clip', { clip_id: 'resize-a', duration_ms: 12000 })
    expect(canonical.ok).toBe(true)
    if (!canonical.ok) throw new Error('expected connected resize')
    expect(withoutStamp(manual)).toEqual(withoutStamp(canonical.record))
    expect(projectShowUnifiedTimeline(manual, manual.composition!).zones[0].layers[0].clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([['resize-a', 9000, 12000], ['resize-b', 22000, 2000]])
    expect(manual.composition!.transitions).toEqual([{ ...composition.transitions[0], fromPlacementId: 'resize-a--span-third' }])
    expect(validateShowComposition(manual, manual.composition!)).toEqual([])
    expect(show).toEqual(before)
  })

  it('qualifies incoming Transition-to-Cut as manual-only while preserving other connected data', () => {
    const show = resizeBoundaryShow()
    show.cells[0].restartOnEntry = false
    const composition = show.composition!
    const a = composition.scenes[0].zones[0].main[0]
    composition.scenes[0].zones[0].main = [{ ...a, durationMs: 2000 }, { ...a, id: 'resize-b', startMs: 3000, durationMs: 2000 }, { ...a, id: 'resize-c', startMs: 6000, durationMs: 2000 }]
    composition.transitions = [['ab', 'resize-a', 'resize-b'], ['bc', 'resize-b', 'resize-c']].map(([id, fromPlacementId, toPlacementId]) => ({ id, fromPlacementId, toPlacementId, durationMs: 1000, kind: 'crossfade', crossfadePolicy: 'live-live', easing: { curve: 'linear' } }))
    const before = structuredClone(show)
    for (const [globalStartMs, durationMs] of [[3500, 1500], [3000, 1000], [3000, 3000]]) {
      const manual = resizeShowClipManually(show, composition, { clipId: 'resize-b', globalStartMs, durationMs })
      const command = applyShowCommand(show, 'resize_clip', { clip_id: 'resize-b', start_ms: globalStartMs, duration_ms: durationMs })
      expect(command.ok).toBe(true)
      if (command.ok) expect(withoutStamp(manual)).toEqual(withoutStamp(command.record))
      expect(validateShowComposition(manual, manual.composition!)).toEqual([])
    }
    const request = { clipId: 'resize-b', globalStartMs: 2000, durationMs: 3000 }
    expect(resizeShowClipExactly(show, composition, request)).toMatchObject({ status: 'refused', manualResidual: 'incoming-transition-cut' })
    const manual = resizeShowClipManually(show, composition, request)
    const expected = structuredClone(before)
    expected.composition!.scenes[0].zones[0].main[1] = { ...a, id: 'resize-b', startMs: 2000, durationMs: 3000 }
    expected.composition!.transitions = [composition.transitions[1]]
    expect(manual).toEqual(expected)
    expect(show).toEqual(before)
  })
})
