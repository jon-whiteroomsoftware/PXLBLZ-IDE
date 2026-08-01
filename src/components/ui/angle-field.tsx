import {
  BoundedNumberField,
  type BoundedNumberFieldProps,
  type BoundedNumberPresentation,
} from './bounded-number-field'
import {
  resolveAnglePresentation,
  type AnglePresentationKind,
} from '@/engine/anglePresentation'

export interface AngleFieldProps extends Omit<BoundedNumberFieldProps, 'presentation'> {
  kind: AnglePresentationKind
  /** Bounds and step in turns, matching the stored representation. */
  min: number
  max: number
  step: number
}

const KIND_LABELS: Record<AnglePresentationKind, string> = {
  direction: 'direction',
  phase: 'phase',
  rotation: 'rotation',
  cycles: 'turns',
}

// The slider window anchors on the committed value: previews go through the
// preview override store, so the window stays put for the whole gesture and
// only recenters when a commit lands (#612).
export function AngleField({ kind, min, max, step, value, ...props }: AngleFieldProps) {
  const resolved = resolveAnglePresentation(kind, { min, max, step, anchor: value })
  const presentation: BoundedNumberPresentation = {
    kindLabel: KIND_LABELS[kind],
    suffix: resolved.suffix,
    min: resolved.min,
    max: resolved.max,
    step: resolved.step,
    sliderMin: resolved.sliderMin,
    sliderMax: resolved.sliderMax,
    sliderMarks: resolved.sliderMarks,
    neutralPosition: resolved.neutralPosition,
    format: resolved.format,
    parse: resolved.parse,
    formatDraft: resolved.formatDraft,
    parseDraft: resolved.parse,
    toSliderPosition: resolved.toSliderPosition,
    fromSliderPosition: resolved.fromSliderPosition,
  }
  return <BoundedNumberField {...props} value={value} presentation={presentation} />
}
