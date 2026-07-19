import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { EditableListItem, HeaderMenu, RailFilterBar, StockListItem } from './RailPrimitives'

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
  it('uses a compact dimension selector that leaves room for Search', () => {
    render(
      <RailFilterBar
        lens="all"
        onLensChange={vi.fn()}
        query=""
        onQueryChange={vi.fn()}
      />,
    )

    const search = screen.getByRole('button', { name: 'Search by name' })
    const selector = screen.getByRole('button', { name: 'Dimension filter' })
    expect(selector).toHaveTextContent('All')
    expect(search.compareDocumentPosition(selector) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    const searchInput = screen.getByRole('textbox', { name: 'Search by name' })
    expect(searchInput.parentElement).toHaveClass('absolute', 'right-full')
    expect(searchInput).toHaveClass('bg-zinc-900', 'border-zinc-700')
  })

  it('opens a dark listbox and changes the active dimension', async () => {
    const user = userEvent.setup()
    const onLensChange = vi.fn()
    render(
      <RailFilterBar
        lens="all"
        onLensChange={onLensChange}
        query=""
        onQueryChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Dimension filter' }))
    const listbox = screen.getByRole('listbox', { name: 'Dimension filter' })
    expect(listbox).toHaveClass('bg-zinc-900', 'border-zinc-800')
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual(['All', '1D', '2D', '3D'])
    await user.click(within(listbox).getByRole('option', { name: '2D' }))

    expect(onLensChange).toHaveBeenCalledWith(2)
  })
})

describe('HeaderMenu', () => {
  it('keeps secondary header actions behind one named menu button', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    render(<HeaderMenu title="Pattern actions" items={[{ label: 'New pattern', onSelect: create }]} />)

    expect(screen.queryByRole('button', { name: 'New pattern' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pattern actions' }))
    await user.click(screen.getByRole('button', { name: 'New pattern' }))

    expect(create).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'New pattern' })).not.toBeInTheDocument()
  })
})
