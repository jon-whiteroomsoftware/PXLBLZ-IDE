import {
  assertSafeWorkspaceFileName,
  fromWorkspaceIsoDate,
  newPersonalContentId,
  safeWorkspaceFileStem,
  toWorkspaceIsoDate,
  workspaceFileNameForRecord,
} from './personalContentMetadata'

describe('newPersonalContentId', () => {
  it('uses crypto.randomUUID when available', () => {
    expect(newPersonalContentId({ randomUUID: () => '00000000-0000-4000-8000-000000000000' })).toBe(
      '00000000-0000-4000-8000-000000000000',
    )
  })

  it('falls back to a v4-shaped UUID from random bytes', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => i)
    const crypto = {
      getRandomValues(target: Uint8Array) {
        target.set(bytes)
        return target
      },
    }
    expect(newPersonalContentId(crypto)).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })
})

describe('workspace date metadata', () => {
  it('round-trips app timestamps through ISO strings', () => {
    const timestamp = Date.UTC(2026, 5, 24, 12, 30, 45, 123)
    const iso = toWorkspaceIsoDate(timestamp)
    expect(iso).toBe('2026-06-24T12:30:45.123Z')
    expect(fromWorkspaceIsoDate(iso)).toBe(timestamp)
  })

  it('rejects invalid dates', () => {
    expect(() => toWorkspaceIsoDate(Number.NaN)).toThrow(/Invalid timestamp/)
    expect(() => fromWorkspaceIsoDate('not a date')).toThrow(/Invalid ISO date/)
  })
})

describe('workspace filenames', () => {
  it('creates ASCII-safe stems from display names', () => {
    expect(safeWorkspaceFileStem('My Pattern!')).toBe('my-pattern')
    expect(safeWorkspaceFileStem('../Résumé/🔥')).toBe('resume')
    expect(safeWorkspaceFileStem('---')).toBe('untitled')
  })

  it('keeps filenames deterministic and identity-based', () => {
    expect(workspaceFileNameForRecord({ id: 'abc-123', name: 'My Pattern' })).toBe('my-pattern--abc-123.json')
  })

  it('handles filename collisions without changing record identity', () => {
    const used = new Set(['my-pattern--abc-123.json', 'my-pattern--abc-123-2.json'])
    expect(workspaceFileNameForRecord({ id: 'abc-123', name: 'My Pattern' }, used)).toBe(
      'my-pattern--abc-123-3.json',
    )
  })

  it('rejects path traversal and non-json filenames', () => {
    expect(() => assertSafeWorkspaceFileName('../x.json')).toThrow(/Unsafe/)
    expect(() => assertSafeWorkspaceFileName('x/thing.json')).toThrow(/Unsafe/)
    expect(() => assertSafeWorkspaceFileName('x.txt')).toThrow(/Unsafe/)
  })
})
