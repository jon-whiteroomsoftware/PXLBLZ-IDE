import { ICON_CONTROL } from '@/components/iconScale'

/* The Controller's own glyph vocabulary: a chip for the device, and a plug for
   the link between PXLBLZ and that device. Drawn here rather than taken from
   Lucide because at the sizes this chrome uses, Lucide's `Cpu` and `Unplug`
   carry more interior detail than the box can resolve — eight chip pins and a
   split two-body plug both collapse into a smudge (#753).

   These are drawn on a 16-unit grid, so a stroke of 1.5 renders at the same
   weight as a Lucide glyph beside them at the same size (2 on a 24-unit grid). */

const GRID = 16
const STROKE = 1.5
/** The chip's pins read one step lighter than its body, as on a real package. */
const PIN_STROKE = 1.35

/** The Controller itself: carried on every connected-Controller affordance. */
export function ChipGlyph({ size = ICON_CONTROL }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`} data-glyph="chip" aria-hidden className="shrink-0">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth={STROKE} />
      <rect x="6" y="6" width="4" height="4" rx="0.5" fill="currentColor" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" stroke="currentColor" strokeWidth={PIN_STROKE} strokeLinecap="round" />
    </svg>
  )
}

/** A plug on its cord: the "plug it in" Controller connection affordance. */
export function ConnectGlyph({ size = ICON_CONTROL }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`} data-glyph="connect" aria-hidden className="shrink-0">
      <path d="M6.25 1.5v4M9.75 1.5v4" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M4 5.5h8v0.5a4 4 0 0 1-8 0z" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinejoin="round" />
      <path d="M8 10v3.5" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  )
}

/** The same plug lifted clear of its socket: drop this Controller's connection.
    The gap does the work, so it stays legible where a broken-cord drawing
    would only read as a dot. */
export function DisconnectGlyph({ size = ICON_CONTROL }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`} data-glyph="disconnect" aria-hidden className="shrink-0">
      <path d="M6.25 0.9v3.4M9.75 0.9v3.4" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M4 4.3h8v0.5a4 4 0 0 1-8 0z" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinejoin="round" />
      <path d="M3 12.6h10" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  )
}
