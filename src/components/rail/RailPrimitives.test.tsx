import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { EditableListItem, RailFilterBar, StockListItem } from './RailPrimitives'

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
    expect(row).toHaveClass('min-h-[20px]', 'text-[12px]', 'leading-[15px]', 'text-zinc-400')
    expect(screen.getByText('Square')).toHaveClass('line-clamp-2')
    expect(screen.getByText('Square')).toHaveAttribute('title', 'Square')
    expect(screen.getByText('2D')).toHaveClass('text-[9px]', 'text-zinc-400')
  })

  it('caps long entity names at two readable lines', () => {
    render(
      <ul>
        <StockListItem
          name="A deliberately long Pattern name that needs another line"
          active={false}
          meta="2D"
          onSelect={vi.fn()}
        />
      </ul>,
    )

    expect(screen.getByText('A deliberately long Pattern name that needs another line')).toHaveClass(
      'line-clamp-2',
      'break-words',
    )
  })
})

describe('RailFilterBar', () => {
  it('keeps the dimension lens compact enough to leave room for Search', () => {
    render(
      <RailFilterBar
        lens="all"
        onLensChange={vi.fn()}
        query=""
        onQueryChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('radiogroup', { name: 'Dimension filter' })).toHaveClass('gap-px')
    for (const option of ['All', '1D', '2D', '3D']) {
      expect(screen.getByRole('radio', { name: option })).toHaveClass('px-[5px]')
    }
    expect(screen.getByRole('button', { name: 'Search by name' })).toBeVisible()
  })
})
