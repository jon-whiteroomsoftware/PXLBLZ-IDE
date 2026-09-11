import { describe, expect, it } from 'vitest'
import { emptyAgentAllowance, reserveAgentDispatch, settleAgentDispatch, agentUsageCost, AGENT_DISPATCH_RESERVATION_NANOUSD } from './agentAllowance'

const day = '2026-09-10'
const usage = (input = 1000, output = 100) => ({ input_tokens: input, output_tokens: output, total_tokens: input + output, input_tokens_details: { cached_tokens: 100, cache_write_tokens: 200 }, output_tokens_details: { reasoning_tokens: 50 } })
describe('shared built-in allowance', () => {
  it('reserves worst documented rates before each dispatch and refuses the first call beyond ten dollars', () => {
    let state = emptyAgentAllowance()
    expect(AGENT_DISPATCH_RESERVATION_NANOUSD).toBe(1_079_491_200)
    for (let i = 0; i < 9; i++) {
      const next = reserveAgentDispatch(state, day, `call-${i}`)
      expect(next.result).toBe('reserved'); state = next.state
    }
    const refused = reserveAgentDispatch(state, day, 'call-19')
    expect(refused.result).toBe('exhausted'); expect(refused.state).toEqual(state)
  })
  it('duplicate delivery never grants dispatch, before or after settlement or day rollover', () => {
    const first = reserveAgentDispatch(emptyAgentAllowance(), day, 'same')
    expect(reserveAgentDispatch(first.state, day, 'same').result).toBe('duplicate')
    const settled = settleAgentDispatch(first.state, day, 'same', usage())
    expect(reserveAgentDispatch(settled.state, day, 'same').result).toBe('duplicate')
    expect(reserveAgentDispatch(settled.state, '2026-09-11', 'same').result).toBe('duplicate')
  })
  it('settles only its original dispatch/day and preserves unknown reservations through restart', () => {
    const first = reserveAgentDispatch(emptyAgentAllowance(), day, 'one')
    const next = reserveAgentDispatch(first.state, '2026-09-11', 'two')
    const unknown = settleAgentDispatch(next.state, day, 'one', null)
    expect(unknown.result).toBe('unknown'); expect(unknown.state).toEqual(next.state)
    const restarted = JSON.parse(JSON.stringify(unknown.state))
    const settled = settleAgentDispatch(restarted, day, 'one', usage())
    expect(settled.result).toBe('settled')
    expect(settled.state.days[day].chargedNanoUsd).toBe(312_000)
    expect(settled.state.days['2026-09-11'].chargedNanoUsd).toBe(AGENT_DISPATCH_RESERVATION_NANOUSD)
    expect(settleAgentDispatch(settled.state, day, 'missing', usage()).result).toBe('unknown')
    expect(settleAgentDispatch(settled.state, day, 'one', usage(2000)).state).toEqual(settled.state)
  })
  it('validates every usage category and the long-context boundary', () => {
    expect(agentUsageCost(usage())).toBe(312_000)
    expect(agentUsageCost(usage(272000))).toBe(54_512_000)
    expect(agentUsageCost(usage(272001))).toBe(108_964_400)
    for (const bad of [null, {}, { ...usage(), output_tokens: -1 }, { ...usage(), total_tokens: 0 }, { ...usage(), input_tokens_details: { cached_tokens: 100 } }, { ...usage(), input_tokens_details: { cached_tokens: 900, cache_write_tokens: 200 } }, { ...usage(), output_tokens_details: { reasoning_tokens: 101 } }]) expect(agentUsageCost(bad)).toBe(null)
  })
  it('halts future admission when reported usage exceeds the reserved provider bounds', () => {
    const first = reserveAgentDispatch(emptyAgentAllowance(), day, 'one')
    const overrun = settleAgentDispatch(first.state, day, 'one', usage(1_050_001, 8193))
    expect(overrun.result).toBe('overrun'); expect(overrun.state.halted).toBe(true)
    expect(reserveAgentDispatch(overrun.state, '2026-09-11', 'two').result).toBe('halted')
  })
})

it('prices priority usage and keeps legacy reservations correct across the tier upgrade', () => {
  expect(agentUsageCost(usage(), 'priority')).toBe(624_000)
  expect(agentUsageCost(usage(272001), 'priority')).toBe(217_928_800)
  expect(agentUsageCost(usage(), 'unexpected')).toBeNull()
  const legacy = { halted: false, days: { [day]: { chargedNanoUsd: 539_745_600, dispatches: { old: {} } } } }
  const settled = settleAgentDispatch(legacy, day, 'old', usage(), 'default')
  expect(settled.state.days[day].chargedNanoUsd).toBe(312_000)
  const fast = reserveAgentDispatch(emptyAgentAllowance(), day, 'new')
  expect(fast.state.days[day].chargedNanoUsd).toBe(1_079_491_200)
  expect(settleAgentDispatch(fast.state, day, 'new', usage(), 'priority').state.days[day].chargedNanoUsd).toBe(624_000)
  expect(settleAgentDispatch(fast.state, day, 'new', usage(), 'default').state.days[day].chargedNanoUsd).toBe(312_000)
})
