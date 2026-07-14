export type ShowRgb = [number, number, number]

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function normalizeShowTransitionColor(color: string | undefined): string {
  return typeof color === 'string' && HEX_COLOR.test(color) ? color.toLowerCase() : '#000000'
}

export function showTransitionColorToRgb(color: string | undefined): ShowRgb {
  const normalized = normalizeShowTransitionColor(color)
  return [
    Number.parseInt(normalized.slice(1, 3), 16) / 255,
    Number.parseInt(normalized.slice(3, 5), 16) / 255,
    Number.parseInt(normalized.slice(5, 7), 16) / 255,
  ]
}

export function evaluateFadeThroughColor(
  outgoing: ShowRgb,
  incoming: ShowRgb,
  color: ShowRgb,
  progress: number,
): ShowRgb {
  const eased = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0))
  const source = eased <= 0.5 ? outgoing : incoming
  const mix = eased <= 0.5 ? eased * 2 : eased * 2 - 1
  const from = eased <= 0.5 ? source : color
  const to = eased <= 0.5 ? color : source
  return [
    from[0] * (1 - mix) + to[0] * mix,
    from[1] * (1 - mix) + to[1] * mix,
    from[2] * (1 - mix) + to[2] * mix,
  ]
}
