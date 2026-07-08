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
