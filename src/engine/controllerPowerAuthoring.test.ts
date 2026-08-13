import { describe, expect, it } from 'vitest'
import type { ControllerProfile } from './controllerProfile'
import { validateControllerProfile } from './controllerProfile'
import { applyControllerPowerEdit } from './controllerPowerAuthoring'

function profileFixture(): ControllerProfile {
  return {
    id: 'ctrl-1',
    name: 'Analog bench',
    lastKnownPixelCount: 100,
    board: { kind: 'pixelblaze-v3-standard', hardwareRevision: 3.5 },
    inputs: [],
    globalTransforms: [
      {
        id: 'hardware-brightness',
        type: 'hardware-brightness',
        enabled: false,
        mixinId: 'builtin:hardware-brightness',
        inputId: '',
        mode: 'multiply-output',
      },
      {
        id: 'power-cap',
        type: 'power-cap',
        enabled: true,
        mixinId: 'builtin:power-cap',
        mode: 'derived',
        maxDuty: 0.25,
      },
    ],
    patternBindings: [],
    updatedAt: 1,
  }
}

describe('applyControllerPowerEdit', () => {
  it('configures the default power model and synchronizes a derived cap without mutation', () => {
    const profile = profileFixture()
    const before = structuredClone(profile)

    const edited = applyControllerPowerEdit(profile, { type: 'configure-model' })

    expect(edited).not.toBe(profile)
    expect(edited.electricalProfile).toEqual({
      ledPresetId: 'ws2812-5v-individual',
      supplyBudget: { value: 3, unit: 'amps' },
    })
    expect(edited.globalTransforms).toEqual([
      profile.globalTransforms[0],
      expect.objectContaining({ type: 'power-cap', mode: 'derived', maxDuty: 0.5 }),
    ])
    expect(validateControllerProfile(edited)).toEqual({ ok: true, errors: [] })
    expect(profile).toEqual(before)
  })

  it('applies the complete model and cap authoring sequence through one interface', () => {
    const original = profileFixture()
    let profile = applyControllerPowerEdit(original, { type: 'configure-model' })
    profile = applyControllerPowerEdit(profile, { type: 'set-supply-unit', unit: 'watts' })
    profile = applyControllerPowerEdit(profile, { type: 'set-led-preset', presetId: 'custom' })
    profile = applyControllerPowerEdit(profile, { type: 'set-load-source', source: 'measured' })
    profile = applyControllerPowerEdit(profile, { type: 'set-load-value', value: 20 })
    profile = applyControllerPowerEdit(profile, { type: 'set-supply-value', value: 10 })
    profile = applyControllerPowerEdit(profile, { type: 'set-load-unit', unit: 'amps' })

    expect(profile.electricalProfile).toEqual({
      ledPresetId: 'custom',
      supplyBudget: { value: 10, unit: 'watts' },
      voltageOverride: 5,
      loadOverride: {
        fullWhite: { value: 4, unit: 'amps' },
        source: 'measured',
        atPixelCount: 100,
      },
    })
    expect(profile.globalTransforms[1]).toMatchObject({ mode: 'derived', maxDuty: 0.5 })

    profile = applyControllerPowerEdit(profile, { type: 'set-cap-mode', mode: 'direct' })
    profile = applyControllerPowerEdit(profile, { type: 'set-cap-duty', maxDuty: 0.3 })
    profile = applyControllerPowerEdit(profile, { type: 'set-cap-enabled', enabled: false })
    expect(profile.globalTransforms[1]).toMatchObject({
      type: 'power-cap',
      mode: 'direct',
      maxDuty: 0.3,
      enabled: false,
    })

    profile = applyControllerPowerEdit(profile, { type: 'set-cap-mode', mode: 'derived' })
    expect(profile.globalTransforms[1]).toMatchObject({ mode: 'derived', maxDuty: 0.5 })

    profile = {
      ...profile,
      lastKnownPixelCount: 120,
    }
    profile = applyControllerPowerEdit(profile, { type: 'confirm-load-address-count' })
    expect(profile.electricalProfile?.loadOverride?.atPixelCount).toBe(120)
    expect(validateControllerProfile(profile)).toEqual({ ok: true, errors: [] })
    expect(profile.globalTransforms[0]).toEqual(original.globalTransforms[0])
    expect(original).toEqual(profileFixture())
  })
})
