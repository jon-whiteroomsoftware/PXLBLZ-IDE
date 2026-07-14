import {
  evaluateShowTransitionEdge,
  normalizeShowTransitionEdgePolicy,
} from './showTransitionEdge'
import {
  normalizeShowWipeDirection,
  normalizeShowWipeSettings,
  projectShowWipePosition,
  showWipeMaskPosition,
  showWipeProjectionCoefficients,
} from './showWipe'
import { addShowScene, createDefaultShow, normalizeShowTransitionState, showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'

describe('arbitrary-direction Wipe (#446)', () => {
  it.each([
    ['east', 0, 0.2, 0.7, 0.2],
    ['south', 0.25, 0.2, 0.7, 0.7],
    ['west', 0.5, 0.2, 0.7, 0.8],
    ['north', 0.75, 0.2, 0.7, 0.3],
    ['south-east', 0.125, 0.2, 0.7, 0.45],
    ['north-west', 0.625, 0.2, 0.7, 0.55],
  ])('projects the %s preset through one normalized Stage equation', (_name, direction, x, y, expected) => {
    expect(projectShowWipePosition(x, y, direction)).toBeCloseTo(expected, 12)
  })

  it('wraps arbitrary turns and keeps every unit-square corner in the normalized domain', () => {
    expect(normalizeShowWipeDirection(-0.125)).toBe(0.875)
    expect(normalizeShowWipeDirection(1.375)).toBe(0.375)
    const coefficients = showWipeProjectionCoefficients(0.173)
    expect(coefficients).toMatchObject({ direction: 0.173 })
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      expect(projectShowWipePosition(x, y, 0.173)).toBeGreaterThanOrEqual(0)
      expect(projectShowWipePosition(x, y, 0.173)).toBeLessThanOrEqual(1)
    }
  })

  it('shares hard, stable-dither, and bounded-blend edge semantics', () => {
    expect(normalizeShowTransitionEdgePolicy(undefined, 0)).toBe('hard')
    expect(normalizeShowTransitionEdgePolicy(undefined, 0.2)).toBe('dither')
    expect(evaluateShowTransitionEdge({ position: 0.4, progress: 0.5, feather: 0, policy: 'hard', hash: 0.9 }))
      .toEqual({ mode: 'incoming', mix: 1 })
    expect(evaluateShowTransitionEdge({ position: 0.52, progress: 0.5, feather: 0.2, policy: 'dither', hash: 0.2 }))
      .toEqual({ mode: 'incoming', mix: 1 })
    expect(evaluateShowTransitionEdge({ position: 0.52, progress: 0.5, feather: 0.2, policy: 'dither', hash: 0.8 }))
      .toEqual({ mode: 'outgoing', mix: 0 })
    expect(evaluateShowTransitionEdge({ position: 0.55, progress: 0.5, feather: 0.2, policy: 'blend', hash: 0 }))
      .toEqual({ mode: 'blend', mix: expect.closeTo(0.25, 12) })
  })

  it('migrates legacy Wipes without adding a direction or changing their dither policy', () => {
    const show = createDefaultShow('legacy-wipe', 'Legacy wipe', 446)
    show.transitions![0] = {
      ...show.transitions![0],
      kind: 'wipe',
      durationMs: 1000,
      feather: 0.2,
    }

    const normalized = normalizeShowTransitionState(show)
    expect(normalized.transitions![0]).toMatchObject({ kind: 'wipe', feather: 0.2 })
    expect(normalized.transitions![0]).not.toHaveProperty('direction')
    expect(normalized.transitions![0]).not.toHaveProperty('edgePolicy')
    expect(showRecordToCompileRecipe(normalized, {
      byCellId: Object.fromEntries(normalized.cells.map((cell) => [cell.id, 'export function render(index) { rgb(1, 0, 0) }'])),
    }).routeTransition).toMatchObject({ kind: 'wipe', feather: 0.2 })
  })

  it('persists a direction and shared edge policy, and gives non-2D Shows an actionable error', () => {
    const show = createDefaultShow('directional-wipe', 'Directional wipe', 446)
    show.transitions![0] = {
      ...show.transitions![0],
      kind: 'wipe',
      durationMs: 1000,
      feather: 0.1,
      direction: 1.125,
      edgePolicy: 'blend',
    }
    const normalized = normalizeShowTransitionState(show)
    expect(normalized.transitions![0]).toMatchObject({ direction: 0.125, edgePolicy: 'blend' })
    expect(() => showRecordToCompileRecipe(normalized, {
      byCellId: Object.fromEntries(normalized.cells.map((cell) => [cell.id, 'export function render(index) { rgb(1, 0, 0) }'])),
    })).toThrow(/directional wipe requires a 2D Stage Map/i)

    const staged = { ...normalized, stageMapId: 'plane' }
    expect(showRecordToCompileRecipe(staged, {
      stageDimension: 2,
      byCellId: Object.fromEntries(staged.cells.map((cell) => [cell.id, 'export function render2D(index, x, y) { rgb(x, y, 0) }'])),
    }).routeTransition).toMatchObject({ direction: 0.125, edgePolicy: 'blend' })
  })

  it('lowers directional Wipes through scene sequences with bounded blend cost', () => {
    let show = addShowScene(createDefaultShow('wipe-sequence', 'Wipe sequence', 446))
    show = { ...show, stageMapId: 'plane' }
    show.transitions![0] = {
      ...show.transitions![0],
      kind: 'wipe',
      durationMs: 1200,
      direction: 0.625,
      feather: 0.16,
      edgePolicy: 'blend',
    }
    show.transitions![1] = { ...show.transitions![1], kind: 'cut', durationMs: 0 }
    const recipe = showRecordToCompileRecipe(normalizeShowTransitionState(show), {
      stageDimension: 2,
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, 'export function render2D(index, x, y) { rgb(x, y, 0) }'])),
    })

    expect(recipe.sceneSequence?.scenes[0].transitionOut).toMatchObject({
      kind: 'wipe', direction: 0.625, feather: 0.16, edgePolicy: 'blend',
    })
    expect(compileShow(recipe, {}).summary).toMatchObject({
      renderPolicy: 'spatial-route-bounded-feather',
      transitionCost: 'bounded-renderer-window',
      routePolicy: 'blended-wipe',
      worstInstantRenderersPerPixel: 2,
    })
  })
})

describe('standard Wipe catalogue (#450)', () => {
  it('normalizes shared variant parameters', () => {
    expect(normalizeShowWipeSettings({
      wipeVariant: 'blinds', wipeMode: 'center-in', orientation: 'horizontal',
      count: 99.4, centerX: -1, centerY: 2, phase: -0.25, clockwise: false,
    })).toEqual({
      wipeVariant: 'blinds', wipeMode: 'center-in', orientation: 'horizontal',
      direction: 0, count: 32, centerX: 0, centerY: 1, phase: 0.75, clockwise: false,
    })
  })

  it('evaluates Split center-out and center-in over one shared axis', () => {
    expect(showWipeMaskPosition({ wipeVariant: 'split', wipeMode: 'center-out', orientation: 'vertical' }, 0.5, 0.2)).toBe(0)
    expect(showWipeMaskPosition({ wipeVariant: 'split', wipeMode: 'center-out', orientation: 'vertical' }, 0, 0.2)).toBe(1)
    expect(showWipeMaskPosition({ wipeVariant: 'split', wipeMode: 'center-in', orientation: 'vertical' }, 0.5, 0.2)).toBe(1)
    expect(showWipeMaskPosition({ wipeVariant: 'split', wipeMode: 'center-in', orientation: 'vertical' }, 0, 0.2)).toBe(0)
  })

  it('evaluates Barn Doors, Blinds, Clock, Checker, and Grid deterministically', () => {
    expect(showWipeMaskPosition({ wipeVariant: 'barn-doors', centerX: 0.5, centerY: 0.5 }, 0.5, 0.5)).toBe(0)
    expect(showWipeMaskPosition({ wipeVariant: 'barn-doors', centerX: 0.5, centerY: 0.5 }, 0, 0)).toBe(1)
    expect(showWipeMaskPosition({ wipeVariant: 'blinds', orientation: 'horizontal', count: 4 }, 0.2, 0.3)).toBeCloseTo(0.2)
    expect(showWipeMaskPosition({ wipeVariant: 'clock', centerX: 0.5, centerY: 0.5, phase: 0 }, 1, 0.5)).toBe(0)
    expect(showWipeMaskPosition({ wipeVariant: 'checker', count: 4 }, 0.1, 0.1)).toBeCloseTo(0.2)
    expect(showWipeMaskPosition({ wipeVariant: 'grid', count: 4 }, 0.125, 0.125)).toBe(0)
  })
})
