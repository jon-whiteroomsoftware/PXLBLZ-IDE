const EXACT_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const NEUTRAL = 1
const MULTIPLIER_CURVE = 2
const RATIO_DENOMINATOR_LIMIT = 32
const RATIO_EPSILON = 1e-10

export type DomainNumberPresentationKind = 'multiplier' | 'ratio'

export interface DomainNumberPresentationBounds {
  min: number
  max: number
  step: number
}

export interface ResolvedDomainNumberPresentation extends DomainNumberPresentationBounds {
  kind: DomainNumberPresentationKind
  neutral: number
  neutralPosition: number
  format: (value: number) => string
  parse: (draft: string) => number | null
  toSliderPosition: (value: number) => number
  fromSliderPosition: (position: number) => number
}

export function parseDomainNumber(kind: DomainNumberPresentationKind, value: unknown): number | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (kind === 'multiplier') {
    const numericText = /x$/i.test(trimmed) ? trimmed.slice(0, -1).trim() : trimmed
    return parseExactNumber(numericText)
  }

  const parts = trimmed.split(':')
  if (parts.length === 1) return parseExactNumber(trimmed)
  if (parts.length !== 2) return null
  const numerator = parseExactNumber(parts[0].trim())
  const denominator = parseExactNumber(parts[1].trim())
  if (numerator === null || denominator === null || denominator === 0) return null
  const ratio = numerator / denominator
  return Number.isFinite(ratio) ? ratio : null
}

export function formatDomainNumber(
  kind: DomainNumberPresentationKind,
  value: number,
  step = 0.01,
): string {
  const finite = Number.isFinite(value) ? value : 0
  if (kind === 'multiplier') return `${formatDecimal(finite, step)}x`

  const ratio = recognizableRatio(finite)
  return ratio ?? formatDecimal(finite, step)
}

export function resolveDomainNumberPresentation(
  kind: DomainNumberPresentationKind,
  bounds: DomainNumberPresentationBounds,
): ResolvedDomainNumberPresentation {
  const min = Math.min(bounds.min, bounds.max)
  const max = Math.max(bounds.min, bounds.max)
  const step = Math.abs(bounds.step) || 0.01
  const neutral = clamp(NEUTRAL, min, max)
  const mapping = kind === 'ratio' && min > 0 && max > min
    ? logarithmicMapping(min, max, neutral)
    : neutralPowerMapping(min, max, neutral)

  return {
    kind,
    min,
    max,
    step,
    neutral,
    neutralPosition: mapping.toPosition(neutral),
    format: (value) => formatDomainNumber(kind, value, step),
    parse: (draft) => parseDomainNumber(kind, draft),
    toSliderPosition: mapping.toPosition,
    fromSliderPosition: mapping.fromPosition,
  }
}

interface SliderMapping {
  toPosition: (value: number) => number
  fromPosition: (position: number) => number
}

function neutralPowerMapping(min: number, max: number, neutral: number): SliderMapping {
  const span = max - min
  if (span <= 0) {
    return {
      toPosition: () => 0,
      fromPosition: () => min,
    }
  }

  if (neutral <= min) {
    return {
      toPosition: (value) => Math.sqrt(clamp((clamp(value, min, max) - min) / span, 0, 1)),
      fromPosition: (position) => {
        const bounded = clamp(position, 0, 1)
        if (bounded === 0) return min
        if (bounded === 1) return max
        return min + span * bounded ** MULTIPLIER_CURVE
      },
    }
  }

  if (neutral >= max) {
    return {
      toPosition: (value) => 1 - Math.sqrt(clamp((max - clamp(value, min, max)) / span, 0, 1)),
      fromPosition: (position) => {
        const bounded = clamp(position, 0, 1)
        if (bounded === 0) return min
        if (bounded === 1) return max
        return max - span * (1 - bounded) ** MULTIPLIER_CURVE
      },
    }
  }

  const neutralPosition = 0.5
  const lowerSpan = neutral - min
  const upperSpan = max - neutral
  return {
    toPosition: (value) => {
      const bounded = clamp(value, min, max)
      if (bounded === neutral) return neutralPosition
      if (bounded < neutral) {
        return neutralPosition * (
          1 - Math.sqrt(clamp((neutral - bounded) / lowerSpan, 0, 1))
        )
      }
      return neutralPosition + (1 - neutralPosition) * Math.sqrt(
        clamp((bounded - neutral) / upperSpan, 0, 1),
      )
    },
    fromPosition: (position) => {
      const bounded = clamp(position, 0, 1)
      if (bounded === 0) return min
      if (bounded === 1) return max
      if (bounded === neutralPosition) return neutral
      if (bounded < neutralPosition) {
        return neutral - lowerSpan * (1 - bounded / neutralPosition) ** MULTIPLIER_CURVE
      }
      return neutral + upperSpan * (
        (bounded - neutralPosition) / (1 - neutralPosition)
      ) ** MULTIPLIER_CURVE
    },
  }
}

function logarithmicMapping(min: number, max: number, neutral: number): SliderMapping {
  const logMin = Math.log(min)
  const logSpan = Math.log(max) - logMin
  if (!Number.isFinite(logSpan) || logSpan <= 0) return neutralPowerMapping(min, max, neutral)
  return {
    toPosition: (value) => {
      const bounded = clamp(value, min, max)
      return clamp((Math.log(bounded) - logMin) / logSpan, 0, 1)
    },
    fromPosition: (position) => {
      const bounded = clamp(position, 0, 1)
      if (bounded === 0) return min
      if (bounded === 1) return max
      return Math.exp(logMin + logSpan * bounded)
    },
  }
}

function parseExactNumber(value: string): number | null {
  if (!EXACT_NUMBER.test(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function recognizableRatio(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null
  for (let denominator = 1; denominator <= RATIO_DENOMINATOR_LIMIT; denominator += 1) {
    const numerator = Math.round(value * denominator)
    if (numerator <= 0) continue
    if (Math.abs(numerator / denominator - value) > RATIO_EPSILON * Math.max(1, value)) continue
    const divisor = greatestCommonDivisor(numerator, denominator)
    return `${numerator / divisor}:${denominator / divisor}`
  }
  return null
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a || 1
}

function formatDecimal(value: number, step: number): string {
  const precision = Math.max(6, decimalPlaces(Math.abs(step)))
  const formatted = Number(value.toFixed(Math.min(10, precision)))
  return String(Object.is(formatted, -0) ? 0 : formatted)
}

function decimalPlaces(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0
  for (let places = 0; places <= 10; places += 1) {
    const scale = 10 ** places
    if (Math.abs(Math.round(value * scale) - value * scale) < 1e-9) return places
  }
  return 10
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}
