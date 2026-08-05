import { describe, expect, it } from 'vitest'
import { emitIntegerDataTable } from './showDataTableEmission'
import {
  MEASURED_ELEMENT_ASSIGNMENT_BYTECODE_BYTES,
  MEASURED_LITERAL_ELEMENT_BYTECODE_BYTES,
} from './showVmResourceLedger'

/** Execute the emitted lines exactly as the Pixelblaze VM would materialize
 * them: array(n) zero-fills, then assignments/loops/literals run in order. */
function materialize(lines: string[], name: string): number[] {
  const body = `
    const array = (n) => new Array(n).fill(0)
    ${lines.join('\n').split('var ').join('let ')}
    return ${name}
  `
  return new Function(body)() as number[]
}

describe('cost-based integer data table emission (#717)', () => {
  it('emits a bare zero-filled allocation when every value is zero', () => {
    const emission = emitIntegerDataTable('t', [0, 0, 0, 0])
    expect(emission.representation).toBe('array-call')
    expect(emission.lines).toEqual(['var t = array(4)'])
    expect(materialize(emission.lines, 't')).toEqual([0, 0, 0, 0])
  })

  it('chooses a literal for dense unordered values and reproduces them exactly', () => {
    const values = [7, 3, 9, 1, 30_000, 15, 2, 8, 4, 6, 11, 13, 17, 19, 23, 29]
    const emission = emitIntegerDataTable('t', values)
    expect(emission.representation).toBe('literal')
    expect(emission.lines).toEqual([`var t = [${values.join(',')}]`])
    expect(materialize(emission.lines, 't')).toEqual(values)
    expect(emission.estimatedBytecodeBytes).toBe(
      Math.ceil(values.length * MEASURED_LITERAL_ELEMENT_BYTECODE_BYTES),
    )
  })

  it('chooses sparse assignments when zeros dominate', () => {
    const values = Array.from({ length: 400 }, () => 0)
    values[7] = 5
    values[133] = 9
    const emission = emitIntegerDataTable('t', values)
    expect(emission.representation).toBe('sparse-assignments')
    expect(emission.lines).toEqual(['var t = array(400)', 't[7] = 5', 't[133] = 9'])
    expect(materialize(emission.lines, 't')).toEqual(values)
    expect(emission.estimatedBytecodeBytes).toBe(2 * MEASURED_ELEMENT_ASSIGNMENT_BYTECODE_BYTES)
  })

  it('chooses run-length loops for long slope-one runs and reproduces them exactly', () => {
    const values = Array.from({ length: 600 }, (_, i) => i + 40)
    const emission = emitIntegerDataTable('t', values, { loopIndexName: 'loop_i' })
    expect(emission.representation).toBe('run-length')
    expect(emission.lines[0]).toBe('var t = array(600)')
    expect(emission.lines.some((line) => line.startsWith('var loop_i'))).toBe(true)
    expect(materialize(emission.lines, 't')).toEqual(values)
  })

  it('requires a loop index name before it will emit loops', () => {
    const values = Array.from({ length: 600 }, (_, i) => i + 40)
    const emission = emitIntegerDataTable('t', values)
    expect(emission.representation).toBe('literal')
    expect(materialize(emission.lines, 't')).toEqual(values)
  })

  it('reproduces mixed content (runs, scattered values, zero gaps) under every pressure', () => {
    const values = Array.from({ length: 300 }, () => 0)
    for (let i = 20; i < 120; i += 1) values[i] = i + 1_000
    values[200] = 77
    values[299] = 31_000
    const emission = emitIntegerDataTable('t', values, { loopIndexName: 'i9' })
    expect(materialize(emission.lines, 't')).toEqual(values)
  })

  it('rejects values outside the 16.16 integer range and non-integers', () => {
    expect(() => emitIntegerDataTable('t', [1.5])).toThrow()
    expect(() => emitIntegerDataTable('t', [32_768])).toThrow()
    expect(() => emitIntegerDataTable('t', [-32_768])).toThrow()
    expect(() => emitIntegerDataTable('t', [Number.NaN])).toThrow()
  })

  it('prices every candidate and picks the cheapest', () => {
    // 40 elements, all nonzero, shuffled: literal 4.25*40 = 170 beats
    // sparse 20*40 = 800 and there are no qualifying runs.
    const dense = emitIntegerDataTable('t', Array.from({ length: 40 }, (_, i) => ((i * 17) % 97) + 1))
    expect(dense.representation).toBe('literal')
    // 2,000 slope-one elements: one loop (80) beats literal (8,500).
    const run = emitIntegerDataTable('t', Array.from({ length: 2_000 }, (_, i) => i + 1), { loopIndexName: 'i' })
    expect(run.representation).toBe('run-length')
    expect(run.estimatedBytecodeBytes).toBeLessThan(2_000 * MEASURED_LITERAL_ELEMENT_BYTECODE_BYTES)
  })
})
