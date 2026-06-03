import { render, screen, act } from '@testing-library/react'
import { ConnectionStatus } from './ConnectionStatus'
import { setControllerProvider, resetControllerProvider } from '@/engine/controllerProviderRegistry'
import type { ControllerProvider, ControllerStatus } from '@/engine/ControllerProvider'
import { NullControllerProvider } from '@/engine/ControllerProvider'

// A minimal provider that lets the test drive status changes through subscribe,
// exercising the indicator's useSyncExternalStore wiring without a real backend.
class FakeProvider extends NullControllerProvider {
  private status: ControllerStatus = { kind: 'no-helper' }
  private readonly subs = new Set<(s: ControllerStatus) => void>()
  getStatus(): ControllerStatus {
    return this.status
  }
  subscribe(listener: (s: ControllerStatus) => void): () => void {
    this.subs.add(listener)
    return () => this.subs.delete(listener)
  }
  emit(status: ControllerStatus): void {
    this.status = status
    this.subs.forEach((l) => l(status))
  }
}

afterEach(() => resetControllerProvider())

describe('ConnectionStatus', () => {
  it('renders no-helper by default', () => {
    setControllerProvider(new FakeProvider())
    render(<ConnectionStatus />)
    expect(screen.getByTestId('connection-status')).toHaveAttribute('data-status', 'no-helper')
  })

  it('reflects a connected Controller and re-renders on status change', () => {
    const provider = new FakeProvider()
    setControllerProvider(provider)
    render(<ConnectionStatus />)

    act(() =>
      provider.emit({ kind: 'connected', controller: { id: 'a', address: '10.0.0.5', name: 'Hallway' } }),
    )
    const el = screen.getByTestId('connection-status')
    expect(el).toHaveAttribute('data-status', 'connected')
    expect(el.getAttribute('title')).toContain('Hallway')
  })

  it('treats a plain ControllerProvider interface value the same', () => {
    const provider: ControllerProvider = new NullControllerProvider()
    setControllerProvider(provider)
    render(<ConnectionStatus />)
    expect(screen.getByTestId('connection-status')).toHaveAttribute('data-status', 'no-helper')
  })
})
