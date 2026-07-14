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

export interface ShowEasingControlDescriptor {
  id: string
  label: string
  min: number
  max: number
  step: number
  integer?: boolean
}

export interface ShowEasingOption {
  id: string
  label: string
  easing: ShowStructuredEasing
  controls: ShowEasingControlDescriptor[]
  samples: Array<{ progress: number; value: number }>
}

export interface ShowEasingValidationIssue {
  path: string
  code: 'invalid-curve' | 'invalid-option' | 'not-finite' | 'not-integer' | 'out-of-range'
  message: string
}

export interface ShowEasingValidationResult {
  valid: boolean
  issues: ShowEasingValidationIssue[]
}

const DIRECTIONAL_CONTROLS: ShowEasingControlDescriptor[] = []
const BEZIER_CONTROLS: ShowEasingControlDescriptor[] = [
  { id: 'x1', label: 'Control 1 X', min: 0, max: 1, step: 0.01 },
  { id: 'y1', label: 'Control 1 Y', min: -4, max: 4, step: 0.01 },
  { id: 'x2', label: 'Control 2 X', min: 0, max: 1, step: 0.01 },
  { id: 'y2', label: 'Control 2 Y', min: -4, max: 4, step: 0.01 },
]
const STEPS_CONTROLS: ShowEasingControlDescriptor[] = [
  { id: 'steps', label: 'Steps', min: 1, max: 64, step: 1, integer: true },
]
const HOLD_CONTROLS: ShowEasingControlDescriptor[] = [
  { id: 'at', label: 'Switch point', min: 0, max: 1, step: 0.01 },
]
const BACK_CONTROLS: ShowEasingControlDescriptor[] = [
  { id: 'overshoot', label: 'Overshoot', min: 0, max: 10, step: 0.01 },
]
const PREVIEW_PROGRESS = [0, 0.25, 0.5, 0.75, 1]

const BASE_EASING_OPTIONS: Array<Omit<ShowEasingOption, 'samples'>> = [
  { id: 'linear', label: 'linear', easing: { curve: 'linear' }, controls: [] },
  { id: 'ease-in', label: 'quadratic in', easing: { curve: 'quadratic', direction: 'in' }, controls: DIRECTIONAL_CONTROLS },
  { id: 'ease-out', label: 'quadratic out', easing: { curve: 'quadratic', direction: 'out' }, controls: DIRECTIONAL_CONTROLS },
  { id: 'ease-in-out', label: 'quadratic in/out', easing: { curve: 'quadratic', direction: 'in-out' }, controls: DIRECTIONAL_CONTROLS },
  { id: 'cubic-in', label: 'cubic in', easing: { curve: 'cubic', direction: 'in' }, controls: DIRECTIONAL_CONTROLS },
  { id: 'cubic-out', label: 'cubic out', easing: { curve: 'cubic', direction: 'out' }, controls: DIRECTIONAL_CONTROLS },
  { id: 'cubic-in-out', label: 'cubic in/out', easing: { curve: 'cubic', direction: 'in-out' }, controls: DIRECTIONAL_CONTROLS },
  { id: 'sine-in', label: 'sine in', easing: { curve: 'sine', direction: 'in' }, controls: DIRECTIONAL_CONTROLS },
  { id: 'sine-out', label: 'sine out', easing: { curve: 'sine', direction: 'out' }, controls: DIRECTIONAL_CONTROLS },
  { id: 'sine-in-out', label: 'sine in/out', easing: { curve: 'sine', direction: 'in-out' }, controls: DIRECTIONAL_CONTROLS },
  { id: 'css-ease', label: 'CSS ease', easing: { curve: 'cubic-bezier', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 }, controls: BEZIER_CONTROLS },
  { id: 'css-ease-in', label: 'CSS ease in', easing: { curve: 'cubic-bezier', x1: 0.42, y1: 0, x2: 1, y2: 1 }, controls: BEZIER_CONTROLS },
  { id: 'css-ease-out', label: 'CSS ease out', easing: { curve: 'cubic-bezier', x1: 0, y1: 0, x2: 0.58, y2: 1 }, controls: BEZIER_CONTROLS },
  { id: 'css-ease-in-out', label: 'CSS ease in/out', easing: { curve: 'cubic-bezier', x1: 0.42, y1: 0, x2: 0.58, y2: 1 }, controls: BEZIER_CONTROLS },
  { id: 'steps-4-end', label: '4 steps', easing: { curve: 'steps', steps: 4, position: 'end' }, controls: STEPS_CONTROLS },
  { id: 'steps-4-start', label: '4 steps from start', easing: { curve: 'steps', steps: 4, position: 'start' }, controls: STEPS_CONTROLS },
  { id: 'hold-half', label: 'Hold until halfway', easing: { curve: 'hold', at: 0.5 }, controls: HOLD_CONTROLS },
  { id: 'back-in', label: 'back in', easing: { curve: 'back', direction: 'in', overshoot: 1.70158 }, controls: BACK_CONTROLS },
  { id: 'back-out', label: 'back out', easing: { curve: 'back', direction: 'out', overshoot: 1.70158 }, controls: BACK_CONTROLS },
  { id: 'back-in-out', label: 'back in/out', easing: { curve: 'back', direction: 'in-out', overshoot: 1.70158 }, controls: BACK_CONTROLS },
]

export const SHOW_EASING_OPTIONS: ShowEasingOption[] = BASE_EASING_OPTIONS.map((option) => ({
  ...option,
  controls: option.controls.map((control) => ({ ...control })),
  samples: PREVIEW_PROGRESS.map((progress) => ({ progress, value: applyShowEasing(option.easing, progress) })),
}))

export function validateShowEasing(easing: unknown): ShowEasingValidationResult {
  const issues: ShowEasingValidationIssue[] = []
  if (typeof easing === 'string') {
    if (!(easing in LEGACY_EASING)) issue(issues, 'curve', 'invalid-curve', `Unknown easing "${easing}".`)
    return { valid: issues.length === 0, issues }
  }
  if (!easing || typeof easing !== 'object') {
    issue(issues, 'curve', 'invalid-curve', 'Easing must be a structured curve object.')
    return { valid: false, issues }
  }
  const value = easing as Record<string, unknown>
  if (value.curve === 'linear') return { valid: true, issues }
  if (value.curve === 'quadratic' || value.curve === 'cubic' || value.curve === 'sine') {
    validateDirection(value.direction, issues)
  } else if (value.curve === 'cubic-bezier') {
    validateFiniteRange(value.x1, 'x1', 0, 1, issues)
    validateFinite(value.y1, 'y1', issues)
    validateFiniteRange(value.x2, 'x2', 0, 1, issues)
    validateFinite(value.y2, 'y2', issues)
  } else if (value.curve === 'steps') {
    validateFiniteRange(value.steps, 'steps', 1, 64, issues)
    if (Number.isFinite(value.steps) && !Number.isInteger(value.steps)) issue(issues, 'steps', 'not-integer', 'Steps must be a whole number.')
    if (value.position !== 'start' && value.position !== 'end') issue(issues, 'position', 'invalid-option', 'Step position must be start or end.')
  } else if (value.curve === 'hold') {
    validateFiniteRange(value.at, 'at', 0, 1, issues)
  } else if (value.curve === 'back') {
    validateDirection(value.direction, issues)
    validateFiniteRange(value.overshoot, 'overshoot', 0, 10, issues)
  } else {
    issue(issues, 'curve', 'invalid-curve', `Unknown easing curve "${String(value.curve)}".`)
  }
  return { valid: issues.length === 0, issues }
}

export function normalizeShowEasing(easing: ShowTransitionEasing | null | undefined): ShowStructuredEasing {
  if (typeof easing === 'string') return LEGACY_EASING[easing] ?? LEGACY_EASING.linear
  if (!validateShowEasing(easing).valid || !easing || typeof easing !== 'object') return LEGACY_EASING.linear
  if (easing.curve === 'linear') return { curve: 'linear' }
  if (easing.curve === 'quadratic' || easing.curve === 'cubic' || easing.curve === 'sine') {
    return { curve: easing.curve, direction: easing.direction }
  }
  if (easing.curve === 'cubic-bezier') return { curve: easing.curve, x1: easing.x1, y1: easing.y1, x2: easing.x2, y2: easing.y2 }
  if (easing.curve === 'steps') return { curve: easing.curve, steps: easing.steps, position: easing.position }
  if (easing.curve === 'hold') return { curve: easing.curve, at: easing.at }
  if (easing.curve === 'back') return { curve: 'back', direction: easing.direction, overshoot: easing.overshoot }
  return { curve: 'linear' }
}

export function showEasingOptionId(easing: ShowTransitionEasing): string {
  const normalized = normalizeShowEasing(easing)
  return SHOW_EASING_OPTIONS.find((option) => sameEasing(option.easing, normalized))?.id
    ?? (validateShowEasing(easing).valid ? 'custom' : 'linear')
}

export function showEasingFromOptionId(id: string): ShowStructuredEasing {
  return normalizeShowEasing(SHOW_EASING_OPTIONS.find((option) => option.id === id)?.easing)
}

export function applyShowEasing(easing: ShowTransitionEasing, progress: number): number {
  const t = Math.max(0, Math.min(1, progress))
  const normalized = normalizeShowEasing(easing)
  if (normalized.curve === 'linear') return t
  if (normalized.curve === 'cubic-bezier') return applyCubicBezier(normalized, t)
  if (normalized.curve === 'steps') {
    return normalized.position === 'start'
      ? Math.min(1, (Math.floor(t * normalized.steps) + 1) / normalized.steps)
      : Math.floor(t * normalized.steps) / normalized.steps
  }
  if (normalized.curve === 'hold') return t < normalized.at ? 0 : 1
  return applyDirectionalEasing(normalized, t)
}

/** Emits only arithmetic supported by the Pixelblaze dialect. Input must already be clamped. */
export function emitShowEasingExpression(easing: ShowTransitionEasing, input: string): string {
  const normalized = normalizeShowEasing(easing)
  if (normalized.curve === 'linear') return input
  if (normalized.curve === 'cubic-bezier') {
    return `__pxlblz_show_cubicBezier(${input}, ${normalized.x1}, ${normalized.y1}, ${normalized.x2}, ${normalized.y2})`
  }
  if (normalized.curve === 'steps') {
    return normalized.position === 'start'
      ? `min(1, (floor(${input} * ${normalized.steps}) + 1) / ${normalized.steps})`
      : `floor(${input} * ${normalized.steps}) / ${normalized.steps}`
  }
  if (normalized.curve === 'hold') return `(${input} < ${normalized.at} ? 0 : 1)`
  const easeIn = emitEaseInExpression(normalized, input)
  if (normalized.direction === 'in') return easeIn
  const inverseInput = `(1 - ${input})`
  const easeOut = `(1 - ${emitEaseInExpression(normalized, inverseInput)})`
  if (normalized.direction === 'out') return easeOut
  const firstHalfInput = `(2 * ${input})`
  const secondHalfInput = `(2 * (1 - ${input}))`
  return `(${input} < 0.5 ? 0.5 * ${emitEaseInExpression(normalized, firstHalfInput)} : 1 - 0.5 * ${emitEaseInExpression(normalized, secondHalfInput)})`
}

export function showCubicBezierRuntimeSource(): string {
  return `function __pxlblz_show_cubicBezierComponent(t, p1, p2) {
  var inverse = 1 - t
  return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t
}
function __pxlblz_show_cubicBezier(progress, x1, y1, x2, y2) {
  if (progress <= 0) return 0
  if (progress >= 1) return 1
  var low = 0
  var high = 1
  var parameter = 0.5
  for (var iteration = 0; iteration < 12; iteration++) {
    parameter = (low + high) / 2
    if (__pxlblz_show_cubicBezierComponent(parameter, x1, x2) < progress) low = parameter
    else high = parameter
  }
  return __pxlblz_show_cubicBezierComponent((low + high) / 2, y1, y2)
}`
}

function applyCubicBezier(easing: Extract<ShowStructuredEasing, { curve: 'cubic-bezier' }>, progress: number): number {
  if (progress <= 0) return 0
  if (progress >= 1) return 1
  let low = 0
  let high = 1
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const parameter = (low + high) / 2
    if (cubicBezierComponent(parameter, easing.x1, easing.x2) < progress) low = parameter
    else high = parameter
  }
  return cubicBezierComponent((low + high) / 2, easing.y1, easing.y2)
}

function cubicBezierComponent(t: number, p1: number, p2: number): number {
  const inverse = 1 - t
  return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t
}

function sameEasing(a: ShowStructuredEasing, b: ShowStructuredEasing): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function applyDirectionalEasing(
  easing: Extract<ShowStructuredEasing, { direction: ShowEasingDirection }>,
  t: number,
): number {
  const easeIn = (value: number) => applyEaseIn(easing, value)
  if (easing.direction === 'in') return easeIn(t)
  if (easing.direction === 'out') return 1 - easeIn(1 - t)
  return t < 0.5 ? 0.5 * easeIn(2 * t) : 1 - 0.5 * easeIn(2 * (1 - t))
}

function applyEaseIn(easing: Extract<ShowStructuredEasing, { direction: ShowEasingDirection }>, value: number): number {
  if (easing.curve === 'quadratic') return value * value
  if (easing.curve === 'cubic') return value * value * value
  if (easing.curve === 'sine') return 1 - Math.cos(value * Math.PI / 2)
  const overshoot = 'overshoot' in easing ? easing.overshoot : 0
  return value * value * ((overshoot + 1) * value - overshoot)
}

function emitEaseInExpression(
  easing: Extract<ShowStructuredEasing, { direction: ShowEasingDirection }>,
  input: string,
): string {
  if (easing.curve === 'quadratic') return `(${input} * ${input})`
  if (easing.curve === 'cubic') return `(${input} * ${input} * ${input})`
  if (easing.curve === 'sine') return `(1 - cos(${input} * PI / 2))`
  const overshoot = 'overshoot' in easing ? easing.overshoot : 0
  return `(${input} * ${input} * ((${overshoot + 1}) * ${input} - ${overshoot}))`
}

function validateDirection(direction: unknown, issues: ShowEasingValidationIssue[]): void {
  if (direction !== 'in' && direction !== 'out' && direction !== 'in-out') {
    issue(issues, 'direction', 'invalid-option', 'Direction must be in, out, or in-out.')
  }
}

function validateFinite(value: unknown, path: string, issues: ShowEasingValidationIssue[]): void {
  if (!Number.isFinite(value)) issue(issues, path, 'not-finite', `${path} must be a finite number.`)
}

function validateFiniteRange(
  value: unknown,
  path: string,
  min: number,
  max: number,
  issues: ShowEasingValidationIssue[],
): void {
  validateFinite(value, path, issues)
  if (Number.isFinite(value) && ((value as number) < min || (value as number) > max)) {
    issue(issues, path, 'out-of-range', `${path} must be between ${min} and ${max}.`)
  }
}

function issue(
  issues: ShowEasingValidationIssue[],
  path: string,
  code: ShowEasingValidationIssue['code'],
  message: string,
): void {
  issues.push({ path, code, message })
}
