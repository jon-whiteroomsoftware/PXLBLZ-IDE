import { describe, it, expect } from 'vitest'
import { validateSource } from '@/engine/validate'
import { loadPattern } from '@/engine/loadPattern'
import { NEW_PATTERN_SRC } from './newPattern'

describe('NEW_PATTERN_SRC', () => {
  it('is valid Pixelblaze syntax', () => {
    expect(validateSource(NEW_PATTERN_SRC)).toEqual([])
  })

  it('produces different pixel colors at different time values', () => {
    let timeVal = 0
    const captured: number[] = []
    const builtins = {
      hsv: (h: number) => { captured.push(h) },
      time: () => timeVal,
    }

    const handle = loadPattern(NEW_PATTERN_SRC, { exportedVars: ['t'], patternVars: ['t'], controls: [] }, builtins)

    timeVal = 0.0
    handle.beforeRender(16)
    handle.render2D(0, 0.5, 0.5)

    timeVal = 0.5
    handle.beforeRender(16)
    handle.render2D(0, 0.5, 0.5)

    expect(captured).toHaveLength(2)
    expect(captured[0]).not.toBeCloseTo(captured[1])
  })
})
