import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import {
  addShowMainClipAtGlobalTime,
  planShowMainClipAtGlobalTime,
} from './showTimelineClipAuthoring'
import type { ShowCompositionV1, ShowPatternInstance } from './personalContentRecords'

function emptyComposition(show: ReturnType<typeof createDefaultShow>): ShowCompositionV1 {
  return {
    version: 1,
    patternInstances: [],
    scenes: show.scenes.map((scene) => ({
      sceneId: scene.id,
      zones: show.zones.map((zone) => ({ zoneId: zone.id, main: [], overlays: [] })),
    })),
  }
}

const instance: ShowPatternInstance = {
  id: 'instance-new',
  pattern: { kind: 'user', id: 'pattern-new' },
  patternName: 'New Pattern',
  time: { timeScale: 1, timeOffsetMs: 0 },
}

describe('global timeline Clip authoring (#580)', () => {
  it('plans a five-second Clip from empty global time', () => {
    const show = createDefaultShow('show-add-global', 'Add global', 1000)
    const composition = emptyComposition(show)

    expect(planShowMainClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 2_000,
    })).toEqual({
      enabled: true,
      code: 'ready',
      sceneId: show.scenes[0].id,
      localStartMs: 2_000,
      durationMs: 5_000,
    })
  })

  it('fills a shorter empty gap without overwriting the next Clip', () => {
    const show = createDefaultShow('show-gap-global', 'Gap global', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push({ ...instance, id: 'instance-existing' })
    composition.scenes[0].zones[0].main.push({
      id: 'placement-existing',
      instanceId: 'instance-existing',
      startMs: 4_500,
      durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })

    expect(planShowMainClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 2_000,
    })).toMatchObject({ enabled: true, localStartMs: 2_000, durationMs: 2_500 })
  })

  it('rejects occupied time and literal Transition time with reasons', () => {
    const show = createDefaultShow('show-disabled-global', 'Disabled global', 1000)
    const composition = emptyComposition(show)
    composition.patternInstances.push({ ...instance, id: 'instance-existing' })
    composition.scenes[0].zones[0].main.push({
      id: 'placement-existing',
      instanceId: 'instance-existing',
      startMs: 1_000,
      durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })

    expect(planShowMainClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 1_500,
    })).toEqual({
      enabled: false,
      code: 'occupied',
      reason: 'The selected Layer already has a Clip at the playhead.',
    })
    expect(planShowMainClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 30_500,
    })).toEqual({
      enabled: false,
      code: 'transition',
      reason: 'A Clip cannot begin inside a Transition.',
    })
  })

  it('adds the fresh Pattern instance and placement to the resolved owner', () => {
    const show = createDefaultShow('show-commit-global', 'Commit global', 1000)
    const composition = emptyComposition(show)

    const next = addShowMainClipAtGlobalTime(show, composition, {
      zoneId: show.zones[0].id,
      globalTimeMs: 33_000,
      instance,
      placementId: 'placement-new',
    })

    expect(next).not.toBe(composition)
    expect(next.patternInstances).toContainEqual(instance)
    expect(next.scenes[1].zones[0].main).toContainEqual({
      id: 'placement-new',
      instanceId: instance.id,
      startMs: 1_000,
      durationMs: 5_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
  })
})
