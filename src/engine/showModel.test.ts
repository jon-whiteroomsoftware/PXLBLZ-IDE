import {
  addShowRoutingLayout,
  addShowScene,
  addShowZone,
  createDefaultShowFromController,
  createDefaultShow,
  extendShowCell,
  formatShowRoutingRanges,
  parseShowRoutingRanges,
  projectShowStrip,
  projectShowTimeline,
  removeShowRoutingLayout,
  removeShowScene,
  removeShowZone,
  showLoopDurationMs,
  showRecordToCompileRecipe,
  spanShowCellZones,
  updateShowCellZoneMode,
  updateShowCellAdaptations,
  updateShowCellPattern,
  updateShowScene,
  updateShowRoutingLayout,
  updateShowRoutingSwitch,
  updateShowTransition,
  updateShowZone,
} from './showModel'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import type { ShowRecord } from './personalContentRecords'

function expectHoleFreeStrip(show: ShowRecord): void {
  const strip = projectShowStrip(show)
  for (const row of strip.rows) {
    const covered = new Set<number>()
    for (const cell of row.cells) {
      for (let index = cell.sceneIndex; index < cell.sceneIndex + cell.sceneSpan; index += 1) {
        covered.add(index)
      }
    }
    expect([...covered].sort((a, b) => a - b)).toEqual(show.scenes.map((_, index) => index))
  }
}

describe('showModel (#318)', () => {
  it('creates, edits, switches, and safely removes named routing layouts (#398)', () => {
    const show = addShowZone(createDefaultShow('show-1', 'Routing Show'), {
      name: 'right',
      nominalPixelCount: 4,
    })

    expect(show.routingLayouts).toEqual([
      {
        id: 'layout-1',
        name: 'Default',
        zones: [
          { zoneId: 'zone-1', ranges: [{ start: 0, end: 59 }] },
          { zoneId: 'zone-2', ranges: [{ start: 60, end: 63 }] },
        ],
      },
    ])

    const withSplit = addShowRoutingLayout(show, 'Alternating')
    const split = withSplit.routingLayouts[1]
    const edited = updateShowRoutingLayout(withSplit, split.id, {
      zones: [
        { zoneId: 'zone-1', ranges: [{ start: 0, end: 1 }, { start: 4, end: 5 }] },
        { zoneId: 'zone-2', ranges: [{ start: 2, end: 3 }, { start: 6, end: 7 }] },
      ],
    })
    const switched = updateShowRoutingSwitch(edited, show.scenes[0].id, split.id)

    expect(projectShowStrip(switched).routingSwitches).toEqual([
      {
        afterSceneId: show.scenes[0].id,
        layoutId: split.id,
        layoutName: 'Alternating',
      },
    ])

    const removed = removeShowRoutingLayout(switched, split.id)
    expect(removed.routingLayouts).toHaveLength(1)
    expect(removed.routingSwitches).toEqual([])
    expect(removeShowRoutingLayout(removed, removed.routingLayouts[0].id)).toBe(removed)
  })

  it('round-trips compact range-list authoring text (#398)', () => {
    expect(parseShowRoutingRanges('0-3, 8, 12-15')).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 8 },
      { start: 12, end: 15 },
    ])
    expect(formatShowRoutingRanges(parseShowRoutingRanges('3-0, 8')!)).toBe('0-3, 8')
    expect(parseShowRoutingRanges('0-3, nope')).toBeNull()
  })

  it('clears logical geometry when one of its zones is removed (#409)', () => {
    const show = addShowZone(createDefaultShow('show-1', 'Adaptive Show'), {
      name: 'right',
      nominalPixelCount: 60,
    })
    const layout = show.routingLayouts[0]
    const logical = updateShowRoutingLayout(show, layout.id, {
      logical: { kind: 'stripes', zoneIds: show.zones.map((zone) => zone.id), axis: 'x' },
    })

    expect(removeShowZone(logical, show.zones[1].id).routingLayouts[0].logical).toBeUndefined()
  })

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
    expect(showLoopDurationMs(show)).toBe(62000)
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

  it('projects scene, transition, and cell spans onto one proportional time axis (#414)', () => {
    const show = createDefaultShow('show-1', 'Untitled Show')
    const timeline = projectShowTimeline(show)

    expect(timeline.durationMs).toBe(62_000)
    expect(timeline.scenes.map(({ sceneId, startMs, endMs }) => ({ sceneId, startMs, endMs }))).toEqual([
      { sceneId: 'scene-1', startMs: 0, endMs: 30_000 },
      { sceneId: 'scene-2', startMs: 32_000, endMs: 62_000 },
    ])
    expect(timeline.transitions).toEqual([
      expect.objectContaining({ afterSceneId: 'scene-1', startMs: 30_000, endMs: 32_000 }),
    ])
    expect(timeline.rows[0].cells.map(({ id, startMs, endMs }) => ({ id, startMs, endMs }))).toEqual([
      { id: 'cell-1', startMs: 0, endMs: 30_000 },
      { id: 'cell-2', startMs: 32_000, endMs: 62_000 },
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

  it('appends a scene by copying the prior scene cells per zone', () => {
    const base = addShowZone(createDefaultShow('show-1', 'Untitled Show'), {
      name: 'doorframe',
      nominalPixelCount: 12,
    })
    const secondMain = base.cells.find((cell) => cell.zoneId === 'zone-1' && cell.sceneId === 'scene-2')!
    const secondDoor = base.cells.find((cell) => cell.zoneId === 'zone-2' && cell.sceneId === 'scene-2')!
    const customized = updateShowCellAdaptations(
      updateShowCellPattern(base, secondDoor.id, {
        pattern: { kind: 'stock', id: 'RainbowMelt' },
        patternName: 'RainbowMelt',
      }),
      secondMain.id,
      { brightness: 0.42, phase: 0.25 },
    )

    const next = addShowScene(customized)
    const newScene = next.scenes[2]
    const newMain = next.cells.find((cell) => cell.zoneId === 'zone-1' && cell.sceneId === newScene.id)!
    const newDoor = next.cells.find((cell) => cell.zoneId === 'zone-2' && cell.sceneId === newScene.id)!

    expect(newScene).toMatchObject({ id: 'scene-3', name: 'Scene 3', durationMs: 30000 })
    expect(next.scenes[1].transitionOut).toEqual({ kind: 'crossfade', durationMs: 2000 })
    expect(newMain).toMatchObject({
      pattern: secondMain.pattern,
      patternName: secondMain.patternName,
      adaptations: { ...secondMain.adaptations, brightness: 0.42, phase: 0.25 },
      sceneSpan: 1,
      zoneSpan: 1,
    })
    expect(newDoor).toMatchObject({
      pattern: { kind: 'stock', id: 'RainbowMelt' },
      patternName: 'RainbowMelt',
      sceneSpan: 1,
      zoneSpan: 1,
    })
    expectHoleFreeStrip(next)
  })

  it('appends after a hold by restarting the covering cell instead of extending it', () => {
    const held = extendShowCell(createDefaultShow('show-1', 'Untitled Show'), 'cell-1', 2)
    const next = addShowScene(held)
    const newScene = next.scenes[2]
    const newCell = next.cells.find((cell) => cell.sceneId === newScene.id && cell.zoneId === 'zone-1')!

    expect(next.cells.find((cell) => cell.id === 'cell-1')).toMatchObject({ sceneSpan: 2 })
    expect(newCell).toMatchObject({
      pattern: held.cells[0].pattern,
      patternName: held.cells[0].patternName,
      sceneSpan: 1,
      zoneSpan: 1,
    })
    expectHoleFreeStrip(next)
  })

  it('removes scenes by deleting owned cells and clipping spans', () => {
    const threeScene = addShowScene(createDefaultShow('show-1', 'Untitled Show'))
    const held = extendShowCell(threeScene, 'cell-1', 3)
    const removed = removeShowScene(held, 'scene-2')

    expect(removed.scenes.map((scene) => scene.id)).toEqual(['scene-1', 'scene-3'])
    expect(removed.cells.some((cell) => cell.sceneId === 'scene-2')).toBe(false)
    expect(removed.cells.find((cell) => cell.id === 'cell-1')).toMatchObject({ sceneSpan: 2 })
    expect(removed.scenes[1].transitionOut).toBeUndefined()
    expectHoleFreeStrip(removed)
  })

  it('re-anchors a holding cell that starts at the removed scene', () => {
    const held = extendShowCell(createDefaultShow('show-1', 'Untitled Show'), 'cell-1', 2)
    const removed = removeShowScene(held, 'scene-1')

    expect(removed.scenes.map((scene) => scene.id)).toEqual(['scene-2'])
    expect(removed.cells).toHaveLength(1)
    expect(removed.cells[0]).toMatchObject({
      id: 'cell-1',
      sceneId: 'scene-2',
      sceneSpan: 1,
    })
    expectHoleFreeStrip(removed)
  })

  it('removes the final scene by clearing the new final transition and preserves one-scene shows', () => {
    const threeScene = addShowScene(createDefaultShow('show-1', 'Untitled Show'))
    const twoScene = removeShowScene(threeScene, 'scene-3')
    const oneScene = removeShowScene(twoScene, 'scene-2')
    const noOp = removeShowScene(oneScene, 'scene-1')

    expect(twoScene.scenes.map((scene) => scene.id)).toEqual(['scene-1', 'scene-2'])
    expect(twoScene.scenes[1].transitionOut).toBeUndefined()
    expect(oneScene.scenes.map((scene) => scene.id)).toEqual(['scene-1'])
    expect(noOp).toBe(oneScene)
    expectHoleFreeStrip(twoScene)
    expectHoleFreeStrip(oneScene)
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

    expect(showLoopDurationMs(cellEdited)).toBe(77000)
    expect(cellEdited.cells[0].adaptations).toEqual({
      mirror: true,
      phase: 0.25,
      brightness: 0.7,
      timeScale: 0.5,
    })
  })

  it('accepts an exact-zero time scale and clamps negative values back to zero', () => {
    const show = createDefaultShow('show-1', 'Untitled Show')
    const paused = updateShowCellAdaptations(show, show.cells[0].id, { timeScale: 0 })
    const negative = updateShowCellAdaptations(show, show.cells[0].id, { timeScale: -1 })

    expect(paused.cells[0].adaptations.timeScale).toBe(0)
    expect(negative.cells[0].adaptations.timeScale).toBe(0)
  })

  it('normalizes and removes a non-destructive light shutter adaptation', () => {
    const show = createDefaultShow('show-1', 'Untitled Show')
    const shuttered = updateShowCellAdaptations(show, show.cells[0].id, {
      lightShutter: { rateHz: 120, duty: -0.2, phase: 2, clockBehavior: 'freeze' },
    })
    const removed = updateShowCellAdaptations(shuttered, show.cells[0].id, {
      lightShutter: undefined,
    })

    expect(shuttered.cells[0].adaptations.lightShutter).toEqual({
      rateHz: 60,
      duty: 0,
      phase: 1,
      clockBehavior: 'freeze',
    })
    expect(removed.cells[0].adaptations.lightShutter).toBeUndefined()
  })

  it('normalizes and removes stepped-clock cadence independently from other adaptations', () => {
    const show = createDefaultShow('show-1', 'Untitled Show')
    const stepped = updateShowCellAdaptations(show, show.cells[0].id, {
      steppedClock: { stepMs: 5 },
      timeScale: 0.5,
      lightShutter: { rateHz: 8, duty: 0.5, phase: 0, clockBehavior: 'continue' },
    })
    const removed = updateShowCellAdaptations(stepped, show.cells[0].id, {
      steppedClock: undefined,
    })

    expect(stepped.cells[0].adaptations).toMatchObject({
      steppedClock: { stepMs: 16 },
      timeScale: 0.5,
      lightShutter: { rateHz: 8, duty: 0.5, phase: 0, clockBehavior: 'continue' },
    })
    expect(removed.cells[0].adaptations.steppedClock).toBeUndefined()
    expect(removed.cells[0].adaptations.lightShutter).toBeDefined()
  })

  it('normalizes a non-negative private time offset independently from cadence and time scale', () => {
    const show = createDefaultShow('show-1', 'Untitled Show')
    const offset = updateShowCellAdaptations(show, show.cells[0].id, {
      timeOffsetMs: 750,
      timeScale: 0,
      steppedClock: { stepMs: 125 },
    })
    const clamped = updateShowCellAdaptations(offset, show.cells[0].id, { timeOffsetMs: -50 })

    expect(offset.cells[0].adaptations).toMatchObject({
      timeOffsetMs: 750,
      timeScale: 0,
      steppedClock: { stepMs: 125 },
    })
    expect(clamped.cells[0].adaptations.timeOffsetMs).toBe(0)
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

  it('passes a light shutter into the compiler recipe and keeps unlike shutters as separate clips', () => {
    const base = createDefaultShow('show-1', 'Untitled Show')
    const samePattern = updateShowCellPattern(base, base.cells[1].id, {
      pattern: base.cells[0].pattern,
      patternName: base.cells[0].patternName,
    })
    const shuttered = updateShowCellAdaptations(samePattern, samePattern.cells[0].id, {
      lightShutter: { rateHz: 8, duty: 0.35, phase: 0.1, clockBehavior: 'continue' },
    })
    const recipe = showRecordToCompileRecipe(shuttered, {
      byCellId: {
        [shuttered.cells[0].id]: DEMOS.TestPattern1D,
        [shuttered.cells[1].id]: DEMOS.TestPattern1D,
      },
    })

    expect(recipe.clips[0].adaptation?.lightShutter).toEqual({
      rateHz: 8,
      duty: 0.35,
      phase: 0.1,
      clockBehavior: 'continue',
    })
    expect(recipe.clips).toHaveLength(2)
    expect(recipe.crossfade).toEqual({ startMs: 30000, durationMs: 2000 })
    expect(recipe.adaptationRamp).toBeUndefined()
  })

  it('passes stepped cadence into the recipe and keeps unlike schedules as separate clips', () => {
    const base = createDefaultShow('show-1', 'Untitled Show')
    const samePattern = updateShowCellPattern(base, base.cells[1].id, {
      pattern: base.cells[0].pattern,
      patternName: base.cells[0].patternName,
    })
    const stepped = updateShowCellAdaptations(samePattern, samePattern.cells[0].id, {
      steppedClock: { stepMs: 125 },
    })
    const recipe = showRecordToCompileRecipe(stepped, {
      byCellId: {
        [stepped.cells[0].id]: DEMOS.TestPattern1D,
        [stepped.cells[1].id]: DEMOS.TestPattern1D,
      },
    })

    expect(recipe.clips[0].adaptation?.steppedClock).toEqual({ stepMs: 125 })
    expect(recipe.clips).toHaveLength(2)
    expect(recipe.crossfade).toEqual({ startMs: 30000, durationMs: 2000 })
    expect(recipe.adaptationRamp).toBeUndefined()
  })

  it('passes private time offset into the recipe and keeps unlike origins as separate clips', () => {
    const base = createDefaultShow('show-1', 'Untitled Show')
    const samePattern = updateShowCellPattern(base, base.cells[1].id, {
      pattern: base.cells[0].pattern,
      patternName: base.cells[0].patternName,
    })
    const offset = updateShowCellAdaptations(samePattern, samePattern.cells[0].id, {
      timeOffsetMs: 500,
    })
    const recipe = showRecordToCompileRecipe(offset, {
      byCellId: {
        [offset.cells[0].id]: DEMOS.TestPattern1D,
        [offset.cells[1].id]: DEMOS.TestPattern1D,
      },
    })

    expect(recipe.clips[0].adaptation?.timeOffsetMs).toBe(500)
    expect(recipe.clips).toHaveLength(2)
    expect(recipe.crossfade).toEqual({ startMs: 30000, durationMs: 2000 })
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
      timeScale: 0,
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
      from: { brightness: 1, phase: 0, timeScale: 1, mirror: false, timeOffsetMs: 0 },
      to: { brightness: 0.4, phase: 0.25, timeScale: 0, mirror: false, timeOffsetMs: 0 },
    })
    expect(recipe.crossfade).toBeUndefined()
  })

  it('emits a route-cost transition recipe for wipe and dither boundaries', () => {
    const show = updateShowTransition(
      createDefaultShow('show-1', 'Untitled Show'),
      'scene-1',
      'wipe',
      1500,
      0.25,
    )
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: {
        [show.cells[0].id]: DEMOS.TestPattern1D,
        [show.cells[1].id]: DEMOS.CometLoom,
      },
    })

    expect(recipe.routeTransition).toEqual({
      kind: 'wipe',
      startMs: 30000,
      durationMs: 1500,
      feather: 0.25,
    })
    expect(recipe.crossfade).toBeUndefined()
    expect(recipe.cut).toBeUndefined()
  })

  it('clamps wipe feather to a normalized route width', () => {
    const show = createDefaultShow('show-1', 'Untitled Show')
    expect(updateShowTransition(show, 'scene-1', 'wipe', 1000, -1).scenes[0].transitionOut)
      .toMatchObject({ feather: 0 })
    expect(updateShowTransition(show, 'scene-1', 'wipe', 1000, 2).scenes[0].transitionOut)
      .toMatchObject({ feather: 1 })
  })

  it('persists portal settings and requires an explicit 2D Stage Map', () => {
    const show = updateShowTransition(
      { ...createDefaultShow('show-1', 'Portal'), stageMapId: 'sunflower-2d' },
      'scene-1',
      'portal',
      2400,
      0.18,
      { centerX: 0.3, centerY: 0.7, invert: true, featherPolicy: 'blend' },
    )

    expect(show.scenes[0].transitionOut).toEqual({
      kind: 'portal',
      durationMs: 2400,
      feather: 0.18,
      centerX: 0.3,
      centerY: 0.7,
      invert: true,
      featherPolicy: 'blend',
    })

    const sources = {
      byCellId: {
        [show.cells[0].id]: DEMOS.TestPattern1D,
        [show.cells[1].id]: DEMOS.CometLoom,
      },
    }
    expect(() => showRecordToCompileRecipe(show, sources)).toThrow(/requires a 2D Stage Map/i)
    expect(() => showRecordToCompileRecipe(show, { ...sources, stageDimension: 3 })).toThrow(/requires a 2D Stage Map/i)

    expect(showRecordToCompileRecipe(show, { ...sources, stageDimension: 2 }).routeTransition).toEqual({
      kind: 'portal',
      startMs: 30000,
      durationMs: 2400,
      feather: 0.18,
      centerX: 0.3,
      centerY: 0.7,
      invert: true,
      featherPolicy: 'blend',
    })
  })

  it('compiles a multi-scene portal loop with repeated Patterns as shared members', () => {
    let show = addShowScene({ ...createDefaultShow('show-portal-loop', 'Portal loop'), stageMapId: 'plane' })
    const [first, second, third] = show.cells
    show = updateShowCellPattern(show, first.id, {
      pattern: { kind: 'stock', id: 'HeatShimmerTiles' },
      patternName: 'Heat Shimmer Tiles',
    })
    show = updateShowCellPattern(show, second.id, {
      pattern: { kind: 'stock', id: 'NeonCircuitBoard' },
      patternName: 'Neon Circuit Board',
    })
    show = updateShowCellPattern(show, third.id, {
      pattern: { kind: 'stock', id: 'HeatShimmerTiles' },
      patternName: 'Heat Shimmer Tiles',
    })
    show = updateShowTransition(show, show.scenes[0].id, 'portal', 2000, 0.16, {
      centerX: 0.5,
      centerY: 0.5,
      invert: false,
      featherPolicy: 'blend',
    })
    show = updateShowTransition(show, show.scenes[1].id, 'portal', 1800, 0.08, {
      centerX: 0.25,
      centerY: 0.7,
      invert: true,
      featherPolicy: 'dither',
    })

    const recipe = showRecordToCompileRecipe(show, {
      byCellId: {
        [first.id]: DEMOS.HeatShimmerTiles,
        [second.id]: DEMOS.NeonCircuitBoard,
        [third.id]: DEMOS.HeatShimmerTiles,
      },
      stageDimension: 2,
    })

    expect(recipe.clips).toHaveLength(2)
    expect(recipe.clips.map((clip) => clip.id)).toEqual([first.id, second.id])
    expect(recipe.sceneSequence).toEqual({
      scenes: [
        {
          clipId: first.id,
          holdMs: 30000,
          transitionOut: {
            kind: 'portal',
            durationMs: 2000,
            feather: 0.16,
            centerX: 0.5,
            centerY: 0.5,
            invert: false,
            featherPolicy: 'blend',
          },
        },
        {
          clipId: second.id,
          holdMs: 30000,
          transitionOut: {
            kind: 'portal',
            durationMs: 1800,
            feather: 0.08,
            centerX: 0.25,
            centerY: 0.7,
            invert: true,
            featherPolicy: 'dither',
          },
        },
        { clipId: first.id, holdMs: 30000 },
      ],
    })
    expect(showLoopDurationMs(show)).toBe(93800)
  })

  it('keeps later wipe scenes in a sequence that begins with a portal', () => {
    let show = addShowScene({ ...createDefaultShow('show-mixed', 'Mixed transitions'), stageMapId: 'plane' })
    const [first, second, third] = show.cells
    show = updateShowCellPattern(show, first.id, {
      pattern: { kind: 'stock', id: 'HeatShimmerTiles' },
      patternName: 'Heat Shimmer Tiles',
    })
    show = updateShowCellPattern(show, second.id, {
      pattern: { kind: 'stock', id: 'NeonCircuitBoard' },
      patternName: 'Neon Circuit Board',
    })
    show = updateShowCellPattern(show, third.id, {
      pattern: { kind: 'stock', id: 'GlyphRain' },
      patternName: 'Glyph Rain',
    })
    show = updateShowTransition(show, show.scenes[0].id, 'portal', 3000, 0.12, {
      centerX: 0.5,
      centerY: 0.5,
      featherPolicy: 'blend',
    })
    show = updateShowTransition(show, show.scenes[1].id, 'wipe', 3000, 0.2)

    const recipe = showRecordToCompileRecipe(show, {
      byCellId: {
        [first.id]: DEMOS.HeatShimmerTiles,
        [second.id]: DEMOS.NeonCircuitBoard,
        [third.id]: DEMOS.GlyphRain,
      },
      stageDimension: 2,
    })

    expect(recipe.clips).toHaveLength(3)
    expect(recipe.sceneSequence?.scenes[1].transitionOut).toEqual({
      kind: 'wipe',
      durationMs: 3000,
      feather: 0.2,
    })
    expect(recipe.sceneSequence?.scenes[2].clipId).toBe(third.id)
  })

  it('builds routed clips for every show-local zone in the first scene', () => {
    const show = addShowZone(createDefaultShow('show-1', 'Untitled Show'), {
      name: 'doorframe',
      nominalPixelCount: 12,
    })
    const doorCell = show.cells.find((cell) => cell.zoneId === 'zone-2' && cell.sceneId === 'scene-1')!
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: {
        [show.cells[0].id]: DEMOS.TestPattern1D,
        [doorCell.id]: DEMOS.CometLoom,
      },
    })

    expect(recipe.clips).toEqual([
      expect.objectContaining({ id: 'cell-1', zone: 'main' }),
      expect.objectContaining({ id: doorCell.id, zone: 'doorframe' }),
    ])
    expect(recipe.zones).toEqual([
      { id: 'zone-1', name: 'main', ranges: [{ start: 0, end: 59 }] },
      { id: 'zone-2', name: 'doorframe', ranges: [{ start: 60, end: 71 }] },
    ])
  })

  it('binds show-local zone names to controller zones when a target is available', () => {
    const show = addShowZone(createDefaultShow('show-1', 'Untitled Show'), {
      name: 'doorframe',
      nominalPixelCount: 12,
    })
    const doorCell = show.cells.find((cell) => cell.zoneId === 'zone-2' && cell.sceneId === 'scene-1')!
    const controllerZones = [
      { id: 'controller-main', name: 'main', ranges: [{ start: 100, end: 139 }] },
      {
        id: 'controller-door',
        name: 'doorframe',
        ranges: [
          { start: 0, end: 1 },
          { start: 6, end: 7 },
        ],
      },
    ]
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: {
        [show.cells[0].id]: DEMOS.TestPattern1D,
        [doorCell.id]: DEMOS.CometLoom,
      },
      controllerZones,
    })

    expect(recipe.zones).toEqual(controllerZones)
  })

  it('edits show-local zone rows and seeds a show from controller zones', () => {
    const show = addShowZone(createDefaultShow('show-1', 'Untitled Show'), {
      name: 'doorframe',
      nominalPixelCount: 12,
    })
    const edited = updateShowZone(show, 'zone-2', { name: 'entry', nominalPixelCount: 20 })
    expect(projectShowStrip(edited).rows.map((row) => [row.zoneName, row.nominalPixelCount])).toEqual([
      ['main', 60],
      ['entry', 20],
    ])

    const seeded = createDefaultShowFromController('show-2', 'Controller Show', {
      id: 'controller-1',
      name: 'North Arch',
      board: { kind: 'pixelblaze-v3-standard' },
      inputs: [],
      globalTransforms: [],
      patternBindings: [],
      zones: [
        { id: 'left', name: 'arch-left', ranges: [{ start: 0, end: 119 }] },
        {
          id: 'right',
          name: 'arch-right',
          ranges: [
            { start: 120, end: 179 },
            { start: 220, end: 279 },
          ],
        },
      ],
      updatedAt: 1,
    })

    expect(seeded.targetControllerProfileId).toBe('controller-1')
    expect(seeded.zones.map((zone) => [zone.name, zone.nominalPixelCount])).toEqual([
      ['arch-left', 120],
      ['arch-right', 120],
    ])
    expect(seeded.cells.filter((cell) => cell.sceneId === 'scene-1')).toHaveLength(2)
  })

  it('emits a spanned zone cell as one-canvas route targets', () => {
    const show = addShowZone(createDefaultShow('show-1', 'Untitled Show'), {
      name: 'doorframe',
      nominalPixelCount: 12,
    })
    const spanned = spanShowCellZones(show, 'cell-1', 2)
    const strip = projectShowStrip(spanned)
    const firstCell = strip.rows[0].cells[0]
    expect(firstCell.rowSpan).toBe(2)
    expect(spanned.cells.some((cell) => cell.id === 'cell-3')).toBe(false)

    const recipe = showRecordToCompileRecipe(spanned, {
      byCellId: {
        'cell-1': DEMOS.TestPattern1D,
      },
    })

    expect(recipe.clips).toEqual([
      expect.objectContaining({
        id: 'cell-1',
        zones: ['main', 'doorframe'],
        zoneMode: 'span',
      }),
    ])
  })

  it('emits a repeated zone span as one shared member over independent domains', () => {
    const show = addShowZone(createDefaultShow('show-1', 'Untitled Show'), {
      name: 'doorframe',
      nominalPixelCount: 12,
    })
    const repeated = updateShowCellZoneMode(spanShowCellZones(show, 'cell-1', 2), 'cell-1', 'repeat')
    const recipe = showRecordToCompileRecipe(repeated, {
      byCellId: { 'cell-1': DEMOS.TestPattern1D },
    })

    expect(repeated.cells.find((cell) => cell.id === 'cell-1')).toMatchObject({
      zoneSpan: 2,
      zoneMode: 'repeat',
    })
    expect(recipe.clips).toEqual([
      expect.objectContaining({
        id: 'cell-1',
        zones: ['main', 'doorframe'],
        zoneMode: 'repeat',
      }),
    ])
  })
})
