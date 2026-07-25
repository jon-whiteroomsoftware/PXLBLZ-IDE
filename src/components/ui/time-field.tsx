import {
  BoundedNumberField,
  type BoundedNumberFieldProps,
} from './bounded-number-field'
import { resolveLinearNumberPresentation } from '@/engine/linearNumberPresentation'

export interface TimeFieldProps extends Omit<BoundedNumberFieldProps, 'presentation'> {
  min: number
  max: number
  step: number
  sliderMin?: number
  sliderMax?: number
}

export function TimeField({
  min,
  max,
  step,
  sliderMin = Math.max(0, min),
  sliderMax = Math.min(60, max),
  ...props
}: TimeFieldProps) {
  const boundedSliderMin = Math.max(min, Math.min(sliderMin, sliderMax))
  const boundedSliderMax = Math.min(max, Math.max(sliderMin, sliderMax))
  const span = Math.max(0, boundedSliderMax - boundedSliderMin)
  const detentStep = span <= 10 ? 0.5 : 1
  const labelStep = span <= 10 ? 1 : span <= 20 ? 2 : span <= 40 ? 5 : 10
  const presentation = resolveLinearNumberPresentation({
    kindLabel: 'time',
    suffix: 's',
    min,
    max,
    step: Math.min(Math.abs(step) || 0.001, 0.001),
    sliderMin: boundedSliderMin,
    sliderMax: boundedSliderMax,
    sliderStep: Math.min(0.1, Math.max(step, span || step)),
    detentStep,
    labelStep,
  })

  return <BoundedNumberField {...props} presentation={presentation} />
}
