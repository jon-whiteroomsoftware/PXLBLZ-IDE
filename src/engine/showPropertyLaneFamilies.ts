// Families of animatable Show property, derived from the animation target kind
// (#631). A lane's family drives its colour, its glyph, and its hover text, so
// two lanes that read the same bare property name stay distinguishable.

export const PROPERTY_LANE_FAMILIES = ['time', 'appearance', 'transform', 'control', 'effect'] as const

export type ShowPropertyLaneFamily = (typeof PROPERTY_LANE_FAMILIES)[number]

const FAMILY_COLORS: Record<ShowPropertyLaneFamily, string> = {
  time: '#a78bfa',
  appearance: '#fbbf24',
  transform: '#2dd4bf',
  control: '#22d3ee',
  effect: '#f472b6',
}

const FAMILY_NAMES: Record<ShowPropertyLaneFamily, string> = {
  time: 'Animation speed',
  appearance: 'Appearance',
  transform: 'Transform',
  control: 'Pattern control',
  effect: 'Effect parameter',
}

export function propertyLaneFamilyColor(family: ShowPropertyLaneFamily): string {
  return FAMILY_COLORS[family]
}

export function propertyLaneFamilyName(family: ShowPropertyLaneFamily): string {
  return FAMILY_NAMES[family]
}

/**
 * Accessible-name form of a property. The lane shows the bare property, where a
 * glyph carries the family; assistive tech gets the family in words instead, so
 * a Clip's animation speed never reads identically to a control named 'speed'.
 */
export function qualifiedPropertyLabel(
  family: ShowPropertyLaneFamily,
  propertyLabel: string,
): string {
  if (family === 'time') return `animation ${propertyLabel}`
  if (family === 'control') return `${propertyLabel} control`
  return propertyLabel
}

/** Transform kinds that read as a glyph on the lane instead of a word (#63). */
export type ShowPropertyLaneGlyph = 'move' | 'rotate' | 'scale' | 'shear'

const TRANSFORM_GLYPHS: Readonly<Record<string, ShowPropertyLaneGlyph>> = {
  position: 'move',
  translate: 'move',
  rotation: 'rotate',
  rotate: 'rotate',
  scale: 'scale',
  shear: 'shear',
}

/**
 * How a lane presents its property: a transform kind becomes a glyph and the
 * remaining words stay ('translate x' -> move glyph + 'x', 'rotation' ->
 * rotate glyph + 'turns'); everything else keeps its text. Lane text is
 * lowercase in every family, axes included. Accessible names and hover text
 * keep the full property label (#63).
 */
export function propertyLanePresentation(
  family: ShowPropertyLaneFamily,
  propertyLabel: string,
): { glyph: ShowPropertyLaneGlyph | null; displayProperty: string } {
  if (family !== 'transform' && family !== 'effect') return { glyph: null, displayProperty: propertyLabel }
  const match = propertyLabel.match(/^(position|translate|rotation|rotate|scale|shear)(?:\s+|(?=[XY]$))?(.*)$/i)
  if (!match) return { glyph: null, displayProperty: propertyLabel }
  const glyph = TRANSFORM_GLYPHS[match[1].toLowerCase()]
  const rest = match[2].trim()
  const displayProperty = glyph === 'rotate'
    ? (rest || 'turns')
    : rest.toLowerCase()
  return { glyph, displayProperty }
}
