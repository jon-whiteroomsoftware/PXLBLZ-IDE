export interface PowerCapElectricalInputs {
  targetAmps: number
  brightness: number
  pixelCount: number
  milliampsPerPixel: number
}

export interface PowerCapElectricalProvenance {
  targetAmps: number
  brightness: number
  milliampsPerPixel: number
}

export interface PowerCapSettings {
  mode: 'derived' | 'direct'
  maxDuty: number
  provenance?: PowerCapElectricalProvenance
}

export function deriveDutyLimit(inputs: PowerCapElectricalInputs): number {
  const fullWhiteAmps = inputs.brightness * inputs.pixelCount * inputs.milliampsPerPixel / 1000
  if (fullWhiteAmps <= 0) return 1
  return clamp01(inputs.targetAmps / fullWhiteAmps)
}

export function derivedPowerCapSettings(inputs: PowerCapElectricalInputs): PowerCapSettings {
  return {
    mode: 'derived',
    maxDuty: deriveDutyLimit(inputs),
    provenance: {
      targetAmps: inputs.targetAmps,
      brightness: inputs.brightness,
      milliampsPerPixel: inputs.milliampsPerPixel,
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
  }
}

export function estimatePowerCapAmps(
  settings: PowerCapSettings,
  pixelCount: number,
): number | null {
  if (!settings.provenance) return null
  return settings.maxDuty
    * settings.provenance.brightness
    * Math.max(0, pixelCount)
    * settings.provenance.milliampsPerPixel
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
  const milliampsPerPixel = settings.provenance?.milliampsPerPixel ?? 60
  const targetAmps = settings.provenance?.targetAmps
    ?? settings.maxDuty * brightness * resolvedPixelCount * milliampsPerPixel / 1000
  return {
    targetAmps,
    brightness,
    pixelCount: resolvedPixelCount,
    milliampsPerPixel,
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
