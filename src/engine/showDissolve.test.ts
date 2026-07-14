import {
  normalizeShowDissolveBlockSize,
  normalizeShowDissolveSeed,
  showDissolveCell,
  showDissolveHash,
  showDissolveSelectsIncoming,
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
