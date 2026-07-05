/** The small Controller/chip glyph carried on every connected Controller affordance. */
export function ChipGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="6" y="6" width="4" height="4" rx="0.5" fill="currentColor" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

/** A two-prong plug + cord: the "plug it in" Controller connection affordance. */
export function ConnectGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path d="M6.25 1.5v4M9.75 1.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4 5.5h8v0.5a4 4 0 0 1-8 0z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 10v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
