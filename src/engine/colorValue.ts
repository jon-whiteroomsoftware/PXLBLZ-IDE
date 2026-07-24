export type NormalizedRgb = readonly [number, number, number]

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function parseColorValue(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : null
}

export function formatColorValue(value: unknown, fallback = '#000000'): string {
  return parseColorValue(value) ?? parseColorValue(fallback) ?? '#000000'
}

export function colorValueToNormalizedRgb(value: unknown): [number, number, number] {
  const color = formatColorValue(value)
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  ]
}

export function normalizedRgbToColorValue(rgb: NormalizedRgb): string {
  return `#${rgb.map(channelToHex).join('')}`
}

function channelToHex(value: number): string {
  const finite = Number.isFinite(value) ? value : 0
  const channel = Math.round(Math.min(1, Math.max(0, finite)) * 255)
  return channel.toString(16).padStart(2, '0')
}
