import { bundleWithPasses } from './passEngine'
import {
  formatSlowMoAmount,
  isSlowMoActive,
  slowMoPositionFromAmount,
  slowMoSettingsFromAmounts,
  slowMoTunables,
  type SlowMoSettings,
} from './slowMo'

const source = 'export function render(i) { rgb(1,0,0) }'

it('has only the two product settings and squared dreamy decay', () => {
  expect(slowMoSettingsFromAmounts(0, 0)).toEqual({ position: 1, dreamy: 0 })
  expect(slowMoPositionFromAmount(0)).toBe(1)
  expect(slowMoPositionFromAmount(0.25)).toBe(0.75)
  expect(slowMoPositionFromAmount(1)).toBe(0)
  expect(isSlowMoActive(0, 0)).toBe(false)
  expect(isSlowMoActive(0.001, 0)).toBe(true)
  expect(isSlowMoActive(0, 0.001)).toBe(true)
  for (const [dreamy, decay] of [[0, 0], [0.5, 2500], [1, 10000]]) {
    const settings: SlowMoSettings = slowMoSettingsFromAmounts(0.5, dreamy)
    expect(slowMoTunables(settings)).toEqual({ __pxlblz_slowmo_position: 0.5, __pxlblz_slowmo_decay: decay })
    const result = bundleWithPasses(source, {}, [{ kind: 'slowmo', settings, pixelCount: 256 }])
    expect(result.summary.passes[0].slowMo?.arrayWords).toBe(2340)
    expect(result.code).toContain(`var __pxlblz_slowmo_decay = ${decay}`)
    expect(result.code).toContain('slider__pxlblz_slowmo_speed')
    expect(result.code).not.toMatch(/__pxlblz_slowmo_(?:attack|curve|shape|width|step|offset)/)
    expect(result.code).toContain('__pxlblz_slowmo_in_beforeRender(16)')
  }
})

it('formats Slow-mo readout as off only at zero and 1/<n>× for every positive amount', () => {
  expect(formatSlowMoAmount(0)).toBe('off')
  expect(formatSlowMoAmount(-0.1)).toBe('off')
  expect(formatSlowMoAmount(Number.NaN)).toBe('off')
  expect(formatSlowMoAmount(0.001)).toBe('1/1×')
  expect(formatSlowMoAmount(0.04)).toBe('1/1.1×')
  // Prototype L197 regression: 0.14 visibly slows the preview (2^0.56 ≈ 1.47) and must not read "off".
  expect(formatSlowMoAmount(0.14)).toBe('1/1.5×')
  expect(formatSlowMoAmount(0.25)).toBe('1/2×')
  expect(formatSlowMoAmount(0.5)).toBe('1/4×')
  expect(formatSlowMoAmount(0.75)).toBe('1/8×')
  expect(formatSlowMoAmount(1)).toBe('1/16×')
  for (const amount of [0.001, 0.03, 0.031, 0.05, 0.1, 0.14, 0.2, 0.5, 0.9, 1]) {
    expect(formatSlowMoAmount(amount)).not.toBe('off')
    expect(formatSlowMoAmount(amount)).toMatch(/^1\/\d+(?:\.\d)?×$/)
  }
})
