export interface PowerCapElectricalInputs {
  targetAmps: number
  brightness: number
  pixelCount: number
  milliampsPerPixel: number
}

export interface PowerCapElectricalProvenance {
  targetAmps: number
  brightness: number
  /** Legacy location retained only while older serialized profiles are read. */
  milliampsPerPixel?: number
}

export interface PowerCapSettings {
  mode: 'derived' | 'direct'
  maxDuty: number
  /** Full-white current for one installed LED. Defaults to 60 for legacy profiles. */
  milliampsPerPixel?: number
  provenance?: PowerCapElectricalProvenance
}

export const DEFAULT_POWER_CAP_MILLIAMPS_PER_PIXEL = 60

export function deriveDutyLimit(inputs: PowerCapElectricalInputs): number {
  const fullWhiteAmps = inputs.brightness * inputs.pixelCount * inputs.milliampsPerPixel / 1000
  if (fullWhiteAmps <= 0) return 1
  return clamp01(inputs.targetAmps / fullWhiteAmps)
}

export function derivedPowerCapSettings(inputs: PowerCapElectricalInputs): PowerCapSettings {
  return {
    mode: 'derived',
    maxDuty: deriveDutyLimit(inputs),
    milliampsPerPixel: normalizeMilliamps(inputs.milliampsPerPixel),
    provenance: {
      targetAmps: inputs.targetAmps,
      brightness: inputs.brightness,
    },
  }
}

export function directPowerCapSettings(
  settings: PowerCapSettings,
  maxDuty: number,
): PowerCapSettings {
  return {
    ...settings,
    mode: 'direct',
    maxDuty: clamp01(maxDuty),
    milliampsPerPixel: resolvePowerCapMilliamps(settings),
  }
}

export function resolvePowerCapMilliamps(settings: PowerCapSettings): number {
  return normalizeMilliamps(
    settings.milliampsPerPixel ?? settings.provenance?.milliampsPerPixel,
  )
}

export function withPowerCapMilliamps(
  settings: PowerCapSettings,
  milliampsPerPixel: number,
): PowerCapSettings {
  return {
    ...settings,
    milliampsPerPixel: normalizeMilliamps(milliampsPerPixel),
  }
}

export function estimatePowerCapAmps(
  settings: PowerCapSettings,
  pixelCount: number,
  brightness = settings.provenance?.brightness,
): number | null {
  if (typeof brightness !== 'number' || !Number.isFinite(brightness)) return null
  return settings.maxDuty
    * clamp01(brightness)
    * Math.max(0, pixelCount)
    * resolvePowerCapMilliamps(settings)
    / 1000
}

export function powerCapElectricalInputs(
  settings: PowerCapSettings,
  pixelCount: number,
  liveBrightness?: number | null,
): PowerCapElectricalInputs {
  const resolvedPixelCount = Math.max(1, Math.round(pixelCount))
  const brightness = settings.provenance?.brightness
    ?? (typeof liveBrightness === 'number' && Number.isFinite(liveBrightness)
      ? clamp01(liveBrightness)
      : 1)
  const milliampsPerPixel = resolvePowerCapMilliamps(settings)
  const targetAmps = settings.provenance?.targetAmps
    ?? settings.maxDuty * brightness * resolvedPixelCount * milliampsPerPixel / 1000
  return {
    targetAmps,
    brightness,
    pixelCount: resolvedPixelCount,
    milliampsPerPixel,
  }
}

function normalizeMilliamps(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_POWER_CAP_MILLIAMPS_PER_PIXEL
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
