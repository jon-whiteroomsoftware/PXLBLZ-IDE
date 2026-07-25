import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import { projectFlatShowToCompositionV1WithCellOrigins } from './showCompositionModel'
import {
  applyShowReferencePattern,
  currentShowReferenceExample,
  extendShowReferencePatternProjection,
  restoreShowReferencePatternSlots,
  type ShowReferenceGuide,
} from './showReferenceShow'

describe('Show reference Pattern projection (#506)', () => {
  it('replaces only the configured flat cells without mutating the authored Show', () => {
    const authored = createDefaultShow('show-1', 'Reference Show', 100)
    authored.cells[0].controlTargets = { speed: 0.5 }
    const original = structuredClone(authored)

    const projected = applyShowReferencePattern(authored, {
      pattern: { kind: 'stock', id: 'CompassRose' },
      patternName: 'Compass Rose',
      cellIds: [authored.cells[0].id],
      instanceIds: [],
    })

    expect(projected).not.toBe(authored)
    expect(projected.cells[0]).toMatchObject({
      pattern: { kind: 'stock', id: 'CompassRose' },
      patternName: 'Compass Rose',
    })
    expect(projected.cells[0].controlTargets).toBeUndefined()
    expect(projected.cells[1]).toEqual(authored.cells[1])
    expect(authored).toEqual(original)
  })

  it('restores authored Pattern fields without discarding unrelated projected-view edits', () => {
    const authored = createDefaultShow('show-1', 'Reference Show', 100)
    authored.cells[0].controlTargets = { speed: 0.5 }
    const projected = applyShowReferencePattern(authored, {
      pattern: { kind: 'stock', id: 'Caustics' },
      patternName: 'Caustics',
      cellIds: [authored.cells[0].id],
      instanceIds: [],
    })
    const edited = { ...projected, name: 'Edited while projected', updatedAt: 200 }

    const restored = restoreShowReferencePatternSlots(edited, authored, {
      pattern: { kind: 'stock', id: 'Caustics' },
      patternName: 'Caustics',
      cellIds: [authored.cells[0].id],
      instanceIds: [],
    })

    expect(restored).toMatchObject({ name: 'Edited while projected', updatedAt: 200 })
    expect(restored.cells[0]).toMatchObject({
      pattern: authored.cells[0].pattern,
      patternName: authored.cells[0].patternName,
      controlTargets: { speed: 0.5 },
    })
    expect(projected.cells[0]).toMatchObject({
      pattern: { kind: 'stock', id: 'Caustics' },
      controlTargets: undefined,
    })
  })

  it('keeps synthesized legacy composition instances inside the transient projection boundary', () => {
    const authored = createDefaultShow('show-1', 'Legacy Reference Show', 100)
    authored.cells = authored.cells.map((cell) => ({
      ...cell,
      pattern: { kind: 'stock', id: 'TestPattern2D' },
      patternName: 'TestPattern2D',
    }))
    const projection = {
      pattern: { kind: 'stock' as const, id: 'Caustics' },
      patternName: 'Caustics',
      cellIds: authored.cells.map((cell) => cell.id),
      instanceIds: [],
    }
    const projected = applyShowReferencePattern(authored, projection)
    const synthesized = projectFlatShowToCompositionV1WithCellOrigins(projected, {
      byCellId: Object.fromEntries(projected.cells.map((cell) => [
        cell.id,
        'export function render(index) { rgb(index, 0, 0) }',
      ])),
      stageDimension: 2,
    })

    const derivedProjection = extendShowReferencePatternProjection(
      { ...projected, composition: synthesized.composition },
      projection,
      synthesized.sourceCellIdByPlacementId,
    )
    const newlyAuthoredInstance = {
      ...synthesized.composition.patternInstances[0],
      id: 'user-authored-caustics',
      pattern: projection.pattern,
      patternName: projection.patternName,
    }
    const restored = restoreShowReferencePatternSlots(
      {
        ...projected,
        name: 'Edited legacy draft',
        composition: {
          ...synthesized.composition,
          patternInstances: [...synthesized.composition.patternInstances, newlyAuthoredInstance],
        },
      },
      authored,
      derivedProjection,
    )
    expect(restored.composition?.patternInstances
      .filter((instance) => instance.id !== newlyAuthoredInstance.id)
      .every((instance) => (
      instance.pattern.kind === 'stock' && instance.pattern.id === 'TestPattern2D'
      ))).toBe(true)
    expect(restored.composition?.patternInstances.find((instance) => (
      instance.id === newlyAuthoredInstance.id
    ))?.pattern).toEqual(projection.pattern)

    const reprojected = applyShowReferencePattern(restored, derivedProjection)
    expect(reprojected.composition?.patternInstances
      .filter((instance) => instance.id !== newlyAuthoredInstance.id)
      .every((instance) => (
      instance.pattern.kind === 'stock' && instance.pattern.id === 'Caustics'
      ))).toBe(true)
  })

  it('keeps a boundary example current through the following Scene hold', () => {
    const show = createDefaultShow('show-1', 'Reference Show', 100)
    const transitionId = show.transitions![0].id
    const guide: ShowReferenceGuide = {
      summary: 'Compare one family.',
      examples: [
        { id: 'reference', label: 'Reference', detail: 'Unmodified.', anchor: { kind: 'scene', sceneId: 'scene-1' } },
        { id: 'wipe', label: 'Wipe east', detail: 'Reference -> Selected', anchor: { kind: 'boundary', transitionId } },
      ],
    }

    expect(currentShowReferenceExample(show, guide, 1_000)?.id).toBe('reference')
    expect(currentShowReferenceExample(show, guide, 31_000)?.id).toBe('wipe')
    expect(currentShowReferenceExample(show, guide, 50_000)?.id).toBe('wipe')
  })

  it('keeps a Scene example named through its outgoing animated boundary', () => {
    const show = createDefaultShow('show-1', 'Effect Reference', 100)
    const guide: ShowReferenceGuide = {
      summary: 'Compare rendered states.',
      examples: [{
        id: 'reference',
        label: 'Reference',
        detail: 'Unmodified.',
        anchor: { kind: 'scene', sceneId: 'scene-1' },
      }],
    }

    expect(currentShowReferenceExample(show, guide, 31_000)?.id).toBe('reference')
  })
})
