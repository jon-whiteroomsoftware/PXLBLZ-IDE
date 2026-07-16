import { describe, expect, it } from 'vitest'
import {
  addShowZone,
  createDefaultShow,
  extendShowCell,
  placeShowClip,
  updateShowBoundaryTransition,
  updateShowCellEffects,
} from './showModel'
import { projectFlatShowComposition } from './showCompositionProjection'
import { projectSceneReadOnlyBridge } from './showSceneReadOnlyProjection'

const SOURCE = 'export function render(index) { hsv(index / 60, 1, 1) }'

describe('Scene read-only projection (#471)', () => {
  it('projects one Scene into stable X-ray strata and truthful Super Detail context', () => {
    let show = createDefaultShow('scene-read-only', 'Read-only bridge', 1)
    show = extendShowCell(show, 'cell-1', 2)
    show = updateShowCellEffects(show, 'cell-1', [
      { id: 'fx-swirl', kind: 'swirl', amount: 0.7, radius: 0.5, centerX: 0.5, centerY: 0.5 },
    ])
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        brightness: {
          fromByCellId: { 'cell-1': 0.2 },
          durationMs: 800,
          easing: 'ease-in-out',
        },
      },
    })
    const projection = projectFlatShowComposition(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, SOURCE])),
      stageDimension: 2,
    })

    const detail = projectSceneReadOnlyBridge(projection, 'scene-2')

    expect(detail).toMatchObject({
      sceneId: 'scene-2',
      sceneName: 'Scene 2',
      durationMs: 30_000,
      globalStartMs: 32_000,
      globalEndMs: 62_000,
      incomingBoundary: {
        kind: 'crossfade',
        durationMs: 2_000,
      },
      outgoingBoundary: null,
    })
    expect(detail.xray.cutReferences.map((reference) => reference.localTimeMs)).toEqual([0, 30_000])
    expect(detail.xray.effectActivity).toEqual([
      expect.objectContaining({ effectId: 'fx-swirl', effectKind: 'swirl', startMs: 0, endMs: 30_000 }),
    ])
    expect(detail.xray.propertyBeats).toEqual([
      expect.objectContaining({
        property: 'brightness',
        localTimeMs: 0,
        durationMs: 800,
        fromValue: 0.2,
        toValue: 1,
        easing: { curve: 'quadratic', direction: 'in-out' },
        ownerId: 'transition-scene-1',
      }),
    ])
    expect(detail.zones[0]).toMatchObject({
      zoneName: 'main',
      placements: [expect.objectContaining({ patternName: 'TestPattern1D', continuesFromPrevious: true })],
    })
  })

  it('marks later routed Scene placements as compiled and available (#478)', () => {
    let show = addShowZone(createDefaultShow('scene-diagnostic', 'Diagnostic bridge', 1))
    show = placeShowClip(show, 'zone-2', 'scene-2', {
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: 'CometLoom',
    })
    const projection = projectFlatShowComposition(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, SOURCE])),
      stageDimension: 2,
    })

    const detail = projectSceneReadOnlyBridge(projection, 'scene-2')
    const comet = detail.zones.flatMap((zone) => zone.placements).find((placement) => placement.patternName === 'CometLoom')

    expect(comet).toMatchObject({ compiled: true, diagnostics: [] })
    expect(detail.diagnostics).toEqual([])
  })
})
