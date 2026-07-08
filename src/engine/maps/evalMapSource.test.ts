import { evalMapSource } from './evalMapSource'

describe('evalMapSource', () => {
  it('runs a function(pixelCount) and returns its raw coords', () => {
    const src = 'function(n){ var a=[]; for (var i=0;i<n;i++) a.push([i, i*2]); return a }'
    expect(evalMapSource(src, 3)).toEqual([[0, 0], [1, 2], [2, 4]])
  })

  it('accepts a literal 2D coordinate array', () => {
    const src = '[[0, 0], [100, 0], [100, 100], [0, 100]]'
    expect(evalMapSource(src, 99)).toEqual([[0, 0], [100, 0], [100, 100], [0, 100]])
  })

  it('accepts a literal 3D coordinate array', () => {
    const src = '[[0, 0, 0], [1, 0, 0.5], [1, 1, 1]]'
    expect(evalMapSource(src, 3)).toEqual([[0, 0, 0], [1, 0, 0.5], [1, 1, 1]])
  })

  it('exposes Math to the source', () => {
    const src = 'function(n){ return [[Math.cos(0), Math.sqrt(4)]] }'
    expect(evalMapSource(src, 1)).toEqual([[1, 2]])
  })

  it('regenerates for any requested count (length tracks pixelCount)', () => {
    const src = 'function(n){ var a=[]; for (var i=0;i<n;i++) a.push([i,0,0]); return a }'
    expect(evalMapSource(src, 5)).toHaveLength(5)
    expect(evalMapSource(src, 50)).toHaveLength(50)
  })

  it('rejects a source that is neither a coordinate array nor a function', () => {
    expect(() => evalMapSource('42', 1)).toThrow(/coordinate array or a function/)
  })

  it('rejects a source that does not return an array', () => {
    expect(() => evalMapSource('function(n){ return 42 }', 1)).toThrow(/must return an array/)
  })

  it('rejects non-numeric / non-finite coords', () => {
    expect(() => evalMapSource('function(n){ return [[0, NaN]] }', 1)).toThrow(/finite numbers/)
    expect(() => evalMapSource('function(n){ return [["x", 0]] }', 1)).toThrow(/finite numbers/)
  })

  it('wraps a compile error with context', () => {
    expect(() => evalMapSource('function(n){ return [[ }', 1)).toThrow(/failed to compile/)
  })

  it('wraps a runtime throw with context', () => {
    expect(() => evalMapSource('function(n){ throw new Error("boom") }', 1)).toThrow(/threw while generating/)
  })
})
