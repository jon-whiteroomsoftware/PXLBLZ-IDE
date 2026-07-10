import { formatWatchValue, snapshotWatchValue } from './watchValue'

describe('watch-variable values', () => {
  it('snapshots only the first three array elements and reports the remaining count', () => {
    const source = Array.from({ length: 23 }, (_, index) => index / 10)

    const snapshot = snapshotWatchValue(source, (value) => value)

    expect(snapshot).toEqual({ kind: 'array-summary', items: [0, 0.1, 0.2], total: 23 })
    expect(formatWatchValue(snapshot)).toBe('0, 0.10, 0.20, … +20')
  })
})
