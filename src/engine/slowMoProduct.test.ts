import { bundleWithPasses } from './passEngine'
import { slowMoTunables, type SlowMoSettings } from './slowMo'
import { createSlowMoDraft } from './slowMoDraft'

const source = 'export function render(i) { rgb(1,0,0) }'

it('has only the two product settings and squared dreamy decay', () => {
  expect(createSlowMoDraft()).toEqual({ position: 1, dreamy: 0 })
  for (const [dreamy, decay] of [[0, 0], [0.5, 2500], [1, 10000]]) {
    const settings: SlowMoSettings = { position: 0.5, dreamy }
    expect(slowMoTunables(settings)).toEqual({ __pxlblz_slowmo_position: 0.5, __pxlblz_slowmo_decay: decay })
    const result = bundleWithPasses(source, {}, [{ kind: 'slowmo', settings, pixelCount: 256 }])
    expect(result.summary.passes[0].slowMo?.arrayWords).toBe(2340)
    expect(result.code).toContain(`var __pxlblz_slowmo_decay = ${decay}`)
    expect(result.code).toContain('slider__pxlblz_slowmo_speed')
    expect(result.code).not.toMatch(/__pxlblz_slowmo_(?:attack|curve|shape|width|step|offset)/)
    expect(result.code).toContain('__pxlblz_slowmo_in_beforeRender(16)')
  }
})
