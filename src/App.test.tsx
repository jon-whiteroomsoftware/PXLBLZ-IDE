import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useRouterStore, routerInitialState } from '@/store/routerStore'
import { useWorkspaceStore, workspaceInitialState } from '@/store/workspaceStore'
import { usePatternStore, patternInitialState, type PatternRecord } from '@/store/patternStore'
import { useDocsStore, docsInitialState } from '@/store/docsStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { pendingGalleryCloneKey } from '@/engine/galleryClone'

// Hold the startup auth probe pending so the smoke tests exercise the studio
// shell without the signed-out Gallery redirect kicking in mid-test; the
// routing tests below seed workspace state explicitly instead.
vi.mock('@/engine/authSession', () => ({
  getAuthSession: () => new Promise(() => {}),
}))

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  useRouterStore.setState(routerInitialState)
  useWorkspaceStore.setState(workspaceInitialState)
  usePatternStore.setState(patternInitialState)
  useDocsStore.setState(docsInitialState)
  useControllerStore.setState(controllerInitialState)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubRemotePatterns(patterns: PatternRecord[] = []) {
  const created: PatternRecord[] = []
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const path = String(url)
    if (path === '/api/patterns' && init?.method === undefined) {
      return Response.json({ patterns })
    }
    if (path === '/api/patterns' && init?.method === 'POST') {
      created.push(JSON.parse(String(init.body)) as PatternRecord)
      return Response.json({ ok: true })
    }
    if (path === '/api/maps' && init?.method === undefined) {
      return Response.json({ maps: [] })
    }
    if (path.startsWith('/api/settings/') && init?.method === undefined) {
      return Response.json({})
    }
    if (path.startsWith('/api/settings/') && init?.method === 'PUT') {
      return Response.json({ ok: true })
    }
    if (path.startsWith('/api/controller-metadata/')) {
      return Response.json({})
    }
    return Response.json({ ok: true })
  }))
  return created
}

describe('App smoke test', () => {
  it('renders without crashing', () => {
    render(<App />)
  })

  it('has a top bar', () => {
    render(<App />)
    expect(screen.getByTestId('top-bar')).toBeInTheDocument()
  })

  it('has a left pane', () => {
    window.history.replaceState(null, '', '/studio')
    render(<App />)
    expect(screen.getByTestId('left-pane')).toBeInTheDocument()
  })

  it('has an editor pane', () => {
    window.history.replaceState(null, '', '/studio')
    render(<App />)
    expect(screen.getByTestId('editor-pane')).toBeInTheDocument()
  })

  it('has a preview pane', () => {
    window.history.replaceState(null, '', '/studio')
    render(<App />)
    expect(screen.getByTestId('preview-pane')).toBeInTheDocument()
  })

  it('starts with a wider preview pane', () => {
    window.history.replaceState(null, '', '/studio')
    render(<App />)
    expect(screen.getByTestId('preview-pane')).toHaveStyle({ width: '460px' })
  })
})

describe('routing (#308)', () => {
  const record: PatternRecord = {
    id: 'p-1',
    name: 'Deep Linked',
    src: 'export function render(index) {}',
    controls: {},
    updatedAt: 1,
  }

  it('sends signed-out visitors from /studio to the one-time Studio welcome page', () => {
    window.history.replaceState(null, '', '/studio')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: false,
      personalWorkspaceResolved: true,
    })
    render(<App />)
    expect(window.location.pathname).toBe('/studio-welcome')
    expect(screen.getByTestId('studio-welcome-page')).toHaveTextContent('Sign in to Studio')
  })

  it('does not redirect before the auth probe settles', () => {
    window.history.replaceState(null, '', '/studio')
    render(<App />)
    expect(window.location.pathname).toBe('/studio')
    expect(screen.getByTestId('editor-pane')).toBeInTheDocument()
  })

  it('keeps signed-in visitors in the studio', () => {
    window.history.replaceState(null, '', '/studio')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    render(<App />)
    expect(window.location.pathname).toBe('/studio')
    expect(screen.getByTestId('editor-pane')).toBeInTheDocument()
  })

  it('moves authenticated visitors from the Studio welcome page into Studio', () => {
    window.history.replaceState(null, '', '/studio-welcome')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    render(<App />)
    expect(window.location.pathname).toBe('/studio')
    expect(screen.getByTestId('editor-pane')).toBeInTheDocument()
  })

  it('opens a pattern addressed by /studio/patterns/<id>', () => {
    window.history.replaceState(null, '', '/studio/patterns/p-1')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    usePatternStore.setState({ userPatterns: [record], patternsLoaded: true })
    render(<App />)
    expect(usePatternStore.getState().activePatternId).toBe('p-1')
    expect(screen.getByTestId('editor-pane')).toBeInTheDocument()
  })

  it('updates the URL when the active pattern changes', () => {
    window.history.replaceState(null, '', '/studio')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    usePatternStore.setState({
      userPatterns: [record],
      patternsLoaded: true,
      activePatternId: 'p-1',
    })
    render(<App />)
    expect(window.location.pathname).toBe('/studio/patterns/p-1')
  })

  it('shows a graceful message for a deep link to a missing pattern', () => {
    window.history.replaceState(null, '', '/studio/patterns/nope')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    usePatternStore.setState({ userPatterns: [record], patternsLoaded: true })
    render(<App />)
    expect(screen.getByTestId('route-message')).toHaveTextContent('Pattern not found')
  })

  it('shows a graceful message for unknown paths', () => {
    window.history.replaceState(null, '', '/bogus')
    render(<App />)
    expect(screen.getByTestId('route-message')).toHaveTextContent('Nothing at this address')
  })

  it('opens the docs reader at /docs/<id> and redirects legacy hash links', () => {
    window.history.replaceState(null, '', '/#/docs/feature-guide')
    render(<App />)
    expect(window.location.pathname).toBe('/docs/feature-guide')
    expect(useDocsStore.getState().activeDocId).toBe('feature-guide')
  })

  it('renders the Gallery grid at /gallery', () => {
    window.history.replaceState(null, '', '/gallery')
    render(<App />)
    expect(screen.getByTestId('gallery-page')).toHaveTextContent('Pattern Gallery')
    expect(screen.getByRole('button', { name: /IridescentFibers/i })).toBeInTheDocument()
  })

  it('shows a quiet Gallery link in Studio and returns to the Gallery from it', async () => {
    window.history.replaceState(null, '', '/studio')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    render(<App />)

    const topBar = screen.getByTestId('top-bar')
    expect(within(topBar).queryByRole('button', { name: 'Studio' })).not.toBeInTheDocument()
    const galleryLink = within(topBar).getByRole('button', { name: 'Gallery' })
    expect(galleryLink).toHaveClass('border-zinc-700')

    await userEvent.click(galleryLink)
    expect(window.location.pathname).toBe('/gallery')
    expect(screen.getByTestId('gallery-page')).toHaveTextContent('Pattern Gallery')
  })

  it('sends signed-out Gallery visitors to the Studio welcome page without rendering Studio first', async () => {
    window.history.replaceState(null, '', '/gallery')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: false,
      personalWorkspaceResolved: true,
    })
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Studio' }))

    expect(window.location.pathname).toBe('/studio-welcome')
    expect(screen.getByTestId('studio-welcome-page')).toHaveTextContent('Sign in to Studio')
    expect(screen.queryByTestId('left-pane')).not.toBeInTheDocument()
  })

  it('keeps the global Controller surface visible on gallery, detail, studio, and docs routes (#323)', () => {
    const routes = ['/gallery', '/p/iridescent-fibers', '/studio', '/docs/feature-guide']

    for (const path of routes) {
      window.history.replaceState(null, '', path)
      useRouterStore.setState(routerInitialState)
      useDocsStore.setState(docsInitialState)
      const view = render(<App />)
      const topBar = screen.getByTestId('top-bar')

      expect(within(topBar).getByTestId('controller-bar')).toBeInTheDocument()
      expect(within(topBar).getByRole('button', { name: 'Connect a Controller' })).toBeInTheDocument()

      view.unmount()
    }
  })

  it('keeps the connected Controller pill visible while navigating browse routes (#323)', async () => {
    window.history.replaceState(null, '', '/gallery')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<App />)

    expect(within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Toggle Desk panel' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /IridescentFibers/i }))
    expect(window.location.pathname).toBe('/p/iridescent-fibers')
    expect(within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Toggle Desk panel' })).toBeInTheDocument()

    await userEvent.click(within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Studio' }))
    expect(window.location.pathname).toBe('/studio')
    expect(within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Toggle Desk panel' })).toBeInTheDocument()
    expect(useControllerStore.getState().activeIp).toBe('10.0.0.5')
  })

  it('keeps controller connection state orthogonal to auth changes (#323)', async () => {
    window.history.replaceState(null, '', '/studio')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    useControllerStore.setState({
      extensionPresent: true,
      activeIp: '10.0.0.5',
      controllers: { '10.0.0.5': { ip: '10.0.0.5', nickname: 'Desk', phase: 'live', mapDim: 2 } },
    })
    render(<App />)

    expect(within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Toggle Desk panel' })).toBeInTheDocument()

    act(() => {
      useWorkspaceStore.setState({
        personalWorkspaceAuthenticated: false,
        personalWorkspaceResolved: true,
      })
    })

    await waitFor(() => expect(window.location.pathname).toBe('/studio-welcome'))
    expect(useControllerStore.getState().activeIp).toBe('10.0.0.5')
    expect(within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Toggle Desk panel' })).toBeInTheDocument()
  })

  it('clears the Gallery search from the inline clear button', async () => {
    window.history.replaceState(null, '', '/gallery')
    render(<App />)
    const search = screen.getByRole('textbox', { name: /search patterns/i })
    await userEvent.type(search, 'core')
    expect(search).toHaveValue('core')
    expect(screen.queryByRole('button', { name: /IridescentFibers/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /clear search/i }))
    expect(search).toHaveValue('')
    expect(screen.getByRole('button', { name: /IridescentFibers/i })).toBeInTheDocument()
  })

  it('navigates from a Gallery card to its pattern detail route', async () => {
    window.history.replaceState(null, '', '/gallery')
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /IridescentFibers/i }))
    expect(window.location.pathname).toBe('/p/iridescent-fibers')
    expect(screen.getByTestId('pattern-detail-page')).toHaveTextContent('IridescentFibers')
  })

  it('clones a Gallery pattern detail page into a writable Studio pattern', async () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    const created = stubRemotePatterns()
    render(<App />)
    expect(screen.getByTestId('pattern-detail-page')).toHaveTextContent('IridescentFibers')
    await userEvent.click(screen.getByRole('button', { name: 'Clone' }))
    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({ name: 'IridescentFibers' })
    expect(window.location.pathname).toBe(`/studio/patterns/${created[0].id}`)
    expect(usePatternStore.getState().activePatternId).toBe(created[0].id)
    expect(usePatternStore.getState().activeDemoName).toBeNull()
    expect(screen.getByTestId('editor-pane')).toBeInTheDocument()
  })

  it('queues a Gallery clone intent and shows sign-in when Clone is clicked signed out', async () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: false,
      personalWorkspaceResolved: true,
    })
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Clone' }))

    expect(window.location.pathname).toBe('/studio-welcome')
    expect(window.localStorage.getItem(pendingGalleryCloneKey)).toBe('iridescent-fibers')
    expect(screen.getByTestId('studio-welcome-page')).toHaveTextContent('Sign in to Studio')
    expect(screen.queryByTestId('left-pane')).not.toBeInTheDocument()
  })

  it('consumes a pending Gallery clone after sign-in and opens the saved copy', async () => {
    window.history.replaceState(null, '', '/gallery')
    window.localStorage.setItem(pendingGalleryCloneKey, 'iridescent-fibers')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    const created = stubRemotePatterns([{ id: 'existing', name: 'IridescentFibers', src: '// old', controls: {}, updatedAt: 1 }])

    render(<App />)

    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0].name).toBe('IridescentFibers 1')
    expect(window.localStorage.getItem(pendingGalleryCloneKey)).toBeNull()
    expect(window.location.pathname).toBe(`/studio/patterns/${created[0].id}`)
    expect(usePatternStore.getState().activePatternId).toBe(created[0].id)
  })

  it('shows pattern source in a read-only detail-stage code view', async () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Code/i }))
    expect(window.location.pathname).toBe('/p/iridescent-fibers')
    expect(screen.getByTestId('pattern-code-stage')).toBeInTheDocument()
    expect(screen.queryByText(/read-only/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clone' })).toBeInTheDocument()
  })

  it('shows the surface selector in the detail header for 2D patterns only', () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    const { rerender } = render(<App />)
    expect(screen.getByTestId('pattern-detail-page')).toHaveTextContent('IridescentFibers')
    const minorRow = screen.getByTestId('pattern-detail-minor-row')
    expect(minorRow).toHaveTextContent('surface')
    expect(within(minorRow).getByRole('button', { name: 'Surface' })).toBeInTheDocument()

    window.history.replaceState(null, '', '/p/aurora-sphere')
    act(() => {
      useRouterStore.getState().syncFromLocation()
    })
    rerender(<App />)
    expect(screen.getByTestId('pattern-detail-page')).toHaveTextContent('AuroraSphere')
    expect(screen.queryByRole('button', { name: 'Surface' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('pattern-detail-minor-row')).not.toBeInTheDocument()
  })

  it('opens the shared Controller connect flow from the detail action bar', async () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    render(<App />)
    expect(screen.queryByRole('button', { name: /Run on Controller/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save to Controller/i })).not.toBeInTheDocument()
    await userEvent.click(within(screen.getByTestId('pattern-detail-page')).getByRole('button', { name: 'Connect' }))
    expect(screen.getByTestId('controller-install-pitch')).toBeInTheDocument()
  })

  it('shows the detail-page reset action when the demo has preview overrides', () => {
    window.history.replaceState(null, '', '/p/aurora-sphere')
    usePatternStore.setState({
      demoOverrides: { AuroraSphere: { brightness: 0.5 } },
    })
    render(<App />)
    expect(screen.getByRole('button', { name: 'Reset preview' })).toBeInTheDocument()
    expect(screen.queryByTestId('pattern-detail-minor-row')).not.toBeInTheDocument()
  })

  it('keeps reset in the detail minor row when a surface selector anchors it', () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    usePatternStore.setState({
      demoOverrides: { IridescentFibers: { surfaceId: 'cylinder' } },
    })
    render(<App />)
    const minorRow = screen.getByTestId('pattern-detail-minor-row')
    expect(within(minorRow).getByRole('button', { name: 'Surface' })).toBeInTheDocument()
    expect(within(minorRow).getByRole('button', { name: 'Reset preview' })).toHaveTextContent('Reset')
  })
})
