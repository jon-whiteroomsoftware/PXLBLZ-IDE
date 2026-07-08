import {
  createDefaultShow,
  extendShowCell,
  projectShowStrip,
  showLoopDurationMs,
  showRecordToCompileRecipe,
  updateShowCellAdaptations,
  updateShowCellPattern,
  updateShowScene,
} from './showModel'
import { DEMOS } from '@/pixelblaze/stock/patterns'

describe('showModel (#318)', () => {
  it('creates a two-scene scene-strip show with one zone and editable cells', () => {
    const show = createDefaultShow('show-1', 'Untitled Show')

    expect(show).toMatchObject({
      id: 'show-1',
      name: 'Untitled Show',
      scenes: [
        { name: 'Scene 1', durationMs: 30000 },
        { name: 'Scene 2', durationMs: 30000 },
      ],
      zones: [{ name: 'main', nominalPixelCount: 60 }],
    })
    expect(show.cells).toHaveLength(2)
    expect(showLoopDurationMs(show)).toBe(60000)
  })

  it('projects cells into scene columns, transition columns, and zone rows', () => {
    const show = createDefaultShow('show-1', 'Untitled Show')
    const strip = projectShowStrip(show)

    expect(strip.sceneColumns.map((scene) => scene.name)).toEqual(['Scene 1', 'Scene 2'])
    expect(strip.transitions).toEqual([
      { afterSceneId: show.scenes[0].id, kind: 'crossfade', durationMs: 2000, cost: 'expensive' },
    ])
    expect(strip.rows).toEqual([
      expect.objectContaining({
        zoneName: 'main',
        cells: [
          expect.objectContaining({ sceneId: show.scenes[0].id, sceneSpan: 1 }),
          expect.objectContaining({ sceneId: show.scenes[1].id, sceneSpan: 1 }),
        ],
      }),
    ])
  })

  it('extends a cell across scene boundaries to represent a hold', () => {
    const show = createDefaultShow('show-1', 'Untitled Show')
    const extended = extendShowCell(show, show.cells[0].id, 2)

    expect(extended.cells.find((cell) => cell.id === show.cells[0].id)).toMatchObject({
      sceneId: show.scenes[0].id,
      sceneSpan: 2,
    })
    expect(projectShowStrip(extended).rows[0].cells).toHaveLength(1)
  })

  it('edits scene duration and non-destructive cell adaptations', () => {
    const show = createDefaultShow('show-1', 'Untitled Show')
    const sceneEdited = updateShowScene(show, show.scenes[0].id, { durationMs: 45000 })
    const cellEdited = updateShowCellAdaptations(sceneEdited, show.cells[0].id, {
      mirror: true,
      phase: 0.25,
      brightness: 0.7,
      timeScale: 0.5,
    })

    expect(showLoopDurationMs(cellEdited)).toBe(75000)
    expect(cellEdited.cells[0].adaptations).toEqual({
      mirror: true,
      phase: 0.25,
      brightness: 0.7,
      timeScale: 0.5,
    })
  })

  it('builds the current compiler recipe from the first two scene cells', () => {
    const show = createDefaultShow('show-1', 'Untitled Show')
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: {
        [show.cells[0].id]: DEMOS.TestPattern1D,
        [show.cells[1].id]: DEMOS.CometLoom,
      },
      controllerZones: [{ id: 'zone-1', name: 'main', ranges: [{ start: 0, end: 59 }] }],
    })

    expect(recipe).toMatchObject({
      clips: [
        { id: show.cells[0].id },
        { id: show.cells[1].id },
      ],
      crossfade: { startMs: 30000, durationMs: 2000 },
    })
  })

  it('emits a single continuous clip recipe for a spanning hold cell', () => {
    const show = extendShowCell(createDefaultShow('show-1', 'Untitled Show'), 'cell-1', 2)
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: {
        [show.cells[0].id]: DEMOS.TestPattern1D,
      },
    })

    expect(recipe).toMatchObject({
      clips: [{ id: 'cell-1' }],
    })
    expect(recipe.clips).toHaveLength(1)
    expect(recipe.crossfade).toBeUndefined()
    expect(recipe.cut).toBeUndefined()
    expect(recipe.adaptationRamp).toBeUndefined()
  })

  it('emits a parameter ramp when adjacent same-pattern cells transition adaptations', () => {
    const base = createDefaultShow('show-1', 'Untitled Show')
    const samePattern = updateShowCellPattern(base, base.cells[1].id, {
      pattern: base.cells[0].pattern,
      patternName: base.cells[0].patternName,
    })
    const adapted = updateShowCellAdaptations(samePattern, samePattern.cells[1].id, {
      brightness: 0.4,
      phase: 0.25,
    })
    const recipe = showRecordToCompileRecipe(adapted, {
      byCellId: {
        [adapted.cells[0].id]: DEMOS.TestPattern1D,
        [adapted.cells[1].id]: DEMOS.TestPattern1D,
      },
    })

    expect(recipe.clips).toHaveLength(1)
    expect(recipe.adaptationRamp).toEqual({
      startMs: 30000,
      durationMs: 2000,
      from: { brightness: 1, phase: 0, timeScale: 1, mirror: false },
      to: { brightness: 0.4, phase: 0.25, timeScale: 1, mirror: false },
    })
    expect(recipe.crossfade).toBeUndefined()
  })

  it('emits a route-cost transition recipe for wipe and dither boundaries', () => {
    const show = updateShowScene(createDefaultShow('show-1', 'Untitled Show'), 'scene-1', {
      transitionOut: { kind: 'wipe', durationMs: 1500 },
    })
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: {
        [show.cells[0].id]: DEMOS.TestPattern1D,
        [show.cells[1].id]: DEMOS.CometLoom,
      },
    })

    expect(recipe.routeTransition).toEqual({ kind: 'wipe', startMs: 30000, durationMs: 1500 })
    expect(recipe.crossfade).toBeUndefined()
    expect(recipe.cut).toBeUndefined()
  })
})
