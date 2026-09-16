import type { ShowPropertyTrackV2 } from './showCompositionV2'
import type { ShowStructuredEasing } from './personalContentRecords'

const inRange = (value: number): boolean => Number.isFinite(value) && value >= 1 && value <= 8

/** Full original source domain, including retained coefficients and easing extrema. */
export function repeatScaleSourceIsInRangeV2(from: number, to: number, easing: ShowStructuredEasing): boolean {
  if (!inRange(from) || !inRange(to)) return false
  if (from === to) return true
  let min = 0
  let max = 1
  if (easing.curve === 'back') {
    const s = easing.overshoot
    const t = 2 * s / (3 * (s + 1))
    const low = t * t * ((s + 1) * t - s)
    if (easing.direction === 'in') min = low
    else if (easing.direction === 'out') max = 1 - low
    else { min = low / 2; max = 1 - low / 2 }
  } else if (easing.curve === 'cubic-bezier') {
    // X maps monotonically through [0,1]; extrema are roots of the Y derivative.
    const a = 3 * (1 - 3 * easing.y2 + 3 * easing.y1)
    const b = 6 * (easing.y2 - 2 * easing.y1)
    const c = 3 * easing.y1
    const discriminant = b * b - 4 * a * c
    if (![a, b, c, discriminant].every(Number.isFinite)) return false
    const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(Math.max(0, discriminant)))
    const roots = a === 0 ? (b === 0 ? [] : [-c / b]) : discriminant < 0 ? [] : q === 0 ? [0] : [q / a, c / q]
    for (const t of roots) if (t > 0 && t < 1) {
      const inverse = 1 - t
      const y = 3 * inverse * inverse * t * easing.y1 + 3 * inverse * t * t * easing.y2 + t * t * t
      min = Math.min(min, y); max = Math.max(max, y)
    }
  }
  const delta = to - from
  return inRange(from + delta * min) && inRange(from + delta * max)
}

/** Inspect only the kernel a hold splits; whole-shifted sources retain existing playback. */
export function repeatScaleHoldSourceIsInRangeV2(track: ShowPropertyTrackV2, atMs: number): boolean {
  if (track.target.kind !== 'show-repeat-scale') return true
  const keys = [...track.keyframes].sort((a, b) => a.timeMs - b.timeMs)
  const exact = keys.find(key => key.timeMs === atMs)
  if (exact) return inRange(exact.value)
  const rightIndex = keys.findIndex(key => key.timeMs > atMs)
  if (rightIndex === 0) return inRange(keys[0].value)
  if (rightIndex === -1) return keys.length > 0 && inRange(keys[keys.length - 1].value)
  const left = keys[rightIndex - 1]
  const right = keys[rightIndex]
  if (!inRange(left.value) || !inRange(right.value)) return false
  const segment = left.curveSegment
  return segment
    ? repeatScaleSourceIsInRangeV2(segment.baseValue, segment.baseValue + segment.deltaValue, segment.easing)
    : repeatScaleSourceIsInRangeV2(left.value, right.value, left.easing)
}
