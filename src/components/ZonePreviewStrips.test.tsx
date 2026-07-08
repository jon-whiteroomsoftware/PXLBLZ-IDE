import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { ZonePreviewStrips } from '@/components/ZonePreviewStrips'

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
})

describe('ZonePreviewStrips', () => {
  it('renders one compact strip per zone', () => {
    usePreviewStore.getState().setZonePreviewStrips([
      {
        id: 'arch-left',
        name: 'Arch left',
        color: '#38bdf8',
        pixelCount: 32,
        samples: [
          [1, 0, 0],
          [0, 1, 0],
        ],
      },
      {
        id: 'arch-right',
        name: 'Arch right',
        color: '#f97316',
        pixelCount: 24,
        samples: [[0, 0, 1]],
      },
    ])

    render(<ZonePreviewStrips />)

    expect(screen.getByText('Arch left')).toBeInTheDocument()
    expect(screen.getByText('32 px')).toBeInTheDocument()
    expect(screen.getByText('Arch right')).toBeInTheDocument()
    expect(screen.getByText('24 px')).toBeInTheDocument()
    expect(screen.getAllByTestId('zone-preview-sample')).toHaveLength(3)
  })

  it('toggles the solo zone from the row button', () => {
    usePreviewStore.getState().setZonePreviewStrips([
      {
        id: 'arch-left',
        name: 'Arch left',
        color: '#38bdf8',
        pixelCount: 32,
        samples: [[1, 0, 0]],
      },
    ])

    render(<ZonePreviewStrips />)

    fireEvent.click(screen.getByRole('button', { name: 'Solo zone Arch left' }))
    expect(usePreviewStore.getState().zoneSoloId).toBe('arch-left')

    fireEvent.click(screen.getByRole('button', { name: 'Show all zones' }))
    expect(usePreviewStore.getState().zoneSoloId).toBeNull()
  })

  it('renders nothing when no zone preview strips are available', () => {
    const { container } = render(<ZonePreviewStrips />)

    expect(container).toBeEmptyDOMElement()
  })
})
