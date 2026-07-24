import { describe, expect, it } from 'vitest'
import {
  addShowRoutingLayout,
  createDefaultShow,
  showRecordToCompileRecipe,
  splitShowAtTime,
} from './showModel'
import {
  appendShowLayoutInterval,
  duplicateShowLayoutInterval,
  insertShowLayoutInterval,
  makeShowLayoutIntervalUnique,
  projectShowLayoutIntervals,
  showLayoutIntervalAtTime,
  showLayoutIntervalPercentBounds,
  showLayoutZoneIdAtTime,
} from './showLayoutIntervals'
import { validateShowComposition } from './showCompositionModel'
import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'

function showWithComposition(): ShowRecord {
  const show = createDefaultShow('show-layouts', 'Layout intervals', 1)
  const sourceCell = show.cells[0]
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [{
      id: 'instance-1',
      pattern: { ...sourceCell.pattern },
      patternName: sourceCell.patternName,
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    scenes: [{
      sceneId: show.scenes[0].id,
      zones: [{
        zoneId: show.zones[0].id,
        main: [{
          id: 'placement-1',
          instanceId: 'instance-1',
          startMs: 0,
          durationMs: show.scenes[0].durationMs,
          view: { brightness: 1, phase: 0, mirror: false },
        }],
        overlays: [],
      }],
    }],
  }
  return {
    ...show,
    scenes: [{ ...show.scenes[0], durationMs: 30_000 }],
    cells: [{ ...sourceCell, sceneId: show.scenes[0].id, sceneSpan: 1 }],
    transitions: [],
    composition,
  }
}

describe('Show Layout intervals', () => {
  it('remaps logical Clip roots when duplicating a multi-Scene Layout with content (#63)', () => {
    const show = createDefaultShow('show-layout-logical-copy', 'Logical copy', 1)
    const instance = {
      id: 'instance-logical',
      pattern: { kind: 'stock' as const, id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }
    show.composition = {
      version: 1,
      patternInstances: [instance],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId: show.zones[0].id,
          main: [index === 0
            ? {
                id: 'logical-root',
                instanceId: instance.id,
                startMs: 29_000,
                durationMs: 1_000,
                view: { brightness: 1, phase: 0, mirror: false },
              }
            : {
                id: `logical-root--span-${scene.id}`,
                logicalClipId: 'logical-root',
                instanceId: instance.id,
                startMs: 0,
                durationMs: 3_000,
                view: { brightness: 1, phase: 0, mirror: false },
              }],
          overlays: [],
        }],
      })),
    }

    const duplicated = duplicateShowLayoutInterval(
      show,
      projectShowLayoutIntervals(show)[0].id,
      { withContent: true },
    )
    const duplicateRoot = duplicated.composition!.scenes[2].zones[0].main[0]
    const duplicateContinuation = duplicated.composition!.scenes[3].zones[0].main[0]

    expect(validateShowComposition(duplicated, duplicated.composition!)).toEqual([])
    expect(duplicateContinuation.logicalClipId).toBe(duplicateRoot.id)
    expect(duplicateContinuation.id).toBe(`${duplicateRoot.id}--span-${duplicated.scenes[3].id}`)
    expect(duplicateContinuation.instanceId).not.toBe(instance.id)
  })

  it('uses logical Zone identities for portable Layout occurrences (#589)', () => {
    const base = showWithComposition()
    const zoneId = base.zones[0].id
    const show: ShowRecord = {
      ...base,
      routingLayouts: [{
        id: 'logical-layout',
        name: 'Logical Layout',
        zones: [],
        logical: { kind: 'single', zoneIds: [zoneId] },
      }],
    }

    expect(projectShowLayoutIntervals(show)[0].zoneIds).toEqual([zoneId])
    expect(showLayoutZoneIdAtTime(show, 0)).toBe(zoneId)
  })

  it('projects explicit same-Layout boundaries as separate occurrences', () => {
    const show = appendShowLayoutInterval(showWithComposition(), {
      durationMs: 5_000,
      layoutId: 'layout-1',
    })

    expect(projectShowLayoutIntervals(show).map((interval) => ({
      layoutId: interval.layoutId,
      durationMs: interval.durationMs,
      sceneIds: interval.sceneIds,
    }))).toEqual([
      { layoutId: 'layout-1', durationMs: 30_000, sceneIds: ['scene-1'] },
      { layoutId: 'layout-1', durationMs: 5_000, sceneIds: ['scene-2'] },
    ])
    expect(show.transitions).toContainEqual(expect.objectContaining({
      afterSceneId: 'scene-1',
      kind: 'routing',
      layoutId: 'layout-1',
      durationMs: 0,
    }))
  })

  it('assigns a visual-transition window to the incoming Layout occurrence', () => {
    const appended = appendShowLayoutInterval(showWithComposition(), {
      durationMs: 5_000,
      layoutId: 'layout-1',
    })
    const show = {
      ...appended,
      transitions: appended.transitions.map((transition) => (
        transition.afterSceneId === 'scene-1' && transition.kind === 'cut'
          ? { ...transition, kind: 'crossfade' as const, durationMs: 2_000 }
          : transition
      )),
    }

    const intervals = projectShowLayoutIntervals(show)

    expect(intervals.map(({ startMs, endMs, durationMs }) => ({ startMs, endMs, durationMs }))).toEqual([
      { startMs: 0, endMs: 30_000, durationMs: 30_000 },
      { startMs: 30_000, endMs: 37_000, durationMs: 7_000 },
    ])
    expect(showLayoutIntervalAtTime(intervals, 31_000)?.id).toBe('layout-occurrence-scene-2')
  })

  it('positions Layout bands in full-Show coordinates when the timeline is zoomed', () => {
    const intervals = projectShowLayoutIntervals(appendShowLayoutInterval(showWithComposition(), {
      durationMs: 30_000,
      layoutId: 'layout-1',
    }))

    expect(showLayoutIntervalPercentBounds(intervals[1], 60_000)).toEqual({ left: 50, width: 50 })
  })

  it('inserts inside occupied content by splitting placements and resuming the prior Layout', () => {
    const base = addShowRoutingLayout(showWithComposition(), 'Alternate')
    const alternateId = base.routingLayouts[1].id
    const show = insertShowLayoutInterval(base, {
      atMs: 10_000,
      durationMs: 5_000,
      layoutId: alternateId,
    })

    expect(show.scenes.map((scene) => scene.durationMs)).toEqual([10_000, 5_000, 20_000])
    expect(projectShowLayoutIntervals(show).map((interval) => [interval.layoutId, interval.durationMs])).toEqual([
      ['layout-1', 10_000],
      [alternateId, 5_000],
      ['layout-1', 20_000],
    ])
    const [left, inserted, right] = show.composition!.scenes
    expect(left.zones[0].main[0]).toMatchObject({ instanceId: 'instance-1', durationMs: 10_000 })
    expect(inserted.zones[0].main).toEqual([])
    expect(right.zones[0].main[0]).toMatchObject({ instanceId: 'instance-1', startMs: 0, durationMs: 20_000 })
    expect(right.zones[0].main[0].id).not.toBe(left.zones[0].main[0].id)
  })

  it('duplicates either an empty occurrence or its complete choreography', () => {
    const base = showWithComposition()
    const source = projectShowLayoutIntervals(base)[0]
    const empty = duplicateShowLayoutInterval(base, source.id, { withContent: false })
    const copied = duplicateShowLayoutInterval(base, source.id, { withContent: true })

    expect(empty.scenes).toHaveLength(2)
    expect(empty.composition!.scenes[1].zones[0].main).toEqual([])
    expect(copied.scenes).toHaveLength(2)
    expect(copied.composition!.scenes[1].zones[0].main).toHaveLength(1)
    expect(copied.composition!.scenes[1].zones[0].main[0]).toMatchObject({
      startMs: 0,
      durationMs: 30_000,
    })
    expect(copied.composition!.scenes[1].zones[0].main[0].id).not.toBe('placement-1')
    expect(copied.composition!.scenes[1].zones[0].main[0].instanceId).not.toBe('instance-1')
    expect(copied.composition!.patternInstances).toHaveLength(2)
  })

  it('preserves the authored outgoing boundary when duplicating an empty occurrence', () => {
    const appended = appendShowLayoutInterval(showWithComposition(), {
      durationMs: 5_000,
      layoutId: 'layout-1',
    })
    const show = {
      ...appended,
      transitions: appended.transitions.map((transition) => (
        transition.afterSceneId === 'scene-1' && transition.kind === 'cut'
          ? {
              ...transition,
              kind: 'crossfade' as const,
              durationMs: 2_000,
              crossfadePolicy: 'snapshot-live' as const,
            }
          : transition
      )),
    }

    const duplicated = duplicateShowLayoutInterval(
      show,
      'layout-occurrence-scene-1',
      { withContent: false },
    )
    const insertedSceneId = duplicated.scenes[1].id

    expect(duplicated.transitions).toContainEqual(expect.objectContaining({
      afterSceneId: 'scene-1',
      kind: 'cut',
      durationMs: 0,
    }))
    expect(duplicated.transitions).toContainEqual(expect.objectContaining({
      afterSceneId: insertedSceneId,
      kind: 'crossfade',
      durationMs: 2_000,
      crossfadePolicy: 'snapshot-live',
    }))
    expect(duplicated.transitions).toContainEqual(expect.objectContaining({
      afterSceneId: insertedSceneId,
      kind: 'routing',
      layoutId: 'layout-1',
    }))
    expect(new Set(duplicated.transitions.map((transition) => transition.id)).size).toBe(
      duplicated.transitions.length,
    )
  })

  it('remaps duplicated property-transition starts to duplicated Clip IDs', () => {
    const split = splitShowAtTime(showWithComposition(), 10_000)
    const destinationCell = split.cells.find((cell) => cell.sceneId === split.scenes[1].id)!
    const show = {
      ...split,
      transitions: split.transitions.map((transition) => (
        transition.afterSceneId === split.scenes[0].id
          ? {
              ...transition,
              kind: 'crossfade' as const,
              durationMs: 1_000,
              propertyTransitions: {
                brightness: { fromByCellId: { [destinationCell.id]: 0.25 } },
                controls: { speed: { fromByCellId: { [destinationCell.id]: 0.5 } } },
              },
            }
          : transition
      )),
    }

    const duplicated = duplicateShowLayoutInterval(
      show,
      projectShowLayoutIntervals(show)[0].id,
      { withContent: true },
    )
    const duplicateFirstSceneId = duplicated.scenes[2].id
    const duplicateDestinationCell = duplicated.cells.find((cell) => cell.sceneId === duplicated.scenes[3].id)!
    const duplicateBoundary = duplicated.transitions.find((transition) => (
      transition.afterSceneId === duplicateFirstSceneId && transition.kind !== 'routing'
    ))!

    expect(duplicateBoundary.propertyTransitions?.brightness?.fromByCellId).toEqual({
      [duplicateDestinationCell.id]: 0.25,
    })
    expect(duplicateBoundary.propertyTransitions?.controls?.speed.fromByCellId).toEqual({
      [duplicateDestinationCell.id]: 0.5,
    })
  })

  it('makes one reused occurrence independent by cloning its Layout and Zone identities', () => {
    const duplicated = duplicateShowLayoutInterval(
      showWithComposition(),
      'layout-occurrence-scene-1',
      { withContent: true },
    )
    const second = projectShowLayoutIntervals(duplicated)[1]
    const unique = makeShowLayoutIntervalUnique(duplicated, second.id)
    const intervals = projectShowLayoutIntervals(unique)

    expect(unique.routingLayouts).toHaveLength(2)
    expect(intervals[0].layoutId).toBe('layout-1')
    expect(intervals[1].layoutId).toBe(unique.routingLayouts[1].id)
    expect(unique.routingLayouts[1].zones[0].zoneId).not.toBe(unique.routingLayouts[0].zones[0].zoneId)
    expect(unique.composition!.scenes[0].zones[0].zoneId).toBe(unique.routingLayouts[0].zones[0].zoneId)
    expect(unique.composition!.scenes[1].zones[0].zoneId).toBe(unique.routingLayouts[1].zones[0].zoneId)
  })

  it('resolves Clip authoring to a made-unique occurrence Zone', () => {
    const duplicated = duplicateShowLayoutInterval(
      showWithComposition(),
      'layout-occurrence-scene-1',
      { withContent: true },
    )
    const second = projectShowLayoutIntervals(duplicated)[1]
    const unique = makeShowLayoutIntervalUnique(duplicated, second.id)

    expect(showLayoutZoneIdAtTime(unique, second.startMs + 1)).toBe(
      unique.routingLayouts[1].zones[0].zoneId,
    )
    expect(showLayoutZoneIdAtTime(unique, second.startMs + 1)).not.toBe(unique.zones[0].id)
  })

  it('lowers explicit Layout occurrences through the existing routed compiler contract', () => {
    const base = addShowRoutingLayout(showWithComposition(), 'Alternate')
    const alternateId = base.routingLayouts[1].id
    const show = insertShowLayoutInterval(base, {
      atMs: 10_000,
      durationMs: 5_000,
      layoutId: alternateId,
    })
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: { 'cell-1': 'export function render(index) { return index }' },
      byPatternInstanceId: { 'instance-1': 'export function render(index) { return index }' },
    })

    expect(recipe.routingSwitches).toEqual([
      expect.objectContaining({ atMs: 10_000, layoutId: alternateId, durationMs: 0 }),
      expect.objectContaining({ atMs: 15_000, layoutId: 'layout-1', durationMs: 0 }),
    ])
    expect(recipe.routedSceneSequence?.scenes.map((scene) => scene.holdMs)).toEqual([10_000, 5_000, 20_000])
  })
})
