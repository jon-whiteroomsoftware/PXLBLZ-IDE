import {
  BoundedNumberField,
  type BoundedNumberFieldProps,
  type BoundedNumberPresentation,
} from './bounded-number-field'
import {
  resolveDomainNumberPresentation,
  type DomainNumberPresentationKind,
} from '@/engine/domainNumberPresentation'

export interface DomainNumberFieldProps extends Omit<BoundedNumberFieldProps, 'presentation'> {
  presentation: DomainNumberPresentationKind
  min: number
  max: number
  step: number
}

export function DomainNumberField({
  presentation: kind,
  min,
  max,
  step,
  ...props
}: DomainNumberFieldProps) {
  const resolved = resolveDomainNumberPresentation(kind, { min, max, step })
  const presentation: BoundedNumberPresentation = {
    kindLabel: kind,
    suffix: kind === 'multiplier' ? 'x' : undefined,
    min: resolved.min,
    max: resolved.max,
    step: resolved.step,
    neutralPosition: resolved.neutralPosition,
    format: resolved.format,
    parse: resolved.parse,
    formatDraft: kind === 'multiplier'
      ? (value) => Number(value.toFixed(2)).toString()
      : resolved.format,
    toSliderPosition: resolved.toSliderPosition,
    fromSliderPosition: resolved.fromSliderPosition,
  }
  return <BoundedNumberField {...props} presentation={presentation} />
}
