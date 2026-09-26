import { describe, expect, it } from 'vitest'
import { readWorkerCount, workerCountLine } from './worker-count-env'

const name = 'WRSP_HOST_VITEST_WORKERS'

describe('runner worker count environment', () => {
  it('uses the fallback only when the variable is unset', () => {
    expect(readWorkerCount({}, name, 4)).toBe(4)
  })

  it.each(['1', '4', '6'])('parses the positive integer %s', (raw) => {
    expect(readWorkerCount({ [name]: raw }, name, 4)).toBe(Number(raw))
  })

  it.each(['0', '-1', '2.5', 'abc', '', ' 4', '04'])('rejects the invalid value %j', (raw) => {
    expect(() => readWorkerCount({ [name]: raw }, name, 4))
      .toThrow(`${name} must be a positive integer, got "${raw}".`)
  })

  it('reports whether the count came from the default or the named variable', () => {
    expect(workerCountLine('Vitest', {}, name, 4)).toBe('Vitest workers: 4 (default)')
    expect(workerCountLine('Vitest', { [name]: '6' }, name, 6))
      .toBe(`Vitest workers: 6 (${name})`)
  })
})
