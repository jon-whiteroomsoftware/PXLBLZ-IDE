import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDefaultShow } from '@/engine/showModel'
import { ShowClassificationFlow } from './ShowClassificationFlow'

const maps = [
  { id: 'plane', name: 'Square', dim: 2 as const, source: 'stock' as const },
  { id: 'measured', name: 'Measured sculpture', dim: 3 as const, source: 'user' as const, fixedPixelCount: 384 },
]

describe('ShowClassificationFlow (#438)', () => {
  it('shows current facts and prefills a Portable classification without mutating the Show', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const show = createDefaultShow('legacy', 'Legacy field')
    show.stageMapId = 'plane'
    show.routingLayouts[0].zones = []
    show.routingLayouts[0].logical = { kind: 'single', zoneIds: ['zone-1'] }

    render(
      <ShowClassificationFlow
        show={show}
        maps={maps}
        modeledPixelCount={60}
        targetControllerName={null}
        reasons={['Stage dimension does not prove a contract.']}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Classify this legacy Show' })).toBeInTheDocument()
    expect(screen.getByText('Square')).toBeInTheDocument()
    expect(screen.getByText('60 pixels')).toBeInTheDocument()
    expect(screen.getByText('No target Controller')).toBeInTheDocument()
    expect(screen.getByText(/logical Stage routing/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use Portable contract' }))
    expect(screen.getByRole('option', { name: 'Square · Preview size' })).toBeInTheDocument()
    expect(screen.getByLabelText('Reference map')).toHaveValue('plane')
    expect(screen.getByLabelText('Reference pixels')).toHaveValue(60)
    await user.click(screen.getByRole('button', { name: 'Confirm classification' }))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 60,
    }))
    expect(show.outputContract).toBeUndefined()
  })

  it('cancels from the comparison on Escape', () => {
    const onCancel = vi.fn()
    const show = createDefaultShow('legacy', 'Legacy field')
    show.routingLayouts[0].zones = []
    render(
      <ShowClassificationFlow
        show={show}
        maps={maps}
        modeledPixelCount={60}
        targetControllerName="Lobby Controller"
        reasons={[]}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
