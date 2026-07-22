import {
  addShowRoutingLayout,
  addShowScene,
  duplicateShowScene,
  cloneShowCellAfter,
  addShowZone,
  createDefaultShowFromController,
  createDefaultShow,
  createShowWithOutputContract,
  extendShowCell,
  formatShowRoutingRanges,
  normalizeShowTransitionState,
  normalizeShowRoutingState,
  parseShowRoutingRanges,
  placeShowClip,
  moveShowCellToSlot,
  minimumShowSceneDurationMs,
  projectShowStrip,
  projectShowTimeline,
  removeShowClip,
  removeShowRoutingLayout,
  removeShowScene,
  removeShowZone,
  showLoopDurationMs,
  showSplitCapability,
  showRecordToCompileRecipe,
  splitShowAtTime,
  spanShowCellZones,
  showCellAtSlot,
  updateShowCellZoneMode,
  updateShowCellAdaptations,
  updateShowCellControlTarget,
  updateShowCellPattern,
  updateShowCellRestartOnEntry,
  updateShowBoundaryTransition,
  removeShowBoundaryTransition,
  updateShowScene,
  updateShowRoutingLayout,
  updateShowRoutingSwitch,
  updateShowTransition,
  updateShowZone,
} from './showModel'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import type { ShowRecord } from './personalContentRecords'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from './showOutputContract'
import { projectFlatShowToCompositionV1, validateShowComposition } from './showCompositionModel'

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
  it('preserves the canonical Clip Transform as first-class compiler input (#529)', () => {
    const base = createDefaultShow('show-529-transform', 'Transform', 1)
    const show: ShowRecord = {
      ...base,
      cells: base.cells.map((cell) => ({
        ...cell,
        transform: { positionX: 0.2, positionY: -0.1, rotation: 0.25, scaleX: 1.5, scaleY: 0.75 },
      })),
    }
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS[cell.pattern.id]])),
    })
    expect(recipe.clips[0].transform).toEqual(show.cells[0].transform)
  })

  it('threads normalized Show output Effects into every compile recipe (#537)', () => {
    const base = createDefaultShow('show-537-trails', 'Trails', 1)
    const show: ShowRecord = {
      ...base,
      outputEffects: [
        { id: 'trails', kind: 'trails', retention: 2 },
        { id: 'ignored-duplicate', kind: 'trails', retention: 0.25 },
      ],
    }

    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS[cell.pattern.id]])),
    })

    expect(recipe.outputEffects).toEqual([
      { id: 'trails', kind: 'trails', retention: 1 },
    ])
  })

  it('authors new crossfades with the recommended snapshot/live policy (#516)', () => {
    const show = createDefaultShow('show-516-default', 'Snapshot crossfade', 1)
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS[cell.pattern.id]])),
    })

    expect(show.transitions?.[0]).toMatchObject({
      kind: 'crossfade',
      crossfadePolicy: 'snapshot-live',
    })
    expect(recipe.crossfade).toMatchObject({
      crossfadePolicy: 'snapshot-live',
    })
  })

  it('authors crossfades selected through the legacy editor action as snapshot/live (#516)', () => {
    const base = updateShowTransition(
      createDefaultShow('show-516-editor-action', 'Snapshot crossfade', 1),
      'scene-1',
      'wipe',
      1200,
    )

    const show = updateShowTransition(base, 'scene-1', 'crossfade', 1800)

    expect(show.transitions?.[0]).toMatchObject({
      kind: 'crossfade',
      crossfadePolicy: 'snapshot-live',
      durationMs: 1800,
    })
  })

  it('compiles an Installation against its exact output count and physical layout (#435)', () => {
    const show = createShowWithOutputContract(
      'show-installation',
      'Installation',
      createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 240 }),
      1,
    )
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS[cell.pattern.id]])),
    })

    expect(recipe.masterPixelCount).toBe(240)
    expect(recipe.zones).toEqual([
      expect.objectContaining({ name: 'main', ranges: [{ start: 0, end: 239 }] }),
    ])
    expect(recipe.routingLayouts).toBeUndefined()
  })

  it('places a clip only into an empty scene and zone slot (#430)', () => {
    const base = createDefaultShow('show-430-place', 'Clip placement', 1)
    const withHole = removeShowClip(base, 'cell-1')

    const placed = placeShowClip(withHole, 'zone-1', 'scene-1', {
      pattern: { kind: 'stock', id: 'TestPattern2D' },
      patternName: 'TestPattern2D',
    })

    expect(placed).not.toBe(withHole)
    expect(showCellAtSlot(placed, 'zone-1', 'scene-1')).toMatchObject({
      id: 'cell-3',
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      sceneSpan: 1,
      zoneSpan: 1,
      pattern: { kind: 'stock', id: 'TestPattern2D' },
      patternName: 'TestPattern2D',
      adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
      restartOnEntry: false,
    })
    expect(placeShowClip(placed, 'zone-1', 'scene-1', {
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: 'CometLoom',
    })).toBe(placed)
  })

  it('adds a Zone with empty timeline slots (#63)', () => {
    const base = createDefaultShow('show-63-zone', 'Empty Zone', 1)

    const changed = addShowZone(base, { name: 'accent' })

    const addedZone = changed.zones[changed.zones.length - 1]
    expect(addedZone?.name).toBe('accent')
    expect(changed.cells).toEqual(base.cells)
    expect(showCellAtSlot(changed, addedZone.id, changed.scenes[0].id)).toBeUndefined()
  })

  it('adds and removes one-Zone composition owners atomically with topology (#581)', () => {
    const base = createDefaultShow('show-581-zone-composition', 'Zone composition', 1)
    base.composition = {
      version: 1,
      patternInstances: [],
      scenes: base.scenes.map((scene) => ({
        sceneId: scene.id,
        zones: base.zones.map((zone) => ({ zoneId: zone.id, main: [], overlays: [] })),
      })),
    }

    const added = addShowZone(base, { name: 'accent', icon: 'bolt' })
    expect(added.zones[1]).toMatchObject({ name: 'accent', icon: 'bolt' })
    expect(added.composition?.scenes.map((scene) => scene.zones.map((zone) => zone.zoneId))).toEqual([
      ['zone-1', 'zone-2'],
      ['zone-1', 'zone-2'],
    ])

    const removed = removeShowZone(added, 'zone-2')
    expect(removed.composition?.scenes.map((scene) => scene.zones.map((zone) => zone.zoneId))).toEqual([
      ['zone-1'],
      ['zone-1'],
    ])
  })

  it('gives a newly subdivided Portable Zone a valid default routing operator (#581)', () => {
    const base = createShowWithOutputContract(
      'show-581-portable-zone',
      'Portable Zone',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
    )

    const added = addShowZone(base, { name: 'accent' })

    expect(added.routingLayouts[0].logical).toEqual({
      kind: 'stripes',
      axis: 'x',
      zoneIds: ['zone-1', 'zone-2'],
    })
  })

  it('clears developer-slider targets when a clip changes Pattern (#63)', () => {
    const base = createDefaultShow('show-63-controls', 'Pattern controls', 1)
    const withTarget = updateShowCellControlTarget(base, 'cell-1', 'sliderTwist', 0.75)

    const changed = updateShowCellPattern(withTarget, 'cell-1', {
      pattern: { kind: 'stock', id: 'LineBouncer2D' },
      patternName: 'Line Bouncer 2D',
    })

    expect(changed.cells[0].controlTargets).toBeUndefined()
  })

  it('treats every slot beneath a spanning clip as occupied (#430)', () => {
    const withSecondZone = addShowZone(createDefaultShow('show-430-span', 'Spanning clip', 1))
    const spanning = spanShowCellZones(withSecondZone, 'cell-1', 2)

    expect(showCellAtSlot(spanning, 'zone-2', 'scene-1')?.id).toBe('cell-1')
    expect(placeShowClip(spanning, 'zone-2', 'scene-1', {
      pattern: { kind: 'stock', id: 'TestPattern2D' },
      patternName: 'TestPattern2D',
    })).toBe(spanning)
  })

  it('clears every conflicting clip when a zone span is extended into a hold (#430)', () => {
    const base = addShowZone(createDefaultShow('show-430-span-hold', 'Span then hold', 1))
    const spanning = spanShowCellZones(base, 'cell-1', 2)

    const held = extendShowCell(spanning, 'cell-1', 2)

    expect(held.cells).toEqual([expect.objectContaining({ id: 'cell-1', sceneSpan: 2, zoneSpan: 2 })])
  })

  it('clears every conflicting clip when a hold is expanded across zones (#430)', () => {
    const base = addShowZone(createDefaultShow('show-430-hold-span', 'Hold then span', 1))
    const held = extendShowCell(base, 'cell-1', 2)

    const spanning = spanShowCellZones(held, 'cell-1', 2)

    expect(spanning.cells).toEqual([expect.objectContaining({ id: 'cell-1', sceneSpan: 2, zoneSpan: 2 })])
  })

  it('shrinks a spanning clip when its covered zone is removed (#430)', () => {
    const base = addShowZone(createDefaultShow('show-430-remove-zone', 'Remove covered zone', 1))
    const spanning = spanShowCellZones(base, 'cell-1', 2)

    const removed = removeShowZone(spanning, 'zone-2')

    expect(removed.cells.find((cell) => cell.id === 'cell-1')).toMatchObject({
      zoneId: 'zone-1',
      zoneSpan: 1,
      zoneMode: undefined,
    })
  })

  it('reanchors a spanning clip when its starting zone is removed (#430)', () => {
    const base = addShowZone(createDefaultShow('show-430-reanchor-zone', 'Remove anchor zone', 1))
    const spanning = spanShowCellZones(base, 'cell-1', 2)

    const removed = removeShowZone(spanning, 'zone-1')

    expect(removed.cells.find((cell) => cell.id === 'cell-1')).toMatchObject({
      zoneId: 'zone-2',
      zoneSpan: 1,
      zoneMode: undefined,
    })
  })

  it('persists a progressive routing transfer on the shared boundary entity (#403)', () => {
    const base = addShowRoutingLayout(createDefaultShow('show-403', 'Progressive routing'), 'Alternate')
    const routed = updateShowRoutingSwitch(base, 'scene-1', base.routingLayouts[1].id)
    const transition = routed.transitions?.find((candidate) => candidate.kind === 'routing')
    const updated = updateShowBoundaryTransition(routed, transition!.id, {
      durationMs: 2000,
      easing: { curve: 'quadratic', direction: 'in-out' },
      routingDirection: 'reverse',
    })

    expect(updated.transitions?.find((candidate) => candidate.kind === 'routing')).toMatchObject({
      durationMs: 2000,
      easing: { curve: 'quadratic', direction: 'in-out' },
      routingDirection: 'reverse',
    })
    expect(projectShowTimeline(updated).boundaryTransitions.find((candidate) => candidate.kind === 'routing'))
      .toMatchObject({ startMs: 30_000, endMs: 32_000 })
    expect(showRecordToCompileRecipe(updated, {
      byCellId: { 'cell-1': DEMOS.TestPattern1D, 'cell-2': DEMOS.CometLoom },
    }).routingSwitches).toEqual([{
      atMs: 30_000,
      layoutId: base.routingLayouts[1].id,
      durationMs: 2000,
      easing: { curve: 'quadratic', direction: 'in-out' },
      direction: 'reverse',
    }])
  })

  it('keeps stable boundary entities canonical through visual, routing, and split edits (#416)', () => {
    const withLayout = addShowRoutingLayout(createDefaultShow('show-1', 'Boundary edits', 1), 'Alternate')
    const visualEdited = updateShowTransition(withLayout, 'scene-1', 'wipe', 1500, 0.2)
    const routed = updateShowRoutingSwitch(visualEdited, 'scene-1', withLayout.routingLayouts[1].id)

    expect(routed.transitions).toEqual([
      expect.objectContaining({
        id: 'transition-scene-1',
        afterSceneId: 'scene-1',
        kind: 'wipe',
        durationMs: 1500,
        easing: { curve: 'linear' },
        feather: 0.2,
      }),
      expect.objectContaining({
        id: 'routing-scene-1',
        afterSceneId: 'scene-1',
        kind: 'routing',
        layoutId: withLayout.routingLayouts[1].id,
      }),
    ])

    const split = splitShowAtTime(routed, 10_000)
    expect(split.transitions).toEqual([
      expect.objectContaining({ id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'cut' }),
      expect.objectContaining({ id: 'transition-scene-3', afterSceneId: 'scene-3', kind: 'wipe' }),
      expect.objectContaining({ id: 'routing-scene-3', afterSceneId: 'scene-3', kind: 'routing' }),
    ])
  })

  it('updates and removes a selected boundary by stable id without touching its neighbor (#416)', () => {
    const show = addShowScene(createDefaultShow('show-1', 'Boundary identity', 1))
    const updated = updateShowBoundaryTransition(show, 'transition-scene-2', {
      kind: 'dither',
      durationMs: 2500,
      easing: { curve: 'quadratic', direction: 'in-out' },
    })

    expect(updated.transitions?.find((transition) => transition.id === 'transition-scene-1')).toMatchObject({
      kind: 'crossfade',
      durationMs: 2000,
    })
    expect(updated.transitions?.find((transition) => transition.id === 'transition-scene-2')).toMatchObject({
      afterSceneId: 'scene-2',
      kind: 'dither',
      durationMs: 2500,
      easing: { curve: 'quadratic', direction: 'in-out' },
    })

    const removedVisual = removeShowBoundaryTransition(updated, 'transition-scene-2')
    expect(removedVisual.transitions?.find((transition) => transition.id === 'transition-scene-2')).toMatchObject({
      kind: 'cut',
      durationMs: 0,
    })
  })

  it('splits a scene and every covering cell without changing playback state (#415)', () => {
    const base = extendShowCell(createDefaultShow('show-1', 'Split Show', 1), 'cell-1', 2)
    const split = splitShowAtTime(base, 10_000)

    expect(split).not.toBe(base)
    expect(split.scenes).toEqual([
      expect.objectContaining({ id: 'scene-1', durationMs: 10_000 }),
      expect.objectContaining({ id: 'scene-3', durationMs: 20_000 }),
      base.scenes[1],
    ])
    expect(split.cells).toEqual([
      expect.objectContaining({ id: 'cell-1', sceneId: 'scene-1', sceneSpan: 1 }),
      expect.objectContaining({
        id: 'cell-2',
        sceneId: 'scene-3',
        sceneSpan: 2,
        pattern: base.cells[0].pattern,
        adaptations: base.cells[0].adaptations,
        restartOnEntry: false,
      }),
    ])
    expect(split.cells[1].pattern).not.toBe(base.cells[0].pattern)
    expect(split.cells[1].adaptations).not.toBe(base.cells[0].adaptations)
    expect(split.updatedAt).toBeGreaterThan(base.updatedAt)
  })

  it('duplicates a scene with its cells and preserves the following boundary (#424)', () => {
    const show = createDefaultShow('show-424-duplicate', 'Duplicate study', 1)

    const duplicated = duplicateShowScene(show, show.scenes[0].id)

    expect(duplicated.scenes).toHaveLength(3)
    expect(duplicated.scenes[1]).toMatchObject({ name: 'Scene 1 copy', durationMs: show.scenes[0].durationMs })
    expect(duplicated.cells.find((cell) => cell.sceneId === duplicated.scenes[1].id)).toMatchObject({
      pattern: show.cells[0].pattern,
      adaptations: show.cells[0].adaptations,
      sceneSpan: 1,
    })
    expect(duplicated.transitions?.find((transition) => transition.afterSceneId === show.scenes[0].id)).toMatchObject({ kind: 'cut' })
    expect(duplicated.transitions?.find((transition) => transition.afterSceneId === duplicated.scenes[1].id)).toMatchObject({ kind: 'crossfade' })
    expectHoleFreeStrip(duplicated)
  })

  it('clones one simple clip into the immediately following empty slot with independent nested state (#470)', () => {
    const base = createDefaultShow('show-470-clip-clone', 'Clip clone', 1)
    const withHole = removeShowClip(base, 'cell-2')
    withHole.cells[0] = {
      ...withHole.cells[0],
      controlTargets: { sliderSpeed: 0.4 },
      transform: { positionX: 0.25, positionY: -0.5, rotation: -0.125, scaleX: 1.5, scaleY: 0.75 },
      effects: [{ id: 'effect-1', kind: 'opacity', opacity: 0.6 }],
    }

    const cloned = cloneShowCellAfter(withHole, 'cell-1')
    const copy = cloned.cells.find((cell) => cell.id !== 'cell-1')!

    expect(copy).toMatchObject({ sceneId: 'scene-2', zoneId: 'zone-1', sceneSpan: 1, zoneSpan: 1 })
    expect(copy.id).not.toBe('cell-1')
    expect(copy.effects?.[0].id).not.toBe('effect-1')
    expect(copy.pattern).toEqual(withHole.cells[0].pattern)
    expect(copy.pattern).not.toBe(withHole.cells[0].pattern)
    expect(copy.adaptations).not.toBe(withHole.cells[0].adaptations)
    expect(copy.controlTargets).not.toBe(withHole.cells[0].controlTargets)
    expect(copy.transform).toEqual(withHole.cells[0].transform)
    expect(copy.transform).not.toBe(withHole.cells[0].transform)
    expect(copy.effects).not.toBe(withHole.cells[0].effects)
  })

  it('inserts a Scene when Clip Clone must ripple an occupied following slot (#470)', () => {
    const occupied = createDefaultShow('show-470-occupied', 'Occupied', 1)
    const cloned = cloneShowCellAfter(occupied, 'cell-1')
    const insertedScene = cloned.scenes[1]
    const copy = cloned.cells.find((cell) => cell.sceneId === insertedScene?.id)

    expect(cloned.scenes).toHaveLength(3)
    expect(insertedScene).toMatchObject({ durationMs: occupied.scenes[0].durationMs })
    expect(copy).toMatchObject({ zoneId: 'zone-1', patternName: occupied.cells[0].patternName })
    expect(copy?.id).not.toBe('cell-1')
    expect(cloned.scenes[2]?.id).toBe(occupied.scenes[1]?.id)
  })

  it('refuses clip Clone when the owner spans scenes or zones (#470)', () => {
    const occupied = createDefaultShow('show-470-occupied', 'Occupied', 1)

    const held = extendShowCell(removeShowClip(occupied, 'cell-2'), 'cell-1', 2)
    expect(cloneShowCellAfter(held, 'cell-1')).toBe(held)

    const zoned = addShowZone(occupied)
    const spanned = spanShowCellZones(zoned, 'cell-1', 2)
    expect(cloneShowCellAfter(spanned, 'cell-1')).toBe(spanned)
  })

  it('moves one simple clip only to an empty structural slot in its owning zone (#470)', () => {
    const base = createDefaultShow('show-470-move', 'Move', 1)
    const withHole = removeShowClip(base, 'cell-2')

    const moved = moveShowCellToSlot(withHole, 'cell-1', 'zone-1', 'scene-2')
    expect(moved.cells.find((cell) => cell.id === 'cell-1')).toMatchObject({
      zoneId: 'zone-1',
      sceneId: 'scene-2',
    })
    expect(moveShowCellToSlot(base, 'cell-1', 'zone-1', 'scene-2')).toBe(base)

    const secondZone = addShowZone(withHole)
    expect(moveShowCellToSlot(secondZone, 'cell-1', 'zone-2', 'scene-2')).toBe(secondZone)
  })

  it('rejects split points at boundaries, transitions, and sub-second fragments (#415)', () => {
    const show = createDefaultShow('show-1', 'Split Show', 1)

    expect(splitShowAtTime(show, 0)).toBe(show)
    expect(splitShowAtTime(show, 500)).toBe(show)
    expect(splitShowAtTime(show, 29_500)).toBe(show)
    expect(splitShowAtTime(show, 30_500)).toBe(show)
    expect(splitShowAtTime(show, showLoopDurationMs(show))).toBe(show)
  })

  it('explains Scene-edge Split refusal separately from an invalid playhead (#473)', () => {
    const show = createDefaultShow('show-473', 'Split guidance', 1)

    expect(showSplitCapability(show, Number.NaN)).toEqual({
      enabled: false,
      code: 'no-scene',
      reason: 'Move the playhead inside a Scene.',
    })
    expect(showSplitCapability(show, 0)).toEqual({
      enabled: false,
      code: 'scene-edge-margin',
      reason: 'Leave at least 1.0 s on both sides of the playhead.',
    })
    expect(showSplitCapability(show, 500)).toEqual({
      enabled: false,
      code: 'scene-edge-margin',
      reason: 'Leave at least 1.0 s on both sides of the playhead.',
    })
    expect(showSplitCapability(show, 1_000)).toEqual({
      enabled: true,
      code: 'ready',
      reason: 'Split this Scene at the playhead.',
    })
    expect(showSplitCapability(show, 30_500)).toEqual({
      enabled: false,
      code: 'no-scene',
      reason: 'Move the playhead inside a Scene.',
    })
  })

  it('refuses a top-level Scene Split through a nonlinear local Property segment (#490)', () => {
    const show = createDefaultShow('show-490-nonlinear-split', 'Nonlinear split', 1)
    show.composition = projectFlatShowToCompositionV1(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS[cell.pattern.id]])),
    })
    const sceneComposition = show.composition.scenes.find((scene) => scene.sceneId === show.scenes[0].id)!
    const placement = sceneComposition.zones[0].main[0]
    sceneComposition.propertyTracks = [{
      id: 'brightness-track',
      target: { kind: 'placement-view', placementId: placement.id, property: 'brightness' },
      keyframes: [
        { id: 'brightness-start', timeMs: 0, value: 0, easing: { curve: 'hold', at: 0.5 } },
        { id: 'brightness-end', timeMs: show.scenes[0].durationMs, value: 1, easing: { curve: 'linear' } },
      ],
    }]

    expect(showSplitCapability(show, 10_000)).toEqual({
      enabled: false,
      code: 'nonlinear-property-animation',
      reason: 'Add a keyframe at the playhead or change the crossing segment to Linear before splitting this Scene.',
    })
    expect(splitShowAtTime(show, 10_000)).toBe(show)
  })

  it('partitions linear local Property animation when splitting a composed Scene (#490)', () => {
    const show = createDefaultShow('show-490-linear-split', 'Linear split', 1)
    show.composition = projectFlatShowToCompositionV1(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS[cell.pattern.id]])),
    })
    const sceneComposition = show.composition.scenes.find((scene) => scene.sceneId === show.scenes[0].id)!
    const placement = sceneComposition.zones[0].main[0]
    sceneComposition.propertyTracks = [{
      id: 'brightness-track',
      target: { kind: 'placement-view', placementId: placement.id, property: 'brightness' },
      keyframes: [
        { id: 'brightness-start', timeMs: 0, value: 0, easing: { curve: 'linear' } },
        { id: 'brightness-end', timeMs: show.scenes[0].durationMs, value: 1, easing: { curve: 'linear' } },
      ],
    }]

    const split = splitShowAtTime(show, 10_000)
    const left = split.composition?.scenes.find((scene) => scene.sceneId === 'scene-1')
    const right = split.composition?.scenes.find((scene) => scene.sceneId === 'scene-3')

    expect(split).not.toBe(show)
    expect(validateShowComposition(split, split.composition!)).toEqual([])
    expect(left?.zones[0].main[0]).toMatchObject({ startMs: 0, durationMs: 10_000 })
    expect(left?.propertyTracks?.[0].keyframes).toMatchObject([
      { timeMs: 0, value: 0 },
      { timeMs: 10_000, value: 1 / 3 },
    ])
    expect(right?.zones[0].main[0]).toMatchObject({ startMs: 0, durationMs: 20_000 })
    expect(right?.propertyTracks?.[0].keyframes).toMatchObject([
      { timeMs: 0, value: 1 / 3 },
      { timeMs: 20_000, value: 1 },
    ])
  })

  it('allows a composed Scene Split on an authored keyframe between nonlinear segments (#490)', () => {
    const show = createDefaultShow('show-490-keyframe-split', 'Keyframe split', 1)
    show.composition = projectFlatShowToCompositionV1(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS[cell.pattern.id]])),
    })
    const sceneComposition = show.composition.scenes.find((scene) => scene.sceneId === show.scenes[0].id)!
    const placement = sceneComposition.zones[0].main[0]
    sceneComposition.propertyTracks = [{
      id: 'brightness-track',
      target: { kind: 'placement-view', placementId: placement.id, property: 'brightness' },
      keyframes: [
        { id: 'brightness-start', timeMs: 0, value: 0, easing: { curve: 'hold', at: 0.5 } },
        { id: 'brightness-middle', timeMs: 10_000, value: 0.5, easing: { curve: 'sine', direction: 'in-out' } },
        { id: 'brightness-end', timeMs: show.scenes[0].durationMs, value: 1, easing: { curve: 'linear' } },
      ],
    }]

    expect(showSplitCapability(show, 10_000)).toMatchObject({ enabled: true, code: 'ready' })
    const split = splitShowAtTime(show, 10_000)
    expect(validateShowComposition(split, split.composition!)).toEqual([])
    expect(split.composition?.scenes.find((scene) => scene.sceneId === 'scene-3')?.propertyTracks?.[0].keyframes[0])
      .toMatchObject({ timeMs: 0, value: 0.5, easing: { curve: 'sine', direction: 'in-out' } })
  })

  it('partitions a crossing overlay and retargets its Property track on Scene Split (#490)', () => {
    const show = createDefaultShow('show-490-overlay-split', 'Overlay split', 1)
    show.composition = projectFlatShowToCompositionV1(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS[cell.pattern.id]])),
    })
    const sceneComposition = show.composition.scenes.find((scene) => scene.sceneId === show.scenes[0].id)!
    const zone = sceneComposition.zones[0]
    zone.overlays = [{
      id: 'overlay-layer',
      name: 'Texture',
      placements: [{
        id: 'overlay-placement',
        instanceId: zone.main[0].instanceId,
        startMs: 5_000,
        durationMs: 10_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]
    sceneComposition.propertyTracks = [{
      id: 'opacity-track',
      target: { kind: 'placement-opacity', placementId: 'overlay-placement' },
      keyframes: [
        { id: 'opacity-start', timeMs: 0, value: 0, easing: { curve: 'linear' } },
        { id: 'opacity-end', timeMs: show.scenes[0].durationMs, value: 1, easing: { curve: 'linear' } },
      ],
    }]

    const split = splitShowAtTime(show, 10_000)
    const composition = split.composition!
    const left = composition.scenes.find((scene) => scene.sceneId === 'scene-1')!
    const right = composition.scenes.find((scene) => scene.sceneId === 'scene-3')!
    const leftOverlay = left.zones[0].overlays[0]
    const rightOverlay = right.zones[0].overlays[0]

    expect(validateShowComposition(split, split.composition!)).toEqual([])
    expect(leftOverlay.placements[0]).toMatchObject({ id: 'overlay-placement', startMs: 5_000, durationMs: 5_000 })
    expect(rightOverlay.id).not.toBe(leftOverlay.id)
    expect(rightOverlay.placements[0]).toMatchObject({ startMs: 0, durationMs: 5_000 })
    expect(right.propertyTracks?.[0].target).toEqual({
      kind: 'placement-opacity',
      placementId: rightOverlay.placements[0].id,
    })
  })

  it('compiles Continue as shared Pattern state and Restart as a fresh instance (#415)', () => {
    const continued = splitShowAtTime(createDefaultShow('show-1', 'Split Show', 1), 10_000)
    const destination = continued.cells.find((cell) => cell.sceneId === 'scene-3')!
    const sources = {
      byCellId: Object.fromEntries(continued.cells.map((cell) => [
        cell.id,
        cell.pattern.id === 'TestPattern1D' ? DEMOS.TestPattern1D : DEMOS.CometLoom,
      ])),
    }

    const continueRecipe = showRecordToCompileRecipe(continued, sources)
    expect(continueRecipe.clips).toHaveLength(2)
    expect(continueRecipe.sceneSequence?.scenes.map((scene) => scene.clipId)).toEqual([
      'cell-1',
      'cell-1',
      'cell-2',
    ])

    const restarted = updateShowCellRestartOnEntry(continued, destination.id, true)
    const restartRecipe = showRecordToCompileRecipe(restarted, sources)
    expect(restartRecipe.clips).toHaveLength(3)
    expect(restartRecipe.sceneSequence?.scenes.map((scene) => scene.clipId)).toEqual([
      'cell-1',
      destination.id,
      'cell-2',
    ])
  })

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
    expect(removed.transitions.some((transition) => transition.kind === 'routing')).toBe(false)
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

  it('round-trips and clones every adaptive routing operator without sharing mutable Zone ids (#507)', () => {
    const base = addShowZone(createShowWithOutputContract(
      'show-507-persistence',
      'Adaptive persistence',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    ), { name: 'alternate', nominalPixelCount: 60 })
    const zoneIds: [string, string] = [base.zones[0].id, base.zones[1].id]
    const operators: NonNullable<ShowRecord['routingLayouts'][number]['logical']>[] = [
      { kind: 'checker', zoneIds, columns: 4, rows: 3 },
      { kind: 'rings', zoneIds, rings: 5 },
      { kind: 'pinwheel', zoneIds, arms: 7, twist: 2.5, rotation: 0.25 },
      { kind: 'wave', zoneIds, axis: 'y', bands: 6, amplitude: 0.3, frequency: 2, phase: 0.1 },
      { kind: 'soft-split', zoneIds, axis: 'x', feather: 0.2 },
    ]

    for (const logical of operators) {
      const authored = updateShowRoutingLayout(base, base.routingLayouts[0].id, { logical })
      const persisted = normalizeShowRoutingState(JSON.parse(JSON.stringify(authored)) as ShowRecord)
      const cloned = addShowRoutingLayout(persisted, `${logical.kind} copy`, persisted.routingLayouts[0].id)

      expect(persisted.routingLayouts[0].logical).toEqual(logical)
      expect(cloned.routingLayouts[1].logical).toEqual(logical)
      expect(cloned.routingLayouts[1].logical?.zoneIds).not.toBe(persisted.routingLayouts[0].logical?.zoneIds)
    }
  })

  it('preserves authored Checker parameters when lowering a Portable Show (#507)', () => {
    let show = addShowZone(createShowWithOutputContract(
      'show-507-checker',
      'Checker Show',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    ), {
      name: 'alternate',
      nominalPixelCount: 60,
    })
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: {
        kind: 'checker',
        zoneIds: [show.zones[0].id, show.zones[1].id],
        columns: 6,
        rows: 4,
      },
    })

    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS.TestPattern2D])),
      stageDimension: 2,
    })

    expect(recipe.routingLayouts?.[0].logical).toEqual({
      kind: 'checker',
      zoneNames: ['main', 'alternate'],
      columns: 6,
      rows: 4,
    })
  })

  it('preserves authored Rings parameters when lowering a Portable Show (#507)', () => {
    let show = addShowZone(createShowWithOutputContract(
      'show-507-rings',
      'Rings Show',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    ), { name: 'alternate', nominalPixelCount: 60 })
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: { kind: 'rings', zoneIds: show.zones.map((zone) => zone.id), rings: 5 },
    })

    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS.TestPattern2D])),
      stageDimension: 2,
    })

    expect(recipe.routingLayouts?.[0].logical).toEqual({
      kind: 'rings',
      zoneNames: ['main', 'alternate'],
      rings: 5,
    })
  })

  it('preserves authored Pinwheel arms, twist, and rotation when lowering a Portable Show (#507)', () => {
    let show = addShowZone(createShowWithOutputContract(
      'show-507-pinwheel',
      'Pinwheel Show',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    ), { name: 'alternate', nominalPixelCount: 60 })
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: {
        kind: 'pinwheel',
        zoneIds: show.zones.map((zone) => zone.id),
        arms: 6,
        twist: Math.PI,
        rotation: Math.PI / 4,
      },
    })

    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS.TestPattern2D])),
      stageDimension: 2,
    })

    expect(recipe.routingLayouts?.[0].logical).toEqual({
      kind: 'pinwheel',
      zoneNames: ['main', 'alternate'],
      arms: 6,
      twist: Math.PI,
      rotation: Math.PI / 4,
    })
  })

  it('preserves authored Wave parameters when lowering a Portable Show (#507)', () => {
    let show = addShowZone(createShowWithOutputContract(
      'show-507-wave',
      'Wave Show',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    ), { name: 'alternate', nominalPixelCount: 60 })
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: {
        kind: 'wave',
        zoneIds: show.zones.map((zone) => zone.id),
        axis: 'y',
        bands: 5,
        amplitude: 0.3,
        frequency: 2.5,
        phase: 0.1,
      },
    })

    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS.TestPattern2D])),
      stageDimension: 2,
    })

    expect(recipe.routingLayouts?.[0].logical).toEqual({
      kind: 'wave',
      zoneNames: ['main', 'alternate'],
      axis: 'y',
      bands: 5,
      amplitude: 0.3,
      frequency: 2.5,
      phase: 0.1,
    })
  })

  it('lowers Soft Split feather with the existing animated split-position property (#507)', () => {
    let show = addShowZone(createShowWithOutputContract(
      'show-507-soft-split',
      'Soft Split Show',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    ), { name: 'alternate', nominalPixelCount: 60 })
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: {
        kind: 'soft-split',
        zoneIds: [show.zones[0].id, show.zones[1].id],
        axis: 'x',
        feather: 0.2,
      },
    })
    show = updateShowScene(show, show.scenes[0].id, { routingTargets: { splitPosition: 0.25 } })
    show = updateShowScene(show, show.scenes[1].id, { routingTargets: { splitPosition: 0.75 } })

    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS.TestPattern2D])),
      stageDimension: 2,
    })

    expect(recipe.routingLayouts?.[0].logical).toEqual({
      kind: 'soft-split',
      zoneNames: ['main', 'alternate'],
      axis: 'x',
      feather: 0.2,
    })
    expect(recipe.routingPropertyRamps?.splitPosition).toMatchObject({ initial: 0.25 })
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

  it('creates Portable 2D Shows with logical full-surface routing (#436)', () => {
    const show = createShowWithOutputContract(
      'show-portable',
      'Portable wall',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    )

    expect(show.routingLayouts[0]).toMatchObject({
      name: 'Default',
      logical: { kind: 'single', zoneIds: [show.zones[0].id] },
    })
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, 'export function render2D(index, x, y) { rgb(x, y, 1) }'])),
      stageDimension: 2,
    })
    expect(recipe.masterPixelCount).toBeUndefined()
    expect(addShowRoutingLayout(show).routingLayouts[1].logical).toEqual({
      kind: 'single',
      zoneIds: [show.zones[0].id],
    })
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
    const withZone = addShowZone(createDefaultShow('show-1', 'Untitled Show'), {
      name: 'doorframe',
      nominalPixelCount: 12,
    })
    const withFirstDoorClip = placeShowClip(withZone, 'zone-2', 'scene-1', {
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
    })
    const base = placeShowClip(withFirstDoorClip, 'zone-2', 'scene-2', {
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: 'CometLoom',
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
    expect(next.transitions).toEqual([
      expect.objectContaining({ id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'crossfade' }),
      expect.objectContaining({ id: 'transition-scene-2', afterSceneId: 'scene-2', kind: 'crossfade' }),
    ])
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
    expect(removed.transitions).toEqual([
      expect.objectContaining({ afterSceneId: 'scene-1', kind: 'crossfade' }),
    ])
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
    expect(removed.transitions).toEqual([])
    expectHoleFreeStrip(removed)
  })

  it('removes the final scene by clearing the new final transition and preserves one-scene shows', () => {
    const threeScene = addShowScene(createDefaultShow('show-1', 'Untitled Show'))
    const twoScene = removeShowScene(threeScene, 'scene-3')
    const oneScene = removeShowScene(twoScene, 'scene-2')
    const noOp = removeShowScene(oneScene, 'scene-1')

    expect(twoScene.scenes.map((scene) => scene.id)).toEqual(['scene-1', 'scene-2'])
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

  it('does not shorten a Scene past its authored local composition', () => {
    const show = createDefaultShow('show-scene-duration', 'Scene duration')
    show.composition = projectFlatShowToCompositionV1(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS[cell.pattern.id]])),
    })

    expect(minimumShowSceneDurationMs(show, show.scenes[0].id)).toBe(30_000)

    const updated = updateShowScene(show, show.scenes[0].id, { durationMs: 1_000 })

    expect(updated.scenes[0].durationMs).toBe(30_000)
    expect(validateShowComposition(updated, updated.composition!)).toEqual([])
  })

  it('clamps a scene-owned moving-split target to its normalized domain (#405)', () => {
    const show = createDefaultShow('show-405-target', 'Moving split')

    const updated = updateShowScene(show, show.scenes[0].id, {
      routingTargets: { splitPosition: 1.4 },
    })

    expect(updated.scenes[0].routingTargets).toEqual({ splitPosition: 1 })
  })

  it('normalizes persisted moving-split scene targets on load (#405)', () => {
    const show = createDefaultShow('show-405-loaded-target', 'Loaded moving split')
    show.scenes[0].routingTargets = { splitPosition: -0.3 }

    const normalized = normalizeShowTransitionState(JSON.parse(JSON.stringify(show)) as ShowRecord)

    expect(normalized.scenes[0].routingTargets).toEqual({ splitPosition: 0 })
  })

  it('carries the moving-split target forward when a scene is added (#405)', () => {
    let show = createDefaultShow('show-405-add-scene', 'Moving split scenes')
    show = updateShowScene(show, show.scenes[1].id, { routingTargets: { splitPosition: 0.7 } })

    const added = addShowScene(show)

    expect(added.scenes[2].routingTargets).toEqual({ splitPosition: 0.7 })
  })

  it('clamps, normalizes, and inherits a scene-owned repeat-scale target (#406)', () => {
    let show = createDefaultShow('show-406-target', 'Repeated sample')
    show = updateShowScene(show, show.scenes[0].id, { sampleTargets: { repeatScale: 20 } })
    show.scenes[1].sampleTargets = { repeatScale: 0.2 }

    const normalized = normalizeShowTransitionState(JSON.parse(JSON.stringify(show)) as ShowRecord)
    const added = addShowScene(normalized)

    expect(normalized.scenes[0].sampleTargets).toEqual({ repeatScale: 8 })
    expect(normalized.scenes[1].sampleTargets).toEqual({ repeatScale: 1 })
    expect(added.scenes[2].sampleTargets).toEqual({ repeatScale: 1 })
  })

  it('removes one Show clip and its boundary automation references', () => {
    const show = createDefaultShow('show-1', 'Clip deletion', 1)
    const clip = show.cells[1]
    const automated = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        timeScale: { fromByCellId: { [clip.id]: 0.5 } },
        controls: {
          sliderSpeed: { fromByCellId: { [clip.id]: 0.25 } },
        },
      },
    })

    const removed = removeShowClip(automated, clip.id)

    expect(removed.cells.map((candidate) => candidate.id)).not.toContain(clip.id)
    expect(removed.transitions?.[0].propertyTransitions?.timeScale?.fromByCellId).not.toHaveProperty(clip.id)
    expect(removed.transitions?.[0].propertyTransitions?.controls?.sliderSpeed.fromByCellId).not.toHaveProperty(clip.id)
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
    expect(recipe.crossfade).toEqual({ startMs: 30000, durationMs: 2000, crossfadePolicy: 'snapshot-live' })
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
    expect(recipe.crossfade).toEqual({ startMs: 30000, durationMs: 2000, crossfadePolicy: 'snapshot-live' })
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
    expect(recipe.crossfade).toEqual({ startMs: 30000, durationMs: 2000, crossfadePolicy: 'snapshot-live' })
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
      easing: { curve: 'linear' },
    })
    expect(recipe.crossfade).toBeUndefined()
  })

  it('persists and compiles boundary-owned time-scale interpolation settings (#417)', () => {
    let show = createDefaultShow('show-417', 'Time transition')
    show = updateShowCellPattern(show, show.cells[1].id, {
      pattern: show.cells[0].pattern,
      patternName: show.cells[0].patternName,
    })
    show = updateShowCellAdaptations(show, show.cells[1].id, { timeScale: 0 })
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      easing: { curve: 'quadratic', direction: 'in-out' },
      propertyTransitions: { timeScale: { fromByCellId: { [show.cells[1].id]: 1.5 } } },
    })

    const normalized = normalizeShowTransitionState(JSON.parse(JSON.stringify(show)) as ShowRecord)
    expect(normalized.transitions?.[0].propertyTransitions).toEqual({
      timeScale: {
        fromByCellId: { [show.cells[1].id]: 1.5 },
        durationMs: 2000,
        easing: { curve: 'quadratic', direction: 'in-out' },
      },
    })
    expect(showRecordToCompileRecipe(normalized, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS.TestPattern1D])),
    }).adaptationRamp).toMatchObject({
      from: { timeScale: 1.5 },
      to: { timeScale: 0 },
      easing: { curve: 'quadratic', direction: 'in-out' },
    })
  })

  it('compiles a boundary-owned canonical Transform ramp through reserved affine parameters (#529)', () => {
    let show = createDefaultShow('show-529-boundary', 'Transform transition')
    show = updateShowCellPattern(show, show.cells[1].id, {
      pattern: show.cells[0].pattern,
      patternName: show.cells[0].patternName,
    })
    show = {
      ...show,
      cells: show.cells.map((cell, index) => index === 1
        ? { ...cell, transform: { positionX: 0.5, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 } }
        : cell),
    }
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        transform: {
          positionX: { fromByCellId: { [show.cells[1].id]: 0.1 } },
        },
      },
    })

    const normalized = normalizeShowTransitionState(JSON.parse(JSON.stringify(show)) as ShowRecord)
    const recipe = showRecordToCompileRecipe(normalized, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS.TestPattern1D])),
    })

    expect(normalized.transitions?.[0].propertyTransitions?.transform?.positionX).toMatchObject({
      fromByCellId: { [show.cells[1].id]: 0.1 },
      durationMs: 2_000,
    })
    expect(recipe.adaptationRamp?.effectRamps?.['pxlblz-clip-transform-position']?.x).toMatchObject({
      from: 0.1,
      to: 0.5,
      durationMs: 2_000,
    })
  })

  it('normalizes boundary-owned moving-split interpolation settings (#405)', () => {
    let show = createDefaultShow('show-405-transition', 'Moving split transition')
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        routing: {
          splitPosition: { from: 1.4, durationMs: 1200, easing: { curve: 'quadratic', direction: 'out' } },
        },
      },
    })

    const normalized = normalizeShowTransitionState(JSON.parse(JSON.stringify(show)) as ShowRecord)
    expect(normalized.transitions?.[0].propertyTransitions?.routing?.splitPosition).toEqual({
      from: 1,
      durationMs: 1200,
      easing: { curve: 'quadratic', direction: 'out' },
    })
  })

  it('lowers moving-split scene targets through the shared boundary descriptor (#405)', () => {
    let show = addShowZone(createDefaultShow('show-405-recipe', 'Moving split recipe'), {
      name: 'right',
      nominalPixelCount: 30,
    })
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: {
        kind: 'split',
        zoneIds: [show.zones[0].id, show.zones[1].id],
        axis: 'x',
      },
    })
    show = updateShowScene(show, show.scenes[0].id, { routingTargets: { splitPosition: 0.25 } })
    show = updateShowScene(show, show.scenes[1].id, { routingTargets: { splitPosition: 0.75 } })
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        routing: {
          splitPosition: { from: 0.2, durationMs: 1200, easing: { curve: 'quadratic', direction: 'in-out' } },
        },
      },
    })

    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS.TestPattern1D])),
      stageDimension: 2,
    })

    expect(recipe.routingLayouts?.[0].logical).toEqual({
      kind: 'split',
      zoneNames: ['main', 'right'],
      axis: 'x',
    })
    expect(recipe.routingPropertyRamps?.splitPosition).toEqual({
      initial: 0.25,
      ramps: [{
        atMs: 30000,
        from: 0.2,
        to: 0.75,
        durationMs: 1200,
        easing: { curve: 'quadratic', direction: 'in-out' },
      }],
    })
  })

  it('normalizes and lowers repeat scale through the shared scene property contract (#406)', () => {
    let show = createDefaultShow('show-406-recipe', 'Repeated sample recipe')
    show = updateShowScene(show, show.scenes[0].id, { sampleTargets: { repeatScale: 1.5 } })
    show = updateShowScene(show, show.scenes[1].id, { sampleTargets: { repeatScale: 3 } })
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        sample: {
          repeatScale: { from: 1.25, durationMs: 1200, easing: { curve: 'quadratic', direction: 'in-out' } },
        },
      },
    })

    const normalized = normalizeShowTransitionState(JSON.parse(JSON.stringify(show)) as ShowRecord)
    expect(normalized.transitions?.[0].propertyTransitions?.sample?.repeatScale).toEqual({
      from: 1.25,
      durationMs: 1200,
      easing: { curve: 'quadratic', direction: 'in-out' },
    })

    const recipe = showRecordToCompileRecipe(normalized, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS.TestPattern2D])),
      stageDimension: 2,
    })
    expect(recipe.samplePropertyRamps?.repeatScale).toEqual({
      initial: 1.5,
      ramps: [{
        atMs: 30000,
        from: 1.25,
        to: 3,
        durationMs: 1200,
        easing: { curve: 'quadratic', direction: 'in-out' },
      }],
    })
  })

  it('keeps one Pattern instance through a ramp, exact pause, and resume sequence (#417)', () => {
    let show = addShowScene(createDefaultShow('show-417-sequence', 'Pause sequence'))
    for (const cell of show.cells.slice(1)) {
      show = updateShowCellPattern(show, cell.id, {
        pattern: show.cells[0].pattern,
        patternName: show.cells[0].patternName,
      })
    }
    show = updateShowCellAdaptations(show, show.cells[1].id, { timeScale: 0 })
    show = updateShowCellAdaptations(show, show.cells[2].id, { timeScale: 1 })
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      easing: { curve: 'quadratic', direction: 'out' },
      propertyTransitions: { timeScale: { fromByCellId: { [show.cells[1].id]: 1 } } },
    })
    show = updateShowBoundaryTransition(show, 'transition-scene-2', {
      easing: { curve: 'quadratic', direction: 'in' },
      propertyTransitions: { timeScale: { fromByCellId: { [show.cells[2].id]: 0 } } },
    })

    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS.TestPattern1D])),
    })
    expect(recipe.clips).toHaveLength(1)
    expect(recipe.sceneSequence?.scenes).toEqual([
      expect.objectContaining({ clipId: show.cells[0].id, timeScale: 1 }),
      expect.objectContaining({
        clipId: show.cells[0].id,
        timeScale: 0,
        transitionOut: expect.objectContaining({
          propertyRamps: {
            timeScale: {
              from: 0,
              to: 1,
              durationMs: 2000,
              easing: { curve: 'quadratic', direction: 'in' },
            },
          },
        }),
      }),
      expect.objectContaining({ clipId: show.cells[0].id, timeScale: 1 }),
    ])
    expect(recipe.sceneSequence?.scenes[0].transitionOut).toMatchObject({
      propertyRamps: {
        timeScale: {
          from: 1,
          to: 0,
          durationMs: 2000,
          easing: { curve: 'quadratic', direction: 'out' },
        },
      },
    })
  })

  it('compiles independent time and brightness curves through one property-ramp schema (#418)', () => {
    let show = createDefaultShow('show-418', 'Independent properties')
    show = updateShowCellPattern(show, show.cells[1].id, {
      pattern: show.cells[0].pattern,
      patternName: show.cells[0].patternName,
    })
    show = updateShowCellAdaptations(show, show.cells[1].id, { timeScale: 0, brightness: 0.2 })
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        timeScale: { fromByCellId: { [show.cells[1].id]: 1 }, durationMs: 2000, easing: { curve: 'quadratic', direction: 'out' } },
        brightness: { fromByCellId: { [show.cells[1].id]: 1 }, durationMs: 1000, easing: { curve: 'quadratic', direction: 'in' } },
      },
    })

    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS.TestPattern1D])),
    })
    expect(recipe.clips).toHaveLength(1)
    expect(recipe.adaptationRamp?.propertyRamps).toEqual({
      timeScale: {
        from: 1,
        to: 0,
        durationMs: 2000,
        easing: { curve: 'quadratic', direction: 'out' },
      },
      brightness: {
        from: 1,
        to: 0.2,
        durationMs: 1000,
        easing: { curve: 'quadratic', direction: 'in' },
      },
    })
  })

  it('keeps every property descriptor synchronized when Split moves its boundary (#418)', () => {
    const base = updateShowBoundaryTransition(createDefaultShow('show-418-split', 'Split properties'), 'transition-scene-1', {
      propertyTransitions: {
        timeScale: { fromByCellId: { 'cell-2': 1 }, durationMs: 1500, easing: { curve: 'quadratic', direction: 'in' } },
        brightness: { fromByCellId: { 'cell-2': 1 }, durationMs: 700, easing: { curve: 'quadratic', direction: 'out' } },
      },
    })
    const split = splitShowAtTime(base, 10_000)
    const moved = split.transitions?.find((transition) => transition.afterSceneId === 'scene-3')

    expect(moved?.propertyTransitions).toEqual({
      timeScale: {
        fromByCellId: { 'cell-2': 1 },
        durationMs: 1500,
        easing: { curve: 'quadratic', direction: 'in' },
      },
      brightness: {
        fromByCellId: { 'cell-2': 1 },
        durationMs: 700,
        easing: { curve: 'quadratic', direction: 'out' },
      },
    })
    expect(split.transitions?.find((transition) => transition.afterSceneId === 'scene-1')?.propertyTransitions).toBeUndefined()

    const cut = updateShowBoundaryTransition(base, 'transition-scene-1', { kind: 'cut', durationMs: 0 })
    expect(cut.transitions?.find((transition) => transition.id === 'transition-scene-1')?.propertyTransitions).toBeUndefined()
  })

  it('compiles scene-owned public slider targets through a shared boundary descriptor (#419)', () => {
    let show = createDefaultShow('show-419', 'Control automation')
    show = updateShowCellPattern(show, show.cells[1].id, {
      pattern: show.cells[0].pattern,
      patternName: show.cells[0].patternName,
    })
    show = updateShowCellControlTarget(show, show.cells[0].id, 'sliderSpeed', 0.2)
    show = updateShowCellControlTarget(show, show.cells[1].id, 'sliderSpeed', 0.8)
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        controls: {
          sliderSpeed: {
            fromByCellId: { [show.cells[1].id]: 0.25 },
            durationMs: 1200,
            easing: { curve: 'quadratic', direction: 'in-out' },
          },
        },
      },
    })
    const source = 'var speed = 0\nexport function sliderSpeed(v) { speed = v }\nexport function render(index) { rgb(speed, 0, 0) }'
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
    })

    expect(recipe.clips).toHaveLength(1)
    expect(recipe.clips[0].controlTargets).toEqual({ sliderSpeed: 0.2 })
    expect(recipe.adaptationRamp?.controlRamps).toEqual({
      sliderSpeed: {
        from: 0.25,
        to: 0.8,
        durationMs: 1200,
        easing: { curve: 'quadratic', direction: 'in-out' },
      },
    })
  })

  it('requires deterministic slider targets on both sides of an automated boundary (#419)', () => {
    let show = createDefaultShow('show-419-invalid', 'Invalid control')
    show = updateShowCellPattern(show, show.cells[1].id, {
      pattern: show.cells[0].pattern,
      patternName: show.cells[0].patternName,
    })
    show = updateShowCellControlTarget(show, show.cells[1].id, 'sliderSpeed', 0.8)
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: { controls: { sliderSpeed: { fromByCellId: {} } } },
    })
    const source = 'export function sliderSpeed(v) {}\nexport function render(index) {}'

    expect(() => showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
    })).toThrow(/sliderSpeed.*targets in both adjacent scenes/i)
  })

  it('resolves public control state deterministically across Continue and Restart scenes (#419)', () => {
    let show = addShowScene(createDefaultShow('show-419-sequence', 'Control sequence'))
    for (const cell of show.cells.slice(1)) {
      show = updateShowCellPattern(show, cell.id, {
        pattern: show.cells[0].pattern,
        patternName: show.cells[0].patternName,
      })
    }
    for (const [index, cell] of show.cells.entries()) {
      show = updateShowCellControlTarget(show, cell.id, 'sliderSpeed', [0.2, 0.8, 0.4][index])
    }
    for (const [index, scene] of show.scenes.slice(0, -1).entries()) {
      const destination = show.cells[index + 1]
      show = updateShowBoundaryTransition(show, `transition-${scene.id}`, {
        propertyTransitions: {
          controls: { sliderSpeed: { fromByCellId: { [destination.id]: show.cells[index].controlTargets!.sliderSpeed } } },
        },
      })
    }
    const source = 'var speed = 0\nexport function sliderSpeed(v) { speed = v }\nexport function render(index) { rgb(speed, 0, 0) }'
    const lookup = { byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])) }

    const continued = showRecordToCompileRecipe(show, lookup)
    expect(continued.clips).toHaveLength(1)
    expect(continued.sceneSequence?.scenes.map((scene) => scene.controlTargets?.sliderSpeed)).toEqual([0.2, 0.8, 0.4])
    expect(continued.sceneSequence?.scenes[0].transitionOut?.controlRamps?.sliderSpeed).toMatchObject({ from: 0.2, to: 0.8 })

    const restarted = updateShowCellRestartOnEntry(show, show.cells[2].id, true)
    expect(showRecordToCompileRecipe(restarted, lookup).clips).toHaveLength(2)
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
      easing: { curve: 'linear' },
      feather: 0.25,
      wipeVariant: 'linear',
    })
    expect(recipe.crossfade).toBeUndefined()
    expect(recipe.cut).toBeUndefined()
  })

  it('clamps wipe feather to a normalized route width', () => {
    const show = createDefaultShow('show-1', 'Untitled Show')
    expect(updateShowTransition(show, 'scene-1', 'wipe', 1000, -1).transitions[0])
      .toMatchObject({ feather: 0 })
    expect(updateShowTransition(show, 'scene-1', 'wipe', 1000, 2).transitions[0])
      .toMatchObject({ feather: 1 })
  })

  it('persists portal settings and requires an explicit 2D Stage Map', () => {
    const show = updateShowTransition(
      { ...createDefaultShow('show-1', 'Portal'), stageMapId: 'sunflower-2d' },
      'scene-1',
      'portal',
      2400,
      0.18,
      {
        centerX: 0.3,
        centerY: 0.7,
        revealMode: 'shrink-outgoing',
        featherPolicy: 'blend',
        shape: 'diamond',
        scale: 1.2,
        rotation: 0.125,
        spin: 0.5,
      },
    )

    expect(show.transitions[0]).toMatchObject({
      kind: 'portal',
      durationMs: 2400,
      feather: 0.18,
      centerX: 0.3,
      centerY: 0.7,
      revealMode: 'shrink-outgoing',
      featherPolicy: 'blend',
      shape: 'diamond',
      scale: 1.2,
      rotation: 0.125,
      spin: 0.5,
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
      easing: { curve: 'linear' },
      feather: 0.18,
      centerX: 0.3,
      centerY: 0.7,
      revealMode: 'shrink-outgoing',
      featherPolicy: 'blend',
      shape: 'diamond',
      scale: 1.2,
      rotation: 0.125,
      spin: 0.5,
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
      revealMode: 'grow-incoming',
      featherPolicy: 'blend',
    })
    show = updateShowTransition(show, show.scenes[1].id, 'portal', 1800, 0.08, {
      centerX: 0.25,
      centerY: 0.7,
      revealMode: 'shrink-outgoing',
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
            easing: { curve: 'linear' },
            feather: 0.16,
            centerX: 0.5,
            centerY: 0.5,
            revealMode: 'grow-incoming',
            featherPolicy: 'blend',
          },
        },
        {
          clipId: second.id,
          holdMs: 30000,
          transitionOut: {
            kind: 'portal',
            durationMs: 1800,
            easing: { curve: 'linear' },
            feather: 0.08,
            centerX: 0.25,
            centerY: 0.7,
            revealMode: 'shrink-outgoing',
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
      easing: { curve: 'linear' },
      feather: 0.2,
      wipeVariant: 'linear',
    })
    expect(recipe.sceneSequence?.scenes[2].clipId).toBe(third.id)
  })

  it('builds routed placements for every Show-local Zone in every Scene', () => {
    const withZone = addShowZone(createDefaultShow('show-1', 'Untitled Show'), {
      name: 'doorframe',
      nominalPixelCount: 12,
    })
    const show = placeShowClip(withZone, 'zone-2', 'scene-1', {
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: 'CometLoom',
    })
    const doorCell = show.cells.find((cell) => cell.zoneId === 'zone-2' && cell.sceneId === 'scene-1')!
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: {
        [show.cells[0].id]: DEMOS.TestPattern1D,
        [show.cells[1].id]: DEMOS.CometLoom,
        [doorCell.id]: DEMOS.CometLoom,
      },
    })

    expect(recipe.routedSceneSequence?.scenes).toEqual([
      expect.objectContaining({
        placements: [
          expect.objectContaining({ zoneName: 'main', clipId: 'cell-1' }),
          expect.objectContaining({ zoneName: 'doorframe', clipId: doorCell.id }),
        ],
      }),
      expect.objectContaining({
        placements: [
          expect.objectContaining({ zoneName: 'main', clipId: 'cell-2' }),
          expect.objectContaining({ zoneName: 'doorframe', clipId: '__pxlblz_empty-routed' }),
        ],
      }),
    ])
    expect(recipe.zones).toEqual([
      { id: 'layout-1:zone-1', name: 'main', ranges: [{ start: 0, end: 59 }] },
      { id: 'layout-1:zone-2', name: 'doorframe', ranges: [{ start: 60, end: 71 }] },
    ])
  })

  it('shares a routed Pattern instance across adjacent Scenes until Restart is explicit (#478)', () => {
    let show = addShowZone(createDefaultShow('show-routed-clock', 'Routed clock', 1), {
      name: 'right',
      nominalPixelCount: 12,
    })
    show = placeShowClip(show, 'zone-2', 'scene-1', {
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: 'CometLoom',
    })
    show = updateShowCellPattern(show, 'cell-2', {
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
    })
    const sources = () => ({
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS[cell.pattern.id]])),
    })

    const continued = showRecordToCompileRecipe(show, sources())
    const continuedIds = continued.routedSceneSequence!.scenes.map((scene) => (
      scene.placements.find((placement) => placement.zoneName === 'main')!.clipId
    ))
    expect(continuedIds).toEqual(['cell-1', 'cell-1'])
    expect(continued.clips.filter((clip) => clip.id === 'cell-1')).toHaveLength(1)

    show = updateShowCellRestartOnEntry(show, 'cell-2', true)
    const restarted = showRecordToCompileRecipe(show, sources())
    const restartedIds = restarted.routedSceneSequence!.scenes.map((scene) => (
      scene.placements.find((placement) => placement.zoneName === 'main')!.clipId
    ))
    expect(restartedIds).toEqual(['cell-1', 'cell-2'])
  })

  it('keeps authored Installation routing when unrelated controller zones are available', () => {
    const withZone = addShowZone(createDefaultShow('show-1', 'Untitled Show'), {
      name: 'doorframe',
      nominalPixelCount: 12,
    })
    const show = placeShowClip(withZone, 'zone-2', 'scene-1', {
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: 'CometLoom',
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
        [show.cells[1].id]: DEMOS.CometLoom,
        [doorCell.id]: DEMOS.CometLoom,
      },
      controllerZones,
    })

    expect(recipe.zones).toEqual([
      { id: 'layout-1:zone-1', name: 'main', ranges: [{ start: 0, end: 59 }] },
      { id: 'layout-1:zone-2', name: 'doorframe', ranges: [{ start: 60, end: 71 }] },
    ])
    expect(recipe.routingLayouts?.[0].zones).toEqual([
      { zoneId: 'zone-1', ranges: [{ start: 0, end: 59 }] },
      { zoneId: 'zone-2', ranges: [{ start: 60, end: 71 }] },
    ].map((zone) => ({
      id: `layout-1:${zone.zoneId}`,
      name: zone.zoneId === 'zone-1' ? 'main' : 'doorframe',
      ranges: zone.ranges,
    })))
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
        'cell-2': DEMOS.CometLoom,
      },
    })

    expect(recipe.clips.filter((clip) => clip.id === 'cell-1')).toHaveLength(1)
    expect(recipe.routedSceneSequence?.scenes[0].placements).toEqual([
      expect.objectContaining({ zoneName: 'main', clipId: 'cell-1' }),
      expect.objectContaining({ zoneName: 'doorframe', clipId: 'cell-1' }),
    ])
  })

  it('emits a repeated zone span as one shared member over independent domains', () => {
    const show = addShowZone(createDefaultShow('show-1', 'Untitled Show'), {
      name: 'doorframe',
      nominalPixelCount: 12,
    })
    const repeated = updateShowCellZoneMode(spanShowCellZones(show, 'cell-1', 2), 'cell-1', 'repeat')
    const recipe = showRecordToCompileRecipe(repeated, {
      byCellId: { 'cell-1': DEMOS.TestPattern1D, 'cell-2': DEMOS.CometLoom },
    })

    expect(repeated.cells.find((cell) => cell.id === 'cell-1')).toMatchObject({
      zoneSpan: 2,
      zoneMode: 'repeat',
    })
    expect(recipe.clips.filter((clip) => clip.id === 'cell-1')).toHaveLength(1)
    expect(recipe.routedSceneSequence?.scenes[0].placements).toEqual([
      expect.objectContaining({ zoneName: 'main', clipId: 'cell-1' }),
      expect.objectContaining({ zoneName: 'doorframe', clipId: 'cell-1' }),
    ])
  })
})
