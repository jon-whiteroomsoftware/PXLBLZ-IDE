import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import {
  projectShowLayoutIntervals,
  showLayoutZoneIdAtTime,
} from './showLayoutIntervals'
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
})
