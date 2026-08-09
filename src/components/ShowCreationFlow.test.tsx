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
    const showName = screen.getByLabelText('Show name')
    expect(showName).toHaveClass('border-0', 'border-b', 'border-zinc-700', 'bg-transparent', 'focus:border-live/70')
    await user.clear(showName)
    await user.type(showName, 'Touring field')
    const previewPixels = screen.getByRole('textbox', { name: 'Preview pixels exact pixel count' })
    expect(screen.getByRole('button', { name: 'Adjust with pixel count slider' })).toBeInTheDocument()
    await user.clear(previewPixels)
    await user.type(previewPixels, '5000')
    await user.click(screen.getByRole('button', { name: 'Create Show' }))

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Touring field',
      outputContract: expect.objectContaining({
        version: 1,
        kind: 'portable-2d',
        referenceMapId: 'plane',
        referencePixelCount: 2000,
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

    expect(screen.getByRole('textbox', { name: 'Pixels exact pixel count' })).toHaveValue('384')
    expect(screen.getByRole('textbox', { name: 'Pixels exact pixel count' })).toBeDisabled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
