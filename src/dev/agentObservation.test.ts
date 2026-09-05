import { describe, expect, it } from 'vitest'
import {
  createObservationLog,
  showRecordDigest,
  type AgentObservation,
} from './agentObservation'

const base = {
  id: 'show-a',
  name: 'A',
  scenes: [{ id: 's1', name: 'S1', durationMs: 30_000 }],
  zones: [{ id: 'z1', name: 'main', nominalPixelCount: 60 }],
  cells: [],
  routingLayouts: [],
  transitions: [],
  outputContract: { version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 64, compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' } },
  updatedAt: 1,
} as unknown as Parameters<typeof showRecordDigest>[0]

describe('showRecordDigest', () => {
  it('ignores the client stamp and the name but sees choreography', () => {
    const stamped = { ...base, updatedAt: 999, name: 'renamed' }
    expect(showRecordDigest(stamped)).toBe(showRecordDigest(base))
    const edited = { ...base, scenes: [{ ...base.scenes[0], durationMs: 12_000 }] }
    expect(showRecordDigest(edited)).not.toBe(showRecordDigest(base))
  })

  it('is a stable eight-hex-digit string', () => {
    expect(showRecordDigest(base)).toMatch(/^[0-9a-f]{8}$/)
    expect(showRecordDigest(structuredClone(base))).toBe(showRecordDigest(base))
  })
})

describe('createObservationLog', () => {
  const entry = (sequence: number): AgentObservation => ({
    kind: 'agent-apply',
    phase: 'admitted',
    showId: 'show-a',
    at: sequence,
  })

  it('returns copies in insertion order and keeps only the newest entries', () => {
    const log = createObservationLog(3)
    for (let index = 1; index <= 5; index += 1) log.record(entry(index))
    const read = log.read()
    expect(read.map((item) => item.at)).toEqual([3, 4, 5])
    ;(read as AgentObservation[]).push(entry(99))
    expect(log.read()).toHaveLength(3)
  })

  it('never lets a reader mutate a recorded entry', () => {
    const log = createObservationLog(3)
    log.record(entry(1))
    const first = log.read()[0] as { at: number }
    first.at = 42
    expect(log.read()[0].at).toBe(1)
  })
})
