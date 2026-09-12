import { describe, expect, it } from 'vitest'
import { showLayerCommandFixture } from '../test/showLayerCommandFixture'
import { validateShowComposition } from './showCompositionModel'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { createDefaultShow } from './showModel'
import { compileShowForPreview } from './showPreviewArtifact'
import {
  removeEmptyShowOverlayLayerAcrossTimeline,
  reorderShowOverlayLayerAcrossTimeline,
} from './showOverlayLayerAuthoring'

function reordered<T>(values: T[], from: number, to: number): T[] {
  const next = [...values]
  const [selected] = next.splice(from, 1)
  next.splice(to, 0, selected)
  return next
}

function expectExactLayerCandidate(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected)
}

describe('timeline-wide overlay Layer authoring (#1013, #1014)', () => {
  it.each([
    [0, 2],
    [2, 0],
    [1, 2],
    [2, 1],
  ])('reorders overlay %i to final index %i across every Scene without changing contents', (fromIndex, toIndex) => {
    const show = showLayerCommandFixture()
    const composition = show.composition!
    const before = structuredClone(composition)
    const result = reorderShowOverlayLayerAcrossTimeline(show, composition, {
      zoneId: 'zone-1', fromIndex, toIndex,
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const expected = structuredClone(before)
    for (const scene of expected.scenes) {
      const zone = scene.zones.find(candidate => candidate.zoneId === 'zone-1')!
      zone.overlays = reordered(zone.overlays, fromIndex, toIndex)
    }
    expectExactLayerCandidate(result.composition, expected)
    expect(result.layerIdsBySceneId).toEqual(Object.fromEntries(before.scenes.map(scene => [
      scene.sceneId,
      scene.zones[0].overlays[fromIndex].id,
    ])))
    const order = reordered([0, 1, 2], fromIndex, toIndex)
    expect(result.indexMap).toEqual(Object.fromEntries(order.map((oldIndex, newIndex) => [oldIndex, newIndex])))
    expect(validateShowComposition(show, result.composition)).toEqual([])
    expect(composition).toEqual(before)
  })

  it('validates topology and indices before returning a same-index no-op', () => {
    const show = showLayerCommandFixture()
    const composition = show.composition!
    expect(reorderShowOverlayLayerAcrossTimeline(show, composition, { zoneId: 'zone-1', fromIndex: 1, toIndex: 1 }))
      .toEqual({ status: 'noop', composition })

    const cases = [
      () => ({ ...show, composition: { ...composition, scenes: [] } }),
      () => {
        const value = structuredClone(show)
        value.composition!.scenes[1].zones[0].overlays.pop()
        return value
      },
      () => {
        const value = structuredClone(show)
        value.composition!.groupDefinitions = [{
          id: 'definition', name: 'Group', patternInstances: [], placements: [],
        }]
        value.composition!.groupOccurrences = [{
          id: 'occurrence', definitionId: 'definition', sceneId: 'scene-1', zoneId: 'zone-1',
          startMs: 0, baseLayer: 0, translationX: 0, translationY: 0,
        }]
        return value
      },
    ]
    for (const make of cases) {
      const value = make()
      const before = structuredClone(value)
      expect(reorderShowOverlayLayerAcrossTimeline(value, value.composition!, {
        zoneId: 'zone-1', fromIndex: 1, toIndex: 1,
      })).toMatchObject({ status: 'refused' })
      expect(value).toEqual(before)
    }
  })

  it('allows Groups outside the target Zone and preserves them byte-for-byte', () => {
    const show = showLayerCommandFixture()
    show.composition!.groupDefinitions = [{
      id: 'other-definition', name: 'Other Zone Group', patternInstances: [], placements: [],
    }]
    show.composition!.groupOccurrences = [{
      id: 'other-occurrence', definitionId: 'other-definition', sceneId: 'scene-1', zoneId: 'zone-2',
      startMs: 0, baseLayer: 0, translationX: 0, translationY: 0,
    }]
    const beforeGroups = structuredClone({
      definitions: show.composition!.groupDefinitions,
      occurrences: show.composition!.groupOccurrences,
    })
    const result = reorderShowOverlayLayerAcrossTimeline(show, show.composition!, {
      zoneId: 'zone-1', fromIndex: 0, toIndex: 2,
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect({
      definitions: result.composition.groupDefinitions,
      occurrences: result.composition.groupOccurrences,
    }).toEqual(beforeGroups)
  })

  it.each([0, 1, 2])('removes exactly one empty overlay at index %i and compacts survivors', (layerIndex) => {
    const show = showLayerCommandFixture()
    for (const scene of show.composition!.scenes) scene.zones[0].overlays[0].placements = []
    const composition = show.composition!
    const before = structuredClone(composition)
    const result = removeEmptyShowOverlayLayerAcrossTimeline(show, composition, {
      zoneId: 'zone-1', layerIndex,
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const expected = structuredClone(before)
    for (const scene of expected.scenes) scene.zones[0].overlays.splice(layerIndex, 1)
    expect(result.composition).toEqual(expected)
    expect(result.indexMap[layerIndex]).toBeNull()
    expect(validateShowComposition(show, result.composition)).toEqual([])
    expect(composition).toEqual(before)
  })

  it('refuses a Layer occupied only in a later Scene', () => {
    const show = showLayerCommandFixture()
    const later = show.composition!.scenes[1].zones[0].overlays[1]
    later.placements.push({
      id: 'later-clip', instanceId: 'instance-a', startMs: 0,
      durationMs: 1_000, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 },
    })
    const before = structuredClone(show)
    expect(removeEmptyShowOverlayLayerAcrossTimeline(show, show.composition!, {
      zoneId: 'zone-1', layerIndex: 1,
    })).toMatchObject({
      status: 'refused', code: 'layer-not-empty', candidates: ['later-clip'],
    })
    expect(show).toEqual(before)
  })

  it('reports each logical occupant once when one Clip spans Scenes', () => {
    const show = showLayerCommandFixture()
    show.transitions = [{
      id: 'scene-cut', afterSceneId: 'scene-1', kind: 'cut', durationMs: 0,
      easing: { curve: 'linear' },
    }]
    for (const [sceneIndex, scene] of show.composition!.scenes.entries()) {
      scene.zones[0].overlays[1].placements.push({
        id: sceneIndex === 0 ? 'shared-logical-clip' : `shared-logical-clip--span-${scene.sceneId}`,
        ...(sceneIndex > 0 ? { logicalClipId: 'shared-logical-clip' } : {}),
        instanceId: 'instance-a',
        startMs: sceneIndex === 0 ? 29_000 : 0,
        durationMs: 1_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      })
    }
    expect(validateShowComposition(show, show.composition!)).toEqual([])
    expect(removeEmptyShowOverlayLayerAcrossTimeline(show, show.composition!, {
      zoneId: 'zone-1', layerIndex: 1,
    })).toMatchObject({
      status: 'refused', code: 'layer-not-empty', candidates: ['shared-logical-clip'],
    })
  })

  it.each([
    ['first Scene only', (candidate: ReturnType<typeof showLayerCommandFixture>) => {
      candidate.composition!.scenes[1].zones[0].overlays = showLayerCommandFixture().composition!.scenes[1].zones[0].overlays
    }],
    ['nested placement mutation', (candidate: ReturnType<typeof showLayerCommandFixture>) => {
      candidate.composition!.scenes[0].zones[0].overlays[2].placements[0].durationMs += 1
    }],
    ['wrong other Zone mutation', (candidate: ReturnType<typeof showLayerCommandFixture>) => {
      candidate.composition!.scenes[0].zones[1].overlays[0].name = 'Changed unrelated Layer'
    }],
  ] as const)('full-record preservation oracle rejects the %s fault', (_name, mutate) => {
    const before = showLayerCommandFixture()
    const result = reorderShowOverlayLayerAcrossTimeline(before, before.composition!, {
      zoneId: 'zone-1', fromIndex: 0, toIndex: 2,
    })
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const faulty = { ...before, composition: structuredClone(result.composition) }
    mutate(faulty)
    expect(() => expectExactLayerCandidate(faulty.composition, result.composition)).toThrow()
  })

  it('changes the rendered opaque top Layer while Main remains underneath', () => {
    const show = createDefaultShow('layer-composite', 'Layer composite', 1)
    const patterns = [
      { id: 'red', name: 'Red', src: 'export function render2D(index, x, y) { rgb(1, 0, 0) }', controls: {}, updatedAt: 1 },
      { id: 'green', name: 'Green', src: 'export function render2D(index, x, y) { rgb(0, 1, 0) }', controls: {}, updatedAt: 1 },
      { id: 'blue', name: 'Blue', src: 'export function render2D(index, x, y) { rgb(0, 0, 1) }', controls: {}, updatedAt: 1 },
    ]
    show.composition = {
      version: 1,
      patternInstances: patterns.map(pattern => ({
        id: pattern.id,
        pattern: { kind: 'user' as const, id: pattern.id },
        patternName: pattern.name,
        time: { timeScale: 1, timeOffsetMs: 0 },
      })),
      scenes: show.scenes.map(scene => ({
        sceneId: scene.id,
        zones: [{
          zoneId: 'zone-1',
          main: [{ id: `red-${scene.id}`, instanceId: 'red', startMs: 0, durationMs: scene.durationMs, view: { mirror: false, phase: 0, brightness: 1 } }],
          overlays: [
            { id: `blue-${scene.id}`, name: 'Blue top', placements: [{ id: `blue-clip-${scene.id}`, instanceId: 'blue', startMs: 0, durationMs: scene.durationMs, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } }] },
            { id: `green-${scene.id}`, name: 'Green lower', placements: [{ id: `green-clip-${scene.id}`, instanceId: 'green', startMs: 0, durationMs: scene.durationMs, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } }] },
          ],
        }],
      })),
    }
    const moved = reorderShowOverlayLayerAcrossTimeline(show, show.composition, {
      zoneId: 'zone-1', fromIndex: 0, toIndex: 1,
    })
    expect(moved.status).toBe('changed')
    if (moved.status !== 'changed') return
    const rendered = (composition: typeof show.composition) => {
      const compiled = compileShowForPreview({ ...show, composition }, patterns, undefined, {}, { stageDimension: 2 })
      expect(compiled.error).toBeNull()
      const runtime = createFastReplayRuntime({
        code: compiled.artifact!.code,
        metadata: compiled.artifact!.metadata,
        dimension: nativeDimension(compiled.artifact!.metadata.renderFns),
      }, { mapPoints: [{ sample: [0, 0] }], randomSeed: 1 })
      return runtime.advanceTo(500, { stepMs: 1000 / 60 }).pixels[0]
    }
    expect(rendered(show.composition)).toEqual([0, 0, 1])
    expect(rendered(moved.composition)).toEqual([0, 1, 0])
  })
})
