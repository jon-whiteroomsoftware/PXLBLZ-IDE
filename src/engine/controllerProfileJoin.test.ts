import {
  controllerProfileCreateSeed,
  findControllerProfileForDevice,
} from './controllerProfileJoin'
import type { ControllerProfile } from './controllerProfile'

function profile(id: string, deviceId: string | undefined, updatedAt: number): ControllerProfile {
  return {
    id,
    name: id,
    ...(deviceId ? { deviceId } : {}),
    board: { kind: 'pixelblaze-v3-standard' },
    inputs: [],
    globalTransforms: [],
    patternBindings: [],
    updatedAt,
  }
}

describe('controller profile join', () => {
  it('matches controller profiles by device id only', () => {
    expect(findControllerProfileForDevice([
      profile('ip-match-name-mismatch', 'pixelblaze_other', 2),
      profile('device-match', 'pixelblaze_pb32_3cd4ee549434', 1),
    ], 'pixelblaze_pb32_3cd4ee549434')?.id).toBe('device-match')
  })

  it('chooses the newest profile if duplicate device ids exist', () => {
    expect(findControllerProfileForDevice([
      profile('old', 'pixelblaze_pb32_3cd4ee549434', 1),
      profile('new', 'pixelblaze_pb32_3cd4ee549434', 3),
      profile('middle', 'pixelblaze_pb32_3cd4ee549434', 2),
    ], 'pixelblaze_pb32_3cd4ee549434')?.id).toBe('new')
  })

  it('does not match unclaimed live controllers', () => {
    expect(findControllerProfileForDevice([profile('ctrl-1', undefined, 1)], null)).toBeNull()
  })

  it('prepares a profile seed from claimed and unclaimed live targets', () => {
    expect(controllerProfileCreateSeed({
      ip: '192.168.8.224',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      nickname: 'Pixelblaze shelf',
      firmwareVersion: '3.67',
    })).toEqual({
      name: 'Pixelblaze shelf',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      deviceName: 'Pixelblaze shelf',
      ip: '192.168.8.224',
      firmwareVersion: '3.67',
    })

    expect(controllerProfileCreateSeed({ ip: '192.168.8.225', deviceId: null })).toEqual({
      name: 'Controller 192.168.8.225',
      ip: '192.168.8.225',
    })
  })
})
