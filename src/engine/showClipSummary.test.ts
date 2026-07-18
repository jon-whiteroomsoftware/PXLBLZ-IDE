import { describe, expect, it } from 'vitest'
import { createDefaultShow, updateShowBoundaryTransition, updateShowCellAdaptations } from './showModel'
import {
  projectGlobalShowClipSummary,
  projectShowClipTimelineSummary,
  showClipInlineSummary,
} from './showClipSummary'

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

  it('shows timeline values only when a fact is introduced or changes from the preceding Clip (#548)', () => {
    let show = createDefaultShow('show-clip-summary-deltas', 'Clip summary deltas', 1_000)
    show = updateShowCellAdaptations(show, show.cells[0].id, { timeScale: 0.35, brightness: 0.8 })
    show = updateShowCellAdaptations(show, show.cells[1].id, { timeScale: 0.35, brightness: 0.8 })
    const first = projectGlobalShowClipSummary(show, show.cells[0].id)
    const unchanged = projectGlobalShowClipSummary(show, show.cells[1].id)

    expect(projectShowClipTimelineSummary(first, null).flatMap((section) => section.items)).toEqual([
      expect.objectContaining({ id: 'time-scale', value: '0.35×', showValue: true }),
      expect.objectContaining({ id: 'brightness', value: '80%', showValue: true }),
    ])
    expect(projectShowClipTimelineSummary(unchanged, first).flatMap((section) => section.items)).toEqual([
      expect.objectContaining({ id: 'time-scale', showValue: false }),
      expect.objectContaining({ id: 'brightness', showValue: false }),
    ])

    show = updateShowCellAdaptations(show, show.cells[1].id, { timeScale: 0.5 })
    const changed = projectGlobalShowClipSummary(show, show.cells[1].id)
    expect(projectShowClipTimelineSummary(changed, first).flatMap((section) => section.items)).toEqual([
      expect.objectContaining({ id: 'time-scale', value: '0.5×', showValue: true }),
      expect.objectContaining({ id: 'brightness', value: '80%', showValue: false }),
    ])
  })

  it('contracts multi-parameter Effect values without changing the complete summary (#548)', () => {
    const show = createDefaultShow('show-clip-summary-effect-contract', 'Effect contractions', 1_000)
    show.cells[0] = {
      ...show.cells[0],
      effects: [{
        id: 'ripple',
        kind: 'ripple',
        amount: 0.32,
        frequency: 4,
        phase: 0,
        centerX: 0.5,
        centerY: 0.5,
      }],
    }
    const summary = projectGlobalShowClipSummary(show, show.cells[0].id)
    const effect = summary.find((section) => section.kind === 'effects')?.items[0]
    const timelineEffect = projectShowClipTimelineSummary(summary, null)
      .find((section) => section.kind === 'effects')?.items[0]

    expect(effect?.value).toBe('Amount 0.32, Frequency 4, Phase 0 turn, Center X 0.5, Center Y 0.5')
    expect(timelineEffect?.displayValue).toBe('amt 0.32, freq 4, phase 0 turn, cx 0.5, cy 0.5')
  })
})
