import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import {
  projectShowGroupClipInspector,
  updateShowGroupClipInspector,
} from './showGroupClipInspectorModel'
import { validateShowGroups } from './showGroupModel'

function fixture() {
  const show = createDefaultShow('group-inspector', 'Group inspector', 100)
  const sceneId = show.scenes[0].id
  const zoneId = show.zones[0].id
  show.composition = {
    version: 1,
    executionModel: 'deterministic-loop',
    patternInstances: [],
    scenes: show.scenes.map((scene) => ({
      sceneId: scene.id,
      zones: [{ zoneId, main: [], overlays: [] }],
    })),
    groupDefinitions: [{
      id: 'phrase',
      name: 'Phrase',
      patternInstances: [{
        id: 'inside-instance',
        pattern: { kind: 'stock', id: 'hue-wave' },
        patternName: 'Hue Wave',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'inside-clip',
        instanceId: 'inside-instance',
        layerOffset: 1,
        startMs: 250,
        durationMs: 1_000,
        opacity: 0.75,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }],
    groupOccurrences: [
      { id: 'use-a', definitionId: 'phrase', sceneId, zoneId, startMs: 0, baseLayer: 0, translationX: 0, translationY: 0 },
      { id: 'use-b', definitionId: 'phrase', sceneId, zoneId, startMs: 2_000, baseLayer: 0, translationX: 0, translationY: 0 },
    ],
  }
  return show
}

describe('Show Group Clip inspector model', () => {
  it('projects a definition child through one occurrence in Show-global time (#634)', () => {
    const value = projectShowGroupClipInspector(fixture(), {
      occurrenceId: 'use-b',
      placementId: 'inside-clip',
    })

    expect(value).toMatchObject({
      patternName: 'Hue Wave',
      placementId: 'inside-clip',
      instanceId: 'inside-instance',
      local: { startMs: 2_250, durationMs: 1_000, opacity: 0.75 },
    })
  })

  it('converts a Show-global Start edit back to the shared Group offset (#634)', () => {
    const show = fixture()
    const original = structuredClone(show)
    const updated = updateShowGroupClipInspector(show, {
      occurrenceId: 'use-b',
      placementId: 'inside-clip',
    }, {
      local: { startMs: 2_750 },
    })

    expect(show).toEqual(original)
    expect(updated.composition?.groupDefinitions?.[0].placements[0].startMs).toBe(750)
    expect(projectShowGroupClipInspector(updated, {
      occurrenceId: 'use-b',
      placementId: 'inside-clip',
    })?.local?.startMs).toBe(2_750)
    expect(projectShowGroupClipInspector(updated, {
      occurrenceId: 'use-a',
      placementId: 'inside-clip',
    })?.local?.startMs).toBe(750)
    expect(validateShowGroups(updated, updated.composition!)).toEqual([])
  })

  it('edits the shared definition so every linked occurrence receives the change', () => {
    const show = fixture()
    const updated = updateShowGroupClipInspector(show, {
      occurrenceId: 'use-a',
      placementId: 'inside-clip',
    }, {
      transform: { positionX: 0.2 },
      simulation: { timeOffsetMs: 500 },
      local: { durationMs: 1_500 },
    })

    expect(updated).not.toBe(show)
    expect(updated.composition?.groupDefinitions?.[0]).toMatchObject({
      patternInstances: [{ time: { timeScale: 1, timeOffsetMs: 500 } }],
      placements: [{ durationMs: 1_500, transform: { positionX: 0.2 } }],
    })
    expect(updated.composition?.groupOccurrences).toHaveLength(2)
  })

  it('rejects edits when the occurrence, placement, or values are invalid', () => {
    const show = fixture()
    expect(updateShowGroupClipInspector(show, {
      occurrenceId: 'missing',
      placementId: 'inside-clip',
    }, { local: { durationMs: 500 } })).toBe(show)
    expect(updateShowGroupClipInspector(show, {
      occurrenceId: 'use-a',
      placementId: 'inside-clip',
    }, { local: { durationMs: 0 } })).toBe(show)
  })
})
