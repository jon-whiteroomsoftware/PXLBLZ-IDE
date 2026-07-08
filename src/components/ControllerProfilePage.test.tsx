import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ControllerProfilePage } from './ControllerProfilePage'
import {
  controllerProfileInitialState,
  defaultControllerProfile,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'

beforeEach(() => {
  useControllerProfileStore.setState(controllerProfileInitialState)
  useControllerStore.setState(controllerInitialState)
})

function seedProfile() {
  const profile = defaultControllerProfile({
    id: 'ctrl-1',
    deviceId: 'pixelblaze_pb32_abc',
    deviceName: 'Burner bag',
    ip: '192.168.8.224',
    now: 1,
  })
  useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
  return profile
}

describe('ControllerProfilePage', () => {
  it('uses the shared controller traffic-light vocabulary for profile status', () => {
    seedProfile()

    const { rerender } = render(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-zinc-700')
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled()

    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: 'pixelblaze_pb32_abc',
          nickname: 'Burner bag',
          phase: 'pending',
          mapDim: null,
        },
      },
    })
    rerender(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Trying to connect')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-amber-400')
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('animate-blink-connect')
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled()

    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: 'pixelblaze_pb32_abc',
          nickname: 'Burner bag',
          phase: 'error',
          error: 'WebSocket open timed out',
          mapDim: null,
        },
      },
    })
    rerender(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Connect failed')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-red-400')
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled()

    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: 'pixelblaze_pb32_abc',
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
        },
      },
    })
    rerender(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-ok')
    expect(screen.getByRole('button', { name: /refresh/i })).toBeEnabled()
  })

  it('shows controller zones as editable range lists with pixel totals', () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [
        {
          ...profile,
          lastKnownPixelCount: 256,
          zones: [
            { id: 'quad-1', name: 'quad-1', ranges: [{ start: 0, end: 63 }] },
            {
              id: 'top-band',
              name: 'top-band',
              ranges: [
                { start: 0, end: 3 },
                { start: 28, end: 31 },
              ],
            },
          ],
        },
      ],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByRole('textbox', { name: 'quad-1 zone ranges' })).toHaveValue('0-63')
    expect(screen.getByRole('textbox', { name: 'top-band zone ranges' })).toHaveValue('0-3, 28-31')
    expect(screen.getByText('64')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })
})
