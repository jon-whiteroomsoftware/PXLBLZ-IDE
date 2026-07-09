import {
  deriveDutyLimit,
  derivedPowerCapSettings,
  directPowerCapSettings,
  estimatePowerCapAmps,
  powerCapElectricalInputs,
} from './powerCap'

describe('power cap duty calculator', () => {
  it('derives a clamped duty limit from the electrical budget', () => {
    expect(deriveDutyLimit({
      targetAmps: 3,
      brightness: 0.5,
      pixelCount: 240,
      milliampsPerPixel: 60,
    })).toBeCloseTo(3 / 7.2)

    expect(deriveDutyLimit({
      targetAmps: 20,
      brightness: 1,
      pixelCount: 100,
      milliampsPerPixel: 60,
    })).toBe(1)
  })

  it('detaches a direct duty edit without discarding electrical provenance', () => {
    const derived = derivedPowerCapSettings({
      targetAmps: 3,
      brightness: 0.5,
      pixelCount: 240,
      milliampsPerPixel: 60,
    })

    expect(directPowerCapSettings(derived, 0.35)).toEqual({
      mode: 'direct',
      maxDuty: 0.35,
      provenance: {
        targetAmps: 3,
        brightness: 0.5,
        milliampsPerPixel: 60,
      },
    })
  })

  it('recomputes the amps equivalence from the current pixel count without changing duty', () => {
    const settings = directPowerCapSettings(derivedPowerCapSettings({
      targetAmps: 3,
      brightness: 0.5,
      pixelCount: 240,
      milliampsPerPixel: 60,
    }), 0.35)

    expect(estimatePowerCapAmps(settings, 240)).toBeCloseTo(2.52)
    expect(estimatePowerCapAmps(settings, 480)).toBeCloseTo(5.04)
    expect(settings.maxDuty).toBe(0.35)
  })

  it('prefills missing brightness from the live device without replacing stored provenance', () => {
    expect(powerCapElectricalInputs({ mode: 'direct', maxDuty: 0.35 }, 240, 0.5)).toEqual({
      targetAmps: 2.52,
      brightness: 0.5,
      pixelCount: 240,
      milliampsPerPixel: 60,
    })

    expect(powerCapElectricalInputs({
      mode: 'direct',
      maxDuty: 0.35,
      provenance: { targetAmps: 2, brightness: 0.4, milliampsPerPixel: 50 },
    }, 240, 0.8).brightness).toBe(0.4)
  })
})
