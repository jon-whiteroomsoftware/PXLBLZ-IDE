import { decodeFirmwareUpdateState } from './firmwareUpdate'

describe('decodeFirmwareUpdateState', () => {
  it.each([
    [0, 'unknown'],
    [1, 'checking'],
    [2, 'in-progress'],
    [3, 'error'],
    [4, 'current'],
    [5, 'available'],
    [6, 'complete'],
  ] as const)('maps Pixelblaze update code %i to %s', (code, state) => {
    expect(decodeFirmwareUpdateState({ code })).toBe(state)
  })

  it('degrades malformed and future states to unknown', () => {
    expect(decodeFirmwareUpdateState(null)).toBe('unknown')
    expect(decodeFirmwareUpdateState({ code: '5' })).toBe('unknown')
    expect(decodeFirmwareUpdateState({ code: 99 })).toBe('unknown')
  })
})
