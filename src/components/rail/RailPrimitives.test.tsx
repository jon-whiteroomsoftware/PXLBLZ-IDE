import { createRef } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('keeps one observed content box while asynchronous Pattern trees mount (#662)', async () => {
    const scrollRef = createRef<HTMLDivElement>()
    const onContentChange = vi.fn()
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
        onScroll={onContentChange}
        allowHorizontalScroll
      >
        <p>Signed-out Pattern state</p>
      </RailSectionScroller>,
    )
    const scroller = screen.getByTestId('pattern-list-scroll') as HTMLDivElement
    const content = screen.getByTestId('rail-scroll-content')
    expect(railScrollResizeTargets(scroller)).toEqual([scroller, content])
    expect(content).not.toHaveClass('w-max')
    onContentChange.mockClear()

    view.rerender(
      <RailSectionScroller
        testId="pattern-list-scroll"
        scrollRef={scrollRef}
        metrics={metrics}
        onScroll={onContentChange}
        allowHorizontalScroll
      >
        <ul role="tree" aria-label="Patterns"><li>A long personal Pattern</li></ul>
      </RailSectionScroller>,
    )
    expect(content).toContainElement(screen.getByRole('tree', { name: 'Patterns' }))
    await waitFor(() => expect(onContentChange).toHaveBeenCalled())
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
  onSelect = vi.fn(),
  onRename = vi.fn(),
}: {
  name?: string
  noun?: Parameters<typeof EditableListItem>[0]['noun']
  onSelect?: () => void
  onRename?: (name: string) => void
} = {}) {
  const rendered = render(
    <ul>
      <EditableListItem
        name={name}
        noun={noun}
        active={false}
        takenNames={[]}
        onSelect={onSelect}
        onRename={onRename}
        onDelete={vi.fn()}
      />
    </ul>,
  )
  return { onSelect, onRename, ...rendered }
}

describe('EditableListItem', () => {
  it('keeps status and dimension decorations off the action hit-test path (#807)', () => {
    render(
      <ul>
        <EditableListItem
          name="Controller profile"
          noun="controller"
          active={false}
          badge="IDLE"
          dim="2D"
          takenNames={[]}
          onSelect={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />
      </ul>,
    )

    expect(screen.getByText('IDLE')).toHaveClass('pointer-events-none')
    expect(screen.getByText('2D')).toHaveClass('pointer-events-none')
  })

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

  it('requires an explicit action and cancels a rename on blur', async () => {
    const user = userEvent.setup()
    const { onRename } = renderEditableListItem({ name: 'Pattern 1', noun: 'pattern' })

    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const input = screen.getByDisplayValue('Pattern 1')
    await user.clear(input)
    await user.type(input, 'Pattern 2')
    await user.click(document.body)
    expect(onRename).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const reopenedInput = screen.getByDisplayValue('Pattern 1')
    await user.clear(reopenedInput)
    await user.type(reopenedInput, 'Pattern 2')
    await user.click(screen.getByRole('button', { name: 'Apply pattern rename' }))
    expect(onRename).toHaveBeenCalledWith('Pattern 2')
  })

  it('keeps rename Apply and Cancel actions from selecting the row', async () => {
    const user = userEvent.setup()
    const { onSelect, onRename } = renderEditableListItem({ name: 'Pattern 1', noun: 'pattern' })

    await user.click(screen.getByRole('button', { name: 'Rename' }))
    await user.clear(screen.getByDisplayValue('Pattern 1'))
    await user.type(screen.getByRole('textbox'), 'Pattern 2')
    await user.click(screen.getByRole('button', { name: 'Cancel pattern rename edit' }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(onRename).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Rename' }))
    await user.clear(screen.getByDisplayValue('Pattern 1'))
    await user.type(screen.getByRole('textbox'), 'Pattern 2')
    await user.click(screen.getByRole('button', { name: 'Apply pattern rename' }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(onRename).toHaveBeenCalledWith('Pattern 2')
  })

  it.each([
    ['pattern', 'lucide-file-code-corner'],
    ['show', 'lucide-film'],
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
  it('keeps its dimension decoration off the row hit-test path (#807)', () => {
    render(<ul><StockListItem name="Square" noun="map" active={false} meta="2D" onSelect={vi.fn()} /></ul>)

    expect(screen.getByText('2D')).toHaveClass('pointer-events-none')
  })

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
  it('keeps search leading and the housing control trailing', () => {
    render(<RailEntityHeader title="Shows" onQueryChange={vi.fn()} onCollapse={vi.fn()} action={<button type="button">Actions</button>} />)
    const search = screen.getByRole('textbox', { name: 'Search shows' })
    const actions = screen.getByRole('button', { name: 'Actions' })
    const collapse = screen.getByRole('button', { name: 'Collapse rail' })
    expect(search.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(actions.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })

  it('keeps the housing action keyboard accessible while searching (#621)', async () => {
    const user = userEvent.setup()
    const onCollapse = vi.fn()
    render(<RailEntityHeader title="Patterns" onCollapse={onCollapse} query="signal" onQueryChange={vi.fn()} />)
    screen.getByRole('button', { name: 'Collapse rail' }).focus()
    await user.keyboard('{Enter}')
    expect(onCollapse).toHaveBeenCalledOnce()
  })

  it('aligns built-in disclosure labels with entity-tree rows', () => {
    render(<StockSectionHeader label="Built-in Shows" open onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Built-in Shows' })).toHaveClass('px-[6px]', 'text-[12px]')
  })

  it('keeps a permanent named search field and clears it on Escape (#976)', async () => {
    const user = userEvent.setup()
    const onQueryChange = vi.fn()
    render(<RailEntityHeader title="Shows" query="over" onQueryChange={onQueryChange} />)
    expect(screen.queryByRole('heading', { name: 'Shows' })).not.toBeInTheDocument()
    const search = screen.getByRole('textbox', { name: 'Search shows' })
    expect(search).toHaveValue('over')
    await user.click(search)
    await user.keyboard('{Escape}')
    expect(onQueryChange).toHaveBeenCalledWith('')
    expect(search).toHaveFocus()
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
  it('offers dimension pills with an idle count and a filtered count (#976)', async () => {
    const user = userEvent.setup()
    const onLensChange = vi.fn()
    const view = render(<RailFilterBar lens="all" onLensChange={onLensChange} query="" count={12} total={12} noun="patterns" />)
    expect(screen.getByText('12 patterns')).toBeVisible()
    const group = screen.getByRole('group', { name: 'Dimension filter' })
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['All', '1D', '2D', '3D'])
    await user.click(within(group).getByRole('button', { name: '2D' }))
    expect(onLensChange).toHaveBeenCalledWith(2)
    view.rerender(<RailFilterBar lens={2} onLensChange={onLensChange} query="" count={4} total={12} noun="patterns" />)
    expect(screen.getByRole('button', { name: '2D' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('4 of 12')).toBeVisible()
  })

  it('only shows a count row for unfiltered types while searching (#976)', () => {
    const view = render(<RailFilterBar query="" count={12} total={12} noun="shows" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    view.rerender(<RailFilterBar query="over" count={1} total={12} noun="shows" />)
    expect(screen.getByRole('status')).toHaveTextContent('1 of 12')
    view.rerender(<RailFilterBar query="" count={12} total={12} noun="shows" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
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
