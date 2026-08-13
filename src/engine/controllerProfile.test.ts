import {
  controllerProfileDisplayName,
  controllerZonePixelCount,
  controllerProfileRecordIssues,
  controllerProfileValidationErrors,
  normalizeControllerInputs,
  validateControllerProfile,
  type ControllerProfile,
} from './controllerProfile'

const baseProfile: ControllerProfile = {
  id: 'ctrl-1',
  name: 'Burner bag',
  deviceId: 'pixelblaze_pb32_3cd4ee549434',
  board: {
    kind: 'pixelblaze-v3-standard',
    hardwareRevision: 3.5,
    firmwareVersion: '3.67',
  },
  inputs: [
    {
      id: 'pot0',
      name: 'Brightness pot',
      pin: 33,
      signal: 'analog',
      smoothing: 0.2,
      fallback: 0.5,
      invert: false,
    },
    {
      id: 'btn0',
      name: 'Next button',
      pin: 25,
      signal: 'digital',
      smoothing: 0,
      fallback: 0,
      invert: false,
    },
  ],
  globalTransforms: [
    {
      id: 'brightness',
      type: 'hardware-brightness',
      enabled: true,
      mixinId: 'builtin:hardware-brightness',
      inputId: 'pot0',
      mode: 'multiply-output',
    },
    {
      id: 'power',
      type: 'power-cap',
      enabled: false,
      mixinId: 'builtin:power-cap',
      mode: 'derived',
      maxDuty: 0.23,
      milliampsPerPixel: 60,
      provenance: {
        targetAmps: 3.5,
        brightness: 1,
      },
    },
  ],
  patternBindings: [
    {
      id: 'p1-pot0-speed',
      patternId: 'pattern-1',
      inputId: 'pot0',
      target: {
        kind: 'call-exported-slider',
        name: 'sliderSpeed',
      },
    },
    {
      id: 'p1-pot0-plain',
      patternId: 'pattern-1',
      inputId: 'pot0',
      target: {
        kind: 'assign-variable',
        name: 'speed',
        min: 0,
        max: 1,
        quantize: 0.05,
      },
    },
  ],
  updatedAt: 100,
}

describe('ControllerProfile display name', () => {
  it('shows an authored profile rename instead of the last observed device name (#808)', () => {
    expect(controllerProfileDisplayName({
      ...baseProfile,
      name: 'Road case',
      lastKnownDeviceName: 'Pixelblaze shelf',
    })).toBe('Road case')
  })
})

describe('ControllerProfile validation', () => {
  it('accepts a durable controller profile with inputs, transforms, and bindings', () => {
    expect(validateControllerProfile(baseProfile)).toEqual({ ok: true, errors: [] })
  })

  it('rejects hardware brightness assigned to a digital input (#772)', () => {
    const profile: ControllerProfile = {
      ...baseProfile,
      globalTransforms: baseProfile.globalTransforms.map((transform) => (
        transform.type === 'hardware-brightness' ? { ...transform, inputId: 'btn0' } : transform
      )),
      patternBindings: [],
    }

    const result = validateControllerProfile(profile)

    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual({
      path: 'inputs.btn0.signal',
      // Coherent and storable, so it must not block the write that repairs it.
      kind: 'configuration',
      message:
        'Input "btn0" drives hardware brightness, which needs an analog signal. A digital input emits nothing.',
    })
    expect(controllerProfileRecordIssues(result)).toEqual([])
  })

  it('ignores the signal of an input that hardware brightness does not use (#772)', () => {
    const profile: ControllerProfile = { ...baseProfile, patternBindings: [] }

    expect(validateControllerProfile(profile)).toEqual({ ok: true, errors: [] })
  })

  it('does not flag a digital input while hardware brightness is disabled (#772)', () => {
    const profile: ControllerProfile = {
      ...baseProfile,
      globalTransforms: baseProfile.globalTransforms.map((transform) => (
        transform.type === 'hardware-brightness'
          ? { ...transform, enabled: false, inputId: 'btn0' }
          : transform
      )),
      patternBindings: [],
    }

    expect(validateControllerProfile(profile)).toEqual({ ok: true, errors: [] })
  })

  it('rejects a duty cap outside the normalized 0..1 range', () => {
    const profile: ControllerProfile = {
      ...baseProfile,
      globalTransforms: baseProfile.globalTransforms.map((transform) => (
        transform.type === 'power-cap' ? { ...transform, maxDuty: 1.2 } : transform
      )),
    }

    expect(controllerProfileValidationErrors(validateControllerProfile(profile))).toContain(
      'Global transform "power" maxDuty must be between 0 and 1.',
    )
  })

  it('validates electrical settings and optional calculator provenance in their real units', () => {
    const profile: ControllerProfile = {
      ...baseProfile,
      globalTransforms: baseProfile.globalTransforms.map((transform) => (
        transform.type === 'power-cap'
          ? {
              ...transform,
              milliampsPerPixel: 0,
              provenance: { targetAmps: -1, brightness: 1.2 },
            }
          : transform
      )),
    }

    expect(controllerProfileValidationErrors(validateControllerProfile(profile))).toEqual([
      'Global transform "power" targetAmps must be zero or greater.',
      'Global transform "power" brightness must be between 0 and 1.',
      'Global transform "power" milliampsPerPixel must be greater than 0.',
    ])
  })

  it('validates the installation electrical model independently of the power cap', () => {
    const profile: ControllerProfile = {
      ...baseProfile,
      electricalProfile: {
        ledPresetId: 'custom',
        supplyBudget: { value: -1, unit: 'watts' },
        voltageOverride: 0,
        loadOverride: {
          fullWhite: { value: 4, unit: 'amps' },
          source: 'measured',
          atPixelCount: 0,
        },
      },
    }

    expect(controllerProfileValidationErrors(validateControllerProfile(profile))).toEqual([
      'Power supply budget must be greater than 0.',
      'Power voltage override must be greater than 0.',
      'Power load override address count must be a positive whole number.',
    ])
  })

  it('sums a Show-side zone pixel count across discontiguous ranges (#775)', () => {
    expect(controllerZonePixelCount({
      id: 'top-band',
      name: 'Top band',
      ranges: [
        { start: 0, end: 3 },
        { start: 28, end: 31 },
      ],
    })).toBe(8)
  })

  it('drops the retired role annotation when reading stored inputs (#772)', () => {
    const stored: Array<ControllerProfile['inputs'][number] & { role?: string }> = [
      {
        id: 'pot0',
        name: 'Brightness pot',
        pin: 33,
        signal: 'analog',
        role: 'brightness',
        smoothing: 0.2,
        fallback: 0.5,
        invert: false,
      },
      {
        id: 'btn0',
        name: 'Next button',
        pin: 25,
        signal: 'digital',
        role: 'next-pattern',
        smoothing: 0,
        fallback: 0,
        invert: true,
      },
    ]

    const normalized = normalizeControllerInputs(stored)

    expect(normalized).toEqual([
      { id: 'pot0', name: 'Brightness pot', pin: 33, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false },
      { id: 'btn0', name: 'Next button', pin: 25, signal: 'digital', smoothing: 0, fallback: 0, invert: true },
    ])
    for (const input of normalized) expect(input).not.toHaveProperty('role')
    expect(stored[0]).toHaveProperty('role')
  })

  it('keeps well-formed inputs referentially stable so reads do not churn state (#772)', () => {
    expect(normalizeControllerInputs(baseProfile.inputs)).toBe(baseProfile.inputs)
  })

  it('rejects analog bindings on digital-only through-hole pins with a human-readable board error', () => {
    const profile: ControllerProfile = {
      ...baseProfile,
      inputs: [{ ...baseProfile.inputs[0], pin: 25 }],
    }

    const result = validateControllerProfile(profile)

    expect(result.ok).toBe(false)
    expect(controllerProfileValidationErrors(result)).toContain(
      'Input "pot0" uses IO25 for analog input, but pixelblaze-v3-standard analog inputs are IO33, IO34, IO35, IO36, IO39.',
    )
  })

  it('limits pre-3.5 v3 standard analog profiles to IO33', () => {
    const profile: ControllerProfile = {
      ...baseProfile,
      board: { kind: 'pixelblaze-v3-standard', hardwareRevision: 3.4 },
      inputs: [{ ...baseProfile.inputs[0], pin: 34 }],
    }

    const result = validateControllerProfile(profile)

    expect(result.ok).toBe(false)
    expect(controllerProfileValidationErrors(result)).toContain(
      'Input "pot0" uses IO34 for analog input, but pixelblaze-v3-standard analog inputs are IO33.',
    )
  })

  it('reports invalid references instead of silently dropping transforms or bindings', () => {
    const profile: ControllerProfile = {
      ...baseProfile,
      globalTransforms: [
        {
          id: 'brightness',
          type: 'hardware-brightness',
          enabled: true,
          mixinId: 'builtin:hardware-brightness',
          inputId: 'missing-input',
          mode: 'multiply-output',
        },
      ],
      patternBindings: [{ ...baseProfile.patternBindings[0], inputId: 'other-missing-input' }],
    }

    const result = validateControllerProfile(profile)

    expect(controllerProfileValidationErrors(result)).toEqual([
      'Global transform "brightness" references missing input "missing-input".',
      'Pattern binding "p1-pot0-speed" references missing input "other-missing-input".',
    ])
  })

  it('reports duplicate ids and numeric ranges that would make generated code ambiguous', () => {
    const profile: ControllerProfile = {
      ...baseProfile,
      inputs: [
        { ...baseProfile.inputs[0], smoothing: 1.5 },
        { ...baseProfile.inputs[1], id: 'pot0' },
      ],
      patternBindings: [
        {
          ...baseProfile.patternBindings[1],
          target: { kind: 'assign-variable', name: 'speed', min: 1, max: 0 },
        },
      ],
    }

    const result = validateControllerProfile(profile)

    expect(controllerProfileValidationErrors(result)).toEqual([
      'Input id "pot0" is duplicated.',
      'Input "pot0" smoothing must be between 0 and 1.',
      'Pattern binding "p1-pot0-plain" assignment min must be less than max.',
    ])
  })
})
