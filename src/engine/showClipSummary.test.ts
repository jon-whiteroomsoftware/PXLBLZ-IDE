import { describe, expect, it } from 'vitest'
import { createDefaultShow, updateShowBoundaryTransition, updateShowCellAdaptations } from './showModel'
import { projectGlobalShowClipSummary, showClipInlineSummary } from './showClipSummary'

describe('Show Clip summary', () => {
  it('separates static playback, Pattern controls, view, Effects, and animation facts', () => {
    let show = createDefaultShow('show-clip-summary', 'Clip summary', 1_000)
    const cellId = show.cells[0].id
    show = updateShowCellAdaptations(show, cellId, { timeScale: 0.35, brightness: 0.8 })
    show.cells[0] = {
      ...show.cells[0],
      controlTargets: { sliderSpeed: 0.28, sliderSharpness: 0.42 },
      effects: [
        { id: 'scale', kind: 'scale', x: 0.8, y: 0.8 },
        { id: 'hue', kind: 'hue', turns: 0.1 },
      ],
    }
    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        timeScale: { fromByCellId: { [cellId]: 0.7 }, durationMs: 1_000 },
      },
    })

    const summary = projectGlobalShowClipSummary(show, cellId, {
      sliderSpeed: 'Speed',
      sliderSharpness: 'Sharpness',
    })

    expect(summary.map((section) => section.kind)).toEqual([
      'playback',
      'controls',
      'view',
      'effects',
      'animation',
    ])
    expect(summary.find((section) => section.kind === 'playback')?.items).toContainEqual(
      expect.objectContaining({ label: 'Animation speed', value: '0.35×' }),
    )
    expect(summary.find((section) => section.kind === 'controls')?.items).toEqual([
      expect.objectContaining({ label: 'Speed', value: '0.28' }),
      expect.objectContaining({ label: 'Sharpness', value: '0.42' }),
    ])
    expect(summary.find((section) => section.kind === 'view')?.items).toContainEqual(
      expect.objectContaining({ label: 'Brightness', value: '80%' }),
    )
    expect(summary.find((section) => section.kind === 'effects')?.items.map((item) => item.label)).toEqual([
      'Scale',
      'Hue',
    ])
    expect(summary.find((section) => section.kind === 'animation')?.items).toContainEqual(
      expect.objectContaining({ label: 'Animation speed', value: 'animated' }),
    )
    expect(showClipInlineSummary(summary)).toBe(
      'Animation speed 0.35× · Speed 0.28 · Sharpness 0.42 · Brightness 80% · Scale X 0.8, Y 0.8 · Hue 0.1 turn · Animation speed animated',
    )
  })

  it('returns a quiet defaults label when the Clip has no authored modifications', () => {
    const show = createDefaultShow('show-default-clip-summary', 'Default Clip summary', 1_000)
    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)

    expect(summary).toEqual([])
    expect(showClipInlineSummary(summary)).toBe('defaults')
  })
})
