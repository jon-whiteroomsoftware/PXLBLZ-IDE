import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useRef, useState } from 'react'
import { StudioEntityDrawer, type StudioEntityDrawerHandle } from './StudioEntityDrawer'
import { RailEntityHeader } from './rail/RailPrimitives'
import { EntityOrganizationTree } from './rail/EntityOrganizationTree'
import { useStudioEntityDrawerStore } from '@/store/studioEntityDrawerStore'

function MountProbe({ mounted, unmounted }: { mounted: () => void; unmounted: () => void }) {
  useEffect(() => {
    mounted()
    return unmounted
  }, [mounted, unmounted])
  return <RailEntityHeader title="Shows" />
}

function Harness({ onPreviewSpace = vi.fn(), routeKey = 'shows/one', place = 'shows', narrow = false }: {
  onPreviewSpace?: () => void
  routeKey?: string
  place?: 'shows' | 'maps'
  narrow?: boolean
}) {
  const ref = useRef<StudioEntityDrawerHandle>(null)
  const [query, setQuery] = useState('')
  return (
    <StudioEntityDrawer
      ref={ref}
      place={place}
      routeKey={routeKey}
      narrow={narrow}
      width={275}
      divider={<div data-testid="divider" />}
      drawer={(
        <div>
          <RailEntityHeader title="Shows" query={query} onQueryChange={setQuery} />
          <button type="button" role="treeitem" aria-selected="true" onClick={() => ref.current?.closeAfterEntitySelection()}>
            Current show
          </button>
        </div>
      )}
      onPreviewSpace={onPreviewSpace}
    >
      <main data-testid="workspace" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button">Workspace action</button>
        <input aria-label="Workspace field" />
      </main>
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
    expect(tab).not.toHaveAttribute('aria-hidden')
    expect(tab).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('textbox', { name: 'Search shows' })).toHaveFocus()
    expect(screen.getByText('Shows list open')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('treeitem', { name: 'Current show' }))
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(tab).toHaveAttribute('aria-expanded', 'false')
    expect(tab).toHaveFocus()
    expect(screen.getByText('Shows list closed')).toBeInTheDocument()
  })

  it('opens with Command/Ctrl+Shift+L from controls but leaves editable fields alone', async () => {
    render(<Harness />)
    const layout = screen.getByTestId('studio-drawer-layout')
    const workspaceAction = screen.getByRole('button', { name: 'Workspace action' })
    workspaceAction.focus()
    fireEvent.keyDown(workspaceAction, { key: 'l', metaKey: true, shiftKey: true })
    expect(layout).toHaveAttribute('data-drawer-mode', 'open')

    fireEvent.pointerDown(screen.getByTestId('workspace'))
    const field = screen.getByRole('textbox', { name: 'Workspace field' })
    field.focus()
    fireEvent.keyDown(field, { key: 'l', ctrlKey: true, shiftKey: true })
    expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')
  })

  it('keeps the entity list mounted while pinning, tucking, and opening', () => {
    const mounted = vi.fn()
    const unmounted = vi.fn()
    useStudioEntityDrawerStore.setState({ pinPreferences: { shows: true } })
    render(
      <StudioEntityDrawer
        place="shows"
        narrow={false}
        width={275}
        divider={<div />}
        drawer={<MountProbe mounted={mounted} unmounted={unmounted} />}
        onPreviewSpace={vi.fn()}
      >
        <main />
      </StudioEntityDrawer>,
    )
    expect(mounted).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Unpin Shows list' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open the Shows list' }))
    expect(mounted).toHaveBeenCalledOnce()
    expect(unmounted).not.toHaveBeenCalled()
  })

  it('lets an owned row menu consume the first Escape before the drawer consumes the second', async () => {
    const ref = { current: null as StudioEntityDrawerHandle | null }
    render(
      <StudioEntityDrawer
        ref={ref}
        place="shows"
        narrow={false}
        width={275}
        divider={<div />}
        drawer={(
          <EntityOrganizationTree
            organization={{ version: 1, nodes: [{ kind: 'entity', entityId: 'show-a' }], trash: [], collapsedFolderIds: [] }}
            items={[{ id: 'show-a', name: 'Opening' }]}
            activeEntityId={null}
            query=""
            noun="show"
            onSelect={vi.fn()}
            onRenameEntity={vi.fn()}
            onOrganizationChange={vi.fn()}
          />
        )}
        onPreviewSpace={vi.fn()}
      >
        <main />
      </StudioEntityDrawer>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open the Shows list' }))
    const menuTrigger = screen.getByRole('button', { name: 'More actions for Opening' })
    menuTrigger.focus()
    fireEvent.click(menuTrigger)
    const menuAction = screen.getByRole('button', { name: 'Rename' })
    expect(menuAction).toHaveFocus()

    fireEvent.keyDown(menuAction, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Move to Trash' })).not.toBeInTheDocument()
    expect(screen.getByTestId('studio-drawer-layout')).toHaveAttribute('data-drawer-mode', 'open')
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByTestId('studio-drawer-layout')).toHaveAttribute('data-drawer-mode', 'tucked')
  })

  it('keeps Space assigned to Preview instead of opening the edge tab', () => {
    const onPreviewSpace = vi.fn()
    render(<Harness onPreviewSpace={onPreviewSpace} />)
    const tab = screen.getByRole('button', { name: 'Open the Shows list' })
    fireEvent.keyDown(tab, { key: ' ', code: 'Space' })
    fireEvent.keyDown(tab, { key: ' ', code: 'Space', repeat: true })
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

  it('clears active search before releasing focus or closing the drawer (#976)', async () => {
    render(<Harness />)
    const tab = screen.getByRole('button', { name: 'Open the Shows list' })
    fireEvent.keyDown(tab, { key: 'Enter' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    const search = screen.getByRole('textbox', { name: 'Search shows' })
    fireEvent.change(search, { target: { value: 'over' } })
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(search).toHaveValue('')
    expect(search).toHaveFocus()
    expect(tab).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('button', { name: 'Close Shows list' })).not.toBeInTheDocument()
  })

  it('releases focused search on the first Escape and closes on the second', async () => {
    render(<Harness />)
    const tab = screen.getByRole('button', { name: 'Open the Shows list' })
    fireEvent.keyDown(tab, { key: 'Enter' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    const search = screen.getByRole('textbox', { name: 'Search shows' })
    expect(search).toHaveFocus()

    fireEvent.keyDown(search, { key: 'Escape' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
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

    const originalSearch = screen.getByRole('textbox', { name: 'Search shows' })
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

  it('closes silently after 600 ms and cancels pending close on pointer return (#980)', () => {
    vi.useFakeTimers()
    render(<Harness />)
    const tab = screen.getByRole('button', { name: 'Open the Shows list' })
    fireEvent.click(tab)
    const drawer = screen.getByTestId('studio-entity-drawer')

    fireEvent.pointerLeave(drawer)
    expect(screen.queryByTestId('studio-drawer-close-progress')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(300))
    expect(tab).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerEnter(drawer)
    expect(screen.queryByTestId('studio-drawer-close-progress')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(600))
    expect(tab).toHaveAttribute('aria-expanded', 'true')

    fireEvent.pointerLeave(drawer)
    act(() => vi.advanceTimersByTime(599))
    expect(tab).toHaveAttribute('aria-expanded', 'true')
    act(() => vi.advanceTimersByTime(1))
    expect(tab).toHaveAttribute('aria-expanded', 'false')
    vi.useRealTimers()
  })
})


describe('Studio entity drawer hover (#981)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useStudioEntityDrawerStore.setState({ pinPreferences: { shows: false } })
  })
  afterEach(() => { vi.useRealTimers() })

  it('opens after 150 ms without moving keyboard focus and restarts dwell after leaving', () => {
    render(<Harness />)
    const edge = screen.getByRole('button', { name: 'Open the Shows list' })
    const field = screen.getByRole('textbox', { name: 'Workspace field' })
    field.focus()
    fireEvent.pointerEnter(edge)
    act(() => { vi.advanceTimersByTime(149) })
    expect(edge).toHaveAttribute('aria-expanded', 'false')
    fireEvent.pointerLeave(edge)
    act(() => { vi.advanceTimersByTime(150) })
    expect(edge).toHaveAttribute('aria-expanded', 'false')
    fireEvent.pointerEnter(edge)
    act(() => { vi.advanceTimersByTime(149) })
    expect(edge).toHaveAttribute('aria-expanded', 'false')
    act(() => { vi.advanceTimersByTime(1) })
    expect(edge).toHaveAttribute('aria-expanded', 'true')
    expect(field).toHaveFocus()
  })

  it.each(['pointer', 'native'] as const)('cancels pending hover and suppresses crossing during a %s drag', (kind) => {
    render(<Harness />)
    const edge = screen.getByRole('button', { name: 'Open the Shows list' })
    const workspace = screen.getByTestId('workspace')
    fireEvent.pointerEnter(edge)
    act(() => { vi.advanceTimersByTime(100) })
    if (kind === 'pointer') fireEvent.pointerDown(workspace)
    else fireEvent.dragStart(workspace)
    act(() => { vi.advanceTimersByTime(150) })
    expect(edge).toHaveAttribute('aria-expanded', 'false')
    fireEvent.pointerLeave(edge)
    fireEvent.pointerEnter(edge)
    // A native drag cancels pointer events but is still active until dragend.
    if (kind === 'native') fireEvent.pointerCancel(workspace)
    act(() => { vi.advanceTimersByTime(150) })
    expect(edge).toHaveAttribute('aria-expanded', 'false')
    if (kind === 'pointer') fireEvent.pointerUp(workspace)
    else fireEvent.dragEnd(workspace)
    act(() => { vi.advanceTimersByTime(150) })
    expect(edge).toHaveAttribute('aria-expanded', 'false')
    fireEvent.pointerLeave(edge)
    fireEvent.pointerEnter(edge)
    act(() => { vi.advanceTimersByTime(150) })
    expect(edge).toHaveAttribute('aria-expanded', 'true')
  })

  it.each(['route', 'place', 'pin', 'narrow'] as const)('cancels pending hover on %s changes', (change) => {
    const view = render(<Harness />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Open the Shows list' }))
    act(() => { vi.advanceTimersByTime(100) })
    if (change === 'route') view.rerender(<Harness routeKey="shows/two" />)
    if (change === 'place') {
      view.rerender(<Harness place="maps" />)
      view.rerender(<Harness />)
    }
    if (change === 'pin') {
      act(() => { useStudioEntityDrawerStore.getState().setPinned('shows', true) })
      act(() => { useStudioEntityDrawerStore.getState().setPinned('shows', false) })
    }
    if (change === 'narrow') {
      view.rerender(<Harness narrow />)
      view.rerender(<Harness />)
    }
    act(() => { vi.advanceTimersByTime(150) })
    expect(screen.getByTestId('studio-drawer-layout')).toHaveAttribute('data-drawer-mode', 'tucked')
  })

  it('cancels pending dwell on immediate click open so a later close stays closed', () => {
    render(<Harness />)
    const edge = screen.getByRole('button', { name: 'Open the Shows list' })
    fireEvent.pointerEnter(edge)
    act(() => { vi.advanceTimersByTime(100) })
    fireEvent.click(edge)
    expect(edge).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('treeitem', { name: 'Current show' }))
    act(() => { vi.advanceTimersByTime(150) })
    expect(edge).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps the existing close delay and cancels it on re-entry after hover opening', () => {
    render(<Harness />)
    const edge = screen.getByRole('button', { name: 'Open the Shows list' })
    fireEvent.pointerEnter(edge)
    act(() => { vi.advanceTimersByTime(150) })
    const drawer = screen.getByTestId('studio-entity-drawer')
    fireEvent.pointerEnter(drawer)
    fireEvent.pointerLeave(drawer)
    act(() => { vi.advanceTimersByTime(599) })
    expect(edge).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerEnter(drawer)
    act(() => { vi.advanceTimersByTime(600) })
    expect(edge).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerLeave(drawer)
    act(() => { vi.advanceTimersByTime(600) })
    expect(edge).toHaveAttribute('aria-expanded', 'false')
  })

})
