import { showTransportInitialState, useShowTransportStore } from './showTransportStore'

beforeEach(() => {
  useShowTransportStore.setState(showTransportInitialState)
})

describe('showTransportStore (#414)', () => {
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
})
