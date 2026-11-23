import { sameReconciliationTarget, stallAfterReconciliation } from './controllerReconciliationPolicy'

describe('Controller reconciliation retry policy', () => {
  const target = { ip: '10.0.0.5', deviceId: 'pixelblaze_pb32_abc' }

  it('allows one automatic attempt per stall, including an interrupted attempt', () => {
    expect(stallAfterReconciliation(target, false, 'timeout', 50)).toEqual({
      target, stage: 'scheduled', at: 10_050,
    })
    expect(stallAfterReconciliation(target, true, 'timeout', 10_050)).toEqual({ target, stage: 'manual' })
    expect(stallAfterReconciliation(target, true, 'interrupted', 10_050)).toEqual({ target, stage: 'manual' })
    expect(stallAfterReconciliation(target, true, 'finished', 10_050)).toBeUndefined()
    expect(stallAfterReconciliation(target, false, 'interrupted', 50)).toBeUndefined()
  })

  it('recognizes learned and canonical IDs and distinguishes a known replacement at the same IP', () => {
    expect(sameReconciliationTarget(target, { ip: target.ip })).toBe(true)
    expect(sameReconciliationTarget(target, { ip: '10.0.0.8', deviceId: 'pixelblaze_pb32_000000000abc' })).toBe(true)
    expect(sameReconciliationTarget(target, { ...target, deviceId: 'pixelblaze_pb32_def' })).toBe(false)
  })
})
