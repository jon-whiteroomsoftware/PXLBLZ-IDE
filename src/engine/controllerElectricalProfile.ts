export type ElectricalUnit = 'amps' | 'watts'

export interface ElectricalQuantity {
  value: number
  unit: ElectricalUnit
}

export type LedConstructionPresetId =
  | 'ws2812-5v-individual'
  | 'ws2811-12v-grouped'
  | 'ws2815-12v-individual'
  | 'custom'

export type ElectricalLoadSource = 'manufacturer-rated' | 'measured' | 'custom'

export interface ControllerElectricalProfile {
  ledPresetId: LedConstructionPresetId
  supplyBudget: ElectricalQuantity
  voltageOverride?: number
  loadOverride?: {
    /** Total installation draw at full white, not a per-pixel value. */
    fullWhite: ElectricalQuantity
    source: ElectricalLoadSource
    atPixelCount: number
  }
}

export interface LedConstructionPreset {
  id: Exclude<LedConstructionPresetId, 'custom'>
  label: string
  physicalLedsPerAddress: number
  voltageVolts: number
  wattsPerAddress: number
  assumption: string
}

/**
 * Conservative nameplate estimates for common addressable-LED constructions.
 * They intentionally leave margin above typical measured draw. A measured or
 * manufacturer-rated installation total can replace any preset estimate.
 */
export const LED_CONSTRUCTION_PRESETS: readonly LedConstructionPreset[] = [
  {
    id: 'ws2812-5v-individual',
    label: '5V individual RGB',
    physicalLedsPerAddress: 1,
    voltageVolts: 5,
    wattsPerAddress: 0.3,
    assumption: '60 mA per address at 5V full white',
  },
  {
    id: 'ws2811-12v-grouped',
    label: '12V 3-LED segments',
    physicalLedsPerAddress: 3,
    voltageVolts: 12,
    wattsPerAddress: 0.72,
    assumption: '60 mA per address at 12V full white',
  },
  {
    id: 'ws2815-12v-individual',
    label: '12V individual RGB, backup data',
    physicalLedsPerAddress: 1,
    voltageVolts: 12,
    wattsPerAddress: 0.432,
    assumption: '36 mA per address at 12V full white',
  },
] as const

export interface ElectricalResolutionContext {
  pixelCount?: number | null
  duty?: number | null
  brightness?: number | null
}

export interface ResolvedControllerElectricalProfile {
  voltageVolts: number | null
  pixelCount: number | null
  physicalLedCount: number | null
  fullWhiteAmps: number | null
  fullWhiteWatts: number | null
  budgetAmps: number | null
  budgetWatts: number | null
  maxDuty: number | null
  estimatedDrawAmps: number | null
  estimatedDrawWatts: number | null
  overrideStale: boolean
  assumptions: string[]
}

export function findLedConstructionPreset(
  id: LedConstructionPresetId,
): LedConstructionPreset | null {
  return LED_CONSTRUCTION_PRESETS.find(preset => preset.id === id) ?? null
}

export function convertElectricalQuantity(
  quantity: ElectricalQuantity,
  unit: ElectricalUnit,
  voltageVolts: number | null,
): ElectricalQuantity | null {
  const normalized = normalizeQuantity(quantity)
  const value = asUnit(normalized, unit, positive(voltageVolts))
  return value == null ? null : { value, unit }
}

export function resolveControllerElectricalProfile(
  profile: ControllerElectricalProfile,
  context: ElectricalResolutionContext,
): ResolvedControllerElectricalProfile {
  const preset = findLedConstructionPreset(profile.ledPresetId)
  const pixelCount = normalizePixelCount(context.pixelCount)
  const voltageVolts = positive(profile.voltageOverride) ?? preset?.voltageVolts ?? null
  const overrideStale = profile.loadOverride != null
    && pixelCount != null
    && normalizePixelCount(profile.loadOverride.atPixelCount) !== pixelCount

  const assumptions: string[] = []
  if (profile.loadOverride) {
    assumptions.push(`${sourceLabel(profile.loadOverride.source)} full-white installation total`)
    if (overrideStale) {
      assumptions.push(`override recorded at ${profile.loadOverride.atPixelCount} addresses; controller now reports ${pixelCount}`)
    }
  } else if (preset) {
    assumptions.push(`${preset.label}: ${preset.assumption}`)
  } else {
    assumptions.push('custom construction requires a full-white installation total')
  }
  if (pixelCount == null) assumptions.push('waiting for the controller pixel count')

  const fullWhiteAuthored = !overrideStale
    ? resolveFullWhiteQuantity(profile, preset, pixelCount)
    : null
  const budget = normalizeQuantity(profile.supplyBudget)
  const fullWhiteAmps = asUnit(fullWhiteAuthored, 'amps', voltageVolts)
  const fullWhiteWatts = asUnit(fullWhiteAuthored, 'watts', voltageVolts)
  const budgetAmps = asUnit(budget, 'amps', voltageVolts)
  const budgetWatts = asUnit(budget, 'watts', voltageVolts)
  const maxDuty = deriveComparableDuty(
    budget,
    fullWhiteAuthored,
    budgetWatts,
    fullWhiteWatts,
  )

  const duty = finite01(context.duty)
  const brightness = finite01(context.brightness)
  const liveScale = duty != null && brightness != null ? duty * brightness : null

  return {
    voltageVolts,
    pixelCount,
    physicalLedCount: preset && pixelCount != null
      ? pixelCount * preset.physicalLedsPerAddress
      : null,
    fullWhiteAmps,
    fullWhiteWatts,
    budgetAmps,
    budgetWatts,
    maxDuty,
    estimatedDrawAmps: liveScale == null || fullWhiteAmps == null
      ? null
      : fullWhiteAmps * liveScale,
    estimatedDrawWatts: liveScale == null || fullWhiteWatts == null
      ? null
      : fullWhiteWatts * liveScale,
    overrideStale,
    assumptions,
  }
}

function resolveFullWhiteQuantity(
  profile: ControllerElectricalProfile,
  preset: LedConstructionPreset | null,
  pixelCount: number | null,
): ElectricalQuantity | null {
  if (profile.loadOverride) return normalizeQuantity(profile.loadOverride.fullWhite)
  if (!preset || pixelCount == null) return null
  return { value: preset.wattsPerAddress * pixelCount, unit: 'watts' }
}

function asUnit(
  quantity: ElectricalQuantity | null,
  unit: ElectricalUnit,
  voltageVolts: number | null,
): number | null {
  if (!quantity) return null
  if (quantity.unit === unit) return quantity.value
  if (voltageVolts == null) return null
  return unit === 'watts'
    ? quantity.value * voltageVolts
    : quantity.value / voltageVolts
}

function deriveComparableDuty(
  budget: ElectricalQuantity | null,
  fullWhite: ElectricalQuantity | null,
  budgetWatts: number | null,
  fullWhiteWatts: number | null,
): number | null {
  if (!budget || !fullWhite) return null
  if (budgetWatts != null && fullWhiteWatts != null) {
    return clamp01(budgetWatts / fullWhiteWatts)
  }
  if (budget.unit === fullWhite.unit) return clamp01(budget.value / fullWhite.value)
  return null
}

function normalizeQuantity(quantity: ElectricalQuantity): ElectricalQuantity | null {
  const value = positive(quantity.value)
  return value == null ? null : { value, unit: quantity.unit }
}

function normalizePixelCount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function finite01(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : null
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function sourceLabel(source: ElectricalLoadSource): string {
  if (source === 'manufacturer-rated') return 'Manufacturer-rated'
  if (source === 'measured') return 'Measured'
  return 'Custom'
}
