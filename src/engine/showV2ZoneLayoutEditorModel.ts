import { ZONE_COLORS, formatShowRoutingRanges, showRoutingLayoutKindLabel } from './showModel'
import type { ShowRecordV2 } from './showCompositionV2'
import type { InstallationLayoutCoverage } from './showInstallationCoverage'
import { validateInstallationCoverageV2 } from './showInstallationCoverageV2'
import { validateShowLogicalRouting, type ShowLogicalRouting } from './showLogicalRouting'
import type { ShowZoneEditIntentV2 } from './showZonesV2'

/**
 * What the v2 editor's Zone Map and Zone Layouts sections read and submit
 * (#1039).
 *
 * This is a projection, not an owner: every rule stays in `showZonesV2` and
 * `showZoneLayoutDefinitionsV2`. It exists so the components can stay thin and
 * so the routing vocabulary has one source. The mode list and its parameter
 * conversions are v1's, from the `ShowEditor` Zone Layout panel; the labels
 * come from the engine's own `showRoutingLayoutKindLabel`, which already names
 * these operators when it auto-names a definition.
 *
 * Identity is never minted here. `showV2AddZoneIntent` takes the fresh Zone id
 * from its caller, exactly as the owner requires.
 */
export const SHOW_V2_ROUTING_MODES = [
  'physical', 'single', 'stripes-x', 'stripes-y', 'grid-2x2', 'checker',
  'rings', 'pinwheel', 'wave', 'soft-split', 'split-x', 'split-y',
] as const

export type ShowV2RoutingMode = typeof SHOW_V2_ROUTING_MODES[number]

export interface ShowV2RoutingModeChoice {
  mode: ShowV2RoutingMode
  label: string
  /** The operator needs more Zones than the Show has, or the contract forbids it. */
  disabled: boolean
}

export type ShowV2RoutingParameterView =
  | { id: string; kind: 'number'; label: string; ariaLabel: string; value: number; min?: number; step: number }
  | { id: string; kind: 'percentage'; label: string; ariaLabel: string; value: number }
  | { id: string; kind: 'axis'; label: string; ariaLabel: string; value: 'x' | 'y' }

export interface ShowV2ZoneLayoutRangeView {
  zoneId: string
  zoneName: string
  /** v1's own `0-63, 128-191` text, ready for `parseShowRoutingRanges`. */
  text: string
}

export interface ShowV2ZoneLayoutDefinitionView {
  id: string
  name: string
  mode: ShowV2RoutingMode
  modeLabel: string
  /** Layout occurrence identities that name this definition. */
  occurrenceIds: string[]
  memberZoneIds: string[]
  memberArity: { min: number; max: number | null }
  parameters: ShowV2RoutingParameterView[]
  ranges: ShowV2ZoneLayoutRangeView[]
  /** The first issue `validateShowLogicalRouting` reports, if any. */
  routingIssue: string | null
  coverage: InstallationLayoutCoverage | null
}

export interface ShowV2ZoneLayoutModel {
  definitions: ShowV2ZoneLayoutDefinitionView[]
  modes: ShowV2RoutingModeChoice[]
  zones: Array<{ id: string; name: string }>
  canRemoveDefinition: boolean
  canRemoveZone: boolean
}

export function buildShowV2ZoneLayoutModel(record: ShowRecordV2): ShowV2ZoneLayoutModel {
  // One projection owner, shared with the authoring validator and the delivery
  // gate, so the arithmetic this section shows is the arithmetic that refuses.
  const coverage = validateInstallationCoverageV2(record)
  return {
    definitions: record.zoneLayouts.map(layout => {
      const mode = showV2RoutingMode(layout)
      return {
        id: layout.id,
        name: layout.name,
        mode,
        modeLabel: showV2RoutingModeLabel(mode, record),
        occurrenceIds: record.composition.layoutOccurrences
          .filter(occurrence => occurrence.layoutId === layout.id)
          .map(occurrence => occurrence.id),
        memberZoneIds: layout.logical ? [...layout.logical.zoneIds] : [],
        memberArity: showV2RoutingArity(layout.logical),
        parameters: layout.logical ? showV2RoutingParameters(layout.logical) : [],
        ranges: layout.logical ? [] : record.zones.map(zone => ({
          zoneId: zone.id,
          zoneName: zone.name,
          text: formatShowRoutingRanges(layout.zones.find(entry => entry.zoneId === zone.id)?.ranges ?? []),
        })),
        routingIssue: layout.logical ? validateShowLogicalRouting(layout.logical)[0] ?? null : null,
        coverage: coverage?.layouts.find(entry => entry.layoutId === layout.id) ?? null,
      }
    }),
    modes: SHOW_V2_ROUTING_MODES.map(mode => ({
      mode,
      label: showV2RoutingModeLabel(mode, record),
      disabled: mode === 'physical'
        ? record.outputContract.kind === 'portable-2d'
        : record.zones.length < showV2RoutingModeMinimumZones(mode),
    })),
    zones: record.zones.map(zone => ({ id: zone.id, name: zone.name })),
    canRemoveDefinition: record.zoneLayouts.length > 1,
    canRemoveZone: record.zones.length > 1,
  }
}

/** v1's `routingModeValue`: which select option describes this definition. */
export function showV2RoutingMode(layout: ShowRecordV2['zoneLayouts'][number]): ShowV2RoutingMode {
  const logical = layout.logical
  if (!logical) return 'physical'
  if (logical.kind === 'single') return 'single'
  if (logical.kind === 'grid') return 'grid-2x2'
  if (logical.kind === 'stripes') return logical.axis === 'y' ? 'stripes-y' : 'stripes-x'
  if (logical.kind === 'split') return logical.axis === 'y' ? 'split-y' : 'split-x'
  if (logical.kind === 'checker' || logical.kind === 'rings' || logical.kind === 'pinwheel'
    || logical.kind === 'wave' || logical.kind === 'soft-split') return logical.kind
  return 'physical'
}

export function showV2RoutingModeLabel(mode: ShowV2RoutingMode, record: ShowRecordV2): string {
  const logical = showV2RoutingForMode(mode, record.zones.map(zone => zone.id))
  return showRoutingLayoutKindLabel({ logical: logical ?? undefined })
}

export function showV2RoutingModeMinimumZones(mode: ShowV2RoutingMode): number {
  if (mode === 'grid-2x2') return 4
  if (mode === 'checker' || mode === 'soft-split' || mode === 'split-x' || mode === 'split-y') return 2
  return 1
}

/** v1's `logicalRoutingForMode`, including its default operator parameters. */
export function showV2RoutingForMode(mode: ShowV2RoutingMode, zoneIds: readonly string[]): ShowLogicalRouting | null {
  if (mode === 'single') return { kind: 'single', zoneIds: [zoneIds[0]] }
  if (mode === 'grid-2x2') return { kind: 'grid', zoneIds: zoneIds.slice(0, 4), columns: 2, rows: 2 }
  if (mode === 'stripes-x' || mode === 'stripes-y') {
    return { kind: 'stripes', zoneIds: [...zoneIds], axis: mode === 'stripes-y' ? 'y' : 'x' }
  }
  if (mode === 'checker') return { kind: 'checker', zoneIds: [zoneIds[0], zoneIds[1]], columns: 4, rows: 4 }
  if (mode === 'rings') return { kind: 'rings', zoneIds: [...zoneIds], rings: 5 }
  if (mode === 'pinwheel') return { kind: 'pinwheel', zoneIds: [...zoneIds], arms: 6, twist: Math.PI * 2 * 1.35, rotation: 0 }
  if (mode === 'wave') {
    return { kind: 'wave', zoneIds: [...zoneIds], axis: 'x', bands: 4, amplitude: 0.3, frequency: 2.5, phase: 0 }
  }
  if (mode === 'soft-split') return { kind: 'soft-split', zoneIds: [zoneIds[0], zoneIds[1]], axis: 'x', feather: 0.2 }
  if (mode === 'split-x' || mode === 'split-y') {
    return { kind: 'split', zoneIds: [zoneIds[0], zoneIds[1]], axis: mode === 'split-y' ? 'y' : 'x' }
  }
  return null
}

/** How many member Zones this operator owns: fixed arity, or one and upward. */
export function showV2RoutingArity(logical?: ShowLogicalRouting): { min: number; max: number | null } {
  if (!logical) return { min: 0, max: 0 }
  if (logical.kind === 'single') return { min: 1, max: 1 }
  if (logical.kind === 'grid') {
    const cells = Math.max(1, Math.round(logical.columns)) * Math.max(1, Math.round(logical.rows))
    return { min: cells, max: cells }
  }
  if (logical.kind === 'checker' || logical.kind === 'split' || logical.kind === 'soft-split') return { min: 2, max: 2 }
  return { min: 1, max: null }
}

export function showV2RoutingParameters(logical: ShowLogicalRouting): ShowV2RoutingParameterView[] {
  if (logical.kind === 'checker') {
    return [
      { id: 'columns', kind: 'number', label: 'Columns', ariaLabel: 'Checker columns', value: logical.columns, min: 1, step: 1 },
      { id: 'rows', kind: 'number', label: 'Rows', ariaLabel: 'Checker rows', value: logical.rows, min: 1, step: 1 },
    ]
  }
  if (logical.kind === 'grid') {
    return [
      { id: 'columns', kind: 'number', label: 'Columns', ariaLabel: 'Grid columns', value: logical.columns, min: 1, step: 1 },
      { id: 'rows', kind: 'number', label: 'Rows', ariaLabel: 'Grid rows', value: logical.rows, min: 1, step: 1 },
    ]
  }
  if (logical.kind === 'rings') {
    return [{ id: 'rings', kind: 'number', label: 'Ring count', ariaLabel: 'Ring count', value: logical.rings, min: 1, step: 1 }]
  }
  if (logical.kind === 'pinwheel') {
    return [
      { id: 'arms', kind: 'number', label: 'Arms', ariaLabel: 'Pinwheel arms', value: logical.arms ?? logical.zoneIds.length, min: 1, step: 1 },
      { id: 'twistTurns', kind: 'number', label: 'Twist turns', ariaLabel: 'Pinwheel twist turns', value: Number((logical.twist / (Math.PI * 2)).toFixed(3)), step: 0.05 },
      { id: 'rotationDegrees', kind: 'number', label: 'Rotation °', ariaLabel: 'Pinwheel rotation degrees', value: Number((((logical.rotation ?? 0) * 180) / Math.PI).toFixed(2)), step: 1 },
    ]
  }
  if (logical.kind === 'wave') {
    return [
      { id: 'axis', kind: 'axis', label: 'Axis', ariaLabel: 'Wave axis', value: logical.axis },
      { id: 'bands', kind: 'number', label: 'Bands', ariaLabel: 'Wave band count', value: logical.bands, min: 1, step: 1 },
      { id: 'amplitude', kind: 'percentage', label: 'Wave amplitude', ariaLabel: 'Wave amplitude', value: logical.amplitude },
      { id: 'frequency', kind: 'number', label: 'Frequency', ariaLabel: 'Wave frequency', value: logical.frequency, min: 0, step: 0.1 },
      { id: 'phase', kind: 'number', label: 'Phase', ariaLabel: 'Wave phase', value: logical.phase, step: 0.05 },
    ]
  }
  if (logical.kind === 'soft-split') {
    return [
      { id: 'axis', kind: 'axis', label: 'Axis', ariaLabel: 'Soft Split axis', value: logical.axis },
      { id: 'feather', kind: 'percentage', label: 'Soft Split feather', ariaLabel: 'Soft Split feather', value: logical.feather },
    ]
  }
  return []
}

/** v1's own conversions: whole counts, twist in turns, rotation in degrees. */
export function showV2RoutingWithParameter(
  logical: ShowLogicalRouting,
  id: string,
  value: number | 'x' | 'y',
): ShowLogicalRouting {
  const whole = (input: number) => Math.max(1, Math.round(input))
  if (id === 'axis' && (value === 'x' || value === 'y')) {
    return 'axis' in logical ? { ...logical, axis: value } : logical
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return logical
  if (id === 'columns' && (logical.kind === 'checker' || logical.kind === 'grid')) return { ...logical, columns: whole(value) }
  if (id === 'rows' && (logical.kind === 'checker' || logical.kind === 'grid')) return { ...logical, rows: whole(value) }
  if (id === 'rings' && logical.kind === 'rings') return { ...logical, rings: whole(value) }
  if (logical.kind === 'pinwheel') {
    if (id === 'arms') return { ...logical, arms: whole(value) }
    if (id === 'twistTurns') return { ...logical, twist: value * Math.PI * 2 }
    if (id === 'rotationDegrees') return { ...logical, rotation: (value * Math.PI) / 180 }
  }
  if (logical.kind === 'wave') {
    if (id === 'bands') return { ...logical, bands: whole(value) }
    if (id === 'amplitude') return { ...logical, amplitude: value }
    if (id === 'frequency') return { ...logical, frequency: Math.max(0, value) }
    if (id === 'phase') return { ...logical, phase: value }
  }
  if (id === 'feather' && logical.kind === 'soft-split') return { ...logical, feather: value }
  return logical
}

/** Replace the operator's member Zones, keeping its kind and parameters. */
export function showV2RoutingWithMembers(logical: ShowLogicalRouting, zoneIds: readonly string[]): ShowLogicalRouting {
  return { ...logical, zoneIds: [...zoneIds] } as ShowLogicalRouting
}

/** A name free across the Show's definitions, compared the way v1 compares. */
export function nextShowV2ZoneLayoutName(record: ShowRecordV2, base: string): string {
  return nextFreeName(base, record.zoneLayouts.map(layout => layout.name))
}

/** v1's Add Zone seed: `zone-<n>`, 60 nominal pixels and the next palette color. */
export function showV2AddZoneIntent(record: ShowRecordV2, zoneId: string): Extract<ShowZoneEditIntentV2, { kind: 'add' }> {
  return {
    kind: 'add',
    zone: {
      id: zoneId,
      name: nextFreeName(`zone-${record.zones.length + 1}`, record.zones.map(zone => zone.name)),
      nominalPixelCount: 60,
      color: ZONE_COLORS[record.zones.length % ZONE_COLORS.length],
    },
  }
}

function nextFreeName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map(name => name.trim().toLowerCase()))
  if (!used.has(base.trim().toLowerCase())) return base
  let index = 2
  while (used.has(`${base} ${index}`.toLowerCase())) index += 1
  return `${base} ${index}`
}
