import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { sanitizeLibraryNameInput } from '@/engine/libraries'
import { InlineEntityTitle } from './InlineEntityTitle'

describe('InlineEntityTitle', () => {
  it('renames from the title with Return or the explicit apply action', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    const { rerender } = render(<InlineEntityTitle name="Aurora" noun="pattern" onRename={onRename} />)

    await user.click(screen.getByRole('button', { name: 'Rename pattern Aurora' }))
    const input = screen.getByRole('textbox', { name: 'Pattern name' })
    await user.clear(input)
    await user.type(input, 'Aurora Field{Enter}')
    expect(onRename).toHaveBeenCalledWith('Aurora Field')

    rerender(<InlineEntityTitle name="Aurora Field" noun="pattern" onRename={onRename} />)
    await user.click(screen.getByRole('button', { name: 'Rename pattern Aurora Field' }))
    await user.clear(screen.getByRole('textbox', { name: 'Pattern name' }))
    await user.type(screen.getByRole('textbox', { name: 'Pattern name' }), 'Aurora Bloom')
    await user.click(screen.getByRole('button', { name: 'Apply pattern name' }))
    expect(onRename).toHaveBeenLastCalledWith('Aurora Bloom')
  })

  it('cancels without renaming from the explicit action or Escape', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    render(<InlineEntityTitle name="Aurora" noun="pattern" onRename={onRename} />)

    await user.click(screen.getByRole('button', { name: 'Rename pattern Aurora' }))
    await user.type(screen.getByRole('textbox', { name: 'Pattern name' }), ' changed')
    await user.click(screen.getByRole('button', { name: 'Cancel pattern rename' }))
    expect(onRename).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Rename pattern Aurora' }))
    await user.type(screen.getByRole('textbox', { name: 'Pattern name' }), ' changed')
    await user.keyboard('{Escape}')
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Rename pattern Aurora' })).toBeInTheDocument()
  })

  it('keeps the title footprint stable and floats edit actions outside layout flow', async () => {
    const user = userEvent.setup()
    render(<InlineEntityTitle name="Aurora" noun="pattern" onRename={vi.fn()} />)

    const title = screen.getByRole('button', { name: 'Rename pattern Aurora' })
    await user.click(title)

    expect(title).toBeInTheDocument()
    expect(title).toHaveClass('invisible')
    expect(screen.getByRole('textbox', { name: 'Pattern name' })).toHaveClass(
      'absolute',
      'inset-0',
      'size-full',
      '[font:inherit]',
    )
    expect(screen.getByTestId('inline-title-actions')).toHaveClass(
      'absolute',
      'left-full',
      'top-1/2',
    )
  })

  it('keeps invalid and duplicate names open with an accessible error', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    render(
      <InlineEntityTitle
        name="Lib1"
        noun="library"
        onRename={onRename}
        takenNames={['Color']}
        sanitizeInput={sanitizeLibraryNameInput}
        validateName={(name) => name === 'hsv' ? 'hsv is a built-in name' : null}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Rename library Lib1' }))
    const input = screen.getByRole('textbox', { name: 'Library name' })
    await user.clear(input)
    await user.type(input, '123 My-Lib')
    expect(input).toHaveValue('MyLib')

    await user.clear(input)
    await user.type(input, 'Color{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('A library with that name already exists')
    expect(onRename).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, 'hsv{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('hsv is a built-in name')
    expect(onRename).not.toHaveBeenCalled()
  })

  it('renders a non-editable title without a rename control', () => {
    render(<InlineEntityTitle name="Pixelblaze shelf" noun="controller" />)
    expect(screen.getByText('Pixelblaze shelf')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rename controller/ })).not.toBeInTheDocument()
  })

  it('keeps an in-flight failure visible when rename availability disappears', async () => {
    const user = userEvent.setup()
    let rejectRename!: (reason: Error) => void
    const onRename = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectRename = reject
    }))
    const { rerender } = render(
      <InlineEntityTitle name="Burner bag" noun="controller" onRename={onRename} />,
    )

    await user.click(screen.getByRole('button', { name: 'Rename controller Burner bag' }))
    await user.clear(screen.getByRole('textbox', { name: 'Controller name' }))
    await user.type(screen.getByRole('textbox', { name: 'Controller name' }), 'Road case{Enter}')
    rerender(<InlineEntityTitle name="Burner bag" noun="controller" />)
    rejectRename(new Error('Controller connection changed before the rename completed'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Controller connection changed')
    expect(screen.getByRole('textbox', { name: 'Controller name' })).toBeInTheDocument()
  })
})
