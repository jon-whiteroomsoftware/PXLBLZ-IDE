import { describe, expect, it } from 'vitest'
import { agentEdgeState, agentInsertionBand, createAgentDrawerState, transitionAgentDrawer } from './agentDrawerModel'

describe('agent drawer activity projection', () => {
  it('counts changed outcomes once per operation while tucked, then counts a later rollback after reading', () => {
    let state = transitionAgentDrawer(createAgentDrawerState(), { type: 'chooseBuiltin' })
    state = transitionAgentDrawer(state, { type: 'beginEdit', id: 'one', intent: 'Shorten the opening' })
    expect(state.unread).toEqual([])
    state = transitionAgentDrawer(state, { type: 'outcome', id: 'one', outcome: 'applied', changes: [{ targetId: 'clip-a', description: 'Opening shortened to 6 s' }] })
    state = transitionAgentDrawer(state, { type: 'outcome', id: 'one', outcome: 'saved' })
    expect(state.unread).toEqual(['one'])
    expect(state.highlights).toEqual(['clip-a'])
    state = transitionAgentDrawer(state, { type: 'drawer', mode: 'open' })
    state = transitionAgentDrawer(state, { type: 'drawer', mode: 'tucked' })
    state = transitionAgentDrawer(state, { type: 'outcome', id: 'one', outcome: 'rolled-back' })
    expect(state.unread).toEqual(['one'])
    expect(state.stream.find(line => line.operationId === 'one')?.outcome).toBe('rolled-back')
    expect(state.highlights).toEqual([])
  })
})

it('preserves failure and draft through fresh retry, dismissal and contact loss', () => {
  let state = transitionAgentDrawer(createAgentDrawerState(), { type: 'chooseBuiltin' })
  state = transitionAgentDrawer(state, { type: 'draft', text: 'unrelated draft' })
  state = transitionAgentDrawer(state, { type: 'beginEdit', id: 'old', intent: 'Resize the original Clip' })
  state = transitionAgentDrawer(state, { type: 'outcome', id: 'old', outcome: 'rolled-back', retryable: true })
  const failed = state.stream[0]
  state = transitionAgentDrawer(state, { type: 'beginEdit', id: 'new', intent: 'Resize the original Clip', retryOf: 'old' })
  state = transitionAgentDrawer(state, { type: 'drop' })
  expect(state.request?.id).toBe('new')
  expect(state.stream[0]).toEqual(failed)
  expect(state.draft).toBe('unrelated draft')
  state = transitionAgentDrawer(state, { type: 'reattach' })
  expect(state.request?.id).toBe('new')
  state = transitionAgentDrawer(state, { type: 'dismiss', id: 'old' })
  expect(state.stream[0].outcome).toBe('rolled-back')
  expect(state.stream[0].dismissed).toBe(true)
})

it('keeps external read activity truthful and expires only setup at its deadline', () => {
  let state = transitionAgentDrawer(createAgentDrawerState(), { type: 'connectOwn', now: 1000 })
  state = transitionAgentDrawer(state, { type: 'tick', now: 120999 })
  expect(state.armingUntil).toBe(121000)
  state = transitionAgentDrawer(state, { type: 'tick', now: 121000 })
  expect(state.armingUntil).toBeNull()
  state = transitionAgentDrawer(state, { type: 'knock', name: 'Claude Code', now: 200000 })
  state = transitionAgentDrawer(state, { type: 'tick', now: 230000 })
  expect(state.pendingCall).toBeNull()
  state = transitionAgentDrawer(state, { type: 'agentBinds', name: 'Claude Code' })
  state = transitionAgentDrawer(state, { type: 'thinking', id: 'external' })
  expect(state.request).toBeNull()
  state = transitionAgentDrawer(state, { type: 'reading' })
  expect(state.unread).toEqual([])
  expect(state.stream[state.stream.length - 1]?.text).toBe('reading the Show')
})

it.each(['manualEdit', 'undo', 'leave'] as const)('%s clears attribution without inventing settlement', type => {
  let state = transitionAgentDrawer(createAgentDrawerState(), { type: 'chooseBuiltin' })
  state = transitionAgentDrawer(state, { type: 'beginEdit', id: 'one', intent: 'Resize' })
  state = transitionAgentDrawer(state, { type: 'outcome', id: 'one', outcome: 'applied', changes: [{ targetId: 'a', description: 'Resized' }] })
  state = transitionAgentDrawer(state, { type })
  expect(state.highlights).toEqual([])
  if (type !== 'leave') expect(state.stream[0].outcome).toBe('applied')
})

it('keeps an unknown operation pending until a same-operation outcome is known', () => {
  let state = transitionAgentDrawer(createAgentDrawerState(), { type: 'chooseBuiltin' })
  state = transitionAgentDrawer(state, { type: 'beginEdit', id: 'one', intent: 'Resize' })
  state = transitionAgentDrawer(state, { type: 'outcome', id: 'one', outcome: 'unknown' })
  expect(state.request?.id).toBe('one')
  state = transitionAgentDrawer(state, { type: 'outcome', id: 'one', outcome: 'saved', changes: [{ targetId: 'a', description: 'Resized' }] })
  expect(state.request).toBeNull()
  expect(state.highlights).toEqual(['a'])
})


it('uses the most recently changed outcome for tucked failure styling', () => {
  let state = transitionAgentDrawer(createAgentDrawerState(), { type: 'chooseBuiltin' })
  state = transitionAgentDrawer(state, { type: 'beginEdit', id: 'old', intent: 'Old edit' })
  state = transitionAgentDrawer(state, { type: 'outcome', id: 'old', outcome: 'applied' })
  state = transitionAgentDrawer(state, { type: 'beginEdit', id: 'new', intent: 'New edit' })
  state = transitionAgentDrawer(state, { type: 'outcome', id: 'new', outcome: 'saved' })
  state = transitionAgentDrawer(state, { type: 'drawer', mode: 'open' })
  state = transitionAgentDrawer(state, { type: 'drawer', mode: 'tucked' })
  state = transitionAgentDrawer(state, { type: 'outcome', id: 'old', outcome: 'rolled-back' })
  expect(state.unread).toEqual(['old'])
  expect(agentEdgeState(state)).toMatchObject({ failed: true, dot: 'failed' })
  state = transitionAgentDrawer(state, { type: 'outcome', id: 'new', outcome: 'saved' })
  expect(agentEdgeState(state).failed).toBe(true)
})

it('draws only a single proven time range, never the hull or stale coordinates of multiple insertions', () => {
  const change = (startMs: number) => ({ targetId: String(startMs), description: 'Inserted', range: { startMs, endMs: startMs + 1000 } })
  expect(agentInsertionBand([change(5000)])).toEqual({ startMs: 5000, endMs: 6000 })
  for (const starts of [[5000, 40000], [40000, 5000], [5000, 6000], [5000, 5000]]) {
    expect(agentInsertionBand(starts.map(change))).toBeNull()
  }
  expect(agentInsertionBand([change(NaN)])).toBeNull()
  expect(agentInsertionBand([])).toBeNull()
})
it('takes exact server connection deadlines and preserves work during contact loss', () => {
  let state = createAgentDrawerState()
  state = transitionAgentDrawer(state, { type: 'connection', connection: { kind: 'builtin', name: 'Built-in' }, armingUntil: null, pendingCall: null, contactLost: false })
  state = transitionAgentDrawer(state, { type: 'beginEdit', id: 'op', intent: 'Edit' })
  const lost = transitionAgentDrawer(state, { type: 'connection', connection: state.connection, armingUntil: null, pendingCall: null, contactLost: true })
  expect(lost.request).toEqual(state.request)
  expect(lost.stream).toEqual(state.stream)
  expect(lost.contactLost).toBe(true)
  const armed = transitionAgentDrawer(createAgentDrawerState(), { type: 'connection', connection: null, armingUntil: 123456, pendingCall: null, contactLost: false })
  expect(armed.armingUntil).toBe(123456)
})
