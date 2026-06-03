import { useControllerStore, controllerInitialState } from './controllerStore'
import { setControllerProvider, resetControllerProvider } from '@/engine/controllerProviderRegistry'
import { NullControllerProvider, type ControllerTarget } from '@/engine/ControllerProvider'

// A provider that records connect/disconnect calls and can be made to fail, so we
// can assert the store's orchestration without a real backend.
class RecordingProvider extends NullControllerProvider {
  connects: ControllerTarget[] = []
  disconnects = 0
  shouldFailConnect = false
  connect(target: ControllerTarget): Promise<void> {
    this.connects.push(target)
    return this.shouldFailConnect
      ? Promise.reject(new Error('unreachable'))
      : Promise.resolve()
  }
  disconnect(): Promise<void> {
    this.disconnects++
    return Promise.resolve()
  }
}

let provider: RecordingProvider

beforeEach(() => {
  localStorage.clear()
  useControllerStore.setState(controllerInitialState)
  provider = new RecordingProvider()
  setControllerProvider(provider)
})

afterEach(() => resetControllerProvider())

describe('controllerStore', () => {
  it('connect passes the address to the provider and persists it', async () => {
    await useControllerStore.getState().connect('10.0.0.5')
    expect(provider.connects).toEqual([{ address: '10.0.0.5' }])
    expect(useControllerStore.getState().ip).toBe('10.0.0.5')
  })

  it('connect falls back to the stored ip and trims it', async () => {
    useControllerStore.getState().setIp('  10.0.0.9  ')
    await useControllerStore.getState().connect()
    expect(provider.connects).toEqual([{ address: '10.0.0.9' }])
  })

  it('connect is a no-op with no address', async () => {
    await useControllerStore.getState().connect()
    expect(provider.connects).toHaveLength(0)
  })

  it('connect rejection propagates (manual attempt surfaces the error)', async () => {
    provider.shouldFailConnect = true
    await expect(useControllerStore.getState().connect('10.0.0.5')).rejects.toThrow('unreachable')
  })

  it('autoConnect tries the remembered ip', async () => {
    useControllerStore.setState({ ip: '10.0.0.5' })
    await useControllerStore.getState().autoConnect()
    expect(provider.connects).toEqual([{ address: '10.0.0.5' }])
  })

  it('autoConnect with no remembered ip does nothing', async () => {
    await useControllerStore.getState().autoConnect()
    expect(provider.connects).toHaveLength(0)
  })

  it('autoConnect swallows failure and leaves it disconnected', async () => {
    provider.shouldFailConnect = true
    useControllerStore.setState({ ip: '10.0.0.5' })
    await expect(useControllerStore.getState().autoConnect()).resolves.toBeUndefined()
    expect(provider.disconnects).toBe(1)
    // ip is retained for a later retry
    expect(useControllerStore.getState().ip).toBe('10.0.0.5')
  })

  it('persists the ip to localStorage', async () => {
    await useControllerStore.getState().connect('10.0.0.5')
    expect(localStorage.getItem('pixelblaze-controller')).toContain('10.0.0.5')
  })
})
