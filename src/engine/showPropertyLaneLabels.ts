// On-lane display names, hover text, and label/curve collision for Show
// property animation sparklines (#631). A lane is named by its property alone,
// because the owning Clip is normally readable from the Clip directly above it
// and its family is carried by a glyph. The owning Clip is reintroduced,
// abbreviated, only where a property repeats within one family in one Zone.

import { propertyLaneFamilyName, type ShowPropertyLaneFamily, type ShowPropertyLaneGlyph } from './showPropertyLaneFamilies'
import type { ShowPropertyLaneProjection } from './showPropertyLaneProjection'

export interface PropertyLaneLabelInput {
  /** Property being animated, without the owning Clip: 'brightness', 'translate X'. */
  propertyLabel: string
  family: ShowPropertyLaneFamily
  /** Owning Clip's Pattern name; absent for Zone-level lanes. */
  ownerName?: string
  /** Text shown for the property when a glyph carries part of it (#63); defaults to `propertyLabel`. */
  displayProperty?: string
  /** Glyph drawn for the property, part of what the reader sees (#63). */
  glyph?: ShowPropertyLaneGlyph | null
}

export function resolvePropertyLaneDisplayLabels(lanes: readonly PropertyLaneLabelInput[]): string[] {
  // Two lanes only compete for a name inside one family: across families the
  // glyph already tells a Pattern control named 'speed' from animation speed.
  // Names compete on what the reader sees - family, glyph, and shown text - so
  // a Zone-level 'scale x' and a Clip's 'scaleX', both a scale glyph with 'X',
  // contest the same name (#63 review).
  const key = (lane: PropertyLaneLabelInput) => (
    `${lane.family} ${lane.glyph ?? ''} ${lane.displayProperty ?? lane.propertyLabel}`
  )
  // A repeat only contests the name when the repeats have different owners.
  // One Clip animating one property across several Scenes repeats the lane,
  // but its name tells those lanes apart no better than the curve does (#63).
  const ownersByKey = new Map<string, Set<string | undefined>>()
  for (const lane of lanes) {
    const owners = ownersByKey.get(key(lane)) ?? new Set<string | undefined>()
    owners.add(lane.ownerName)
    ownersByKey.set(key(lane), owners)
  }
  const contested = new Set(
    [...ownersByKey].flatMap(([candidate, owners]) => (owners.size > 1 ? [candidate] : [])),
  )

  // Within one contested property, abbreviations only disambiguate when they
  // stay distinct; otherwise that property falls back to full Clip names.
  const abbreviationWorks = new Map<string, boolean>()
  for (const contestedKey of contested) {
    const qualifiers = [...ownersByKey.get(contestedKey) ?? []]
      .map((owner) => (owner === undefined ? '' : abbreviateOwnerName(owner)))
    abbreviationWorks.set(contestedKey, new Set(qualifiers).size === qualifiers.length)
  }

  return lanes.map((lane) => {
    const property = lane.displayProperty ?? lane.propertyLabel
    if (lane.ownerName === undefined || !contested.has(key(lane))) return property
    const qualifier = abbreviationWorks.get(key(lane))
      ? abbreviateOwnerName(lane.ownerName)
      : lane.ownerName
    return `${qualifier} ${property}`
  })
}

/** 'CompassRose' -> 'CR'; 'TestPattern1D' -> 'TPD'; 'Caustics' -> 'Ca'. */
function abbreviateOwnerName(ownerName: string): string {
  const capitals = ownerName.replace(/[^A-Z]/g, '')
  if (capitals.length >= 2) return capitals
  const head = ownerName.trim().slice(0, 2)
  return head.charAt(0).toUpperCase() + head.slice(1)
}

/**
 * Show-global window over which this lane actually animates. Scene-local time is
 * not a user-facing frame of reference, so every second reported here is
 * Show-global, matching the ruler above the lane.
 */
export function propertyLaneAnimatedSpanMs(
  projection: ShowPropertyLaneProjection,
): { startMs: number; endMs: number } | null {
  if (projection.beats.length > 0) {
    const times = projection.beats.map((beat) => beat.timeMs)
    return { startMs: Math.min(...times), endMs: Math.max(...times) }
  }
  // A change is already underway at the sample *before* the one that differs,
  // so the span starts there rather than one sample interval late.
  const changes = projection.samples.flatMap((sample, index, all) => (
    index > 0 && Math.abs(sample.value - all[index - 1].value) > 0.000001
      ? [{ startMs: all[index - 1].timeMs, endMs: sample.timeMs }]
      : []
  ))
  if (changes.length === 0) return null
  return {
    startMs: Math.min(...changes.map((change) => change.startMs)),
    endMs: Math.max(...changes.map((change) => change.endMs)),
  }
}

/** Plain hover text: what is animated, which family it belongs to, and when. */
export function describePropertyLaneHover(input: {
  ownerName?: string
  family: ShowPropertyLaneFamily
  propertyLabel: string
  projection: ShowPropertyLaneProjection
}): string {
  const span = propertyLaneAnimatedSpanMs(input.projection)
  return [
    ...(input.ownerName === undefined ? [] : [input.ownerName]),
    input.propertyLabel,
    propertyLaneFamilyName(input.family),
    ...(span === null ? [] : [formatSpanSeconds(span)]),
  ].join(' · ')
}

function formatSpanSeconds(span: { startMs: number; endMs: number }): string {
  const start = formatSeconds(span.startMs)
  const end = formatSeconds(span.endMs)
  return start === end ? `${start} s` : `${start}-${end} s`
}

function formatSeconds(timeMs: number): string {
  return `${Number((timeMs / 1_000).toFixed(1))}`
}

/**
 * True once the whole animated span sits behind `visibleFrom`, so the label
 * refers to nothing still to come. Callers pass whichever frontier has advanced
 * furthest - the scrolled viewport's left edge or the playhead - so both
 * scrolling and playing past a property retire its label.
 */
export function propertyLaneAnimationIsPast(
  projection: ShowPropertyLaneProjection,
  visibleFrom: number,
): boolean {
  if (visibleFrom <= 0) return false
  const span = propertyLaneAnimatedSpanMs(projection)
  if (span === null) return false
  return span.endMs / Math.max(1, projection.durationMs) < visibleFrom
}

/**
 * True when the window of the lane the label covers holds part of the animated
 * span, which is when an opaque label would hide the curve the lane exists to
 * show. The window is a fraction range rather than a prefix because the label
 * sticks to the left of the viewport: once zoomed and scrolled it sits over the
 * middle of the lane, and zooming in narrows the window it covers.
 */
export function propertyLaneLabelObscuresCurve(
  projection: ShowPropertyLaneProjection,
  covered: { from: number; to: number },
): boolean {
  if (covered.to <= covered.from) return false
  const span = propertyLaneAnimatedSpanMs(projection)
  if (span === null) return false
  const durationMs = Math.max(1, projection.durationMs)
  return span.startMs / durationMs < covered.to && span.endMs / durationMs > covered.from
}

export type PropertyLaneLabelPlacement =
  | { side: 'start' }
  | { side: 'after-span'; leftFraction: number }

const LABEL_GAP_FRACTION = 0.01

/**
 * Where the inline label sits so it never covers the curve it describes (#63).
 * It stays at the visible start when the animated span begins after the label
 * would end; otherwise it moves to just after the span when the lane has room
 * there. With room on neither side it stays at the start, where the component
 * thins its backing instead. `labelWidthFraction` is the label's measured
 * width as a fraction of the lane, so the decision depends on the label's
 * size but not on its current position and cannot oscillate.
 */
export function propertyLaneLabelPlacement(
  projection: ShowPropertyLaneProjection,
  labelWidthFraction: number,
  visibleFrom = 0,
): PropertyLaneLabelPlacement {
  const span = propertyLaneAnimatedSpanMs(projection)
  if (span === null) return { side: 'start' }
  const durationMs = Math.max(1, projection.durationMs)
  const startFraction = span.startMs / durationMs
  const endFraction = span.endMs / durationMs
  if (startFraction >= visibleFrom + labelWidthFraction + LABEL_GAP_FRACTION) return { side: 'start' }
  const leftFraction = Number((endFraction + LABEL_GAP_FRACTION).toFixed(4))
  if (leftFraction + labelWidthFraction <= 1 && leftFraction >= visibleFrom) {
    return { side: 'after-span', leftFraction }
  }
  return { side: 'start' }
}
