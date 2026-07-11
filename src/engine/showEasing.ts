import type { ShowTransitionEasing } from './personalContentRecords'

export function applyShowEasing(easing: ShowTransitionEasing, progress: number): number {
  const t = Math.max(0, Math.min(1, progress))
  if (easing === 'ease-in') return t * t
  if (easing === 'ease-out') return 1 - (1 - t) * (1 - t)
  if (easing === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
  return t
}

/** Emits only arithmetic supported by the Pixelblaze dialect. Input must already be clamped. */
export function emitShowEasingExpression(easing: ShowTransitionEasing, input: string): string {
  if (easing === 'ease-in') return `(${input} * ${input})`
  if (easing === 'ease-out') return `(1 - (1 - ${input}) * (1 - ${input}))`
  if (easing === 'ease-in-out') {
    return `(${input} < 0.5 ? 2 * ${input} * ${input} : 1 - 2 * (1 - ${input}) * (1 - ${input}))`
  }
  return input
}
