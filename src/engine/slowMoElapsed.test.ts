import { describe, expect, it } from 'vitest'
import { createSlowMoElapsed } from './slowMoElapsed'

describe('Slow-Mo Pattern time readout', () => {
  it('accumulates the runtime clock, preserves zero delta and unwraps its period', () => {
    const elapsed = createSlowMoElapsed()
    expect(elapsed(0)).toBe(0)
    expect(elapsed(16 / 65536)).toBe(16)
    expect(elapsed(16 / 65536)).toBe(16)
    expect(elapsed(16384 - 16 / 65536)).toBe(2 ** 30 - 16)
    expect(elapsed(0)).toBe(2 ** 30)
    expect(elapsed(32 / 65536)).toBe(2 ** 30 + 32)
    expect(createSlowMoElapsed()(0)).toBe(0)
  })
})
