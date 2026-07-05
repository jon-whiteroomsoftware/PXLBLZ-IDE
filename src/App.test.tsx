import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useRouterStore, routerInitialState } from '@/store/routerStore'
import { useWorkspaceStore, workspaceInitialState } from '@/store/workspaceStore'
import { usePatternStore, patternInitialState, type PatternRecord } from '@/store/patternStore'
import { useDocsStore, docsInitialState } from '@/store/docsStore'

// Hold the startup auth probe pending so the smoke tests exercise the studio
// shell without the signed-out Gallery redirect kicking in mid-test; the
// routing tests below seed workspace state explicitly instead.
vi.mock('@/engine/authSession', () => ({
  getAuthSession: () => new Promise(() => {}),
}))

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  useRouterStore.setState(routerInitialState)
  useWorkspaceStore.setState(workspaceInitialState)
  usePatternStore.setState(patternInitialState)
  useDocsStore.setState(docsInitialState)
})

describe('App smoke test', () => {
  it('renders without crashing', () => {
    render(<App />)
  })

  it('has a top bar', () => {
    render(<App />)
    expect(screen.getByTestId('top-bar')).toBeInTheDocument()
  })

  it('has a left pane', () => {
    render(<App />)
    expect(screen.getByTestId('left-pane')).toBeInTheDocument()
  })

  it('has an editor pane', () => {
    render(<App />)
    expect(screen.getByTestId('editor-pane')).toBeInTheDocument()
  })

  it('has a preview pane', () => {
    render(<App />)
    expect(screen.getByTestId('preview-pane')).toBeInTheDocument()
  })

  it('starts with a wider preview pane', () => {
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

  it('redirects signed-out visitors from /studio to /gallery', () => {
    window.history.replaceState(null, '', '/studio')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: false,
      personalWorkspaceResolved: true,
    })
    render(<App />)
    expect(window.location.pathname).toBe('/gallery')
    expect(screen.getByTestId('gallery-page')).toHaveTextContent('Patterns for Pixelblaze')
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
    expect(screen.getByTestId('gallery-page')).toHaveTextContent('Patterns for Pixelblaze')
    expect(screen.getByRole('button', { name: /IridescentFibers/i })).toBeInTheDocument()
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

  it('opens a Gallery pattern detail page in Studio', async () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    render(<App />)
    expect(screen.getByTestId('pattern-detail-page')).toHaveTextContent('IridescentFibers')
    await userEvent.click(screen.getByRole('button', { name: /Open in Studio/i }))
    expect(window.location.pathname).toBe('/studio')
    expect(usePatternStore.getState().activeDemoName).toBe('IridescentFibers')
    expect(screen.getByTestId('editor-pane')).toBeInTheDocument()
  })

  it('shows pattern source inline from the detail page', async () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /View source/i }))
    expect(window.location.pathname).toBe('/p/iridescent-fibers')
    expect(screen.getByTestId('pattern-detail-page')).toHaveTextContent('export var')
  })

  it('shows the detail-page reset action when the demo has preview overrides', () => {
    window.history.replaceState(null, '', '/p/aurora-sphere')
    usePatternStore.setState({
      demoOverrides: { AuroraSphere: { brightness: 0.5 } },
    })
    render(<App />)
    expect(screen.getByRole('button', { name: 'Reset preview' })).toBeInTheDocument()
  })
})
