import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PatternDetailActionBar } from './PatternDetailActionBar'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'
import { resetControllerProvider, setControllerProvider } from '@/engine/controllerProviderRegistry'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { editorInitialState, useEditorStore } from '@/store/editorStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'

class ConnectedProvider extends NullControllerProvider {
  private status: ControllerStatus = {
    kind: 'connected',
    controller: { id: 'c1', address: '10.0.0.9', deviceId: 'c1', name: 'Desk' },
  }

  getStatus(): ControllerStatus {
    return this.status
  }
}

beforeEach(() => {
  useControllerStore.setState(controllerInitialState)
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
})

afterEach(() => resetControllerProvider())

describe('PatternDetailActionBar', () => {
  it('renders Connect instead of disabled Run/Save when disconnected', () => {
    render(<PatternDetailActionBar stageView="preview" onToggleStage={() => {}} />)
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('renders Run and Save when connected and dispatches the matching push mode', () => {
    setControllerProvider(new ConnectedProvider())
    const requestPush = vi.fn()
    useEditorStore.setState({ compileStatus: 'good', previewSource: 'export function render() {}' })
    usePatternStore.setState({ activePatternId: 'p1' })
    useControllerStore.setState({
      activeIp: '10.0.0.9',
      controllers: { '10.0.0.9': { ip: '10.0.0.9', nickname: 'Desk', phase: 'live', mapDim: 2 } },
      requestPush,
    })

    render(<PatternDetailActionBar stageView="preview" onToggleStage={() => {}} />)

    expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument()
    expect(screen.getByTestId('controller-deployment-identity')).toHaveTextContent(/^Desk$/)
    fireEvent.click(screen.getByRole('button', { name: 'Run on Desk' }))
    expect(useControllerStore.getState().saveArmed).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Save to Desk' }))
    expect(useControllerStore.getState().saveArmed).toBe(true)
    expect(requestPush).toHaveBeenCalledTimes(2)
  })
})
