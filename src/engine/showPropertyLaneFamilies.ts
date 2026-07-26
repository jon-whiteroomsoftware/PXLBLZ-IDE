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
