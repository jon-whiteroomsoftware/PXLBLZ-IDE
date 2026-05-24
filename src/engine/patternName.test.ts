import { uniquePatternName, nameConflicts } from './patternName'

describe('uniquePatternName', () => {
  it('returns base name when no conflict', () => {
    expect(uniquePatternName('Untitled Pattern', [])).toBe('Untitled Pattern')
  })

  it('returns base name when other names exist but no conflict', () => {
    expect(uniquePatternName('Untitled Pattern', ['My Pattern', 'Rainbow'])).toBe('Untitled Pattern')
  })

  it('appends 1 when base is taken', () => {
    expect(uniquePatternName('Untitled Pattern', ['Untitled Pattern'])).toBe('Untitled Pattern 1')
  })

  it('increments until a free slot is found', () => {
    const existing = ['Untitled Pattern', 'Untitled Pattern 1', 'Untitled Pattern 2']
    expect(uniquePatternName('Untitled Pattern', existing)).toBe('Untitled Pattern 3')
  })

  it('works with gaps in the numbering', () => {
    const existing = ['Untitled Pattern', 'Untitled Pattern 1', 'Untitled Pattern 3']
    expect(uniquePatternName('Untitled Pattern', existing)).toBe('Untitled Pattern 2')
  })

  it('treats existing names case-insensitively', () => {
    expect(uniquePatternName('Untitled Pattern', ['UNTITLED PATTERN'])).toBe('Untitled Pattern 1')
  })

  it('treats existing names case-insensitively when incrementing', () => {
    const existing = ['untitled pattern', 'Untitled Pattern 1']
    expect(uniquePatternName('Untitled Pattern', existing)).toBe('Untitled Pattern 2')
  })
})

describe('nameConflicts', () => {
  it('returns false when no names taken', () => {
    expect(nameConflicts('Foo', [])).toBe(false)
  })

  it('returns true for exact match', () => {
    expect(nameConflicts('Foo', ['Foo', 'Bar'])).toBe(true)
  })

  it('returns true for case-insensitive match', () => {
    expect(nameConflicts('FOO', ['foo'])).toBe(true)
    expect(nameConflicts('foo', ['FOO'])).toBe(true)
    expect(nameConflicts('Foo', ['FOO'])).toBe(true)
  })

  it('returns false when only different names exist', () => {
    expect(nameConflicts('Foo', ['Bar', 'Baz'])).toBe(false)
  })
})
