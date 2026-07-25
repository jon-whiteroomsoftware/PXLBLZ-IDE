const EXACT_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const MAX_SLIDER_MARKS = 1_001

export interface LinearNumberPresentationInput {
  kindLabel: string
  suffix?: string
  min: number
  max: number
  step: number
  sliderMin: number
  sliderMax: number
  sliderStep: number
  detentStep?: number
  labelStep?: number
}

export interface LinearNumberSliderMark {
  value: number
  position: number
  label?: string
  major: boolean
}

export interface ResolvedLinearNumberPresentation {
  kindLabel: string
  suffix?: string
  min: number
  max: number
  step: number
  sliderMin: number
  sliderMax: number
  sliderStep: number
  sliderPositionStep: number
  sliderMarks: LinearNumberSliderMark[]
  format: (value: number) => string
  parse: (draft: string) => number | null
  formatDraft: (value: number) => string
  parseDraft: (draft: string) => number | null
  toSliderPosition: (value: number) => number
  fromSliderPosition: (position: number) => number
}

export function resolveLinearNumberPresentation(
  input: LinearNumberPresentationInput,
): ResolvedLinearNumberPresentation {
  const min = Math.min(input.min, input.max)
  const max = Math.max(input.min, input.max)
  const step = Math.abs(input.step) || 0.01
  const sliderMin = clamp(Math.min(input.sliderMin, input.sliderMax), min, max)
  const sliderMax = clamp(Math.max(input.sliderMin, input.sliderMax), sliderMin, max)
  const sliderStep = Math.min(Math.abs(input.sliderStep) || step, Math.max(step, sliderMax - sliderMin))
  const sliderSpan = sliderMax - sliderMin
  const sliderPositionStep = sliderSpan > 0 ? clamp(sliderStep / sliderSpan, 0.000001, 1) : 1
  const formatDraft = (value: number) => formatDecimal(value, step)
  const parseDraft = (draft: string) => parseLinearNumber(draft, input.suffix)
  const toSliderPosition = (value: number) => (
    sliderSpan > 0 ? clamp((clamp(value, sliderMin, sliderMax) - sliderMin) / sliderSpan, 0, 1) : 0
  )
  const fromSliderPosition = (position: number) => (
    sliderSpan > 0 ? sliderMin + sliderSpan * clamp(position, 0, 1) : sliderMin
  )

  return {
    kindLabel: input.kindLabel,
    suffix: input.suffix,
    min,
    max,
    step,
    sliderMin,
    sliderMax,
    sliderStep,
    sliderPositionStep,
    sliderMarks: buildSliderMarks({
      sliderMin,
      sliderMax,
      detentStep: input.detentStep,
      labelStep: input.labelStep,
      toSliderPosition,
    }),
    format: (value) => `${formatDraft(value)}${input.suffix ?? ''}`,
    parse: parseDraft,
    formatDraft,
    parseDraft,
    toSliderPosition,
    fromSliderPosition,
  }
}

function buildSliderMarks({
  sliderMin,
  sliderMax,
  detentStep,
  labelStep,
  toSliderPosition,
}: {
  sliderMin: number
  sliderMax: number
  detentStep?: number
  labelStep?: number
  toSliderPosition: (value: number) => number
}): LinearNumberSliderMark[] {
  const detent = Math.abs(detentStep ?? 0)
  if (detent === 0 || sliderMax <= sliderMin) return []
  const firstIndex = Math.ceil((sliderMin - detent * 1e-9) / detent)
  const lastIndex = Math.floor((sliderMax + detent * 1e-9) / detent)
  if (lastIndex - firstIndex + 1 > MAX_SLIDER_MARKS) return []
  const label = Math.abs(labelStep ?? 0)

  return Array.from({ length: lastIndex - firstIndex + 1 }, (_, offset) => {
    const value = Number(((firstIndex + offset) * detent).toFixed(10))
    const major = label > 0 && isMultiple(value, label)
    return {
      value,
      position: toSliderPosition(value),
      ...(major ? { label: formatDecimal(value, label) } : {}),
      major,
    }
  })
}

function parseLinearNumber(value: string, suffix?: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const numericText = suffix && trimmed.toLowerCase().endsWith(suffix.toLowerCase())
    ? trimmed.slice(0, -suffix.length).trim()
    : trimmed
  if (!EXACT_NUMBER.test(numericText)) return null
  const parsed = Number(numericText)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDecimal(value: number, step: number): string {
  const finite = Number.isFinite(value) ? value : 0
  const precision = Math.min(10, decimalPlaces(Math.abs(step)))
  const rounded = Number(finite.toFixed(precision))
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function decimalPlaces(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0
  for (let places = 0; places <= 10; places += 1) {
    const scale = 10 ** places
    if (Math.abs(Math.round(value * scale) - value * scale) < 1e-9) return places
  }
  return 10
}

function isMultiple(value: number, step: number): boolean {
  return Math.abs(value / step - Math.round(value / step)) < 1e-8
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
