import { describe, expect, it } from 'vitest'
import type {
  ShowCompositionV1,
  ShowGroupDefinition,
  ShowPropertyAnimationTrack,
  ShowRecord,
} from './personalContentRecords'
import type { ShowClipInspectorValue } from './showClipInspectorModel'
import { createDefaultShow } from './showModel'
import {
  applyShowGroupPropertyAnimationChange,
  projectShowPropertyAnimationEditorContext,
  showPropertyAnimationGlobalSeconds,
  showPropertyAnimationLocalTimeMs,
} from './showPropertyAnimationEditorModel'

function inspectorValue(
  sceneId: string,
  placementId: string,
  instanceId: string,
): ShowClipInspectorValue {
  return {
    scope: 'scene-main',
    owner: { kind: 'scene-main', sceneId, zoneId: 'zone-1', placementId },
    pattern: { kind: 'stock', id: 'hue-wave' },
    patternName: 'Hue Wave',
    evaluationPolicy: 'live',
    presentation: { mode: 'live' },
    simulation: { timeScale: 1, timeOffsetMs: 0 },
    view: { mirror: false, phase: 0, brightness: 1 },
    transform: { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    viewport: { enabled: false, x: 0, y: 0, width: 1, height: 1 },
    effects: [],
    placementId,
    instanceId,
    local: { startMs: 0, durationMs: 1_000 },
  }
}

function brightnessTrack(
  id: string,
  placementId: string,
  fromTimeMs: number,
  toTimeMs: number,
): ShowPropertyAnimationTrack {
  return {
    id,
    target: { kind: 'placement-view', placementId, property: 'brightness' },
    keyframes: [
      { id: `${id}-from`, timeMs: fromTimeMs, value: 1, easing: { curve: 'linear' } },
      { id: `${id}-to`, timeMs: toTimeMs, value: 0, easing: { curve: 'linear' } },
    ],
  }
}

function indexedTracks(placementId: string): ShowPropertyAnimationTrack[] {
  return Array.from({ length: 11 }, (_, index) => index === 10
    ? {
        id: 'track-10-orphan',
        target: {
          kind: 'placement-effect' as const,
          placementId,
          effectId: 'missing-effect',
          effectKind: 'brightness' as const,
          parameterId: 'amount',
        },
        keyframes: brightnessTrack('track-10-orphan', placementId, 0, 1_000).keyframes,
      }
    : brightnessTrack(`track-${index}`, placementId, 0, 1_000))
}

function twoSceneShow(): ShowRecord {
  const show = createDefaultShow('show-animation-editor', 'Animation editor', 1)
  show.scenes[0].durationMs = 4_000
  show.scenes[1].durationMs = 6_000
  return show
}

describe('Property animation editor time projection (#648)', () => {
  it('round-trips Show-global seconds against ordinary Scene-relative storage', () => {
    const show = twoSceneShow()
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [{
        id: 'instance-2',
        pattern: { kind: 'stock', id: 'hue-wave' },
        patternName: 'Hue Wave',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [
        { sceneId: show.scenes[0].id, zones: [] },
        {
          sceneId: 'scene-2',
          propertyTracks: [brightnessTrack('brightness', 'placement-2', 500, 3_500)],
          zones: [{
            zoneId: 'zone-1',
            main: [{
              id: 'placement-2',
              instanceId: 'instance-2',
              startMs: 0,
              durationMs: 6_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            }],
            overlays: [],
          }],
        },
      ],
    }
    show.composition = composition

    const context = projectShowPropertyAnimationEditorContext(
      show,
      inspectorValue('scene-2', 'placement-2', 'instance-2'),
    )

    expect(context).toMatchObject({
      storageOwner: { kind: 'scene', sceneId: 'scene-2' },
      showTimeOffsetMs: 6_000,
      storageDurationMs: 6_000,
      instanceUseCount: 1,
    })
    expect(context?.tracks.map((track) => track.id)).toEqual(['brightness'])
    expect(showPropertyAnimationGlobalSeconds(context!, 500)).toBe(6.5)
    expect(showPropertyAnimationLocalTimeMs(context!, 9.5)).toBe(3_500)
  })

  it('does not assign a double-digit Scene track issue to a shorter index prefix', () => {
    const show = twoSceneShow()
    const sceneId = show.scenes[0].id
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [{
        id: 'instance-indexed',
        pattern: { kind: 'stock', id: 'hue-wave' },
        patternName: 'Hue Wave',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [{
        sceneId,
        propertyTracks: indexedTracks('placement-indexed'),
        zones: [{
          zoneId: 'zone-1',
          main: [{
            id: 'placement-indexed',
            instanceId: 'instance-indexed',
            startMs: 0,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      }],
    }
    show.composition = composition

    const context = projectShowPropertyAnimationEditorContext(
      show,
      inspectorValue(sceneId, 'placement-indexed', 'instance-indexed'),
    )

    expect(context?.trackIssues['track-1'].map((issue) => issue.code)).not.toContain('missing-effect')
    expect(context?.trackIssues['track-10-orphan'].map((issue) => issue.code)).toContain('missing-effect')
  })

  it('round-trips a Group child through the selected occurrence while retaining definition-local storage', () => {
    const show = twoSceneShow()
    const definition: ShowGroupDefinition = {
      id: 'definition-1',
      name: 'Shared phrase',
      patternInstances: [{
        id: 'inside-instance',
        pattern: { kind: 'stock', id: 'hue-wave' },
        patternName: 'Hue Wave',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'inside-placement',
        instanceId: 'inside-instance',
        layerOffset: 0,
        startMs: 250,
        durationMs: 2_750,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }, {
        id: 'linked-placement',
        instanceId: 'inside-instance',
        layerOffset: 1,
        startMs: 3_000,
        durationMs: 1_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
      propertyTracks: [brightnessTrack('group-brightness', 'inside-placement', 500, 3_500)],
    }
    show.composition = {
      version: 1,
      patternInstances: [],
      scenes: [
        { sceneId: show.scenes[0].id, zones: [] },
        { sceneId: 'scene-2', zones: [{ zoneId: 'zone-1', main: [], overlays: [] }] },
      ],
      groupDefinitions: [definition],
      groupOccurrences: [{
        id: 'occurrence-a',
        definitionId: definition.id,
        sceneId: 'scene-2',
        zoneId: 'zone-1',
        startMs: 1_000,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      }, {
        id: 'occurrence-b',
        definitionId: definition.id,
        sceneId: 'scene-2',
        zoneId: 'zone-1',
        startMs: 5_000,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      }],
    }

    const context = projectShowPropertyAnimationEditorContext(
      show,
      inspectorValue('scene-2', 'inside-placement', 'inside-instance'),
      { occurrenceId: 'occurrence-a', placementId: 'inside-placement' },
    )

    expect(context).toMatchObject({
      storageOwner: {
        kind: 'group',
        definitionId: 'definition-1',
        occurrenceId: 'occurrence-a',
      },
      showTimeOffsetMs: 7_000,
      storageDurationMs: 4_000,
      instanceUseCount: 4,
    })
    expect(context?.tracks.map((track) => track.id)).toEqual(['group-brightness'])
    expect(showPropertyAnimationGlobalSeconds(context!, 500)).toBe(7.5)
    expect(showPropertyAnimationLocalTimeMs(context!, 10.5)).toBe(3_500)
    expect(definition.propertyTracks?.[0].keyframes.map((keyframe) => keyframe.timeMs))
      .toEqual([500, 3_500])
  })

  it('does not assign a double-digit materialized Group issue to a shorter index prefix', () => {
    const show = twoSceneShow()
    const sceneId = show.scenes[0].id
    const definition: ShowGroupDefinition = {
      id: 'definition-indexed',
      name: 'Indexed phrase',
      patternInstances: [{
        id: 'inside-instance',
        pattern: { kind: 'stock', id: 'hue-wave' },
        patternName: 'Hue Wave',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'inside-placement',
        instanceId: 'inside-instance',
        layerOffset: 0,
        startMs: 0,
        durationMs: 4_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
      propertyTracks: indexedTracks('inside-placement'),
    }
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [],
      scenes: [{ sceneId, zones: [{ zoneId: 'zone-1', main: [], overlays: [] }] }],
      groupDefinitions: [definition],
      groupOccurrences: [{
        id: 'occurrence-indexed',
        definitionId: definition.id,
        sceneId,
        zoneId: 'zone-1',
        startMs: 0,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      }],
    }
    show.composition = composition

    const context = projectShowPropertyAnimationEditorContext(
      show,
      inspectorValue(sceneId, 'inside-placement', 'inside-instance'),
      { occurrenceId: 'occurrence-indexed', placementId: 'inside-placement' },
    )

    expect(context?.trackIssues['track-1'].map((issue) => issue.code)).not.toContain('missing-effect')
    expect(context?.trackIssues['track-10-orphan'].map((issue) => issue.code)).toContain('missing-effect')
  })

  it('adds, edits, and removes one Group-definition track without materializing Show-global time', () => {
    const show = twoSceneShow()
    const definition: ShowGroupDefinition = {
      id: 'definition-1',
      name: 'Shared phrase',
      patternInstances: [{
        id: 'inside-instance',
        pattern: { kind: 'stock', id: 'hue-wave' },
        patternName: 'Hue Wave',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'inside-placement',
        instanceId: 'inside-instance',
        layerOffset: 0,
        startMs: 0,
        durationMs: 4_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [],
      scenes: [
        { sceneId: show.scenes[0].id, zones: [] },
        { sceneId: 'scene-2', zones: [{ zoneId: 'zone-1', main: [], overlays: [] }] },
      ],
      groupDefinitions: [definition],
      groupOccurrences: [{
        id: 'occurrence-a',
        definitionId: definition.id,
        sceneId: 'scene-2',
        zoneId: 'zone-1',
        startMs: 1_000,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      }],
    }
    show.composition = composition
    let id = 0
    const nextId = () => `generated-${++id}`
    const owner = {
      kind: 'group' as const,
      definitionId: definition.id,
      occurrenceId: 'occurrence-a',
    }

    const added = applyShowGroupPropertyAnimationChange(show, composition, owner, {
      kind: 'add-track',
      target: { kind: 'placement-view', placementId: 'inside-placement', property: 'brightness' },
      initialValue: 1,
      keyframes: [
        { timeMs: 500, value: 0.75, easing: { curve: 'linear' } },
        { timeMs: 3_500, value: 0.25, easing: { curve: 'linear' } },
      ],
    }, nextId)
    const authored = added.groupDefinitions?.[0].propertyTracks?.[0]
    expect(authored?.keyframes.map(({ timeMs, value }) => ({ timeMs, value }))).toEqual([
      { timeMs: 500, value: 0.75 },
      { timeMs: 3_500, value: 0.25 },
    ])

    const updated = applyShowGroupPropertyAnimationChange(show, added, owner, {
      kind: 'update-keyframe',
      trackId: authored!.id,
      keyframeId: authored!.keyframes[1].id,
      changes: { timeMs: 3_000 },
    }, nextId)
    expect(updated.groupDefinitions?.[0].propertyTracks?.[0].keyframes[1].timeMs).toBe(3_000)

    const removed = applyShowGroupPropertyAnimationChange(show, updated, owner, {
      kind: 'delete-track',
      trackId: authored!.id,
    }, nextId)
    expect(removed.groupDefinitions?.[0].propertyTracks).toBeUndefined()

    // Multi-keyframe editing (#363): interior keyframes insert in time order,
    // reject duplicate times through validation, and can be removed only
    // while more than two keyframes remain.
    const middle = applyShowGroupPropertyAnimationChange(show, added, owner, {
      kind: 'add-keyframe',
      trackId: authored!.id,
      keyframe: { timeMs: 2_000, value: 1, easing: { curve: 'sine', direction: 'in-out' } },
    }, nextId)
    const middleTrack = middle.groupDefinitions?.[0].propertyTracks?.[0]
    expect(middleTrack?.keyframes.map(({ timeMs, value }) => ({ timeMs, value }))).toEqual([
      { timeMs: 500, value: 0.75 },
      { timeMs: 2_000, value: 1 },
      { timeMs: 3_500, value: 0.25 },
    ])

    const duplicateTime = applyShowGroupPropertyAnimationChange(show, middle, owner, {
      kind: 'add-keyframe',
      trackId: authored!.id,
      keyframe: { timeMs: 2_000, value: 0.5, easing: { curve: 'linear' } },
    }, nextId)
    expect(duplicateTime).toBe(middle)

    const trimmed = applyShowGroupPropertyAnimationChange(show, middle, owner, {
      kind: 'delete-keyframe',
      trackId: authored!.id,
      keyframeId: middleTrack!.keyframes[1].id,
    }, nextId)
    expect(trimmed.groupDefinitions?.[0].propertyTracks?.[0].keyframes).toHaveLength(2)

    const refused = applyShowGroupPropertyAnimationChange(show, trimmed, owner, {
      kind: 'delete-keyframe',
      trackId: authored!.id,
      keyframeId: trimmed.groupDefinitions![0].propertyTracks![0].keyframes[0].id,
    }, nextId)
    expect(refused).toBe(trimmed)
  })

  it('removes one orphaned Group track even when another invalid track remains', () => {
    const show = twoSceneShow()
    const definition: ShowGroupDefinition = {
      id: 'definition-orphans',
      name: 'Damaged phrase',
      patternInstances: [],
      placements: [],
      propertyTracks: [
        brightnessTrack('remove-me', 'missing-a', 0, 1_000),
        brightnessTrack('keep-me', 'missing-b', 0, 1_000),
      ],
    }
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [],
      scenes: [
        { sceneId: show.scenes[0].id, zones: [] },
        { sceneId: 'scene-2', zones: [{ zoneId: 'zone-1', main: [], overlays: [] }] },
      ],
      groupDefinitions: [definition],
      groupOccurrences: [{
        id: 'occurrence-orphans',
        definitionId: definition.id,
        sceneId: 'scene-2',
        zoneId: 'zone-1',
        startMs: 0,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      }],
    }
    show.composition = composition

    const next = applyShowGroupPropertyAnimationChange(show, composition, {
      kind: 'group',
      definitionId: definition.id,
      occurrenceId: 'occurrence-orphans',
    }, {
      kind: 'delete-track',
      trackId: 'remove-me',
    }, () => 'unused')

    expect(next.groupDefinitions?.[0].propertyTracks?.map((track) => track.id)).toEqual(['keep-me'])
  })
})
