import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { EditableListItem, StockListItem } from './RailPrimitives'

function renderEditableListItem({
  name = 'Lib1',
  noun = 'library',
  onRename = vi.fn(),
}: {
  name?: string
  noun?: Parameters<typeof EditableListItem>[0]['noun']
  onRename?: (name: string) => void
} = {}) {
  render(
    <ul>
      <EditableListItem
        name={name}
        noun={noun}
        active={false}
        takenNames={[]}
        onSelect={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />
    </ul>,
  )
  return { onRename }
}

describe('EditableListItem', () => {
  it('keeps library namespace edits inside the Pixelblaze identifier character set', async () => {
    const user = userEvent.setup()
    const { onRename } = renderEditableListItem()

    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const input = screen.getByDisplayValue('Lib1')
    await user.clear(input)
    await user.type(input, '123Jons Lib-1')

    expect(input).toHaveValue('JonsLib1')

    await user.keyboard('{Enter}')
    expect(onRename).toHaveBeenCalledWith('JonsLib1')
  })

  it('leaves non-library row names unconstrained by the library namespace filter', async () => {
    const user = userEvent.setup()
    renderEditableListItem({ name: 'Pattern 1', noun: 'pattern' })

    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const input = screen.getByDisplayValue('Pattern 1')
    await user.clear(input)
    await user.type(input, 'Bad Name-1')

    expect(input).toHaveValue('Bad Name-1')
  })
})

describe('StockListItem', () => {
  it('opens from the keyboard', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<ul><StockListItem name="Square" active={false} onSelect={onSelect} /></ul>)
    screen.getByRole('button', { name: 'Square' }).focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('uses the shared legible entity and fact hierarchy', () => {
    render(<ul><StockListItem name="Square" active={false} meta="2D" onSelect={vi.fn()} /></ul>)
    const row = screen.getByRole('button', { name: 'Square' })
    expect(row).toHaveClass('min-h-[21px]', 'text-xs', 'leading-4', 'text-zinc-400')
    expect(screen.getByText('2D')).toHaveClass('text-[9px]', 'text-zinc-400')
  })
})
