const EXACT_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const PERCENTAGE_READOUT = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  maximumFractionDigits: 2,
})

export function parsePercentageValue(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const percentage = trimmed.endsWith('%')
  const numericText = percentage ? trimmed.slice(0, -1).trim() : trimmed
  if (!EXACT_NUMBER.test(numericText)) return null
  const parsed = Number(numericText)
  if (!Number.isFinite(parsed)) return null
  return percentage ? parsed / 100 : parsed
}

export function clampPercentageValue(value: number, min: number, max: number): number {
  const lower = Math.min(min, max)
  const upper = Math.max(min, max)
  if (!Number.isFinite(value)) return lower
  return Math.max(lower, Math.min(upper, value))
}

export function formatPercentageValue(value: number, _step = 0.01): string {
  const finite = Number.isFinite(value) ? value : 0
  const percentage = Object.is(finite, -0) ? 0 : finite * 100
  return `${PERCENTAGE_READOUT.format(percentage)}%`
}

export interface PercentageSliderPlacementInput {
  pointerX: number
  anchorTop: number
  anchorBottom: number
  viewportWidth: number
  viewportHeight: number
  value: number
  min: number
  max: number
  width?: number
  height?: number
  margin?: number
  gap?: number
  trackInset?: number
}

export interface PercentageSliderPlacement {
  left: number
  top: number
  width: number
  height: number
  trackLeft: number
  trackWidth: number
}

export function percentageSliderPlacement({
  pointerX,
  anchorTop,
  anchorBottom,
  viewportWidth,
  viewportHeight,
  value,
  min,
  max,
  width: requestedWidth = 260,
  height = 44,
  margin = 8,
  gap = 6,
  trackInset = 16,
}: PercentageSliderPlacementInput): PercentageSliderPlacement {
  const width = Math.max(0, Math.min(requestedWidth, viewportWidth - margin * 2))
  const trackWidth = Math.max(1, width - trackInset * 2)
  const span = max - min
  const fraction = span === 0 ? 0 : clampPercentageValue((value - min) / span, 0, 1)
  const idealLeft = pointerX - trackInset - fraction * trackWidth
  const left = clampPercentageValue(idealLeft, margin, Math.max(margin, viewportWidth - width - margin))
  const below = anchorBottom + gap
  const above = anchorTop - gap - height
  const top = below + height <= viewportHeight - margin
    ? below
    : clampPercentageValue(above, margin, Math.max(margin, viewportHeight - height - margin))
  return {
    left,
    top,
    width,
    height,
    trackLeft: left + trackInset,
    trackWidth,
  }
}

export function percentageValueFromPointer(
  pointerX: number,
  trackLeft: number,
  trackWidth: number,
  min: number,
  max: number,
  step: number,
): number {
  const fraction = clampPercentageValue((pointerX - trackLeft) / Math.max(1, trackWidth), 0, 1)
  const raw = min + (max - min) * fraction
  const pointerStep = Math.min(Math.abs(step) || 1, Math.abs(max - min) / 1_000 || 1)
  const snapped = min + Math.round((raw - min) / pointerStep) * pointerStep
  return Number(clampPercentageValue(snapped, min, max).toFixed(10))
}
