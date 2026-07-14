import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShowCreationFlow } from './ShowCreationFlow'

const maps = [
  { id: 'plane', name: 'Square', dim: 2 as const, source: 'stock' as const },
  { id: 'measured', name: 'Measured sculpture', dim: 3 as const, source: 'user' as const, fixedPixelCount: 384 },
]

describe('ShowCreationFlow (#434)', () => {
  it('compares the permanent promises before collecting Portable setup', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<ShowCreationFlow maps={maps} onCreate={onCreate} onCancel={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Choose how this Show will run' })).toBeInTheDocument()
    expect(screen.getByText('LED-resolution independent')).toBeInTheDocument()
    expect(screen.getByText(/32×32, 128×12/)).toBeInTheDocument()
    expect(screen.getByText('Exact pixel and map identity')).toBeInTheDocument()
    expect(screen.getByText(/exact LED groups/i)).toBeInTheDocument()

    const portableAction = screen.getByRole('button', { name: 'Create Portable Show' })
    const installationAction = screen.getByRole('button', { name: 'Create Installation Show' })
    expect(portableAction).toHaveTextContent(/^Create$/)
    expect(installationAction).toHaveTextContent(/^Create$/)
    expect(portableAction.closest('header')).toHaveTextContent('Portable Show')
    expect(installationAction.closest('header')).toHaveTextContent('Installation Show')
    expect(screen.getByRole('img', { name: /portable shows adapt/i }).tagName).toBe('svg')
    expect(screen.getByRole('img', { name: /installation shows address/i }).tagName).toBe('svg')

    await user.click(portableAction)
    await user.clear(screen.getByLabelText('Show name'))
    await user.type(screen.getByLabelText('Show name'), 'Touring field')
    await user.clear(screen.getByLabelText('Reference pixels'))
    await user.type(screen.getByLabelText('Reference pixels'), '1024')
    await user.click(screen.getByRole('button', { name: 'Create Show' }))

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Touring field',
      outputContract: expect.objectContaining({
        version: 1,
        kind: 'portable-2d',
        referenceMapId: 'plane',
        referencePixelCount: 1024,
      }),
    }))
  })

  it('locks Installation pixels to a fixed map count and cancels on workspace Escape', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ShowCreationFlow maps={maps} onCreate={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Create Installation Show' }))
    expect(screen.getByRole('option', { name: 'Square · Preview size' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Measured sculpture · Fixed size · 384 px' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Output map'), 'measured')

    expect(screen.getByLabelText('Pixels')).toHaveValue(384)
    expect(screen.getByLabelText('Pixels')).toBeDisabled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
