import { describe, expect, it } from 'vitest'
import { describeConnectedClipMoveLoss, describeControlTargetRemovalLoss, describeHeldSegmentOverwrite, describePatternReplacementCost, describePatternReplacementLoss, formatControlNameList } from './showLossConfirmationText'

it('describes the picker cost for animated, value, mixed, and empty losses', () => {
  expect(describePatternReplacementCost([{ animated: true }])).toBe('removes 1 property lane')
  expect(describePatternReplacementCost([{ animated: true }, { animated: true }])).toBe('removes 2 property lanes')
  expect(describePatternReplacementCost([{ animated: true }, { animated: true }, { animated: false }]))
    .toBe('removes 2 property lanes, 1 control value')
  expect(describePatternReplacementCost([{ animated: false }])).toBe('removes 1 control value')
  expect(describePatternReplacementCost([])).toBeUndefined()
})

it('names one connected Transition lost on a Clip move (#1069)', () => {
  expect(describeConnectedClipMoveLoss(1)).toEqual({
    title: 'Move connected Clip?',
    description: 'Moving this Clip to another Layer also removes its connected Transition. Other Clip durations and positions stay unchanged.',
    actionLabel: 'Move Clip and remove Transition',
  })
})

it('names multiple connected Transitions lost on a Clip move (#1069)', () => {
  expect(describeConnectedClipMoveLoss(2)).toEqual({
    title: 'Move connected Clip?',
    description: 'Moving this Clip to another Layer also removes its 2 connected Transitions. Other Clip durations and positions stay unchanged.',
    actionLabel: 'Move Clip and remove Transitions',
  })
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

describe('control-target removal confirmation (#1069)', () => {
  it('names one control in the singular', () => {
    expect(describeControlTargetRemovalLoss(['Speed'])).toEqual({
      title: 'Remove Speed control?',
      description: 'The Speed animation will be removed.',
      actionLabel: 'Remove Speed',
    })
  })

  it('counts and lists two or more controls in the plural', () => {
    expect(describeControlTargetRemovalLoss(['Speed', 'Hue'])).toEqual({
      title: 'Remove 2 controls?',
      description: 'The Speed and Hue animations will be removed.',
      actionLabel: 'Remove controls',
    })
    expect(describeControlTargetRemovalLoss(['Speed', 'Hue', 'Gain'])).toEqual({
      title: 'Remove 3 controls?',
      description: 'The Speed, Hue, and Gain animations will be removed.',
      actionLabel: 'Remove controls',
    })
  })
})

it('names the held segments changed by a whole-Clip write (#1069)', () => {
  expect(describeHeldSegmentOverwrite(3)).toEqual({
    title: 'Change every segment?',
    description: 'This Clip has 3 held segments. This change applies to all of them.',
    actionLabel: 'Change all segments',
  })
})
