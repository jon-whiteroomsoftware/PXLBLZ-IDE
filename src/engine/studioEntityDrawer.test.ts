import { describe, expect, it } from 'vitest'
import {
  createStudioEntityDrawerState,
  studioEntityDrawerIsPinned,
  studioEntityDrawerMode,
  studioEntityDrawerTimerEligible,
  transitionStudioEntityDrawer,
  type StudioEntityDrawerEvent,
  type StudioEntityDrawerState,
} from './studioEntityDrawer'

function run(initial: StudioEntityDrawerState, ...events: StudioEntityDrawerEvent[]): StudioEntityDrawerState {
  return events.reduce((state, event) => transitionStudioEntityDrawer(state, event).state, initial)
}

describe('Studio entity drawer state machine (#966)', () => {
  it('keeps a separate default-pinned preference for every place', () => {
    let state = createStudioEntityDrawerState('patterns')
    state = run(state, { type: 'set-pinned', pinned: false })
    expect(studioEntityDrawerMode(state)).toBe('tucked')

    state = run(state, { type: 'set-place', place: 'shows' })
    expect(studioEntityDrawerMode(state)).toBe('pinned')

    state = run(state, { type: 'set-pinned', pinned: false }, { type: 'set-place', place: 'patterns' })
    expect(studioEntityDrawerMode(state)).toBe('tucked')
  })

  it('forces narrow layouts unpinned without overwriting the remembered preference', () => {
    let state = createStudioEntityDrawerState('shows', { shows: true })
    state = run(state, { type: 'set-narrow', narrow: true })
    expect(studioEntityDrawerIsPinned(state)).toBe(false)
    expect(state.pinPreferences.shows).toBe(true)

    state = run(state, { type: 'open', source: 'pointer' }, { type: 'set-narrow', narrow: false })
    expect(studioEntityDrawerMode(state)).toBe('pinned')
    expect(state.pinPreferences.shows).toBe(true)
  })

  it.each(['outside', 'timer', 'escape'] as const)('lets every busy kind suppress a %s close', (reason) => {
    for (const kind of ['drag', 'field', 'menu', 'dialog'] as const) {
      const initial = createStudioEntityDrawerState('shows', { shows: false })
      const state = run(initial, { type: 'open', source: 'pointer' }, { type: 'set-busy', kind, active: true })
      const result = transitionStudioEntityDrawer(state, { type: 'close', reason })
      expect(result.closeBlocked).toBe(true)
      expect(studioEntityDrawerMode(result.state)).toBe('open')
    }
  })

  it('restarts the mouse-out timer after busy work finishes outside', () => {
    const state = run(
      createStudioEntityDrawerState('shows', { shows: false }),
      { type: 'open', source: 'pointer' },
      { type: 'pointer', inside: false },
      { type: 'set-busy', kind: 'drag', active: true },
      { type: 'set-busy', kind: 'drag', active: false },
    )
    expect(state.timerArmed).toBe(true)
  })

  it('never arms the mouse-out timer for a keyboard open', () => {
    const state = run(
      createStudioEntityDrawerState('patterns', { patterns: false }),
      { type: 'open', source: 'keyboard' },
      { type: 'pointer', inside: false },
    )
    expect(studioEntityDrawerTimerEligible(state)).toBe(false)
    expect(state.timerArmed).toBe(false)
  })

  it('opens the newly selected unpinned place once without moving focus', () => {
    const result = transitionStudioEntityDrawer(
      createStudioEntityDrawerState('patterns', { shows: false }),
      { type: 'set-place', place: 'shows', openAfterSelection: true },
    )
    expect(studioEntityDrawerMode(result.state)).toBe('open')
    expect(result.state.openSource).toBe('place-selection')
    expect(result.focus).toBeUndefined()
  })

  it('returns keyboard focus on close and emits each open or close announcement once', () => {
    const initial = createStudioEntityDrawerState('maps', { maps: false })
    const opened = transitionStudioEntityDrawer(initial, { type: 'open', source: 'keyboard' })
    expect(opened.focus).toBe('list')
    expect(opened.announce).toBe('Maps list open')

    const closed = transitionStudioEntityDrawer(opened.state, { type: 'close', reason: 'entity-chosen' })
    expect(closed.focus).toBe('restore')
    expect(closed.announce).toBe('Maps list closed')

    const repeated = transitionStudioEntityDrawer(closed.state, { type: 'close', reason: 'entity-chosen' })
    expect(repeated.announce).toBeUndefined()
  })

  it('cancels an armed timer on re-entry and only closes an armed timer once', () => {
    const open = run(
      createStudioEntityDrawerState('shows', { shows: false }),
      { type: 'open', source: 'pointer' },
      { type: 'pointer', inside: false },
    )
    expect(run(open, { type: 'pointer', inside: true }).timerArmed).toBe(false)

    const closed = transitionStudioEntityDrawer(open, { type: 'timer-elapsed' })
    expect(studioEntityDrawerMode(closed.state)).toBe('tucked')
    expect(closed.announce).toBe('Shows list closed')
    expect(transitionStudioEntityDrawer(closed.state, { type: 'timer-elapsed' }).announce).toBeUndefined()
  })

  it('lets choosing an entity close through incidental search-field busy state', () => {
    const state = run(
      createStudioEntityDrawerState('patterns', { patterns: false }),
      { type: 'open', source: 'pointer' },
      { type: 'set-busy', kind: 'field', active: true },
    )
    expect(studioEntityDrawerMode(run(state, { type: 'close', reason: 'entity-chosen' }))).toBe('tucked')
  })
})


it('names the supplied drawer in open, close and pin announcements', () => {
  const initial = createStudioEntityDrawerState('shows', { shows: false }, false)
  const opened = transitionStudioEntityDrawer(initial, { type: 'open', source: 'keyboard' }, 'Agent drawer')
  expect(opened.announce).toBe('Agent drawer open')
  expect(transitionStudioEntityDrawer(opened.state, { type: 'close', reason: 'button' }, 'Agent drawer').announce).toBe('Agent drawer closed')
  expect(transitionStudioEntityDrawer(initial, { type: 'set-pinned', pinned: true }, 'Agent drawer').announce).toBe('Agent drawer pinned')
  expect(transitionStudioEntityDrawer(initial, { type: 'set-pinned', pinned: false }, 'Agent drawer').announce).toBe('Agent drawer unpinned')
})
