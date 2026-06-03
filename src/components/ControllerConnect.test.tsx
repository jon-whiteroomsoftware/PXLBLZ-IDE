import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import { ControllerConnect } from './ControllerConnect'
import { useControllerStore, controllerInitialState } from '@/store/controllerStore'
import { setControllerProvider, resetControllerProvider } from '@/engine/controllerProviderRegistry'
import { NullControllerProvider, type ControllerStatus, type ControllerTarget } from '@/engine/ControllerProvider'

class FakeProvider extends NullControllerProvider {
  connects: ControllerTarget[] = []
  private status: ControllerStatus = { kind: 'helper-present' }
  private readonly subs = new Set<(s: ControllerStatus) => void>()
  getStatus(): ControllerStatus {
    return this.status
  }
  subscribe(listener: (s: ControllerStatus) => void): () => void {
    this.subs.add(listener)
    return () => this.subs.delete(listener)
  }
  connect(target: ControllerTarget): Promise<void> {
    this.connects.push(target)
    return Promise.resolve()
  }
  emit(status: ControllerStatus): void {
    this.status = status
    this.subs.forEach((l) => l(status))
  }
}

let provider: FakeProvider

beforeEach(() => {
  localStorage.clear()
  useControllerStore.setState(controllerInitialState)
  provider = new FakeProvider()
  setControllerProvider(provider)
})

afterEach(() => resetControllerProvider())

describe('ControllerConnect', () => {
  it('starts with an empty input when no ip was ever entered', () => {
    render(<ControllerConnect />)
    expect(screen.getByTestId('controller-ip-input')).toHaveValue('')
    expect(screen.getByTestId('controller-go')).toBeDisabled()
  })

  it('seeds the input from the persisted ip', () => {
    useControllerStore.setState({ ip: '10.0.0.5' })
    render(<ControllerConnect />)
    expect(screen.getByTestId('controller-ip-input')).toHaveValue('10.0.0.5')
  })

  it('typing an ip and hitting Go connects through the provider', async () => {
    render(<ControllerConnect />)
    fireEvent.change(screen.getByTestId('controller-ip-input'), { target: { value: '10.0.0.7' } })
    fireEvent.click(screen.getByTestId('controller-go'))
    await waitFor(() => expect(provider.connects).toEqual([{ address: '10.0.0.7' }]))
    expect(useControllerStore.getState().ip).toBe('10.0.0.7')
  })

  it('strips non-IP characters from typed input', () => {
    render(<ControllerConnect />)
    const input = screen.getByTestId('controller-ip-input')
    fireEvent.change(input, { target: { value: 'abc10.0.x0.5!' } })
    expect(input).toHaveValue('10.0.0.5')
  })

  it('swaps Go for Disconnect when connected', () => {
    render(<ControllerConnect />)
    act(() =>
      provider.emit({ kind: 'connected', controller: { id: 'a', address: '10.0.0.7' } }),
    )
    expect(screen.queryByTestId('controller-go')).toBeNull()
    expect(screen.getByTestId('controller-disconnect')).toBeInTheDocument()
  })

  it('disables the input while connecting', () => {
    render(<ControllerConnect />)
    act(() => provider.emit({ kind: 'connecting', target: { address: '10.0.0.7' } }))
    expect(screen.getByTestId('controller-ip-input')).toBeDisabled()
  })
})
