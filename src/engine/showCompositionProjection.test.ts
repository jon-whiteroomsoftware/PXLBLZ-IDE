import { describe, expect, it } from 'vitest'
import {
  addShowScene,
  addShowZone,
  createDefaultShow,
  createShowWithOutputContract,
  duplicateShowScene,
  extendShowCell,
  normalizeShowEntryState,
  normalizeShowTransitionState,
  placeShowClip,
  showRecordToCompileRecipe,
  splitShowAtTime,
  updateShowBoundaryTransition,
  updateShowCellAdaptations,
  updateShowCellPattern,
  updateShowCellRestartOnEntry,
} from './showModel'
import { compileShow } from './showCompiler'
import { createInstallationShowOutputContract } from './showOutputContract'
import {
  projectFlatShowComposition,
  restoreFlatShowFromCompositionProjection,
  serializedShowCompositionBytes,
} from './showCompositionProjection'
import type { ShowRecord } from './personalContentRecords'

const SOURCE = `export function render(index) { rgb(index / 60, 0.2, 0.4) }`

function lookup(show: ShowRecord) {
  return {
    byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, SOURCE])),
    stageDimension: 2 as const,
  }
}

function normalized(show: ShowRecord): ShowRecord {
  return normalizeShowEntryState(normalizeShowTransitionState(show))
}

function fixtures(): Array<{ name: string; show: ShowRecord }> {
  const oneZoneHold = extendShowCell(createDefaultShow('projection-hold', 'Hold', 1), 'cell-1', 2)
  const pair = createDefaultShow('projection-pair', 'Pair', 1)
  const sequence = addShowScene(createDefaultShow('projection-sequence', 'Sequence', 1))
  let multiZone = addShowZone(createDefaultShow('projection-multi', 'Multi-zone', 1))
  multiZone = placeShowClip(multiZone, 'zone-2', 'scene-1', { pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D' })
  multiZone = placeShowClip(multiZone, 'zone-2', 'scene-2', { pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'CometLoom' })
  const installation = createShowWithOutputContract(
    'projection-installation',
    'Installation',
    createInstallationShowOutputContract({ outputMapId: 'map-stage', pixelCount: 120 }),
    1,
  )
  let ramp = createDefaultShow('projection-ramp', 'Property ramp', 1)
  ramp = updateShowCellPattern(ramp, 'cell-2', { pattern: { ...ramp.cells[0].pattern }, patternName: ramp.cells[0].patternName })
  ramp = updateShowCellAdaptations(ramp, 'cell-2', { timeScale: 1.5 })
  ramp = updateShowBoundaryTransition(ramp, 'transition-scene-1', {
    propertyTransitions: {
      timeScale: { fromByCellId: { 'cell-2': 0.75 }, durationMs: 900, easing: 'ease-in-out' },
    },
  })
  return [
    { name: 'one-zone hold', show: oneZoneHold },
    { name: 'two-Scene pair', show: pair },
    { name: 'general sequence', show: sequence },
    { name: 'multi-Zone routed', show: multiZone },
    { name: 'Installation routing', show: installation },
    { name: 'Property ramp', show: ramp },
  ]
}

describe('flat Show Scene-composition projection spike (#462)', () => {
  it.each(fixtures())('round-trips $name without changing its recipe or generated artifact', ({ show }) => {
    const sourceLookup = lookup(show)
    const directRecipe = showRecordToCompileRecipe(show, sourceLookup)
    const projection = projectFlatShowComposition(show, sourceLookup)
    const serialized = JSON.parse(JSON.stringify(projection))
    const restored = restoreFlatShowFromCompositionProjection(serialized)
    const restoredLookup = lookup(restored)

    expect(restored).toEqual(normalized(show))
    expect(showRecordToCompileRecipe(restored, restoredLookup)).toEqual(directRecipe)
    expect(compileShow(showRecordToCompileRecipe(restored, restoredLookup), {}).code).toBe(compileShow(directRecipe, {}).code)
  })

  it('separates Show-owned runtime instances from Scene-owned placements while preserving Continue and Restart', () => {
    const held = extendShowCell(createDefaultShow('projection-continuity', 'Continuity', 1), 'cell-1', 2)
    const heldProjection = projectFlatShowComposition(held, lookup(held))
    expect(heldProjection.patternInstances).toHaveLength(1)
    expect(heldProjection.scenes.flatMap((scene) => scene.placements)).toHaveLength(2)
    expect(new Set(heldProjection.scenes.flatMap((scene) => scene.placements.map((placement) => placement.instanceId))).size).toBe(1)

    const split = splitShowAtTime(held, 10_000)
    const continued = projectFlatShowComposition(split, lookup(split))
    expect(continued.patternInstances.filter((instance) => instance.compiled)).toHaveLength(1)

    const rightCell = split.cells.find((cell) => cell.sceneId === 'scene-3')!
    const restartedShow = updateShowCellRestartOnEntry(split, rightCell.id, true)
    const restarted = projectFlatShowComposition(restartedShow, lookup(restartedShow))
    expect(restarted.patternInstances.filter((instance) => instance.compiled)).toHaveLength(2)
  })

  it('keeps Clone identity policy and top-level Transitions explicit without changing clocks', () => {
    const base = createDefaultShow('projection-clone', 'Clone', 1)
    const cloned = duplicateShowScene(base, 'scene-1')
    const projection = projectFlatShowComposition(cloned, lookup(cloned))
    const firstTwo = projection.scenes.slice(0, 2).flatMap((scene) => scene.placements)

    expect(firstTwo).toHaveLength(2)
    expect(firstTwo[0].instanceId).toBe(firstTwo[1].instanceId)
    expect(projection.scenes[0].outgoingTransitionIds).toEqual(['transition-scene-1'])
    expect(projection.scenes[1].outgoingTransitionIds).toEqual([`transition-${projection.scenes[1].id}`])
  })

  it('projects every routed Scene cell as an active compiled instance (#478)', () => {
    let show = addShowZone(createDefaultShow('projection-routed-gap', 'Routed gap', 1))
    show = placeShowClip(show, 'zone-2', 'scene-1', { pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D' })
    show = placeShowClip(show, 'zone-2', 'scene-2', { pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'CometLoom' })
    const projection = projectFlatShowComposition(show, lookup(show))
    const ignored = projection.diagnostics.filter((diagnostic) => diagnostic.kind === 'compiler-omits-cell')

    expect(projection.compilerPath).toBe('routed-scene-sequence')
    expect(ignored).toEqual([])
    expect(projection.patternInstances.every((instance) => instance.compiled)).toBe(true)
  })

  it('reports instance-owned time changes that need explicit automation in a durable schema', () => {
    const ramp = fixtures().find((fixture) => fixture.name === 'Property ramp')!.show
    const projection = projectFlatShowComposition(ramp, lookup(ramp))
    const conflict = projection.diagnostics.find((diagnostic) => diagnostic.kind === 'instance-ownership-conflict')

    expect(projection.compilerPath).toBe('adaptation-ramp')
    expect(projection.patternInstances.filter((instance) => instance.compiled)).toHaveLength(1)
    expect(conflict).toMatchObject({ cellIds: ['cell-1', 'cell-2'] })
  })

  it('measures the candidate document independently from the current flat Show document', () => {
    const show = addShowScene(addShowZone(createDefaultShow('projection-size', 'Size fixture', 1)))
    const projection = projectFlatShowComposition(show, lookup(show))

    expect(serializedShowCompositionBytes(projection)).toBe(new TextEncoder().encode(JSON.stringify(projection)).byteLength)
    expect(serializedShowCompositionBytes(projection)).toBeGreaterThan(new TextEncoder().encode(JSON.stringify(show)).byteLength)
  })
})
