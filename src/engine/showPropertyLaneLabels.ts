// On-lane display names for Show property animation sparklines (#631). A lane
// is named by its property alone, because the owning Clip is normally readable
// from the Clip directly above it. The owning Clip is reintroduced, abbreviated,
// only on the lanes whose property name would otherwise repeat inside one Zone.

export interface PropertyLaneLabelInput {
  /** Property being animated, without the owning Clip: 'brightness', 'translate X'. */
  propertyLabel: string
  /** Owning Clip's Pattern name; absent for Zone-level lanes. */
  ownerName?: string
}

export function resolvePropertyLaneDisplayLabels(lanes: readonly PropertyLaneLabelInput[]): string[] {
  const sharedProperties = new Set(
    lanes
      .map((lane) => lane.propertyLabel)
      .filter((label, index, all) => all.indexOf(label) !== index),
  )

  // Within one contested property, abbreviations only disambiguate when they
  // stay distinct; otherwise that property falls back to full Clip names.
  const abbreviationWorks = new Map<string, boolean>()
  for (const property of sharedProperties) {
    const owners = lanes
      .filter((lane) => lane.propertyLabel === property)
      .map((lane) => lane.ownerName)
    const qualifiers = owners.map((owner) => (owner === undefined ? '' : abbreviateOwnerName(owner)))
    abbreviationWorks.set(property, new Set(qualifiers).size === qualifiers.length)
  }

  return lanes.map((lane) => {
    if (lane.ownerName === undefined || !sharedProperties.has(lane.propertyLabel)) return lane.propertyLabel
    const qualifier = abbreviationWorks.get(lane.propertyLabel)
      ? abbreviateOwnerName(lane.ownerName)
      : lane.ownerName
    return `${qualifier} ${lane.propertyLabel}`
  })
}

/** 'CompassRose' -> 'CR'; 'TestPattern1D' -> 'TPD'; 'Caustics' -> 'Ca'. */
function abbreviateOwnerName(ownerName: string): string {
  const capitals = ownerName.replace(/[^A-Z]/g, '')
  if (capitals.length >= 2) return capitals
  const head = ownerName.trim().slice(0, 2)
  return head.charAt(0).toUpperCase() + head.slice(1)
}
