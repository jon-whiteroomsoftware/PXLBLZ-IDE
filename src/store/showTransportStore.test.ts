import { canAdvanceShowPlayback, resolveShowPlaybackStep, showTransportInitialState, useShowTransportStore } from './showTransportStore'

beforeEach(() => {
  useShowTransportStore.setState(showTransportInitialState)
})

describe('showTransportStore (#414)', () => {
  it('queues requested playback until the seek runtime is ready', () => {
    expect(canAdvanceShowPlayback(true, 'rebuilding')).toBe(false)
    expect(canAdvanceShowPlayback(true, 'idle')).toBe(true)
    expect(canAdvanceShowPlayback(false, 'idle')).toBe(false)
  })

  it('lets a newer seek supersede stale replay work', () => {
    const transport = useShowTransportStore.getState()
    transport.openShow('show-a', 10_000)

    const staleRequest = useShowTransportStore.getState().requestSeek('show-a', 4_000)
    const currentRequest = useShowTransportStore.getState().requestSeek('show-a', 12_000)

    useShowTransportStore.getState().completeSeek(staleRequest, 4_000)
    expect(useShowTransportStore.getState()).toMatchObject({
      positionMs: 0,
      seekStatus: 'rebuilding',
      seekRequest: { id: currentRequest, targetMs: 10_000 },
    })

    useShowTransportStore.getState().completeSeek(currentRequest, 10_000)
    expect(useShowTransportStore.getState()).toMatchObject({
      positionMs: 10_000,
      seekStatus: 'idle',
      seekRequest: null,
    })
  })

  it('clears only the current rebuilding request when replay fails', () => {
    const transport = useShowTransportStore.getState()
    transport.openShow('show-a', 10_000)
    const requestId = useShowTransportStore.getState().requestSeek('show-a', 4_000)

    useShowTransportStore.getState().cancelSeek(requestId + 1)
    expect(useShowTransportStore.getState().seekStatus).toBe('rebuilding')

    useShowTransportStore.getState().cancelSeek(requestId)
    expect(useShowTransportStore.getState()).toMatchObject({ seekStatus: 'idle', seekRequest: null })
  })

  it('keeps Scene-local transport inside its playback window', () => {
    const transport = useShowTransportStore.getState()
    transport.openShow('show-a', 60_000)
    transport.setPosition('show-a', 45_000)

    transport.setPlaybackWindow('show-a', { startMs: 10_000, endMs: 20_000 })
    expect(useShowTransportStore.getState()).toMatchObject({
      positionMs: 10_000,
      playbackWindow: { startMs: 10_000, endMs: 20_000 },
    })

    useShowTransportStore.getState().requestSeek('show-a', 25_000)
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 20_000 })

    useShowTransportStore.getState().clearPlaybackWindow('show-a')
    useShowTransportStore.getState().requestSeek('show-a', 0)
    expect(useShowTransportStore.getState()).toMatchObject({
      playbackWindow: null,
      seekRequest: { targetMs: 0 },
    })
  })

  it('pauses and rewinds instead of crossing the Scene end', () => {
    const window = { startMs: 10_000, endMs: 20_000 }

    expect(resolveShowPlaybackStep(19_900, 50, window)).toEqual({ kind: 'advance', targetMs: 19_950 })
    expect(resolveShowPlaybackStep(19_900, 100, window)).toEqual({ kind: 'rewind', targetMs: 10_000 })
    expect(resolveShowPlaybackStep(19_900, 500, null)).toEqual({ kind: 'advance', targetMs: 20_400 })
  })
})
