import {
  convertElectricalQuantity,
  type ControllerElectricalProfile,
  LED_CONSTRUCTION_PRESETS,
  resolveControllerElectricalProfile,
} from './controllerElectricalProfile'

function presetProfile(
  presetId: ControllerElectricalProfile['ledPresetId'],
  value: number,
  unit: 'amps' | 'watts',
): ControllerElectricalProfile {
  return {
    ledPresetId: presetId,
    supplyBudget: { value, unit },
  }
}

describe('controller electrical profile', () => {
  it('derives the same duty from equivalent amp and watt budgets', () => {
    const watts = resolveControllerElectricalProfile(
      presetProfile('ws2812-5v-individual', 15, 'watts'),
      { pixelCount: 100 },
    )
    const amps = resolveControllerElectricalProfile(
      presetProfile('ws2812-5v-individual', 3, 'amps'),
      { pixelCount: 100 },
    )

    expect(watts.fullWhiteWatts).toBe(30)
    expect(watts.fullWhiteAmps).toBe(6)
    expect(watts.maxDuty).toBe(0.5)
    expect(amps.maxDuty).toBe(watts.maxDuty)
  })

  it('keeps each construction preset explicit about voltage and load per address', () => {
    expect(LED_CONSTRUCTION_PRESETS.map(({ id, voltageVolts, wattsPerAddress }) => ({
      id,
      voltageVolts,
      wattsPerAddress,
    }))).toEqual([
      { id: 'ws2812-5v-individual', voltageVolts: 5, wattsPerAddress: 0.3 },
      { id: 'ws2811-12v-grouped', voltageVolts: 12, wattsPerAddress: 0.72 },
      { id: 'ws2815-12v-individual', voltageVolts: 12, wattsPerAddress: 0.432 },
    ])
  })

  it('reports both units for the estimated live draw', () => {
    const resolved = resolveControllerElectricalProfile(
      presetProfile('ws2811-12v-grouped', 36, 'watts'),
      { pixelCount: 100, duty: 0.5, brightness: 0.4 },
    )

    expect(resolved.fullWhiteWatts).toBe(72)
    expect(resolved.estimatedDrawWatts).toBeCloseTo(14.4)
    expect(resolved.estimatedDrawAmps).toBeCloseTo(1.2)
    expect(resolved.maxDuty).toBe(0.5)
  })

  it('treats a total-load override as stale when the installation pixel count changes', () => {
    const profile: ControllerElectricalProfile = {
      ledPresetId: 'ws2812-5v-individual',
      supplyBudget: { value: 24, unit: 'watts' },
      loadOverride: {
        fullWhite: { value: 48, unit: 'watts' },
        source: 'measured',
        atPixelCount: 300,
      },
    }

    const current = resolveControllerElectricalProfile(profile, { pixelCount: 300 })
    expect(current.overrideStale).toBe(false)
    expect(current.maxDuty).toBe(0.5)

    const changed = resolveControllerElectricalProfile(profile, { pixelCount: 301 })
    expect(changed.overrideStale).toBe(true)
    expect(changed.maxDuty).toBeNull()
    expect(changed.estimatedDrawWatts).toBeNull()
  })

  it('supports a custom same-unit model without inventing a voltage', () => {
    const amps = resolveControllerElectricalProfile({
      ledPresetId: 'custom',
      supplyBudget: { value: 4, unit: 'amps' },
      loadOverride: {
        fullWhite: { value: 8, unit: 'amps' },
        source: 'custom',
        atPixelCount: 50,
      },
    }, { pixelCount: 50 })

    expect(amps.voltageVolts).toBeNull()
    expect(amps.maxDuty).toBe(0.5)
    expect(amps.fullWhiteWatts).toBeNull()

    const mixedUnits = resolveControllerElectricalProfile({
      ledPresetId: 'custom',
      supplyBudget: { value: 24, unit: 'watts' },
      loadOverride: {
        fullWhite: { value: 4, unit: 'amps' },
        source: 'manufacturer-rated',
        atPixelCount: 50,
      },
    }, { pixelCount: 50 })

    expect(mixedUnits.maxDuty).toBeNull()
  })

  it('waits for a real pixel count instead of assuming one', () => {
    const resolved = resolveControllerElectricalProfile(
      presetProfile('ws2815-12v-individual', 24, 'watts'),
      {},
    )

    expect(resolved.pixelCount).toBeNull()
    expect(resolved.fullWhiteWatts).toBeNull()
    expect(resolved.maxDuty).toBeNull()
  })

  it('converts authored quantities only when voltage makes the units comparable', () => {
    expect(convertElectricalQuantity({ value: 48, unit: 'watts' }, 'amps', 12)).toEqual({
      value: 4,
      unit: 'amps',
    })
    expect(convertElectricalQuantity({ value: 4, unit: 'amps' }, 'watts', null)).toBeNull()
    expect(convertElectricalQuantity({ value: 4, unit: 'amps' }, 'amps', null)).toEqual({
      value: 4,
      unit: 'amps',
    })
  })
})
