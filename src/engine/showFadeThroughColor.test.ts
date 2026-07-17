import { compileShow } from './showCompiler'
import { applyShowEasing } from './showEasing'
import {
  evaluateFadeThroughColor,
  normalizeShowTransitionColor,
  showTransitionColorToRgb,
} from './showFadeThroughColor'
import { createDefaultShow, normalizeShowTransitionState, projectShowTimeline, showRecordToCompileRecipe } from './showModel'

describe('Fade through color Transition (#445)', () => {
  it('normalizes an ordinary persisted color and falls back safely', () => {
    expect(normalizeShowTransitionColor('#12AbEf')).toBe('#12abef')
    expect(normalizeShowTransitionColor('not-a-color')).toBe('#000000')
    expect(showTransitionColorToRgb('#804020')).toEqual([128 / 255, 64 / 255, 32 / 255])
  })

  it('uses outgoing before the midpoint, exact color at midpoint, and incoming after it', () => {
    const outgoing: [number, number, number] = [1, 0.5, 0]
    const incoming: [number, number, number] = [0, 0.5, 1]
    const color: [number, number, number] = [0.25, 0.25, 0.25]

    expect(evaluateFadeThroughColor(outgoing, incoming, color, 0)).toEqual(outgoing)
    expect(evaluateFadeThroughColor(outgoing, incoming, color, 0.25)).toEqual([0.625, 0.375, 0.125])
    expect(evaluateFadeThroughColor(outgoing, incoming, color, 0.5)).toEqual(color)
    expect(evaluateFadeThroughColor(outgoing, incoming, color, 0.75)).toEqual([0.125, 0.375, 0.625])
    expect(evaluateFadeThroughColor(outgoing, incoming, color, 1)).toEqual(incoming)
  })

  it('persists, normalizes, and lowers the shared boundary descriptor', () => {
    const show = createDefaultShow('fade-color', 'Fade color', 445)
    show.transitions![0] = {
      ...show.transitions![0],
      kind: 'fade-color',
      durationMs: 1600,
      easing: { curve: 'sine', direction: 'in-out' },
      color: '#F0A020',
    }

    const normalized = normalizeShowTransitionState(show)
    expect(normalized.transitions![0]).toMatchObject({
      kind: 'fade-color',
      durationMs: 1600,
      easing: { curve: 'sine', direction: 'in-out' },
      color: '#f0a020',
    })
    expect(normalized.scenes[0].transitionOut).toMatchObject({ kind: 'fade-color', color: '#f0a020' })
    expect(projectShowTimeline(normalized)).toMatchObject({
      durationMs: 61_600,
      transitions: [expect.objectContaining({ startMs: 30_000, endMs: 31_600 })],
    })

    const recipe = showRecordToCompileRecipe(normalized, {
      byCellId: {
        'cell-1': 'export function render(index) { rgb(1, 0, 0) }',
        'cell-2': 'export function render(index) { rgb(0, 0, 1) }',
      },
    })
    expect(recipe.routeTransition).toEqual({
      kind: 'fade-color',
      startMs: 30_000,
      durationMs: 1600,
      easing: { curve: 'sine', direction: 'in-out' },
      color: '#f0a020',
    })
  })

  it('compiles one Pattern evaluation per pixel and applies easing before the two phases', () => {
    const easing = { curve: 'quadratic', direction: 'in' } as const
    const artifact = compileShow({
      clips: [
        { id: 'outgoing', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'incoming', source: 'export function render(index) { rgb(0, 0, 1) }' },
      ],
      routeTransition: {
        kind: 'fade-color',
        startMs: 1000,
        durationMs: 1000,
        easing,
        color: '#010203',
      },
    }, {})

    expect(applyShowEasing(easing, 0.5)).toBe(0.25)
    expect(artifact.summary.transitionCost).toBe('route')
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(1)
    expect(artifact.summary.cost.cpu.patternEvaluations).toEqual({ formula: 'N', basePerPixel: 1 })
    expect(artifact.expandedCode).toContain('__pxlblz_show_mix < 0.5')
    expect(artifact.code).toContain('0.00392156862745098')
  })

  it('lowers fade color through the scene-sequence path', () => {
    const show = createDefaultShow('fade-color-sequence', 'Fade color sequence', 445)
    show.scenes.push({ id: 'scene-3', name: 'Scene 3', durationMs: 1000 })
    show.cells.push({ ...show.cells[1], id: 'cell-3', sceneId: 'scene-3' })
    show.transitions![0] = {
      ...show.transitions![0],
      kind: 'fade-color',
      color: '#112233',
      easing: { curve: 'cubic', direction: 'out' },
    }
    const recipe = showRecordToCompileRecipe(normalizeShowTransitionState(show), {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, 'export function render(index) { rgb(1, 0, 0) }'])),
    })

    expect(recipe.sceneSequence?.scenes[0].transitionOut).toMatchObject({
      kind: 'fade-color',
      color: '#112233',
      easing: { curve: 'cubic', direction: 'out' },
    })
    expect(compileShow(recipe, {}).summary.cost.cpu.patternEvaluations).toEqual({ formula: 'N', basePerPixel: 1 })
  })
})
