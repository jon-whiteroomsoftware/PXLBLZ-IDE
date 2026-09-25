import { stockShowV2ById } from '../../src/pixelblaze/stock/showsV2'
import { compileShowV2RecordState, compileStockShowV2State } from './showV2Fixture'

describe('stock v2 Show compile state (#1042)', () => {
  it('returns an unknown stock Pattern lookup failure as data', () => {
    const stock = stockShowV2ById('stock-show-showcase-redline-installation')
    expect(stock).toBeDefined()
    const record = structuredClone(stock!)
    expect(record.composition.patternInstances[0].pattern.kind).toBe('stock')
    record.composition.patternInstances[0].pattern.id = 'no-such-pattern'

    const result = compileShowV2RecordState(record, {})

    expect(result.artifact).toBeNull()
    expect(result.error).toContain('unknown stock Pattern "no-such-pattern"')
  })

  it('returns a missing stock Show as data', () => {
    expect(compileStockShowV2State('no-such-show', {})).toEqual({
      artifact: null,
      error: 'Stock v2 Show "no-such-show" is missing.',
    })
  })

  it('compiles the Redline installation Show', () => {
    const result = compileStockShowV2State('stock-show-showcase-redline-installation', {})
    expect(result.artifact).not.toBeNull()
    expect(result.error).toBeNull()
  })
})
