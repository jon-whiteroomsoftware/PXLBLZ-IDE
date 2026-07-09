import {
  controllerZonePixelCount,
  controllerProfileValidationErrors,
  formatControllerZoneRanges,
  normalizeControllerZone,
  parseControllerZoneRanges,
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
      provenance: {
        targetAmps: 3.5,
        brightness: 1,
        milliampsPerPixel: 60,
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
  zones: [
    { id: 'arch-left', name: 'Arch left', ranges: [{ start: 0, end: 239 }] },
    {
      id: 'top-band',
      name: 'Top band',
      ranges: [
        { start: 0, end: 3 },
        { start: 28, end: 31 },
      ],
    },
  ],
  updatedAt: 100,
}

describe('ControllerProfile validation', () => {
  it('accepts a durable controller profile with inputs, transforms, bindings, and zones', () => {
    expect(validateControllerProfile(baseProfile)).toEqual({ ok: true, errors: [] })
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

  it('validates optional electrical provenance in its real units', () => {
    const profile: ControllerProfile = {
      ...baseProfile,
      globalTransforms: baseProfile.globalTransforms.map((transform) => (
        transform.type === 'power-cap'
          ? {
              ...transform,
              provenance: { targetAmps: -1, brightness: 1.2, milliampsPerPixel: 0 },
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

  it('parses and formats named zones as lists of pixel-index ranges', () => {
    const parsed = parseControllerZoneRanges('0-3, 28-31 · 64')

    expect(parsed).toEqual({
      ok: true,
      ranges: [
        { start: 0, end: 3 },
        { start: 28, end: 31 },
        { start: 64, end: 64 },
      ],
    })
    expect(formatControllerZoneRanges({
      id: 'top-band',
      name: 'Top band',
      ranges: parsed.ok ? parsed.ranges : [],
    })).toBe('0-3, 28-31, 64')
    expect(controllerZonePixelCount(baseProfile.zones[1])).toBe(8)
  })

  it('normalizes legacy single-range zones from existing stored profiles', () => {
    expect(normalizeControllerZone({
      id: 'legacy',
      name: 'Legacy',
      start: 10,
      end: 12,
    })).toEqual({
      id: 'legacy',
      name: 'Legacy',
      ranges: [{ start: 10, end: 12 }],
    })
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
      zones: [
        { id: 'bad-zone', name: 'Bad zone', ranges: [{ start: 10, end: 5 }] },
        { id: 'dup-zone', name: 'Bad zone', ranges: [] },
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
      'Zone name "Bad zone" is duplicated.',
      'Zone "Bad zone" range 1 start must be less than or equal to end.',
      'Zone "Bad zone" needs at least one pixel range.',
    ])
  })
})
