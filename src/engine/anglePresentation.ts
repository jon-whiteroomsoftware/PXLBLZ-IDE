// Shared angle/cycle entry presentation (#612). Values are always stored in
// turns; each kind chooses the canonical display unit and how the transient
// slider windows onto the stored range:
//
// - direction: wrapped single cycle, degrees, compass landmarks. Exact entry
//   normalizes onto [0, 1) because a direction has no authored turn count.
// - phase: cyclic but animation-traversable, turns. The slider covers the
//   cycle containing the anchor value; exact entry never normalizes.
// - rotation: signed multi-turn, degrees. The slider covers two turns
//   centered near the anchor; the full range stays reachable by exact entry.
// - cycles: signed multi-turn, turns (hue shift, twist).
const EXACT_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const DEGREE_SUFFIX = /(°|degrees|degree|degs|deg)$/i
const TURN_SUFFIX = /(turns|turn|t)$/i

export type AnglePresentationKind = 'direction' | 'phase' | 'rotation' | 'cycles'
export type AngleCanonicalUnit = 'degrees' | 'turns'

export interface AnglePresentationBounds {
  min: number
  max: number
  step: number
}

export interface AnglePresentationOptions extends AnglePresentationBounds {
  /** Committed value the slider window anchors on, in turns. */
  anchor: number
}

export interface AngleSliderMark {
  position: number
  label?: string
  major: boolean
}

export interface ResolvedAnglePresentation extends AnglePresentationBounds {
  kind: AnglePresentationKind
  unit: AngleCanonicalUnit
  suffix: '°' | 't'
  sliderMin: number
  sliderMax: number
  /** Direction wraps every slider-derived value onto the canonical cycle. */
  snapSliderValue?: (turns: number) => number
  neutralPosition?: number
  sliderMarks: AngleSliderMark[]
  format: (turns: number) => string
  parse: (draft: unknown) => number | null
  formatDraft: (turns: number) => string
  toSliderPosition: (turns: number) => number
  fromSliderPosition: (position: number) => number
}

const ANGLE_KINDS: ReadonlySet<string> = new Set(['direction', 'phase', 'rotation', 'cycles'])

/** Narrows a toolkit parameter presentation to an angle kind, if it is one. */
export function anglePresentationKind(value: unknown): AnglePresentationKind | null {
  return typeof value === 'string' && ANGLE_KINDS.has(value) ? value as AnglePresentationKind : null
}

/** Canonical resting display for a stored-turns angle value, unit included. */
export function formatAngleValue(kind: AnglePresentationKind, turns: number): string {
  return kind === 'direction' || kind === 'rotation'
    ? `${formatAngleNumber(turns * 360)}°`
    : `${formatAngleNumber(turns)}t`
}

export function parseAngleDraft(draft: unknown, canonical: AngleCanonicalUnit): number | null {
  if (typeof draft !== 'string') return null
  const trimmed = draft.trim()
  if (!trimmed) return null
  let unit = canonical
  let numericText = trimmed
  const degree = trimmed.match(DEGREE_SUFFIX)
  const turn = trimmed.match(TURN_SUFFIX)
  if (degree) {
    unit = 'degrees'
    numericText = trimmed.slice(0, -degree[1].length).trim()
  } else if (turn) {
    unit = 'turns'
    numericText = trimmed.slice(0, -turn[1].length).trim()
  }
  if (!EXACT_NUMBER.test(numericText)) return null
  const parsed = Number(numericText)
  if (!Number.isFinite(parsed)) return null
  return unit === 'degrees' ? parsed / 360 : parsed
}

export function resolveAnglePresentation(
  kind: AnglePresentationKind,
  options: AnglePresentationOptions,
): ResolvedAnglePresentation {
  const min = Math.min(options.min, options.max)
  const max = Math.max(options.min, options.max)
  const step = Math.abs(options.step) || 0.001
  const anchor = clamp(Number.isFinite(options.anchor) ? options.anchor : min, min, max)
  const unit: AngleCanonicalUnit = kind === 'direction' || kind === 'rotation' ? 'degrees' : 'turns'
  const suffix = unit === 'degrees' ? '°' : 't'
  const window = sliderWindow(kind, min, max, anchor)
  const span = window.max - window.min
  const formatDraft = (turns: number) => formatAngleNumber(unit === 'degrees' ? turns * 360 : turns)
  const parse = (draft: unknown) => {
    const parsed = parseAngleDraft(draft, unit)
    if (parsed === null) return null
    return kind === 'direction' ? wrapTurn(parsed) : parsed
  }

  return {
    kind,
    unit,
    suffix,
    min,
    max,
    step,
    sliderMin: window.min,
    sliderMax: window.max,
    ...(kind === 'direction'
      ? { snapSliderValue: (turns: number) => wrapTurn(clamp(turns, window.min, window.max)) }
      : {}),
    neutralPosition: neutralPosition(kind, window),
    sliderMarks: sliderMarks(kind, unit, window),
    format: (turns) => `${formatDraft(turns)}${suffix}`,
    parse,
    formatDraft,
    toSliderPosition: (turns) => span === 0 ? 0 : clamp((turns - window.min) / span, 0, 1),
    // Direction wraps at the presentation boundary so the slider's right
    // endpoint commits the canonical 0 instead of a phantom full turn the
    // stored representation would immediately normalize away.
    fromSliderPosition: kind === 'direction'
      ? (position) => wrapTurn(window.min + span * clamp(position, 0, 1))
      : (position) => window.min + span * clamp(position, 0, 1),
  }
}

function sliderWindow(
  kind: AnglePresentationKind,
  min: number,
  max: number,
  anchor: number,
): { min: number; max: number } {
  if (kind === 'direction') return { min: 0, max: 1 }
  if (kind === 'phase') {
    if (max - min < 1) return { min, max }
    const base = Math.max(min, Math.min(Math.floor(anchor), max - 1))
    return { min: base, max: base + 1 }
  }
  if (max - min < 2) return { min, max }
  const center = clamp(Math.round(anchor), min + 1, max - 1)
  return { min: center - 1, max: center + 1 }
}

function neutralPosition(
  kind: AnglePresentationKind,
  window: { min: number; max: number },
): number | undefined {
  if (kind !== 'rotation' && kind !== 'cycles') return undefined
  const span = window.max - window.min
  if (span === 0 || window.min > 0 || window.max < 0) return undefined
  return (0 - window.min) / span
}

function sliderMarks(
  kind: AnglePresentationKind,
  unit: AngleCanonicalUnit,
  window: { min: number; max: number },
): AngleSliderMark[] {
  if (kind === 'direction') {
    const compass = ['E', 'S', 'W', 'N', 'E']
    const majors = compass.map((label, index) => ({ position: index / 4, label, major: true }))
    const minors = [0.125, 0.375, 0.625, 0.875].map((position) => ({ position, major: false }))
    return [...majors, ...minors]
  }
  const span = window.max - window.min
  if (kind === 'phase') {
    if (span !== 1) return []
    const majors = [0, 0.25, 0.5, 0.75, 1].map((position) => ({
      position,
      label: turnFractionLabel(window.min + position),
      major: true,
    }))
    const minors = [0.125, 0.375, 0.625, 0.875].map((position) => ({ position, major: false }))
    return [...majors, ...minors]
  }
  const labelFor = (turns: number) => formatAngleNumber(unit === 'degrees' ? turns * 360 : turns)
  const majors = [0, 0.5, 1].map((position) => ({
    position,
    label: labelFor(window.min + span * position),
    major: true,
  }))
  const quarterTurn = span === 0 ? 0 : 0.25 / span
  const minors: AngleSliderMark[] = []
  if (quarterTurn > 0) {
    for (let position = quarterTurn; position < 1; position += quarterTurn) {
      if (![0, 0.5, 1].some((major) => Math.abs(position - major) < 1e-9)) {
        minors.push({ position: Number(position.toFixed(10)), major: false })
      }
    }
  }
  return [...majors, ...minors]
}

function turnFractionLabel(turns: number): string {
  const sign = turns < 0 ? '-' : ''
  const magnitude = Math.abs(turns)
  const whole = Math.floor(magnitude + 1e-9)
  const fraction = magnitude - whole
  const glyph = [
    [0, ''],
    [0.25, '¼'],
    [0.5, '½'],
    [0.75, '¾'],
  ].find(([value]) => Math.abs(fraction - (value as number)) < 1e-9)?.[1] as string | undefined
  if (glyph === undefined) return formatAngleNumber(turns)
  if (glyph === '') return `${sign}${whole}`
  return `${sign}${whole > 0 ? whole : ''}${glyph}`
}

function wrapTurn(turns: number): number {
  const wrapped = ((turns % 1) + 1) % 1
  return Object.is(wrapped, -0) ? 0 : wrapped
}

function formatAngleNumber(value: number): string {
  const finite = Number.isFinite(value) ? value : 0
  const rounded = Number(finite.toFixed(6))
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}
