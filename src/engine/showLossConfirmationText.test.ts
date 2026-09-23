import { expect, it } from 'vitest'
import { describePatternReplacementCost, describePatternReplacementLoss, formatControlNameList } from './showLossConfirmationText'

it('describes the picker cost for animated, value, mixed, and empty losses', () => {
  expect(describePatternReplacementCost([{ animated: true }])).toBe('removes 1 property lane')
  expect(describePatternReplacementCost([{ animated: true }, { animated: true }])).toBe('removes 2 property lanes')
  expect(describePatternReplacementCost([{ animated: true }, { animated: true }, { animated: false }]))
    .toBe('removes 2 property lanes, 1 control value')
  expect(describePatternReplacementCost([{ animated: false }])).toBe('removes 1 control value')
  expect(describePatternReplacementCost([])).toBeUndefined()
})

it('keeps the existing slot dialog text for one animated control', () => {
  expect(describePatternReplacementLoss('TestPattern2D', [{ label: 'Speed', animated: true }])).toEqual({
    title: 'Use TestPattern2D?',
    description: "TestPattern2D doesn't have the Speed control. The Speed animation will be removed.",
    actionLabel: 'Use TestPattern2D',
  })
})

it('names plural animations, values only, and mixed losses precisely', () => {
  expect(describePatternReplacementLoss('Other', [{ label: 'Speed', animated: true }, { label: 'Hue', animated: true }]).description)
    .toBe("Other doesn't have the Speed or Hue controls. The Speed and Hue animations will be removed.")
  expect(describePatternReplacementLoss('Other', [{ label: 'Speed', animated: false }, { label: 'Hue', animated: false }]).description)
    .toBe("Other doesn't have the Speed or Hue controls. The Speed and Hue values will be removed.")
  expect(describePatternReplacementLoss('Other', [{ label: 'Speed', animated: true }, { label: 'Hue', animated: false }, { label: 'Gain', animated: true }]).description)
    .toBe("Other doesn't have the Speed, Hue, or Gain controls. The Speed and Gain animations and the Hue value will be removed.")
})

it('formats one, two and three control names for both conjunctions', () => {
  expect(formatControlNameList(['Speed'], 'or')).toBe('Speed')
  expect(formatControlNameList(['Speed', 'Hue'], 'or')).toBe('Speed or Hue')
  expect(formatControlNameList(['Speed', 'Hue', 'Gain'], 'or')).toBe('Speed, Hue, or Gain')
  expect(formatControlNameList(['Speed', 'Hue', 'Gain'], 'and')).toBe('Speed, Hue, and Gain')
})
