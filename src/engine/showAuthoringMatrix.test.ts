import { describe, expect, it } from 'vitest'
import { addShowScene, addShowZone, createDefaultShow } from './showModel'
import type {
  ShowCompositionV1,
  ShowPatternInstance,
  ShowRecord,
} from './personalContentRecords'
import { updateShowClipInspector } from './showClipInspectorModel'
import { deleteShowMainPlacement } from './showCompositionModel'
import {
  insertShowLayerTransition,
  moveShowConnectedClipAtGlobalTime,
} from './showLayerTransitionAuthoring'
import {
  duplicateShowClipAfter,
  moveShowClipAtGlobalTime,
  resizeShowClipAtGlobalTime,
  splitShowClipAtGlobalTime,
} from './showTimelineClipAuthoring'
import type { ShowUnifiedTimelineProjection } from './showUnifiedTimelineProjection'
import {
  expectAcceptedShowAuthoringEdit,
  expectRefusedShowAuthoringEdit,
} from '@/test/showAuthoringContract'

const patternInstance: ShowPatternInstance = {
  id: 'instance-a',
  pattern: { kind: 'stock', id: 'Rings' },
  patternName: 'Rings',
  time: { timeScale: 1, timeOffsetMs: 0 },
}

function mainFixture(): {
  show: ShowRecord
  composition: ShowCompositionV1
} {
  const show = createDefaultShow('show-authoring-matrix', 'Authoring matrix', 1)
  return {
    show,
    composition: {
      version: 1,
      patternInstances: [patternInstance],
      scenes: show.scenes.map((scene, sceneIndex) => ({
        sceneId: scene.id,
        zones: [{
          zoneId: show.zones[0].id,
          main: sceneIndex === 0 ? [{
            id: 'clip-a',
            instanceId: patternInstance.id,
            startMs: 2_000,
            durationMs: 6_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
    },
  }
}

function overlayFixture(): {
  show: ShowRecord
  composition: ShowCompositionV1
} {
  const { show, composition } = mainFixture()
  const placement = composition.scenes[0].zones[0].main.pop()!
  composition.scenes.forEach((scene, sceneIndex) => {
    scene.zones[0].overlays = [{
      id: `layer-front-${sceneIndex + 1}`,
      name: 'Front',
      placements: sceneIndex === 0
        ? [{ ...placement, opacity: 0.75 }]
        : [],
    }]
  })
  return { show, composition }
}

function twoZoneFixture(): {
  show: ShowRecord
  composition: ShowCompositionV1
} {
  const show = addShowZone(
    createDefaultShow('show-authoring-two-zones', 'Authoring two zones', 1),
    { name: 'accent' },
  )
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [patternInstance],
    scenes: show.scenes.map((scene, sceneIndex) => ({
      sceneId: scene.id,
      zones: show.zones.map((zone, zoneIndex) => ({
        zoneId: zone.id,
        main: sceneIndex === 0 && zoneIndex === 0
          ? [{
              id: 'clip-a',
              instanceId: patternInstance.id,
              startMs: 2_000,
              durationMs: 6_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            }]
          : [],
        overlays: [],
      })),
    })),
  }
  return { show, composition }
}

function logicalClipFixture(sceneCount: 2 | 3): {
  show: ShowRecord
  composition: ShowCompositionV1
} {
  let show = createDefaultShow('show-authoring-logical', 'Authoring logical', 1)
  if (sceneCount === 3) {
    show = addShowScene(show)
    show.transitions = show.transitions.map((transition) => ({
      ...transition,
      ...(transition.afterSceneId === show.scenes[1].id
        ? { kind: 'cut' as const, durationMs: 0 }
        : {}),
    }))
  }
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [patternInstance],
    scenes: show.scenes.map((scene, sceneIndex) => ({
      sceneId: scene.id,
      zones: [{
        zoneId: show.zones[0].id,
        main: sceneIndex === 0
          ? [{
              id: 'clip-a',
              instanceId: patternInstance.id,
              startMs: 28_000,
              durationMs: 2_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            }]
          : [{
              id: `clip-a--span-${scene.id}`,
              logicalClipId: 'clip-a',
              instanceId: patternInstance.id,
              startMs: 0,
              durationMs: sceneIndex === 1 ? (sceneCount === 3 ? 30_000 : 3_000) : 3_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            }],
        overlays: [],
      }],
    })),
  }
  return { show, composition }
}

function projectedClipIds(projection: ShowUnifiedTimelineProjection): string[] {
  return projection.zones
    .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
    .map((clip) => clip.id)
    .sort()
}

function lastProjectedLayer(
  projection: ShowUnifiedTimelineProjection,
  zoneIndex = 0,
) {
  const layers = projection.zones[zoneIndex].layers
  return layers[layers.length - 1]
}

function expectPlacementInstanceReferences(composition: ShowCompositionV1): void {
  const instanceIds = new Set(composition.patternInstances.map((instance) => instance.id))
  const placements = composition.scenes.flatMap((scene) => scene.zones.flatMap((zone) => [
    ...zone.main,
    ...zone.overlays.flatMap((layer) => layer.placements),
  ]))
  expect(placements.every((placement) => instanceIds.has(placement.instanceId))).toBe(true)
}

function expectAcceptedStep(input: {
  show: ShowRecord
  composition: ShowCompositionV1
  edit: (composition: ShowCompositionV1) => ShowCompositionV1
  projectedClipIds: string[]
  assertReferences?: (result: ShowCompositionV1, original: ShowCompositionV1) => void
}): ShowCompositionV1 {
  return expectAcceptedShowAuthoringEdit({
    show: input.show,
    composition: input.composition,
    edit: input.edit,
    assertProjection: (projection) => {
      expect(projectedClipIds(projection)).toEqual(input.projectedClipIds)
    },
    assertReferences: (result, original) => {
      expectPlacementInstanceReferences(result)
      input.assertReferences?.(result, original)
    },
  })
}

interface ArrangedMatrixCase {
  show: ShowRecord
  composition: ShowCompositionV1
  edit: (composition: ShowCompositionV1) => ShowCompositionV1
  projectedClipIds: string[]
  assertProjection?: (projection: ShowUnifiedTimelineProjection) => void
  assertReferences?: (result: ShowCompositionV1, original: ShowCompositionV1) => void
}

interface MatrixCase {
  operation: string
  partition: string
  arrange: () => ArrangedMatrixCase
}

function mainOwner(show: ShowRecord, placementId = 'clip-a') {
  return {
    kind: 'main' as const,
    sceneId: show.scenes[0].id,
    zoneId: show.zones[0].id,
    placementId,
  }
}

const acceptedOperationCases: MatrixCase[] = [
  {
    operation: 'move',
    partition: 'ordinary Scene time',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => moveShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          target: {
            kind: 'main',
            zoneId: show.zones[0].id,
            globalStartMs: 10_000,
          },
        }),
        projectedClipIds: ['clip-a'],
      }
    },
  },
  {
    operation: 'resize',
    partition: 'ordinary Scene time',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => resizeShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          globalStartMs: 2_000,
          durationMs: 7_000,
        }),
        projectedClipIds: ['clip-a'],
      }
    },
  },
  {
    operation: 'split',
    partition: 'ordinary Scene time',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => splitShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          globalTimeMs: 5_000,
          newPlacementId: 'clip-b',
        }),
        projectedClipIds: ['clip-a', 'clip-b'],
      }
    },
  },
  {
    operation: 'duplicate',
    partition: 'empty destination',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => duplicateShowClipAfter(show, input, {
          owner: mainOwner(show),
          newPlacementId: 'clip-copy',
          newInstanceId: 'instance-copy',
        }),
        projectedClipIds: ['clip-a', 'clip-copy'],
        assertReferences: (result, original) => {
          expect(result.patternInstances).toEqual(expect.arrayContaining([
            ...original.patternInstances,
            expect.objectContaining({ id: 'instance-copy' }),
          ]))
        },
      }
    },
  },
  {
    operation: 'delete',
    partition: 'one of multiple Clips',
    arrange: () => {
      const { show, composition } = mainFixture()
      composition.scenes[0].zones[0].main.push({
        id: 'clip-spare',
        instanceId: patternInstance.id,
        startMs: 10_000,
        durationMs: 2_000,
        view: { mirror: false, phase: 0, brightness: 1 },
      })
      return {
        show,
        composition,
        edit: (input) => deleteShowMainPlacement(input, mainOwner(show)),
        projectedClipIds: ['clip-spare'],
      }
    },
  },
  {
    operation: 'inspector edit',
    partition: 'placement-owned property',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => updateShowClipInspector(
          { ...show, composition: input },
          {
            kind: 'scene-main',
            sceneId: show.scenes[0].id,
            zoneId: show.zones[0].id,
            placementId: 'clip-a',
          },
          { view: { brightness: 0.4 } },
        ).composition!,
        projectedClipIds: ['clip-a'],
        assertReferences: (result) => {
          expect(result.scenes[0].zones[0].main[0].view.brightness).toBe(0.4)
        },
      }
    },
  },
  {
    operation: 'Transition edit',
    partition: 'isolated derived Cut',
    arrange: () => {
      const { show, composition } = mainFixture()
      composition.scenes[0].zones[0].main[0].startMs = 0
      composition.scenes[0].zones[0].main[0].durationMs = 2_000
      composition.scenes[0].zones[0].main.push({
        id: 'clip-b',
        instanceId: patternInstance.id,
        startMs: 2_000,
        durationMs: 2_000,
        view: { mirror: false, phase: 0, brightness: 1 },
      })
      return {
        show,
        composition,
        edit: (input) => insertShowLayerTransition(show, input, {
          id: 'transition-a-b',
          fromPlacementId: 'clip-a',
          toPlacementId: 'clip-b',
          kind: 'crossfade',
          durationMs: 1_000,
          easing: { curve: 'linear' },
          crossfadePolicy: 'live-live',
        }),
        projectedClipIds: ['clip-a', 'clip-b'],
        assertReferences: (result) => {
          expect(result.transitions).toEqual([
            expect.objectContaining({
              fromPlacementId: 'clip-a',
              toPlacementId: 'clip-b',
            }),
          ])
        },
      }
    },
  },
]

const refusedOperationCases: (Omit<MatrixCase, 'arrange'> & {
  arrange: () => Omit<ArrangedMatrixCase, 'projectedClipIds'>
})[] = [
  {
    operation: 'move',
    partition: 'Scene Transition gap',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => moveShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          target: {
            kind: 'main',
            zoneId: show.zones[0].id,
            globalStartMs: 30_500,
          },
        }),
      }
    },
  },
  {
    operation: 'resize',
    partition: 'non-positive duration',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => resizeShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          globalStartMs: 2_000,
          durationMs: 0,
        }),
      }
    },
  },
  {
    operation: 'split',
    partition: 'exact Clip boundary',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => splitShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          globalTimeMs: 2_000,
          newPlacementId: 'clip-b',
        }),
      }
    },
  },
  {
    operation: 'duplicate',
    partition: 'occupied destination',
    arrange: () => {
      const { show, composition } = mainFixture()
      composition.scenes[0].zones[0].main.push({
        id: 'clip-blocker',
        instanceId: patternInstance.id,
        startMs: 10_000,
        durationMs: 2_000,
        view: { mirror: false, phase: 0, brightness: 1 },
      })
      return {
        show,
        composition,
        edit: (input) => duplicateShowClipAfter(show, input, {
          owner: mainOwner(show),
          newPlacementId: 'clip-copy',
          newInstanceId: 'instance-copy',
        }),
      }
    },
  },
  {
    operation: 'delete',
    partition: 'final remaining Clip',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => deleteShowMainPlacement(input, mainOwner(show)),
      }
    },
  },
  {
    operation: 'inspector edit',
    partition: 'out-of-bounds duration',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => updateShowClipInspector(
          { ...show, composition: input },
          {
            kind: 'scene-main',
            sceneId: show.scenes[0].id,
            zoneId: show.zones[0].id,
            placementId: 'clip-a',
          },
          { local: { durationMs: 1_000_000 } },
        ).composition!,
      }
    },
  },
  {
    operation: 'Transition edit',
    partition: 'non-positive duration',
    arrange: () => {
      const { show, composition } = mainFixture()
      composition.scenes[0].zones[0].main[0].startMs = 0
      composition.scenes[0].zones[0].main[0].durationMs = 2_000
      composition.scenes[0].zones[0].main.push({
        id: 'clip-b',
        instanceId: patternInstance.id,
        startMs: 2_000,
        durationMs: 2_000,
        view: { mirror: false, phase: 0, brightness: 1 },
      })
      return {
        show,
        composition,
        edit: (input) => insertShowLayerTransition(show, input, {
          id: 'transition-a-b',
          fromPlacementId: 'clip-a',
          toPlacementId: 'clip-b',
          kind: 'crossfade',
          durationMs: 0,
          easing: { curve: 'linear' },
          crossfadePolicy: 'live-live',
        }),
      }
    },
  },
]

const acceptedTimePartitionCases: MatrixCase[] = [
  {
    operation: 'move',
    partition: 'exact Scene start after a Transition',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => moveShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          target: {
            kind: 'main',
            zoneId: show.zones[0].id,
            globalStartMs: 32_000,
          },
        }),
        projectedClipIds: ['clip-a'],
        assertProjection: (projection) => {
          expect(projection.zones[0].layers[0].clips[0]).toMatchObject({
            id: 'clip-a',
            startMs: 32_000,
            durationMs: 6_000,
          })
        },
      }
    },
  },
  {
    operation: 'move',
    partition: 'fractional boundary rounded once',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => moveShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          target: {
            kind: 'main',
            zoneId: show.zones[0].id,
            globalStartMs: 10_000.6,
          },
        }),
        projectedClipIds: ['clip-a'],
        assertProjection: (projection) => {
          expect(projection.zones[0].layers[0].clips[0]).toMatchObject({
            id: 'clip-a',
            startMs: 10_001,
          })
        },
      }
    },
  },
]

const refusedTimePartitionCases: (Omit<MatrixCase, 'arrange'> & {
  arrange: () => Omit<ArrangedMatrixCase, 'projectedClipIds'>
})[] = [
  {
    operation: 'move',
    partition: 'Show End',
    arrange: () => {
      const { show, composition } = mainFixture()
      return {
        show,
        composition,
        edit: (input) => moveShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          target: {
            kind: 'main',
            zoneId: show.zones[0].id,
            globalStartMs: 62_000,
          },
        }),
      }
    },
  },
]

const acceptedOwnershipPartitionCases: MatrixCase[] = [
  {
    operation: 'move',
    partition: 'overlay Layer ownership',
    arrange: () => {
      const { show, composition } = overlayFixture()
      return {
        show,
        composition,
        edit: (input) => moveShowClipAtGlobalTime(show, input, {
          owner: {
            kind: 'overlay',
            sceneId: show.scenes[0].id,
            zoneId: show.zones[0].id,
            layerId: 'layer-front-1',
            placementId: 'clip-a',
          },
          target: {
            kind: 'overlay',
            zoneId: show.zones[0].id,
            layerIndex: 0,
            globalStartMs: 10_000,
          },
        }),
        projectedClipIds: ['clip-a'],
        assertProjection: (projection) => {
          expect(projection.zones[0].layers[0].clips[0]).toMatchObject({
            id: 'clip-a',
            kind: 'overlay',
            startMs: 10_000,
          })
        },
      }
    },
  },
  {
    operation: 'move',
    partition: 'another Zone',
    arrange: () => {
      const { show, composition } = twoZoneFixture()
      return {
        show,
        composition,
        edit: (input) => moveShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          target: {
            kind: 'main',
            zoneId: show.zones[1].id,
            globalStartMs: 10_000,
          },
        }),
        projectedClipIds: ['clip-a'],
        assertProjection: (projection) => {
          expect(lastProjectedLayer(projection, 1)?.clips[0]).toMatchObject({
            id: 'clip-a',
            zoneId: show.zones[1].id,
            startMs: 10_000,
          })
        },
      }
    },
  },
  {
    operation: 'resize',
    partition: 'logical Clip spanning two Scenes',
    arrange: () => {
      const { show, composition } = logicalClipFixture(2)
      return {
        show,
        composition,
        edit: (input) => resizeShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          globalStartMs: 27_000,
          durationMs: 8_000,
        }),
        projectedClipIds: ['clip-a'],
        assertProjection: (projection) => {
          expect(lastProjectedLayer(projection)?.clips[0]).toMatchObject({
            id: 'clip-a',
            startMs: 27_000,
            endMs: 35_000,
          })
        },
        assertReferences: (result) => {
          expect(result.scenes.flatMap((scene) => scene.zones[0].main)).toEqual([
            expect.objectContaining({ id: 'clip-a' }),
            expect.objectContaining({ logicalClipId: 'clip-a' }),
          ])
        },
      }
    },
  },
  {
    operation: 'move',
    partition: 'logical Clip spanning three Scenes',
    arrange: () => {
      const { show, composition } = logicalClipFixture(3)
      return {
        show,
        composition,
        edit: (input) => moveShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          target: {
            kind: 'main',
            zoneId: show.zones[0].id,
            globalStartMs: 27_000,
          },
        }),
        projectedClipIds: ['clip-a'],
        assertProjection: (projection) => {
          expect(lastProjectedLayer(projection)?.clips[0]).toMatchObject({
            id: 'clip-a',
            startMs: 27_000,
            endMs: 64_000,
          })
        },
        assertReferences: (result) => {
          expect(result.scenes.flatMap((scene) => scene.zones[0].main)).toHaveLength(3)
        },
      }
    },
  },
]

const acceptedRelationshipPartitionCases: MatrixCase[] = [
  {
    operation: 'connected move',
    partition: 'Transition-connected Clips',
    arrange: () => {
      const { show, composition } = mainFixture()
      composition.scenes[0].zones[0].main = [{
        ...composition.scenes[0].zones[0].main[0],
        id: 'clip-a',
        startMs: 0,
        durationMs: 2_000,
      }, {
        ...composition.scenes[0].zones[0].main[0],
        id: 'clip-b',
        startMs: 3_000,
        durationMs: 2_000,
      }]
      composition.transitions = [{
        id: 'transition-a-b',
        fromPlacementId: 'clip-a',
        toPlacementId: 'clip-b',
        kind: 'crossfade',
        durationMs: 1_000,
        easing: { curve: 'linear' },
        crossfadePolicy: 'live-live',
      }]
      return {
        show,
        composition,
        edit: (input) => moveShowConnectedClipAtGlobalTime(show, input, {
          owner: mainOwner(show, 'clip-b'),
          target: {
            kind: 'main',
            zoneId: show.zones[0].id,
            globalStartMs: 4_000,
          },
        }),
        projectedClipIds: ['clip-a', 'clip-b'],
        assertProjection: (projection) => {
          expect(lastProjectedLayer(projection)?.clips).toEqual([
            expect.objectContaining({ id: 'clip-a', startMs: 1_000 }),
            expect.objectContaining({ id: 'clip-b', startMs: 4_000 }),
          ])
        },
        assertReferences: (result) => {
          expect(result.transitions).toEqual([
            expect.objectContaining({
              fromPlacementId: 'clip-a',
              toPlacementId: 'clip-b',
            }),
          ])
        },
      }
    },
  },
  {
    operation: 'move',
    partition: 'placement animation',
    arrange: () => {
      const { show, composition } = mainFixture()
      composition.scenes[0].propertyTracks = [{
        id: 'track-brightness',
        target: {
          kind: 'placement-view',
          placementId: 'clip-a',
          property: 'brightness',
        },
        keyframes: [
          { id: 'brightness-a', timeMs: 2_000, value: 0, easing: { curve: 'linear' } },
          { id: 'brightness-b', timeMs: 8_000, value: 1, easing: { curve: 'linear' } },
        ],
      }]
      return {
        show,
        composition,
        edit: (input) => moveShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          target: {
            kind: 'main',
            zoneId: show.zones[0].id,
            globalStartMs: 10_000,
          },
        }),
        projectedClipIds: ['clip-a'],
        assertReferences: (result) => {
          expect(result.scenes[0].propertyTracks?.[0]).toMatchObject({
            target: { placementId: 'clip-a' },
            keyframes: [{ timeMs: 10_000 }, { timeMs: 16_000 }],
          })
        },
      }
    },
  },
  {
    operation: 'move',
    partition: 'instance animation',
    arrange: () => {
      const { show, composition } = mainFixture()
      const placement = composition.scenes[0].zones[0].main[0]
      placement.startMs = 20_000
      placement.durationMs = 5_000
      composition.scenes[0].propertyTracks = [{
        id: 'track-speed',
        target: { kind: 'instance-time-scale', instanceId: patternInstance.id },
        keyframes: [
          { id: 'speed-a', timeMs: 20_000, value: 1, easing: { curve: 'linear' } },
          { id: 'speed-b', timeMs: 25_000, value: 2, easing: { curve: 'linear' } },
        ],
      }]
      return {
        show,
        composition,
        edit: (input) => moveShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          target: {
            kind: 'main',
            zoneId: show.zones[0].id,
            globalStartMs: 34_000,
          },
        }),
        projectedClipIds: ['clip-a'],
        assertReferences: (result) => {
          expect(result.scenes[0].propertyTracks).toBeUndefined()
          expect(result.scenes[1].propertyTracks?.[0]).toMatchObject({
            target: { instanceId: patternInstance.id },
            keyframes: [{ timeMs: 2_000 }, { timeMs: 7_000 }],
          })
        },
      }
    },
  },
]

const refusedRelationshipPartitionCases: (Omit<MatrixCase, 'arrange'> & {
  arrange: () => Omit<ArrangedMatrixCase, 'projectedClipIds'>
})[] = [
  {
    operation: 'move',
    partition: 'Group-occupied destination',
    arrange: () => {
      const { show, composition } = mainFixture()
      composition.scenes[0].zones[0].main[0].startMs = 2_000
      composition.scenes[0].zones[0].main[0].durationMs = 2_000
      composition.groupDefinitions = [{
        id: 'group-definition',
        name: 'Occupied phrase',
        patternInstances: [{
          ...patternInstance,
          id: 'group-instance',
        }],
        placements: [{
          id: 'group-child',
          instanceId: 'group-instance',
          startMs: 0,
          durationMs: 2_000,
          opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
          layerOffset: 0,
        }],
      }]
      composition.groupOccurrences = [{
        id: 'group-use',
        definitionId: 'group-definition',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        startMs: 10_000,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      }]
      return {
        show,
        composition,
        edit: (input) => moveShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          target: {
            kind: 'main',
            zoneId: show.zones[0].id,
            globalStartMs: 10_000,
          },
        }),
      }
    },
  },
  {
    operation: 'move',
    partition: 'nonlinear instance easing across Scenes',
    arrange: () => {
      const { show, composition } = logicalClipFixture(2)
      composition.scenes[0].propertyTracks = [{
        id: 'track-speed',
        target: { kind: 'instance-time-scale', instanceId: patternInstance.id },
        keyframes: [
          {
            id: 'speed-a',
            timeMs: 28_000,
            value: 1,
            easing: { curve: 'sine', direction: 'in-out' },
          },
          { id: 'speed-b', timeMs: 30_000, value: 2, easing: { curve: 'linear' } },
        ],
      }]
      return {
        show,
        composition,
        edit: (input) => moveShowClipAtGlobalTime(show, input, {
          owner: mainOwner(show),
          target: {
            kind: 'main',
            zoneId: show.zones[0].id,
            globalStartMs: 10_000,
          },
        }),
      }
    },
  },
]

const acceptedMatrixCases = [
  ...acceptedOperationCases,
  ...acceptedTimePartitionCases,
  ...acceptedOwnershipPartitionCases,
  ...acceptedRelationshipPartitionCases,
]

const refusedMatrixCases = [
  ...refusedOperationCases,
  ...refusedTimePartitionCases,
  ...refusedRelationshipPartitionCases,
]

describe('Show authoring behavioral matrix (#596)', () => {
  it.each(acceptedMatrixCases)(
    'qualifies accepted $operation behavior for $partition',
    ({ arrange }) => {
      const {
        show,
        composition,
        edit,
        projectedClipIds: expectedClipIds,
        assertProjection,
        assertReferences,
      } = arrange()
      expectAcceptedShowAuthoringEdit({
        show,
        composition,
        edit,
        assertProjection: (projection) => {
          expect(projectedClipIds(projection)).toEqual(expectedClipIds)
          assertProjection?.(projection)
        },
        assertReferences: (result, original) => {
          expectPlacementInstanceReferences(result)
          assertReferences?.(result, original)
        },
      })
    },
  )

  it.each(refusedMatrixCases)(
    'qualifies refused $operation behavior for $partition',
    ({ arrange }) => {
      const { show, composition, edit } = arrange()
      expectRefusedShowAuthoringEdit({ show, composition, edit })
    },
  )

  it('preserves a three-Scene logical Clip through two consecutive moves', () => {
    const { show, composition } = logicalClipFixture(3)
    const first = expectAcceptedStep({
      show,
      composition,
      edit: (input) => moveShowClipAtGlobalTime(show, input, {
        owner: mainOwner(show),
        target: {
          kind: 'main',
          zoneId: show.zones[0].id,
          globalStartMs: 27_000,
        },
      }),
      projectedClipIds: ['clip-a'],
      assertReferences: (result) => {
        expect(result.scenes.flatMap((scene) => scene.zones[0].main)).toHaveLength(3)
      },
    })

    expectAcceptedStep({
      show,
      composition: first,
      edit: (input) => moveShowClipAtGlobalTime(show, input, {
        owner: mainOwner(show),
        target: {
          kind: 'main',
          zoneId: show.zones[0].id,
          globalStartMs: 26_000,
        },
      }),
      projectedClipIds: ['clip-a'],
      assertReferences: (result) => {
        expect(result.scenes.flatMap((scene) => scene.zones[0].main)).toHaveLength(3)
      },
    })
  })

  it('resizes a two-Scene logical Clip and then splits the resized result', () => {
    const { show, composition } = logicalClipFixture(2)
    const resized = expectAcceptedStep({
      show,
      composition,
      edit: (input) => resizeShowClipAtGlobalTime(show, input, {
        owner: mainOwner(show),
        globalStartMs: 27_000,
        durationMs: 8_000,
      }),
      projectedClipIds: ['clip-a'],
    })

    expectAcceptedStep({
      show,
      composition: resized,
      edit: (input) => splitShowClipAtGlobalTime(show, input, {
        owner: mainOwner(show),
        globalTimeMs: 33_000,
        newPlacementId: 'clip-b',
      }),
      projectedClipIds: ['clip-a', 'clip-b'],
      assertReferences: (result) => {
        expect(result.patternInstances).toEqual(resized.patternInstances)
      },
    })
  })

  it('splits a Clip and then moves only the right logical result', () => {
    const { show, composition } = mainFixture()
    const split = expectAcceptedStep({
      show,
      composition,
      edit: (input) => splitShowClipAtGlobalTime(show, input, {
        owner: mainOwner(show),
        globalTimeMs: 5_000,
        newPlacementId: 'clip-b',
      }),
      projectedClipIds: ['clip-a', 'clip-b'],
    })

    expectAcceptedStep({
      show,
      composition: split,
      edit: (input) => moveShowClipAtGlobalTime(show, input, {
        owner: mainOwner(show, 'clip-b'),
        target: {
          kind: 'main',
          zoneId: show.zones[0].id,
          globalStartMs: 12_000,
        },
      }),
      projectedClipIds: ['clip-a', 'clip-b'],
    })
  })

  it('moves a Clip across a Scene boundary and then edits it through the inspector', () => {
    const { show, composition } = mainFixture()
    const moved = expectAcceptedStep({
      show,
      composition,
      edit: (input) => moveShowClipAtGlobalTime(show, input, {
        owner: mainOwner(show),
        target: {
          kind: 'main',
          zoneId: show.zones[0].id,
          globalStartMs: 34_000,
        },
      }),
      projectedClipIds: ['clip-a'],
    })

    expectAcceptedStep({
      show,
      composition: moved,
      edit: (input) => updateShowClipInspector(
        { ...show, composition: input },
        {
          kind: 'scene-main',
          sceneId: show.scenes[1].id,
          zoneId: show.zones[0].id,
          placementId: 'clip-a',
        },
        { view: { brightness: 0.35 } },
      ).composition!,
      projectedClipIds: ['clip-a'],
      assertReferences: (result) => {
        expect(result.scenes[1].zones[0].main[0].view.brightness).toBe(0.35)
      },
    })
  })

  it('duplicates a Clip and then deletes the duplicate without damaging the source', () => {
    const { show, composition } = mainFixture()
    const duplicated = expectAcceptedStep({
      show,
      composition,
      edit: (input) => duplicateShowClipAfter(show, input, {
        owner: mainOwner(show),
        newPlacementId: 'clip-copy',
        newInstanceId: 'instance-copy',
      }),
      projectedClipIds: ['clip-a', 'clip-copy'],
    })

    expectAcceptedStep({
      show,
      composition: duplicated,
      edit: (input) => deleteShowMainPlacement(input, mainOwner(show, 'clip-copy')),
      projectedClipIds: ['clip-a'],
      assertReferences: (result) => {
        expect(result.scenes[0].zones[0].main[0]).toMatchObject({
          id: 'clip-a',
          instanceId: patternInstance.id,
        })
      },
    })
  })
})
