import { showKeyboardSeekStepMs } from './showKeyboardSeek'

describe('showKeyboardSeekStepMs', () => {
  it('keeps taps precise and accelerates a sustained arrow-key hold', () => {
    expect(showKeyboardSeekStepMs(0)).toBe(1_000)
    expect(showKeyboardSeekStepMs(499)).toBe(1_000)
    expect(showKeyboardSeekStepMs(500)).toBe(2_000)
    expect(showKeyboardSeekStepMs(1_499)).toBe(2_000)
    expect(showKeyboardSeekStepMs(1_500)).toBe(5_000)
  })
})
