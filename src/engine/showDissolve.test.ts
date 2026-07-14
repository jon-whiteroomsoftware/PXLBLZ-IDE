import {
  normalizeShowDissolveBlockSize,
  normalizeShowDissolveScale,
  normalizeShowDissolveSeed,
  normalizeShowDissolveSoftness,
  showCoherentDissolveField,
  showDissolveCell,
  showDissolveHash,
  showDissolveSelectsIncoming,
  showSoftDissolveEdge,
} from './showDissolve'
import { addShowScene, createDefaultShow, normalizeShowTransitionState, showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'

describe('Pixel and Block Dissolve (#447)', () => {
  it('keeps Pixel cells per output index and groups Block cells in useful pixel units', () => {
    expect(showDissolveCell(7, 'pixel', 8)).toBe(7)
    expect(showDissolveCell(7, 'block', 8)).toBe(0)
    expect(showDissolveCell(8, 'block', 8)).toBe(1)
    expect(normalizeShowDissolveBlockSize(7.6)).toBe(8)
    expect(normalizeShowDissolveBlockSize(0)).toBe(1)
  })

  it('is stable for a cell and changes deterministically across seeds', () => {
    const first = showDissolveHash(12, 'block', 8, 17)
    expect(showDissolveHash(15, 'block', 8, 17)).toBe(first)
    expect(showDissolveHash(15, 'block', 8, 18)).not.toBe(first)
    expect(showDissolveSelectsIncoming(15, 0.5, 'block', 8, 17))
      .toBe(first < 0.5)
    expect(normalizeShowDissolveSeed(-1)).toBe(65_535)
    expect(normalizeShowDissolveSeed(65_537)).toBe(1)
  })

  it('migrates legacy Dither records as field-absent Pixel Dissolve', () => {
    const show = createDefaultShow('legacy-dither', 'Legacy dither', 447)
    show.transitions![0] = { ...show.transitions![0], kind: 'dither', durationMs: 1000 }

    const normalized = normalizeShowTransitionState(show)
    expect(normalized.transitions![0]).toMatchObject({ kind: 'dither', durationMs: 1000 })
    expect(normalized.transitions![0]).not.toHaveProperty('dissolveVariant')
    expect(normalized.transitions![0]).not.toHaveProperty('seed')
    expect(normalized.scenes[0].transitionOut).not.toHaveProperty('blockSize')
  })

  it('normalizes and lowers Block parameters through two-scene recipes', () => {
    const show = createDefaultShow('block-dissolve', 'Block dissolve', 447)
    show.transitions![0] = {
      ...show.transitions![0],
      kind: 'dither',
      durationMs: 1400,
      easing: { curve: 'sine', direction: 'in-out' },
      dissolveVariant: 'block',
      seed: 65_554,
      blockSize: 7.6,
      edgePolicy: 'dither',
    }
    const normalized = normalizeShowTransitionState(show)
    expect(normalized.transitions![0]).toMatchObject({
      kind: 'dither', dissolveVariant: 'block', seed: 18, blockSize: 8, edgePolicy: 'dither',
    })
    const recipe = showRecordToCompileRecipe(normalized, {
      byCellId: Object.fromEntries(normalized.cells.map((cell) => [cell.id, 'export function render(index) { rgb(index, 0, 0) }'])),
    })
    expect(recipe.routeTransition).toMatchObject({
      kind: 'dither', dissolveVariant: 'block', seed: 18, blockSize: 8, edgePolicy: 'dither',
    })
    expect(compileShow(recipe, {}).summary.cost.cpu.patternEvaluations).toEqual({ formula: 'N', basePerPixel: 1 })
  })

  it('lowers Block parameters through scene sequences', () => {
    const show = addShowScene(createDefaultShow('block-sequence', 'Block sequence', 447))
    show.transitions![0] = {
      ...show.transitions![0], kind: 'dither', durationMs: 1000,
      dissolveVariant: 'block', seed: 33, blockSize: 16, edgePolicy: 'dither',
    }
    show.transitions![1] = { ...show.transitions![1], kind: 'cut', durationMs: 0 }
    const recipe = showRecordToCompileRecipe(normalizeShowTransitionState(show), {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, 'export function render(index) { rgb(index, 0, 0) }'])),
    })

    expect(recipe.sceneSequence?.scenes[0].transitionOut).toMatchObject({
      kind: 'dither', dissolveVariant: 'block', seed: 33, blockSize: 16, edgePolicy: 'dither',
    })
    expect(compileShow(recipe, {}).summary).toMatchObject({
      transitionCost: 'route', worstInstantRenderersPerPixel: 1,
      cost: { cpu: { patternEvaluations: { formula: 'N', basePerPixel: 1 } } },
    })
  })
})

describe('Coherent Noise and Soft Threshold Dissolve (#451)', () => {
  it('normalizes useful spatial scale and softness ranges', () => {
    expect(normalizeShowDissolveScale(0)).toBe(1)
    expect(normalizeShowDissolveScale(99)).toBe(32)
    expect(normalizeShowDissolveSoftness(-1)).toBe(0)
    expect(normalizeShowDissolveSoftness(2)).toBe(1)
  })

  it('produces a stable coherent field from coordinates, scale, and seed', () => {
    const first = showCoherentDissolveField(0.37, 0.62, 6, 17)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(1)
    expect(showCoherentDissolveField(0.37, 0.62, 6, 17)).toBe(first)
    expect(showCoherentDissolveField(0.37, 0.62, 6, 18)).not.toBe(first)
    expect(showCoherentDissolveField(0.37, 0.62, 7, 17)).not.toBe(first)
  })

  it('maps Soft Threshold to the shared edge contract', () => {
    expect(showSoftDissolveEdge({ field: 0.5, progress: 0.5, softness: 0, policy: 'hard', hash: 0 }))
      .toEqual({ mode: 'outgoing', mix: 0 })
    expect(showSoftDissolveEdge({ field: 0.5, progress: 0.5, softness: 0.2, policy: 'dither', hash: 0.2 }))
      .toEqual({ mode: 'incoming', mix: 1 })
    expect(showSoftDissolveEdge({ field: 0.55, progress: 0.5, softness: 0.2, policy: 'blend', hash: 0 }))
      .toEqual({ mode: 'blend', mix: expect.closeTo(0.25, 12) })
  })

  it('requires a 2D Stage and lowers Soft Threshold through scene sequences', () => {
    let show = addShowScene(createDefaultShow('soft-sequence', 'Soft sequence', 451))
    show.transitions![0] = {
      ...show.transitions![0], kind: 'dither', durationMs: 1000,
      dissolveVariant: 'soft-threshold', seed: 17, scale: 6, softness: 0.2, edgePolicy: 'blend',
    }
    show.transitions![1] = { ...show.transitions![1], kind: 'cut', durationMs: 0 }
    const sources = Object.fromEntries(show.cells.map((cell) => [cell.id, 'export function render2D(index, x, y) { rgb(x, y, 0) }']))
    expect(() => showRecordToCompileRecipe(normalizeShowTransitionState(show), { byCellId: sources }))
      .toThrow(/Spatial Dissolve requires a 2D Stage Map/i)

    show = { ...show, stageMapId: 'plane' }
    const recipe = showRecordToCompileRecipe(normalizeShowTransitionState(show), {
      stageDimension: 2,
      byCellId: sources,
    })
    expect(recipe.sceneSequence?.scenes[0].transitionOut).toMatchObject({
      kind: 'dither', dissolveVariant: 'soft-threshold', seed: 17,
      scale: 6, softness: 0.2, edgePolicy: 'blend',
    })
    expect(compileShow(recipe, {}).summary).toMatchObject({
      renderPolicy: 'spatial-route-bounded-feather',
      transitionCost: 'bounded-renderer-window', routePolicy: 'dissolve-blended-edge',
      worstInstantRenderersPerPixel: 2,
    })
  })
})
