import { describe, expect, it } from 'vitest'
import {
  controllerUseDetailText,
  describeControllerInputUses,
  type ControllerInputCorrection,
  type ControllerInputUse,
} from './controllerInputUses'
import {
  controllerProfileRecordIssues,
  validateControllerProfile,
  type ControllerProfile,
  type GlobalTransform,
} from './controllerProfile'

function brightnessTransform(changes: Partial<{ enabled: boolean; inputId: string }> = {}): GlobalTransform {
  return {
    id: 'hardware-brightness',
    type: 'hardware-brightness',
    enabled: changes.enabled ?? true,
    mixinId: 'builtin:hardware-brightness',
    inputId: changes.inputId ?? 'pot0',
    mode: 'multiply-output',
  }
}

const powerCap: GlobalTransform = {
  id: 'power-cap',
  type: 'power-cap',
  enabled: false,
  mixinId: 'builtin:power-cap',
  mode: 'direct',
  maxDuty: 0.25,
}

function profileWith(changes: Partial<ControllerProfile> = {}): ControllerProfile {
  return {
    id: 'ctrl-1',
    name: 'Burner bag',
    board: { kind: 'pixelblaze-v3-standard', hardwareRevision: 3.5 },
    inputs: [
      { id: 'pot0', name: 'Front pot', pin: 33, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: true },
    ],
    globalTransforms: [brightnessTransform(), powerCap],
    patternBindings: [],
    zones: [],
    updatedAt: 1,
    ...changes,
  }
}

function useKinds(uses: ControllerInputUse[]): string[] {
  return uses.map((use) => use.kind)
}

function issueKey(issue: { path: string; message: string }): string {
  return `${issue.path}: ${issue.message}`
}

/** Apply an offered correction exactly as the input card does. */
function applyCorrection(
  profile: ControllerProfile,
  inputId: string,
  correction: ControllerInputCorrection,
): ControllerProfile {
  return {
    ...profile,
    inputs: profile.inputs.map((input) => (
      input.id === inputId ? { ...input, ...correction.change } : input
    )),
  }
}

describe('describeControllerInputUses', () => {
  it('describes the physical definition of every input without mutating the profile', () => {
    const profile = profileWith()
    const before = structuredClone(profile)

    const view = describeControllerInputUses(profile)

    expect(view.inputs).toHaveLength(1)
    expect(view.inputs[0]).toMatchObject({
      inputId: 'pot0',
      pin: 'IO33',
      physical: ['analog', 'smooth 20%', 'fallback 50%', '1 -> 0'],
      state: 'live',
    })
    expect(profile).toEqual(before)
  })

  it('reports an enabled brightness transform as a use of the input it names', () => {
    const view = describeControllerInputUses(profileWith())

    expect(useKinds(view.inputs[0].uses)).toEqual(['brightness'])
    expect(view.inputs[0].uses[0]).toMatchObject({
      kind: 'brightness',
      label: 'Brightness',
      scope: 'every Pattern',
      state: 'live',
    })
    expect(view.inputs[0].brightnessAssigned).toBe(true)
  })

  it('states the Pattern exception in the brightness scope instead of repeating it', () => {
    const profile = profileWith({
      patternBindings: [
        {
          id: 'b1',
          patternId: 'pat-caustics',
          inputId: 'pot0',
          target: { kind: 'call-exported-slider', name: 'sliderSpeed' },
        },
      ],
    })

    const view = describeControllerInputUses(profile, {
      patternNames: { 'pat-caustics': 'Caustics' },
    })
    const [brightness, pattern] = view.inputs[0].uses

    expect(brightness).toMatchObject({ kind: 'brightness', scope: 'every Pattern except Caustics' })
    expect(pattern).toMatchObject({
      kind: 'pattern',
      bindingId: 'b1',
      patternId: 'pat-caustics',
      label: 'Caustics',
      overridesBrightness: true,
    })
    expect(pattern.kind === 'pattern' && controllerUseDetailText(pattern.detail)).toBe(
      'drives exported slider sliderSpeed',
    )
  })

  it('lists every excepting Pattern in the brightness scope', () => {
    const profile = profileWith({
      patternBindings: [
        { id: 'b1', patternId: 'a', inputId: 'pot0', target: { kind: 'call-function', name: 'burst' } },
        { id: 'b2', patternId: 'b', inputId: 'pot0', target: { kind: 'call-function', name: 'burst' } },
        { id: 'b3', patternId: 'c', inputId: 'pot0', target: { kind: 'call-function', name: 'burst' } },
      ],
    })

    const view = describeControllerInputUses(profile, {
      patternNames: { a: 'Aurora', b: 'Blaze', c: 'Caustics' },
    })

    expect(view.inputs[0].uses[0]).toMatchObject({
      scope: 'every Pattern except Aurora, Blaze, and Caustics',
    })
  })

  it('describes each binding target kind in the language of the Pattern', () => {
    const profile = profileWith({
      globalTransforms: [brightnessTransform({ enabled: false, inputId: '' }), powerCap],
      patternBindings: [
        { id: 'b1', patternId: 'p', inputId: 'pot0', target: { kind: 'call-function', name: 'triggerBurst' } },
        {
          id: 'b2',
          patternId: 'p',
          inputId: 'pot0',
          target: { kind: 'assign-variable', name: 'speed', min: 0, max: 4 },
        },
        {
          id: 'b3',
          patternId: 'p',
          inputId: 'pot0',
          target: { kind: 'assign-variable', name: 'steps', min: 0, max: 8, quantize: 1 },
        },
      ],
    })

    const view = describeControllerInputUses(profile, { patternNames: { p: 'Line Dancer' } })
    const details = view.inputs[0].uses
      .filter((use) => use.kind === 'pattern')
      .map((use) => controllerUseDetailText(use.detail))

    expect(details).toEqual([
      'calls triggerBurst()',
      'assigns speed over 0 to 4',
      'assigns steps over 0 to 8 in steps of 1',
    ])
  })

  it('gives an unused input an explicit state rather than silence', () => {
    const profile = profileWith({
      globalTransforms: [brightnessTransform({ enabled: false, inputId: '' }), powerCap],
    })

    const view = describeControllerInputUses(profile)

    expect(view.inputs[0].uses).toEqual([
      { kind: 'none', label: 'Nothing yet', detail: 'no Pattern reads it yet' },
    ])
    expect(view.inputs[0].state).toBe('idle')
    expect(view.inputs[0].brightnessAssigned).toBe(false)
  })

  it('leaves an input untouched when brightness names a different input', () => {
    const profile = profileWith({
      inputs: [
        ...profileWith().inputs,
        { id: 'pot1', name: 'Spare pot', pin: 34, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false },
      ],
    })

    const view = describeControllerInputUses(profile)

    expect(view.inputs.map((input) => input.brightnessAssigned)).toEqual([true, false])
    expect(useKinds(view.inputs[1].uses)).toEqual(['none'])
  })

  it('marks brightness on a digital input as blocked and offers the correction on that input', () => {
    const profile = profileWith({
      inputs: [
        { id: 'pot0', name: 'Panel button', pin: 33, signal: 'digital', smoothing: 0, fallback: 0, invert: false },
      ],
    })

    const view = describeControllerInputUses(profile)
    const [input] = view.inputs

    expect(input.state).toBe('error')
    expect(input.uses[0]).toMatchObject({ kind: 'brightness', state: 'blocked' })
    expect(input.issues).toEqual([
      {
        path: 'inputs.pot0.signal',
        // Storable: the user has to be able to save this state to reach and fix it.
        kind: 'configuration',
        message:
          'Input "pot0" drives hardware brightness, which needs an analog signal. A digital input emits nothing.',
        correction: { label: 'Switch this input to analog', change: { signal: 'analog' } },
      },
    ])
    expect(view.profileIssues).toEqual([])
  })

  it('offers a free analog pin when an analog input sits on a pin the board cannot read', () => {
    const profile = profileWith({
      inputs: [
        { id: 'pot0', name: 'Front pot', pin: 33, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false },
        { id: 'pot1', name: 'Rear pot', pin: 25, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false },
      ],
    })

    const view = describeControllerInputUses(profile)

    expect(view.inputs[1].issues).toEqual([
      {
        path: 'inputs.pot1.pin',
        message:
          'Input "pot1" uses IO25 for analog input, but pixelblaze-v3-standard analog inputs are IO33, IO34, IO35, IO36, IO39.',
        correction: { label: 'Move to IO34', change: { pin: 34 } },
      },
    ])
    expect(view.inputs[1].state).toBe('error')
  })

  it('moves the input to an analog pin when analog alone would not repair it', () => {
    // IO25 cannot be read as analog on any v3 board, so switching the signal
    // without also moving the pin trades one error for another and the write is
    // rejected outright (#772).
    const profile = profileWith({
      inputs: [
        { id: 'pot0', name: 'Panel button', pin: 25, signal: 'digital', smoothing: 0, fallback: 0, invert: false },
      ],
    })

    const [input] = describeControllerInputUses(profile).inputs

    expect(input.issues[0].correction).toEqual({
      label: 'Switch to analog on IO33',
      change: { signal: 'analog', pin: 33 },
    })
  })

  it('offers no one-click repair when the board has no analog pin left to take', () => {
    const profile = profileWith({
      board: { kind: 'pixelblaze-v3-standard', hardwareRevision: 3.4 },
      inputs: [
        { id: 'pot0', name: 'Panel button', pin: 25, signal: 'digital', smoothing: 0, fallback: 0, invert: false },
        { id: 'pot1', name: 'Front pot', pin: 33, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false },
      ],
    })

    const [button] = describeControllerInputUses(profile).inputs

    // Pre-3.5 boards read only IO33, and the other input already holds it.
    expect(button.issues[0]).toMatchObject({ path: 'inputs.pot0.signal', correction: null })
    expect(button.issues[0].message).toContain('needs an analog signal')
  })

  it('never offers a correction that leaves the profile unwritable', () => {
    const brokenProfiles = [
      // Brightness on a digital input that is also on a pin the board cannot read.
      profileWith({
        inputs: [
          { id: 'pot0', name: 'Panel button', pin: 25, signal: 'digital', smoothing: 0, fallback: 0, invert: false },
        ],
      }),
      // Brightness on a digital input whose pin is already analog-capable.
      profileWith({
        inputs: [
          { id: 'pot0', name: 'Panel button', pin: 33, signal: 'digital', smoothing: 0, fallback: 0, invert: false },
        ],
      }),
      // An analog input on a pin the board cannot read.
      profileWith({
        globalTransforms: [brightnessTransform({ enabled: false, inputId: '' }), powerCap],
        inputs: [
          { id: 'pot0', name: 'Rear pot', pin: 26, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false },
        ],
      }),
      // Both at once, on a board with a single analog pin.
      profileWith({
        board: { kind: 'pixelblaze-v3-standard', hardwareRevision: 3.4 },
        inputs: [
          { id: 'pot0', name: 'Panel button', pin: 25, signal: 'digital', smoothing: 0, fallback: 0, invert: false },
          { id: 'pot1', name: 'Rear pot', pin: 34, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false },
        ],
      }),
    ]

    for (const profile of brokenProfiles) {
      const before = new Set(validateControllerProfile(profile).errors.map(issueKey))
      for (const input of describeControllerInputUses(profile).inputs) {
        for (const issue of input.issues) {
          if (!issue.correction) continue
          const after = validateControllerProfile(
            applyCorrection(profile, input.inputId, issue.correction),
          )
          // The persistence gate blocks record issues, so a correction that
          // introduces one is a repair the user can never apply: it is written
          // optimistically, refused, and rolled back to where it started.
          expect(controllerProfileRecordIssues(after)
            .map(issueKey)
            .filter((key) => !before.has(key))).toEqual([])
          // And it has to actually clear what it was offered against.
          expect(after.errors.map((error) => error.path)).not.toContain(issue.path)
        }
      }
    }
  })

  it('keeps profile-level errors out of the input cards', () => {
    const profile = profileWith({
      globalTransforms: [brightnessTransform({ inputId: 'ghost' }), powerCap],
    })

    const view = describeControllerInputUses(profile)

    expect(view.inputs[0].issues).toEqual([])
    expect(view.profileIssues.map((issue) => issue.message)).toEqual([
      'Global transform "hardware-brightness" references missing input "ghost".',
    ])
  })

  it('falls back to the stored Pattern id when no name is known', () => {
    const profile = profileWith({
      patternBindings: [
        { id: 'b1', patternId: 'pat-gone', inputId: 'pot0', target: { kind: 'call-function', name: 'burst' } },
      ],
    })

    const view = describeControllerInputUses(profile)

    expect(view.inputs[0].uses[1]).toMatchObject({ label: 'pat-gone', patternUnknown: true })
    expect(view.inputs[0].uses[0]).toMatchObject({ scope: 'every Pattern except pat-gone' })
  })
})
