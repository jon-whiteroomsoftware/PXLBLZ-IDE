import {
  BoundedNumberField,
  type BoundedNumberFieldProps,
  type BoundedNumberPresentation,
} from './bounded-number-field'
import {
  clampPercentageValue,
  formatPercentageValue,
  parsePercentageValue,
} from '@/engine/percentageValue'

export interface PercentageFieldProps extends Omit<BoundedNumberFieldProps, 'presentation'> {
  min: number
  max: number
  step: number
}

export function PercentageField({
  min,
  max,
  step,
  ...props
}: PercentageFieldProps) {
  const lower = Math.min(min, max)
  const upper = Math.max(min, max)
  const span = upper - lower
  const presentation: BoundedNumberPresentation = {
    kindLabel: 'percentage',
    suffix: '%',
    min: lower,
    max: upper,
    step,
    format: (value) => formatPercentageValue(value, step),
    parse: parsePercentageValue,
    formatDraft: (value) => Number((value * 100).toFixed(2)).toString(),
    parseDraft: (draft) => parsePercentageValue(draft.trim().endsWith('%') ? draft : `${draft}%`),
    toSliderPosition: (value) => span === 0
      ? 0
      : clampPercentageValue((value - lower) / span, 0, 1),
    fromSliderPosition: (position) => lower + span * clampPercentageValue(position, 0, 1),
  }
  return <BoundedNumberField {...props} presentation={presentation} />
}
