import { describe, expect, it } from 'vitest'
import {
  controllerPatternPushStates,
  controllerUseDetailText,
  describeControllerInputUses,
  type ControllerInputUse,
} from './controllerInputUses'
import { controllerProfileArtifactSignature } from './controllerProfilePassRecipe'
import type { ControllerProfile, GlobalTransform } from './controllerProfile'

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

  it('attaches the per-Pattern push state supplied by the caller', () => {
    const profile = profileWith({
      patternBindings: [
        { id: 'b1', patternId: 'p', inputId: 'pot0', target: { kind: 'call-function', name: 'burst' } },
      ],
    })

    const view = describeControllerInputUses(profile, {
      patternNames: { p: 'Line Dancer' },
      patternPushStates: { p: 'stale' },
    })

    expect(view.inputs[0].uses[1]).toMatchObject({ push: 'stale' })
  })

  it('reports no push state when the caller supplies none', () => {
    const profile = profileWith({
      patternBindings: [
        { id: 'b1', patternId: 'p', inputId: 'pot0', target: { kind: 'call-function', name: 'burst' } },
      ],
    })

    const view = describeControllerInputUses(profile)

    expect(view.inputs[0].uses[1]).toMatchObject({ push: null })
  })
})

describe('controllerPatternPushStates', () => {
  const profile = profileWith({
    patternBindings: [
      { id: 'b1', patternId: 'p', inputId: 'pot0', target: { kind: 'call-function', name: 'burst' } },
    ],
  })

  it('says nothing at all while the Controller is offline', () => {
    expect(controllerPatternPushStates({
      profile,
      patternIds: ['p'],
      pushRecords: { p: { transforms: [], artifactHash: 'h', stampedAt: 's', name: 'p' } },
      mapDim: null,
      live: false,
    })).toEqual({})
  })

  it('calls a Pattern current when its record matches the live artifact signature', () => {
    const signature = signatureFor('p', 2)

    expect(controllerPatternPushStates({
      profile,
      patternIds: ['p'],
      pushRecords: {
        p: { transforms: [], artifactHash: 'h', stampedAt: 's', name: 'p', profileSignature: signature },
      },
      mapDim: 2,
      live: true,
    })).toEqual({ p: 'current' })
  })

  it('calls a Pattern stale when the profile changed since its record', () => {
    expect(controllerPatternPushStates({
      profile,
      patternIds: ['p'],
      pushRecords: {
        p: { transforms: [], artifactHash: 'h', stampedAt: 's', name: 'p', profileSignature: 'older' },
      },
      mapDim: 2,
      live: true,
    })).toEqual({ p: 'stale' })
  })

  it('treats a legacy record without a signature as stale', () => {
    expect(controllerPatternPushStates({
      profile,
      patternIds: ['p'],
      pushRecords: { p: { transforms: [], artifactHash: 'h', stampedAt: 's', name: 'p' } },
      mapDim: 2,
      live: true,
    })).toEqual({ p: 'stale' })
  })

  it('reads an orphaned or missing record as not pushed rather than stale', () => {
    expect(controllerPatternPushStates({
      profile,
      patternIds: ['p'],
      pushRecords: null,
      mapDim: 2,
      live: true,
    })).toEqual({ p: 'not-pushed' })
  })

  it('separates the map dimension the signature was taken at', () => {
    const signature = signatureFor('p', 2)

    expect(controllerPatternPushStates({
      profile,
      patternIds: ['p'],
      pushRecords: {
        p: { transforms: [], artifactHash: 'h', stampedAt: 's', name: 'p', profileSignature: signature },
      },
      mapDim: 3,
      live: true,
    })).toEqual({ p: 'stale' })
  })

  // The shipped signature is the oracle for "same generated code"; restating its
  // JSON shape in the test would only duplicate the implementation.
  function signatureFor(patternId: string, mapDim: 1 | 2 | 3): string {
    return controllerProfileArtifactSignature(profile, patternId, { mapDim })
  }
})
