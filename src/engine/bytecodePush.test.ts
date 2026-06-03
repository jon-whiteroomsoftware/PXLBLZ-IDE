import { describe, it, expect } from 'vitest'
import { crc32, makeProgramId, bytecodeHeaderReconciles } from './bytecodePush'

describe('crc32', () => {
  it('matches the known IEEE CRC-32 of "123456789"', () => {
    // The canonical CRC-32 check value: 0xCBF43926.
    const bytes = new TextEncoder().encode('123456789')
    expect(crc32(bytes)).toBe(0xcbf43926)
  })

  it('is 0 for an empty blob', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('returns an unsigned 32-bit value', () => {
    const crc = crc32(new Uint8Array([0xff, 0xff, 0xff, 0xff]))
    expect(crc).toBeGreaterThanOrEqual(0)
    expect(crc).toBeLessThanOrEqual(0xffffffff)
  })

  it('honours a typed-array view offset (subarray)', () => {
    const backing = new Uint8Array([0, 0, 0x31, 0x32, 0x33])
    const view = backing.subarray(2) // "123"
    expect(crc32(view)).toBe(crc32(new TextEncoder().encode('123')))
  })
})

describe('makeProgramId', () => {
  it('is 17 chars from the firmware alphabet', () => {
    const id = makeProgramId()
    expect(id).toHaveLength(17)
    expect(id).toMatch(/^[2-9A-HJ-NP-Za-km-z]+$/)
  })

  it('is deterministic under an injected rng', () => {
    const seq = [0, 0.5, 0.999, 0.25, 0.75]
    let i = 0
    const rng = () => seq[i++ % seq.length]
    const a = makeProgramId(rng)
    i = 0
    const b = makeProgramId(rng)
    expect(a).toBe(b)
  })

  it('never emits an ambiguous character (0 1 I O l)', () => {
    const id = makeProgramId(() => 0.999999)
    expect(id).not.toMatch(/[01IOl]/)
  })
})

describe('bytecodeHeaderReconciles', () => {
  // Build a blob whose header declares opcode/export byte counts.
  function blob(opcodeBytes: number, exportBytes: number, actualLen: number): Uint8Array {
    const b = new Uint8Array(actualLen)
    const dv = new DataView(b.buffer)
    dv.setUint32(0, opcodeBytes, true)
    dv.setUint32(4, exportBytes, true)
    return b
  }

  it('accepts the spike blob (8 + 64 + 11 = 83)', () => {
    expect(bytecodeHeaderReconciles(blob(64, 11, 83))).toBe(true)
  })

  it('rejects a truncated blob', () => {
    expect(bytecodeHeaderReconciles(blob(64, 11, 80))).toBe(false)
  })

  it('rejects a blob shorter than the header', () => {
    expect(bytecodeHeaderReconciles(new Uint8Array(4))).toBe(false)
  })
})
