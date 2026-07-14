import {
  normalizeShowRevealMode,
  showShapeRevealSignedDistance,
} from './showShapeReveal'
import { createDefaultShow, normalizeShowTransitionState, showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'

describe('Grow Incoming and Shrink Outgoing shape reveals (#448)', () => {
  it('maps legacy invert to reveal language without changing the persisted compatibility field', () => {
    expect(normalizeShowRevealMode(undefined, false)).toBe('grow-incoming')
    expect(normalizeShowRevealMode(undefined, true)).toBe('shrink-outgoing')
    expect(normalizeShowRevealMode('grow-incoming', true)).toBe('grow-incoming')
  })

  it('grows incoming Circle coverage and shrinks outgoing Circle coverage', () => {
    const shared = { x: 0.5, y: 0.5, centerX: 0.5, centerY: 0.5, shape: 'circle' as const }
    expect(showShapeRevealSignedDistance({ ...shared, progress: 0.25, revealMode: 'grow-incoming' })).toBeLessThan(0)
    expect(showShapeRevealSignedDistance({ ...shared, x: 0, progress: 0.25, revealMode: 'grow-incoming' })).toBeGreaterThan(0)
    expect(showShapeRevealSignedDistance({ ...shared, progress: 0.75, revealMode: 'shrink-outgoing' })).toBeGreaterThan(0)
    expect(showShapeRevealSignedDistance({ ...shared, x: 0, progress: 0.75, revealMode: 'shrink-outgoing' })).toBeLessThan(0)
  })

  it('supports a rotated Box with aspect changing only its mask', () => {
    const wide = showShapeRevealSignedDistance({
      x: 0.8, y: 0.5, centerX: 0.5, centerY: 0.5,
      shape: 'box', progress: 0.4, revealMode: 'grow-incoming', aspect: 2, rotation: 0,
    })
    const tall = showShapeRevealSignedDistance({
      x: 0.8, y: 0.5, centerX: 0.5, centerY: 0.5,
      shape: 'box', progress: 0.4, revealMode: 'grow-incoming', aspect: 0.5, rotation: 0,
    })
    expect(wide).toBeLessThan(tall)
    expect(showShapeRevealSignedDistance({
      x: 0.8, y: 0.5, centerX: 0.5, centerY: 0.5,
      shape: 'box', progress: 0.4, revealMode: 'grow-incoming', aspect: 2, rotation: 0.25,
    })).toBeCloseTo(tall, 12)
  })

  it('preserves field-absent legacy Portal records and normalizes explicit modes and Box parameters', () => {
    const legacy = { ...createDefaultShow('legacy-shape', 'Legacy shape', 448), stageMapId: 'plane' }
    legacy.transitions![0] = {
      ...legacy.transitions![0], kind: 'portal', durationMs: 1000,
      invert: true, shape: 'circle', feather: 0.1, featherPolicy: 'dither',
    }
    const legacyNormalized = normalizeShowTransitionState(legacy)
    expect(legacyNormalized.transitions![0]).not.toHaveProperty('revealMode')
    expect(legacyNormalized.transitions![0]).toMatchObject({ invert: true, shape: 'circle' })

    legacy.transitions![0] = {
      ...legacy.transitions![0],
      revealMode: 'grow-incoming', shape: 'box', aspect: 9, rotation: 1.25,
      edgePolicy: 'blend',
    }
    const normalized = normalizeShowTransitionState(legacy)
    expect(normalized.transitions![0]).toMatchObject({
      revealMode: 'grow-incoming', invert: false, shape: 'box', aspect: 4, rotation: 1,
      edgePolicy: 'blend',
    })
    const recipe = showRecordToCompileRecipe(normalized, {
      stageDimension: 2,
      byCellId: Object.fromEntries(normalized.cells.map((cell) => [cell.id, 'export function render2D(index, x, y) { rgb(x, y, 0) }'])),
    })
    expect(recipe.routeTransition).toMatchObject({
      kind: 'portal', revealMode: 'grow-incoming', shape: 'box', aspect: 4, rotation: 1, edgePolicy: 'blend',
    })
    expect(compileShow(recipe, {}).summary.cost.cpu.patternEvaluations).toEqual({
      formula: 'N + E', basePerPixel: 1, additionalPerEdgePixel: 1,
    })
  })
})
