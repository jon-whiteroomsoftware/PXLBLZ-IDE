import {
  MIXIN_SKELETON,
  STOCK_MIXIN_SPECS,
  parseMixinHeader,
  readMixinHeader,
  stockMixinSpec,
} from './mixins'

describe('mixin source headers (#313)', () => {
  it('accepts the new-mixin skeleton header', () => {
    expect(parseMixinHeader(MIXIN_SKELETON)).toEqual([])
    expect(readMixinHeader(MIXIN_SKELETON)).toMatchObject({
      target: 'CONTROL',
      wraps: 'beforeRender',
    })
  })

  it('requires param, target, and wraps directives', () => {
    expect(parseMixinHeader('// just source')).toEqual([
      { line: 1, column: 0, message: 'Mixin header needs at least one @param' },
      { line: 1, column: 0, message: 'Mixin header needs @target' },
      { line: 1, column: 0, message: 'Mixin header needs @wraps' },
    ])
  })

  it('ships the initial stock mixin catalog as readable source', () => {
    expect(STOCK_MIXIN_SPECS.map((spec) => [spec.id, spec.kind])).toEqual([
      ['pot-binding', 'bind'],
      ['hw-brightness', 'intercept'],
      ['power-measure', 'intercept'],
      ['power-cap', 'intercept'],
      ['sensor-pulse', 'inject'],
      ['night-scheduler', 'inject'],
    ])
    for (const spec of STOCK_MIXIN_SPECS) {
      expect(parseMixinHeader(spec.src)).toEqual([])
    }
    expect(stockMixinSpec('pot-binding')?.src).toContain('@param PIN')
    expect(stockMixinSpec('power-measure')?.src).toContain('export var __px_powerDuty')
    expect(stockMixinSpec('power-measure')?.src).toContain('export var __px_powerMilliAmps')
    expect(stockMixinSpec('sensor-pulse')?.src).toContain('energyAverage')
    expect(stockMixinSpec('night-scheduler')?.src).toContain('clockHour')
  })
})
