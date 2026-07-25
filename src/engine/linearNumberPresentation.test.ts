import { describe, expect, it } from 'vitest'
import { resolveLinearNumberPresentation } from './linearNumberPresentation'

describe('linear number presentation', () => {
  it('keeps exact-entry bounds independent from a finite detented slider range', () => {
    const presentation = resolveLinearNumberPresentation({
      kindLabel: 'time',
      suffix: 's',
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      step: 0.001,
      sliderMin: 0,
      sliderMax: 60,
      sliderStep: 0.1,
      detentStep: 1,
      labelStep: 10,
    })

    expect(presentation.parseDraft('90.125')).toBe(90.125)
    expect(presentation.parseDraft('90.125s')).toBe(90.125)
    expect(presentation.formatDraft(90.125)).toBe('90.125')
    expect(presentation.format(2.5)).toBe('2.5s')
    expect(presentation.toSliderPosition(90.125)).toBe(1)
    expect(presentation.fromSliderPosition(1)).toBe(60)
    expect(presentation.sliderMin).toBe(0)
    expect(presentation.sliderMax).toBe(60)
    expect(presentation.sliderStep).toBe(0.1)
  })

  it('builds whole-second detents with sparse labels across sixty seconds', () => {
    const presentation = resolveLinearNumberPresentation({
      kindLabel: 'time',
      suffix: 's',
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      step: 0.001,
      sliderMin: 0,
      sliderMax: 60,
      sliderStep: 0.1,
      detentStep: 1,
      labelStep: 10,
    })

    expect(presentation.sliderMarks).toHaveLength(61)
    expect(presentation.sliderMarks.filter((mark) => mark.label).map((mark) => mark.label))
      .toEqual(['0', '10', '20', '30', '40', '50', '60'])
    expect(presentation.sliderMarks[1]).toMatchObject({ value: 1, position: 1 / 60, major: false })
    expect(presentation.sliderMarks[10]).toMatchObject({ value: 10, position: 1 / 6, label: '10', major: true })
  })
})
