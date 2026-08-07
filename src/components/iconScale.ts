/**
 * Icon sizing for the IDE chrome (#753).
 *
 * Lucide draws every glyph on a 24-unit grid at `strokeWidth` 2, so a glyph
 * rendered at N pixels carries an N/12 px stroke. At the 12-13px sizes the app
 * had drifted to, that stroke lands near or below a single device pixel, and
 * antialiasing greys the glyph out next to the 11px mono labels it sits beside.
 * Detail-heavy glyphs (the Save floppy, Copy, Trash) lose their interior
 * shapes first, which is why they read as smudges rather than as icons.
 *
 * Two levers fix that, and this module fixes the tier each icon belongs to
 * rather than leaving the choice to each call site:
 *
 *   size    - how much room the glyph gets. The navigation rail's 17px is the
 *             app's legibility reference; interactive chrome sits one step
 *             below it, and passive row markers one step below that.
 *   stroke  - weight added back as size drops. Capped at 2.25: past that,
 *             interior counters start closing up and the glyph clogs instead
 *             of sharpening.
 *
 * Sparse glyphs are the exception the tiers cannot express. Play and Pause
 * carry far more empty area than their neighbours, so at control size they
 * read light even at the capped stroke; `transportIcon` gives them the extra
 * weight that puts them level with the icons around them.
 */

/** Navigation rail: standalone, unlabelled, the app's legibility reference. */
export const ICON_RAIL = 17
/**
 * Inside a button, link, or menu item - anything the pointer acts on, at the
 * app's standard 11-12px chrome. A control that runs at 10px is denser than
 * this tier assumes and takes the inline size instead, so its glyph stays in
 * proportion to its own label.
 */
export const ICON_CONTROL = 15
/**
 * Inside a rail-density control: the 20px hover buttons on rail rows have room
 * for the weight but not the size, so they keep a smaller glyph and take the
 * compensated stroke on its own.
 */
export const ICON_DENSE = 13
/**
 * Beside text: section titles, row markers, captions, and the chevrons and
 * arrows that punctuate a label rather than act as its glyph.
 */
export const ICON_INLINE = 12

const BASE_STROKE = 2
const COMPENSATED_STROKE = 2.25

/**
 * Optical stroke weight for a glyph drawn at `size`. Anything below the rail
 * reference takes the compensated weight; the rail and larger keep Lucide's
 * own default, which is already correct at that size.
 */
export function iconStroke(size: number): number {
  return size < ICON_RAIL ? COMPENSATED_STROKE : BASE_STROKE
}

/** Sizing props for a glyph at an arbitrary size, weighted to match. */
export function iconProps(size: number): { size: number, strokeWidth: number } {
  return { size, strokeWidth: iconStroke(size) }
}

export const railIcon = { size: ICON_RAIL, strokeWidth: iconStroke(ICON_RAIL) } as const
export const controlIcon = { size: ICON_CONTROL, strokeWidth: iconStroke(ICON_CONTROL) } as const
export const denseIcon = { size: ICON_DENSE, strokeWidth: iconStroke(ICON_DENSE) } as const
export const inlineIcon = { size: ICON_INLINE, strokeWidth: iconStroke(ICON_INLINE) } as const
/** Play/Pause at control size: sparse glyphs need weight past the cap. */
export const transportIcon = { size: ICON_CONTROL, strokeWidth: 2.5 } as const
