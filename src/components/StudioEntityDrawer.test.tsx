import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { StudioEntityDrawer, type StudioEntityDrawerHandle } from './StudioEntityDrawer'
import { RailEntityHeader, RailFilterBar } from './rail/RailPrimitives'
import { useStudioEntityDrawerStore } from '@/store/studioEntityDrawerStore'

function Harness({ onPreviewSpace = vi.fn() }: { onPreviewSpace?: () => void }) {
  const ref = useRef<StudioEntityDrawerHandle>(null)
  return (
    <StudioEntityDrawer
      ref={ref}
      place="shows"
      narrow={false}
      width={275}
      divider={<div data-testid="divider" />}
      drawer={(
        <div>
          <RailEntityHeader title="Shows" />
          <RailFilterBar query="" onQueryChange={vi.fn()} />
          <button type="button" role="treeitem" aria-selected="true" onClick={() => ref.current?.closeAfterEntitySelection()}>
            Current show
          </button>
        </div>
      )}
      onPreviewSpace={onPreviewSpace}
    >
      <main data-testid="workspace"><button type="button">Workspace action</button></main>
    </StudioEntityDrawer>
  )
}

describe('StudioEntityDrawer (#966)', () => {
  beforeEach(() => {
    localStorage.clear()
    useStudioEntityDrawerStore.setState({ pinPreferences: { shows: false } })
  })

  it('exposes the tucked tab, opens with Enter, focuses search, announces, and restores focus after choose', async () => {
    render(<Harness />)
    const tab = screen.getByRole('button', { name: 'Open the Shows list' })
    expect(tab).toHaveAttribute('aria-expanded', 'false')
    tab.focus()

    fireEvent.keyDown(tab, { key: 'Enter' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(tab).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('textbox', { name: 'Search by name' })).toHaveFocus()
    expect(screen.getByText('Shows list open')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('treeitem', { name: 'Current show' }))
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(tab).toHaveAttribute('aria-expanded', 'false')
    expect(tab).toHaveFocus()
    expect(screen.getByText('Shows list closed')).toBeInTheDocument()
  })

  it('keeps Space assigned to Preview instead of opening the edge tab', () => {
    const onPreviewSpace = vi.fn()
    render(<Harness onPreviewSpace={onPreviewSpace} />)
    const tab = screen.getByRole('button', { name: 'Open the Shows list' })
    fireEvent.keyDown(tab, { key: ' ', code: 'Space' })
    expect(onPreviewSpace).toHaveBeenCalledOnce()
    expect(tab).toHaveAttribute('aria-expanded', 'false')
  })

  it('treats an explicitly owned portaled busy surface as inside and suppresses outside close', () => {
    render(<Harness />)
    const tab = screen.getByRole('button', { name: 'Open the Shows list' })
    fireEvent.click(tab)

    const portal = document.createElement('div')
    portal.dataset.studioDrawerOwner = 'studio-entity-list'
    portal.dataset.studioDrawerBusy = 'true'
    portal.dataset.studioDrawerBusyKind = 'dialog'
    document.body.append(portal)
    fireEvent.pointerDown(portal)
    fireEvent.pointerDown(screen.getByTestId('workspace'))
    expect(tab).toHaveAttribute('aria-expanded', 'true')

    portal.remove()
    fireEvent.pointerDown(screen.getByTestId('workspace'))
    expect(tab).toHaveAttribute('aria-expanded', 'false')
  })

  it('releases focused search on the first Escape and closes on the second', async () => {
    render(<Harness />)
    const tab = screen.getByRole('button', { name: 'Open the Shows list' })
    fireEvent.keyDown(tab, { key: 'Enter' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    const search = screen.getByRole('textbox', { name: 'Search by name' })
    expect(search).toHaveFocus()

    fireEvent.keyDown(search, { key: 'Escape' })
    expect(search).not.toHaveFocus()
    expect(tab).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(tab).toHaveAttribute('aria-expanded', 'false')
  })

  it('reacquires focus after list hydration replaces the field without stealing it after an intentional departure', async () => {
    render(<Harness />)
    const tab = screen.getByRole('button', { name: 'Open the Shows list' })
    fireEvent.keyDown(tab, { key: 'Enter' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    const originalSearch = screen.getByRole('textbox', { name: 'Search by name' })
    const replacement = originalSearch.cloneNode(true) as HTMLInputElement
    originalSearch.replaceWith(replacement)
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(replacement).toHaveFocus()

    const workspaceAction = screen.getByRole('button', { name: 'Workspace action' })
    workspaceAction.focus()
    replacement.parentElement?.append(document.createElement('span'))
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(workspaceAction).toHaveFocus()
  })

  it('shows the close timer after a pointer leave, cancels on re-entry, and closes after 600 ms', () => {
    vi.useFakeTimers()
    render(<Harness />)
    const tab = screen.getByRole('button', { name: 'Open the Shows list' })
    fireEvent.click(tab)
    const drawer = screen.getByTestId('studio-entity-drawer')

    fireEvent.pointerLeave(drawer)
    expect(screen.getByTestId('studio-drawer-close-progress')).toBeInTheDocument()
    fireEvent.pointerEnter(drawer)
    expect(screen.queryByTestId('studio-drawer-close-progress')).not.toBeInTheDocument()

    fireEvent.pointerLeave(drawer)
    act(() => vi.advanceTimersByTime(600))
    expect(tab).toHaveAttribute('aria-expanded', 'false')
    vi.useRealTimers()
  })
})
