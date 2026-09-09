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

it('retains correlated publication phases through compile and input floods with bounded ordered reads (#955)', () => {
  const log = createObservationLog()
  const phases: AgentObservation[] = [
    { kind: 'agent-apply', phase: 'adopted', showId: 'show-a', requestId: 'request-a', digest: 'abc', at: 10 },
    { kind: 'agent-apply', phase: 'settled', showId: 'show-a', requestId: 'request-a', digest: 'abc', at: 20 },
    { kind: 'preview-published', showId: 'show-a', digest: 'abc', updatedAt: 1, at: 30 },
  ]
  phases.forEach(log.record)
  const measurements: AgentObservation[] = []
  for (let index = 0; index < 450; index += 1) {
    // Equal timestamps still preserve insertion order across channels.
    measurements.push({ kind: 'show-compile', showId: 'show-a', digest: 'abc', at: index, requestMs: 1, compilerMs: null, cacheHit: true, ok: true })
    measurements.push({ kind: 'input-event', event: 'pointermove', at: index, processingMs: 1, durationMs: 16, reportingThresholdMs: 16 })
  }
  measurements.forEach(log.record)
  const read = log.read()
  expect(read).toEqual([...phases, ...measurements.slice(-400)])
  const adopted = read.find(entry => entry.kind === 'agent-apply' && entry.requestId === 'request-a' && entry.phase === 'adopted')!
  const settled = read.find(entry => entry.kind === 'agent-apply' && entry.requestId === 'request-a' && entry.phase === 'settled')!
  const published = read.find(entry => entry.kind === 'preview-published' && entry.digest === 'abc')!
  expect([settled.at - adopted.at, published.at - adopted.at]).toEqual([10, 20])
  for (let index = 0; index < 450; index += 1) log.record({ ...phases[0], at: index })
  expect(log.read()).toHaveLength(600)
  expect(log.read().filter(entry => entry.kind === 'show-compile')).toHaveLength(200)
  expect(log.read().filter(entry => entry.kind === 'input-event')).toHaveLength(200)
})
