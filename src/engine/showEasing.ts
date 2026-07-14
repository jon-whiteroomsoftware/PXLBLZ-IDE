import type {
  LegacyShowTransitionEasing,
  ShowEasingDirection,
  ShowStructuredEasing,
  ShowTransitionEasing,
} from './personalContentRecords'

const LEGACY_EASING: Record<LegacyShowTransitionEasing, ShowStructuredEasing> = {
  linear: { curve: 'linear' },
  'ease-in': { curve: 'quadratic', direction: 'in' },
  'ease-out': { curve: 'quadratic', direction: 'out' },
  'ease-in-out': { curve: 'quadratic', direction: 'in-out' },
}

export const SHOW_EASING_OPTIONS: Array<{
  id: string
  label: string
  easing: ShowStructuredEasing
}> = [
  { id: 'linear', label: 'linear', easing: { curve: 'linear' } },
  { id: 'ease-in', label: 'quadratic in', easing: { curve: 'quadratic', direction: 'in' } },
  { id: 'ease-out', label: 'quadratic out', easing: { curve: 'quadratic', direction: 'out' } },
  { id: 'ease-in-out', label: 'quadratic in/out', easing: { curve: 'quadratic', direction: 'in-out' } },
  { id: 'cubic-in', label: 'cubic in', easing: { curve: 'cubic', direction: 'in' } },
  { id: 'cubic-out', label: 'cubic out', easing: { curve: 'cubic', direction: 'out' } },
  { id: 'cubic-in-out', label: 'cubic in/out', easing: { curve: 'cubic', direction: 'in-out' } },
  { id: 'sine-in', label: 'sine in', easing: { curve: 'sine', direction: 'in' } },
  { id: 'sine-out', label: 'sine out', easing: { curve: 'sine', direction: 'out' } },
  { id: 'sine-in-out', label: 'sine in/out', easing: { curve: 'sine', direction: 'in-out' } },
]

export function normalizeShowEasing(easing: ShowTransitionEasing | null | undefined): ShowStructuredEasing {
  if (typeof easing === 'string') return LEGACY_EASING[easing] ?? LEGACY_EASING.linear
  if (!easing || typeof easing !== 'object') return LEGACY_EASING.linear
  if (easing.curve === 'linear') return { curve: 'linear' }
  if (easing.curve === 'quadratic' || easing.curve === 'cubic' || easing.curve === 'sine') {
    return { curve: easing.curve, direction: normalizeDirection(easing.direction) }
  }
  return LEGACY_EASING.linear
}

export function showEasingOptionId(easing: ShowTransitionEasing): string {
  const normalized = normalizeShowEasing(easing)
  return SHOW_EASING_OPTIONS.find((option) => sameEasing(option.easing, normalized))?.id ?? 'linear'
}

export function showEasingFromOptionId(id: string): ShowStructuredEasing {
  return normalizeShowEasing(SHOW_EASING_OPTIONS.find((option) => option.id === id)?.easing)
}

export function applyShowEasing(easing: ShowTransitionEasing, progress: number): number {
  const t = Math.max(0, Math.min(1, progress))
  const normalized = normalizeShowEasing(easing)
  if (normalized.curve === 'linear') return t
  return applyDirectionalEasing(normalized, t)
}

/** Emits only arithmetic supported by the Pixelblaze dialect. Input must already be clamped. */
export function emitShowEasingExpression(easing: ShowTransitionEasing, input: string): string {
  const normalized = normalizeShowEasing(easing)
  if (normalized.curve === 'linear') return input
  const easeIn = emitEaseInExpression(normalized.curve, input)
  if (normalized.direction === 'in') return easeIn
  const inverseInput = `(1 - ${input})`
  const easeOut = `(1 - ${emitEaseInExpression(normalized.curve, inverseInput)})`
  if (normalized.direction === 'out') return easeOut
  const firstHalfInput = `(2 * ${input})`
  const secondHalfInput = `(2 * (1 - ${input}))`
  return `(${input} < 0.5 ? 0.5 * ${emitEaseInExpression(normalized.curve, firstHalfInput)} : 1 - 0.5 * ${emitEaseInExpression(normalized.curve, secondHalfInput)})`
}

function normalizeDirection(direction: unknown): ShowEasingDirection {
  return direction === 'in' || direction === 'out' || direction === 'in-out' ? direction : 'in-out'
}

function sameEasing(a: ShowStructuredEasing, b: ShowStructuredEasing): boolean {
  return a.curve === b.curve && (
    a.curve === 'linear'
    || (b.curve !== 'linear' && a.direction === b.direction)
  )
}

function applyDirectionalEasing(easing: Exclude<ShowStructuredEasing, { curve: 'linear' }>, t: number): number {
  const easeIn = (value: number) => applyEaseIn(easing.curve, value)
  if (easing.direction === 'in') return easeIn(t)
  if (easing.direction === 'out') return 1 - easeIn(1 - t)
  return t < 0.5 ? 0.5 * easeIn(2 * t) : 1 - 0.5 * easeIn(2 * (1 - t))
}

function applyEaseIn(curve: Exclude<ShowStructuredEasing, { curve: 'linear' }>['curve'], value: number): number {
  if (curve === 'quadratic') return value * value
  if (curve === 'cubic') return value * value * value
  return 1 - Math.cos(value * Math.PI / 2)
}

function emitEaseInExpression(
  curve: Exclude<ShowStructuredEasing, { curve: 'linear' }>['curve'],
  input: string,
): string {
  if (curve === 'quadratic') return `(${input} * ${input})`
  if (curve === 'cubic') return `(${input} * ${input} * ${input})`
  return `(1 - cos(${input} * PI / 2))`
}
