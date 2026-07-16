export const IDE_MICROTYPE = {
  panelHex: '#0b0c0f',
  header: {
    fontSizePx: 14,
    colorHex: '#e4e4e7',
    sizeClassName: 'text-sm leading-5',
    className: 'text-sm leading-5 text-zinc-200',
  },
  entity: {
    fontSizePx: 12,
    colorHex: '#a1a1aa',
    sizeClassName: 'text-xs leading-4',
    className: 'text-xs leading-4 text-zinc-400',
  },
  required: {
    fontSizePx: 10,
    colorHex: '#a1a1aa',
    sizeClassName: 'text-[10px] leading-[1.35]',
    className: 'text-[10px] leading-[1.35] text-zinc-400',
  },
  secondary: {
    fontSizePx: 9,
    colorHex: '#a1a1aa',
    sizeClassName: 'text-[9px] leading-[1.35]',
    className: 'text-[9px] leading-[1.35] text-zinc-400',
  },
  ornament: {
    fontSizePx: 8,
    colorHex: '#71717a',
    sizeClassName: 'text-[8px] leading-[1.35]',
    className: 'text-[8px] leading-[1.35] text-zinc-500',
  },
} as const

export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const foreground = relativeLuminance(foregroundHex)
  const background = relativeLuminance(backgroundHex)
  return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace(/^#/, '')
  if (!/^[0-9a-f]{6}$/i.test(normalized)) throw new Error(`Expected a six-digit hex color, received ${hex}`)
  const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255)
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
