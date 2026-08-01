import { createRef } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import {
  EditableListItem,
  HeaderMenu,
  RailEmptyRow,
  RailEntityHeader,
  RailFilterBar,
  RailSectionScroller,
  railScrollResizeTargets,
  railScrollMetrics,
  StockListItem,
  StockSectionHeader,
} from './RailPrimitives'

describe('railScrollMetrics', () => {
  it('tracks asynchronously widening Pattern tree content (#662)', () => {
    const scroller = document.createElement('div')
    const personalTree = document.createElement('ul')
    const builtInTree = document.createElement('ul')
    scroller.append(personalTree, builtInTree)

    expect(railScrollResizeTargets(scroller)).toEqual([scroller, personalTree, builtInTree])
  })

  it('keeps one observed content box while asynchronous Pattern trees mount (#662)', () => {
    const scrollRef = createRef<HTMLDivElement>()
    const metrics = {
      top: 0,
      height: 0,
      visible: false,
      left: 0,
      width: 0,
      horizontalVisible: false,
    }
    const view = render(
      <RailSectionScroller
        testId="pattern-list-scroll"
        scrollRef={scrollRef}
        metrics={metrics}
        onScroll={vi.fn()}
        allowHorizontalScroll
      >
        <p>Signed-out Pattern state</p>
      </RailSectionScroller>,
    )
    const scroller = screen.getByTestId('pattern-list-scroll') as HTMLDivElement
    const content = screen.getByTestId('rail-scroll-content')
    expect(railScrollResizeTargets(scroller)).toEqual([scroller, content])

    view.rerender(
      <RailSectionScroller
        testId="pattern-list-scroll"
        scrollRef={scrollRef}
        metrics={metrics}
        onScroll={vi.fn()}
        allowHorizontalScroll
      >
        <ul role="tree" aria-label="Patterns"><li>A long personal Pattern</li></ul>
      </RailSectionScroller>,
    )
    expect(content).toContainElement(screen.getByRole('tree', { name: 'Patterns' }))
  })

  it('maps horizontal Pattern overflow onto a draggable thumb (#662)', () => {
    const metrics = railScrollMetrics({
      clientHeight: 100,
      scrollHeight: 100,
      scrollTop: 0,
      clientWidth: 120,
      scrollWidth: 300,
      scrollLeft: 90,
    } as HTMLDivElement)

    expect(metrics).toMatchObject({
      horizontalVisible: true,
      left: 36,
      width: 48,
    })
  })

  it('drags the visible horizontal thumb across Pattern overflow (#662)', () => {
    const scrollRef = createRef<HTMLDivElement>()
    render(
      <RailSectionScroller
        testId="pattern-list-scroll"
        scrollRef={scrollRef}
        metrics={{
          top: 0,
          height: 0,
          visible: false,
          left: 0,
          width: 48,
          horizontalVisible: true,
        }}
        onScroll={vi.fn()}
        allowHorizontalScroll
      >
        <div>Long Pattern name</div>
      </RailSectionScroller>,
    )
    const scroller = screen.getByTestId('pattern-list-scroll')
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 120 },
      scrollWidth: { configurable: true, value: 300 },
    })

    fireEvent.pointerDown(screen.getByTestId('rail-horizontal-scroll-thumb'), { clientX: 0 })
    fireEvent.pointerMove(window, { clientX: 36 })
    fireEvent.pointerUp(window)

    expect(scroller.scrollLeft).toBe(90)
  })
})

function renderEditableListItem({
  name = 'Lib1',
  noun = 'library',
  onRename = vi.fn(),
}: {
  name?: string
  noun?: Parameters<typeof EditableListItem>[0]['noun']
  onRename?: (name: string) => void
} = {}) {
  const rendered = render(
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
  return { onRename, ...rendered }
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

  it.each([
    ['pattern', 'lucide-file-code-corner'],
    ['show', 'lucide-panels-top-left'],
    ['map', 'lucide-map'],
    ['controller', 'lucide-cpu'],
    ['mixin', 'lucide-braces'],
    ['library', 'lucide-book-open'],
  ] as const)('gives %s rows their entity icon', (noun, iconClass) => {
    const { container } = renderEditableListItem({ noun })
    expect(container.querySelector(`.${iconClass}`)).toBeInTheDocument()
  })
})

describe('StockListItem', () => {
  it('opens from the keyboard', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<ul><StockListItem name="Square" noun="map" active={false} onSelect={onSelect} /></ul>)
    screen.getByRole('button', { name: 'Square' }).focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('uses the shared legible entity and fact hierarchy', () => {
    const { container } = render(<ul><StockListItem name="Square" noun="map" active={false} meta="2D" onSelect={vi.fn()} /></ul>)
    const row = screen.getByRole('button', { name: 'Square' })
    expect(row).toHaveClass('min-h-[20px]', 'text-[12px]', 'leading-[15px]', 'text-zinc-400')
    expect(screen.getByText('Square')).toHaveClass('line-clamp-2')
    expect(screen.getByText('Square')).toHaveAttribute('title', 'Square')
    expect(screen.getByText('2D')).toHaveClass('text-[9px]', 'text-zinc-400')
    expect(container.querySelector('.lucide-map')).toBeInTheDocument()
  })

  it('caps long entity names at two readable lines', () => {
    render(
      <ul>
        <StockListItem
          name="A deliberately long Pattern name that needs another line"
          noun="pattern"
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

describe('rail header alignment', () => {
  it('keeps Collapse leading and the action menu trailing', () => {
    render(
      <RailEntityHeader
        title="Shows"
        onCollapse={vi.fn()}
        action={<button type="button">Actions</button>}
      />,
    )

    const collapse = screen.getByRole('button', { name: 'Collapse rail' })
    const heading = screen.getByRole('heading', { name: 'Shows' })
    const actions = screen.getByRole('button', { name: 'Actions' })
    expect(collapse.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(heading.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })

  it('keeps Collapse rail above an open shared search overlay (#621)', async () => {
    const user = userEvent.setup()
    const onCollapse = vi.fn()
    render(
      <RailEntityHeader
        title="Patterns"
        onCollapse={onCollapse}
        action={<RailFilterBar query="signal" onQueryChange={vi.fn()} />}
      />,
    )

    const collapse = screen.getByRole('button', { name: 'Collapse rail' })
    expect(collapse).toHaveClass('relative', 'z-50')
    collapse.focus()
    await user.keyboard('{Enter}')
    expect(onCollapse).toHaveBeenCalledOnce()
  })

  it('aligns built-in disclosure labels with entity-tree rows', () => {
    render(<StockSectionHeader label="Built-in Shows" open onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Built-in Shows' })).toHaveClass('px-[6px]', 'text-[12px]')
  })
})

describe('RailEmptyRow', () => {
  it('uses normal row rhythm and aligns its null mark with entity titles', () => {
    const { container } = render(<RailEmptyRow label="No mixins yet" noun="mixin" />)
    const empty = screen.getByLabelText('No mixins yet')
    expect(empty).toHaveClass('min-h-[20px]', 'px-[6px]', 'text-[12px]', 'leading-[15px]')
    expect(empty).toHaveTextContent('—')
    expect(container.querySelector('.lucide-braces')).toHaveAttribute('stroke-dasharray', '2 2')
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
    expect(searchInput.parentElement).toHaveClass('absolute', 'right-0', 'w-28')
    expect(searchInput).toHaveClass('bg-zinc-900', 'border-zinc-700', 'pr-5')
    expect(search).toHaveClass('relative', 'z-40')
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
  it('presents create actions behind one named plus-icon menu button', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    const { container } = render(<HeaderMenu title="Add pattern" items={[{ label: 'New pattern', onSelect: create }]} />)

    expect(container.querySelector('.lucide-plus')).toBeInTheDocument()
    expect(container.querySelector('.lucide-menu')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New pattern' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add pattern' }))
    await user.click(screen.getByRole('button', { name: 'New pattern' }))

    expect(create).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'New pattern' })).not.toBeInTheDocument()
  })
})
