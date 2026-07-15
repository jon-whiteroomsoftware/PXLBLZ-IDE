import { describe, expect, it } from 'vitest'
import {
  createDefaultShow,
  extendShowCell,
  splitShowAtTime,
  updateShowCellRestartOnEntry,
} from './showModel'
import {
  addShowMainPlacement,
  addShowMainClip,
  deleteShowMainPlacement,
  moveShowMainPlacement,
  normalizeShowComposition,
  projectFlatShowToCompositionV1,
  replaceShowPatternInstance,
  resolveShowMainPlacementStart,
  restartShowMainPlacement,
  splitShowMainPlacement,
  trimShowMainPlacement,
  validateShowComposition,
} from './showCompositionModel'
import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'

const SOURCE = 'export function render(index) { rgb(index / 60, 0.2, 0.4) }'

function lookup(show: ShowRecord) {
  return {
    byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, SOURCE])),
    stageDimension: 2 as const,
  }
}

function fixture(): { show: ShowRecord; composition: ShowCompositionV1 } {
  const show = createDefaultShow('composition-model', 'Composition model', 1)
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      {
        id: 'instance-a',
        pattern: { kind: 'stock', id: 'TestPattern1D' },
        patternName: 'TestPattern1D',
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
      {
        id: 'instance-b',
        pattern: { kind: 'stock', id: 'CometLoom' },
        patternName: 'CometLoom',
        time: { timeScale: 0.5, timeOffsetMs: 25 },
      },
    ],
    scenes: [{
      sceneId: 'scene-1',
      zones: [{
        zoneId: 'zone-1',
        main: [
          {
            id: 'placement-a',
            instanceId: 'instance-a',
            startMs: 0,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          },
          {
            id: 'placement-b',
            instanceId: 'instance-b',
            startMs: 5_000,
            durationMs: 3_000,
            view: { mirror: true, phase: 0.25, brightness: 0.7 },
          },
        ],
      }],
    }],
  }
  return { show, composition }
}

describe('Show composition v1 Main schedule (#488)', () => {
  it('magnetically resolves horizontal moves and quantizes illegal overlaps', () => {
    const placement = { id: 'moving', instanceId: 'instance-a', startMs: 0, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } }
    const occupied = [
      { ...placement, id: 'left', startMs: 2_000, durationMs: 2_000 },
      { ...placement, id: 'right', startMs: 6_000, durationMs: 1_000 },
    ]

    expect(resolveShowMainPlacementStart(10_000, placement, occupied, 4_080, 100)).toBe(4_000)
    expect(resolveShowMainPlacementStart(10_000, placement, occupied, 5_500, 100)).toBe(5_000)
    expect(resolveShowMainPlacementStart(10_000, placement, occupied, 9_900, 100)).toBe(9_000)
  })

  it('adds the Pattern instance and Main placement atomically', () => {
    const { show, composition } = fixture()
    const instance = {
      id: 'instance-c',
      pattern: { kind: 'stock' as const, id: 'Caustics' },
      patternName: 'Caustics',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }
    const placement = {
      id: 'placement-c', instanceId: instance.id, startMs: 8_000, durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    }

    const added = addShowMainClip(show, composition, { sceneId: 'scene-1', zoneId: 'zone-1', instance, placement })
    expect(added.patternInstances).toContainEqual(instance)
    expect(added.scenes[0].zones[0].main).toContainEqual(placement)

    const rejected = addShowMainClip(show, composition, {
      sceneId: 'scene-1', zoneId: 'zone-1', instance, placement: { ...placement, startMs: 3_000 },
    })
    expect(rejected).toBe(composition)
    expect(rejected.patternInstances).not.toContainEqual(instance)
  })

  it('projects flat Shows losslessly into explicit instances and full-duration Main placements', () => {
    const flat = extendShowCell(createDefaultShow('composition-legacy', 'Legacy', 1), 'cell-1', 2)
    const projected = projectFlatShowToCompositionV1(flat, lookup(flat))

    expect(projected.version).toBe(1)
    expect(projected.patternInstances).toHaveLength(1)
    expect(projected.scenes).toHaveLength(2)
    expect(projected.scenes[0].zones[0].main[0]).toMatchObject({
      startMs: 0,
      durationMs: flat.scenes[0].durationMs,
    })
    expect(projected.scenes[0].zones[0].main[0].instanceId)
      .toBe(projected.scenes[1].zones[0].main[0].instanceId)

    const split = splitShowAtTime(flat, 10_000)
    const splitProjected = projectFlatShowToCompositionV1(split, lookup(split))
    expect(new Set(splitProjected.scenes.flatMap((scene) => (
      scene.zones.flatMap((zone) => zone.main.map((placement) => placement.instanceId))
    ))).size).toBe(1)

    const right = split.cells.find((cell) => cell.sceneId === split.scenes[1].id)!
    const restarted = updateShowCellRestartOnEntry(split, right.id, true)
    const restartedProjection = projectFlatShowToCompositionV1(restarted, lookup(restarted))
    expect(new Set(restartedProjection.scenes.flatMap((scene) => (
      scene.zones.flatMap((zone) => zone.main.map((placement) => placement.instanceId))
    ))).size).toBe(2)
  })

  it('normalizes deterministically and idempotently without erasing explicit gaps', () => {
    const { show, composition } = fixture()
    const shuffled: ShowCompositionV1 = {
      ...composition,
      patternInstances: [...composition.patternInstances].reverse(),
      scenes: [{
        ...composition.scenes[0],
        zones: [{
          ...composition.scenes[0].zones[0],
          main: [...composition.scenes[0].zones[0].main].reverse(),
        }],
      }],
    }

    const once = normalizeShowComposition(show, shuffled)
    const twice = normalizeShowComposition(show, once)

    expect(twice).toEqual(once)
    expect(once.scenes[0].zones[0].main.map((placement) => placement.id))
      .toEqual(['placement-a', 'placement-b'])
    expect(once.scenes[0].zones[0].main[1].startMs).toBe(5_000)
  })

  it('returns field-addressed validation issues for missing owners, bad bounds, and overlap', () => {
    const { show, composition } = fixture()
    const invalid: ShowCompositionV1 = {
      ...composition,
      scenes: [{
        sceneId: 'scene-1',
        zones: [{
          zoneId: 'zone-1',
          main: [
            { ...composition.scenes[0].zones[0].main[0], durationMs: 6_000 },
            { ...composition.scenes[0].zones[0].main[1], startMs: 5_000, durationMs: 40_000, instanceId: 'missing' },
          ],
        }],
      }],
    }

    expect(validateShowComposition(show, invalid)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'scenes[0].zones[0].main[1].instanceId', code: 'missing-instance' }),
      expect.objectContaining({ path: 'scenes[0].zones[0].main[1].durationMs', code: 'out-of-bounds' }),
      expect.objectContaining({ path: 'scenes[0].zones[0].main[1].startMs', code: 'overlap' }),
    ]))
  })

  it('splits with Continue identity and can explicitly Restart with a fresh instance', () => {
    const { show, composition } = fixture()
    const split = splitShowMainPlacement(show, composition, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      placementId: 'placement-a',
      atMs: 1_500,
      newPlacementId: 'placement-a-right',
    })
    const main = split.scenes[0].zones[0].main
    expect(main.slice(0, 2)).toMatchObject([
      { id: 'placement-a', instanceId: 'instance-a', startMs: 0, durationMs: 1_500 },
      { id: 'placement-a-right', instanceId: 'instance-a', startMs: 1_500, durationMs: 2_500 },
    ])

    const restarted = restartShowMainPlacement(split, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      placementId: 'placement-a-right',
      newInstanceId: 'instance-a-restart',
    })
    expect(restarted.patternInstances).toHaveLength(3)
    expect(restarted.scenes[0].zones[0].main[1].instanceId).toBe('instance-a-restart')
    expect(restarted.patternInstances.find((instance) => instance.id === 'instance-a-restart'))
      .toMatchObject({ patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 } })
  })

  it('adds, moves, trims, deletes, and replaces Main content without accepting collisions', () => {
    const { show, composition } = fixture()
    const added = addShowMainPlacement(show, composition, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      placement: {
        id: 'placement-c',
        instanceId: 'instance-a',
        startMs: 8_000,
        durationMs: 2_000,
        view: { mirror: false, phase: 0, brightness: 1 },
      },
    })
    expect(added.scenes[0].zones[0].main).toHaveLength(3)

    const rejectedMove = moveShowMainPlacement(show, added, {
      sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-c', startMs: 3_000,
    })
    expect(rejectedMove).toEqual(added)

    const moved = moveShowMainPlacement(show, added, {
      sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-c', startMs: 9_000,
    })
    expect(moved.scenes[0].zones[0].main.find((placement) => placement.id === 'placement-c')?.startMs).toBe(9_000)

    const trimmed = trimShowMainPlacement(show, moved, {
      sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-c', startMs: 8_500, durationMs: 1_500,
    })
    expect(trimmed.scenes[0].zones[0].main.find((placement) => placement.id === 'placement-c'))
      .toMatchObject({ startMs: 8_500, durationMs: 1_500 })

    const replaced = replaceShowPatternInstance(trimmed, 'instance-a', {
      pattern: { kind: 'stock', id: 'ClockworkIris' }, patternName: 'ClockworkIris',
    })
    expect(replaced.patternInstances.find((instance) => instance.id === 'instance-a'))
      .toMatchObject({ patternName: 'ClockworkIris' })

    const deleted = deleteShowMainPlacement(replaced, {
      sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-c',
    })
    expect(deleted.scenes[0].zones[0].main.map((placement) => placement.id))
      .toEqual(['placement-a', 'placement-b'])
  })
})
