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

  it('splits target and wraps into a value token and prose description (#782)', () => {
    const header = readMixinHeader(stockMixinSpec('pot-binding')?.src ?? '')
    expect(header.target).toBe('CONTROL')
    expect(header.targetDescription).toBe('slider function or variable slot to drive')
    expect(header.wraps).toBe('beforeRender')
    expect(header.wrapsDescription).toBe('')
    expect(header.params[0]).toEqual({ name: 'PIN', description: 'analog input pin number, e.g. 33 for IO33' })
  })

  it('flags unknown directives instead of silently ignoring them (#782)', () => {
    const source = '// @parm PIN input\n// @taget CONTROL\n// @wraps beforeRender'
    expect(parseMixinHeader(source)).toEqual([
      { line: 1, column: 3, message: 'Unknown directive @parm; expected @param, @target, or @wraps' },
      { line: 2, column: 3, message: 'Unknown directive @taget; expected @param, @target, or @wraps' },
      { line: 1, column: 0, message: 'Mixin header needs at least one @param' },
      { line: 1, column: 0, message: 'Mixin header needs @target' },
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
    expect(stockMixinSpec('power-measure')?.src).toContain('export var __px_powerDutyRecent')
    expect(stockMixinSpec('power-measure')?.src).toContain('export var __px_powerDutySinceStart')
    expect(stockMixinSpec('power-measure')?.src).toContain('export var __px_powerMilliAmps')
    expect(stockMixinSpec('power-cap')?.src).toContain('export function beforeRender(delta)')
    expect(stockMixinSpec('sensor-pulse')?.src).toContain('energyAverage')
    expect(stockMixinSpec('night-scheduler')?.src).toContain('clockHour')
  })
})
