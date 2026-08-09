import type {
  ControllerProfile,
  GlobalTransform,
  PowerCapTransform,
} from './controllerProfile'
import {
  convertElectricalQuantity,
  resolveControllerElectricalProfile,
  type ControllerElectricalProfile,
  type ElectricalLoadSource,
  type ElectricalUnit,
  type LedConstructionPresetId,
} from './controllerElectricalProfile'

export type ControllerPowerEdit =
  | { type: 'configure-model' }
  | { type: 'set-led-preset'; presetId: LedConstructionPresetId }
  | { type: 'set-supply-value'; value: number }
  | { type: 'set-supply-unit'; unit: ElectricalUnit }
  | { type: 'set-voltage'; voltage: number }
  | { type: 'enable-load-override' }
  | { type: 'disable-load-override' }
  | { type: 'set-load-value'; value: number }
  | { type: 'set-load-unit'; unit: ElectricalUnit }
  | { type: 'set-load-source'; source: ElectricalLoadSource }
  | { type: 'confirm-load-address-count' }
  | { type: 'set-cap-duty'; maxDuty: number }
  | { type: 'set-cap-mode'; mode: PowerCapTransform['mode'] }
  | { type: 'set-cap-enabled'; enabled: boolean }

const DEFAULT_ELECTRICAL_PROFILE: ControllerElectricalProfile = {
  ledPresetId: 'ws2812-5v-individual',
  supplyBudget: { value: 3, unit: 'amps' },
}

/** Apply one authored power-policy operation without mutating the durable
 * Controller profile. The UI and store both use this interface, so derived cap
 * synchronization cannot drift between interaction paths. */
export function applyControllerPowerEdit(
  profile: ControllerProfile,
  edit: ControllerPowerEdit,
): ControllerProfile {
  if (edit.type === 'configure-model') {
    return withElectricalProfile(profile, {
      ...DEFAULT_ELECTRICAL_PROFILE,
      supplyBudget: { ...DEFAULT_ELECTRICAL_PROFILE.supplyBudget },
    })
  }
  if (edit.type === 'set-cap-duty') {
    return withPowerCap(profile, { mode: 'direct', maxDuty: edit.maxDuty })
  }
  if (edit.type === 'set-cap-enabled') {
    return withPowerCap(profile, { enabled: edit.enabled })
  }
  if (edit.type === 'set-cap-mode') {
    if (edit.mode === 'direct') return withPowerCap(profile, { mode: 'direct' })
    if (!profile.electricalProfile) return profile
    const maxDuty = resolveControllerElectricalProfile(profile.electricalProfile, {
      pixelCount: profile.lastKnownPixelCount,
    }).maxDuty
    return maxDuty == null
      ? profile
      : withPowerCap(profile, { mode: 'derived', maxDuty })
  }

  const electrical = profile.electricalProfile
  if (!electrical) return profile
  const resolved = resolveControllerElectricalProfile(electrical, {
    pixelCount: profile.lastKnownPixelCount,
  })

  if (edit.type === 'set-led-preset') {
    if (edit.presetId !== 'custom') {
      return withElectricalProfile(profile, {
        ledPresetId: edit.presetId,
        supplyBudget: electrical.supplyBudget,
      })
    }
    const pixelCount = profile.lastKnownPixelCount
    if (!pixelCount) return profile
    if (electrical.loadOverride) {
      return withElectricalProfile(profile, {
        ...electrical,
        ledPresetId: edit.presetId,
        ...(resolved.voltageVolts ? { voltageOverride: resolved.voltageVolts } : {}),
      })
    }
    if (resolved.fullWhiteWatts == null) return profile
    return withElectricalProfile(profile, {
      ledPresetId: edit.presetId,
      supplyBudget: electrical.supplyBudget,
      ...(resolved.voltageVolts ? { voltageOverride: resolved.voltageVolts } : {}),
      loadOverride: {
        fullWhite: { value: resolved.fullWhiteWatts, unit: 'watts' },
        source: 'custom',
        atPixelCount: pixelCount,
      },
    })
  }
  if (edit.type === 'set-supply-value') {
    return withElectricalProfile(profile, {
      ...electrical,
      supplyBudget: { ...electrical.supplyBudget, value: edit.value },
    })
  }
  if (edit.type === 'set-supply-unit') {
    const supplyBudget = convertElectricalQuantity(
      electrical.supplyBudget,
      edit.unit,
      resolved.voltageVolts,
    )
    return supplyBudget
      ? withElectricalProfile(profile, { ...electrical, supplyBudget })
      : profile
  }
  if (edit.type === 'set-voltage') {
    return withElectricalProfile(profile, { ...electrical, voltageOverride: edit.voltage })
  }
  if (edit.type === 'enable-load-override') {
    const pixelCount = profile.lastKnownPixelCount
    if (!pixelCount) return profile
    return withElectricalProfile(profile, {
      ...electrical,
      loadOverride: {
        fullWhite: {
          value: resolved.fullWhiteWatts ?? resolved.budgetWatts ?? 1,
          unit: 'watts',
        },
        source: 'measured',
        atPixelCount: pixelCount,
      },
    })
  }
  if (edit.type === 'disable-load-override') {
    if (!electrical.loadOverride || electrical.ledPresetId === 'custom') return profile
    return withElectricalProfile(profile, {
      ledPresetId: electrical.ledPresetId,
      supplyBudget: electrical.supplyBudget,
    })
  }
  if (!electrical.loadOverride) return profile
  if (edit.type === 'set-load-value') {
    return withElectricalProfile(profile, {
      ...electrical,
      loadOverride: {
        ...electrical.loadOverride,
        fullWhite: { ...electrical.loadOverride.fullWhite, value: edit.value },
      },
    })
  }
  if (edit.type === 'set-load-unit') {
    const fullWhite = convertElectricalQuantity(
      electrical.loadOverride.fullWhite,
      edit.unit,
      resolved.voltageVolts,
    )
    return fullWhite
      ? withElectricalProfile(profile, {
          ...electrical,
          loadOverride: { ...electrical.loadOverride, fullWhite },
        })
      : profile
  }
  if (edit.type === 'set-load-source') {
    return withElectricalProfile(profile, {
      ...electrical,
      loadOverride: { ...electrical.loadOverride, source: edit.source },
    })
  }
  if (edit.type === 'confirm-load-address-count') {
    const pixelCount = profile.lastKnownPixelCount
    return pixelCount
      ? withElectricalProfile(profile, {
          ...electrical,
          loadOverride: { ...electrical.loadOverride, atPixelCount: pixelCount },
        })
      : profile
  }
  return profile
}

function withPowerCap(
  profile: ControllerProfile,
  changes: Partial<PowerCapTransform>,
): ControllerProfile {
  const globalTransforms: GlobalTransform[] = profile.globalTransforms.map((transform) => (
    transform.type === 'power-cap' ? { ...transform, ...changes } : transform
  ))
  return { ...profile, globalTransforms }
}

function withElectricalProfile(
  profile: ControllerProfile,
  electricalProfile: ControllerElectricalProfile,
): ControllerProfile {
  const maxDuty = resolveControllerElectricalProfile(electricalProfile, {
    pixelCount: profile.lastKnownPixelCount,
  }).maxDuty
  const globalTransforms: GlobalTransform[] = profile.globalTransforms.map((transform) => (
    transform.type === 'power-cap' && transform.mode === 'derived' && maxDuty != null
      ? { ...transform, maxDuty }
      : transform
  ))
  return { ...profile, electricalProfile, globalTransforms }
}
