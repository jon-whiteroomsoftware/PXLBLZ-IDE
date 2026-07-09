import { defaultControllerProfile } from '@/store/controllerProfileStore'
import {
  controllerProfilePassRecipe,
  findProfileForLiveController,
} from './controllerProfilePassRecipe'
import type { ControllerProfile } from './controllerProfile'

describe('controller profile pass recipe', () => {
  it('matches a live controller by stable device id before last-seen IP', () => {
    const byIp = defaultControllerProfile({ id: 'ip', ip: '10.0.0.5' })
    const byDevice = defaultControllerProfile({
      id: 'device',
      deviceId: 'pixelblaze_pb32_known',
      ip: '10.0.0.9',
    })

    expect(findProfileForLiveController([byIp, byDevice], {
      ip: '10.0.0.5',
      deviceId: 'pixelblaze_pb32_known',
    })?.id).toBe('device')
  })

  it('returns no passes without enabled global transforms', () => {
    const profile = defaultControllerProfile({ id: 'ctrl-1' })

    expect(controllerProfilePassRecipe(profile, 'export function render(i){}')).toEqual([])
  })

  it('builds a power-cap recipe for an enabled cap transform', () => {
    const profile = {
      ...defaultControllerProfile({ id: 'ctrl-1', now: 1 }),
      lastKnownPixelCount: 100,
      globalTransforms: [
        {
          id: 'power-cap',
          type: 'power-cap' as const,
          enabled: true,
          mixinId: 'builtin:power-cap',
          maxMilliamps: 2500,
        },
      ],
    }

    const recipe = controllerProfilePassRecipe(profile, 'export function render(i) { hsv(i, 1, 1) }')

    expect(recipe).toEqual([
      expect.objectContaining({
        id: 'power-cap',
        kind: 'intercept',
        target: 'hsv',
        wrapperName: 'cappedHsv',
        params: {
          MAX_MILLIAMPS: 2500,
          FULL_WHITE_MILLIAMPS: 6000,
        },
      }),
    ])
  })

  it('builds a frame-sampled hardware brightness recipe for an enabled analog input', () => {
    const profile = hardwareBrightnessProfile()

    const recipe = controllerProfilePassRecipe(profile, 'export function render(i) { hsv(i, 1, 1) }')

    expect(recipe).toHaveLength(2)
    expect(recipe[0]).toMatchObject({
      id: 'hardware-brightness-sample',
      kind: 'inject',
      params: { PIN: 33, SMOOTHING: 0.2, FALLBACK: 0.4, INVERT: false },
    })
    expect(recipe[0]).toHaveProperty('source', expect.stringContaining('analogRead(PIN)'))
    expect(recipe[1]).toMatchObject({
      id: 'hardware-brightness',
      kind: 'intercept',
      target: 'hsv',
      wrapperName: 'hardwareBrightness',
      params: { BRIGHTNESS: 'hardwareBrightnessValue' },
    })
  })

  it('avoids colliding with pattern identifiers when naming the sampled brightness global', () => {
    const profile = hardwareBrightnessProfile()

    const recipe = controllerProfilePassRecipe(
      profile,
      'var hardwareBrightnessValue = 1\nexport function render(i) { hsv(i, 1, 1) }',
    )

    expect(recipe[1]).toMatchObject({
      params: { BRIGHTNESS: 'hardwareBrightnessValue2' },
    })
  })

  it('builds frame-sampled pattern binding passes only for the active pattern', () => {
    const profile = patternBindingProfile()

    const recipe = controllerProfilePassRecipe(
      profile,
      'export function sliderSpeed(v) { speed = v }\nexport function render(i) {}',
      'pat-1',
    )

    expect(recipe).toHaveLength(2)
    expect(recipe[0]).toMatchObject({
      id: 'speed-binding-sample',
      kind: 'inject',
      params: { PIN: 33, SMOOTHING: 0.25, FALLBACK: 0.5, INVERT: true },
    })
    expect(recipe[0]).toHaveProperty('source', expect.stringContaining('analogRead(PIN)'))
    expect(recipe[0]).toHaveProperty('source', expect.stringContaining('if (INVERT) raw = 1 - raw'))
    expect(recipe[1]).toMatchObject({
      id: 'speed-binding-drive',
      kind: 'bind',
      target: 'sliderSpeed',
      value: 'speedPotValue',
      mode: 'function-call',
    })
  })

  it('maps explicit function targets to function-call bind passes', () => {
    const profile = {
      ...patternBindingProfile(),
      patternBindings: [
        {
          id: 'pulse-binding',
          patternId: 'pat-1',
          inputId: 'speed-pot',
          target: { kind: 'call-function' as const, name: 'setPulse' },
        },
      ],
    }

    const recipe = controllerProfilePassRecipe(profile, 'export function render(i) {}', 'pat-1')

    expect(recipe[1]).toMatchObject({
      id: 'pulse-binding-drive',
      kind: 'bind',
      target: 'setPulse',
      value: 'speedPotValue',
      mode: 'function-call',
    })
  })

  it('maps variable bindings to scaled assignment bind passes', () => {
    const profile = {
      ...patternBindingProfile(),
      patternBindings: [
        {
          id: 'brightness-binding',
          patternId: 'pat-1',
          inputId: 'speed-pot',
          target: {
            kind: 'assign-variable' as const,
            name: 'brightness',
            min: 0.2,
            max: 0.8,
            quantize: 0.1,
          },
        },
      ],
    }

    const recipe = controllerProfilePassRecipe(profile, 'export var brightness = 1', 'pat-1')

    expect(recipe[1]).toMatchObject({
      id: 'brightness-binding-drive',
      kind: 'bind',
      target: 'brightness',
      value: 'speedPotValue',
      min: 0.2,
      max: 0.8,
      quantize: 0.1,
      mode: 'variable-assignment',
    })
  })

  it('does not emit pattern binding passes without an active pattern match', () => {
    const profile = patternBindingProfile()

    expect(controllerProfilePassRecipe(profile, 'export function render(i) {}')).toEqual([])
    expect(controllerProfilePassRecipe(profile, 'export function render(i) {}', 'pat-2')).toEqual([])
  })
})

function hardwareBrightnessProfile(): ControllerProfile {
  return {
    ...defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_known',
      now: 1,
    }),
    inputs: [
      {
        id: 'brightness-pot',
        name: 'Brightness pot',
        pin: 33,
        signal: 'analog',
        role: 'brightness',
        smoothing: 0.2,
        fallback: 0.4,
        invert: false,
      },
    ],
    globalTransforms: [
      {
        id: 'hardware-brightness',
        type: 'hardware-brightness',
        enabled: true,
        mixinId: 'builtin:hardware-brightness',
        inputId: 'brightness-pot',
        mode: 'multiply-output',
      },
    ],
  }
}

function patternBindingProfile(): ControllerProfile {
  return {
    ...defaultControllerProfile({
      id: 'ctrl-1',
      deviceId: 'pixelblaze_pb32_known',
      now: 1,
    }),
    inputs: [
      {
        id: 'speed-pot',
        name: 'Speed pot',
        pin: 33,
        signal: 'analog',
        role: 'assignable',
        smoothing: 0.25,
        fallback: 0.5,
        invert: true,
      },
    ],
    patternBindings: [
      {
        id: 'speed-binding',
        patternId: 'pat-1',
        inputId: 'speed-pot',
        target: { kind: 'call-exported-slider', name: 'sliderSpeed' },
      },
    ],
  }
}
