import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addShowZone, createShowWithOutputContract } from '@/engine/showModel'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { ShowZoneSpatialSelector } from './ShowZoneSpatialSelector'

function fixture() {
  let show = createShowWithOutputContract(
    'show-spatial',
    'Spatial',
    createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 4 }),
    1,
  )
  show = addShowZone(show, { name: 'accent', nominalPixelCount: 2, color: '#f97316' })
  show.routingLayouts[0].zones = [
    { zoneId: 'zone-1', ranges: [{ start: 0, end: 1 }] },
    { zoneId: 'zone-2', ranges: [{ start: 2, end: 3 }] },
  ]
  return show
}

describe('ShowZoneSpatialSelector (#340)', () => {
  it('previews replace, add, and subtract drags before committing exact indexes', async () => {
    const user = userEvent.setup()
    const show = fixture()
    const onCommit = vi.fn()
    render(
      <ShowZoneSpatialSelector
        show={show}
        zone={show.zones[0]}
        layoutId="layout-1"
        mapName="Square"
        points={[
          { x: 0.1, y: 0.1 },
          { x: 0.4, y: 0.4 },
          { x: 0.7, y: 0.7 },
          { x: 0.9, y: 0.9 },
        ]}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    )
    const surface = screen.getByLabelText('Select LEDs for zone main')
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 120, clientY: 120 })
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 200, clientY: 200 })
    expect(surface.querySelector('rect[stroke="#fbbf24"]')).toBeInTheDocument()
    expect(surface.querySelector('circle[data-index="0"]')).toHaveAttribute('fill', show.zones[0].color)
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 200, clientY: 200 })
    expect(screen.getByText('Indexes 2-3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add selection' }))
    fireEvent.pointerDown(surface, { pointerId: 2, clientX: 0, clientY: 0 })
    fireEvent.pointerUp(surface, { pointerId: 2, clientX: 30, clientY: 30 })
    expect(screen.getByText('Indexes 0, 2-3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Subtract selection' }))
    fireEvent.pointerDown(surface, { pointerId: 3, clientX: 130, clientY: 130 })
    fireEvent.pointerUp(surface, { pointerId: 3, clientX: 150, clientY: 150 })
    expect(screen.getByText('Indexes 0, 3')).toBeInTheDocument()
    expect(screen.getByText(/2 selected.*3 assigned of 4 total.*1 missing.*1 overlapping/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save physical zone' }))
    expect(onCommit).toHaveBeenCalledWith([0, 3])
  })

  it('cancels from the focused selection surface with Escape', () => {
    const show = fixture()
    const onCancel = vi.fn()
    render(
      <ShowZoneSpatialSelector
        show={show}
        zone={show.zones[0]}
        layoutId="layout-1"
        mapName="Square"
        points={[]}
        onCommit={vi.fn()}
        onCancel={onCancel}
      />,
    )
    const surface = screen.getByLabelText('Select LEDs for zone main')
    surface.focus()
    fireEvent.keyDown(surface, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
